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
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI2YWU0ODdiLTU3MDYtNGE3ZS04YTY5LTMzYThhOWM5NjMxYiIsIm5vbmNlIjoiZWI2MzYyMWUtMTMwZi00ZTE0LTlmOWMtOTY3MGNiZGFmN2RiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzI3MjQ2NjY1fQ.rVG_QKMcycBEnzIFiAQuixfu6K_oEkAq2Y8Gukco3b8";
const userId = "26ae487b-5706-4a7e-8a69-33a8a9c9631b";

let userTicketState = {};
let ticketAssignments = [];
let nextTicketNumber = 1;
let pastRounds = [];
let initialized = false;
let latestPublished = null;

function getCurrentRaffleWindow() {
  const nowUTC = new Date();
  const nowJST = new Date(nowUTC.getTime() + 9 * 60 * 60 * 1000);

  const day = nowJST.getUTCDay();
  const diffToLastSaturday = (day + 1) % 7;

  const raffleStart = new Date(nowJST);
  raffleStart.setUTCDate(nowJST.getUTCDate() - diffToLastSaturday);
  raffleStart.setUTCHours(15, 0, 1, 0);

  const raffleEnd = new Date(raffleStart);
  raffleEnd.setUTCDate(raffleStart.getUTCDate() + 6);
  raffleEnd.setUTCHours(14, 59, 59, 0);

  const publicVisibleFrom = new Date(raffleStart);
  publicVisibleFrom.setUTCHours(5, 0, 0, 0);

  const publicVisibleUntil = new Date(publicVisibleFrom);
  publicVisibleUntil.setUTCDate(publicVisibleUntil.getUTCDate() + 7);
  publicVisibleUntil.setUTCHours(4, 59, 59, 0);

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
      console.log(`[🔁] New JST raffle round started`);
    }

    const startDate = `${currentWindow.start}T00:00:01Z`;
    const endDate = `${currentWindow.end}T23:59:59Z`;

    const response = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { userId, startDate, endDate }
    });

    const data = response.data;
    if (!Array.isArray(data)) throw new Error("Invalid data format");

    const sorted = data.filter(u => u.weightedWagered >= 1).sort((a, b) => b.weightedWagered - a.weightedWagered);

    if (!initialized || ticketAssignments.length === 0) {
      const ticketPool = [];
      sorted.forEach(user => {
        const count = Math.floor(user.weightedWagered / 1000);
        if (count > 0) {
          userTicketState[user.username] = { tickets: count };
          for (let i = 0; i < count; i++) {
            ticketPool.push({ username: user.username });
          }
        }
      });
      for (let i = ticketPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ticketPool[i], ticketPool[j]] = [ticketPool[j], ticketPool[i]];
      }
      ticketAssignments = ticketPool.map((t, i) => ({ ticket: i + 1, username: t.username }));
      nextTicketNumber = ticketAssignments.length + 1;
      initialized = true;

      console.log(`[🎫] Initialized with ${ticketAssignments.length} tickets`);
    } else {
      sorted.forEach(user => {
        const current = userTicketState[user.username] || { tickets: 0 };
        const total = Math.floor(user.weightedWagered / 1000);
        const newTickets = total - current.tickets;
        for (let i = 0; i < newTickets; i++) {
          ticketAssignments.push({ ticket: nextTicketNumber++, username: user.username });
        }
        userTicketState[user.username] = { tickets: total };
      });
    }

    console.log(`[✅] JST raffle data updated`);
  } catch (err) {
    console.error("[❌] Error:", err.message);
  }
}

fetchAndCacheData();
setInterval(fetchAndCacheData, 5 * 60 * 1000);

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
