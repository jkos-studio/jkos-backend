// routes/transactions.js — Full CRUD API for Transactions
const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

// ─── GET /api/transactions ────────────────────────────────────
// Query params: page, limit, type, category, month, search, startDate, endDate
router.get('/', async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 50,
            type,
            category,
            month,       // format: YYYY-MM
            search,
            startDate,
            endDate,
            sortBy = 'date',
            order = 'DESC'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const params = [];
        const conditions = ['t.deleted_at IS NULL'];

        if (type)      { params.push(type);       conditions.push(`t.type = $${params.length}`); }
        if (category)  { params.push(category);   conditions.push(`t.category_code = $${params.length}`); }
        if (month)     { params.push(month);       conditions.push(`TO_CHAR(t.date, 'YYYY-MM') = $${params.length}`); }
        if (startDate) { params.push(startDate);   conditions.push(`t.date >= $${params.length}`); }
        if (endDate)   { params.push(endDate);     conditions.push(`t.date <= $${params.length}`); }
        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(t.description ILIKE $${params.length} OR t.notes ILIKE $${params.length})`);
        }

        const where = conditions.join(' AND ');
        const orderClause = `${sortBy === 'amount' ? 't.amount' : 't.date'} ${order === 'ASC' ? 'ASC' : 'DESC'}`;

        // Count query
        const countResult = await db.query(
            `SELECT COUNT(*) FROM transactions t WHERE ${where}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Data query
        params.push(parseInt(limit), offset);
        const result = await db.query(
            `SELECT 
                t.id, t.date, t.type, t.category_code,
                c.name_th AS category_name_th,
                c.name_en AS category_name_en,
                c.icon    AS category_icon,
                t.description, t.amount, t.payment_method,
                t.status, t.is_recurring, t.tags, t.notes,
                t.priority, t.source, t.created_at
            FROM transactions t
            LEFT JOIN categories c ON c.code = t.category_code
            WHERE ${where}
            ORDER BY ${orderClause}
            LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        res.json({
            success: true,
            data: result.rows,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) { next(err); }
});

// ─── GET /api/transactions/:id ────────────────────────────────
router.get('/:id', async (req, res, next) => {
    try {
        const result = await db.query(
            `SELECT t.*, c.name_th, c.name_en, c.icon
             FROM transactions t
             LEFT JOIN categories c ON c.code = t.category_code
             WHERE t.id = $1 AND t.deleted_at IS NULL`,
            [req.params.id]
        );
        if (!result.rows.length) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
});

// ─── POST /api/transactions ───────────────────────────────────
router.post('/', async (req, res, next) => {
    try {
        const {
            date, type, category_code, description, amount,
            payment_method = 'Cash', status = 'Paid',
            account_id, is_recurring = false, recurring_day,
            tags, notes, priority = 'Medium'
        } = req.body;

        // Validation
        if (!date || !type || !description || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: date, type, description, amount'
            });
        }
        if (!['Income', 'Expenses', 'Savings'].includes(type)) {
            return res.status(400).json({ success: false, error: 'Invalid type' });
        }
        if (parseFloat(amount) < 0) {
            return res.status(400).json({ success: false, error: 'Amount cannot be negative' });
        }

        const result = await db.query(
            `INSERT INTO transactions
             (date, type, category_code, description, amount, payment_method,
              status, account_id, is_recurring, recurring_day, tags, notes, priority, source)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'webapp')
             RETURNING *`,
            [date, type, category_code, description, parseFloat(amount),
             payment_method, status, account_id || null, is_recurring,
             recurring_day || null, tags || null, notes || null, priority]
        );

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
});

// ─── PUT /api/transactions/:id ────────────────────────────────
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const fields = req.body;
        const allowed = ['date','type','category_code','description','amount',
                         'payment_method','status','is_recurring','tags','notes','priority'];

        const updates = [];
        const params  = [];
        allowed.forEach(f => {
            if (fields[f] !== undefined) {
                params.push(fields[f]);
                updates.push(`${f} = $${params.length}`);
            }
        });

        if (!updates.length) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        params.push(id);
        const result = await db.query(
            `UPDATE transactions SET ${updates.join(', ')} 
             WHERE id = $${params.length} AND deleted_at IS NULL
             RETURNING *`,
            params
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
});

// ─── DELETE /api/transactions/:id (Soft Delete) ───────────────
router.delete('/:id', async (req, res, next) => {
    try {
        const result = await db.query(
            `UPDATE transactions SET deleted_at = NOW()
             WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
            [req.params.id]
        );
        if (!result.rows.length) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }
        res.json({ success: true, message: 'Transaction deleted', id: req.params.id });
    } catch (err) { next(err); }
});

// ─── POST /api/transactions/bulk-delete ──────────────────────
router.post('/bulk-delete', async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const result = await db.query(
            `UPDATE transactions SET deleted_at = NOW()
             WHERE id = ANY($1) AND deleted_at IS NULL`,
            [ids]
        );
        res.json({ success: true, deleted: result.rowCount });
    } catch (err) { next(err); }
});

module.exports = router;
