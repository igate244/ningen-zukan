// src/ui/App.tsx — 画面の切り替えと下タブ

import { type ReactNode, useEffect } from "react";
import { navigate, useRoute } from "../router";
import { reconnect, useSyncState } from "../sync";
import { Icon, TopBar } from "./common";
import { LogEdit, LogsPage } from "./Logs";
import { OrgPage } from "./OrgPage";
import { PeopleList } from "./PeopleList";
import { PersonDetail } from "./PersonDetail";
import { PersonEdit } from "./PersonEdit";
import { SettingsPage } from "./Settings";

const TABS = [
  { path: "", label: "人物", icon: "people" },
  { path: "logs", label: "記録", icon: "log" },
  { path: "org", label: "組織", icon: "org" },
  { path: "settings", label: "設定", icon: "settings" },
] as const;

const SyncBadge = () => {
  const s = useSyncState();
  if (s.status === "off") return null;
  const color = s.status === "error" || s.status === "needAuth" ? "var(--danger)" : s.status === "syncing" ? "var(--warn)" : "var(--accent)";
  const title = { idle: "同期済み", syncing: "同期中", error: "同期エラー", needAuth: "再接続が必要", off: "" }[s.status];
  return (
    <button type="button" className="icon-btn" title={title} aria-label={title}
      onClick={() => (s.status === "needAuth" ? void reconnect().catch(() => undefined) : navigate("/settings"))}>
      <span className="sync-dot" style={{ background: color }} />
    </button>
  );
};

const TabShell = ({ title, active, children }: { title: string; active: string; children: ReactNode }) => (
  <>
    <TopBar title={title} right={<SyncBadge />} />
    <main className="main">{children}</main>
    <nav className="tabbar">
      <div className="tabbar-inner">
        {TABS.map((t) => (
          <button type="button" key={t.path} className={`tab ${active === t.path ? "active" : ""}`} onClick={() => navigate(`/${t.path}`, true)}>
            <Icon name={t.icon} size={22} />
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  </>
);

export const App = () => {
  const { path, query } = useRoute();
  const key = path.join("/");

  // 画面が変わったら一番上から表示する
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);

  const [a, b, c] = path;
  let page: ReactNode;

  if (a === "new") page = <PersonEdit />;
  else if (a === "p" && b && c === "edit") page = <PersonEdit key={b} id={b} />;
  else if (a === "p" && b) page = <PersonDetail key={b} id={b} />;
  else if (a === "log" && b === "new") page = <LogEdit presetPersonId={query.get("p") ?? undefined} />;
  else if (a === "log" && b) page = <LogEdit key={b} id={b} />;
  else if (a === "logs") page = <TabShell title="記録" active="logs"><LogsPage /></TabShell>;
  else if (a === "org") page = <TabShell title="組織" active="org"><OrgPage /></TabShell>;
  else if (a === "settings") page = <TabShell title="設定" active="settings"><SettingsPage /></TabShell>;
  else page = <TabShell title="人間図鑑" active=""><PeopleList /></TabShell>;

  return <div className="app">{page}</div>;
};
