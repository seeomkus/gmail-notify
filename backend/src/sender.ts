import { db } from "./db";
import { getSettings } from "./settings";
import { openMailer } from "./mailer";
import { fillVars, getTemplate, sanitizeValues } from "./templates";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const BROADCAST_MAX = 200;

export function errMsg(err: unknown) {
  return err instanceof Error ? err.message : "Terjadi kesalahan";
}

/** "a@x.com, b@y.com" -> ["a@x.com","b@y.com"]; melempar error jika ada yang tidak valid. */
export function parseEmails(raw: unknown, label: string, required = false): string[] {
  const list = (typeof raw === "string" ? raw : "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (required && list.length === 0) throw new Error(`${label} wajib diisi`);
  for (const e of list) {
    if (!EMAIL_RE.test(e)) throw new Error(`${label} tidak valid: ${e}`);
  }
  return list;
}

export interface Recipient {
  email: string;
  name: string;
}

/** Baris "email, nama" -> [{email, name}]; duplikat dibuang. */
export function parseRecipients(raw: unknown) {
  const seen = new Set<string>();
  const list: Recipient[] = [];
  const invalid: string[] = [];
  for (const line of (typeof raw === "string" ? raw : "").split(/\r?\n/)) {
    const [email = "", ...rest] = line.split(/[,;\t]/);
    const e = email.trim();
    if (!e) continue;
    if (!EMAIL_RE.test(e)) {
      invalid.push(e);
      continue;
    }
    if (seen.has(e.toLowerCase())) continue;
    seen.add(e.toLowerCase());
    list.push({ email: e, name: rest.join(" ").trim() });
  }
  return { list, invalid };
}

function validateSubject(subject: unknown): string {
  if (typeof subject !== "string" || !subject.trim() || subject.length > 200) {
    throw new Error("Subjek wajib diisi (maks 200 karakter)");
  }
  return subject.trim();
}

/** Validasi isi: dengan template -> field template, tanpa template -> pesan polos. */
function resolveBody(body: any) {
  if (body?.templateId) {
    const t = getTemplate(String(body.templateId));
    if (!t) throw new Error("Template tidak ditemukan");
    const values = sanitizeValues(t, body.values);
    return { templateId: t.id as string | undefined, values: values as Record<string, string> | undefined, message: values.message ?? "" };
  }
  const message = body?.message;
  if (typeof message !== "string" || !message.trim() || message.length > 5000) {
    throw new Error("Pesan wajib diisi (maks 5000 karakter)");
  }
  return { templateId: undefined, values: undefined, message: message.trim() };
}

export interface Job {
  mode: "notify" | "broadcast";
  to: string[];
  cc: string[];
  bcc: string[];
  recipients: Recipient[];
  subject: string;
  templateId?: string;
  values?: Record<string, string>;
  message: string;
}

/** Validasi input mentah (dari form atau jadwal tersimpan) menjadi Job siap kirim. */
export function prepareJob(input: any): Job {
  const mode = input?.mode === "broadcast" ? "broadcast" : "notify";
  const subject = validateSubject(input?.subject);
  const body = resolveBody(input);

  if (mode === "broadcast") {
    const parsed = parseRecipients(input?.recipients);
    if (parsed.invalid.length) throw new Error(`Email tidak valid: ${parsed.invalid.slice(0, 5).join(", ")}`);
    if (!parsed.list.length) throw new Error("Daftar penerima kosong");
    if (parsed.list.length > BROADCAST_MAX) throw new Error(`Maksimal ${BROADCAST_MAX} penerima per broadcast`);
    return { mode, to: [], cc: [], bcc: [], recipients: parsed.list, subject, ...body };
  }

  const s = getSettings();
  return {
    mode,
    to: parseEmails(input?.to, "Email tujuan", true),
    cc: parseEmails(input?.cc ?? s.defaultCc, "CC"),
    bcc: parseEmails(input?.bcc ?? s.defaultBcc, "BCC"),
    recipients: [],
    subject,
    ...body,
  };
}

/** Bentuk yang disimpan di database jadwal (string biasa, mudah divalidasi ulang). */
export function serializeJob(job: Job) {
  return {
    mode: job.mode,
    to: job.to.join(", "),
    cc: job.cc.join(", "),
    bcc: job.bcc.join(", "),
    recipients: job.recipients.map((r) => (r.name ? `${r.email}, ${r.name}` : r.email)).join("\n"),
    subject: job.subject,
    templateId: job.templateId,
    values: job.values,
    message: job.templateId ? undefined : job.message,
  };
}

export interface JobResult {
  total: number;
  sent: number;
  failed: number;
  results: { email: string; ok: boolean; error?: string; messageId?: string }[];
}

const insertLog = db.prepare(
  `INSERT INTO email_logs (to_addr, cc, bcc, subject, message, status, error, message_id, template_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

/**
 * Menjalankan job. Setiap pengiriman dicatat ke email_logs.
 * Untuk broadcast, melempar error bila SMTP belum dikonfigurasi (belum ada email yang dicoba).
 */
export async function runJob(job: Job): Promise<JobResult> {
  const results: JobResult["results"] = [];

  let mailer: ReturnType<typeof openMailer>;
  try {
    mailer = openMailer();
  } catch (err) {
    if (job.mode === "broadcast") throw err;
    const email = job.to.join(", ");
    insertLog.run(email, job.cc.join(", "), job.bcc.join(", "), job.subject, job.message, "failed", errMsg(err), null, job.templateId ?? null);
    return { total: 1, sent: 0, failed: 1, results: [{ email, ok: false, error: errMsg(err) }] };
  }

  try {
    if (job.mode === "notify") {
      const email = job.to.join(", ");
      try {
        const sent = await mailer.send({
          to: job.to, cc: job.cc, bcc: job.bcc, subject: job.subject,
          message: job.message, templateId: job.templateId, values: job.values,
          recipient: { email: job.to[0] },
        });
        insertLog.run(email, job.cc.join(", "), job.bcc.join(", "), job.subject, job.message, "sent", null, sent.messageId, job.templateId ?? null);
        results.push({ email, ok: true, messageId: sent.messageId });
      } catch (err) {
        console.error("Gagal mengirim email:", err);
        insertLog.run(email, job.cc.join(", "), job.bcc.join(", "), job.subject, job.message, "failed", errMsg(err), null, job.templateId ?? null);
        results.push({ email, ok: false, error: errMsg(err) });
      }
    } else {
      // satu per satu: setiap penerima mendapat email personal tanpa membuka alamat orang lain
      for (const r of job.recipients) {
        const ctx = { recipientName: r.name, recipientEmail: r.email };
        const subject = fillVars(job.subject, ctx);
        const message = fillVars(job.message, ctx);
        try {
          const sent = await mailer.send({
            to: [r.email], cc: [], bcc: [], subject,
            message: job.message, templateId: job.templateId, values: job.values, recipient: r,
          });
          insertLog.run(r.email, "", "", subject, message, "sent", null, sent.messageId, job.templateId ?? null);
          results.push({ email: r.email, ok: true, messageId: sent.messageId });
        } catch (err) {
          insertLog.run(r.email, "", "", subject, message, "failed", errMsg(err), null, job.templateId ?? null);
          results.push({ email: r.email, ok: false, error: errMsg(err) });
        }
      }
    }
  } finally {
    mailer.close();
  }

  const sent = results.filter((r) => r.ok).length;
  return { total: results.length, sent, failed: results.length - sent, results };
}
