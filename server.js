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

// State
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
  raffleStart.setUTCHours(15, 0, 1, 0); // Sat 00:00:01 JST

  const raffleEnd = new Date(raffleStart);
  raffleEnd.setUTCDate(raffleStart.getUTCDate() + 6);
  raffleEnd.setUTCHours(14, 59, 59, 0); // Fri 23:59:59 JST

  const publicVisibleFrom = new Date(raffleStart);
  publicVisibleFrom.setUTCHours(5, 0, 0, 0); // Sat 14:00 JST

  const publicVisibleUntil = new Date(publicVisibleFrom);
  publicVisibleUntil.setUTCDate(publicVisibleUntil.getUTCDate() + 7);
  publicVisibleUntil.setUTCHours(4, 59, 59, 0); // Next Sat 13:59 JST

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

    // Handle round end
    if (now >= currentWindow.publicVisibleUntil) {
      userTicketState = {};
      ticketAssignments = [];
      nextTicketNumber = 1;
      initialized = false;
      currentWindow = getCurrentRaffleWindow();
      console.log(`[🔁] New JST raffle round started`);
    }

    // Publish data for current round
    if (!currentWindow.published && now >= currentWindow.publicVisibleFrom) {
      latestPublished = {
        range: { start: currentWindow.start, end: currentWindow.end },
        tickets: [...ticketAssignments]
      };
      pastRounds.push(latestPublished);
      currentWindow.published = true;
      console.log(`[📢] Published raffle for ${currentWindow.start} → ${currentWindow.end}`);
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

    if (!initialized) {
      // On first run: give tickets for all weightedWagered up to now and shuffle
      const tempPool = [];
      sorted.forEach(user => {
        const username = user.username;
        const total = user.weightedWagered;
        const tickets = Math.floor(total / 1000);
        if (tickets > 0) {
          for (let i = 0; i < tickets; i++) {
            tempPool.push({ username });
          }
          userTicketState[username] = {
            total: tickets * 1000,
            tickets
          };
        }
      });

      // Shuffle the pool
      for (let i = tempPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tempPool[i], tempPool[j]] = [tempPool[j], tempPool[i]];
      }

      ticketAssignments = tempPool.map((t, i) => ({ ticket: i + 1, username: t.username }));
      nextTicketNumber = ticketAssignments.length + 1;
      initialized = true;

      console.log(`[🎫] Initialized mid-round. Assigned ${ticketAssignments.length} shuffled tickets`);
      return;
    }

    // Later updates: assign only for new wagered increase
    sorted.forEach(user => {
      const username = user.username;
      const totalWeighted = user.weightedWagered;
      const previous = userTicketState[username] || { total: 0, tickets: 0 };

      const newWeighted = totalWeighted - previous.total;
      const newTickets = Math.floor(newWeighted / 1000);

      if (newTickets > 0) {
        for (let i = 0; i < newTickets; i++) {
          ticketAssignments.push({ ticket: nextTicketNumber++, username });
        }

        userTicketState[username] = {
          total: previous.total + newTickets * 1000,
          tickets: previous.tickets + newTickets
        };

        console.log(`[+] ${username} gets ${newTickets} new ticket(s) (total: ${userTicketState[username].tickets})`);
      }
    });
  } catch (err) {
    console.error("[❌] Error fetching Roobet data:", err.message);
  }
}

fetchAndCacheData();
setInterval(fetchAndCacheData, 5 * 60 * 1000); // every 5 minutes

// ROUTES
app.get("/raffle/tickets", (req, res) => {
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

app.get("/raffle/debug", async (req, res) => {
  const startDate = `${currentWindow.start}T00:00:01Z`;
  const endDate = `${currentWindow.end}T23:59:59Z`;

  const response = await axios.get(apiUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
    params: { userId, startDate, endDate }
  });

  const filtered = response.data.filter(u => u.weightedWagered >= 1000);
  res.json(filtered);
});

app.listen(PORT, () => {
  console.log(`🚀 Raffle server running on port ${PORT}`);
});
