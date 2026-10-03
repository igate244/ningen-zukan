// src/ui/Settings.tsx — ドライブ連携・書き出し / 読み込み・MYME からの取り込み

import { useState } from "react";
import { isConfigured } from "../drive";
import { type AppData, type Category, CATEGORIES, type Person, type Relation, SELF_ID, emptyPerson, newId } from "../model";
import { navigate } from "../router";
import { alive, getData, replaceAll, useData } from "../store";
import { disablePush, enablePush, testPush, usePushState } from "../push";
import { connect, disconnect, mergeData, reconnect, syncNow, useSyncState } from "../sync";
import { Icon } from "./common";

declare const __APP_VERSION__: string;

const download = (name: string, text: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const stamp = (): string => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

/** MYME のバックアップ JSON から人物を取り込む（同じ名前の人がいれば飛ばす） */
const importFromMyme = (json: Record<string, unknown>): { added: number; skipped: number } => {
  const d = getData();
  const existing = new Set(alive(d.persons).map((p) => p.name.replace(/\s/g, "")));
  const out: Person[] = [];
  const rels: Relation[] = [];
  let skipped = 0;
  const push = (name: string, build: (p: Person) => Person): Person | null => {
    const key = name.replace(/\s/g, "");
    if (!key || existing.has(key)) {
      skipped++;
      return null;
    }
    existing.add(key);
    const p = build(emptyPerson(name.trim()));
    out.push(p);
    return p;
  };
  const toBirth = (raw?: unknown): Pick<Person, "birthDate" | "birthYearUnknown"> => {
    if (typeof raw !== "string") return {};
    let b = raw;
    // 「2001/04/09」のようなスラッシュ区切りもハイフンにそろえる
    const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(b.trim());
    if (ymd) b = `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    // 「10/05」のような月日だけの形式は生まれ年不明として扱う
    const md = /^(\d{1,2})[/-](\d{1,2})$/.exec(b.trim());
    if (md) return { birthDate: `2000-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`, birthYearUnknown: true };
    if (!/^\d{4}-\d{2}-\d{2}/.test(b)) return {};
    // MYME は生まれ年不明を 1000 年で保存している
    return b.startsWith("1000-") ? { birthDate: `2000${b.slice(4, 10)}`, birthYearUnknown: true } : { birthDate: b.slice(0, 10) };
  };

  for (const c of (json.companions as Array<Record<string, unknown>>) ?? []) {
    if (!c || typeof c.name !== "string") continue;
    const cat = (CATEGORIES as readonly string[]).includes(String(c.category)) ? (c.category as Category) : "other";
    push(c.name, (p) => ({
      ...p,
      category: cat,
      ...toBirth(c.birthDate ?? c.birthday),
      note: [c.relation, c.note ?? c.description].filter((x) => typeof x === "string" && x).join("\n") || undefined,
      learnings: typeof c.learnings === "string" ? c.learnings : undefined,
      tags: ["MYMEから"],
    }));
  }
  // 育成記録の子どもたちは「自分の子」としてつなぐ
  const now = Date.now();
  for (const f of (json.familyMembers as Array<Record<string, unknown>>) ?? []) {
    if (!f || typeof f.name !== "string") continue;
    const child = push(f.name, (p) => ({ ...p, category: "family", ...toBirth(f.birthDate), tags: ["MYMEから"] }));
    if (child) rels.push({ id: newId(), createdAt: now, updatedAt: now, a: SELF_ID, b: child.id, type: "parent" });
  }

  // 自分のページがまだ初期状態なら、MYME のプロフィールの名前と誕生日を入れる
  let persons = [...d.persons, ...out];
  const prof = json.profile as Record<string, unknown> | null;
  const self = d.persons.find((p) => p.id === SELF_ID);
  if (prof && self && self.name === "自分" && typeof prof.name === "string" && prof.name.trim()) {
    const updated: Person = { ...self, name: prof.name.trim(), ...toBirth(prof.birthDate), updatedAt: now };
    persons = persons.map((p) => (p.id === SELF_ID ? updated : p));
  }
  void replaceAll({ ...d, persons, relations: [...d.relations, ...rels] }, true);
  return { added: out.length, skipped };
};

export const SettingsPage = () => {
  const data = useData();
  const sync = useSyncState();
  const push = usePushState();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>): Promise<void> => {
    try {
      setBusy(true);
      setMsg(null);
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (file?: File): Promise<void> => {
    if (!file) return;
    await run(async () => {
      const json = JSON.parse(await file.text()) as Record<string, unknown>;
      if (Array.isArray(json.companions) || Array.isArray(json.familyMembers)) {
        const r = importFromMyme(json);
        setMsg(`MYME から ${r.added}人 取り込みました${r.skipped ? `（同名の ${r.skipped}人 は飛ばしました）` : ""}`);
      } else if (Array.isArray(json.persons)) {
        const merged = mergeData(getData(), json as unknown as AppData);
        await replaceAll(merged, true);
        setMsg("読み込みました（新しい方の内容で合体）");
      } else {
        setMsg("このファイルは読み込めない形式でした");
      }
    });
  };

  const persons = alive(data.persons).filter((p) => !p.isSelf).length;
  const logs = alive(data.logs).length;
  const lastSync = sync.lastSync ? new Date(sync.lastSync).toLocaleString("ja-JP") : "まだ";

  return (
    <>
      <div className="section">
        <div className="section-title">Google ドライブ</div>
        <div className="card fieldset">
          {!isConfigured() ? (
            <div className="small muted">
              ドライブ連携はまだ準備中です（開発側の設定待ち）。今はこの端末の中だけに保存されています。
            </div>
          ) : sync.status === "off" ? (
            <>
              <div className="small">
                つなぐと、データが<strong>自分の Google ドライブ</strong>の「人間図鑑」フォルダに保存されます。
                アプリの作者を含め、他の人には見えません。スマホと PC など複数の端末で同じデータを使えます。
              </div>
              <button type="button" className="btn primary" disabled={busy} onClick={() => void run(connect)}>
                Google ドライブにつなぐ
              </button>
            </>
          ) : (
            <>
              <div className="small">
                状態：
                {sync.status === "syncing" ? "同期中…" : sync.status === "needAuth" ? "再接続が必要" : sync.status === "error" ? "エラー" : "つながっています"}
                <br />
                最後の同期：{lastSync}
                {sync.message && <div className="error">{sync.message}</div>}
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                {sync.status === "needAuth" ? (
                  <button type="button" className="btn primary" disabled={busy} onClick={() => void run(reconnect)}>再接続</button>
                ) : (
                  <button type="button" className="btn" disabled={busy || sync.status === "syncing"} onClick={() => void run(syncNow)}>
                    <Icon name="sync" size={16} /> 今すぐ同期
                  </button>
                )}
                <button type="button" className="btn" disabled={busy}
                  onClick={() => window.confirm("ドライブとの連携を外しますか？（端末とドライブのデータはどちらも残ります）") && void run(disconnect)}>
                  連携を外す
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-title">誕生日の通知</div>
        <div className="card fieldset">
          <div className="small">
            誕生日の<strong>前日21時</strong>と<strong>当日朝7時</strong>にスマホへ通知します。
            <br />
            <span className="muted">
              通知の配達サーバーに渡すのは「誕生日の月日」と「通知の宛先」だけで、名前は送りません。文面はこの端末の中で作ります。
            </span>
          </div>
          {push.status === "unsupported" ? (
            <div className="small muted">この端末・ブラウザは通知に対応していません。ホーム画面に入れたアプリから開くと使えることがあります。</div>
          ) : push.status === "on" ? (
            <div className="actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn" onClick={() => void testPush()}>テスト通知</button>
              <button type="button" className="btn" onClick={() => void disablePush()}>オフにする</button>
            </div>
          ) : (
            <button type="button" className="btn primary" disabled={push.status === "working"} onClick={() => void enablePush()}>
              {push.status === "working" ? "設定中…" : "通知をオンにする"}
            </button>
          )}
          {push.status === "denied" && (
            <div className="error">通知が許可されていません。スマホの設定 → アプリ → Chrome（または人間図鑑）→ 通知 を許可してください。</div>
          )}
          {push.status === "error" && <div className="error">{push.message}</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-title">自分</div>
        <div className="list card">
          <button type="button" className="row" onClick={() => navigate(`/p/${SELF_ID}`)}>
            <div className="row-main">
              <div className="row-name">自分のページ</div>
              <div className="row-sub">家族や上司とのつながりの起点になります</div>
            </div>
            <Icon name="chevron" size={18} />
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">データ</div>
        <div className="card fieldset">
          <div className="small muted">登録 {persons}人 ・ 記録 {logs}件</div>
          <button type="button" className="btn" onClick={() => download(`ningen-zukan_${stamp()}.json`, JSON.stringify({ app: "ningen-zukan", version: 1, ...getData() }, null, 1))}>
            書き出し（JSON・写真は含まない）
          </button>
          <label className="btn" style={{ cursor: "pointer" }}>
            読み込み（この図鑑の JSON / MYME のバックアップ）
            <input type="file" accept="application/json,.json" hidden onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {msg && <div className="small" style={{ color: "var(--accent)" }}>{msg}</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-title">このアプリについて</div>
        <div className="card fieldset small muted">
          人間図鑑 ・ 版 {__APP_VERSION__}
          <br />
          サーバーを持たないアプリです。データは端末の中と、つないだ場合は自分の Google ドライブにだけ保存されます。
        </div>
      </div>
    </>
  );
};
