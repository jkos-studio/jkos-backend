// routes/sync.js — Google Sheets Sync API Endpoints
const express  = require('express');
const router   = express.Router();
const { pullFromSheets, pushToSheets, getSyncHistory } = require('../sync/googleSheets');

// POST /api/sync/pull — Pull from Google Sheets → DB
router.post('/pull', async (req, res, next) => {
    try {
        const { sheetId, sheetName = 'Sheet1', skipExisting = true } = req.body;
        if (!sheetId) {
            return res.status(400).json({ success: false, error: 'sheetId is required' });
        }
        const result = await pullFromSheets(sheetId, sheetName, { skipExisting });
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// POST /api/sync/push — Push DB → Google Sheets
router.post('/push', async (req, res, next) => {
    try {
        const { sheetId, sheetName = 'JKOS_Export', startDate, endDate, clearFirst } = req.body;
        if (!sheetId) {
            return res.status(400).json({ success: false, error: 'sheetId is required' });
        }
        const result = await pushToSheets(sheetId, sheetName, { startDate, endDate, clearFirst });
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// GET /api/sync/history
router.get('/history', async (req, res, next) => {
    try {
        const { limit = 20 } = req.query;
        const history = await getSyncHistory(parseInt(limit));
        res.json({ success: true, data: history });
    } catch (err) { next(err); }
});

module.exports = router;
