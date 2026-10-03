// src/ui/PeopleList.tsx — 人物一覧（検索・絞り込み・並べ替え）

import { useMemo, useState } from "react";
import { age, daysSince, daysToBirthday, sinceLabel } from "../dates";
import { CATEGORIES, CATEGORY_LABEL, type Category, type Person } from "../model";
import { navigate } from "../router";
import { alive, lastMetMap, useData } from "../store";
import { Avatar, Icon } from "./common";

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
  Object.assign(memo, { q, cat, sort, tag, group });
  const groups = useMemo(() => alive(data.groups ?? []), [data.groups]);

  const lastMet = useMemo(() => lastMetMap(data), [data]);
  const persons = useMemo(() => alive(data.persons).filter((p) => !p.isSelf), [data.persons]);
  const allTags = useMemo(() => [...new Set(persons.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, "ja")), [persons]);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const hit = (p: Person): boolean =>
      !query ||
      [p.name, p.kana, p.nickname, p.org, p.dept, p.title, p.note, ...p.tags].some((s) => s?.toLowerCase().includes(query));
    const filtered = persons.filter((p) => (cat === "all" || p.category === cat) && (!tag || p.tags.includes(tag)) && (!group || p.groups.includes(group)) && hit(p));
    const byKana = (a: Person, b: Person): number => (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
    return filtered.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      const la = lastMet.get(a.id) ?? "";
      const lb = lastMet.get(b.id) ?? "";
      switch (sort) {
        case "birthday": {
          // 誕生日が未登録の人は最後に回す
          const da = daysToBirthday(a.birthDate) ?? 9999;
          const db = daysToBirthday(b.birthDate) ?? 9999;
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

  // 今日・明日が誕生日の人
  const soon = useMemo(
    () =>
      persons
        .map((p) => ({ p, d: daysToBirthday(p.birthDate) }))
        .filter((x): x is { p: Person; d: number } => x.d !== null && x.d <= 1)
        .sort((a, b) => a.d - b.d),
    [persons],
  );

  const birthdayLabel = (p: Person): string => {
    const d = daysToBirthday(p.birthDate);
    if (d === null) return "";
    if (d === 0) return "今日が誕生日";
    if (d === 1) return "明日が誕生日";
    return `誕生日まで${d}日`;
  };

  return (
    <>
      {soon.length > 0 && (
        <div className="card banner birthday-banner">
          <div className="grow">
            {soon.map(({ p, d }) => {
              const a = age(p.birthDate, p.birthYearUnknown);
              return (
                <button type="button" key={p.id} className="birthday-line" onClick={() => navigate(`/p/${p.id}`)}>
                  <strong>{d === 0 ? "今日" : "明日"}</strong>は <strong>{p.name}</strong> の誕生日
                  {a !== null && <span className="muted">（{d === 0 ? a : a + 1}歳）</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
        {groups.map((g) => (
          <button type="button" key={`g-${g.id}`} className={`chip ${group === g.id ? "on" : ""}`} onClick={() => setGroup(group === g.id ? "" : g.id)}>
            {g.name}
          </button>
        ))}
        {allTags.map((t) => (
          <button type="button" key={`t-${t}`} className={`chip ${tag === t ? "on" : ""}`} onClick={() => setTag(tag === t ? "" : t)}>
            #{t}
          </button>
        ))}
      </div>

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
          {list.map((p) => {
            const met = lastMet.get(p.id);
            const days = daysSince(met);
            return (
              <button type="button" key={p.id} className="row" onClick={() => navigate(`/p/${p.id}`)}>
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
                  <div className="row-sub">{[p.org, p.dept, p.title].filter(Boolean).join(" ・ ") || CATEGORY_LABEL[p.category]}</div>
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

      <button type="button" className="fab" onClick={() => navigate("/new")}>
        <Icon name="plus" size={18} /> 人を追加
      </button>
    </>
  );
};
