const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// Config
const apiUrl = "https://roobetconnect.com/affiliate/v2/stats";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI2YWU0ODdiLTU3MDYtNGE3ZS04YTY5LTMzYThhOWM5NjMxYiIsIm5vbmNlIjoiZWI2MzYyMWUtMTMwZi00ZTE0LTlmOWMtOTY3MGNiZGFmN2RiIiwic2VydmljZSI6ImFmZmlsaWF0ZVN0YXRzIiwiaWF0IjoxNzI3MjQ2NjY1fQ.rVG_QKMcycBEnzIFiAQuixfu6K_oEkAq2Y8Gukco3b8";
const userId = "26ae487b-5706-4a7e-8a69-33a8a9c9631b";

// Raffle state
let ticketAssignments = [];
let userTicketState = {};
let initialized = false;
let currentRound = {
    startDate: "2025-05-30T15:00:00Z",
    endDate: "2025-06-06T00:00:00Z"
};

// Fetch raffle data
async function fetchRaffleData() {
    try {
        const response = await axios.get(apiUrl, {
            headers: { Authorization: `Bearer ${apiKey}` },
            params: {
                userId,
                startDate: currentRound.startDate,
                endDate: currentRound.endDate
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

            // Shuffle once on first run
            for (let i = tempPool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tempPool[i], tempPool[j]] = [tempPool[j], tempPool[i]];
            }

            ticketAssignments = tempPool.map((entry, index) => ({
                ticket: index + 1,
                username: entry.username
            }));

            initialized = true;
            console.log(`[🎫] Raffle initialized with ${ticketAssignments.length} tickets`);
        } else {
            data.forEach(user => {
                const existing = userTicketState[user.username] || { total: 0, tickets: 0 };
                const diff = user.weightedWagered - existing.total;
                const newTickets = Math.floor(diff / 1000);

                if (newTickets > 0) {
                    for (let i = 0; i < newTickets; i++) {
                        ticketAssignments.push({
                            ticket: ticketAssignments.length + 1,
                            username: user.username
                        });
                    }

                    userTicketState[user.username] = {
                        total: existing.total + newTickets * 1000,
                        tickets: existing.tickets + newTickets
                    };

                    console.log(`[+] ${user.username} got ${newTickets} more ticket(s)`);
                }
            });
        }

    } catch (error) {
        console.error("[❌] Error fetching raffle data:", error.message);
    }
}

// ROUTES
app.get("/", (req, res) => {
    res.send("🎟️ Welcome to the Raffle API. Use /raffle/tickets or /raffle/user/:username");
});

app.get("/raffle/tickets", (req, res) => {
    res.json(ticketAssignments);
});

app.get("/raffle/user/:username", (req, res) => {
    const username = req.params.username;
    const userTickets = ticketAssignments.filter(t => t.username === username).map(t => t.ticket);
    res.json({ username, tickets: userTickets });
});

app.get("/raffle/round", (req, res) => {
    res.json(currentRound);
});

// Initial fetch & interval
fetchRaffleData();
setInterval(fetchRaffleData, 5 * 60 * 1000);

// Self-ping (optional)
setInterval(() => {
    axios.get("https://your-domain.onrender.com/raffle/tickets")
        .then(() => console.log("✅ Self-ping success"))
        .catch(err => console.error("❌ Self-ping failed:", err.message));
}, 4 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Raffle API running on port ${PORT}`);
});
