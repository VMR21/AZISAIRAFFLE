const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 5000;

// 🔓 Enhanced CORS Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

// API config
const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI2YWU0ODdiLTU3MDYtNGE3ZS04YTY5LTMzYThhOWM5NjMxYiIsIm5vbmNlIjoiZWI2MzYyMWUtMTMwZi00ZTE0LTlmOWMtOTY3MGNiZGFmN2RiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzI3MjQ2NjY1fQ.rVG_QKMcycBEnzIFiAQuixfu6K_oEkAq2Y8Gukco3b8";
const userId = "26ae487b-5706-4a7e-8a69-33a8a9c9631b";

let raffleTickets = [];
let lastSeenData = {};
let initialized = false;
let latestRawData = [];
let currentWinners = null;
let currentWinnerPhase = null;
let monthlyWinners = {};
let weeklyTicketSnapshots = {};


const excludedUsernames = ["azisai205"]; // ✅ Exclude list

const MS_IN_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_EXTRA_BUFFER = 12 * 60 * 60 * 1000;

// 🔐 Mask username: first 2 + "***" + last 2
function maskUsername(username) {
  if (username.length <= 4) return username;
  return username.slice(0, 2) + "***" + username.slice(-2);
}

function pickRandomUniqueWinners(tickets, count = 3) {
  const winners = [];
  const picked = new Set();

  while (winners.length < count && tickets.length > 0) {
    const randomIndex = Math.floor(Math.random() * tickets.length);
    const ticket = tickets[randomIndex];

    // Only allow unique usernames
    if (!picked.has(ticket.username)) {
      picked.add(ticket.username);
      winners.push({ username: maskUsername(ticket.username) });
    }

    // If not enough unique users, allow duplicates
    if (picked.size >= new Set(tickets.map(t => t.username)).size) {
      const remaining = count - winners.length;
      for (let i = 0; i < remaining; i++) {
        const fallbackTicket = tickets[Math.floor(Math.random() * tickets.length)];
        winners.push({ username: maskUsername(fallbackTicket.username) });
      }
      break;
    }
  }

  return winners;
}




function getCurrentAndVisiblePeriod() {
  const now = new Date();
  const nowJST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = nowJST.getUTCFullYear();
  const month = nowJST.getUTCMonth();
  const baseStart = new Date(Date.UTC(year, month, 0, 15, 1, 0)); // JST 00:01 on 1st

  for (let i = 0; i < 4; i++) {
    const start = new Date(baseStart.getTime() + i * MS_IN_WEEK);
    const end = new Date(start.getTime() + MS_IN_WEEK);
    const visibleUntil = new Date(end.getTime() + MS_EXTRA_BUFFER);
    if (now >= start && now < visibleUntil) {
      return { start, end, visibleUntil, week: i + 1 };
    }
  }
  return { start: null, end: null, visibleUntil: null, week: null };
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

async function fetchAndUpdateTickets() {
  const { start, end } = getCurrentAndVisiblePeriod();
  if (!start || !end) {
    console.log("⛔ Outside raffle period");
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

    const data = response.data.filter(
      user => !excludedUsernames.includes(user.username)
    );

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

    console.log(`[✅] Updated | Total: ${raffleTickets.length} | New: ${newTicketsCount}`);
  } catch (err) {
    console.error("[❌] Fetch failed:", err.message);
  }
}

// ROUTES
app.get("/", (req, res) => {
  res.send("🎟️ Roobet Raffle API is running.");
});

app.get("/raffle/tickets", (req, res) => {
  const output = raffleTickets.map((t, i) => ({
    ticket: i + 1,
    username: maskUsername(t.username),
  }));
  res.json(output);
});

app.get("/raffle/ticketsnoast", (req, res) => {
  const counts = {};

  raffleTickets.forEach(({ username }) => {
    if (username === "azisai205") return;
    counts[username] = (counts[username] || 0) + 1;
  });

  const output = Object.entries(counts).map(([username, count]) => ({
    username,
    ticketCount: count,
  }));

  res.json(output);
});


app.get("/raffle/user/:username", (req, res) => {
  const name = req.params.username;
  const count = raffleTickets.filter(t => t.username === name).length;
  res.json({ username: maskUsername(name), ticketCount: count });
});

app.get("/raffle/winner", (req, res) => {
  if (raffleTickets.length === 0) return res.json({ error: "No tickets yet" });
  const winner = raffleTickets[Math.floor(Math.random() * raffleTickets.length)];
  res.json({ winner: { ticket: winner.ticket, username: maskUsername(winner.username) } });
});

    app.get("/winners", (req, res) => {
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const year = jstNow.getUTCFullYear();
      const month = jstNow.getUTCMonth();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

      const weekWindows = [
        { week: 1, start: new Date(Date.UTC(year, month, 7, 15, 1)), end: new Date(Date.UTC(year, month, 8, 3, 1)) },
        { week: 2, start: new Date(Date.UTC(year, month, 14, 15, 1)), end: new Date(Date.UTC(year, month, 15, 3, 1)) },
        { week: 3, start: new Date(Date.UTC(year, month, 21, 15, 1)), end: new Date(Date.UTC(year, month, 22, 3, 1)) },
        { week: 4, start: new Date(Date.UTC(year, month, 28, 15, 1)), end: new Date(Date.UTC(year, month + 1, 0, 15, 1)) }
      ];

      // Reset monthly data if month changed
      const existingMonth = Object.keys(monthlyWinners)[0];
      if (existingMonth && existingMonth !== monthKey) {
        console.log(`🔄 Resetting winners for new month: ${monthKey}`);
        monthlyWinners = {};
        weeklyTicketSnapshots = {};
      }

      if (!monthlyWinners[monthKey]) monthlyWinners[monthKey] = {};
      if (!weeklyTicketSnapshots[monthKey]) weeklyTicketSnapshots[monthKey] = {};

      const results = [];

      for (const { week, start, end } of weekWindows) {
        const weekKey = `week${week}`;

        if (jstNow >= end) {
          // Freeze ticket pool for that week
          if (!weeklyTicketSnapshots[monthKey][weekKey]) {
            weeklyTicketSnapshots[monthKey][weekKey] = [...raffleTickets];
            console.log(`📸 Snapshot saved for ${monthKey} ${weekKey} with ${raffleTickets.length} tickets`);
          }

          // Lock winners from that frozen pool
if (!monthlyWinners[monthKey][weekKey]) {
  if (monthKey === "2025-06") {
    if (week === 1) {
      monthlyWinners[monthKey][weekKey] = [
        { username: "ne***55" },
        { username: "to***un" },
        { username: "de***il" }
      ];
    } else if (week === 2) {
      monthlyWinners[monthKey][weekKey] = [
        { username: "ja***90" },
        { username: "to***un" },
        { username: "he***ku" }
      ];
    } else {
      const tickets = weeklyTicketSnapshots[monthKey][weekKey];
      if (tickets && tickets.length >= 3) {
        monthlyWinners[monthKey][weekKey] = pickRandomUniqueWinners(tickets, 3);
      }
    }
  } else {
    const tickets = weeklyTicketSnapshots[monthKey][weekKey];
    if (tickets && tickets.length >= 3) {
      monthlyWinners[monthKey][weekKey] = pickRandomUniqueWinners(tickets, 3);
    }
  }
}


        // Include the week in the response if winners exist
        if (monthlyWinners[monthKey][weekKey]) {
          results.push({
            week,
            winners: monthlyWinners[monthKey][weekKey]
          });
        }
      }

      res.json(results);
    });


app.get("/wager", (req, res) => {
  const output = latestRawData.map(user => ({
    username: maskUsername(user.username),
    weightedWagered: user.weightedWagered,
  }));
  res.json(output);
});

app.get("/period", (req, res) => {
  const { start, end, visibleUntil, week } = getCurrentAndVisiblePeriod();
  if (!start || !end) return res.json({ message: "Not in raffle period" });
  res.json({
    week,
    start: start.toISOString(),
    end: end.toISOString(),
    visibleUntil: visibleUntil.toISOString(),
  });
});

// START
fetchAndUpdateTickets();
setInterval(fetchAndUpdateTickets, 5 * 60 * 1000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉 Listening on port ${PORT}`);
});
