import { reactive } from "vue";

// ---------- Toast ----------
export interface Toast {
  id: number;
  type: "success" | "error" | "info";
  text: string;
}

export const toasts = reactive<Toast[]>([]);
let nextId = 1;

export function toast(type: Toast["type"], text: string, ms = type === "error" ? 8000 : 4500) {
  const id = nextId++;
  toasts.push({ id, type, text });
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

// ---------- Dialog konfirmasi (pengganti window.confirm) ----------
export interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  okText: string;
  danger: boolean;
  resolve?: (v: boolean) => void;
}

export const confirmState = reactive<ConfirmState>({
  open: false, title: "", message: "", okText: "Ya", danger: false,
});

export function askConfirm(opts: { title: string; message: string; okText?: string; danger?: boolean }) {
  return new Promise<boolean>((resolve) => {
    Object.assign(confirmState, { open: true, okText: "Ya", danger: false, ...opts, resolve });
  });
}

export function answerConfirm(v: boolean) {
  confirmState.open = false;
  confirmState.resolve?.(v);
}

// ---------- Tema ----------
export type Theme = "light" | "dark";

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage tidak tersedia */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch { /* abaikan */ }
}
