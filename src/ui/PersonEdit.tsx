// src/ui/PersonEdit.tsx — 人物の追加・編集
//
// 入力しやすさのために参考にしたもの（iPhone / Google の連絡先アプリ、一般的なモバイルフォームの作法）
//   ・ラベルは左、入力は右の「行」を、枠の少ないまとまり（インセットリスト）で並べる
//   ・はじめから全部の欄を見せない。入っている項目と、よく使う項目だけを出し、
//     残りは「＋ 項目を追加」から必要なものだけ足す（段階的に見せる）
//   ・選ぶものは文字入力させない（区分・性別は切り替えボタン、グループ・タグはタップで付け外し）
//   ・すでに入っている会社名・部署などは候補として出す（オートコンプリート）
//   ・欄にあったキーボード（電話・メール・数字・日付）、改行キーで次の欄へ
//   ・長文欄は中身に合わせて伸びる。保存ボタンは画面下に常に出す

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { shrinkImage } from "../image";
import {
  CATEGORIES, CATEGORY_LABEL, type Career, GENDERS, GENDER_LABEL, type Person, type WorkManual,
  emptyPerson, iconCharOf, joinName, newId, splitName,
} from "../model";
import { goBack, navigate } from "../router";
import { addImage, alive, deletePerson, getData, savePerson, useData } from "../store";
import { Avatar, Icon, TopBar } from "./common";
import { GroupEditSheet } from "./Groups";
import { FeelingMeter } from "./Feeling";

const clean = (s?: string): string | undefined => (s && s.trim() ? s.trim() : undefined);

// ------------------------------------------------------------- 入力の部品

/** 改行キーで次の入力欄へ進む */
const focusNext = (el: HTMLElement): void => {
  const all = [...document.querySelectorAll<HTMLElement>(".frow-input")];
  const i = all.indexOf(el);
  all[i + 1]?.focus();
};

const Row = ({
  label, value, onChange, placeholder, type = "text", list, inputMode, autoFocus,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  list?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
  autoFocus?: boolean;
}) => (
  <label className="frow">
    <span className="frow-label">{label}</span>
    <input
      className="frow-input"
      type={type}
      value={value ?? ""}
      placeholder={placeholder ?? label}
      list={list}
      inputMode={inputMode}
      autoFocus={autoFocus}
      enterKeyHint="next"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          focusNext(e.currentTarget);
        }
      }}
    />
  </label>
);

/** 中身に合わせて高さが伸びる長文欄 */
const AreaRow = ({ label, value, onChange, placeholder, autoFocus }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <label className="frow frow-area">
      <span className="frow-label">{label}</span>
      <textarea ref={ref} className="frow-input" rows={1} value={value ?? ""} placeholder={placeholder ?? "入力"} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
};

/** 切り替えボタン（1 つだけ選ぶ） */
const Segmented = <T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value?: T; onChange: (v: T | undefined) => void; labels: Record<T, string> }) => (
  <div className="seg">
    {options.map((o) => (
      <button type="button" key={o} className={value === o ? "on" : ""} onClick={() => onChange(value === o ? undefined : o)}>
        {labels[o]}
      </button>
    ))}
  </div>
);

const Group = ({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) => (
  <div className="fgroup">
    {title && <div className="fgroup-title">{title}</div>}
    <div className="fgroup-body">{children}</div>
    {footer && <div className="fgroup-foot">{footer}</div>}
  </div>
);

// ------------------------------------------------------------ 足せる項目

type FieldKey =
  | "nickname" | "org" | "dept" | "title" | "w.report" | "w.contact" | "w.timing" | "w.evaluates" | "w.strengths" | "careers"
  | "likes" | "dislikes" | "topics" | "values" | "learnings"
  | "birthDate" | "deathDate" | "birthOrder" | "metDate" | "metHow" | "phone" | "email" | "sns" | "note";

const SECTIONS: Array<{ title: string; keys: Array<[FieldKey, string]> }> = [
  { title: "仕事", keys: [["org", "会社・組織"], ["dept", "部署"], ["title", "役職"], ["w.report", "報告・相談の好み"], ["w.contact", "連絡手段"], ["w.timing", "つかまる時間"], ["w.evaluates", "評価する点"], ["w.strengths", "得意・頼れる"], ["careers", "所属の履歴"]] },
  { title: "取扱説明書", keys: [["likes", "好きなもの"], ["dislikes", "地雷"], ["topics", "盛り上がる話題"], ["values", "価値観・口ぐせ"], ["learnings", "学んだこと"]] },
  { title: "誕生日・出会い", keys: [["birthDate", "誕生日"], ["birthOrder", "生まれ順"], ["metDate", "出会った日"], ["metHow", "きっかけ"], ["deathDate", "命日"]] },
  { title: "連絡先", keys: [["phone", "電話"], ["email", "メール"], ["sns", "SNS など"]] },
  { title: "その他", keys: [["nickname", "呼び名"], ["note", "メモ"]] },
];

const filled = (p: Person, k: FieldKey): boolean => {
  if (k === "careers") return p.careers.length > 0;
  if (k.startsWith("w.")) return !!p.work[k.slice(2) as keyof WorkManual];
  const v = p[k as keyof Person];
  return v !== undefined && v !== null && v !== "";
};

// ------------------------------------------------------------------ 本体

export const PersonEdit = ({ id }: { id?: string }) => {
  const data = useData();
  const original = id ? getData().persons.find((p) => p.id === id) : undefined;
  const [p, setP] = useState<Person>(() => {
    const base = original ?? emptyPerson();
    // 姓・名が未設定の古いデータは、名前の空白で分けて入れておく
    if (base.familyName === undefined && base.givenName === undefined && base.name) {
      const sp = splitName(base.name);
      const kp = splitName(base.kana ?? "");
      return { ...base, familyName: sp.family, givenName: sp.given, familyKana: kp.family, givenKana: kp.given };
    }
    return base;
  });
  const [added, setAdded] = useState<FieldKey[]>([]);
  const [justAdded, setJustAdded] = useState<FieldKey | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [newGroup, setNewGroup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 候補（オートコンプリート）用に、すでに入っている値を集める
  const suggest = useMemo(() => {
    const ps = alive(data.persons);
    const uniq = (xs: Array<string | undefined>) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "ja"));
    return {
      org: uniq(ps.map((x) => x.org)),
      dept: uniq(ps.map((x) => x.dept)),
      title: uniq(ps.map((x) => x.title)),
      metHow: uniq(ps.map((x) => x.metHow)),
      tags: uniq(ps.flatMap((x) => x.tags)),
      familyName: uniq(ps.map((x) => x.familyName)),
    };
  }, [data.persons]);
  const groups = useMemo(() => alive(data.groups ?? []), [data.groups]);

  if (id && !original) return <div className="empty">見つかりません</div>;

  const set = <K extends keyof Person>(key: K, value: Person[K]): void => setP((cur) => ({ ...cur, [key]: value }));
  const setWork = (key: keyof WorkManual, value: string): void => setP((cur) => ({ ...cur, work: { ...cur.work, [key]: value } }));
  const setCareer = (cid: string, patch: Partial<Career>): void =>
    setP((cur) => ({ ...cur, careers: cur.careers.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }));

  // 仕事の人は会社・部署・役職を最初から出す
  const isVisible = (k: FieldKey): boolean =>
    filled(p, k) || added.includes(k) || (p.category === "work" && (k === "org" || k === "dept" || k === "title"));
  const add = (k: FieldKey): void => {
    setAdded((a) => [...a, k]);
    setJustAdded(k);
    if (k === "careers") set("careers", [...p.careers, { id: newId(), org: p.org }]);
  };
  const af = (k: FieldKey): boolean => justAdded === k;

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

  const addTag = (t: string): void => {
    const v = t.trim().replace(/^#/, "");
    if (v && !p.tags.includes(v)) set("tags", [...p.tags, v]);
    setTagDraft("");
  };

  const onSave = async (): Promise<void> => {
    const fullName = joinName(p.familyName, p.givenName);
    if (!fullName) {
      setError("姓か名を入れてください");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const pendingTag = tagDraft.trim();
    const tags = pendingTag && !p.tags.includes(pendingTag) ? [...p.tags, pendingTag] : p.tags;
    const work: WorkManual = Object.fromEntries(Object.entries(p.work).map(([k, v]) => [k, clean(v)]).filter(([, v]) => v));
    const saved = await savePerson({
      ...p,
      name: fullName,
      familyName: clean(p.familyName),
      givenName: clean(p.givenName),
      familyKana: clean(p.familyKana),
      givenKana: clean(p.givenKana),
      kana: joinName(p.familyKana, p.givenKana) || undefined,
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

  const fieldRow = (k: FieldKey, label: string): ReactNode => {
    switch (k) {
      case "org": return <Row key={k} label={label} value={p.org} onChange={(v) => set("org", v)} list="dl-org" autoFocus={af(k)} />;
      case "dept": return <Row key={k} label={label} value={p.dept} onChange={(v) => set("dept", v)} list="dl-dept" autoFocus={af(k)} />;
      case "title": return <Row key={k} label={label} value={p.title} onChange={(v) => set("title", v)} list="dl-title" autoFocus={af(k)} />;
      case "w.report": return <AreaRow key={k} label={label} value={p.work.report} onChange={(v) => setWork("report", v)} placeholder="結論から短く / 数字で / 事前に一報" autoFocus={af(k)} />;
      case "w.contact": return <Row key={k} label={label} value={p.work.contact} onChange={(v) => setWork("contact", v)} placeholder="電話 / Teams / 対面" autoFocus={af(k)} />;
      case "w.timing": return <Row key={k} label={label} value={p.work.timing} onChange={(v) => setWork("timing", v)} placeholder="朝イチ / 昼休み明け" autoFocus={af(k)} />;
      case "w.evaluates": return <AreaRow key={k} label={label} value={p.work.evaluates} onChange={(v) => setWork("evaluates", v)} autoFocus={af(k)} />;
      case "w.strengths": return <AreaRow key={k} label={label} value={p.work.strengths} onChange={(v) => setWork("strengths", v)} autoFocus={af(k)} />;
      case "likes": return <AreaRow key={k} label={label} value={p.likes} onChange={(v) => set("likes", v)} autoFocus={af(k)} />;
      case "dislikes": return <AreaRow key={k} label={label} value={p.dislikes} onChange={(v) => set("dislikes", v)} autoFocus={af(k)} />;
      case "topics": return <AreaRow key={k} label={label} value={p.topics} onChange={(v) => set("topics", v)} autoFocus={af(k)} />;
      case "values": return <AreaRow key={k} label={label} value={p.values} onChange={(v) => set("values", v)} autoFocus={af(k)} />;
      case "learnings": return <AreaRow key={k} label={label} value={p.learnings} onChange={(v) => set("learnings", v)} autoFocus={af(k)} />;
      case "birthDate":
        return (
          <div key={k}>
            <Row label={label} type="date" value={p.birthDate} onChange={(v) => set("birthDate", v)} autoFocus={af(k)} />
            <label className="frow frow-switch">
              <span className="frow-label">年は不明</span>
              <input type="checkbox" className="switch" checked={!!p.birthYearUnknown} onChange={(e) => set("birthYearUnknown", e.target.checked)} />
            </label>
          </div>
        );
      case "birthOrder":
        return <Row key={k} label={label} type="number" inputMode="numeric" value={p.birthOrder ? String(p.birthOrder) : ""} placeholder="兄弟姉妹の何番目か（1＝長子）"
          onChange={(v) => set("birthOrder", v ? Number(v) : undefined)} autoFocus={af(k)} />;
      case "deathDate": return <Row key={k} label={label} type="date" value={p.deathDate} onChange={(v) => set("deathDate", v || undefined)} autoFocus={af(k)} />;
      case "metDate": return <Row key={k} label={label} type="date" value={p.metDate} onChange={(v) => set("metDate", v)} autoFocus={af(k)} />;
      case "metHow": return <Row key={k} label={label} value={p.metHow} onChange={(v) => set("metHow", v)} list="dl-met" placeholder="入社 / 小学校 / 紹介 など" autoFocus={af(k)} />;
      case "phone": return <Row key={k} label={label} type="tel" inputMode="tel" value={p.phone} onChange={(v) => set("phone", v)} autoFocus={af(k)} />;
      case "email": return <Row key={k} label={label} type="email" inputMode="email" value={p.email} onChange={(v) => set("email", v)} autoFocus={af(k)} />;
      case "sns": return <Row key={k} label={label} value={p.sns} onChange={(v) => set("sns", v)} placeholder="LINE / Instagram など" autoFocus={af(k)} />;
      case "nickname": return <Row key={k} label={label} value={p.nickname} onChange={(v) => set("nickname", v)} placeholder="みーちゃん など" autoFocus={af(k)} />;
      case "note": return <AreaRow key={k} label={label} value={p.note} onChange={(v) => set("note", v)} autoFocus={af(k)} />;
      case "careers":
        return (
          <div key={k} className="frow-block">
            <span className="frow-label">所属の履歴</span>
            {p.careers.map((c) => (
              <div key={c.id} className="career">
                <div className="two">
                  <input className="frow-input boxed" type="month" value={c.from ?? ""} onChange={(e) => setCareer(c.id, { from: e.target.value })} />
                  <input className="frow-input boxed" type="month" value={c.to ?? ""} onChange={(e) => setCareer(c.id, { to: e.target.value })} />
                </div>
                <input className="frow-input boxed" list="dl-org" placeholder="会社・組織" value={c.org ?? ""} onChange={(e) => setCareer(c.id, { org: e.target.value })} />
                <div className="two">
                  <input className="frow-input boxed" list="dl-dept" placeholder="部署" value={c.dept ?? ""} onChange={(e) => setCareer(c.id, { dept: e.target.value })} />
                  <input className="frow-input boxed" list="dl-title" placeholder="役職" value={c.title ?? ""} onChange={(e) => setCareer(c.id, { title: e.target.value })} />
                </div>
                <button type="button" className="text-btn small" style={{ alignSelf: "flex-end", color: "var(--danger)" }}
                  onClick={() => set("careers", p.careers.filter((x) => x.id !== c.id))}>この行を消す</button>
              </div>
            ))}
            <button type="button" className="text-btn small" onClick={() => set("careers", [...p.careers, { id: newId(), org: p.org }])}>＋ 履歴を足す</button>
          </div>
        );
      default:
        return null;
    }
  };

  const hidden = SECTIONS.map((s) => ({ ...s, keys: s.keys.filter(([k]) => !isVisible(k)) })).filter((s) => s.keys.length);

  return (
    <>
      <TopBar
        title={id ? (p.isSelf ? "自分のプロフィール" : "編集") : "人を追加"}
        back={id ? `/p/${id}` : "/"}
        right={<button type="button" className="text-btn" onClick={() => void onSave()} disabled={busy}>保存</button>}
      />
      <main className="main edit-main">
        {/* ---- 写真と名前（連絡先アプリと同じ並び） */}
        <div className="edit-head">
          <label className="edit-photo">
            <Avatar person={{ ...p, name: joinName(p.familyName, p.givenName) || p.name }} size={72} />
            <span className="edit-photo-label">{p.photo ? "写真を変更" : "写真を追加"}</span>
            <input type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </label>
          <div className="fgroup-body grow">
            <Row label="姓" value={p.familyName} onChange={(v) => set("familyName", v)} list="dl-family" autoFocus={!id} />
            <Row label="名" value={p.givenName} onChange={(v) => set("givenName", v)} />
            <Row label="せい" value={p.familyKana} onChange={(v) => set("familyKana", v)} />
            <Row label="めい" value={p.givenKana} onChange={(v) => set("givenKana", v)} />
          </div>
        </div>
        {p.photo ? (
          <button type="button" className="text-btn small" style={{ color: "var(--text-3)" }} onClick={() => set("photo", undefined)}>写真を外す</button>
        ) : (
          <label className="frow icon-char">
            <span className="frow-label">アイコン</span>
            <input className="frow-input" value={p.iconChar ?? ""} placeholder={iconCharOf({ name: joinName(p.familyName, p.givenName), givenName: p.givenName })}
              onChange={(e) => set("iconChar", e.target.value || undefined)} style={{ maxWidth: 80 }} />
          </label>
        )}
        {error && <p className="error">{error}</p>}

        {/* ---- 選ぶもの：区分・性別・重要 */}
        <Group>
          {!p.isSelf && (
            <div className="frow">
              <span className="frow-label">区分</span>
              <Segmented options={CATEGORIES} labels={CATEGORY_LABEL} value={p.category} onChange={(v) => v && set("category", v)} />
            </div>
          )}
          <div className="frow">
            <span className="frow-label">性別</span>
            <Segmented options={GENDERS} labels={GENDER_LABEL} value={p.gender} onChange={(v) => set("gender", v)} />
          </div>
          {!p.isSelf && (
            <label className="frow frow-switch">
              <span className="frow-label">重要な人</span>
              <span className="small muted grow">一覧のいちばん上に出す</span>
              <input type="checkbox" className="switch" checked={!!p.pinned} onChange={(e) => set("pinned", e.target.checked)} />
            </label>
          )}
        </Group>

        {/* ---- 自分からの気持ち */}
        {!p.isSelf && (
          <Group title="自分からの気持ち" footer="この欄は自分だけが見るもの。タップで選び、もう一度タップで解除">
            <FeelingMeter bare person={p} onChange={(patch) => setP((cur) => ({ ...cur, ...patch }))} />
          </Group>
        )}

        {/* ---- グループ・タグ（タップで付け外し） */}
        <Group title="所属グループ" footer="会社・学校・部活など、どこの集まりにいるか">
          <div className="token-box">
            {groups.map((g) => {
              const on = p.groups.includes(g.id);
              return (
                <button type="button" key={g.id} className={`chip ${on ? "on" : ""}`}
                  onClick={() => set("groups", on ? p.groups.filter((x) => x !== g.id) : [...p.groups, g.id])}>
                  {on ? "✓ " : ""}{g.name}
                </button>
              );
            })}
            <button type="button" className="chip ghost" onClick={() => setNewGroup(true)}>＋ 新しいグループ</button>
          </div>
        </Group>

        <Group title="特徴タグ" footer="キーマン・酒好きなど、どんな人か">
          <div className="token-box">
            {p.tags.map((t) => (
              <span key={t} className="chip on">
                #{t}
                <button type="button" className="chip-x" aria-label={`${t} を外す`} onClick={() => set("tags", p.tags.filter((x) => x !== t))}>×</button>
              </span>
            ))}
            <input className="token-input" value={tagDraft} placeholder="特徴を入力して改行" enterKeyHint="done"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addTag(tagDraft);
                }
              }} />
          </div>
          {suggest.tags.filter((t) => !p.tags.includes(t)).length > 0 && (
            <div className="token-suggest">
              {suggest.tags.filter((t) => !p.tags.includes(t) && (!tagDraft || t.includes(tagDraft))).slice(0, 12).map((t) => (
                <button type="button" key={t} className="chip ghost" onClick={() => addTag(t)}>#{t}</button>
              ))}
            </div>
          )}
        </Group>

        {/* ---- 入っている項目・足した項目だけ出す */}
        {SECTIONS.map((s) => {
          const keys = s.keys.filter(([k]) => isVisible(k));
          if (!keys.length) return null;
          return (
            <Group key={s.title} title={s.title}>
              {keys.map(([k, label]) => fieldRow(k, label))}
            </Group>
          );
        })}

        {/* ---- 項目を追加 */}
        {hidden.length > 0 && (
          <div className="add-fields">
            <div className="fgroup-title">項目を追加</div>
            {hidden.map((s) => (
              <div key={s.title} className="add-fields-row">
                <span className="add-fields-head">{s.title}</span>
                <div className="token-box flat">
                  {s.keys.map(([k, label]) => (
                    <button type="button" key={k} className="chip ghost" onClick={() => add(k)}>＋ {label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {id && !p.isSelf && (
          <button type="button" className="btn danger" style={{ width: "100%", marginTop: 24 }} onClick={() => void onDelete()}>
            <Icon name="trash" size={16} /> この人を削除
          </button>
        )}

        <datalist id="dl-org">{suggest.org.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-dept">{suggest.dept.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-title">{suggest.title.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-met">{suggest.metHow.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-family">{suggest.familyName.map((x) => <option key={x} value={x} />)}</datalist>
      </main>

      {/* 保存ボタンは常に画面下に */}
      <div className="save-bar">
        <button type="button" className="btn primary" onClick={() => void onSave()} disabled={busy}>保存</button>
      </div>

      {newGroup && (
        <GroupEditSheet
          onClose={() => setNewGroup(false)}
          onSaved={(g) => set("groups", [...p.groups, g.id])}
        />
      )}
    </>
  );
};
