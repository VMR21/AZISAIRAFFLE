const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Roobet API settings
const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "YOUR_API_KEY_HERE"; // 🔁 Replace with real key
const userId = "YOUR_USER_ID_HERE"; // 🔁 Replace with your user ID

// Raffle State
let cachedData = [];
let userTicketState = {};
let ticketAssignments = [];
let nextTicketNumber = 1;
let pastRounds = [];
let initialized = false;
let latestPublished = null;

function getCurrentRaffleWindow() {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToLastSaturday = (day + 1) % 7;

  const raffleStart = new Date(now);
  raffleStart.setUTCDate(now.getUTCDate() - diffToLastSaturday);
  raffleStart.setUTCHours(0, 0, 1, 0);

  const raffleEnd = new Date(raffleStart);
  raffleEnd.setUTCDate(raffleStart.getUTCDate() + 6);
  raffleEnd.setUTCHours(23, 59, 59, 0);

  const publicVisibleFrom = new Date(raffleStart);
  publicVisibleFrom.setUTCHours(14, 0, 0, 0);

  const publicVisibleUntil = new Date(publicVisibleFrom);
  publicVisibleUntil.setUTCDate(publicVisibleUntil.getUTCDate() + 7);
  publicVisibleUntil.setUTCHours(13, 59, 59, 0);

  return {
    start: raffleStart.toISOString().split("T")[0],
    end: raffleEnd.toISOString().split("T")[0],
    startObj: raffleStart,
    endObj: raffleEnd,
    publicVisibleFrom,
    publicVisibleUntil,
    published: false
  };
}

let currentWindow = getCurrentRaffleWindow();

async function fetchAndCacheData() {
  try {
    const now = new Date();

    if (!currentWindow.published && now >= currentWindow.publicVisibleFrom) {
      const publishedRound = {
        range: { start: currentWindow.start, end: currentWindow.end },
        tickets: [...ticketAssignments]
      };
      pastRounds.push(publishedRound);
      latestPublished = publishedRound;
      currentWindow.published = true;
      console.log(`[📢] Published raffle for ${currentWindow.start} → ${currentWindow.end}`);
    }

    if (now >= currentWindow.publicVisibleUntil) {
      userTicketState = {};
      ticketAssignments = [];
      nextTicketNumber = 1;
      initialized = false;
      currentWindow = getCurrentRaffleWindow();
      console.log(`[🔁] New raffle round started`);
    }

    const startDate = `${currentWindow.start}T00:00:01Z`;
    const endDate = `${currentWindow.end}T23:59:59Z`;

    const response = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: {
        userId,
        startDate,
        endDate
      }
    });

    const data = response.data;
    if (!Array.isArray(data)) throw new Error("Invalid data format");

    const sorted = data
      .filter(entry => entry.username && entry.weightedWagered)
      .sort((a, b) => b.weightedWagered - a.weightedWagered);

    const top10 = sorted.slice(0, 10);
    cachedData = top10.map(entry => ({
      username: entry.username,
      wagered: Math.floor(entry.weightedWagered)
    }));

    if (!initialized) {
      const ticketPool = [];
      top10.forEach(entry => {
        const username = entry.username;
        const totalWagered = Math.floor(entry.weightedWagered);
        const count = Math.floor(totalWagered / 1000); // 🟦 1000 wager = 1 ticket
        userTicketState[username] = { totalWagered, tickets: count };
        for (let i = 0; i < count; i++) ticketPool.push({ username });
      });
      for (let i = ticketPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ticketPool[i], ticketPool[j]] = [ticketPool[j], ticketPool[i]];
      }
      ticketAssignments = ticketPool.map((t, i) => ({ ticket: i + 1, username: t.username }));
      nextTicketNumber = ticketAssignments.length + 1;
      initialized = true;
    } else {
      top10.forEach(entry => {
        const username = entry.username;
        const totalWagered = Math.floor(entry.weightedWagered);
        const prevTickets = userTicketState[username]?.tickets || 0;
        const newTickets = Math.floor(totalWagered / 1000) - prevTickets;

        if (!userTicketState[username]) {
          userTicketState[username] = { totalWagered: 0, tickets: 0 };
        }

        for (let i = 0; i < newTickets; i++) {
          ticketAssignments.push({ ticket: nextTicketNumber++, username });
          userTicketState[username].tickets += 1;
        }

        userTicketState[username].totalWagered = totalWagered;
      });
    }

    console.log(`[✅] Roobet raffle data updated`);
  } catch (err) {
    console.error("[❌] Error fetching Roobet data:", err.message);
  }
}

// Start fetching
fetchAndCacheData();
setInterval(fetchAndCacheData, 5 * 60 * 1000); // every 5 minutes

// API endpoints
app.get("/raffle/tickets", (req, res) => {
  const now = new Date();
  if (now < currentWindow.publicVisibleFrom) {
    if (latestPublished) return res.json(latestPublished.tickets);
    return res.status(404).json({ message: "No past raffle data yet." });
  }
  res.json(ticketAssignments);
});

app.get("/raffle/user/:username", (req, res) => {
  const user = req.params.username;
  const tickets = ticketAssignments.filter(t => t.username === user).map(t => t.ticket);
  res.json({ username: user, tickets });
});

app.get("/raffle/current-round", (req, res) => {
  res.json({
    roundStart: currentWindow.start,
    roundEnd: currentWindow.end,
    publicVisibleFrom: currentWindow.publicVisibleFrom,
    publicVisibleUntil: currentWindow.publicVisibleUntil,
    totalTickets: ticketAssignments.length
  });
});

app.get("/raffle/history", (req, res) => {
  res.json(pastRounds);
});

app.listen(PORT, () => {
  console.log(`🚀 Raffle server running on port ${PORT}`);
});
