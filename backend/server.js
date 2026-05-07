const fs = require("fs");
const path = require("path");
const https = require("https");
const express = require("express");
const http = require("http");
const cors = require("cors");
const qrcode = require("qrcode-terminal");
const gtts = require("google-tts-api");
const { Server } = require("socket.io");
const { Client, LocalAuth } = require("whatsapp-web.js");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...rest] = trimmed.split("=");
    if (!key) return;
    const value = rest.join("=").trim().replace(/^"|"$/g, "");
    if (value && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "6282313131323@c.us";
const WATCH_SENDERS = (process.env.WATCH_SENDERS || "6285766666262@c.us")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const KEYWORDS = (process.env.KEYWORDS || "berhasil dengan reference number")
  .split(",")
  .map((keyword) => keyword.trim().toLowerCase())
  .filter(Boolean);
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

function normalizeJid(raw) {
  if (!raw || typeof raw !== "string") {
    return "";
  }
  const cleaned = raw.trim().toLowerCase();
  if (cleaned.endsWith("@c.us") || cleaned.endsWith("@g.us")) {
    return cleaned;
  }
  const digits = cleaned.replace(/[^0-9]/g, "");
  return digits ? `${digits}@c.us` : "";
}

function isAllowedSender(from) {
  // Semua sender dianggap valid; hanya validasi kata kunci yang digunakan.
  return true;
}

async function getTtsAudioBuffer(text, lang = "id", slow = false) {
  try {
    const audioUrl = gtts.getAudioUrl(text, {
      lang,
      slow,
      host: "https://translate.google.com",
    });

    return await new Promise((resolve, reject) => {
      https
        .get(audioUrl, (res) => {
          if (res.statusCode !== 200) {
            reject(
              new Error(`TTS request failed with status ${res.statusCode}`),
            );
            return;
          }

          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        })
        .on("error", reject);
    });
  } catch (error) {
    console.error("Error generating TTS audio:", error);
    throw error;
  }
}

function containsKeyword(text) {
  if (!text || typeof text !== "string") {
    return false;
  }
  const lowerText = text.toLowerCase();
  return KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

function parseTransactionMessage(text) {
  // Remove "dengan reference number [number]" from the message
  let parsed = text.replace(/dengan reference number \d+/i, "").trim();
  // Remove "Rp." and ",00" from the amount
  parsed = parsed.replace(/Rp\.([^,]+),00/g, "$1");
  // Clean up extra spaces and remove trailing period if present
  parsed = parsed.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  return parsed;
}

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "qris-wa-bot",
    dataPath: path.join(__dirname, "session"),
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-background-networking",
      "--window-size=1920,1080",
    ],
  },
});

client.on("qr", (qr) => {
  console.log("QR code received. Scan it with WhatsApp on your phone:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("WhatsApp client is ready.");
});

client.on("authenticated", () => {
  console.log("WhatsApp client authenticated successfully. Session saved.");
});

client.on("auth_failure", (message) => {
  console.error("WhatsApp authentication failure:", message);
});

client.on("disconnected", (reason) => {
  console.warn("WhatsApp client disconnected:", reason);
});

client.on("message", async (message) => {
  try {
    if (!message || !message.body) {
      console.log("[Message ignored] empty message or no body received.");
      return;
    }

    const senderJid = normalizeJid(message.from);
    console.log("[Incoming message] sender=", senderJid, "body=", message.body);

    if (!isAllowedSender(senderJid)) {
      console.log(
        "[Message ignored] sender filter disabled; all senders are valid.",
        senderJid,
      );
    }

    if (!containsKeyword(message.body)) {
      console.log(
        "[Message invalid] no matching keyword found in message from:",
        senderJid,
      );
      return;
    }

    console.log("[Message valid] keyword matched from sender:", senderJid);
    const parsedMessage = parseTransactionMessage(message.body);
    const formattedMessage = parsedMessage;
    const payload = {
      text: formattedMessage,
      from: senderJid,
      timestamp: new Date().toISOString(),
    };

    let audioBuffer = null;
    try {
      audioBuffer = await getTtsAudioBuffer(formattedMessage);
    } catch (error) {
      console.error("TTS audio generation failed:", error);
    }

    const emitPayload = audioBuffer
      ? { ...payload, audio: audioBuffer }
      : payload;

    io.emit("qris-message", emitPayload);
    console.log("Broadcasted QRIS message to WebSocket clients.");

    const adminJid = normalizeJid(ADMIN_NUMBER);
    if (adminJid) {
      await client.sendMessage(adminJid, formattedMessage);
      console.log(`Forwarded message to admin number ${adminJid}`);
    }
  } catch (error) {
    console.error("Error processing incoming WhatsApp message:", error);
  }
});

io.on("connection", (socket) => {
  console.log("WebSocket client connected:", socket.id);
  socket.emit("connection-status", { status: "connected" });

  socket.on("disconnect", (reason) => {
    console.log("WebSocket client disconnected:", socket.id, "reason:", reason);
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/session", (req, res) => {
  const isAuthenticated = Boolean(client.info && client.info.wid);
  res.json({ authenticated: isAuthenticated });
});

server.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});

function shutdown() {
  console.log("Shutting down backend server...");
  client.destroy().finally(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

client.initialize();
