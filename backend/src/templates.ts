export type Category = "notification" | "broadcast" | "both";
export type Variant = "banner" | "hero" | "plain";

export interface Field {
  key: string;
  label: string;
  type: "text" | "textarea" | "url";
  placeholder?: string;
  required?: boolean;
  /** tampil sebagai baris di kartu detail */
  detail?: boolean;
  /** peran khusus dalam layout */
  role?: "highlight" | "code";
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: Category;
  icon: string;
  label: string;
  accent: string;
  tint: string;
  variant: Variant;
  fields: Field[];
  sample: Record<string, string> & { subject: string };
}

const title: Field = { key: "title", label: "Judul", type: "text", required: true };
const message: Field = { key: "message", label: "Isi pesan", type: "textarea", required: true };
const btnText: Field = { key: "buttonText", label: "Teks tombol", type: "text", placeholder: "opsional" };
const btnUrl: Field = { key: "buttonUrl", label: "Link tombol", type: "url", placeholder: "https://..." };

export const templates: Template[] = [
  {
    id: "info",
    name: "Pemberitahuan Umum",
    description: "Informasi biasa yang rapi dan netral.",
    category: "notification",
    icon: "🔔",
    label: "Pemberitahuan",
    accent: "#2563eb",
    tint: "#eff6ff",
    variant: "banner",
    fields: [title, message, btnText, btnUrl],
    sample: {
      subject: "Pemberitahuan: pembaruan jadwal",
      title: "Halo {{nama}}, ada informasi untuk Anda",
      message: "Jadwal layanan minggu ini mengalami penyesuaian.\nSilakan cek detail lengkapnya melalui tombol di bawah.",
      buttonText: "Lihat Detail",
      buttonUrl: "https://example.com/info",
    },
  },
  {
    id: "success",
    name: "Konfirmasi Berhasil",
    description: "Tanda bahwa suatu proses sudah berhasil.",
    category: "notification",
    icon: "✅",
    label: "Konfirmasi",
    accent: "#16a34a",
    tint: "#f0fdf4",
    variant: "banner",
    fields: [
      title,
      message,
      { key: "reference", label: "No. referensi", type: "text", placeholder: "opsional", detail: true },
      { key: "when", label: "Waktu", type: "text", placeholder: "opsional", detail: true },
      btnText,
      btnUrl,
    ],
    sample: {
      subject: "Pembayaran Anda berhasil",
      title: "Terima kasih, {{nama}}!",
      message: "Pembayaran Anda sudah kami terima dan pesanan sedang diproses.",
      reference: "INV-2026-00123",
      when: "7 Oktober 2026, 14:30 WIB",
      buttonText: "Lihat Pesanan",
      buttonUrl: "https://example.com/orders/123",
    },
  },
  {
    id: "alert",
    name: "Peringatan Penting",
    description: "Untuk hal mendesak yang perlu segera ditindaklanjuti.",
    category: "notification",
    icon: "⚠️",
    label: "Peringatan",
    accent: "#dc2626",
    tint: "#fef2f2",
    variant: "banner",
    fields: [title, message, { key: "action", label: "Tindakan yang diperlukan", type: "text", detail: true }, btnText, btnUrl],
    sample: {
      subject: "Penting: aktivitas login baru terdeteksi",
      title: "Ada login baru di akun Anda",
      message: "Halo {{nama}}, kami mendeteksi login dari perangkat yang belum dikenal.\nJika ini bukan Anda, segera amankan akun.",
      action: "Ganti password sekarang",
      buttonText: "Amankan Akun",
      buttonUrl: "https://example.com/security",
    },
  },
  {
    id: "reminder",
    name: "Pengingat",
    description: "Reminder jadwal, tenggat, atau janji temu.",
    category: "notification",
    icon: "⏰",
    label: "Pengingat",
    accent: "#7c3aed",
    tint: "#f5f3ff",
    variant: "banner",
    fields: [
      title,
      message,
      { key: "when", label: "Waktu", type: "text", detail: true, required: true },
      { key: "place", label: "Tempat / keterangan", type: "text", detail: true, placeholder: "opsional" },
      btnText,
      btnUrl,
    ],
    sample: {
      subject: "Pengingat: rapat besok pagi",
      title: "Jangan lupa, {{nama}}",
      message: "Kami mengingatkan jadwal rapat mingguan tim.",
      when: "Kamis, 8 Oktober 2026 · 09.00 WIB",
      place: "Ruang Meeting Lt. 3 / Google Meet",
      buttonText: "Buka Kalender",
      buttonUrl: "https://example.com/calendar",
    },
  },
  {
    id: "maintenance",
    name: "Pemeliharaan Sistem",
    description: "Pengumuman downtime atau maintenance terjadwal.",
    category: "notification",
    icon: "🛠️",
    label: "Pemeliharaan",
    accent: "#ea580c",
    tint: "#fff7ed",
    variant: "banner",
    fields: [
      title,
      message,
      { key: "startAt", label: "Mulai", type: "text", detail: true, required: true },
      { key: "endAt", label: "Selesai", type: "text", detail: true },
      { key: "impact", label: "Dampak", type: "text", detail: true },
    ],
    sample: {
      subject: "Jadwal pemeliharaan sistem",
      title: "Pemeliharaan sistem terjadwal",
      message: "Untuk meningkatkan kualitas layanan, kami akan melakukan pemeliharaan rutin. Mohon maaf atas ketidaknyamanannya.",
      startAt: "Sabtu, 10 Oktober 2026 · 22.00 WIB",
      endAt: "Minggu, 11 Oktober 2026 · 02.00 WIB",
      impact: "Layanan tidak dapat diakses sementara",
    },
  },
  {
    id: "newsletter",
    name: "Newsletter / Pengumuman",
    description: "Tampilan hero untuk kabar atau berita ke banyak orang.",
    category: "broadcast",
    icon: "📰",
    label: "Newsletter",
    accent: "#0f172a",
    tint: "#f1f5f9",
    variant: "hero",
    fields: [title, message, btnText, btnUrl],
    sample: {
      subject: "Kabar terbaru bulan Oktober",
      title: "Kabar Terbaru Oktober 2026",
      message: "Halo {{nama}},\n\nBulan ini kami meluncurkan beberapa pembaruan penting:\n• Dashboard baru yang lebih cepat\n• Laporan otomatis setiap minggu\n• Dukungan pelanggan 24 jam\n\nTerima kasih sudah bersama kami.",
      buttonText: "Baca Selengkapnya",
      buttonUrl: "https://example.com/blog",
    },
  },
  {
    id: "event",
    name: "Undangan Acara",
    description: "Undangan webinar, rapat, atau acara dengan detail lengkap.",
    category: "broadcast",
    icon: "🎉",
    label: "Undangan",
    accent: "#0d9488",
    tint: "#f0fdfa",
    variant: "hero",
    fields: [
      title,
      message,
      { key: "when", label: "Tanggal & waktu", type: "text", detail: true, required: true },
      { key: "place", label: "Lokasi", type: "text", detail: true },
      { key: "contact", label: "Kontak", type: "text", detail: true, placeholder: "opsional" },
      btnText,
      btnUrl,
    ],
    sample: {
      subject: "Undangan: Webinar Produktivitas Tim",
      title: "Anda diundang, {{nama}}!",
      message: "Bergabunglah bersama kami dalam webinar tentang cara meningkatkan produktivitas tim. Tempat terbatas.",
      when: "Sabtu, 17 Oktober 2026 · 10.00 – 12.00 WIB",
      place: "Online via Zoom",
      contact: "panitia@example.com",
      buttonText: "Daftar Sekarang",
      buttonUrl: "https://example.com/rsvp",
    },
  },
  {
    id: "promo",
    name: "Promo / Penawaran",
    description: "Highlight diskon dengan kode voucher dan batas waktu.",
    category: "broadcast",
    icon: "🏷️",
    label: "Penawaran Spesial",
    accent: "#db2777",
    tint: "#fdf2f8",
    variant: "hero",
    fields: [
      title,
      message,
      { key: "highlight", label: "Highlight", type: "text", role: "highlight", placeholder: "mis. DISKON 50%" },
      { key: "code", label: "Kode voucher", type: "text", role: "code", placeholder: "opsional" },
      { key: "validUntil", label: "Berlaku sampai", type: "text", detail: true },
      btnText,
      btnUrl,
    ],
    sample: {
      subject: "Promo spesial untuk Anda",
      title: "Khusus untuk {{nama}}",
      message: "Nikmati penawaran terbatas untuk semua produk pilihan. Gunakan kode di bawah saat checkout.",
      highlight: "DISKON 50%",
      code: "HEMAT50",
      validUntil: "31 Oktober 2026",
      buttonText: "Belanja Sekarang",
      buttonUrl: "https://example.com/promo",
    },
  },
  {
    id: "simple",
    name: "Teks Sederhana",
    description: "Tampilan polos seperti email biasa, tanpa header berwarna.",
    category: "both",
    icon: "✉️",
    label: "",
    accent: "#374151",
    tint: "#f9fafb",
    variant: "plain",
    fields: [title, message],
    sample: {
      subject: "Halo dari kami",
      title: "Halo {{nama}},",
      message: "Ini contoh email sederhana tanpa banyak dekorasi.\nCocok untuk pesan personal atau singkat.",
    },
  },
];

export const getTemplate = (id: string) => templates.find((t) => t.id === id);

// ---------- Render ----------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const multiline = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

const safeUrl = (u: string) => (/^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : "");

export interface RenderContext {
  recipientName?: string;
  recipientEmail?: string;
  signature?: string;
  senderName?: string;
}

/** Ganti {{nama}} dan {{email}} dengan data penerima. */
export function fillVars(s: string, ctx: RenderContext): string {
  const name = ctx.recipientName?.trim() || "";
  return s
    .replace(/\{\{\s*nama\s*\}\}/gi, name || "Pelanggan")
    .replace(/\{\{\s*email\s*\}\}/gi, ctx.recipientEmail || "");
}

export function renderEmail(t: Template, raw: Record<string, string>, ctx: RenderContext = {}) {
  const v: Record<string, string> = {};
  for (const f of t.fields) v[f.key] = fillVars(String(raw[f.key] ?? ""), ctx).trim();

  const url = safeUrl(v.buttonUrl || "");
  const showButton = !!(url && v.buttonText);

  const details = t.fields.filter((f) => f.detail && v[f.key]);
  const highlight = t.fields.find((f) => f.role === "highlight" && v[f.key]);
  const code = t.fields.find((f) => f.role === "code" && v[f.key]);

  const font = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  // ----- header -----
  let header = "";
  let bodyTitle = `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827">${esc(v.title)}</h1>`;
  if (t.variant === "banner") {
    header = `<tr><td style="background:${t.accent};padding:18px 28px;color:#ffffff">
      <span style="font-size:22px;vertical-align:middle">${t.icon}</span>
      <span style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;vertical-align:middle;margin-left:8px">${esc(t.label)}</span>
    </td></tr>`;
  } else if (t.variant === "hero") {
    header = `<tr><td style="background:${t.accent};padding:36px 28px;text-align:center;color:#ffffff">
      <div style="font-size:40px;line-height:1">${t.icon}</div>
      <div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:10px;opacity:.85">${esc(t.label)}</div>
      <h1 style="margin:12px 0 0;font-size:26px;line-height:1.3;color:#ffffff">${esc(v.title)}</h1>
    </td></tr>`;
    bodyTitle = "";
  }

  // ----- body blocks -----
  const parts: string[] = [];
  if (highlight) {
    parts.push(`<div style="text-align:center;margin:0 0 20px;font-size:34px;font-weight:800;color:${t.accent};letter-spacing:.02em">${esc(v[highlight.key])}</div>`);
  }
  parts.push(`<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151">${multiline(v.message)}</p>`);

  if (code) {
    parts.push(`<div style="text-align:center;margin:0 0 20px"><span style="display:inline-block;padding:12px 24px;border:2px dashed ${t.accent};border-radius:8px;background:${t.tint};font-size:20px;font-weight:700;letter-spacing:.15em;color:${t.accent}">${esc(v[code.key])}</span></div>`);
  }
  if (details.length) {
    const rows = details
      .map(
        (f) => `<tr>
        <td style="padding:8px 14px 8px 0;font-size:13px;color:#6b7280;vertical-align:top;white-space:nowrap">${esc(f.label)}</td>
        <td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827">${multiline(v[f.key])}</td></tr>`
      )
      .join("");
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:${t.tint};border-left:4px solid ${t.accent};border-radius:6px"><tr><td style="padding:10px 16px"><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`);
  }
  if (showButton) {
    parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px auto 8px"><tr><td style="background:${t.accent};border-radius:8px"><a href="${esc(url)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${esc(v.buttonText)}</a></td></tr></table>`);
  }

  // ----- footer -----
  const footerLines = [ctx.signature, ctx.senderName ? `Dikirim oleh ${ctx.senderName}` : ""].filter(Boolean) as string[];
  const footer = footerLines.length
    ? `<tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280;text-align:center">${footerLines.map(multiline).join("<br>")}</td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(v.title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
${header}
<tr><td style="padding:28px">${bodyTitle}${parts.join("")}</td></tr>
${footer}
</table></td></tr></table></body></html>`;

  // ----- versi teks -----
  const text = [
    v.title,
    highlight ? v[highlight.key] : "",
    "",
    v.message,
    code ? `\nKode: ${v[code.key]}` : "",
    details.length ? "\n" + details.map((f) => `${f.label}: ${v[f.key]}`).join("\n") : "",
    showButton ? `\n${v.buttonText}: ${url}` : "",
    footerLines.length ? `\n--\n${footerLines.join("\n")}` : "",
  ]
    .filter((x, i) => x !== "" || i === 2)
    .join("\n");

  return { html, text, plainMessage: v.message };
}

/** Pastikan nilai form hanya berisi field milik template dan bertipe string. */
export function sanitizeValues(t: Template, input: unknown): Record<string, string> {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of t.fields) {
    const val = typeof src[f.key] === "string" ? (src[f.key] as string) : "";
    if (val.length > 5000) throw new Error(`${f.label} terlalu panjang (maks 5000 karakter)`);
    if (f.required && !val.trim()) throw new Error(`${f.label} wajib diisi`);
    out[f.key] = val;
  }
  return out;
}
