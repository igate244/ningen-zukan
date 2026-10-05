// src/ui/ThisWeek.tsx — 人物タブのいちばん上に出す「これから 7 日」と「約束・話すこと」

import { useMemo, useState } from "react";
import { age, daysToBirthday, kaikiLabel, parseDate, today } from "../dates";
import type { AppData, Person } from "../model";
import { navigate } from "../router";
import { alive } from "../store";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const DAYS = 7;

interface Upcoming {
  key: string;
  d: number; // 何日後か
  text: string;
  to: string;
}

const whenLabel = (d: number): string => {
  if (d === 0) return "今日";
  if (d === 1) return "明日";
  const x = new Date();
  x.setDate(x.getDate() + d);
  return `${x.getMonth() + 1}/${x.getDate()}（${WEEK[x.getDay()]}）`;
};

/** 日付どうしの日数の差（b − a） */
const diffDays = (a: string, b: string): number => Math.round((parseDate(b)!.getTime() - parseDate(a)!.getTime()) / 86_400_000);

const upcomingOf = (data: AppData, persons: Person[]): Upcoming[] => {
  const out: Upcoming[] = [];
  const now = new Date();
  for (const p of persons) {
    if (p.birthDate && !p.deathDate) {
      const d = daysToBirthday(p.birthDate);
      if (d !== null && d <= DAYS) {
        const a = age(p.birthDate, p.birthYearUnknown);
        const turn = a === null ? "" : `（${d === 0 ? a : a + 1}歳）`;
        out.push({ key: `b-${p.id}`, d, text: `${p.name}の誕生日${turn}`, to: `/p/${p.id}` });
      }
    }
    if (p.deathDate) {
      const d = daysToBirthday(p.deathDate);
      if (d !== null && d <= DAYS) {
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
        const years = target.getFullYear() - Number(p.deathDate.slice(0, 4));
        const kaiki = years > 0 ? kaikiLabel(years) : null;
        out.push({ key: `d-${p.id}`, d, text: `${p.name}の命日${years > 0 ? `（${years}年${kaiki ? `・${kaiki}` : ""}）` : ""}`, to: `/p/${p.id}` });
      }
    }
  }
  const t = today();
  for (const l of alive(data.logs)) {
    if (l.kind !== "event") continue;
    const title = l.text.split("\n")[0] || "イベント";
    const d = l.yearly ? daysToBirthday(l.date) : diffDays(t, l.date);
    if (d === null || d < 0 || d > DAYS) continue;
    out.push({ key: `e-${l.id}`, d, text: title, to: `/log/${l.id}` });
  }
  return out.sort((a, b) => a.d - b.d);
};

// 開いた・閉じたを覚えておく
const memo = { open: true };

export const ThisWeek = ({ data, persons }: { data: AppData; persons: Person[] }) => {
  const [open, setOpen] = useState(memo.open);
  const [all, setAll] = useState(false);
  const upcoming = useMemo(() => upcomingOf(data, persons), [data, persons]);
  // 済んでいない「次に話すこと・約束」と「貸し借り」がある人
  const todos = useMemo(
    () =>
      persons
        .map((p) => ({ p, topics: p.nextTopics.filter((x) => !x.done), favors: p.favors.filter((x) => !x.settled) }))
        .filter((x) => x.topics.length + x.favors.length > 0)
        .sort((a, b) => Number(!!b.p.pinned) - Number(!!a.p.pinned) || b.topics.length + b.favors.length - (a.topics.length + a.favors.length)),
    [persons],
  );

  if (upcoming.length === 0 && todos.length === 0) return null;
  const toggle = (): void => {
    memo.open = !open;
    setOpen(!open);
  };

  return (
    <div className="card week">
      <button type="button" className="week-head" onClick={toggle}>
        <span className="week-title">これから7日</span>
        <span className="muted small">
          {upcoming.length ? `予定 ${upcoming.length}` : ""}
          {upcoming.length && todos.length ? " ・ " : ""}
          {todos.length ? `約束・話すこと ${todos.length}人` : ""}
        </span>
        <span className="week-caret" style={{ transform: open ? "rotate(180deg)" : undefined }}>⌄</span>
      </button>
      {open && (
        <div className="week-body">
          {(all ? upcoming : upcoming.slice(0, 4)).map((u) => (
            <button type="button" key={u.key} className="week-line" onClick={() => navigate(u.to)}>
              <span className={`week-when ${u.d === 0 ? "today" : ""}`}>{whenLabel(u.d)}</span>
              <span className="week-text">{u.text}</span>
            </button>
          ))}
          {!all && upcoming.length > 4 && (
            <button type="button" className="text-btn small" onClick={() => setAll(true)}>ほか {upcoming.length - 4}件を見る</button>
          )}
          {todos.length > 0 && (
            <>
              <div className="week-sub">約束・話すこと</div>
              {todos.slice(0, all ? 20 : 3).map(({ p, topics, favors }) => {
                const first = topics[0]?.text ?? favors[0]?.text ?? "";
                const more = topics.length + favors.length - 1;
                return (
                  <button type="button" key={p.id} className="week-line" onClick={() => navigate(`/p/${p.id}?tab=manual`)}>
                    <span className="week-when">{p.name}</span>
                    <span className="week-text">{first}{more > 0 ? <span className="muted">（ほか{more}件）</span> : null}</span>
                  </button>
                );
              })}
              {!all && todos.length > 3 && (
                <button type="button" className="text-btn small" onClick={() => setAll(true)}>ほか {todos.length - 3}人を見る</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
