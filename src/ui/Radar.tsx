// src/ui/Radar.tsx — 自分から見たその人のレーダーチャート（6 軸、各 1〜5）

import { FEEL_AXES, type Person, feelingType } from "../model";
import { navigate } from "../router";

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
    <button type="button" className="card radar" onClick={() => navigate(`/p/${person.id}/edit`)} aria-label="気持ちを編集">
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
      <div className="small muted" style={{ textAlign: "center", marginBottom: 4 }}>
        {filled < 3 ? "タップして「自分からの気持ち」を付けると形が出ます" : feelingType(person.like, person.trust) ?? "タップで編集"}
      </div>
    </button>
  );
};
