import { ensureDatabase } from "../../../db/runtime";
import type { Database, PreparedStatement } from "../../../db";
import { getRequestActor } from "../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function integer(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function cents(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function optionalId(value: unknown): number | null {
  const parsed = integer(value);
  return parsed > 0 ? parsed : null;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const safeMessage = message.includes("UNIQUE constraint failed")
    ? "That SKU or name is already in use."
    : message.includes("duplicate key value violates unique constraint")
      ? "That SKU or name is already in use."
      : message;
  return Response.json({ error: safeMessage }, { status: 400 });
}

async function queryAll<T>(
  db: Database,
  statement: string,
  ...values: unknown[]
): Promise<T[]> {
  const result = await db.prepare(statement).bind(...values).all<T>();
  return result.results ?? [];
}

async function loadWorkspace(db: Database) {
  const [products, suppliers, categories, movements, orders, settingsRows, audit] =
    await Promise.all([
      queryAll(db, `SELECT p.*, c.name AS category_name, c.color AS category_color,
        s.name AS supplier_name
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        ORDER BY CASE p.status WHEN 'active' THEN 0 ELSE 1 END, lower(p.name)`),
      queryAll(db, "SELECT * FROM suppliers ORDER BY lower(name)"),
      queryAll(db, "SELECT * FROM categories ORDER BY lower(name)"),
      queryAll(db, `SELECT m.*, p.name AS product_name, p.sku
        FROM stock_movements m JOIN products p ON p.id = m.product_id
        ORDER BY m.id DESC LIMIT 250`),
      queryAll(db, `SELECT o.*, COUNT(oi.id) AS item_count
        FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
        GROUP BY o.id ORDER BY o.id DESC LIMIT 200`),
      queryAll<{ key: string; value: string }>(db, "SELECT key, value FROM settings"),
      queryAll(db, "SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100"),
    ]);

  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
  return { products, suppliers, categories, movements, orders, settings, audit };
}

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function csvResponse(filename: string, headers: string[], rows: unknown[][]) {
  const body = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: Request) {
  const actor = await getRequestActor();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required" }, { status: 403 });

  try {
    const db = await ensureDatabase();
    const view = new URL(request.url).searchParams.get("view") ?? "all";

    if (view === "export-products") {
      const rows = await queryAll<Record<string, unknown>>(db, `SELECT p.sku, p.barcode,
        p.name, p.description, c.name AS category, s.name AS supplier, p.location,
        p.unit, p.cost_cents, p.price_cents, p.stock, p.reorder_point, p.status
        FROM products p LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id ORDER BY p.name`);
      return csvResponse(
        "the-zaza-club-products.csv",
        ["SKU", "Barcode", "Name", "Description", "Category", "Supplier", "Location", "Unit", "Cost", "Price", "Stock", "Reorder point", "Status"],
        rows.map((row) => [row.sku, row.barcode, row.name, row.description, row.category, row.supplier, row.location, row.unit, Number(row.cost_cents) / 100, Number(row.price_cents) / 100, row.stock, row.reorder_point, row.status]),
      );
    }

    if (view === "export-movements") {
      const rows = await queryAll<Record<string, unknown>>(db, `SELECT m.created_at,
        p.sku, p.name, m.type, m.quantity, m.before_stock, m.after_stock,
        m.reference, m.note, m.created_by FROM stock_movements m
        JOIN products p ON p.id = m.product_id ORDER BY m.id DESC`);
      return csvResponse(
        "the-zaza-club-movements.csv",
        ["Date", "SKU", "Product", "Type", "Change", "Before", "After", "Reference", "Note", "Created by"],
        rows.map((row) => [row.created_at, row.sku, row.name, row.type, row.quantity, row.before_stock, row.after_stock, row.reference, row.note, row.created_by]),
      );
    }

    return Response.json(await loadWorkspace(db));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const actor = await getRequestActor();
  if (!actor) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required" }, { status: 403 });

  try {
    const db = await ensureDatabase();
    const body = (await request.json()) as JsonRecord;
    const action = text(body.action, 50);

    if (action === "saveProduct") {
      const id = optionalId(body.id);
      const sku = text(body.sku, 80).toUpperCase();
      const name = text(body.name, 180);
      const stock = Math.max(0, integer(body.stock));
      if (!sku || !name) throw new Error("SKU and product name are required.");

      const values = [
        sku,
        text(body.barcode, 100),
        name,
        text(body.description, 1000),
        optionalId(body.categoryId),
        optionalId(body.supplierId),
        text(body.location, 100),
        text(body.unit, 30) || "each",
        cents(body.cost),
        cents(body.price),
        stock,
        Math.max(0, integer(body.reorderPoint)),
        text(body.status, 20) || "active",
      ];

      if (id) {
        const current = await db.prepare("SELECT stock FROM products WHERE id = ?").bind(id).first<{ stock: number }>();
        if (!current) throw new Error("Product not found.");
        await db.batch([
          db.prepare(`UPDATE products SET sku=?, barcode=?, name=?, description=?,
            category_id=?, supplier_id=?, location=?, unit=?, cost_cents=?, price_cents=?,
            stock=?, reorder_point=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values, id),
          ...(current.stock !== stock
            ? [db.prepare(`INSERT INTO stock_movements
              (product_id, type, quantity, before_stock, after_stock, reference, note, unit_cost_cents, created_by)
              VALUES (?, 'adjustment', ?, ?, ?, 'PRODUCT-EDIT', 'Stock updated from product editor', ?, ?)`)
              .bind(id, stock - current.stock, current.stock, stock, cents(body.cost), actor.email)]
            : []),
          db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
            VALUES (?, 'updated', 'product', ?, ?)`).bind(actor.email, String(id), `${sku} · ${name}`),
        ]);
        return Response.json({ ok: true, id });
      }

      const result = await db.prepare(`INSERT INTO products
        (sku, barcode, name, description, category_id, supplier_id, location, unit,
         cost_cents, price_cents, stock, reorder_point, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values).run();
      const productId = Number(result.meta.last_row_id);
      await db.batch([
        ...(stock > 0
          ? [db.prepare(`INSERT INTO stock_movements
            (product_id, type, quantity, before_stock, after_stock, reference, note, unit_cost_cents, created_by)
            VALUES (?, 'opening', ?, 0, ?, 'OPENING', 'Opening balance', ?, ?)`)
            .bind(productId, stock, stock, cents(body.cost), actor.email)]
          : []),
        db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
          VALUES (?, 'created', 'product', ?, ?)`).bind(actor.email, String(productId), `${sku} · ${name}`),
      ]);
      return Response.json({ ok: true, id: productId }, { status: 201 });
    }

    if (action === "archiveProduct") {
      const id = optionalId(body.id);
      if (!id) throw new Error("Product is required.");
      await db.batch([
        db.prepare("UPDATE products SET status='archived', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id),
        db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
          VALUES (?, 'archived', 'product', ?, 'Product archived')`).bind(actor.email, String(id)),
      ]);
      return Response.json({ ok: true });
    }

    if (action === "saveSupplier") {
      const id = optionalId(body.id);
      const name = text(body.name, 180);
      if (!name) throw new Error("Supplier name is required.");
      const values = [name, text(body.contactName, 180), text(body.email, 180), text(body.phone, 80), text(body.address, 500), text(body.status, 20) || "active"];
      if (id) {
        await db.batch([
          db.prepare(`UPDATE suppliers SET name=?, contact_name=?, email=?, phone=?, address=?,
            status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values, id),
          db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
            VALUES (?, 'updated', 'supplier', ?, ?)`).bind(actor.email, String(id), name),
        ]);
        return Response.json({ ok: true, id });
      }
      const result = await db.prepare(`INSERT INTO suppliers
        (name, contact_name, email, phone, address, status) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(...values).run();
      const supplierId = Number(result.meta.last_row_id);
      await db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
        VALUES (?, 'created', 'supplier', ?, ?)`).bind(actor.email, String(supplierId), name).run();
      return Response.json({ ok: true, id: supplierId }, { status: 201 });
    }

    if (action === "saveCategory") {
      const name = text(body.name, 100);
      if (!name) throw new Error("Category name is required.");
      const result = await db.prepare("INSERT INTO categories (name, color) VALUES (?, ?)")
        .bind(name, text(body.color, 20) || "#64748b").run();
      await db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
        VALUES (?, 'created', 'category', ?, ?)`).bind(actor.email, String(result.meta.last_row_id), name).run();
      return Response.json({ ok: true, id: Number(result.meta.last_row_id) }, { status: 201 });
    }

    if (action === "adjustStock") {
      const productId = optionalId(body.productId);
      const delta = integer(body.quantity);
      if (!productId || delta === 0) throw new Error("Choose a product and enter a non-zero quantity.");
      const product = await db.prepare("SELECT stock, cost_cents FROM products WHERE id=? AND status='active'").bind(productId).first<{ stock: number; cost_cents: number }>();
      if (!product) throw new Error("Active product not found.");
      const after = product.stock + delta;
      if (after < 0) throw new Error("This adjustment would make stock negative.");
      const reference = text(body.reference, 100) || `ADJ-${Date.now().toString().slice(-8)}`;
      await db.batch([
        db.prepare("UPDATE products SET stock=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(after, productId),
        db.prepare(`INSERT INTO stock_movements
          (product_id, type, quantity, before_stock, after_stock, reference, note, unit_cost_cents, created_by)
          VALUES (?, 'adjustment', ?, ?, ?, ?, ?, ?, ?)`)
          .bind(productId, delta, product.stock, after, reference, text(body.note, 500), product.cost_cents, actor.email),
        db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
          VALUES (?, 'adjusted', 'product', ?, ?)`).bind(actor.email, String(productId), `Stock ${delta > 0 ? "+" : ""}${delta}`),
      ]);
      return Response.json({ ok: true, stock: after });
    }

    if (action === "createOrder") {
      const type = text(body.type, 20);
      if (!['purchase', 'sale', 'return_in', 'return_out'].includes(type)) throw new Error("Invalid order type.");
      const items = Array.isArray(body.items) ? body.items.slice(0, 50) as JsonRecord[] : [];
      if (!items.length) throw new Error("Add at least one order line.");

      const normalized: Array<{ productId: number; quantity: number; unitPriceCents: number; before: number; after: number; cost: number }> = [];
      const seen = new Set<number>();
      let total = 0;
      const inbound = type === "purchase" || type === "return_in";
      for (const item of items) {
        const productId = optionalId(item.productId);
        const quantity = Math.max(1, integer(item.quantity, 1));
        if (!productId || seen.has(productId)) throw new Error("Each order line must use a different product.");
        seen.add(productId);
        const product = await db.prepare("SELECT stock, cost_cents, price_cents FROM products WHERE id=? AND status='active'").bind(productId).first<{ stock: number; cost_cents: number; price_cents: number }>();
        if (!product) throw new Error("One of the selected products is unavailable.");
        const defaultPrice = inbound ? product.cost_cents : product.price_cents;
        const unitPriceCents = item.unitPrice === undefined ? defaultPrice : cents(item.unitPrice);
        const delta = inbound ? quantity : -quantity;
        const after = product.stock + delta;
        if (after < 0) throw new Error("A sale or return cannot exceed available stock.");
        normalized.push({ productId, quantity, unitPriceCents, before: product.stock, after, cost: product.cost_cents });
        total += quantity * unitPriceCents;
      }

      const prefix = type === "purchase" ? "PO" : type === "sale" ? "SO" : type === "return_in" ? "RI" : "RO";
      const orderNumber = text(body.orderNumber, 80) || `${prefix}-${Date.now().toString().slice(-10)}`;
      const order = await db.prepare(`INSERT INTO orders
        (order_number, type, counterparty, status, total_cents, note, created_by)
        VALUES (?, ?, ?, 'completed', ?, ?, ?)`)
        .bind(orderNumber, type, text(body.counterparty, 180), total, text(body.note, 500), actor.email).run();
      const orderId = Number(order.meta.last_row_id);
      const statements: PreparedStatement[] = [];
      for (const item of normalized) {
        const delta = item.after - item.before;
        statements.push(
          db.prepare(`INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents, subtotal_cents)
            VALUES (?, ?, ?, ?, ?)`).bind(orderId, item.productId, item.quantity, item.unitPriceCents, item.quantity * item.unitPriceCents),
          db.prepare("UPDATE products SET stock=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(item.after, item.productId),
          db.prepare(`INSERT INTO stock_movements
            (product_id, type, quantity, before_stock, after_stock, reference, note, unit_cost_cents, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(item.productId, type, delta, item.before, item.after, orderNumber, text(body.note, 500), item.cost, actor.email),
        );
      }
      statements.push(db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
        VALUES (?, 'completed', 'order', ?, ?)`).bind(actor.email, String(orderId), `${orderNumber} · ${normalized.length} item(s)`));
      await db.batch(statements);
      return Response.json({ ok: true, id: orderId, orderNumber }, { status: 201 });
    }

    if (action === "importProducts") {
      const rows = Array.isArray(body.rows) ? (body.rows.slice(0, 500) as JsonRecord[]) : [];
      if (!rows.length) throw new Error("The import file has no product rows.");
      let imported = 0;
      for (const row of rows) {
        const sku = text(row.sku, 80).toUpperCase();
        const name = text(row.name, 180);
        if (!sku || !name) continue;
        const current = await db.prepare("SELECT id, stock FROM products WHERE sku=?").bind(sku).first<{ id: number; stock: number }>();
        const stock = Math.max(0, integer(row.stock));
        if (current) {
          await db.prepare(`UPDATE products SET name=?, barcode=?, location=?, unit=?, cost_cents=?,
            price_cents=?, stock=?, reorder_point=?, status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`)
            .bind(name, text(row.barcode, 100), text(row.location, 100), text(row.unit, 30) || "each", cents(row.cost), cents(row.price), stock, Math.max(0, integer(row.reorderPoint)), current.id).run();
          if (current.stock !== stock) {
            await db.prepare(`INSERT INTO stock_movements
              (product_id, type, quantity, before_stock, after_stock, reference, note, unit_cost_cents, created_by)
              VALUES (?, 'import', ?, ?, ?, 'CSV-IMPORT', 'Stock updated by CSV import', ?, ?)`)
              .bind(current.id, stock - current.stock, current.stock, stock, cents(row.cost), actor.email).run();
          }
        } else {
          const inserted = await db.prepare(`INSERT INTO products
            (sku, barcode, name, location, unit, cost_cents, price_cents, stock, reorder_point)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(sku, text(row.barcode, 100), name, text(row.location, 100), text(row.unit, 30) || "each", cents(row.cost), cents(row.price), stock, Math.max(0, integer(row.reorderPoint))).run();
          const id = Number(inserted.meta.last_row_id);
          if (stock > 0) {
            await db.prepare(`INSERT INTO stock_movements
              (product_id, type, quantity, before_stock, after_stock, reference, note, unit_cost_cents, created_by)
              VALUES (?, 'import', ?, 0, ?, 'CSV-IMPORT', 'Product created by CSV import', ?, ?)`)
              .bind(id, stock, stock, cents(row.cost), actor.email).run();
          }
        }
        imported += 1;
      }
      await db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
        VALUES (?, 'imported', 'products', '', ?)`).bind(actor.email, `${imported} product(s) imported`).run();
      return Response.json({ ok: true, imported });
    }

    if (action === "saveSettings") {
      const allowed = ["business_name", "currency", "date_format"];
      const statements = allowed
        .filter((key) => body[key] !== undefined)
        .map((key) => db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`)
          .bind(key, text(body[key], 180)));
      statements.push(db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
        VALUES (?, 'updated', 'settings', '', 'Workspace settings updated')`).bind(actor.email));
      await db.batch(statements);
      return Response.json({ ok: true });
    }

    throw new Error("Unknown inventory action.");
  } catch (error) {
    return errorResponse(error);
  }
}
