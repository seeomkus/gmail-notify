<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  mdiAccountCircle, mdiAccountEdit, mdiAccountSwitch, mdiCheckCircle, mdiChevronDown, mdiChevronUp,
  mdiContentSave, mdiEye, mdiEyeOff, mdiGmail, mdiGoogle, mdiInformation, mdiLanConnect, mdiLinkOff, mdiLoading,
  mdiLockReset, mdiOpenInNew, mdiPalette, mdiServerNetwork, mdiShieldAccount,
} from "@mdi/js";
import {
  apiChangePassword, apiUpdateProfile, changeAccount, disconnectAccount, getSettings, saveSettings, testSettings,
  type SettingsInput,
} from "../api";
import { auth } from "../auth";
import { askConfirm, toast } from "../ui";
import Icon from "./Icon.vue";
import IconTile from "./IconTile.vue";
import GoogleGuide from "./GoogleGuide.vue";

const emit = defineEmits<{ saved: [] }>();

const form = reactive<SettingsInput>({
  smtpHost: "", smtpPort: 465, smtpSecure: true, smtpUser: "", smtpPass: "",
  fromName: "", fromEmail: "", replyTo: "", defaultCc: "", defaultBcc: "", signature: "", sendHtml: true,
  googleClientId: "", allowRegistration: true, appUrl: "",
});

// ---------- profil & keamanan (semua pengguna) ----------
const isAdmin = computed(() => auth.user?.role === "admin");
const profileName = ref(auth.user?.name ?? "");
const pw = reactive({ current: "", next: "", confirm: "" });
const showPw = ref(false);
const profileBusy = ref<"" | "name" | "password">("");

async function saveProfile() {
  profileBusy.value = "name";
  try {
    auth.user = (await apiUpdateProfile(profileName.value)).user;
    toast("success", "Nama diperbarui.");
  } catch (e) {
    toast("error", e instanceof Error ? e.message : "Gagal menyimpan nama");
  } finally {
    profileBusy.value = "";
  }
}

async function savePassword() {
  if (pw.next !== pw.confirm) return toast("error", "Konfirmasi password baru tidak sama.");
  profileBusy.value = "password";
  try {
    auth.user = (await apiChangePassword(pw.current, pw.next)).user;
    pw.current = pw.next = pw.confirm = "";
    toast("success", "Password diubah. Perangkat lain perlu masuk ulang.");
  } catch (e) {
    toast("error", e instanceof Error ? e.message : "Gagal mengubah password");
  } finally {
    profileBusy.value = "";
  }
}

const hasPassword = ref(false);
const showAdvanced = ref(false);
const busy = ref<"" | "save" | "test" | "account" | "disconnect">("");
const connOk = ref(false);
const loaded = ref(false);
const snapshot = ref("");

// ---------- akun Gmail ----------
const editingAccount = ref(false);
const showPass = ref(false);
const acct = reactive({ user: "", pass: "" });
const hasAccount = computed(() => !!form.smtpUser && hasPassword.value);
// belum ada akun -> langsung tampilkan form; sudah ada -> tampilkan ringkasan
const showAccountForm = computed(() => loaded.value && (!hasAccount.value || editingAccount.value));

const serialize = () => JSON.stringify(form);
const dirty = computed(() => loaded.value && serialize() !== snapshot.value);

async function load() {
  const { hasPassword: hp, ...s } = await getSettings();
  Object.assign(form, s, { smtpPass: "" });
  hasPassword.value = hp;
  snapshot.value = serialize();
  loaded.value = true;
}

onMounted(() => {
  if (!isAdmin.value) return;
  load().catch((e) => toast("error", e instanceof Error ? e.message : "Gagal memuat pengaturan"));
});

/** Perbarui kolom tertentu di snapshot agar perubahan lain yang belum disimpan tidak ikut dianggap tersimpan. */
function patchSnapshot(patch: Partial<SettingsInput>) {
  snapshot.value = JSON.stringify({ ...JSON.parse(snapshot.value), ...patch });
}

function startChange() {
  acct.user = "";
  acct.pass = "";
  showPass.value = false;
  editingAccount.value = true;
}

function cancelChange() {
  editingAccount.value = false;
  acct.pass = "";
}

async function saveAccount() {
  busy.value = "account";
  try {
    const s = await changeAccount(acct.user, acct.pass);
    form.smtpUser = s.smtpUser;
    form.fromEmail = s.fromEmail;
    hasPassword.value = s.hasPassword;
    patchSnapshot({ smtpUser: s.smtpUser, fromEmail: s.fromEmail });
    acct.user = "";
    acct.pass = "";
    editingAccount.value = false;
    connOk.value = true;
    toast("success", `Akun diganti ke ${s.smtpUser}. Login berhasil, email berikutnya dikirim dari akun ini.`);
    emit("saved");
  } catch (e) {
    toast("error", e instanceof Error ? e.message : "Gagal mengganti akun");
  } finally {
    busy.value = "";
  }
}

async function disconnect() {
  const ok = await askConfirm({
    title: "Putuskan akun Gmail?",
    message: `Email ${form.smtpUser} dan App Password-nya akan dihapus dari aplikasi. Anda tidak bisa mengirim email (termasuk jadwal otomatis) sampai menghubungkan akun lagi.`,
    okText: "Putuskan", danger: true,
  });
  if (!ok) return;
  busy.value = "disconnect";
  try {
    const s = await disconnectAccount();
    form.smtpUser = s.smtpUser;
    form.fromEmail = s.fromEmail;
    hasPassword.value = s.hasPassword;
    patchSnapshot({ smtpUser: s.smtpUser, fromEmail: s.fromEmail });
    connOk.value = false;
    editingAccount.value = false;
    toast("success", "Akun diputuskan.");
    emit("saved");
  } catch (e) {
    toast("error", e instanceof Error ? e.message : "Gagal memutuskan akun");
  } finally {
    busy.value = "";
  }
}

// ---------- pengaturan lain ----------
function applyGmailPreset() {
  form.smtpHost = "smtp.gmail.com";
  form.smtpPort = 465;
  form.smtpSecure = true;
  toast("info", "Pengaturan Gmail diterapkan (smtp.gmail.com, port 465, SSL).");
}

// port 465 biasanya SSL langsung, 587 memakai STARTTLS
function onPortChange() {
  if (Number(form.smtpPort) === 465) form.smtpSecure = true;
  if (Number(form.smtpPort) === 587) form.smtpSecure = false;
}

async function run(kind: "save" | "test") {
  busy.value = kind;
  try {
    if (kind === "save") {
      const s = await saveSettings({ ...form });
      hasPassword.value = s.hasPassword;
      snapshot.value = serialize();
      toast("success", "Pengaturan tersimpan.");
      emit("saved");
    } else {
      await testSettings({ ...form });
      connOk.value = true;
      toast("success", "Berhasil! Akun Gmail terhubung dan siap mengirim email.");
    }
  } catch (e) {
    if (kind === "test") connOk.value = false;
    toast("error", e instanceof Error ? e.message : "Terjadi kesalahan");
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <div class="stack" style="max-width: 820px">
    <!-- Profil saya -->
    <section class="card">
      <div class="card-head">
        <IconTile :path="mdiAccountEdit" color="#2563eb" :size="42" />
        <div>
          <h2>Profil saya</h2>
          <p>Nama yang tampil di aplikasi.</p>
        </div>
        <span class="badge primary end">{{ isAdmin ? "Admin" : "Pengguna" }}</span>
      </div>
      <div v-if="auth.user?.picture" class="row" style="margin-bottom: 14px">
        <span class="avatar" style="width: 56px; height: 56px"><img :src="auth.user.picture" alt="" referrerpolicy="no-referrer" /></span>
        <span class="hint">Foto diambil dari akun Google Anda.</span>
      </div>
      <form class="stack" style="gap: 14px" @submit.prevent="saveProfile">
        <div class="grid-2">
          <div class="field">
            <label class="lbl" for="p-name">Nama</label>
            <input id="p-name" v-model="profileName" type="text" maxlength="80" required />
          </div>
          <div class="field">
            <label class="lbl" for="p-email">Email</label>
            <input id="p-email" :value="auth.user?.email" type="email" disabled />
          </div>
        </div>
        <div class="row">
          <span v-if="auth.user?.google" class="badge"><Icon :path="mdiGoogle" :size="14" /> Tertaut dengan Google</span>
          <button
            type="submit" class="btn primary end"
            :disabled="!!profileBusy || !profileName.trim() || profileName.trim() === auth.user?.name"
          >
            <Icon v-if="profileBusy === 'name'" :path="mdiLoading" :size="18" class="spin" /> Simpan nama
          </button>
        </div>
      </form>
    </section>

    <!-- Keamanan -->
    <section class="card">
      <div class="card-head">
        <IconTile :path="mdiLockReset" color="#16a34a" :size="42" />
        <div>
          <h2>{{ auth.user?.hasPassword ? "Ubah password" : "Buat password" }}</h2>
          <p>
            {{ auth.user?.hasPassword
              ? "Setelah diubah, perangkat lain akan keluar otomatis."
              : "Akun Anda masuk lewat Google. Buat password jika ingin bisa masuk dengan email juga." }}
          </p>
        </div>
      </div>
      <form class="stack" style="gap: 14px" @submit.prevent="savePassword">
        <div v-if="auth.user?.hasPassword" class="field">
          <label class="lbl" for="pw-cur">Password saat ini</label>
          <input id="pw-cur" v-model="pw.current" :type="showPw ? 'text' : 'password'" autocomplete="current-password" required />
        </div>
        <div class="grid-2">
          <div class="field">
            <label class="lbl" for="pw-new">Password baru</label>
            <div class="input-wrap">
              <input id="pw-new" v-model="pw.next" :type="showPw ? 'text' : 'password'" autocomplete="new-password" minlength="8" placeholder="Minimal 8 karakter" required />
              <button type="button" class="btn icon ghost addon" :aria-label="showPw ? 'Sembunyikan' : 'Tampilkan'" @click="showPw = !showPw">
                <Icon :path="showPw ? mdiEyeOff : mdiEye" :size="20" />
              </button>
            </div>
          </div>
          <div class="field">
            <label class="lbl" for="pw-conf">Ulangi password baru</label>
            <input id="pw-conf" v-model="pw.confirm" :type="showPw ? 'text' : 'password'" autocomplete="new-password" required />
          </div>
        </div>
        <div class="row">
          <button type="submit" class="btn primary end" :disabled="!!profileBusy">
            <Icon v-if="profileBusy === 'password'" :path="mdiLoading" :size="18" class="spin" />
            <Icon v-else :path="mdiShieldAccount" :size="18" />
            {{ auth.user?.hasPassword ? "Ubah password" : "Buat password" }}
          </button>
        </div>
      </form>
    </section>

    <div v-if="!isAdmin" class="alert info">
      <Icon :path="mdiInformation" :size="22" />
      <div class="alert-body">
        <span class="alert-title">Pengaturan pengiriman dikelola admin</span>
        Akun Gmail pengirim, tampilan email, dan akses pengguna hanya dapat diubah oleh admin.
      </div>
    </div>

    <!-- Akun Gmail -->
    <section v-if="isAdmin" class="card">
      <div class="card-head">
        <IconTile :path="mdiGmail" color="#ea4335" :size="42" />
        <div>
          <h2>Akun Gmail pengirim</h2>
          <p>Email akan dikirim dari akun ini. Bisa diganti kapan saja dari sini.</p>
        </div>
        <span v-if="connOk && hasAccount" class="badge success end"><Icon :path="mdiCheckCircle" :size="14" /> Terhubung</span>
      </div>

      <!-- ringkasan akun yang aktif -->
      <div v-if="loaded && !showAccountForm" class="stack" style="gap: 14px">
        <div class="account-row">
          <IconTile :path="mdiAccountCircle" color="#2563eb" :size="44" />
          <div class="grow">
            <b class="account-email">{{ form.smtpUser }}</b>
            <div class="hint">App Password tersimpan (••••••••••••••••)</div>
          </div>
        </div>
        <div class="row">
          <button type="button" class="btn primary" :disabled="!!busy" @click="startChange">
            <Icon :path="mdiAccountSwitch" :size="18" /> Ganti akun
          </button>
          <button type="button" class="btn" :disabled="!!busy" @click="run('test')">
            <Icon :path="busy === 'test' ? mdiLoading : mdiLanConnect" :size="18" :class="{ spin: busy === 'test' }" />
            {{ busy === "test" ? "Menguji..." : "Tes koneksi" }}
          </button>
          <button type="button" class="btn danger end" :disabled="!!busy" @click="disconnect">
            <Icon :path="mdiLinkOff" :size="18" /> Putuskan
          </button>
        </div>
      </div>

      <!-- form akun baru -->
      <form v-else-if="showAccountForm" class="stack" style="gap: 14px" @submit.prevent="saveAccount">
        <ol class="guide">
          <li>Aktifkan <b>Verifikasi 2 Langkah</b> di akun Google yang ingin dipakai.</li>
          <li>
            Buka halaman
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">Sandi Aplikasi <Icon :path="mdiOpenInNew" :size="13" /></a>
            (login dengan akun tersebut), lalu buat sandi baru.
          </li>
          <li>Salin 16 karakter yang muncul, lalu tempel di bawah.</li>
        </ol>

        <div class="field">
          <label class="lbl" for="user">Alamat Gmail baru <span class="req">*</span></label>
          <input id="user" v-model="acct.user" type="email" autocomplete="off" placeholder="nama@gmail.com" required />
        </div>
        <div class="field">
          <label class="lbl" for="pass">Sandi Aplikasi (App Password) <span class="req">*</span></label>
          <div class="input-wrap">
            <input
              id="pass" v-model="acct.pass" :type="showPass ? 'text' : 'password'" autocomplete="new-password"
              placeholder="xxxx xxxx xxxx xxxx" required
            />
            <button type="button" class="btn icon ghost addon" :aria-label="showPass ? 'Sembunyikan' : 'Tampilkan'" @click="showPass = !showPass">
              <Icon :path="showPass ? mdiEyeOff : mdiEye" :size="20" />
            </button>
          </div>
          <span class="hint">Bukan password login Gmail. Spasi dihapus otomatis.</span>
        </div>

        <div class="alert info">
          <Icon :path="mdiLanConnect" :size="20" />
          <div class="alert-body">
            Akun baru diuji dulu. Jika gagal, akun lama
            <template v-if="hasAccount">(<b>{{ form.smtpUser }}</b>)</template><template v-else>Anda</template>
            tidak berubah.
          </div>
        </div>

        <div class="row">
          <button v-if="hasAccount" type="button" class="btn" :disabled="!!busy" @click="cancelChange">Batal</button>
          <button type="submit" class="btn primary end" :disabled="!!busy">
            <Icon :path="busy === 'account' ? mdiLoading : mdiCheckCircle" :size="18" :class="{ spin: busy === 'account' }" />
            {{ busy === "account" ? "Menguji akun..." : "Tes & simpan akun" }}
          </button>
        </div>
      </form>
    </section>

    <form v-if="isAdmin" class="stack" @submit.prevent="run('save')">
      <!-- Tampilan email -->
      <section class="card">
        <div class="card-head">
          <IconTile :path="mdiPalette" color="#8b5cf6" :size="42" />
          <div>
            <h2>Tampilan email</h2>
            <p>Nama pengirim dan footer yang muncul di setiap email.</p>
          </div>
        </div>
        <div class="stack" style="gap: 14px">
          <div class="grid-2">
            <div class="field">
              <label class="lbl" for="fname">Nama pengirim</label>
              <input id="fname" v-model="form.fromName" type="text" placeholder="mis. Tim Support" />
              <span class="hint">Yang terlihat penerima sebagai pengirim.</span>
            </div>
            <div class="field">
              <label class="lbl" for="reply">Balas ke (Reply-To)</label>
              <input id="reply" v-model="form.replyTo" type="email" placeholder="opsional" />
              <span class="hint">Jika penerima menekan "Balas".</span>
            </div>
          </div>
          <div class="field">
            <label class="lbl" for="sig">Footer / tanda tangan</label>
            <textarea id="sig" v-model="form.signature" rows="3" placeholder="Teks di bagian bawah setiap email" />
          </div>
          <div class="grid-2">
            <div class="field">
              <label class="lbl" for="dcc">CC otomatis</label>
              <input id="dcc" v-model="form.defaultCc" type="text" placeholder="opsional" />
            </div>
            <div class="field">
              <label class="lbl" for="dbcc">BCC otomatis</label>
              <input id="dbcc" v-model="form.defaultBcc" type="text" placeholder="opsional" />
            </div>
          </div>
          <label class="switch">
            <input v-model="form.sendHtml" type="checkbox" /><span class="track" />
            <span>Gunakan tampilan HTML yang cantik <span class="muted small">(matikan untuk teks biasa)</span></span>
          </label>
        </div>
      </section>

      <!-- Akses & login -->
      <section class="card">
        <div class="card-head">
          <IconTile :path="mdiGoogle" color="#4285f4" :size="42" />
          <div>
            <h2>Akses &amp; masuk dengan Google</h2>
            <p>Atur siapa yang boleh mendaftar dan aktifkan tombol "Masuk dengan Google".</p>
          </div>
        </div>
        <div class="stack" style="gap: 14px">
          <label class="switch">
            <input v-model="form.allowRegistration" type="checkbox" /><span class="track" />
            <span>Izinkan pendaftaran mandiri <span class="muted small">(matikan agar hanya akun yang sudah ada yang bisa masuk)</span></span>
          </label>

          <div class="field">
            <label class="lbl" for="gid">Google Client ID</label>
            <input id="gid" v-model="form.googleClientId" type="text" autocomplete="off" placeholder="xxxx.apps.googleusercontent.com (kosongkan untuk menonaktifkan)" />
            <span class="hint">Tempel Client ID dari Google di sini, lalu klik Simpan pengaturan di bawah. Belum punya? Ikuti panduan berikut.</span>
          </div>
          <GoogleGuide />

          <div class="field">
            <label class="lbl" for="appurl">Alamat aplikasi (untuk tautan di email)</label>
            <input id="appurl" v-model="form.appUrl" type="text" placeholder="https://notify.contoh.com" />
            <span class="hint">Dipakai pada tautan reset password. Kosongkan untuk memakai alamat bawaan server.</span>
          </div>
        </div>
      </section>

      <!-- Lanjutan -->
      <section class="card">
        <button type="button" class="card-head" style="width: 100%; background: none; border: 0; padding: 0; margin: 0; text-align: left" @click="showAdvanced = !showAdvanced">
          <IconTile :path="mdiServerNetwork" color="#0d9488" :size="42" />
          <div>
            <h2>Pengaturan lanjutan</h2>
            <p>Server SMTP. Untuk Gmail biasa, tidak perlu diubah.</p>
          </div>
          <span class="end muted"><Icon :path="showAdvanced ? mdiChevronUp : mdiChevronDown" :size="24" /></span>
        </button>
        <div v-if="showAdvanced" class="stack" style="gap: 14px; margin-top: 16px">
          <div class="row">
            <button type="button" class="link-btn" @click="applyGmailPreset">
              <Icon :path="mdiGmail" :size="16" /> Kembalikan ke pengaturan Gmail
            </button>
          </div>
          <div class="grid-2">
            <div class="field">
              <label class="lbl" for="host">Server SMTP</label>
              <input id="host" v-model="form.smtpHost" type="text" required />
            </div>
            <div class="field">
              <label class="lbl" for="port">Port</label>
              <input id="port" v-model.number="form.smtpPort" type="number" min="1" max="65535" required @change="onPortChange" />
            </div>
          </div>
          <label class="switch">
            <input v-model="form.smtpSecure" type="checkbox" /><span class="track" />
            <span>SSL langsung <span class="muted small">(port 465). Matikan untuk STARTTLS (port 587)</span></span>
          </label>
          <div class="field">
            <label class="lbl" for="femail">Alamat pengirim (alias)</label>
            <input id="femail" v-model="form.fromEmail" type="email" placeholder="Kosongkan = sama dengan alamat Gmail" />
            <span class="hint">Gmail akan memakai akun yang login, kecuali alias sudah ditambahkan di Gmail.</span>
          </div>
        </div>
      </section>

      <div class="sticky-actions">
        <span v-if="dirty" class="badge warn">Ada perubahan yang belum disimpan</span>
        <span v-else class="hint">Semua perubahan sudah tersimpan.</span>
        <button type="submit" class="btn primary lg end" :disabled="!!busy || !dirty">
          <Icon :path="busy === 'save' ? mdiLoading : mdiContentSave" :size="20" :class="{ spin: busy === 'save' }" />
          {{ busy === "save" ? "Menyimpan..." : "Simpan pengaturan" }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.guide { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 0.9rem; }
.guide b { color: var(--text); }
.guide a { display: inline-flex; align-items: center; gap: 3px; font-weight: 600; }
.account-row {
  display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid var(--border);
  border-radius: 12px; background: var(--surface-2);
}
.account-email { display: block; overflow-wrap: anywhere; }
</style>
