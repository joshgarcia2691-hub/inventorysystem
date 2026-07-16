"use client";

import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileUp,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  Trash2,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type User = { displayName: string; email: string; role: "admin" | "customer" };
type Product = {
  id: number; sku: string; barcode: string; name: string; description: string;
  category_id: number | null; category_name: string | null; category_color: string | null;
  supplier_id: number | null; supplier_name: string | null; location: string; unit: string;
  cost_cents: number; price_cents: number; stock: number; reorder_point: number; status: string;
};
type Supplier = { id: number; name: string; contact_name: string; email: string; phone: string; address: string; status: string };
type Category = { id: number; name: string; color: string };
type Movement = { id: number; product_id: number; product_name: string; sku: string; type: string; quantity: number; before_stock: number; after_stock: number; reference: string; note: string; created_by: string; created_at: string };
type Order = { id: number; order_number: string; type: string; counterparty: string; status: string; total_cents: number; item_count: number; created_by: string; created_at: string };
type Audit = { id: number; actor: string; action: string; entity_type: string; entity_id: string; details: string; created_at: string };
type Workspace = { products: Product[]; suppliers: Supplier[]; categories: Category[]; movements: Movement[]; orders: Order[]; settings: Record<string, string>; audit: Audit[] };
type View = "dashboard" | "products" | "movements" | "suppliers" | "orders" | "reports" | "settings";
type ModalName = "product" | "supplier" | "adjustment" | "order" | "category" | null;
type OrderLine = { productId: string; quantity: string; unitPrice: string };

const emptyWorkspace: Workspace = { products: [], suppliers: [], categories: [], movements: [], orders: [], settings: {}, audit: [] };
const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "products", label: "Products", icon: Package },
  { id: "movements", label: "Stock movements", icon: History },
  { id: "suppliers", label: "Suppliers", icon: Truck },
  { id: "orders", label: "Purchases & sales", icon: ClipboardList },
  { id: "reports", label: "Reports", icon: BarChart3 },
];

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(value: string, withTime = false) {
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, withTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function readCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function StockBadge({ product }: { product: Product }) {
  const low = product.stock <= product.reorder_point;
  const empty = product.stock === 0;
  return <span className={`status-pill ${empty ? "danger" : low ? "warning" : "success"}`}><span />{empty ? "Out of stock" : low ? "Low stock" : "In stock"}</span>;
}

function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
    <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-header"><div><p className="eyebrow">RK Empires workspace</p><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></header>
      {children}
    </section>
  </div>;
}

export default function InventoryApp({ user }: { user: User }) {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [view, setView] = useState<View>("dashboard");
  const [modal, setModal] = useState<ModalName>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [orderType, setOrderType] = useState("purchase");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [mobileNav, setMobileNav] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/inventory?view=all", { cache: "no-store" });
      const payload = await response.json() as Workspace & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load inventory.");
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load inventory.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); }, [toast]);

  const activeProducts = useMemo(() => data.products.filter((product) => product.status === "active"), [data.products]);
  const lowStock = useMemo(() => activeProducts.filter((product) => product.stock <= product.reorder_point), [activeProducts]);
  const summary = useMemo(() => {
    const units = activeProducts.reduce((sum, product) => sum + product.stock, 0);
    const costValue = activeProducts.reduce((sum, product) => sum + product.stock * product.cost_cents, 0);
    const retailValue = activeProducts.reduce((sum, product) => sum + product.stock * product.price_cents, 0);
    const sales = data.orders.filter((order) => order.type === "sale").reduce((sum, order) => sum + order.total_cents, 0);
    const purchases = data.orders.filter((order) => order.type === "purchase").reduce((sum, order) => sum + order.total_cents, 0);
    return { units, costValue, retailValue, sales, purchases };
  }, [activeProducts, data.orders]);
  const currency = data.settings.currency || "USD";
  const money = useCallback((amountCents: number) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amountCents / 100), [currency]);

  const filteredProducts = useMemo(() => activeProducts.filter((product) => {
    const term = search.toLowerCase();
    const matchesSearch = !term || [product.name, product.sku, product.barcode, product.location, product.category_name].some((value) => value?.toLowerCase().includes(term));
    const matchesCategory = categoryFilter === "all" || String(product.category_id) === categoryFilter;
    const matchesStock = stockFilter === "all" || (stockFilter === "low" && product.stock <= product.reorder_point) || (stockFilter === "healthy" && product.stock > product.reorder_point);
    return matchesSearch && matchesCategory && matchesStock;
  }), [activeProducts, categoryFilter, search, stockFilter]);

  async function mutate(payload: Record<string, unknown>, successMessage: string) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; imported?: number };
      if (!response.ok) throw new Error(result.error || "The update could not be saved.");
      await load(); setModal(null); setEditingProduct(null); setEditingSupplier(null); setToast(result.imported !== undefined ? `${result.imported} products imported` : successMessage);
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The update could not be saved."); return false; }
    finally { setSaving(false); }
  }

  async function handleImport(file?: File) {
    if (!file) return;
    try {
      const parsed = readCsv(await file.text());
      const headers = parsed[0]?.map((value) => value.trim().toLowerCase().replaceAll(" ", "_")) ?? [];
      const rows = parsed.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
      await mutate({ action: "importProducts", rows: rows.map((row) => ({ ...row, reorderPoint: row.reorder_point ?? row.reorderpoint })) }, "Products imported");
    } catch { setError("The CSV file could not be read. Use the exported products file as a template."); }
    if (importRef.current) importRef.current.value = "";
  }

  function openProduct(product: Product | null = null) { setEditingProduct(product); setModal("product"); }
  function openSupplier(supplier: Supplier | null = null) { setEditingSupplier(supplier); setModal("supplier"); }
  function openOrder(type: string) { setOrderType(type); setModal("order"); }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.reload(); }
  const currentTitle = navItems.find((item) => item.id === view)?.label ?? "Workspace";

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><span className="brand-mark brand-logo-mark"><Image src="/rk-empires-logo.jpeg" alt="" width={40} height={40} /></span><div><strong>{data.settings.business_name || "RK Empires Inventory"}</strong><small>Intelligent operations</small></div><button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button></div>
      <nav aria-label="Primary navigation">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMobileNav(false); }}><Icon size={19} /><span>{label}</span>{id === "products" && lowStock.length > 0 && <em>{lowStock.length}</em>}</button>)}</nav>
      <div className="sidebar-spacer" />
      <button className={`settings-link ${view === "settings" ? "active" : ""}`} onClick={() => { setView("settings"); setMobileNav(false); }}><Settings size={19} />Settings</button>
      <div className="user-card"><span>{initials(user.displayName)}</span><div><strong>{user.displayName}</strong><small>Administrator · {user.email}</small></div><button className="sidebar-logout" onClick={() => void logout()} aria-label="Sign out"><LogOut /></button></div>
    </aside>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

    <main className="main-area">
      <header className="topbar"><div className="topbar-title"><button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button><div><p>{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><h1>{currentTitle}</h1></div></div><div className="topbar-actions"><button className="icon-button notification-button" aria-label="Notifications"><Bell size={20} />{lowStock.length > 0 && <span />}</button><button className="button primary" onClick={() => openProduct()}><Plus size={18} />Add product</button></div></header>

      {error && <div className="error-banner" role="alert"><AlertTriangle size={18} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={17} /></button></div>}
      {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}

      <div className="content-wrap">
        {loading ? <LoadingState /> : <>
          {view === "dashboard" && <Dashboard data={data} lowStock={lowStock} summary={summary} money={money} onViewProducts={() => { setStockFilter("low"); setView("products"); }} onViewMovements={() => setView("movements")} onOrder={openOrder} />}
          {view === "products" && <ProductsView products={filteredProducts} categories={data.categories} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} stockFilter={stockFilter} setStockFilter={setStockFilter} money={money} onAdd={() => openProduct()} onEdit={openProduct} onAdjust={(product) => { setEditingProduct(product); setModal("adjustment"); }} onArchive={(product) => void mutate({ action: "archiveProduct", id: product.id }, `${product.name} archived`)} onImport={() => importRef.current?.click()} />}
          {view === "movements" && <MovementsView movements={data.movements} onAdjust={() => { setEditingProduct(null); setModal("adjustment"); }} />}
          {view === "suppliers" && <SuppliersView suppliers={data.suppliers} products={activeProducts} onAdd={() => openSupplier()} onEdit={openSupplier} />}
          {view === "orders" && <OrdersView orders={data.orders} money={money} onOrder={openOrder} />}
          {view === "reports" && <ReportsView data={data} products={activeProducts} summary={summary} money={money} />}
          {view === "settings" && <SettingsView data={data} saving={saving} onSave={(payload) => mutate({ action: "saveSettings", ...payload }, "Settings saved")} onCategory={() => setModal("category")} />}
        </>}
      </div>
    </main>

    <input ref={importRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => void handleImport(event.target.files?.[0])} />
    {modal === "product" && <ProductModal product={editingProduct} categories={data.categories} suppliers={data.suppliers} saving={saving} onClose={() => setModal(null)} onSave={(payload) => mutate({ action: "saveProduct", ...payload }, editingProduct ? "Product updated" : "Product added")} />}
    {modal === "supplier" && <SupplierModal supplier={editingSupplier} saving={saving} onClose={() => setModal(null)} onSave={(payload) => mutate({ action: "saveSupplier", ...payload }, editingSupplier ? "Supplier updated" : "Supplier added")} />}
    {modal === "adjustment" && <AdjustmentModal selected={editingProduct} products={activeProducts} saving={saving} onClose={() => setModal(null)} onSave={(payload) => mutate({ action: "adjustStock", ...payload }, "Stock adjusted")} />}
    {modal === "order" && <OrderModal type={orderType} products={activeProducts} suppliers={data.suppliers} saving={saving} money={money} onClose={() => setModal(null)} onSave={(payload) => mutate({ action: "createOrder", ...payload }, orderType === "purchase" ? "Purchase received" : orderType === "sale" ? "Sale completed" : "Return recorded")} />}
    {modal === "category" && <CategoryModal saving={saving} onClose={() => setModal(null)} onSave={(payload) => mutate({ action: "saveCategory", ...payload }, "Category added")} />}
  </div>;
}

function LoadingState() { return <div className="loading-grid" aria-label="Loading inventory"><div className="loading-hero" /><div className="loading-row">{[1,2,3,4].map((item) => <div key={item} />)}</div><div className="loading-table" /></div>; }

function Dashboard({ data, lowStock, summary, money, onViewProducts, onViewMovements, onOrder }: { data: Workspace; lowStock: Product[]; summary: { units: number; costValue: number; retailValue: number; sales: number; purchases: number }; money: (value: number) => string; onViewProducts: () => void; onViewMovements: () => void; onOrder: (type: string) => void }) {
  const health = data.products.filter((p) => p.status === "active").length ? Math.round((1 - lowStock.length / data.products.filter((p) => p.status === "active").length) * 100) : 100;
  return <div className="page-stack">
    <section className="welcome-card"><div><span className="live-chip"><span />Live inventory</span><h2>Automate. Innovate. <em>Elevate.</em></h2><p>Control purchasing, sales, stock health, and inventory value through one intelligent RK Empires workspace.</p><div className="welcome-actions"><button className="button light" onClick={() => onOrder("purchase")}><ArrowDownLeft size={18} />Receive purchase</button><button className="button ghost-light" onClick={() => onOrder("sale")}><ArrowUpRight size={18} />Record sale</button></div></div><div className="health-orbit"><div><strong>{health}%</strong><span>stock health</span></div></div></section>
    <section className="metrics-grid">
      <Metric icon={CircleDollarSign} label="Inventory value" value={money(summary.costValue)} note={`${money(summary.retailValue)} retail potential`} tone="violet" />
      <Metric icon={Boxes} label="Units on hand" value={summary.units.toLocaleString()} note={`${data.products.filter((p) => p.status === "active").length} active products`} tone="blue" />
      <Metric icon={AlertTriangle} label="Needs attention" value={String(lowStock.length)} note={lowStock.length ? "At or below reorder point" : "All stock levels healthy"} tone="amber" />
      <Metric icon={TrendingUp} label="Recorded sales" value={money(summary.sales)} note={`${money(summary.purchases)} purchased`} tone="green" />
    </section>
    <section className="dashboard-grid"><div className="panel"><PanelHeader title="Recent stock activity" subtitle="Latest inventory-changing events" action={<button className="text-button" onClick={onViewMovements}>View history</button>} />
      <div className="activity-list">{data.movements.slice(0, 6).map((movement) => <div className="activity-row" key={movement.id}><span className={`movement-icon ${movement.quantity >= 0 ? "in" : "out"}`}>{movement.quantity >= 0 ? <ArrowDownLeft /> : <ArrowUpRight />}</span><div><strong>{movement.product_name}</strong><small>{movement.type.replaceAll("_", " ")} · {movement.reference || "No reference"}</small></div><div className="activity-value"><strong className={movement.quantity >= 0 ? "positive" : "negative"}>{movement.quantity >= 0 ? "+" : ""}{movement.quantity}</strong><small>{formatDate(movement.created_at, true)}</small></div></div>)}{!data.movements.length && <EmptyState icon={Activity} title="No stock activity yet" body="Purchases, sales, and adjustments will appear here." />}</div>
    </div><div className="panel"><PanelHeader title="Reorder watch" subtitle="Items that need a decision" action={lowStock.length ? <button className="text-button" onClick={onViewProducts}>See all</button> : undefined} /><div className="reorder-list">{lowStock.slice(0, 5).map((product) => <div className="reorder-row" key={product.id}><span className="product-tile"><Package /></span><div><strong>{product.name}</strong><small>{product.sku} · {product.location || "No location"}</small></div><div><strong>{product.stock}</strong><small>min {product.reorder_point}</small></div></div>)}{!lowStock.length && <EmptyState icon={PackageCheck} title="Stock looks healthy" body="Every active product is above its reorder point." />}</div></div></section>
  </div>;
}

function Metric({ icon: Icon, label, value, note, tone }: { icon: typeof Boxes; label: string; value: string; note: string; tone: string }) { return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon /></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>; }
function PanelHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="panel-header"><div><h3>{title}</h3><p>{subtitle}</p></div>{action}</div>; }
function EmptyState({ icon: Icon, title, body }: { icon: typeof Package; title: string; body: string }) { return <div className="empty-state"><Icon /><strong>{title}</strong><p>{body}</p></div>; }

function ProductsView({ products, categories, search, setSearch, categoryFilter, setCategoryFilter, stockFilter, setStockFilter, money, onAdd, onEdit, onAdjust, onArchive, onImport }: { products: Product[]; categories: Category[]; search: string; setSearch: (value: string) => void; categoryFilter: string; setCategoryFilter: (value: string) => void; stockFilter: string; setStockFilter: (value: string) => void; money: (value: number) => string; onAdd: () => void; onEdit: (product: Product) => void; onAdjust: (product: Product) => void; onArchive: (product: Product) => void; onImport: () => void }) {
  return <div className="page-stack"><section className="section-intro"><div><p className="eyebrow">Product catalog</p><h2>Everything you stock</h2><p>Search, filter, value, and maintain every item from one reliable list.</p></div><div className="intro-actions"><button className="button secondary" onClick={onImport}><FileUp size={17} />Import CSV</button><a className="button secondary" href="/api/inventory?view=export-products"><Download size={17} />Export</a><button className="button primary" onClick={onAdd}><Plus size={17} />New product</button></div></section>
    <section className="panel table-panel"><div className="table-toolbar"><label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, SKU, barcode, location…" /></label><div className="filters"><label><Tag size={16} /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><ChevronDown size={14} /></label><label><SlidersHorizontal size={16} /><select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}><option value="all">All stock</option><option value="low">Low stock</option><option value="healthy">Healthy stock</option></select><ChevronDown size={14} /></label></div></div>
      <div className="table-scroll"><table><thead><tr><th>Product</th><th>Category</th><th>On hand</th><th>Unit cost</th><th>Stock value</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><div className="product-cell"><span className="product-tile"><Package /></span><div><strong>{product.name}</strong><small>{product.sku} · {product.location || "No location"}</small></div></div></td><td>{product.category_name ? <span className="category-label"><i style={{ background: product.category_color || "#64748b" }} />{product.category_name}</span> : <span className="muted">Uncategorized</span>}</td><td><strong>{product.stock.toLocaleString()}</strong> <span className="muted">{product.unit}</span></td><td>{money(product.cost_cents)}</td><td><strong>{money(product.stock * product.cost_cents)}</strong></td><td><StockBadge product={product} /></td><td><div className="row-actions"><button onClick={() => onAdjust(product)} title="Adjust stock"><SlidersHorizontal size={17} /></button><button onClick={() => onEdit(product)} title="Edit product"><Pencil size={17} /></button><button onClick={() => confirm(`Archive ${product.name}? Its history will be preserved.`) && onArchive(product)} title="Archive product"><Archive size={17} /></button></div></td></tr>)}</tbody></table></div>
      {!products.length && <EmptyState icon={Search} title="No matching products" body="Try a different search or add a new product." />}<div className="table-footer"><span>{products.length} product{products.length === 1 ? "" : "s"}</span><span>Exports reflect current live inventory</span></div>
    </section></div>;
}

function MovementsView({ movements, onAdjust }: { movements: Movement[]; onAdjust: () => void }) { return <div className="page-stack"><section className="section-intro"><div><p className="eyebrow">Audit-ready history</p><h2>Stock movements</h2><p>Every quantity change, who made it, and the resulting balance.</p></div><div className="intro-actions"><a className="button secondary" href="/api/inventory?view=export-movements"><Download size={17} />Export history</a><button className="button primary" onClick={onAdjust}><SlidersHorizontal size={17} />New adjustment</button></div></section><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Date</th><th>Product</th><th>Movement</th><th>Reference</th><th>Before</th><th>After</th><th>Recorded by</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td><div className="date-cell"><strong>{formatDate(movement.created_at)}</strong><small>{formatDate(movement.created_at, true).split(", ").pop()}</small></div></td><td><div className="product-cell compact"><span className={`movement-icon ${movement.quantity >= 0 ? "in" : "out"}`}>{movement.quantity >= 0 ? <ArrowDownLeft /> : <ArrowUpRight />}</span><div><strong>{movement.product_name}</strong><small>{movement.sku}</small></div></div></td><td><span className="movement-type">{movement.type.replaceAll("_", " ")}</span><strong className={movement.quantity >= 0 ? "positive" : "negative"}>{movement.quantity >= 0 ? "+" : ""}{movement.quantity}</strong></td><td><strong>{movement.reference || "—"}</strong><small className="block-muted">{movement.note || "No note"}</small></td><td>{movement.before_stock}</td><td><strong>{movement.after_stock}</strong></td><td className="actor-cell">{movement.created_by}</td></tr>)}</tbody></table></div>{!movements.length && <EmptyState icon={History} title="No movements recorded" body="Stock changes will appear here automatically." />}</section></div>; }

function SuppliersView({ suppliers, products, onAdd, onEdit }: { suppliers: Supplier[]; products: Product[]; onAdd: () => void; onEdit: (supplier: Supplier) => void }) { return <div className="page-stack"><section className="section-intro"><div><p className="eyebrow">Supply network</p><h2>Your suppliers</h2><p>Keep purchasing contacts and linked products close at hand.</p></div><button className="button primary" onClick={onAdd}><Plus size={17} />Add supplier</button></section><div className="supplier-grid">{suppliers.map((supplier) => { const linked = products.filter((product) => product.supplier_id === supplier.id); return <article className="supplier-card" key={supplier.id}><header><span><Building2 /></span><button className="icon-button" onClick={() => onEdit(supplier)} aria-label={`Edit ${supplier.name}`}><Pencil size={17} /></button></header><h3>{supplier.name}</h3><p>{supplier.contact_name || "No contact person"}</p><dl><div><dt>Email</dt><dd>{supplier.email || "—"}</dd></div><div><dt>Phone</dt><dd>{supplier.phone || "—"}</dd></div><div><dt>Address</dt><dd>{supplier.address || "—"}</dd></div></dl><footer><span><Package size={15} />{linked.length} linked product{linked.length === 1 ? "" : "s"}</span><span className={`status-pill ${supplier.status === "active" ? "success" : "neutral"}`}><span />{supplier.status}</span></footer></article>; })}<button className="supplier-card add-supplier" onClick={onAdd}><span><Plus /></span><strong>Add another supplier</strong><p>Create a reusable purchasing contact.</p></button></div></div>; }

function OrdersView({ orders, money, onOrder }: { orders: Order[]; money: (value: number) => string; onOrder: (type: string) => void }) { return <div className="page-stack"><section className="section-intro"><div><p className="eyebrow">Inbound & outbound</p><h2>Purchases and sales</h2><p>Complete an order and RK Empires updates every item balance automatically.</p></div><div className="intro-actions"><button className="button secondary" onClick={() => onOrder("return_in")}><RotateCcw size={17} />Return</button><button className="button secondary" onClick={() => onOrder("purchase")}><ArrowDownLeft size={17} />Purchase</button><button className="button primary" onClick={() => onOrder("sale")}><ShoppingCart size={17} />Sale</button></div></section><div className="order-summary"><div><span className="metric-icon green"><ArrowUpRight /></span><p>Sales orders<strong>{orders.filter((order) => order.type === "sale").length}</strong></p></div><div><span className="metric-icon blue"><ArrowDownLeft /></span><p>Purchase orders<strong>{orders.filter((order) => order.type === "purchase").length}</strong></p></div><div><span className="metric-icon violet"><CircleDollarSign /></span><p>Order value<strong>{money(orders.reduce((sum, order) => sum + order.total_cents, 0))}</strong></p></div></div><section className="panel table-panel"><PanelHeader title="Order ledger" subtitle="Completed stock-impacting documents" /><div className="table-scroll"><table><thead><tr><th>Order</th><th>Type</th><th>Counterparty</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.order_number}</strong><small className="block-muted">by {order.created_by}</small></td><td><span className={`order-type ${order.type.includes("purchase") || order.type === "return_in" ? "in" : "out"}`}>{order.type.replaceAll("_", " ")}</span></td><td>{order.counterparty || "—"}</td><td>{order.item_count}</td><td><strong>{money(order.total_cents)}</strong></td><td><span className="status-pill success"><span />{order.status}</span></td><td>{formatDate(order.created_at)}</td></tr>)}</tbody></table></div>{!orders.length && <EmptyState icon={ClipboardList} title="No completed orders" body="Receive a purchase or record a sale to begin." />}</section></div>; }

function ReportsView({ data, products, summary, money }: { data: Workspace; products: Product[]; summary: { units: number; costValue: number; retailValue: number; sales: number; purchases: number }; money: (value: number) => string }) {
  const categoryValues = data.categories.map((category) => ({ ...category, value: products.filter((product) => product.category_id === category.id).reduce((sum, product) => sum + product.stock * product.cost_cents, 0) })).filter((category) => category.value > 0).sort((a,b) => b.value-a.value);
  const max = Math.max(...categoryValues.map((category) => category.value), 1);
  const margin = summary.retailValue - summary.costValue;
  return <div className="page-stack"><section className="section-intro"><div><p className="eyebrow">Decision support</p><h2>Inventory reports</h2><p>Understand value, margin potential, stock exposure, and product mix.</p></div><div className="intro-actions"><a className="button secondary" href="/api/inventory?view=export-products"><Download size={17} />Product report</a><a className="button primary" href="/api/inventory?view=export-movements"><Download size={17} />Movement report</a></div></section><section className="report-kpis"><article><span>Cost value</span><strong>{money(summary.costValue)}</strong><small>Capital currently held in stock</small></article><article><span>Retail potential</span><strong>{money(summary.retailValue)}</strong><small>At current selling prices</small></article><article><span>Potential gross margin</span><strong>{money(margin)}</strong><small>{summary.retailValue ? `${Math.round(margin / summary.retailValue * 100)}% of retail value` : "No priced inventory"}</small></article><article><span>Stock turnover events</span><strong>{data.movements.length}</strong><small>Recent movement records loaded</small></article></section><div className="reports-grid"><section className="panel chart-panel"><PanelHeader title="Inventory value by category" subtitle="Cost value of current on-hand stock" /><div className="bar-chart">{categoryValues.map((category) => <div className="bar-row" key={category.id}><div><span>{category.name}</span><strong>{money(category.value)}</strong></div><div className="bar-track"><i style={{ width: `${Math.max(6, category.value/max*100)}%`, background: category.color }} /></div></div>)}{!categoryValues.length && <EmptyState icon={BarChart3} title="No report data" body="Add priced products to populate this report." />}</div></section><section className="panel insight-panel"><PanelHeader title="Stock health" subtitle="Operational snapshot" /><div className="insight-ring"><div><strong>{products.length ? Math.round(products.filter((p) => p.stock > p.reorder_point).length / products.length * 100) : 100}%</strong><span>healthy items</span></div></div><ul><li><span className="dot green" />{products.filter((p) => p.stock > p.reorder_point).length} above reorder point</li><li><span className="dot amber" />{products.filter((p) => p.stock > 0 && p.stock <= p.reorder_point).length} low-stock items</li><li><span className="dot red" />{products.filter((p) => p.stock === 0).length} out-of-stock items</li></ul></section></div></div>;
}

function SettingsView({ data, saving, onSave, onCategory }: { data: Workspace; saving: boolean; onSave: (payload: Record<string, unknown>) => Promise<unknown>; onCategory: () => void }) {
  const [name, setName] = useState(data.settings.business_name || "RK Empires Inventory");
  const [currency, setCurrency] = useState(data.settings.currency || "USD");
  return <div className="page-stack settings-layout"><section className="section-intro"><div><p className="eyebrow">Workspace controls</p><h2>Settings and audit</h2><p>Configure the workspace and review important administrative activity.</p></div></section><div className="settings-grid"><section className="panel settings-panel"><PanelHeader title="Business preferences" subtitle="Used throughout reports and order values" /><form onSubmit={(event) => { event.preventDefault(); void onSave({ business_name: name, currency }); }}><label className="field"><span>Workspace name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="field"><span>Currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="USD">USD — US Dollar</option><option value="PHP">PHP — Philippine Peso</option><option value="SGD">SGD — Singapore Dollar</option><option value="EUR">EUR — Euro</option><option value="GBP">GBP — British Pound</option><option value="AUD">AUD — Australian Dollar</option></select></label><button className="button primary" disabled={saving}>{saving ? <RefreshCw className="spin" /> : <Check />}Save preferences</button></form></section><section className="panel settings-panel"><PanelHeader title="Product categories" subtitle="Color-coded organization for your catalog" action={<button className="text-button" onClick={onCategory}><Plus size={15} />Add category</button>} /><div className="category-list">{data.categories.map((category) => <div key={category.id}><i style={{ background: category.color }} /><span>{category.name}</span><small>{data.products.filter((p) => p.category_id === category.id).length} products</small></div>)}</div></section></div><section className="panel audit-panel"><PanelHeader title="Audit activity" subtitle="Recent administrative and inventory events" /><div className="audit-list">{data.audit.slice(0, 20).map((entry) => <div key={entry.id}><span className="audit-icon"><Gauge /></span><div><strong>{entry.action} {entry.entity_type}</strong><p>{entry.details || `Record ${entry.entity_id}`}</p></div><aside><strong>{entry.actor}</strong><small>{formatDate(entry.created_at, true)}</small></aside></div>)}</div></section></div>;
}

function ProductModal({ product, categories, suppliers, saving, onClose, onSave }: { product: Product | null; categories: Category[]; suppliers: Supplier[]; saving: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<unknown> }) {
  return <Modal title={product ? "Edit product" : "Add a product"} description="Core details, valuation, and replenishment settings." onClose={onClose} wide><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void onSave({ id: product?.id, ...values }); }}><div className="form-grid"><label className="field span-2"><span>Product name *</span><input name="name" defaultValue={product?.name} required autoFocus placeholder="e.g. Thermal label roll 4 × 6" /></label><label className="field"><span>SKU *</span><input name="sku" defaultValue={product?.sku} required placeholder="LBL-2040" /></label><label className="field"><span>Barcode</span><input name="barcode" defaultValue={product?.barcode} placeholder="Scan or type" /></label><label className="field"><span>Category</span><select name="categoryId" defaultValue={product?.category_id ?? ""}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="field"><span>Supplier</span><select name="supplierId" defaultValue={product?.supplier_id ?? ""}><option value="">No supplier</option>{suppliers.filter((s) => s.status === "active").map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="field"><span>Storage location</span><input name="location" defaultValue={product?.location} placeholder="A-01-02" /></label><label className="field"><span>Unit</span><select name="unit" defaultValue={product?.unit || "each"}><option>each</option><option>box</option><option>pack</option><option>roll</option><option>ream</option><option>kg</option><option>liter</option><option>meter</option></select></label><label className="field"><span>Unit cost</span><input name="cost" type="number" min="0" step="0.01" defaultValue={product ? product.cost_cents / 100 : 0} /></label><label className="field"><span>Selling price</span><input name="price" type="number" min="0" step="0.01" defaultValue={product ? product.price_cents / 100 : 0} /></label><label className="field"><span>On-hand stock</span><input name="stock" type="number" min="0" step="1" defaultValue={product?.stock ?? 0} /></label><label className="field"><span>Reorder point</span><input name="reorderPoint" type="number" min="0" step="1" defaultValue={product?.reorder_point ?? 0} /></label><label className="field span-2"><span>Description</span><textarea name="description" defaultValue={product?.description} rows={3} placeholder="Optional product notes" /></label><input type="hidden" name="status" value={product?.status || "active"} /></div><ModalActions saving={saving} onClose={onClose} submit={product ? "Save changes" : "Add product"} /></form></Modal>;
}

function SupplierModal({ supplier, saving, onClose, onSave }: { supplier: Supplier | null; saving: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<unknown> }) { return <Modal title={supplier ? "Edit supplier" : "Add a supplier"} description="Contact details for purchasing and replenishment." onClose={onClose}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); void onSave({ id: supplier?.id, ...Object.fromEntries(new FormData(event.currentTarget)) }); }}><div className="form-grid"><label className="field span-2"><span>Supplier name *</span><input name="name" defaultValue={supplier?.name} required autoFocus /></label><label className="field"><span>Contact person</span><input name="contactName" defaultValue={supplier?.contact_name} /></label><label className="field"><span>Email</span><input name="email" type="email" defaultValue={supplier?.email} /></label><label className="field"><span>Phone</span><input name="phone" defaultValue={supplier?.phone} /></label><label className="field"><span>Status</span><select name="status" defaultValue={supplier?.status || "active"}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="field span-2"><span>Address</span><textarea name="address" defaultValue={supplier?.address} rows={3} /></label></div><ModalActions saving={saving} onClose={onClose} submit={supplier ? "Save changes" : "Add supplier"} /></form></Modal>; }

function AdjustmentModal({ selected, products, saving, onClose, onSave }: { selected: Product | null; products: Product[]; saving: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<unknown> }) { return <Modal title="Adjust stock" description="Use positive numbers to add stock and negative numbers to remove it." onClose={onClose}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); void onSave(Object.fromEntries(new FormData(event.currentTarget))); }}><label className="field"><span>Product *</span><select name="productId" defaultValue={selected?.id ?? ""} required autoFocus><option value="" disabled>Choose a product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.stock} on hand</option>)}</select></label><div className="form-grid"><label className="field"><span>Quantity change *</span><input name="quantity" type="number" step="1" defaultValue="1" required /></label><label className="field"><span>Reference</span><input name="reference" placeholder="COUNT-2026-01" /></label><label className="field span-2"><span>Reason *</span><textarea name="note" rows={3} required placeholder="Cycle count correction, damaged stock…" /></label></div><ModalActions saving={saving} onClose={onClose} submit="Apply adjustment" /></form></Modal>; }

function OrderModal({ type, products, suppliers, saving, money, onClose, onSave }: { type: string; products: Product[]; suppliers: Supplier[]; saving: boolean; money: (value: number) => string; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<unknown> }) {
  const [lines, setLines] = useState<OrderLine[]>([{ productId: "", quantity: "1", unitPrice: "" }]);
  const inbound = type === "purchase" || type === "return_in";
  const total = lines.reduce((sum, line) => { const product = products.find((p) => p.id === Number(line.productId)); const defaultCents = inbound ? product?.cost_cents : product?.price_cents; return sum + Number(line.quantity || 0) * (line.unitPrice === "" ? defaultCents || 0 : Math.round(Number(line.unitPrice) * 100)); }, 0);
  function update(index: number, patch: Partial<OrderLine>) { setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line)); }
  return <Modal title={type === "purchase" ? "Receive purchase" : type === "sale" ? "Record sale" : type === "return_in" ? "Customer return" : "Supplier return"} description="Completing this document updates stock and records the full audit trail." onClose={onClose} wide><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); void onSave({ type, counterparty: form.counterparty, orderNumber: form.orderNumber, note: form.note, items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, ...(line.unitPrice === "" ? {} : { unitPrice: line.unitPrice }) })) }); }}><div className="form-grid"><label className="field"><span>{inbound ? "Supplier / source" : "Customer / destination"}</span>{inbound ? <input name="counterparty" list="supplier-options" placeholder="Select or type a name" /> : <input name="counterparty" placeholder="Customer name (optional)" />}<datalist id="supplier-options">{suppliers.map((supplier) => <option key={supplier.id} value={supplier.name} />)}</datalist></label><label className="field"><span>Document number</span><input name="orderNumber" placeholder="Generated automatically" /></label></div><div className="order-lines"><div className="order-lines-head"><strong>Order lines</strong><span>{money(total)}</span></div>{lines.map((line, index) => { const product = products.find((p) => p.id === Number(line.productId)); return <div className="order-line" key={index}><label className="field"><span>Product</span><select value={line.productId} onChange={(event) => update(index, { productId: event.target.value, unitPrice: "" })} required><option value="">Choose product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.stock} available</option>)}</select></label><label className="field"><span>Quantity</span><input type="number" min="1" step="1" value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} required /></label><label className="field"><span>Unit price</span><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => update(index, { unitPrice: event.target.value })} placeholder={product ? String((inbound ? product.cost_cents : product.price_cents) / 100) : "0.00"} /></label><button type="button" className="icon-button line-delete" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} disabled={lines.length === 1} aria-label="Remove order line"><Trash2 size={17} /></button></div>; })}<button type="button" className="add-line" onClick={() => setLines((current) => [...current, { productId: "", quantity: "1", unitPrice: "" }])}><Plus size={16} />Add another line</button></div><label className="field"><span>Notes</span><textarea name="note" rows={3} placeholder="Optional receiving, sale, or return notes" /></label><div className="order-total"><span>Document total</span><strong>{money(total)}</strong></div><ModalActions saving={saving} onClose={onClose} submit={type === "purchase" ? "Receive & update stock" : type === "sale" ? "Complete sale" : "Record return"} /></form></Modal>;
}

function CategoryModal({ saving, onClose, onSave }: { saving: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<unknown> }) { return <Modal title="Add category" description="Create a color-coded group for products." onClose={onClose}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); void onSave(Object.fromEntries(new FormData(event.currentTarget))); }}><div className="form-grid"><label className="field"><span>Category name *</span><input name="name" required autoFocus /></label><label className="field"><span>Color</span><input name="color" type="color" defaultValue="#5b6cf9" className="color-input" /></label></div><ModalActions saving={saving} onClose={onClose} submit="Add category" /></form></Modal>; }

function ModalActions({ saving, onClose, submit }: { saving: boolean; onClose: () => void; submit: string }) { return <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? <><RefreshCw className="spin" size={17} />Saving…</> : submit}</button></footer>; }
