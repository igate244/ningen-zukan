// src/ui/Groups.tsx — グループ（同期・クラス・部署・サークルなど）の一覧・詳細・編集
//
// グループはこのアプリの入口。開くとメンバーのカード・予定・記録が見られ、
// 「このグループで記録」「まとめて登録」で入力もここから始められる。

import { useEffect, useMemo, useState } from "react";
import { age, daysToBirthday, formatDate, formatMonthDay, kaikiLabel, sinceLabel } from "../dates";
import {
  type Category, CATEGORIES, CATEGORY_LABEL, GROUP_COLORS, GROUP_KINDS, GROUP_KIND_LABEL, type Group, type GroupKind, LOG_KIND_LABEL,
  type Person, emptyPerson, joinName, newId, selfLabel, splitName,
} from "../model";
import { navigate } from "../router";
import { alive, deleteGroup, getData, lastMetMap, saveGroup, savePerson, setGroupMembers, useData } from "../store";
import { Avatar, Field, Icon, PersonPicker, TopBar } from "./common";
import { GroupMark, categoryForGroup, markGroupOpened, membersOf, nextBirthdayIn, sortGroups } from "./groupUtil";
import { OrgPage } from "./OrgPage";

// ------------------------------------------------------------------ 一覧

export const GroupsPage = () => {
  const data = useData();
  const [creating, setCreating] = useState(false);
  const groups = useMemo(() => sortGroups(alive(data.groups ?? [])), [data.groups]);

  return (
    <>
      {groups.length === 0 ? (
        <div className="card fieldset small muted">
          「2015年入社の同期」「〇〇小 6年2組」「釣り仲間」のように人をまとめよう。グループを開くと、メンバーのカード・誕生日・記録がまとめて見られます。
        </div>
      ) : (
        <div className="gcards">
          {groups.map((g) => {
            const ms = membersOf(data, g.id);
            const bd = nextBirthdayIn(ms, 14);
            return (
              <button type="button" key={g.id} className="gcard" onClick={() => navigate(`/g/${g.id}`)}
                style={g.color ? { borderColor: `color-mix(in srgb, ${g.color} 55%, var(--line))` } : undefined}>
                <div className="gcard-top">
                  <GroupMark group={g} size={38} />
                  {g.pinned && <span className="gcard-pin"><Icon name="star" size={13} fill /></span>}
                </div>
                <div className="gcard-name">{g.name}</div>
                <div className="gcard-sub">{ms.length}人{g.period ? ` ・ ${g.period}` : ""}</div>
                <div className="avatar-stack" style={{ marginLeft: 6, marginTop: 6 }}>
                  {ms.slice(0, 5).map((p) => <Avatar key={p.id} person={p} size={22} />)}
                </div>
                {bd && <div className="gcard-bd">🎂 {bd.d === 0 ? "今日" : bd.d === 1 ? "明日" : `あと${bd.d}日`} {bd.p.name}</div>}
              </button>
            );
          })}
        </div>
      )}

      <div className="section-title" style={{ marginTop: 22 }}>会社・部署（所属から自動）</div>
      <OrgPage />

      <button type="button" className="fab" onClick={() => setCreating(true)}>
        <Icon name="plus" size={18} /> グループを作る
      </button>
      {creating && (
        <GroupEditSheet
          onClose={() => setCreating(false)}
          onSaved={(g) => {
            setCreating(false);
            navigate(`/g/${g.id}`);
          }}
        />
      )}
    </>
  );
};

// ------------------------------------------------------------------ 編集

export const GroupEditSheet = ({ group, onClose, onSaved }: { group?: Group; onClose: () => void; onSaved?: (g: Group) => void }) => {
  const [name, setName] = useState(group?.name ?? "");
  const [kind, setKind] = useState<GroupKind>(group?.kind ?? "other");
  const [period, setPeriod] = useState(group?.period ?? "");
  const [note, setNote] = useState(group?.note ?? "");
  const [emoji, setEmoji] = useState(group?.emoji ?? "");
  const [color, setColor] = useState<string | undefined>(group?.color);
  const [pinned, setPinned] = useState(!!group?.pinned);

  const save = async (): Promise<void> => {
    if (!name.trim()) return;
    const g = await saveGroup({
      ...(group ?? { id: newId() }),
      name: name.trim(), kind, period: period.trim() || undefined, note: note.trim() || undefined,
      // 絵文字は 1 文字だけ（日本語入力の途中で切らないよう、保存のときにそろえる）
      emoji: [...emoji.trim()][0] || undefined,
      color, pinned,
    });
    onSaved?.(g);
    onClose();
  };

  const preview: Group = { ...(group ?? { id: "x", createdAt: 0, updatedAt: 0 }), name, kind, emoji: [...emoji.trim()][0], color };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{group ? "グループを編集" : "グループを作る"}</h2>
          <button type="button" className="text-btn" disabled={!name.trim()} onClick={() => void save()}>保存</button>
        </div>
        <div className="sheet-body">
          <div className="form">
            <Field label="名前">
              <input className="input" autoFocus={!group} value={name} onChange={(e) => setName(e.target.value)} placeholder="2015年入社の同期 / 〇〇小 6年2組 など" enterKeyHint="done" />
            </Field>
            <Field label="目印">
              <div className="mark-row">
                <GroupMark group={preview} size={44} />
                <input className="input" style={{ width: 70, textAlign: "center" }} value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="絵文字" />
                <div className="color-row">
                  {GROUP_COLORS.map((c) => (
                    <button type="button" key={c} className={`color-dot ${color === c ? "on" : ""}`} style={{ background: c }}
                      aria-label="色" onClick={() => setColor(color === c ? undefined : c)} />
                  ))}
                </div>
              </div>
            </Field>
            <label className="frow frow-switch" style={{ borderRadius: 12, border: "1px solid var(--line)" }}>
              <span className="frow-label">よく見る</span>
              <span className="small muted grow">人物タブの上とグループ一覧の先頭に出す</span>
              <input type="checkbox" className="switch" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            </label>
            <Field label="種類">
              <div className="chips" style={{ paddingTop: 0, flexWrap: "wrap" }}>
                {GROUP_KINDS.map((k) => (
                  <button type="button" key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{GROUP_KIND_LABEL[k]}</button>
                ))}
              </div>
            </Field>
            <Field label="いつ頃の仲間か（任意）">
              <input className="input" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2004〜2010 / 中学のとき など" />
            </Field>
            <Field label="メモ（任意）">
              <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <button type="button" className="btn primary" disabled={!name.trim()} onClick={() => void save()}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ 詳細

type Tab = "members" | "upcoming" | "logs";
const TAB_LABEL: Record<Tab, string> = { members: "メンバー", upcoming: "予定・約束", logs: "記録" };
type Sort = "role" | "age" | "stale" | "name";
const SORT_LABEL: Record<Sort, string> = { role: "役割順", age: "年齢順", stale: "ご無沙汰順", name: "名前順" };
const view = new Map<string, { tab: Tab; sort: Sort }>();

export const GroupDetail = ({ id }: { id: string }) => {
  const data = useData();
  const group = (data.groups ?? []).find((g) => g.id === id && !g.deleted);
  const saved = view.get(id) ?? { tab: "members" as Tab, sort: "role" as Sort };
  const [tab, setTabState] = useState<Tab>(saved.tab);
  const [sort, setSortState] = useState<Sort>(saved.sort);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [roleMode, setRoleMode] = useState(false);
  // グループを変える人
  const [moving, setMoving] = useState<string | null>(null);
  const members = useMemo(() => membersOf(data, id), [data, id]);
  const lastMet = useMemo(() => lastMetMap(data), [data]);

  useEffect(() => markGroupOpened(id), [id]);
  const setTab = (t: Tab): void => { view.set(id, { tab: t, sort }); setTabState(t); };
  const setSort = (s: Sort): void => { view.set(id, { tab, sort: s }); setSortState(s); };

  const sorted = useMemo(() => {
    const byName = (a: Person, b: Person): number => (a.kana || a.name).localeCompare(b.kana || b.name, "ja");
    const role = (p: Person): string => p.groupRoles[id] ?? "";
    return [...members].sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      switch (sort) {
        case "role": {
          // 役割のある人を先に（同じ役割どうしはまとめる）
          const ra = role(a);
          const rb = role(b);
          if (!!ra !== !!rb) return ra ? -1 : 1;
          return ra.localeCompare(rb, "ja") || byName(a, b);
        }
        case "age": {
          const da = a.birthYearUnknown ? "9999" : a.birthDate ?? "9999";
          const db = b.birthYearUnknown ? "9999" : b.birthDate ?? "9999";
          return da.localeCompare(db) || byName(a, b);
        }
        case "stale": {
          const la = lastMet.get(a.id) ?? "";
          const lb = lastMet.get(b.id) ?? "";
          if (!la || !lb) return la ? 1 : lb ? -1 : byName(a, b);
          return la.localeCompare(lb) || byName(a, b);
        }
        default:
          return byName(a, b);
      }
    });
  }, [members, sort, id, lastMet]);

  if (!group) {
    return (
      <>
        <TopBar title="" back="/groups" />
        <div className="empty">このグループは見つかりません</div>
      </>
    );
  }

  const remove = async (): Promise<void> => {
    if (!window.confirm(`グループ「${group.name}」を削除しますか？（人は消えません）`)) return;
    await deleteGroup(id);
    navigate("/groups", true);
  };

  const setRole = (p: Person, role: string): void => {
    const cur = p.groupRoles[id] ?? "";
    if (cur === role.trim()) return;
    const roles = { ...p.groupRoles };
    if (role.trim()) roles[id] = role.trim();
    else delete roles[id];
    void savePerson({ ...p, groupRoles: roles });
  };
  const roleSuggest = [...new Set(members.map((m) => m.groupRoles[id]).filter((x): x is string => !!x))];

  return (
    <>
      <TopBar
        title={group.name}
        back="/groups"
        right={
          <button type="button" className="icon-btn" aria-label="編集" onClick={() => setEditing(true)}>
            <Icon name="edit" />
          </button>
        }
      />
      <main className="main">
        <div className="ghero">
          <GroupMark group={group} size={56} />
          <div className="grow">
            <div className="ghero-name">{group.name}</div>
            <div className="small muted">
              {members.length}人{group.period ? ` ・ ${group.period}` : ""} ・ {GROUP_KIND_LABEL[group.kind]}
            </div>
            {group.note && <div className="small" style={{ marginTop: 4, color: "var(--text-2)" }}>{group.note}</div>}
          </div>
        </div>

        <div className="actions">
          <button type="button" className="btn primary" disabled={!members.length} onClick={() => navigate(`/log/new?g=${id}`)}>
            <Icon name="pen" size={16} /> このグループで記録
          </button>
        </div>
        <div className="actions three" style={{ marginTop: 8 }}>
          <button type="button" className="btn" onClick={() => navigate(`/new?g=${id}`)}>
            <Icon name="plus" size={16} /> 新しい人
          </button>
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> まとめて
          </button>
          <button type="button" className="btn" onClick={() => setPicking(true)}>
            <Icon name="people" size={16} /> 選ぶ
          </button>
        </div>

        <div className="segment">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button type="button" key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
          ))}
        </div>

        {tab === "members" && (
          <>
            <div className="toolbar">
              <select className="select-plain" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {(Object.keys(SORT_LABEL) as Sort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
              </select>
              <button type="button" className="text-btn small" onClick={() => setRoleMode(!roleMode)}>
                {roleMode ? "完了" : "役割・グループを変える"}
              </button>
            </div>
            {members.length === 0 ? (
              <div className="empty">「メンバーを選ぶ」か「まとめて登録」から人を入れよう</div>
            ) : (
              <div className="mcards">
                {sorted.map((p) => {
                  const role = p.groupRoles[id];
                  const bd = p.deathDate ? null : daysToBirthday(p.birthDate);
                  const met = lastMet.get(p.id);
                  const a = p.deathDate ? null : age(p.birthDate, p.birthYearUnknown);
                  const card = (
                    <>
                      <Avatar person={p} size={48} />
                      <div className="mcard-name">{selfLabel(p)}</div>
                      {roleMode ? (
                        <>
                          <input className="mcard-role-input" defaultValue={role ?? ""} placeholder="役割" list={`roles-${id}`}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => setRole(p, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur(); }} />
                          <button type="button" className="mcard-groups" onClick={() => setMoving(p.id)}>グループ {p.groups.length}</button>
                        </>
                      ) : (
                        role && <div className="mcard-role">{role}</div>
                      )}
                      <div className="mcard-meta">
                        {p.deathDate ? "故人" : bd !== null && bd <= 30 ? <span className="soon">🎂 {bd === 0 ? "今日" : `あと${bd}日`}</span> : a !== null ? `${a}歳` : ""}
                      </div>
                      <div className="mcard-meta">{met ? `記録 ${sinceLabel(met)}` : "記録なし"}</div>
                    </>
                  );
                  return roleMode ? (
                    <div key={p.id} className="mcard">{card}</div>
                  ) : (
                    <button type="button" key={p.id} className="mcard" onClick={() => navigate(`/p/${p.id}`)}>{card}</button>
                  );
                })}
              </div>
            )}
            <datalist id={`roles-${id}`}>{roleSuggest.map((r) => <option key={r} value={r} />)}</datalist>
          </>
        )}

        {tab === "upcoming" && <GroupUpcoming members={members} />}
        {tab === "logs" && <GroupLogs members={members} />}

        <button type="button" className="btn danger" style={{ width: "100%", marginTop: 24 }} onClick={() => void remove()}>
          <Icon name="trash" size={16} /> グループを削除
        </button>
      </main>

      {editing && <GroupEditSheet group={group} onClose={() => setEditing(false)} />}
      {adding && <QuickAddSheet group={group} onClose={() => setAdding(false)} />}
      {moving && <MembershipSheet personId={moving} onClose={() => setMoving(null)} />}
      {picking && (
        <PersonPicker
          title={`「${group.name}」のメンバー`}
          multiple
          includeSelf
          selected={members.map((m) => m.id)}
          onDone={(ids) => {
            void setGroupMembers(id, ids);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
};

// ------------------------------------------------------------ 予定・約束

const GroupUpcoming = ({ members }: { members: Person[] }) => {
  const DAYS = 60;
  const items = useMemo(() => {
    const out: Array<{ key: string; d: number; text: string; to: string }> = [];
    const now = new Date();
    for (const p of members) {
      if (p.birthDate && !p.deathDate) {
        const d = daysToBirthday(p.birthDate);
        const a = age(p.birthDate, p.birthYearUnknown);
        if (d !== null && d <= DAYS) out.push({ key: `b${p.id}`, d, text: `${selfLabel(p)}の誕生日${a !== null ? `（${d === 0 ? a : a + 1}歳）` : ""}`, to: `/p/${p.id}` });
      }
      if (p.deathDate) {
        const d = daysToBirthday(p.deathDate);
        if (d !== null && d <= DAYS) {
          const years = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d).getFullYear() - Number(p.deathDate.slice(0, 4));
          const kaiki = years > 0 ? kaikiLabel(years) : null;
          out.push({ key: `d${p.id}`, d, text: `${p.name}の命日${years > 0 ? `（${years}年${kaiki ? `・${kaiki}` : ""}）` : ""}`, to: `/p/${p.id}` });
        }
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }, [members]);
  const todos = members
    .map((p) => ({ p, list: [...p.nextTopics.filter((x) => !x.done).map((x) => x.text), ...p.favors.filter((x) => !x.settled).map((x) => `${x.dir === "got" ? "してもらった" : "してあげた"}：${x.text}`)] }))
    .filter((x) => x.list.length);

  const when = (d: number): string => {
    if (d === 0) return "今日";
    if (d === 1) return "明日";
    const x = new Date();
    x.setDate(x.getDate() + d);
    return formatMonthDay(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`);
  };

  if (!items.length && !todos.length) return <div className="empty">60日以内の誕生日・命日や、済んでいない約束はありません</div>;
  return (
    <>
      {items.length > 0 && (
        <div className="section">
          <div className="section-title">これから60日</div>
          <div className="list card">
            {items.map((it) => (
              <button type="button" key={it.key} className="week-line" style={{ padding: "10px 14px" }} onClick={() => navigate(it.to)}>
                <span className={`week-when ${it.d === 0 ? "today" : ""}`}>{when(it.d)}</span>
                <span className="week-text">{it.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {todos.length > 0 && (
        <div className="section">
          <div className="section-title">約束・話すこと・貸し借り</div>
          <div className="list card">
            {todos.map(({ p, list }) => (
              <button type="button" key={p.id} className="row" onClick={() => navigate(`/p/${p.id}?tab=manual`)}>
                <Avatar person={p} size={32} />
                <div className="row-main">
                  <div className="row-name">{selfLabel(p)}</div>
                  {list.map((t, i) => <div key={i} className="row-sub" style={{ whiteSpace: "normal" }}>・{t}</div>)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

// ------------------------------------------------------------ 記録

const GroupLogs = ({ members }: { members: Person[] }) => {
  const data = useData();
  const ids = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const logs = useMemo(
    () => alive(data.logs).filter((l) => l.personIds.some((x) => ids.has(x))).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 200),
    [data.logs, ids],
  );
  const nameOf = (pid: string): string => {
    const p = data.persons.find((x) => x.id === pid);
    return p ? selfLabel(p) : "?";
  };
  if (!logs.length) return <div className="empty">メンバーとの記録はまだありません。「このグループで記録」から残そう。</div>;
  return (
    <div className="section card">
      {logs.map((l) => {
        const inGroup = l.personIds.filter((x) => ids.has(x));
        return (
          <button type="button" key={l.id} className="log" onClick={() => navigate(`/log/${l.id}`)}>
            <div className="log-head">
              <span>{formatDate(l.date)}</span>
              <span className="log-kind">{LOG_KIND_LABEL[l.kind]}</span>
              {inGroup.length === members.length && members.length > 1 && <span className="log-kind">全員</span>}
            </div>
            <div className="muted small">{inGroup.length > 3 ? `${inGroup.slice(0, 3).map(nameOf).join("、")} ほか${inGroup.length - 3}人` : inGroup.map(nameOf).join("、")}</div>
            {l.text && <div className="log-text">{l.text}</div>}
          </button>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------ まとめて登録

const QuickAddSheet = ({ group, onClose }: { group: Group; onClose: () => void }) => {
  const data = useData();
  const [text, setText] = useState("");
  const [cat, setCat] = useState<Category>(() => categoryForGroup(getData(), group));
  const [busy, setBusy] = useState(false);

  const norm = (x: string): string => x.replace(/[\s　]+/g, "");
  const plan = useMemo(() => {
    const persons = alive(data.persons);
    const seen = new Set<string>();
    return text
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/[\s　]+/g, " "))
      .filter((l) => l && !seen.has(norm(l)) && seen.add(norm(l)))
      .map((name) => {
        const same = persons.filter((p) => norm(p.name) === norm(name));
        if (same.length === 1) {
          return same[0].groups.includes(group.id)
            ? { name, action: "skip" as const, person: same[0] }
            : { name, action: "join" as const, person: same[0] };
        }
        return { name, action: "new" as const, person: undefined, dup: same.length > 1 };
      });
  }, [text, data.persons, group.id]);

  const count = plan.filter((x) => x.action !== "skip").length;

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      for (const it of plan) {
        if (it.action === "join" && it.person) {
          await savePerson({ ...it.person, groups: [...it.person.groups, group.id] });
        } else if (it.action === "new") {
          const sp = splitName(it.name);
          await savePerson({
            ...emptyPerson(),
            name: joinName(sp.family, sp.given),
            familyName: sp.family,
            givenName: sp.given,
            category: cat,
            groups: [group.id],
          });
        }
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>「{group.name}」にまとめて登録</h2>
          <button type="button" className="text-btn" disabled={!count || busy} onClick={() => void run()}>{count ? `${count}人を追加` : "追加"}</button>
        </div>
        <div className="sheet-body">
          <div className="form">
            <Field label="名前（1行に1人）" hint="姓と名は空白で区切ると分けて登録されます。同じ名前の人がもういれば、その人をグループに入れます。">
              <textarea className="textarea" rows={6} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={"山田 太郎\n佐藤 花子\n鈴木"} />
            </Field>
            <Field label="新しく登録する人の区分">
              <div className="chips" style={{ paddingTop: 0 }}>
                {CATEGORIES.map((c) => (
                  <button type="button" key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>
                ))}
              </div>
            </Field>
            {plan.length > 0 && (
              <div className="list card">
                {plan.map((it) => (
                  <div key={it.name} className="row" style={{ cursor: "default" }}>
                    {it.person ? <Avatar person={it.person} size={30} /> : <div className="avatar-blank">新</div>}
                    <div className="row-main">
                      <div className="row-name">{it.name}</div>
                      <div className="row-sub">
                        {it.action === "new" ? (it.dup ? "同じ名前が複数いるので、新しい人として登録" : "新しく登録") : it.action === "join" ? "登録済みの人をグループに追加" : "もうメンバーです"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="btn primary" disabled={!count || busy} onClick={() => void run()}>
              {count ? `${count}人を追加` : "名前を入れてください"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------ 1 人のグループを変える

export const MembershipSheet = ({ personId, onClose }: { personId: string; onClose: () => void }) => {
  const data = useData();
  const person = data.persons.find((p) => p.id === personId && !p.deleted);
  const groups = useMemo(() => sortGroups(alive(data.groups ?? [])), [data.groups]);
  const [creating, setCreating] = useState(false);
  if (!person) return null;

  const toggle = (gid: string): void => {
    const on = person.groups.includes(gid);
    void savePerson({ ...person, groups: on ? person.groups.filter((x) => x !== gid) : [...person.groups, gid] });
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{selfLabel(person)}のグループ</h2>
          <button type="button" className="text-btn" onClick={onClose}>完了</button>
        </div>
        <div className="sheet-body">
          <div className="small muted" style={{ margin: "0 4px 8px" }}>タップで入れる・外す（すぐ保存されます）</div>
          <div className="token-box flat">
            {groups.map((g) => {
              const on = person.groups.includes(g.id);
              return (
                <button type="button" key={g.id} className={`chip ${on ? "on" : ""}`} onClick={() => toggle(g.id)}>
                  {on ? "✓ " : ""}{g.emoji ? `${g.emoji} ` : ""}{g.name}
                </button>
              );
            })}
            <button type="button" className="chip ghost" onClick={() => setCreating(true)}>＋ 新しいグループ</button>
          </div>
        </div>
      </div>
      {creating && (
        <div onClick={(e) => e.stopPropagation()}>
          <GroupEditSheet
            onClose={() => setCreating(false)}
            onSaved={(g) => void savePerson({ ...person, groups: [...person.groups, g.id] })}
          />
        </div>
      )}
    </div>
  );
};
