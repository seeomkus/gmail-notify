// Mengukur apakah halaman masuk memerlukan scroll vertikal/horizontal pada berbagai ukuran layar.
// Prasyarat: Chrome terpasang dan aplikasi berjalan (mode demo menampilkan kartu demo, kondisi terpanjang).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.APP_URL || "http://localhost:5180";
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = process.argv[2] || here;
const PROFILE = path.join(here, ".chrome-profile-measure");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sizes = [
  [1920, 1080], [1536, 864], [1440, 900], [1366, 768], [1280, 720], [1280, 600], [1024, 768], [820, 1180], [414, 896], [390, 844], [360, 640], [320, 568],
];

const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars=false", "--remote-debugging-port=9335",
  `--user-data-dir=${PROFILE}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(250);
  try { wsUrl = (await (await fetch("http://127.0.0.1:9335/json/list")).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch { /* belum siap */ }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;

try {
  await send("Page.enable");
  console.log("Ukuran layar      | halaman scroll | kolom form scroll  | scroll X");
  for (const [w, h] of sizes) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await send("Page.navigate", { url: BASE + "/" });
    await sleep(2200);
    if (process.env.MODE === "register") { await js(`[...document.querySelectorAll(".auth-seg button")].find((b) => b.textContent.includes("Daftar"))?.click()`); await sleep(400); await js(`(() => { const p = document.querySelector("#a-pass"); if (p) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(p, "Abcd1234!xyz"); p.dispatchEvent(new Event("input", { bubbles: true })); } })()`); await sleep(300); }
    const m = await js(`(() => { const a = document.querySelector(".auth-main"); return { page: document.documentElement.scrollHeight - innerHeight, form: a ? a.scrollHeight - a.clientHeight : 0, x: document.documentElement.scrollWidth - innerWidth }; })()`);
    const fmt = (n) => (n > 1 ? `YA (+${n}px)` : "tidak");
    console.log(`${String(w).padStart(4)} x ${String(h).padEnd(5)}      | ${fmt(m.page).padEnd(14)} | ${fmt(m.form).padEnd(18)} | ${fmt(m.x)}`);
    if (process.argv[3] === "shots") {
      const r = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(OUT, `login-${w}x${h}.png`), Buffer.from(r.result.data, "base64"));
    }
  }
} finally {
  ws.close(); chrome.kill(); await sleep(1500);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* dibersihkan nanti */ }
}
