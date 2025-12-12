-- Clientes iniciales
INSERT IGNORE INTO customers (name, email, phone) VALUES 
('Empresa ABCD', 'abc@test.com', '+59399999999'),
('John Doe', 'john@test.com', '+1234567890');

-- Productos iniciales
INSERT IGNORE INTO products (sku, name, price_cents, stock) VALUES 
('TEC-LAP-001', 'Laptop Developer', 150000, 10),
('TEC-MOU-002', 'Mouse Ergonómico', 2500, 50),
('TEC-MON-003', 'Monitor 4K', 45000, 5);