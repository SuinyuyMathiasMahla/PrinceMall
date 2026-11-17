'use strict';
// Cart storage, coupon rules and totals.

const { db, saveSoon } = require('./store');
const { HttpError } = require('./http');
const D = require('./domain');

function cartKey(ctx) {
  const s = ctx.session;
  if (!s) return null;
  return s.userId ? 'u:' + s.userId : 's:' + s.sid;
}

function getRec(ctx) {
  const key = cartKey(ctx);
  return (key && db.carts[key]) || { items: [], coupon: null };
}

function putRec(ctx, rec) {
  const key = cartKey(ctx);
  if (!key) return;
  if (!rec.items.length && !rec.coupon) delete db.carts[key];
  else db.carts[key] = rec;
  saveSoon('carts', 300);
}

function sameLine(a, b) {
  return a.productId === b.productId && (a.color || '') === (b.color || '') && (a.size || '') === (b.size || '');
}

// When a guest logs in, their guest cart is added to their account cart.
function mergeGuestCart(guestSession, userSession) {
  const guestKey = 's:' + guestSession.sid;
  const guest = db.carts[guestKey];
  if (!guest || !guest.items.length) return;
  const userKey = 'u:' + userSession.userId;
  const rec = db.carts[userKey] || { items: [], coupon: null };
  for (const item of guest.items) {
    const product = db.products.find((p) => p.id === item.productId);
    if (!product) continue;
    const existing = rec.items.find((i) => sameLine(i, item));
    const quantity = Math.min((existing ? existing.quantity : 0) + item.quantity, product.stock);
    if (quantity < 1) continue;
    if (existing) existing.quantity = quantity;
    else rec.items.push({ ...item, quantity });
  }
  if (!rec.coupon) rec.coupon = guest.coupon || null;
  db.carts[userKey] = rec;
  delete db.carts[guestKey];
  saveSoon('carts', 300);
}

// ---------- coupons ----------

function evaluateCoupon(code, lines, userId) {
  const coupon = db.coupons.find((c) => c.code === String(code).toUpperCase());
  if (!coupon || !coupon.active) return { error: 'This coupon code is not valid' };
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() < Date.now()) return { error: 'This coupon has expired' };
  if (coupon.userId && coupon.userId !== userId) return { error: 'This coupon is not valid for your account' };
  if (coupon.usageLimit && (coupon.used || 0) >= coupon.usageLimit) return { error: 'This coupon has been fully used' };
  if (coupon.usedBy && userId && coupon.usedBy.includes(userId) && coupon.oneUsePerUser) {
    return { error: 'You have already used this coupon' };
  }
  const eligible = lines.filter((l) => !coupon.vendorId || l.vendorId === coupon.vendorId);
  const base = eligible.reduce((s, l) => s + l.lineTotal, 0);
  if (!eligible.length) return { error: 'This coupon does not apply to the items in your cart' };
  if (coupon.minSpend && base < coupon.minSpend) {
    return { error: `Spend at least ${coupon.minSpend.toLocaleString('en-US')} ${db.settings.currency} to use this coupon` };
  }
  let discount = coupon.type === 'percent' ? Math.round(base * coupon.value / 100) : Math.min(coupon.value, base);
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  return { coupon, discount };
}

// ---------- totals ----------

function deliveryFee(option, city, subtotalAfterDiscount) {
  if (option.id === 'pickup') return 0;
  const remote = city && !D.METRO_CITIES.includes(String(city).trim().toLowerCase()) ? D.REMOTE_SURCHARGE : 0;
  if (option.id === 'standard' && subtotalAfterDiscount >= db.settings.freeShippingThreshold) return 0;
  return option.fee + remote;
}

function cartView(ctx, { deliveryId = 'standard', city = '' } = {}) {
  const rec = getRec(ctx);
  const userId = ctx.session && ctx.session.userId;
  const lines = [];
  for (const entry of rec.items) {
    const p = db.products.find((x) => x.id === entry.productId);
    if (!p || !D.isVisible(p)) continue;
    const price = D.priceOf(p);
    const vendor = D.vendorById(p.vendorId);
    lines.push({
      id: entry.id,
      productId: p.id,
      name: p.name,
      image: p.images[0],
      price,
      quantity: entry.quantity,
      color: entry.color || '',
      size: entry.size || '',
      stock: p.stock,
      vendorId: p.vendorId,
      vendorName: vendor ? vendor.storeName : '',
      lineTotal: price * entry.quantity,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  let discount = 0;
  let coupon = null;
  let couponError = null;
  if (rec.coupon) {
    const result = evaluateCoupon(rec.coupon, lines, userId);
    if (result.error) couponError = result.error;
    else {
      discount = result.discount;
      coupon = {
        code: result.coupon.code,
        type: result.coupon.type,
        value: result.coupon.value,
        vendorId: result.coupon.vendorId || null,
      };
    }
  }

  const after = subtotal - discount;
  const deliveryOptions = D.DELIVERY_OPTIONS.map((o) => ({ ...o, fee: deliveryFee(o, city, after) }));
  const delivery = deliveryOptions.find((o) => o.id === deliveryId) || deliveryOptions[0];
  const shipping = lines.length ? delivery.fee : 0;
  const taxRate = db.settings.taxRate;
  const tax = Math.round(after * taxRate);
  const remaining = Math.max(db.settings.freeShippingThreshold - after, 0);

  return {
    items: lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    discount,
    coupon,
    couponError,
    deliveryOptions,
    delivery,
    shipping,
    taxRate,
    tax,
    total: lines.length ? after + shipping + tax : 0,
    freeShippingRemaining: lines.length ? remaining : db.settings.freeShippingThreshold,
    freeShippingThreshold: db.settings.freeShippingThreshold,
  };
}

function checkStock(product, quantity) {
  if (product.stock < 1) throw new HttpError(409, `${product.name} is out of stock`);
  if (quantity > product.stock) throw new HttpError(409, `Only ${product.stock} of ${product.name} left in stock`);
}

module.exports = { cartKey, getRec, putRec, sameLine, mergeGuestCart, evaluateCoupon, cartView, checkStock };
