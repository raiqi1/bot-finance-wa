// ===== MAIN.JS - Updated untuk Multi-User =====
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
import { askDeepSeek } from "./deepseek.js";
import {
  getAllData,
  simpanKeSheet,
  hitungSaldo,
  getBudgetData,
  setBudgetData,
  getUserInfo,
  registerUser,
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

// ===== MULTI-USER HELPER FUNCTIONS =====
function getUserId(sender) {
  // Ekstrak user ID dari WhatsApp JID
  return sender.split("@")[0];
}

function isValidUser(userId) {
  // Implementasi validasi user (bisa dari database atau whitelist)
  // Untuk demo, kita terima semua user yang terdaftar
  return true;
}

// Helper function untuk ekstrak dan parse JSON dari response DeepSeek
function parseDeepSeekResponse(response) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error("Tidak ditemukan JSON dalam response");
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed;
  } catch (error) {
    console.error("❌ Error parsing DeepSeek response:", error.message);
    throw error;
  }
}

// Helper function untuk cek budget dan kirim notifikasi (per user)
async function cekBudgetNotifikasi(userId, kategori, jumlah, sender) {
  try {
    if (!globalSock) {
      console.log("⚠️ Socket tidak tersedia untuk notifikasi");
      return;
    }

    const budgetData = await getBudgetData(userId);
    const currentMonth = new Date().toISOString().slice(0, 7);

    const budget = budgetData.find(
      (b) =>
        b.kategori.toLowerCase() === kategori.toLowerCase() &&
        b.bulan === currentMonth
    );

    if (!budget) return;

    const data = await getAllData(userId);
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

// ===== ROUTE UNTUK WHATSAPP CHAT (Multi-User) =====
app.post("/chat", async (req, res) => {
  try {
    const { pesan, sender } = req.body;
    if (!pesan) return res.status(400).json({ error: "Pesan kosong" });

    // Dapatkan user ID dari sender
    const userId = getUserId(sender);

    // Cek apakah user sudah terdaftar
    let userInfo = await getUserInfo(userId);
    if (!userInfo) {
      // Auto-register user baru
      await registerUser(userId, sender);
      userInfo = await getUserInfo(userId);

      const welcomeMessage = `🎉 Selamat datang di Finance Bot!\n\n👤 User ID: ${userId}\n📱 Nomor: ${sender}\n\n💡 Anda sudah terdaftar dan bisa mulai mencatat keuangan.\n\nContoh perintah:\n• "beli nasi 15000" - catat pengeluaran\n• "gaji 5000000" - catat pemasukan\n• "saldo" - lihat saldo\n• "pengeluaran hari ini" - lihat rekap\n• "set budget makanan 500000" - set budget`;

      return res.json({ answer: welcomeMessage });
    }

    const today = new Date().toISOString().split("T")[0];

    // Klasifikasi pesan
    const klasifikasiPrompt = `
Hari ini tanggal ${today}.
Tolong klasifikasikan maksud dari pesan berikut:
"${pesan}"

Jawab hanya dengan JSON yang valid dalam format berikut:
{ "tipe": "catat" } - untuk mencatat pengeluaran/pemasukan
{ "tipe": "rekap" } - untuk melihat rekap pengeluaran atau semua transaksi
{ "tipe": "saldo" } - untuk melihat saldo saat ini
{ "tipe": "chart" } - untuk melihat grafik/chart pengeluaran
{ "tipe": "budget" } - untuk set budget atau cek budget
{ "tipe": "help" } - untuk bantuan atau info perintah
`;

    const hasilKlasifikasi = await askDeepSeek(klasifikasiPrompt);
    const klasifikasiData = parseDeepSeekResponse(hasilKlasifikasi);
    const { tipe } = klasifikasiData;

    // ===== CATAT TRANSAKSI (per user) =====
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

Jawab hanya dengan JSON yang valid.
`;

      const result = await askDeepSeek(prompt);
      const parsed = parseDeepSeekResponse(result);

      if (!parsed.deskripsi || !parsed.jumlah || !parsed.kategori) {
        return res.json({
          answer:
            "❌ Data tidak lengkap. Pastikan menyebutkan deskripsi, jumlah, dan kategori.",
        });
      }

      // Simpan ke Google Sheets dengan user ID
      const savedData = await simpanKeSheet(userId, parsed);

      // Cek budget dan kirim notifikasi jika perlu
      if (parsed.kategori.toLowerCase() !== "pemasukan" && sender) {
        await cekBudgetNotifikasi(
          userId,
          parsed.kategori,
          parsed.jumlah,
          sender
        );
      }

      return res.json({
        answer: `✅ Berhasil dicatat!\n👤 User: ${userId}\n📝 ${
          parsed.deskripsi
        }\n💰 Rp${parsed.jumlah.toLocaleString()}\n📂 ${parsed.kategori}\n📅 ${
          parsed.tanggal
        }`,
      });
    }

    // ===== REKAP (per user) =====
    if (tipe === "rekap") {
      const prompt = `
Hari ini tanggal ${today}.
Tentukan periode dan jenis rekap dari pesan berikut:
"${pesan}"

Format JSON yang harus dihasilkan:
{ 
  "start": "YYYY-MM-DD", 
  "end": "YYYY-MM-DD",
  "jenis": "pengeluaran" atau "semua"
}
`;

      const result = await askDeepSeek(prompt);
      const parsed = parseDeepSeekResponse(result);
      const { start, end, jenis } = parsed;

      // Ambil data khusus user ini
      const data = await getAllData(userId);
      const filtered = filterByDateRange(data, new Date(start), new Date(end));

      let finalData, totalAmount, responseText;

      if (jenis === "semua") {
        finalData = filtered;
        totalAmount = filtered.reduce((sum, item) => sum + item.jumlah, 0);
        responseText = `📊 Rekap Semua Transaksi ${start} s/d ${end}:\n👤 User: ${userId}\n💰 Total: Rp${totalAmount.toLocaleString()}\n📈 ${
          filtered.length
        } transaksi`;
      } else {
        finalData = filtered.filter(
          (item) => item.kategori.toLowerCase() !== "pemasukan"
        );
        totalAmount = finalData.reduce((sum, item) => sum + item.jumlah, 0);
        responseText = `📊 Rekap Pengeluaran ${start} s/d ${end}:\n👤 User: ${userId}\n💰 Total: Rp${totalAmount.toLocaleString()}\n📉 ${
          finalData.length
        } transaksi pengeluaran`;
      }

      // Tambahkan breakdown per kategori
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

      return res.json({ answer: responseText });
    }

    // ===== SALDO (per user) =====
    if (tipe === "saldo") {
      const { totalPemasukan, totalPengeluaran, saldo } = await hitungSaldo(
        userId
      );
      return res.json({
        answer: `💰 Saldo ${userId}:\n💰 Rp${saldo.toLocaleString()}\n\n📈 Pemasukan: Rp${totalPemasukan.toLocaleString()}\n📉 Pengeluaran: Rp${totalPengeluaran.toLocaleString()}`,
      });
    }

    // ===== CHART (per user) =====
    if (tipe === "chart") {
      const prompt = `
Hari ini tanggal ${today}.
Tentukan periode untuk chart dari pesan berikut:
"${pesan}"

Format JSON: { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }
`;

      const result = await askDeepSeek(prompt);
      const parsed = parseDeepSeekResponse(result);
      const { start, end } = parsed;

      const data = await getAllData(userId);
      const filtered = filterByDateRange(data, new Date(start), new Date(end));
      const chartData = generateChart(filtered);

      return res.json({
        answer: `📊 Chart Pengeluaran ${userId} (${start} s/d ${end}):\n\n${chartData}`,
      });
    }

    // ===== BUDGET (per user) =====
    if (tipe === "budget") {
      const setBudgetPrompt = `
Tentukan apakah pesan berikut untuk set budget atau cek budget:
"${pesan}"

Jawab dengan JSON: { "aksi": "set" } atau { "aksi": "cek" }
`;

      const budgetResult = await askDeepSeek(setBudgetPrompt);
      const budgetParsed = parseDeepSeekResponse(budgetResult);

      if (budgetParsed.aksi === "set") {
        const prompt = `
Hari ini tanggal ${today}.
Ekstrak informasi budget dari pesan berikut:
"${pesan}"

Format JSON: { "kategori": "nama kategori", "budget": angka_budget, "bulan": "YYYY-MM" }
`;

        const result = await askDeepSeek(prompt);
        const parsed = parseDeepSeekResponse(result);

        if (!parsed.kategori || !parsed.budget) {
          return res.json({
            answer:
              "❌ Data budget tidak lengkap. Pastikan menyebutkan kategori dan jumlah budget.",
          });
        }

        await setBudgetData(userId, parsed);

        return res.json({
          answer: `✅ Budget berhasil diset!\n👤 User: ${userId}\n📂 Kategori: ${
            parsed.kategori
          }\n💰 Budget: Rp${parsed.budget.toLocaleString()}\n📅 Bulan: ${
            parsed.bulan
          }`,
        });
      } else {
        // Cek budget
        const budgetData = await getBudgetData(userId);
        const currentMonth = new Date().toISOString().slice(0, 7);
        const currentBudgets = budgetData.filter(
          (b) => b.bulan === currentMonth
        );

        if (currentBudgets.length === 0) {
          return res.json({
            answer: `📊 Belum ada budget untuk ${userId} bulan ini.\n💡 Ketik 'set budget [kategori] [jumlah]' untuk membuat budget.`,
          });
        }

        const data = await getAllData(userId);
        const startMonth = new Date(currentMonth + "-01");
        const endMonth = new Date(
          startMonth.getFullYear(),
          startMonth.getMonth() + 1,
          0
        );
        const monthlyData = filterByDateRange(data, startMonth, endMonth);

        let budgetReport = `📊 Budget Report ${userId} (${currentMonth}):\n\n`;

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

        return res.json({ answer: budgetReport });
      }
    }

    // ===== HELP =====
    if (tipe === "help") {
      const helpMessage = `🤖 Finance Bot Help\n👤 User: ${userId}\n\n📝 Perintah yang tersedia:\n\n💰 TRANSAKSI:\n• "beli nasi 15000" - catat pengeluaran\n• "gaji 5000000" - catat pemasukan\n• "transport 25000" - catat pengeluaran\n\n📊 LAPORAN:\n• "saldo" - lihat saldo saat ini\n• "pengeluaran hari ini" - rekap pengeluaran\n• "rekap minggu ini" - rekap semua transaksi\n• "chart bulan ini" - grafik pengeluaran\n\n💰 BUDGET:\n• "set budget makanan 500000" - set budget\n• "budget" - cek semua budget\n\n💡 Tips: Gunakan bahasa natural, bot akan memahami maksud Anda!`;

      return res.json({ answer: helpMessage });
    }

    return res.json({
      answer: `❌ Perintah tidak dikenali untuk user ${userId}.\n💡 Ketik 'help' untuk melihat daftar perintah.`,
    });
  } catch (error) {
    console.error("❌ Error dalam /chat:", error.message);
    return res.json({
      answer: "❌ Terjadi kesalahan saat memproses pesan. Silakan coba lagi.",
    });
  }
});

// ===== ADMIN ROUTES =====
app.get("/admin/users", async (req, res) => {
  try {
    // Implementasi untuk melihat daftar user terdaftar
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/admin/user/:userId/data", async (req, res) => {
  try {
    const { userId } = req.params;
    const data = await getAllData(userId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== SERVER START =====
app.listen(PORT, () => {
  console.log(`🚀 Multi-User Finance Bot running on http://localhost:${PORT}`);
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
      globalSock = null;
      if (shouldReconnect) {
        console.log("🔁 Reconnecting...");
        startBot();
      }
    } else if (connection === "open") {
      console.log("✅ Multi-User WhatsApp Finance Bot online!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const userId = getUserId(sender);
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption;

    if (!text) return;

    console.log(`📩 ${userId} (${sender}): ${text}`);

    try {
      const res = await axios.post(
        "http://localhost:3000/chat",
        { pesan: text, sender },
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
      );

      const reply = res.data.answer || "🤖 Tidak ada jawaban.";
      await sock.sendMessage(sender, { text: reply });
      console.log(`✅ Balasan ke ${userId}: ${reply}`);
    } catch (err) {
      console.error("❌ Error saat memproses pesan:", err.message);
      await sock.sendMessage(sender, {
        text: "❌ Terjadi kesalahan saat memproses pesan. Silakan coba lagi.",
      });
    }
  });
}

startBot();
