// deepseek.js
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function askDeepSeek(prompt) {
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: "deepseek/deepseek-chat-v3",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1, // Low temperature for consistent JSON responses
        max_tokens: 1000,
        top_p: 0.9,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000", // Required by OpenRouter
          "X-Title": "WhatsApp Finance Bot", // Optional but recommended
        },
        timeout: 30000, // 30 second timeout
      }
    );

    const text = response.data.choices[0].message.content;
    return text;
  } catch (err) {
    console.error(
      "❌ Error from DeepSeek via OpenRouter:",
      err.response?.data || err.message
    );
    return null;
  }
}
