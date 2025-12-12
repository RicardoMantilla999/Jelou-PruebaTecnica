const simpleAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization token invalid.' });
    }

    const token = authHeader.split(' ')[1];
    
    if (token) {
        req.user = { id: 1, role: 'operator' };
        next();
    } else {
        return res.status(401).json({ message: 'Invalid token.' });
    }
};

const internalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const serviceToken = process.env.SERVICE_TOKEN;

    if (!authHeader || authHeader !== `Bearer ${serviceToken}`) {
        return res.status(403).json({ message: 'Forbidden. Invalid token.' });
    }
    
    next();
};

module.exports = {
    simpleAuth,
    internalAuth
};