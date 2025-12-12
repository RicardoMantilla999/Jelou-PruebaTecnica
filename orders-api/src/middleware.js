const simpleAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization token missing or invalid.' });
    }
    req.user = { id: 1, role: 'operator' };
    next();
};

function checkIdempotencyHeader(req, res, next) {
    const key =
        req.headers['x-idempotency-key'] ||
        req.headers['idempotency-key']; 

    if (!key) {
        return res.status(400).json({ message: 'Missing X-Idempotency-Key header.' });
    }

    req.idempotencyKey = key;
    next();
}
module.exports = {
    simpleAuth,
    checkIdempotencyHeader
};