// src/ui/Feeling.tsx — 自分からの「好き」「信頼」の 5 段階メーター

import { LIKE_LABEL, TRUST_LABEL, feelingType } from "../model";

const Scale = ({ label, value, labels, onChange }: { label: string; value?: number; labels: string[]; onChange: (v: number | undefined) => void }) => (
  <div className="feel-row">
    <span className="feel-label">{label}</span>
    <div className="feel-scale" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={labels[n]}
          className={`feel-step lv${n} ${value === n ? "on" : ""} ${value && n <= value ? "fill" : ""}`}
          onClick={() => onChange(value === n ? undefined : n)} />
      ))}
    </div>
    <span className={`feel-value ${value ? `lv${value}` : ""}`}>{value ? labels[value] : "未設定"}</span>
  </div>
);

export const FeelingMeter = ({ like, trust, onChange }: { like?: number; trust?: number; onChange: (patch: { like?: number; trust?: number }) => void }) => {
  const type = feelingType(like, trust);
  return (
    <div className="feel">
      <Scale label="好き" value={like} labels={LIKE_LABEL} onChange={(v) => onChange({ like: v })} />
      <Scale label="信頼" value={trust} labels={TRUST_LABEL} onChange={(v) => onChange({ trust: v })} />
      {type && <div className="feel-type">{type}</div>}
    </div>
  );
};
