// src/main.tsx — 起動処理

import { createRoot } from "react-dom/client";
import { load } from "./store";
import { startPush } from "./push";
import { startAutoSync } from "./sync";
import { App } from "./ui/App";

const root = createRoot(document.getElementById("root")!);

const boot = async (): Promise<void> => {
  try {
    await load();
  } catch (e) {
    root.render(
      <div className="empty">
        データを読み込めませんでした。
        <br />
        {e instanceof Error ? e.message : String(e)}
      </div>,
    );
    return;
  }
  root.render(<App />);
  void startAutoSync();
  void startPush();
};

void boot();

// オフラインでも開けるようにする（開発サーバーでは登録しない）
if ("serviceWorker" in navigator && location.hostname !== "localhost") {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("sw.js").catch(() => undefined);
  });
}
