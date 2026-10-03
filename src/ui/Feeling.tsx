// src/ui/Feeling.tsx — 自分から見たその人の 5 段階メーター（好意・信頼・尊敬・居心地・価値観・影響）

import { FEEL_AXES, type FeelKey, type Person, feelingType } from "../model";

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

export const FeelingMeter = ({ person, keys, onChange, bare }: {
  person: Pick<Person, FeelKey>;
  keys?: FeelKey[];
  onChange: (patch: Partial<Pick<Person, FeelKey>>) => void;
  bare?: boolean;
}) => {
  const axes = keys ? FEEL_AXES.filter((a) => keys.includes(a.key)) : FEEL_AXES;
  const type = feelingType(person.like, person.trust);
  return (
    <div className={bare ? "feel bare" : "feel"}>
      {axes.map((a) => (
        <Scale key={a.key} label={a.label} value={person[a.key]} labels={a.levels} onChange={(v) => onChange({ [a.key]: v })} />
      ))}
      {type && <div className="feel-type">{type}</div>}
    </div>
  );
};
