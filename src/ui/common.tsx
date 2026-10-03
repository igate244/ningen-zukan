// src/ui/common.tsx — 画面共通の部品

import { type ReactNode, useMemo, useState } from "react";
import { useImageUrl } from "../image";
import { type Person, iconCharOf, selfLabel } from "../model";
import { goBack } from "../router";
import { alive, useData } from "../store";

// ------------------------------------------------------------------ アイコン

const PATHS: Record<string, string> = {
  back: "M15 18l-6-6 6-6",
  plus: "M12 5v14M5 12h14",
  people: "M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.87M16 4.13a3 3 0 010 5.75",
  log: "M4 5h16M4 10h16M4 15h10M4 20h7",
  org: "M12 3v5M5 13v-2h14v2M5 13v3M19 13v3M12 8v8M9 3h6v5H9zM2 16h6v5H2zM16 16h6v5h-6zM9 16h6v5H9z",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z",
  pen: "M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z",
  close: "M18 6L6 18M6 6l12 12",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  sync: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
  link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
  chevron: "M9 18l6-6-6-6",
  down: "M6 9l6 6 6-6",
  map: "M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0M5 5m-2 0a2 2 0 104 0 2 2 0 10-4 0M19 5m-2 0a2 2 0 104 0 2 2 0 10-4 0M5 19m-2 0a2 2 0 104 0 2 2 0 10-4 0M19 19m-2 0a2 2 0 104 0 2 2 0 10-4 0M6.5 6.5l3.3 3.3M17.5 6.5l-3.3 3.3M6.5 17.5l3.3-3.3M17.5 17.5l-3.3-3.3",
};

export const Icon = ({ name, size = 20, fill = false }: { name: keyof typeof PATHS | string; size?: number; fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor"
    strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[name] ?? ""} />
  </svg>
);

// -------------------------------------------------------------------- 顔

const COLORS = ["#6b8f71", "#7a7fb0", "#b07a6b", "#5f8fa8", "#a8875f", "#8f6b9a", "#5f9a8f", "#9a6b7a"];

const colorFor = (id: string): string => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

export const Avatar = ({ person, size = 40 }: { person?: Pick<Person, "id" | "name" | "photo" | "iconChar">; size?: number }) => {
  const url = useImageUrl(person?.photo);
  const initial = iconCharOf(person);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: url ? "transparent" : colorFor(person?.id ?? "x") }}>
      {url ? <img src={url} alt="" /> : initial}
    </span>
  );
};

// ------------------------------------------------------------------ 枠組み

export const TopBar = ({ title, back, right }: { title: string; back?: string | true; right?: ReactNode }) => (
  <header className="topbar">
    {back && (
      <button type="button" className="icon-btn" aria-label="戻る" onClick={() => goBack(typeof back === "string" ? back : "/")}>
        <Icon name="back" size={22} />
      </button>
    )}
    <h1>{title}</h1>
    {right}
  </header>
);

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="field">
    <span className="field-label">{label}</span>
    {children}
    {hint && <span className="field-hint">{hint}</span>}
  </div>
);

// ------------------------------------------------------------- 人を選ぶシート

export const PersonPicker = ({
  title, selected, multiple, excludeIds = [], includeSelf = false, onDone, onClose,
}: {
  title: string;
  selected: string[];
  multiple: boolean;
  excludeIds?: string[];
  includeSelf?: boolean;
  onDone: (ids: string[]) => void;
  onClose: () => void;
}) => {
  const data = useData();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>(selected);

  const people = useMemo(() => {
    const query = q.trim().toLowerCase();
    return alive(data.persons)
      .filter((p) => (includeSelf || !p.isSelf) && !excludeIds.includes(p.id))
      .filter((p) => !query || [p.name, p.kana, p.nickname, p.org, p.dept].some((s) => s?.toLowerCase().includes(query)))
      .sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : (a.kana || a.name).localeCompare(b.kana || b.name, "ja")));
  }, [data.persons, q, excludeIds, includeSelf]);

  const toggle = (id: string): void => {
    if (!multiple) {
      onDone([id]);
      return;
    }
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          {multiple ? (
            <button type="button" className="text-btn" onClick={() => onDone(picked)}>
              決定（{picked.length}）
            </button>
          ) : (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="閉じる">
              <Icon name="close" />
            </button>
          )}
        </div>
        <input className="search" placeholder="名前・所属で検索" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="sheet-body">
          <div className="list card">
            {people.length === 0 && <div className="empty">該当する人がいません</div>}
            {people.map((p) => (
              <button type="button" key={p.id} className="row" onClick={() => toggle(p.id)}>
                <Avatar person={p} size={34} />
                <div className="row-main">
                  <div className="row-name">{selfLabel(p)}</div>
                  <div className="row-sub">{[p.org, p.dept, p.title].filter(Boolean).join(" ・ ")}</div>
                </div>
                {multiple && (
                  <input type="checkbox" readOnly checked={picked.includes(p.id)} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
