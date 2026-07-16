import { randomUUID } from "node:crypto";
import { ensureDatabase } from "../../../db/runtime";
import type { Database, PreparedStatement } from "../../../db";
import { getRequestActor } from "../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

function integer(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function cleanText(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function queryAll<T>(db: Database, statement: string, ...values: unknown[]): Promise<T[]> {
  const result = await db.prepare(statement).bind(...values).all<T>();
  return result.results ?? [];
}

function customerError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const safe = message.includes("invalid input syntax for type integer") || message.includes("could not serialize")
    ? "One or more products no longer have enough stock. Refresh your cart and try again."
    : message;
  return Response.json({ error: safe }, { status: 400 });
}

export async function GET() {
  const actor = await getRequestActor();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (actor.role !== "customer") return Response.json({ error: "Customer access required" }, { status: 403 });

  try {
    const db = await ensureDatabase();
    const [products, categories, orders, settingsRows] = await Promise.all([
      queryAll(db, `SELECT p.id, p.sku, p.name, p.description, p.category_id,
        c.name AS category_name, c.color AS category_color, p.unit, p.price_cents, p.stock
        FROM products p LEFT JOIN categories c ON c.id=p.category_id
        WHERE p.status='active' ORDER BY lower(p.name)`),
      queryAll(db, "SELECT id, name, color FROM categories ORDER BY lower(name)"),
      queryAll(db, `SELECT o.id, o.order_number, o.status, o.total_cents, o.created_at,
        COUNT(oi.id) AS item_count
        FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
        WHERE o.type='sale' AND o.created_by=?
        GROUP BY o.id ORDER BY o.id DESC LIMIT 100`, actor.email),
      queryAll<{ key: string; value: string }>(db, "SELECT key, value FROM settings WHERE key IN ('business_name', 'currency')"),
    ]);
    return Response.json({
      products,
      categories,
      orders,
      settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value])),
    });
  } catch (error) {
    return customerError(error);
  }
}

export async function POST(request: Request) {
  const actor = await getRequestActor();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (actor.role !== "customer") return Response.json({ error: "Customer access required" }, { status: 403 });

  try {
    const body = await request.json() as JsonRecord;
    if (body.action !== "checkout") throw new Error("Unknown customer action.");
    const items = Array.isArray(body.items) ? body.items.slice(0, 50) as JsonRecord[] : [];
    if (!items.length) throw new Error("Your cart is empty.");

    const db = await ensureDatabase();
    const seen = new Set<number>();
    const normalized: Array<{ productId: number; quantity: number; price: number; subtotal: number }> = [];
    let total = 0;
    for (const item of items) {
      const productId = integer(item.productId);
      const quantity = Math.max(1, integer(item.quantity, 1));
      if (productId < 1 || seen.has(productId)) throw new Error("Each cart line must use a different product.");
      seen.add(productId);
      const product = await db.prepare("SELECT price_cents, stock FROM products WHERE id=? AND status='active'")
        .bind(productId).first<{ price_cents: number; stock: number }>();
      if (!product || product.stock < quantity) throw new Error("One or more products no longer have enough stock.");
      const subtotal = quantity * Number(product.price_cents);
      normalized.push({ productId, quantity, price: Number(product.price_cents), subtotal });
      total += subtotal;
    }

    const reserved = await db.prepare("SELECT nextval(pg_get_serial_sequence('orders', 'id')) AS id")
      .first<{ id: number | string }>();
    const orderId = Number(reserved?.id);
    if (!orderId) throw new Error("Could not reserve an order number.");
    const orderNumber = `WEB-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const note = cleanText(body.note, 500);
    const statements: PreparedStatement[] = [
      db.prepare(`INSERT INTO orders
        (id, order_number, type, counterparty, status, total_cents, note, created_by)
        VALUES (?, ?, 'sale', ?, 'completed', ?, ?, ?)`)
        .bind(orderId, orderNumber, actor.displayName, total, note, actor.email),
    ];

    for (const item of normalized) {
      statements.push(db.prepare(`WITH updated AS (
          UPDATE products SET stock=stock-?, updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='active' AND stock>=?
          RETURNING id, stock AS after_stock, stock+? AS before_stock, cost_cents
        ), inserted_item AS (
          INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents, subtotal_cents)
          SELECT ?, id, ?, ?, ? FROM updated RETURNING id
        ), inserted_movement AS (
          INSERT INTO stock_movements
            (product_id, type, quantity, before_stock, after_stock, reference, note, unit_cost_cents, created_by)
          SELECT id, 'sale', ?, before_stock, after_stock, ?, ?, cost_cents, ? FROM updated RETURNING id
        )
        SELECT CASE WHEN (SELECT COUNT(*) FROM updated)=1 THEN 1
          ELSE CAST('insufficient stock ' || (SELECT COUNT(*) FROM updated) AS INTEGER) END AS ok`)
        .bind(
          item.quantity, item.productId, item.quantity, item.quantity,
          orderId, item.quantity, item.price, item.subtotal,
          -item.quantity, orderNumber, note || "Customer portal order", actor.email,
        ));
    }
    statements.push(db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
      VALUES (?, 'completed', 'customer order', ?, ?)`)
      .bind(actor.email, String(orderId), `${orderNumber} · ${normalized.length} item(s)`));
    await db.batch(statements);

    return Response.json({ ok: true, id: orderId, orderNumber }, { status: 201 });
  } catch (error) {
    return customerError(error);
  }
}
