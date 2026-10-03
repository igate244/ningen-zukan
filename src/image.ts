// src/image.ts — 写真の縮小と表示用 URL

import { useEffect, useState } from "react";
import * as db from "./db";
import * as drive from "./drive";
import { getData } from "./store";

const MAX_SIDE = 800;

/** スマホの写真（数 MB）を長辺 800px の JPEG（100〜200KB 程度）に縮める */
export const shrinkImage = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を処理できませんでした");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を処理できませんでした"))), "image/jpeg", 0.82),
  );
};

const urlCache = new Map<string, string>();

/** 画像 ID → 表示用 URL。手元に無ければドライブから取ってくる */
export const useImageUrl = (id?: string): string | undefined => {
  const [url, setUrl] = useState<string | undefined>(id ? urlCache.get(id) : undefined);

  useEffect(() => {
    if (!id) {
      setUrl(undefined);
      return;
    }
    const cached = urlCache.get(id);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      let blob = await db.getBlob(id);
      if (!blob) {
        const meta = getData().images.find((m) => m.id === id);
        if (meta?.driveId && drive.getToken()) {
          try {
            blob = await drive.downloadFile(meta.driveId);
            await db.putBlob(id, blob);
          } catch {
            /* 取れなければ頭文字表示のまま */
          }
        }
      }
      if (!blob || cancelled) return;
      const u = URL.createObjectURL(blob);
      urlCache.set(id, u);
      setUrl(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return url;
};
