import { createCanvas } from "canvas";
import Chart from "chart.js/auto";

export async function generateCanvasChart(data, title = "Pengeluaran") {
  if (!data.length) return null;

  // Group by kategori
  const kategoriMap = {};
  data.forEach((item) => {
    if (item.kategori.toLowerCase() !== "pemasukan") {
      kategoriMap[item.kategori] =
        (kategoriMap[item.kategori] || 0) + item.jumlah;
    }
  });

  const sortedKategori = Object.entries(kategoriMap).sort(
    ([, a], [, b]) => b - a
  );
  if (sortedKategori.length === 0) return null;

  const labels = sortedKategori.map(([kategori]) => kategori);
  const values = sortedKategori.map(([, jumlah]) => jumlah);

  // Create canvas
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext("2d");

  // Create chart
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Jumlah Pengeluaran",
          data: values,
          backgroundColor: [
            "rgba(255, 99, 132, 0.7)",
            "rgba(54, 162, 235, 0.7)",
            "rgba(255, 206, 86, 0.7)",
            "rgba(75, 192, 192, 0.7)",
            "rgba(153, 102, 255, 0.7)",
            "rgba(255, 159, 64, 0.7)",
          ],
          borderColor: [
            "rgba(255, 99, 132, 1)",
            "rgba(54, 162, 235, 1)",
            "rgba(255, 206, 86, 1)",
            "rgba(75, 192, 192, 1)",
            "rgba(153, 102, 255, 1)",
            "rgba(255, 159, 64, 1)",
          ],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: title,
          font: {
            size: 18,
          },
        },
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (value) {
              return "Rp" + value.toLocaleString();
            },
          },
        },
      },
    },
  });

  // Return as buffer
  return canvas.toBuffer("image/png");
}
