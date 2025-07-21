import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
import { askGemini } from "./gemini.js";
import {
  getAllData,
  simpanKeSheet,
  hitungSaldo,
  getBudgetData,
  setBudgetData,
} from "./sheets.js";
import {
  filterByDateRange,
  generateChart,
  filterPengeluaran,
} from "./utils.js";

// Baileys
import baileys from "@whiskeysockets/baileys";
const makeWASocket = baileys.default;
const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } =
  baileys;

import qrcode from "qrcode-terminal";
import { Boom } from "@hapi/boom";
import pino from "pino";

dotenv.config();
const app = express();
const PORT = 3000;

app.use(bodyParser.json());

// Global variable to store socket reference
let globalSock = null;

// Helper function untuk ekstrak dan parse JSON dari response Gemini
function parseGeminiResponse(response) {
  try {
    // Coba cari JSON dalam response
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error("Tidak ditemukan JSON dalam response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed;
  } catch (error) {
    console.error("❌ Error parsing Gemini response:", error.message);
    console.error("📝 Response:", response);
    throw error;
  }
}

// Helper function untuk cek budget dan kirim notifikasi
async function cekBudgetNotifikasi(kategori, jumlah, sender) {
  try {
    if (!globalSock) {
      console.log("⚠️ Socket tidak tersedia untuk notifikasi");
      return;
    }

    const budgetData = await getBudgetData();
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    // Cari budget untuk kategori ini
    const budget = budgetData.find(
      (b) =>
        b.kategori.toLowerCase() === kategori.toLowerCase() &&
        b.bulan === currentMonth
    );

    if (!budget) return; // Tidak ada budget untuk kategori ini

    // Hitung total pengeluaran kategori bulan ini
    const data = await getAllData();
    const startMonth = new Date(currentMonth + "-01");
    const endMonth = new Date(
      startMonth.getFullYear(),
      startMonth.getMonth() + 1,
      0
    );

    const monthlyData = filterByDateRange(data, startMonth, endMonth);
    const totalKategori = monthlyData
      .filter((d) => d.kategori.toLowerCase() === kategori.toLowerCase())
      .reduce((sum, d) => sum + d.jumlah, 0);

    const persentase = (totalKategori / budget.budget) * 100;

    // Kirim notifikasi berdasarkan persentase
    if (persentase >= 100) {
      const pesan = `🚨 BUDGET EXCEEDED!\n📂 Kategori: ${kategori}\n💰 Budget: Rp${budget.budget.toLocaleString()}\n📊 Sudah terpakai: Rp${totalKategori.toLocaleString()} (${persentase.toFixed(
        1
      )}%)\n⚠️ Anda sudah melampaui budget bulan ini!`;
      await globalSock.sendMessage(sender, { text: pesan });
    } else if (persentase >= 80) {
      const pesan = `⚠️ BUDGET WARNING!\n📂 Kategori: ${kategori}\n💰 Budget: Rp${budget.budget.toLocaleString()}\n📊 Sudah terpakai: Rp${totalKategori.toLocaleString()} (${persentase.toFixed(
        1
      )}%)\n🔔 Hati-hati, budget hampir habis!`;
      await globalSock.sendMessage(sender, { text: pesan });
    }
  } catch (error) {
    console.error("❌ Error cek budget:", error.message);
  }
}

// ===== ROUTE UNTUK WHATSAPP CHAT (diakses lokal dari Baileys) =====
app.post("/chat", async (req, res) => {
  try {
    const { pesan, sender } = req.body;
    if (!pesan) return res.status(400).json({ error: "Pesan kosong" });

    const today = new Date().toISOString().split("T")[0];

    // ===== FIXED: Klasifikasi pesan yang lebih akurat =====
    const klasifikasiPrompt = `
Hari ini tanggal ${today}.
Tolong klasifikasikan maksud dari pesan berikut:
"${pesan}"

Jawab hanya dengan JSON yang valid dalam format berikut:
{ "tipe": "catat" } - untuk mencatat pengeluaran/pemasukan (kata kunci: beli, bayar, dapat, gaji, pemasukan, keluar, habis)
{ "tipe": "rekap" } - untuk melihat rekap pengeluaran atau semua transaksi (kata kunci: pengeluaran, keluar, habis, rekap, total, berapa)
{ "tipe": "saldo" } - untuk melihat saldo saat ini (kata kunci: saldo, sisa, balance, uang)
{ "tipe": "chart" } - untuk melihat grafik/chart pengeluaran (kata kunci: chart, grafik, visualisasi)
{ "tipe": "budget" } - untuk set budget atau cek budget (kata kunci: budget, anggaran, limit, batas)

Contoh:
- "pengeluaran hari ini" = rekap
- "habis berapa hari ini" = rekap  
- "beli nasi 15000" = catat
- "gaji 5000000" = catat
- "saldo sekarang" = saldo
- "chart bulan ini" = chart
- "set budget makanan 500000" = budget

Jawab hanya salah satu dari lima pilihan di atas.
`;

    const hasilKlasifikasi = await askGemini(klasifikasiPrompt);
    console.log("🔍 Hasil klasifikasi:", hasilKlasifikasi);

    const klasifikasiData = parseGeminiResponse(hasilKlasifikasi);
    const { tipe } = klasifikasiData;

    // ===== CATAT TRANSAKSI =====
    if (tipe === "catat") {
      const prompt = `
Hari ini tanggal ${today}.
Ubah pesan berikut ke format JSON yang valid:
"${pesan}"

Format JSON yang harus dihasilkan:
{
  "deskripsi": "deskripsi singkat pengeluaran/pemasukan",
  "jumlah": angka_tanpa_koma,
  "kategori": "kategori seperti makanan/transport/pemasukan/dll",
  "tanggal": "YYYY-MM-DD"
}

Pastikan:
- jumlah adalah angka tanpa koma atau titik
- tanggal dalam format YYYY-MM-DD
- kategori singkat dan jelas
- deskripsi singkat dan informatif

Jawab hanya dengan JSON yang valid.
`;

      const result = await askGemini(prompt);
      console.log("📝 Hasil parsing data:", result);

      const parsed = parseGeminiResponse(result);

      // Validasi data sebelum menyimpan
      if (!parsed.deskripsi || !parsed.jumlah || !parsed.kategori) {
        return res.json({
          answer:
            "❌ Data tidak lengkap. Pastikan menyebutkan deskripsi, jumlah, dan kategori.",
        });
      }

      // Simpan ke Google Sheets
      const savedData = await simpanKeSheet(parsed);

      // Cek budget dan kirim notifikasi jika perlu
      if (parsed.kategori.toLowerCase() !== "pemasukan" && sender) {
        await cekBudgetNotifikasi(parsed.kategori, parsed.jumlah, sender);
      }

      return res.json({
        answer: `✅ Berhasil dicatat!\n📝 ${
          parsed.deskripsi
        }\n💰 Rp${parsed.jumlah.toLocaleString()}\n📂 ${parsed.kategori}\n📅 ${
          parsed.tanggal
        }`,
      });
    }

    // ===== FIXED: Route untuk rekap pengeluaran (exclude pemasukan) =====
    if (tipe === "rekap") {
      const prompt = `
Hari ini tanggal ${today}.
Tentukan apakah user ingin rekap pengeluaran saja atau semua transaksi dari pesan berikut:
"${pesan}"

Format JSON yang harus dihasilkan:
{ 
  "start": "YYYY-MM-DD", 
  "end": "YYYY-MM-DD",
  "jenis": "pengeluaran" atau "semua"
}

Jika user mengatakan "pengeluaran", "keluar", "habis", "beli", "bayar" = gunakan "pengeluaran"
Jika user mengatakan "transaksi", "rekap semua", "total semua" = gunakan "semua"
Jika tidak jelas, defaultkan ke "pengeluaran"

Jika hanya disebutkan satu tanggal, gunakan tanggal yang sama untuk start dan end.
Jika disebutkan "hari ini", gunakan tanggal ${today}.
Jika disebutkan "kemarin", gunakan tanggal kemarin.
Jika disebutkan "minggu ini", gunakan tanggal awal minggu sampai hari ini.
Jika disebutkan "bulan ini", gunakan tanggal 1 bulan ini sampai hari ini.

Jawab hanya dengan JSON yang valid.
`;

      const result = await askGemini(prompt);
      console.log("📊 Hasil parsing rekap:", result);

      const parsed = parseGeminiResponse(result);
      const { start, end, jenis } = parsed;

      const data = await getAllData();
      const filtered = filterByDateRange(data, new Date(start), new Date(end));

      let finalData, totalAmount, responseText;

      if (jenis === "semua") {
        // Rekap semua transaksi
        finalData = filtered;
        totalAmount = filtered.reduce((sum, item) => sum + item.jumlah, 0);
        responseText = `📊 Rekap Semua Transaksi ${start} s/d ${end}:\n💰 Total: Rp${totalAmount.toLocaleString()}\n📈 ${
          filtered.length
        } transaksi`;
      } else {
        // Default: Rekap pengeluaran saja (exclude pemasukan)
        finalData = filtered.filter(
          (item) => item.kategori.toLowerCase() !== "pemasukan"
        );
        totalAmount = finalData.reduce((sum, item) => sum + item.jumlah, 0);
        responseText = `📊 Rekap Pengeluaran ${start} s/d ${end}:\n💰 Total: Rp${totalAmount.toLocaleString()}\n📉 ${
          finalData.length
        } transaksi pengeluaran`;
      }

      // Tambahkan breakdown per kategori jika ada data
      if (finalData.length > 0) {
        const kategoriMap = {};
        finalData.forEach((item) => {
          kategoriMap[item.kategori] =
            (kategoriMap[item.kategori] || 0) + item.jumlah;
        });

        const sortedKategori = Object.entries(kategoriMap).sort(
          ([, a], [, b]) => b - a
        );

        if (sortedKategori.length > 1) {
          responseText += "\n\n📂 Breakdown per kategori:";
          sortedKategori.forEach(([kategori, jumlah]) => {
            responseText += `\n• ${kategori}: Rp${jumlah.toLocaleString()}`;
          });
        }
      }

      return res.json({
        answer: responseText,
      });
    }

    // ===== SALDO =====
    if (tipe === "saldo") {
      const { totalPemasukan, totalPengeluaran, saldo } = await hitungSaldo();
      return res.json({
        answer: `💰 Saldo saat ini: Rp${saldo.toLocaleString()}\n\n📈 Pemasukan: Rp${totalPemasukan.toLocaleString()}\n📉 Pengeluaran: Rp${totalPengeluaran.toLocaleString()}`,
      });
    }

    // ===== CHART =====
    if (tipe === "chart") {
      const prompt = `
Hari ini tanggal ${today}.
Tentukan periode untuk chart dari pesan berikut:
"${pesan}"

Format JSON yang harus dihasilkan:
{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }

Jika tidak disebutkan periode, gunakan bulan ini (dari tanggal 1 sampai hari ini).
Jika disebutkan "minggu ini", gunakan tanggal awal minggu sampai hari ini.
Jika disebutkan "bulan lalu", gunakan bulan sebelumnya.

Jawab hanya dengan JSON yang valid.
`;

      const result = await askGemini(prompt);
      const parsed = parseGeminiResponse(result);
      const { start, end } = parsed;

      const data = await getAllData();
      const filtered = filterByDateRange(data, new Date(start), new Date(end));

      const chartData = generateChart(filtered);

      return res.json({
        answer: `📊 Chart Pengeluaran ${start} s/d ${end}:\n\n${chartData}`,
      });
    }

    // ===== BUDGET =====
    if (tipe === "budget") {
      const setBudgetPrompt = `
Tentukan apakah pesan berikut adalah untuk set budget atau cek budget:
"${pesan}"

Jawab dengan JSON:
{ "aksi": "set" } - untuk set budget baru
{ "aksi": "cek" } - untuk cek budget yang sudah ada

Jawab hanya dengan JSON yang valid.
`;

      const budgetResult = await askGemini(setBudgetPrompt);
      const budgetParsed = parseGeminiResponse(budgetResult);

      if (budgetParsed.aksi === "set") {
        const prompt = `
Hari ini tanggal ${today}.
Ekstrak informasi budget dari pesan berikut:
"${pesan}"

Format JSON yang harus dihasilkan:
{
  "kategori": "nama kategori",
  "budget": angka_budget,
  "bulan": "YYYY-MM"
}

Jika tidak disebutkan bulan, gunakan bulan ini: ${today.slice(0, 7)}
Kategori harus sama dengan kategori yang biasa digunakan (makanan, transport, dll).

Jawab hanya dengan JSON yang valid.
`;

        const result = await askGemini(prompt);
        const parsed = parseGeminiResponse(result);

        if (!parsed.kategori || !parsed.budget) {
          return res.json({
            answer:
              "❌ Data budget tidak lengkap. Pastikan menyebutkan kategori dan jumlah budget.",
          });
        }

        await setBudgetData(parsed);

        return res.json({
          answer: `✅ Budget berhasil diset!\n📂 Kategori: ${
            parsed.kategori
          }\n💰 Budget: Rp${parsed.budget.toLocaleString()}\n📅 Bulan: ${
            parsed.bulan
          }`,
        });
      } else {
        // Cek budget
        const budgetData = await getBudgetData();
        const currentMonth = new Date().toISOString().slice(0, 7);

        const currentBudgets = budgetData.filter(
          (b) => b.bulan === currentMonth
        );

        if (currentBudgets.length === 0) {
          return res.json({
            answer:
              "📊 Belum ada budget yang diset untuk bulan ini.\n💡 Ketik 'set budget [kategori] [jumlah]' untuk membuat budget.",
          });
        }

        // Hitung usage untuk setiap budget
        const data = await getAllData();
        const startMonth = new Date(currentMonth + "-01");
        const endMonth = new Date(
          startMonth.getFullYear(),
          startMonth.getMonth() + 1,
          0
        );
        const monthlyData = filterByDateRange(data, startMonth, endMonth);

        let budgetReport = `📊 Budget Report ${currentMonth}:\n\n`;

        for (const budget of currentBudgets) {
          const totalKategori = monthlyData
            .filter(
              (d) => d.kategori.toLowerCase() === budget.kategori.toLowerCase()
            )
            .reduce((sum, d) => sum + d.jumlah, 0);

          const persentase = (totalKategori / budget.budget) * 100;
          const sisa = budget.budget - totalKategori;

          const status =
            persentase >= 100 ? "🚨" : persentase >= 80 ? "⚠️" : "✅";

          budgetReport += `${status} ${budget.kategori}:\n`;
          budgetReport += `💰 Budget: Rp${budget.budget.toLocaleString()}\n`;
          budgetReport += `📊 Terpakai: Rp${totalKategori.toLocaleString()} (${persentase.toFixed(
            1
          )}%)\n`;
          budgetReport += `💵 Sisa: Rp${sisa.toLocaleString()}\n\n`;
        }

        return res.json({
          answer: budgetReport,
        });
      }
    }

    return res.json({
      answer:
        "❌ Perintah tidak dikenali. Coba lagi dengan format yang lebih jelas.",
    });
  } catch (error) {
    console.error("❌ Error dalam /chat:", error.message);
    return res.json({
      answer: "❌ Terjadi kesalahan saat memproses pesan. Silakan coba lagi.",
    });
  }
});

// ===== SERVER EXPRESS START =====
app.listen(PORT, () => {
  console.log(`🚀 Server jalan di http://localhost:${PORT}`);
});

// ===== BAILEYS START =====
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
  });

  // Store socket reference globally
  globalSock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("Scan QR code untuk login WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log("⛔ Disconnected:", lastDisconnect?.error);
      globalSock = null; // Clear socket reference
      if (shouldReconnect) {
        console.log("🔁 Reconnecting...");
        startBot();
      }
    } else if (connection === "open") {
      console.log("✅ WhatsApp bot online!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption;

    if (!text) return;

    console.log(`📩 ${sender}: ${text}`);

    try {
      const res = await axios.post(
        "http://localhost:3000/chat",
        { pesan: text, sender },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000, // 30 detik timeout
        }
      );

      const reply = res.data.answer || "🤖 Tidak ada jawaban.";
      await sock.sendMessage(sender, { text: reply });
      console.log(`✅ Balasan: ${reply}`);
    } catch (err) {
      console.error("❌ Error saat memproses pesan:", err.message);
      await sock.sendMessage(sender, {
        text: "❌ Terjadi kesalahan saat memproses pesan. Silakan coba lagi.",
      });
    }
  });
}

startBot();
