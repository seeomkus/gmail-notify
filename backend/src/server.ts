import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { db } from "./db";
import { registerAuthRoutes, requireAdmin, requireAuth } from "./auth";
import { getSettings, publicSettings, saveSettings, Settings } from "./settings";
import { verifySmtp } from "./mailer";
import { EMAIL_RE, errMsg, parseEmails, prepareJob, runJob } from "./sender";
import { registerScheduleRoutes, startScheduler } from "./schedules";
import { getTemplate, renderEmail, templates } from "./templates";

const app = express();
const port = Number(process.env.PORT) || 3100;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5180", credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ---------- Autentikasi ----------
// /api/auth/* bersifat publik (login, daftar, lupa password). Semua endpoint /api lain wajib login.
registerAuthRoutes(app);
app.use("/api", requireAuth);
// semua orang boleh membaca pengaturan; mengubahnya hanya untuk admin
app.use("/api/settings", (req, res, next) => (req.method === "GET" ? next() : requireAdmin(req, res, next)));

// ---------- Pengaturan ----------
app.get("/api/settings", (_req, res) => {
  res.json(publicSettings());
});

function validateSettings(body: any): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (body.smtpHost !== undefined) {
    if (typeof body.smtpHost !== "string" || !body.smtpHost.trim()) throw new Error("SMTP host wajib diisi");
    out.smtpHost = body.smtpHost.trim();
  }
  if (body.smtpPort !== undefined) {
    const p = Number(body.smtpPort);
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error("Port tidak valid");
    out.smtpPort = p;
  }
  if (body.smtpSecure !== undefined) out.smtpSecure = Boolean(body.smtpSecure);
  if (body.sendHtml !== undefined) out.sendHtml = Boolean(body.sendHtml);
  for (const k of ["smtpUser", "fromName", "signature"] as const) {
    if (body[k] !== undefined) out[k] = String(body[k]).trim();
  }
  if (body.fromEmail !== undefined) {
    parseEmails(body.fromEmail, "Email pengirim");
    out.fromEmail = String(body.fromEmail).trim();
  }
  if (body.replyTo !== undefined) {
    parseEmails(body.replyTo, "Reply-To");
    out.replyTo = String(body.replyTo).trim();
  }
  if (body.defaultCc !== undefined) {
    parseEmails(body.defaultCc, "CC default");
    out.defaultCc = String(body.defaultCc).trim();
  }
  if (body.defaultBcc !== undefined) {
    parseEmails(body.defaultBcc, "BCC default");
    out.defaultBcc = String(body.defaultBcc).trim();
  }
  if (body.allowRegistration !== undefined) out.allowRegistration = Boolean(body.allowRegistration);
  if (body.googleClientId !== undefined) {
    const id = String(body.googleClientId).trim();
    if (id.length > 200 || /\s/.test(id)) throw new Error("Client ID Google tidak valid");
    out.googleClientId = id;
  }
  if (body.appUrl !== undefined) {
    const u = String(body.appUrl).trim().replace(/\/+$/, "");
    if (u && !/^https?:\/\/[^\s/]+(\/\S*)?$/i.test(u)) throw new Error("URL aplikasi harus diawali http:// atau https://");
    out.appUrl = u;
  }
  // password kosong = tidak diubah
  if (typeof body.smtpPass === "string" && body.smtpPass.length > 0) {
    out.smtpPass = body.smtpPass.replace(/\s/g, ""); // App Password Google sering ditampilkan dengan spasi
  }
  return out;
}

app.put("/api/settings", (req, res) => {
  try {
    const patch = validateSettings(req.body ?? {});
    // email baru tanpa App Password baru akan menyisakan sandi akun lama
    if (patch.smtpUser !== undefined && patch.smtpUser !== getSettings().smtpUser) {
      throw new Error("Untuk mengganti akun Gmail, gunakan tombol Ganti akun agar App Password ikut diperbarui.");
    }
    saveSettings(patch);
    res.json(publicSettings());
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

/**
 * Ganti akun Gmail pengirim. Akun baru diuji dulu; pengaturan lama baru ditimpa jika login berhasil,
 * sehingga salah ketik tidak merusak akun yang sedang bekerja.
 */
app.put("/api/settings/account", async (req, res) => {
  try {
    const user = String(req.body?.smtpUser ?? "").trim();
    const pass = String(req.body?.smtpPass ?? "").replace(/\s/g, "");
    if (!EMAIL_RE.test(user)) throw new Error("Alamat Gmail tidak valid");
    if (!pass) throw new Error("App Password wajib diisi");

    await verifySmtp({ smtpUser: user, smtpPass: pass });
    // email alias milik akun lama tidak berlaku untuk akun baru
    saveSettings({ smtpUser: user, smtpPass: pass, fromEmail: "" });
    res.json(publicSettings());
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

/** Putuskan akun: hapus email & App Password dari database. */
app.delete("/api/settings/account", (_req, res) => {
  saveSettings({ smtpUser: "", smtpPass: "", fromEmail: "" });
  res.json(publicSettings());
});

app.post("/api/settings/test", async (req, res) => {
  try {
    await verifySmtp(validateSettings(req.body ?? {}));
    res.json({ success: true, message: "Koneksi dan login SMTP berhasil" });
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

// ---------- Template ----------
app.get("/api/templates", (_req, res) => {
  res.json(templates);
});

app.post("/api/templates/preview", (req, res) => {
  const t = getTemplate(String(req.body?.templateId));
  if (!t) return res.status(404).json({ error: "Template tidak ditemukan" });
  const s = getSettings();
  const values: Record<string, string> = {};
  for (const f of t.fields) {
    const v = req.body?.values?.[f.key];
    values[f.key] = typeof v === "string" ? v.slice(0, 5000) : "";
  }
  const { html } = renderEmail(t, values, {
    recipientName: "Budi",
    recipientEmail: "budi@example.com",
    signature: s.signature,
    senderName: s.fromName,
  });
  res.json({ html });
});

// ---------- Kirim email ----------
app.post("/api/notify", async (req, res) => {
  let job;
  try {
    job = prepareJob({ ...req.body, mode: "notify" });
  } catch (err) {
    return res.status(400).json({ error: errMsg(err) });
  }
  const result = await runJob(job);
  const r = result.results[0];
  if (!r.ok) return res.status(500).json({ error: r.error });
  res.json({ success: true, messageId: r.messageId });
});

// ---------- Broadcast ----------
app.post("/api/broadcast", async (req, res) => {
  try {
    res.json(await runJob(prepareJob({ ...req.body, mode: "broadcast" })));
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

registerScheduleRoutes(app);

// ---------- Riwayat ----------
app.get("/api/logs", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const status = req.query.status === "sent" || req.query.status === "failed" ? req.query.status : null;

  const where = status ? "WHERE status = ?" : "";
  const args = status ? [status] : [];
  const items = db
    .prepare(`SELECT * FROM email_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset);
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM email_logs ${where}`).get(...args) as { total: number };
  res.json({ items, total });
});

app.delete("/api/logs/:id", (req, res) => {
  db.prepare("DELETE FROM email_logs WHERE id = ?").run(Number(req.params.id));
  res.json({ success: true });
});

app.delete("/api/logs", (_req, res) => {
  db.prepare("DELETE FROM email_logs").run();
  res.json({ success: true });
});

// ---------- Frontend (mode produksi) ----------
// Jika frontend sudah di-build, sajikan dari sini sehingga cukup satu proses & satu port.
const webDist = process.env.WEB_DIST || path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(path.join(webDist, "index.html"))) {
  app.use(express.static(webDist));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) return res.sendFile(path.join(webDist, "index.html"));
    next();
  });
}

app.listen(port, () => {
  console.log(`Backend berjalan di http://localhost:${port}`);
  console.log("Gmail Notify · © Oktober 2026 Kusnandar Rohim (SeeOmKus) · www.seeomkus.com");
  startScheduler();
});
