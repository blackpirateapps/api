import { createClient } from "@libsql/client";
import { parse } from 'cookie';

// This function sets the required headers to allow your main app to call this API.
function allowCors(fn) {
    return async (req, res) => {
        res.setHeader('Access-Control-Allow-Credentials', true);
        // IMPORTANT: Replace this with your main app's Vercel URL in your environment variables
        res.setHeader('Access-Control-Allow-Origin', process.env.MAIN_APP_URL || 'http://localhost:3000');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader(
            'Access-control-allow-headers',
            'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
        );
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }
        return await fn(req, res);
    };
}

// --- Database and Auth ---
const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

function checkAuth(req) {
    const cookies = parse(req.headers.cookie || '');
    // Ensure you use the correct cookie name from your main app
    return cookies['phoenix_auth'] === 'true';
}

// --- Main Handler ---
async function handler(req, res) {
    if (!checkAuth(req)) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // --- GET Request: Fetch all forest data ---
    if (req.method === 'GET') {
        try {
            const { rows } = await db.execute("SELECT forest FROM user_state WHERE id = 1;");
            if (rows.length === 0) {
                return res.status(404).json({ message: 'User state not found.' });
            }
            const forest = JSON.parse(rows[0].forest || '[]');
            return res.status(200).json(forest);
        } catch (error) {
            console.error('Failed to fetch forest data:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }

    // --- POST Request: Buy a new sapling ---
    if (req.method === 'POST') {
        try {
            // Define the properties of the tree sapling
            const saplingItem = {
                id: 'sapling_of_patience',
                cost: 200,
                growthHours: 72 // 3 days to grow
            };

            // Fetch the complete user state needed for coin calculation
            const { rows: stateRows } = await db.execute("SELECT * FROM user_state WHERE id = 1;");
            if (stateRows.length === 0) {
                return res.status(404).json({ message: 'User state not found.' });
            }
            const state = stateRows[0];
            const forest = JSON.parse(state.forest || '[]');

            // --- Server-side Coin Calculation ---
            const totalHours = (Date.now() - new Date(state.lastRelapse).getTime()) / (1000 * 60 * 60);
            const streakCoins = totalHours > 0 ? Math.floor(10 * Math.pow(totalHours, 1.2)) : 0;
            const totalAvailableCoins = (state.coinsAtLastRelapse || 0) + streakCoins;

            if (totalAvailableCoins < saplingItem.cost) {
                return res.status(400).json({ message: 'Not enough coins.' });
            }

            // --- Process Purchase ---
            const finalCoinBalance = totalAvailableCoins - saplingItem.cost;
            const newCoinsAtLastRelapse = finalCoinBalance - streakCoins;

            const now = new Date();
            const matureDate = new Date(now.getTime() + saplingItem.growthHours * 60 * 60 * 1000);

            const newTree = {
                id: `tree_${Date.now()}`,
                plantDate: now.toISOString(),
                matureDate: matureDate.toISOString(),
                status: 'growing'
            };
            forest.push(newTree);

            // Update the database
            await db.execute({
                sql: "UPDATE user_state SET coinsAtLastRelapse = ?, forest = ? WHERE id = 1;",
                args: [newCoinsAtLastRelapse, JSON.stringify(forest)]
            });

            return res.status(200).json(forest);

        } catch (error) {
            console.error('Failed to purchase sapling:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }

    // Handle other methods
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
}

// Wrap the main handler with the CORS middleware
export default allowCors(handler);

