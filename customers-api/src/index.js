const express = require('express');
const customerRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use('/', customerRoutes);

app.get('/health', async (req, res) => {
    try {
        res.status(200).json({ status: 'ok', service: 'Customers API', db: 'connected' });
    } catch (error) {
        res.status(503).json({ status: 'error', service: 'Customers API', db: 'disconnected' });
    }
});

app.listen(PORT, () => {
    console.log(`Customers API running on port ${PORT}`);
});