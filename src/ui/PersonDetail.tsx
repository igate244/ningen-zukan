// src/ui/PersonDetail.tsx — 1 人のページ（概要 / 取説 / 記録 / つながり）

import { type ReactNode, useMemo, useState } from "react";
import { age, ageAtDeath, daysToBirthday, formatDate, formatMonthDay, sinceLabel, today } from "../dates";
import {
  CATEGORY_LABEL, type CheckItem, type Favor, GENDER_LABEL, LOG_KIND_LABEL, type Person, RELATION_CHOICES, type RelType,
  newId, type Mood, MOODS, MOOD_LABEL, type Relation, relationLabelFrom, selfLabel,
} from "../model";
import { navigate } from "../router";
import { alive, deleteRelation, lastMetMap, saveRelation, savePerson, useData } from "../store";
import { Avatar, Field, Icon, PersonPicker, TopBar } from "./common";
import { GraphView } from "./GraphView";
import { RelationRadar } from "./Radar";
import { buildCombined } from "../graph";
import {
  childLabel, childrenOf, exSpousesOf, familyIndex, kinLabel, parentLabel, parentsOf, siblingLabel, siblingsOf,
  spouseLabel, spousesOf,
} from "../family";

type Tab = "info" | "manual" | "logs" | "links";
const TAB_LABEL: Record<Tab, string> = { info: "概要", manual: "取説", logs: "記録", links: "つながり" };
const lastTab = new Map<string, Tab>();

const KV = ({ items }: { items: Array<[string, ReactNode | undefined, boolean?]> }) => {
  const shown = items.filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (shown.length === 0) return null;
  return (
    <div className="kv card">
      {shown.map(([k, v, warn]) => (
        <div className="kv-item" key={k}>
          <div className="kv-label">{k}</div>
          <div className={`kv-value ${warn ? "warn" : ""}`}>{v}</div>
        </div>
      ))}
    </div>
  );
};

export const PersonDetail = ({ id, initialTab }: { id: string; initialTab?: string }) => {
  const data = useData();
  const person = data.persons.find((p) => p.id === id && !p.deleted);
  const [tab, setTabState] = useState<Tab>((initialTab && initialTab in TAB_LABEL ? (initialTab as Tab) : undefined) ?? lastTab.get(id) ?? "info");
  const setTab = (t: Tab): void => {
    lastTab.set(id, t);
    setTabState(t);
  };

  const lastMet = useMemo(() => lastMetMap(data).get(id), [data, id]);

  if (!person) {
    return (
      <>
        <TopBar title="" back="/" />
        <div className="empty">この人は見つかりません（削除された可能性があります）</div>
      </>
    );
  }

  const sub = [person.org, person.dept, person.title].filter(Boolean).join(" ・ ");

  return (
    <>
      <TopBar
        title={person.name}
        back="/"
        right={
          <button type="button" className="icon-btn" aria-label="編集" onClick={() => navigate(`/p/${id}/edit`)}>
            <Icon name="edit" />
          </button>
        }
      />
      <main className="main">
        <div className="hero">
          <Avatar person={person} size={96} />
          <div className="hero-name">{person.name}</div>
          {person.kana && <div className="hero-kana">{person.kana}</div>}
          {sub && <div className="hero-sub">{sub}</div>}
          <div className="badges">
            {!person.isSelf && <span className="badge accent">{CATEGORY_LABEL[person.category]}</span>}
            {person.gender && <span className="badge">{GENDER_LABEL[person.gender]}</span>}
            {person.deathDate && <span className="badge">故人</span>}
            {person.groups.map((gid) => {
              const g = (data.groups ?? []).find((x) => x.id === gid && !x.deleted);
              return g ? (
                <button type="button" className="badge accent link" key={gid} onClick={() => navigate(`/g/${gid}`)}>{g.name}</button>
              ) : null;
            })}
            {person.tags.map((t) => (
              <span className="badge" key={t}>#{t}</span>
            ))}
            {lastMet && <span className="badge">最後の記録 {sinceLabel(lastMet)}</span>}
          </div>
        </div>

        <div className="actions">
          <button type="button" className="btn primary" onClick={() => navigate(`/log/new?p=${id}`)}>
            <Icon name="pen" size={16} /> 記録する
          </button>
          <button type="button" className="btn" onClick={() => navigate(`/map?c=${id}`)}>
            <Icon name="map" size={16} /> 相関図
          </button>
        </div>

        <div className="segment">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button type="button" key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {tab === "info" && <InfoTab person={person} />}
        {tab === "manual" && <ManualTab person={person} />}
        {tab === "logs" && <LogsTab person={person} />}
        {tab === "links" && <LinksTab person={person} />}
      </main>
    </>
  );
};

// ---------------------------------------------------------------------- 概要

const InfoTab = ({ person: p }: { person: Person }) => {
  const a = p.deathDate ? null : age(p.birthDate, p.birthYearUnknown);
  const kyonen = ageAtDeath(p.birthDate, p.deathDate, p.birthYearUnknown);
  const death = p.deathDate ? `${formatDate(p.deathDate)}${kyonen !== null ? `（享年${kyonen}）` : ""}` : undefined;
  const until = daysToBirthday(p.birthDate);
  const birth = p.birthDate
    ? `${p.birthYearUnknown ? formatMonthDay(p.birthDate) : formatDate(p.birthDate)}${a !== null ? `（${a}歳）` : ""}${
        until !== null ? ` ・ ${until === 0 ? "今日！" : `あと${until}日`}` : ""
      }`
    : undefined;
  const empty = !birth && !p.metDate && !p.metHow && !p.phone && !p.email && !p.sns && !p.note && p.careers.length === 0;

  return (
    <>
      {!p.isSelf && (
        <div className="section">
          <div className="section-title">自分との関係</div>
          <RelationRadar person={p} />
        </div>
      )}
      <FamilySection person={p} />
      <div className="section">
        <KV
          items={[
            ["誕生日", birth],
            ["命日", death],
            ["出会い", [p.metDate ? formatDate(p.metDate) : "", p.metHow].filter(Boolean).join(" ・ ") || undefined],
            ["電話", p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : undefined],
            ["メール", p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : undefined],
            ["SNS・その他", p.sns],
            ["メモ", p.note],
          ]}
        />
      </div>
      {p.careers.length > 0 && (
        <div className="section">
          <div className="section-title">所属の履歴</div>
          <div className="kv card">
            {[...p.careers]
              .sort((x, y) => (y.from ?? "").localeCompare(x.from ?? ""))
              .map((c) => (
                <div className="kv-item" key={c.id}>
                  <div className="kv-label">
                    {c.from ?? "?"} 〜 {c.to ?? ""}
                  </div>
                  <div className="kv-value">{[c.org, c.dept, c.title].filter(Boolean).join(" ・ ")}</div>
                </div>
              ))}
          </div>
        </div>
      )}
      {empty && <div className="empty">右上の編集ボタンから情報を足せます</div>}
    </>
  );
};

// ------------------------------------------------------------------ 家族

type AddKind = "parent" | "child" | "spouse" | "exspouse" | "sibling";
const ADD_LABEL: Record<AddKind, string> = { parent: "親", spouse: "配偶者", child: "子", sibling: "兄弟姉妹", exspouse: "元配偶者" };

const FamilySection = ({ person: p }: { person: Person }) => {
  const data = useData();
  const [adding, setAdding] = useState<AddKind | null>(null);
  const fx = useMemo(() => familyIndex(data), [data]);
  const name = (id: string): string => {
    const x = fx.persons.get(id);
    return x ? (x.isSelf ? selfLabel(x) : x.name) : "?";
  };

  const parents = parentsOf(fx, p.id).sort((a, b) => (fx.persons.get(a)?.gender === "male" ? -1 : 0) - (fx.persons.get(b)?.gender === "male" ? -1 : 0));
  const spouses = spousesOf(fx, p.id);
  const exes = exSpousesOf(fx, p.id);
  const kids = childrenOf(fx, p.id);
  const sibs = siblingsOf(fx, p.id);
  const has = parents.length + spouses.length + exes.length + kids.length + sibs.length > 0;

  // 配偶者がひとりいて、片親しか登録されていない子がいれば、まとめて親にできるようにする
  const partner = spouses.length === 1 ? spouses[0] : null;
  const orphanKids = partner ? kids.filter((k) => parentsOf(fx, k).length === 1) : [];
  const linkPartner = async (): Promise<void> => {
    if (!partner) return;
    for (const k of orphanKids) await saveRelation({ a: partner, b: k, type: "parent" });
  };

  // 「◯◯と◯◯の長男」
  const origin =
    parents.length > 0
      ? `${parents.map(name).join("と")}の${childLabel(fx, parents[0], p.id)}`
      : null;

  const add = async (otherId: string): Promise<void> => {
    if (!adding) return;
    const type: RelType = adding === "child" ? "parent" : adding;
    const [a, b] = adding === "parent" ? [otherId, p.id] : [p.id, otherId];
    await saveRelation({ a, b, type });
    // 子を足したとき、配偶者がひとりなら「その人も親？」と聞く（誰と誰の子かを残すため）
    if (adding === "child") {
      const partners = [...spousesOf(fx, p.id), ...exSpousesOf(fx, p.id)];
      const already = parentsOf(fx, otherId);
      const candidates = partners.filter((s) => !already.includes(s));
      for (const s of candidates) {
        if (window.confirm(`${name(s)} もこの子の親として登録しますか？`)) {
          await saveRelation({ a: s, b: otherId, type: "parent" });
          break;
        }
      }
    }
    setAdding(null);
  };

  const Row = ({ id, label, extra }: { id: string; label: string; extra?: string }) => {
    const x = fx.persons.get(id);
    return (
      <button type="button" className="row" onClick={() => navigate(`/p/${id}`)}>
        <Avatar person={x} size={32} />
        <div className="row-main">
          <div className="row-name">{name(id)}</div>
          {extra && <div className="row-sub">{extra}</div>}
        </div>
        <span className="badge">{label}</span>
      </button>
    );
  };

  return (
    <div className="section">
      <div className="section-title">家族</div>
      {has && (
        <div className="list card">
          {origin && <div className="kv-item small" style={{ color: "var(--text-2)" }}>{origin}</div>}
          {parents.map((id) => <Row key={id} id={id} label={parentLabel(fx.persons.get(id))} />)}
          {spouses.map((id) => <Row key={id} id={id} label={spouseLabel(fx.persons.get(id))} />)}
          {exes.map((id) => <Row key={id} id={id} label={spouseLabel(fx.persons.get(id), true)} />)}
          {sibs.map((s) => <Row key={s.id} id={s.id} label={siblingLabel(fx, p.id, s)} />)}
          {kids.map((id) => {
            const other = parentsOf(fx, id).filter((x) => x !== p.id);
            return <Row key={id} id={id} label={childLabel(fx, p.id, id)} extra={other.length ? `${other.map(name).join("・")}との子` : undefined} />;
          })}
        </div>
      )}
      {partner && orphanKids.length > 0 && (
        <div className="card banner" style={{ marginTop: 8 }}>
          <span className="grow small">
            {orphanKids.map(name).join("、")} の親に {name(partner)} が入っていません
          </span>
          <button type="button" className="text-btn small" onClick={() => void linkPartner()}>
            {name(partner)}も親にする
          </button>
        </div>
      )}
      <div className="chips" style={{ flexWrap: "wrap" }}>
        {(Object.keys(ADD_LABEL) as AddKind[]).map((k) => (
          <button type="button" key={k} className="chip" onClick={() => setAdding(k)}>＋ {ADD_LABEL[k]}</button>
        ))}
      </div>
      {adding && (
        <PersonPicker
          title={`${p.isSelf ? "自分" : p.name}の${ADD_LABEL[adding]}`}
          multiple={false}
          includeSelf
          selected={[]}
          excludeIds={[p.id]}
          onDone={(ids) => void (ids[0] ? add(ids[0]) : setAdding(null))}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------- 取説

const ManualTab = ({ person: p }: { person: Person }) => {
  const [topic, setTopic] = useState("");
  const [favorText, setFavorText] = useState("");
  const [favorDir, setFavorDir] = useState<Favor["dir"]>("got");

  const update = (patch: Partial<Person>): void => void savePerson({ ...p, ...patch });

  const addTopic = (): void => {
    if (!topic.trim()) return;
    const item: CheckItem = { id: newId(), text: topic.trim(), done: false, createdAt: Date.now() };
    update({ nextTopics: [...p.nextTopics, item] });
    setTopic("");
  };

  const addFavor = (): void => {
    if (!favorText.trim()) return;
    update({ favors: [...p.favors, { id: newId(), dir: favorDir, text: favorText.trim(), date: today(), settled: false }] });
    setFavorText("");
  };

  const openTopics = p.nextTopics.filter((t) => !t.done);
  const doneTopics = p.nextTopics.filter((t) => t.done);

  return (
    <>
      <div className="section">
        <div className="section-title">次に話すこと</div>
        <div className="card">
          {[...openTopics, ...doneTopics].map((t) => (
            <div className="check-row" key={t.id}>
              <input type="checkbox" checked={t.done}
                onChange={() => update({ nextTopics: p.nextTopics.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) })} />
              <span className={`grow ${t.done ? "done" : ""}`}>{t.text}</span>
              <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="消す"
                onClick={() => update({ nextTopics: p.nextTopics.filter((x) => x.id !== t.id) })}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
          <form className="inline-add" onSubmit={(e) => { e.preventDefault(); addTopic(); }}>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="話したいこと・聞きたいことを追加" />
            <button type="submit" className="text-btn" disabled={!topic.trim()}>追加</button>
          </form>
        </div>
      </div>

      <div className="section">
        <KV
          items={[
            ["喜ぶこと・好きなもの", p.likes],
            ["地雷・避けたいこと", p.dislikes, true],
            ["盛り上がる話題", p.topics],
            ["価値観・口ぐせ", p.values],
          ]}
        />
      </div>

      {Object.values(p.work).some(Boolean) && (
        <div className="section">
          <div className="section-title">仕事の取説</div>
          <KV
            items={[
              ["報告・相談の好み", p.work.report],
              ["通じやすい連絡手段", p.work.contact],
              ["つかまりやすい時間", p.work.timing],
              ["何を評価する人か", p.work.evaluates],
              ["得意なこと・頼れること", p.work.strengths],
            ]}
          />
        </div>
      )}

      {p.learnings && (
        <div className="section">
          <div className="section-title">この人から学んだこと</div>
          <KV items={[["", p.learnings]]} />
        </div>
      )}

      <div className="section">
        <div className="section-title">貸し借り・頼まれごと</div>
        <div className="card">
          {p.favors.map((f) => (
            <div className="check-row" key={f.id}>
              <input type="checkbox" checked={f.settled} title="済んだらチェック"
                onChange={() => update({ favors: p.favors.map((x) => (x.id === f.id ? { ...x, settled: !x.settled } : x)) })} />
              <span className={`grow ${f.settled ? "done" : ""}`}>
                <span className="badge" style={{ marginRight: 6 }}>{f.dir === "got" ? "してもらった" : "してあげた"}</span>
                {f.text}
                {f.date && <span className="muted small">（{formatMonthDay(f.date)}）</span>}
              </span>
              <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="消す"
                onClick={() => update({ favors: p.favors.filter((x) => x.id !== f.id) })}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
          <form className="inline-add" onSubmit={(e) => { e.preventDefault(); addFavor(); }}>
            <select className="select-plain" value={favorDir} onChange={(e) => setFavorDir(e.target.value as Favor["dir"])}>
              <option value="got">してもらった</option>
              <option value="gave">してあげた</option>
            </select>
            <input value={favorText} onChange={(e) => setFavorText(e.target.value)} placeholder="内容" />
            <button type="submit" className="text-btn" disabled={!favorText.trim()}>追加</button>
          </form>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------- 記録

const LogsTab = ({ person }: { person: Person }) => {
  const data = useData();
  const logs = useMemo(
    () => alive(data.logs).filter((l) => l.personIds.includes(person.id)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [data.logs, person.id],
  );
  const nameOf = (pid: string): string => data.persons.find((p) => p.id === pid)?.name ?? "?";

  if (logs.length === 0) return <div className="empty">まだ記録がありません。「記録する」から残そう。</div>;
  return (
    <div className="section card">
      {logs.map((l) => (
        <button type="button" key={l.id} className="log" onClick={() => navigate(`/log/${l.id}`)}>
          <div className="log-head">
            <span>{formatDate(l.date)}</span>
            <span className="log-kind">{LOG_KIND_LABEL[l.kind]}</span>
          </div>
          {l.personIds.length > 1 && (
            <div className="muted small">
              一緒に: {l.personIds.filter((x) => x !== person.id).map(nameOf).join("、")}
            </div>
          )}
          {l.text && <div className="log-text">{l.text}</div>}
        </button>
      ))}
    </div>
  );
};

// ------------------------------------------------------------------ つながり

const LinksTab = ({ person }: { person: Person }) => {
  const data = useData();
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState(RELATION_CHOICES[0].key);
  const [editing, setEditing] = useState<Relation | null>(null);

  const rels = useMemo(
    () => alive(data.relations).filter((r) => r.a === person.id || r.b === person.id),
    [data.relations, person.id],
  );
  const byId = useMemo(() => new Map(data.persons.filter((p) => !p.deleted).map((p) => [p.id, p])), [data.persons]);
  const mini = useMemo(() => buildCombined(data, person.id, 1), [data, person.id]);
  const fx = useMemo(() => familyIndex(data), [data]);

  const add = (otherId: string): void => {
    const c = RELATION_CHOICES.find((x) => x.key === choice) ?? RELATION_CHOICES[0];
    // 「相手は（この人の）◯◯」を a→b の向きに直して保存
    const [a, b] = c.otherIsA ? [otherId, person.id] : [person.id, otherId];
    void saveRelation({ a, b, type: c.type });
    setPicking(false);
  };

  return (
    <>
      <div className="section card" style={{ padding: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <span className="small" style={{ whiteSpace: "nowrap" }}>この人の</span>
        <select className="select" value={choice} onChange={(e) => setChoice(e.target.value)} style={{ flex: 1 }}>
          {RELATION_CHOICES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        <button type="button" className="btn primary" style={{ flex: "none" }} onClick={() => setPicking(true)}>
          を選ぶ
        </button>
      </div>

      {rels.length > 0 && (
        <div className="section">
          <div className="graph-box framed">
            <GraphView graph={mini} centerId={person.id} height={300}
              onTap={(oid) => navigate(oid === person.id ? `/map?c=${oid}` : `/p/${oid}`)} />
          </div>
          <button type="button" className="text-btn small" style={{ marginTop: 4 }} onClick={() => navigate(`/map?c=${person.id}`)}>
            相関図で広く見る →
          </button>
        </div>
      )}

      {rels.length === 0 ? (
        <div className="empty">まだつながりがありません。上で関係を選んで、相手を選ぶと登録されます。</div>
      ) : (
        <div className="section list card">
          {rels.map((r) => {
            const otherId = r.a === person.id ? r.b : r.a;
            const other = byId.get(otherId);
            if (!other) return null;
            return (
              <div className="row" key={r.id} style={{ paddingRight: 6 }}>
                <button type="button" className="row" style={{ padding: 0, border: "none", flex: 1, minWidth: 0 }} onClick={() => navigate(`/p/${other.id}`)}>
                  <Avatar person={other} size={36} />
                  <div className="row-main">
                    <div className="row-name">{other.isSelf ? "自分" : other.name}</div>
                    <div className="row-sub">{(r.labelBy === person.id ? r.label : undefined) ?? kinLabel(fx, person.id, other.id) ?? relationLabelFrom(r, person.id)}{r.mood && r.mood !== "normal" ? ` ・ ${MOOD_LABEL[r.mood]}` : ""}{r.note ? ` ・ ${r.note}` : ""}</div>
                  </div>
                </button>
                <button type="button" className="icon-btn" aria-label="つながりを編集" onClick={() => setEditing(r)}>
                  <Icon name="edit" size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing && <RelationEditSheet rel={editing} viewerId={person.id} onClose={() => setEditing(null)} />}

      {picking && (
        <PersonPicker
          title={`この人の「${RELATION_CHOICES.find((c) => c.key === choice)?.label}」`}
          selected={[]}
          multiple={false}
          includeSelf
          excludeIds={[person.id]}
          onDone={(ids) => ids[0] && add(ids[0])}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
};

// ------------------------------------------------------------ つながりの編集

/** 今のつながりが「相手は（この人の）◯◯」のどれに当たるか */
const choiceOf = (r: Relation, viewerId: string): string => {
  const otherId = r.a === viewerId ? r.b : r.a;
  const hit = RELATION_CHOICES.find((c) => c.type === r.type && (c.otherIsA ? r.a === otherId : r.b === otherId));
  return hit?.key ?? RELATION_CHOICES.find((c) => c.type === r.type)?.key ?? "other";
};

const RelationEditSheet = ({ rel, viewerId, onClose }: { rel: Relation; viewerId: string; onClose: () => void }) => {
  const data = useData();
  const viewer = data.persons.find((p) => p.id === viewerId);
  const [otherId, setOtherId] = useState(rel.a === viewerId ? rel.b : rel.a);
  const [choice, setChoice] = useState(choiceOf(rel, viewerId));
  const [label, setLabel] = useState(rel.labelBy === viewerId ? (rel.label ?? "") : "");
  const [note, setNote] = useState(rel.note ?? "");
  const [mood, setMood] = useState<Mood | undefined>(rel.mood);
  const [picking, setPicking] = useState(false);
  const other = data.persons.find((p) => p.id === otherId);

  const save = async (): Promise<void> => {
    const c = RELATION_CHOICES.find((x) => x.key === choice) ?? RELATION_CHOICES[0];
    const [a, b] = c.otherIsA ? [otherId, viewerId] : [viewerId, otherId];
    await saveRelation({ ...rel, a, b, type: c.type, label: label.trim() || undefined, labelBy: label.trim() ? viewerId : undefined, note: note.trim() || undefined, mood });
    onClose();
  };
  const remove = async (): Promise<void> => {
    if (!window.confirm("このつながりを外しますか？")) return;
    await deleteRelation(rel.id);
    onClose();
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>つながりを編集</h2>
          <button type="button" className="text-btn" onClick={() => void save()}>保存</button>
        </div>
        <div className="sheet-body">
          <div className="form">
            <div className="small muted">
              {viewer ? selfLabel(viewer) : ""} から見て、相手は…
            </div>
            <Field label="相手">
              <button type="button" className="map-center" onClick={() => setPicking(true)}>
                <Avatar person={other} size={28} />
                <span className="map-center-name">{other ? selfLabel(other) : "選ぶ"}</span>
                <Icon name="down" size={16} />
              </button>
            </Field>
            <Field label="関係">
              <div className="chips" style={{ paddingTop: 0, flexWrap: "wrap" }}>
                {RELATION_CHOICES.map((c) => (
                  <button type="button" key={c.key} className={`chip ${choice === c.key ? "on" : ""}`} onClick={() => setChoice(c.key)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="関係の温度">
              <div className="chips" style={{ paddingTop: 0, flexWrap: "wrap" }}>
                {MOODS.map((m) => (
                  <button type="button" key={m} className={`chip mood-${m} ${mood === m ? "on" : ""}`} onClick={() => setMood(mood === m ? undefined : m)}>
                    {MOOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="呼び方（任意）" hint="「叔父」「義兄」「師匠」など、自動の呼び名の代わりに出したいとき">
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label="メモ（任意）">
              <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <button type="button" className="btn primary" onClick={() => void save()}>保存</button>
            <button type="button" className="btn danger" onClick={() => void remove()}>
              <Icon name="trash" size={16} /> このつながりを外す
            </button>
          </div>
        </div>
      </div>
      {picking && (
        <PersonPicker
          title="相手を選ぶ"
          multiple={false}
          includeSelf
          selected={[]}
          excludeIds={[viewerId]}
          onDone={(ids) => {
            if (ids[0]) setOtherId(ids[0]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};
