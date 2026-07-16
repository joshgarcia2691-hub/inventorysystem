# StockWise Inventory System

StockWise is a responsive, full-stack inventory website for managing products, stock levels, suppliers, purchases, sales, returns, adjustments, reporting, imports, exports, and audit history from one workspace.

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
- Durable Neon Postgres storage with generated Drizzle migrations
- Responsive desktop, tablet, and mobile layouts with keyboard-friendly dialogs

## Technology

- React 19 and Next.js 16
- TypeScript and Tailwind CSS
- Neon serverless Postgres
- Drizzle schema and migrations
- Vercel hosting with Vercel Authentication deployment protection

## Local development

Requirements: Node.js 22.13 or later and a Postgres database.

```bash
npm install
```

Create `.env.local` and set `DATABASE_URL` to a Postgres connection string, then start the app:

```bash
npm run dev
```

Open the local address printed by Next.js. Local development uses a clearly identified local administrator; protected Vercel deployments use a Vercel workspace identity.

## Quality checks

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

## Database

The application reads `DATABASE_URL`, safely creates missing Postgres tables and indexes at runtime, and keeps the generated SQL migration in `drizzle/`. Vercel can supply the connection variables through its Neon Marketplace integration.

Starter inventory is added only when a new database is empty so the main workflows are immediately visible. These records can be edited or archived.

Generate a migration after changing `db/schema.ts`:

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

- The deployed preview is protected by Vercel Authentication.
- Write actions determine the actor on the server; the client cannot choose the audit identity.
- SQL values are bound through prepared statements.
- Sales and outbound returns cannot reduce a product below zero stock.
- Product archival preserves order, movement, and audit history.

## Vercel deployment

The linked Vercel project is `rk-empires-projects/inventorysystem`. Connect a Neon database, make sure `DATABASE_URL` is available to the deployment, then deploy:

```bash
npx vercel
```

Production deployment protection requires a supported Vercel plan. On plans without that feature, use a protected preview deployment or add application-level authentication before publishing a production URL.

## Repository

[github.com/joshgarcia2691-hub/inventorysystem](https://github.com/joshgarcia2691-hub/inventorysystem)
