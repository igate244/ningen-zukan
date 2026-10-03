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

export const CATEGORIES = ["work", "family", "relative", "friend", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  work: "仕事",
  family: "家族",
  relative: "親族",
  friend: "友人",
  other: "その他",
};

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

export interface Person extends Base {
  name: string;
  kana?: string;
  nickname?: string;
  category: Category;
  tags: string[];
  /** 画像 ID（images テーブル） */
  photo?: string;
  pinned?: boolean;
  /** 自分自身を表す特別な人物 */
  isSelf?: boolean;

  // 現在の所属
  org?: string;
  dept?: string;
  title?: string;
  /** 過去の所属・異動の履歴 */
  careers: Career[];

  birthDate?: string; // YYYY-MM-DD
  birthYearUnknown?: boolean;
  metDate?: string;
  metHow?: string;

  phone?: string;
  email?: string;
  sns?: string;

  // 取扱説明書
  likes?: string;
  dislikes?: string;
  topics?: string;
  values?: string;
  work: WorkManual;

  learnings?: string;
  note?: string;

  /** 次に会ったときに話したいこと */
  nextTopics: CheckItem[];
  /** 貸し借り・頼まれごと */
  favors: Favor[];
}

export const REL_TYPES = ["parent", "spouse", "sibling", "boss", "colleague", "friend", "introduced", "other"] as const;
export type RelType = (typeof REL_TYPES)[number];

/**
 * 人と人のつながり。向きのある種類は a → b の向きで読む。
 *   parent:     a は b の親
 *   boss:       a は b の上司
 *   introduced: a が b を紹介してくれた / a の紹介で b と知り合った
 */
export interface Relation extends Base {
  a: string;
  b: string;
  type: RelType;
  label?: string;
  note?: string;
}

/** ある人から見た相手の呼び名 */
export const relationLabelFrom = (rel: Relation, viewerId: string): string => {
  if (rel.label) return rel.label;
  const isA = rel.a === viewerId;
  switch (rel.type) {
    case "parent":
      return isA ? "子" : "親";
    case "spouse":
      return "配偶者";
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
  { key: "sibling", label: "兄弟姉妹", type: "sibling", otherIsA: true },
  { key: "boss", label: "上司", type: "boss", otherIsA: true },
  { key: "sub", label: "部下", type: "boss", otherIsA: false },
  { key: "colleague", label: "同僚", type: "colleague", otherIsA: true },
  { key: "friend", label: "友人", type: "friend", otherIsA: true },
  { key: "introducer", label: "紹介してくれた人", type: "introduced", otherIsA: true },
  { key: "introducee", label: "紹介した相手", type: "introduced", otherIsA: false },
  { key: "other", label: "その他", type: "other", otherIsA: true },
];

export const LOG_KINDS = ["meet", "talk", "meeting", "helped", "helping", "conflict", "other"] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export const LOG_KIND_LABEL: Record<LogKind, string> = {
  meet: "会った",
  talk: "話した・連絡",
  meeting: "打ち合わせ",
  helped: "助けてもらった",
  helping: "助けた",
  conflict: "ぶつかった",
  other: "その他",
};

export interface LogEntry extends Base {
  date: string; // YYYY-MM-DD
  personIds: string[];
  kind: LogKind;
  text: string;
}

/** 画像の目録（同期対象）。実体の Blob は端末内の別テーブルにある */
export interface ImageMeta extends Base {
  driveId?: string;
  mime: string;
}

export interface AppData {
  persons: Person[];
  relations: Relation[];
  logs: LogEntry[];
  images: ImageMeta[];
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
    careers: [],
    work: {},
    nextTopics: [],
    favors: [],
  };
};

/** 古い・欠けたデータを現在の形にそろえる（読み込み時に必ず通す） */
export const normalizePerson = (raw: Partial<Person> & { id: string }): Person => ({
  ...emptyPerson(),
  ...raw,
  tags: Array.isArray(raw.tags) ? raw.tags : [],
  careers: Array.isArray(raw.careers) ? raw.careers : [],
  work: raw.work ?? {},
  nextTopics: Array.isArray(raw.nextTopics) ? raw.nextTopics : [],
  favors: Array.isArray(raw.favors) ? raw.favors : [],
  category: (CATEGORIES as readonly string[]).includes(raw.category ?? "") ? (raw.category as Category) : "other",
});

/** 表示名（自分は「名前（自分）」、名前が未設定なら「自分」） */
export const selfLabel = (p: Pick<Person, "name" | "isSelf">): string =>
  p.isSelf ? (p.name && p.name !== "自分" ? `${p.name}（自分）` : "自分") : p.name;
