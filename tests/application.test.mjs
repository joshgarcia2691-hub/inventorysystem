import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the finished The Zaza Club application with role-based entry", async () => {
  const [page, layout, app, auth, customer] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/InventoryApp.tsx", root), "utf8"),
    readFile(new URL("app/AuthGateway.tsx", root), "utf8"),
    readFile(new URL("app/CustomerPortal.tsx", root), "utf8"),
  ]);

  assert.match(page, /InventoryApp/);
  assert.match(page, /AuthGateway/);
  assert.match(page, /CustomerPortal/);
  assert.match(layout, /The Zaza Club Inventory/);
  assert.match(auth, /Customer/);
  assert.match(auth, /Administrator/);
  assert.match(auth, /Create customer account/);
  assert.match(customer, /checkout/);
  assert.match(customer, /My orders/);
  assert.doesNotMatch(page + layout, /codex-preview|SkeletonPreview|Starter Project/);
  assert.match(app, /saveProduct/);
  assert.match(app, /createOrder/);
  assert.match(app, /adjustStock/);
  assert.match(app, /importProducts/);
});

test("database schema covers inventory, users, sessions, settings, and audit", async () => {
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  for (const table of ["categories", "suppliers", "products", "orders", "order_items", "stock_movements", "settings", "users", "sessions", "audit_logs"]) {
    assert.ok(schema.includes(`"${table}"`), `missing ${table} schema`);
  }
});

test("uses Vercel-compatible Neon Postgres persistence", async () => {
  const [pkg, schema, database, route, customerRoute] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/index.ts", root), "utf8"),
    readFile(new URL("app/api/inventory/route.ts", root), "utf8"),
    readFile(new URL("app/api/customer/route.ts", root), "utf8"),
  ]);

  assert.match(pkg, /@neondatabase\/serverless/);
  assert.match(schema, /pgTable/);
  assert.match(database, /DATABASE_URL/);
  assert.match(route, /runtime = "nodejs"/);
  assert.match(route, /actor\.role !== "admin"/);
  assert.match(customerRoute, /actor\.role !== "customer"/);
  assert.match(customerRoute, /stock=stock-\?/);
});
