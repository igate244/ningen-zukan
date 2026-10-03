// src/router.ts — URL の # 以降で画面を切り替える最小ルーター
// （GitHub Pages のような静的ホスティングでも戻るボタンが自然に効く）

import { useSyncExternalStore } from "react";

export interface Route {
  path: string[];
  query: URLSearchParams;
}

const parse = (): Route => {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [p, q = ""] = raw.split("?");
  return { path: p.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
};

let current = parse();
let currentHash = window.location.hash;

const subscribe = (l: () => void): (() => void) => {
  const handler = (): void => {
    if (window.location.hash !== currentHash) {
      currentHash = window.location.hash;
      current = parse();
      l();
    }
  };
  window.addEventListener("hashchange", handler);
  return () => window.removeEventListener("hashchange", handler);
};

export const useRoute = (): Route => useSyncExternalStore(subscribe, () => current);

export const navigate = (to: string, replace = false): void => {
  const hash = `#${to.startsWith("/") ? to : `/${to}`}`;
  if (replace) {
    window.history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = hash;
  }
};

// アプリ内で何回画面を進んだか（0 なら戻り先が無いので fallback へ）
let depth = 0;
window.addEventListener("hashchange", () => {
  depth = Math.max(0, depth + (pendingBack ? -1 : 1));
  pendingBack = false;
});
let pendingBack = false;

/** アプリ内の履歴があれば戻る、無ければ指定先へ */
export const goBack = (fallback = "/"): void => {
  if (depth > 0) {
    pendingBack = true;
    window.history.back();
  } else {
    navigate(fallback, true);
  }
};
