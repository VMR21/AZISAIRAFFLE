const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE1ZThlYzNmLTkwZDEtNDEzNy1iNGJkLWJhN2M0MjFjMjVlMiIsIm5vbmNlIjoiNDE5MmI1MTctOGMzYy00ZjBjLTg2MzEtYzNiOWEyNGNiZmFjIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzQ3MTg3MTUxfQ.Qr7j1PEqSL5cVb7RuMXXLv1IDv4gvY98pUUU9Ca1pBM";
const userId = "15e8ec3f-90d1-4137-b4bd-ba7c421c25e2";

let raffleTickets = [];
let lastSeenData = {};
let initialized = false;
let latestRawData = [];

function getCurrentRaffleWindow() {
  const now = new Date();
  const nowJST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = nowJST.getUTCFullYear();
  const month = nowJST.getUTCMonth();

  const baseStart = new Date(Date.UTC(year, month, 1, 15, 1, 0)); // 00:01 JST = 15:01 UTC
  const duration = 167 * 60 * 60 * 1000 + 59 * 60 * 1000;

  for (let i = 0; i < 4; i++) {
    const start = new Date(baseStart.getTime() + i * duration);
    const end = new Date(start.getTime() + duration);
    if (now >= start && now < end) {
      return { start, end };
    }
  }

  return { start: null, end: null };
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

async function fetchAndUpdateTickets() {
  const { start, end } = getCurrentRaffleWindow();
  if (!start || !end) {
    console.log("⛔ Outside raffle period (29th–31st)");
    return;
  }

  try {
    const response = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: {
        userId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    });

    const data = response.data;
    latestRawData = data;
    let newTicketsCount = 0;

    for (const player of data) {
      const username = player.username;
      const weighted = player.weightedWagered;
      const previous = lastSeenData[username] || 0;

      const oldTickets = Math.floor(previous / 1000);
      const newTickets = Math.floor(weighted / 1000) - oldTickets;

      if (!initialized) {
        const totalTickets = Math.floor(weighted / 1000);
        for (let i = 0; i < totalTickets; i++) {
          raffleTickets.push({ ticket: raffleTickets.length + 1, username });
        }
        lastSeenData[username] = weighted;
      } else if (newTickets > 0) {
        for (let i = 0; i < newTickets; i++) {
          raffleTickets.push({ ticket: raffleTickets.length + 1, username });
          newTicketsCount++;
        }
        lastSeenData[username] = weighted;
      }
    }

    if (!initialized) {
      shuffle(raffleTickets);
      initialized = true;
    }

    console.log(`✅ Updated | Total: ${raffleTickets.length} | New: ${newTicketsCount}`);
  } catch (err) {
    console.error("❌ Fetch failed:", err.message);
  }
}

// ROUTES
app.get("/", (req, res) => {
  res.send("🎟️ Roobet Raffle API running");
});

app.get("/raffle/tickets", (req, res) => {
  const grouped = [...raffleTickets].sort((a, b) => {
    if (a.username === b.username) return a.ticket - b.ticket;
    return a.username.localeCompare(b.username);
  });
  res.json(grouped);
});

app.get("/raffle/user/:username", (req, res) => {
  const name = req.params.username;
  const count = raffleTickets.filter(t => t.username === name).length;
  res.json({ username: name, ticketCount: count });
});

app.get("/raffle/winner", (req, res) => {
  if (raffleTickets.length === 0) return res.json({ error: "No tickets yet" });
  const winner = raffleTickets[Math.floor(Math.random() * raffleTickets.length)];
  res.json({ winner });
});

app.get("/wager", (req, res) => {
  const output = latestRawData.map(user => ({
    username: user.username,
    weightedWagered: user.weightedWagered
  }));
  res.json(output);
});

app.get("/period", (req, res) => {
  const { start, end } = getCurrentRaffleWindow();
  if (!start || !end) return res.json({ message: "Not in raffle period" });
  res.json({ start: start.toISOString(), end: end.toISOString() });
});

// INIT
fetchAndUpdateTickets();
setInterval(fetchAndUpdateTickets, 5 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉 Listening on port ${PORT}`);
});
