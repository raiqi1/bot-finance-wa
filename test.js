import { askDeepSeek } from "./deepseek.js";

// Test cases untuk memastikan DeepSeek berfungsi dengan baik
async function testDeepSeek() {
  console.log("🧪 Testing DeepSeek AI Integration...\n");

  // Test 1: Klasifikasi pesan
  console.log("📝 Test 1: Klasifikasi Pesan");
  const today = new Date().toISOString().split("T")[0];
  const klasifikasiPrompt = `
Hari ini tanggal ${today}.
Tolong klasifikasikan maksud dari pesan berikut:
"Beli nasi padang 25000"

Jawab hanya dengan JSON yang valid dalam format berikut:
{ "tipe": "catat" } - untuk mencatat pengeluaran/pemasukan
{ "tipe": "rekap" } - untuk melihat rekap dalam periode tertentu
{ "tipe": "saldo" } - untuk melihat saldo saat ini
{ "tipe": "chart" } - untuk melihat grafik/chart pengeluaran
{ "tipe": "budget" } - untuk set budget atau cek budget

Jawab hanya salah satu dari lima pilihan di atas.
`;

  try {
    const result1 = await askDeepSeek(klasifikasiPrompt);
    console.log("✅ Hasil klasifikasi:", result1);

    // Test parsing JSON
    const parsed1 = JSON.parse(result1.match(/\{[\s\S]*?\}/)?.[0] || "{}");
    console.log("📋 Parsed JSON:", parsed1);
    console.log("🎯 Tipe:", parsed1.tipe);
  } catch (error) {
    console.error("❌ Test 1 gagal:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 2: Parsing data pengeluaran
  console.log("📝 Test 2: Parsing Data Pengeluaran");
  const parsingPrompt = `
Hari ini tanggal ${today}.
Ubah pesan berikut ke format JSON yang valid:
"Beli nasi padang 25000"

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

  try {
    const result2 = await askDeepSeek(parsingPrompt);
    console.log("✅ Hasil parsing:", result2);

    // Test parsing JSON
    const parsed2 = JSON.parse(result2.match(/\{[\s\S]*?\}/)?.[0] || "{}");
    console.log("📋 Parsed JSON:", parsed2);

    // Validasi struktur
    const requiredFields = ["deskripsi", "jumlah", "kategori", "tanggal"];
    const hasAllFields = requiredFields.every(
      (field) => parsed2[field] !== undefined
    );
    console.log("✅ Struktur lengkap:", hasAllFields);
  } catch (error) {
    console.error("❌ Test 2 gagal:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 3: Parsing rekap periode
  console.log("📝 Test 3: Parsing Rekap Periode");
  const rekapPrompt = `
Hari ini tanggal ${today}.
Ubah pertanyaan berikut ke JSON yang valid:
"Rekap pengeluaran bulan ini"

Format JSON yang harus dihasilkan:
{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }

Jika hanya disebutkan satu tanggal, gunakan tanggal yang sama untuk start dan end.
Jika disebutkan "hari ini", gunakan tanggal ${today}.
Jika disebutkan "kemarin", gunakan tanggal kemarin.
Jika disebutkan "minggu ini", gunakan tanggal awal minggu sampai hari ini.
Jika disebutkan "bulan ini", gunakan tanggal 1 bulan ini sampai hari ini.

Jawab hanya dengan JSON yang valid.
`;

  try {
    const result3 = await askDeepSeek(rekapPrompt);
    console.log("✅ Hasil rekap:", result3);

    // Test parsing JSON
    const parsed3 = JSON.parse(result3.match(/\{[\s\S]*?\}/)?.[0] || "{}");
    console.log("📋 Parsed JSON:", parsed3);
    console.log("📅 Periode:", `${parsed3.start} s/d ${parsed3.end}`);
  } catch (error) {
    console.error("❌ Test 3 gagal:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 4: Budget parsing
  console.log("📝 Test 4: Budget Parsing");
  const budgetPrompt = `
Hari ini tanggal ${today}.
Ekstrak informasi budget dari pesan berikut:
"Set budget makanan 500000"

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

  try {
    const result4 = await askDeepSeek(budgetPrompt);
    console.log("✅ Hasil budget:", result4);

    // Test parsing JSON
    const parsed4 = JSON.parse(result4.match(/\{[\s\S]*?\}/)?.[0] || "{}");
    console.log("📋 Parsed JSON:", parsed4);

    // Validasi struktur budget
    const budgetFields = ["kategori", "budget", "bulan"];
    const hasAllBudgetFields = budgetFields.every(
      (field) => parsed4[field] !== undefined
    );
    console.log("✅ Struktur budget lengkap:", hasAllBudgetFields);
  } catch (error) {
    console.error("❌ Test 4 gagal:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");
  console.log("🎉 Testing DeepSeek selesai!");
}

// Jalankan test
testDeepSeek().catch(console.error);
