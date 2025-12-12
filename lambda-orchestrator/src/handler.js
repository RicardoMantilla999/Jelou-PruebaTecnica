const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { getKey, check, save } = require("./idempotency");

const ORDERS_API_URL = process.env.ORDERS_API_URL;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

async function handler(event) {
    let body;
    let orderId = null;

    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON format.' }) };
    }

    const { customer_id, items } = body;

    if (!customer_id || !items || items.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing customer_id or items.' }) };
    }

    // Verificación de Idempotencia
    const idempotencyKey = getKey(customer_id, items);
    const previous = check(idempotencyKey);

    if (previous) {
        return previous;
    }

    try {
        // Creacion de orden
        const createResponse = await axios.post(
            `${ORDERS_API_URL}/orders`,
            { customer_id, items },
            {
                headers: {
                    Authorization: `Bearer ${SERVICE_TOKEN}`
                }
            }
        );

        const orderData = createResponse.data.order;
        orderId = orderData.id; 
        // Confirmacion de orden
        const confirmResponse = await axios.post(
            `${ORDERS_API_URL}/orders/${orderId}/confirm`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${SERVICE_TOKEN}`,
                    'Idempotency-Key': `${customer_id}-${orderId}-CONFIRM` 
                }
            }
        );

        const finalOrderData = confirmResponse.data;

        const response = {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Order successfully created and confirmed.',
                order_id: orderId,
                status: finalOrderData.status,
                total_cents: finalOrderData.total_cents,
                details: finalOrderData,
                customer_id: customer_id
            })
        };

        save(idempotencyKey, response);

        return response;

    } catch (error) {
        if (orderId) {
            try {

                await axios.post(
                    `${ORDERS_API_URL}/orders/${orderId}/cancel`,
                    {},
                    { headers: { Authorization: `Bearer ${SERVICE_TOKEN}` } }
                );

            } catch (compensationError) {
                console.error(`FALLO DE COMPENSACIÓN: No se pudo cancelar la orden ${orderId}.`, compensationError.message);
            }
        }
        const statusCode = error.response ? error.response.status : 500;

        if (error.response) {
            console.error('ERROR RESPONSE DATA:', JSON.stringify(error.response.data));
        }

        const apiErrorData = error.response && error.response.data;
        const detailedMessage = apiErrorData
            ? apiErrorData.message || apiErrorData.error || JSON.stringify(apiErrorData)
            : 'Internal Server Error during orchestration.';

        return {
            statusCode: statusCode,
            body: JSON.stringify({
                message: `Order orchestration failed. Reason: ${detailedMessage}`,
                details: error.message
            })
        };
    }
}

module.exports = {
    handler
};