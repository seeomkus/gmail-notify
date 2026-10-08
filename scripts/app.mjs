#!/usr/bin/env node
// Pengelola aplikasi Gmail Notify (Linux & Windows): build, start, stop, restart, status, logs.
// Mode produksi: backend hasil build menyajikan juga frontend hasil build (satu proses, satu port).

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");
const RUN_DIR = path.join(ROOT, ".run");
const PID_FILE = path.join(RUN_DIR, "app.pid");
const LOG_FILE = path.join(RUN_DIR, "app.log");
const SERVER_JS = path.join(BACKEND, "dist", "server.js");
const WEB_INDEX = path.join(FRONTEND, "dist", "index.html");
const IS_WIN = process.platform === "win32";

const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = (s) => console.log(c(32, "✔ ") + s);
const warn = (s) => console.log(c(33, "! ") + s);
const fail = (s) => console.error(c(31, "✖ ") + s);
const info = (s) => console.log(c(36, "› ") + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (Number(process.versions.node.split(".")[0]) < 18) {
  fail(`Node.js 18+ diperlukan (terpasang: ${process.version})`);
  process.exit(1);
}

// ---------- util ----------
function getPort() {
  if (process.env.PORT) return Number(process.env.PORT);
  try {
    const env = fs.readFileSync(path.join(BACKEND, ".env"), "utf8");
    const m = env.match(/^\s*PORT\s*=\s*(\d+)/m);
    if (m) return Number(m[1]);
  } catch {
    /* .env belum ada */
  }
  return 3100;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // ada tapi bukan milik kita
  }
}

function readPidFile() {
  try {
    const data = JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
    return data && Number.isInteger(data.pid) ? data : null;
  } catch {
    return null;
  }
}

/** Info proses yang sedang berjalan; membersihkan pid file basi. */
function running() {
  const data = readPidFile();
  if (!data) return null;
  if (isAlive(data.pid)) return data;
  fs.rmSync(PID_FILE, { force: true });
  return null;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.setTimeout(1000);
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("timeout", () => (s.destroy(), resolve(false)));
    s.once("error", () => resolve(false));
  });
}

async function health(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function tailLog(lines = 20) {
  try {
    return fs.readFileSync(LOG_FILE, "utf8").trimEnd().split(/\r?\n/).slice(-lines).join("\n");
  } catch {
    return "";
  }
}

function fmtUptime(since) {
  let s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60);
  return [d && `${d} hari`, (d || h) && `${h} jam`, `${m} mnt`, `${s % 60} dtk`].filter(Boolean).join(" ");
}

// ---------- perintah ----------
function npm(args, cwd) {
  info(`npm ${args.join(" ")}  (${path.relative(ROOT, cwd)})`);
  const r = spawnSync("npm", args, { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    fail(`Perintah gagal: npm ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function build({ install = false } = {}) {
  for (const dir of [BACKEND, FRONTEND]) {
    if (install || !fs.existsSync(path.join(dir, "node_modules"))) npm(["install"], dir);
    npm(["run", "build"], dir);
  }
  ok("Build selesai (backend + frontend)");
}

async function start() {
  const port = getPort();
  const cur = running();
  if (cur) {
    warn(`Sudah berjalan (PID ${cur.pid}) di http://localhost:${port}`);
    return;
  }
  if (await portOpen(port)) {
    fail(`Port ${port} sudah dipakai proses lain. Hentikan proses itu atau ubah PORT di backend/.env`);
    process.exit(1);
  }
  if (!fs.existsSync(SERVER_JS) || !fs.existsSync(WEB_INDEX)) {
    info("Hasil build belum ada, menjalankan build dulu...");
    build();
  }
  if (!fs.existsSync(path.join(BACKEND, ".env"))) {
    warn("backend/.env tidak ditemukan. Salin dari .env.example, atau atur SMTP lewat tab Pengaturan.");
  }

  fs.mkdirSync(RUN_DIR, { recursive: true });
  try {
    if (fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) fs.rmSync(LOG_FILE); // log sederhana: reset jika > 5 MB
  } catch {
    /* belum ada */
  }
  const fd = fs.openSync(LOG_FILE, "a");
  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: BACKEND,
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  });
  child.unref();
  fs.writeFileSync(PID_FILE, JSON.stringify({ pid: child.pid, port, startedAt: new Date().toISOString() }));

  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (!isAlive(child.pid)) break;
    if (await health(port)) {
      ok(`Aplikasi berjalan (PID ${child.pid}) → http://localhost:${port}`);
      info(`Log: ${path.relative(ROOT, LOG_FILE)}`);
      return;
    }
  }
  fail("Aplikasi gagal start. Log terakhir:");
  console.error(tailLog());
  if (isAlive(child.pid)) await stop({ quiet: true });
  else fs.rmSync(PID_FILE, { force: true });
  process.exit(1);
}

async function stop({ quiet = false } = {}) {
  const cur = running();
  if (!cur) {
    if (!quiet) warn("Aplikasi tidak sedang berjalan");
    return;
  }
  if (IS_WIN) {
    spawnSync("taskkill", ["/PID", String(cur.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try { process.kill(cur.pid, "SIGTERM"); } catch { /* sudah mati */ }
    for (let i = 0; i < 20 && isAlive(cur.pid); i++) await sleep(250);
    if (isAlive(cur.pid)) {
      try { process.kill(cur.pid, "SIGKILL"); } catch { /* sudah mati */ }
    }
  }
  for (let i = 0; i < 20 && isAlive(cur.pid); i++) await sleep(250);
  if (isAlive(cur.pid)) {
    fail(`Gagal menghentikan PID ${cur.pid}`);
    process.exit(1);
  }
  fs.rmSync(PID_FILE, { force: true });
  if (!quiet) ok(`Aplikasi dihentikan (PID ${cur.pid})`);
}

async function status() {
  const port = getPort();
  const cur = running();
  if (!cur) {
    console.log(c(31, "● Berhenti"));
    if (await portOpen(port)) warn(`Port ${port} dipakai proses lain (bukan dari script ini)`);
    process.exitCode = 3; // konvensi status: 3 = tidak berjalan
    return;
  }
  const healthy = await health(cur.port ?? port);
  console.log(c(healthy ? 32 : 33, "● Berjalan") + (healthy ? "" : c(33, " (health check gagal)")));
  console.log(`  PID     : ${cur.pid}`);
  console.log(`  URL     : http://localhost:${cur.port ?? port}`);
  console.log(`  Uptime  : ${fmtUptime(cur.startedAt)}`);
  console.log(`  Build   : backend ${fs.existsSync(SERVER_JS) ? "ada" : "TIDAK ada"}, frontend ${fs.existsSync(WEB_INDEX) ? "ada" : "TIDAK ada"}`);
  console.log(`  Log     : ${path.relative(ROOT, LOG_FILE)}`);
  if (!healthy) process.exitCode = 1;
}

function logs(n) {
  const out = tailLog(Number(n) || 50);
  console.log(out || "(log kosong)");
}

function help() {
  console.log(`Gmail Notify - pengelola aplikasi

Pemakaian:  ./app.sh <perintah>      (Linux/macOS)
            app.cmd <perintah>       (Windows)
            npm run <perintah>       (keduanya)

Perintah:
  build [--install]   Build backend & frontend (--install: npm install ulang)
  start               Jalankan di background (build otomatis jika belum ada)
  stop                Hentikan aplikasi
  restart [--build]   Hentikan lalu jalankan (--build: build ulang dulu)
  status              Tampilkan status (exit code 3 jika berhenti)
  logs [baris]        Tampilkan log terakhir (default 50 baris)

Port diambil dari PORT di backend/.env (default 3100).`);
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (f) => rest.includes(f);

switch (cmd) {
  case "build":
    build({ install: flag("--install") });
    break;
  case "start":
    await start();
    break;
  case "stop":
    await stop();
    break;
  case "restart":
    await stop({ quiet: true });
    if (flag("--build")) build();
    await start();
    break;
  case "status":
    await status();
    break;
  case "logs":
    logs(rest[0]);
    break;
  default:
    help();
    if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
}
