export interface NotifyPayload {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  message: string;
}

export interface Settings {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  defaultCc: string;
  defaultBcc: string;
  signature: string;
  sendHtml: boolean;
  googleClientId: string;
  allowRegistration: boolean;
  appUrl: string;
  hasPassword: boolean;
}

export interface SettingsInput extends Omit<Settings, "hasPassword"> {
  /** kosong = tidak mengubah password yang tersimpan */
  smtpPass?: string;
}

export interface EmailLog {
  id: number;
  to_addr: string;
  cc: string;
  bcc: string;
  subject: string;
  message: string;
  status: "sent" | "failed";
  error: string | null;
  message_id: string | null;
  created_at: string;
}

// dipanggil saat server menjawab 401 (sesi habis) di luar endpoint /api/auth
let onUnauthorized: (() => void) | undefined;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith("/api/auth/")) onUnauthorized?.();
  if (!res.ok) throw new Error(data.error || `Request gagal (${res.status})`);
  return data as T;
}

const body = (v: unknown): RequestInit => ({ body: JSON.stringify(v) });

export const sendNotify = (p: NotifyPayload) =>
  request<{ messageId: string }>("/api/notify", { method: "POST", ...body(p) });

export const getSettings = () => request<Settings>("/api/settings");

export const saveSettings = (s: SettingsInput) =>
  request<Settings>("/api/settings", { method: "PUT", ...body(s) });

export const testSettings = (s: SettingsInput) =>
  request<{ message: string }>("/api/settings/test", { method: "POST", ...body(s) });

export const getLogs = (status: "" | "sent" | "failed", limit: number, offset: number) =>
  request<{ items: EmailLog[]; total: number }>(
    `/api/logs?limit=${limit}&offset=${offset}${status ? `&status=${status}` : ""}`
  );

export const deleteLog = (id: number) => request<unknown>(`/api/logs/${id}`, { method: "DELETE" });

export const clearLogs = () => request<unknown>("/api/logs", { method: "DELETE" });

export interface TemplateField {
  key: string;
  label: string;
  type: "text" | "textarea" | "url";
  placeholder?: string;
  required?: boolean;
}

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  category: "notification" | "broadcast" | "both";
  icon: string;
  accent: string;
  fields: TemplateField[];
  sample: Record<string, string>;
}

export interface BroadcastResult {
  total: number;
  sent: number;
  failed: number;
  results: { email: string; ok: boolean; error?: string }[];
}

export const getTemplates = () => request<EmailTemplate[]>("/api/templates");

export const previewTemplate = (templateId: string, values: Record<string, string>) =>
  request<{ html: string }>("/api/templates/preview", { method: "POST", ...body({ templateId, values }) });

export const sendTemplated = (p: {
  to: string; cc?: string; bcc?: string; subject: string; templateId: string; values: Record<string, string>;
}) => request<{ messageId: string }>("/api/notify", { method: "POST", ...body(p) });

export const sendBroadcast = (p: {
  recipients: string; subject: string; templateId: string; values: Record<string, string>;
}) => request<BroadcastResult>("/api/broadcast", { method: "POST", ...body(p) });

export type Repeat = "once" | "interval" | "daily" | "weekly";

export interface JobInput {
  mode: "notify" | "broadcast";
  to?: string;
  cc?: string;
  bcc?: string;
  recipients?: string;
  subject: string;
  templateId: string;
  values: Record<string, string>;
}

export interface Schedule {
  id: number;
  name: string;
  enabled: boolean;
  repeat: Repeat;
  runAt: string | null;
  intervalMin: number | null;
  timeOfDay: string | null;
  weekdays: number[];
  job: JobInput;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "success" | "partial" | "failed" | null;
  lastResult: string | null;
  runCount: number;
}

export interface ScheduleInput {
  name: string;
  repeat: Repeat;
  runAt?: string;
  intervalMin?: number;
  timeOfDay?: string;
  weekdays?: number[];
  job: JobInput;
}

export const getSchedules = () => request<Schedule[]>("/api/schedules");
export const createSchedule = (s: ScheduleInput) => request<Schedule>("/api/schedules", { method: "POST", ...body(s) });
export const toggleSchedule = (id: number, enabled: boolean) =>
  request<Schedule>("/api/schedules/" + id, { method: "PATCH", ...body({ enabled }) });
export const runScheduleNow = (id: number) => request<Schedule>("/api/schedules/" + id + "/run", { method: "POST" });
export const deleteSchedule = (id: number) => request<unknown>("/api/schedules/" + id, { method: "DELETE" });

export const changeAccount = (smtpUser: string, smtpPass: string) =>
  request<Settings>("/api/settings/account", { method: "PUT", ...body({ smtpUser, smtpPass }) });

export const disconnectAccount = () => request<Settings>("/api/settings/account", { method: "DELETE" });

// ---------- Autentikasi ----------
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  hasPassword: boolean;
  google: boolean;
  picture: string | null;
  username: string | null;
  demo: boolean;
  profileCompleted: boolean;
}

export interface AuthConfig {
  googleClientId: string;
  allowRegistration: boolean;
  needsSetup: boolean;
  /** true hanya di mode demo/pengembangan */
  demoMode: boolean;
  /** akun contoh untuk login cepat; selalu kosong di production */
  demoAccounts: { username: string; password: string; name: string; role: "admin" | "user" }[];
}

export const fetchAuthConfig = () => request<AuthConfig>("/api/auth/config");
export const fetchMe = () => request<{ user: AuthUser }>("/api/auth/me");
/** identifier = email atau username */
export const apiLogin = (identifier: string, password: string) =>
  request<{ user: AuthUser }>("/api/auth/login", { method: "POST", ...body({ identifier, password }) });
export const apiRegister = (name: string, email: string, password: string) =>
  request<{ user: AuthUser }>("/api/auth/register", { method: "POST", ...body({ name, email, password }) });
export const apiGoogleLogin = (credential: string) =>
  request<{ user: AuthUser }>("/api/auth/google", { method: "POST", ...body({ credential }) });
export const apiLogout = () => request<unknown>("/api/auth/logout", { method: "POST" });
export const apiForgot = (email: string) =>
  request<{ message: string }>("/api/auth/forgot", { method: "POST", ...body({ email }) });
export const apiReset = (token: string, password: string) =>
  request<unknown>("/api/auth/reset", { method: "POST", ...body({ token, password }) });
export const apiChangePassword = (current: string, password: string) =>
  request<{ user: AuthUser }>("/api/auth/password", { method: "POST", ...body({ current, password }) });
/** Tanpa argumen: hanya menandai profil sudah ditinjau. */
export const apiUpdateProfile = (name?: string) =>
  request<{ user: AuthUser }>("/api/auth/profile", { method: "PATCH", ...body(name === undefined ? {} : { name }) });
