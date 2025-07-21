// ===== SHEETS.JS - Multi-User Version =====
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync("credentials.json", "utf8")),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// Helper function untuk memvalidasi dan format tanggal
function formatTanggal(tanggal) {
  if (!tanggal) {
    return new Date().toISOString().split("T")[0];
  }

  if (typeof tanggal === "string" && tanggal.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return tanggal;
  }

  const date = new Date(tanggal);
  if (isNaN(date.getTime())) {
    return new Date().toISOString().split("T")[0];
  }

  return date.toISOString().split("T")[0];
}

// Helper function untuk mendapatkan nama sheet berdasarkan user ID
function getSheetName(userId, type = "transactions") {
  switch (type) {
    case "transactions":
      return `User_${userId}_Transactions`;
    case "budget":
      return `User_${userId}_Budget`;
    case "users":
      return "Users";
    default:
      return `User_${userId}`;
  }
}

// Helper function untuk memastikan sheet ada
async function ensureSheetExists(sheetName, headers) {
  try {
    // Coba get sheet info dulu
    const sheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
    });

    const existingSheet = sheetInfo.data.sheets.find(
      (sheet) => sheet.properties.title === sheetName
    );

    if (!existingSheet) {
      // Buat sheet baru
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: process.env.SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });
      console.log(`✅ Sheet ${sheetName} berhasil dibuat`);

      // Tambahkan header
      if (headers) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
          valueInputOption: "RAW",
          requestBody: {
            values: [headers],
          },
        });
        console.log(`✅ Header ${sheetName} berhasil ditambahkan`);
      }
    }
  } catch (error) {
    console.error(`❌ Error ensuring sheet ${sheetName}:`, error.message);
    throw error;
  }
}

// ===== USER MANAGEMENT =====
export async function registerUser(userId, phoneNumber) {
  try {
    const sheetName = getSheetName(null, "users");
    await ensureSheetExists(sheetName, [
      "UserID",
      "PhoneNumber",
      "RegisteredAt",
      "LastActivity",
    ]);

    const registerTime = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!A:D`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[userId, phoneNumber, registerTime, registerTime]],
      },
    });

    console.log(`✅ User ${userId} berhasil didaftarkan`);
    return { success: true, userId, phoneNumber, registeredAt: registerTime };
  } catch (error) {
    console.error(`❌ Error registering user ${userId}:`, error.message);
    throw error;
  }
}

export async function getUserInfo(userId) {
  try {
    const sheetName = getSheetName(null, "users");

    // Pastikan sheet Users ada
    await ensureSheetExists(sheetName, [
      "UserID",
      "PhoneNumber",
      "RegisteredAt",
      "LastActivity",
    ]);

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!A2:D`,
    });

    const rows = result.data.values || [];
    const userRow = rows.find((row) => row[0] === userId);

    if (!userRow) return null;

    return {
      userId: userRow[0],
      phoneNumber: userRow[1],
      registeredAt: userRow[2],
      lastActivity: userRow[3],
    };
  } catch (error) {
    console.error(`❌ Error getting user info for ${userId}:`, error.message);
    return null;
  }
}

export async function updateUserActivity(userId) {
  try {
    const sheetName = getSheetName(null, "users");
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!A2:D`,
    });

    const rows = result.data.values || [];
    const userIndex = rows.findIndex((row) => row[0] === userId);

    if (userIndex >= 0) {
      const rowNumber = userIndex + 2; // +2 karena index 0 = row 2
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${sheetName}!D${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[new Date().toISOString()]],
        },
      });
    }
  } catch (error) {
    console.error(
      `❌ Error updating user activity for ${userId}:`,
      error.message
    );
  }
}

export async function getAllUsers() {
  try {
    const sheetName = getSheetName(null, "users");
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!A2:D`,
    });

    const rows = result.data.values || [];
    return rows.map(([userId, phoneNumber, registeredAt, lastActivity]) => ({
      userId,
      phoneNumber,
      registeredAt,
      lastActivity,
    }));
  } catch (error) {
    console.error("❌ Error getting all users:", error.message);
    return [];
  }
}

// ===== TRANSACTION MANAGEMENT (Multi-User) =====
export async function simpanKeSheet(
  userId,
  { deskripsi, jumlah, kategori, tanggal }
) {
  try {
    const sheetName = getSheetName(userId, "transactions");
    await ensureSheetExists(sheetName, [
      "Tanggal",
      "Deskripsi",
      "Jumlah",
      "Kategori",
    ]);

    const tanggalFinal = formatTanggal(tanggal);
    const deskripsiClean = (deskripsi || "").toString().trim();
    const jumlahClean = parseInt(jumlah) || 0;
    const kategoriClean = (kategori || "").toString().trim();

    if (!deskripsiClean || jumlahClean === 0 || !kategoriClean) {
      throw new Error(
        "Data tidak lengkap: deskripsi, jumlah, dan kategori harus diisi"
      );
    }

    console.log(`📝 Data yang akan disimpan untuk user ${userId}:`, {
      tanggal: tanggalFinal,
      deskripsi: deskripsiClean,
      jumlah: jumlahClean,
      kategori: kategoriClean,
    });

    const values = [
      [`'${tanggalFinal}`, deskripsiClean, jumlahClean, kategoriClean],
    ];

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!A:D`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values,
      },
    });

    // Update user activity
    await updateUserActivity(userId);

    console.log(`✅ Data berhasil disimpan untuk user ${userId}`);

    return {
      tanggal: tanggalFinal,
      deskripsi: deskripsiClean,
      jumlah: jumlahClean,
      kategori: kategoriClean,
    };
  } catch (error) {
    console.error(
      `❌ Error simpan ke sheet untuk user ${userId}:`,
      error.message
    );
    throw error;
  }
}

export async function getAllData(userId) {
  try {
    const sheetName = getSheetName(userId, "transactions");

    // Pastikan sheet ada
    await ensureSheetExists(sheetName, [
      "Tanggal",
      "Deskripsi",
      "Jumlah",
      "Kategori",
    ]);

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!A2:D`,
    });

    const rows = result.data.values || [];

    const data = rows.map(([tanggal, deskripsi, jumlah, kategori]) => ({
      tanggal: tanggal || "",
      deskripsi: deskripsi || "",
      jumlah: parseInt(jumlah) || 0,
      kategori: kategori || "",
    }));

    console.log(
      `📊 Berhasil mengambil ${data.length} data untuk user ${userId}`
    );
    return data;
  } catch (error) {
    console.error(
      `❌ Error mengambil data untuk user ${userId}:`,
      error.message
    );
    return [];
  }
}

export async function hitungSaldo(userId) {
  try {
    const data = await getAllData(userId);

    let totalPemasukan = 0;
    let totalPengeluaran = 0;

    data.forEach((item) => {
      if (item.kategori.toLowerCase() === "pemasukan") {
        totalPemasukan += item.jumlah;
      } else {
        totalPengeluaran += item.jumlah;
      }
    });

    const saldo = totalPemasukan - totalPengeluaran;

    console.log(`💰 Saldo user ${userId}: Rp${saldo.toLocaleString()}`);

    return {
      totalPemasukan,
      totalPengeluaran,
      saldo,
    };
  } catch (error) {
    console.error(`❌ Error hitung saldo untuk user ${userId}:`, error.message);
    return {
      totalPemasukan: 0,
      totalPengeluaran: 0,
      saldo: 0,
    };
  }
}

// ===== BUDGET MANAGEMENT (Multi-User) =====
export async function setBudgetData(userId, { kategori, budget, bulan }) {
  try {
    const sheetName = getSheetName(userId, "budget");
    await ensureSheetExists(sheetName, [
      "Kategori",
      "Budget",
      "Bulan",
      "CreatedAt",
    ]);

    const createdAt = new Date().toISOString();
    const kategoriClean = kategori.toString().trim();
    const budgetClean = parseInt(budget) || 0;
    const bulanClean = bulan || new Date().toISOString().slice(0, 7);

    if (!kategoriClean || budgetClean === 0) {
      throw new Error(
        "Data budget tidak lengkap: kategori dan budget harus diisi"
      );
    }

    // Cek apakah budget untuk kategori dan bulan ini sudah ada
    const existingData = await getBudgetData(userId);
    const existingBudget = existingData.find(
      (b) =>
        b.kategori.toLowerCase() === kategoriClean.toLowerCase() &&
        b.bulan === bulanClean
    );

    if (existingBudget) {
      // Update existing budget
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${sheetName}!A2:D`,
      });

      const rows = result.data.values || [];
      const budgetIndex = rows.findIndex(
        (row) =>
          row[0]?.toLowerCase() === kategoriClean.toLowerCase() &&
          row[2] === bulanClean
      );

      if (budgetIndex >= 0) {
        const rowNumber = budgetIndex + 2;
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: `${sheetName}!B${rowNumber}`,
          valueInputOption: "RAW",
          requestBody: {
            values: [[budgetClean]],
          },
        });
        console.log(
          `✅ Budget ${kategoriClean} untuk user ${userId} berhasil diupdate`
        );
      }
    } else {
      // Tambah budget baru
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${sheetName}!A:D`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [[kategoriClean, budgetClean, bulanClean, createdAt]],
        },
      });
      console.log(
        `✅ Budget ${kategoriClean} untuk user ${userId} berhasil ditambahkan`
      );
    }

    // Update user activity
    await updateUserActivity(userId);

    return {
      kategori: kategoriClean,
      budget: budgetClean,
      bulan: bulanClean,
      createdAt,
    };
  } catch (error) {
    console.error(`❌ Error set budget untuk user ${userId}:`, error.message);
    throw error;
  }
}

export async function getBudgetData(userId) {
  try {
    const sheetName = getSheetName(userId, "budget");

    // Pastikan sheet ada
    await ensureSheetExists(sheetName, [
      "Kategori",
      "Budget",
      "Bulan",
      "CreatedAt",
    ]);

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `${sheetName}!A2:D`,
    });

    const rows = result.data.values || [];

    const budgetData = rows.map(([kategori, budget, bulan, createdAt]) => ({
      kategori: kategori || "",
      budget: parseInt(budget) || 0,
      bulan: bulan || "",
      createdAt: createdAt || "",
    }));

    console.log(
      `📊 Berhasil mengambil ${budgetData.length} budget untuk user ${userId}`
    );
    return budgetData;
  } catch (error) {
    console.error(
      `❌ Error mengambil budget untuk user ${userId}:`,
      error.message
    );
    return [];
  }
}

// ===== UTILITY FUNCTIONS =====
export async function deleteTransaction(userId, index) {
  try {
    const sheetName = getSheetName(userId, "transactions");
    const rowNumber = index + 2; // +2 karena index 0 = row 2 (row 1 adalah header)

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: await getSheetId(sheetName),
                dimension: "ROWS",
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          },
        ],
      },
    });

    console.log(
      `✅ Transaksi index ${index} berhasil dihapus untuk user ${userId}`
    );
    await updateUserActivity(userId);
    return true;
  } catch (error) {
    console.error(
      `❌ Error menghapus transaksi untuk user ${userId}:`,
      error.message
    );
    return false;
  }
}

export async function getSheetId(sheetName) {
  try {
    const sheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
    });

    const sheet = sheetInfo.data.sheets.find(
      (s) => s.properties.title === sheetName
    );

    return sheet ? sheet.properties.sheetId : null;
  } catch (error) {
    console.error(`❌ Error getting sheet ID for ${sheetName}:`, error.message);
    return null;
  }
}

// ===== ANALYTICS FUNCTIONS =====
export async function getUserStats(userId) {
  try {
    const data = await getAllData(userId);
    const budgetData = await getBudgetData(userId);

    if (data.length === 0) {
      return {
        totalTransactions: 0,
        totalAmount: 0,
        totalIncome: 0,
        totalExpense: 0,
        balance: 0,
        totalBudgets: budgetData.length,
        firstTransaction: null,
        lastTransaction: null,
      };
    }

    const totalTransactions = data.length;
    const totalIncome = data
      .filter((item) => item.kategori.toLowerCase() === "pemasukan")
      .reduce((sum, item) => sum + item.jumlah, 0);

    const totalExpense = data
      .filter((item) => item.kategori.toLowerCase() !== "pemasukan")
      .reduce((sum, item) => sum + item.jumlah, 0);

    const balance = totalIncome - totalExpense;
    const totalAmount = totalIncome + totalExpense;

    // Sort by date to get first and last transaction
    const sortedData = data.sort(
      (a, b) => new Date(a.tanggal) - new Date(b.tanggal)
    );
    const firstTransaction = sortedData[0];
    const lastTransaction = sortedData[sortedData.length - 1];

    return {
      totalTransactions,
      totalAmount,
      totalIncome,
      totalExpense,
      balance,
      totalBudgets: budgetData.length,
      firstTransaction,
      lastTransaction,
    };
  } catch (error) {
    console.error(`❌ Error getting user stats for ${userId}:`, error.message);
    return null;
  }
}

export async function getTopCategories(userId, limit = 5) {
  try {
    const data = await getAllData(userId);
    const expenses = data.filter(
      (item) => item.kategori.toLowerCase() !== "pemasukan"
    );

    if (expenses.length === 0) return [];

    const categoryMap = {};
    expenses.forEach((item) => {
      categoryMap[item.kategori] =
        (categoryMap[item.kategori] || 0) + item.jumlah;
    });

    const sortedCategories = Object.entries(categoryMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([kategori, jumlah]) => ({ kategori, jumlah }));

    return sortedCategories;
  } catch (error) {
    console.error(
      `❌ Error getting top categories for ${userId}:`,
      error.message
    );
    return [];
  }
}

// ===== EXPORT FUNCTIONS =====
export async function exportUserData(userId) {
  try {
    const transactions = await getAllData(userId);
    const budgets = await getBudgetData(userId);
    const userInfo = await getUserInfo(userId);
    const stats = await getUserStats(userId);

    return {
      userInfo,
      transactions,
      budgets,
      stats,
      exportedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`❌ Error exporting data for ${userId}:`, error.message);
    return null;
  }
}
