# StockWise Inventory System

StockWise is a responsive, full-stack inventory operations website for managing products, stock levels, suppliers, purchases, sales, returns, adjustments, reporting, imports, exports, and audit history from one workspace.

## What is included

- Live dashboard with inventory value, unit counts, stock health, and low-stock alerts
- Product catalog with SKU, barcode, category, supplier, location, costs, prices, and reorder points
- Purchase receiving, sales, customer returns, and supplier returns with multi-line documents
- Automatic stock updates and immutable movement history for every quantity change
- Supplier directory and color-coded product categories
- Inventory valuation, retail potential, margin, stock-health, and category reports
- CSV product import plus product and movement exports
- Workspace settings for business name and reporting currency
- Actor-attributed audit history and protected write endpoints
- Durable Cloudflare D1 storage with generated Drizzle migrations
- Responsive desktop, tablet, and mobile layouts with keyboard-friendly dialogs

## Technology

- React 19 and Next.js-compatible routing through Vinext
- TypeScript and Vite
- Cloudflare Workers and D1
- Drizzle schema and migrations
- OpenAI Sites hosting and Sign in with ChatGPT identity forwarding

## Local development

Requirements: Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Open the local address printed by the development server. Local development uses a clearly identified local administrator; hosted production routes require an authenticated user.

## Quality checks

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

## Database

The D1 binding is declared as `DB` in `.openai/hosting.json`. The application safely creates missing tables and indexes at runtime, while `drizzle/` contains the deployable SQL migration generated from `db/schema.ts`.

Starter inventory is added only when a new database is empty so the main workflows are immediately visible. These records can be edited or archived.

Generate a new migration after changing the schema:

```bash
npm run db:generate
```

## CSV import format

Use the product export as the best import template. The importer recognizes these headers:

```text
sku,name,barcode,location,unit,cost,price,stock,reorder_point
```

`sku` and `name` are required. Existing SKUs are updated; new SKUs create products. Imports are limited to 500 rows per request and every stock change is recorded.

## Security and data integrity

- Production pages and APIs require the platform-provided authenticated user.
- Write actions determine the actor on the server; the client cannot choose the audit identity.
- SQL values are bound through prepared statements.
- Sales and outbound returns cannot reduce a product below zero stock.
- Product archival preserves order, movement, and audit history.
- The production dependency scan is expected to report zero known vulnerabilities.

## Repository

[github.com/joshgarcia2691-hub/inventorysystem](https://github.com/joshgarcia2691-hub/inventorysystem)
