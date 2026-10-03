// src/ui/MapPage.tsx — 相関図・家系図の画面

import { useEffect, useMemo, useState } from "react";
import { buildCombined, buildFamily } from "../graph";
import { SELF_ID, selfLabel } from "../model";
import { navigate, useRoute } from "../router";
import { alive, useData } from "../store";
import { Avatar, Icon, PersonPicker } from "./common";
import { GraphLegend, GraphView } from "./GraphView";

type Mode = "radial" | "family";

// 画面を離れても最後に見ていた状態を覚えておく
const memo = { center: SELF_ID, mode: "radial" as Mode, depth: 2 as 1 | 2 };

export const MapPage = () => {
  const data = useData();
  const { query } = useRoute();
  const [picking, setPicking] = useState(false);

  // URL で指定があればそれを優先（人物ページの「図で見る」から来たとき）
  const qc = query.get("c");
  if (qc && qc !== memo.center) memo.center = qc;
  const [center, setCenterState] = useState(memo.center);
  const [mode, setModeState] = useState<Mode>((query.get("m") as Mode) || memo.mode);
  const [depth, setDepthState] = useState<1 | 2>(memo.depth);
  // 同じ画面のまま別の人の「相関図」ボタンから来たときも中心を切り替える
  useEffect(() => {
    if (qc) setCenterState(qc);
  }, [qc]);

  const setCenter = (id: string): void => {
    memo.center = id;
    setCenterState(id);
    navigate(`/map?c=${id}`, true);
  };
  const setMode = (m: Mode): void => {
    memo.mode = m;
    setModeState(m);
  };
  const setDepth = (d: 1 | 2): void => {
    memo.depth = d;
    setDepthState(d);
  };

  const person = data.persons.find((p) => p.id === center && !p.deleted) ?? data.persons.find((p) => p.id === SELF_ID);
  const centerId = person?.id ?? SELF_ID;
  const graph = useMemo(
    () => (mode === "family" ? buildFamily(data, centerId) : buildCombined(data, centerId, depth)),
    [data, centerId, mode, depth],
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
          <button type="button" className={mode === "radial" ? "on" : ""} onClick={() => setMode("radial")}>相関図</button>
          <button type="button" className={mode === "family" ? "on" : ""} onClick={() => setMode("family")}>家系図</button>
        </div>
      </div>

      {mode === "radial" && (
        <div className="map-sub">
          <GraphLegend />
          <div className="segment tiny-seg">
            <button type="button" className={depth === 1 ? "on" : ""} onClick={() => setDepth(1)}>直接</button>
            <button type="button" className={depth === 2 ? "on" : ""} onClick={() => setDepth(2)}>2つ先まで</button>
          </div>
        </div>
      )}
      {mode === "family" && (
        <div className="map-sub">
          <GraphLegend family />
          <span className="small muted">上が上の世代・きょうだいは左が年上</span>
        </div>
      )}

      {lonely ? (
        <div className="empty" style={{ paddingTop: 60 }}>
          {mode === "family" ? "家族のつながり（親・子・配偶者・兄弟姉妹）" : "つながり"}がまだ登録されていません。
          <br />
          {relCount === 0 && "人のページの「つながり」から、親・上司・紹介者などを登録すると図になります。"}
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn primary" style={{ display: "inline-flex", flex: "none", padding: "10px 18px" }}
              onClick={() => navigate(`/p/${centerId}?tab=links`)}>
              <Icon name="link" size={16} /> {person.isSelf ? "自分" : person.name}のつながりを追加
            </button>
          </div>
        </div>
      ) : (
        <GraphView graph={graph} centerId={centerId} height="calc(100dvh - 250px - env(safe-area-inset-bottom))"
          onTap={(id) => (id === centerId ? navigate(`/p/${id}`) : setCenter(id))} />
      )}

      {!lonely && (
        <div className="map-hint small muted">
          人をタップ → その人を中心に ・ 中心の人をタップ → ページを開く
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
