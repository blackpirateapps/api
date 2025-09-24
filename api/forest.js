import { createClient } from "@libsql/client";

// --- CORS Configuration (unchanged) ---
const allowedOrigins = [process.env.MAIN_APP_URL, 'http://localhost:3000'];
function setCorsHeaders(req, res) {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// --- Database Initialization for this service ---
async function initForestDb(client) {
    // This command safely creates the 'forest' table if it doesn't already exist.
    await client.execute(`
        CREATE TABLE IF NOT EXISTS forest (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            treeType TEXT NOT NULL,
            status TEXT NOT NULL,
            purchaseDate TEXT NOT NULL,
            matureDate TEXT NOT NULL
        );
    `);
    // NOTE: The creation for 'user_state' has been removed as per your instruction.
}

// --- NEW HELPER: To parse JSON from request body ---
async function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                // Handle cases where the body might be empty
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error("Invalid JSON in request body"));
            }
        });
        req.on('error', err => {
            reject(err);
        });
    });
}
// --- End Helper ---


export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
    
    try {
        await initForestDb(client);

        const nowISO = new Date().toISOString();
        await client.execute({
            sql: "UPDATE forest SET status = 'matured' WHERE status = 'growing' AND matureDate <= ?;",
            args: [nowISO]
        });

        if (req.method === 'POST') {
            // FIX: Use the helper to correctly parse the body
            const body = await parseJsonBody(req);
            const { treeId, growthHours } = body;

            if (!treeId || !growthHours) {
                return res.status(400).json({ message: 'Tree type and growth duration are required.' });
            }

            const cost = 200;

            const userStateResult = await client.execute("SELECT coinsAtLastRelapse, lastRelapse FROM user_state WHERE id = 1;");
            if (userStateResult.rows.length === 0) return res.status(404).json({ message: 'User state not found. Please log in to the main app first.' });
            
            const state = userStateResult.rows[0];

            const totalHours = (Date.now() - new Date(state.lastRelapse).getTime()) / (1000 * 60 * 60);
            const streakCoins = totalHours > 0 ? Math.floor(10 * Math.pow(totalHours, 1.2)) : 0;
            const totalCoins = state.coinsAtLastRelapse + streakCoins;

            if (totalCoins < cost) return res.status(400).json({ message: 'Not enough coins.' });
            
            const newCoinBalance = totalCoins - cost;
            const newCoinsAtLastRelapse = newCoinBalance - streakCoins;

            await client.execute({
                sql: "UPDATE user_state SET coinsAtLastRelapse = ? WHERE id = 1;",
                args: [newCoinsAtLastRelapse]
            });
            
            const purchaseDate = new Date();
            const matureDate = new Date(purchaseDate.getTime() + growthHours * 60 * 60 * 1000);

            await client.execute({
                sql: "INSERT INTO forest (treeType, status, purchaseDate, matureDate) VALUES (?, 'growing', ?, ?);",
                args: [treeId, purchaseDate.toISOString(), matureDate.toISOString()]
            });

            const forestResult = await client.execute("SELECT * FROM forest ORDER BY purchaseDate DESC;");
            return res.status(200).json(forestResult.rows);

        } else if (req.method === 'GET') {
            const forestResult = await client.execute("SELECT * FROM forest ORDER BY purchaseDate DESC;");
            return res.status(200).json(forestResult.rows);
        } else {
            res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
            return res.status(405).end(`Method ${req.method} Not Allowed`);
        }

    } catch (error) {
        console.error('Forest API Error:', error);
        return res.status(500).json({ message: 'An internal server error occurred.' });
    } finally {
        client.close();
    }
}

