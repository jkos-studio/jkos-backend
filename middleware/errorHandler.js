// middleware/errorHandler.js
function errorHandler(err, req, res, next) {
    console.error('[ERROR]', err.message, err.stack?.split('\n')[1]);

    if (err.code === '23505') { // PostgreSQL unique violation
        return res.status(409).json({ success: false, error: 'Duplicate entry', detail: err.detail });
    }
    if (err.code === '23503') { // FK violation
        return res.status(400).json({ success: false, error: 'Reference not found', detail: err.detail });
    }

    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

module.exports = { errorHandler };
