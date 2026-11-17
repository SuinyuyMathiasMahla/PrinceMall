'use strict';
// Authentication, catalogue, reviews, store pages, CMS pages, uploads.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, save, saveSoon } = require('../store');
const auth = require('../auth');
const cart = require('../cart');
const D = require('../domain');
const {
  HttpError, sendJson, readJson, str, optStr, num, email, password, oneOf, imageUrl, slugify, paginate,
  route, requireUser, audit,
} = require('../http');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
const PORT = Number(process.env.PORT) || 3000;

// Replace the current (guest) session with a logged-in one, keeping the cart.
function startUserSession(ctx, user) {
  const guest = ctx.session;
  const session = auth.createSession(ctx.res, user.id);
  if (guest) {
    if (!guest.userId) cart.mergeGuestCart(guest, session);
    auth.removeSession(guest.sid);
  }
  ctx.session = session;
  ctx.user = user;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueToken(userId, type, ttlMs) {
  const token = crypto.randomBytes(32).toString('hex');
  db.tokens[hashToken(token)] = { userId, type, expiresAt: Date.now() + ttlMs };
  save('tokens');
  return token;
}

function takeToken(token, type) {
  const key = hashToken(String(token || ''));
  const rec = db.tokens[key];
  if (!rec || rec.type !== type || rec.expiresAt < Date.now()) throw new HttpError(400, 'This link is invalid or has expired');
  delete db.tokens[key];
  save('tokens');
  return rec;
}

function counts(ctx) {
  const view = cart.cartView(ctx);
  const uid = ctx.user && ctx.user.id;
  return {
    cart: view.count,
    wishlist: uid ? (db.wishlists[uid] || []).length : 0,
    unread: uid ? db.notifications.filter((n) => n.userId === uid && !n.read).length : 0,
  };
}

// ---------- auth ----------

route('POST', '/api/auth/signup', async (ctx) => {
  const body = await readJson(ctx.req);
  const name = str(body.name, 'Name', 2, 60);
  const mail = email(body.email);
  const pass = password(body.password);
  if (db.users.some((u) => u.email === mail)) throw new HttpError(409, 'An account with this email already exists');
  const user = {
    id: crypto.randomUUID(), name, email: mail, passwordHash: auth.hashPassword(pass), role: 'buyer',
    status: 'active', emailVerified: false, points: 0, pointsLedger: [], addresses: [], createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  save('users');
  const token = issueToken(user.id, 'verify', 3 * 24 * 3600 * 1000);
  console.log(`[mail] Verify link for ${mail}: http://localhost:${PORT}/#/verify?token=${token}`);
  D.notify(user.id, 'system', 'Welcome to PrinceMall', 'Use code WELCOME10 for 10% off your first order.', '#/shop');
  startUserSession(ctx, user);
  audit(ctx, 'signup', mail);
  sendJson(ctx.res, 201, { user: D.publicUser(user) });
});

route('POST', '/api/auth/login', async (ctx) => {
  const body = await readJson(ctx.req);
  const mail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const pass = typeof body.password === 'string' ? body.password : '';
  const throttleKey = ctx.req.socket.remoteAddress + '|' + mail;
  if (auth.isLocked(throttleKey)) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes');
  const user = db.users.find((u) => u.email === mail);
  if (!user || !auth.verifyPassword(pass, user.passwordHash)) {
    auth.recordFailure(throttleKey);
    audit({ ...ctx, user: null }, 'login_failed', mail);
    throw new HttpError(401, 'Wrong email or password');
  }
  if (user.status === 'suspended') throw new HttpError(403, 'This account has been suspended. Contact support.');
  auth.clearFailures(throttleKey);
  startUserSession(ctx, user);
  audit(ctx, 'login', user.role);
  sendJson(ctx.res, 200, { user: D.publicUser(user) });
});

route('POST', '/api/auth/logout', (ctx) => {
  auth.destroySession(ctx.req, ctx.res);
  sendJson(ctx.res, 200, { ok: true });
});

route('GET', '/api/auth/me', (ctx) => {
  sendJson(ctx.res, 200, {
    user: ctx.user ? D.publicUser(ctx.user) : null,
    counts: counts(ctx),
    site: { name: db.settings.siteName, currency: db.settings.currency, freeShippingThreshold: db.settings.freeShippingThreshold, taxRate: db.settings.taxRate },
  });
});

route('POST', '/api/auth/forgot', async (ctx) => {
  const body = await readJson(ctx.req);
  const mail = email(body.email);
  const user = db.users.find((u) => u.email === mail);
  if (user) {
    const token = issueToken(user.id, 'reset', 3600 * 1000);
    // No email service is connected, so the link is printed in the server console.
    console.log(`[mail] Password reset link for ${mail}: http://localhost:${PORT}/#/reset?token=${token}`);
  }
  // Same answer whether or not the account exists.
  sendJson(ctx.res, 200, { ok: true });
});

route('POST', '/api/auth/reset', async (ctx) => {
  const body = await readJson(ctx.req);
  const pass = password(body.password);
  const rec = takeToken(body.token, 'reset');
  const user = D.userById(rec.userId);
  if (!user) throw new HttpError(400, 'This link is invalid or has expired');
  user.passwordHash = auth.hashPassword(pass);
  save('users');
  for (const [sid, s] of Object.entries(db.sessions)) if (s.userId === user.id) delete db.sessions[sid];
  save('sessions');
  audit({ ...ctx, user }, 'password_reset', user.email);
  sendJson(ctx.res, 200, { ok: true });
});

route('POST', '/api/auth/verify', async (ctx) => {
  const body = await readJson(ctx.req);
  const rec = takeToken(body.token, 'verify');
  const user = D.userById(rec.userId);
  if (user) { user.emailVerified = true; save('users'); }
  sendJson(ctx.res, 200, { ok: true });
});

route('POST', '/api/auth/resend', (ctx) => {
  const user = requireUser(ctx);
  if (!user.emailVerified) {
    const token = issueToken(user.id, 'verify', 3 * 24 * 3600 * 1000);
    console.log(`[mail] Verify link for ${user.email}: http://localhost:${PORT}/#/verify?token=${token}`);
  }
  sendJson(ctx.res, 200, { ok: true });
});

// ---------- catalogue ----------

function visibleViews() {
  const stats = D.ratingStats();
  return db.products.filter(D.isVisible).map((p) => ({ raw: p, view: D.productView(p, stats) }));
}

function matchScore(p, words) {
  const name = p.name.toLowerCase();
  const hay = `${p.name} ${p.category} ${p.description} ${(p.tags || []).join(' ')} ${p.vendor ? p.vendor.name : ''}`.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (!hay.includes(w)) return 0;
    score += name.startsWith(w) ? 5 : name.includes(w) ? 3 : 1;
  }
  return score;
}

route('GET', '/api/products', (ctx) => {
  const q = ctx.url.searchParams;
  const words = (q.get('q') || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = visibleViews();
  let list = all.map((x) => ({ ...x.view, _t: x.raw.tags || [] }));
  list = list.map((p) => ({ ...p, _score: words.length ? matchScore({ ...p, tags: p._t }, words) : 1 })).filter((p) => p._score > 0);

  // facets are computed before the category / price / rating filters are applied
  const catCounts = new Map();
  for (const p of list) catCounts.set(p.category, (catCounts.get(p.category) || 0) + 1);
  const facets = {
    categories: db.categories.filter((c) => c.active !== false && catCounts.has(c.name))
      .map((c) => ({ name: c.name, slug: c.slug, count: catCounts.get(c.name) })),
    priceMin: list.length ? Math.min(...list.map((p) => p.price)) : 0,
    priceMax: list.length ? Math.max(...list.map((p) => p.price)) : 0,
  };

  const category = q.get('category');
  if (category) list = list.filter((p) => p.categorySlug === category);
  const vendor = q.get('vendor');
  if (vendor) list = list.filter((p) => p.vendor && p.vendor.slug === vendor);
  const min = Number(q.get('minPrice'));
  const max = Number(q.get('maxPrice'));
  if (min > 0) list = list.filter((p) => p.price >= min);
  if (max > 0) list = list.filter((p) => p.price <= max);
  const rating = Number(q.get('rating'));
  if (rating > 0) list = list.filter((p) => p.rating >= rating);
  if (q.get('inStock') === '1') list = list.filter((p) => p.stock > 0);
  if (q.get('deals') === '1') list = list.filter((p) => p.originalPrice);

  const sorters = {
    relevance: (a, b) => b._score - a._score || b.sold - a.sold,
    price_asc: (a, b) => a.price - b.price,
    price_desc: (a, b) => b.price - a.price,
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
    bestselling: (a, b) => b.sold - a.sold,
    discount: (a, b) => b.discountPct - a.discountPct,
  };
  list.sort(sorters[q.get('sort')] || sorters.relevance);

  const page = paginate(list, q, 12, 48);
  sendJson(ctx.res, 200, {
    products: page.items.map(({ _score, _t, ...p }) => p),
    total: page.total, page: page.page, pages: page.pages, facets,
  });
});

route('GET', '/api/suggest', (ctx) => {
  const words = (ctx.url.searchParams.get('q') || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return sendJson(ctx.res, 200, { products: [], categories: [], stores: [] });
  const products = visibleViews()
    .map((x) => ({ v: x.view, s: matchScore({ ...x.view, tags: x.raw.tags }, words) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 5)
    .map((x) => ({ id: x.v.id, name: x.v.name, image: x.v.image, price: x.v.price, category: x.v.category }));
  const categories = db.categories.filter((c) => c.active !== false && words.every((w) => c.name.toLowerCase().includes(w)))
    .slice(0, 3).map((c) => ({ name: c.name, slug: c.slug }));
  const stores = db.vendors.filter((v) => v.status === 'approved' && words.every((w) => v.storeName.toLowerCase().includes(w)))
    .slice(0, 3).map((v) => ({ name: v.storeName, slug: v.slug }));
  sendJson(ctx.res, 200, { products, categories, stores });
});

route('GET', '/api/categories', (ctx) => {
  const counts = new Map();
  for (const p of db.products.filter(D.isVisible)) counts.set(p.category, (counts.get(p.category) || 0) + 1);
  const categories = db.categories.filter((c) => c.active !== false)
    .map((c) => ({ name: c.name, slug: c.slug, icon: c.icon, description: c.description, count: counts.get(c.name) || 0 }));
  sendJson(ctx.res, 200, { categories });
});

route('GET', '/api/home', (ctx) => {
  const all = visibleViews().map((x) => x.view);
  const since = Date.now() - 14 * 86400000;
  const recent = new Map();
  for (const o of db.orders) {
    if (new Date(o.createdAt).getTime() < since) continue;
    for (const sh of o.shipments) for (const it of sh.items) recent.set(it.productId, (recent.get(it.productId) || 0) + it.quantity);
  }
  const catCounts = new Map();
  for (const p of all) catCounts.set(p.category, (catCounts.get(p.category) || 0) + 1);
  const now = Date.now();
  sendJson(ctx.res, 200, {
    featured: all.filter((p) => p.featured).slice(0, 8),
    bestSellers: [...all].sort((a, b) => b.sold - a.sold).slice(0, 8),
    trending: [...all].sort((a, b) => (recent.get(b.id) || 0) - (recent.get(a.id) || 0) || b.sold - a.sold).slice(0, 8),
    deals: all.filter((p) => p.originalPrice).sort((a, b) => b.discountPct - a.discountPct).slice(0, 8),
    categories: db.categories.filter((c) => c.active !== false)
      .map((c) => ({ name: c.name, slug: c.slug, icon: c.icon, description: c.description, count: catCounts.get(c.name) || 0 })),
    banners: db.ads.filter((a) => a.active && (!a.startsAt || new Date(a.startsAt) <= now) && (!a.endsAt || new Date(a.endsAt) >= now))
      .map((a) => ({ id: a.id, title: a.title, subtitle: a.subtitle, image: a.image, link: a.link, placement: a.placement })),
    testimonials: db.reviews.filter((r) => r.rating >= 4 && r.body.length > 40).slice(-30).reverse().slice(0, 3)
      .map((r) => ({ name: r.userName, rating: r.rating, body: r.body, product: (db.products.find((p) => p.id === r.productId) || {}).name })),
    stats: {
      vendors: db.vendors.filter((v) => v.status === 'approved').length,
      products: all.length,
      buyers: db.users.filter((u) => u.role === 'buyer').length,
    },
  });
});

route('GET', '/api/products/:id', (ctx) => {
  const p = db.products.find((x) => x.id === ctx.params.id);
  if (!p || !D.isVisible(p)) throw new HttpError(404, 'Product not found');
  p.views = (p.views || 0) + 1;
  saveSoon('products');
  const stats = D.ratingStats();
  const vendor = D.vendorById(p.vendorId);
  const related = db.products.filter((x) => x.id !== p.id && D.isVisible(x) && x.category === p.category)
    .slice(0, 4).map((x) => D.productView(x, stats));
  const reviews = db.reviews.filter((r) => r.productId === p.id);
  const dist = [0, 0, 0, 0, 0];
  for (const r of reviews) dist[r.rating - 1] += 1;
  const vendorProducts = db.products.filter((x) => x.vendorId === vendor.id && D.isVisible(x));
  const vendorReviews = db.reviews.filter((r) => vendorProducts.some((x) => x.id === r.productId));
  sendJson(ctx.res, 200, {
    product: {
      ...D.productView(p, stats),
      sku: p.sku, tags: p.tags || [], shipping: p.shipping || {}, seo: p.seo || {},
    },
    related,
    ratingDistribution: dist,
    seller: {
      id: vendor.id, name: vendor.storeName, slug: vendor.slug, tagline: (vendor.branding || {}).tagline || '',
      logo: (vendor.branding || {}).logo || '', city: vendor.city, country: vendor.country,
      since: vendor.createdAt, productCount: vendorProducts.length,
      rating: vendorReviews.length ? Math.round(vendorReviews.reduce((s, r) => s + r.rating, 0) / vendorReviews.length * 10) / 10 : 0,
      reviewCount: vendorReviews.length,
      processingDays: (vendor.shipping || {}).processingDays || 2,
    },
  });
});

// ---------- reviews ----------

function reviewView(r) {
  return {
    id: r.id, productId: r.productId, userName: r.userName, rating: r.rating, title: r.title, body: r.body,
    photos: r.photos || [], verified: Boolean(r.verified), createdAt: r.createdAt, reply: r.reply || null,
  };
}

route('GET', '/api/products/:id/reviews', (ctx) => {
  let list = db.reviews.filter((r) => r.productId === ctx.params.id);
  const sort = ctx.url.searchParams.get('sort');
  if (sort === 'highest') list.sort((a, b) => b.rating - a.rating);
  else if (sort === 'lowest') list.sort((a, b) => a.rating - b.rating);
  else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = paginate(list, ctx.url.searchParams, 5, 20);
  sendJson(ctx.res, 200, { reviews: page.items.map(reviewView), total: page.total, page: page.page, pages: page.pages });
});

route('POST', '/api/products/:id/reviews', async (ctx) => {
  const user = requireUser(ctx);
  const product = db.products.find((p) => p.id === ctx.params.id);
  if (!product) throw new HttpError(404, 'Product not found');
  const body = await readJson(ctx.req);
  const rating = num(body.rating, 'Rating', 1, 5);
  const title = optStr(body.title, 'Title', 100);
  const text = str(body.body, 'Review', 10, 2000);
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 4).map((u) => imageUrl(u, 'Photo')) : [];
  if (db.reviews.some((r) => r.productId === product.id && r.userId === user.id)) {
    throw new HttpError(409, 'You have already reviewed this product');
  }
  const verified = db.orders.some((o) => o.userId === user.id && o.shipments.some((s) => s.status !== 'cancelled' && s.items.some((i) => i.productId === product.id)));
  const review = {
    id: D.newId('r_'), productId: product.id, userId: user.id, userName: user.name, rating, title, body: text,
    photos, verified, createdAt: new Date().toISOString(), reply: null,
  };
  db.reviews.push(review);
  save('reviews');
  D.notifyVendor(product.vendorId, 'message', 'New review', `${user.name} rated ${product.name} ${rating}/5`, '#/reviews');
  sendJson(ctx.res, 201, { review: reviewView(review) });
});

// ---------- stores, pages, newsletter ----------

route('GET', '/api/vendors/:slug', (ctx) => {
  const v = db.vendors.find((x) => x.slug === ctx.params.slug && x.status === 'approved');
  if (!v) throw new HttpError(404, 'Store not found');
  const stats = D.ratingStats();
  const products = db.products.filter((p) => p.vendorId === v.id && D.isVisible(p)).map((p) => D.productView(p, stats));
  const reviews = db.reviews.filter((r) => products.some((p) => p.id === r.productId));
  sendJson(ctx.res, 200, {
    store: {
      id: v.id, name: v.storeName, slug: v.slug, description: v.description, city: v.city, country: v.country,
      branding: v.branding || {}, since: v.createdAt,
      rating: reviews.length ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length * 10) / 10 : 0,
      reviewCount: reviews.length,
      banners: (v.banners || []).filter((b) => b.active),
      sales: db.orders.reduce((s, o) => s + o.shipments.filter((sh) => sh.vendorId === v.id && sh.status === 'delivered').length, 0),
    },
    products,
  });
});

route('GET', '/api/pages/:slug', (ctx) => {
  const page = db.pages.find((p) => p.slug === ctx.params.slug && p.published);
  if (!page) throw new HttpError(404, 'Page not found');
  sendJson(ctx.res, 200, { page: { slug: page.slug, title: page.title, body: page.body, updatedAt: page.updatedAt } });
});

route('GET', '/api/pages', (ctx) => {
  sendJson(ctx.res, 200, { pages: db.pages.filter((p) => p.published).map((p) => ({ slug: p.slug, title: p.title })) });
});

route('POST', '/api/newsletter', async (ctx) => {
  const body = await readJson(ctx.req);
  const mail = email(body.email);
  if (!db.newsletter.includes(mail)) { db.newsletter.push(mail); save('newsletter'); }
  sendJson(ctx.res, 200, { ok: true });
});

// ---------- image upload (JSON body with a data URL) ----------

const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/png': (b) => b.slice(0, 4).toString('hex') === '89504e47',
  'image/gif': (b) => b.slice(0, 3).toString() === 'GIF',
  'image/webp': (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP',
};
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

route('POST', '/api/upload', async (ctx) => {
  requireUser(ctx);
  const body = await readJson(ctx.req, 3 * 1024 * 1024);
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof body.dataUrl === 'string' ? body.dataUrl : '');
  if (!m) throw new HttpError(400, 'Upload a JPG, PNG, GIF or WebP image');
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > 2 * 1024 * 1024) throw new HttpError(413, 'Image must be smaller than 2 MB');
  if (!SIGNATURES[m[1]](buffer)) throw new HttpError(400, 'The file is not a valid image');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = crypto.randomBytes(12).toString('hex') + '.' + EXT[m[1]];
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  sendJson(ctx.res, 201, { url: 'uploads/' + name });
});

module.exports = { startUserSession, counts };
