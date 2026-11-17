'use strict';
// Vendor portal API: registration, dashboard, products, inventory, orders,
// customers, marketing, analytics, finance, reviews, team and store settings.

const crypto = require('crypto');
const { db, save } = require('../store');
const auth = require('../auth');
const D = require('../domain');
const { startUserSession } = require('./public');
const {
  HttpError, sendJson, readJson, str, optStr, num, email, password, oneOf, imageUrl, slugify, paginate,
  route, requireUser, requireRole, requireVendor, TEAM_PERMISSIONS, audit,
} = require('../http');

const money = (n) => Math.round(n);
const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0));

// ---------- registration ----------

route('POST', '/api/vendor/register', async (ctx) => {
  const body = await readJson(ctx.req);
  const storeName = str(body.storeName, 'Store name', 3, 60);
  const slug = slugify(storeName);
  if (!slug) throw new HttpError(400, 'Store name must contain letters or numbers');
  if (db.vendors.some((v) => v.slug === slug)) throw new HttpError(409, 'A store with this name already exists');

  const business = {
    description: str(body.description, 'Store description', 10, 600),
    businessType: oneOf(body.businessType, ['individual', 'company'], 'Business type'),
    country: str(body.country, 'Country', 2, 60),
    city: str(body.city, 'City', 2, 60),
    phone: str(body.phone, 'Business phone', 6, 20),
    taxId: optStr(body.taxId, 'Tax ID', 40),
    idType: oneOf(body.idType, ['national_id', 'passport', 'driver_license', 'company_registration'], 'ID type'),
  };
  const idNumber = str(body.idNumber, 'ID number', 4, 40);
  if (body.acceptTerms !== true) throw new HttpError(400, 'You must accept the seller terms');

  let user = ctx.user;
  if (user && user.role !== 'buyer') throw new HttpError(409, 'This account cannot open a store');
  if (!user) {
    const mail = email(body.email);
    if (db.users.some((u) => u.email === mail)) throw new HttpError(409, 'An account with this email already exists. Log in first, then register your store.');
    user = {
      id: crypto.randomUUID(), name: str(body.name, 'Your name', 2, 60), email: mail, passwordHash: auth.hashPassword(password(body.password)),
      role: 'buyer', status: 'active', emailVerified: false, points: 0, pointsLedger: [], addresses: [], createdAt: new Date().toISOString(),
    };
    db.users.push(user);
  }
  const vendor = {
    id: D.newId('v_'), ownerId: user.id, storeName, slug, ...business,
    // Only the last 4 characters of the ID are kept; an admin verifies the document off-platform.
    idLast4: idNumber.slice(-4), status: 'pending', commissionRate: null, createdAt: new Date().toISOString(),
    branding: { color: '#4f46e5', logo: '', banner: '', tagline: '' },
    shipping: { flatRate: 2500, freeOver: 100000, processingDays: 2 },
    payment: { method: 'mobile_money', account: '', accountName: '' },
    tax: { collect: true },
    warehouses: [{ id: D.newId('w_'), name: 'Main warehouse', city: business.city }],
    team: [], banners: [],
  };
  db.vendors.push(vendor);
  user.role = 'vendor';
  user.vendorId = vendor.id;
  user.staffRole = 'owner';
  save('vendors');
  save('users');
  if (!ctx.session || ctx.session.userId !== user.id) startUserSession(ctx, user);
  ctx.user = user;
  audit(ctx, 'vendor_registered', storeName);
  sendJson(ctx.res, 201, { user: D.publicUser(user) });
});

route('GET', '/api/vendor/me', (ctx) => {
  const { user, vendor, role } = requireVendor(ctx, null, { allowPending: true });
  const { idLast4, ...rest } = vendor;
  sendJson(ctx.res, 200, {
    vendor: { ...rest, idLast4 },
    role,
    permissions: TEAM_PERMISSIONS[role] === '*' ? ['*'] : TEAM_PERMISSIONS[role],
    categories: db.categories.filter((c) => c.active !== false).map((c) => c.name),
    user: D.publicUser(user),
    unreadMessages: db.conversations.filter((c) => c.vendorId === vendor.id).reduce((s, c) => s + ((c.unread || {}).vendor || 0), 0),
  });
});

// ---------- dashboard ----------

function periodStats(rows, from, to) {
  const inRange = rows.filter(({ order }) => {
    const t = new Date(order.createdAt).getTime();
    return t >= from && t < to;
  });
  const live = inRange.filter(({ shipment }) => D.shipmentCounts(shipment));
  const refunded = inRange.filter(({ shipment }) => shipment.return && shipment.return.status === 'refunded');
  const revenue = live.reduce((s, { shipment }) => s + D.shipmentRevenue(shipment), 0);
  return {
    revenue: money(revenue),
    orders: live.length,
    units: live.reduce((s, { shipment }) => s + shipment.items.reduce((n, i) => n + i.quantity, 0), 0),
    customers: new Set(live.map(({ order }) => order.userId)).size,
    refunds: money(refunded.reduce((s, { shipment }) => s + D.shipmentRevenue(shipment), 0)),
    aov: live.length ? money(revenue / live.length) : 0,
  };
}

route('GET', '/api/vendor/overview', (ctx) => {
  const { vendor } = requireVendor(ctx);
  const days = [7, 30, 90].includes(Number(ctx.url.searchParams.get('days'))) ? Number(ctx.url.searchParams.get('days')) : 30;
  const rows = D.vendorShipments(vendor.id);
  const now = Date.now();
  const cur = periodStats(rows, now - days * 86400000, Infinity);
  const prev = periodStats(rows, now - 2 * days * 86400000, now - days * 86400000);

  const labels = D.lastDays(days);
  const revenueByDay = Object.fromEntries(labels.map((d) => [d, 0]));
  const ordersByDay = Object.fromEntries(labels.map((d) => [d, 0]));
  for (const { order, shipment } of rows) {
    const k = D.dayKey(order.createdAt);
    if (k in revenueByDay && D.shipmentCounts(shipment)) {
      revenueByDay[k] += D.shipmentRevenue(shipment);
      ordersByDay[k] += 1;
    }
  }
  const products = db.products.filter((p) => p.vendorId === vendor.id);
  const totalViews = products.reduce((s, p) => s + (p.views || 0), 0);
  const allOrders = rows.filter((r) => D.shipmentCounts(r.shipment)).length;
  const kpi = (key) => ({ value: cur[key], previous: prev[key], change: pctChange(cur[key], prev[key]) });

  const perProduct = new Map();
  for (const { order, shipment } of rows) {
    if (!D.shipmentCounts(shipment) || new Date(order.createdAt).getTime() < now - days * 86400000) continue;
    for (const it of shipment.items) {
      const e = perProduct.get(it.productId) || { id: it.productId, name: it.name, image: it.image, units: 0, revenue: 0 };
      e.units += it.quantity;
      e.revenue += it.lineTotal;
      perProduct.set(it.productId, e);
    }
  }
  sendJson(ctx.res, 200, {
    days,
    kpis: {
      revenue: kpi('revenue'), orders: kpi('orders'), units: kpi('units'), customers: kpi('customers'),
      refunds: kpi('refunds'), aov: kpi('aov'),
      conversion: { value: totalViews ? Math.round((allOrders / totalViews) * 1000) / 10 : 0, previous: null, change: null },
    },
    series: { labels, revenue: labels.map((d) => revenueByDay[d]), orders: labels.map((d) => ordersByDay[d]) },
    topProducts: [...perProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    recentOrders: rows.slice(0, 6).map(({ order, shipment }) => ({
      id: order.id, createdAt: order.createdAt, customer: order.shippingAddress.fullName, total: D.shipmentRevenue(shipment), status: shipment.status,
    })),
    alerts: {
      lowStock: products.filter((p) => p.status !== 'archived' && p.stock <= (p.lowStockThreshold ?? 5)).length,
      newOrders: rows.filter((r) => r.shipment.status === 'placed').length,
      returns: rows.filter((r) => r.shipment.return && r.shipment.return.status === 'requested').length,
      unreadMessages: db.conversations.filter((c) => c.vendorId === vendor.id).reduce((s, c) => s + ((c.unread || {}).vendor || 0), 0),
    },
  });
});

// ---------- products ----------

function productRow(p) {
  return {
    id: p.id, name: p.name, category: p.category, price: p.price, comparePrice: p.comparePrice || null, stock: p.stock,
    lowStockThreshold: p.lowStockThreshold ?? 5, sku: p.sku, warehouse: p.warehouse || '', image: p.images[0], status: p.status,
    sold: p.sold || 0, views: p.views || 0, flash: D.flashActive(p) ? p.flash : null, createdAt: p.createdAt,
  };
}

// A seller may use an existing category or type a new one. Matching ignores case and spacing,
// so "home  appliances" reuses "Home Appliances" instead of creating a duplicate.
function resolveCategory(rawName, vendor) {
  const name = str(rawName, 'Category', 2, 40).replace(/\s+/g, ' ');
  if (!/[a-z0-9]/i.test(name)) throw new HttpError(400, 'Category must contain letters or numbers');
  const slug = slugify(name);
  const found = db.categories.find((c) => c.name.toLowerCase() === name.toLowerCase() || c.slug === slug);
  if (found) {
    if (found.active === false) throw new HttpError(400, `The category "${found.name}" is not available right now. Choose another one.`);
    return { name: found.name, commit: null };
  }
  // The category is only written once the rest of the product has passed validation.
  return { name, commit: () => {
    db.categories.push({ name, slug, icon: 'tag', description: '', active: true, createdBy: vendor ? vendor.id : null, createdAt: new Date().toISOString() });
    save('categories');
  } };
}

function applyProduct(p, body, create, vendor) {
  const need = (key) => create && body[key] === undefined;
  if (need('name') || body.name !== undefined) p.name = str(body.name, 'Product name', 3, 120);
  let commitCategory = null;
  if (need('category') || body.category !== undefined) { const r = resolveCategory(body.category, vendor); p.category = r.name; commitCategory = r.commit; }
  if (need('description') || body.description !== undefined) p.description = str(body.description, 'Description', 10, 4000);
  if (need('price') || body.price !== undefined) p.price = num(body.price, 'Price', 1, 100000000);
  if (body.comparePrice !== undefined) {
    p.comparePrice = body.comparePrice === null || body.comparePrice === '' ? null : num(body.comparePrice, 'Original price', 1, 100000000);
  }
  if (p.comparePrice && p.comparePrice <= p.price) p.comparePrice = null;
  if (need('stock') || body.stock !== undefined) p.stock = num(body.stock, 'Stock', 0, 1000000);
  if (body.lowStockThreshold !== undefined) p.lowStockThreshold = num(body.lowStockThreshold, 'Low stock alert', 0, 100000);
  if (body.sku !== undefined) p.sku = optStr(body.sku, 'SKU', 40);
  if (body.warehouse !== undefined) p.warehouse = optStr(body.warehouse, 'Warehouse', 60);
  if (need('images') || body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 8) throw new HttpError(400, 'Add between 1 and 8 images');
    p.images = body.images.map((u) => imageUrl(u, 'Image'));
  }
  if (body.video !== undefined) {
    const v = optStr(body.video, 'Video link', 300);
    if (v && !/^https:\/\/[^\s]+$/.test(v)) throw new HttpError(400, 'Video link must start with https://');
    p.video = v || null;
  }
  if (body.colors !== undefined) {
    if (!Array.isArray(body.colors) || body.colors.length > 12) throw new HttpError(400, 'Up to 12 colors');
    p.colors = body.colors.map((c) => ({
      name: str(c && c.name, 'Color name', 1, 30),
      hex: /^#[0-9a-fA-F]{6}$/.test(c && c.hex) ? c.hex : '#888888',
    }));
  }
  if (body.sizes !== undefined) {
    if (!Array.isArray(body.sizes) || body.sizes.length > 15) throw new HttpError(400, 'Up to 15 sizes');
    p.sizes = body.sizes.map((s) => str(s, 'Size', 1, 20));
  }
  if (body.shipping !== undefined) {
    const s = body.shipping || {};
    p.shipping = {
      weightKg: s.weightKg === undefined || s.weightKg === '' ? 0 : num(s.weightKg, 'Weight', 0, 1000, false),
      processingDays: s.processingDays === undefined || s.processingDays === '' ? 2 : num(s.processingDays, 'Processing days', 0, 60),
      freeShipping: Boolean(s.freeShipping),
    };
  }
  if (body.seo !== undefined) {
    const s = body.seo || {};
    p.seo = { title: optStr(s.title, 'SEO title', 70), description: optStr(s.description, 'SEO description', 160) };
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 12) throw new HttpError(400, 'Up to 12 tags');
    p.tags = body.tags.map((t) => str(t, 'Tag', 1, 30).toLowerCase());
  }
  if (body.status !== undefined) p.status = oneOf(body.status, ['active', 'draft', 'archived'], 'Status');
  if (commitCategory) commitCategory();
  p.updatedAt = new Date().toISOString();
}

function ownProduct(ctx, vendor) {
  const p = db.products.find((x) => x.id === ctx.params.id && x.vendorId === vendor.id);
  if (!p) throw new HttpError(404, 'Product not found');
  return p;
}

route('GET', '/api/vendor/products', (ctx) => {
  const { vendor } = requireVendor(ctx, 'products', { pendingOk: true });
  const q = ctx.url.searchParams;
  let list = db.products.filter((p) => p.vendorId === vendor.id);
  const text = (q.get('q') || '').trim().toLowerCase();
  if (text) list = list.filter((p) => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(text));
  if (q.get('status')) list = list.filter((p) => p.status === q.get('status'));
  if (q.get('category')) list = list.filter((p) => p.category === q.get('category'));
  if (q.get('stock') === 'low') list = list.filter((p) => p.stock > 0 && p.stock <= (p.lowStockThreshold ?? 5));
  if (q.get('stock') === 'out') list = list.filter((p) => p.stock === 0);
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = paginate(list, q, 10, 100);
  sendJson(ctx.res, 200, { products: page.items.map(productRow), total: page.total, page: page.page, pages: page.pages });
});

route('POST', '/api/vendor/products', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'products', { pendingOk: true });
  const body = await readJson(ctx.req, 200000);
  const p = {
    id: slugify(String(body.name || 'product')).slice(0, 40) + '-' + crypto.randomBytes(2).toString('hex'),
    vendorId: vendor.id, comparePrice: null, lowStockThreshold: 5, sku: '', warehouse: '', video: null, colors: [], sizes: [],
    shipping: { weightKg: 0, processingDays: 2, freeShipping: false }, seo: { title: '', description: '' }, tags: [],
    status: 'active', featured: false, flash: null, sold: 0, views: 0, createdAt: new Date().toISOString(),
  };
  applyProduct(p, body, true, vendor);
  if (!p.sku) p.sku = (vendor.slug.slice(0, 3) + '-' + crypto.randomBytes(3).toString('hex')).toUpperCase();
  db.products.push(p);
  save('products');
  sendJson(ctx.res, 201, { product: p });
});

route('GET', '/api/vendor/products/:id', (ctx) => {
  const { vendor } = requireVendor(ctx, 'products', { pendingOk: true });
  sendJson(ctx.res, 200, { product: ownProduct(ctx, vendor) });
});

route('PATCH', '/api/vendor/products/:id', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'products', { pendingOk: true });
  const p = ownProduct(ctx, vendor);
  if (p.status === 'blocked') throw new HttpError(403, 'This product was blocked by an administrator');
  applyProduct(p, await readJson(ctx.req, 200000), false, vendor);
  save('products');
  sendJson(ctx.res, 200, { product: p });
});

route('DELETE', '/api/vendor/products/:id', (ctx) => {
  const { vendor } = requireVendor(ctx, 'products', { pendingOk: true });
  const p = ownProduct(ctx, vendor);
  db.products.splice(db.products.indexOf(p), 1);
  save('products');
  sendJson(ctx.res, 200, { ok: true });
});

route('POST', '/api/vendor/products/bulk', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'products', { pendingOk: true });
  const body = await readJson(ctx.req);
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 200) : [];
  const action = oneOf(body.action, ['activate', 'draft', 'archive', 'delete', 'discount', 'end_discount'], 'Action');
  const targets = db.products.filter((p) => p.vendorId === vendor.id && ids.includes(p.id));
  if (!targets.length) throw new HttpError(400, 'Select at least one product');
  const percent = action === 'discount' ? num(body.percent, 'Discount percent', 1, 90) : 0;
  for (const p of targets) {
    if (p.status === 'blocked') continue;
    if (action === 'activate') p.status = 'active';
    else if (action === 'draft') p.status = 'draft';
    else if (action === 'archive') p.status = 'archived';
    else if (action === 'discount') {
      const base = p.comparePrice && p.comparePrice > p.price ? p.comparePrice : p.price;
      p.comparePrice = base;
      p.price = Math.max(1, Math.round(base * (100 - percent) / 100));
    } else if (action === 'end_discount' && p.comparePrice) {
      p.price = p.comparePrice;
      p.comparePrice = null;
    }
  }
  if (action === 'delete') db.products = db.products.filter((p) => !(p.vendorId === vendor.id && ids.includes(p.id) && p.status !== 'blocked'));
  save('products');
  sendJson(ctx.res, 200, { affected: targets.length });
});

// ---------- inventory ----------

route('GET', '/api/vendor/inventory', (ctx) => {
  const { vendor } = requireVendor(ctx, 'inventory', { pendingOk: true });
  const all = db.products.filter((p) => p.vendorId === vendor.id && p.status !== 'archived');
  const filter = ctx.url.searchParams.get('filter');
  let list = all;
  if (filter === 'low') list = all.filter((p) => p.stock > 0 && p.stock <= (p.lowStockThreshold ?? 5));
  if (filter === 'out') list = all.filter((p) => p.stock === 0);
  const warehouse = ctx.url.searchParams.get('warehouse');
  if (warehouse) list = list.filter((p) => p.warehouse === warehouse);
  sendJson(ctx.res, 200, {
    items: list.map(productRow),
    summary: {
      units: all.reduce((s, p) => s + p.stock, 0),
      value: all.reduce((s, p) => s + p.stock * p.price, 0),
      low: all.filter((p) => p.stock > 0 && p.stock <= (p.lowStockThreshold ?? 5)).length,
      out: all.filter((p) => p.stock === 0).length,
      skus: all.length,
    },
    warehouses: vendor.warehouses || [],
  });
});

route('PATCH', '/api/vendor/inventory/:id', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'inventory', { pendingOk: true });
  const p = ownProduct(ctx, vendor);
  const body = await readJson(ctx.req);
  if (body.stock !== undefined) p.stock = num(body.stock, 'Stock', 0, 1000000);
  if (body.adjust !== undefined) p.stock = Math.max(0, p.stock + num(body.adjust, 'Adjustment', -1000000, 1000000));
  if (body.sku !== undefined) p.sku = str(body.sku, 'SKU', 2, 40);
  if (body.warehouse !== undefined) p.warehouse = optStr(body.warehouse, 'Warehouse', 60);
  if (body.lowStockThreshold !== undefined) p.lowStockThreshold = num(body.lowStockThreshold, 'Low stock alert', 0, 100000);
  save('products');
  sendJson(ctx.res, 200, { item: productRow(p) });
});

route('POST', '/api/vendor/warehouses', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'inventory', { pendingOk: true });
  const body = await readJson(ctx.req);
  vendor.warehouses = vendor.warehouses || [];
  if (vendor.warehouses.length >= 10) throw new HttpError(400, 'You can have up to 10 warehouses');
  vendor.warehouses.push({ id: D.newId('w_'), name: str(body.name, 'Warehouse name', 2, 60), city: str(body.city, 'City', 2, 60) });
  save('vendors');
  sendJson(ctx.res, 201, { warehouses: vendor.warehouses });
});

route('DELETE', '/api/vendor/warehouses/:id', (ctx) => {
  const { vendor } = requireVendor(ctx, 'inventory', { pendingOk: true });
  const w = (vendor.warehouses || []).find((x) => x.id === ctx.params.id);
  if (!w) throw new HttpError(404, 'Warehouse not found');
  if (db.products.some((p) => p.vendorId === vendor.id && p.warehouse === w.name)) {
    throw new HttpError(409, 'Move the products stored here to another warehouse first');
  }
  vendor.warehouses = vendor.warehouses.filter((x) => x.id !== w.id);
  save('vendors');
  sendJson(ctx.res, 200, { warehouses: vendor.warehouses });
});

// ---------- orders ----------

function orderRow(order, sh) {
  return {
    id: order.id, createdAt: order.createdAt, status: sh.status, items: sh.items, subtotal: sh.subtotal, vendorDiscount: sh.vendorDiscount || 0,
    commission: sh.commission, net: sh.net, tax: sh.tax, customer: order.shippingAddress.fullName, phone: order.shippingAddress.phone,
    address: order.shippingAddress, delivery: order.delivery, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
    trackingNumber: sh.trackingNumber, carrier: sh.carrier, return: sh.return, timeline: sh.timeline, buyerId: order.userId,
    // cash on delivery: the seller says whether the driver really collected the money
    cashPending: order.paymentMethod === 'cod' && sh.status === 'delivered' && !sh.cashCollected && order.paymentStatus === 'pending',
    cashCollected: Boolean(sh.cashCollected), refundDue: Boolean(sh.refundDue),
  };
}

route('GET', '/api/vendor/orders', (ctx) => {
  const { vendor } = requireVendor(ctx, 'orders');
  const q = ctx.url.searchParams;
  const rows = D.vendorShipments(vendor.id);
  const counts = { all: rows.length, placed: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0, returns: 0 };
  for (const r of rows) {
    counts[r.shipment.status] += 1;
    if (r.shipment.return && r.shipment.return.status === 'requested') counts.returns += 1;
  }
  let list = rows;
  const status = q.get('status');
  if (status === 'returns') list = list.filter((r) => r.shipment.return);
  else if (status) list = list.filter((r) => r.shipment.status === status);
  const text = (q.get('q') || '').trim().toLowerCase();
  if (text) list = list.filter((r) => `${r.order.id} ${r.order.shippingAddress.fullName}`.toLowerCase().includes(text));
  const page = paginate(list, q, 10, 50);
  sendJson(ctx.res, 200, { orders: page.items.map((r) => orderRow(r.order, r.shipment)), counts, total: page.total, page: page.page, pages: page.pages });
});

const NEXT = { placed: ['processing', 'cancelled'], processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

route('PATCH', '/api/vendor/orders/:id', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'orders');
  const order = db.orders.find((o) => o.id === ctx.params.id);
  const sh = order && order.shipments.find((s) => s.vendorId === vendor.id);
  if (!sh) throw new HttpError(404, 'Order not found');
  const body = await readJson(ctx.req);
  if (body.trackingNumber !== undefined) sh.trackingNumber = optStr(body.trackingNumber, 'Tracking number', 60);
  if (body.carrier !== undefined) sh.carrier = optStr(body.carrier, 'Carrier', 40);
  if (body.status && body.status !== sh.status) {
    if (!NEXT[sh.status].includes(body.status)) throw new HttpError(409, `An order that is ${sh.status} cannot become ${body.status}`);
    sh.status = body.status;
    sh.timeline.push({ status: body.status, at: new Date().toISOString() });
    if (body.status === 'cancelled') {
      D.releaseReservation(sh);   // the parcel never left: put the reserved stock back
      D.flagRefundDue(order, sh); // an admin sends any money back; nothing is marked refunded automatically
    }
    // Delivering a parcel does NOT mark payment as received. For cash on delivery the seller confirms
    // the cash separately (see /payment below); for everything else an admin confirms the money.
    D.notify(order.userId, 'order', `Order ${order.id} ${body.status}`, `${vendor.storeName} updated your order to "${body.status}".`, `#/account/orders/${order.id}`);
  }
  save('orders');
  save('products');
  sendJson(ctx.res, 200, { order: orderRow(order, sh) });
});

route('POST', '/api/vendor/orders/:id/return', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'orders');
  const order = db.orders.find((o) => o.id === ctx.params.id);
  const sh = order && order.shipments.find((s) => s.vendorId === vendor.id);
  if (!sh || !sh.return) throw new HttpError(404, 'No return request for this order');
  const body = await readJson(ctx.req);
  // requested -> approve | reject ; approved -> received (the seller confirms the goods are back)
  // The refund itself is sent, and marked, by an admin.
  const action = oneOf(body.action, ['approve', 'reject', 'received'], 'Action');
  const from = sh.return.status;
  if ((action === 'approve' || action === 'reject') && from !== 'requested') throw new HttpError(409, `This return is already ${from}`);
  if (action === 'received' && from !== 'approved') throw new HttpError(409, 'Approve the return first');
  sh.return.note = optStr(body.note, 'Note', 300) || sh.return.note || '';
  sh.return.resolvedAt = new Date().toISOString();
  if (action === 'reject') sh.return.status = 'rejected';
  if (action === 'approve') sh.return.status = 'approved';
  if (action === 'received') {
    sh.return.status = 'received';
    // Goods are only put back on the shelf if the seller says they are fit to resell.
    if (body.restock === true) { D.releaseReservation(sh); sh.return.restocked = true; }
    D.flagRefundDue(order, sh);
  }
  save('orders');
  const msgs = {
    approve: [`Return approved`, `Your return for order ${order.id} was approved. Send the items back to the seller.`],
    reject: [`Return declined`, `Your return for order ${order.id} was declined.`],
    received: [`Return received`, `The seller received your items for order ${order.id}. Your refund will be sent by PrinceMall staff.`],
  };
  D.notify(order.userId, 'order', msgs[action][0], msgs[action][1], `#/account/orders/${order.id}`);
  sendJson(ctx.res, 200, { order: orderRow(order, sh) });
});

// Cash on delivery: only the seller can say the driver actually collected the cash.
route('POST', '/api/vendor/orders/:id/payment', async (ctx) => {
  const { user, vendor } = requireVendor(ctx, 'orders');
  const order = db.orders.find((o) => o.id === ctx.params.id);
  const sh = order && order.shipments.find((s) => s.vendorId === vendor.id);
  if (!sh) throw new HttpError(404, 'Order not found');
  if (order.paymentMethod !== 'cod') throw new HttpError(409, 'Only cash on delivery orders are confirmed by the seller. Other payments are confirmed by PrinceMall.');
  if (sh.status !== 'delivered') throw new HttpError(409, 'Mark the parcel as delivered before confirming the cash');
  if (sh.cashCollected) throw new HttpError(409, 'You already confirmed the cash for this parcel');
  const body = await readJson(ctx.req);
  sh.cashCollected = true;
  sh.cashCollectedAt = new Date().toISOString();
  sh.cashCollectedBy = user.email;
  optStr(body.note, 'Note', 200);
  // The order counts as paid once every parcel that was not cancelled has its cash confirmed.
  if (order.shipments.filter((s) => s.status !== 'cancelled').every((s) => s.cashCollected)) D.markPaid(order, `seller ${user.email}`, optStr(body.reference, 'Reference', 60) || null);
  save('orders');
  sendJson(ctx.res, 200, { order: orderRow(order, sh) });
});

// ---------- customers ----------

function customerList(vendor) {
  const map = new Map();
  for (const { order, shipment } of D.vendorShipments(vendor.id)) {
    if (shipment.status === 'cancelled') continue;
    const c = map.get(order.userId) || { id: order.userId, name: order.shippingAddress.fullName, city: order.shippingAddress.city, orders: 0, spent: 0, firstOrder: order.createdAt, lastOrder: order.createdAt };
    c.orders += 1;
    c.spent += D.shipmentRevenue(shipment);
    if (order.createdAt < c.firstOrder) c.firstOrder = order.createdAt;
    if (order.createdAt > c.lastOrder) { c.lastOrder = order.createdAt; c.city = order.shippingAddress.city; }
    map.set(order.userId, c);
  }
  return [...map.values()].map((c) => {
    const u = D.userById(c.id);
    const stale = Date.now() - new Date(c.lastOrder).getTime() > 45 * 86400000;
    const segment = c.spent >= 150000 || c.orders >= 5 ? 'vip' : c.orders >= 2 && stale ? 'at_risk' : c.orders >= 2 ? 'returning' : 'new';
    return { ...c, segment, tier: D.loyaltyTier(u ? u.points || 0 : 0).name, joined: u ? u.createdAt : c.firstOrder };
  });
}

route('GET', '/api/vendor/customers', (ctx) => {
  const { vendor } = requireVendor(ctx, 'customers');
  const q = ctx.url.searchParams;
  let list = customerList(vendor).sort((a, b) => b.spent - a.spent);
  const segments = { all: list.length, vip: 0, returning: 0, new: 0, at_risk: 0 };
  for (const c of list) segments[c.segment] += 1;
  if (q.get('segment')) list = list.filter((c) => c.segment === q.get('segment'));
  const text = (q.get('q') || '').trim().toLowerCase();
  if (text) list = list.filter((c) => c.name.toLowerCase().includes(text) || c.city.toLowerCase().includes(text));
  const page = paginate(list, q, 10, 50);
  sendJson(ctx.res, 200, { customers: page.items, segments, total: page.total, page: page.page, pages: page.pages });
});

route('GET', '/api/vendor/customers/:id', (ctx) => {
  const { vendor } = requireVendor(ctx, 'customers');
  const customer = customerList(vendor).find((c) => c.id === ctx.params.id);
  if (!customer) throw new HttpError(404, 'Customer not found');
  const history = D.vendorShipments(vendor.id).filter((r) => r.order.userId === customer.id)
    .map((r) => ({ id: r.order.id, createdAt: r.order.createdAt, status: r.shipment.status, total: D.shipmentRevenue(r.shipment), items: r.shipment.items.map((i) => `${i.quantity} x ${i.name}`) }));
  sendJson(ctx.res, 200, { customer, history });
});

// ---------- marketing ----------

function couponInput(body, existing) {
  const c = existing || {};
  if (!existing) c.code = str(body.code, 'Code', 3, 20).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!existing && c.code.length < 3) throw new HttpError(400, 'Code may only contain letters, numbers, - and _');
  if (!existing || body.type !== undefined) c.type = oneOf(body.type, ['percent', 'fixed'], 'Type');
  if (!existing || body.value !== undefined) c.value = num(body.value, 'Value', 1, c.type === 'percent' ? 90 : 10000000);
  if (body.minSpend !== undefined) c.minSpend = body.minSpend === '' ? 0 : num(body.minSpend, 'Minimum spend', 0, 100000000);
  if (body.maxDiscount !== undefined) c.maxDiscount = body.maxDiscount === '' || body.maxDiscount == null ? 0 : num(body.maxDiscount, 'Maximum discount', 0, 100000000);
  if (body.usageLimit !== undefined) c.usageLimit = body.usageLimit === '' || body.usageLimit == null ? 0 : num(body.usageLimit, 'Usage limit', 0, 1000000);
  if (body.endsAt !== undefined) {
    if (body.endsAt && Number.isNaN(new Date(body.endsAt).getTime())) throw new HttpError(400, 'Enter a valid end date');
    c.endsAt = body.endsAt ? new Date(body.endsAt).toISOString() : null;
  }
  if (body.description !== undefined) c.description = optStr(body.description, 'Description', 120);
  if (body.active !== undefined) c.active = Boolean(body.active);
  return c;
}

route('GET', '/api/vendor/coupons', (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  sendJson(ctx.res, 200, { coupons: db.coupons.filter((c) => c.vendorId === vendor.id) });
});

route('POST', '/api/vendor/coupons', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  const body = await readJson(ctx.req);
  const c = couponInput(body, null);
  if (db.coupons.some((x) => x.code === c.code)) throw new HttpError(409, 'This code is already taken');
  Object.assign(c, { vendorId: vendor.id, active: body.active !== false, public: Boolean(body.public), used: 0, usedBy: [], createdAt: new Date().toISOString() });
  db.coupons.push(c);
  save('coupons');
  sendJson(ctx.res, 201, { coupon: c });
});

route('PATCH', '/api/vendor/coupons/:code', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  const c = db.coupons.find((x) => x.code === ctx.params.code && x.vendorId === vendor.id);
  if (!c) throw new HttpError(404, 'Coupon not found');
  couponInput(await readJson(ctx.req), c);
  save('coupons');
  sendJson(ctx.res, 200, { coupon: c });
});

route('DELETE', '/api/vendor/coupons/:code', (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  db.coupons = db.coupons.filter((x) => !(x.code === ctx.params.code && x.vendorId === vendor.id));
  save('coupons');
  sendJson(ctx.res, 200, { ok: true });
});

route('GET', '/api/vendor/flash', (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  sendJson(ctx.res, 200, { sales: db.products.filter((p) => p.vendorId === vendor.id && p.flash).map((p) => ({ ...productRow(p), flash: p.flash })) });
});

route('POST', '/api/vendor/flash', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  const body = await readJson(ctx.req);
  const p = db.products.find((x) => x.id === body.productId && x.vendorId === vendor.id);
  if (!p) throw new HttpError(404, 'Product not found');
  const price = num(body.price, 'Flash price', 1, p.price - 1);
  const endsAt = new Date(body.endsAt);
  if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now()) throw new HttpError(400, 'Choose an end time in the future');
  p.flash = { price, endsAt: endsAt.toISOString() };
  save('products');
  sendJson(ctx.res, 201, { product: productRow(p) });
});

route('DELETE', '/api/vendor/flash/:id', (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  const p = ownProduct(ctx, vendor);
  p.flash = null;
  save('products');
  sendJson(ctx.res, 200, { ok: true });
});

route('GET', '/api/vendor/banners', (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  sendJson(ctx.res, 200, { banners: vendor.banners || [] });
});

route('POST', '/api/vendor/banners', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  const body = await readJson(ctx.req);
  vendor.banners = vendor.banners || [];
  if (vendor.banners.length >= 6) throw new HttpError(400, 'You can have up to 6 banners');
  vendor.banners.push({ id: D.newId('b_'), title: str(body.title, 'Title', 2, 80), image: imageUrl(body.image, 'Banner image'), link: optStr(body.link, 'Link', 200), active: body.active !== false });
  save('vendors');
  sendJson(ctx.res, 201, { banners: vendor.banners });
});

route('PATCH', '/api/vendor/banners/:id', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  const b = (vendor.banners || []).find((x) => x.id === ctx.params.id);
  if (!b) throw new HttpError(404, 'Banner not found');
  const body = await readJson(ctx.req);
  if (body.active !== undefined) b.active = Boolean(body.active);
  save('vendors');
  sendJson(ctx.res, 200, { banners: vendor.banners });
});

route('DELETE', '/api/vendor/banners/:id', (ctx) => {
  const { vendor } = requireVendor(ctx, 'marketing');
  vendor.banners = (vendor.banners || []).filter((b) => b.id !== ctx.params.id);
  save('vendors');
  sendJson(ctx.res, 200, { banners: vendor.banners });
});

// ---------- analytics ----------

route('GET', '/api/vendor/analytics', (ctx) => {
  const { vendor } = requireVendor(ctx, 'analytics');
  const days = [30, 90, 180].includes(Number(ctx.url.searchParams.get('days'))) ? Number(ctx.url.searchParams.get('days')) : 90;
  const since = Date.now() - days * 86400000;
  const rows = D.vendorShipments(vendor.id).filter((r) => new Date(r.order.createdAt).getTime() >= since && D.shipmentCounts(r.shipment));

  // weekly revenue trend
  const weeks = [];
  const weekCount = Math.ceil(days / 7);
  for (let i = weekCount - 1; i >= 0; i--) {
    const end = Date.now() - i * 7 * 86400000;
    weeks.push({ end, label: new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), revenue: 0, orders: 0 });
  }
  for (const { order, shipment } of rows) {
    const t = new Date(order.createdAt).getTime();
    const w = weeks.find((x) => t > x.end - 7 * 86400000 && t <= x.end) || weeks[0];
    w.revenue += D.shipmentRevenue(shipment);
    w.orders += 1;
  }

  const products = new Map();
  const categories = new Map();
  const cities = new Map();
  for (const { order, shipment } of rows) {
    for (const it of shipment.items) {
      const p = db.products.find((x) => x.id === it.productId);
      const e = products.get(it.productId) || { id: it.productId, name: it.name, units: 0, revenue: 0, views: p ? p.views || 0 : 0, orders: 0 };
      e.units += it.quantity; e.revenue += it.lineTotal; e.orders += 1;
      products.set(it.productId, e);
      const cat = p ? p.category : 'Other';
      categories.set(cat, (categories.get(cat) || 0) + it.lineTotal);
    }
    const city = order.shippingAddress.city;
    const c = cities.get(city) || { city, revenue: 0, orders: 0 };
    c.revenue += D.shipmentRevenue(shipment); c.orders += 1;
    cities.set(city, c);
  }

  // customer growth: first order week
  const firstSeen = new Map();
  for (const { order } of D.vendorShipments(vendor.id).reverse()) if (!firstSeen.has(order.userId)) firstSeen.set(order.userId, new Date(order.createdAt).getTime());
  let cumulative = [...firstSeen.values()].filter((t) => t < weeks[0].end - 7 * 86400000).length;
  const growth = weeks.map((w) => {
    const added = [...firstSeen.values()].filter((t) => t > w.end - 7 * 86400000 && t <= w.end).length;
    cumulative += added;
    return { label: w.label, total: cumulative, added };
  });

  const topProducts = [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    .map((p) => ({ ...p, conversion: p.views ? Math.round((p.orders / p.views) * 1000) / 10 : 0 }));
  const totalViews = db.products.filter((p) => p.vendorId === vendor.id).reduce((s, p) => s + (p.views || 0), 0);
  sendJson(ctx.res, 200, {
    days,
    revenueTrend: { labels: weeks.map((w) => w.label), revenue: weeks.map((w) => w.revenue), orders: weeks.map((w) => w.orders) },
    topProducts,
    categoryShare: [...categories].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    geography: [...cities.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    customerGrowth: growth,
    funnel: { views: totalViews, orders: rows.length, conversion: totalViews ? Math.round((rows.length / totalViews) * 1000) / 10 : 0 },
  });
});

// ---------- finance ----------

function financeNumbers(vendor) {
  const rows = D.vendorShipments(vendor.id);
  const live = rows.filter((r) => D.shipmentCounts(r.shipment));
  // Money is only withdrawable once the parcel is delivered AND a person confirmed the buyer's payment.
  const delivered = live.filter((r) => r.shipment.status === 'delivered' && r.order.paymentStatus === 'paid' && !(r.shipment.return && ['requested', 'approved', 'received'].includes(r.shipment.return.status)));
  const payouts = db.payouts.filter((p) => p.vendorId === vendor.id);
  const reserved = payouts.filter((p) => p.status !== 'rejected').reduce((s, p) => s + p.amount, 0);
  const gross = live.reduce((s, r) => s + D.shipmentRevenue(r.shipment), 0);
  return {
    gross: money(gross),
    commission: money(live.reduce((s, r) => s + r.shipment.commission, 0)),
    net: money(live.reduce((s, r) => s + r.shipment.net, 0)),
    taxes: money(live.reduce((s, r) => s + r.shipment.tax, 0)),
    refunded: money(rows.filter((r) => r.shipment.return && r.shipment.return.status === 'refunded').reduce((s, r) => s + D.shipmentRevenue(r.shipment), 0)),
    available: Math.max(0, money(delivered.reduce((s, r) => s + r.shipment.net, 0) - reserved)),
    pending: money(live.filter((r) => !delivered.includes(r)).reduce((s, r) => s + r.shipment.net, 0)),
    paidOut: money(payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)),
  };
}

route('GET', '/api/vendor/finance', (ctx) => {
  const { vendor } = requireVendor(ctx, null);
  if (ctx.user.staffRole && ctx.user.staffRole !== 'owner') throw new HttpError(403, 'Only the store owner can see finances');
  const rows = D.vendorShipments(vendor.id);
  const months = new Map();
  for (const r of rows.filter((x) => D.shipmentCounts(x.shipment))) {
    const key = r.order.createdAt.slice(0, 7);
    const m = months.get(key) || { month: key, gross: 0, commission: 0, net: 0, tax: 0, orders: 0 };
    m.gross += D.shipmentRevenue(r.shipment); m.commission += r.shipment.commission; m.net += r.shipment.net; m.tax += r.shipment.tax; m.orders += 1;
    months.set(key, m);
  }
  sendJson(ctx.res, 200, {
    summary: financeNumbers(vendor),
    commissionRate: vendor.commissionRate != null ? vendor.commissionRate : db.settings.defaultCommission,
    monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12),
    transactions: rows.slice(0, 200).map((r) => ({
      orderId: r.order.id, at: r.order.createdAt, status: r.shipment.status, refunded: Boolean(r.shipment.return && r.shipment.return.status === 'refunded'),
      gross: D.shipmentRevenue(r.shipment), commission: r.shipment.commission, net: r.shipment.net, tax: r.shipment.tax,
      invoice: `INV-${r.order.id}-${vendor.slug.slice(0, 3).toUpperCase()}`,
    })),
    payouts: db.payouts.filter((p) => p.vendorId === vendor.id).reverse(),
    payment: vendor.payment,
  });
});

route('POST', '/api/vendor/payouts', async (ctx) => {
  const { vendor } = requireVendor(ctx, null);
  if (ctx.user.staffRole && ctx.user.staffRole !== 'owner') throw new HttpError(403, 'Only the store owner can request payouts');
  const body = await readJson(ctx.req);
  if (!vendor.payment || !vendor.payment.account) throw new HttpError(400, 'Add your payout account in Store settings first');
  const available = financeNumbers(vendor).available;
  const amount = num(body.amount, 'Amount', 5000, 1000000000);
  if (amount > available) throw new HttpError(409, `You can withdraw up to ${available.toLocaleString('en-US')} ${db.settings.currency}`);
  const payout = { id: D.newId('po_'), vendorId: vendor.id, storeName: vendor.storeName, amount, method: vendor.payment.method, account: vendor.payment.account, status: 'pending', createdAt: new Date().toISOString() };
  db.payouts.push(payout);
  save('payouts');
  sendJson(ctx.res, 201, { payout });
});

// ---------- reviews ----------

route('GET', '/api/vendor/reviews', (ctx) => {
  const { vendor } = requireVendor(ctx, 'reviews');
  const mine = new Map(db.products.filter((p) => p.vendorId === vendor.id).map((p) => [p.id, p]));
  const list = db.reviews.filter((r) => mine.has(r.productId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const dist = [0, 0, 0, 0, 0];
  for (const r of list) dist[r.rating - 1] += 1;
  const filter = ctx.url.searchParams.get('filter');
  let shown = list;
  if (filter === 'unanswered') shown = list.filter((r) => !r.reply);
  if (filter === 'negative') shown = list.filter((r) => r.rating <= 2);
  const page = paginate(shown, ctx.url.searchParams, 8, 50);
  sendJson(ctx.res, 200, {
    reviews: page.items.map((r) => ({ ...r, userId: undefined, productName: mine.get(r.productId).name, productImage: mine.get(r.productId).images[0] })),
    total: page.total, page: page.page, pages: page.pages,
    insights: {
      average: list.length ? Math.round(list.reduce((s, r) => s + r.rating, 0) / list.length * 10) / 10 : 0,
      count: list.length, distribution: dist,
      unanswered: list.filter((r) => !r.reply).length,
      verifiedShare: list.length ? Math.round(list.filter((r) => r.verified).length / list.length * 100) : 0,
    },
  });
});

route('POST', '/api/vendor/reviews/:id/reply', async (ctx) => {
  const { vendor } = requireVendor(ctx, 'reviews');
  const review = db.reviews.find((r) => r.id === ctx.params.id);
  const product = review && db.products.find((p) => p.id === review.productId && p.vendorId === vendor.id);
  if (!product) throw new HttpError(404, 'Review not found');
  const body = await readJson(ctx.req);
  review.reply = { body: str(body.body, 'Reply', 2, 1000), at: new Date().toISOString(), store: vendor.storeName };
  save('reviews');
  D.notify(review.userId, 'message', `${vendor.storeName} replied to your review`, product.name, `#/product/${product.id}`);
  sendJson(ctx.res, 200, { review });
});

// ---------- messages ----------

route('GET', '/api/vendor/conversations', (ctx) => {
  const { vendor } = requireVendor(ctx, 'messages');
  const list = db.conversations.filter((c) => c.vendorId === vendor.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  sendJson(ctx.res, 200, { conversations: list.map((c) => {
    const buyer = D.userById(c.buyerId);
    const product = c.productId && db.products.find((p) => p.id === c.productId);
    const last = c.messages[c.messages.length - 1];
    return { id: c.id, buyerName: buyer ? buyer.name : 'Customer', product: product ? { id: product.id, name: product.name } : null,
      last: last ? { body: last.body, at: last.at, from: last.from } : null, unread: (c.unread || {}).vendor || 0, updatedAt: c.updatedAt };
  }) });
});

function vendorConvo(ctx, vendor) {
  const c = db.conversations.find((x) => x.id === ctx.params.id && x.vendorId === vendor.id);
  if (!c) throw new HttpError(404, 'Conversation not found');
  return c;
}

route('GET', '/api/vendor/conversations/:id', (ctx) => {
  const { vendor } = requireVendor(ctx, 'messages');
  const c = vendorConvo(ctx, vendor);
  c.unread.vendor = 0;
  save('conversations');
  const buyer = D.userById(c.buyerId);
  sendJson(ctx.res, 200, { buyerName: buyer ? buyer.name : 'Customer', messages: c.messages });
});

route('POST', '/api/vendor/conversations/:id/messages', async (ctx) => {
  const { user, vendor } = requireVendor(ctx, 'messages');
  const c = vendorConvo(ctx, vendor);
  const body = await readJson(ctx.req);
  const text = str(body.body, 'Message', 1, 2000);
  c.messages.push({ from: 'vendor', userId: user.id, name: vendor.storeName, body: text, at: new Date().toISOString() });
  c.unread.buyer = (c.unread.buyer || 0) + 1;
  c.updatedAt = new Date().toISOString();
  save('conversations');
  D.notify(c.buyerId, 'message', `Message from ${vendor.storeName}`, text.slice(0, 80), '#/account/messages');
  sendJson(ctx.res, 201, { messages: c.messages });
});

// ---------- team ----------

route('GET', '/api/vendor/team', (ctx) => {
  const { vendor } = requireVendor(ctx, null);
  if (ctx.user.staffRole && ctx.user.staffRole !== 'owner') throw new HttpError(403, 'Only the store owner can manage the team');
  const owner = D.userById(vendor.ownerId);
  sendJson(ctx.res, 200, {
    members: [
      { userId: owner.id, name: owner.name, email: owner.email, role: 'owner' },
      ...(vendor.team || []).map((t) => { const u = D.userById(t.userId); return u ? { userId: u.id, name: u.name, email: u.email, role: t.role, status: u.status } : null; }).filter(Boolean),
    ],
    permissions: TEAM_PERMISSIONS,
  });
});

route('POST', '/api/vendor/team', async (ctx) => {
  const { vendor } = requireVendor(ctx, null);
  if (ctx.user.staffRole && ctx.user.staffRole !== 'owner') throw new HttpError(403, 'Only the store owner can manage the team');
  const body = await readJson(ctx.req);
  const role = oneOf(body.role, ['manager', 'fulfillment', 'support'], 'Role');
  const mail = email(body.email);
  if (db.users.some((u) => u.email === mail)) throw new HttpError(409, 'An account with this email already exists');
  if ((vendor.team || []).length >= 15) throw new HttpError(400, 'You can have up to 15 team members');
  const user = {
    id: crypto.randomUUID(), name: str(body.name, 'Name', 2, 60), email: mail, passwordHash: auth.hashPassword(password(body.password)),
    role: 'vendor', vendorId: vendor.id, staffRole: role, status: 'active', emailVerified: false, points: 0, pointsLedger: [], addresses: [], createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  vendor.team = [...(vendor.team || []), { userId: user.id, role }];
  save('users');
  save('vendors');
  audit(ctx, 'team_member_added', `${mail} as ${role}`);
  sendJson(ctx.res, 201, { ok: true });
});

route('PATCH', '/api/vendor/team/:id', async (ctx) => {
  const { vendor } = requireVendor(ctx, null);
  if (ctx.user.staffRole && ctx.user.staffRole !== 'owner') throw new HttpError(403, 'Only the store owner can manage the team');
  const member = (vendor.team || []).find((t) => t.userId === ctx.params.id);
  if (!member) throw new HttpError(404, 'Team member not found');
  const body = await readJson(ctx.req);
  const user = D.userById(member.userId);
  if (body.role !== undefined) { member.role = oneOf(body.role, ['manager', 'fulfillment', 'support'], 'Role'); user.staffRole = member.role; }
  if (body.status !== undefined) user.status = oneOf(body.status, ['active', 'suspended'], 'Status');
  save('users');
  save('vendors');
  sendJson(ctx.res, 200, { ok: true });
});

route('DELETE', '/api/vendor/team/:id', (ctx) => {
  const { vendor } = requireVendor(ctx, null);
  if (ctx.user.staffRole && ctx.user.staffRole !== 'owner') throw new HttpError(403, 'Only the store owner can manage the team');
  const member = (vendor.team || []).find((t) => t.userId === ctx.params.id);
  if (!member) throw new HttpError(404, 'Team member not found');
  vendor.team = vendor.team.filter((t) => t !== member);
  db.users = db.users.filter((u) => u.id !== member.userId);
  for (const [sid, s] of Object.entries(db.sessions)) if (s.userId === member.userId) delete db.sessions[sid];
  save('users');
  save('vendors');
  save('sessions');
  sendJson(ctx.res, 200, { ok: true });
});

// ---------- store settings ----------

route('PATCH', '/api/vendor/store', async (ctx) => {
  const { vendor } = requireVendor(ctx, null, { allowPending: true });
  if (ctx.user.staffRole && ctx.user.staffRole !== 'owner') throw new HttpError(403, 'Only the store owner can change store settings');
  const body = await readJson(ctx.req);
  if (body.description !== undefined) vendor.description = str(body.description, 'Description', 10, 600);
  if (body.phone !== undefined) vendor.phone = str(body.phone, 'Phone', 6, 20);
  if (body.city !== undefined) vendor.city = str(body.city, 'City', 2, 60);
  if (body.country !== undefined) vendor.country = str(body.country, 'Country', 2, 60);
  if (body.taxId !== undefined) vendor.taxId = optStr(body.taxId, 'Tax ID', 40);
  if (body.branding) {
    const b = body.branding;
    vendor.branding = vendor.branding || {};
    if (b.color !== undefined) vendor.branding.color = /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : vendor.branding.color;
    if (b.tagline !== undefined) vendor.branding.tagline = optStr(b.tagline, 'Tagline', 100);
    if (b.logo !== undefined) vendor.branding.logo = b.logo ? imageUrl(b.logo, 'Logo') : '';
    if (b.banner !== undefined) vendor.branding.banner = b.banner ? imageUrl(b.banner, 'Cover image') : '';
  }
  if (body.shipping) {
    vendor.shipping = {
      flatRate: num(body.shipping.flatRate, 'Flat rate', 0, 1000000),
      freeOver: num(body.shipping.freeOver, 'Free shipping threshold', 0, 100000000),
      processingDays: num(body.shipping.processingDays, 'Processing days', 0, 60),
    };
  }
  if (body.payment) {
    vendor.payment = {
      method: oneOf(body.payment.method, ['mobile_money', 'bank_transfer', 'paypal'], 'Payout method'),
      account: str(body.payment.account, 'Payout account', 4, 60),
      accountName: str(body.payment.accountName, 'Account holder', 2, 80),
    };
  }
  if (body.tax) vendor.tax = { collect: Boolean(body.tax.collect) };
  save('vendors');
  sendJson(ctx.res, 200, { vendor });
});
