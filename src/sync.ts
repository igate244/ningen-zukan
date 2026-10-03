// src/sync.ts — 端末とドライブの同期
//
// ドライブの「人間図鑑」フォルダに data.json（文字データ全部）と images/ フォルダ（写真）を置く。
// 同期は「ドライブの内容を取ってくる → レコードごとに新しい方を採用して合体 → 書き戻す」。
// 複数の端末から使っても、レコード単位で新しい方が残る。

import { useSyncExternalStore } from "react";
import { DRIVE_DATA_FILE, DRIVE_FOLDER_NAME } from "./config";
import * as db from "./db";
import * as drive from "./drive";
import type { AppData, ImageMeta } from "./model";
import * as store from "./store";

export type SyncStatus = "off" | "idle" | "syncing" | "error" | "needAuth";

interface SyncState {
  status: SyncStatus;
  lastSync?: number;
  message?: string;
}

const CONNECTED_KEY = "driveConnected";

let state: SyncState = { status: "off" };
const listeners = new Set<() => void>();
const setState = (patch: Partial<SyncState>): void => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const useSyncState = (): SyncState =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

// ------------------------------------------------------------------ 合体

const mergeList = <T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] => {
  const map = new Map<string, T>();
  for (const x of a) map.set(x.id, x);
  for (const y of b) {
    const x = map.get(y.id);
    if (!x || y.updatedAt > x.updatedAt) map.set(y.id, y);
  }
  return [...map.values()];
};

const mergeImages = (a: ImageMeta[], b: ImageMeta[]): ImageMeta[] => {
  const merged = mergeList(a, b);
  // ドライブ ID はどちらか片方にしか無いことがあるので拾っておく
  const ids = new Map<string, string>();
  for (const x of [...a, ...b]) if (x.driveId) ids.set(x.id, x.driveId);
  return merged.map((m) => (m.driveId || !ids.has(m.id) ? m : { ...m, driveId: ids.get(m.id) }));
};

export const mergeData = (local: AppData, remote: AppData): AppData => ({
  persons: mergeList(local.persons, remote.persons ?? []),
  relations: mergeList(local.relations, remote.relations ?? []),
  logs: mergeList(local.logs, remote.logs ?? []),
  images: mergeImages(local.images, remote.images ?? []),
});

const fingerprint = (d: AppData): string =>
  [d.persons, d.relations, d.logs, d.images]
    .map((list) => list.map((x) => `${x.id}:${x.updatedAt}:${(x as ImageMeta).driveId ?? ""}`).sort().join(","))
    .join("|");

// ------------------------------------------------------------------ 本体

let running: Promise<void> | null = null;
let again = false;

const ensureLocations = async (): Promise<{ folderId: string; imagesId: string; fileId: string | null }> => {
  let folderId = await db.getMeta<string>("driveFolderId");
  if (!folderId || !(await drive.fileExists(folderId))) {
    folderId = await drive.ensureFolder(DRIVE_FOLDER_NAME);
    await db.setMeta("driveFolderId", folderId);
    await db.setMeta("driveFileId", null);
    await db.setMeta("driveImagesId", null);
  }
  let imagesId = await db.getMeta<string>("driveImagesId");
  if (!imagesId) {
    imagesId = await drive.ensureFolder("images", folderId);
    await db.setMeta("driveImagesId", imagesId);
  }
  let fileId = (await db.getMeta<string | null>("driveFileId")) ?? null;
  if (!fileId) {
    fileId = await drive.findFile(DRIVE_DATA_FILE, folderId);
    if (fileId) await db.setMeta("driveFileId", fileId);
  }
  return { folderId, imagesId, fileId };
};

const doSync = async (): Promise<void> => {
  const { folderId, imagesId, fileId } = await ensureLocations();

  // 1. ドライブの内容と合体
  let remote: AppData | null = null;
  if (fileId) {
    try {
      remote = JSON.parse(await (await drive.downloadFile(fileId)).text()) as AppData;
    } catch (e) {
      if (e instanceof drive.AuthError) throw e;
      remote = null;
    }
  }
  const local = store.getData();
  const merged = remote ? mergeData(local, remote) : local;
  if (fingerprint(merged) !== fingerprint(local)) await store.replaceAll(merged, false);

  // 2. まだドライブに無い写真を上げる / 手元に無い写真を取ってくる
  for (const img of store.getData().images) {
    if (img.deleted) continue;
    if (!img.driveId) {
      const blob = await db.getBlob(img.id);
      if (!blob) continue;
      const driveId = await drive.uploadFile(`${img.id}.jpg`, imagesId, blob);
      await store.setImageDriveId(img.id, driveId);
    } else if (!(await db.getBlob(img.id))) {
      try {
        await db.putBlob(img.id, await drive.downloadFile(img.driveId));
      } catch (e) {
        if (e instanceof drive.AuthError) throw e;
      }
    }
  }

  // 3. 書き戻す（内容が同じなら書かない）
  const finalData = store.getData();
  if (!remote || fingerprint(finalData) !== fingerprint(remote)) {
    const body = new Blob([JSON.stringify({ app: "ningen-zukan", version: 1, savedAt: Date.now(), ...finalData })], {
      type: "application/json",
    });
    const newId = await drive.uploadFile(DRIVE_DATA_FILE, folderId, body, fileId);
    if (newId !== fileId) await db.setMeta("driveFileId", newId);
  }
};

export const syncNow = async (): Promise<void> => {
  if (!drive.isConfigured() || !(await db.getMeta<boolean>(CONNECTED_KEY))) return;
  if (!drive.getToken()) {
    setState({ status: "needAuth", message: "再接続が必要です" });
    return;
  }
  if (running) {
    again = true;
    return running;
  }
  setState({ status: "syncing", message: undefined });
  running = (async () => {
    try {
      do {
        again = false;
        await doSync();
      } while (again);
      const now = Date.now();
      await db.setMeta("lastSync", now);
      setState({ status: "idle", lastSync: now });
    } catch (e) {
      if (e instanceof drive.AuthError) setState({ status: "needAuth", message: e.message });
      else setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      running = null;
    }
  })();
  return running;
};

/** ボタン操作の中で呼ぶ（ログイン画面が出る） */
export const connect = async (): Promise<void> => {
  await drive.requestToken("consent");
  await db.setMeta(CONNECTED_KEY, true);
  installHooks();
  await syncNow();
};

/** 期限切れトークンの取り直し（ボタン操作の中で呼ぶ） */
export const reconnect = async (): Promise<void> => {
  await drive.requestToken("");
  await syncNow();
};

export const disconnect = async (): Promise<void> => {
  await drive.signOut();
  await db.setMeta(CONNECTED_KEY, false);
  setState({ status: "off", message: undefined });
};

// ------------------------------------------------------------ 自動同期

let timer: number | undefined;

let hooksInstalled = false;

const installHooks = (): void => {
  if (hooksInstalled) return;
  hooksInstalled = true;
  store.onLocalChange(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void syncNow(), 4000);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      window.clearTimeout(timer);
      void syncNow();
    }
  });
};

export const startAutoSync = async (): Promise<void> => {
  const connected = await db.getMeta<boolean>(CONNECTED_KEY);
  const lastSync = await db.getMeta<number>("lastSync");
  if (!drive.isConfigured() || !connected) {
    setState({ status: "off", lastSync });
    return;
  }
  setState({ status: drive.getToken() ? "idle" : "needAuth", lastSync });
  installHooks();
  void syncNow();
};
