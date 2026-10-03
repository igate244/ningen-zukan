// src/ui/PersonDetail.tsx — 1 人のページ（概要 / 取説 / 記録 / つながり）

import { type ReactNode, useMemo, useState } from "react";
import { age, daysToBirthday, formatDate, formatMonthDay, sinceLabel, today } from "../dates";
import {
  CATEGORY_LABEL, type CheckItem, type Favor, LOG_KIND_LABEL, type Person, RELATION_CHOICES,
  newId, relationLabelFrom,
} from "../model";
import { navigate } from "../router";
import { alive, deleteRelation, lastMetMap, saveRelation, savePerson, useData } from "../store";
import { Avatar, Icon, PersonPicker, TopBar } from "./common";

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

export const PersonDetail = ({ id }: { id: string }) => {
  const data = useData();
  const person = data.persons.find((p) => p.id === id && !p.deleted);
  const [tab, setTabState] = useState<Tab>(lastTab.get(id) ?? "info");
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
          <button type="button" className="btn" onClick={() => setTab("links")}>
            <Icon name="link" size={16} /> つながり
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
  const a = age(p.birthDate, p.birthYearUnknown);
  const until = daysToBirthday(p.birthDate);
  const birth = p.birthDate
    ? `${p.birthYearUnknown ? formatMonthDay(p.birthDate) : formatDate(p.birthDate)}${a !== null ? `（${a}歳）` : ""}${
        until !== null ? ` ・ ${until === 0 ? "今日！" : `あと${until}日`}` : ""
      }`
    : undefined;
  const empty = !birth && !p.metDate && !p.metHow && !p.phone && !p.email && !p.sns && !p.note && p.careers.length === 0;

  return (
    <>
      <div className="section">
        <KV
          items={[
            ["誕生日", birth],
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

  const rels = useMemo(
    () => alive(data.relations).filter((r) => r.a === person.id || r.b === person.id),
    [data.relations, person.id],
  );
  const byId = useMemo(() => new Map(data.persons.filter((p) => !p.deleted).map((p) => [p.id, p])), [data.persons]);

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

      {rels.length === 0 ? (
        <div className="empty">まだつながりがありません</div>
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
                    <div className="row-sub">{relationLabelFrom(r, person.id)}</div>
                  </div>
                </button>
                <button type="button" className="icon-btn" aria-label="つながりを外す" onClick={() => void deleteRelation(r.id)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

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
