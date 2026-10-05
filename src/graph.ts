// src/graph.ts — つながりを図にするための配置計算
//
// 2 種類の図を作る。
//   相関図（radial）: 真ん中の人から何ステップ先までを、同心円状に並べる
//   家系図（family）: 親子・夫婦・兄弟のつながりだけをたどり、世代ごとに横一列に並べる

import { childrenOf, compareAge, exSpousesOf, familyIndex, kinLabel, parentsOf, siblingsOf, sortByAge, spousesOf } from "./family";
import { type AppData, type Person, type Relation, type RelType, SELF_ID as SELF_ID_FOR_GRAPH, relationLabelFrom } from "./model";

export interface GNode {
  id: string;
  person: Person;
  /** グループの丸（人ではない） */
  group?: { id: string; name: string; count: number; open: boolean };
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
  /** 弧を描くときの制御点（2 次ベジェ）。間にいる人をよけるため */
  control?: [number, number];
}

/** 家系図の「開く・たたむ」ボタン */
export interface GToggle {
  key: string;
  x: number;
  y: number;
  dir: "down" | "up";
  collapsed: boolean;
  /** たたまれている人数 */
  count: number;
  /** 押したときに開閉の印を付け外しする人 */
  ids: string[];
}

export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  width: number;
  height: number;
  toggles?: GToggle[];
}

export interface Collapse {
  /** この人（夫婦）の子から下をたたむ */
  down: Set<string>;
  /** この人の親から上をたたむ */
  up: Set<string>;
  /** 相関図で開いているグループ */
  groupsOpen?: Set<string>;
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

/**
 * 希望の角度を保ちつつ、隣同士が gap 以上離れるように少しずつ押し広げる（円周上）。
 * 並び順（希望角度の順）は変えない。
 */
const relaxAngles = (want: Map<string, number>, gap: number): Map<string, number> => {
  const TAU = Math.PI * 2;
  const norm = (a: number): number => ((a % TAU) + TAU) % TAU;
  const items = [...want.entries()].map(([id, a]) => ({ id, a: norm(a), w: norm(a) })).sort((x, y) => x.a - y.a);
  const n = items.length;
  if (n <= 1) return new Map(items.map((x) => [x.id, x.a]));
  for (let iter = 0; iter < 200; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const cur = items[i];
      const next = items[(i + 1) % n];
      let d = next.a - cur.a;
      if (i === n - 1) d += TAU;
      if (d < gap - 1e-6) {
        const push = (gap - d) / 2;
        cur.a -= push;
        next.a += push;
        moved = true;
      }
    }
    // 希望の位置へ少しだけ引き戻す（全体がずれていかないように）
    for (const it of items) it.a += (it.w - it.a) * 0.02;
    if (!moved) break;
  }
  return new Map(items.map((x) => [x.id, x.a]));
};

export const buildRadial = (data: AppData, centerId: string, maxDepth: 1 | 2): Graph => {
  const { persons, rels, adj } = aliveIndex(data);
  const fx = familyIndex(data);
  const label = (r: Relation, viewer: string, o: string): string => (r.labelBy === viewer ? r.label : undefined) ?? kinLabel(fx, viewer, o) ?? relationLabelFrom(r, viewer);
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

  // ---- 1 周目の置き場所：家族は上下（年上は上・子は下・配偶者は横）、仕事は左、友人などは右
  const n1 = ring1.length;
  const R1 = Math.max(130, (n1 * 92) / (2 * Math.PI));
  const gap1 = Math.min((2 * Math.PI) / Math.max(1, n1), 92 / R1);
  const deg = (d: number): number => (d * Math.PI) / 180;

  const parents = parentsOf(fx, centerId);
  const kidsOfCenter = childrenOf(fx, centerId);
  const spouses = spousesOf(fx, centerId);
  const exes = exSpousesOf(fx, centerId);
  const sibs = siblingsOf(fx, centerId).map((x) => x.id);
  const centerP = persons.get(centerId);

  type Zone = "top" | "bottom" | "right" | "left";
  const zoneOf = (id: string): Zone => {
    if (parents.includes(id) || sibs.includes(id)) return "top";
    if (kidsOfCenter.includes(id)) return "bottom";
    if (spouses.includes(id)) return "right";
    if (exes.includes(id)) return "left";
    const p = persons.get(id)!;
    const kind = edgeKind(via.get(id)!.type);
    if (p.category === "family" || p.category === "relative" || kind === "family") {
      // 親族は年上なら上、年下なら下（わからなければ上）
      return compareAge(centerP, p) < 0 ? "bottom" : "top";
    }
    return kind === "work" ? "left" : "right";
  };
  // 各ゾーンの中心角と、ゾーン内の並べ方
  const ZONE_CENTER: Record<Zone, number> = { top: deg(-90), bottom: deg(90), right: deg(0), left: deg(180) };
  const zones: Record<Zone, string[]> = { top: [], bottom: [], right: [], left: [] };
  for (const id of ring1) zones[zoneOf(id)].push(id);

  const want = new Map<string, number>();
  const byAgeDesc = (a: string, b: string): number => compareAge(persons.get(a), persons.get(b));
  // 上：年上ほど真上に近く、そこから左右へ交互に
  zones.top.sort(byAgeDesc).forEach((id, i) => {
    const step = Math.ceil(i / 2) * (i % 2 ? -1 : 1);
    want.set(id, ZONE_CENTER.top + step * gap1);
  });
  // 下：子どもは左から年上順
  zones.bottom.sort(byAgeDesc).forEach((id, i, arr) => {
    want.set(id, ZONE_CENTER.bottom + ((arr.length - 1) / 2 - i) * gap1);
  });
  // 右：配偶者を真横に、ほかはその上下へ交互に
  zones.right.sort((a, b) => Number(spouses.includes(b)) - Number(spouses.includes(a))).forEach((id, i) => {
    const step = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    want.set(id, ZONE_CENTER.right + step * gap1);
  });
  // 左：元配偶者を真横に、仕事の人はその上下へ
  zones.left.sort((a, b) => Number(exes.includes(b)) - Number(exes.includes(a))).forEach((id, i) => {
    const step = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    want.set(id, ZONE_CENTER.left + step * gap1);
  });
  const angle1 = relaxAngles(want, gap1);

  // ---- 2 周目：経由した 1 周目の人の外側に並べる
  const n2 = [...children.values()].reduce((s, l) => s + l.length, 0);
  const R2 = Math.max(R1 + 130, (n2 * 84) / (2 * Math.PI));
  const gap2 = Math.min((2 * Math.PI) / Math.max(1, n2), 84 / R2);
  const want2 = new Map<string, number>();
  for (const id of ring1) {
    const kids = sortByAge(fx, children.get(id) ?? []);
    kids.forEach((kid, i) => want2.set(kid, angle1.get(id)! + ((kids.length - 1) / 2 - i) * gap2 * (Math.sin(angle1.get(id)!) > 0 ? 1 : -1)));
  }
  const angle2 = relaxAngles(want2, gap2);

  const nodes: GNode[] = [{ id: centerId, person: center, x: 0, y: 0, depth: 0 }];
  for (const id of ring1) {
    const a = angle1.get(id)!;
    nodes.push({ id, person: persons.get(id)!, x: Math.cos(a) * R1, y: Math.sin(a) * R1, sub: label(via.get(id)!, centerId, id), depth: 1 });
  }
  for (const [kid, a] of angle2) {
    const kr = via.get(kid)!;
    const parentId = other(kr, kid);
    const parentName = persons.get(parentId)!.isSelf ? "自分" : persons.get(parentId)!.name;
    nodes.push({
      id: kid, person: persons.get(kid)!, x: Math.cos(a) * R2, y: Math.sin(a) * R2,
      sub: `${parentName}の${label(kr, parentId, kid)}`, depth: 2,
    });
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
//
// 一般的な（横書きの）家系図の決まりに合わせる。
//   ・同じ世代は同じ高さ。上の世代ほど上
//   ・夫婦は横の二重線で結ぶ。夫が左、妻が右
//   ・子は夫婦の線の真ん中から縦線を下ろし、きょうだいは一本の横線にまとめる
//   ・きょうだいは左から年長順
//   ・離婚は二重線に×（親子の線は残す）。再婚は相手ごとに別の線
//   ・異父・異母のきょうだいは横線を分ける
// 夫婦（とその元配偶者）をひとまとまりの「組」として扱い、組を木のように並べる。

const X_GAP = 118;
const Y_GAP = 170;

interface Unit {
  id: number;
  members: string[];
  gen: number;
}

export const buildFamily = (
  data: AppData,
  centerId: string,
  maxSteps = Infinity,
  collapse: Collapse = { down: new Set(), up: new Set() },
): Graph => {
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

  // ---- 世代番号（親は -1、子は +1、夫婦・兄弟は同じ）と、見つかった順
  // たたんだ人の親へは、どの子からも上がらない（配偶者として出てくる人はそのまま出す）
  const blockedUp = new Set<string>();
  for (const id of collapse.up) for (const p of parentsOf(fx, id)) if (p !== centerId) blockedUp.add(p);
  const sharedParentsCollapsed = (a: string, b: string): boolean => {
    const shared = parentsOf(fx, a).filter((p) => parentsOf(fx, b).includes(p));
    return shared.length > 0 && shared.every((p) => collapse.down.has(p) || blockedUp.has(p));
  };
  const gen = new Map<string, number>([[centerId, 0]]);
  const order = new Map<string, number>([[centerId, 0]]);
  const steps = new Map<string, number>([[centerId, 0]]);
  const queue = [centerId];
  while (queue.length && gen.size < 300) {
    const id = queue.shift()!;
    const g = gen.get(id)!;
    const st = steps.get(id)!;
    if (st >= maxSteps) continue;
    // 兄弟姉妹は（親を経由しても）1 歩とみなす
    const next: Array<[string, number]> = [
      ...(adj.get(id) ?? [])
        // たたんだ人の子・親へは進まない
        .filter((r) => !(r.type === "parent" && r.a === id && collapse.down.has(id)))
        .filter((r) => !(r.type === "parent" && r.b === id && blockedUp.has(r.a)))
        .map((r): [string, number] => [other(r, id), r.type === "parent" ? (r.a === id ? g + 1 : g - 1) : g]),
      ...siblingsOf(fx, id)
        .filter((x) => !sharedParentsCollapsed(id, x.id))
        .map((x): [string, number] => [x.id, g]),
    ];
    for (const [o, og] of next) {
      if (gen.has(o)) continue;
      gen.set(o, og);
      order.set(o, order.size);
      steps.set(o, st + 1);
      queue.push(o);
    }
  }
  const inTree = (id: string): boolean => gen.has(id);
  const parentsIn = (id: string): string[] => parentsOf(fx, id).filter(inTree);
  const partnersIn = (id: string): string[] =>
    [...spousesOf(fx, id), ...exSpousesOf(fx, id)].filter((o) => inTree(o) && gen.get(o) === gen.get(id));

  // ---- 組（夫婦・元夫婦でつながった人のまとまり）を作る
  const unitOf = new Map<string, Unit>();
  const units: Unit[] = [];
  const ids = [...gen.keys()].sort((a, b) => order.get(a)! - order.get(b)!);
  for (const id of ids) {
    if (unitOf.has(id)) continue;
    const members: string[] = [];
    const stack = [id];
    while (stack.length) {
      const x = stack.pop()!;
      if (members.includes(x)) continue;
      members.push(x);
      stack.push(...partnersIn(x));
    }
    const u: Unit = { id: units.length, members: arrangeCouple(members, fx), gen: gen.get(id)! };
    units.push(u);
    for (const m of members) unitOf.set(m, u);
  }

  // ---- どの組の子として下に並べるか（血のつながりの近い人を優先）
  const primaryParent = new Map<number, Unit>();
  for (const u of units) {
    const withParents = [...u.members].sort((a, b) => order.get(a)! - order.get(b)!).find((m) => parentsIn(m).length > 0);
    if (withParents) primaryParent.set(u.id, unitOf.get(parentsIn(withParents)[0])!);
  }
  // きょうだいの並び：生年月日 → 生まれ順 → 不明は後ろ（比べられない人がいても順番が崩れないよう数値で）
  const ageKey = (id?: string): number => {
    const p = persons.get(id ?? "");
    if (!p) return Number.MAX_SAFE_INTEGER;
    if (p.birthDate && !p.birthYearUnknown) {
      const t = new Date(p.birthDate).getTime();
      if (!Number.isNaN(t)) return t;
    }
    if (p.birthOrder) return 4e12 + p.birthOrder; // 生年月日が無い人は後ろ、その中で生まれ順
    return 5e12;
  };
  const childUnits = (u: Unit): Unit[] =>
    units
      .filter((c) => primaryParent.get(c.id) === u)
      .sort((a, b) => {
        const pa = a.members.find((m) => parentsIn(m).some((p) => u.members.includes(p)));
        const pb = b.members.find((m) => parentsIn(m).some((p) => u.members.includes(p)));
        return ageKey(pa) - ageKey(pb) || order.get(pa ?? "")! - order.get(pb ?? "")!;
      });

  // ---- 木の幅を計算して左から詰める（子の組の真ん中に親の組を置く）
  const x = new Map<string, number>();
  const widthMemo = new Map<number, number>();
  const unitWidth = (u: Unit): number => u.members.length * X_GAP;
  const treeWidth = (u: Unit, seen = new Set<number>()): number => {
    if (widthMemo.has(u.id)) return widthMemo.get(u.id)!;
    if (seen.has(u.id)) return unitWidth(u);
    seen.add(u.id);
    const cw = childUnits(u).reduce((s, c) => s + treeWidth(c, seen), 0);
    const w = Math.max(unitWidth(u), cw);
    widthMemo.set(u.id, w);
    return w;
  };
  const placed = new Set<number>();
  const placeTree = (u: Unit, left: number): void => {
    if (placed.has(u.id)) return;
    placed.add(u.id);
    const w = treeWidth(u);
    const kids = childUnits(u).filter((c) => !placed.has(c.id));
    const cw = kids.reduce((s, c) => s + treeWidth(c), 0);
    let cx = left + (w - cw) / 2;
    for (const c of kids) {
      placeTree(c, cx);
      cx += treeWidth(c);
    }
    const mid = left + w / 2;
    u.members.forEach((m, i) => x.set(m, mid + (i - (u.members.length - 1) / 2) * X_GAP));
  };

  // 中心の人の、いちばん上の先祖の組から並べる
  const rootOf = (u: Unit): Unit => {
    let cur = u;
    const seen = new Set<number>();
    while (primaryParent.has(cur.id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = primaryParent.get(cur.id)!;
    }
    return cur;
  };
  placeTree(rootOf(unitOf.get(centerId)!), 0);

  // ---- 残りの木（配偶者の親など）は、つながる人の上や隣に、重ならないように置く
  const rowsBusy = (): Map<number, number[]> => {
    const m = new Map<number, number[]>();
    for (const [id, xx] of x) m.set(gen.get(id)!, [...(m.get(gen.get(id)!) ?? []), xx]);
    return m;
  };
  for (let guard = 0; guard < units.length; guard++) {
    const rest = units.filter((u) => !placed.has(u.id) && !primaryParent.has(u.id));
    const pending = rest.length ? rest : units.filter((u) => !placed.has(u.id));
    if (!pending.length) break;
    // 置き済みの人とつながっている木を優先
    let best: { root: Unit; anchorX: number } | null = null;
    for (const r of pending) {
      const root = rootOf(r);
      const tmp = new Map<string, number>();
      const collect = (u: Unit, seen: Set<number>): string[] => {
        if (seen.has(u.id)) return [];
        seen.add(u.id);
        return [...u.members, ...childUnits(u).flatMap((c) => collect(c, seen))];
      };
      for (const m of collect(root, new Set())) {
        for (const rel of adj.get(m) ?? []) {
          const o = other(rel, m);
          if (x.has(o)) tmp.set(m, x.get(o)!);
        }
      }
      if (tmp.size) {
        best = { root, anchorX: [...tmp.values()][0] };
        break;
      }
    }
    if (!best) best = { root: rootOf(pending[0]), anchorX: Math.max(...x.values(), 0) + X_GAP * 2 };
    // 仮置きして、中心を anchorX に合わせ、重なれば外側へずらす
    const before = new Map(x);
    placeTree(best.root, 0);
    const added = [...x.keys()].filter((k) => !before.has(k));
    const addedMid = (Math.min(...added.map((k) => x.get(k)!)) + Math.max(...added.map((k) => x.get(k)!))) / 2;
    const busy = (() => {
      const m = new Map<number, number[]>();
      for (const [id, xx] of before) m.set(gen.get(id)!, [...(m.get(gen.get(id)!) ?? []), xx]);
      return m;
    })();
    const fits = (dx: number): boolean =>
      added.every((k) => (busy.get(gen.get(k)!) ?? []).every((ox) => Math.abs(ox - (x.get(k)! + dx)) >= X_GAP - 1));
    const base = best.anchorX - addedMid;
    let dx = base;
    const allX = [...before.values()];
    const towardRight = best.anchorX >= (Math.min(...allX) + Math.max(...allX)) / 2;
    for (let step = 0; step < 200; step++) {
      const cand = base + (towardRight ? 1 : -1) * step * (X_GAP / 2);
      if (fits(cand)) {
        dx = cand;
        break;
      }
    }
    for (const k of added) x.set(k, x.get(k)! + dx);
  }
  void rowsBusy;

  // ---- 全体を中央へ
  const allX = [...x.values()];
  const midX = (Math.min(...allX) + Math.max(...allX)) / 2;
  const gens = [...new Set(gen.values())];
  const midY = ((Math.min(...gens) + Math.max(...gens)) / 2) * Y_GAP;

  const nodes: GNode[] = [...x.keys()].map((id) => ({
    id,
    person: persons.get(id)!,
    x: x.get(id)! - midX,
    y: gen.get(id)! * Y_GAP - midY,
    depth: Math.abs(gen.get(id)!),
    sub:
      id === centerId
        ? undefined
        : rels.find((r) => r.label && r.labelBy === centerId && ((r.a === centerId && r.b === id) || (r.b === centerId && r.a === id)))?.label ??
          kinLabel(fx, centerId, id) ??
          undefined,
  }));
  const pos = new Map(nodes.map((n) => [n.id, n]));

  const edges: GEdge[] = [];
  // 夫婦・元夫婦（横の二重線。描き方は GraphView 側）
  for (const r of fam.filter((r) => (r.type === "spouse" || r.type === "exspouse") && pos.has(r.a) && pos.has(r.b))) {
    const a = pos.get(r.a)!;
    const b = pos.get(r.b)!;
    if (a.y !== b.y) continue;
    const [l, rr] = a.x < b.x ? [a, b] : [b, a];
    edges.push({ id: r.id, rel: r, kind: r.type === "exspouse" ? "exspouse" : "spouse", points: [[l.x + NODE_R, l.y], [rr.x - NODE_R, rr.y]] });
  }
  // 親子：両親がそろっていれば夫婦の線の真ん中から、片親なら親の真下から下ろす。
  // 同じ親の組の子は一本の横線にまとめ、親の組ごとに横線の高さを変える
  const groups = new Map<string, { ox: number; oy: number; kids: GNode[]; rel: Relation }>();
  for (const r of fam.filter((r) => r.type === "parent" && pos.has(r.a) && pos.has(r.b))) {
    const child = pos.get(r.b)!;
    const ps = parentsIn(r.b).map((p) => pos.get(p)!).filter(Boolean);
    const sameRow = ps.length === 2 && ps[0].y === ps[1].y && Math.abs(ps[0].x - ps[1].x) <= X_GAP * 1.01;
    const key = sameRow ? ps.map((p) => p.id).sort().join("+") : r.a;
    if (!sameRow && ps.length === 2 && key !== r.a) continue;
    const ox = sameRow ? (ps[0].x + ps[1].x) / 2 : pos.get(r.a)!.x;
    const oy = sameRow ? ps[0].y : pos.get(r.a)!.y + NODE_R;
    const g = groups.get(key) ?? { ox, oy, kids: [], rel: r };
    if (!g.kids.includes(child)) g.kids.push(child);
    groups.set(key, g);
  }
  const slotsByRow = new Map<number, number>();
  for (const [key, g] of groups) {
    const row = Math.round(g.kids[0].y);
    const slot = slotsByRow.get(row) ?? 0;
    slotsByRow.set(row, slot + 1);
    const barY = g.kids[0].y - NODE_R - 26 - slot * 12;
    const xs = [g.ox, ...g.kids.map((k) => k.x)];
    // 親から横線まで
    edges.push({ id: `${key}-down`, rel: g.rel, kind: "family", points: [[g.ox, g.oy], [g.ox, barY]] });
    // きょうだいをまとめる横線
    edges.push({ id: `${key}-bar`, rel: g.rel, kind: "family", points: [[Math.min(...xs), barY], [Math.max(...xs), barY]] });
    // 横線から各子へ
    for (const k of g.kids) edges.push({ id: `${key}-${k.id}`, rel: g.rel, kind: "family", points: [[k.x, barY], [k.x, k.y - NODE_R - 3]] });
  }
  // 兄弟（親が登録されていない場合だけ上に線を引く）
  for (const r of fam.filter((r) => r.type === "sibling" && pos.has(r.a) && pos.has(r.b))) {
    const a = pos.get(r.a)!;
    const b = pos.get(r.b)!;
    if (parentsIn(r.a).some((p) => parentsIn(r.b).includes(p))) continue;
    const top = Math.min(a.y, b.y) - NODE_R - 26;
    edges.push({ id: r.id, rel: r, kind: "family", points: [[a.x, a.y - NODE_R - 3], [a.x, top], [b.x, top], [b.x, b.y - NODE_R - 3]] });
  }

  // ---- 開く・たたむボタン
  const toggles: GToggle[] = [];
  const done = new Set<string>();
  for (const n of nodes) {
    // 下（子）：夫婦なら 2 人の真ん中、ひとりならその人の下
    const kids = childrenOf(fx, n.id);
    if (kids.length && !done.has(n.id)) {
      const partner = [...spousesOf(fx, n.id), ...exSpousesOf(fx, n.id)].find((o) => pos.has(o) && kids.some((k) => parentsOf(fx, k).includes(o)));
      const ids = partner ? [n.id, partner] : [n.id];
      ids.forEach((i) => done.add(i));
      const collapsed = ids.some((i) => collapse.down.has(i));
      const allKids = [...new Set(ids.flatMap((i) => childrenOf(fx, i)))];
      const hidden = allKids.filter((k) => !pos.has(k)).length;
      if (collapsed || hidden < allKids.length) {
        const tx = partner ? (n.x + pos.get(partner)!.x) / 2 : n.x;
        toggles.push({ key: `d-${ids.join("+")}`, x: tx, y: n.y + NODE_R + 52, dir: "down", collapsed, count: hidden, ids });
      }
    }
    // 上（親）
    const ps = parentsOf(fx, n.id);
    const isCore = n.id === centerId || spousesOf(fx, centerId).includes(n.id) || exSpousesOf(fx, centerId).includes(n.id);
    if (ps.length && isCore) {
      const collapsed = collapse.up.has(n.id);
      const shown = ps.filter((p) => pos.has(p)).length;
      // 上向きのボタンは親の組の線の上（親と子の間）に置く
      if (collapsed || shown > 0) {
        toggles.push({ key: `u-${n.id}`, x: n.x + NODE_R + 8, y: n.y - NODE_R - 8, dir: "up", collapsed, count: ps.length - shown, ids: [n.id] });
      }
    }
  }

  return { nodes, edges, toggles, ...bounds(nodes) };
};

/** 組の中の並び：夫が左・妻が右。相手が複数いる人は真ん中で、元配偶者を外側に */
const arrangeCouple = (members: string[], fx: ReturnType<typeof familyIndex>): string[] => {
  if (members.length === 1) return members;
  const deg = (id: string): number => spousesOf(fx, id).length + exSpousesOf(fx, id).length;
  if (members.length === 2) {
    const [a, b] = members;
    const ga = fx.persons.get(a)?.gender;
    const gb = fx.persons.get(b)?.gender;
    if (ga === "female" && gb !== "female") return [b, a];
    if (gb === "male" && ga !== "male") return [b, a];
    return [a, b];
  }
  // 3 人以上：相手の多い人を真ん中に、元配偶者は左、今の配偶者は右
  const hub = [...members].sort((a, b) => deg(b) - deg(a))[0];
  const exes = exSpousesOf(fx, hub).filter((m) => members.includes(m));
  const cur = spousesOf(fx, hub).filter((m) => members.includes(m));
  const restM = members.filter((m) => m !== hub && !exes.includes(m) && !cur.includes(m));
  return [...restM, ...exes, hub, ...cur];
};

// ===================================================================== 相関図（家系図＋まわりの人）
//
// 家族は家系図の決まりで並べ、仕事の人は左、友人・紹介などは右に縦に並べる。
// 仕事の列は上司が上、部下が下。

export const buildCombined = (data: AppData, centerId: string, maxDepth: 1 | 2, collapse?: Collapse): Graph => {
  const { persons, rels, adj } = aliveIndex(data);
  const fx = familyIndex(data);
  const famGraph = buildFamily(data, centerId, maxDepth, collapse);
  if (!famGraph.nodes.length) return famGraph;
  const nodes = [...famGraph.nodes];
  const edges = [...famGraph.edges];
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const c = pos.get(centerId)!;

  // 中心の人とつながる家族以外の人（と、その先の人）
  const nonFam = (r: Relation): boolean => !FAMILY.includes(r.type);
  const ring1: Array<{ id: string; r?: Relation }> = [];
  for (const r of adj.get(centerId) ?? []) {
    const o = other(r, centerId);
    if (nonFam(r) && !pos.has(o) && !ring1.some((x) => x.id === o)) ring1.push({ id: o, r });
  }

  // ---- グループ：同じグループの人は「◯◯ 12人」の丸にまとめる（タップで開く）
  const groups = new Map((data.groups ?? []).filter((g) => !g.deleted).map((g) => [g.id, g]));
  const centerGroups = (persons.get(centerId)?.groups ?? []).filter((g) => groups.has(g));
  // 自分が入っているグループの仲間は、直接のつながりが無くても候補に入れる
  for (const p of persons.values()) {
    if (p.id === centerId || pos.has(p.id) || ring1.some((x) => x.id === p.id)) continue;
    if (p.groups.some((g) => centerGroups.includes(g))) ring1.push({ id: p.id });
  }
  const bucketOf = new Map<string, string>();
  const count = new Map<string, number>();
  for (const { id } of ring1) for (const g of persons.get(id)!.groups) if (groups.has(g)) count.set(g, (count.get(g) ?? 0) + 1);
  for (const { id } of ring1) {
    const gs = persons.get(id)!.groups.filter((g) => groups.has(g));
    const pick = gs.find((g) => centerGroups.includes(g)) ?? gs.filter((g) => (count.get(g) ?? 0) >= 2).sort((a, b) => count.get(b)! - count.get(a)!)[0];
    if (pick) bucketOf.set(id, pick);
  }
  const buckets = new Map<string, string[]>();
  for (const [id, g] of bucketOf) buckets.set(g, [...(buckets.get(g) ?? []), id]);
  // 1 人だけのグループは丸にせず、そのまま並べる
  for (const [g, ids] of buckets) if (ids.length < 2 && !centerGroups.includes(g)) { buckets.delete(g); ids.forEach((i) => bucketOf.delete(i)); }
  const singles = ring1.filter((x) => !bucketOf.has(x.id));
  const openSet = collapse?.groupsOpen ?? new Set<string>();

  // 並び順：上司 → 同僚 → 部下（左列）、友人 → 紹介 → その他（右列）
  const rank = (r: Relation | undefined, o: string): number => {
    if (!r) return 3;
    if (r.type === "boss") return r.a === o ? 0 : 2;
    if (r.type === "colleague") return 1;
    if (r.type === "friend") return 0;
    if (r.type === "introduced") return 1;
    return 2;
  };
  type Item = { kind: "person"; id: string; r?: Relation } | { kind: "group"; gid: string; ids: string[] };
  const isWork = (it: Item): boolean =>
    it.kind === "person" ? !!it.r && edgeKind(it.r.type) === "work" : groups.get(it.gid)!.kind === "work";
  const items: Item[] = [
    ...singles.map((x): Item => ({ kind: "person", id: x.id, r: x.r })),
    ...[...buckets.entries()].map(([gid, ids]): Item => ({ kind: "group", gid, ids })),
  ];
  const order = (a: Item, b: Item): number =>
    (a.kind === "group" ? 5 : rank(a.r, a.id)) - (b.kind === "group" ? 5 : rank(b.r, b.id));
  const left = items.filter(isWork).sort(order);
  const right = items.filter((x) => !isWork(x)).sort(order);

  const famXs = nodes.map((n) => n.x);
  const colL = Math.min(...famXs) - 150;
  const colR = Math.max(...famXs) + 150;
  const ROW = 96;
  const label = (r: Relation, viewer: string, o: string): string => (r.labelBy === viewer ? r.label : undefined) ?? kinLabel(fx, viewer, o) ?? relationLabelFrom(r, viewer);
  const relWithCenter = (id: string): Relation | undefined => rels.find((r) => (r.a === centerId && r.b === id) || (r.b === centerId && r.a === id));
  const groupEdges: GEdge[] = [];

  const placeCol = (list: Item[], colX: number, outward: number): void => {
    let outerNext = -Infinity; // 外側の列で次に置ける高さ
    list.forEach((it, i) => {
      const y = c.y + (i - (list.length - 1) / 2) * ROW;
      if (it.kind === "person") {
        const r = it.r;
        const n: GNode = { id: it.id, person: persons.get(it.id)!, x: colX, y, sub: r ? label(r, centerId, it.id) : undefined, depth: 1 };
        nodes.push(n);
        pos.set(it.id, n);
        return;
      }
      const g = groups.get(it.gid)!;
      const open = openSet.has(it.gid);
      const gid = `grp:${it.gid}`;
      const gn: GNode = {
        id: gid,
        person: { id: gid, name: g.name } as Person,
        x: colX, y, depth: 1,
        sub: `${it.ids.length}人${open ? "" : "（タップで開く）"}`,
        group: { id: g.id, name: g.name, count: it.ids.length, open },
      };
      nodes.push(gn);
      pos.set(gid, gn);
      // 中心とグループの丸を結ぶ
      groupEdges.push({ id: `${gid}-c`, rel: { id: gid, a: centerId, b: gid, type: "other", createdAt: 0, updatedAt: 0 }, kind: g.kind === "work" ? "work" : "friend", points: [[c.x, c.y], [colX, y]] });
      if (!open) return;
      // 開いたグループの人は外側の列に縦に並べる
      const ids = sortByAge(fx, it.ids);
      const start = Math.max(outerNext, y - ((ids.length - 1) / 2) * 76);
      ids.forEach((id, j) => {
        const my = start + j * 76;
        const r = relWithCenter(id);
        const n: GNode = { id, person: persons.get(id)!, x: colX + outward * 150, y: my, sub: r ? label(r, centerId, id) : g.name, depth: 2 };
        nodes.push(n);
        pos.set(id, n);
        groupEdges.push({ id: `${gid}-${id}`, rel: { id: `${gid}-${id}`, a: gid, b: id, type: "other", createdAt: 0, updatedAt: 0 }, kind: "other", points: [[colX, y], [n.x, my]], faint: false });
      });
      outerNext = start + ids.length * 76 + 20;
    });
    if (maxDepth < 2) return;
    // 個人のその先（家族以外のつながり）をさらに外側の列へ
    for (const it of list) {
      if (it.kind !== "person") continue;
      const outs = (adj.get(it.id) ?? []).filter((r) => nonFam(r) && !pos.has(other(r, it.id)));
      outs.forEach((r, j) => {
        const o = other(r, it.id);
        if (pos.has(o)) return;
        const base = pos.get(it.id)!;
        const yy = Math.max(outerNext, base.y + (j - (outs.length - 1) / 2) * 70);
        const n: GNode = { id: o, person: persons.get(o)!, x: colX + outward * 150, y: yy, sub: `${persons.get(it.id)!.name}の${label(r, it.id, o)}`, depth: 2 };
        nodes.push(n);
        pos.set(o, n);
        outerNext = yy + 70;
      });
    }
  };
  placeCol(left, colL, -1);
  placeCol(right, colR, 1);
  edges.push(...groupEdges);

  // 線（家族以外）。グループで開いた人と中心の線は丸を経由して見せるので引かない
  for (const r of rels) {
    if (!nonFam(r) || !pos.has(r.a) || !pos.has(r.b)) continue;
    const a = pos.get(r.a)!;
    const b = pos.get(r.b)!;
    const viaGroup = (r.a === centerId && bucketOf.has(r.b)) || (r.b === centerId && bucketOf.has(r.a));
    if (viaGroup) continue;
    let control: [number, number] | undefined;
    if (Math.abs(a.x - b.x) < 1) {
      // 同じ列の人どうしは外側にふくらませる
      const out = a.x < c.x ? -1 : 1;
      control = [a.x + out * 70, (a.y + b.y) / 2];
    } else if (nodes.some((n) => n !== a && n !== b && Math.abs(n.y - a.y) < 40 && (n.x - a.x) * (n.x - b.x) < 0)) {
      // 家系図の人の上を通らないよう、弧を描いて越える
      control = [(a.x + b.x) / 2, Math.min(a.y, b.y) - 110];
    }
    edges.push({
      id: r.id, rel: r, kind: edgeKind(r.type), points: [[a.x, a.y], [b.x, b.y]],
      faint: r.a !== centerId && r.b !== centerId && a.depth !== 1 && b.depth !== 1,
      control,
    });
  }

  // 中心を原点に寄せる
  const allX = nodes.map((n) => n.x);
  const allY = nodes.map((n) => n.y);
  const mx = (Math.min(...allX) + Math.max(...allX)) / 2;
  const my = (Math.min(...allY) + Math.max(...allY)) / 2;
  const shifted = nodes.map((n) => ({ ...n, x: n.x - mx, y: n.y - my }));
  const shiftedEdges = edges.map((e) => ({
    ...e,
    points: e.points.map(([px, py]) => [px - mx, py - my] as [number, number]),
    control: e.control ? ([e.control[0] - mx, e.control[1] - my] as [number, number]) : undefined,
  }));
  const toggles = (famGraph.toggles ?? []).map((t) => ({ ...t, x: t.x - mx, y: t.y - my }));
  return { nodes: shifted, edges: shiftedEdges, toggles, ...bounds(shifted) };
};

// ===================================================================== グループの図
//
// メンバーを円に並べて、メンバーどうしのつながりを線で結ぶ。自分が入っていれば真ん中。

export const buildGroup = (data: AppData, groupId: string): Graph => {
  const { persons, rels } = aliveIndex(data);
  const fx = familyIndex(data);
  const members = sortByAge(fx, [...persons.values()].filter((p) => p.groups.includes(groupId)).map((p) => p.id));
  if (!members.length) return { nodes: [], edges: [], width: 0, height: 0 };
  const centerIn = members.includes(SELF_ID_FOR_GRAPH) ? SELF_ID_FOR_GRAPH : null;
  const ring = members.filter((m) => m !== centerIn);
  const R = Math.max(120, (ring.length * 96) / (2 * Math.PI));
  const nodes: GNode[] = [];
  if (centerIn) nodes.push({ id: centerIn, person: persons.get(centerIn)!, x: 0, y: 0, depth: 0 });
  ring.forEach((id, i) => {
    const a = -Math.PI / 2 + (i / ring.length) * Math.PI * 2;
    nodes.push({ id, person: persons.get(id)!, x: Math.cos(a) * R, y: Math.sin(a) * R, depth: 1 });
  });
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges: GEdge[] = rels
    .filter((r) => pos.has(r.a) && pos.has(r.b))
    .map((r) => {
      const a = pos.get(r.a)!;
      const b = pos.get(r.b)!;
      const kind = edgeKind(r.type);
      // 夫婦の二重線は家系図向けなので、ここでは普通の線にする
      return { id: r.id, rel: r, kind: kind === "spouse" || kind === "exspouse" ? "family" : kind, points: [[a.x, a.y], [b.x, b.y]] as Array<[number, number]> };
    });
  // 呼び名：自分が入っていれば自分から見た関係
  if (centerIn) for (const n of nodes) {
    if (n.id === centerIn) continue;
    const r = rels.find((x) => (x.a === centerIn && x.b === n.id) || (x.b === centerIn && x.a === n.id));
    if (r) n.sub = (r.labelBy === centerIn ? r.label : undefined) ?? kinLabel(fx, centerIn, n.id) ?? relationLabelFrom(r, centerIn);
  }
  return { nodes, edges, ...bounds(nodes) };
};

// ===================================================================== 仕事・プライベートの図
//
// 相関図を「親族／仕事／プライベート」に分けたうちの、親族以外の 2 つ。
//   ・仕事：上司は上、部下は下、同僚やグループ（会社・部署）は左右
//   ・プライベート：友人・紹介・グループ（学校・趣味・地域）を中心のまわりに
// 同じグループの人は「◯◯ 12人」の丸にまとめ、タップで開く。
// 親族以外の人の家族（上司の奥さんなど）は、その人の外側に小さく添える。

export type Scope = "kin" | "work" | "private";
export const SCOPE_LABEL: Record<Scope, string> = { kin: "親族", work: "仕事", private: "プライベート" };

const WORK_REL: RelType[] = ["boss", "colleague"];

/** 自分の親族（自分から親子・夫婦・兄弟でたどれる人と、区分が家族・親族の人） */
export const kinSetOf = (data: AppData): Set<string> => {
  const { persons, adj } = aliveIndex(data);
  const set = new Set<string>([SELF_ID_FOR_GRAPH]);
  const queue = [SELF_ID_FOR_GRAPH];
  while (queue.length) {
    const id = queue.shift()!;
    for (const r of adj.get(id) ?? []) {
      if (!FAMILY.includes(r.type)) continue;
      const o = other(r, id);
      if (!set.has(o)) {
        set.add(o);
        queue.push(o);
      }
    }
  }
  for (const p of persons.values()) if (p.category === "family" || p.category === "relative") set.add(p.id);
  set.delete(SELF_ID_FOR_GRAPH);
  return set;
};

/** その人がどの図に出るか（複数あり） */
export const scopesOf = (data: AppData, id: string, kin = kinSetOf(data)): Set<Scope> => {
  const out = new Set<Scope>();
  if (id === SELF_ID_FOR_GRAPH) return new Set<Scope>(["kin", "work", "private"]);
  const p = data.persons.find((x) => x.id === id && !x.deleted);
  if (!p) return out;
  const groups = new Map((data.groups ?? []).filter((g) => !g.deleted).map((g) => [g.id, g]));
  const gKinds = p.groups.map((g) => groups.get(g)?.kind).filter(Boolean);
  const rels = data.relations.filter((r) => !r.deleted && (r.a === id || r.b === id));
  if (kin.has(id)) out.add("kin");
  if (p.category === "work" || gKinds.includes("work") || rels.some((r) => WORK_REL.includes(r.type))) out.add("work");
  if (!kin.has(id)) {
    const priv =
      p.category === "friend" || p.category === "other" ||
      gKinds.some((k) => k !== "work" && k !== "family") ||
      rels.some((r) => r.type === "friend" || r.type === "introduced");
    if (priv || !out.has("work")) out.add("private");
  }
  return out;
};

export const buildScoped = (data: AppData, centerId: string, scope: "work" | "private", maxDepth: 1 | 2, collapse?: Collapse): Graph => {
  const { persons, rels, adj } = aliveIndex(data);
  const fx = familyIndex(data);
  const center = persons.get(centerId);
  if (!center) return { nodes: [], edges: [], width: 0, height: 0 };
  const kin = kinSetOf(data);
  const scopeCache = new Map<string, Set<Scope>>();
  const inScope = (id: string): boolean => {
    if (id === centerId) return true;
    if (!scopeCache.has(id)) scopeCache.set(id, scopesOf(data, id, kin));
    return scopeCache.get(id)!.has(scope);
  };
  const nonFam = (r: Relation): boolean => !FAMILY.includes(r.type);
  const label = (r: Relation, viewer: string, o: string): string => (r.labelBy === viewer ? r.label : undefined) ?? kinLabel(fx, viewer, o) ?? relationLabelFrom(r, viewer);
  const name = (id: string): string => (persons.get(id)!.isSelf ? "自分" : persons.get(id)!.name);

  // ---- 1 周目の候補：中心と（家族以外で）直接つながる人
  const ring1: Array<{ id: string; r?: Relation }> = [];
  for (const r of adj.get(centerId) ?? []) {
    const o = other(r, centerId);
    if (nonFam(r) && inScope(o) && !ring1.some((x) => x.id === o)) ring1.push({ id: o, r });
  }

  // ---- グループ：この図に合う種類のグループだけ
  const groupOk = (kind: string): boolean => (scope === "work" ? kind === "work" : kind !== "work" && kind !== "family");
  const groups = new Map((data.groups ?? []).filter((g) => !g.deleted && groupOk(g.kind)).map((g) => [g.id, g]));
  const centerGroups = center.groups.filter((g) => groups.has(g));
  for (const p of persons.values()) {
    if (p.id === centerId || ring1.some((x) => x.id === p.id)) continue;
    if (p.groups.some((g) => centerGroups.includes(g))) ring1.push({ id: p.id });
  }
  const count = new Map<string, number>();
  for (const { id } of ring1) for (const g of persons.get(id)!.groups) if (groups.has(g)) count.set(g, (count.get(g) ?? 0) + 1);
  const bucketOf = new Map<string, string>();
  // 上司・部下は丸にしまわず、いつも見えるようにする
  const keepOut = (r?: Relation): boolean => !!r && r.type === "boss";
  for (const { id, r } of ring1) {
    if (keepOut(r)) continue;
    const gs = persons.get(id)!.groups.filter((g) => groups.has(g));
    const pick = gs.find((g) => centerGroups.includes(g)) ?? gs.filter((g) => (count.get(g) ?? 0) >= 2).sort((a, b) => count.get(b)! - count.get(a)!)[0];
    if (pick) bucketOf.set(id, pick);
  }
  const buckets = new Map<string, string[]>();
  for (const [id, g] of bucketOf) buckets.set(g, [...(buckets.get(g) ?? []), id]);
  for (const [g, ids] of buckets) if (ids.length < 2 && !centerGroups.includes(g)) { buckets.delete(g); ids.forEach((i) => bucketOf.delete(i)); }
  const openSet = collapse?.groupsOpen ?? new Set<string>();

  type Item = { kind: "person"; id: string; r?: Relation } | { kind: "group"; gid: string; ids: string[] };
  const items: Item[] = [
    ...ring1.filter((x) => !bucketOf.has(x.id)).map((x): Item => ({ kind: "person", id: x.id, r: x.r })),
    ...[...buckets.entries()].map(([gid, ids]): Item => ({ kind: "group", gid, ids: sortByAge(fx, ids) })),
  ];
  const keyOf = (it: Item): string => (it.kind === "person" ? it.id : `grp:${it.gid}`);

  // ---- 1 周目の角度
  const deg = (d: number): number => (d * Math.PI) / 180;
  const n1 = items.length;
  const R1 = Math.max(150, (n1 * 100) / (2 * Math.PI));
  const gap1 = Math.min((2 * Math.PI) / Math.max(1, n1), 100 / R1);
  const want = new Map<string, number>();
  const spread = (list: Item[], base: number, dir = 1): void =>
    list.forEach((it, i) => want.set(keyOf(it), base + dir * Math.ceil(i / 2) * (i % 2 ? -1 : 1) * gap1));
  if (scope === "work") {
    const isBoss = (it: Item): boolean => it.kind === "person" && it.r?.type === "boss" && it.r.a === it.id;
    const isSub = (it: Item): boolean => it.kind === "person" && it.r?.type === "boss" && it.r.b === it.id;
    spread(items.filter(isBoss), deg(-90));
    spread(items.filter(isSub), deg(90));
    const side = items.filter((it) => !isBoss(it) && !isSub(it));
    // グループは左、同僚などは右から埋める
    const groupsSide = side.filter((it) => it.kind === "group");
    const peopleSide = side.filter((it) => it.kind === "person").sort((a, b) =>
      Number((b as { r?: Relation }).r?.type === "colleague") - Number((a as { r?: Relation }).r?.type === "colleague"));
    spread(groupsSide, deg(180));
    spread(peopleSide, deg(0));
  } else {
    // グループ → 友人 → 紹介 → その他 の順に、真上から時計回りに等間隔
    const rank = (it: Item): number => (it.kind === "group" ? 0 : it.r?.type === "friend" ? 1 : it.r?.type === "introduced" ? 2 : 3);
    const sorted = [...items].sort((a, b) => rank(a) - rank(b));
    sorted.forEach((it, i) => want.set(keyOf(it), deg(-90) + (i / Math.max(1, sorted.length)) * Math.PI * 2));
  }
  const angle1 = relaxAngles(want, gap1);

  const nodes: GNode[] = [{ id: centerId, person: center, x: 0, y: 0, depth: 0 }];
  const pos = new Map<string, GNode>([[centerId, nodes[0]]]);
  const edges: GEdge[] = [];
  const kinMark = (id: string): string => (scope === "work" && kin.has(id) ? "・親族" : "");
  const relWithCenter = (id: string): Relation | undefined => rels.find((r) => (r.a === centerId && r.b === id) || (r.b === centerId && r.a === id));

  for (const it of items) {
    const a = angle1.get(keyOf(it))!;
    const x = Math.cos(a) * R1;
    const y = Math.sin(a) * R1;
    if (it.kind === "person") {
      const n: GNode = { id: it.id, person: persons.get(it.id)!, x, y, depth: 1, sub: (it.r ? label(it.r, centerId, it.id) : "") + kinMark(it.id) || undefined };
      nodes.push(n);
      pos.set(it.id, n);
    } else {
      const g = groups.get(it.gid)!;
      const open = openSet.has(it.gid);
      const gid = `grp:${it.gid}`;
      const gn: GNode = {
        id: gid, person: { id: gid, name: g.name } as Person, x, y, depth: 1,
        sub: `${it.ids.length}人${open ? "" : "（タップで開く）"}`,
        group: { id: g.id, name: g.name, count: it.ids.length, open },
      };
      nodes.push(gn);
      pos.set(gid, gn);
      edges.push({ id: `${gid}-c`, rel: { id: gid, a: centerId, b: gid, type: "other", createdAt: 0, updatedAt: 0 }, kind: scope === "work" ? "work" : "friend", points: [[0, 0], [x, y]] });
    }
  }

  // ---- 2 周目：開いたグループの人、1 周目の人のその先、親族以外の人の家族
  const outer = new Map<string, { parent: string; sub: string }>();
  for (const it of items) {
    if (it.kind === "group") {
      if (!openSet.has(it.gid)) continue;
      const g = groups.get(it.gid)!;
      for (const id of it.ids) {
        const r = relWithCenter(id);
        outer.set(id, { parent: `grp:${it.gid}`, sub: (r ? label(r, centerId, id) : g.name) + kinMark(id) });
      }
      continue;
    }
    for (const r of adj.get(it.id) ?? []) {
      const o = other(r, it.id);
      if (o === centerId || pos.has(o) || outer.has(o) || bucketOf.has(o)) continue;
      const fam = !nonFam(r);
      // 家族は「この人の家族」として添える（自分の親族は除く）。それ以外は 2 つ先まで見るときだけ
      if (fam ? kin.has(o) : maxDepth < 2 || !inScope(o)) continue;
      outer.set(o, { parent: it.id, sub: `${name(it.id)}の${label(r, it.id, o)}` });
    }
  }
  const n2 = outer.size;
  const R2 = Math.max(R1 + 140, (n2 * 86) / (2 * Math.PI));
  const gap2 = Math.min((2 * Math.PI) / Math.max(1, n2), 86 / R2);
  const want2 = new Map<string, number>();
  const byParent = new Map<string, string[]>();
  for (const [id, o] of outer) byParent.set(o.parent, [...(byParent.get(o.parent) ?? []), id]);
  for (const [parent, kids] of byParent) {
    const base = angle1.get(parent) ?? Math.atan2(pos.get(parent)!.y, pos.get(parent)!.x);
    kids.forEach((kid, i) => want2.set(kid, base + ((kids.length - 1) / 2 - i) * gap2));
  }
  const angle2 = relaxAngles(want2, gap2);
  for (const [id, a] of angle2) {
    const o = outer.get(id)!;
    const n: GNode = { id, person: persons.get(id)!, x: Math.cos(a) * R2, y: Math.sin(a) * R2, depth: 2, sub: o.sub };
    nodes.push(n);
    pos.set(id, n);
    if (o.parent.startsWith("grp:")) {
      const gn = pos.get(o.parent)!;
      edges.push({ id: `${o.parent}-${id}`, rel: { id: `${o.parent}-${id}`, a: o.parent, b: id, type: "other", createdAt: 0, updatedAt: 0 }, kind: "other", points: [[gn.x, gn.y], [n.x, n.y]] });
    }
  }

  // ---- 人どうしの線
  for (const r of rels) {
    if (!pos.has(r.a) || !pos.has(r.b)) continue;
    const viaGroup = (r.a === centerId && bucketOf.has(r.b)) || (r.b === centerId && bucketOf.has(r.a));
    if (viaGroup) continue;
    const a = pos.get(r.a)!;
    const b = pos.get(r.b)!;
    const k = edgeKind(r.type);
    const touchesInner = r.a === centerId || r.b === centerId || (a.depth <= 1 && b.depth <= 1);
    const isTree = touchesInner || outer.get(r.a)?.parent === r.b || outer.get(r.b)?.parent === r.a;
    edges.push({
      id: r.id, rel: r, kind: k === "spouse" || k === "exspouse" ? "family" : k,
      points: [[a.x, a.y], [b.x, b.y]],
      faint: !isTree,
    });
  }
  edges.sort((x, y) => Number(!!y.faint) - Number(!!x.faint));
  return { nodes, edges, ...bounds(nodes) };
};
