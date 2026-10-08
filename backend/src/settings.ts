import { db } from "./db";

export interface Settings {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  defaultCc: string;
  defaultBcc: string;
  signature: string;
  sendHtml: boolean;
  /** Client ID OAuth Google untuk "Masuk dengan Google" (kosong = fitur nonaktif) */
  googleClientId: string;
  /** false = hanya admin yang bisa menambah pengguna; pendaftaran publik ditutup */
  allowRegistration: boolean;
  /** URL publik aplikasi, dipakai untuk tautan reset password di email */
  appUrl: string;
}

const defaults = (): Settings => ({
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: process.env.GMAIL_USER || "",
  smtpPass: process.env.GMAIL_APP_PASSWORD || "",
  fromName: "Gmail Notify",
  fromEmail: "",
  replyTo: "",
  defaultCc: "",
  defaultBcc: "",
  signature: "Notifikasi dikirim manual dari aplikasi Gmail Notify.",
  sendHtml: true,
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  allowRegistration: true,
  appUrl: process.env.APP_URL || "",
});

export function getSettings(): Settings {
  const result: Record<string, unknown> = { ...defaults() };
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  for (const { key, value } of rows) {
    if (key in result) result[key] = JSON.parse(value);
  }
  return result as unknown as Settings;
}

export function saveSettings(patch: Partial<Settings>) {
  const allowed = Object.keys(defaults());
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (allowed.includes(k)) stmt.run(k, JSON.stringify(v));
    }
  })();
}

/** Versi aman untuk dikirim ke frontend: password tidak pernah dikembalikan. */
export function publicSettings() {
  const { smtpPass, ...rest } = getSettings();
  return { ...rest, hasPassword: smtpPass.length > 0 };
}
