// src/ui/PersonEdit.tsx — 人物の追加・編集
//
// 入力の手間を減らすため、必須は名前だけ。詳しい項目は折りたたんで後から埋められるようにする。

import { useState } from "react";
import { shrinkImage } from "../image";
import { CATEGORIES, CATEGORY_LABEL, type Career, type Category, GENDERS, GENDER_LABEL, type Person, type WorkManual, emptyPerson, newId } from "../model";
import { goBack, navigate } from "../router";
import { addImage, deletePerson, getData, savePerson } from "../store";
import { Avatar, Field, Icon, TopBar } from "./common";

const Text = ({ value, onChange, placeholder, type = "text" }: { value?: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
  <input className="input" type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
);

const Area = ({ value, onChange, placeholder, rows = 3 }: { value?: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) => (
  <textarea className="textarea" rows={rows} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
);

const clean = (s?: string): string | undefined => (s && s.trim() ? s.trim() : undefined);

export const PersonEdit = ({ id }: { id?: string }) => {
  const original = id ? getData().persons.find((p) => p.id === id) : undefined;
  const [p, setP] = useState<Person>(() => original ?? emptyPerson());
  const [tagText, setTagText] = useState((original?.tags ?? []).join("、"));
  const [open, setOpen] = useState<Record<string, boolean>>({
    work: !!original && (original.category === "work" || !!original.org),
    manual: !!original,
    more: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (id && !original) return <div className="empty">見つかりません</div>;

  const set = <K extends keyof Person>(key: K, value: Person[K]): void => setP((cur) => ({ ...cur, [key]: value }));
  const setWork = (key: keyof WorkManual, value: string): void => setP((cur) => ({ ...cur, work: { ...cur.work, [key]: value } }));
  const setCareer = (cid: string, patch: Partial<Career>): void =>
    setP((cur) => ({ ...cur, careers: cur.careers.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }));

  const onPhoto = async (file?: File): Promise<void> => {
    if (!file) return;
    try {
      setBusy(true);
      const blob = await shrinkImage(file);
      const imageId = await addImage(blob);
      set("photo", imageId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "写真を読み込めませんでした");
    } finally {
      setBusy(false);
    }
  };

  const onSave = async (): Promise<void> => {
    if (!p.name.trim()) {
      setError("名前を入れてください");
      return;
    }
    const tags = [...new Set(tagText.split(/[、,，\s#]+/).map((t) => t.trim()).filter(Boolean))];
    const work: WorkManual = Object.fromEntries(Object.entries(p.work).map(([k, v]) => [k, clean(v)]).filter(([, v]) => v));
    const saved = await savePerson({
      ...p,
      name: p.name.trim(),
      kana: clean(p.kana),
      // 日本語入力の途中で切らないよう、入力中はそのまま持ち、保存時に 1 文字にする
      iconChar: clean(p.iconChar) ? [...clean(p.iconChar)!][0] : undefined,
      tags,
      work,
      careers: p.careers.filter((c) => c.org || c.dept || c.title || c.note),
    });
    if (id) goBack(`/p/${saved.id}`);
    else navigate(`/p/${saved.id}`, true);
  };

  const onDelete = async (): Promise<void> => {
    if (!id || !window.confirm(`${p.name} を削除しますか？\n（この人の記録・つながりも外れます）`)) return;
    await deletePerson(id);
    navigate("/", true);
  };

  const toggle = (key: string): void => setOpen((o) => ({ ...o, [key]: !o[key] }));

  const Section = ({ k, title }: { k: string; title: string }) => (
    <button type="button" className="org-head card" style={{ marginTop: 4 }} onClick={() => toggle(k)}>
      <span>{title}</span>
      <span className="muted" style={{ transform: open[k] ? "rotate(180deg)" : undefined, display: "inline-flex" }}>
        <Icon name="down" size={18} />
      </span>
    </button>
  );

  return (
    <>
      <TopBar
        title={id ? (p.isSelf ? "自分のプロフィール" : "編集") : "人を追加"}
        back={id ? `/p/${id}` : "/"}
        right={
          <button type="button" className="text-btn" onClick={() => void onSave()} disabled={busy}>
            保存
          </button>
        }
      />
      <main className="main">
        <div className="form">
          <div className="photo-pick">
            <Avatar person={p} size={88} />
            <label>
              {p.photo ? "写真を変える" : "写真を追加"}
              <input type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
            </label>
            {p.photo && (
              <button type="button" className="text-btn small" style={{ color: "var(--text-3)" }} onClick={() => set("photo", undefined)}>
                写真を外す
              </button>
            )}
            {!p.photo && (
              <label className="check-inline" style={{ cursor: "default" }}>
                アイコンの文字
                <input className="input" style={{ width: 56, textAlign: "center", padding: "6px 4px" }} value={p.iconChar ?? ""}
                  placeholder={[...(p.name.trim() || "?")][0]}
                  onChange={(e) => set("iconChar", e.target.value || undefined)} />
              </label>
            )}
          </div>

          <div className="card fieldset">
            <Field label="名前（必須）">
              <Text value={p.name} onChange={(v) => set("name", v)} placeholder="山田 太郎" />
            </Field>
            <div className="two">
              <Field label="よみがな">
                <Text value={p.kana} onChange={(v) => set("kana", v)} placeholder="やまだ たろう" />
              </Field>
              <Field label="呼び名">
                <Text value={p.nickname} onChange={(v) => set("nickname", v)} />
              </Field>
            </div>
            <Field label="性別">
              <div className="chips" style={{ paddingTop: 0, flexWrap: "wrap" }}>
                {GENDERS.map((g) => (
                  <button type="button" key={g} className={`chip ${p.gender === g ? "on" : ""}`} onClick={() => set("gender", p.gender === g ? undefined : g)}>
                    {GENDER_LABEL[g]}
                  </button>
                ))}
              </div>
            </Field>
            {!p.isSelf && (
              <Field label="区分">
                <div className="chips" style={{ paddingTop: 0, flexWrap: "wrap" }}>
                  {CATEGORIES.map((c: Category) => (
                    <button type="button" key={c} className={`chip ${p.category === c ? "on" : ""}`} onClick={() => set("category", c)}>
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="タグ" hint="「、」かスペース区切り。例: 現場、安全委員会、釣り仲間">
              <Text value={tagText} onChange={setTagText} />
            </Field>
            {!p.isSelf && (
              <label className="check-inline">
                <input type="checkbox" checked={!!p.pinned} onChange={(e) => set("pinned", e.target.checked)} />
                重要な人として一覧の上に出す
              </label>
            )}
          </div>

          <Section k="work" title="所属・仕事" />
          {open.work && (
            <div className="card fieldset">
              <Field label="会社・組織">
                <Text value={p.org} onChange={(v) => set("org", v)} />
              </Field>
              <div className="two">
                <Field label="部署">
                  <Text value={p.dept} onChange={(v) => set("dept", v)} />
                </Field>
                <Field label="役職">
                  <Text value={p.title} onChange={(v) => set("title", v)} />
                </Field>
              </div>
              <Field label="報告・相談の好み">
                <Area rows={2} value={p.work.report} onChange={(v) => setWork("report", v)} placeholder="結論から短く / 数字で / 事前に一報 など" />
              </Field>
              <Field label="通じやすい連絡手段">
                <Text value={p.work.contact} onChange={(v) => setWork("contact", v)} placeholder="電話 / Teams / 対面 など" />
              </Field>
              <Field label="つかまりやすい時間">
                <Text value={p.work.timing} onChange={(v) => setWork("timing", v)} placeholder="朝イチ / 昼休み明け など" />
              </Field>
              <Field label="何を評価する人か">
                <Area rows={2} value={p.work.evaluates} onChange={(v) => setWork("evaluates", v)} />
              </Field>
              <Field label="得意なこと・頼れること">
                <Area rows={2} value={p.work.strengths} onChange={(v) => setWork("strengths", v)} />
              </Field>

              <div className="field">
                <span className="field-label">過去の所属・異動</span>
                {p.careers.map((c) => (
                  <div key={c.id} className="card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, boxShadow: "none" }}>
                    <div className="two">
                      <Text type="month" value={c.from} onChange={(v) => setCareer(c.id, { from: v })} />
                      <Text type="month" value={c.to} onChange={(v) => setCareer(c.id, { to: v })} />
                    </div>
                    <Text value={c.org} onChange={(v) => setCareer(c.id, { org: v })} placeholder="会社・組織" />
                    <div className="two">
                      <Text value={c.dept} onChange={(v) => setCareer(c.id, { dept: v })} placeholder="部署" />
                      <Text value={c.title} onChange={(v) => setCareer(c.id, { title: v })} placeholder="役職" />
                    </div>
                    <button type="button" className="text-btn small" style={{ alignSelf: "flex-end", color: "var(--danger)" }}
                      onClick={() => set("careers", p.careers.filter((x) => x.id !== c.id))}>
                      この行を消す
                    </button>
                  </div>
                ))}
                <button type="button" className="btn" onClick={() => set("careers", [...p.careers, { id: newId(), org: p.org }])}>
                  <Icon name="plus" size={16} /> 履歴を追加
                </button>
              </div>
            </div>
          )}

          <Section k="manual" title="取扱説明書" />
          {open.manual && (
            <div className="card fieldset">
              <Field label="喜ぶこと・好きなもの">
                <Area value={p.likes} onChange={(v) => set("likes", v)} />
              </Field>
              <Field label="地雷・避けたいこと">
                <Area value={p.dislikes} onChange={(v) => set("dislikes", v)} />
              </Field>
              <Field label="盛り上がる話題">
                <Area rows={2} value={p.topics} onChange={(v) => set("topics", v)} />
              </Field>
              <Field label="価値観・口ぐせ">
                <Area rows={2} value={p.values} onChange={(v) => set("values", v)} />
              </Field>
              <Field label="この人から学んだこと">
                <Area value={p.learnings} onChange={(v) => set("learnings", v)} />
              </Field>
            </div>
          )}

          <Section k="more" title="誕生日・出会い・連絡先・メモ" />
          {open.more && (
            <div className="card fieldset">
              <Field label="誕生日">
                <Text type="date" value={p.birthDate} onChange={(v) => set("birthDate", v)} />
              </Field>
              <label className="check-inline">
                <input type="checkbox" checked={!!p.birthYearUnknown} onChange={(e) => set("birthYearUnknown", e.target.checked)} />
                生まれ年はわからない
              </label>
              <Field label="兄弟姉妹の中で何番目に生まれたか" hint="誕生日（年まで）が入っていれば不要。わからないときの並び順に使います">
                <input className="input" type="number" min={1} max={20} inputMode="numeric" value={p.birthOrder ?? ""}
                  onChange={(e) => set("birthOrder", e.target.value ? Number(e.target.value) : undefined)} placeholder="例: 1（長子）" />
              </Field>
              <div className="two">
                <Field label="出会った日">
                  <Text type="date" value={p.metDate} onChange={(v) => set("metDate", v)} />
                </Field>
                <Field label="きっかけ">
                  <Text value={p.metHow} onChange={(v) => set("metHow", v)} />
                </Field>
              </div>
              <Field label="電話">
                <Text type="tel" value={p.phone} onChange={(v) => set("phone", v)} />
              </Field>
              <Field label="メール">
                <Text type="email" value={p.email} onChange={(v) => set("email", v)} />
              </Field>
              <Field label="SNS・その他の連絡先">
                <Text value={p.sns} onChange={(v) => set("sns", v)} />
              </Field>
              <Field label="メモ">
                <Area rows={4} value={p.note} onChange={(v) => set("note", v)} />
              </Field>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <button type="button" className="btn primary" onClick={() => void onSave()} disabled={busy}>
            保存
          </button>
          {id && !p.isSelf && (
            <button type="button" className="btn danger" onClick={() => void onDelete()}>
              <Icon name="trash" size={16} /> この人を削除
            </button>
          )}
        </div>
      </main>
    </>
  );
};
