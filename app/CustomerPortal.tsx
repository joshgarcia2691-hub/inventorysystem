"use client";

import Image from "next/image";
import { Check, ChevronRight, History, LogOut, Minus, Package, Plus, Search, ShoppingBag, ShoppingCart, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type User = { id: number; displayName: string; email: string; role: "admin" | "customer" };
type Product = { id: number; sku: string; name: string; description: string; category_id: number | null; category_name: string | null; category_color: string | null; unit: string; price_cents: number; stock: number };
type Category = { id: number; name: string; color: string };
type Order = { id: number; order_number: string; status: string; total_cents: number; item_count: number; created_at: string };
type CustomerData = { products: Product[]; categories: Category[]; orders: Order[]; settings: Record<string, string> };

const emptyData: CustomerData = { products: [], categories: [], orders: [], settings: {} };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function CustomerPortal({ user }: { user: User }) {
  const [data, setData] = useState<CustomerData>(emptyData);
  const [view, setView] = useState<"catalog" | "orders">("catalog");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/customer", { cache: "no-store" });
      const payload = await response.json() as CustomerData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load the customer portal.");
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the customer portal.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3500); return () => window.clearTimeout(timer); }, [toast]);

  const currency = data.settings.currency || "USD";
  const money = useCallback((cents: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100), [currency]);
  const filtered = useMemo(() => data.products.filter((product) => {
    const term = search.toLowerCase();
    return (!term || [product.name, product.sku, product.description, product.category_name].some((value) => value?.toLowerCase().includes(term)))
      && (category === "all" || String(product.category_id) === category);
  }), [category, data.products, search]);
  const cartLines = useMemo(() => data.products.flatMap((product) => cart[product.id] ? [{ product, quantity: cart[product.id] }] : []), [cart, data.products]);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.quantity * line.product.price_cents, 0);

  function changeQuantity(product: Product, delta: number) {
    setCart((current) => {
      const next = Math.max(0, Math.min(product.stock, (current[product.id] || 0) + delta));
      const copy = { ...current };
      if (next) copy[product.id] = next;
      else delete copy[product.id];
      return copy;
    });
  }

  async function checkout() {
    if (!cartLines.length) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/customer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "checkout", items: cartLines.map(({ product, quantity }) => ({ productId: product.id, quantity })) }),
      });
      const payload = await response.json() as { error?: string; orderNumber?: string };
      if (!response.ok) throw new Error(payload.error || "Your order could not be placed.");
      setCart({}); setCartOpen(false); setToast(`Order ${payload.orderNumber} placed successfully`); setView("orders"); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your order could not be placed."); }
    finally { setSaving(false); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  return <div className="customer-shell">
    <header className="customer-header">
      <a className="customer-brand" href="#top" aria-label="The Zaza Club home"><Image src="/the-zaza-club-logo.jpeg" alt="" width={48} height={48} /><span><strong>The Zaza Club</strong><small>Live inventory</small></span></a>
      <nav aria-label="Customer portal"><button className={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}><ShoppingBag />Catalog</button><button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}><History />My orders</button></nav>
      <div className="customer-actions"><button className="customer-cart-button" onClick={() => setCartOpen(true)} aria-label={`Open cart with ${cartCount} items`}><ShoppingCart /><span>Cart</span>{cartCount > 0 && <em>{cartCount}</em>}</button><div className="customer-profile"><span>{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>Customer</small></div></div><button className="customer-logout" onClick={() => void logout()} aria-label="Sign out"><LogOut /></button></div>
    </header>

    <main id="top" className="customer-main">
      {error && <div className="customer-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X /></button></div>}
      {toast && <div className="customer-toast" role="status"><Check />{toast}</div>}
      {view === "catalog" ? <>
        <section className="customer-hero"><div><p><Sparkles />The Zaza Club customer portal</p><h1>Find your favorites.<br /><span>Order with confidence.</span></h1><p>Browse live inventory, confirm availability, and place your order in a few focused steps.</p><button onClick={() => document.getElementById("catalog")?.scrollIntoView()}><ShoppingBag />Explore catalog<ChevronRight /></button></div><div className="hero-emblem"><Image src="/the-zaza-club-logo.jpeg" alt="The Zaza Club" width={330} height={330} priority /></div></section>
        <section id="catalog" className="catalog-section">
          <div className="catalog-heading"><div><p className="gold-eyebrow">Live product catalog</p><h2>Available inventory</h2><p>{data.products.length} products connected to real-time stock.</p></div><div className="catalog-controls"><label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products or SKU" /></label><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div>
          {loading ? <div className="customer-loading">Loading current inventory…</div> : <div className="product-card-grid">{filtered.map((product) => <article className="customer-product-card" key={product.id}><div className="product-card-visual"><span style={{ background: product.category_color || "#b7f16f" }} /><Package /><small>{product.sku}</small></div><div className="product-card-body"><p>{product.category_name || "General inventory"}</p><h3>{product.name}</h3><span className="product-description">{product.description || `Quality ${product.unit} supplied through The Zaza Club.`}</span><div className="product-card-meta"><strong>{money(product.price_cents)}</strong><small>{product.stock > 0 ? `${product.stock} ${product.unit}${product.stock === 1 ? "" : "s"} available` : "Out of stock"}</small></div><button disabled={product.stock < 1} onClick={() => { changeQuantity(product, 1); setToast(`${product.name} added to cart`); }}><Plus />{product.stock > 0 ? "Add to cart" : "Unavailable"}</button></div></article>)}{!filtered.length && <div className="catalog-empty"><Package /><strong>No matching products</strong><p>Try another search or category.</p></div>}</div>}
        </section>
      </> : <section className="customer-orders-page"><div className="orders-page-head"><p className="gold-eyebrow">Customer account</p><h1>My orders</h1><p>Review every order placed through your Zaza Club account.</p></div><div className="customer-orders-list">{data.orders.map((order) => <article key={order.id}><span><ShoppingBag /></span><div><strong>{order.order_number}</strong><small>{order.item_count} item{Number(order.item_count) === 1 ? "" : "s"} · {formatDate(order.created_at)}</small></div><p><strong>{money(order.total_cents)}</strong><small>{order.status}</small></p></article>)}{!data.orders.length && <div className="orders-empty"><History /><h2>No orders yet</h2><p>Your completed orders will appear here.</p><button onClick={() => setView("catalog")}>Browse the catalog</button></div>}</div></section>}
    </main>

    {cartOpen && <><button className="cart-scrim" onClick={() => setCartOpen(false)} aria-label="Close cart" /><aside className="cart-drawer" aria-label="Shopping cart"><header><div><p className="gold-eyebrow">Your selection</p><h2>Shopping cart</h2></div><button onClick={() => setCartOpen(false)} aria-label="Close cart"><X /></button></header><div className="cart-lines">{cartLines.map(({ product, quantity }) => <div className="cart-line" key={product.id}><span><Package /></span><div><strong>{product.name}</strong><small>{money(product.price_cents)} each</small><div><button onClick={() => changeQuantity(product, -1)} aria-label={`Remove one ${product.name}`}><Minus /></button><em>{quantity}</em><button onClick={() => changeQuantity(product, 1)} disabled={quantity >= product.stock} aria-label={`Add one ${product.name}`}><Plus /></button></div></div><strong>{money(product.price_cents * quantity)}</strong></div>)}{!cartLines.length && <div className="cart-empty"><ShoppingCart /><strong>Your cart is empty</strong><p>Add products from the catalog to get started.</p></div>}</div><footer><div><span>Order total</span><strong>{money(cartTotal)}</strong></div><button disabled={!cartLines.length || saving} onClick={() => void checkout()}>{saving ? "Placing order…" : <>Place order<ArrowRightIcon /></>}</button><p>Stock is confirmed again when you place the order.</p></footer></aside></>}
  </div>;
}

function ArrowRightIcon() {
  return <ChevronRight aria-hidden="true" />;
}
