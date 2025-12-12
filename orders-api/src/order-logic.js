const axios = require('axios');
const { pool } = require('./db');
const CUSTOMERS_API_URL = process.env.CUSTOMERS_API_URL;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

//creaccion transaccional de orden
async function createOrder(customer_id, items) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // Validar Cliente 
        const customerResponse = await axios.get(
            `${CUSTOMERS_API_URL}/customers/${customer_id}`,
            { headers: { Authorization: `Bearer ${SERVICE_TOKEN}` } }
        );
        const customer = customerResponse.data;

        // Verificar stock y calcular totales
        let total_cents = 0;
        const orderItemsData = [];
        
        for (const item of items) {
            const [product] = await connection.execute('SELECT id, price_cents, stock FROM products WHERE id = ? FOR UPDATE', [item.product_id]);
            
            if (product.length === 0) {
                throw new Error(`Product ID ${item.product_id} not found.`);
            }
            if (product[0].stock < item.qty) {
                throw new Error(`Insufficient stock for Product ID ${item.product_id}. Available: ${product[0].stock}, Requested: ${item.qty}.`);
            }
            
            const unit_price_cents = product[0].price_cents;
            const subtotal_cents = unit_price_cents * item.qty;
            total_cents += subtotal_cents;

            orderItemsData.push({ ...item, unit_price_cents, subtotal_cents });
        }

        // Crear la Orden (Estado CREATED)
        const [orderResult] = await connection.execute(
            'INSERT INTO orders (customer_id, status, total_cents) VALUES (?, ?, ?)',
            [customer_id, 'CREATED', total_cents]
        );
        const order_id = orderResult.insertId;

        // Insertar los Items de la Orden y Descontar Stock
        for (const itemData of orderItemsData) {
            await connection.execute(
                'INSERT INTO order_items (order_id, product_id, qty, unit_price_cents, subtotal_cents) VALUES (?, ?, ?, ?, ?)',
                [order_id, itemData.product_id, itemData.qty, itemData.unit_price_cents, itemData.subtotal_cents]
            );
            
            await connection.execute(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                [itemData.qty, itemData.product_id]
            );
        }

        await connection.commit();
        connection.release();

        return { order_id, total_cents, customer, items: orderItemsData };

    } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
    }
}

// Cancela la orden y restaura stock.
async function cancelOrder(orderId) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const [order] = await connection.execute('SELECT id, status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
        if (!order || order.length === 0) throw new Error('Order not found.');
        
        const currentStatus = order[0].status;
        
        if (currentStatus === 'CANCELED') {
            await connection.rollback();
            connection.release();
            return { message: 'Order already canceled.', status: 'CANCELED' };
        }
        
        if (currentStatus === 'CONFIRMED' || currentStatus === 'CREATED') {
            // Restaurar Stock
            const items = await connection.execute('SELECT product_id, qty FROM order_items WHERE order_id = ?', [orderId]);
            for (const item of items[0]) {
                await connection.execute(
                    'UPDATE products SET stock = stock + ? WHERE id = ?',
                    [item.qty, item.product_id]
                );
            }

            // Cambiar estado a CANCELED
            await connection.execute('UPDATE orders SET status = ? WHERE id = ?', ['CANCELED', orderId]);
        }


        await connection.commit();
        connection.release();
        
        return { message: 'Order successfully canceled and stock restored.', status: 'CANCELED' };

    } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
    }
}


module.exports = {
    createOrder,
    cancelOrder
};