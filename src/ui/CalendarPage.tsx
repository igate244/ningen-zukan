// src/ui/CalendarPage.tsx — 記録タブ：月のカレンダーと、その月の出来事の一覧
//
// カレンダーには、記録・誕生日・命日・イベントがある日に色の点を付ける。
// 日をタップするとその日だけ、もう一度タップすると月全体の一覧に戻る。

import { useMemo, useState } from "react";
import { kaikiLabel, parseDate, toDateStr, today } from "../dates";
import { LOG_KIND_LABEL, type Person } from "../model";
import { navigate } from "../router";
import { alive, useData } from "../store";
import { Avatar, Icon } from "./common";
import { LogsPage } from "./Logs";

type ItemType = "log" | "birthday" | "death" | "event";

interface Item {
  key: string;
  date: string; // YYYY-MM-DD（この月の日付）
  type: ItemType;
  title: string;
  sub?: string;
  persons: Person[];
  to: string;
}

const TYPE_LABEL: Record<ItemType, string> = { log: "記録", birthday: "誕生日", death: "命日", event: "イベント" };
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** その月に起きる出来事をすべて集める */
const monthItems = (persons: Person[], logs: ReturnType<typeof useData>["logs"], y: number, m: number): Item[] => {
  const mm = String(m + 1).padStart(2, "0");
  const ym = `${y}-${mm}`;
  const byId = new Map(persons.map((p) => [p.id, p]));
  const out: Item[] = [];
  const dayOf = (md: string): string => {
    // 2/29 は、うるう年でなければ 2/28 に出す
    if (md === "02-29" && !isLeap(y)) return `${y}-02-28`;
    return `${y}-${md}`;
  };

  for (const p of persons) {
    if (p.birthDate && p.birthDate.slice(5, 7) === mm) {
      const by = Number(p.birthDate.slice(0, 4));
      const n = !p.birthYearUnknown && by > 1000 ? y - by : null;
      out.push({
        key: `b-${p.id}`, date: dayOf(p.birthDate.slice(5, 10)), type: "birthday",
        title: `${p.isSelf ? "自分" : p.name}の誕生日`,
        sub: p.deathDate ? "故人" : n !== null && n >= 0 ? `${n}歳` : undefined,
        persons: [p], to: `/p/${p.id}`,
      });
    }
    if (p.deathDate && p.deathDate.slice(5, 7) === mm) {
      const dy = Number(p.deathDate.slice(0, 4));
      const after = y - dy;
      if (after < 0) continue;
      const kaiki = kaikiLabel(after);
      out.push({
        key: `d-${p.id}`, date: dayOf(p.deathDate.slice(5, 10)), type: "death",
        title: `${p.name}の命日`,
        sub: after === 0 ? "亡くなった日" : `${after}年${kaiki ? `・${kaiki}` : ""}`,
        persons: [p], to: `/p/${p.id}`,
      });
    }
  }

  for (const l of logs) {
    const ps = l.personIds.map((id) => byId.get(id)).filter((p): p is Person => !!p);
    if (l.kind === "event") {
      const first = l.text.split("\n")[0] || "イベント";
      if (l.yearly) {
        if (l.date.slice(5, 7) !== mm || Number(l.date.slice(0, 4)) > y) continue;
        const n = y - Number(l.date.slice(0, 4));
        out.push({ key: `e-${l.id}`, date: dayOf(l.date.slice(5, 10)), type: "event", title: first, sub: n > 0 ? `${n}年目` : "毎年", persons: ps, to: `/log/${l.id}` });
      } else if (l.date.startsWith(ym)) {
        out.push({ key: `e-${l.id}`, date: l.date, type: "event", title: first, persons: ps, to: `/log/${l.id}` });
      }
      continue;
    }
    if (!l.date.startsWith(ym)) continue;
    out.push({
      key: `l-${l.id}`, date: l.date, type: "log",
      title: LOG_KIND_LABEL[l.kind],
      sub: l.text.split("\n")[0] || undefined,
      persons: ps, to: `/log/${l.id}`,
    });
  }

  const order: Record<ItemType, number> = { birthday: 0, death: 1, event: 2, log: 3 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type]);
};

// 画面を離れても見ていた月と表示を覚えておく
const memo = { y: new Date().getFullYear(), m: new Date().getMonth(), mode: "calendar" as "calendar" | "list" };

export const RecordsPage = () => {
  const data = useData();
  const [mode, setModeState] = useState(memo.mode);
  const [ym, setYm] = useState({ y: memo.y, m: memo.m });
  const [day, setDay] = useState<string | null>(null);
  const [filter, setFilter] = useState<ItemType | "all">("all");

  const setMode = (m: typeof mode): void => {
    memo.mode = m;
    setModeState(m);
  };
  const move = (delta: number): void => {
    const d = new Date(ym.y, ym.m + delta, 1);
    memo.y = d.getFullYear();
    memo.m = d.getMonth();
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    setDay(null);
  };
  const goToday = (): void => {
    const d = new Date();
    memo.y = d.getFullYear();
    memo.m = d.getMonth();
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    setDay(today());
  };

  const persons = useMemo(() => alive(data.persons), [data.persons]);
  const logs = useMemo(() => alive(data.logs), [data.logs]);
  const items = useMemo(() => monthItems(persons, logs, ym.y, ym.m), [persons, logs, ym]);
  const byDay = useMemo(() => {
    const map = new Map<string, Set<ItemType>>();
    for (const it of items) map.set(it.date, new Set([...(map.get(it.date) ?? []), it.type]));
    return map;
  }, [items]);

  const shown = items.filter((it) => (filter === "all" || it.type === filter) && (!day || it.date === day));
  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of shown) map.set(it.date, [...(map.get(it.date) ?? []), it]);
    return [...map.entries()];
  }, [shown]);

  // カレンダーのマス（前月の余白も含めて 7 の倍数）
  const first = new Date(ym.y, ym.m, 1);
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: Array<string | null> = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => toDateStr(new Date(ym.y, ym.m, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const todayStr = today();

  const modeSeg = (
    <div className="segment" style={{ marginTop: 0, position: "static", marginBottom: 6 }}>
      <button type="button" className={mode === "calendar" ? "on" : ""} onClick={() => setMode("calendar")}>カレンダー</button>
      <button type="button" className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}>記録の一覧</button>
    </div>
  );

  return (
    <>
      {mode === "list" ? (
        <LogsPage header={modeSeg} />
      ) : (
        <>
          <div className="sticky-head">
          {modeSeg}
          <div className="cal-head">
            <button type="button" className="icon-btn" aria-label="前の月" onClick={() => move(-1)}><Icon name="back" /></button>
            <div className="cal-title">{ym.y}年{ym.m + 1}月</div>
            <button type="button" className="icon-btn" aria-label="次の月" onClick={() => move(1)} style={{ transform: "scaleX(-1)" }}><Icon name="back" /></button>
            <button type="button" className="chip" style={{ marginLeft: "auto" }} onClick={goToday}>今日</button>
          </div>
          </div>

          <div className="cal card">
            {WEEK.map((w, i) => (
              <div key={w} className={`cal-week ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>{w}</div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={`x${i}`} className="cal-cell empty" />;
              const types = byDay.get(d);
              const dow = i % 7;
              return (
                <button type="button" key={d}
                  className={`cal-cell ${d === todayStr ? "today" : ""} ${d === day ? "sel" : ""} ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}`}
                  onClick={() => setDay(day === d ? null : d)}>
                  <span className="cal-num">{parseDate(d)!.getDate()}</span>
                  <span className="cal-dots">
                    {(["birthday", "death", "event", "log"] as ItemType[]).filter((t) => types?.has(t)).map((t) => (
                      <i key={t} className={`dot-${t}`} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="cal-legend">
            {(["birthday", "death", "event", "log"] as ItemType[]).map((t) => (
              <span key={t}><i className={`dot-${t}`} />{TYPE_LABEL[t]}</span>
            ))}
          </div>

          <div className="chips">
            <button type="button" className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>すべて</button>
            {(["log", "birthday", "death", "event"] as ItemType[]).map((t) => (
              <button type="button" key={t} className={`chip ${filter === t ? "on" : ""}`} onClick={() => setFilter(filter === t ? "all" : t)}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="toolbar">
            <span className="count">
              {day ? `${parseDate(day)!.getMonth() + 1}月${parseDate(day)!.getDate()}日` : `${ym.m + 1}月`}の出来事 {shown.length}件
            </span>
            {day && <button type="button" className="text-btn small" onClick={() => setDay(null)}>月全体を見る</button>}
          </div>

          {groups.length === 0 ? (
            <div className="empty">この{day ? "日" : "月"}の出来事はまだありません</div>
          ) : (
            groups.map(([date, list]) => {
              const d = parseDate(date)!;
              return (
                <div key={date}>
                  <div className="month">
                    {d.getMonth() + 1}月{d.getDate()}日（{WEEK[d.getDay()]}）{date === todayStr ? " ・ 今日" : ""}
                  </div>
                  <div className="list card">
                    {list.map((it) => (
                      <button type="button" key={it.key} className="row" onClick={() => navigate(it.to)}>
                        <span className={`type-badge t-${it.type}`}>{TYPE_LABEL[it.type]}</span>
                        <div className="row-main">
                          <div className="row-name">{it.title}</div>
                          {it.sub && <div className="row-sub">{it.sub}</div>}
                        </div>
                        <div className="avatar-stack">
                          {it.persons.slice(0, 3).map((p) => <Avatar key={p.id} person={p} size={26} />)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          <div className="fab-row">
            <button type="button" className="fab fab-sub" onClick={() => navigate(`/log/new?k=event${day ? `&d=${day}` : ""}`)}>
              ＋ イベント
            </button>
            <button type="button" className="fab" onClick={() => navigate(`/log/new${day ? `?d=${day}` : ""}`)}>
              <Icon name="pen" size={18} /> 記録する
            </button>
          </div>
        </>
      )}
    </>
  );
};
