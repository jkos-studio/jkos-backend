// sync/googleSheets.js — Bidirectional Google Sheets Sync
// Requires: google-auth-library, googleapis
// ============================================================
const { google }    = require('googleapis');
const db            = require('../config/db');

// ─── Auth Setup ───────────────────────────────────────────────
function getGoogleAuth() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
}

// ─── Sheet Column Mapping ─────────────────────────────────────
// Maps your Google Sheet columns → DB fields
// Adjust column order to match your actual sheet
const COLUMN_MAP = {
    A: 'date',           // 2023-01-01
    B: 'type',           // Income / Expenses / Savings
    C: 'category_code',  // Revenue, Salary, Private...
    D: 'description',    // รายละเอียด
    E: 'amount',         // 1000.00
};

const CATEGORY_LEGACY_MAP = {
    'Private':        'PERSONAL',
    'Family':         'FAMILY',
    'Pay (Other)':    'LENDING',
    'Revenue':        'BUSINESS',
    'Food & beverage':'FOOD',
    'Salary':         'SALARY',
    'Credit-':        'DEBT_PAY',
    'Credit+':        'CREDIT_IN',
    'Stocks%':        'STOCKS',
    'Service':        'SERVICE_INC',
    'Travel':         'TRAVEL',
    'Reserve':        'LENDING',
    'Gifts%':         'GOLD',
    'Insurance':      'INSURANCE',
    'Bonus':          'BONUS',
    'Tax':            'TAX_FEE',
    'Savings%':       'EMERGENCY',
    'Family%':        'FAMILY_SAVE',
};

// ─── PULL: Google Sheets → PostgreSQL ─────────────────────────
async function pullFromSheets(sheetId, sheetName = 'Sheet1', options = {}) {
    const { skipExisting = true, batchSize = 500 } = options;
    const syncLogId = await createSyncLog(sheetId, 'pull');

    try {
        const auth    = getGoogleAuth();
        const sheets  = google.sheets({ version: 'v4', auth });

        // Fetch all data from sheet
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `${sheetName}!A:E`,
        });

        const rows = response.data.values || [];
        if (rows.length <= 1) {
            await updateSyncLog(syncLogId, 'success', 0, 0, 0);
            return { inserted: 0, updated: 0, skipped: 0 };
        }

        // Skip header row
        const dataRows = rows.slice(1).filter(r => r[0] && r[1] && r[4]);

        let inserted = 0, updated = 0, skipped = 0;

        // Process in batches
        for (let i = 0; i < dataRows.length; i += batchSize) {
            const batch = dataRows.slice(i, i + batchSize);
            const result = await processBatch(batch, skipExisting);
            inserted += result.inserted;
            updated  += result.updated;
            skipped  += result.skipped;
        }

        await updateSyncLog(syncLogId, 'success', dataRows.length, inserted, updated, skipped);
        console.log(`[SYNC] Pull complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);
        return { inserted, updated, skipped };

    } catch (err) {
        await updateSyncLog(syncLogId, 'failed', 0, 0, 0, 0, err.message);
        throw err;
    }
}

// ─── Batch Insert/Update ──────────────────────────────────────
async function processBatch(rows, skipExisting) {
    let inserted = 0, updated = 0, skipped = 0;

    for (const row of rows) {
        try {
            const [rawDate, type, rawCat, description, rawAmount] = row;

            // Parse & validate
            const date = parseDate(rawDate);
            if (!date) { skipped++; continue; }

            const amount = parseFloat(String(rawAmount).replace(/,/g, ''));
            if (isNaN(amount)) { skipped++; continue; }

            const validTypes = ['Income', 'Expenses', 'Savings'];
            if (!validTypes.includes(type)) { skipped++; continue; }

            // Map old category to new schema
            const categoryCode = CATEGORY_LEGACY_MAP[rawCat] || null;

            // Create a deterministic external_id for dedup
            const externalId = `sheet_${date}_${type}_${rawCat}_${description?.substring(0,20)}_${amount}`;

            if (skipExisting) {
                const exists = await db.query(
                    `SELECT id FROM transactions WHERE external_id = $1 AND source = 'sheets_sync'`,
                    [externalId]
                );
                if (exists.rows.length > 0) { skipped++; continue; }
            }

            await db.query(
                `INSERT INTO transactions
                 (date, type, category_code, description, amount, source, external_id, status)
                 VALUES ($1, $2, $3, $4, $5, 'sheets_sync', $6, 'Paid')
                 ON CONFLICT (external_id) WHERE source = 'sheets_sync'
                 DO UPDATE SET
                     amount      = EXCLUDED.amount,
                     description = EXCLUDED.description,
                     updated_at  = NOW()`,
                [date, type, categoryCode, description || '', amount, externalId]
            );
            inserted++;
        } catch (err) {
            console.error('[SYNC] Row error:', err.message, row);
            skipped++;
        }
    }

    return { inserted, updated, skipped };
}

// ─── PUSH: PostgreSQL → Google Sheets ─────────────────────────
async function pushToSheets(sheetId, sheetName = 'JKOS_Export', options = {}) {
    const { startDate, endDate, clearFirst = false } = options;
    const syncLogId = await createSyncLog(sheetId, 'push');

    try {
        const auth   = getGoogleAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        // Fetch data from DB
        const params = [];
        const conditions = ['deleted_at IS NULL'];
        if (startDate) { params.push(startDate); conditions.push(`date >= $${params.length}`); }
        if (endDate)   { params.push(endDate);   conditions.push(`date <= $${params.length}`); }

        const result = await db.query(
            `SELECT
                t.date, t.type, t.category_code,
                c.name_th AS category_th,
                t.description, t.amount,
                t.payment_method, t.status, t.notes
             FROM transactions t
             LEFT JOIN categories c ON c.code = t.category_code
             WHERE ${conditions.join(' AND ')}
             ORDER BY t.date, t.created_at`,
            params
        );

        // Build rows: Header + Data
        const header = [['Date','Type','Category (Code)','Category (TH)','Description','Amount','Payment','Status','Notes']];
        const dataRows = result.rows.map(r => [
            r.date,
            r.type,
            r.category_code || '',
            r.category_th   || '',
            r.description,
            r.amount,
            r.payment_method,
            r.status,
            r.notes || ''
        ]);
        const allRows = [...header, ...dataRows];

        // Clear sheet if requested
        if (clearFirst) {
            await sheets.spreadsheets.values.clear({
                spreadsheetId: sheetId,
                range: `${sheetName}!A:Z`,
            });
        }

        // Write to sheet
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: allRows },
        });

        await updateSyncLog(syncLogId, 'success', dataRows.length, dataRows.length, 0);
        console.log(`[SYNC] Push complete: ${dataRows.length} rows written to sheet`);
        return { rows_written: dataRows.length };

    } catch (err) {
        await updateSyncLog(syncLogId, 'failed', 0, 0, 0, 0, err.message);
        throw err;
    }
}

// ─── Parse Date helper ────────────────────────────────────────
function parseDate(raw) {
    if (!raw) return null;
    const str = String(raw).trim();
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // Try DD/MM/YYYY or DD-MM-YYYY
    const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
        const [, d, m, y] = match;
        const year = y.length === 2 ? '20' + y : y;
        return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    // Try serial date (Excel format) → real date
    if (/^\d{5}$/.test(str)) {
        const excelEpoch = new Date(1900, 0, 1);
        const d = new Date(excelEpoch.getTime() + (parseInt(str) - 2) * 86400000);
        return d.toISOString().split('T')[0];
    }
    return null;
}

// ─── Sync Log Helpers ─────────────────────────────────────────
async function createSyncLog(sheetId, syncType) {
    const result = await db.query(
        `INSERT INTO sheets_sync_log (sheet_id, sync_type, status)
         VALUES ($1, $2, 'running') RETURNING id`,
        [sheetId, syncType]
    );
    return result.rows[0].id;
}

async function updateSyncLog(id, status, processed, ins, upd, skip = 0, error = null) {
    await db.query(
        `UPDATE sheets_sync_log SET
             status          = $1,
             rows_processed  = $2,
             rows_inserted   = $3,
             rows_updated    = $4,
             rows_skipped    = $5,
             error_message   = $6,
             completed_at    = NOW()
         WHERE id = $7`,
        [status, processed, ins, upd, skip, error, id]
    );
}

// ─── Get sync history ─────────────────────────────────────────
async function getSyncHistory(limit = 20) {
    const result = await db.query(
        `SELECT * FROM sheets_sync_log
         ORDER BY started_at DESC LIMIT $1`,
        [limit]
    );
    return result.rows;
}

module.exports = { pullFromSheets, pushToSheets, getSyncHistory, CATEGORY_LEGACY_MAP };
