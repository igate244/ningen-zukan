// src/ui/GraphView.tsx — つながり図の描画（指でドラッグして移動、2 本指で拡大縮小）

import { type PointerEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { type GEdge, type GNode, type GToggle, type Graph, NODE_R } from "../graph";
import { useImageUrl } from "../image";
import { iconCharOf, selfLabel } from "../model";

const EDGE_STYLE: Record<GEdge["kind"], { color: string; dash?: string; width: number }> = {
  spouse: { color: "var(--edge-family)", width: 3 },
  exspouse: { color: "var(--edge-family)", width: 2, dash: "2 6" },
  family: { color: "var(--edge-family)", width: 2 },
  work: { color: "var(--edge-work)", width: 2 },
  friend: { color: "var(--edge-friend)", width: 2 },
  other: { color: "var(--edge-other)", width: 1.5, dash: "5 5" },
};

const COLORS = ["#6b8f71", "#7a7fb0", "#b07a6b", "#5f8fa8", "#a8875f", "#8f6b9a", "#5f9a8f", "#9a6b7a"];
const colorFor = (id: string): string => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

const short = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const GroupNode = ({ node, onTap }: { node: GNode; onTap: (id: string) => void }) => {
  const g = node.group!;
  return (
    <g transform={`translate(${node.x},${node.y})`} onClick={() => onTap(node.id)} style={{ cursor: "pointer" }}>
      <rect x={-34} y={-24} width={68} height={48} rx={16} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2}
        strokeDasharray={g.open ? undefined : "5 4"} />
      <text textAnchor="middle" y={-4} fontSize={17} fontWeight={800} fill="var(--accent)">{g.count}</text>
      <text textAnchor="middle" y={13} fontSize={9.5} className="g-sub">{g.open ? "閉じる" : "開く"}</text>
      <text y={24 + 17} textAnchor="middle" className="g-name" fontWeight={800} fontSize={12.5}>
        {short(g.name, 8)}
      </text>
    </g>
  );
};

const Node = ({ node, isCenter, onTap }: { node: GNode; isCenter: boolean; onTap: (id: string) => void }) => {
  const url = useImageUrl(node.person.photo);
  const r = isCenter ? NODE_R + 8 : NODE_R;
  const clip = `clip-${node.id}`;
  // 全角の空白は詰めて、長い名前は省略して隣と重ならないようにする
  const name = `${node.person.deathDate ? "故 " : ""}${selfLabel(node.person).replace(/[\s\u3000]+/g, " ")}`;
  return (
    <g transform={`translate(${node.x},${node.y})`} className="g-node" onClick={() => onTap(node.id)} style={{ cursor: "pointer" }}>
      <clipPath id={clip}>
        <circle r={r} />
      </clipPath>
      <circle r={r + 3} fill="var(--surface)"
        stroke={isCenter ? "var(--accent)" : node.person.gender === "male" ? "var(--g-male)" : node.person.gender === "female" ? "var(--g-female)" : "var(--line)"}
        strokeWidth={isCenter ? 3 : 2} />
      {url ? (
        <image href={url} x={-r} y={-r} width={r * 2} height={r * 2} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          <circle r={r} fill={colorFor(node.id)} />
          <text textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={r * 0.85} fontWeight={700}>
            {iconCharOf(node.person)}
          </text>
        </>
      )}
      <text y={r + 17} textAnchor="middle" className="g-name" fontWeight={isCenter ? 800 : 700} fontSize={isCenter ? 14 : 12.5}>
        {short(name, isCenter ? 9 : 7)}
      </text>
      {node.sub && (
        <text y={r + 32} textAnchor="middle" className="g-sub" fontSize={10.5}>
          {short(node.sub, 9)}
        </text>
      )}
    </g>
  );
};

const Toggle = ({ t, onToggle }: { t: GToggle; onToggle: (t: GToggle) => void }) => (
  <g transform={`translate(${t.x},${t.y})`} onClick={(e) => { e.stopPropagation(); onToggle(t); }} style={{ cursor: "pointer" }}>
    <circle r={14} fill="transparent" />
    <circle r={10} fill="var(--surface)" stroke="var(--edge-family)" strokeWidth={1.5} />
    <text textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} fill="var(--edge-family)">
      {t.collapsed ? "+" : "−"}
    </text>
    {t.collapsed && t.count > 0 && (
      <text x={14} textAnchor="start" dominantBaseline="central" fontSize={10} className="g-sub">
        {t.dir === "down" ? `子${t.count}人` : `親${t.count}人`}
      </text>
    )}
  </g>
);

export const GraphView = ({
  graph, centerId, onTap, height, onToggle,
}: {
  graph: Graph;
  centerId: string;
  onTap: (id: string) => void;
  height: number | string;
  onToggle?: (t: GToggle) => void;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 400 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; k: number; moved: boolean; sx: number; sy: number } | null>(null);

  // 入れ物の大きさに追従
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 図が変わったら全体が収まる倍率に戻す
  const fitK = useMemo(() => {
    if (!graph.width || !graph.height) return 1;
    return Math.min(1.2, Math.max(0.35, Math.min(size.w / graph.width, size.h / graph.height)));
  }, [graph, size]);
  useEffect(() => setView({ x: 0, y: 0, k: fitK }), [fitK, centerId, graph.nodes.length]);

  // 指を離した合図は、触れていた丸が描き直しで消えると svg まで届かないことがある。
  // 取りこぼすと「離したはずの指」が残り、以降のタッチがすべて 2 本指扱いになって反応しなくなるので、
  // 画面全体でも拾っておく。
  useEffect(() => {
    const drop = (e: globalThis.PointerEvent): void => {
      pointers.current.delete(e.pointerId);
    };
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
    return () => {
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
    };
  }, []);
  // 図が切り替わったら触っている指の記録もいったん空にする
  useEffect(() => {
    pointers.current.clear();
  }, [graph]);

  const onDown = (e: PointerEvent): void => {
    // 1 本目の指（ほかに触れている指が無い）なら、残っている古い記録は捨てる
    if (e.isPrimary) pointers.current.clear();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, moved: true, sx: 0, sy: 0 };
    } else {
      gesture.current = { dist: 0, k: view.k, moved: false, sx: e.clientX, sy: e.clientY };
    }
  };

  const onMove = (e: PointerEvent): void => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const k = Math.min(3, Math.max(0.25, (gesture.current.k * dist) / (gesture.current.dist || dist)));
      setView((v) => ({ ...v, k }));
    } else {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (gesture.current && Math.hypot(cur.x - gesture.current.sx, cur.y - gesture.current.sy) > 8) gesture.current.moved = true;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onUp = (e: PointerEvent): void => {
    pointers.current.delete(e.pointerId);
  };

  const onWheel = (e: WheelEvent): void => {
    const k = Math.min(3, Math.max(0.25, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ ...v, k }));
  };

  // ドラッグ直後のタップは無視する（動かしたつもりが人を選んでしまわないように）
  const tap = (id: string): void => {
    if (gesture.current?.moved) return;
    onTap(id);
  };

  const zoom = (f: number): void => setView((v) => ({ ...v, k: Math.min(3, Math.max(0.25, v.k * f)) }));

  return (
    <div ref={box} className="graph-box" style={{ height }}>
      <svg
        width={size.w}
        height={size.h}
        style={{ touchAction: "none", display: "block" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
        onWheel={onWheel}
      >
        <g transform={`translate(${size.w / 2 + view.x},${size.h / 2 + view.y}) scale(${view.k})`}>
          {graph.edges.map((e) => {
            const st = EDGE_STYLE[e.kind];
            // 夫婦・元夫婦は横の二重線（家系図の決まり）。元夫婦は真ん中に×
            if (e.kind === "spouse" || e.kind === "exspouse") {
              const [[x1, y1], [x2, y2]] = e.points;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              const sc = st.color;
              const sw = 2;
              return (
                <g key={e.id} opacity={e.faint ? 0.22 : 1}>
                  <line x1={x1} y1={y1 - 3} x2={x2} y2={y2 - 3} stroke={sc} strokeWidth={sw} />
                  <line x1={x1} y1={y1 + 3} x2={x2} y2={y2 + 3} stroke={sc} strokeWidth={sw} />
                  {e.kind === "exspouse" && (
                    <>
                      <line x1={mx - 7} y1={my - 9} x2={mx + 7} y2={my + 9} stroke="var(--danger)" strokeWidth={2.5} strokeLinecap="round" />
                      <line x1={mx + 7} y1={my - 9} x2={mx - 7} y2={my + 9} stroke="var(--danger)" strokeWidth={2.5} strokeLinecap="round" />
                    </>
                  )}
                </g>
              );
            }
            const width = st.width;
            const dash = st.dash;
            const d = e.control
              ? `M${e.points[0].join(",")} Q${e.control.join(",")} ${e.points[e.points.length - 1].join(",")}`
              : `M${e.points.map((p) => p.join(",")).join(" L")}`;
            return (
              <path key={e.id} d={d} fill="none" stroke={st.color} strokeWidth={width} strokeDasharray={dash}
                opacity={e.faint ? 0.22 : 1} strokeLinejoin="round" strokeLinecap="round" />
            );
          })}
          {graph.nodes.map((n) => (
            n.group ? <GroupNode key={n.id} node={n} onTap={tap} /> : <Node key={n.id} node={n} isCenter={n.id === centerId} onTap={tap} />
          ))}
          {onToggle && (graph.toggles ?? []).map((t) => (
            <Toggle key={t.key} t={t} onToggle={(x) => !gesture.current?.moved && onToggle(x)} />
          ))}
        </g>
      </svg>
      <div className="graph-zoom">
        <button type="button" onClick={() => zoom(1.25)} aria-label="拡大">＋</button>
        <button type="button" onClick={() => zoom(0.8)} aria-label="縮小">－</button>
        <button type="button" onClick={() => setView({ x: 0, y: 0, k: fitK })} aria-label="全体">⤢</button>
      </div>
    </div>
  );
};

export const GraphLegend = ({ family }: { family?: boolean }) => (
  <div className="graph-legend">
    <span><i style={{ background: "var(--edge-family)" }} />親子・家族</span>
    <span><i className="dbl" />夫婦</span>
    <span><i className="dbl" style={{ position: "relative" }}><b className="x">×</b></i>離婚</span>
    {!family && (
      <>
        <span><i style={{ background: "var(--edge-work)" }} />仕事</span>
        <span><i style={{ background: "var(--edge-friend)" }} />友人</span>
        <span><i className="dash" />紹介・その他</span>
      </>
    )}
  </div>
);
