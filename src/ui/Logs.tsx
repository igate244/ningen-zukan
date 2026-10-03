// src/ui/Logs.tsx — 交流ログの一覧と、記録の追加・編集

import { useMemo, useState } from "react";
import { formatDate, today } from "../dates";
import { IMPRESSIONS, IMPRESSION_ICON, IMPRESSION_LABEL, LOG_KINDS, LOG_KIND_LABEL, type LogEntry, type LogKind, newId } from "../model";
import { goBack, navigate } from "../router";
import { alive, deleteLog, getData, saveLog, useData } from "../store";
import { Avatar, Field, Icon, PersonPicker, TopBar } from "./common";

export const LogsPage = () => {
  const data = useData();
  const [kind, setKind] = useState<LogKind | "all">("all");
  const [q, setQ] = useState("");

  const byId = useMemo(() => new Map(data.persons.map((p) => [p.id, p])), [data.persons]);
  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = alive(data.logs)
      .filter((l) => kind === "all" || l.kind === kind)
      .filter((l) => !query || l.text.toLowerCase().includes(query) || l.personIds.some((id) => byId.get(id)?.name.toLowerCase().includes(query)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const map = new Map<string, LogEntry[]>();
    for (const l of list) {
      const key = l.date.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), l]);
    }
    return [...map.entries()];
  }, [data.logs, kind, q, byId]);

  return (
    <>
      <input className="search" type="search" placeholder="内容・名前で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        <button type="button" className={`chip ${kind === "all" ? "on" : ""}`} onClick={() => setKind("all")}>すべて</button>
        {LOG_KINDS.map((k) => (
          <button type="button" key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(kind === k ? "all" : k)}>
            {LOG_KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="empty">まだ記録がありません。<br />会った・話した・助けてもらった、を一言で残そう。</div>
      ) : (
        groups.map(([month, logs]) => (
          <div key={month}>
            <div className="month">{month.replace("-", "年")}月</div>
            <div className="card">
              {logs.map((l) => (
                <button type="button" key={l.id} className="log" onClick={() => navigate(`/log/${l.id}`)}>
                  <div className="log-head">
                    <span>{formatDate(l.date).replace(/^\d+年/, "")}</span>
                    <span className="log-kind">{LOG_KIND_LABEL[l.kind]}</span>
                    {l.impression && <span title={IMPRESSION_LABEL[l.impression]}>{IMPRESSION_ICON[l.impression]}</span>}
                  </div>
                  <div className="log-people">
                    {l.personIds.map((id) => {
                      const p = byId.get(id);
                      if (!p || p.deleted) return null;
                      return (
                        <span className="person-pill" key={id}>
                          <Avatar person={p} size={18} />
                          {p.name}
                        </span>
                      );
                    })}
                  </div>
                  {l.text && <div className="log-text">{l.text}</div>}
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      <button type="button" className="fab" onClick={() => navigate("/log/new")}>
        <Icon name="pen" size={18} /> 記録する
      </button>
    </>
  );
};

export const LogEdit = ({ id, presetPersonId, presetDate, presetKind }: { id?: string; presetPersonId?: string; presetDate?: string; presetKind?: LogKind }) => {
  const original = id ? getData().logs.find((l) => l.id === id) : undefined;
  const [log, setLog] = useState<LogEntry>(() => {
    if (original) return original;
    const now = Date.now();
    return { id: newId(), createdAt: now, updatedAt: now, date: presetDate || today(), personIds: presetPersonId ? [presetPersonId] : [], kind: presetKind ?? "meet", text: "" };
  });
  const [picking, setPicking] = useState(!original && !presetPersonId && presetKind !== "event");
  const [error, setError] = useState<string | null>(null);
  const data = useData();

  if (id && !original) return <div className="empty">見つかりません</div>;

  const people = log.personIds.map((pid) => data.persons.find((p) => p.id === pid)).filter((p) => p && !p.deleted);

  const onSave = async (): Promise<void> => {
    if (log.personIds.length === 0 && log.kind !== "event") {
      setError("誰との記録か選んでください");
      return;
    }
    if (log.kind === "event" && !log.text.trim()) {
      setError("イベントの名前を入れてください");
      return;
    }
    await saveLog({ ...log, text: log.text.trim() });
    goBack(presetPersonId ? `/p/${presetPersonId}` : "/logs");
  };

  const onDelete = async (): Promise<void> => {
    if (!id || !window.confirm("この記録を削除しますか？")) return;
    await deleteLog(id);
    goBack("/logs");
  };

  return (
    <>
      <TopBar
        title={id ? "記録を編集" : "記録する"}
        back={presetPersonId ? `/p/${presetPersonId}` : "/logs"}
        right={<button type="button" className="text-btn" onClick={() => void onSave()}>保存</button>}
      />
      <main className="main">
        <div className="form">
          <Field label={log.kind === "event" ? "だれと（任意）" : "だれと"}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {people.map((p) => p && (
                <span className="person-pill" key={p.id} style={{ fontSize: 13, padding: "3px 10px 3px 3px" }}>
                  <Avatar person={p} size={22} />
                  {p.isSelf ? "自分" : p.name}
                </span>
              ))}
              <button type="button" className="chip" onClick={() => setPicking(true)}>
                {people.length ? "変更" : "＋ 人を選ぶ"}
              </button>
            </div>
          </Field>

          <Field label="なにが">
            <div className="chips" style={{ paddingTop: 0, flexWrap: "wrap" }}>
              {LOG_KINDS.map((k) => (
                <button type="button" key={k} className={`chip ${log.kind === k ? "on" : ""}`} onClick={() => setLog({ ...log, kind: k })}>
                  {LOG_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="いつ">
            <input className="input" type="date" value={log.date} onChange={(e) => setLog({ ...log, date: e.target.value || today() })} />
          </Field>

          {log.kind !== "event" && (
            <Field label="印象は？（任意）">
              <div className="chips" style={{ paddingTop: 0 }}>
                {IMPRESSIONS.map((im) => (
                  <button type="button" key={im} className={`chip ${log.impression === im ? "on" : ""}`}
                    onClick={() => setLog({ ...log, impression: log.impression === im ? undefined : im })}>
                    {IMPRESSION_ICON[im]} {IMPRESSION_LABEL[im]}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {log.kind === "event" && (
            <label className="check-inline">
              <input type="checkbox" className="switch" checked={!!log.yearly} onChange={(e) => setLog({ ...log, yearly: e.target.checked })} />
              毎年くり返す（記念日など）
            </label>
          )}

          <Field label={log.kind === "event" ? "イベント名・メモ" : "ひとこと"} hint={log.kind === "event" ? "1行目がカレンダーに出る名前になります" : undefined}>
            <textarea className="textarea" rows={5} value={log.text}
              placeholder={log.kind === "event" ? "結婚記念日 / 同窓会 / 〇〇さんの送別会" : "何を話した？どうだった？気づいたこと"}
              onChange={(e) => setLog({ ...log, text: e.target.value })} />
          </Field>

          {error && <p className="error">{error}</p>}

          <button type="button" className="btn primary" onClick={() => void onSave()}>保存</button>
          {id && (
            <button type="button" className="btn danger" onClick={() => void onDelete()}>
              <Icon name="trash" size={16} /> この記録を削除
            </button>
          )}
        </div>
      </main>

      {picking && (
        <PersonPicker
          title="だれとの記録？"
          multiple
          selected={log.personIds}
          onDone={(ids) => {
            setLog({ ...log, personIds: ids });
            setPicking(false);
            setError(null);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
};
