const express = require('express');
const { z } = require('zod');
const { query } = require('./db');
const { simpleAuth, internalAuth } = require('./middleware');

const router = express.Router();


const customerSchema = z.object({
    name: z.string().min(3),
    email: z.string().email(),
    phone: z.string().optional()
});

// Crear cliente
router.post('/customers', simpleAuth, async (req, res) => {
    try {
        const validatedBody = customerSchema.parse(req.body);
        const { name, email, phone } = validatedBody;

        const existingCustomer = await query('SELECT id FROM customers WHERE email = ?', [email]);
        if (existingCustomer.length > 0) {
            return res.status(409).json({ message: 'Email already exists.' });
        }

        const result = await query(
            'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)',
            [name, email, phone]
        );
        
        const [newCustomer] = await query('SELECT * FROM customers WHERE id = ?', [result.insertId]);

        res.status(201).json(newCustomer);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: 'Validation failed', errors: error.errors });
        }
        res.status(500).json({ message: 'Error creating customer', error: error.message });
    }
});

// Obtener cliente por id
router.get('/customers/:id', simpleAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const customers = await query('SELECT id, name, email, phone, created_at FROM customers WHERE id = ?', [id]);
        if (customers.length === 0) {
            return res.status(404).json({ message: 'Customer not found' });
        }
        res.json(customers[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching customer' });
    }
});

//Buscar cliente
router.get('/customers', simpleAuth, async (req, res) => {
    const { search, limit = 10, cursor } = req.query;
    try {
        let sql = 'SELECT id, name, email, phone, created_at FROM customers WHERE 1=1';
        const params = [];

        if (search) {
            sql += ' AND (name LIKE ? OR email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        if (cursor) {
            sql += ' AND id > ?';
            params.push(cursor);
        }

        sql += ' ORDER BY id ASC LIMIT ?';
        params.push(parseInt(limit, 10));

        const customers = await query(sql, params);
        
        const nextCursor = customers.length === parseInt(limit, 10) ? customers[customers.length - 1].id : null;
        
        res.json({ data: customers, cursor: nextCursor });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching customers' });
    }
});

//Actualizar cliente
router.put('/customers/:id', simpleAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const validatedBody = customerSchema.partial().parse(req.body);
        
        const updates = Object.keys(validatedBody).map(key => `${key} = ?`).join(', ');
        const values = Object.values(validatedBody);

        if (values.length === 0) {
            return res.status(400).json({ message: 'No fields to update.' });
        }

        const result = await query(`UPDATE customers SET ${updates} WHERE id = ?`, [...values, id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Customer not found or no changes made.' });
        }

        const [updatedCustomer] = await query('SELECT id, name, email, phone FROM customers WHERE id = ?', [id]);

        res.status(200).json(updatedCustomer);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: 'Validation failed', errors: error.errors });
        }
        res.status(500).json({ message: 'Error updating customer', error: error.message });
    }
});


//Detalle interno - order api
router.get('/internal/customers/:id', internalAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const customers = await query('SELECT id, name, email, phone FROM customers WHERE id = ?', [id]);
        if (customers.length === 0) {
            return res.status(404).json({ message: 'Customer not found' });
        }
        res.json(customers[0]);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching customer internally' });
    }
});

module.exports = router;