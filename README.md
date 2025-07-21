# 📊 Bot Finance WhatsApp

Bot otomatis untuk mencatat pengeluaran melalui WhatsApp dan menyimpannya ke Google Sheets. Support integrasi AI (Deepseek via OpenRouter) buat parsing atau pengolahan pesan lanjutan.

---

## 🚀 Fitur

- Simpan data pengeluaran lewat pesan WhatsApp
- Terhubung langsung ke Google Sheets
- Optional: integrasi AI (Deepseek via OpenRouter) buat pemrosesan teks cerdas

---

## 🛠️ Cara Setup & Instalasi

### ✅ 1. Clone Repositori

```bash
git clone https://github.com/raiqi1/bot-finance-wa.git
cd bot-finance-wa
```

### 📦 2. Install Dependency

```bash
npm install
```

### 🔐 3. Tambahkan File `credentials.json`

Untuk koneksi dengan Google Sheets, kamu perlu file `credentials.json`. Berikut langkah membuatnya:

#### Cara Buat `credentials.json`:
1. Kunjungi [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru atau pilih project yang sudah ada
3. Aktifkan **Google Sheets API** dan **Google Drive API**
4. Pergi ke **APIs & Services > Credentials**
5. Klik **Create Credentials > Service Account**
6. Setelah dibuat, masuk ke service account tersebut dan buat **JSON key**
7. Simpan file JSON tersebut sebagai `credentials.json` di root folder project

### 📁 Struktur Folder Setelah Tambah File

```
bot-finance-wa/
├── credentials.json
├── .env
├── index.js
└── ...
```

### ⚙️ 4. Konfigurasi Environment Variables

Buat file `.env` di root project, lalu tambahkan konfigurasi berikut:

```env
SPREADSHEET_ID=
PORT=3000
OPENROUTER_API_KEY=
```

Ganti `SPREADSHEET_ID` dengan ID Google Sheets yang digunakan.

### ▶️ 5. Jalankan Aplikasi

```bash
node index.js
```

---

## 💬 Catatan

- Pastikan akun service (`client_email` dari `credentials.json`) sudah diberikan akses edit ke Google Sheets kamu.
- Untuk integrasi AI (Deepseek via OpenRouter), pastikan API Key valid dan aktif.

---

## 🧠 Lisensi

Proyek ini berada di bawah lisensi MIT.
