// src/config.ts
//
// Google ログイン用の OAuth クライアント ID。
// クライアント ID は秘密情報ではない（ブラウザに必ず露出する）のでここに直接書いてよい。
// 空のままでもアプリは「この端末だけに保存するモード」で動く。
export const GOOGLE_CLIENT_ID = "";

/** ドライブには「このアプリが作ったファイル」だけ触れる権限で接続する */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** ドライブ上に作るフォルダ名とデータファイル名 */
export const DRIVE_FOLDER_NAME = "人間図鑑";
export const DRIVE_DATA_FILE = "ningen-zukan-data.json";
