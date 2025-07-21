// ===== UTILS.JS - Updated & Fixed =====
export function filterByDateRange(data, startDate, endDate) {
  return data.filter((item) => {
    if (!item.tanggal) return false;

    // Handle tanggal dengan prefix ' (dari Google Sheets)
    let tanggalClean = item.tanggal.toString().replace(/^'/, "");

    const tgl = new Date(tanggalClean);
    if (isNaN(tgl)) return false;

    // Set time to beginning of day for proper comparison
    const itemDate = new Date(tgl.getFullYear(), tgl.getMonth(), tgl.getDate());
    const startDateOnly = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
    );
    const endDateOnly = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate()
    );

    return itemDate >= startDateOnly && itemDate <= endDateOnly;
  });
}

export function generateChart(data) {
  if (!data.length) return "📊 Tidak ada data untuk periode ini.";

  // Group by kategori (EXCLUDE pemasukan)
  const kategoriMap = {};
  data.forEach((item) => {
    if (item.kategori.toLowerCase() !== "pemasukan") {
      kategoriMap[item.kategori] =
        (kategoriMap[item.kategori] || 0) + item.jumlah;
    }
  });

  // Sort by jumlah (descending)
  const sortedKategori = Object.entries(kategoriMap).sort(
    ([, a], [, b]) => b - a
  );

  if (sortedKategori.length === 0)
    return "📊 Tidak ada pengeluaran untuk periode ini.";

  const total = sortedKategori.reduce((sum, [, amount]) => sum + amount, 0);

  let chart = "📊 CHART PENGELUARAN:\n\n";

  sortedKategori.forEach(([kategori, jumlah]) => {
    const persentase = (jumlah / total) * 100;
    const barLength = Math.round(persentase / 5); // setiap 5% = 1 bar
    const bar = "█".repeat(Math.max(barLength, 1));

    chart += `📂 ${kategori}\n`;
    chart += `${bar} ${persentase.toFixed(1)}%\n`;
    chart += `💰 Rp${jumlah.toLocaleString()}\n\n`;
  });

  chart += `💯 Total Pengeluaran: Rp${total.toLocaleString()}`;

  return chart;
}

// ===== HELPER FUNCTION: Filter hanya pengeluaran =====
export function filterPengeluaran(data) {
  return data.filter((item) => item.kategori.toLowerCase() !== "pemasukan");
}

// ===== HELPER FUNCTION: Filter hanya pemasukan =====
export function filterPemasukan(data) {
  return data.filter((item) => item.kategori.toLowerCase() === "pemasukan");
}
