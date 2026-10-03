// src/ui/OrgPage.tsx — 組織ごと・部署ごとに人を並べる
// （上司・部下のつながりが登録されていれば、部署内で上の人から並べる）

import { useMemo, useState } from "react";
import type { Person } from "../model";
import { navigate } from "../router";
import { alive, useData } from "../store";
import { Avatar, Icon } from "./common";

const NO_ORG = "（組織未設定）";
const NO_DEPT = "（部署未設定）";

export const OrgPage = () => {
  const data = useData();
  const [openOrg, setOpenOrg] = useState<Record<string, boolean>>({});

  const tree = useMemo(() => {
    const people = alive(data.persons).filter((p) => !p.isSelf && (p.category === "work" || p.org));
    // 上司として何人の上にいるか → 部署内の並び順に使う
    const bossScore = new Map<string, number>();
    for (const r of alive(data.relations)) {
      if (r.type !== "boss") continue;
      bossScore.set(r.a, (bossScore.get(r.a) ?? 0) + 1);
      bossScore.set(r.b, (bossScore.get(r.b) ?? 0) - 1);
    }
    const orgs = new Map<string, Map<string, Person[]>>();
    for (const p of people) {
      const org = p.org?.trim() || NO_ORG;
      const dept = p.dept?.trim() || NO_DEPT;
      if (!orgs.has(org)) orgs.set(org, new Map());
      const depts = orgs.get(org)!;
      depts.set(dept, [...(depts.get(dept) ?? []), p]);
    }
    return [...orgs.entries()]
      .sort(([a], [b]) => (a === NO_ORG ? 1 : b === NO_ORG ? -1 : a.localeCompare(b, "ja")))
      .map(([org, depts]) => ({
        org,
        count: [...depts.values()].reduce((n, l) => n + l.length, 0),
        depts: [...depts.entries()]
          .sort(([a], [b]) => (a === NO_DEPT ? 1 : b === NO_DEPT ? -1 : a.localeCompare(b, "ja")))
          .map(([dept, list]) => ({
            dept,
            list: list.sort((a, b) => (bossScore.get(b.id) ?? 0) - (bossScore.get(a.id) ?? 0) || (a.kana || a.name).localeCompare(b.kana || b.name, "ja")),
          })),
      }));
  }, [data.persons, data.relations]);

  if (tree.length === 0) {
    return <div className="empty">区分が「仕事」の人や、会社・組織を入れた人がここに並びます。</div>;
  }

  return (
    <>
      {tree.map(({ org, count, depts }) => {
        const isOpen = openOrg[org] ?? tree.length <= 3;
        return (
          <div className="card section" key={org} style={{ overflow: "hidden" }}>
            <button type="button" className="org-head" onClick={() => setOpenOrg((o) => ({ ...o, [org]: !isOpen }))}>
              <span>
                {org} <span className="muted small">{count}人</span>
              </span>
              <span className="muted" style={{ transform: isOpen ? "rotate(180deg)" : undefined, display: "inline-flex" }}>
                <Icon name="down" size={18} />
              </span>
            </button>
            {isOpen &&
              depts.map(({ dept, list }) => (
                <div key={dept} style={{ borderTop: "1px solid var(--line)" }}>
                  <div className="dept-label">{dept}</div>
                  {list.map((p) => (
                    <button type="button" key={p.id} className="row" onClick={() => navigate(`/p/${p.id}`)}>
                      <Avatar person={p} size={34} />
                      <div className="row-main">
                        <div className="row-name">{p.name}</div>
                        <div className="row-sub">{p.title ?? ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
          </div>
        );
      })}
    </>
  );
};
