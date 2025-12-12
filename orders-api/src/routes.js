const express = require('express');
const { z } = require('zod');
const { simpleAuth, checkIdempotencyHeader } = require('./middleware');
const { createOrder, cancelOrder } = require('./order-logic');
const { checkIdempotencyKey, saveIdempotentResponse } = require('./idempotency-logic');
const { query } = require('./db');

const router = express.Router();

// Esquema de validación para la creación de la orden
const createOrderSchema = z.object({
    customer_id: z.number().int().positive(),
    items: z.array(z.object({
        product_id: z.number().int().positive(),
        qty: z.number().int().positive()
    })).min(1)
});

// Esquema para productos (CRUD)
const productSchema = z.object({
    sku: z.string().min(3),
    name: z.string().min(3),
    price_cents: z.number().int().positive(),
    stock: z.number().int().min(0)
});

// Crear Productos
router.post('/products', simpleAuth, async (req, res) => {
    try {
        const { sku, name, price_cents, stock } = productSchema.parse(req.body);
        const result = await query(
            'INSERT INTO products (sku, name, price_cents, stock) VALUES (?, ?, ?, ?)',
            [sku, name, price_cents, stock]
        );
        res.status(201).json({ id: result.insertId, sku, name });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
        res.status(500).json({ message: 'Error creating product.' });
    }
});

// Buscar producto por id
router.get('/products/:id', simpleAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const [product] = await query('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) return res.status(404).json({ message: 'Product not found.' });
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching product.' });
    }
});

// Rutas de Órdenes
// Crear orden
router.post('/orders', simpleAuth, async (req, res) => {
    try {
        const { customer_id, items } = createOrderSchema.parse(req.body);

        const result = await createOrder(customer_id, items);

        res.status(201).json({
            message: 'Order created successfully and stock reserved.',
            order: {
                id: result.order_id,
                customer_id: customer_id,
                status: 'CREATED',
                total_cents: result.total_cents,
                items: result.items
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: 'Validation failed', errors: error.errors });
        }
        const status = error.message.includes('stock') || error.message.includes('not found') ? 400 : 500;
        res.status(status).json({ message: error.message });
    }
});

// Confirma orden
router.post('/orders/:id/confirm', simpleAuth, checkIdempotencyHeader, async (req, res) => {
    const { id: orderId } = req.params;
    const idempotencyKey = req.idempotencyKey;


    try {
        // Verificar Idempotencia
        const check = await checkIdempotencyKey(idempotencyKey);
        if (check.isDuplicate) {
            return res.status(check.response_status).json(check.response_body);
        }

        const [order] = await query('SELECT id, status, total_cents FROM orders WHERE id = ?', [orderId]);

        if (!order) {
            const errorResponse = { id: orderId, message: 'Order not found.' };
            await saveIdempotentResponse(idempotencyKey, orderId, errorResponse, 404);
            return res.status(404).json(errorResponse);
        }

        if (order.status === 'CONFIRMED') {
            const successResponse = { id: orderId, status: 'CONFIRMED', message: 'Order was already confirmed.' };
            await saveIdempotentResponse(idempotencyKey, orderId, successResponse, 200);
            return res.status(200).json(successResponse);
        }

        if (order.status === 'CANCELED') {
            const errorResponse = { id: orderId, status: 'CANCELED', message: 'Cannot confirm a canceled order.' };
            await saveIdempotentResponse(idempotencyKey, orderId, errorResponse, 400);
            return res.status(400).json(errorResponse);
        }

        // Cambiar estado a CONFIRMED
        await query('UPDATE orders SET status = ? WHERE id = ?', ['CONFIRMED', orderId]);

        // Guardar Respuesta de Éxito 
        const finalResponse = { id: orderId, status: 'CONFIRMED', total_cents: order.total_cents };
        await saveIdempotentResponse(idempotencyKey, orderId, finalResponse, 200);

        res.status(200).json(finalResponse);

    } catch (error) {
        console.error("DETALLE CRÍTICO DEL FALLO:", error);

        // Guardar error como respuesta idempotente
        await saveIdempotentResponse(
            req.idempotencyKey,
            orderId,
            { message: 'Error confirming order', error: error.message },
            500
        );

        return res.status(500).json({ message: 'Error confirming order', error: error.message });
    }
});

// Cancela orden
router.post('/orders/:id/cancel', simpleAuth, async (req, res) => {
    const { id: orderId } = req.params;
    try {
        const result = await cancelOrder(orderId);
        res.status(200).json(result);
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 500;
        res.status(status).json({ message: error.message });
    }
});


// Obtener orden
router.get('/orders/:id', simpleAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const [order] = await query('SELECT * FROM orders WHERE id = ?', [id]);
        if (!order) return res.status(404).json({ message: 'Order not found.' });

        const items = await query('SELECT product_id, qty, unit_price_cents FROM order_items WHERE order_id = ?', [id]);

        res.json({ ...order, items: items });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching order.' });
    }
});


module.exports = router;