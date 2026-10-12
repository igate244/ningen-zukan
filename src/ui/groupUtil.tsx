// src/ui/groupUtil.tsx — グループまわりの小道具（目印・並び順・最近開いた記録）

import { groupScopeOf } from "../graph";
import { type AppData, type Category, type Group, type Person } from "../model";
import { alive } from "../store";

// ------------------------------------------------------------ 最近開いたグループ（この端末だけ）

const OPEN_KEY = "nz-group-opened";

const readOpened = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
};

export const markGroupOpened = (id: string): void => {
  try {
    const m = readOpened();
    m[id] = Date.now();
    localStorage.setItem(OPEN_KEY, JSON.stringify(m));
  } catch {
    // 保存できない環境では並び順に反映しないだけ
  }
};

/** 自分で決めた並び順（決めていないグループは作った順で後ろへ） */
export const sortGroups = (groups: Group[]): Group[] =>
  [...groups].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.createdAt - b.createdAt);

/** 人物タブの上に出す順：よく見る → 最近開いた → 自分で決めた並び順 */
export const sortGroupsForShortcut = (groups: Group[]): Group[] => {
  const opened = readOpened();
  const manual = sortGroups(groups);
  return [...manual].sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (opened[b.id] ?? 0) - (opened[a.id] ?? 0) || manual.indexOf(a) - manual.indexOf(b),
  );
};

export const membersOf = (data: AppData, groupId: string): Person[] =>
  alive(data.persons).filter((p) => p.groups.includes(groupId));

/** そのグループに新しく入れる人の区分（メンバーに多い区分。いなければグループの種類から） */
export const categoryForGroup = (data: AppData, group: Group): Category => {
  const s = groupScopeOf(data, group.id);
  if (s) return s === "work" ? "work" : s === "kin" ? "family" : "friend";
  return group.kind === "work" ? "work" : group.kind === "family" ? "family" : "friend";
};

// ------------------------------------------------------------ 目印

/** グループの目印（絵文字、なければ名前の 1 文字）を色付きの角丸で */
export const GroupMark = ({ group, size = 40 }: { group: Group; size?: number }) => (
  <div
    className="group-icon"
    style={{
      width: size,
      height: size,
      fontSize: size * 0.45,
      borderRadius: size * 0.3,
      background: group.color ? `color-mix(in srgb, ${group.color} 22%, var(--surface))` : undefined,
      color: group.color ?? undefined,
      border: group.color ? `1.5px solid ${group.color}` : undefined,
    }}
  >
    {group.emoji || [...group.name.trim()][0] || "?"}
  </div>
);

/** 人の名前の横に出す、所属グループの色の点 */
export const GroupDots = ({ person, groups }: { person: Person; groups: Group[] }) => {
  const colors = person.groups
    .map((id) => groups.find((g) => g.id === id)?.color)
    .filter((c): c is string => !!c);
  if (!colors.length) return null;
  return (
    <span className="group-dots">
      {[...new Set(colors)].slice(0, 4).map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </span>
  );
};
