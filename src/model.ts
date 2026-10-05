// src/model.ts — データの形と表示用ラベル
//
// すべてのレコードは id / createdAt / updatedAt / deleted を持つ。
// 削除は「deleted: true」の印を付けるだけにして、端末間・ドライブ間の同期で
// 「消した」という事実も伝わるようにしている（物理削除すると別端末から復活してしまう）。

export interface Base {
  id: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export const CATEGORIES = ["work", "family", "friend"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  work: "仕事",
  family: "家族・親族",
  friend: "友人・知人",
};

/** 区分をそろえる（以前の「親族」は家族・親族へ、「その他」や不明は友人・知人へ） */
export const toCategory = (raw: unknown): Category =>
  raw === "work" ? "work" : raw === "family" || raw === "relative" ? "family" : "friend";

export interface Career {
  id: string;
  from?: string; // YYYY-MM
  to?: string; // YYYY-MM（空なら現在も）
  org?: string;
  dept?: string;
  title?: string;
  note?: string;
}

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface Favor {
  id: string;
  /** gave = 自分がした / got = 自分がしてもらった */
  dir: "gave" | "got";
  text: string;
  date?: string;
  settled: boolean;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

/** 以前の版にあった項目（読み込み時にメモへ移す） */
export interface WorkManual {
  /** 報告・相談の好み（結論から / 細かく / 文書で など） */
  report?: string;
  /** 通じやすい連絡手段 */
  contact?: string;
  /** つかまりやすい時間・タイミング */
  timing?: string;
  /** 何を評価する人か */
  evaluates?: string;
  /** 得意なこと・頼れること */
  strengths?: string;
}

export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<Gender, string> = { male: "男性", female: "女性", other: "その他" };

export interface Person extends Base {
  /** 表示名（姓と名から自動で作る。姓・名が無い古いデータはこれだけ） */
  name: string;
  familyName?: string;
  givenName?: string;
  kana?: string;
  familyKana?: string;
  givenKana?: string;
  nickname?: string;
  category: Category;
  tags: string[];
  /** 所属しているグループの ID */
  groups: string[];
  /** 画像 ID（images テーブル） */
  photo?: string;
  /** 写真が無いときのアイコンの文字（未設定なら名前の 1 文字目） */
  iconChar?: string;
  pinned?: boolean;
  /** 自分自身を表す特別な人物 */
  isSelf?: boolean;

  // 仕事（ほかはメモに書く）
  org?: string;
  dept?: string;

  gender?: Gender;
  birthDate?: string; // YYYY-MM-DD
  birthYearUnknown?: boolean;
  /** 命日（亡くなった日） */
  deathDate?: string;
  /** 兄弟姉妹の中で何番目に生まれたか（誕生日がわからないときの並び用） */
  birthOrder?: number;
  /** 出会い（いつ・どこで・きっかけをまとめて 1 つのメモに） */
  metHow?: string;

  phone?: string;
  email?: string;
  sns?: string;
  address?: string;

  // その人のこと
  /** 好きなもの（食べ物・お酒・趣味） */
  likes?: string;
  /** 苦手なもの・NG */
  dislikes?: string;
  /** 家族のこと（パートナー・子ども・ペットの名前など） */
  familyNote?: string;
  /** 近況 */
  recent?: string;
  /** 贈り物（あげた・もらった・あげたい物） */
  gifts?: string;

  note?: string;
  /** 自分で足した項目 */
  custom: CustomField[];

  /** 次に会ったときに話したいこと */
  nextTopics: CheckItem[];
  /** 貸し借り・頼まれごと */
  favors: Favor[];
}

export const REL_TYPES = ["parent", "spouse", "exspouse", "sibling", "boss", "colleague", "friend", "introduced", "other"] as const;
export type RelType = (typeof REL_TYPES)[number];

/**
 * 人と人のつながり。向きのある種類は a → b の向きで読む。
 *   parent:     a は b の親
 *   boss:       a は b の上司
 *   introduced: a が b を紹介してくれた / a の紹介で b と知り合った
 *   exspouse:   元夫婦（離婚・死別など）
 */
export interface Relation extends Base {
  a: string;
  b: string;
  type: RelType;
  /** 呼び方（labelBy の人から見た相手の呼び名） */
  label?: string;
  labelBy?: string;
  note?: string;
  /** 関係の温度（今は使っていない。古いデータに残っているだけ） */
  mood?: Mood;
}

export const MOODS = ["close", "normal", "cool", "bad"] as const;
export type Mood = (typeof MOODS)[number];
export const MOOD_LABEL: Record<Mood, string> = { close: "仲良し", normal: "ふつう", cool: "微妙", bad: "険悪" };

/** ある人から見た相手の呼び名 */
export const relationLabelFrom = (rel: Relation, viewerId: string): string => {
  if (rel.label && rel.labelBy === viewerId) return rel.label;
  const isA = rel.a === viewerId;
  switch (rel.type) {
    case "parent":
      return isA ? "子" : "親";
    case "spouse":
      return "配偶者";
    case "exspouse":
      return "元配偶者";
    case "sibling":
      return "兄弟姉妹";
    case "boss":
      return isA ? "部下" : "上司";
    case "colleague":
      return "同僚";
    case "friend":
      return "友人";
    case "introduced":
      return isA ? "紹介した相手" : "紹介してくれた人";
    default:
      return "関係あり";
  }
};

/** 追加画面で選ぶ「相手は自分（この人）の◯◯」の選択肢 → 保存時の向き */
export const RELATION_CHOICES: Array<{ key: string; label: string; type: RelType; otherIsA: boolean }> = [
  { key: "parent", label: "親", type: "parent", otherIsA: true },
  { key: "child", label: "子", type: "parent", otherIsA: false },
  { key: "spouse", label: "配偶者", type: "spouse", otherIsA: true },
  { key: "exspouse", label: "元配偶者（離婚など）", type: "exspouse", otherIsA: true },
  { key: "sibling", label: "兄弟姉妹", type: "sibling", otherIsA: true },
  { key: "boss", label: "上司", type: "boss", otherIsA: true },
  { key: "sub", label: "部下", type: "boss", otherIsA: false },
  { key: "colleague", label: "同僚", type: "colleague", otherIsA: true },
  { key: "friend", label: "友人", type: "friend", otherIsA: true },
  { key: "introducer", label: "紹介してくれた人", type: "introduced", otherIsA: true },
  { key: "introducee", label: "紹介した相手", type: "introduced", otherIsA: false },
  { key: "other", label: "その他", type: "other", otherIsA: true },
];

export const LOG_KINDS = ["meet", "talk", "meeting", "helped", "helping", "conflict", "event", "other"] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export const LOG_KIND_LABEL: Record<LogKind, string> = {
  meet: "会った",
  talk: "話した・連絡",
  meeting: "打ち合わせ",
  helped: "助けてもらった",
  helping: "助けた",
  conflict: "ぶつかった",
  event: "イベント・予定",
  other: "その他",
};

export interface LogEntry extends Base {
  date: string; // YYYY-MM-DD
  personIds: string[];
  kind: LogKind;
  text: string;
  /** 毎年くり返す（結婚記念日など。イベントのときだけ使う） */
  yearly?: boolean;
  /** そのときの印象（今は使っていない。古いデータに残っているだけ） */
  impression?: Impression;
}

export const IMPRESSIONS = ["good", "neutral", "bad"] as const;
export type Impression = (typeof IMPRESSIONS)[number];
export const IMPRESSION_LABEL: Record<Impression, string> = { good: "よかった", neutral: "ふつう", bad: "いまいち" };
export const IMPRESSION_ICON: Record<Impression, string> = { good: "😊", neutral: "😐", bad: "😞" };



/** 画像の目録（同期対象）。実体の Blob は端末内の別テーブルにある */
export interface ImageMeta extends Base {
  driveId?: string;
  mime: string;
}

export const GROUP_KINDS = ["school", "work", "hobby", "local", "family", "other"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];
export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  school: "学校", work: "職場", hobby: "趣味", local: "地元・近所", family: "親戚", other: "その他",
};

/** 同期・クラス・部署・サークルなどのまとまり。人は Person.groups で所属する */
export interface Group extends Base {
  name: string;
  kind: GroupKind;
  /** いつ頃の仲間か（例: 2004〜2010） */
  period?: string;
  note?: string;
}

export interface AppData {
  persons: Person[];
  relations: Relation[];
  logs: LogEntry[];
  images: ImageMeta[];
  groups: Group[];
}

export const SELF_ID = "me";

export const newId = (): string =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 20);

export const emptyPerson = (name = ""): Person => {
  const now = Date.now();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    name,
    category: "work",
    tags: [],
    groups: [],
    custom: [],
    nextTopics: [],
    favors: [],
  };
};

/** 古い・欠けたデータを現在の形にそろえる（読み込み時に必ず通す） */
export const normalizePerson = (raw: Partial<Person> & { id: string }): Person => {
  const p: Person = {
    ...emptyPerson(),
    ...raw,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    groups: Array.isArray(raw.groups) ? raw.groups : [],
    custom: Array.isArray(raw.custom) ? raw.custom : [],
    nextTopics: Array.isArray(raw.nextTopics) ? raw.nextTopics : [],
    favors: Array.isArray(raw.favors) ? raw.favors : [],
    category: toCategory(raw.category),
  };
  return migrateLegacy(p, raw as LegacyPerson);
};

/** 以前の版の項目 */
interface LegacyPerson {
  title?: string;
  careers?: Career[];
  work?: WorkManual;
  topics?: string;
  values?: string;
  learnings?: string;
  metDate?: string;
  like?: number; trust?: number; respect?: number; comfort?: number; valueFit?: number; influence?: number;
}
const LEGACY_KEYS = ["title", "careers", "work", "topics", "values", "learnings", "metDate", "like", "trust", "respect", "comfort", "valueFit", "influence"] as const;

/**
 * 項目を整理したときの引っ越し。消えた項目に書いてあった文章は、見出しを付けてメモの末尾に移す（消さない）。
 * 何度通しても同じ結果になる（移したあとの元の項目は取り除く）。
 */
const migrateLegacy = (p: Person, raw: LegacyPerson): Person => {
  if (!LEGACY_KEYS.some((k) => k in raw)) return p;
  const lines: string[] = [];
  const add = (label: string, v?: string): void => {
    if (v && v.trim()) lines.push(`【${label}】${v.trim()}`);
  };
  add("役職", raw.title);
  for (const c of raw.careers ?? []) {
    const what = [c.org, c.dept, c.title, c.note].filter(Boolean).join(" ");
    if (what) add("所属の履歴", `${c.from ?? "?"}〜${c.to ?? ""} ${what}`);
  }
  const w = raw.work ?? {};
  add("報告・相談の好み", w.report);
  add("連絡手段", w.contact);
  add("つかまる時間", w.timing);
  add("評価する点", w.evaluates);
  add("得意・頼れる", w.strengths);
  add("盛り上がる話題", raw.topics);
  add("価値観・口ぐせ", raw.values);
  add("学んだこと", raw.learnings);
  const out = { ...p } as Person & LegacyPerson;
  if (lines.length) out.note = [p.note?.trim(), ...lines].filter(Boolean).join("\n");
  if (raw.metDate) {
    const [y, m, d] = raw.metDate.split("-").map(Number);
    const when = y ? `${y}年${m}月${d}日` : raw.metDate;
    out.metHow = p.metHow ? `${when} ${p.metHow}` : when;
  }
  for (const k of LEGACY_KEYS) delete out[k];
  return out;
};

/** 表示名（自分は「名前（自分）」、名前が未設定なら「自分」） */
export const selfLabel = (p: Pick<Person, "name" | "isSelf">): string =>
  p.isSelf ? (p.name && p.name !== "自分" ? `${p.name}（自分）` : "自分") : p.name;

/** アイコンに出す 1 文字（指定がなければ名の 1 文字目。家族で姓が同じでも見分けられるように） */
export const iconCharOf = (p?: Pick<Person, "name" | "iconChar" | "givenName">): string =>
  (p?.iconChar && [...p.iconChar.trim()][0]) ||
  (p?.givenName && [...p.givenName.trim()][0]) ||
  [...(splitName(p?.name ?? "").given ?? "?")][0] ||
  "?";

/** 「山田 太郎」「山田　太郎」を姓と名に分ける（空白が無ければ全部を名に） */
export const splitName = (full: string): { family?: string; given?: string } => {
  const parts = full.trim().split(/[\s\u3000]+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { given: parts[0] };
  return { family: parts[0], given: parts.slice(1).join(" ") };
};

export const joinName = (family?: string, given?: string): string => [family?.trim(), given?.trim()].filter(Boolean).join(" ");
