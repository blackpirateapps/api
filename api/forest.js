import { createClient } from "@libsql/client";

// --- CORS Configuration ---
const allowedOrigins = [process.env.MAIN_APP_URL, 'http://localhost:3000'];

function setCorsHeaders(req, res) {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // Authorization header is no longer needed
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
// --- End CORS Configuration ---

// AUTHENTICATION HAS BEEN REMOVED
// The checkAuth function is deleted.

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
    
    // The authentication check `if (!checkAuth(req))` has been removed.
    // The API is now open to the public.

    try {
        const nowISO = new Date().toISOString();
        await client.execute({
            sql: "UPDATE forest SET status = 'matured' WHERE status = 'growing' AND matureDate <= ?;",
            args: [nowISO]
        });

        if (req.method === 'POST') {
            const { treeId, growthHours } = req.body;
            if (!treeId || !growthHours) {
                return res.status(400).json({ message: 'Tree type and growth duration are required.' });
            }

            const cost = 200;

            const userStateResult = await client.execute("SELECT coinsAtLastRelapse, lastRelapse FROM user_state WHERE id = 1;");
            if (userStateResult.rows.length === 0) return res.status(404).json({ message: 'User state not found.' });
            
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

