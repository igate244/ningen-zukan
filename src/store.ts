// src/store.ts — アプリ全体のデータを持つ入れ物
//
// 500 人規模なら全件メモリに載せても軽いので、起動時に IndexedDB から全部読み、
// 変更はメモリと IndexedDB の両方に書く。画面は useData() で購読する。

import { useSyncExternalStore } from "react";
import * as db from "./db";
import {
  type AppData, type Group, type ImageMeta, type LogEntry, type Person, type Relation,
  SELF_ID, emptyPerson, newId, normalizePerson,
} from "./model";

type Listener = () => void;

let data: AppData = { persons: [], relations: [], logs: [], images: [], groups: [] };
let snapshot = { data, rev: 0 };
const listeners = new Set<Listener>();
const changeHooks = new Set<Listener>();

const emit = (local: boolean): void => {
  snapshot = { data, rev: snapshot.rev + 1 };
  listeners.forEach((l) => l());
  if (local) changeHooks.forEach((h) => h());
};

export const subscribe = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 手元でデータが変わったときに呼ばれる（自動同期のきっかけ） */
export const onLocalChange = (h: Listener): (() => void) => {
  changeHooks.add(h);
  return () => changeHooks.delete(h);
};

export const getData = (): AppData => data;

export const useData = (): AppData => useSyncExternalStore(subscribe, () => snapshot).data;

export const load = async (): Promise<void> => {
  const [persons, relations, logs, images, groups] = await Promise.all([
    db.getAll<Person>("persons"),
    db.getAll<Relation>("relations"),
    db.getAll<LogEntry>("logs"),
    db.getAll<ImageMeta>("images"),
    db.getAll<Group>("groups"),
  ]);
  data = { persons: persons.map(normalizePerson), relations, logs, images, groups };
  if (!data.persons.some((p) => p.id === SELF_ID)) {
    const self: Person = { ...emptyPerson("自分"), id: SELF_ID, isSelf: true, category: "family" };
    data = { ...data, persons: [...data.persons, self] };
    await db.put("persons", self);
  }
  emit(false);
};

const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
};

// ------------------------------------------------------------------ 人物

export const savePerson = async (p: Person): Promise<Person> => {
  const item = { ...p, updatedAt: Date.now() };
  data = { ...data, persons: upsert(data.persons, item) };
  emit(true);
  await db.put("persons", item);
  return item;
};

export const deletePerson = async (id: string): Promise<void> => {
  const now = Date.now();
  const person = data.persons.find((p) => p.id === id);
  if (!person || person.isSelf) return;
  const deadPerson = { ...person, deleted: true, updatedAt: now };
  const deadRels = data.relations
    .filter((r) => !r.deleted && (r.a === id || r.b === id))
    .map((r) => ({ ...r, deleted: true, updatedAt: now }));
  // 記録そのものは他の人の分もあるので消さず、この人だけ外す。誰もいなくなった記録は消す
  const touchedLogs = data.logs
    .filter((l) => !l.deleted && l.personIds.includes(id))
    .map((l) => {
      const personIds = l.personIds.filter((x) => x !== id);
      return { ...l, personIds, deleted: personIds.length === 0, updatedAt: now };
    });
  const persons = upsert(data.persons, deadPerson);
  let relations = data.relations;
  for (const r of deadRels) relations = upsert(relations, r);
  let logs = data.logs;
  for (const l of touchedLogs) logs = upsert(logs, l);
  data = { ...data, persons, relations, logs };
  emit(true);
  await Promise.all([db.put("persons", deadPerson), db.putMany("relations", deadRels), db.putMany("logs", touchedLogs)]);
};

// ---------------------------------------------------------------- つながり

export const saveRelation = async (r: Omit<Relation, "id" | "createdAt" | "updatedAt"> & Partial<Relation>): Promise<void> => {
  const now = Date.now();
  const item: Relation = { createdAt: now, ...r, id: r.id ?? newId(), updatedAt: now };
  data = { ...data, relations: upsert(data.relations, item) };
  emit(true);
  await db.put("relations", item);
};

export const deleteRelation = async (id: string): Promise<void> => {
  const r = data.relations.find((x) => x.id === id);
  if (!r) return;
  const item = { ...r, deleted: true, updatedAt: Date.now() };
  data = { ...data, relations: upsert(data.relations, item) };
  emit(true);
  await db.put("relations", item);
};

// -------------------------------------------------------------------- 記録

export const saveLog = async (l: LogEntry): Promise<void> => {
  const item = { ...l, updatedAt: Date.now() };
  data = { ...data, logs: upsert(data.logs, item) };
  emit(true);
  await db.put("logs", item);
};

export const deleteLog = async (id: string): Promise<void> => {
  const l = data.logs.find((x) => x.id === id);
  if (!l) return;
  const item = { ...l, deleted: true, updatedAt: Date.now() };
  data = { ...data, logs: upsert(data.logs, item) };
  emit(true);
  await db.put("logs", item);
};

// ---------------------------------------------------------------- グループ

export const saveGroup = async (g: Omit<Group, "createdAt" | "updatedAt"> & Partial<Group>): Promise<Group> => {
  const now = Date.now();
  const item: Group = { createdAt: now, ...g, updatedAt: now } as Group;
  data = { ...data, groups: upsert(data.groups, item) };
  emit(true);
  await db.put("groups", item);
  return item;
};

export const deleteGroup = async (id: string): Promise<void> => {
  const g = data.groups.find((x) => x.id === id);
  if (!g) return;
  const item = { ...g, deleted: true, updatedAt: Date.now() };
  // 人の所属からも外す
  const touched = data.persons.filter((p) => p.groups.includes(id)).map((p) => ({ ...p, groups: p.groups.filter((x) => x !== id), updatedAt: Date.now() }));
  let persons = data.persons;
  for (const p of touched) persons = upsert(persons, p);
  data = { ...data, groups: upsert(data.groups, item), persons };
  emit(true);
  await Promise.all([db.put("groups", item), db.putMany("persons", touched)]);
};

/** まとめて所属を付け外しする */
export const setGroupMembers = async (groupId: string, memberIds: string[]): Promise<void> => {
  const now = Date.now();
  const changed: Person[] = [];
  for (const p of data.persons) {
    const has = p.groups.includes(groupId);
    const want = memberIds.includes(p.id);
    if (has !== want) changed.push({ ...p, groups: want ? [...p.groups, groupId] : p.groups.filter((x) => x !== groupId), updatedAt: now });
  }
  let persons = data.persons;
  for (const p of changed) persons = upsert(persons, p);
  data = { ...data, persons };
  emit(true);
  await db.putMany("persons", changed);
};

// -------------------------------------------------------------------- 画像

export const addImage = async (blob: Blob): Promise<string> => {
  const now = Date.now();
  const meta: ImageMeta = { id: newId(), createdAt: now, updatedAt: now, mime: blob.type || "image/jpeg" };
  await db.putBlob(meta.id, blob);
  data = { ...data, images: [...data.images, meta] };
  emit(true);
  await db.put("images", meta);
  return meta.id;
};

/** 同期処理が画像のドライブ ID を記録するため（手元変更扱いにはしない） */
export const setImageDriveId = async (id: string, driveId: string): Promise<void> => {
  const m = data.images.find((x) => x.id === id);
  if (!m) return;
  const item = { ...m, driveId };
  data = { ...data, images: upsert(data.images, item) };
  emit(false);
  await db.put("images", item);
};

// ---------------------------------------------------------------- まとめて

/** 同期や読み込みで得た全データに置き換える */
export const replaceAll = async (next: AppData, local: boolean): Promise<void> => {
  data = { ...next, persons: next.persons.map(normalizePerson), groups: next.groups ?? [] };
  emit(local);
  await Promise.all([
    db.putMany("persons", data.persons),
    db.putMany("relations", data.relations),
    db.putMany("logs", data.logs),
    db.putMany("images", data.images),
    db.putMany("groups", data.groups),
  ]);
};

// ------------------------------------------------------------------ 集計

export const alive = <T extends { deleted?: boolean }>(list: T[]): T[] => list.filter((x) => !x.deleted);

/** 人ごとの最終交流日 */
export const lastMetMap = (d: AppData): Map<string, string> => {
  const map = new Map<string, string>();
  for (const l of d.logs) {
    if (l.deleted) continue;
    for (const pid of l.personIds) {
      const cur = map.get(pid);
      if (!cur || cur < l.date) map.set(pid, l.date);
    }
  }
  return map;
};
