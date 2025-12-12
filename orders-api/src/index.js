require('dotenv').config();
const express = require('express');
const orderRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());
app.use('/', orderRoutes);

app.get('/health', async (req, res) => {
    try {
        res.status(200).json({ status: 'ok', service: 'Orders API', db: 'connected' });
    } catch (error) {
        res.status(503).json({ status: 'error', service: 'Orders API', db: 'disconnected' });
    }
});

app.listen(PORT, () => {
    console.log(`Orders API running on port ${PORT}`);
});