import { getRawDb } from "./index";

let initialization: Promise<void> | null = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#64748b',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    counterparty TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'completed',
    total_cents INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    subtotal_cents INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    before_stock INTEGER NOT NULL,
    after_stock INTEGER NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    unit_cost_cents INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS products_status_idx ON products(status)",
  "CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id)",
  "CREATE INDEX IF NOT EXISTS suppliers_status_idx ON suppliers(status)",
  "CREATE INDEX IF NOT EXISTS orders_type_idx ON orders(type)",
  "CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id)",
  "CREATE INDEX IF NOT EXISTS movements_product_idx ON stock_movements(product_id)",
  "CREATE INDEX IF NOT EXISTS movements_created_idx ON stock_movements(created_at)",
  "CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at)",
];

const seedStatements = [
  "INSERT OR IGNORE INTO settings (key, value) VALUES ('business_name', 'StockWise')",
  "INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'USD')",
  "INSERT OR IGNORE INTO settings (key, value) VALUES ('date_format', 'MMM d, yyyy')",
  "INSERT OR IGNORE INTO categories (id, name, color) VALUES (1, 'Electronics', '#5b6cf9')",
  "INSERT OR IGNORE INTO categories (id, name, color) VALUES (2, 'Packaging', '#f59e0b')",
  "INSERT OR IGNORE INTO categories (id, name, color) VALUES (3, 'Office', '#10b981')",
  `INSERT OR IGNORE INTO suppliers (id, name, contact_name, email, phone, address)
   VALUES (1, 'Northstar Supply Co.', 'Maya Chen', 'orders@northstar.example', '+1 555 0147', '18 Harbor Way')`,
  `INSERT OR IGNORE INTO suppliers (id, name, contact_name, email, phone, address)
   VALUES (2, 'PackRight Wholesale', 'Noah Santos', 'sales@packright.example', '+1 555 0184', '402 Market Street')`,
  `INSERT OR IGNORE INTO products
    (id, sku, barcode, name, description, category_id, supplier_id, location, unit, cost_cents, price_cents, stock, reorder_point)
   VALUES (1, 'SCN-1001', '890123450001', 'Wireless barcode scanner', 'Rechargeable 2.4 GHz handheld scanner', 1, 1, 'A-01-02', 'each', 4850, 7900, 26, 8)`,
  `INSERT OR IGNORE INTO products
    (id, sku, barcode, name, description, category_id, supplier_id, location, unit, cost_cents, price_cents, stock, reorder_point)
   VALUES (2, 'LBL-2040', '890123450002', 'Thermal label roll 4 × 6', 'Perforated direct-thermal shipping labels', 2, 2, 'B-03-01', 'roll', 620, 1100, 7, 12)`,
  `INSERT OR IGNORE INTO products
    (id, sku, barcode, name, description, category_id, supplier_id, location, unit, cost_cents, price_cents, stock, reorder_point)
   VALUES (3, 'TAP-4810', '890123450003', 'Heavy-duty packing tape', 'Clear acrylic carton-sealing tape', 2, 2, 'B-02-04', 'roll', 180, 350, 64, 20)`,
  `INSERT OR IGNORE INTO products
    (id, sku, barcode, name, description, category_id, supplier_id, location, unit, cost_cents, price_cents, stock, reorder_point)
   VALUES (4, 'PAP-A480', '890123450004', 'A4 copy paper 80 gsm', '500-sheet multipurpose paper ream', 3, 1, 'C-01-03', 'ream', 390, 625, 18, 10)`,
  `INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
   SELECT 'system', 'initialized', 'workspace', '1', 'Starter inventory created'
   WHERE NOT EXISTS (SELECT 1 FROM audit_logs)`,
];

export async function ensureDatabase(): Promise<D1Database> {
  const db = getRawDb();
  if (!initialization) {
    initialization = (async () => {
      await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
      await db.batch(seedStatements.map((statement) => db.prepare(statement)));
    })().catch((error) => {
      initialization = null;
      throw error;
    });
  }
  await initialization;
  return db;
}
