// src/ui/PeopleList.tsx — 人物一覧（検索・絞り込み・並べ替え）

import { useMemo, useRef, useState } from "react";
import { daysSince, daysToBirthday, sinceLabel } from "../dates";
import { CATEGORIES, CATEGORY_LABEL, type Category, type Person } from "../model";
import { navigate } from "../router";
import { alive, lastMetMap, useData } from "../store";
import { Avatar, Icon, personSub } from "./common";
import { ThisWeek } from "./ThisWeek";

type Sort = "birthday" | "kana" | "recent" | "stale" | "added";

const SORT_LABEL: Record<Sort, string> = {
  birthday: "誕生日が近い順",
  kana: "名前順",
  recent: "最近会った順",
  stale: "ご無沙汰順",
  added: "追加した順",
};

// 一覧の状態は画面を離れても覚えておく（詳細から戻ったときに検索がリセットされないように）
const memo = { q: "", cat: "all" as Category | "all", sort: "birthday" as Sort, tag: "", group: "" };

export const PeopleList = () => {
  const data = useData();
  const [q, setQ] = useState(memo.q);
  const [cat, setCat] = useState<Category | "all">(memo.cat);
  const [sort, setSort] = useState<Sort>(memo.sort);
  const [tag, setTag] = useState(memo.tag);
  const [group, setGroup] = useState(memo.group);
  const [filterOpen, setFilterOpen] = useState(false);
  Object.assign(memo, { q, cat, sort, tag, group });
  const groups = useMemo(() => alive(data.groups ?? []), [data.groups]);

  const lastMet = useMemo(() => lastMetMap(data), [data]);
  const persons = useMemo(() => alive(data.persons).filter((p) => !p.isSelf), [data.persons]);
  const allTags = useMemo(() => [...new Set(persons.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, "ja")), [persons]);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const hit = (p: Person): boolean =>
      !query ||
      [p.name, p.kana, p.nickname, p.org, p.dept, p.note, p.likes, p.metHow, ...p.tags].some((s) => s?.toLowerCase().includes(query));
    const filtered = persons.filter((p) => (cat === "all" || p.category === cat) && (!tag || p.tags.includes(tag)) && (!group || p.groups.includes(group)) && hit(p));
    const byKana = (a: Person, b: Person): number => (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
    return filtered.sort((a, b) => {
      if (sort !== "kana" && !!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      const la = lastMet.get(a.id) ?? "";
      const lb = lastMet.get(b.id) ?? "";
      switch (sort) {
        case "birthday": {
          // 誕生日が未登録の人は最後に回す
          const da = a.deathDate ? 10000 : daysToBirthday(a.birthDate) ?? 9999;
          const db = b.deathDate ? 10000 : daysToBirthday(b.birthDate) ?? 9999;
          return da - db || byKana(a, b);
        }
        case "recent":
          return la === lb ? byKana(a, b) : lb.localeCompare(la);
        case "stale":
          // 一度も記録が無い人は最後に回す
          if (!la || !lb) return la ? -1 : lb ? 1 : byKana(a, b);
          return la === lb ? byKana(a, b) : la.localeCompare(lb);
        case "added":
          return b.createdAt - a.createdAt;
        default:
          return byKana(a, b);
      }
    });
  }, [persons, q, cat, tag, group, sort, lastMet]);

  const birthdayLabel = (p: Person): string => {
    if (p.deathDate) return "故人";
    const d = daysToBirthday(p.birthDate);
    if (d === null) return "";
    if (d === 0) return "今日が誕生日";
    if (d === 1) return "明日が誕生日";
    return `誕生日まで${d}日`;
  };

  return (
    <>
      <ThisWeek data={data} persons={persons} />
      <div className="sticky-head">
      <input className="search" type="search" placeholder="名前・所属・タグで検索" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="chips">
        <button type="button" className={`chip ${cat === "all" ? "on" : ""}`} onClick={() => setCat("all")}>
          すべて
        </button>
        {CATEGORIES.map((c) => (
          <button type="button" key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(cat === c ? "all" : c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      {(groups.length > 0 || allTags.length > 0) && (
        <div className="chips">
          <button type="button" className={`chip ${group || tag ? "" : "ghost"}`} onClick={() => setFilterOpen(true)}>
            ＋ グループ・タグで絞る
          </button>
          {group && (
            <button type="button" className="chip on" onClick={() => setGroup("")}>{groups.find((g) => g.id === group)?.name ?? "グループ"} ×</button>
          )}
          {tag && <button type="button" className="chip on" onClick={() => setTag("")}>#{tag} ×</button>}
        </div>
      )}

      <div className="toolbar">
        <span className="count">{list.length}人</span>
        <select className="select-plain" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      </div>

      {persons.length === 0 ? (
        <div className="empty">
          まだ誰も登録されていません。
          <br />
          右下の「＋ 人を追加」から始めよう。
        </div>
      ) : list.length === 0 ? (
        <div className="empty">該当する人がいません</div>
      ) : (
        <div className="list card">
          {list.map((p, i) => {
            const met = lastMet.get(p.id);
            const days = daysSince(met);
            const head = sort === "kana" && (i === 0 || rowOf(list[i - 1]) !== rowOf(p)) ? rowOf(p) : undefined;
            return (
              <button type="button" key={p.id} className="row" data-index={head} onClick={() => navigate(`/p/${p.id}`)}>
                <Avatar person={p} size={42} />
                <div className="row-main">
                  <div className="row-name">
                    {p.pinned && (
                      <span style={{ color: "var(--warn)", marginRight: 4, verticalAlign: -2 }}>
                        <Icon name="star" size={13} fill />
                      </span>
                    )}
                    {p.name}
                  </div>
                  <div className="row-sub">{personSub(p, groups)}</div>
                </div>
                {sort === "birthday" ? (
                  <div className={`row-side ${(daysToBirthday(p.birthDate) ?? 99) <= 7 ? "soon" : ""}`}>{birthdayLabel(p)}</div>
                ) : (
                  <div className={`row-side ${days !== null && days > 90 ? "stale" : ""}`}>{met ? sinceLabel(met) : ""}</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {sort === "kana" && list.length > 20 && <KanaIndex present={new Set(list.map(rowOf))} />}

      {filterOpen && (
        <div className="sheet-back" onClick={() => setFilterOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>グループ・タグで絞る</h2>
              <button type="button" className="text-btn" onClick={() => setFilterOpen(false)}>閉じる</button>
            </div>
            <div className="sheet-body">
              {groups.length > 0 && (
                <>
                  <div className="picker-head">グループ</div>
                  <div className="token-box flat">
                    {groups.map((g) => {
                      const n = persons.filter((p) => p.groups.includes(g.id)).length;
                      return (
                        <button type="button" key={g.id} className={`chip ${group === g.id ? "on" : ""}`}
                          onClick={() => { setGroup(group === g.id ? "" : g.id); setFilterOpen(false); }}>
                          {g.name} <span className="muted small">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {allTags.length > 0 && (
                <>
                  <div className="picker-head">タグ</div>
                  <div className="token-box flat">
                    {allTags.map((t) => (
                      <button type="button" key={t} className={`chip ${tag === t ? "on" : ""}`}
                        onClick={() => { setTag(tag === t ? "" : t); setFilterOpen(false); }}>
                        #{t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <button type="button" className="fab" onClick={() => navigate("/new")}>
        <Icon name="plus" size={18} /> 人を追加
      </button>
    </>
  );
};

// ------------------------------------------------------------ 50 音の早送り

const ROWS = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"];
const ROW_START = "あかさたなはまやらわ";
const ROW_KANA = ["あいうえおぁぃぅぇぉゔ", "かきくけこがぎぐげご", "さしすせそざじずぜぞ", "たちつてとだぢづでどっ", "なにぬねの", "はひふへほばびぶべぼぱぴぷぺぽ", "まみむめも", "やゆよゃゅょ", "らりるれろ", "わをんゎ"];

/** その人が 50 音のどの行か（ふりがな → 名前の順に見て、かなでなければ「他」） */
export const rowOf = (p: Pick<Person, "kana" | "name">): string => {
  const c0 = [...(p.kana || p.name).trim()][0] ?? "";
  // カタカナはひらがなに
  const c = c0 >= "ァ" && c0 <= "ヶ" ? String.fromCharCode(c0.charCodeAt(0) - 0x60) : c0;
  const i = ROW_KANA.findIndex((row) => row.includes(c));
  return i >= 0 ? ROW_START[i] : /[a-zA-Z]/.test(c) ? "A" : "他";
};

const KanaIndex = ({ present }: { present: Set<string> }) => {
  const bar = useRef<HTMLDivElement>(null);
  const keys = [...ROWS, "A", "他"];
  const jump = (k: string): void => {
    // その行の人がいなければ、次にいる行へ
    const from = keys.indexOf(k);
    const hit = keys.slice(from).find((x) => present.has(x)) ?? keys.slice(0, from).reverse().find((x) => present.has(x));
    if (!hit) return;
    document.querySelector(`[data-index="${hit}"]`)?.scrollIntoView({ block: "start" });
  };
  const fromPoint = (x: number, y: number): void => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const k = el?.dataset?.key;
    if (k) jump(k);
  };
  return (
    <div className="kana-index" ref={bar}
      onPointerDown={(e) => { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); fromPoint(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") fromPoint(e.clientX, e.clientY); }}>
      {keys.map((k) => (
        <span key={k} data-key={k} className={present.has(k) ? "" : "dim"}>{k}</span>
      ))}
    </div>
  );
};
