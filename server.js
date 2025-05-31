const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5000;

// Use CORS middleware
app.use(cors());

// API details
const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI2YWU0ODdiLTU3MDYtNGE3ZS04YTY5LTMzYThhOWM5NjMxYiIsIm5vbmNlIjoiZWI2MzYyMWUtMTMwZi00ZTE0LTlmOWMtOTY3MGNiZGFmN2RiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzI3MjQ2NjY1fQ.rVG_QKMcycBEnzIFiAQuixfu6K_oEkAq2Y8Gukco3b8";
const userId = "26ae487b-5706-4a7e-8a69-33a8a9c9631b";

let ticketCache = [];

// Format usernames: yu***90
const formatUsername = (username) => {
  if (username.length <= 4) return username;
  return `${username.slice(0, 2)}***${username.slice(-2)}`;
};

// JST Weekly Period
const getCurrentPeriod = () => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
  const day = now.getUTCDay();
  const lastSaturday = new Date(now);
  lastSaturday.setUTCDate(now.getUTCDate() - ((day + 1) % 7));
  lastSaturday.setUTCHours(15, 0, 1, 0); // Saturday JST 00:00:01 = Friday 15:00:01 UTC

  const nextFriday = new Date(lastSaturday);
  nextFriday.setUTCDate(lastSaturday.getUTCDate() + 6);
  nextFriday.setUTCHours(14, 59, 59, 0); // Friday JST 23:59:59 = UTC 14:59:59

  return {
    startDate: lastSaturday.toISOString(),
    endDate: nextFriday.toISOString(),
  };
};

// Fetch and generate ticket data
async function fetchRaffleData() {
  try {
    const { startDate, endDate } = getCurrentPeriod();

    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      params: {
        userId,
        startDate,
        endDate,
      },
    });

    const data = response.data;

    const newTickets = [];
    data
      .filter((player) => player.weightedWagered >= 1000 && player.username !== "azisai205")
      .forEach((player) => {
        const ticketCount = Math.floor(player.weightedWagered / 1000);
        const formatted = formatUsername(player.username);
        for (let i = 0; i < ticketCount; i++) {
          newTickets.push({ ticket: newTickets.length + 1, username: formatted });
        }
      });

    ticketCache = newTickets;
    console.log(`[🎫] Raffle updated: ${ticketCache.length} tickets`);
  } catch (error) {
    console.error("❌ Error fetching raffle data:", error.message);
  }
}

// ROUTES
app.get("/", (req, res) => {
  res.send("🎟️ Welcome to the Raffle API. Use /raffle/tickets or /raffle/user/:username");
});

app.get("/raffle/tickets", (req, res) => {
  res.json(ticketCache);
});

app.get("/raffle/user/:username", (req, res) => {
  const raw = req.params.username;
  const formatted = formatUsername(raw);
  const tickets = ticketCache.filter((t) => t.username === formatted).map((t) => t.ticket);
  res.json({ username: raw, tickets });
});

// Initial fetch & update every 5 minutes
fetchRaffleData();
setInterval(fetchRaffleData, 5 * 60 * 1000);

// Self-ping (replace with your Render domain)
setInterval(() => {
  axios.get("https://yourrenderurl.onrender.com/raffle/tickets")
    .then(() => console.log("✅ Self-ping success"))
    .catch((err) => console.error("❌ Self-ping failed:", err.message));
}, 4 * 60 * 1000);

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Raffle server running on port ${PORT}`);
});
