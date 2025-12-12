const { query } = require('./db');

const TARGET_TYPE = 'ORDER_CONFIRMATION';

async function checkIdempotencyKey(key) {
    const rows = await query(
        'SELECT response_body, response_status, target_id FROM idempotency_keys WHERE `key` = ?',
        [key]
    );

    const existing = rows[0];

    // Ya se procesó antes
    if (existing && existing.response_status && existing.response_status !== 202) {
        let body = {};

        if (existing.response_body) {
            try {

                if (typeof existing.response_body === 'string') {
                    body = JSON.parse(existing.response_body);
                } else {
                    body = existing.response_body;
                }

            } catch (e) {
                console.error("Fallo al parsear cuerpo de idempotencia:", e);
                return { isDuplicate: true, response_status: existing.response_status, response_body: {} };
            }
        }

        return {
            isDuplicate: true,
            response_body: body,
            response_status: existing.response_status,
            target_id: existing.target_id
        };
    }

    // Crear registro si no existe
    if (!existing) {
        await query(
            'INSERT INTO idempotency_keys (`key`, target_type, response_status) VALUES (?, ?, ?)',
            [key, TARGET_TYPE, 202]
        );
    }

    return { isDuplicate: false };
}

// Guardar resultados
async function saveIdempotentResponse(key, orderId, body, status) {

    await query(
        `UPDATE idempotency_keys 
         SET response_body = ?, response_status = ?, target_id = ? 
         WHERE \`key\` = ?`,
        [
            JSON.stringify(body),
            status,
            orderId,
            key
        ]
    );
}

module.exports = {
    checkIdempotencyKey,
    saveIdempotentResponse
};
