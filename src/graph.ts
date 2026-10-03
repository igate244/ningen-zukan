// src/graph.ts — つながりを図にするための配置計算
//
// 2 種類の図を作る。
//   相関図（radial）: 真ん中の人から何ステップ先までを、同心円状に並べる
//   家系図（family）: 親子・夫婦・兄弟のつながりだけをたどり、世代ごとに横一列に並べる

import { compareAge, familyIndex, kinLabel } from "./family";
import { type AppData, type Person, type Relation, type RelType, relationLabelFrom } from "./model";

export interface GNode {
  id: string;
  person: Person;
  x: number;
  y: number;
  /** 名前の下に出す説明（真ん中の人から見た関係など） */
  sub?: string;
  depth: number;
}

export interface GEdge {
  id: string;
  rel: Relation;
  /** 描画用の点の並び（直線なら 2 点、家系図のカギ線なら複数） */
  points: Array<[number, number]>;
  kind: "family" | "work" | "friend" | "other" | "spouse" | "exspouse";
  /** 中心からたどった線以外（相関図では薄く描く） */
  faint?: boolean;
}

export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  width: number;
  height: number;
}

export const NODE_R = 26;

const FAMILY: RelType[] = ["parent", "spouse", "exspouse", "sibling"];

export const edgeKind = (t: RelType): GEdge["kind"] =>
  t === "spouse" ? "spouse" : t === "exspouse" ? "exspouse" : FAMILY.includes(t) ? "family" : t === "boss" || t === "colleague" ? "work" : t === "friend" ? "friend" : "other";

/** 種類ごとの並び順（同じ種類の人が円周上でまとまるように） */
const KIND_ORDER: Record<GEdge["kind"], number> = { spouse: 0, exspouse: 1, family: 1, work: 2, friend: 3, other: 4 };

const aliveIndex = (data: AppData) => {
  const persons = new Map(data.persons.filter((p) => !p.deleted).map((p) => [p.id, p]));
  const rels = data.relations.filter((r) => !r.deleted && persons.has(r.a) && persons.has(r.b) && r.a !== r.b);
  const adj = new Map<string, Relation[]>();
  for (const r of rels) {
    adj.set(r.a, [...(adj.get(r.a) ?? []), r]);
    adj.set(r.b, [...(adj.get(r.b) ?? []), r]);
  }
  return { persons, rels, adj };
};

const other = (r: Relation, id: string): string => (r.a === id ? r.b : r.a);

const bounds = (nodes: GNode[]): { width: number; height: number } => {
  const xs = nodes.map((n) => Math.abs(n.x));
  const ys = nodes.map((n) => Math.abs(n.y));
  return { width: (Math.max(0, ...xs) + NODE_R + 60) * 2, height: (Math.max(0, ...ys) + NODE_R + 50) * 2 };
};

// ===================================================================== 相関図

export const buildRadial = (data: AppData, centerId: string, maxDepth: 1 | 2): Graph => {
  const { persons, rels, adj } = aliveIndex(data);
  const fx = familyIndex(data);
  const label = (r: Relation, viewer: string, o: string): string => kinLabel(fx, viewer, o) ?? relationLabelFrom(r, viewer);
  const center = persons.get(centerId);
  if (!center) return { nodes: [], edges: [], width: 0, height: 0 };

  // 幅優先でたどって、各人の「どの人経由で見つかったか」を覚える
  const depth = new Map<string, number>([[centerId, 0]]);
  const via = new Map<string, Relation>();
  const queue = [centerId];
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    if (d >= maxDepth) continue;
    const list = [...(adj.get(id) ?? [])].sort((a, b) => KIND_ORDER[edgeKind(a.type)] - KIND_ORDER[edgeKind(b.type)]);
    for (const r of list) {
      const o = other(r, id);
      if (depth.has(o)) continue;
      depth.set(o, d + 1);
      via.set(o, r);
      queue.push(o);
    }
  }

  const ring1 = [...depth.entries()].filter(([, d]) => d === 1).map(([id]) => id);
  ring1.sort((a, b) => {
    const ka = KIND_ORDER[edgeKind(via.get(a)!.type)];
    const kb = KIND_ORDER[edgeKind(via.get(b)!.type)];
    return ka - kb || (persons.get(a)!.kana || persons.get(a)!.name).localeCompare(persons.get(b)!.kana || persons.get(b)!.name, "ja");
  });

  // 2 周目の人を「経由した 1 周目の人」ごとに束ねる
  const children = new Map<string, string[]>();
  for (const [id, d] of depth) {
    if (d !== 2) continue;
    const parent = other(via.get(id)!, id);
    children.set(parent, [...(children.get(parent) ?? []), id]);
  }

  // 1 周目の各人に、子の数に応じた角度の幅を割り当てる
  const weight = (id: string): number => Math.max(1, (children.get(id)?.length ?? 0) * 0.8);
  const total = ring1.reduce((s, id) => s + weight(id), 0) || 1;
  const n1 = ring1.length;
  // 隣同士の名前が重ならないよう、人数に応じて円を大きくする
  const R1 = Math.max(130, (n1 * 92) / (2 * Math.PI));
  const n2 = [...children.values()].reduce((s, l) => s + l.length, 0);
  const R2 = Math.max(R1 + 130, (n2 * 84) / (2 * Math.PI));

  const nodes: GNode[] = [{ id: centerId, person: center, x: 0, y: 0, depth: 0 }];
  let angle = -Math.PI / 2 - (weight(ring1[0] ?? "") / total) * Math.PI;
  for (const id of ring1) {
    const span = (weight(id) / total) * Math.PI * 2;
    const mid = angle + span / 2;
    const r = via.get(id)!;
    nodes.push({ id, person: persons.get(id)!, x: Math.cos(mid) * R1, y: Math.sin(mid) * R1, sub: label(r, centerId, id), depth: 1 });
    const kids = children.get(id) ?? [];
    kids.forEach((kid, i) => {
      const a = angle + (span * (i + 0.5)) / kids.length;
      const kr = via.get(kid)!;
      const parentName = persons.get(id)!.isSelf ? "自分" : persons.get(id)!.name;
      nodes.push({
        id: kid, person: persons.get(kid)!, x: Math.cos(a) * R2, y: Math.sin(a) * R2,
        sub: `${parentName}の${label(kr, id, kid)}`, depth: 2,
      });
    });
    angle += span;
  }

  const pos = new Map(nodes.map((n) => [n.id, n]));
  const treeEdges = new Set([...via.values()].map((r) => r.id));
  const edges: GEdge[] = rels
    .filter((r) => pos.has(r.a) && pos.has(r.b))
    .map((r) => ({
      id: r.id, rel: r, kind: edgeKind(r.type),
      points: [[pos.get(r.a)!.x, pos.get(r.a)!.y], [pos.get(r.b)!.x, pos.get(r.b)!.y]] as Array<[number, number]>,
      faint: !treeEdges.has(r.id),
    }))
    // 薄い線を先に描いて、主な線を上に重ねる
    .sort((x, y) => Number(y.faint) - Number(x.faint));

  return { nodes, edges, ...bounds(nodes) };
};

// ===================================================================== 家系図

export const buildFamily = (data: AppData, centerId: string): Graph => {
  const { persons, rels } = aliveIndex(data);
  const fx = familyIndex(data);
  const center = persons.get(centerId);
  if (!center) return { nodes: [], edges: [], width: 0, height: 0 };

  const fam = rels.filter((r) => FAMILY.includes(r.type));
  const adj = new Map<string, Relation[]>();
  for (const r of fam) {
    adj.set(r.a, [...(adj.get(r.a) ?? []), r]);
    adj.set(r.b, [...(adj.get(r.b) ?? []), r]);
  }

  // 世代番号をつける（親は -1、子は +1、夫婦・兄弟は同じ）
  const gen = new Map<string, number>([[centerId, 0]]);
  const order: string[] = [centerId];
  const queue = [centerId];
  while (queue.length && order.length < 200) {
    const id = queue.shift()!;
    const g = gen.get(id)!;
    for (const r of adj.get(id) ?? []) {
      const o = other(r, id);
      if (gen.has(o)) continue;
      let og = g;
      if (r.type === "parent") og = r.a === id ? g + 1 : g - 1; // a は b の親
      gen.set(o, og);
      order.push(o);
      queue.push(o);
    }
  }

  const parentsOf = (id: string): string[] => fam.filter((r) => r.type === "parent" && r.b === id && gen.has(r.a)).map((r) => r.a);
  // 元夫婦も並びの上では夫婦と同じく隣に置く（子は 2 人の間から下ろす）
  const spouseOf = (id: string): string[] =>
    fam.filter((r) => (r.type === "spouse" || r.type === "exspouse") && (r.a === id || r.b === id)).map((r) => other(r, id)).filter((o) => gen.has(o));

  const gens = [...new Set(gen.values())].sort((a, b) => a - b);
  const X_GAP = 96;
  const Y_GAP = 160;
  const x = new Map<string, number>();

  for (const g of gens) {
    const row = order.filter((id) => gen.get(id) === g);
    // 親の位置の平均を目安に並べる（親がいなければ見つかった順）
    const key = new Map<string, number>();
    row.forEach((id, i) => {
      const ps = parentsOf(id).filter((p) => x.has(p));
      key.set(id, ps.length ? ps.reduce((s, p) => s + x.get(p)!, 0) / ps.length : Number.NaN);
      if (Number.isNaN(key.get(id)!)) key.set(id, 10_000 + i);
    });
    // 親のいない配偶者は相手の隣に寄せる
    for (const id of row) {
      if (key.get(id)! < 10_000) continue;
      const sp = spouseOf(id).find((s) => gen.get(s) === g && key.get(s)! < 10_000);
      if (sp) key.set(id, key.get(sp)! + 0.1);
    }
    // 同じ親の子どうしは年の順（左が年上）
    row.sort((a, b) => key.get(a)! - key.get(b)! || compareAge(persons.get(a), persons.get(b)));
    // 夫婦が離れていたら隣同士にする
    // 相手が複数いる人は「元配偶者 ― 本人 ― 今の配偶者」の順に挟む
    const exOf = (id: string): string[] =>
      fam.filter((r) => r.type === "exspouse" && (r.a === id || r.b === id)).map((r) => other(r, id)).filter((o) => gen.get(o) === g);
    const arranged: string[] = [];
    for (const id of row) {
      if (arranged.includes(id)) continue;
      const partners = spouseOf(id).filter((sp) => gen.get(sp) === g && !arranged.includes(sp));
      if (partners.length >= 2) {
        const exes = partners.filter((sp) => exOf(id).includes(sp));
        const cur = partners.filter((sp) => !exes.includes(sp));
        arranged.push(...exes, id, ...cur);
      } else {
        arranged.push(id, ...partners);
      }
    }
    // 親の真下を狙いつつ、重ならないように左から詰める
    const wanted = arranged.map((id) => (key.get(id)! < 10_000 ? key.get(id)! : Number.NaN));
    const placed: number[] = [];
    arranged.forEach((_, i) => {
      const w = Number.isNaN(wanted[i]) ? (placed[i - 1] ?? -X_GAP) + X_GAP : wanted[i];
      placed.push(i === 0 ? w : Math.max(w, placed[i - 1] + X_GAP));
    });
    // 親がいない段は真ん中にそろえる
    if (arranged.every((_, i) => Number.isNaN(wanted[i]))) {
      const shift = (placed[0] + placed[placed.length - 1]) / 2;
      for (let i = 0; i < placed.length; i++) placed[i] -= shift;
    }
    arranged.forEach((id, i) => x.set(id, placed[i]));
  }

  // 全体を中央へ
  const allX = [...x.values()];
  const midX = (Math.min(...allX) + Math.max(...allX)) / 2;
  const minG = gens[0];
  const maxG = gens[gens.length - 1];
  const midY = ((minG + maxG) / 2) * Y_GAP;

  const nodes: GNode[] = order.map((id) => ({
    id,
    person: persons.get(id)!,
    x: x.get(id)! - midX,
    y: gen.get(id)! * Y_GAP - midY,
    depth: Math.abs(gen.get(id)!),
    sub: id === centerId ? undefined : kinLabel(fx, centerId, id) ?? undefined,
  }));
  const pos = new Map(nodes.map((n) => [n.id, n]));

  const edges: GEdge[] = [];
  // 夫婦は横線
  for (const r of fam.filter((r) => (r.type === "spouse" || r.type === "exspouse") && pos.has(r.a) && pos.has(r.b))) {
    const a = pos.get(r.a)!;
    const b = pos.get(r.b)!;
    edges.push({ id: r.id, rel: r, kind: r.type === "exspouse" ? "exspouse" : "spouse", points: [[a.x, a.y], [b.x, b.y]] });
  }
  // 親子はカギ線。両親がそろっていれば両親の中間から下ろす
  const done = new Set<string>();
  const barSlots = new Map<number, string[]>();
  for (const r of fam.filter((r) => r.type === "parent" && pos.has(r.a) && pos.has(r.b))) {
    const child = pos.get(r.b)!;
    const ps = parentsOf(r.b).map((p) => pos.get(p)!).filter(Boolean);
    const couple = ps.length === 2 && spouseOf(ps[0].id).includes(ps[1].id);
    const key = couple ? `${r.b}:couple` : r.id;
    if (done.has(key)) continue;
    done.add(key);
    const px = couple ? (ps[0].x + ps[1].x) / 2 : pos.get(r.a)!.x;
    const py = couple ? ps[0].y : pos.get(r.a)!.y + NODE_R;
    // 親の組ごとに横線の高さを少しずらして、別の夫婦の子と線が混ざらないようにする
    const originKey = `${Math.round(px)}:${Math.round(py)}`;
    const rowKey = Math.round(child.y);
    if (!barSlots.has(rowKey)) barSlots.set(rowKey, []);
    const slots = barSlots.get(rowKey)!;
    if (!slots.includes(originKey)) slots.push(originKey);
    const midYLine = child.y - NODE_R - 22 - slots.indexOf(originKey) * 12;
    edges.push({ id: key, rel: r, kind: "family", points: [[px, py], [px, midYLine], [child.x, midYLine], [child.x, child.y - NODE_R]] });
  }
  // 兄弟（親が登録されていない場合だけ線を引く）
  for (const r of fam.filter((r) => r.type === "sibling" && pos.has(r.a) && pos.has(r.b))) {
    const a = pos.get(r.a)!;
    const b = pos.get(r.b)!;
    const shared = parentsOf(r.a).some((p) => parentsOf(r.b).includes(p));
    if (shared) continue;
    const top = Math.min(a.y, b.y) - NODE_R - 14;
    edges.push({ id: r.id, rel: r, kind: "family", points: [[a.x, a.y - NODE_R], [a.x, top], [b.x, top], [b.x, b.y - NODE_R]] });
  }

  return { nodes, edges, ...bounds(nodes) };
};

