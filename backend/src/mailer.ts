import nodemailer from "nodemailer";
import { getSettings, Settings } from "./settings";
import { getTemplate, renderEmail } from "./templates";

export interface NotificationInput {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  /** isi pesan polos (dipakai jika tanpa template) */
  message: string;
  templateId?: string;
  values?: Record<string, string>;
  recipient?: { name?: string; email?: string };
}

function createTransporter(s: Settings) {
  if (!s.smtpHost || !s.smtpUser || !s.smtpPass) {
    throw new Error("Pengaturan SMTP belum lengkap. Isi host, user, dan password di tab Pengaturan.");
  }
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpSecure,
    auth: { user: s.smtpUser, pass: s.smtpPass },
    connectionTimeout: 15000,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Menerjemahkan error SMTP teknis menjadi pesan yang mudah dipahami pengguna. */
export function friendlySmtpError(err: unknown): Error {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e?.code === "EAUTH" || e?.responseCode === 535) {
    return new Error("Email atau App Password salah. Pastikan memakai App Password 16 karakter (bukan password login Gmail) dan Verifikasi 2 Langkah sudah aktif.");
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "ENOTFOUND", "EDNS"].includes(e?.code ?? "")) {
    return new Error("Tidak dapat terhubung ke server SMTP. Periksa koneksi internet, host, port, dan pastikan port SMTP tidak diblokir firewall.");
  }
  return err instanceof Error ? err : new Error("Terjadi kesalahan saat menghubungi server email");
}

/** Cek koneksi & login SMTP tanpa mengirim email. Menerima override dari form. */
export async function verifySmtp(override?: Partial<Settings>) {
  const saved = getSettings();
  const merged = { ...saved, ...override };
  // password kosong dari form berarti "pakai yang tersimpan"
  if (!override?.smtpPass) merged.smtpPass = saved.smtpPass;
  try {
    await createTransporter(merged).verify();
  } catch (err) {
    throw friendlySmtpError(err);
  }
}

/** Isi email (html + teks) berdasarkan template atau pesan polos. */
export function buildContent(s: Settings, input: Pick<NotificationInput, "message" | "templateId" | "values" | "recipient">) {
  const template = input.templateId ? getTemplate(input.templateId) : undefined;
  if (template) {
    const r = renderEmail(template, input.values ?? {}, {
      recipientName: input.recipient?.name,
      recipientEmail: input.recipient?.email,
      signature: s.signature,
      senderName: s.fromName,
    });
    return { html: s.sendHtml ? r.html : undefined, text: r.text, plain: r.plainMessage };
  }

  const text = s.signature ? `${input.message}\n\n--\n${s.signature}` : input.message;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:16px;border:1px solid #e5e7eb;border-radius:8px">
      <p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>
      ${
        s.signature
          ? `<hr style="border:none;border-top:1px solid #e5e7eb"/><small style="color:#6b7280;white-space:pre-wrap">${escapeHtml(s.signature)}</small>`
          : ""
      }
    </div>`;
  return { html: s.sendHtml ? html : undefined, text, plain: input.message };
}

/** Membuka satu transporter yang dipakai ulang (efisien untuk broadcast). */
export function openMailer() {
  const s = getSettings();
  const transporter = createTransporter(s);
  const fromEmail = s.fromEmail || s.smtpUser;
  const from = s.fromName ? `"${s.fromName.replace(/"/g, "")}" <${fromEmail}>` : fromEmail;

  return {
    async send(input: NotificationInput) {
      const { html, text } = buildContent(s, input);
      try {
        const info = await transporter.sendMail({
          from,
          to: input.to,
          cc: input.cc.length ? input.cc : undefined,
          bcc: input.bcc.length ? input.bcc : undefined,
          replyTo: s.replyTo || undefined,
          subject: input.subject,
          text,
          html,
        });
        return { messageId: info.messageId };
      } catch (err) {
        throw friendlySmtpError(err);
      }
    },
    close: () => transporter.close(),
  };
}

export async function sendNotification(input: NotificationInput) {
  const mailer = openMailer();
  try {
    return await mailer.send(input);
  } finally {
    mailer.close();
  }
}
