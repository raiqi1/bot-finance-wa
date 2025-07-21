import { google } from "googleapis";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync("credentials.json", "utf8")),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

export class UserManager {
  constructor() {
    this.users = new Map(); // Cache user data
  }

  // Ekstrak user ID dari WhatsApp number
  extractUserId(whatsappNumber) {
    return whatsappNumber.replace("@s.whatsapp.net", "").replace("@c.us", "");
  }

  // Buat sheet baru untuk user
  async createUserSheet(userId) {
    const sheetName = `User_${userId}`;

    try {
      // Cek apakah sheet sudah ada
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
      });

      const existingSheet = spreadsheet.data.sheets.find(
        (sheet) => sheet.properties.title === sheetName
      );

      if (existingSheet) {
        return sheetName;
      }

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

      // Tambahkan header
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `${sheetName}!A1:E1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["Tanggal", "Deskripsi", "Jumlah", "Kategori", "Jenis"]],
        },
      });

      console.log(`✅ Sheet baru dibuat untuk user: ${userId}`);
      return sheetName;
    } catch (error) {
      console.error(`❌ Error creating sheet for user ${userId}:`, error);
      throw error;
    }
  }

  // Registrasi user baru
  async registerUser(whatsappNumber, name = null) {
    const userId = this.extractUserId(whatsappNumber);
    const sheetName = await this.createUserSheet(userId);

    const userData = {
      userId,
      whatsappNumber,
      name: name || `User_${userId}`,
      sheetName,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };

    this.users.set(userId, userData);

    return userData;
  }

  // Dapatkan data user
  async getUser(whatsappNumber) {
    const userId = this.extractUserId(whatsappNumber);

    if (this.users.has(userId)) {
      // Update last active
      const user = this.users.get(userId);
      user.lastActive = new Date().toISOString();
      return user;
    }

    // User baru, registrasi otomatis
    return await this.registerUser(whatsappNumber);
  }

  // Update nama user
  async updateUserName(whatsappNumber, name) {
    const userId = this.extractUserId(whatsappNumber);
    if (this.users.has(userId)) {
      this.users.get(userId).name = name;
      return true;
    }
    return false;
  }

  // Statistik user
  getUserStats() {
    return {
      totalUsers: this.users.size,
      activeToday: Array.from(this.users.values()).filter((user) => {
        const today = new Date().toDateString();
        const lastActive = new Date(user.lastActive).toDateString();
        return today === lastActive;
      }).length,
    };
  }
}
