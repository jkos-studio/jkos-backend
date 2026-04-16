// scripts/migrate-csv.js
// Run: node scripts/migrate-csv.js <path-to-csv>
// ============================================================
require('dotenv').config();
const fs   = require('fs');
const csv  = require('csv-parse/sync');
const db   = require('../config/db');

const CATEGORY_MAP = {
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

async function migrate() {
    const filePath = process.argv[2] || './Financial_Tracking_2023_-_Apr__2024_-_DT-01.csv';

    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }

    console.log(`\n🚀 JKOS Migration Script`);
    console.log(`📂 File: ${filePath}`);
    console.log(`🔌 DB: ${process.env.DATABASE_URL?.split('@')[1]}\n`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const records = csv.parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
    });

    console.log(`📊 Found ${records.length} records. Starting migration...\n`);

    let inserted = 0, skipped = 0, errors = 0;
    const batchSize = 100;

    // Process in batches using transactions
    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        try {
            await db.transaction(async (client) => {
                for (const row of batch) {
                    try {
                        const date   = row.Date?.trim();
                        const type   = row.Type?.trim();
                        const rawCat = row.Category?.trim();
                        const desc   = row.Description?.trim();
                        const amount = parseFloat(String(row.Amount || '0').replace(/,/g, ''));

                        if (!date || !type || isNaN(amount)) { skipped++; return; }

                        const categoryCode = CATEGORY_MAP[rawCat] || null;
                        const externalId   = `migration_${date}_${type}_${rawCat}_${desc?.substring(0,20)}_${amount}`;

                        await client.query(
                            `INSERT INTO transactions
                             (date, type, category_code, description, amount,
                              source, external_id, status, payment_method)
                             VALUES ($1,$2,$3,$4,$5,'csv_migration',$6,'Paid','Cash')
                             ON CONFLICT DO NOTHING`,
                            [date, type, categoryCode, desc || '', amount, externalId]
                        );
                        inserted++;
                    } catch (err) {
                        console.error(`  ❌ Row error: ${err.message}`);
                        errors++;
                    }
                }
            });
            process.stdout.write(`  ✅ Batch ${Math.floor(i/batchSize)+1}: ${Math.min(i+batchSize, records.length)}/${records.length}\r`);
        } catch (err) {
            console.error(`\n  ❌ Batch failed: ${err.message}`);
        }
    }

    console.log(`\n\n══════════════════════════════════`);
    console.log(`✅ Migration Complete!`);
    console.log(`   Inserted : ${inserted}`);
    console.log(`   Skipped  : ${skipped}`);
    console.log(`   Errors   : ${errors}`);
    console.log(`══════════════════════════════════\n`);

    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
