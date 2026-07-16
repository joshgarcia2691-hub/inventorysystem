import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the finished StockWise application instead of starter UI", async () => {
  const [page, layout, app, hosting] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/InventoryApp.tsx", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);

  assert.match(page, /InventoryApp/);
  assert.match(page, /chatGPTSignInPath/);
  assert.match(layout, /StockWise Inventory/);
  assert.doesNotMatch(page + layout, /codex-preview|SkeletonPreview|Starter Project/);
  assert.match(app, /saveProduct/);
  assert.match(app, /createOrder/);
  assert.match(app, /adjustStock/);
  assert.match(app, /importProducts/);
  assert.deepEqual(JSON.parse(hosting).d1, "DB");
});

test("database schema covers catalog, orders, movements, settings, and audit", async () => {
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  for (const table of ["categories", "suppliers", "products", "orders", "order_items", "stock_movements", "settings", "audit_logs"]) {
    assert.ok(schema.includes(`"${table}"`), `missing ${table} schema`);
  }
});
