// middleware/auth.js — Simple JWT Auth Middleware
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
    // Skip auth in development if configured
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
        req.user = { id: 'dev-user', role: 'admin' };
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Authorization token required'
        });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
}

module.exports = { authMiddleware };
