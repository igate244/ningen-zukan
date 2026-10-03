// src/drive.ts — Google ログインと Google ドライブの読み書き
//
// サーバーを持たず、ブラウザから直接 Google とやり取りする。
// 権限は drive.file（このアプリが作ったファイルだけ）なので、利用者のドライブの他のファイルは見えない。

import { DRIVE_SCOPE, GOOGLE_CLIENT_ID } from "./config";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
  }
}

const TOKEN_KEY = "nz.token";

export class AuthError extends Error {}

interface SavedToken {
  token: string;
  expiresAt: number;
}

let gisPromise: Promise<void> | null = null;
let tokenClient: any = null;
let current: SavedToken | null = null;

const readSaved = (): SavedToken | null => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as SavedToken) : null;
  } catch {
    return null;
  }
};

const writeSaved = (t: SavedToken | null): void => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 保存できなくても動作は続ける */
  }
};

export const isConfigured = (): boolean => GOOGLE_CLIENT_ID !== "";

const loadGis = (): Promise<void> => {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error("Google のログイン部品を読み込めませんでした"));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
};

/** 有効なトークンがあれば返す（画面操作なし） */
export const getToken = (): string | null => {
  if (!current) current = readSaved();
  if (current && current.expiresAt - 60_000 > Date.now()) return current.token;
  return null;
};

/**
 * ログイン画面を出してトークンを取る。ボタン押下など利用者の操作の中で呼ぶこと
 * （そうしないとポップアップがブロックされる）。
 */
export const requestToken = async (prompt: "" | "consent" = ""): Promise<string> => {
  await loadGis();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (res: any) => {
        if (res.error || !res.access_token) {
          reject(new Error(res.error_description || res.error || "ログインできませんでした"));
          return;
        }
        current = { token: res.access_token, expiresAt: Date.now() + Number(res.expires_in ?? 3600) * 1000 };
        writeSaved(current);
        resolve(current.token);
      },
      error_callback: (err: any) => reject(new Error(err?.message || "ログインが中断されました")),
    });
    tokenClient.requestAccessToken({ prompt });
  });
};

export const signOut = async (): Promise<void> => {
  const t = getToken();
  current = null;
  writeSaved(null);
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t, () => undefined);
};

// ------------------------------------------------------------- Drive API

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

const call = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const token = getToken();
  if (!token) throw new AuthError("ログインが必要です");
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    current = null;
    writeSaved(null);
    throw new AuthError("ログインの有効期限が切れました");
  }
  if (!res.ok) throw new Error(`ドライブとの通信に失敗しました (${res.status})`);
  return res;
};

const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const findFile = async (name: string, parentId?: string, folder = false): Promise<string | null> => {
  const q = [
    `name='${esc(name)}'`,
    "trashed=false",
    folder ? "mimeType='application/vnd.google-apps.folder'" : "mimeType!='application/vnd.google-apps.folder'",
    parentId ? `'${parentId}' in parents` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  const res = await call(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive&pageSize=1`);
  const json = (await res.json()) as { files: Array<{ id: string }> };
  return json.files[0]?.id ?? null;
};

export const createFolder = async (name: string, parentId?: string): Promise<string> => {
  const res = await call(`${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parentId ? [parentId] : undefined }),
  });
  return ((await res.json()) as { id: string }).id;
};

export const ensureFolder = async (name: string, parentId?: string): Promise<string> =>
  (await findFile(name, parentId, true)) ?? createFolder(name, parentId);

/** ファイルの存在確認（ゴミ箱に入っていたら無いものとみなす） */
export const fileExists = async (id: string): Promise<boolean> => {
  try {
    const res = await call(`${API}/files/${id}?fields=id,trashed`);
    const json = (await res.json()) as { trashed?: boolean };
    return !json.trashed;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    return false;
  }
};

const multipart = (meta: object, body: Blob): { body: Blob; type: string } => {
  const boundary = `nz${Math.random().toString(36).slice(2)}`;
  const blob = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(meta),
    `\r\n--${boundary}\r\nContent-Type: ${body.type || "application/octet-stream"}\r\n\r\n`,
    body,
    `\r\n--${boundary}--`,
  ]);
  return { body: blob, type: `multipart/related; boundary=${boundary}` };
};

/** 新規作成（fileId なし）または上書き */
export const uploadFile = async (
  name: string,
  parentId: string,
  body: Blob,
  fileId?: string | null,
): Promise<string> => {
  const meta = fileId ? { name } : { name, parents: [parentId] };
  const mp = multipart(meta, body);
  const url = fileId
    ? `${UPLOAD}/files/${fileId}?uploadType=multipart&fields=id`
    : `${UPLOAD}/files?uploadType=multipart&fields=id`;
  const res = await call(url, { method: fileId ? "PATCH" : "POST", headers: { "Content-Type": mp.type }, body: mp.body });
  return ((await res.json()) as { id: string }).id;
};

export const downloadFile = async (fileId: string): Promise<Blob> => {
  const res = await call(`${API}/files/${fileId}?alt=media`);
  return res.blob();
};

export const deleteFile = async (fileId: string): Promise<void> => {
  try {
    await call(`${API}/files/${fileId}`, { method: "DELETE" });
  } catch (e) {
    if (e instanceof AuthError) throw e;
  }
};
