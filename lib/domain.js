'use strict';
// Business rules shared by buyer, vendor and admin routes.

const crypto = require('crypto');
const { db, save } = require('./store');

const DELIVERY_OPTIONS = [
  { id: 'standard', label: 'Standard delivery', days: '3-5 business days', fee: 2500 },
  { id: 'express', label: 'Express delivery', days: '1-2 business days', fee: 6000 },
  { id: 'pickup', label: 'Pick up at the vendor', days: 'Ready in 24 hours', fee: 0 },
];
const METRO_CITIES = ['douala', 'yaounde', 'yaoundé', 'buea', 'limbe', 'bamenda', 'bafoussam'];
const REMOTE_SURCHARGE = 1500;

const PAYMENT_METHODS = {
  card: { label: 'Credit / debit card', paid: true },
  mobile_money: { label: 'Mobile Money', paid: true },
  paypal: { label: 'PayPal', paid: true },
  stripe: { label: 'Stripe', paid: true },
  wallet: { label: 'Digital wallet', paid: true },
  bank_transfer: { label: 'Bank transfer', paid: false },
  cod: { label: 'Cash on delivery', paid: false },
};

const SHIPMENT_STATUSES = ['placed', 'processing', 'shipped', 'delivered', 'cancelled'];

const TIERS = [
  { name: 'Bronze', min: 0 },
  { name: 'Silver', min: 2000 },
  { name: 'Gold', min: 5000 },
  { name: 'Platinum', min: 10000 },
];

function newId(prefix) {
  return prefix + crypto.randomBytes(5).toString('hex');
}

function vendorById(id) {
  return db.vendors.find((v) => v.id === id);
}

function userById(id) {
  return db.users.find((u) => u.id === id);
}

function categoryBySlug(slug) {
  return db.categories.find((c) => c.slug === slug);
}

function flashActive(p) {
  return Boolean(p.flash && new Date(p.flash.endsAt).getTime() > Date.now());
}

function priceOf(p) {
  return flashActive(p) ? p.flash.price : p.price;
}

function isVisible(p) {
  const v = vendorById(p.vendorId);
  return p.status === 'active' && Boolean(v) && v.status === 'approved';
}

function ratingStats() {
  const map = new Map();
  for (const r of db.reviews) {
    const s = map.get(r.productId) || { sum: 0, count: 0 };
    s.sum += r.rating;
    s.count += 1;
    map.set(r.productId, s);
  }
  return map;
}

function productView(p, stats) {
  const v = vendorById(p.vendorId);
  const s = stats && stats.get(p.id);
  const price = priceOf(p);
  const original = flashActive(p) ? p.price : p.comparePrice;
  const hasDiscount = original && original > price;
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    categorySlug: (categoryBySlug && db.categories.find((c) => c.name === p.category) || {}).slug || '',
    price,
    originalPrice: hasDiscount ? original : null,
    discountPct: hasDiscount ? Math.round((1 - price / original) * 100) : 0,
    flashEndsAt: flashActive(p) ? p.flash.endsAt : null,
    stock: p.stock,
    image: p.images[0],
    images: p.images,
    video: p.video || null,
    description: p.description,
    colors: p.colors || [],
    sizes: p.sizes || [],
    vendor: v ? { id: v.id, name: v.storeName, slug: v.slug } : null,
    rating: s ? Math.round((s.sum / s.count) * 10) / 10 : 0,
    reviewCount: s ? s.count : 0,
    sold: p.sold || 0,
    featured: Boolean(p.featured),
    createdAt: p.createdAt,
  };
}

function settings() {
  return db.settings;
}

function notify(userId, type, title, body, link) {
  db.notifications.push({
    id: newId('n_'), userId, type, title, body: body || '', link: link || '',
    read: false, createdAt: new Date().toISOString(),
  });
  if (db.notifications.length > 20000) db.notifications.splice(0, 2000);
  save('notifications');
}

function notifyVendor(vendorId, type, title, body, link) {
  const v = vendorById(vendorId);
  if (!v) return;
  const ids = new Set([v.ownerId, ...(v.team || []).map((t) => t.userId)]);
  for (const id of ids) notify(id, type, title, body, link);
}

// ---------- orders ----------

function orderStatus(order) {
  const statuses = order.shipments.map((s) => s.status);
  if (statuses.every((s) => s === 'cancelled')) return 'cancelled';
  const live = statuses.filter((s) => s !== 'cancelled');
  if (live.every((s) => s === 'delivered')) return 'delivered';
  if (live.some((s) => s === 'shipped' || s === 'delivered')) return 'shipped';
  if (live.some((s) => s === 'processing')) return 'processing';
  return 'placed';
}

function orderView(order) {
  return { ...order, status: orderStatus(order) };
}

function shipmentRevenue(sh) {
  return sh.subtotal - (sh.vendorDiscount || 0);
}

// Counts towards a vendor's revenue.
function shipmentCounts(sh) {
  return sh.status !== 'cancelled' && !(sh.return && sh.return.status === 'refunded');
}

function vendorShipments(vendorId) {
  const out = [];
  for (const order of db.orders) {
    for (const shipment of order.shipments) {
      if (shipment.vendorId === vendorId) out.push({ order, shipment });
    }
  }
  return out.sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt));
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// Array of the last `days` day keys, oldest first.
function lastDays(days) {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    out.push(dayKey(new Date(now.getTime() - i * 86400000)));
  }
  return out;
}

function restock(order, vendorId) {
  for (const sh of order.shipments) {
    if (vendorId && sh.vendorId !== vendorId) continue;
    for (const item of sh.items) {
      const p = db.products.find((x) => x.id === item.productId);
      if (p) {
        p.stock += item.quantity;
        p.sold = Math.max(0, (p.sold || 0) - item.quantity);
      }
    }
  }
}

// Payment states: pending (nobody has confirmed money yet) -> paid -> refund_due -> refunded.
// Only a person moves an order between them: an admin, or the seller for cash they collected.
function markPaid(order, who, reference) {
  if (order.paymentStatus === 'paid') return 0;
  order.paymentStatus = 'paid';
  order.paidAt = new Date().toISOString();
  order.paidBy = who || 'staff';
  if (reference) order.paymentRef = reference;
  let points = 0;
  if (!order.pointsAwarded) {
    const user = userById(order.userId);
    points = Math.floor(order.total / 1000 * db.settings.pointsPerThousand);
    if (user && points > 0) { addPoints(user, points, `Order ${order.id}`); order.pointsAwarded = points; save('users'); }
  }
  notify(order.userId, 'order', `Payment received for order ${order.id}`, points ? `You earned ${points} reward points.` : 'Thank you!', `#/account/orders/${order.id}`);
  return points;
}

// When a parcel of a paid order is cancelled or returned, money has to go back to the buyer.
// The system only raises the flag; an admin marks the refund as sent.
function flagRefundDue(order, shipment) {
  if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'refund_due') return;
  shipment.refundDue = true;
  if (order.shipments.every((s) => s.status === 'cancelled')) order.paymentStatus = 'refund_due';
}

function refundDueAmount(order) {
  return order.shipments.filter((s) => s.refundDue).reduce((n, s) => n + s.subtotal - (s.vendorDiscount || 0) + (s.tax || 0), 0);
}

// Stock is reserved when an order is placed (so two people cannot buy the last item). Cancelling
// before the parcel ships just releases that reservation. Goods coming BACK from a buyer are
// different: a person has to confirm they arrived (see the return flow in routes/vendor.js).
function releaseReservation(shipment) {
  for (const item of shipment.items) {
    const p = db.products.find((x) => x.id === item.productId);
    if (p) { p.stock += item.quantity; p.sold = Math.max(0, (p.sold || 0) - item.quantity); }
  }
  save('products');
}

function loyaltyTier(points) {
  let tier = TIERS[0];
  for (const t of TIERS) if (points >= t.min) tier = t;
  const next = TIERS.find((t) => t.min > points) || null;
  return { name: tier.name, next: next ? { name: next.name, needed: next.min - points } : null };
}

function addPoints(user, delta, reason) {
  user.points = Math.max(0, (user.points || 0) + delta);
  user.pointsLedger = user.pointsLedger || [];
  user.pointsLedger.push({ at: new Date().toISOString(), delta, reason });
}

function publicUser(user) {
  const vendor = user.vendorId ? vendorById(user.vendorId) : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || '',
    avatar: user.avatar || '',
    emailVerified: Boolean(user.emailVerified),
    points: user.points || 0,
    createdAt: user.createdAt,
    vendor: vendor ? {
      id: vendor.id, storeName: vendor.storeName, status: vendor.status, staffRole: user.staffRole || 'owner',
    } : null,
  };
}

module.exports = {
  DELIVERY_OPTIONS, METRO_CITIES, REMOTE_SURCHARGE, PAYMENT_METHODS, SHIPMENT_STATUSES, TIERS,
  newId, vendorById, userById, categoryBySlug, flashActive, priceOf, isVisible, ratingStats, productView,
  settings, notify, notifyVendor, orderStatus, orderView, shipmentRevenue, shipmentCounts, vendorShipments,
  dayKey, lastDays, restock, markPaid, flagRefundDue, refundDueAmount, releaseReservation, loyaltyTier, addPoints, publicUser,
};
