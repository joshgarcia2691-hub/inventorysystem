import { Database, getDatabase } from "./index";

let initialization: Promise<void> | null = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#64748b',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    contact_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    location TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT 'each',
    cost_cents INTEGER NOT NULL DEFAULT 0,
    price_cents INTEGER NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    reorder_point INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    counterparty TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'completed',
    total_cents INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    subtotal_cents INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    before_stock INTEGER NOT NULL,
    after_stock INTEGER NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    unit_cost_cents INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'customer')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS products_status_idx ON products(status)",
  "CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id)",
  "CREATE INDEX IF NOT EXISTS suppliers_status_idx ON suppliers(status)",
  "CREATE INDEX IF NOT EXISTS orders_type_idx ON orders(type)",
  "CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id)",
  "CREATE INDEX IF NOT EXISTS movements_product_idx ON stock_movements(product_id)",
  "CREATE INDEX IF NOT EXISTS movements_created_idx ON stock_movements(created_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users(lower(email))",
  "CREATE UNIQUE INDEX IF NOT EXISTS users_single_admin_idx ON users(role) WHERE role='admin'",
  "CREATE INDEX IF NOT EXISTS users_role_idx ON users(role)",
  "CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)",
  "CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)",
  "CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at)",
];

const seedStatements = [
  "INSERT INTO settings (key, value) VALUES ('business_name', 'RK Empires Inventory') ON CONFLICT (key) DO NOTHING",
  "INSERT INTO settings (key, value) VALUES ('currency', 'USD') ON CONFLICT (key) DO NOTHING",
  "INSERT INTO settings (key, value) VALUES ('date_format', 'MMM d, yyyy') ON CONFLICT (key) DO NOTHING",
  "INSERT INTO categories (id, name, color) VALUES (1, 'Electronics', '#5b6cf9') ON CONFLICT DO NOTHING",
  "INSERT INTO categories (id, name, color) VALUES (2, 'Packaging', '#f59e0b') ON CONFLICT DO NOTHING",
  "INSERT INTO categories (id, name, color) VALUES (3, 'Office', '#10b981') ON CONFLICT DO NOTHING",
  `INSERT INTO suppliers (id, name, contact_name, email, phone, address)
   VALUES (1, 'Northstar Supply Co.', 'Maya Chen', 'orders@northstar.example', '+1 555 0147', '18 Harbor Way') ON CONFLICT DO NOTHING`,
  `INSERT INTO suppliers (id, name, contact_name, email, phone, address)
   VALUES (2, 'PackRight Wholesale', 'Noah Santos', 'sales@packright.example', '+1 555 0184', '402 Market Street') ON CONFLICT DO NOTHING`,
  `INSERT INTO products
    (id, sku, barcode, name, description, category_id, supplier_id, location, unit, cost_cents, price_cents, stock, reorder_point)
   VALUES (1, 'SCN-1001', '890123450001', 'Wireless barcode scanner', 'Rechargeable 2.4 GHz handheld scanner', 1, 1, 'A-01-02', 'each', 4850, 7900, 26, 8) ON CONFLICT DO NOTHING`,
  `INSERT INTO products
    (id, sku, barcode, name, description, category_id, supplier_id, location, unit, cost_cents, price_cents, stock, reorder_point)
   VALUES (2, 'LBL-2040', '890123450002', 'Thermal label roll 4 x 6', 'Perforated direct-thermal shipping labels', 2, 2, 'B-03-01', 'roll', 620, 1100, 7, 12) ON CONFLICT DO NOTHING`,
  `INSERT INTO products
    (id, sku, barcode, name, description, category_id, supplier_id, location, unit, cost_cents, price_cents, stock, reorder_point)
   VALUES (3, 'TAP-4810', '890123450003', 'Heavy-duty packing tape', 'Clear acrylic carton-sealing tape', 2, 2, 'B-02-04', 'roll', 180, 350, 64, 20) ON CONFLICT DO NOTHING`,
  `INSERT INTO products
    (id, sku, barcode, name, description, category_id, supplier_id, location, unit, cost_cents, price_cents, stock, reorder_point)
   VALUES (4, 'PAP-A480', '890123450004', 'A4 copy paper 80 gsm', '500-sheet multipurpose paper ream', 3, 1, 'C-01-03', 'ream', 390, 625, 18, 10) ON CONFLICT DO NOTHING`,
  `INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
   SELECT 'system', 'initialized', 'workspace', '1', 'Starter inventory created'
   WHERE NOT EXISTS (SELECT 1 FROM audit_logs)`,
  "UPDATE settings SET value='RK Empires Inventory', updated_at=CURRENT_TIMESTAMP WHERE key='business_name' AND value='StockWise'",
];

const sequenceStatements = ["categories", "suppliers", "products", "orders", "order_items", "stock_movements", "audit_logs", "users"]
  .map((table) => `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`);

export async function ensureDatabase(): Promise<Database> {
  const db = getDatabase();
  if (!initialization) {
    initialization = (async () => {
      await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
      await db.batch(seedStatements.map((statement) => db.prepare(statement)));
      await db.batch(sequenceStatements.map((statement) => db.prepare(statement)));
    })().catch((error) => {
      initialization = null;
      throw error;
    });
  }
  await initialization;
  return db;
}
