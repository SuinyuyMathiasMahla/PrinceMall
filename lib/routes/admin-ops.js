'use strict';
// Admin oversight of day-to-day operations: every order, review moderation,
// platform coupons, announcements, subscribers, system health and data export.

const fs = require('fs');
const path = require('path');
const { db, save, DATA_DIR } = require('../store');
const D = require('../domain');
const {
  HttpError, sendJson, readJson, str, optStr, num, oneOf, paginate, route, requireRole, audit, errorLog, stats,
} = require('../http');

const admin = (ctx) => requireRole(ctx, 'admin');

// ---------- all orders ----------

function orderRow(o) {
  const buyer = D.userById(o.userId) || {};
  return {
    id: o.id, createdAt: o.createdAt, status: D.orderStatus(o), paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod,
    total: o.total, buyer: { id: o.userId, name: buyer.name || 'Deleted user', email: buyer.email || '' },
    stores: o.shipments.map((s) => s.storeName), shipments: o.shipments.map((s) => ({ vendorId: s.vendorId, storeName: s.storeName, status: s.status, return: s.return ? s.return.status : null })),
    items: o.shipments.reduce((n, s) => n + s.items.reduce((m, i) => m + i.quantity, 0), 0), city: o.shippingAddress.city,
    refundDue: D.refundDueAmount(o),
  };
}

route('GET', '/api/admin/orders', (ctx) => {
  admin(ctx);
  const q = ctx.url.searchParams;
  let list = [...db.orders].reverse();
  const counts = { all: list.length, placed: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0, returns: 0, unpaid: 0, refunds: 0 };
  for (const o of list) {
    counts[D.orderStatus(o)] += 1;
    if (o.shipments.some((s) => s.refundDue)) counts.refunds += 1;
    if (o.shipments.some((s) => s.return && s.return.status === 'requested')) counts.returns += 1;
    if (o.paymentStatus === 'pending' && D.orderStatus(o) !== 'cancelled') counts.unpaid += 1;
  }
  const status = q.get('status');
  if (status === 'returns') list = list.filter((o) => o.shipments.some((s) => s.return && s.return.status === 'requested'));
  else if (status === 'unpaid') list = list.filter((o) => o.paymentStatus === 'pending' && D.orderStatus(o) !== 'cancelled');
  else if (status === 'refunds') list = list.filter((o) => o.shipments.some((s) => s.refundDue));
  else if (status) list = list.filter((o) => D.orderStatus(o) === status);
  const text = (q.get('q') || '').trim().toLowerCase();
  if (text) {
    list = list.filter((o) => {
      const b = D.userById(o.userId) || {};
      return `${o.id} ${b.name} ${b.email} ${o.shipments.map((s) => s.storeName).join(' ')}`.toLowerCase().includes(text);
    });
  }
  const page = paginate(list, q, 10, 100);
  sendJson(ctx.res, 200, { orders: page.items.map(orderRow), counts, total: page.total, page: page.page, pages: page.pages });
});

route('GET', '/api/admin/orders/:id', (ctx) => {
  admin(ctx);
  const o = db.orders.find((x) => x.id === ctx.params.id);
  if (!o) throw new HttpError(404, 'Order not found');
  const buyer = D.userById(o.userId) || {};
  sendJson(ctx.res, 200, { order: { ...D.orderView(o), buyer: { name: buyer.name, email: buyer.email, phone: buyer.phone || '' } } });
});

route('POST', '/api/admin/orders/:id/cancel', async (ctx) => {
  admin(ctx);
  const o = db.orders.find((x) => x.id === ctx.params.id);
  if (!o) throw new HttpError(404, 'Order not found');
  const body = await readJson(ctx.req);
  const reason = str(body.reason, 'Reason', 5, 300);
  const open = o.shipments.filter((s) => s.status !== 'cancelled' && s.status !== 'delivered');
  if (!open.length) throw new HttpError(409, 'Nothing left to cancel: every parcel is already delivered or cancelled');
  const now = new Date().toISOString();
  for (const sh of open) {
    const wasInWarehouse = sh.status === 'placed' || sh.status === 'processing';
    sh.status = 'cancelled';
    sh.timeline.push({ status: 'cancelled', at: now, by: 'admin' });
    // A shipped parcel is physically out there: only release stock for parcels still in the warehouse.
    if (wasInWarehouse) D.releaseReservation(sh);
    D.flagRefundDue(o, sh);
    D.notifyVendor(sh.vendorId, 'order', 'Order cancelled by PrinceMall', `Order ${o.id}: ${reason}`, '#/orders');
  }
  save('orders');
  D.notify(o.userId, 'order', `Order ${o.id} was cancelled`, reason, `#/account/orders/${o.id}`);
  audit(ctx, 'order_cancelled', `${o.id}: ${reason}`);
  sendJson(ctx.res, 200, { order: orderRow(o) });
});

// The only place payments are confirmed (besides a seller's cash on delivery) and refunds marked as sent.
// Two actions: { paymentStatus, reference? } for the whole order, or { refundedVendorId } for one parcel.
route('PATCH', '/api/admin/orders/:id', async (ctx) => {
  const me = admin(ctx);
  const o = db.orders.find((x) => x.id === ctx.params.id);
  if (!o) throw new HttpError(404, 'Order not found');
  const body = await readJson(ctx.req);

  if (body.refundedVendorId) {
    const sh = o.shipments.find((s) => s.vendorId === body.refundedVendorId);
    if (!sh || !sh.refundDue) throw new HttpError(404, 'No refund is due for that parcel');
    sh.refundDue = false;
    sh.refundedAt = new Date().toISOString();
    if (sh.return && ['approved', 'received'].includes(sh.return.status)) sh.return.status = 'refunded';
    if (o.shipments.every((s) => s.status === 'cancelled') && !o.shipments.some((s) => s.refundDue)) o.paymentStatus = 'refunded';
    save('orders');
    D.notify(o.userId, 'order', `Refund sent for order ${o.id}`, `${sh.storeName}: your refund has been sent.`, `#/account/orders/${o.id}`);
    audit(ctx, 'refund_sent', `${o.id} / ${sh.storeName}`);
    return sendJson(ctx.res, 200, { order: orderRow(o) });
  }

  const next = oneOf(body.paymentStatus, ['pending', 'paid', 'refund_due', 'refunded'], 'Payment status');
  const before = o.paymentStatus;
  if (next === 'paid') {
    D.markPaid(o, `admin ${me.email}`, optStr(body.reference, 'Payment reference', 60) || null);
  } else {
    o.paymentStatus = next;
    if (next === 'refunded') for (const s of o.shipments) { s.refundDue = false; if (s.return && ['approved', 'received'].includes(s.return.status)) s.return.status = 'refunded'; }
    D.notify(o.userId, 'order', `Payment update for order ${o.id}`, `Payment is now: ${next.replace('_', ' ')}.`, `#/account/orders/${o.id}`);
  }
  save('orders');
  audit(ctx, 'payment_status_changed', `${o.id}: ${before} -> ${next}`);
  sendJson(ctx.res, 200, { order: orderRow(o) });
});

// ---------- review moderation ----------

route('GET', '/api/admin/reviews', (ctx) => {
  admin(ctx);
  const q = ctx.url.searchParams;
  let list = [...db.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (q.get('rating')) list = list.filter((r) => r.rating === Number(q.get('rating')));
  if (q.get('photos') === '1') list = list.filter((r) => (r.photos || []).length);
  const text = (q.get('q') || '').trim().toLowerCase();
  if (text) list = list.filter((r) => `${r.userName} ${r.title} ${r.body}`.toLowerCase().includes(text));
  const page = paginate(list, q, 10, 100);
  sendJson(ctx.res, 200, {
    reviews: page.items.map((r) => {
      const p = db.products.find((x) => x.id === r.productId);
      return { id: r.id, userName: r.userName, rating: r.rating, title: r.title, body: r.body, photos: r.photos || [], verified: r.verified, createdAt: r.createdAt,
        product: p ? p.name : 'Removed product', store: p ? (D.vendorById(p.vendorId) || {}).storeName : '', reply: r.reply ? r.reply.body : '' };
    }),
    total: page.total, page: page.page, pages: page.pages,
  });
});

route('DELETE', '/api/admin/reviews/:id', async (ctx) => {
  admin(ctx);
  const r = db.reviews.find((x) => x.id === ctx.params.id);
  if (!r) throw new HttpError(404, 'Review not found');
  db.reviews.splice(db.reviews.indexOf(r), 1);
  save('reviews');
  audit(ctx, 'review_removed', `${r.userName} on ${r.productId}`);
  sendJson(ctx.res, 200, { ok: true });
});

// ---------- coupons (every store plus the platform) ----------

route('GET', '/api/admin/coupons', (ctx) => {
  admin(ctx);
  sendJson(ctx.res, 200, { coupons: db.coupons.map((c) => ({ ...c, usedBy: undefined, scope: c.vendorId ? (D.vendorById(c.vendorId) || {}).storeName || 'Store' : c.userId ? 'Single customer' : 'Whole platform' })) });
});

route('POST', '/api/admin/coupons', async (ctx) => {
  admin(ctx);
  const body = await readJson(ctx.req);
  const code = str(body.code, 'Code', 3, 20).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (code.length < 3) throw new HttpError(400, 'Code may only contain letters, numbers, - and _');
  if (db.coupons.some((c) => c.code === code)) throw new HttpError(409, 'This code is already taken');
  const type = oneOf(body.type, ['percent', 'fixed'], 'Type');
  const c = {
    code, type, value: num(body.value, 'Value', 1, type === 'percent' ? 90 : 10000000), vendorId: null, active: true, public: body.public !== false,
    minSpend: body.minSpend === '' || body.minSpend == null ? 0 : num(body.minSpend, 'Minimum spend', 0, 100000000),
    maxDiscount: body.maxDiscount === '' || body.maxDiscount == null ? 0 : num(body.maxDiscount, 'Maximum discount', 0, 100000000),
    usageLimit: body.usageLimit === '' || body.usageLimit == null ? 0 : num(body.usageLimit, 'Usage limit', 0, 1000000),
    description: optStr(body.description, 'Description', 120), used: 0, usedBy: [], createdAt: new Date().toISOString(),
    endsAt: body.endsAt ? new Date(body.endsAt).toISOString() : null,
  };
  db.coupons.push(c);
  save('coupons');
  audit(ctx, 'coupon_created', code);
  sendJson(ctx.res, 201, { coupon: c });
});

route('PATCH', '/api/admin/coupons/:code', async (ctx) => {
  admin(ctx);
  const c = db.coupons.find((x) => x.code === ctx.params.code);
  if (!c) throw new HttpError(404, 'Coupon not found');
  const body = await readJson(ctx.req);
  if (body.active !== undefined) c.active = Boolean(body.active);
  save('coupons');
  audit(ctx, 'coupon_updated', `${c.code} active=${c.active}`);
  sendJson(ctx.res, 200, { coupon: c });
});

route('DELETE', '/api/admin/coupons/:code', (ctx) => {
  admin(ctx);
  db.coupons = db.coupons.filter((x) => x.code !== ctx.params.code);
  save('coupons');
  audit(ctx, 'coupon_deleted', ctx.params.code);
  sendJson(ctx.res, 200, { ok: true });
});

// ---------- announcements & subscribers ----------

route('POST', '/api/admin/broadcast', async (ctx) => {
  admin(ctx);
  const body = await readJson(ctx.req);
  const audience = oneOf(body.audience, ['buyers', 'vendors', 'everyone'], 'Audience');
  const title = str(body.title, 'Title', 3, 80);
  const text = str(body.body, 'Message', 3, 300);
  const link = optStr(body.link, 'Link', 200);
  const users = db.users.filter((u) => u.status !== 'suspended' && (audience === 'everyone' || (audience === 'buyers' ? u.role === 'buyer' : u.role === 'vendor')));
  for (const u of users) D.notify(u.id, 'promo', title, text, link);
  audit(ctx, 'broadcast', `${audience} (${users.length}): ${title}`);
  sendJson(ctx.res, 201, { sent: users.length });
});

route('GET', '/api/admin/broadcasts', (ctx) => {
  admin(ctx);
  sendJson(ctx.res, 200, { broadcasts: db.audit.filter((a) => a.action === 'broadcast').reverse().slice(0, 15) });
});

route('GET', '/api/admin/subscribers', (ctx) => {
  admin(ctx);
  sendJson(ctx.res, 200, { subscribers: db.newsletter });
});

// ---------- system health & export ----------

function dirSize() {
  let total = 0;
  const files = [];
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!f.endsWith('.json')) continue;
    const size = fs.statSync(path.join(DATA_DIR, f)).size;
    total += size;
    files.push({ name: f, size });
  }
  return { total, files: files.sort((a, b) => b.size - a.size).slice(0, 8) };
}

route('GET', '/api/admin/system', (ctx) => {
  admin(ctx);
  const mem = process.memoryUsage();
  const uploads = path.join(DATA_DIR, '..', 'public', 'uploads');
  let uploadCount = 0; let uploadBytes = 0;
  try { for (const f of fs.readdirSync(uploads)) { uploadCount += 1; uploadBytes += fs.statSync(path.join(uploads, f)).size; } } catch { /* no uploads yet */ }
  const sessions = Object.values(db.sessions);
  sendJson(ctx.res, 200, {
    server: { uptimeSeconds: Math.round((Date.now() - stats.startedAt) / 1000), node: process.version, platform: process.platform, memoryMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576), requests: stats.requests, startedAt: new Date(stats.startedAt).toISOString() },
    data: {
      users: db.users.length, vendors: db.vendors.length, products: db.products.length, orders: db.orders.length, reviews: db.reviews.length, tickets: db.tickets.length,
      conversations: db.conversations.length, notifications: db.notifications.length, coupons: db.coupons.length, subscribers: db.newsletter.length, auditEvents: db.audit.length,
    },
    storage: { ...dirSize(), uploads: uploadCount, uploadBytes },
    sessions: { active: sessions.filter((s) => s.userId && s.expiresAt > Date.now()).length, guests: sessions.filter((s) => !s.userId).length },
    checks: [
      { name: 'Data files readable', ok: true },
      { name: 'Products without a store', ok: db.products.every((p) => D.vendorById(p.vendorId)), detail: db.products.filter((p) => !D.vendorById(p.vendorId)).length + ' orphaned' },
      { name: 'Stores without an owner account', ok: db.vendors.every((v) => D.userById(v.ownerId)), detail: db.vendors.filter((v) => !D.userById(v.ownerId)).length + ' orphaned' },
      { name: 'Negative stock', ok: db.products.every((p) => p.stock >= 0), detail: db.products.filter((p) => p.stock < 0).length + ' products' },
      { name: 'Payments waiting for confirmation over 3 days', ok: db.orders.filter((o) => o.paymentStatus === 'pending' && Date.now() - new Date(o.createdAt) > 3 * 86400000 && D.orderStatus(o) !== 'cancelled').length === 0, detail: 'confirm received money in Payments' },
      { name: 'Refunds waiting to be sent', ok: db.orders.every((o) => !o.shipments.some((s) => s.refundDue)), detail: db.orders.filter((o) => o.shipments.some((s) => s.refundDue)).length + ' order(s)' },
      { name: 'Recent server errors', ok: errorLog.length === 0, detail: errorLog.length + ' logged since start' },
    ],
    errors: [...errorLog].reverse().slice(0, 10),
  });
});

route('GET', '/api/admin/export', (ctx) => {
  admin(ctx);
  const safeUsers = db.users.map(({ passwordHash, ...rest }) => rest);
  const dump = {
    exportedAt: new Date().toISOString(), note: 'Data export. Password hashes, sessions and reset tokens are excluded. To back up the whole database, copy the data/ folder.',
    settings: db.settings, users: safeUsers, vendors: db.vendors, products: db.products, orders: db.orders, reviews: db.reviews, categories: db.categories, coupons: db.coupons,
    tickets: db.tickets, ads: db.ads, pages: db.pages, payouts: db.payouts, newsletter: db.newsletter,
  };
  audit(ctx, 'data_exported', `${safeUsers.length} users, ${db.orders.length} orders`);
  const body = JSON.stringify(dump, null, 2);
  ctx.res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="princemall-export-${new Date().toISOString().slice(0, 10)}.json"`,
    'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store',
  });
  ctx.res.end(body);
});

// ---------- live activity feed for the dashboard ----------

route('GET', '/api/admin/activity', (ctx) => {
  admin(ctx);
  const events = [];
  for (const o of db.orders.slice(-8)) events.push({ at: o.createdAt, icon: 'package', text: `Order ${o.id} placed: ${o.total.toLocaleString('en-US')} ${db.settings.currency}`, link: '#/orders' });
  for (const v of db.vendors.slice(-4)) events.push({ at: v.createdAt, icon: 'store', text: `${v.storeName} applied to sell (${v.status})`, link: '#/vendors' });
  for (const t of db.tickets.slice(-4)) events.push({ at: t.updatedAt, icon: 'help', text: `Ticket ${t.id}: ${t.subject}`, link: '#/tickets' });
  for (const p of db.payouts.slice(-4)) events.push({ at: p.createdAt, icon: 'wallet', text: `${p.storeName} requested a payout of ${p.amount.toLocaleString('en-US')} (${p.status})`, link: '#/payments' });
  for (const u of db.users.slice(-4)) events.push({ at: u.createdAt, icon: 'users', text: `${u.name} joined as ${u.role}`, link: '#/users' });
  for (const r of db.reviews.slice(-4)) events.push({ at: r.createdAt, icon: 'star', text: `${r.userName} left a ${r.rating}-star review`, link: '#/reviews' });
  events.sort((a, b) => b.at.localeCompare(a.at));
  sendJson(ctx.res, 200, { events: events.filter((e) => new Date(e.at) <= new Date()).slice(0, 12) });
});
