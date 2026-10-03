// sw.js — オフライン起動と、誕生日通知の表示
//
// キャッシュの方針: 自分のファイルは「まずネット、だめならキャッシュ」。Google との通信には触らない。
// 通知: サーバーからは中身のない合図（today / tomorrow）だけが届く。
//       名前や年齢は、この端末の IndexedDB にある人物データから組み立てる。
const CACHE = "ningen-zukan-__VERSION__";
const CORE = ["./", "./index.html", "./app.js", "./app.css", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-maskable-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html"))),
  );
});

// ------------------------------------------------------------------ 誕生日通知

const readPersons = () =>
  new Promise((resolve) => {
    const req = indexedDB.open("ningen-zukan");
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      try {
        const dbh = req.result;
        const q = dbh.transaction("persons").objectStore("persons").getAll();
        // アプリ側の版上げを邪魔しないよう、読んだらすぐ閉じる
        q.onsuccess = () => { resolve(q.result || []); dbh.close(); };
        q.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    };
  });

const pad = (n) => String(n).padStart(2, "0");
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** 今日（offset=0）か明日（offset=1）が誕生日の人 */
const birthdayPeople = async (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const mmdd = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // 2/29 生まれは、うるう年でなければ 2/28 に知らせる
  const extra = mmdd === "02-28" && !isLeap(d.getFullYear()) ? "02-29" : null;
  const persons = await readPersons();
  return persons
    .filter((p) => !p.deleted && !p.isSelf && p.birthDate)
    .filter((p) => {
      const md = p.birthDate.slice(5, 10);
      return md === mmdd || md === extra;
    })
    .map((p) => {
      let age = null;
      if (!p.birthYearUnknown) {
        const y = Number(p.birthDate.slice(0, 4));
        if (y > 1000) age = d.getFullYear() - y;
      }
      return { id: p.id, name: p.name, age };
    });
};

const showBirthday = async (when) => {
  const offset = when === "tomorrow" ? 1 : 0;
  const people = await birthdayPeople(offset);
  const day = offset ? "明日" : "今日";
  let title;
  let body;
  if (people.length === 0) {
    title = "人間図鑑";
    body = `${day}誕生日の人がいます。アプリで確認してください`;
  } else {
    const names = people.map((p) => `${p.name}${p.age !== null ? `（${p.age}歳）` : ""}`);
    title = `${day}は ${people[0].name}${people.length > 1 ? ` ほか${people.length - 1}人` : ""} の誕生日`;
    body = names.join("、") + (offset ? "。明日おめでとうを伝えよう" : "。おめでとうを伝えよう");
  }
  const url = people.length === 1 ? `./#/p/${people[0].id}` : "./#/";
  return self.registration.showNotification(title, {
    body,
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: `nz-birthday-${when}`,
    data: { url },
  });
};

self.addEventListener("push", (e) => {
  let when = "today";
  try {
    const payload = e.data ? e.data.json() : {};
    const data = payload.data || payload;
    if (data.when === "tomorrow") when = "tomorrow";
  } catch {
    /* 中身が読めなくても今日扱いで出す */
  }
  e.waitUntil(showBirthday(when));
});

// 設定画面の「テスト」ボタンから
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "nz-test-birthday") {
    e.waitUntil(
      (async () => {
        const today = await birthdayPeople(0);
        const tomorrow = await birthdayPeople(1);
        if (tomorrow.length) return showBirthday("tomorrow");
        if (today.length) return showBirthday("today");
        return self.registration.showNotification("人間図鑑（テスト）", {
          body: "通知は届いています。今日・明日が誕生日の人はいません",
          icon: "icon-192.png",
          tag: "nz-test",
          data: { url: "./#/" },
        });
      })(),
    );
  }
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
