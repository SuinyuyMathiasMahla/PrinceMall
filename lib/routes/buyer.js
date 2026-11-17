'use strict';
// Cart, checkout, orders, account, wishlist, notifications, support, messages, loyalty.

const crypto = require('crypto');
const { db, save } = require('../store');
const auth = require('../auth');
const cart = require('../cart');
const D = require('../domain');
const { startUserSession } = require('./public');
const {
  HttpError, sendJson, readJson, str, optStr, num, oneOf, imageUrl, paginate,
  route, requireUser, audit,
} = require('../http');

// ---------- cart ----------

function cartOptions(ctx) {
  const q = ctx.url.searchParams;
  return { deliveryId: q.get('delivery') || 'standard', city: q.get('city') || '' };
}

route('GET', '/api/cart', (ctx) => sendJson(ctx.res, 200, cart.cartView(ctx, cartOptions(ctx))));

route('POST', '/api/cart/items', async (ctx) => {
  const body = await readJson(ctx.req);
  const product = db.products.find((p) => p.id === body.productId);
  if (!product || !D.isVisible(product)) throw new HttpError(404, 'Product not found');
  const quantity = num(body.quantity === undefined ? 1 : body.quantity, 'Quantity', 1, 99);
  const color = optStr(body.color, 'Color', 40);
  const size = optStr(body.size, 'Size', 40);
  if ((product.colors || []).length && !product.colors.some((c) => c.name === color)) throw new HttpError(400, 'Please choose a color');
  if ((product.sizes || []).length && !product.sizes.includes(size)) throw new HttpError(400, 'Please choose a size');

  if (!ctx.session) ctx.session = auth.createSession(ctx.res, null); // guest cart
  const rec = cart.getRec(ctx);
  const line = { productId: product.id, color, size };
  const existing = rec.items.find((i) => cart.sameLine(i, line));
  const total = (existing ? existing.quantity : 0) + quantity;
  cart.checkStock(product, total);
  if (existing) existing.quantity = total;
  else rec.items.push({ id: D.newId('c_'), ...line, quantity });
  cart.putRec(ctx, rec);
  sendJson(ctx.res, 200, cart.cartView(ctx));
});

route('PATCH', '/api/cart/items/:id', async (ctx) => {
  const body = await readJson(ctx.req);
  const quantity = num(body.quantity, 'Quantity', 1, 99);
  const rec = cart.getRec(ctx);
  const item = rec.items.find((i) => i.id === ctx.params.id);
  const product = item && db.products.find((p) => p.id === item.productId);
  if (!item || !product) throw new HttpError(404, 'This item is not in your cart');
  cart.checkStock(product, quantity);
  item.quantity = quantity;
  cart.putRec(ctx, rec);
  sendJson(ctx.res, 200, cart.cartView(ctx));
});

route('DELETE', '/api/cart/items/:id', (ctx) => {
  const rec = cart.getRec(ctx);
  rec.items = rec.items.filter((i) => i.id !== ctx.params.id);
  cart.putRec(ctx, rec);
  sendJson(ctx.res, 200, cart.cartView(ctx));
});

route('POST', '/api/cart/coupon', async (ctx) => {
  const body = await readJson(ctx.req);
  const code = str(body.code, 'Coupon code', 3, 30).toUpperCase();
  if (!ctx.session) ctx.session = auth.createSession(ctx.res, null);
  const rec = cart.getRec(ctx);
  const view = cart.cartView(ctx);
  const result = cart.evaluateCoupon(code, view.items, ctx.session.userId);
  if (result.error) throw new HttpError(400, result.error);
  rec.coupon = code;
  cart.putRec(ctx, rec);
  sendJson(ctx.res, 200, cart.cartView(ctx));
});

route('DELETE', '/api/cart/coupon', (ctx) => {
  const rec = cart.getRec(ctx);
  rec.coupon = null;
  cart.putRec(ctx, rec);
  sendJson(ctx.res, 200, cart.cartView(ctx));
});

route('GET', '/api/cart/recommendations', (ctx) => {
  const view = cart.cartView(ctx);
  const inCart = new Set(view.items.map((i) => i.productId));
  const cats = new Set(view.items.map((i) => (db.products.find((p) => p.id === i.productId) || {}).category));
  const stats = D.ratingStats();
  const pool = db.products.filter((p) => D.isVisible(p) && !inCart.has(p.id));
  const same = pool.filter((p) => cats.has(p.category));
  const rest = pool.filter((p) => !cats.has(p.category)).sort((a, b) => (b.sold || 0) - (a.sold || 0));
  sendJson(ctx.res, 200, { products: [...same, ...rest].slice(0, 4).map((p) => D.productView(p, stats)) });
});

// ---------- checkout ----------

function addressFrom(value, label) {
  if (!value || typeof value !== 'object') throw new HttpError(400, `${label} is required`);
  const a = {
    fullName: str(value.fullName, 'Full name', 2, 80),
    phone: str(value.phone, 'Phone number', 6, 20),
    address: str(value.address, 'Address', 5, 200),
    city: str(value.city, 'City', 2, 60),
    region: optStr(value.region, 'Region', 60),
    country: optStr(value.country, 'Country', 60) || 'Cameroon',
  };
  if (!/^\+?[0-9 ()-]+$/.test(a.phone)) throw new HttpError(400, 'Enter a valid phone number');
  return a;
}

route('POST', '/api/checkout', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  const shipping = addressFrom(body.shipping, 'Shipping address');
  const billing = body.billingSame === false ? addressFrom(body.billing, 'Billing address') : shipping;
  const method = oneOf(body.paymentMethod, Object.keys(D.PAYMENT_METHODS), 'Payment method');
  const deliveryId = oneOf(body.deliveryId || 'standard', D.DELIVERY_OPTIONS.map((o) => o.id), 'Delivery option');
  let momoNumber = '';
  if (method === 'mobile_money') {
    momoNumber = str(body.momoNumber, 'Mobile Money number', 6, 20);
    if (!/^\+?[0-9 ()-]+$/.test(momoNumber)) throw new HttpError(400, 'Enter a valid Mobile Money number');
  }

  const view = cart.cartView(ctx, { deliveryId, city: shipping.city });
  if (!view.items.length) throw new HttpError(400, 'Your cart is empty');
  for (const line of view.items) cart.checkStock(db.products.find((p) => p.id === line.productId), line.quantity);

  const rec = cart.getRec(ctx);
  const coupon = view.coupon && db.coupons.find((c) => c.code === view.coupon.code);

  // Split the cart into one shipment per vendor.
  const shipments = [];
  for (const line of view.items) {
    let sh = shipments.find((s) => s.vendorId === line.vendorId);
    if (!sh) {
      sh = { vendorId: line.vendorId, storeName: line.vendorName, status: 'placed', items: [], subtotal: 0, vendorDiscount: 0,
        commission: 0, net: 0, tax: 0, trackingNumber: '', carrier: '', return: null,
        timeline: [{ status: 'placed', at: new Date().toISOString() }] };
      shipments.push(sh);
    }
    sh.items.push({ productId: line.productId, name: line.name, image: line.image, price: line.price, quantity: line.quantity,
      color: line.color, size: line.size, lineTotal: line.lineTotal });
    sh.subtotal += line.lineTotal;
  }
  for (const sh of shipments) {
    const vendor = D.vendorById(sh.vendorId);
    const rate = vendor && vendor.commissionRate != null ? vendor.commissionRate : db.settings.defaultCommission;
    if (coupon && coupon.vendorId === sh.vendorId) sh.vendorDiscount = view.discount;
    sh.commission = Math.round((sh.subtotal - sh.vendorDiscount) * rate);
    sh.net = sh.subtotal - sh.vendorDiscount - sh.commission;
    sh.tax = Math.round(view.tax * sh.subtotal / view.subtotal);
  }

  // The system never decides that money arrived. Every order starts as "pending" and a person
  // (an admin, or the seller for cash on delivery) confirms the payment later.
  const order = {
    id: 'PM-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    userId: user.id,
    createdAt: new Date().toISOString(),
    shipments,
    subtotal: view.subtotal,
    discount: view.discount,
    couponCode: view.coupon ? view.coupon.code : null,
    shippingFee: view.shipping,
    tax: view.tax,
    total: view.total,
    delivery: { id: view.delivery.id, label: view.delivery.label, days: view.delivery.days },
    shippingAddress: shipping,
    billingAddress: billing,
    paymentMethod: method,
    paymentStatus: 'pending',
    paymentRef: null,
    momoNumber,
  };

  for (const line of view.items) {
    const p = db.products.find((x) => x.id === line.productId);
    p.stock -= line.quantity;
    p.sold = (p.sold || 0) + line.quantity;
  }
  if (coupon) {
    coupon.used = (coupon.used || 0) + 1;
    coupon.usedBy = [...(coupon.usedBy || []), user.id];
    save('coupons');
  }
  db.orders.push(order);
  rec.items = [];
  rec.coupon = null;
  cart.putRec(ctx, rec);

  if (body.saveAddress && !(user.addresses || []).some((a) => a.address === shipping.address && a.city === shipping.city)) {
    user.addresses = user.addresses || [];
    user.addresses.push({ id: D.newId('a_'), label: 'Saved at checkout', ...shipping, isDefault: !user.addresses.length });
  }
  save('products');
  save('orders');
  save('users');
  D.notify(user.id, 'order', `Order ${order.id} placed`, `We received your order of ${order.total.toLocaleString('en-US')} ${db.settings.currency}. We will confirm your payment shortly.`, `#/account/orders/${order.id}`);
  for (const sh of shipments) {
    D.notifyVendor(sh.vendorId, 'order', 'New order', `Order ${order.id}: ${sh.items.length} item(s), ${sh.subtotal.toLocaleString('en-US')} ${db.settings.currency}`, '#/orders');
  }
  sendJson(ctx.res, 201, { order: D.orderView(order) });
});

// ---------- orders ----------

function ownOrder(ctx) {
  const user = requireUser(ctx);
  const order = db.orders.find((o) => o.id === ctx.params.id && o.userId === user.id);
  if (!order) throw new HttpError(404, 'Order not found');
  return order;
}

route('GET', '/api/orders', (ctx) => {
  const user = requireUser(ctx);
  const status = ctx.url.searchParams.get('status');
  let list = db.orders.filter((o) => o.userId === user.id).map(D.orderView).reverse();
  if (status) list = list.filter((o) => o.status === status);
  const page = paginate(list, ctx.url.searchParams, 10, 50);
  sendJson(ctx.res, 200, { orders: page.items, total: page.total, page: page.page, pages: page.pages });
});

route('GET', '/api/orders/:id', (ctx) => {
  const order = ownOrder(ctx);
  const seller = (id) => { const v = D.vendorById(id); return v ? { name: v.storeName, slug: v.slug } : null; };
  sendJson(ctx.res, 200, {
    order: { ...D.orderView(order), shipments: order.shipments.map((s) => ({ ...s, seller: seller(s.vendorId) })) },
    buyer: { name: ctx.user.name, email: ctx.user.email },
    reviewed: db.reviews.filter((r) => r.userId === ctx.user.id).map((r) => r.productId),
  });
});

route('POST', '/api/orders/:id/cancel', (ctx) => {
  const order = ownOrder(ctx);
  if (!order.shipments.every((s) => s.status === 'placed' || s.status === 'processing' || s.status === 'cancelled')) {
    throw new HttpError(409, 'This order has already shipped and can no longer be cancelled');
  }
  if (order.shipments.every((s) => s.status === 'cancelled')) throw new HttpError(409, 'This order is already cancelled');
  const now = new Date().toISOString();
  for (const sh of order.shipments) {
    if (sh.status === 'cancelled') continue;
    sh.status = 'cancelled';
    sh.timeline.push({ status: 'cancelled', at: now });
    D.releaseReservation(sh); // stock reserved at checkout goes back: nothing had left the shelf yet
    D.flagRefundDue(order, sh); // a human still has to send any money back
    D.notifyVendor(sh.vendorId, 'order', 'Order cancelled', `Order ${order.id} was cancelled by the buyer`, '#/orders');
  }
  save('orders');
  save('products');
  sendJson(ctx.res, 200, { order: D.orderView(order) });
});

route('POST', '/api/orders/:id/return', async (ctx) => {
  const order = ownOrder(ctx);
  const body = await readJson(ctx.req);
  const sh = order.shipments.find((s) => s.vendorId === body.vendorId);
  if (!sh) throw new HttpError(404, 'Shipment not found');
  if (sh.status !== 'delivered') throw new HttpError(409, 'Only delivered items can be returned');
  if (sh.return) throw new HttpError(409, 'A return was already requested for these items');
  const deliveredAt = sh.timeline.filter((t) => t.status === 'delivered').pop();
  if (deliveredAt && Date.now() - new Date(deliveredAt.at).getTime() > 14 * 86400000) {
    throw new HttpError(409, 'The 14-day return window has passed');
  }
  sh.return = { status: 'requested', reason: str(body.reason, 'Reason', 5, 500), at: new Date().toISOString() };
  save('orders');
  D.notifyVendor(sh.vendorId, 'order', 'Return requested', `Order ${order.id}: ${sh.return.reason.slice(0, 80)}`, '#/orders');
  sendJson(ctx.res, 200, { order: D.orderView(order) });
});

// ---------- account ----------

route('PATCH', '/api/account', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  if (body.name !== undefined) user.name = str(body.name, 'Name', 2, 60);
  if (body.phone !== undefined) user.phone = optStr(body.phone, 'Phone', 20);
  if (body.avatar !== undefined) user.avatar = body.avatar ? imageUrl(body.avatar, 'Photo') : '';
  save('users');
  sendJson(ctx.res, 200, { user: D.publicUser(user) });
});

route('POST', '/api/account/password', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  if (!auth.verifyPassword(typeof body.current === 'string' ? body.current : '', user.passwordHash)) {
    throw new HttpError(400, 'Your current password is wrong');
  }
  if (typeof body.next !== 'string' || body.next.length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
  user.passwordHash = auth.hashPassword(body.next);
  const keep = ctx.session && ctx.session.sid;
  for (const [sid, s] of Object.entries(db.sessions)) if (s.userId === user.id && sid !== keep) delete db.sessions[sid];
  save('users');
  save('sessions');
  audit(ctx, 'password_changed', user.email);
  sendJson(ctx.res, 200, { ok: true });
});

route('GET', '/api/account/addresses', (ctx) => {
  sendJson(ctx.res, 200, { addresses: requireUser(ctx).addresses || [] });
});

route('POST', '/api/account/addresses', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  user.addresses = user.addresses || [];
  if (user.addresses.length >= 10) throw new HttpError(400, 'You can save up to 10 addresses');
  const a = { id: D.newId('a_'), label: optStr(body.label, 'Label', 30) || 'Home', ...addressFrom(body, 'Address'), isDefault: Boolean(body.isDefault) || !user.addresses.length };
  if (a.isDefault) user.addresses.forEach((x) => { x.isDefault = false; });
  user.addresses.push(a);
  save('users');
  sendJson(ctx.res, 201, { addresses: user.addresses });
});

route('DELETE', '/api/account/addresses/:id', (ctx) => {
  const user = requireUser(ctx);
  user.addresses = (user.addresses || []).filter((a) => a.id !== ctx.params.id);
  if (user.addresses.length && !user.addresses.some((a) => a.isDefault)) user.addresses[0].isDefault = true;
  save('users');
  sendJson(ctx.res, 200, { addresses: user.addresses });
});

route('GET', '/api/account/reviews', (ctx) => {
  const user = requireUser(ctx);
  const reviews = db.reviews.filter((r) => r.userId === user.id).reverse().map((r) => {
    const p = db.products.find((x) => x.id === r.productId);
    return { id: r.id, productId: r.productId, productName: p ? p.name : 'Removed product', image: p ? p.images[0] : '',
      rating: r.rating, title: r.title, body: r.body, photos: r.photos || [], createdAt: r.createdAt, reply: r.reply || null };
  });
  // products the buyer received but has not reviewed yet
  const reviewed = new Set(reviews.map((r) => r.productId));
  const toReview = [];
  for (const o of db.orders.filter((x) => x.userId === user.id)) {
    for (const sh of o.shipments.filter((s) => s.status === 'delivered')) {
      for (const it of sh.items) {
        if (!reviewed.has(it.productId) && !toReview.some((t) => t.productId === it.productId)) {
          toReview.push({ productId: it.productId, name: it.name, image: it.image, orderId: o.id });
        }
      }
    }
  }
  sendJson(ctx.res, 200, { reviews, toReview });
});

route('GET', '/api/account/dashboard', (ctx) => {
  const user = requireUser(ctx);
  const orders = db.orders.filter((o) => o.userId === user.id);
  const live = orders.filter((o) => D.orderStatus(o) !== 'cancelled');
  const spent = live.reduce((s, o) => s + o.total, 0);

  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString('en-US', { month: 'short' }), value: 0 });
  }
  for (const o of live) {
    const m = months.find((x) => x.key === o.createdAt.slice(0, 7));
    if (m) m.value += o.total;
  }
  const byCategory = new Map();
  const bought = new Set();
  for (const o of live) {
    for (const sh of o.shipments) {
      for (const it of sh.items) {
        const p = db.products.find((x) => x.id === it.productId);
        if (p) { byCategory.set(p.category, (byCategory.get(p.category) || 0) + it.lineTotal); bought.add(p.id); }
      }
    }
  }
  const stats = D.ratingStats();
  const favourite = new Set(byCategory.keys());
  const recommendations = db.products.filter((p) => D.isVisible(p) && !bought.has(p.id))
    .sort((a, b) => (favourite.has(b.category) - favourite.has(a.category)) || (b.sold || 0) - (a.sold || 0))
    .slice(0, 4).map((p) => D.productView(p, stats));
  sendJson(ctx.res, 200, {
    stats: {
      orders: orders.length, spent, points: user.points || 0,
      wishlist: (db.wishlists[user.id] || []).length,
      inTransit: orders.filter((o) => ['processing', 'shipped'].includes(D.orderStatus(o))).length,
    },
    tier: D.loyaltyTier(user.points || 0),
    recentOrders: orders.slice(-4).reverse().map(D.orderView),
    spendingByMonth: months,
    spendingByCategory: [...byCategory].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    recommendations,
  });
});

// ---------- wishlist ----------

route('GET', '/api/wishlist', (ctx) => {
  const user = requireUser(ctx);
  const stats = D.ratingStats();
  const ids = db.wishlists[user.id] || [];
  const products = ids.map((id) => db.products.find((p) => p.id === id)).filter((p) => p && D.isVisible(p)).map((p) => D.productView(p, stats));
  sendJson(ctx.res, 200, { products, ids });
});

route('POST', '/api/wishlist/:productId', (ctx) => {
  const user = requireUser(ctx);
  if (!db.products.some((p) => p.id === ctx.params.productId)) throw new HttpError(404, 'Product not found');
  const list = db.wishlists[user.id] || [];
  const has = list.includes(ctx.params.productId);
  db.wishlists[user.id] = has ? list.filter((id) => id !== ctx.params.productId) : [...list, ctx.params.productId];
  save('wishlists');
  sendJson(ctx.res, 200, { saved: !has, count: db.wishlists[user.id].length });
});

// ---------- notifications ----------

route('GET', '/api/notifications', (ctx) => {
  const user = requireUser(ctx);
  const type = ctx.url.searchParams.get('type');
  let list = db.notifications.filter((n) => n.userId === user.id).reverse();
  if (type) list = list.filter((n) => n.type === type);
  const page = paginate(list, ctx.url.searchParams, 20, 100);
  sendJson(ctx.res, 200, { notifications: page.items, total: page.total, page: page.page, pages: page.pages,
    unread: db.notifications.filter((n) => n.userId === user.id && !n.read).length });
});

route('POST', '/api/notifications/read', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  for (const n of db.notifications) {
    if (n.userId === user.id && (body.all || (Array.isArray(body.ids) && body.ids.includes(n.id)))) n.read = true;
  }
  save('notifications');
  sendJson(ctx.res, 200, { ok: true });
});

// ---------- support tickets ----------

route('GET', '/api/tickets', (ctx) => {
  const user = requireUser(ctx);
  sendJson(ctx.res, 200, { tickets: db.tickets.filter((t) => t.userId === user.id).reverse() });
});

route('POST', '/api/tickets', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  const ticket = {
    id: 'T-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    userId: user.id, userName: user.name, userEmail: user.email,
    subject: str(body.subject, 'Subject', 4, 120),
    category: oneOf(body.category || 'other', ['order', 'payment', 'account', 'product', 'other'], 'Category'),
    priority: 'normal', status: 'open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    messages: [{ from: 'user', name: user.name, body: str(body.message, 'Message', 5, 3000), at: new Date().toISOString() }],
  };
  db.tickets.push(ticket);
  save('tickets');
  sendJson(ctx.res, 201, { ticket });
});

route('POST', '/api/tickets/:id/reply', async (ctx) => {
  const user = requireUser(ctx);
  const ticket = db.tickets.find((t) => t.id === ctx.params.id && t.userId === user.id);
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  const body = await readJson(ctx.req);
  ticket.messages.push({ from: 'user', name: user.name, body: str(body.message, 'Message', 2, 3000), at: new Date().toISOString() });
  ticket.status = 'open';
  ticket.updatedAt = new Date().toISOString();
  save('tickets');
  sendJson(ctx.res, 200, { ticket });
});

// ---------- conversations (buyer <-> vendor), also used by the vendor portal ----------

function convoView(c, side) {
  const vendor = D.vendorById(c.vendorId);
  const buyer = D.userById(c.buyerId);
  const product = c.productId && db.products.find((p) => p.id === c.productId);
  const last = c.messages[c.messages.length - 1];
  return {
    id: c.id, vendorName: vendor ? vendor.storeName : '', buyerName: buyer ? buyer.name : '',
    product: product ? { id: product.id, name: product.name, image: product.images[0] } : null,
    last: last ? { body: last.body, at: last.at, from: last.from } : null,
    unread: (c.unread || {})[side] || 0, updatedAt: c.updatedAt,
  };
}

route('GET', '/api/conversations', (ctx) => {
  const user = requireUser(ctx);
  const list = db.conversations.filter((c) => c.buyerId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  sendJson(ctx.res, 200, { conversations: list.map((c) => convoView(c, 'buyer')) });
});

route('POST', '/api/conversations', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  const vendor = D.vendorById(body.vendorId);
  if (!vendor || vendor.status !== 'approved') throw new HttpError(404, 'Store not found');
  const text = str(body.body, 'Message', 1, 2000);
  const productId = body.productId ? String(body.productId) : null;
  let convo = db.conversations.find((c) => c.buyerId === user.id && c.vendorId === vendor.id && (c.productId || null) === productId);
  if (!convo) {
    convo = { id: D.newId('cv_'), buyerId: user.id, vendorId: vendor.id, productId, messages: [], unread: { buyer: 0, vendor: 0 }, updatedAt: '' };
    db.conversations.push(convo);
  }
  convo.messages.push({ from: 'buyer', userId: user.id, name: user.name, body: text, at: new Date().toISOString() });
  convo.unread.vendor += 1;
  convo.updatedAt = new Date().toISOString();
  save('conversations');
  D.notifyVendor(vendor.id, 'message', `Message from ${user.name}`, text.slice(0, 80), '#/messages');
  sendJson(ctx.res, 201, { id: convo.id });
});

function convoFor(ctx, side) {
  const user = requireUser(ctx);
  const convo = db.conversations.find((c) => c.id === ctx.params.id);
  if (!convo) throw new HttpError(404, 'Conversation not found');
  if (side === 'buyer' && convo.buyerId !== user.id) throw new HttpError(404, 'Conversation not found');
  return convo;
}

route('GET', '/api/conversations/:id', (ctx) => {
  const convo = convoFor(ctx, 'buyer');
  convo.unread.buyer = 0;
  save('conversations');
  sendJson(ctx.res, 200, { conversation: convoView(convo, 'buyer'), messages: convo.messages });
});

route('POST', '/api/conversations/:id/messages', async (ctx) => {
  const convo = convoFor(ctx, 'buyer');
  const body = await readJson(ctx.req);
  convo.messages.push({ from: 'buyer', userId: ctx.user.id, name: ctx.user.name, body: str(body.body, 'Message', 1, 2000), at: new Date().toISOString() });
  convo.unread.vendor += 1;
  convo.updatedAt = new Date().toISOString();
  save('conversations');
  D.notifyVendor(convo.vendorId, 'message', `Message from ${ctx.user.name}`, body.body.slice(0, 80), '#/messages');
  sendJson(ctx.res, 201, { messages: convo.messages });
});

// ---------- loyalty ----------

const REWARDS = [
  { id: 'r500', cost: 500, label: '1,000 off your next order', coupon: { type: 'fixed', value: 1000, minSpend: 5000 } },
  { id: 'r1000', cost: 1000, label: '5% off (up to 5,000)', coupon: { type: 'percent', value: 5, maxDiscount: 5000, minSpend: 10000 } },
  { id: 'r2500', cost: 2500, label: '10% off (up to 15,000)', coupon: { type: 'percent', value: 10, maxDiscount: 15000, minSpend: 20000 } },
  { id: 'r5000', cost: 5000, label: '25,000 off your next order', coupon: { type: 'fixed', value: 25000, minSpend: 60000 } },
];

route('GET', '/api/loyalty', (ctx) => {
  const user = requireUser(ctx);
  const coupons = db.coupons.filter((c) => c.active && (c.userId === user.id || (c.public && !c.userId)) && (!c.endsAt || new Date(c.endsAt) > new Date()))
    .map((c) => ({ code: c.code, type: c.type, value: c.value, minSpend: c.minSpend || 0, endsAt: c.endsAt || null, description: c.description || '', vendorId: c.vendorId || null }));
  sendJson(ctx.res, 200, {
    points: user.points || 0, tier: D.loyaltyTier(user.points || 0), tiers: D.TIERS,
    rewards: REWARDS.map(({ coupon, ...r }) => r), coupons,
    ledger: (user.pointsLedger || []).slice(-20).reverse(),
  });
});

route('POST', '/api/loyalty/redeem', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  const reward = REWARDS.find((r) => r.id === body.rewardId);
  if (!reward) throw new HttpError(404, 'Reward not found');
  if ((user.points || 0) < reward.cost) throw new HttpError(409, 'You do not have enough points for this reward');
  D.addPoints(user, -reward.cost, `Redeemed: ${reward.label}`);
  const code = 'LOY-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  db.coupons.push({ code, active: true, userId: user.id, vendorId: null, description: reward.label, oneUsePerUser: true, usageLimit: 1, used: 0,
    endsAt: new Date(Date.now() + 90 * 86400000).toISOString(), ...reward.coupon });
  save('coupons');
  save('users');
  sendJson(ctx.res, 201, { code, points: user.points });
});
