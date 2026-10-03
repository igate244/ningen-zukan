// src/ui/Radar.tsx — 自分との関係レーダー（入力はいらず、記録やつながりから自動で出す）

import { useMemo } from "react";
import { daysSince } from "../dates";
import { type AppData, type Person, SELF_ID } from "../model";
import { alive, useData } from "../store";

interface Axis {
  label: string;
  value: number; // 0〜100
  hint: string;
}

const KNOW_FIELDS: Array<(p: Person) => unknown> = [
  (p) => p.birthDate, (p) => p.gender, (p) => p.org || p.dept, (p) => p.metHow || p.metDate, (p) => p.likes, (p) => p.dislikes,
  (p) => p.topics, (p) => p.values, (p) => p.learnings, (p) => p.work.report || p.work.contact, (p) => p.work.strengths,
  (p) => p.phone || p.email || p.sns, (p) => p.photo, (p) => p.note,
];

export const relationAxes = (d: AppData, p: Person): Axis[] => {
  const rels = alive(d.relations);
  const logs = alive(d.logs).filter((l) => l.personIds.includes(p.id));
  const mine = rels.find((r) => (r.a === SELF_ID && r.b === p.id) || (r.b === SELF_ID && r.a === p.id));

  const moodScore = mine?.mood === "close" ? 100 : mine?.mood === "normal" ? 60 : mine?.mood === "cool" ? 30 : mine?.mood === "bad" ? 8 : mine ? 50 : 20;
  const recent = logs.filter((l) => (daysSince(l.date) ?? 9999) <= 180).length;
  const last = logs.reduce<string | undefined>((m, l) => (!m || l.date > m ? l.date : m), undefined);
  const since = daysSince(last);
  const known = KNOW_FIELDS.filter((f) => !!f(p)).length / KNOW_FIELDS.length;
  const gave = p.favors.filter((f) => f.dir === "gave").length;
  const got = p.favors.filter((f) => f.dir === "got").length;
  const neighbors = (id: string) => new Set(rels.filter((r) => r.a === id || r.b === id).map((r) => (r.a === id ? r.b : r.a)));
  const a = neighbors(SELF_ID);
  const shared = [...neighbors(p.id)].filter((x) => x !== SELF_ID && a.has(x)).length;

  return [
    { label: "親しさ", value: moodScore, hint: mine?.mood ? "つながりの温度から" : "温度を付けると正確に" },
    { label: "会う頻度", value: Math.min(100, recent * 14), hint: `この半年の記録 ${recent}件` },
    { label: "最近さ", value: since === null ? 0 : Math.max(0, 100 - (since / 365) * 100), hint: since === null ? "記録なし" : `${since}日前` },
    { label: "知っている度", value: Math.round(known * 100), hint: `${Math.round(known * 100)}%` },
    { label: "お互いさま", value: gave + got === 0 ? 50 : Math.max(0, 100 - Math.abs(gave - got) * 20), hint: `してあげた ${gave} / してもらった ${got}` },
    { label: "共通の知り合い", value: Math.min(100, shared * 20), hint: `${shared}人` },
  ];
};

export const RelationRadar = ({ person }: { person: Person }) => {
  const data = useData();
  const axes = useMemo(() => relationAxes(data, person), [data, person]);
  const size = 310;
  const c = size / 2;
  const R = 86;
  const pt = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
    return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)];
  };
  const poly = axes.map((ax, i) => pt(i, Math.max(4, ax.value)).join(",")).join(" ");

  return (
    <div className="card radar">
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 300, display: "block", margin: "0 auto" }} role="img" aria-label="自分との関係">
        {[25, 50, 75, 100].map((v) => (
          <polygon key={v} points={axes.map((_, i) => pt(i, v).join(",")).join(" ")} fill="none" stroke="var(--line)" strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, 100);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />;
        })}
        <polygon points={poly} fill="var(--accent)" fillOpacity={0.22} stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {axes.map((ax, i) => {
          const [x, y] = pt(i, Math.max(4, ax.value));
          return <circle key={i} cx={x} cy={y} r={3} fill="var(--accent)" />;
        })}
        {axes.map((ax, i) => {
          const [x, y] = pt(i, 128);
          return (
            <text key={ax.label} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="var(--text-2)">
              {ax.label}
            </text>
          );
        })}
      </svg>
      <div className="radar-notes">
        {axes.map((ax) => (
          <div key={ax.label} className="small">
            <span className="muted">{ax.label}</span> {ax.hint}
          </div>
        ))}
      </div>
    </div>
  );
};
