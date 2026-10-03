// src/db.ts — 端末内保存（IndexedDB）。ライブラリを使わない最小限のラッパ。

const DB_NAME = "ningen-zukan";
const DB_VERSION = 1;

export const STORES = ["persons", "relations", "logs", "images", "blobs", "meta"] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

const open = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === "blobs" || name === "meta" ? "key" : "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const getAll = async <T>(store: StoreName): Promise<T[]> => {
  const db = await open();
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
};

export const get = async <T>(store: StoreName, key: string): Promise<T | undefined> => {
  const db = await open();
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
};

export const putMany = async (store: StoreName, values: unknown[]): Promise<void> => {
  if (values.length === 0) return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    for (const v of values) os.put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const put = (store: StoreName, value: unknown): Promise<void> => putMany(store, [value]);

export const del = async (store: StoreName, key: string): Promise<void> => {
  const db = await open();
  await wrap(db.transaction(store, "readwrite").objectStore(store).delete(key));
};

export const clearAll = async (): Promise<void> => {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...STORES], "readwrite");
    for (const s of STORES) tx.objectStore(s).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// --- 小さな設定値（同期状態など） ---
export const getMeta = async <T>(key: string): Promise<T | undefined> =>
  (await get<{ key: string; value: T }>("meta", key))?.value;

export const setMeta = (key: string, value: unknown): Promise<void> => put("meta", { key, value });

// --- 画像の実体 ---
export const getBlob = async (id: string): Promise<Blob | undefined> =>
  (await get<{ key: string; blob: Blob }>("blobs", id))?.blob;

export const putBlob = (id: string, blob: Blob): Promise<void> => put("blobs", { key: id, blob });
