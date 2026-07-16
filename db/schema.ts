import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(), name: text("name").notNull(), color: text("color").notNull().default("#64748b"), createdAt: createdAt(),
}, (table) => [uniqueIndex("categories_name_idx").on(table.name)]);

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(), name: text("name").notNull(), contactName: text("contact_name").notNull().default(""), email: text("email").notNull().default(""), phone: text("phone").notNull().default(""), address: text("address").notNull().default(""), status: text("status").notNull().default("active"), createdAt: createdAt(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("suppliers_status_idx").on(table.status)]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(), sku: text("sku").notNull(), barcode: text("barcode").notNull().default(""), name: text("name").notNull(), description: text("description").notNull().default(""), categoryId: integer("category_id").references(() => categories.id), supplierId: integer("supplier_id").references(() => suppliers.id), location: text("location").notNull().default(""), unit: text("unit").notNull().default("each"), costCents: integer("cost_cents").notNull().default(0), priceCents: integer("price_cents").notNull().default(0), stock: integer("stock").notNull().default(0), reorderPoint: integer("reorder_point").notNull().default(0), status: text("status").notNull().default("active"), createdAt: createdAt(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("products_sku_idx").on(table.sku), index("products_status_idx").on(table.status), index("products_category_idx").on(table.categoryId)]);

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(), orderNumber: text("order_number").notNull(), type: text("type").notNull(), counterparty: text("counterparty").notNull().default(""), status: text("status").notNull().default("completed"), totalCents: integer("total_cents").notNull().default(0), note: text("note").notNull().default(""), createdBy: text("created_by").notNull(), createdAt: createdAt(),
}, (table) => [uniqueIndex("orders_number_idx").on(table.orderNumber), index("orders_type_idx").on(table.type)]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(), orderId: integer("order_id").notNull().references(() => orders.id), productId: integer("product_id").notNull().references(() => products.id), quantity: integer("quantity").notNull(), unitPriceCents: integer("unit_price_cents").notNull(), subtotalCents: integer("subtotal_cents").notNull(),
}, (table) => [index("order_items_order_idx").on(table.orderId)]);

export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(), productId: integer("product_id").notNull().references(() => products.id), type: text("type").notNull(), quantity: integer("quantity").notNull(), beforeStock: integer("before_stock").notNull(), afterStock: integer("after_stock").notNull(), reference: text("reference").notNull().default(""), note: text("note").notNull().default(""), unitCostCents: integer("unit_cost_cents").notNull().default(0), createdBy: text("created_by").notNull(), createdAt: createdAt(),
}, (table) => [index("movements_product_idx").on(table.productId), index("movements_created_idx").on(table.createdAt)]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(), value: text("value").notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(), actor: text("actor").notNull(), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull().default(""), details: text("details").notNull().default(""), createdAt: createdAt(),
}, (table) => [index("audit_created_idx").on(table.createdAt)]);
