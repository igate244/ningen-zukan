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

// ---------------------------------------------------------------- 誕生日の通知
//
// 通知の配達だけ KEEP の Firebase プロジェクトに相乗りしている。
// サーバーに渡すのは「通知の宛先（端末ごとのトークン）」と「誕生日の月日（MM-DD）の一覧」だけで、
// 名前などは送らない。通知の文面は、合図を受け取った端末が自分の中のデータから作る。
export const PUSH_FIREBASE = {
  apiKey: "AIzaSyAW9ggqugQxRSuL0uMnsGqdDlCmSqXForo",
  projectId: "keep-app-30128",
  messagingSenderId: "229165602365",
  appId: "1:229165602365:web:7a7ba1c091fc744797fc54",
};
export const PUSH_VAPID_KEY = "BGif6O5vsA47rPLj9yr8DrQ4V0iQwJQE3jaGB6Pb4rB0NkORFMEiRP5z7mkEqC5JKT4NOqAbxx280ig1-4F6VYo";
export const PUSH_COLLECTION = "ningenPush";
