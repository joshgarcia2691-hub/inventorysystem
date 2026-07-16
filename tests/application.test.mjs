import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the finished StockWise application instead of starter UI", async () => {
  const [page, layout, app] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/InventoryApp.tsx", root), "utf8"),
  ]);

  assert.match(page, /InventoryApp/);
  assert.match(page, /Vercel workspace user/);
  assert.match(layout, /StockWise Inventory/);
  assert.doesNotMatch(page + layout, /codex-preview|SkeletonPreview|Starter Project/);
  assert.match(app, /saveProduct/);
  assert.match(app, /createOrder/);
  assert.match(app, /adjustStock/);
  assert.match(app, /importProducts/);
});

test("database schema covers catalog, orders, movements, settings, and audit", async () => {
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  for (const table of ["categories", "suppliers", "products", "orders", "order_items", "stock_movements", "settings", "audit_logs"]) {
    assert.ok(schema.includes(`"${table}"`), `missing ${table} schema`);
  }
});

test("uses Vercel-compatible Neon Postgres persistence", async () => {
  const [pkg, schema, database, route] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/index.ts", root), "utf8"),
    readFile(new URL("app/api/inventory/route.ts", root), "utf8"),
  ]);

  assert.match(pkg, /@neondatabase\/serverless/);
  assert.match(schema, /pgTable/);
  assert.match(database, /DATABASE_URL/);
  assert.match(route, /runtime = "nodejs"/);
});
