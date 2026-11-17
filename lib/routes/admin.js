'use strict';
// Super-admin API: platform KPIs, users, vendor approval, products, commission,
// payments, ads, categories, CMS, tickets, security and settings.

const crypto = require('crypto');
const { db, save } = require('../store');
const auth = require('../auth');
const D = require('../domain');
const {
  HttpError, sendJson, readJson, str, optStr, num, email, password, oneOf, imageUrl, slugify, paginate,
  route, requireRole, audit,
} = require('../http');

const admin = (ctx) => requireRole(ctx, 'admin');
const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0));

function liveOrders() {
  return db.orders.filter((o) => D.orderStatus(o) !== 'cancelled');
}

function commissionOf(order) {
  return order.shipments.filter(D.shipmentCounts).reduce((s, sh) => s + sh.commission, 0);
}

// ---------- overview & analytics ----------

route('GET', '/api/admin/overview', (ctx) => {
  admin(ctx);
  const days = 30;
  const labels = D.lastDays(days);
  const gmv = Object.fromEntries(labels.map((d) => [d, 0]));
  const fees = Object.fromEntries(labels.map((d) => [d, 0]));
  const signups = Object.fromEntries(labels.map((d) => [d, 0]));
  const now = Date.now();
  let cur = { gmv: 0, orders: 0, commission: 0 };
  let prev = { gmv: 0, orders: 0, commission: 0 };
  for (const o of liveOrders()) {
    const t = new Date(o.createdAt).getTime();
    const bucket = t >= now - days * 86400000 ? cur : t >= now - 2 * days * 86400000 ? prev : null;
    if (bucket) { bucket.gmv += o.total; bucket.orders += 1; bucket.commission += commissionOf(o); }
    const k = D.dayKey(o.createdAt);
    if (k in gmv) { gmv[k] += o.total; fees[k] += commissionOf(o); }
  }
  for (const u of db.users) { const k = D.dayKey(u.createdAt); if (k in signups) signups[k] += 1; }
  const users = db.users;
  const totalGmv = liveOrders().reduce((s, o) => s + o.total, 0);
  const vendorSales = new Map();
  for (const o of liveOrders()) for (const sh of o.shipments.filter(D.shipmentCounts)) vendorSales.set(sh.vendorId, (vendorSales.get(sh.vendorId) || 0) + D.shipmentRevenue(sh));
  sendJson(ctx.res, 200, {
    totals: {
      users: users.length, buyers: users.filter((u) => u.role === 'buyer').length,
      vendors: db.vendors.length, approvedVendors: db.vendors.filter((v) => v.status === 'approved').length,
      products: db.products.length, orders: db.orders.length, sales: totalGmv,
      revenue: liveOrders().reduce((s, o) => s + commissionOf(o), 0),
    },
    kpis: {
      gmv: { value: cur.gmv, change: pctChange(cur.gmv, prev.gmv) },
      orders: { value: cur.orders, change: pctChange(cur.orders, prev.orders) },
      commission: { value: cur.commission, change: pctChange(cur.commission, prev.commission) },
    },
    series: { labels, gmv: labels.map((d) => gmv[d]), commission: labels.map((d) => fees[d]), signups: labels.map((d) => signups[d]) },
    topVendors: [...vendorSales].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, value]) => ({ id, name: (D.vendorById(id) || {}).storeName || 'Removed', value })),
    queue: {
      pendingVendors: db.vendors.filter((v) => v.status === 'pending').length,
      openTickets: db.tickets.filter((t) => t.status === 'open').length,
      pendingPayouts: db.payouts.filter((p) => p.status === 'pending').length,
      flaggedProducts: db.products.filter((p) => p.flagged).length,
    },
  });
});

route('GET', '/api/admin/analytics', (ctx) => {
  admin(ctx);
  const orders = liveOrders();
  const cat = new Map();
  const cities = new Map();
  const methods = new Map();
  for (const o of orders) {
    methods.set(o.paymentMethod, (methods.get(o.paymentMethod) || 0) + o.total);
    cities.set(o.shippingAddress.city, (cities.get(o.shippingAddress.city) || 0) + o.total);
    for (const sh of o.shipments) for (const it of sh.items) {
      const p = db.products.find((x) => x.id === it.productId);
      cat.set(p ? p.category : 'Other', (cat.get(p ? p.category : 'Other') || 0) + it.lineTotal);
    }
  }
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const end = Date.now() - i * 7 * 86400000;
    weeks.push({ end, label: new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), gmv: 0, users: 0, orders: 0 });
  }
  const within = (w, t) => t > w.end - 7 * 86400000 && t <= w.end;
  for (const o of orders) { const w = weeks.find((x) => within(x, new Date(o.createdAt).getTime())); if (w) { w.gmv += o.total; w.orders += 1; } }
  for (const u of db.users) { const w = weeks.find((x) => within(x, new Date(u.createdAt).getTime())); if (w) w.users += 1; }
  const buyersWhoOrdered = new Set(orders.map((o) => o.userId)).size;
  const views = db.products.reduce((s, p) => s + (p.views || 0), 0);
  sendJson(ctx.res, 200, {
    weekly: { labels: weeks.map((w) => w.label), gmv: weeks.map((w) => w.gmv), users: weeks.map((w) => w.users), orders: weeks.map((w) => w.orders) },
    categories: [...cat].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    geography: [...cities].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
    paymentMethods: [...methods].map(([label, value]) => ({ label: (D.PAYMENT_METHODS[label] || {}).label || label, value })).sort((a, b) => b.value - a.value),
    funnel: { views, orders: orders.length, buyers: buyersWhoOrdered, users: db.users.filter((u) => u.role === 'buyer').length,
      conversion: views ? Math.round((orders.length / views) * 1000) / 10 : 0 },
  });
});

// ---------- users ----------

route('GET', '/api/admin/users', (ctx) => {
  admin(ctx);
  const q = ctx.url.searchParams;
  let list = db.users;
  if (q.get('role')) list = list.filter((u) => u.role === q.get('role'));
  if (q.get('status')) list = list.filter((u) => (u.status || 'active') === q.get('status'));
  const text = (q.get('q') || '').trim().toLowerCase();
  if (text) list = list.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(text));
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = paginate(list, q, 10, 100);
  const spent = new Map();
  for (const o of liveOrders()) spent.set(o.userId, (spent.get(o.userId) || 0) + o.total);
  sendJson(ctx.res, 200, {
    users: page.items.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status || 'active', emailVerified: Boolean(u.emailVerified),
      createdAt: u.createdAt, spent: spent.get(u.id) || 0, store: u.vendorId ? (D.vendorById(u.vendorId) || {}).storeName : null, staffRole: u.staffRole || null })),
    total: page.total, page: page.page, pages: page.pages,
    counts: { buyer: db.users.filter((u) => u.role === 'buyer').length, vendor: db.users.filter((u) => u.role === 'vendor').length, admin: db.users.filter((u) => u.role === 'admin').length },
  });
});

route('PATCH', '/api/admin/users/:id', async (ctx) => {
  const me = admin(ctx);
  const user = D.userById(ctx.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  if (user.id === me.id) throw new HttpError(409, 'You cannot change your own account here');
  const body = await readJson(ctx.req);
  if (body.status !== undefined) {
    user.status = oneOf(body.status, ['active', 'suspended'], 'Status');
    if (user.status === 'suspended') for (const [sid, s] of Object.entries(db.sessions)) if (s.userId === user.id) delete db.sessions[sid];
  }
  if (body.role !== undefined) {
    if (user.role === 'vendor') throw new HttpError(409, 'Vendor accounts are managed from the Vendors page');
    user.role = oneOf(body.role, ['buyer', 'admin'], 'Role');
  }
  save('users');
  save('sessions');
  audit(ctx, 'user_updated', `${user.email}: ${JSON.stringify(body)}`);
  sendJson(ctx.res, 200, { ok: true });
});

route('POST', '/api/admin/users', async (ctx) => {
  admin(ctx);
  const body = await readJson(ctx.req);
  const mail = email(body.email);
  if (db.users.some((u) => u.email === mail)) throw new HttpError(409, 'An account with this email already exists');
  db.users.push({ id: crypto.randomUUID(), name: str(body.name, 'Name', 2, 60), email: mail, passwordHash: auth.hashPassword(password(body.password)),
    role: 'admin', status: 'active', emailVerified: true, points: 0, pointsLedger: [], addresses: [], createdAt: new Date().toISOString() });
  save('users');
  audit(ctx, 'admin_created', mail);
  sendJson(ctx.res, 201, { ok: true });
});

route('POST', '/api/admin/users/:id/revoke-sessions', (ctx) => {
  admin(ctx);
  let n = 0;
  for (const [sid, s] of Object.entries(db.sessions)) if (s.userId === ctx.params.id) { delete db.sessions[sid]; n += 1; }
  save('sessions');
  audit(ctx, 'sessions_revoked', ctx.params.id);
  sendJson(ctx.res, 200, { revoked: n });
});

// ---------- vendors / store approval ----------

function vendorRow(v) {
  const owner = D.userById(v.ownerId) || {};
  const rows = D.vendorShipments(v.id).filter((r) => D.shipmentCounts(r.shipment));
  return {
    id: v.id, storeName: v.storeName, slug: v.slug, status: v.status, businessType: v.businessType, country: v.country, city: v.city,
    phone: v.phone, taxId: v.taxId, idType: v.idType, idLast4: v.idLast4, description: v.description, createdAt: v.createdAt,
    approvedAt: v.approvedAt || null, rejectionReason: v.rejectionReason || '', commissionRate: v.commissionRate,
    owner: { name: owner.name, email: owner.email },
    products: db.products.filter((p) => p.vendorId === v.id).length,
    sales: rows.reduce((s, r) => s + D.shipmentRevenue(r.shipment), 0),
    commission: rows.reduce((s, r) => s + r.shipment.commission, 0),
    orders: rows.length,
  };
}

route('GET', '/api/admin/vendors', (ctx) => {
  admin(ctx);
  const q = ctx.url.searchParams;
  let list = db.vendors;
  const counts = { all: list.length, pending: 0, approved: 0, rejected: 0, suspended: 0 };
  for (const v of list) counts[v.status] += 1;
  if (q.get('status')) list = list.filter((v) => v.status === q.get('status'));
  const text = (q.get('q') || '').trim().toLowerCase();
  if (text) list = list.filter((v) => v.storeName.toLowerCase().includes(text));
  const page = paginate([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), q, 10, 100);
  sendJson(ctx.res, 200, { vendors: page.items.map(vendorRow), counts, total: page.total, page: page.page, pages: page.pages });
});

route('PATCH', '/api/admin/vendors/:id', async (ctx) => {
  admin(ctx);
  const v = D.vendorById(ctx.params.id);
  if (!v) throw new HttpError(404, 'Store not found');
  const body = await readJson(ctx.req);
  if (body.commissionRate !== undefined) {
    v.commissionRate = body.commissionRate === null || body.commissionRate === '' ? null : num(body.commissionRate, 'Commission', 0, 50, false) / 100;
  }
  if (body.action) {
    const action = oneOf(body.action, ['approve', 'reject', 'suspend', 'reinstate'], 'Action');
    if (action === 'approve' || action === 'reinstate') { v.status = 'approved'; v.approvedAt = v.approvedAt || new Date().toISOString(); v.rejectionReason = ''; }
    if (action === 'reject') { v.status = 'rejected'; v.rejectionReason = str(body.reason, 'Reason', 5, 300); }
    if (action === 'suspend') { v.status = 'suspended'; v.rejectionReason = optStr(body.reason, 'Reason', 300); }
    D.notifyVendor(v.id, 'system', `Your store was ${v.status}`, v.rejectionReason || (v.status === 'approved' ? 'You can now sell on PrinceMall.' : ''), '#/');
    audit(ctx, `vendor_${action}`, v.storeName);
  }
  save('vendors');
  sendJson(ctx.res, 200, { vendor: vendorRow(v) });
});

// ---------- products ----------

route('GET', '/api/admin/products', (ctx) => {
  admin(ctx);
  const q = ctx.url.searchParams;
  let list = db.products;
  if (q.get('status')) list = list.filter((p) => p.status === q.get('status'));
  if (q.get('flagged') === '1') list = list.filter((p) => p.flagged);
  if (q.get('vendor')) list = list.filter((p) => p.vendorId === q.get('vendor'));
  const text = (q.get('q') || '').trim().toLowerCase();
  if (text) list = list.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(text));
  const page = paginate([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), q, 10, 100);
  sendJson(ctx.res, 200, {
    products: page.items.map((p) => ({ id: p.id, name: p.name, image: p.images[0], category: p.category, price: p.price, stock: p.stock, status: p.status,
      flagged: Boolean(p.flagged), featured: Boolean(p.featured), sold: p.sold || 0, store: (D.vendorById(p.vendorId) || {}).storeName || '' })),
    total: page.total, page: page.page, pages: page.pages,
  });
});

route('PATCH', '/api/admin/products/:id', async (ctx) => {
  admin(ctx);
  const p = db.products.find((x) => x.id === ctx.params.id);
  if (!p) throw new HttpError(404, 'Product not found');
  const body = await readJson(ctx.req);
  if (body.status !== undefined) p.status = oneOf(body.status, ['active', 'blocked', 'archived'], 'Status');
  if (body.flagged !== undefined) p.flagged = Boolean(body.flagged);
  if (body.featured !== undefined) p.featured = Boolean(body.featured);
  save('products');
  audit(ctx, 'product_updated', `${p.name}: ${JSON.stringify(body)}`);
  if (body.status === 'blocked') D.notifyVendor(p.vendorId, 'system', 'Product blocked', `${p.name} was removed by moderation`, '#/products');
  sendJson(ctx.res, 200, { ok: true });
});

// ---------- commission & payments ----------

route('GET', '/api/admin/commission', (ctx) => {
  admin(ctx);
  sendJson(ctx.res, 200, {
    defaultRate: db.settings.defaultCommission,
    vendors: db.vendors.map((v) => {
      const rows = D.vendorShipments(v.id).filter((r) => D.shipmentCounts(r.shipment));
      return { id: v.id, name: v.storeName, status: v.status, rate: v.commissionRate, effective: v.commissionRate != null ? v.commissionRate : db.settings.defaultCommission,
        sales: rows.reduce((s, r) => s + D.shipmentRevenue(r.shipment), 0), earned: rows.reduce((s, r) => s + r.shipment.commission, 0) };
    }),
  });
});

route('GET', '/api/admin/payments', (ctx) => {
  admin(ctx);
  const q = ctx.url.searchParams;
  let list = [...db.orders].reverse();
  if (q.get('status')) list = list.filter((o) => o.paymentStatus === q.get('status'));
  if (q.get('method')) list = list.filter((o) => o.paymentMethod === q.get('method'));
  const page = paginate(list, q, 10, 100);
  const all = db.orders;
  sendJson(ctx.res, 200, {
    transactions: page.items.map((o) => ({ id: o.id, at: o.createdAt, buyer: (D.userById(o.userId) || {}).name || 'Deleted user', method: (D.PAYMENT_METHODS[o.paymentMethod] || {}).label || o.paymentMethod,
      status: o.paymentStatus, ref: o.paymentRef, total: o.total, commission: commissionOf(o), orderStatus: D.orderStatus(o), refundDue: D.refundDueAmount(o),
      confirmedBy: o.paidBy || null })),
    total: page.total, page: page.page, pages: page.pages,
    summary: {
      paid: all.filter((o) => o.paymentStatus === 'paid').reduce((s, o) => s + o.total, 0),
      pending: all.filter((o) => o.paymentStatus === 'pending' && D.orderStatus(o) !== 'cancelled').reduce((s, o) => s + o.total, 0),
      refundDue: all.reduce((s, o) => s + D.refundDueAmount(o), 0),
      refunded: all.filter((o) => o.paymentStatus === 'refunded').reduce((s, o) => s + o.total, 0),
      payoutsPending: db.payouts.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0),
    },
    payouts: [...db.payouts].reverse().slice(0, 50),
  });
});

route('PATCH', '/api/admin/payouts/:id', async (ctx) => {
  admin(ctx);
  const p = db.payouts.find((x) => x.id === ctx.params.id);
  if (!p) throw new HttpError(404, 'Payout not found');
  const body = await readJson(ctx.req);
  const status = oneOf(body.status, ['approved', 'paid', 'rejected'], 'Status');
  const allowed = { pending: ['approved', 'rejected', 'paid'], approved: ['paid', 'rejected'] };
  if (!(allowed[p.status] || []).includes(status)) throw new HttpError(409, `A ${p.status} payout cannot become ${status}`);
  p.status = status;
  p.updatedAt = new Date().toISOString();
  save('payouts');
  D.notifyVendor(p.vendorId, 'system', `Payout ${status}`, `${p.amount.toLocaleString('en-US')} ${db.settings.currency}`, '#/finance');
  audit(ctx, 'payout_' + status, `${p.storeName} ${p.amount}`);
  sendJson(ctx.res, 200, { payout: p });
});

// ---------- ads ----------

function adInput(body, ad) {
  const a = ad || {};
  if (!ad || body.title !== undefined) a.title = str(body.title, 'Title', 2, 80);
  if (body.subtitle !== undefined) a.subtitle = optStr(body.subtitle, 'Subtitle', 140);
  if (body.image !== undefined) a.image = body.image ? imageUrl(body.image, 'Image') : '';
  if (body.link !== undefined) a.link = optStr(body.link, 'Link', 200);
  if (!ad || body.placement !== undefined) a.placement = oneOf(body.placement || 'hero', ['hero', 'promo', 'category'], 'Placement');
  if (body.active !== undefined) a.active = Boolean(body.active);
  for (const k of ['startsAt', 'endsAt']) {
    if (body[k] !== undefined) {
      if (body[k] && Number.isNaN(new Date(body[k]).getTime())) throw new HttpError(400, 'Enter valid dates');
      a[k] = body[k] ? new Date(body[k]).toISOString() : null;
    }
  }
  return a;
}

route('GET', '/api/admin/ads', (ctx) => { admin(ctx); sendJson(ctx.res, 200, { ads: db.ads }); });

route('POST', '/api/admin/ads', async (ctx) => {
  admin(ctx);
  const ad = adInput(await readJson(ctx.req), null);
  Object.assign(ad, { id: D.newId('ad_'), active: ad.active !== false, createdAt: new Date().toISOString() });
  db.ads.push(ad);
  save('ads');
  sendJson(ctx.res, 201, { ad });
});

route('PATCH', '/api/admin/ads/:id', async (ctx) => {
  admin(ctx);
  const ad = db.ads.find((a) => a.id === ctx.params.id);
  if (!ad) throw new HttpError(404, 'Ad not found');
  adInput(await readJson(ctx.req), ad);
  save('ads');
  sendJson(ctx.res, 200, { ad });
});

route('DELETE', '/api/admin/ads/:id', (ctx) => {
  admin(ctx);
  db.ads = db.ads.filter((a) => a.id !== ctx.params.id);
  save('ads');
  sendJson(ctx.res, 200, { ok: true });
});

// ---------- categories ----------

route('GET', '/api/admin/categories', (ctx) => {
  admin(ctx);
  sendJson(ctx.res, 200, { categories: db.categories.map((c) => ({ ...c, products: db.products.filter((p) => p.category === c.name).length })) });
});

route('POST', '/api/admin/categories', async (ctx) => {
  admin(ctx);
  const body = await readJson(ctx.req);
  const name = str(body.name, 'Name', 2, 40);
  const slug = slugify(name);
  if (db.categories.some((c) => c.slug === slug || c.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'This category already exists');
  db.categories.push({ name, slug, icon: optStr(body.icon, 'Icon', 20) || 'tag', description: optStr(body.description, 'Description', 140), active: true });
  save('categories');
  sendJson(ctx.res, 201, { ok: true });
});

route('PATCH', '/api/admin/categories/:slug', async (ctx) => {
  admin(ctx);
  const c = db.categories.find((x) => x.slug === ctx.params.slug);
  if (!c) throw new HttpError(404, 'Category not found');
  const body = await readJson(ctx.req);
  if (body.name !== undefined) {
    const name = str(body.name, 'Name', 2, 40);
    if (db.categories.some((x) => x !== c && x.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'This category already exists');
    for (const p of db.products) if (p.category === c.name) p.category = name;
    c.name = name;
    save('products');
  }
  if (body.description !== undefined) c.description = optStr(body.description, 'Description', 140);
  if (body.icon !== undefined) c.icon = optStr(body.icon, 'Icon', 20) || 'tag';
  if (body.active !== undefined) c.active = Boolean(body.active);
  save('categories');
  sendJson(ctx.res, 200, { ok: true });
});

route('DELETE', '/api/admin/categories/:slug', (ctx) => {
  admin(ctx);
  const c = db.categories.find((x) => x.slug === ctx.params.slug);
  if (!c) throw new HttpError(404, 'Category not found');
  if (db.products.some((p) => p.category === c.name)) throw new HttpError(409, 'Move or remove the products in this category first');
  db.categories = db.categories.filter((x) => x !== c);
  save('categories');
  sendJson(ctx.res, 200, { ok: true });
});

// ---------- CMS ----------

route('GET', '/api/admin/pages', (ctx) => { admin(ctx); sendJson(ctx.res, 200, { pages: db.pages }); });

route('POST', '/api/admin/pages', async (ctx) => {
  admin(ctx);
  const body = await readJson(ctx.req);
  const title = str(body.title, 'Title', 2, 80);
  const slug = slugify(body.slug || title);
  if (!slug || db.pages.some((p) => p.slug === slug)) throw new HttpError(409, 'A page with this address already exists');
  db.pages.push({ slug, title, body: str(body.body, 'Content', 1, 20000), published: body.published !== false, updatedAt: new Date().toISOString() });
  save('pages');
  sendJson(ctx.res, 201, { ok: true });
});

route('PATCH', '/api/admin/pages/:slug', async (ctx) => {
  admin(ctx);
  const page = db.pages.find((p) => p.slug === ctx.params.slug);
  if (!page) throw new HttpError(404, 'Page not found');
  const body = await readJson(ctx.req);
  if (body.title !== undefined) page.title = str(body.title, 'Title', 2, 80);
  if (body.body !== undefined) page.body = str(body.body, 'Content', 1, 20000);
  if (body.published !== undefined) page.published = Boolean(body.published);
  page.updatedAt = new Date().toISOString();
  save('pages');
  sendJson(ctx.res, 200, { ok: true });
});

route('DELETE', '/api/admin/pages/:slug', (ctx) => {
  admin(ctx);
  db.pages = db.pages.filter((p) => p.slug !== ctx.params.slug);
  save('pages');
  sendJson(ctx.res, 200, { ok: true });
});

// ---------- support tickets ----------

route('GET', '/api/admin/tickets', (ctx) => {
  admin(ctx);
  const status = ctx.url.searchParams.get('status');
  let list = [...db.tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const counts = { all: list.length, open: 0, pending: 0, resolved: 0, closed: 0 };
  for (const t of list) counts[t.status] += 1;
  if (status) list = list.filter((t) => t.status === status);
  sendJson(ctx.res, 200, { tickets: list, counts });
});

route('POST', '/api/admin/tickets/:id/reply', async (ctx) => {
  const me = admin(ctx);
  const t = db.tickets.find((x) => x.id === ctx.params.id);
  if (!t) throw new HttpError(404, 'Ticket not found');
  const body = await readJson(ctx.req);
  t.messages.push({ from: 'staff', name: me.name, body: str(body.message, 'Message', 2, 3000), at: new Date().toISOString() });
  t.status = body.status ? oneOf(body.status, ['open', 'pending', 'resolved', 'closed'], 'Status') : 'pending';
  t.updatedAt = new Date().toISOString();
  save('tickets');
  D.notify(t.userId, 'message', `Support replied: ${t.subject}`, body.message.slice(0, 80), '#/account/support');
  sendJson(ctx.res, 200, { ticket: t });
});

route('PATCH', '/api/admin/tickets/:id', async (ctx) => {
  admin(ctx);
  const t = db.tickets.find((x) => x.id === ctx.params.id);
  if (!t) throw new HttpError(404, 'Ticket not found');
  const body = await readJson(ctx.req);
  if (body.status !== undefined) t.status = oneOf(body.status, ['open', 'pending', 'resolved', 'closed'], 'Status');
  if (body.priority !== undefined) t.priority = oneOf(body.priority, ['low', 'normal', 'high'], 'Priority');
  t.updatedAt = new Date().toISOString();
  save('tickets');
  sendJson(ctx.res, 200, { ticket: t });
});

// ---------- security & settings ----------

route('GET', '/api/admin/security', (ctx) => {
  admin(ctx);
  const action = ctx.url.searchParams.get('action');
  let list = [...db.audit].reverse();
  if (action) list = list.filter((a) => a.action === action);
  const page = paginate(list, ctx.url.searchParams, 15, 100);
  const day = Date.now() - 86400000;
  const recent = db.audit.filter((a) => new Date(a.at).getTime() > day);
  sendJson(ctx.res, 200, {
    events: page.items, total: page.total, page: page.page, pages: page.pages,
    summary: {
      failedLogins24h: recent.filter((a) => a.action === 'login_failed').length,
      logins24h: recent.filter((a) => a.action === 'login').length,
      activeSessions: Object.values(db.sessions).filter((s) => s.userId && s.expiresAt > Date.now()).length,
      suspendedAccounts: db.users.filter((u) => u.status === 'suspended').length,
      unverifiedEmails: db.users.filter((u) => !u.emailVerified).length,
    },
  });
});

route('GET', '/api/admin/settings', (ctx) => { admin(ctx); sendJson(ctx.res, 200, { settings: db.settings }); });

route('PATCH', '/api/admin/settings', async (ctx) => {
  admin(ctx);
  const body = await readJson(ctx.req);
  const s = db.settings;
  if (body.siteName !== undefined) s.siteName = str(body.siteName, 'Site name', 2, 40);
  if (body.currency !== undefined) s.currency = str(body.currency, 'Currency', 1, 8);
  if (body.taxRate !== undefined) s.taxRate = num(body.taxRate, 'Tax rate', 0, 50, false) / 100;
  if (body.freeShippingThreshold !== undefined) s.freeShippingThreshold = num(body.freeShippingThreshold, 'Free shipping threshold', 0, 100000000);
  if (body.defaultCommission !== undefined) s.defaultCommission = num(body.defaultCommission, 'Commission', 0, 50, false) / 100;
  if (body.pointsPerThousand !== undefined) s.pointsPerThousand = num(body.pointsPerThousand, 'Points per 1,000', 0, 100, false);
  save('settings');
  audit(ctx, 'settings_changed', JSON.stringify(body));
  sendJson(ctx.res, 200, { settings: s });
});
