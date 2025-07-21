function getYesterday(today) {
  const date = new Date(today);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
}

export const PROMPTS = {
  klasifikasi: (pesan, today, userName) => `
Kamu adalah FinBot, asisten keuangan yang ramah untuk ${userName}. Hari ini tanggal ${today}.

Analisis pesan berikut dan tentukan tipenya:
"${pesan}"

Klasifikasi:
- "catat" = mencatat pengeluaran/pemasukan
- "rekap" = minta rekap/laporan  
- "saldo" = cek saldo/kondisi keuangan
- "advice" = minta saran keuangan
- "kategori" = tanya tentang kategori pengeluaran
- "profile" = update profil/nama user
- "chat" = ngobrol biasa/salam

Contoh:
- "beli kopi 15rb" → catat
- "rekap minggu ini" → rekap  
- "saldo berapa?" → saldo
- "gimana cara hemat?" → advice
- "nama saya Budi" → profile
- "halo" → chat

Jawab JSON: { "tipe": "...", "confidence": 0.8 }
`,

  ekstrakData: (pesan, today, userName) => `
Hai ${userName}! Ekstrak data keuangan dari: "${pesan}"

Aturan:
- Angka positif = pengeluaran, jika ada kata "masuk/gaji/bonus" = pemasukan
- Kategori: makanan, transport, belanja, hiburan, tagihan, kesehatan, gaji, bonus, lainnya
- Tanggal default hari ini jika tidak disebutkan
- Deskripsi singkat dan jelas

Format JSON:
{
  "deskripsi": "...",
  "jumlah": ..., 
  "kategori": "...",
  "tanggal": "YYYY-MM-DD",
  "jenis": "pemasukan/pengeluaran"
}
`,

  ekstrakTanggal: (pesan, today) => `
Hari ini ${today}. Ekstrak rentang tanggal dari: "${pesan}"

Interpretasi:
- "hari ini" = ${today} s/d ${today}
- "kemarin" = ${getYesterday(today)} s/d ${getYesterday(today)}
- "minggu ini" = Senin s/d Minggu minggu ini
- "bulan ini" = tanggal 1 s/d akhir bulan ini
- "minggu lalu" = Senin s/d Minggu minggu lalu

Format JSON: { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }
`,

  saranKeuangan: (data, context, userName) => `
Kamu adalah advisor keuangan untuk ${userName}. Berikan saran berdasarkan:

Data: Pemasukan Rp${data.totalPemasukan}, Pengeluaran Rp${data.totalPengeluaran}, Saldo Rp${data.saldo}
Top kategori: ${data.topKategori}
Permintaan: "${context}"

Berikan saran yang:
- Praktis dan personal untuk ${userName}
- Sesuai kondisi keuangan
- Motivasi dan supportif  
- Bahasa ramah, maksimal 3 poin
- Gunakan emoji yang sesuai
`,

  ekstrakProfile: (pesan) => `
Ekstrak informasi profil dari: "${pesan}"

Cari:
- Nama (setelah kata "nama saya", "saya", "panggil saya")
- Perubahan nama

Format JSON: { "name": "...", "action": "update_name" }
`,
};
