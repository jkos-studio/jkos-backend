// ============================================================
// JKOS Financial Mainframe — Backend API Server
// Node.js + Express + PostgreSQL
// ============================================================
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const transactionsRouter = require('./routes/transactions');
const analyticsRouter    = require('./routes/analytics');
const categoriesRouter   = require('./routes/categories');
const accountsRouter     = require('./routes/accounts');
const syncRouter         = require('./routes/sync');
const goalsRouter        = require('./routes/goals');
const importRouter       = require('./routes/import');

const { errorHandler } = require('./middleware/errorHandler');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Security ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
}));

// ─── Rate Limiting ────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 500,
    message: { error: 'Too many requests. Slow down, Agent Prime.' }
});
app.use('/api/', limiter);

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Health Check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'ONLINE',
        system: 'JKOS Financial Mainframe v2.6',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/transactions', authMiddleware, transactionsRouter);
app.use('/api/analytics',    authMiddleware, analyticsRouter);
app.use('/api/categories',   authMiddleware, categoriesRouter);
app.use('/api/accounts',     authMiddleware, accountsRouter);
app.use('/api/sync',         authMiddleware, syncRouter);
app.use('/api/goals',        authMiddleware, goalsRouter);
app.use('/api/import',       authMiddleware, importRouter);

// ─── Error Handler ────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║  JKOS FINANCIAL MAINFRAME — API ONLINE   ║
║  Port: ${PORT}  | Env: ${process.env.NODE_ENV || 'development'}          ║
╚══════════════════════════════════════════╝`);
});

module.exports = app;
