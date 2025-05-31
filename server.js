const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI2YWU0ODdiLTU3MDYtNGE3ZS04YTY5LTMzYThhOWM5NjMxYiIsIm5vbmNlIjoiZWI2MzYyMWUtMTMwZi00ZTE0LTlmOWMtOTY3MGNiZGFmN2RiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzI3MjQ2NjY1fQ.rVG_QKMcycBEnzIFiAQuixfu6K_oEkAq2Y8Gukco3b8";
const userId = "26ae487b-5706-4a7e-8a69-33a8a9c9631b";

// Raffle window logic
function getCurrentRaffleWindow() {
  const nowUTC = new Date();
  const nowJST = new Date(nowUTC.getTime() + 9 * 60 * 60 * 1000);

  const day = nowJST.getUTCDay();
  const diffToLastSaturday = (day + 1) % 7;

  const raffleStart = new Date(nowJST);
  raffleStart.setUTCDate(nowJST.getUTCDate() - diffToLastSaturday);
  raffleStart.setUTCHours(15, 0, 1, 0); // Fri 15:00:01 UTC

  const raffleEnd = new Date(raffleStart);
  raffleEnd.setUTCDate(raffleStart.getUTCDate() + 6);
  raffleEnd.setUTCHours(14, 59, 59, 0); // Fri 23:59:59 JST

  const publicVisibleFrom = new Date(raffleStart);
  publicVisibleFrom.setUTCHours(5, 0, 0, 0); // Sat 14:00 JST

  const publicVisibleUntil = new Date(publicVisibleFrom);
  publicVisibleUntil.setUTCDate(publicVisibleUntil.getUTCDate() + 7);
  publicVisibleUntil.setUTCHours(4, 59, 59, 0); // Next Sat 13:59:59 JST

  return {
    startDate: raffleStart.toISOString(),
    endDate: raffleEnd.toISOString(),
    start: raffleStart.toISOString().split("T")[0],
    end: raffleEnd.toISOString().split("T")[0],
    publicVisibleFrom,
    publicVisibleUntil
  };
}

let currentWindow = getCurrentRaffleWindow();
let ticketAssignments = [];
let userTicketState = {};
let initialized = false;

async function fetchRaffleData() {
  try {
    const response = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: {
        userId,
        startDate: currentWindow.startDate,
        endDate: currentWindow.endDate
      }
    });

    const data = response.data;

    if (!initialized) {
      const tempPool = [];

      data.forEach(user => {
        const count = Math.floor(user.weightedWagered / 1000);
        if (count > 0) {
          for (let i = 0; i < count; i++) {
            tempPool.push({ username: user.username });
          }
          userTicketState[user.username] = {
            total: count * 1000,
            tickets: count
          };
        }
      });

      for (let i = tempPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tempPool[i], tempPool[j]] = [tempPool[j], tempPool[i]];
      }

      ticketAssignments = tempPool.map((entry, index) => ({
        ticket: index + 1,
        username: entry.username
      }));

      initialized = true;
      console.log(`[🎫] Initialized round ${currentWindow.start} → ${currentWindow.end} with ${ticketAssignments.length} tickets`);
    } else {
      data.forEach(user => {
        const previous = userTicketState[user.username] || { total: 0, tickets: 0 };
        const delta = user.weightedWagered - previous.total;
        const newTickets = Math.floor(delta / 1000);

        if (newTickets > 0) {
          for (let i = 0; i < newTickets; i++) {
            ticketAssignments.push({
              ticket: ticketAssignments.length + 1,
              username: user.username
            });
          }

          userTicketState[user.username] = {
            total: previous.total + newTickets * 1000,
            tickets: previous.tickets + newTickets
          };

          console.log(`[+] ${user.username} gets ${newTickets} new ticket(s)`);
        }
      });
    }
  } catch (err) {
    console.error("[❌] Error fetching raffle data:", err.message);
  }
}

// ROUTES
app.get("/", (req, res) => {
  res.send("🎟️ Welcome to the Dynamic Raffle API. Use /raffle/tickets or /raffle/user/:username");
});

app.get("/raffle/tickets", (req, res) => {
  res.json(ticketAssignments);
});

app.get("/raffle/user/:username", (req, res) => {
  const username = req.params.username;
  const tickets = ticketAssignments.filter(t => t.username === username).map(t => t.ticket);
  res.json({ username, tickets });
});

app.get("/raffle/round", (req, res) => {
  res.json({
    start: currentWindow.start,
    end: currentWindow.end,
    totalTickets: ticketAssignments.length
  });
});

fetchRaffleData();
setInterval(fetchRaffleData, 5 * 60 * 1000); // Every 5 min

setInterval(() => {
  axios.get("https://your-domain.onrender.com/raffle/tickets")
    .then(() => console.log("✅ Self-ping success"))
    .catch(err => console.error("❌ Self-ping failed:", err.message));
}, 4 * 60 * 1000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Dynamic Raffle server running on port ${PORT}`);
});
