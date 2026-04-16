// config/db.js — PostgreSQL Connection Pool
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('[DB] New client connected to PostgreSQL');
    }
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});

// Test connection on startup
pool.connect((err, client, release) => {
    if (err) {
        console.error('[DB] ❌ Connection failed:', err.message);
        return;
    }
    client.query('SELECT NOW()', (err, result) => {
        release();
        if (err) {
            console.error('[DB] ❌ Query test failed:', err.message);
        } else {
            console.log('[DB] ✅ PostgreSQL connected:', result.rows[0].now);
        }
    });
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
    // Transaction helper
    transaction: async (callback) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
};
