import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Express, NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { db } from "./db";
import { getSettings } from "./settings";
import { sendNotification } from "./mailer";
import { EMAIL_RE, errMsg } from "./sender";

// ---------- skema ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT,
    google_id     TEXT UNIQUE,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at    TEXT
  );
`);
db.pragma("foreign_keys = ON");

// migrasi ringan untuk database yang dibuat sebelum kolom ini ada
const userCols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
if (!userCols.includes("picture")) db.exec("ALTER TABLE users ADD COLUMN picture TEXT");
if (!userCols.includes("profile_completed")) db.exec("ALTER TABLE users ADD COLUMN profile_completed INTEGER NOT NULL DEFAULT 1");

if (!userCols.includes("username")) db.exec("ALTER TABLE users ADD COLUMN username TEXT");
if (!userCols.includes("is_demo")) db.exec("ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username COLLATE NOCASE) WHERE username IS NOT NULL");

/** Error yang pesannya aman ditampilkan apa adanya ke pengguna. */
class PublicError extends Error {}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  hasPassword: boolean;
  google: boolean;
  picture: string | null;
  username: string | null;
  /** akun contoh untuk mode demo */
  demo: boolean;
  /** false = akun baru dari Google yang belum ditinjau pemiliknya */
  profileCompleted: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionHash?: string;
    }
  }
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string | null;
  google_id: string | null;
  picture: string | null;
  username: string | null;
  is_demo: number;
  profile_completed: number;
  role: "admin" | "user";
}

const COOKIE = "sid";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_MS = 30 * 60 * 1000;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const toUser = (r: UserRow): AuthUser => ({
  id: r.id, email: r.email, name: r.name, role: r.role, hasPassword: !!r.password_hash, google: !!r.google_id,
  picture: r.picture, username: r.username, demo: !!r.is_demo, profileCompleted: !!r.profile_completed,
});
/** Jumlah pengguna sungguhan; akun demo tidak dihitung agar pendaftar pertama tetap menjadi admin. */
const userCount = () => (db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_demo = 0").get() as { c: number }).c;
const nowIso = () => new Date().toISOString();

// ---------- password (scrypt) ----------
function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await scrypt(password, salt)).toString("hex")}`;
}

async function verifyPassword(password: string, stored: string | null) {
  // tanpa hash tersimpan tetap menghitung hash agar waktu respons tidak membocorkan keberadaan akun
  const [, saltHex, keyHex] = (stored ?? "scrypt$00$00").split("$");
  const expected = Buffer.from(keyHex || "00", "hex");
  const actual = await scrypt(password, Buffer.from(saltHex || "00", "hex"));
  return !!stored && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function checkPassword(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < 8) throw new Error("Password minimal 8 karakter");
  if (pw.length > 128) throw new Error("Password maksimal 128 karakter");
  return pw;
}

function checkName(name: unknown): string {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n || n.length > 80) throw new Error("Nama wajib diisi (maks 80 karakter)");
  return n;
}

function checkEmail(email: unknown): string {
  const e = typeof email === "string" ? email.trim() : "";
  if (!EMAIL_RE.test(e) || e.length > 200) throw new Error("Alamat email tidak valid");
  return e;
}

// ---------- pembatasan percobaan ----------
const hits = new Map<string, { count: number; resetAt: number }>();

function limited(key: string, max: number): boolean {
  const h = hits.get(key);
  if (!h || h.resetAt < Date.now()) return false;
  return h.count >= max;
}
function hit(key: string, windowMs: number) {
  const h = hits.get(key);
  if (!h || h.resetAt < Date.now()) hits.set(key, { count: 1, resetAt: Date.now() + windowMs });
  else h.count++;
}
const clearHits = (key: string) => hits.delete(key);

// ---------- sesi ----------
function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie rusak */ }
    }
  }
  return out;
}

function startSession(req: Request, res: Response, userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(sha256(token), userId, new Date(Date.now() + SESSION_MS).toISOString());
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: SESSION_MS, path: "/" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = parseCookies(req)[COOKIE];
  if (token) {
    const hash = sha256(token);
    const row = db
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`
      )
      .get(hash, nowIso()) as UserRow | undefined;
    if (row) {
      req.user = toUser(row);
      req.sessionHash = hash;
      return next();
    }
  }
  res.status(401).json({ error: "Silakan masuk terlebih dahulu", code: "UNAUTHENTICATED" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Hanya admin yang dapat melakukan ini" });
  }
  next();
}

// ---------- pembuatan akun ----------
function registrationOpen() {
  return userCount() === 0 || getSettings().allowRegistration;
}

function createUser(input: { email: string; name: string; passwordHash?: string; googleId?: string; picture?: string }): UserRow {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  // ADMIN_EMAIL (opsional) menentukan siapa admin; tanpa itu, pendaftar pertama menjadi admin
  const role = adminEmail ? (input.email.toLowerCase() === adminEmail ? "admin" : "user") : userCount() === 0 ? "admin" : "user";
  const info = db
    .prepare("INSERT INTO users (email, name, password_hash, google_id, picture, profile_completed, role) VALUES (?, ?, ?, ?, ?, ?, ?)")
    // akun dari Google dibuat otomatis, jadi pemiliknya diajak meninjau data profil setelah masuk
    .run(input.email, input.name, input.passwordHash ?? null, input.googleId ?? null, input.picture ?? null, input.googleId ? 0 : 1, role);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(Number(info.lastInsertRowid)) as UserRow;
}

const findByEmail = (email: string) =>
  db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
const findByUsername = (username: string) =>
  db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username) as UserRow | undefined;

// ---------- mode demo ----------
const DEMO_ACCOUNTS = [
  { username: "admin", email: "admin@demo.local", name: "Admin Demo", password: "admin123", role: "admin" as const },
  { username: "demo", email: "demo@demo.local", name: "User Demo", password: "demo123", role: "user" as const },
];

/** DEMO_MODE=1/0 menentukan eksplisit; tanpa itu, demo aktif kecuali NODE_ENV=production. */
function demoMode(): boolean {
  const v = process.env.DEMO_MODE?.trim().toLowerCase();
  if (v) return v === "1" || v === "true";
  return process.env.NODE_ENV !== "production";
}

/** Mode demo: pastikan akun contoh ada. Selain itu: hapus agar tidak jadi celah login. */
async function syncDemoUsers() {
  if (!demoMode()) {
    const r = db.prepare("DELETE FROM users WHERE is_demo = 1").run();
    if (r.changes) console.log(`[auth] mode produksi: ${r.changes} akun demo dihapus`);
    return;
  }
  for (const a of DEMO_ACCOUNTS) {
    const hash = await hashPassword(a.password);
    const existing = db.prepare("SELECT id FROM users WHERE is_demo = 1 AND username = ?").get(a.username) as { id: number } | undefined;
    if (existing) {
      // kredensial demo selalu dikembalikan ke nilai bawaan agar sesuai yang tampil di halaman login
      db.prepare("UPDATE users SET password_hash = ?, role = ?, name = ? WHERE id = ?").run(hash, a.role, a.name, existing.id);
    } else if (!findByEmail(a.email)) {
      db.prepare(
        "INSERT INTO users (email, name, password_hash, role, username, is_demo, profile_completed) VALUES (?, ?, ?, ?, ?, 1, 1)"
      ).run(a.email, a.name, hash, a.role, a.username);
    }
  }
  console.warn("[auth] MODE DEMO aktif: akun admin/demo tersedia. Set NODE_ENV=production atau DEMO_MODE=0 untuk produksi.");
}

// ---------- reset password ----------
function appBaseUrl(): string {
  const s = getSettings();
  if (s.appUrl) return s.appUrl;
  const prodBuild = fs.existsSync(path.join(__dirname, "..", "..", "frontend", "dist", "index.html"));
  return prodBuild ? `http://localhost:${process.env.PORT || 3100}` : process.env.FRONTEND_ORIGIN || "http://localhost:5180";
}

async function sendResetEmail(user: UserRow) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);
  db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(sha256(token), user.id, new Date(Date.now() + RESET_MS).toISOString());

  const link = `${appBaseUrl()}/#reset=${token}`;
  try {
    await sendNotification({
      to: [user.email], cc: [], bcc: [],
      subject: "Atur ulang password Gmail Notify",
      message: "reset password",
      templateId: "info",
      values: {
        title: "Atur ulang password Anda",
        message: `Halo ${user.name},\nKami menerima permintaan untuk mengatur ulang password akun Anda. Tautan di bawah berlaku selama 30 menit dan hanya bisa dipakai sekali.\n\nJika Anda tidak merasa memintanya, abaikan email ini. Password Anda tidak akan berubah.`,
        buttonText: "Atur Ulang Password",
        buttonUrl: link,
      },
    });
    console.log(`[auth] email reset password dikirim ke ${user.email}`);
  } catch (err) {
    // SMTP belum siap: tautan dicatat di log server agar admin tetap bisa memulihkan akses
    console.warn(`[auth] gagal mengirim email reset (${errMsg(err)}). Tautan reset untuk ${user.email}: ${link}`);
  }
}

// ---------- routes ----------
export function registerAuthRoutes(app: Express) {
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

  // bersihkan sesi & token kedaluwarsa
  const cleanup = () => {
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso());
    db.prepare("DELETE FROM password_resets WHERE expires_at <= ? OR used_at IS NOT NULL").run(nowIso());
  };
  cleanup();
  setInterval(cleanup, 60 * 60 * 1000).unref();
  syncDemoUsers().catch((e) => console.error("[auth] gagal menyiapkan akun demo:", errMsg(e)));

  const fail = (res: Response, err: unknown, status = 400) =>
    res.status(status).json({ error: typeof err === "string" ? err : errMsg(err) });

  app.get("/api/auth/config", (_req, res) => {
    res.json({
      googleClientId: getSettings().googleClientId,
      allowRegistration: registrationOpen(),
      needsSetup: userCount() === 0,
      demoMode: demoMode(),
      // kredensial hanya dikirim saat mode demo; di produksi daftar ini selalu kosong
      demoAccounts: demoMode() ? DEMO_ACCOUNTS.map(({ username, password, name, role }) => ({ username, password, name, role })) : [],
    });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      if (!registrationOpen()) throw new Error("Pendaftaran ditutup. Hubungi admin untuk dibuatkan akun.");
      const email = checkEmail(req.body?.email);
      const name = checkName(req.body?.name);
      const password = checkPassword(req.body?.password);

      const key = `reg|${req.ip}`;
      if (limited(key, 10)) return fail(res, "Terlalu banyak percobaan. Coba lagi nanti.", 429);
      hit(key, 60 * 60 * 1000);

      if (findByEmail(email)) return fail(res, "Email ini sudah terdaftar. Silakan masuk.", 409);
      const user = createUser({ email, name, passwordHash: await hashPassword(password) });
      startSession(req, res, user.id);
      res.status(201).json({ user: toUser(user) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    // boleh email atau username (akun demo memakai username)
    const raw = req.body?.identifier ?? req.body?.email;
    const identifier = typeof raw === "string" ? raw.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const key = `login|${req.ip}|${identifier.toLowerCase()}`;

    if (limited(key, 5)) {
      return fail(res, "Terlalu banyak percobaan gagal. Tunggu 15 menit lalu coba lagi, atau gunakan Lupa password.", 429);
    }
    const user = !identifier ? undefined : EMAIL_RE.test(identifier) ? findByEmail(identifier) : findByUsername(identifier);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      hit(key, 15 * 60 * 1000);
      return fail(res, "Email/username atau password salah.", 401);
    }
    clearHits(key);
    startSession(req, res, user.id);
    res.json({ user: toUser(user) });
  });

  // masuk atau daftar otomatis lewat akun Google
  app.post("/api/auth/google", async (req, res) => {
    try {
      const clientId = getSettings().googleClientId;
      if (!clientId) throw new PublicError("Masuk dengan Google belum diaktifkan. Admin dapat mengaktifkannya di Pengaturan.");
      const credential = req.body?.credential;
      if (typeof credential !== "string" || !credential) throw new Error("Token Google tidak ditemukan");

      const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email || !p.email_verified) throw new PublicError("Email akun Google belum terverifikasi");

      let user = db.prepare("SELECT * FROM users WHERE google_id = ?").get(p.sub) as UserRow | undefined;
      if (!user) {
        const existing = findByEmail(p.email);
        if (existing) {
          // email Google sudah terverifikasi, aman menautkannya ke akun yang ada
          db.prepare("UPDATE users SET google_id = ?, picture = COALESCE(picture, ?) WHERE id = ?").run(p.sub, p.picture ?? null, existing.id);
          user = { ...existing, google_id: p.sub, picture: existing.picture ?? p.picture ?? null };
        } else {
          if (!registrationOpen()) throw new PublicError("Pendaftaran ditutup. Hubungi admin untuk dibuatkan akun.");
          user = createUser({ email: p.email, name: (p.name || p.email.split("@")[0]).slice(0, 80), googleId: p.sub, picture: p.picture });
        }
      }
      startSession(req, res, user.id);
      res.json({ user: toUser(user) });
    } catch (err) {
      console.warn("[auth] login Google gagal:", errMsg(err));
      if (err instanceof PublicError) return fail(res, err, 403);
      fail(res, "Login Google gagal. Pastikan Client ID dan origin aplikasi sudah terdaftar di Google Cloud Console.", 401);
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = parseCookies(req)[COOKIE];
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    res.clearCookie(COOKIE, { path: "/" });
    res.json({ success: true });
  });

  // jawaban selalu sama agar tidak membocorkan email mana yang terdaftar
  app.post("/api/auth/forgot", async (req, res) => {
    const generic = { success: true, message: "Jika email terdaftar, tautan untuk mengatur ulang password sudah dikirim. Cek kotak masuk dan folder spam." };
    try {
      const email = checkEmail(req.body?.email);
      const key = `forgot|${req.ip}|${email.toLowerCase()}`;
      if (limited(key, 3)) return fail(res, "Terlalu banyak permintaan. Coba lagi dalam 1 jam.", 429);
      hit(key, 60 * 60 * 1000);

      const user = findByEmail(email);
      if (user && !user.is_demo) void sendResetEmail(user); // tidak ditunggu: waktu respons sama untuk semua email
      res.json(generic);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/auth/reset", async (req, res) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      const password = checkPassword(req.body?.password);
      const row = db
        .prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
        .get(sha256(token), nowIso()) as { user_id: number } | undefined;
      if (!token || !row) throw new Error("Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.");

      const hash = await hashPassword(password);
      db.transaction(() => {
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, row.user_id);
        db.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?").run(nowIso(), sha256(token));
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id); // keluarkan semua perangkat
      })();
      res.json({ success: true });
    } catch (err) {
      fail(res, err);
    }
  });

  // ----- butuh login -----
  app.patch("/api/auth/profile", requireAuth, (req, res) => {
    try {
      // name opsional; complete=true menandai profil sudah ditinjau (menutup ajakan "Lengkapi profil")
      if (req.body?.name !== undefined) {
        db.prepare("UPDATE users SET name = ? WHERE id = ?").run(checkName(req.body.name), req.user!.id);
      }
      db.prepare("UPDATE users SET profile_completed = 1 WHERE id = ?").run(req.user!.id);
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.id) as UserRow;
      res.json({ user: toUser(row) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post("/api/auth/password", requireAuth, async (req, res) => {
    try {
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.id) as UserRow;
      const next = checkPassword(req.body?.password);
      // akun yang sudah punya password wajib memasukkan password saat ini
      if (row.password_hash) {
        const key = `chpw|${row.id}`;
        if (limited(key, 5)) return fail(res, "Terlalu banyak percobaan. Coba lagi nanti.", 429);
        if (!(await verifyPassword(String(req.body?.current ?? ""), row.password_hash))) {
          hit(key, 15 * 60 * 1000);
          return fail(res, "Password saat ini salah.", 400);
        }
        clearHits(key);
      }
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(next), row.id);
      // perangkat lain harus login ulang; sesi ini tetap
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(row.id, req.sessionHash);
      res.json({ success: true, user: { ...req.user!, hasPassword: true } });
    } catch (err) {
      fail(res, err);
    }
  });
}
