<script setup lang="ts">
import { computed, ref } from "vue";
import { mdiChevronDown, mdiChevronUp, mdiContentCopy, mdiHelpCircle, mdiLightbulbOn, mdiOpenInNew } from "@mdi/js";
import { toast } from "../ui";
import Icon from "./Icon.vue";

const open = ref(false);

/** Alamat yang harus didaftarkan di Google: alamat yang sedang dipakai + padanan localhost lainnya. */
const origins = computed(() => {
  const list = [location.origin];
  if (location.hostname === "localhost") {
    for (const o of ["http://localhost:5180", "http://localhost:3100"]) if (!list.includes(o)) list.push(o);
  }
  return list;
});

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("info", "Disalin: " + text);
  } catch {
    toast("error", "Tidak dapat menyalin otomatis. Blok teksnya lalu salin manual.");
  }
}

const steps = [
  {
    title: "Buka Google Cloud Console",
    body: "Masuk dengan akun Google (Gmail apa saja). Jika diminta, setujui syarat layanan. Untuk Login dengan Google ini tidak perlu kartu kredit dan gratis.",
    link: { text: "Buka console.cloud.google.com", href: "https://console.cloud.google.com/" },
  },
  {
    title: "Buat project baru",
    body: "Klik pemilih project di bagian atas halaman, pilih Project baru, beri nama misalnya \"Gmail Notify\", lalu klik Buat. Pastikan project tersebut yang sedang terpilih.",
  },
  {
    title: "Atur layar persetujuan (OAuth consent screen)",
    body: "Buka menu Google Auth Platform (atau APIs & Services > OAuth consent screen). Klik Get started. Isi nama aplikasi \"Gmail Notify\", email dukungan (Gmail Anda), pilih Audience: External, isi email kontak, setujui kebijakan, lalu Create. Tidak perlu menambah scope, bawaan (email, profile, openid) sudah cukup.",
    link: { text: "Buka halaman Google Auth Platform", href: "https://console.cloud.google.com/auth/overview" },
  },
  {
    title: "Daftarkan akun yang boleh login (Test users)",
    body: "Selama status aplikasi \"Testing\", hanya akun yang terdaftar sebagai Test user yang bisa masuk. Buka Audience > Test users > Add users, masukkan Gmail yang akan dipakai login, lalu Save. Atau klik Publish app agar semua akun Google bisa masuk (untuk scope dasar tidak perlu verifikasi).",
  },
  {
    title: "Buat OAuth Client ID",
    body: "Buka Clients (atau APIs & Services > Credentials), klik Create client (atau + Create credentials > OAuth client ID). Application type: Web application. Name: \"Gmail Notify Web\".",
    link: { text: "Buka halaman Credentials", href: "https://console.cloud.google.com/apis/credentials" },
  },
  {
    title: "Tambahkan Authorized JavaScript origins",
    body: "Pada bagian Authorized JavaScript origins klik Add URI, lalu tempel alamat di kotak \"Alamat yang didaftarkan\" di bawah (tanpa garis miring di akhir). Tambahkan semua alamat yang dipakai untuk membuka aplikasi. Kolom Authorized redirect URIs biarkan kosong. Klik Create.",
    showOrigins: true,
  },
  {
    title: "Salin Client ID dan tempel di sini",
    body: "Salin Client ID yang muncul (berakhiran .apps.googleusercontent.com). Client secret tidak diperlukan. Tempel di kolom Google Client ID pada form di atas, lalu klik Simpan pengaturan. Selesai: tombol \"Masuk dengan Google\" akan aktif di halaman login.",
  },
];
</script>

<template>
  <div class="guide-wrap">
    <button type="button" class="guide-toggle" :aria-expanded="open" @click="open = !open">
      <Icon :path="mdiHelpCircle" :size="20" />
      <span class="grow">Panduan langkah demi langkah: membuat Client ID Google</span>
      <span class="badge primary">{{ steps.length }} langkah</span>
      <Icon :path="open ? mdiChevronUp : mdiChevronDown" :size="22" />
    </button>

    <div v-if="open" class="guide-body">
      <ol class="steps">
        <li v-for="(s, i) in steps" :key="i">
          <span class="num">{{ i + 1 }}</span>
          <div class="grow">
            <b>{{ s.title }}</b>
            <p>{{ s.body }}</p>
            <a v-if="s.link" :href="s.link.href" target="_blank" rel="noopener" class="link-btn">
              {{ s.link.text }} <Icon :path="mdiOpenInNew" :size="14" />
            </a>
            <div v-if="s.showOrigins" class="origin-list">
              <span class="small muted">Alamat yang didaftarkan:</span>
              <div v-for="o in origins" :key="o" class="origin">
                <code>{{ o }}</code>
                <button type="button" class="btn icon ghost" :aria-label="'Salin ' + o" @click="copy(o)">
                  <Icon :path="mdiContentCopy" :size="16" />
                </button>
              </div>
            </div>
          </div>
        </li>
      </ol>

      <div class="alert info">
        <Icon :path="mdiLightbulbOn" :size="20" />
        <div class="alert-body">
          <span class="alert-title">Catatan penting</span>
          Perubahan di Google bisa butuh beberapa menit (kadang sampai 1 jam) sebelum berlaku.
          Error <b>origin_mismatch</b> berarti alamat belum cocok persis (cek http/https, port, dan huruf besar-kecil).
          Untuk server sungguhan wajib memakai <b>HTTPS</b> dengan nama domain; alamat IP tidak diterima, kecuali <b>localhost</b>.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.guide-toggle {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 14px; border: 1px solid var(--border);
  border-radius: 12px; background: var(--surface-2); text-align: left; font-weight: 600;
}
.guide-toggle:hover { background: var(--primary-soft); }
.guide-body { margin-top: 12px; display: flex; flex-direction: column; gap: 14px; }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.steps li { display: flex; gap: 12px; align-items: flex-start; }
.steps p { margin: 2px 0 6px; color: var(--muted); font-size: 0.88rem; line-height: 1.5; }
.num {
  width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: none; margin-top: 1px;
  background: linear-gradient(135deg, #4285f4, #34a853); color: #fff; font-size: 0.8rem; font-weight: 700;
}
.origin-list { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.origin {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 4px 4px 12px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
}
.origin code { user-select: all; overflow-wrap: anywhere; }
</style>
