// src/family.ts — 家族関係の読み解き（父・母・長男・兄・元妻 などの呼び名を出す）
//
// 保存しているのは「a は b の親」「a と b は夫婦」といった素朴なつながりだけ。
// 性別・誕生日・生まれ順と組み合わせて、ここで呼び名を組み立てる。

import type { AppData, Person, Relation } from "./model";

export interface FamilyIndex {
  persons: Map<string, Person>;
  rels: Relation[];
}

export const familyIndex = (data: AppData): FamilyIndex => {
  const persons = new Map(data.persons.filter((p) => !p.deleted).map((p) => [p.id, p]));
  const rels = data.relations.filter((r) => !r.deleted && persons.has(r.a) && persons.has(r.b));
  return { persons, rels };
};

const uniq = (ids: string[]): string[] => [...new Set(ids)];

export const parentsOf = (fx: FamilyIndex, id: string): string[] =>
  uniq(fx.rels.filter((r) => r.type === "parent" && r.b === id).map((r) => r.a));

export const childrenOf = (fx: FamilyIndex, id: string): string[] =>
  sortByAge(fx, uniq(fx.rels.filter((r) => r.type === "parent" && r.a === id).map((r) => r.b)));

const pairOf = (fx: FamilyIndex, id: string, type: Relation["type"]): string[] =>
  uniq(fx.rels.filter((r) => r.type === type && (r.a === id || r.b === id)).map((r) => (r.a === id ? r.b : r.a)));

export const spousesOf = (fx: FamilyIndex, id: string): string[] => pairOf(fx, id, "spouse");
export const exSpousesOf = (fx: FamilyIndex, id: string): string[] => pairOf(fx, id, "exspouse");

export interface Sibling {
  id: string;
  /** 片方の親だけが同じ（異父・異母） */
  half?: "異父" | "異母" | "片親";
}

/** 兄弟姉妹（明示した兄弟のつながり ＋ 同じ親を持つ人） */
export const siblingsOf = (fx: FamilyIndex, id: string): Sibling[] => {
  const mine = parentsOf(fx, id);
  const out = new Map<string, Sibling>();
  for (const s of pairOf(fx, id, "sibling")) out.set(s, { id: s });
  for (const p of mine) {
    for (const c of fx.rels.filter((r) => r.type === "parent" && r.a === p && r.b !== id).map((r) => r.b)) {
      const theirs = parentsOf(fx, c);
      const shared = mine.filter((x) => theirs.includes(x));
      let half: Sibling["half"];
      // 両方とも親が 2 人わかっていて、1 人だけ同じなら異父・異母
      if (mine.length >= 2 && theirs.length >= 2 && shared.length === 1) {
        const g = fx.persons.get(shared[0])?.gender;
        half = g === "male" ? "異母" : g === "female" ? "異父" : "片親";
      }
      if (!out.has(c) || (out.get(c)!.half && !half)) out.set(c, { id: c, half });
    }
  }
  const sorted = sortByAge(fx, [...out.keys()]);
  return sorted.map((s) => out.get(s)!);
};

// ------------------------------------------------------------- 年の上下

const birthKey = (p?: Person): number | null => {
  if (!p?.birthDate || p.birthYearUnknown) return null;
  const t = new Date(p.birthDate).getTime();
  return Number.isNaN(t) ? null : t;
};

/** a が年上なら負、年下なら正、わからなければ 0 */
export const compareAge = (a?: Person, b?: Person): number => {
  if (!a || !b) return 0;
  const ka = birthKey(a);
  const kb = birthKey(b);
  if (ka !== null && kb !== null && ka !== kb) return ka - kb;
  if (a.birthOrder && b.birthOrder && a.birthOrder !== b.birthOrder) return a.birthOrder - b.birthOrder;
  return 0;
};

export const sortByAge = (fx: FamilyIndex, ids: string[]): string[] =>
  [...ids].sort((x, y) => {
    const px = fx.persons.get(x);
    const py = fx.persons.get(y);
    const c = compareAge(px, py);
    if (c !== 0) return c;
    // 生まれ順の手入力だけある人を、ない人より前に
    if (px?.birthOrder && !py?.birthOrder) return -1;
    if (!px?.birthOrder && py?.birthOrder) return 1;
    return (px?.kana || px?.name || "").localeCompare(py?.kana || py?.name || "", "ja");
  });

// ------------------------------------------------------------------ 呼び名

const NUM = ["長", "次", "三", "四", "五", "六", "七", "八", "九", "十"];

/** 親から見た子の呼び名（長男・次女 など） */
export const childLabel = (fx: FamilyIndex, parentId: string, childId: string): string => {
  const child = fx.persons.get(childId);
  const kids = childrenOf(fx, parentId);
  const g = child?.gender;
  if (g === "male" || g === "female") {
    const same = kids.filter((k) => fx.persons.get(k)?.gender === g);
    const i = same.indexOf(childId);
    // 年の順がわからない子が混じっていると番号が信用できないので、そのときは「息子・娘」
    const reliable = same.every((k, idx) => idx === 0 || compareAge(fx.persons.get(same[idx - 1]), fx.persons.get(k)) < 0);
    if (i >= 0 && reliable && i < NUM.length) return `${NUM[i]}${g === "male" ? "男" : "女"}`;
    return g === "male" ? "息子" : "娘";
  }
  return "子";
};

export const parentLabel = (p?: Person): string => (p?.gender === "male" ? "父" : p?.gender === "female" ? "母" : "親");

export const spouseLabel = (p?: Person, ex = false): string =>
  `${ex ? "元" : ""}${p?.gender === "male" ? "夫" : p?.gender === "female" ? "妻" : "配偶者"}`;

/** viewer から見た兄弟姉妹 sib の呼び名 */
export const siblingLabel = (fx: FamilyIndex, viewerId: string, s: Sibling): string => {
  const me = fx.persons.get(viewerId);
  const sib = fx.persons.get(s.id);
  const c = compareAge(sib, me);
  const g = sib?.gender;
  let base = "兄弟姉妹";
  if (c < 0) base = g === "male" ? "兄" : g === "female" ? "姉" : "年上のきょうだい";
  else if (c > 0) base = g === "male" ? "弟" : g === "female" ? "妹" : "年下のきょうだい";
  else if (g === "male") base = "兄弟";
  else if (g === "female") base = "姉妹";
  return s.half ? `${s.half}${base.replace(/^年(上|下)の/, "")}` : base;
};

/** viewer から見た other の家族としての呼び名（家族でなければ null） */
export const kinLabel = (fx: FamilyIndex, viewerId: string, otherId: string): string | null => {
  const other = fx.persons.get(otherId);
  if (parentsOf(fx, viewerId).includes(otherId)) return parentLabel(other);
  if (childrenOf(fx, viewerId).includes(otherId)) return childLabel(fx, viewerId, otherId);
  if (spousesOf(fx, viewerId).includes(otherId)) return spouseLabel(other);
  if (exSpousesOf(fx, viewerId).includes(otherId)) return spouseLabel(other, true);
  const sib = siblingsOf(fx, viewerId).find((s) => s.id === otherId);
  if (sib) return siblingLabel(fx, viewerId, sib);
  return null;
};
