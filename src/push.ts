// src/push.ts — 誕生日のスマホ通知（前日 21:00 と当日 7:00）
//
// 1. 通知を許可してもらい、Firebase Cloud Messaging の「宛先トークン」を取る
// 2. トークンと「誕生日の月日の一覧」だけをサーバー（Firestore）に置く
// 3. サーバーは毎日 7:00 / 21:00 に、該当する端末へ中身のない合図を送る
// 4. 合図を受けた sw.js が、端末内のデータから「明日は◯◯の誕生日」を作って表示する

import { useSyncExternalStore } from "react";
import { PUSH_COLLECTION, PUSH_FIREBASE, PUSH_VAPID_KEY } from "./config";
import * as db from "./db";
import { newId } from "./model";
import * as store from "./store";

const SDK = "https://www.gstatic.com/firebasejs/10.12.5";

type PushStatus = "unsupported" | "off" | "on" | "denied" | "working" | "error";

let state: { status: PushStatus; message?: string } = { status: "off" };
const listeners = new Set<() => void>();
const setState = (s: typeof state): void => {
  state = s;
  listeners.forEach((l) => l());
};

export const usePushState = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

const supported = (): boolean => "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

/** 端末ごとの合言葉（推測できない長さの ID）。サーバー上の置き場所の名前になる */
const deviceKey = async (): Promise<string> => {
  let key = await db.getMeta<string>("pushKey");
  if (!key) {
    key = `${newId()}${newId()}`.slice(0, 40);
    await db.setMeta("pushKey", key);
  }
  return key;
};

/** 誕生日の月日（MM-DD）の一覧。名前は含めない */
const birthdayDates = (): string[] => {
  const set = new Set<string>();
  for (const p of store.alive(store.getData().persons)) {
    if (p.isSelf || !p.birthDate) continue;
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(p.birthDate);
    if (m) set.add(`${m[1]}-${m[2]}`);
  }
  return [...set].sort();
};

const strList = (xs: string[]) => ({ arrayValue: xs.length ? { values: xs.map((v) => ({ stringValue: v })) } : {} });

const upload = async (token: string): Promise<void> => {
  const key = await deviceKey();
  const url = `https://firestore.googleapis.com/v1/projects/${PUSH_FIREBASE.projectId}/databases/(default)/documents/${PUSH_COLLECTION}/${key}?key=${PUSH_FIREBASE.apiKey}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        tokens: strList([token]),
        dates: strList(birthdayDates()),
        tz: { stringValue: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo" },
        updatedAt: { integerValue: String(Date.now()) },
      },
    }),
  });
  if (!res.ok) throw new Error(`通知の登録に失敗しました (${res.status})`);
  await db.setMeta("pushDatesSent", birthdayDates().join(","));
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const getFcmToken = async (): Promise<string> => {
  const appMod: any = await import(/* @vite-ignore */ `${SDK}/firebase-app.js`);
  const msgMod: any = await import(/* @vite-ignore */ `${SDK}/firebase-messaging.js`);
  const app = appMod.getApps().find((a: any) => a.name === "ningen-push") ?? appMod.initializeApp(PUSH_FIREBASE, "ningen-push");
  const messaging = msgMod.getMessaging(app);
  const reg = await navigator.serviceWorker.ready;
  const token: string = await msgMod.getToken(messaging, { vapidKey: PUSH_VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) throw new Error("通知の宛先を取得できませんでした");
  return token;
};

/** ボタンから呼ぶ：通知をオンにする */
export const enablePush = async (): Promise<void> => {
  if (!supported()) {
    setState({ status: "unsupported" });
    return;
  }
  setState({ status: "working" });
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setState({ status: "denied" });
      return;
    }
    const token = await getFcmToken();
    await db.setMeta("pushToken", token);
    await upload(token);
    await db.setMeta("pushEnabled", true);
    setState({ status: "on" });
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("人間図鑑", {
      body: "誕生日の通知をオンにしました。前日の21時と当日の朝7時にお知らせします。",
      icon: "icon-192.png",
      tag: "nz-setup",
    });
  } catch (e) {
    setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
  }
};

export const disablePush = async (): Promise<void> => {
  await db.setMeta("pushEnabled", false);
  try {
    const key = await deviceKey();
    await fetch(
      `https://firestore.googleapis.com/v1/projects/${PUSH_FIREBASE.projectId}/databases/(default)/documents/${PUSH_COLLECTION}/${key}?key=${PUSH_FIREBASE.apiKey}`,
      { method: "DELETE" },
    );
  } catch {
    /* 消せなくても、端末側で通知を出さなければよい */
  }
  setState({ status: "off" });
};

/** 今の内容でテスト表示（sw.js と同じ組み立てを端末内で試す） */
export const testPush = async (): Promise<void> => {
  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({ type: "nz-test-birthday" });
};

let timer: number | undefined;

/** 起動時：状態の復元と、誕生日が変わったときの再送 */
export const startPush = async (): Promise<void> => {
  if (!supported()) {
    setState({ status: "unsupported" });
    return;
  }
  const enabled = await db.getMeta<boolean>("pushEnabled");
  if (!enabled) {
    setState({ status: Notification.permission === "denied" ? "denied" : "off" });
    return;
  }
  setState({ status: Notification.permission === "granted" ? "on" : "denied" });

  const resend = async (): Promise<void> => {
    if (Notification.permission !== "granted") return;
    const sent = await db.getMeta<string>("pushDatesSent");
    if (sent === birthdayDates().join(",")) return;
    try {
      // トークンは変わることがあるので取り直してから送る
      const token = await getFcmToken();
      await db.setMeta("pushToken", token);
      await upload(token);
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };
  void resend();
  store.onLocalChange(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void resend(), 5000);
  });
};
