import { reactive } from "vue";
import {
  apiLogout, fetchAuthConfig, fetchMe, setUnauthorizedHandler, type AuthConfig, type AuthUser,
} from "./api";
import { toast } from "./ui";

/** Status login yang dipakai seluruh aplikasi. */
export const auth = reactive({
  ready: false,
  user: null as AuthUser | null,
  config: { googleClientId: "", allowRegistration: true, needsSetup: false, demoMode: false, demoAccounts: [] } as AuthConfig,
});

export async function initAuth() {
  try {
    const [config, me] = await Promise.all([fetchAuthConfig(), fetchMe().catch(() => null)]);
    auth.config = config;
    auth.user = me?.user ?? null;
  } catch {
    auth.user = null;
  } finally {
    auth.ready = true;
  }
}

/** Muat ulang konfigurasi publik (mis. setelah akun pertama dibuat). */
export async function refreshConfig() {
  try {
    auth.config = await fetchAuthConfig();
  } catch { /* abaikan */ }
}

export async function logout() {
  try { await apiLogout(); } catch { /* sesi sudah habis */ }
  auth.user = null;
  location.hash = "";
}

// sesi habis saat aplikasi dipakai -> kembali ke halaman masuk
setUnauthorizedHandler(() => {
  if (auth.user) {
    auth.user = null;
    toast("info", "Sesi Anda berakhir. Silakan masuk lagi.");
  }
});
