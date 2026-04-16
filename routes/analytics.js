// routes/analytics.js — Financial Analytics Endpoints
const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

// ─── GET /api/analytics/summary ──────────────────────────────
// Overall summary (optional ?year=2023)
router.get('/summary', async (req, res, next) => {
    try {
        const { year } = req.query;
        const params = [];
        const yearClause = year
            ? `AND EXTRACT(YEAR FROM date) = $${params.push(parseInt(year))}`
            : '';

        const result = await db.query(
            `SELECT
                SUM(CASE WHEN type='Income'   THEN amount ELSE 0 END) AS total_income,
                SUM(CASE WHEN type='Expenses' THEN amount ELSE 0 END) AS total_expenses,
                SUM(CASE WHEN type='Savings'  THEN amount ELSE 0 END) AS total_savings,
                SUM(CASE WHEN type='Income'   THEN amount ELSE 0 END) -
                SUM(CASE WHEN type='Expenses' THEN amount ELSE 0 END) AS net_cashflow,
                COUNT(*) AS total_transactions,
                COUNT(DISTINCT DATE_TRUNC('month', date)) AS months_tracked,
                AVG(CASE WHEN type='Expenses' THEN amount END) AS avg_expense_per_tx,
                MIN(date) AS date_from,
                MAX(date) AS date_to
            FROM transactions
            WHERE deleted_at IS NULL ${yearClause}`,
            params
        );

        const row = result.rows[0];
        const savingsRate = row.total_income > 0
            ? ((row.total_savings / row.total_income) * 100).toFixed(2)
            : 0;
        const expenseRatio = row.total_income > 0
            ? ((row.total_expenses / row.total_income) * 100).toFixed(2)
            : 0;

        res.json({
            success: true,
            data: {
                ...row,
                savings_rate: parseFloat(savingsRate),
                expense_ratio: parseFloat(expenseRatio),
                total_income: parseFloat(row.total_income || 0),
                total_expenses: parseFloat(row.total_expenses || 0),
                total_savings: parseFloat(row.total_savings || 0),
                net_cashflow: parseFloat(row.net_cashflow || 0),
            }
        });
    } catch (err) { next(err); }
});

// ─── GET /api/analytics/monthly ──────────────────────────────
router.get('/monthly', async (req, res, next) => {
    try {
        const { year } = req.query;
        const params = [];
        const yearClause = year
            ? `AND EXTRACT(YEAR FROM date) = $${params.push(parseInt(year))}`
            : '';

        const result = await db.query(
            `SELECT
                TO_CHAR(date, 'YYYY-MM') AS month,
                SUM(CASE WHEN type='Income'   THEN amount ELSE 0 END) AS income,
                SUM(CASE WHEN type='Expenses' THEN amount ELSE 0 END) AS expenses,
                SUM(CASE WHEN type='Savings'  THEN amount ELSE 0 END) AS savings,
                SUM(CASE WHEN type='Income' THEN amount ELSE 0 END) -
                SUM(CASE WHEN type='Expenses' THEN amount ELSE 0 END) AS net_cashflow,
                COUNT(*) AS transaction_count
            FROM transactions
            WHERE deleted_at IS NULL ${yearClause}
            GROUP BY TO_CHAR(date, 'YYYY-MM')
            ORDER BY month`,
            params
        );
        res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
});

// ─── GET /api/analytics/categories ───────────────────────────
// ?type=Expenses&month=2023-10
router.get('/categories', async (req, res, next) => {
    try {
        const { type = 'Expenses', month, year } = req.query;
        const params = [type];
        const extras = [];

        if (month) { params.push(month); extras.push(`TO_CHAR(t.date,'YYYY-MM') = $${params.length}`); }
        if (year)  { params.push(parseInt(year)); extras.push(`EXTRACT(YEAR FROM t.date) = $${params.length}`); }

        const where = extras.length ? 'AND ' + extras.join(' AND ') : '';

        const result = await db.query(
            `SELECT
                t.category_code,
                c.name_th, c.name_en, c.icon, c.color,
                COUNT(t.id) AS transaction_count,
                SUM(t.amount) AS total,
                AVG(t.amount) AS average,
                MAX(t.amount) AS max_amount,
                MIN(t.amount) AS min_amount
            FROM transactions t
            LEFT JOIN categories c ON c.code = t.category_code
            WHERE t.deleted_at IS NULL AND t.type = $1 ${where}
            GROUP BY t.category_code, c.name_th, c.name_en, c.icon, c.color
            ORDER BY total DESC`,
            params
        );

        const total = result.rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
        const data  = result.rows.map(r => ({
            ...r,
            total: parseFloat(r.total || 0),
            average: parseFloat(r.average || 0),
            percentage: total > 0 ? parseFloat(((parseFloat(r.total) / total) * 100).toFixed(2)) : 0
        }));

        res.json({ success: true, data, meta: { grand_total: total } });
    } catch (err) { next(err); }
});

// ─── GET /api/analytics/cashflow-trend ───────────────────────
router.get('/cashflow-trend', async (req, res, next) => {
    try {
        const { months = 12 } = req.query;
        const result = await db.query(
            `SELECT
                TO_CHAR(date, 'YYYY-MM') AS month,
                SUM(CASE WHEN type='Income'   THEN amount ELSE 0 END) AS income,
                SUM(CASE WHEN type='Expenses' THEN amount ELSE 0 END) AS expenses,
                SUM(CASE WHEN type='Income' THEN amount ELSE 0 END) -
                SUM(CASE WHEN type='Expenses' THEN amount ELSE 0 END) AS net
            FROM transactions
            WHERE deleted_at IS NULL
              AND date >= NOW() - INTERVAL '${parseInt(months)} months'
            GROUP BY TO_CHAR(date, 'YYYY-MM')
            ORDER BY month`
        );
        res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
});

// ─── GET /api/analytics/top-expenses ─────────────────────────
router.get('/top-expenses', async (req, res, next) => {
    try {
        const { limit = 10, month } = req.query;
        const params = [parseInt(limit)];
        const monthClause = month
            ? `AND TO_CHAR(date,'YYYY-MM') = $${params.push(month)}`
            : '';

        const result = await db.query(
            `SELECT date, category_code, description, amount
             FROM transactions
             WHERE deleted_at IS NULL AND type = 'Expenses' ${monthClause}
             ORDER BY amount DESC
             LIMIT $1`,
            params
        );
        res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
});

// ─── GET /api/analytics/kpis ─────────────────────────────────
router.get('/kpis', async (req, res, next) => {
    try {
        // Current month vs last month comparison
        const result = await db.query(`
            WITH current_month AS (
                SELECT
                    SUM(CASE WHEN type='Income'   THEN amount ELSE 0 END) AS income,
                    SUM(CASE WHEN type='Expenses' THEN amount ELSE 0 END) AS expenses
                FROM transactions
                WHERE deleted_at IS NULL
                  AND DATE_TRUNC('month', date) = DATE_TRUNC('month', NOW())
            ),
            last_month AS (
                SELECT
                    SUM(CASE WHEN type='Income'   THEN amount ELSE 0 END) AS income,
                    SUM(CASE WHEN type='Expenses' THEN amount ELSE 0 END) AS expenses
                FROM transactions
                WHERE deleted_at IS NULL
                  AND DATE_TRUNC('month', date) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
            )
            SELECT
                cm.income  AS current_income,
                cm.expenses AS current_expenses,
                lm.income  AS last_income,
                lm.expenses AS last_expenses,
                CASE WHEN lm.income > 0
                     THEN ROUND(((cm.income - lm.income) / lm.income * 100)::NUMERIC, 2)
                     ELSE 0 END AS income_change_pct,
                CASE WHEN lm.expenses > 0
                     THEN ROUND(((cm.expenses - lm.expenses) / lm.expenses * 100)::NUMERIC, 2)
                     ELSE 0 END AS expenses_change_pct
            FROM current_month cm, last_month lm
        `);
        res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
});

module.exports = router;
