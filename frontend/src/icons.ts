import {
  mdiAlarm, mdiAlertOctagon, mdiBellRing, mdiCalendarCheck, mdiCalendarWeek, mdiCheckDecagram,
  mdiEmailOutline, mdiNewspaperVariant, mdiPartyPopper, mdiRepeat, mdiSale, mdiWeatherSunny, mdiWrench,
} from "@mdi/js";

/** Ikon & warna per template (id sama dengan di backend). */
export const templateIcons: Record<string, { path: string; color: string }> = {
  info: { path: mdiBellRing, color: "#2563eb" },
  success: { path: mdiCheckDecagram, color: "#16a34a" },
  alert: { path: mdiAlertOctagon, color: "#dc2626" },
  reminder: { path: mdiAlarm, color: "#7c3aed" },
  maintenance: { path: mdiWrench, color: "#ea580c" },
  newsletter: { path: mdiNewspaperVariant, color: "#0ea5e9" },
  event: { path: mdiPartyPopper, color: "#0d9488" },
  promo: { path: mdiSale, color: "#db2777" },
  simple: { path: mdiEmailOutline, color: "#64748b" },
};

export const fallbackTemplateIcon = { path: mdiEmailOutline, color: "#64748b" };

/** Ikon & warna per jenis pengulangan jadwal. */
export const repeatIcons = {
  once: { path: mdiCalendarCheck, color: "#2563eb" },
  interval: { path: mdiRepeat, color: "#f59e0b" },
  daily: { path: mdiWeatherSunny, color: "#f97316" },
  weekly: { path: mdiCalendarWeek, color: "#8b5cf6" },
} as const;
