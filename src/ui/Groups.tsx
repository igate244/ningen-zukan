// src/ui/Groups.tsx — グループ（同期・クラス・部署・サークルなど）の一覧・詳細・編集

import { useMemo, useState } from "react";
import { buildGroup } from "../graph";
import { GROUP_KINDS, GROUP_KIND_LABEL, type Group, type GroupKind, newId, selfLabel } from "../model";
import { navigate } from "../router";
import { alive, deleteGroup, saveGroup, setGroupMembers, useData } from "../store";
import { Avatar, Field, Icon, PersonPicker, TopBar } from "./common";
import { GraphView, MoodLegend } from "./GraphView";
import { OrgPage } from "./OrgPage";

// ------------------------------------------------------------------ 一覧

export const GroupsPage = () => {
  const data = useData();
  const [creating, setCreating] = useState(false);
  const groups = useMemo(() => alive(data.groups ?? []).sort((a, b) => a.name.localeCompare(b.name, "ja")), [data.groups]);
  const members = (gid: string) => alive(data.persons).filter((p) => p.groups.includes(gid));

  return (
    <>
      <div className="section-title" style={{ marginTop: 4 }}>グループ</div>
      {groups.length === 0 ? (
        <div className="card fieldset small muted">
          「2015年入社の同期」「〇〇小 6年2組」「釣り仲間」のように人をまとめると、相関図ではグループごとに1つの丸にたためるので、線がごちゃつきません。
        </div>
      ) : (
        <div className="list card">
          {groups.map((g) => {
            const ms = members(g.id);
            return (
              <button type="button" key={g.id} className="row" onClick={() => navigate(`/g/${g.id}`)}>
                <div className="group-icon">{GROUP_KIND_LABEL[g.kind].charAt(0)}</div>
                <div className="row-main">
                  <div className="row-name">{g.name}</div>
                  <div className="row-sub">
                    {GROUP_KIND_LABEL[g.kind]}
                    {g.period ? ` ・ ${g.period}` : ""} ・ {ms.length}人
                  </div>
                </div>
                <div className="avatar-stack">
                  {ms.slice(0, 4).map((p) => <Avatar key={p.id} person={p} size={24} />)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="section-title" style={{ marginTop: 22 }}>会社・部署（所属から自動）</div>
      <OrgPage />

      <button type="button" className="fab" onClick={() => setCreating(true)}>
        <Icon name="plus" size={18} /> グループを作る
      </button>
      {creating && (
        <GroupEditSheet
          onClose={() => setCreating(false)}
          onSaved={(g) => {
            setCreating(false);
            navigate(`/g/${g.id}`);
          }}
        />
      )}
    </>
  );
};

// ------------------------------------------------------------------ 編集

export const GroupEditSheet = ({ group, onClose, onSaved }: { group?: Group; onClose: () => void; onSaved?: (g: Group) => void }) => {
  const [name, setName] = useState(group?.name ?? "");
  const [kind, setKind] = useState<GroupKind>(group?.kind ?? "work");
  const [period, setPeriod] = useState(group?.period ?? "");
  const [note, setNote] = useState(group?.note ?? "");

  const save = async (): Promise<void> => {
    if (!name.trim()) return;
    const g = await saveGroup({ ...(group ?? { id: newId() }), name: name.trim(), kind, period: period.trim() || undefined, note: note.trim() || undefined });
    onSaved?.(g);
    onClose();
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{group ? "グループを編集" : "グループを作る"}</h2>
          <button type="button" className="text-btn" disabled={!name.trim()} onClick={() => void save()}>保存</button>
        </div>
        <div className="sheet-body">
          <div className="form">
            <Field label="名前">
              <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="2015年入社の同期 / 〇〇小 6年2組 など" enterKeyHint="done" />
            </Field>
            <Field label="種類">
              <div className="chips" style={{ paddingTop: 0, flexWrap: "wrap" }}>
                {GROUP_KINDS.map((k) => (
                  <button type="button" key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{GROUP_KIND_LABEL[k]}</button>
                ))}
              </div>
            </Field>
            <Field label="いつ頃の仲間か（任意）">
              <input className="input" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2004〜2010 / 中学のとき など" />
            </Field>
            <Field label="メモ（任意）">
              <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <button type="button" className="btn primary" disabled={!name.trim()} onClick={() => void save()}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ 詳細

export const GroupDetail = ({ id }: { id: string }) => {
  const data = useData();
  const group = (data.groups ?? []).find((g) => g.id === id && !g.deleted);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const members = useMemo(() => alive(data.persons).filter((p) => p.groups.includes(id)), [data.persons, id]);
  const graph = useMemo(() => buildGroup(data, id), [data, id]);

  if (!group) {
    return (
      <>
        <TopBar title="" back="/groups" />
        <div className="empty">このグループは見つかりません</div>
      </>
    );
  }

  const remove = async (): Promise<void> => {
    if (!window.confirm(`グループ「${group.name}」を削除しますか？（人は消えません）`)) return;
    await deleteGroup(id);
    navigate("/groups", true);
  };

  return (
    <>
      <TopBar
        title={group.name}
        back="/groups"
        right={
          <button type="button" className="icon-btn" aria-label="編集" onClick={() => setEditing(true)}>
            <Icon name="edit" />
          </button>
        }
      />
      <main className="main">
        <div className="hero" style={{ paddingTop: 0 }}>
          <div className="badges">
            <span className="badge accent">{GROUP_KIND_LABEL[group.kind]}</span>
            {group.period && <span className="badge">{group.period}</span>}
            <span className="badge">{members.length}人</span>
          </div>
          {group.note && <div className="small muted" style={{ marginTop: 6 }}>{group.note}</div>}
        </div>

        <div className="actions">
          <button type="button" className="btn primary" onClick={() => setPicking(true)}>
            <Icon name="people" size={16} /> メンバーを選ぶ
          </button>
        </div>

        {members.length > 1 && (
          <div className="section">
            <div className="graph-box framed">
              <GraphView graph={graph} centerId="me" height={340} onTap={(pid) => navigate(`/p/${pid}`)} />
            </div>
            <div style={{ marginTop: 6 }}><MoodLegend /></div>
            <div className="small muted" style={{ marginTop: 4 }}>
              メンバーどうしの関係は、各人のページの「つながり」で足せます（仲良し・険悪などの温度も）。
            </div>
          </div>
        )}

        <div className="section list card">
          {members.length === 0 && <div className="empty">「メンバーを選ぶ」から人を入れよう</div>}
          {members.map((p) => (
            <button type="button" key={p.id} className="row" onClick={() => navigate(`/p/${p.id}`)}>
              <Avatar person={p} size={36} />
              <div className="row-main">
                <div className="row-name">{selfLabel(p)}</div>
                <div className="row-sub">{[p.org, p.dept, p.title].filter(Boolean).join(" ・ ")}</div>
              </div>
            </button>
          ))}
        </div>

        <button type="button" className="btn danger" style={{ width: "100%", marginTop: 20 }} onClick={() => void remove()}>
          <Icon name="trash" size={16} /> グループを削除
        </button>
      </main>

      {editing && <GroupEditSheet group={group} onClose={() => setEditing(false)} />}
      {picking && (
        <PersonPicker
          title={`「${group.name}」のメンバー`}
          multiple
          includeSelf
          selected={members.map((m) => m.id)}
          onDone={(ids) => {
            void setGroupMembers(id, ids);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
};
