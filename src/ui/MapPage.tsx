// src/ui/MapPage.tsx — 相関図の画面（親族／仕事／プライベートの 3 つを切り替え）

import { useEffect, useMemo, useState } from "react";
import { type Collapse, type GToggle, SCOPE_LABEL, type Scope, buildFamily, buildScoped, scopesOf } from "../graph";
import { SELF_ID, selfLabel } from "../model";
import { navigate, useRoute } from "../router";
import { alive, useData } from "../store";
import { Avatar, Icon, PersonPicker } from "./common";
import { GraphLegend, GraphView } from "./GraphView";

type Mode = Scope;
const MODES: Mode[] = ["kin", "work", "private"];

// 画面を離れても最後に見ていた状態を覚えておく
const memo = { center: SELF_ID, mode: "work" as Mode, depth: 2 as 1 | 2, collapse: { down: new Set<string>(), up: new Set<string>() } as Collapse };

export const MapPage = () => {
  const data = useData();
  const { query } = useRoute();
  const [picking, setPicking] = useState(false);

  // URL で指定があればそれを優先（人物ページの「図で見る」から来たとき）
  const qc = query.get("c");
  if (qc && qc !== memo.center) memo.center = qc;
  const [center, setCenterState] = useState(memo.center);
  const qm = query.get("m") as Mode | null;
  const [mode, setModeState] = useState<Mode>(qm && MODES.includes(qm) ? qm : memo.mode);
  const [depth, setDepthState] = useState<1 | 2>(memo.depth);
  const [collapse, setCollapse] = useState<Collapse>(memo.collapse);
  const toggleGroup = (gid: string): void => {
    const open = new Set(collapse.groupsOpen ?? []);
    if (open.has(gid)) open.delete(gid);
    else open.add(gid);
    const next = { ...collapse, groupsOpen: open };
    memo.collapse = next;
    setCollapse(next);
  };
  const toggle = (t: GToggle): void => {
    const set = new Set(t.dir === "down" ? collapse.down : collapse.up);
    for (const id of t.ids) {
      if (t.collapsed) set.delete(id);
      else set.add(id);
    }
    const next = t.dir === "down" ? { ...collapse, down: set } : { ...collapse, up: set };
    memo.collapse = next;
    setCollapse(next);
  };
  // 同じ画面のまま別の人の「相関図」ボタンから来たときも中心を切り替える
  useEffect(() => {
    if (!qc) return;
    setCenterState(qc);
    pickModeFor(qc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  const setMode = (m: Mode): void => {
    memo.mode = m;
    setModeState(m);
  };
  // 中心の人が今の図に出ない人なら、その人が出る図に切り替える（親族 → 仕事 → プライベートの順に優先）
  const pickModeFor = (id: string): void => {
    const sc = scopesOf(data, id);
    if (sc.has(memo.mode)) return;
    const m = MODES.find((x) => sc.has(x));
    if (m) setMode(m);
  };
  const setCenter = (id: string): void => {
    memo.center = id;
    setCenterState(id);
    pickModeFor(id);
    navigate(`/map?c=${id}`, true);
  };
  const setDepth = (d: 1 | 2): void => {
    memo.depth = d;
    setDepthState(d);
  };

  const person = data.persons.find((p) => p.id === center && !p.deleted) ?? data.persons.find((p) => p.id === SELF_ID);
  const centerId = person?.id ?? SELF_ID;
  const graph = useMemo(
    () => (mode === "kin" ? buildFamily(data, centerId, Infinity, collapse) : buildScoped(data, centerId, mode, depth, collapse)),
    [data, centerId, mode, depth, collapse],
  );
  const relCount = useMemo(() => alive(data.relations).length, [data.relations]);

  if (!person) return null;
  const lonely = graph.nodes.length <= 1;

  return (
    <div className="map-page">
      <div className="map-controls">
        <button type="button" className="map-center" onClick={() => setPicking(true)}>
          <Avatar person={person} size={28} />
          <span className="map-center-name">{selfLabel(person)}</span>
          <Icon name="down" size={16} />
        </button>
        <div className="segment small-seg">
          {MODES.map((m) => (
            <button type="button" key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{SCOPE_LABEL[m]}</button>
          ))}
        </div>
      </div>

      {mode !== "kin" && (
        <div className="map-sub">
          <GraphLegend />
          <div className="segment tiny-seg">
            <button type="button" className={depth === 1 ? "on" : ""} onClick={() => setDepth(1)}>直接</button>
            <button type="button" className={depth === 2 ? "on" : ""} onClick={() => setDepth(2)}>2つ先まで</button>
          </div>
        </div>
      )}
      {mode === "kin" && (
        <div className="map-sub">
          <GraphLegend family />
          <span className="small muted">上が上の世代・きょうだいは左が年上</span>
        </div>
      )}

      {lonely ? (
        <div className="empty" style={{ paddingTop: 60 }}>
          {mode === "kin" ? "家族のつながり（親・子・配偶者・兄弟姉妹）" : mode === "work" ? "仕事のつながり（上司・同僚・仕事のグループ）" : "友人・紹介などのつながり"}がまだ登録されていません。
          <br />
          {relCount === 0 && "人のページの「つながり」から、親・上司・紹介者などを登録すると図になります。"}
          {mode !== "kin" && " 区分やグループを付けるとこちらに出ます。"}
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn primary" style={{ display: "inline-flex", flex: "none", padding: "10px 18px" }}
              onClick={() => navigate(`/p/${centerId}?tab=links`)}>
              <Icon name="link" size={16} /> {person.isSelf ? "自分" : person.name}のつながりを追加
            </button>
          </div>
        </div>
      ) : (
        <GraphView graph={graph} centerId={centerId} height="calc(100dvh - 250px - env(safe-area-inset-bottom))"
          onTap={(id) => (id.startsWith("grp:") ? toggleGroup(id.slice(4)) : id === centerId ? navigate(`/p/${id}`) : setCenter(id))} onToggle={toggle} />
      )}

      {!lonely && (
        <div className="map-hint small muted">
          タップで中心を移動（中心の人はページへ）・ −／＋ でたたむ／開く
        </div>
      )}

      {picking && (
        <PersonPicker
          title="中心にする人"
          multiple={false}
          includeSelf
          selected={[]}
          onDone={(ids) => {
            if (ids[0]) setCenter(ids[0]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};
