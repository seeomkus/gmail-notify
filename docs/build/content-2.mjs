import { code, fig, h1, h2, h3, note, ol, p, table, ul } from "./lib.mjs";

// =====================================================================
//  BAB 7 - 12
// =====================================================================
export const part2 = [
  // ---------------------------------------------------------------- 7
  h1("Spesifikasi API"),
  h2("Konvensi"),
  ul([
    "Basis alamat: `/api`. Format permintaan dan respons: JSON (`Content-Type: application/json`). Batas ukuran body bawaan Express: 100 KB.",
    "Autentikasi: cookie sesi `sid` (dikirim otomatis oleh browser pada origin yang sama). Semua endpoint wajib login kecuali `GET /api/health` dan seluruh `/api/auth/*` yang bersifat publik (kecuali yang dinyatakan).",
    "Format error: `{ \"error\": \"pesan untuk pengguna\" }`; respons 401 untuk sesi habis menambahkan `\"code\": \"UNAUTHENTICATED\"`.",
    "Waktu pada respons memakai ISO 8601 UTC untuk jadwal, dan `YYYY-MM-DD HH:MM:SS` UTC untuk riwayat.",
  ]),
  table({
    caption: "Kode status HTTP yang digunakan",
    cols: [1.4, 7.6],
    head: ["Kode", "Arti"],
    rows: [
      ["200 · 201", "Berhasil · berhasil dan sumber daya dibuat"],
      ["400", "Input tidak valid atau SMTP/akun belum siap (pesan menjelaskan penyebab)"],
      ["401", "Belum login atau sesi habis; login gagal; token Google ditolak"],
      ["403", "Tidak berwenang (bukan admin) atau fitur ditutup (mis. pendaftaran)"],
      ["404", "Sumber daya tidak ditemukan (template, jadwal)"],
      ["409", "Konflik: email sudah terdaftar; jadwal sedang berjalan"],
      ["429", "Terlalu banyak percobaan (pembatasan)"],
      ["500", "Pengiriman email gagal (pesan error SMTP yang sudah diterjemahkan)"],
    ],
  }),

  h2("Endpoint Autentikasi"),
  table({
    caption: "Endpoint autentikasi",
    cols: [0.9, 3.0, 1.2, 3.9],
    head: ["Metode", "Alamat", "Akses", "Keterangan"],
    rows: [
      ["GET", "`/api/auth/config`", "Publik", "Konfigurasi publik: `googleClientId`, `allowRegistration`, `needsSetup`, `demoMode`, `demoAccounts`"],
      ["GET", "`/api/auth/me`", "Login", "Pengguna yang sedang login"],
      ["POST", "`/api/auth/register`", "Publik", "Body `{name, email, password}`; membuat akun dan sesi; 201"],
      ["POST", "`/api/auth/login`", "Publik", "Body `{identifier, password}` (email atau username)"],
      ["POST", "`/api/auth/google`", "Publik", "Body `{credential}` (ID token Google); masuk atau daftar otomatis"],
      ["POST", "`/api/auth/logout`", "Publik", "Menghapus sesi dan cookie"],
      ["POST", "`/api/auth/forgot`", "Publik", "Body `{email}`; jawaban selalu sama"],
      ["POST", "`/api/auth/reset`", "Publik", "Body `{token, password}`; token sekali pakai"],
      ["PATCH", "`/api/auth/profile`", "Login", "Body `{name?}`; menandai profil sudah ditinjau"],
      ["POST", "`/api/auth/password`", "Login", "Body `{current?, password}`; `current` wajib bila sudah punya password"],
    ],
  }),
  p("Contoh login dan respons:"),
  code("http", `
POST /api/auth/login
Content-Type: application/json

{ "identifier": "admin", "password": "admin123" }

HTTP/1.1 200 OK
Set-Cookie: sid=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800

{ "user": { "id": 1, "email": "admin@demo.local", "name": "Admin Demo",
            "role": "admin", "hasPassword": true, "google": false,
            "picture": null, "username": "admin", "demo": true,
            "profileCompleted": true } }
`),

  h2("Endpoint Pengaturan"),
  table({
    caption: "Endpoint pengaturan",
    cols: [0.9, 3.1, 1.2, 3.8],
    head: ["Metode", "Alamat", "Akses", "Keterangan"],
    rows: [
      ["GET", "`/api/settings`", "Login", "Pengaturan; tidak memuat password, hanya `hasPassword`"],
      ["PUT", "`/api/settings`", "Admin", "Perbarui sebagian pengaturan. Mengubah `smtpUser` ditolak (gunakan endpoint akun)"],
      ["PUT", "`/api/settings/account`", "Admin", "Body `{smtpUser, smtpPass}`; diuji dulu, disimpan hanya bila login berhasil"],
      ["DELETE", "`/api/settings/account`", "Admin", "Menghapus email dan App Password"],
      ["POST", "`/api/settings/test`", "Admin", "Menguji login SMTP (nilai di body menimpa sementara); tidak mengirim email"],
    ],
  }),

  h2("Endpoint Template"),
  table({
    caption: "Endpoint template",
    cols: [0.9, 3.1, 1.2, 3.8],
    head: ["Metode", "Alamat", "Akses", "Keterangan"],
    rows: [
      ["GET", "`/api/templates`", "Login", "Daftar template beserta field dan contoh isi"],
      ["POST", "`/api/templates/preview`", "Login", "Body `{templateId, values}` → `{html}` dengan penerima contoh \"Budi\""],
    ],
  }),

  h2("Endpoint Pengiriman"),
  table({
    caption: "Endpoint pengiriman email",
    cols: [0.9, 2.7, 1.2, 4.2],
    head: ["Metode", "Alamat", "Akses", "Keterangan"],
    rows: [
      ["POST", "`/api/notify`", "Login", "Kirim satu email ke satu atau banyak penerima; respons `{success, messageId}`"],
      ["POST", "`/api/broadcast`", "Login", "Satu email per penerima; respons ringkasan `{total, sent, failed, results[]}`"],
    ],
  }),
  p("Contoh pengiriman notifikasi dengan template:"),
  code("http", `
POST /api/notify
Content-Type: application/json

{
  "to": "penerima@contoh.com, rekan@contoh.com",
  "cc": "", "bcc": "",
  "subject": "Pengingat: rapat besok",
  "templateId": "reminder",
  "values": {
    "title": "Jangan lupa rapat tim",
    "message": "Rapat mingguan tim.",
    "when": "Kamis, 8 Oktober 2026 · 09.00 WIB",
    "place": "Ruang Meeting Lt. 3"
  }
}

HTTP/1.1 200 OK
{ "success": true, "messageId": "<...@gmail.com>" }
`),
  p("Contoh broadcast dan respons ringkasan:"),
  code("http", `
POST /api/broadcast

{
  "recipients": "budi@contoh.com, Budi\\nsari@contoh.com, Sari",
  "subject": "Kabar terbaru untuk {{nama}}",
  "templateId": "newsletter",
  "values": { "title": "Kabar Oktober", "message": "Halo {{nama}}, ..." }
}

HTTP/1.1 200 OK
{ "total": 2, "sent": 2, "failed": 0,
  "results": [ { "email": "budi@contoh.com", "ok": true, "messageId": "<...>" },
               { "email": "sari@contoh.com", "ok": true, "messageId": "<...>" } ] }
`),

  h2("Endpoint Jadwal"),
  table({
    caption: "Endpoint jadwal",
    cols: [0.9, 3.1, 5],
    head: ["Metode", "Alamat", "Keterangan"],
    rows: [
      ["GET", "`/api/schedules`", "Daftar jadwal, terbaru lebih dulu"],
      ["POST", "`/api/schedules`", "Membuat jadwal; 201. Body: `name`, `repeat`, parameter waktu, dan `job` (isi pengiriman)"],
      ["PATCH", "`/api/schedules/:id`", "Body `{enabled}`; mengaktifkan menghitung ulang waktu berikutnya"],
      ["POST", "`/api/schedules/:id/run`", "Kirim sekarang tanpa mengubah jadwal berikutnya; 409 bila sedang berjalan"],
      ["DELETE", "`/api/schedules/:id`", "Menghapus jadwal (riwayat tidak ikut terhapus)"],
    ],
  }),
  code("json", `
{
  "name": "Newsletter mingguan",
  "repeat": "weekly",
  "timeOfDay": "08:00",
  "weekdays": [1, 3, 5],
  "job": {
    "mode": "broadcast",
    "recipients": "budi@contoh.com, Budi\\nsari@contoh.com, Sari",
    "subject": "Kabar mingguan",
    "templateId": "newsletter",
    "values": { "title": "Kabar Mingguan", "message": "Halo {{nama}}, ..." }
  }
}
`),

  h2("Endpoint Riwayat dan Kesehatan"),
  table({
    caption: "Endpoint riwayat dan kesehatan",
    cols: [0.9, 2.7, 1.2, 4.2],
    head: ["Metode", "Alamat", "Akses", "Keterangan"],
    rows: [
      ["GET", "`/api/logs`", "Login", "Query `limit` (maks. 200), `offset`, `status` (`sent`/`failed`); respons `{items, total}`"],
      ["DELETE", "`/api/logs/:id`", "Login", "Menghapus satu catatan"],
      ["DELETE", "`/api/logs`", "Login", "Menghapus seluruh catatan"],
      ["GET", "`/api/health`", "Publik", "`{status: \"ok\"}`; dipakai pemeriksaan kesehatan"],
    ],
  }),

  // ---------------------------------------------------------------- 8
  h1("Keamanan"),
  h2("Autentikasi dan Manajemen Sesi"),
  ul([
    "Password di-hash dengan **scrypt** (garam acak 16 byte, panjang kunci 64 byte) dan dibandingkan dengan `timingSafeEqual`.",
    "Token sesi dibuat dari 32 byte acak kriptografis; basis data hanya menyimpan hash SHA-256, sehingga kebocoran basis data tidak membocorkan sesi aktif.",
    "Cookie `HttpOnly` (tidak terbaca JavaScript), `SameSite=Lax` (mengurangi risiko CSRF), dan `Secure` ketika koneksi HTTPS.",
    "Penggantian dan reset password menghapus sesi lain pengguna tersebut.",
  ]),
  h2("Penyimpanan Kredensial"),
  note("warn", "App Password SMTP tersimpan sebagai teks biasa", "App Password Gmail harus dapat dibaca kembali untuk login SMTP, sehingga disimpan tanpa enkripsi pada tabel `settings` di `backend/data/app.db`. API tidak pernah mengembalikannya ke browser. Lindungi berkas basis data dengan izin sistem berkas dan backup terenkripsi. Enkripsi saat disimpan (mis. AES-GCM dengan kunci dari variabel lingkungan) tercantum pada rencana pengembangan."),
  h2("Validasi Input dan Sanitasi"),
  ul([
    "Seluruh input divalidasi di server (format email, batas panjang, enumerasi nilai, rentang angka); validasi di frontend hanya untuk kenyamanan.",
    "Pembuat template meng-*escape* semua nilai sebelum masuk ke HTML (`& < > \"`), sehingga tidak ada injeksi HTML atau skrip ke email.",
    "Tautan tombol hanya diterima bila berawalan `http://` atau `https://`; skema seperti `javascript:` dibuang.",
    "Query SQL memakai *prepared statement* (`better-sqlite3`), tidak ada penggabungan string dari input pengguna.",
    "Pratinjau email dirender pada `iframe` dengan `sandbox` kosong sehingga skrip apa pun tidak dapat berjalan.",
  ]),
  h2("Pembatasan Percobaan"),
  table({
    caption: "Pembatasan percobaan (rate limit) di memori server",
    cols: [3, 1.8, 2.2, 2],
    head: ["Aksi", "Kunci", "Batas", "Jendela"],
    rows: [
      ["Login gagal", "IP + identifier", "5 kali gagal", "15 menit"],
      ["Pendaftaran", "IP", "10 percobaan", "1 jam"],
      ["Lupa password", "IP + email", "3 permintaan", "1 jam"],
      ["Ganti password (password saat ini salah)", "ID pengguna", "5 kali gagal", "15 menit"],
    ],
  }),
  p("Penghitung disimpan di memori proses sehingga hilang saat server dimulai ulang dan tidak dibagi antar-instansi. Untuk deployment multi-instansi gunakan penyimpanan bersama (mis. Redis)."),
  h2("Perlindungan Pemulihan Akun"),
  ul([
    "Jawaban `forgot` selalu sama sehingga tidak dapat dipakai menebak email terdaftar; pengiriman tidak ditunggu agar waktu respons seragam.",
    "Token reset berlaku 30 menit, sekali pakai, hanya hash yang disimpan, dan token lama pengguna dihapus saat token baru dibuat.",
    "Tautan reset dibangun dari `APP_URL` yang dikonfigurasi, **bukan** dari header `Host` atau `Origin` permintaan, untuk mencegah *reset poisoning*.",
  ]),
  h2("Risiko yang Diketahui dan Mitigasi"),
  table({
    caption: "Risiko yang diketahui, mitigasi, dan rekomendasi",
    cols: [2.2, 2.7, 2.1, 2.0],
    head: ["Risiko", "Dampak", "Mitigasi saat ini", "Rekomendasi"],
    rows: [
      ["App Password tidak dienkripsi", "Pembaca berkas DB dapat memakai akun Gmail", "Tidak dikirim ke browser; DB di luar akses web", "Enkripsi at-rest; izin berkas ketat"],
      ["Pendaftar pertama menjadi admin", "Pihak lain dapat mengklaim admin jika server terbuka sebelum setup", "Opsi `ADMIN_EMAIL`", "Setup di jaringan tertutup atau isi `ADMIN_EMAIL`"],
      ["Email pendaftar belum diverifikasi", "Akun dengan email milik orang lain", "Pendaftaran dapat ditutup", "Verifikasi email; tutup pendaftaran"],
      ["Data bersama antar pengguna", "Pengguna melihat riwayat dan jadwal pengguna lain", "Hanya untuk tim tepercaya", "Pisahkan data per pengguna"],
      ["Tanpa token CSRF", "Serangan lintas situs pada metode mengubah data", "Cookie `SameSite=Lax`, body JSON", "Token CSRF atau pemeriksaan Origin"],
      ["Kredensial demo diketahui publik", "Akses penuh bila aktif di server publik", "Dihapus otomatis di production", "Pastikan `NODE_ENV=production`"],
      ["Rate limit di memori", "Hilang saat restart", "Cukup untuk satu instansi", "Gunakan Redis bila multi-instansi"],
    ],
  }),

  // ---------------------------------------------------------------- 9
  h1("Konfigurasi dan Deployment"),
  h2("Prasyarat"),
  ul([
    "Node.js **18 atau lebih baru** (dikembangkan dengan 22) dan npm.",
    "Akses internet keluar ke `smtp.gmail.com:465` dan, bila memakai login Google, ke layanan Google.",
    "Akun Gmail dengan **Verifikasi 2 Langkah** aktif untuk membuat App Password.",
    "Untuk Linux produksi: Nginx (reverse proxy), sertifikat TLS, dan nama domain.",
  ]),
  h2("Variabel Lingkungan"),
  p("Semua variabel bersifat opsional dan ditempatkan pada `backend/.env` (lihat `.env.example`). Setelah aplikasi berjalan, akun Gmail, Client ID Google, izin pendaftaran, dan URL aplikasi lebih mudah diubah dari halaman Pengaturan; nilai di `.env` hanya menjadi nilai awal."),
  table({
    caption: "Variabel lingkungan",
    cols: [2.4, 2.0, 4.6],
    head: ["Variabel", "Bawaan", "Fungsi"],
    rows: [
      ["PORT", "3100", "Port server"],
      ["FRONTEND_ORIGIN", "http://localhost:5180", "Origin CORS untuk mode pengembangan (Vite)"],
      ["DB_PATH", "backend/data/app.db", "Lokasi berkas SQLite"],
      ["GMAIL_USER · GMAIL_APP_PASSWORD", "(kosong)", "Nilai awal akun pengirim"],
      ["GOOGLE_CLIENT_ID", "(kosong)", "Nilai awal Client ID untuk Masuk dengan Google"],
      ["APP_URL", "(otomatis)", "URL publik untuk tautan reset password"],
      ["ADMIN_EMAIL", "(kosong)", "Email yang otomatis menjadi admin saat mendaftar"],
      ["DEMO_MODE", "(otomatis)", "`1`/`0` memaksa mode demo; kosong = aktif kecuali production"],
      ["TRUST_PROXY", "(kosong)", "`1` bila di belakang reverse proxy (cookie Secure dan IP asli)"],
      ["NODE_ENV", "(kosong)", "`production` dipasang otomatis oleh `app.sh`/`app.cmd start`"],
      ["WEB_DIST", "frontend/dist", "Folder frontend hasil build yang disajikan server"],
    ],
  }),
  h2("Instalasi dan Build"),
  ol([
    "Salin repositori ke server lalu masuk ke foldernya.",
    "Salin `backend/.env.example` menjadi `backend/.env` (opsional).",
    "Jalankan `./app.sh build --install` (Linux) atau `app.cmd build --install` (Windows). Perintah ini menjalankan `npm install` dan build backend serta frontend.",
    "Jalankan `./app.sh start`, lalu buka `http://localhost:3100` dan daftarkan akun admin pertama.",
  ]),
  note("info", "Pindah antar sistem operasi", "Modul native `better-sqlite3` berbeda untuk tiap OS. Setelah memindahkan proyek dari Windows ke Linux (atau sebaliknya), selalu jalankan `build --install` agar `node_modules` dibangun ulang."),
  h2("Menjalankan Aplikasi"),
  p("Mode produksi memakai satu proses: backend hasil build menyajikan juga frontend hasil build pada satu port. Skrip pengelola bekerja sama di Linux dan Windows karena inti logikanya ditulis dalam Node.js (`scripts/app.mjs`), dibungkus `app.sh` dan `app.cmd`."),
  table({
    caption: "Perintah pengelola aplikasi",
    cols: [2.1, 2.5, 2.4],
    head: ["Perintah", "Linux / macOS · Windows", "Keterangan"],
    rows: [
      ["build [--install]", "`./app.sh build` · `app.cmd build`", "Build backend dan frontend; `--install` menjalankan `npm install` ulang"],
      ["start", "`./app.sh start` · `app.cmd start`", "Jalan di background; build otomatis bila belum ada; menolak bila sudah jalan atau port terpakai"],
      ["stop", "`./app.sh stop` · `app.cmd stop`", "SIGTERM lalu SIGKILL (Linux); `taskkill /T /F` (Windows)"],
      ["restart [--build]", "`./app.sh restart` · `app.cmd restart`", "Stop lalu start; `--build` membangun ulang dahulu"],
      ["status", "`./app.sh status` · `app.cmd status`", "PID, URL, uptime, kondisi build; exit code 3 bila berhenti"],
      ["logs [n]", "`./app.sh logs 100` · `app.cmd logs 100`", "n baris log terakhir (bawaan 50)"],
    ],
  }),
  p("Perintah yang sama tersedia lewat `npm run build|start|stop|restart|status|logs`. PID dan waktu mulai disimpan di `.run/app.pid`, sedangkan log di `.run/app.log` (direset bila melebihi 5 MB). Saat `start`, skrip memastikan aplikasi sehat lewat `GET /api/health` sebelum melapor berhasil; jika gagal, log terakhir ditampilkan."),
  p("Untuk pengembangan, jalankan `npm run dev` di `backend/` (port 3100, `tsx watch`) dan di `frontend/` (port 5180, Vite dengan proksi `/api`). Mode demo aktif secara otomatis pada mode ini."),
  h2("Deployment di Linux"),
  fig("diagram-deploy.png", "Topologi deployment di server Linux dengan Nginx sebagai reverse proxy", 15.8),
  h3("Layanan systemd"),
  p("Agar aplikasi hidup otomatis setelah server restart, jalankan sebagai layanan systemd (setelah `build`):"),
  code("ini", `
[Unit]
Description=Gmail Notify
After=network.target

[Service]
WorkingDirectory=/opt/gmail-notify/backend
ExecStart=/usr/bin/node dist/server.js
Environment=NODE_ENV=production
Environment=TRUST_PROXY=1
User=gmailnotify
Restart=on-failure

[Install]
WantedBy=multi-user.target
`),
  h3("Reverse proxy Nginx dan HTTPS"),
  code("nginx", `
server {
  listen 80;
  server_name notify.contoh.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name notify.contoh.com;
  ssl_certificate     /etc/letsencrypt/live/notify.contoh.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/notify.contoh.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;   # broadcast besar bisa memakan waktu
  }
}
`),
  ul([
    "Isi `APP_URL=https://notify.contoh.com` dan `TRUST_PROXY=1` agar tautan reset benar dan cookie bertanda `Secure`.",
    "Buka hanya port 80 dan 443 ke publik; port 3100 cukup didengarkan di `127.0.0.1`.",
    "Pastikan firewall mengizinkan koneksi keluar ke port 465 (SMTP) dan 443. Sebagian penyedia VPS memblokir SMTP keluar; uji dengan `nc -zv smtp.gmail.com 465`.",
  ]),
  h2("Backup dan Pemulihan"),
  p("Seluruh data ada di `backend/data/` (`app.db`, serta `app.db-wal` dan `app.db-shm` saat berjalan). Gunakan pencadangan yang konsisten dengan mode WAL:"),
  code("bash", `
# cadangan konsisten saat aplikasi berjalan
sqlite3 backend/data/app.db ".backup 'backup/app-$(date +%F).db'"

# pemulihan: hentikan aplikasi, ganti berkas, jalankan lagi
./app.sh stop
cp backup/app-2026-10-08.db backend/data/app.db
rm -f backend/data/app.db-wal backend/data/app.db-shm
./app.sh start
`),
  h2("Menyiapkan App Password Gmail"),
  ol([
    "Aktifkan **Verifikasi 2 Langkah** pada akun Google yang akan dipakai mengirim.",
    "Buka halaman Sandi Aplikasi (`myaccount.google.com/apppasswords`) lalu buat sandi baru dengan nama bebas.",
    "Salin 16 karakter yang tampil (spasi tidak perlu dihapus; aplikasi menghapusnya otomatis).",
    "Masuk sebagai admin, buka **Pengaturan > Akun Gmail pengirim**, klik **Ganti akun**, isi email dan App Password, lalu **Tes & simpan akun**.",
  ]),
  note("tip", "Jika halaman Sandi Aplikasi menampilkan \"setting not available\"", "Penyebab tersering adalah Verifikasi 2 Langkah belum aktif, akun hanya memakai passkey/security key, Advanced Protection aktif, akun Workspace yang dibatasi administrator, atau akun yang baru dibuat."),
  h2("Mengaktifkan Masuk dengan Google"),
  p("Tombol Google memerlukan OAuth Client ID. Client ID diisi admin di **Pengaturan > Akses dan masuk dengan Google**; aplikasi menyediakan panduan tujuh langkah di halaman yang sama."),
  table({
    caption: "Langkah membuat OAuth Client ID Google",
    cols: [0.8, 3.2, 5],
    head: ["No.", "Langkah", "Rincian"],
    rows: [
      ["1", "Buka Google Cloud Console", "`console.cloud.google.com`, masuk dengan akun Google; gratis untuk Login dengan Google"],
      ["2", "Buat project", "Nama misalnya \"Gmail Notify\"; pastikan terpilih"],
      ["3", "Layar persetujuan OAuth", "Google Auth Platform > Get started; nama aplikasi, email dukungan, Audience *External*; scope bawaan cukup"],
      ["4", "Daftarkan Test users", "Selama status *Testing*, hanya akun terdaftar yang bisa masuk; atau Publish app"],
      ["5", "Buat OAuth Client ID", "Credentials > Create client; jenis *Web application*"],
      ["6", "Authorized JavaScript origins", "Tambahkan alamat aplikasi, mis. `http://localhost:5180` dan `http://localhost:3100`; redirect URI dikosongkan"],
      ["7", "Salin Client ID", "Berakhiran `.apps.googleusercontent.com`; client secret tidak diperlukan; tempel di Pengaturan lalu simpan"],
    ],
  }),
  note("info", "Catatan", "Perubahan di Google dapat butuh beberapa menit hingga satu jam. Error `origin_mismatch` berarti origin belum cocok persis (http/https, port). Server sungguhan wajib HTTPS dengan nama domain; alamat IP tidak diterima kecuali `localhost`."),

  // ---------------------------------------------------------------- 10
  h1("Pengujian"),
  h2("Strategi Pengujian"),
  p("Pada versi 1.0.0 pengujian dilakukan secara **manual dan terskrip ad hoc** selama pengembangan: pemeriksaan tipe (`tsc --noEmit` untuk backend, `vue-tsc` untuk frontend), build produksi (`vite build`), pemanggilan API dengan `curl`, dan pemeriksaan tampilan dengan Chrome *headless*. **Belum ada rangkaian uji otomatis** (unit atau integrasi) di repositori; hal ini dicatat sebagai keterbatasan pada Bab 12."),
  h2("Skenario Uji dan Hasil"),
  table({
    caption: "Skenario pengujian yang dijalankan dan hasilnya",
    cols: [0.8, 3.0, 3.8, 1.4],
    head: ["ID", "Area", "Skenario", "Hasil"],
    rows: [
      ["T-01", "SMTP", "Tes koneksi dengan akun valid; akun palsu ditolak dengan pesan ramah dan akun lama tidak berubah", "Lulus"],
      ["T-02", "Validasi", "Email tidak valid, judul template kosong, subjek kosong, daftar penerima kosong", "Lulus"],
      ["T-03", "Template", "Pratinjau meng-escape HTML pada input dan membuang tautan `javascript:`", "Lulus"],
      ["T-04", "Scheduler", "Jadwal `once` 20 detik: terkirim tepat waktu, tercatat di riwayat, jadwal otomatis nonaktif", "Lulus"],
      ["T-05", "Jadwal", "Validasi waktu lampau, hari kosong; pembuatan interval, harian, mingguan; jeda dan aktifkan; `once` lampau tidak bisa diaktifkan", "Lulus"],
      ["T-06", "Autentikasi", "Akses tanpa login 401; password lemah ditolak; email ganda (beda huruf besar) ditolak; sesi dibuat dan dicabut saat logout", "Lulus"],
      ["T-07", "Otorisasi", "Pengguna biasa mendapat 403 untuk mengubah pengaturan dan akun; admin berhasil", "Lulus"],
      ["T-08", "Pembatasan", "Login salah 5 kali lalu terkunci (429); pesan sesuai", "Lulus"],
      ["T-09", "Password", "Ganti password: password lama salah ditolak; berhasil mengeluarkan sesi lain", "Lulus"],
      ["T-10", "Reset", "Forgot menjawab sama untuk email terdaftar dan tidak; token palsu, lemah, dan dipakai ulang ditolak; token asli berhasil dan menghapus sesi", "Lulus"],
      ["T-11", "Google", "Tanpa Client ID: 403 \"belum diaktifkan\"; token palsu: 401 pesan ramah", "Lulus"],
      ["T-12", "Google (nyata)", "Login dengan akun Google sungguhan", "Belum diuji*"],
      ["T-13", "Mode demo", "Login `admin`/`demo` (username, huruf besar, email); production: `demoAccounts` kosong, login demo gagal, akun demo dihapus", "Lulus"],
      ["T-14", "Pengelola", "build, start, start ganda ditolak, status, restart, logs, stop, status exit code 3, perintah salah; lewat `app.sh` (Git Bash) dan `app.cmd`", "Lulus"],
      ["T-15", "UI", "Screenshot desktop, mode gelap, dan ponsel; semua halaman termuat tanpa kesalahan tampilan", "Lulus"],
      ["T-16", "Migrasi", "Kolom baru pada database lama ditambahkan otomatis tanpa kehilangan data", "Lulus"],
    ],
  }),
  p("*Membutuhkan Client ID dari akun Google Cloud milik organisasi; verifikasi token hanya diuji pada jalur penolakan."),
  h2("Cakupan yang Belum Diuji"),
  ul([
    "Login Google dengan akun sungguhan dan deployment penuh di server Linux dengan Nginx dan HTTPS.",
    "Peramban selain Chrome (Firefox, Safari) dan perangkat ponsel fisik.",
    "Beban tinggi (broadcast mendekati 200 penerima secara berulang) dan batas kuota Gmail.",
    "Tampilan email pada beragam klien email (Outlook, aplikasi seluler) dan skor *spam*.",
  ]),
  h2("Rekomendasi Pengujian Otomatis"),
  ul([
    "**Unit:** `parseEmails`, `parseRecipients`, `nextAfter`, `renderEmail`, `fillVars`, `friendlySmtpError` (Vitest).",
    "**Integrasi API:** Supertest terhadap aplikasi Express dengan basis data SQLite sementara (`DB_PATH`) dan transporter email palsu.",
    "**Uji antarmuka:** Playwright untuk alur login, kirim, jadwal, dan pengaturan.",
    "**CI:** menjalankan `tsc`, `vue-tsc`, uji, dan build pada setiap perubahan.",
  ]),

  // ---------------------------------------------------------------- 11
  h1("Operasional dan Pemeliharaan"),
  h2("Pemantauan dan Log"),
  ul([
    "Log aplikasi berada di `.run/app.log` (lewat `app.sh`) atau keluaran `journalctl -u gmail-notify` (systemd). Tampilkan dengan `./app.sh logs 100`.",
    "Pesan penting: `Scheduler aktif`, `[jadwal] #id \"nama\" -> status (ringkasan)`, `[auth] MODE DEMO aktif`, dan `[auth] gagal mengirim email reset ... Tautan reset untuk ...`.",
    "Pemeriksaan kesehatan: `GET /api/health` mengembalikan `{status: \"ok\"}`; dapat dipakai monitor eksternal.",
    "Status eksekusi setiap jadwal terlihat di halaman Jadwal, dan setiap email di Riwayat.",
  ]),
  h2("Pemecahan Masalah"),
  table({
    caption: "Gejala umum, penyebab, dan solusi",
    cols: [2.5, 3.0, 3.5],
    head: ["Gejala", "Kemungkinan penyebab", "Solusi"],
    rows: [
      ["\"Email atau App Password salah\"", "Memakai password login, bukan App Password; 2FA belum aktif; sandi dihapus di Google", "Buat App Password baru; Ganti akun di Pengaturan"],
      ["\"Tidak dapat terhubung ke server SMTP\"", "Internet putus, port 465 diblokir firewall/penyedia VPS", "`nc -zv smtp.gmail.com 465`; buka port keluar atau minta penyedia membukanya"],
      ["Halaman Sandi Aplikasi: \"setting not available\"", "2FA belum aktif, Advanced Protection, akun Workspace dibatasi", "Aktifkan 2FA; gunakan akun Gmail biasa"],
      ["Aplikasi tidak mau start: port terpakai", "Proses lain memakai port 3100", "Ubah `PORT` di `.env` atau hentikan proses itu"],
      ["Layar putih / 401 terus-menerus", "Sesi habis atau cookie diblokir", "Masuk ulang; periksa cookie dan HTTPS (`TRUST_PROXY`)"],
      ["Tombol Google: \"belum diaktifkan\"", "Client ID belum diisi", "Admin mengisi di Pengaturan > Akses"],
      ["Google: `origin_mismatch`", "Origin belum didaftarkan atau tidak cocok persis", "Tambahkan alamat tepat (http/https, port) di Google Cloud Console; tunggu beberapa menit"],
      ["Login Google gagal", "Akun bukan Test user saat status Testing; Client ID salah", "Daftarkan sebagai Test user atau Publish app; periksa Client ID"],
      ["Email reset tidak sampai", "SMTP belum dikonfigurasi atau masuk spam", "Lihat log server untuk tautan reset; cek folder spam"],
      ["Jadwal tidak terkirim", "Server mati; jadwal dijeda; SMTP gagal", "Pastikan `./app.sh status`; lihat Status terakhir pada halaman Jadwal"],
      ["Jam harian meleset", "Zona waktu server berbeda dari zona pengguna", "Samakan zona waktu server (`timedatectl`) atau sesuaikan jam jadwal"],
      ["Error pemasangan `better-sqlite3`", "Modul native tidak cocok dengan OS/Node", "`./app.sh build --install` di mesin target"],
    ],
  }),
  h2("Batas dan Kuota Gmail"),
  p("Google membatasi jumlah email dan penerima per hari untuk setiap akun, dan akun yang terdeteksi mengirim massal dapat dibatasi sementara. Untuk akun Gmail biasa, batasnya kira-kira 500 penerima per hari (cek kebijakan Google terbaru). Gunakan broadcast untuk komunikasi yang relevan dan diharapkan penerima; untuk volume besar pertimbangkan layanan email transaksional khusus."),
  h2("Pemeliharaan Rutin"),
  ul([
    "Cadangkan `backend/data/app.db` secara berkala (Bagian 9.6).",
    "Perbarui dependensi dan jalankan `npm audit`, lalu `./app.sh restart --build`.",
    "Tinjau daftar pengguna dan peran; tutup pendaftaran mandiri bila tidak diperlukan.",
    "Bersihkan riwayat lama bila basis data membesar.",
    "Buat App Password baru dan hapus yang lama bila ada kecurigaan kebocoran.",
  ]),

  // ---------------------------------------------------------------- 12
  h1("Keterbatasan dan Rencana Pengembangan"),
  h2("Keterbatasan Saat Ini"),
  ul([
    "Belum ada uji otomatis dan integrasi berkelanjutan (CI).",
    "App Password SMTP disimpan tanpa enkripsi pada basis data.",
    "Data (jadwal, riwayat, pengaturan) dibagi antar-pengguna; belum ada pemisahan per akun.",
    "Email pendaftar belum diverifikasi; belum ada autentikasi dua faktor.",
    "Satu akun Gmail pengirim; belum ada banyak pengirim atau pemilihan pengirim per pengiriman.",
    "Broadcast diproses sinkron dalam satu permintaan HTTP (maks. 200 penerima); belum ada antrean latar belakang dan progres langsung.",
    "Belum ada lampiran, tautan berhenti berlangganan (*unsubscribe*), pelacakan buka/klik, dan penanganan *bounce*.",
    "Pembatasan percobaan hanya di memori; scheduler hanya aman untuk satu instansi server.",
    "Editor template belum ada; template didefinisikan dalam kode.",
    "Antarmuka hanya berbahasa Indonesia.",
  ]),
  h2("Rencana Pengembangan"),
  table({
    caption: "Usulan rencana pengembangan",
    cols: [0.8, 3.6, 3.2, 1.4],
    head: ["No.", "Pekerjaan", "Manfaat", "Prioritas"],
    rows: [
      ["1", "Rangkaian uji otomatis (Vitest, Supertest, Playwright) dan CI", "Mencegah regresi, rilis lebih aman", "Tinggi"],
      ["2", "Enkripsi App Password at-rest (AES-GCM, kunci dari lingkungan)", "Mengurangi dampak kebocoran DB", "Tinggi"],
      ["3", "Verifikasi email pendaftar dan 2FA (TOTP)", "Akun lebih aman", "Tinggi"],
      ["4", "Pemisahan data per pengguna atau organisasi", "Privasi dan multi-tim", "Sedang"],
      ["5", "Antrean pengiriman (mis. BullMQ) dengan progres dan percobaan ulang", "Broadcast besar yang andal", "Sedang"],
      ["6", "Lampiran, tautan berhenti berlangganan, dan penanganan bounce", "Kepatuhan dan kualitas pengiriman", "Sedang"],
      ["7", "Editor template dan simpan template kustom", "Fleksibilitas konten", "Sedang"],
      ["8", "Impor penerima dari CSV dan daftar kontak/grup", "Efisiensi broadcast", "Sedang"],
      ["9", "Banyak akun pengirim dan dukungan penyedia lain (SendGrid, SES)", "Kuota dan keandalan", "Rendah"],
      ["10", "Log audit, token API, dan webhook", "Integrasi dan penelusuran", "Rendah"],
      ["11", "Berkas Docker dan skrip backup otomatis", "Deployment dan pemulihan lebih mudah", "Rendah"],
      ["12", "Dukungan multi-bahasa dan zona waktu per pengguna", "Jangkauan pengguna", "Rendah"],
    ],
  }),
];

// =====================================================================
//  DAFTAR PUSTAKA  (urut abjad, gaya mirip APA)
// =====================================================================
export const bibliography = [
  "Express. (2024). *Express - Node.js web application framework*. https://expressjs.com/ (diakses 8 Oktober 2026).",
  "Google. (2024). *Create, change, or delete an app password* (Bantuan Akun Google). https://support.google.com/accounts/answer/185833 (diakses 8 Oktober 2026).",
  "Google. (2024). *Gmail sending limits in Google Workspace*. https://support.google.com/a/answer/166852 (diakses 8 Oktober 2026).",
  "Google for Developers. (2024). *Sign in with Google for Web: Overview*. https://developers.google.com/identity/gsi/web/guides/overview (diakses 8 Oktober 2026).",
  "Google for Developers. (2024). *Verify the Google ID token on your server side*. https://developers.google.com/identity/gsi/web/guides/verify-google-id-token (diakses 8 Oktober 2026).",
  "Hardt, D. (Ed.). (2012). *RFC 6749: The OAuth 2.0 Authorization Framework*. IETF. https://datatracker.ietf.org/doc/html/rfc6749 (diakses 8 Oktober 2026).",
  "Klensin, J. (2008). *RFC 5321: Simple Mail Transfer Protocol*. IETF. https://datatracker.ietf.org/doc/html/rfc5321 (diakses 8 Oktober 2026).",
  "Barth, A. (2011). *RFC 6265: HTTP State Management Mechanism*. IETF. https://datatracker.ietf.org/doc/html/rfc6265 (diakses 8 Oktober 2026).",
  "Josefsson, S., & Percival, C. (2016). *RFC 7914: The scrypt Password-Based Key Derivation Function*. IETF. https://datatracker.ietf.org/doc/html/rfc7914 (diakses 8 Oktober 2026).",
  "Nodemailer. (2024). *Nodemailer documentation*. https://www.nodemailer.com/ (diakses 8 Oktober 2026).",
  "OpenJS Foundation. (2024). *Node.js documentation: Crypto*. https://nodejs.org/api/crypto.html (diakses 8 Oktober 2026).",
  "OWASP Foundation. (2024). *Forgot Password Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html (diakses 8 Oktober 2026).",
  "OWASP Foundation. (2024). *Password Storage Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html (diakses 8 Oktober 2026).",
  "OWASP Foundation. (2024). *Session Management Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html (diakses 8 Oktober 2026).",
  "Pictogrammers. (2024). *Material Design Icons*. https://pictogrammers.com/library/mdi/ (diakses 8 Oktober 2026).",
  "SQLite Consortium. (2024). *Write-Ahead Logging*. https://www.sqlite.org/wal.html (diakses 8 Oktober 2026).",
  "Vite. (2024). *Vite: Next generation frontend tooling*. https://vitejs.dev/ (diakses 8 Oktober 2026).",
  "Vue.js. (2024). *Vue.js - The Progressive JavaScript Framework*. https://vuejs.org/ (diakses 8 Oktober 2026).",
  "WiseLibs. (2024). *better-sqlite3: The fastest and simplest library for SQLite3 in Node.js*. https://github.com/WiseLibs/better-sqlite3 (diakses 8 Oktober 2026).",
];
