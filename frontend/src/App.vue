<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  mdiAccountCheck, mdiCalendarClock, mdiCog, mdiEmailFast, mdiGmail, mdiHistory, mdiLoading, mdiLogout,
  mdiWeatherNight, mdiWhiteBalanceSunny,
} from "@mdi/js";
import { apiUpdateProfile, getSettings, type Settings } from "./api";
import { AUTHOR } from "./about";
import { auth, initAuth, logout } from "./auth";
import { applyTheme, initialTheme, type Theme } from "./ui";
import Icon from "./components/Icon.vue";
import IconTile from "./components/IconTile.vue";
import ToastHost from "./components/ToastHost.vue";
import AuthView from "./components/AuthView.vue";
import SendTab from "./components/SendTab.vue";
import ScheduleTab from "./components/ScheduleTab.vue";
import HistoryTab from "./components/HistoryTab.vue";
import SettingsTab from "./components/SettingsTab.vue";

type TabId = "send" | "schedule" | "history" | "settings";

const tabs = [
  { id: "send", label: "Kirim", icon: mdiEmailFast, color: "#2563eb", title: "Kirim Email", sub: "Pilih template, isi pesan, lalu kirim sekarang atau jadwalkan." },
  { id: "schedule", label: "Jadwal", icon: mdiCalendarClock, color: "#f59e0b", title: "Jadwal Otomatis", sub: "Kelola email yang dikirim otomatis pada waktu tertentu." },
  { id: "history", label: "Riwayat", icon: mdiHistory, color: "#8b5cf6", title: "Riwayat Pengiriman", sub: "Semua email yang pernah dikirim, berhasil maupun gagal." },
  { id: "settings", label: "Pengaturan", icon: mdiCog, color: "#0d9488", title: "Pengaturan", sub: "Profil, akun Gmail pengirim, dan tampilan email." },
] as const;

// ---------- routing sederhana lewat hash ----------
const hash = ref(location.hash);
const fromHash = (): TabId => {
  const h = hash.value.slice(1);
  return tabs.some((t) => t.id === h) ? (h as TabId) : "send";
};
const tab = ref<TabId>(fromHash());
const onHash = () => {
  hash.value = location.hash;
  tab.value = fromHash();
};
// tab tercermin di URL (#settings dst.) agar bisa di-bookmark dan tombol Back berfungsi
watch(tab, (t) => { if (location.hash.slice(1) !== t) location.hash = t; });

/** Token dari tautan reset password: #reset=TOKEN */
const resetToken = computed(() => /^#reset=([\w-]+)$/.exec(hash.value)?.[1] ?? "");

// ---------- data ----------
const historyKey = ref(0);
const settings = ref<Settings | null>(null);
const theme = ref<Theme>(initialTheme());

const current = computed(() => tabs.find((t) => t.id === tab.value)!);
const ready = computed(() => !!settings.value && !!settings.value.smtpUser && settings.value.hasPassword);
const initial = computed(() => (auth.user?.name || "?").trim().charAt(0).toUpperCase());

async function loadSettings() {
  try {
    settings.value = await getSettings();
  } catch {
    settings.value = null;
  }
}

onMounted(async () => {
  window.addEventListener("hashchange", onHash);
  await initAuth();
});
onBeforeUnmount(() => window.removeEventListener("hashchange", onHash));

// muat pengaturan setelah login, kosongkan setelah keluar
watch(() => auth.user?.id, (id) => {
  if (id) loadSettings();
  else settings.value = null;
}, { immediate: true });

async function dismissProfileHint() {
  try {
    auth.user = (await apiUpdateProfile()).user;
  } catch { /* abaikan: banner muncul lagi di kunjungan berikutnya */ }
}

function onResetDone() {
  auth.user = null;
  location.hash = "";
}

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  applyTheme(theme.value);
}
</script>

<template>
  <div v-if="!auth.ready" class="boot">
    <IconTile :path="mdiGmail" color="#ea4335" :size="56" />
    <Icon :path="mdiLoading" :size="26" class="spin muted" />
  </div>

  <template v-else-if="!auth.user || resetToken">
    <AuthView :reset-token="resetToken" @reset-done="onResetDone" />
    <ToastHost />
  </template>

  <div v-else class="shell">
    <aside class="sidebar">
      <div class="brand">
        <IconTile :path="mdiGmail" color="#ea4335" :size="42" />
        <div>
          <strong>Gmail Notify</strong>
          <span class="sub">Kirim notifikasi email</span>
        </div>
      </div>

      <nav class="nav" aria-label="Menu utama">
        <button v-for="t in tabs" :key="t.id" :class="{ active: tab === t.id }" @click="tab = t.id">
          <IconTile :path="t.icon" :color="t.color" :size="32" />
          <span>{{ t.label }}</span>
        </button>
      </nav>

      <div class="sidebar-foot">
        <button class="account-chip" style="cursor: pointer; text-align: left" title="Status akun Gmail pengirim" @click="tab = 'settings'">
          <span :class="['dot', ready ? 'ok' : 'bad']" />
          <span class="txt">
            <b>{{ ready ? settings?.smtpUser : "Gmail belum diatur" }}</b>
            <span class="muted">{{ ready ? "Siap mengirim" : auth.user?.role === "admin" ? "Klik untuk mengatur" : "Hubungi admin" }}</span>
          </span>
        </button>

        <span v-if="auth.config.demoMode" class="badge warn" style="align-self: flex-start">Mode demo · bukan untuk production</span>

        <div class="user-card">
          <span class="avatar">
            <img v-if="auth.user?.picture" :src="auth.user.picture" alt="" referrerpolicy="no-referrer" />
            <template v-else>{{ initial }}</template>
          </span>
          <span class="txt">
            <b>{{ auth.user?.name }}</b>
            <span class="muted">{{ auth.user?.role === "admin" ? "Admin" : "Pengguna" }}</span>
          </span>
          <button class="btn icon ghost" title="Keluar" aria-label="Keluar" @click="logout"><Icon :path="mdiLogout" :size="20" /></button>
        </div>

        <button class="btn ghost" @click="toggleTheme">
          <Icon :path="theme === 'dark' ? mdiWhiteBalanceSunny : mdiWeatherNight" :size="18" />
          {{ theme === "dark" ? "Mode terang" : "Mode gelap" }}
        </button>

        <p class="credit">
          © {{ AUTHOR.period }}<br />
          {{ AUTHOR.name }} ({{ AUTHOR.alias }})<br />
          <a :href="AUTHOR.url" target="_blank" rel="noopener">{{ AUTHOR.site }}</a>
        </p>
      </div>
    </aside>

    <main class="content">
      <div class="mobile-top">
        <div class="brand">
          <IconTile :path="mdiGmail" color="#ea4335" :size="36" />
          <strong>Gmail Notify</strong>
        </div>
        <div class="row" style="gap: 2px; flex-wrap: nowrap">
          <button class="btn icon ghost" aria-label="Ganti tema" @click="toggleTheme">
            <Icon :path="theme === 'dark' ? mdiWhiteBalanceSunny : mdiWeatherNight" :size="22" />
          </button>
          <button class="btn icon ghost" aria-label="Keluar" @click="logout"><Icon :path="mdiLogout" :size="22" /></button>
        </div>
      </div>

      <div v-if="auth.user && !auth.user.profileCompleted" class="alert info" style="margin-bottom: 18px">
        <Icon :path="mdiAccountCheck" :size="22" />
        <div class="alert-body">
          <span class="alert-title">Selamat datang, {{ auth.user.name }}!</span>
          Akun Anda dibuat otomatis dari akun Google. Tinjau nama Anda dan, jika mau, buat password agar bisa masuk dengan email juga. Semuanya bisa diubah kapan saja.
        </div>
        <div class="row" style="flex-wrap: nowrap">
          <button class="btn sm primary" @click="tab = 'settings'; dismissProfileHint()">Lengkapi profil</button>
          <button class="btn sm ghost" @click="dismissProfileHint">Nanti saja</button>
        </div>
      </div>

      <header class="page-head">
        <IconTile :path="current.icon" :color="current.color" :size="48" />
        <div>
          <h1>{{ current.title }}</h1>
          <p>{{ current.sub }}</p>
        </div>
      </header>

      <SendTab
        v-if="tab === 'send'"
        :ready="ready"
        :account="settings?.smtpUser ?? ''"
        :is-admin="auth.user?.role === 'admin'"
        @sent="historyKey++"
        @scheduled="tab = 'schedule'"
        @goto="tab = $event"
      />
      <ScheduleTab v-else-if="tab === 'schedule'" @ran="historyKey++" @goto="tab = $event" />
      <HistoryTab v-else-if="tab === 'history'" :refresh-key="historyKey" @goto="tab = $event" />
      <SettingsTab v-else @saved="loadSettings" />
    </main>

    <ToastHost />
  </div>
</template>
