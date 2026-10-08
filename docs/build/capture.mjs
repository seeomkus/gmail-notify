// Membuat semua gambar untuk dokumen teknis: diagram, banner sampul, dan screenshot UI (mode demo).
// Prasyarat: Chrome terpasang. Untuk screenshot UI, jalankan `npm run dev` (backend 3100 + frontend 5180) lebih dulu.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.resolve(here, "..", "images");
const PROFILE = path.join(here, ".chrome-profile");
const BASE = process.env.APP_URL || "http://localhost:5180";
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ONLY = process.argv[2]; // opsional: diagrams | cover | ui

fs.mkdirSync(IMG, { recursive: true });
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* sisa sesi sebelumnya */ }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=9334",
  `--user-data-dir=${PROFILE}`, "--window-size=1440,1000", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(250);
  try {
    const list = await (await fetch("http://127.0.0.1:9334/json/list")).json();
    wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch { /* belum siap */ }
}
if (!wsUrl) { chrome.kill(); throw new Error("Chrome tidak siap"); }

const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++seq; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "evaluate gagal");
  return r.result?.result?.value;
};
const nav = async (url, wait = 2500) => { await send("Page.navigate", { url }); await sleep(wait); };
const metrics = (width, height, mobile = false) =>
  send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
const save = (name, b64) => { fs.writeFileSync(path.join(IMG, name), Buffer.from(b64, "base64")); console.log("  +", name); };

async function clipShot(name, rect, scale = 1) {
  const r = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale },
  });
  save(name, r.result.data);
}

// Data nyata di database pengembangan disamarkan agar dokumen dan repositori aman dibagikan.
// Tidak ada alamat atau nama nyata yang ditulis di kode ini:
//  - alamat pengirim aktif diambil dari API lalu diganti "pengirim@gmail.com";
//  - alamat email publik lain (gmail/yahoo/outlook/hotmail) diganti "penerima@contoh.com";
//  - teks tambahan opsional lewat env MASK_TEXT, format "lama=>pengganti;lama2=>pengganti2".
const EXTRA = (process.env.MASK_TEXT || "").split(";").map((p) => p.split("=>")).filter((p) => p.length === 2);
const PUBLIC_MAIL = /[A-Za-z0-9._+-]+@(?:gmail|googlemail|yahoo|outlook|hotmail)\.com/gi;

async function anonymize() {
  const sender = await js(`fetch("/api/settings").then((r) => (r.ok ? r.json() : {})).then((s) => s.smtpUser || "").catch(() => "")`);
  await js(`(() => {
    const SENDER = ${JSON.stringify(sender || "")};
    const EXTRA = ${JSON.stringify(EXTRA)};
    const MAIL = new RegExp(${JSON.stringify(PUBLIC_MAIL.source)}, "gi");
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((n) => {
      let v = n.nodeValue;
      if (SENDER) v = v.split(SENDER).join("pengirim@gmail.com");
      v = v.replace(MAIL, (m) => (m.toLowerCase() === "pengirim@gmail.com" ? m : "penerima@contoh.com"));
      for (const [a, b] of EXTRA) v = v.split(a).join(b);
      if (v !== n.nodeValue) n.nodeValue = v;
    });
  })()`);
}

async function fullShot(name, minHeight = 900) {
  await metrics(1440, 1000);
  await sleep(300);
  const h = Math.max(minHeight, await js("Math.ceil(document.documentElement.scrollHeight)"));
  await metrics(1440, h);
  await sleep(700);
  await anonymize();
  await clipShot(name, { x: 0, y: 0, width: 1440, height: h });
}

async function shotTop(name, height) {
  await metrics(1440, 1000); await sleep(300);
  const h = Math.max(height, await js("Math.ceil(document.documentElement.scrollHeight)"));
  await metrics(1440, h); await sleep(700); await anonymize();
  await clipShot(name, { x: 0, y: 0, width: 1440, height });
}

async function shotCard(name, titleRe) {
  await metrics(1440, 1000); await sleep(300);
  const h = await js("Math.ceil(document.documentElement.scrollHeight)");
  await metrics(1440, h); await sleep(700); await anonymize();
  const r = await js(`(() => { const el = [...document.querySelectorAll("section.card")].find((s) => ${titleRe}.test(s.querySelector("h2")?.textContent || "")); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y + scrollY, width: b.width, height: b.height }; })()`);
  if (!r) throw new Error("kartu tidak ditemukan: " + titleRe);
  await clipShot(name, { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 });
}

const clickText = (sel, text) => js(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text)}));
  if (!el) return false; el.click(); return true; })()`);
const setValue = (sel, value) => js(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); return true; })()`);

try {
  await send("Page.enable");

  // ================= 1. diagram =================
  if (!ONLY || ONLY === "diagrams") {
    console.log("Diagram:");
    await metrics(1200, 900);
    await nav(pathToFileURL(path.join(here, "diagrams.html")).href, 1200);
    const figs = await js(`[...document.querySelectorAll(".fig")].map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })`);
    for (const f of figs) await clipShot(`diagram-${f.id.replace("fig-", "")}.png`, f, 2);
  }

  // ================= 2. banner sampul =================
  if (!ONLY || ONLY === "cover") {
    console.log("Sampul:");
    const req = createRequire(path.resolve(here, "..", "..", "frontend", "package.json"));
    const { mdiGmail } = req("@mdi/js");
    await metrics(794, 480);
    await nav(pathToFileURL(path.join(here, "cover.html")).href, 800);
    await js(`document.getElementById("gm").setAttribute("d", ${JSON.stringify(mdiGmail)})`);
    await clipShot("cover-banner.png", { x: 0, y: 0, width: 794, height: 468 }, 3);
  }

  // ================= 3. screenshot UI =================
  if (!ONLY || ONLY === "ui") {
    console.log("UI (mode demo):");
    const health = await fetch(BASE + "/api/health").then((r) => r.ok).catch(() => false);
    if (!health) throw new Error(`Aplikasi belum berjalan di ${BASE}. Jalankan npm run dev di backend dan frontend.`);

    await metrics(1440, 900);
    await nav(BASE + "/", 4500);
    await js(`document.fonts?.ready`);
    await sleep(800);
    await anonymize();
    await clipShot("ui-login.png", { x: 0, y: 0, width: 1440, height: 900 });

    const login = await js(`fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: "admin", password: "admin123" }) }).then((r) => r.status)`);
    if (login !== 200) throw new Error("Login demo gagal (" + login + "). Pastikan DEMO_MODE aktif.");

    // Kirim - notifikasi
    await nav(BASE + "/#send"); await send("Page.reload"); await sleep(2500);
    await shotTop("ui-kirim.png", 1120);

    // Kirim - broadcast + jadwal mingguan
    await clickText(".seg button", "Broadcast"); await sleep(400);
    await clickText(".tpl", "Newsletter"); await sleep(400);
    await setValue("#rcpt", "budi@contoh.com, Budi\nsari@contoh.com, Sari\nandi@contoh.com, Andi");
    await clickText(".seg button", "Jadwalkan"); await sleep(400);
    await setValue("#sname", "Newsletter mingguan");
    await setValue("#rep", "weekly"); await sleep(300);
    await setValue("#tod", "08:00"); await sleep(500);
    await shotTop("ui-broadcast.png", 1000);
    await shotCard("ui-penjadwalan.png", /Kapan dikirim/);

    // Jadwal (dua contoh jadwal sementara, dihapus lagi di akhir)
    const created = [];
    try {
      const mk = (body) => js(`fetch("/api/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: ${JSON.stringify(JSON.stringify(body))} }).then((r) => r.json())`);
      const a = await mk({ name: "Pengingat rapat harian", repeat: "daily", timeOfDay: "09:00",
        job: { mode: "notify", to: "tim@contoh.com", subject: "Pengingat: rapat harian", templateId: "reminder",
          values: { title: "Rapat harian dimulai", message: "Jangan lupa rapat harian tim.", when: "09.00 WIB" } } });
      const b = await mk({ name: "Newsletter mingguan", repeat: "weekly", timeOfDay: "08:00", weekdays: [1, 3, 5],
        job: { mode: "broadcast", recipients: "budi@contoh.com, Budi\nsari@contoh.com, Sari", subject: "Kabar mingguan", templateId: "newsletter",
          values: { title: "Kabar Mingguan", message: "Halo {{nama}}, ini kabar terbaru." } } });
      created.push(a.id, b.id);
      await nav(BASE + "/#schedule"); await send("Page.reload"); await sleep(2800);
      await fullShot("ui-jadwal.png");
    } finally {
      for (const id of created) if (id) await js(`fetch("/api/schedules/${id}", { method: "DELETE" }).then((r) => r.status)`);
    }

    // Riwayat
    await nav(BASE + "/#history"); await send("Page.reload"); await sleep(2500);
    await clickText(".item-head", ""); await sleep(500);
    await fullShot("ui-riwayat.png");

    // Pengaturan: akun + Google (panduan dibuka)
    await nav(BASE + "/#settings"); await send("Page.reload"); await sleep(2800);
    await metrics(1440, 1000);
    await js(`document.querySelector(".guide-toggle")?.click()`); await sleep(500);
    const h = await js("Math.ceil(document.documentElement.scrollHeight)");
    await metrics(1440, h); await sleep(700); await anonymize();
    const rects = await js(`[...document.querySelectorAll("section.card")].map((s) => { const r = s.getBoundingClientRect(); return { t: s.querySelector("h2")?.textContent.trim(), x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; })`);
    const pick = (re) => rects.find((r) => re.test(r.t || ""));
    const first = rects[0], gmail = pick(/Akun Gmail/), google = pick(/Google/);
    await clipShot("ui-pengaturan-akun.png", { x: 0, y: 0, width: 1440, height: gmail.y + gmail.height + 24 });
    await clipShot("ui-pengaturan-google.png", { x: first.x - 20, y: google.y - 16, width: first.width + 40, height: google.height + 32 });

    // Mode gelap
    await nav(BASE + "/#send"); await send("Page.reload"); await sleep(2500);
    await js(`document.documentElement.dataset.theme = "dark"`);
    await metrics(1440, 900); await sleep(500); await anonymize();
    await clipShot("ui-gelap.png", { x: 0, y: 0, width: 1440, height: 900 });

    // Tampilan ponsel
    await js(`document.documentElement.dataset.theme = "light"`);
    await metrics(390, 844, true); await nav(BASE + "/#send", 2500); await send("Page.reload"); await sleep(2500);
    await anonymize();
    await clipShot("ui-mobile.png", { x: 0, y: 0, width: 390, height: 844 });

    await js(`fetch("/api/auth/logout", { method: "POST" }).then((r) => r.status)`);
  }
} finally {
  ws.close();
  chrome.kill();
  await sleep(1500); // beri waktu Chrome melepas file sebelum profil sementara dihapus
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* dibersihkan pada eksekusi berikutnya */ }
}
console.log("Selesai.");
