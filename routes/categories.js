// routes/categories.js
const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

router.get('/', async (req, res, next) => {
    try {
        const { type } = req.query;
        const params = [];
        const where = type ? `WHERE type = $${params.push(type)}` : '';
        const result = await db.query(`SELECT * FROM categories ${where} ORDER BY type, name_th`, params);
        res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        const { code, name_th, name_en, type, icon, color, parent_code } = req.body;
        const result = await db.query(
            `INSERT INTO categories (code,name_th,name_en,type,icon,color,parent_code)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [code, name_th, name_en, type, icon, color, parent_code]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
});

module.exports = router;
