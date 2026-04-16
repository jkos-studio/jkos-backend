// routes/import.js — CSV/Excel Import API
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const csv      = require('csv-parse/sync');
const db       = require('../config/db');
const { CATEGORY_LEGACY_MAP } = require('../sync/googleSheets');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (['text/csv', 'application/vnd.ms-excel',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
             'text/plain'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV and Excel files are allowed'));
        }
    }
});

// POST /api/import/csv
// Accepts: multipart/form-data with field "file"
router.post('/csv', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const content  = req.file.buffer.toString('utf-8');
        const records  = csv.parse(content, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            bom: true,
        });

        let inserted = 0, skipped = 0, errors = [];

        for (const [idx, row] of records.entries()) {
            try {
                // Support both "Date" and "date" column names
                const rawDate   = row.Date || row.date || row.DATE;
                const type      = row.Type || row.type || row.TYPE;
                const rawCat    = row.Category || row.category;
                const desc      = row.Description || row.description;
                const rawAmount = row.Amount || row.amount;

                if (!rawDate || !type || !rawAmount) { skipped++; continue; }

                const date   = parseImportDate(rawDate);
                const amount = parseFloat(String(rawAmount).replace(/,/g, ''));

                if (!date || isNaN(amount)) { skipped++; continue; }
                if (!['Income','Expenses','Savings'].includes(type)) { skipped++; continue; }

                const categoryCode = CATEGORY_LEGACY_MAP[rawCat] || null;
                const externalId   = `csv_${date}_${type}_${rawCat}_${desc?.substring(0,15)}_${amount}`;

                await db.query(
                    `INSERT INTO transactions
                     (date, type, category_code, description, amount, source, external_id, status)
                     VALUES ($1,$2,$3,$4,$5,'csv_import',$6,'Paid')
                     ON CONFLICT DO NOTHING`,
                    [date, type, categoryCode, desc || '', amount, externalId]
                );
                inserted++;
            } catch (err) {
                errors.push({ row: idx + 2, error: err.message });
            }
        }

        res.json({
            success: true,
            data: {
                total:    records.length,
                inserted,
                skipped,
                errors:   errors.slice(0, 20) // limit error list
            }
        });
    } catch (err) { next(err); }
});

// GET /api/import/template — Download CSV template
router.get('/template', (req, res) => {
    const template = [
        'Date,Type,Category,Description,Amount',
        '2026-01-31,Income,Salary,เงินเดือน เดือน มกราคม,25000',
        '2026-01-31,Expenses,Family,พ่อ,2500',
        '2026-01-31,Expenses,Food & beverage,ข้าวกลางวัน,120',
        '2026-01-31,Savings,Stocks%,SCB GOLD,1000',
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=jkos_import_template.csv');
    res.send('\uFEFF' + template); // BOM for Thai encoding
});

function parseImportDate(raw) {
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
        const year = m[3].length === 2 ? '20' + m[3] : m[3];
        return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }
    return null;
}

module.exports = router;
