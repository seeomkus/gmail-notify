import { code, fig, h1, h2, h3, note, ol, p, table, ul } from "./lib.mjs";

// =====================================================================
//  BAB 1 - 6
// =====================================================================
export const part1 = [
  // ---------------------------------------------------------------- 1
  h1("Pendahuluan"),
  h2("Latar Belakang"),
  p("Pengiriman notifikasi email sering dilakukan secara manual dan tidak terdokumentasi: pesan ditulis ulang setiap kali, tampilan email tidak seragam, tidak ada catatan siapa yang sudah menerima, dan pengiriman berulang harus diingat sendiri oleh operator. Banyak tim kecil dan penggiat komunitas sudah memakai Gmail sebagai kanal pengiriman, tetapi belum memiliki aplikasi sederhana yang membungkus Gmail menjadi alat notifikasi yang rapi."),
  p("**Gmail Notify** adalah aplikasi web yang menjawab kebutuhan tersebut. Aplikasi ini mengirim email melalui akun Gmail milik organisasi (memakai App Password lewat protokol SMTP), menyediakan template email siap pakai, pengiriman massal (broadcast) yang personal, penjadwalan otomatis, riwayat pengiriman, serta manajemen pengguna dengan login manual maupun akun Google."),

  h2("Tujuan Dokumen"),
  p("Dokumen ini adalah acuan teknis tunggal untuk Gmail Notify versi 1.0.0. Dokumen ini dimaksudkan untuk:"),
  ul([
    "menjelaskan arsitektur, komponen, dan keputusan desain agar mudah dipahami pengembang baru;",
    "mendokumentasikan skema basis data, spesifikasi API, dan perilaku fungsional secara rinci;",
    "memberi panduan instalasi, konfigurasi, deployment, dan operasional di Windows maupun Linux;",
    "mencatat pertimbangan keamanan, hasil pengujian, keterbatasan, dan rencana pengembangan.",
  ]),

  h2("Ruang Lingkup"),
  p("Cakupan dokumen meliputi seluruh kode pada repositori `gmail-notify`: backend (`backend/`), frontend (`frontend/`), skrip pengelola aplikasi (`scripts/app.mjs`, `app.sh`, `app.cmd`), serta pembuat dokumen (`docs/build/`). Di luar cakupan: konfigurasi infrastruktur milik pihak ketiga (akun Google Cloud, server Nginx milik organisasi) selain contoh yang disertakan sebagai panduan."),

  h2("Target Pembaca"),
  table({
    caption: "Target pembaca dan bagian yang paling relevan",
    cols: [2.2, 4, 3],
    head: ["Pembaca", "Kebutuhan", "Bab terkait"],
    rows: [
      ["Pengembang backend", "Memahami modul, API, basis data, dan keamanan", "3, 4, 6, 7, 8"],
      ["Pengembang frontend", "Memahami komponen, alur UI, dan kontrak API", "3, 5, 7"],
      ["Administrator / DevOps", "Instalasi, konfigurasi, deployment, backup", "9, 11"],
      ["Penguji (QA)", "Skenario fungsional dan hasil pengujian", "6, 10"],
      ["Pemangku kepentingan", "Gambaran fitur, batasan, dan rencana", "1, 2, 12"],
    ],
  }),

  h2("Istilah dan Singkatan"),
  table({
    caption: "Daftar istilah dan singkatan",
    cols: [2.2, 7],
    head: ["Istilah", "Penjelasan"],
    rows: [
      ["SMTP", "*Simple Mail Transfer Protocol*, protokol pengiriman email. Aplikasi memakai `smtp.gmail.com` port 465 (SSL)."],
      ["App Password", "Sandi aplikasi 16 karakter yang dibuat di akun Google (butuh Verifikasi 2 Langkah) sebagai pengganti password login untuk aplikasi pihak ketiga."],
      ["Notifikasi", "Pengiriman satu email ke satu atau beberapa penerima dalam satu pesan (semua tampak di kolom To)."],
      ["Broadcast", "Pengiriman email terpisah ke tiap penerima sehingga alamat tidak saling terlihat dan isi dapat dipersonalisasi."],
      ["Template", "Kerangka tampilan email (HTML dan teks) dengan field yang dapat diisi, misalnya judul, pesan, dan tombol."],
      ["Scheduler", "Pemeriksa jadwal di server yang menjalankan pengiriman otomatis pada waktu yang ditentukan."],
      ["SPA", "*Single Page Application*: aplikasi web yang dimuat sekali dan berpindah halaman tanpa memuat ulang."],
      ["REST API", "Antarmuka server berbasis HTTP dan JSON yang dipakai frontend."],
      ["WAL", "*Write-Ahead Logging*, mode jurnal SQLite yang memungkinkan baca dan tulis berjalan bersamaan."],
      ["GIS", "*Google Identity Services*, pustaka tombol \"Masuk dengan Google\" yang menghasilkan ID token."],
      ["ID token", "Token JWT bertanda tangan Google yang berisi identitas pengguna; diverifikasi server sebelum membuat sesi."],
      ["scrypt", "Fungsi turunan kunci berbiaya memori tinggi untuk menyimpan hash password."],
      ["Sesi", "Status login pengguna di server, diwakili cookie `sid` yang `HttpOnly`."],
    ],
  }),

  h2("Penulis dan Hak Cipta"),
  table({
    caption: "Informasi penulis",
    cols: [2.4, 6.6],
    head: ["Atribut", "Keterangan"],
    rows: [
      ["Nama", "Kusnandar Rohim"],
      ["Nama lain", "SeeOmKus"],
      ["Situs web", "www.seeomkus.com"],
      ["Periode pembuatan", "Oktober 2026"],
    ],
  }),
  p("Gmail Notify dan dokumen ini disusun oleh **Kusnandar Rohim** (nama lain **SeeOmKus**) pada bulan Oktober 2026. Informasi lebih lanjut tersedia di www.seeomkus.com. Hak cipta © 2026 Kusnandar Rohim (SeeOmKus)."),

  // ---------------------------------------------------------------- 2
  h1("Gambaran Umum Sistem"),
  h2("Deskripsi Aplikasi"),
  p("Gmail Notify terdiri atas aplikasi web (frontend) dan layanan server (backend) yang berjalan dalam satu proses Node.js. Pengguna masuk, memilih template, menentukan penerima, menulis pesan, lalu mengirim sekarang atau menjadwalkannya. Server menyusun email HTML dan teks, mengirimnya lewat SMTP Gmail, dan mencatat setiap hasil ke basis data SQLite."),
  p("Konfigurasi akun Gmail pengirim, tampilan email, dan pengaturan akses dapat diubah langsung dari antarmuka web oleh admin; tidak diperlukan penyuntingan berkas konfigurasi di server setelah instalasi awal."),

  h2("Fitur Utama"),
  table({
    caption: "Ringkasan fitur Gmail Notify 1.0.0",
    cols: [2.4, 6.6],
    head: ["Fitur", "Deskripsi"],
    rows: [
      ["Pengiriman notifikasi", "Kirim ke satu atau banyak penerima dengan CC/BCC, memakai template atau pesan polos, dengan pratinjau langsung."],
      ["Template email", "Sembilan template (lima notifikasi, tiga broadcast, satu netral) dengan ikon, warna, dan field khusus."],
      ["Broadcast personal", "Satu email per penerima, personalisasi `{{nama}}` dan `{{email}}`, hingga 200 penerima per pengiriman."],
      ["Penjadwalan otomatis", "Sekali, interval menit, harian, atau hari tertentu setiap minggu; kelola, jeda, kirim sekarang, hapus."],
      ["Riwayat pengiriman", "Catatan sukses/gagal beserta isi, penerima, template, dan pesan error; filter dan paginasi."],
      ["Manajemen akun Gmail", "Ganti akun pengirim dengan uji koneksi sebelum disimpan, putuskan akun, dan tes koneksi."],
      ["Login dan daftar", "Manual (email/username dan password) atau Google; lupa dan reset password lewat email."],
      ["Peran pengguna", "Admin (mengelola pengaturan) dan pengguna biasa (mengirim dan menjadwalkan)."],
      ["Mode demo", "Akun contoh `admin` dan `demo` untuk pengembangan; otomatis hilang di production."],
      ["Pengelola aplikasi", "Skrip build, start, stop, restart, status, dan logs untuk Windows dan Linux."],
      ["Antarmuka modern", "Responsif, tema terang/gelap, ikon Material Design berwarna, notifikasi toast, dan dialog konfirmasi."],
    ],
  }),

  h2("Peran Pengguna dan Hak Akses"),
  p("Sistem mengenal dua peran. Pendaftar sungguhan pertama otomatis menjadi **admin** (atau akun yang emailnya ditentukan lewat `ADMIN_EMAIL`). Akun demo tidak dihitung sebagai pengguna sungguhan."),
  table({
    caption: "Matriks hak akses berdasarkan peran",
    cols: [4.6, 1.5, 1.5, 1.5],
    head: ["Kemampuan", "Admin", "Pengguna", "Tanpa login"],
    rows: [
      ["Melihat halaman masuk, daftar, lupa dan reset password", "Ya", "Ya", "Ya"],
      ["Mengirim notifikasi dan broadcast", "Ya", "Ya", "Tidak"],
      ["Membuat, menjeda, menjalankan, menghapus jadwal", "Ya", "Ya", "Tidak"],
      ["Melihat dan menghapus riwayat", "Ya", "Ya", "Tidak"],
      ["Membaca pengaturan (tanpa password)", "Ya", "Ya", "Tidak"],
      ["Mengubah profil dan password sendiri", "Ya", "Ya", "Tidak"],
      ["Mengubah akun Gmail pengirim dan tampilan email", "Ya", "Tidak", "Tidak"],
      ["Mengatur Client ID Google, izin pendaftaran, URL aplikasi", "Ya", "Tidak", "Tidak"],
    ],
  }),

  h2("Batasan dan Asumsi"),
  ul([
    "Satu akun Gmail pengirim aktif pada satu waktu; seluruh pengguna berbagi akun tersebut.",
    "Data (jadwal, riwayat, pengaturan) bersifat bersama, belum dipisah per pengguna.",
    "Pengiriman tunduk pada kuota Google (kira-kira 500 penerima per hari untuk akun Gmail biasa; nilai dapat berubah mengikuti kebijakan Google).",
    "Server harus menyala agar jadwal berjalan; jadwal yang terlewat saat server mati dijalankan satu kali saat server hidup kembali.",
    "Server memerlukan akses keluar ke `smtp.gmail.com:465` dan, bila memakai login Google, ke layanan Google.",
  ]),

  // ---------------------------------------------------------------- 3
  h1("Arsitektur Sistem"),
  h2("Arsitektur Tingkat Tinggi"),
  p("Aplikasi memakai arsitektur klien-server sederhana. Browser memuat SPA Vue 3 yang berkomunikasi dengan REST API Express melalui JSON dan cookie sesi. Server mengelola autentikasi, menyusun email dari template, mengirimnya ke SMTP Gmail, menjalankan scheduler, dan menyimpan semua data ke satu berkas SQLite. Pada mode production, server yang sama menyajikan berkas frontend hasil build sehingga hanya ada satu proses dan satu port."),
  fig("diagram-arsitektur.png", "Arsitektur Gmail Notify: browser, server Node.js, SQLite, dan layanan Google", 15.8),

  h2("Teknologi yang Digunakan"),
  table({
    caption: "Teknologi, versi, dan peran",
    cols: [2.3, 1.8, 4.9],
    head: ["Komponen", "Versi", "Peran"],
    rows: [
      ["Node.js", "22.x", "Runtime server dan skrip pengelola"],
      ["TypeScript", "5.6", "Bahasa backend dan frontend (mode ketat)"],
      ["Express", "4.21", "Kerangka HTTP dan routing REST"],
      ["better-sqlite3", "13", "Driver SQLite sinkron (mode WAL)"],
      ["Nodemailer", "6.9", "Klien SMTP untuk Gmail"],
      ["google-auth-library", "11.2", "Verifikasi ID token Google"],
      ["dotenv", "16.4", "Memuat konfigurasi `.env`"],
      ["cors", "2.8", "Pengaturan CORS (mode pengembangan)"],
      ["tsx", "4.19", "Menjalankan TypeScript saat pengembangan"],
      ["Vue", "3.5", "Kerangka UI (Composition API, `<script setup>`)"],
      ["Vite", "5.4", "Server dev dan bundler frontend"],
      ["vue-tsc", "2.1", "Pemeriksaan tipe komponen Vue"],
      ["@mdi/js", "7.4", "Ikon Material Design sebagai SVG inline"],
      ["SQLite", "3.x", "Basis data berkas tunggal"],
    ],
  }),

  h2("Struktur Direktori Proyek"),
  code("text", `
gmail-notify/
├── app.sh · app.cmd          Pembungkus start/stop/status (Linux · Windows)
├── package.json              Skrip npm (build, start, stop, ...)
├── scripts/app.mjs           Pengelola aplikasi lintas-OS
├── backend/
│   ├── .env(.example)        Konfigurasi opsional
│   ├── data/app.db           Basis data SQLite (dibuat otomatis)
│   └── src/
│       ├── server.ts         Rute API, guard autentikasi, static frontend
│       ├── auth.ts           Pengguna, sesi, Google, reset, mode demo
│       ├── sender.ts         Validasi, prepareJob, runJob
│       ├── mailer.ts         Transporter SMTP dan pesan error
│       ├── templates.ts      Sembilan template dan renderer
│       ├── schedules.ts      Tabel jadwal dan scheduler
│       ├── settings.ts       Pengaturan (key/value JSON)
│       └── db.ts             Koneksi SQLite dan skema dasar
├── frontend/
│   └── src/
│       ├── App.vue           Rangka, navigasi, tema
│       ├── api.ts · auth.ts  Klien API dan status login
│       ├── ui.ts · icons.ts  Toast, dialog, tema, peta ikon
│       └── components/       AuthView, SendTab, ScheduleTab, HistoryTab,
│                             SettingsTab, GoogleGuide, ToastHost, Icon...
├── docs/                     Dokumen teknis (PDF, DOCX, Markdown)
│   ├── images/               Diagram dan screenshot
│   └── build/                Pembuat dokumen
└── .run/                     PID dan log saat dijalankan lewat app.sh
`),
  fig("diagram-struktur.png", "Peta modul backend dan frontend beserta tanggung jawabnya", 15.8),

  h2("Komponen Backend"),
  table({
    caption: "Modul backend dan tanggung jawabnya",
    cols: [2.1, 6.9],
    head: ["Modul", "Tanggung jawab"],
    rows: [
      ["server.ts", "Membuat aplikasi Express, memasang CORS dan parser JSON, mendaftarkan rute, memasang guard login (`requireAuth`) untuk seluruh `/api` kecuali `/api/health` dan `/api/auth/*`, membatasi perubahan pengaturan untuk admin, menyajikan frontend hasil build dengan fallback SPA, dan menjalankan scheduler."],
      ["auth.ts", "Skema `users`, `sessions`, `password_resets`; hash scrypt; sesi cookie; pembatasan percobaan; daftar, login, login Google, lupa dan reset password, profil, ganti password; akun demo."],
      ["sender.ts", "Parser alamat email dan daftar penerima, `prepareJob()` yang memvalidasi input mentah menjadi *Job*, dan `runJob()` yang mengirim serta mencatat ke `email_logs`."],
      ["mailer.ts", "Membuat transporter Nodemailer dari pengaturan, `verifySmtp()`, `buildContent()`, `openMailer()`, dan `friendlySmtpError()` yang menerjemahkan error SMTP."],
      ["templates.ts", "Definisi sembilan template, `renderEmail()` (HTML dan teks), `fillVars()` untuk `{{nama}}` dan `{{email}}`, serta `sanitizeValues()`."],
      ["schedules.ts", "Skema `schedules`, perhitungan waktu berikutnya, eksekusi jadwal, timer scheduler, dan rute CRUD jadwal."],
      ["settings.ts", "Membaca dan menyimpan pengaturan (key/value JSON) dengan nilai bawaan; `publicSettings()` tidak pernah mengembalikan password."],
      ["db.ts", "Membuka SQLite (mode WAL), skema `settings` dan `email_logs`, serta migrasi kolom `template_id`."],
    ],
  }),

  h2("Komponen Frontend"),
  table({
    caption: "Berkas frontend utama",
    cols: [2.4, 6.6],
    head: ["Berkas", "Tanggung jawab"],
    rows: [
      ["App.vue", "Rangka aplikasi: gerbang login, sidebar, header halaman, tema, banner \"Lengkapi profil\", routing berbasis hash."],
      ["components/AuthView.vue", "Halaman masuk, daftar, lupa, dan reset password; tombol Google; kartu mode demo; indikator kekuatan password."],
      ["components/SendTab.vue", "Alur empat langkah: jenis pesan dan template, penerima, pesan, waktu kirim; pratinjau langsung; kirim tes."],
      ["components/ScheduleTab.vue", "Daftar jadwal, status, dan aksi kirim sekarang, jeda/aktifkan, hapus."],
      ["components/HistoryTab.vue", "Riwayat dengan filter, detail, hapus, dan paginasi."],
      ["components/SettingsTab.vue", "Profil, password, akun Gmail pengirim, tampilan email, akses dan Google, pengaturan lanjutan."],
      ["components/GoogleGuide.vue", "Panduan tujuh langkah membuat Client ID Google."],
      ["api.ts", "Pembungkus `fetch`, tipe data, dan fungsi untuk setiap endpoint; penanganan 401 global."],
      ["auth.ts", "Status login reaktif, inisialisasi, logout."],
      ["ui.ts · icons.ts", "Toast, dialog konfirmasi, tema; peta ikon dan warna per template dan jenis jadwal."],
      ["styles.css", "Token desain (terang/gelap) dan gaya komponen."],
    ],
  }),

  h2("Alur Data Utama"),
  p("Seluruh pengiriman, baik manual (`/api/notify`, `/api/broadcast`) maupun terjadwal, melewati jalur yang sama: input divalidasi oleh `prepareJob()`, dijalankan oleh `runJob()`, lalu setiap hasil dicatat. Dengan satu jalur, perilaku validasi, personalisasi, dan pencatatan selalu konsisten."),
  fig("diagram-alur-kirim.png", "Alur pengiriman email dari form hingga pencatatan riwayat", 15.8),

  // ---------------------------------------------------------------- 4
  h1("Desain Basis Data"),
  h2("Gambaran Umum"),
  p("Seluruh data disimpan pada satu berkas SQLite, `backend/data/app.db` (lokasi dapat diubah dengan variabel `DB_PATH`). Koneksi memakai mode jurnal **WAL** sehingga pembacaan dan penulisan dapat berjalan bersamaan, dan `foreign_keys = ON` agar penghapusan pengguna ikut menghapus sesi dan token resetnya. Skema dibuat otomatis saat server pertama kali berjalan (`CREATE TABLE IF NOT EXISTS`), dan kolom yang ditambahkan belakangan dimigrasikan dengan `ALTER TABLE` ringan."),
  h2("Diagram Relasi Entitas"),
  fig("diagram-erd.png", "Diagram relasi entitas (ERD) basis data Gmail Notify", 15.8),
  h2("Kamus Data"),
  h3("Tabel users"),
  table({
    caption: "Struktur tabel users",
    cols: [2.4, 1.6, 5],
    head: ["Kolom", "Tipe", "Keterangan"],
    rows: [
      ["id", "INTEGER PK", "Kunci utama, otomatis bertambah"],
      ["email", "TEXT UNIQUE", "Alamat email; unik tanpa membedakan huruf besar-kecil (`COLLATE NOCASE`)"],
      ["name", "TEXT", "Nama tampilan (maks. 80 karakter)"],
      ["username", "TEXT UNIQUE", "Opsional; dipakai akun demo. Indeks unik parsial pada nilai non-NULL"],
      ["password_hash", "TEXT", "Format `scrypt$garam$hash`; NULL untuk akun yang hanya memakai Google"],
      ["google_id", "TEXT UNIQUE", "Subjek (`sub`) akun Google yang tertaut"],
      ["picture", "TEXT", "URL foto profil dari Google"],
      ["role", "TEXT", "`admin` atau `user`"],
      ["is_demo", "INTEGER", "1 untuk akun contoh mode demo"],
      ["profile_completed", "INTEGER", "0 untuk akun baru dari Google yang belum meninjau profil"],
      ["created_at · last_login_at", "TEXT", "Waktu UTC (`datetime('now')`)"],
    ],
  }),
  h3("Tabel sessions dan password_resets"),
  table({
    caption: "Struktur tabel sessions dan password_resets",
    cols: [2.1, 2.4, 4.5],
    head: ["Tabel", "Kolom", "Keterangan"],
    rows: [
      ["sessions", "token_hash PK", "SHA-256 dari token sesi; token asli hanya ada di cookie"],
      ["", "user_id FK, expires_at, created_at", "Pemilik sesi dan masa berlaku (7 hari)"],
      ["password_resets", "token_hash PK", "SHA-256 dari token reset"],
      ["", "user_id FK, expires_at, used_at", "Berlaku 30 menit; `used_at` terisi saat dipakai (sekali pakai)"],
    ],
  }),
  h3("Tabel settings"),
  table({
    caption: "Kunci pengaturan yang disimpan pada tabel settings",
    cols: [2.3, 1.7, 5],
    head: ["Kunci", "Tipe nilai", "Keterangan dan nilai bawaan"],
    rows: [
      ["smtpHost · smtpPort · smtpSecure", "string · angka · boolean", "`smtp.gmail.com` · 465 · true (SSL langsung)"],
      ["smtpUser · smtpPass", "string", "Akun dan App Password; bawaan dari `GMAIL_USER` dan `GMAIL_APP_PASSWORD`"],
      ["fromName · fromEmail · replyTo", "string", "Nama pengirim (bawaan \"Gmail Notify\"), alias pengirim, alamat balas"],
      ["defaultCc · defaultBcc", "string", "CC/BCC otomatis untuk notifikasi"],
      ["signature", "string", "Footer email; bawaan \"Notifikasi dikirim manual dari aplikasi Gmail Notify.\""],
      ["sendHtml", "boolean", "true = kirim tampilan HTML; false = teks biasa"],
      ["googleClientId", "string", "Client ID OAuth Google; bawaan dari `GOOGLE_CLIENT_ID`"],
      ["allowRegistration", "boolean", "Izin pendaftaran mandiri; bawaan true"],
      ["appUrl", "string", "URL publik untuk tautan reset password; bawaan dari `APP_URL`"],
    ],
  }),
  h3("Tabel email_logs"),
  table({
    caption: "Struktur tabel email_logs",
    cols: [2.2, 2.2, 4.6],
    head: ["Kolom", "Tipe", "Keterangan"],
    rows: [
      ["id", "INTEGER PK", "Kunci utama"],
      ["to_addr · cc · bcc", "TEXT", "Penerima (dipisah koma). Broadcast: satu baris per penerima"],
      ["subject · message", "TEXT", "Subjek dan isi pesan. Pada broadcast sudah dipersonalisasi"],
      ["status", "TEXT", "`sent` atau `failed` (batasan `CHECK`)"],
      ["error · message_id", "TEXT", "Pesan error bila gagal; ID pesan SMTP bila berhasil"],
      ["template_id", "TEXT", "ID template yang dipakai (NULL untuk pesan polos)"],
      ["created_at", "TEXT", "Waktu UTC"],
    ],
  }),
  h3("Tabel schedules"),
  table({
    caption: "Struktur tabel schedules",
    cols: [2.2, 2.2, 4.6],
    head: ["Kolom", "Tipe", "Keterangan"],
    rows: [
      ["id · name", "INTEGER PK · TEXT", "Kunci dan nama jadwal (maks. 100 karakter)"],
      ["enabled", "INTEGER", "1 aktif, 0 dijeda atau selesai"],
      ["repeat", "TEXT", "`once`, `interval`, `daily`, atau `weekly` (batasan `CHECK`)"],
      ["run_at", "TEXT", "Waktu kirim (ISO UTC) untuk `once`"],
      ["interval_min", "INTEGER", "Interval menit (1 sampai 10080) untuk `interval`"],
      ["time_of_day · weekdays", "TEXT · TEXT(JSON)", "Jam `HH:MM` dan larik hari 0 (Minggu) sampai 6 untuk `daily`/`weekly`"],
      ["job", "TEXT (JSON)", "Isi pengiriman: mode, penerima, subjek, template, nilai field"],
      ["next_run_at", "TEXT", "Waktu eksekusi berikutnya (ISO UTC); NULL jika tidak ada"],
      ["last_run_at · last_status · last_result", "TEXT", "Hasil eksekusi terakhir: `success`, `partial`, atau `failed` beserta ringkasan"],
      ["run_count · created_at", "INTEGER · TEXT", "Jumlah eksekusi dan waktu pembuatan"],
    ],
  }),
  h2("Migrasi"),
  p("Belum ada alat migrasi terpisah. Perubahan skema dilakukan dengan `CREATE ... IF NOT EXISTS` dan pemeriksaan `PRAGMA table_info` sebelum `ALTER TABLE ADD COLUMN`. Kolom yang sudah ditambahkan dengan cara ini: `email_logs.template_id`, serta `users.picture`, `users.profile_completed`, `users.username`, dan `users.is_demo` (beserta indeks unik `idx_users_username`). Pendekatan ini aman dijalankan berulang dan mempertahankan data lama."),

  // ---------------------------------------------------------------- 5
  h1("Desain Antarmuka Pengguna"),
  h2("Prinsip Desain"),
  ul([
    "**Mudah dipakai:** alur bernomor, bahasa Indonesia sederhana, petunjuk singkat di bawah kolom, dan nilai contoh yang sudah terisi.",
    "**Aman dari salah klik:** tindakan berisiko (broadcast, hapus, kirim sekarang, putuskan akun) meminta konfirmasi lewat dialog khusus, bukan `window.confirm`.",
    "**Umpan balik jelas:** notifikasi toast, status memuat, dan pesan error yang menjelaskan langkah perbaikan.",
    "**Konsisten dan modern:** token desain CSS, ikon Material Design berwarna per fitur, kartu bersudut halus, mode terang dan gelap.",
    "**Responsif:** sidebar berubah menjadi menu bawah di layar sempit; kolom pratinjau berpindah di bawah form.",
  ]),
  h2("Struktur Navigasi"),
  table({
    caption: "Halaman, alamat hash, dan akses",
    cols: [2.2, 2.4, 4.4],
    head: ["Halaman", "Alamat", "Keterangan"],
    rows: [
      ["Masuk / Daftar", "(tanpa login)", "Form manual, tombol Google, kartu demo bila mode demo"],
      ["Reset password", "`#reset=TOKEN`", "Dibuka dari tautan email; tampil walau sudah login"],
      ["Kirim", "`#send`", "Halaman awal setelah login"],
      ["Jadwal", "`#schedule`", "Mengelola jadwal otomatis"],
      ["Riwayat", "`#history`", "Catatan pengiriman"],
      ["Pengaturan", "`#settings`", "Profil untuk semua; pengaturan pengiriman dan akses untuk admin"],
    ],
  }),
  h2("Halaman Masuk dan Daftar"),
  p("Halaman dibagi dua: panel kiri berisi identitas aplikasi, panel kanan berisi form. Pengguna dapat berpindah antara **Masuk** dan **Daftar**, memakai tombol Google, atau membuka alur **Lupa password**. Kolom login menerima email atau username. Pada mode demo, kartu **Mode demo** menampilkan akun contoh dengan tombol *Isi* dan *Masuk*; pada production kartu ini tidak pernah ditampilkan. Saat Client ID Google belum diisi, tombol Google tetap tampil dengan keterangan bahwa admin harus mengaktifkannya di Pengaturan. Tata letak menyesuaikan **tinggi layar**: pada laptop berlayar pendek, subjudul dan petunjuk sekunder disembunyikan serta jarak dipadatkan sehingga halaman muat tanpa scroll (diukur pada 1920x1080 hingga 1280x720 dan ponsel 360x640). Bila layar sangat pendek, hanya kolom form yang dapat di-scroll, sedangkan panel kiri tetap diam."),
  fig("ui-login.png", "Halaman masuk pada mode demo", 15.8),
  h2("Halaman Kirim"),
  p("Halaman Kirim memandu pengguna dalam empat langkah: (1) memilih jenis pesan dan template, (2) menentukan penerima, (3) menulis pesan, dan (4) memilih waktu kirim. Pratinjau email tampil di sisi kanan dan diperbarui otomatis. Tombol aksi melayang di bagian bawah, termasuk **Kirim tes ke saya** untuk menguji tampilan di kotak masuk sendiri."),
  table({
    caption: "Empat langkah pada halaman Kirim dan perilakunya",
    cols: [1.9, 2.5, 5.6],
    head: ["Langkah", "Isi", "Perilaku penting"],
    rows: [
      ["1. Jenis pesan", "Notifikasi atau Broadcast, lalu pilih template dari kartu", "Template yang tampil menyesuaikan jenis pesan. Nilai contoh langsung terisi dan pratinjau muncul."],
      ["2. Penerima", "Notifikasi: email tujuan, CC/BCC. Broadcast: daftar `email, nama`", "Tombol \"Gunakan email saya\", jumlah penerima dihitung langsung, alamat tidak valid ditandai sebelum kirim."],
      ["3. Tulis pesan", "Subjek dan field sesuai template", "Subjek maksimal 200 karakter, isi maksimal 5000. Pada broadcast ada petunjuk variabel `{{nama}}`."],
      ["4. Waktu kirim", "Sekarang atau Jadwalkan", "Pilihan sekali, interval, harian, mingguan dengan ringkasan kalimat. Tombol utama menyesuaikan: Kirim Sekarang, Kirim ke N Penerima, atau Simpan Jadwal."],
      ["Kirim tes ke saya", "Tombol pendamping di bilah aksi", "Mengirim email uji ke akun pengirim sendiri dengan subjek berawalan \"[Tes]\" untuk mengecek tampilan di kotak masuk."],
    ],
  }),
  fig("ui-kirim.png", "Halaman Kirim mode Notifikasi dengan pratinjau email", 15.8),
  p("Pada mode **Broadcast**, kolom penerima menjadi daftar satu orang per baris dengan format `email, nama`. Jumlah penerima dihitung langsung dan alamat yang tidak valid ditandai sebelum pengiriman."),
  fig("ui-broadcast.png", "Mode Broadcast: template kampanye dan daftar penerima", 15.8),
  p("Pada langkah keempat, pengguna dapat menjadwalkan pengiriman. Ringkasan kalimat (misalnya \"Dikirim setiap Sen, Sel, Rab, Kam, Jum pukul 08:00\") menegaskan jadwal sebelum disimpan."),
  fig("ui-penjadwalan.png", "Langkah 4: penjadwalan pengiriman mingguan", 12.5),
  h2("Halaman Jadwal"),
  p("Setiap jadwal menampilkan ikon sesuai jenis pengulangan, ringkasan waktu dan tujuan, waktu eksekusi berikutnya, hasil eksekusi terakhir, dan jumlah eksekusi. Aksi tersedia untuk **Kirim sekarang**, **Jeda/Aktifkan**, dan **Hapus**. Daftar diperbarui otomatis setiap lima detik."),
  fig("ui-jadwal.png", "Halaman Jadwal dengan jadwal aktif dan jadwal yang sudah selesai", 15.8),
  h2("Halaman Riwayat"),
  p("Riwayat menampilkan semua pengiriman dengan filter *Semua/Terkirim/Gagal*. Baris dapat dibuka untuk melihat CC/BCC, isi pesan, dan pesan error. Penghapusan satu catatan atau seluruh riwayat meminta konfirmasi."),
  fig("ui-riwayat.png", "Halaman Riwayat dengan satu catatan dibuka", 15.8),
  h2("Halaman Pengaturan"),
  p("Pengaturan dibagi menjadi kartu: **Profil saya**, **Ubah password**, **Akun Gmail pengirim**, **Tampilan email**, **Akses dan masuk dengan Google**, dan **Pengaturan lanjutan** (server SMTP). Pengguna biasa hanya melihat Profil dan Ubah password beserta keterangan bahwa pengaturan pengiriman dikelola admin. Perubahan yang belum disimpan ditandai, dan tombol simpan menjadi aktif hanya bila ada perubahan."),
  fig("ui-pengaturan-akun.png", "Pengaturan: profil, password, dan akun Gmail pengirim (alamat disamarkan)", 15.8),
  p("Kartu akses menyertakan panduan tujuh langkah membuat Client ID Google lengkap dengan alamat origin yang dapat disalin."),
  fig("ui-pengaturan-google.png", "Pengaturan akses dan panduan pembuatan Client ID Google", 15.2),
  h2("Responsif dan Aksesibilitas"),
  p("Pada lebar di bawah 860 piksel sidebar berpindah menjadi menu bawah dan form tersusun satu kolom. Setiap kolom memiliki label terhubung (`label for`), atribut `autocomplete` yang sesuai, fokus keyboard yang terlihat, dan dialog konfirmasi yang dapat ditutup dengan tombol Esc. Warna status tidak menjadi satu-satunya penanda: selalu disertai teks atau ikon."),
  fig("ui-gelap.png", "Mode gelap pada halaman Kirim", 15.0),
  fig("ui-mobile.png", "Tampilan ponsel dengan menu bawah", 6.2, 15),

  // ---------------------------------------------------------------- 6
  h1("Spesifikasi Fungsional"),
  h2("Pengiriman Notifikasi"),
  p("Pengiriman notifikasi mengirim **satu email** ke satu atau beberapa penerima. Alamat dipisah koma, titik koma, atau baris baru, divalidasi dengan pola `^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$`, dan dibatasi 200 karakter. CC dan BCC bersifat opsional; bila tidak dikirim, nilai bawaan dari pengaturan dipakai."),
  table({
    caption: "Aturan validasi pengiriman",
    cols: [2.6, 6.4],
    head: ["Data", "Aturan"],
    rows: [
      ["Email tujuan", "Wajib; setiap alamat harus valid"],
      ["CC · BCC", "Opsional; setiap alamat harus valid; bawaan dari pengaturan bila tidak dikirim"],
      ["Subjek", "Wajib; maksimal 200 karakter"],
      ["Pesan polos", "Wajib bila tanpa template; maksimal 5000 karakter"],
      ["Field template", "Field bertanda wajib harus terisi; setiap field maksimal 5000 karakter"],
      ["Tautan tombol", "Hanya `http://` atau `https://`; selain itu tombol tidak ditampilkan"],
    ],
  }),
  p("Hasil pengiriman selalu dicatat. Jika SMTP belum dikonfigurasi atau login Gmail ditolak, pengiriman gagal dengan pesan yang jelas dan tetap tercatat sebagai *failed*."),

  h2("Template Email"),
  p("Template didefinisikan sebagai data di `templates.ts`: kategori, ikon, warna aksen, field, dan contoh isi. Satu fungsi `renderEmail()` menyusun HTML berbasis tabel dengan gaya inline (kompatibel dengan klien email) dan versi teks. Seluruh nilai di-*escape* sebelum dimasukkan ke HTML, dan tautan hanya diterima bila berawalan http atau https."),
  table({
    caption: "Daftar template email",
    cols: [2.3, 1.7, 2.3, 2.7],
    head: ["Template (id)", "Kategori", "Tampilan", "Field khusus"],
    rows: [
      ["Pemberitahuan Umum (`info`)", "Notifikasi", "Banner biru", "Tombol"],
      ["Konfirmasi Berhasil (`success`)", "Notifikasi", "Banner hijau", "No. referensi, waktu, tombol"],
      ["Peringatan Penting (`alert`)", "Notifikasi", "Banner merah", "Tindakan, tombol"],
      ["Pengingat (`reminder`)", "Notifikasi", "Banner ungu", "Waktu, tempat, tombol"],
      ["Pemeliharaan Sistem (`maintenance`)", "Notifikasi", "Banner oranye", "Mulai, selesai, dampak"],
      ["Newsletter (`newsletter`)", "Broadcast", "Hero gelap", "Tombol"],
      ["Undangan Acara (`event`)", "Broadcast", "Hero toska", "Waktu, lokasi, kontak, tombol"],
      ["Promo (`promo`)", "Broadcast", "Hero merah muda", "Highlight, kode voucher, berlaku sampai, tombol"],
      ["Teks Sederhana (`simple`)", "Keduanya", "Polos", "Judul dan pesan"],
    ],
  }),
  p("Variabel personalisasi: `{{nama}}` diganti nama penerima (atau \"Pelanggan\" bila kosong) dan `{{email}}` diganti alamat penerima. Variabel berlaku pada subjek, judul, pesan, dan field lain."),

  h2("Broadcast"),
  p("Broadcast mengirim **satu email per penerima**. Daftar penerima ditulis satu per baris dengan format `email, nama`; baris kosong diabaikan dan duplikat dibuang (tanpa membedakan huruf besar-kecil). Maksimal 200 penerima per pengiriman. Satu koneksi SMTP dipakai berulang untuk seluruh penerima, dan pengiriman berlangsung berurutan."),
  ul([
    "Alamat tidak valid menggagalkan seluruh permintaan sebelum ada email yang dikirim (HTTP 400).",
    "Kegagalan pada satu penerima tidak menghentikan penerima lainnya; hasil per penerima dicatat dan dikembalikan sebagai ringkasan `total`, `sent`, `failed`.",
    "Subjek dan pesan dipersonalisasi per penerima, dan versi yang sudah dipersonalisasi itulah yang disimpan di riwayat.",
  ]),

  h2("Penjadwalan"),
  p("Jadwal menyimpan isi pengiriman sebagai JSON beserta aturan waktu. Isi divalidasi lengkap saat jadwal dibuat (sehingga salah ketik langsung ketahuan) dan divalidasi ulang saat dijalankan (sehingga perubahan template atau pengaturan tetap berlaku)."),
  table({
    caption: "Jenis pengulangan jadwal",
    cols: [1.8, 3.7, 3.5],
    head: ["Jenis", "Parameter", "Perilaku"],
    rows: [
      ["`once`", "Tanggal dan jam (harus di masa depan)", "Dijalankan sekali, lalu otomatis nonaktif dan `next_run_at` dikosongkan"],
      ["`interval`", "Setiap N menit (1 sampai 10080)", "Pengiriman pertama N menit setelah disimpan, lalu setiap N menit"],
      ["`daily`", "Jam `HH:MM`", "Setiap hari pada jam tersebut (zona waktu server)"],
      ["`weekly`", "Jam `HH:MM` dan hari 0 sampai 6", "Pada hari terpilih setiap minggu"],
    ],
  }),
  fig("diagram-scheduler.png", "Siklus kerja scheduler", 15.8),
  p("Scheduler memeriksa jadwal yang jatuh tempo (`enabled = 1` dan `next_run_at <= sekarang`) setiap 10 detik, ditambah satu pemeriksaan 2 detik setelah server hidup. Karena itu pengiriman bisa terlambat sampai sekitar 10 detik. Aturan penting:"),
  ul([
    "Waktu berikutnya dihitung dari saat ini (`nextAfter(spec, sekarang)`), sehingga eksekusi yang terlewat saat server mati tidak dikejar berulang; hanya dijalankan sekali.",
    "Satu jadwal tidak dapat berjalan ganda (himpunan `running`), dan putaran timer tidak saling tumpang tindih.",
    "**Kirim sekarang** menjalankan jadwal di luar waktunya tanpa mengubah `next_run_at`.",
    "Mengaktifkan kembali jadwal menghitung ulang waktu berikutnya; jadwal `once` yang waktunya sudah lewat tidak dapat diaktifkan lagi.",
    "Hasil eksekusi disimpan: `success`, `partial` (sebagian gagal), atau `failed`, beserta ringkasan.",
  ]),

  h2("Riwayat Pengiriman"),
  p("Setiap pengiriman, baik berhasil maupun gagal, menambah satu baris pada `email_logs` (untuk broadcast: satu baris per penerima). API mendukung filter status, paginasi (`limit` hingga 200 dan `offset`), penghapusan satu catatan, dan penghapusan seluruh riwayat."),

  h2("Manajemen Akun Gmail Pengirim"),
  p("Admin dapat mengganti atau memutuskan akun pengirim dari antarmuka tanpa menyentuh berkas konfigurasi."),
  ul([
    "**Ganti akun** menguji login SMTP akun baru **sebelum** menyimpannya. Jika gagal, akun lama tidak berubah. Spasi pada App Password dihapus otomatis, dan alias `fromEmail` milik akun lama dikosongkan.",
    "Mengubah email lewat form pengaturan umum tanpa App Password baru ditolak, agar sandi akun lama tidak tertinggal.",
    "**Putuskan** menghapus email dan App Password dari basis data (dengan konfirmasi).",
    "**Tes koneksi** hanya memverifikasi login dan tidak mengirim email.",
    "Error SMTP diterjemahkan menjadi pesan yang mudah dipahami, misalnya login salah (`EAUTH`) atau server tidak terjangkau (`ECONNECTION`, `ETIMEDOUT`).",
  ]),

  h2("Autentikasi dan Otorisasi"),
  fig("diagram-auth.png", "Tiga alur autentikasi: manual, Google, dan lupa password", 15.8),
  h3("Daftar dan masuk manual"),
  p("Pendaftaran meminta nama, email, dan password (8 sampai 128 karakter). Login menerima email atau username. Password disimpan sebagai hash scrypt dengan garam acak 16 byte. Pembandingan memakai `timingSafeEqual`, dan hash tetap dihitung walau akun tidak ditemukan agar waktu respons tidak membocorkan keberadaan akun."),
  h3("Masuk dan daftar dengan Google"),
  p("Tombol Google (Google Identity Services) menghasilkan ID token yang dikirim ke `POST /api/auth/google`. Server memverifikasinya dengan `OAuth2Client.verifyIdToken` terhadap Client ID, mensyaratkan `email_verified = true`, lalu: (a) masuk bila `google_id` sudah dikenal; (b) menautkan akun bila email sudah terdaftar; (c) atau membuat akun baru bila pendaftaran dibuka. Akun baru dari Google berstatus *profil belum ditinjau* sehingga pengguna diajak melengkapi profil setelah masuk."),
  h3("Lupa dan reset password"),
  p("Permintaan lupa password selalu dijawab dengan pesan yang sama untuk email terdaftar maupun tidak. Untuk email terdaftar, server membuat token acak 256-bit (hanya hash SHA-256 yang disimpan, berlaku 30 menit, sekali pakai) dan mengirim tautan `/#reset=TOKEN` lewat akun Gmail pengirim. Jika pengiriman gagal, tautan dicatat di log server agar admin tetap dapat memulihkan akses. Setelah reset berhasil, semua sesi pengguna tersebut dihapus."),
  h3("Sesi"),
  p("Sesi memakai token acak 256-bit pada cookie `sid` (`HttpOnly`, `SameSite=Lax`, `Secure` bila koneksi HTTPS, berlaku 7 hari). Hanya hash SHA-256 token yang disimpan di basis data. Logout dan penggantian password menghapus sesi terkait; sesi dan token kedaluwarsa dibersihkan setiap jam."),

  h2("Mode Demo"),
  p("Mode demo memudahkan percobaan dan pengembangan. Saat aktif, server memastikan dua akun contoh ada dan mengembalikan kredensialnya ke nilai bawaan setiap kali server dimulai."),
  table({
    caption: "Akun contoh mode demo",
    cols: [1.8, 2.2, 1.6, 3.4],
    head: ["Username", "Password", "Peran", "Email internal"],
    rows: [
      ["`admin`", "`admin123`", "Admin", "`admin@demo.local`"],
      ["`demo`", "`demo123`", "Pengguna", "`demo@demo.local`"],
    ],
  }),
  p("Mode ditentukan oleh `DEMO_MODE` (`1`/`0`); bila kosong, demo aktif kecuali `NODE_ENV=production`. Pada production: kartu demo tidak tampil, API selalu mengembalikan `demoAccounts` kosong, dan akun demo **dihapus dari basis data** saat server dimulai sehingga tidak menjadi celah login."),
];
