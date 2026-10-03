// src/dates.ts — 日付の小道具（すべて端末のローカル日付で扱う）

export const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const today = (): string => toDateStr(new Date());

export const parseDate = (s?: string): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const startOfToday = (): Date => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

export const daysSince = (s?: string): number | null => {
  const d = parseDate(s);
  if (!d) return null;
  return Math.round((startOfToday().getTime() - d.getTime()) / 86_400_000);
};

export const sinceLabel = (s?: string): string => {
  const n = daysSince(s);
  if (n === null) return "";
  if (n <= 0) return "今日";
  if (n === 1) return "昨日";
  if (n < 31) return `${n}日前`;
  if (n < 365) return `${Math.floor(n / 30)}か月前`;
  return `${Math.floor(n / 365)}年前`;
};

export const age = (birth?: string, yearUnknown?: boolean): number | null => {
  const d = parseDate(birth);
  if (!d || yearUnknown) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
  return a;
};

/** 次の誕生日まで何日か */
export const daysToBirthday = (birth?: string): number | null => {
  const d = parseDate(birth);
  if (!d) return null;
  const t = startOfToday();
  let next = new Date(t.getFullYear(), d.getMonth(), d.getDate());
  if (next < t) next = new Date(t.getFullYear() + 1, d.getMonth(), d.getDate());
  return Math.round((next.getTime() - t.getTime()) / 86_400_000);
};

export const formatDate = (s?: string): string => {
  const d = parseDate(s);
  if (!d) return s ?? "";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

export const formatMonthDay = (s?: string): string => {
  const d = parseDate(s);
  if (!d) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

/** 亡くなった人の享年（満年齢） */
export const ageAtDeath = (birth?: string, death?: string, yearUnknown?: boolean): number | null => {
  const b = parseDate(birth);
  const d = parseDate(death);
  if (!b || !d || yearUnknown) return null;
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a;
};

/** 年忌法要の呼び名（亡くなってから year 年目の命日） */
export const kaikiLabel = (yearsAfter: number): string | null => {
  const map: Record<number, string> = { 1: "一周忌", 2: "三回忌", 6: "七回忌", 12: "十三回忌", 16: "十七回忌", 22: "二十三回忌", 26: "二十七回忌", 32: "三十三回忌", 49: "五十回忌" };
  return map[yearsAfter] ?? null;
};
