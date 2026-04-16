// routes/goals.js
const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

router.get('/', async (req, res, next) => {
    try {
        const result = await db.query(`SELECT *, ROUND((current_amount/target_amount*100)::NUMERIC,1) AS progress_pct FROM goals ORDER BY created_at`);
        res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        const { name, target_amount, deadline, icon, color } = req.body;
        const result = await db.query(
            `INSERT INTO goals (name, target_amount, deadline, icon, color) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [name, target_amount, deadline, icon, color]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
});

router.patch('/:id/deposit', async (req, res, next) => {
    try {
        const { amount } = req.body;
        const result = await db.query(
            `UPDATE goals SET current_amount = LEAST(current_amount + $1, target_amount),
             is_completed = (current_amount + $1 >= target_amount) WHERE id = $2 RETURNING *`,
            [parseFloat(amount), req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ success: false, error: 'Goal not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
});

module.exports = router;
