// routes/accounts.js
const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

router.get('/', async (req, res, next) => {
    try {
        const result = await db.query(`SELECT * FROM accounts WHERE is_active = TRUE ORDER BY name`);
        res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        const { name, type, bank, balance, currency = 'THB' } = req.body;
        const result = await db.query(
            `INSERT INTO accounts (name,type,bank,balance,currency) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [name, type, bank, balance || 0, currency]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
});

router.patch('/:id/balance', async (req, res, next) => {
    try {
        const result = await db.query(
            `UPDATE accounts SET balance = $1 WHERE id = $2 RETURNING *`,
            [req.body.balance, req.params.id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
});

module.exports = router;
