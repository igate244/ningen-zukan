// src/ui/Radar.tsx — 自分から見たその人のレーダーチャート（6 軸、各 1〜5）

import { FEEL_AXES, type Person } from "../model";
import { savePerson } from "../store";
import { FeelingMeter } from "./Feeling";

export const RelationRadar = ({ person }: { person: Person }) => {
  const axes = FEEL_AXES.map((a) => ({ ...a, value: person[a.key] }));
  const filled = axes.filter((a) => a.value).length;
  const size = 300;
  const c = size / 2;
  const R = 92;
  const pt = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
    return [c + Math.cos(a) * R * (v / 5), c + Math.sin(a) * R * (v / 5)];
  };
  const poly = axes.map((ax, i) => pt(i, ax.value ?? 0).join(",")).join(" ");

  return (
    <div className="card radar">
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 290, display: "block", margin: "0 auto" }} role="img" aria-label="自分から見たこの人">
        {[1, 2, 3, 4, 5].map((v) => (
          <polygon key={v} points={axes.map((_, i) => pt(i, v).join(",")).join(" ")} fill="none" stroke="var(--line)" strokeWidth={v === 3 ? 1.4 : 1} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, 5);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />;
        })}
        {filled >= 3 && <polygon points={poly} fill="var(--accent)" fillOpacity={0.22} stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />}
        {axes.map((ax, i) => {
          if (!ax.value) return null;
          const [x, y] = pt(i, ax.value);
          return <circle key={ax.key} cx={x} cy={y} r={3.5} fill="var(--accent)" />;
        })}
        {axes.map((ax, i) => {
          const [x, y] = pt(i, 6.3);
          return (
            <text key={ax.key} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill={ax.value ? "var(--text-2)" : "var(--text-3)"}>
              {ax.label}
            </text>
          );
        })}
      </svg>
      {filled < 3 && <div className="small muted" style={{ textAlign: "center", marginBottom: 6 }}>3つ以上付けると形が出ます</div>}
      <FeelingMeter bare person={person} onChange={(patch) => void savePerson({ ...person, ...patch })} />
    </div>
  );
};
