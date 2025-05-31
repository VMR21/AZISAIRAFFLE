const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE1ZThlYzNmLTkwZDEtNDEzNy1iNGJkLWJhN2M0MjFjMjVlMiIsIm5vbmNlIjoiNDE5MmI1MTctOGMzYy00ZjBjLTg2MzEtYzNiOWEyNGNiZmFjIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzQ3MTg3MTUxfQ.Qr7j1PEqSL5cVb7RuMXXLv1IDv4gvY98pUUU9Ca1pBM"; // <-- Replace with your actual key
const userId = "15e8ec3f-90d1-4137-b4bd-ba7c421c25e2";

let raffleTickets = [];
let lastSeenData = {};
let initialized = false;

function getCurrentRaffleWindow() {
  const nowUTC = new Date();
  const nowJST = new Date(nowUTC.getTime() + 9 * 60 * 60 * 1000); // Convert to JST

  const day = nowJST.getUTCDay();
  const diffToLastSaturday = (day + 1) % 7;

  const raffleStart = new Date(nowJST);
  raffleStart.setUTCDate(nowJST.getUTCDate() - diffToLastSaturday);
  raffleStart.setUTCHours(15, 0, 1, 0); // Saturday 00:00:01 JST

  const raffleEnd = new Date(raffleStart);
  raffleEnd.setUTCDate(raffleStart.getUTCDate() + 6);
  raffleEnd.setUTCHours(14, 59, 59, 0); // Friday 23:59:59 JST

  return {
    start: raffleStart,
    end: raffleEnd
  };
}

async function fetchAndUpdateTickets() {
  const { start, end } = getCurrentRaffleWindow();

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      params: {
        userId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    });

    const data = response.data;

    data.forEach((player) => {
      const username = player.username;
      const totalWager = player.weightedWagered;

      const totalTickets = Math.floor(totalWager / 1000);
      const seenTickets = lastSeenData[username] || 0;
      const ticketsToAdd = initialized ? (totalTickets - seenTickets) : totalTickets;

      for (let i = 0; i < ticketsToAdd; i++) {
        raffleTickets.push({ ticket: raffleTickets.length + 1, username });
      }

      lastSeenData[username] = totalTickets;
    });

    if (!initialized) {
      shuffleTickets(raffleTickets);
      initialized = true;
    }

    console.log(`[✅] Raffle updated: ${raffleTickets.length} total tickets`);
  } catch (error) {
    console.error("[❌] Error fetching data:", error.message);
  }
}

function shuffleTickets(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ROUTES
app.get("/", (req, res) => {
  res.send("🎟️ Roobet Raffle API is live");
});

app.get("/raffle/tickets", (req, res) => {
  res.json(raffleTickets);
});

app.get("/raffle/user/:username", (req, res) => {
  const user = req.params.username;
  const count = raffleTickets.filter(t => t.username === user).length;
  res.json({ username: user, ticketCount: count });
});

app.get("/raffle/winner", (req, res) => {
  if (raffleTickets.length === 0) return res.json({ error: "No tickets yet" });
  const winner = raffleTickets[Math.floor(Math.random() * raffleTickets.length)];
  res.json({ winner });
});

// INIT
fetchAndUpdateTickets();
setInterval(fetchAndUpdateTickets, 5 * 60 * 1000); // every 5 minutes

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉 Server running on port ${PORT}`);
});
