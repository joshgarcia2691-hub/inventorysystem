# RK Empires Inventory System

RK Empires Inventory is a responsive, full-stack inventory platform with separate administrator and customer portals. Administrators control products, stock, suppliers, orders, reporting, imports, exports, settings, and audit history. Customers can create an account, browse live inventory, manage a cart, place orders, and review their order history.

## Account access

- The first visit presents clear **Customer** and **Administrator** entry options.
- The first administrator completes a one-time account setup. After that, administrator registration closes automatically.
- Customers can register from the customer portal and sign in on any compatible device.
- Passwords are protected with scrypt hashing and unique salts.
- Authentication uses random, server-stored sessions in secure HTTP-only cookies.
- Administrator and customer APIs enforce roles on the server.

After a fresh deployment, choose **Administrator** and create the first admin account. Choose **Customer** to register or sign in to the customer ordering portal.

## Administrator features

- Live inventory dashboard with value, unit counts, stock health, and low-stock alerts
- Product catalog with SKU, barcode, category, supplier, location, costs, prices, and reorder points
- Purchasing, sales, customer returns, and supplier returns with multi-line documents
- Automatic stock updates and immutable movement history
- Supplier directory and color-coded categories
- Valuation, retail potential, margin, stock health, and category reports
- CSV product import plus product and movement exports
- Business settings and actor-attributed audit history

## Customer features

- Searchable live product catalog with category filters and current availability
- Responsive cart with quantity and stock-limit controls
- Atomic checkout that prevents negative inventory
- Automatic sales order, order-item, movement, and audit records
- Personal order history linked to the signed-in customer

## RK Empires brand system

- Primary gold `#D4AF37`
- Deep gold `#B8860B`
- White `#FFFFFF`
- Light gray `#E6E6E6`
- Dark gray `#1A1A1A`
- Black `#000000`
- Playfair Display for headings and Montserrat for interface text
- Official RK Empires logo and the “Automate · Innovate · Elevate” message

## Technology

- React 19 and Next.js 16
- TypeScript and Tailwind CSS
- Neon serverless Postgres
- Drizzle schema and migrations
- Vercel hosting and deployment protection

## Local development

Requirements: Node.js 22.13 or later and a Postgres database.

```bash
npm install
```

Create `.env.local`, set `DATABASE_URL` to a Postgres connection string, then start the app:

```bash
npm run dev
```

## Quality checks

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

## Database

The application reads `DATABASE_URL`, safely creates missing Postgres tables and indexes, and keeps generated SQL migrations in `drizzle/`. The schema covers inventory, orders, users, server sessions, workspace settings, and audit logs.

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

## CSV import format

```text
sku,name,barcode,location,unit,cost,price,stock,reorder_point
```

`sku` and `name` are required. Existing SKUs are updated; new SKUs create products. Imports are limited to 500 rows and every stock change is recorded.

## Vercel deployment

The linked Vercel project is `rk-empires-projects/inventorysystem`. Connect Neon, make sure `DATABASE_URL` is available to the deployment, then deploy:

```bash
npx vercel
```

## Repository

[github.com/joshgarcia2691-hub/inventorysystem](https://github.com/joshgarcia2691-hub/inventorysystem)
