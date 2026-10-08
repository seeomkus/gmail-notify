# Gmail Notify

Contoh aplikasi untuk mengirim notifikasi email secara manual dari Gmail ke Gmail.

> **Penulis:** Kusnandar Rohim (**SeeOmKus**) · [www.seeomkus.com](https://www.seeomkus.com) · Oktober 2026

- `backend/` — Express + TypeScript + Nodemailer (SMTP Gmail)
- `frontend/` — Vue 3 + Vite + TypeScript

## 1. Siapkan App Password Gmail

1. Aktifkan **2-Step Verification** di akun Google pengirim.
2. Buka https://myaccount.google.com/apppasswords lalu buat App Password (16 karakter).

## 2. Jalankan backend

```bash
cd backend
npm install
cp .env.example .env   # isi GMAIL_USER dan GMAIL_APP_PASSWORD
npm run dev
```

## 3. Jalankan frontend

```bash
cd frontend
npm install
npm run dev
```

Buka http://localhost:5180, isi email tujuan, subjek, dan pesan, lalu klik **Kirim Notifikasi**.

## API

`POST /api/notify` — body JSON: `{ "to": "...", "subject": "...", "message": "..." }`

## Menjalankan di server (build / start / stop / restart / status)

Mode produksi memakai satu proses: backend hasil build juga menyajikan frontend, jadi cukup satu port
(`PORT` di `backend/.env`, default **3100**). Butuh Node.js 18+.

| Perintah | Linux / macOS | Windows | Keterangan |
|---|---|---|---|
| Build | `./app.sh build` | `app.cmd build` | `--install` untuk `npm install` ulang |
| Start | `./app.sh start` | `app.cmd start` | Jalan di background, build otomatis jika belum ada |
| Stop | `./app.sh stop` | `app.cmd stop` | |
| Restart | `./app.sh restart` | `app.cmd restart` | `--build` untuk build ulang dulu |
| Status | `./app.sh status` | `app.cmd status` | Exit code 3 jika berhenti |
| Log | `./app.sh logs 100` | `app.cmd logs 100` | Default 50 baris terakhir |

Semuanya juga tersedia lewat `npm run build|start|stop|restart|status|logs` di folder utama.

Catatan:
- PID dan log disimpan di folder `.run/` (`.run/app.log`).
- Setelah memindahkan proyek antar OS, jalankan `./app.sh build --install` karena modul native SQLite berbeda per platform.
- Setelah mengubah kode, jalankan `restart --build`.
- Agar otomatis hidup saat server reboot di Linux, jalankan `./app.sh start` dari systemd, atau gunakan unit berikut:

```ini
[Unit]
Description=Gmail Notify
After=network.target

[Service]
WorkingDirectory=/opt/gmail-notify/backend
ExecStart=/usr/bin/node dist/server.js
Environment=NODE_ENV=production
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Login, pendaftaran, dan lupa password

Semua halaman dan API (kecuali `/api/health` dan `/api/auth/*`) wajib login.

- **Pendaftar pertama otomatis menjadi admin** (atau akun dengan email `ADMIN_EMAIL` jika diisi). Admin mengatur akun Gmail
  pengirim, tampilan email, dan akses. Pengguna biasa dapat mengirim email, mengelola jadwal, dan mengubah profil/password.
- **Daftar & masuk manual**: nama, email, password (min. 8 karakter). Password disimpan sebagai hash scrypt, sesi memakai
  cookie `HttpOnly` selama 7 hari, dan login dibatasi 5 kali gagal per 15 menit.
- **Masuk dengan Google**: buat OAuth Client ID (Web application) di Google Cloud Console, tambahkan alamat aplikasi di
  *Authorized JavaScript origins*, lalu isi Client ID di **Pengaturan > Akses & masuk dengan Google**. Akun Google yang emailnya
  sudah terdaftar otomatis ditautkan; yang belum terdaftar dibuatkan akun baru (jika pendaftaran diizinkan).
- **Lupa password**: tautan reset (berlaku 30 menit, sekali pakai) dikirim lewat akun Gmail pengirim yang sudah dihubungkan.
  Jika pengiriman gagal, tautan dicatat di log server (`./app.sh logs`) agar admin tetap bisa memulihkan akses.
- Produksi: gunakan HTTPS dan isi `APP_URL` serta `TRUST_PROXY=1` jika di belakang Nginx.

## Mode demo (akun contoh)

Saat pengembangan (`npm run dev`), halaman login menampilkan kartu **Mode demo** berisi akun contoh:

| Username | Password | Peran |
|---|---|---|
| `admin` | `admin123` | Admin (bisa mengatur akun Gmail, Client ID Google, dan akses) |
| `demo` | `demo123` | Pengguna biasa |

- Login boleh memakai **email atau username**. Akun demo tidak dihitung sebagai pengguna sungguhan, jadi pendaftar pertama
  (non-demo) tetap otomatis menjadi admin.
- **Production**: dengan `./app.sh start` (NODE_ENV=production) kartu demo tidak tampil, API tidak pernah mengirim kredensial
  demo, dan akun demo **dihapus dari database** saat server start. Anda juga bisa memaksanya lewat `DEMO_MODE=1` / `DEMO_MODE=0`
  di `backend/.env`.

## Mengaktifkan "Masuk dengan Google"

Client ID hanya diisi admin setelah login: **Pengaturan > Akses & masuk dengan Google**. Di sana ada panduan 7 langkah
(buat project, layar persetujuan, test users, OAuth client ID, Authorized JavaScript origins, salin Client ID). Sebelum diisi,
tombol Google di halaman login tampil nonaktif dengan keterangan "Belum diaktifkan".

## Dokumentasi teknis

Dokumen teknis lengkap (arsitektur, basis data, antarmuka, API, keamanan, deployment, pengujian, operasional) tersedia dalam tiga format:

| Format | Berkas |
|---|---|
| PDF (sampul, daftar isi, riwayat revisi, daftar pustaka) | [`docs/Dokumen-Teknis-Gmail-Notify-v1.0.0.pdf`](docs/Dokumen-Teknis-Gmail-Notify-v1.0.0.pdf) |
| Word (daftar isi dapat diperbarui otomatis) | [`docs/Dokumen-Teknis-Gmail-Notify-v1.0.0.docx`](docs/Dokumen-Teknis-Gmail-Notify-v1.0.0.docx) |
| Markdown | [`docs/DOKUMEN-TEKNIS.md`](docs/DOKUMEN-TEKNIS.md) |

Ketiganya dibuat dari satu sumber isi di `docs/build/` (`content-1.mjs`, `content-2.mjs`) sehingga selalu konsisten.
Untuk memperbarui setelah mengubah isi:

```bash
cd docs/build
npm install
npm run images   # (opsional) ambil ulang diagram dan screenshot; butuh Chrome dan aplikasi mode demo berjalan
npm run docs     # bangun DOCX + Markdown, lalu Microsoft Word memperbarui daftar isi dan mengekspor PDF
```

Catatan: langkah PDF memakai otomasi Microsoft Word (Windows). Di file DOCX, daftar isi/gambar/tabel dapat diperbarui kapan saja
dengan menekan `Ctrl+A` lalu `F9`. Saat menaikkan versi, ubah `meta` dan `revisions` di `docs/build/build.mjs`.

## Penulis

| | |
|---|---|
| **Nama** | Kusnandar Rohim |
| **Nama lain** | SeeOmKus |
| **Situs web** | [www.seeomkus.com](https://www.seeomkus.com) |
| **Dibuat** | Oktober 2026 |

© 2026 Kusnandar Rohim (SeeOmKus). Seluruh hak cipta dilindungi.
