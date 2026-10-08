<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import {
  mdiAlertCircle, mdiArrowLeft, mdiCalendarClock, mdiCheckCircle, mdiEmailCheck, mdiEye, mdiEyeOff, mdiGmail,
  mdiAccount, mdiHistory, mdiInformation, mdiLoading, mdiPalette, mdiShieldAccount, mdiTestTube,
} from "@mdi/js";
import { apiForgot, apiGoogleLogin, apiLogin, apiRegister, apiReset, type AuthConfig } from "../api";
import { AUTHOR } from "../about";
import { auth, refreshConfig } from "../auth";
import { toast } from "../ui";
import Icon from "./Icon.vue";
import IconTile from "./IconTile.vue";

const props = defineProps<{ resetToken: string }>();
const emit = defineEmits<{ resetDone: [] }>();

type Mode = "login" | "register" | "forgot" | "reset";

const mode = ref<Mode>(props.resetToken ? "reset" : auth.config.needsSetup && !auth.config.demoMode ? "register" : "login");
const busy = ref(false);
const error = ref("");
const showPass = ref(false);
const forgotSent = ref("");
const googleError = ref("");
const googleBox = ref<HTMLElement | null>(null);

const f = reactive({ name: "", email: "", password: "", confirm: "" });

const registerOpen = computed(() => auth.config.allowRegistration);
const strength = computed(() => {
  const p = f.password;
  if (!p) return -1;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
});
const strengthLabel = ["Terlalu pendek", "Lemah", "Cukup", "Kuat", "Sangat kuat"];
const strengthColor = ["#dc2626", "#f97316", "#f59e0b", "#16a34a", "#059669"];

const title = computed(() => ({
  login: "Selamat datang kembali",
  register: auth.config.needsSetup ? "Buat akun admin pertama" : "Buat akun baru",
  forgot: "Lupa password?",
  reset: "Buat password baru",
}[mode.value]));

const subtitle = computed(() => ({
  login: "Masuk untuk mengirim dan menjadwalkan email.",
  register: auth.config.needsSetup
    ? "Akun pertama otomatis menjadi admin yang mengatur akun Gmail pengirim."
    : "Daftar gratis, hanya butuh satu menit.",
  forgot: "Masukkan email akun Anda. Kami kirim tautan untuk mengatur ulang password.",
  reset: "Pilih password baru yang kuat untuk akun Anda.",
}[mode.value]));

function go(m: Mode) {
  mode.value = m;
  error.value = "";
  forgotSent.value = "";
  f.password = "";
  f.confirm = "";
  showPass.value = false;
}

// ---------- aksi ----------
async function submit() {
  error.value = "";
  if ((mode.value === "register" || mode.value === "reset") && f.password !== f.confirm) {
    error.value = "Konfirmasi password tidak sama.";
    return;
  }
  busy.value = true;
  try {
    if (mode.value === "login") {
      auth.user = (await apiLogin(f.email, f.password)).user;
      toast("success", `Selamat datang, ${auth.user.name}!`);
    } else if (mode.value === "register") {
      auth.user = (await apiRegister(f.name, f.email, f.password)).user;
      await refreshConfig();
      toast("success", auth.user.role === "admin" ? "Akun admin dibuat. Langkah berikutnya: hubungkan akun Gmail di Pengaturan." : `Akun dibuat. Selamat datang, ${auth.user.name}!`);
      if (auth.user.role === "admin") location.hash = "settings";
    } else if (mode.value === "forgot") {
      forgotSent.value = (await apiForgot(f.email)).message;
    } else {
      await apiReset(props.resetToken, f.password);
      toast("success", "Password berhasil diubah. Silakan masuk dengan password baru.");
      emit("resetDone");
      go("login");
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Terjadi kesalahan";
  } finally {
    busy.value = false;
  }
}

// ---------- Masuk dengan Google (Google Identity Services) ----------
let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  const w = window as any;
  if (w.google?.accounts?.id) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisLoading = null; reject(new Error("gagal memuat")); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

async function onGoogleCredential(resp: { credential?: string }) {
  if (!resp.credential) return;
  error.value = "";
  busy.value = true;
  try {
    auth.user = (await apiGoogleLogin(resp.credential)).user;
    await refreshConfig();
    toast("success", `Selamat datang, ${auth.user.name}!`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Login Google gagal";
  } finally {
    busy.value = false;
  }
}

async function renderGoogle() {
  googleError.value = "";
  if (!auth.config.googleClientId || (mode.value !== "login" && mode.value !== "register")) return;
  await nextTick();
  if (!googleBox.value) return;
  try {
    await loadGis();
    const g = (window as any).google.accounts.id;
    g.initialize({ client_id: auth.config.googleClientId, callback: onGoogleCredential });
    googleBox.value.innerHTML = "";
    g.renderButton(googleBox.value, {
      type: "standard", theme: "outline", size: "large", shape: "pill", logo_alignment: "left", locale: "id",
      text: mode.value === "register" ? "signup_with" : "signin_with",
      width: Math.min(Math.max(googleBox.value.clientWidth, 220), 400),
    });
  } catch {
    googleError.value = "Tidak dapat memuat tombol Google. Periksa koneksi internet Anda.";
  }
}

onMounted(renderGoogle);
watch(mode, renderGoogle);
// membuka tautan reset saat halaman masuk sudah terbuka
watch(() => props.resetToken, (t) => { if (t) go("reset"); });

// tombol Google selalu tampil di halaman masuk/daftar; kalau belum dikonfigurasi, tampil sebagai tombol penjelasan
const showGoogle = computed(() => mode.value === "login" || mode.value === "register");

function onGoogleUnavailable() {
  toast("info", "Masuk dengan Google belum diaktifkan. Admin dapat mengaktifkannya di Pengaturan setelah masuk.");
}

// ---------- akun demo (hanya tampil saat mode demo) ----------
type DemoAccount = AuthConfig["demoAccounts"][number];

function fillDemo(a: DemoAccount) {
  f.email = a.username;
  f.password = a.password;
  error.value = "";
  showPass.value = true;
}

async function loginDemo(a: DemoAccount) {
  fillDemo(a);
  await submit();
}
</script>

<template>
  <div class="auth-shell">
    <aside class="auth-hero">
      <div class="brand">
        <IconTile :path="mdiGmail" color="#ea4335" :size="46" />
        <strong>Gmail Notify</strong>
      </div>
      <div class="hero-body">
        <h2>Kirim notifikasi email lewat Gmail, tanpa ribet.</h2>
        <p>Template siap pakai, pengiriman massal yang personal, dan jadwal otomatis, semuanya dari satu tempat.</p>
        <ul>
          <li><IconTile :path="mdiPalette" color="#a855f7" :size="40" /><span><b>Template cantik</b>Notifikasi, pengingat, newsletter, dan promo.</span></li>
          <li><IconTile :path="mdiCalendarClock" color="#f59e0b" :size="40" /><span><b>Jadwal otomatis</b>Harian, mingguan, atau sekali kirim.</span></li>
          <li><IconTile :path="mdiHistory" color="#10b981" :size="40" /><span><b>Riwayat lengkap</b>Pantau yang terkirim dan yang gagal.</span></li>
        </ul>
      </div>
    </aside>

    <main class="auth-main">
      <div class="auth-card">
        <div class="auth-brand-mobile brand">
          <IconTile :path="mdiGmail" color="#ea4335" :size="40" />
          <strong>Gmail Notify</strong>
        </div>

        <button v-if="mode === 'forgot' || mode === 'reset'" type="button" class="link-btn back" @click="go('login')">
          <Icon :path="mdiArrowLeft" :size="18" /> Kembali ke halaman masuk
        </button>

        <h1>{{ title }}</h1>
        <p class="muted sub">{{ subtitle }}</p>

        <div v-if="mode === 'login' || mode === 'register'" class="seg auth-seg">
          <button type="button" :class="{ active: mode === 'login' }" @click="go('login')">Masuk</button>
          <button v-if="registerOpen" type="button" :class="{ active: mode === 'register' }" @click="go('register')">Daftar</button>
        </div>

        <!-- Akun demo: hanya dikirim server saat mode demo, di production tidak pernah tampil -->
        <div v-if="mode === 'login' && auth.config.demoMode && auth.config.demoAccounts.length" class="demo-card">
          <div class="row" style="gap: 8px">
            <Icon :path="mdiTestTube" :size="20" />
            <b>Mode demo</b>
            <span class="badge warn">hanya untuk pengembangan</span>
          </div>
          <p class="hint demo-hint">Coba aplikasi dengan akun contoh. Masuk sebagai Admin untuk mengisi Client ID Google di Pengaturan.</p>
          <ul>
            <li v-for="a in auth.config.demoAccounts" :key="a.username">
              <IconTile :path="a.role === 'admin' ? mdiShieldAccount : mdiAccount" :color="a.role === 'admin' ? '#7c3aed' : '#2563eb'" :size="30" />
              <div class="grow">
                <b>{{ a.name }}</b>
                <div class="small muted"><code>{{ a.username }}</code> / <code>{{ a.password }}</code></div>
              </div>
              <button type="button" class="btn sm" @click="fillDemo(a)">Isi</button>
              <button type="button" class="btn sm primary" :disabled="busy" @click="loginDemo(a)">Masuk</button>
            </li>
          </ul>
        </div>

        <!-- Google: login & daftar sekaligus, tanpa isi data manual -->
        <template v-if="showGoogle">
          <div v-if="auth.config.googleClientId" ref="googleBox" class="google-box" />
          <button v-else type="button" class="btn google-fallback" @click="onGoogleUnavailable">
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            {{ mode === "register" ? "Daftar dengan Google" : "Masuk dengan Google" }}
          </button>
          <p v-if="googleError" class="hint err" style="text-align: center">{{ googleError }}</p>
          <p v-else-if="!auth.config.googleClientId" class="hint google-hint" style="text-align: center">
            Belum diaktifkan. Admin mengaturnya di <b>Pengaturan</b> setelah masuk.
          </p>
          <p v-else class="hint google-hint" style="text-align: center">
            {{ mode === "register" ? "Nama dan email terisi otomatis dari akun Google Anda." : "Belum punya akun? Akun dibuat otomatis saat Anda masuk dengan Google." }}
          </p>

          <div class="divider"><span>atau gunakan email</span></div>
        </template>

        <!-- jawaban lupa password -->
        <div v-if="mode === 'forgot' && forgotSent" class="stack" style="gap: 14px">
          <div class="alert success">
            <Icon :path="mdiEmailCheck" :size="22" />
            <div class="alert-body"><span class="alert-title">Cek email Anda</span>{{ forgotSent }}</div>
          </div>
          <p class="hint">Tautan berlaku 30 menit. Belum menerima? Periksa folder spam, atau coba lagi beberapa menit lagi.</p>
          <button type="button" class="btn" @click="go('login')">Kembali ke halaman masuk</button>
        </div>

        <form v-else class="stack" style="gap: 14px" @submit.prevent="submit">
          <div v-if="mode === 'register' && auth.config.needsSetup" class="alert info">
            <Icon :path="mdiInformation" :size="20" />
            <div class="alert-body">Belum ada pengguna. Anda akan menjadi <b>admin</b> pertama.</div>
          </div>

          <div v-if="mode === 'register'" class="field">
            <label class="lbl" for="a-name">Nama lengkap</label>
            <input id="a-name" v-model="f.name" type="text" autocomplete="name" maxlength="80" placeholder="Nama Anda" required />
          </div>

          <div v-if="mode !== 'reset'" class="field">
            <label class="lbl" for="a-email">{{ mode === "login" ? "Email atau username" : "Email" }}</label>
            <input
              id="a-email" v-model="f.email" :type="mode === 'login' ? 'text' : 'email'" autocomplete="username"
              :placeholder="mode === 'login' ? 'nama@gmail.com atau username' : 'nama@gmail.com'" required
            />
          </div>

          <div v-if="mode !== 'forgot'" class="field">
            <div class="lbl" style="justify-content: space-between">
              <label for="a-pass">{{ mode === "reset" ? "Password baru" : "Password" }}</label>
              <button v-if="mode === 'login'" type="button" class="link-btn small" @click="go('forgot')">Lupa password?</button>
            </div>
            <div class="input-wrap">
              <input
                id="a-pass" v-model="f.password" :type="showPass ? 'text' : 'password'"
                :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                :placeholder="mode === 'login' ? 'Password Anda' : 'Minimal 8 karakter'" required
              />
              <button type="button" class="btn icon ghost addon" :aria-label="showPass ? 'Sembunyikan' : 'Tampilkan'" @click="showPass = !showPass">
                <Icon :path="showPass ? mdiEyeOff : mdiEye" :size="20" />
              </button>
            </div>
            <div v-if="mode !== 'login' && strength >= 0" class="strength">
              <div class="bars">
                <i v-for="n in 4" :key="n" :style="{ background: n <= Math.max(strength, 1) ? strengthColor[strength] : undefined }" />
              </div>
              <span :style="{ color: strengthColor[strength] }">{{ strengthLabel[strength] }}</span>
            </div>
          </div>

          <div v-if="mode === 'register' || mode === 'reset'" class="field">
            <label class="lbl" for="a-confirm">Ulangi password</label>
            <input id="a-confirm" v-model="f.confirm" :type="showPass ? 'text' : 'password'" autocomplete="new-password" required />
          </div>

          <div v-if="error" class="alert error" role="alert">
            <Icon :path="mdiAlertCircle" :size="20" />
            <div class="alert-body">{{ error }}</div>
          </div>

          <button type="submit" class="btn primary lg" :disabled="busy">
            <Icon v-if="busy" :path="mdiLoading" :size="20" class="spin" />
            <Icon v-else :path="mdiCheckCircle" :size="20" />
            {{
              busy ? "Memproses..." : { login: "Masuk", register: "Buat akun", forgot: "Kirim tautan reset", reset: "Simpan password baru" }[mode]
            }}
          </button>

          <p v-if="mode === 'login' && registerOpen" class="hint" style="text-align: center">
            Belum punya akun? <button type="button" class="link-btn" @click="go('register')">Daftar sekarang</button>
          </p>
          <p v-else-if="mode === 'register'" class="hint" style="text-align: center">
            Sudah punya akun? <button type="button" class="link-btn" @click="go('login')">Masuk</button>
          </p>
        </form>

        <p class="credit">
          © {{ AUTHOR.period }} · {{ AUTHOR.name }} ({{ AUTHOR.alias }}) ·
          <a :href="AUTHOR.url" target="_blank" rel="noopener">{{ AUTHOR.site }}</a>
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-shell {
  display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr);
  height: 100vh; height: 100dvh;
}
.auth-hero {
  position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;
  padding: 40px 48px; color: #fff;
  background: radial-gradient(circle at 15% 10%, #6366f1 0%, transparent 45%), radial-gradient(circle at 90% 90%, #0ea5e9 0%, transparent 50%), #312e81;
}
.auth-hero::after {
  content: ""; position: absolute; width: 420px; height: 420px; right: -140px; top: 18%; border-radius: 50%;
  background: rgb(255 255 255 / 0.07);
}
.auth-hero .brand strong { font-size: 1.25rem; }
.hero-body { position: relative; z-index: 1; max-width: 460px; }
.hero-body h2 { font-size: 2rem; line-height: 1.2; letter-spacing: -0.02em; margin-bottom: 14px; }
.hero-body > p { opacity: 0.85; margin-bottom: 28px; }
.hero-body ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
.hero-body li { display: flex; gap: 14px; align-items: center; }
.hero-body li span { font-size: 0.9rem; opacity: 0.9; }
.hero-body li b { display: block; font-size: 1rem; opacity: 1; }

.auth-hero { height: 100%; }
/* kolom form: terpusat bila muat; bila lebih tinggi dari layar, hanya kolom ini yang scroll (margin:auto mencegah bagian atas terpotong) */
.auth-main { display: flex; overflow-y: auto; padding: 24px 20px; }
.auth-card { width: min(420px, 100%); margin: auto; display: flex; flex-direction: column; gap: 16px; }
.auth-card h1 { font-size: 1.7rem; }
.auth-card .sub { margin-top: -10px; }
.auth-seg { align-self: stretch; }
.auth-seg button { flex: 1; justify-content: center; }
.back { align-self: flex-start; }
.auth-brand-mobile { display: none; }
.google-box { display: flex; justify-content: center; min-height: 44px; }
.divider { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 0.8rem; }
.divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }

.strength { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; font-weight: 600; }
.strength .bars { display: flex; gap: 4px; flex: 1; }
.strength .bars i { height: 5px; flex: 1; border-radius: 3px; background: var(--border); }

@media (max-width: 860px) {
  .auth-shell { grid-template-columns: minmax(0, 1fr); }
  .auth-hero { display: none; }
  .auth-brand-mobile { display: flex; margin-bottom: 4px; }
}
.google-fallback { width: 100%; justify-content: center; border-radius: 999px; padding: 11px 16px; }
.demo-card {
  display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px dashed color-mix(in srgb, var(--warn) 55%, var(--border));
  border-radius: 12px; background: var(--warn-soft);
}
.demo-card ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.demo-card li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 10px; background: var(--surface); }
.demo-card code { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 0 5px; user-select: all; }

/* ---- Menyesuaikan tinggi layar: padatkan isi agar tidak perlu scroll di laptop 768p/720p ---- */
@media (max-height: 940px) {
  .auth-main { padding: 16px 20px; }
  .auth-card { gap: 10px; }
  .auth-card h1 { font-size: 1.45rem; }
  .auth-card .sub { display: none; }
  .auth-card form { gap: 10px !important; }
  .auth-card input { padding: 8px 12px; }
  .auth-card .btn.lg { padding: 10px 18px; }
  .auth-card .seg button { padding: 6px 14px; }
  .demo-card { padding: 8px 10px; gap: 6px; }
  .demo-card .demo-hint { display: none; }
  .demo-card ul { gap: 6px; }
  .google-hint { display: none; }
  .google-box { min-height: 40px; }
  .google-fallback { padding: 8px 16px; }
  .auth-card .credit { margin-top: 0; }
}
@media (max-height: 760px) {
  .auth-card { gap: 8px; }
  .auth-card h1 { font-size: 1.3rem; }
  .auth-card form { gap: 8px !important; }
  .auth-card .field { gap: 3px; }
  .demo-card .badge { display: none; }
  .demo-card li { padding: 4px 8px; }
  .divider { display: none; }
}
@media (max-width: 860px) {
  .auth-main { padding: 14px; }
  .auth-brand-mobile { margin-bottom: 0; }
}
</style>
