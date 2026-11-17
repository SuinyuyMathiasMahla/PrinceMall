'use strict';
// Fills an empty database with DEMO data (vendors, products, buyers, orders,
// reviews...) so every dashboard has something to show. Runs once, when the
// database has no vendors. Everything here is invented sample data.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, saveAll, DATA_DIR } = require('./store');
const auth = require('./auth');
const D = require('./domain');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedIfEmpty() {
  if (db.vendors.length > 0) return null;

  const rand = rng(20261116);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const daysAgo = (d, hour = between(8, 20)) => {
    const t = new Date(Date.now() - d * 86400000);
    t.setUTCHours(hour, between(0, 59), 0, 0);
    return t.toISOString();
  };
  const secret = () => crypto.randomBytes(9).toString('base64url');
  const credentials = [];
  const makeUser = (name, email, role, extra = {}) => {
    const pass = secret();
    credentials.push({ role: extra.label || role, email, password: pass });
    const u = {
      id: crypto.randomUUID(), name, email, passwordHash: auth.hashPassword(pass), role, status: 'active', emailVerified: true,
      points: 0, pointsLedger: [], addresses: [], createdAt: daysAgo(between(80, 120)), ...extra,
    };
    delete u.label;
    db.users.push(u);
    return u;
  };

  db.carts = {};
  db.sessions = {};

  // ----- categories -----
  db.categories = [
    ['Kitchen Appliances', 'chef', 'Blenders, microwaves and everything for the kitchen'],
    ['Home Appliances', 'home', 'Fans, washing machines and household helpers'],
    ['Audio', 'headphones', 'Earphones, headphones and speakers'],
    ['Watches', 'watch', 'Classic and fashion watches'],
    ['Electronics', 'cpu', 'Smart gadgets and accessories'],
    ['Fashion', 'shirt', 'Clothing, bags and shoes'],
  ].map(([name, icon, description]) => ({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), icon, description, active: true }));

  // ----- admin & vendors -----
  const adminUser = makeUser('Platform Admin', 'admin@princemall.test', 'admin');
  const vendorDefs = [
    { store: 'Prince Electronics', owner: 'Prince Ngwa', email: 'prince@princemall.test', city: 'Douala', status: 'approved', color: '#4f46e5', tagline: 'Gadgets and kitchen tech you can trust', rate: 0.08 },
    { store: 'HomeNest Appliances', owner: 'Amina Tchoua', email: 'homenest@princemall.test', city: 'Yaounde', status: 'approved', color: '#0d9488', tagline: 'Everything for a comfortable home', rate: null },
    { store: 'Chrono Watches', owner: 'Brice Manga', email: 'chrono@princemall.test', city: 'Buea', status: 'approved', color: '#b45309', tagline: 'Timeless watches, gift-ready', rate: 0.12 },
    { store: 'Green Fashion House', owner: 'Linda Fomba', email: 'greenfashion@princemall.test', city: 'Bamenda', status: 'pending', color: '#15803d', tagline: 'Sustainable everyday fashion', rate: null },
  ];
  const vendors = vendorDefs.map((d) => {
    const owner = makeUser(d.owner, d.email, 'vendor', { label: 'vendor: ' + d.store, staffRole: 'owner' });
    const v = {
      id: D.newId('v_'), ownerId: owner.id, storeName: d.store, slug: d.store.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: `${d.store} sells quality products with fast delivery and honest service.`, businessType: 'company', country: 'Cameroon',
      city: d.city, phone: '+237 6' + between(50000000, 99999999), taxId: 'M' + between(100000, 999999) + 'X', idType: 'company_registration', idLast4: String(between(1000, 9999)),
      status: d.status, commissionRate: d.rate, createdAt: daysAgo(between(70, 110)), approvedAt: d.status === 'approved' ? daysAgo(between(60, 100)) : null,
      branding: { color: d.color, logo: '', banner: '', tagline: d.tagline },
      shipping: { flatRate: 2500, freeOver: 100000, processingDays: 2 },
      payment: { method: 'mobile_money', account: '+237 6' + between(50000000, 99999999), accountName: d.owner },
      tax: { collect: true },
      warehouses: [{ id: D.newId('w_'), name: 'Main warehouse', city: d.city }, { id: D.newId('w_'), name: 'Showroom stock', city: d.city }],
      team: [], banners: [],
    };
    owner.vendorId = v.id;
    db.vendors.push(v);
    return v;
  });
  const [PE, HN, CW, GF] = vendors;

  // a support agent for the first store, to demonstrate team roles
  const staff = makeUser('Joel Ekane', 'joel@princemall.test', 'vendor', { label: 'vendor staff (fulfillment): Prince Electronics', vendorId: PE.id, staffRole: 'fulfillment' });
  PE.team.push({ userId: staff.id, role: 'fulfillment' });

  // ----- products -----
  const I = (n) => 'images/' + n;
  const lorem = {
    microwave: 'A reliable 20-litre microwave oven with ten power levels, a defrost-by-weight function and a one-touch quick reheat. The easy-clean interior and rotating glass plate give even heating, and the child lock keeps little hands safe.',
    earphone: 'Neckband wireless earphones with Bluetooth 5.3, a 24-hour battery and magnetic earbuds that stop tangling. Deep bass, clear calls with a built-in microphone, and sweat resistance for workouts.',
    smartwatch: 'A gift-boxed smart watch set with interchangeable colourful straps, heart-rate and step tracking, call and message alerts, and a bright always-on display. Includes a magnetic charger and a pair of wireless earbuds.',
    juicer: 'A slow cold-press juicer that keeps more vitamins and gives up to 30% more juice from fruit and vegetables. Quiet motor, reverse function against clogging, and parts that rinse clean in under a minute.',
    fan: 'Adjustable-height standing fan with three speeds, wide oscillation and a strong copper motor. Stable base, safety grill and a timer, to keep the whole room cool all day.',
    washer: 'A 7 kg front-load automatic washing machine with 15 wash programs, a 15-minute quick wash and an energy-saving inverter motor. Anti-vibration design keeps it quiet, and the large door opens wide.',
    blender: 'A 1.5-litre blender with stainless steel blades for smoothies, soups, pepper and tomatoes. Two speeds plus pulse, a heat-resistant jar and a non-slip base.',
    watch: 'A luxury ladies watch gift set with a polished rose-gold case, a matching bracelet and a dust-proof gift box. Quartz movement with water resistance for everyday wear.',
    mens: 'A classic men\'s chronograph with a stainless steel strap, scratch-resistant glass and 30 m water resistance. Clean dial, bright lume hands and a two-year movement warranty.',
  };
  const P = [
    ['Hisense 20L Microwave Oven', PE, 'Kitchen Appliances', 65000, 78000, 14, 'microwave.jpg', lorem.microwave, [], [], true, 118, 'microwave'],
    ['Neckband Wireless Earphones G58', PE, 'Audio', 15000, 19000, 60, 'air-piece.jpg', lorem.earphone, [['Black', '#1f2937'], ['Red', '#dc2626']], [], true, 240, 'earphone'],
    ['Smart Watch Series 11 Gift Set', PE, 'Electronics', 22000, 29500, 35, 'watch-set1.jpg', lorem.smartwatch, [['Orange', '#f97316'], ['Blue', '#2563eb'], ['Black', '#111827']], [], true, 205, 'smartwatch'],
    ['Cold-Press Slow Juicer', PE, 'Kitchen Appliances', 25000, null, 3, 'blenda.jpg', lorem.juicer, [], [], false, 64, 'juicer'],
    ['Oscillating Standing Fan 18"', HN, 'Home Appliances', 30000, 36000, 22, 'standing-fan.jpg', lorem.fan, [['Green', '#16a34a'], ['Blue', '#2563eb'], ['Pink', '#ec4899']], [], true, 172, 'fan'],
    ['Front-Load Washing Machine 7kg', HN, 'Home Appliances', 180000, 210000, 5, 'washing-machine.jpg', lorem.washer, [], [], true, 41, 'washer'],
    ['Kitchen Blender 1.5L', HN, 'Kitchen Appliances', 20000, null, 40, 'blenda.jpg', lorem.blender, [['White', '#f3f4f6'], ['Black', '#111827']], [], false, 150, 'blender'],
    ['Microwave Grill Combo 25L', HN, 'Kitchen Appliances', 98000, 115000, 0, 'microwave.jpg', lorem.microwave, [], [], false, 27, 'microwave'],
    ['Table Fan 12" Desk Edition', HN, 'Home Appliances', 14500, null, 33, 'standing-fan.jpg', lorem.fan, [['White', '#f3f4f6']], [], false, 89, 'fan'],
    ['Ladies Rose-Gold Watch Gift Set', CW, 'Watches', 20000, 26000, 18, 'watch-set.jpg', lorem.watch, [['Rose gold', '#e0a899'], ['Silver', '#c0c0c0']], [], true, 133, 'watch'],
    ['Watch & Earbuds Combo Series 11', CW, 'Watches', 24000, null, 26, 'watch-set1.jpg', lorem.smartwatch, [['Orange', '#f97316'], ['Blue', '#2563eb']], [], false, 96, 'smartwatch'],
    ['Classic Chronograph for Men', CW, 'Watches', 38000, 45000, 12, 'watch-set.jpg', lorem.mens, [['Steel', '#9ca3af'], ['Black', '#111827']], ['38mm', '42mm'], true, 58, 'mens'],
    ['Pocket Neckband Earphones Lite', PE, 'Audio', 9500, null, 80, 'air-piece.jpg', lorem.earphone, [['Black', '#1f2937']], [], false, 301, 'earphone'],
    ['Eco Cotton Tote & Scarf Set', GF, 'Fashion', 12000, null, 25, 'watch-set.jpg', 'A reusable cotton tote bag with a matching scarf, made from organic cotton and dyed with plant-based colours.', [['Natural', '#e7dcc8']], [], false, 0, 'tote'],
  ];
  const products = P.map(([name, vendor, category, price, compare, stock, img, description, colors, sizes, featured, views, tag], i) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + (100 + i),
    vendorId: vendor.id, name, category, price, comparePrice: compare, stock, lowStockThreshold: 5,
    sku: (vendor.slug.slice(0, 3) + '-' + (1000 + i)).toUpperCase(), warehouse: i % 3 === 2 ? 'Showroom stock' : 'Main warehouse',
    images: [I(img)], // only the product's own photo: the demo has no other angles to show
    video: null, description, colors: colors.map(([n, hex]) => ({ name: n, hex })), sizes,
    shipping: { weightKg: between(1, 12), processingDays: 2, freeShipping: price >= 100000 },
    seo: { title: name, description: description.slice(0, 150) }, tags: [tag, category.toLowerCase()], status: 'active', featured,
    flash: null, sold: 0, views: views * 6 + between(100, 500), createdAt: daysAgo(between(40, 100)), updatedAt: daysAgo(between(1, 30)),
  }));
  products.find((p) => p.name.startsWith('Oscillating')).flash = { price: 24500, endsAt: new Date(Date.now() + 2 * 86400000 + 5 * 3600000).toISOString() };
  products.find((p) => p.name.startsWith('Neckband')).flash = { price: 12500, endsAt: new Date(Date.now() + 18 * 3600000).toISOString() };
  products.find((p) => p.name.startsWith('Eco Cotton')).status = 'draft';
  products[products.length - 1].vendorId = GF.id;
  db.products = products;

  // ----- buyers -----
  const buyerNames = ['Grace Nkeng', 'Samuel Etoga', 'Aisha Bello', 'Daniel Mbah', 'Chantal Ayuk', 'Patrick Njoh', 'Esther Tabi', 'Francis Kum', 'Mireille Ndi', 'Joseph Atem', 'Florence Mukete', 'Ivan Fonyuy'];
  const sharedHash = auth.hashPassword(secret()); // demo buyers cannot be logged into
  const buyers = buyerNames.map((n) => {
    const u = { id: crypto.randomUUID(), name: n, email: n.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', passwordHash: sharedHash, role: 'buyer',
      status: 'active', emailVerified: rand() > 0.2, points: 0, pointsLedger: [], addresses: [], createdAt: daysAgo(between(5, 110)) };
    db.users.push(u);
    return u;
  });
  const demoBuyer = makeUser('Demo Buyer', 'buyer@princemall.test', 'buyer', { label: 'buyer' });
  buyers.push(demoBuyer);

  // ----- orders (about 75 days of history) -----
  const cities = [['Douala', 4], ['Yaounde', 4], ['Buea', 3], ['Limbe', 2], ['Bamenda', 2], ['Bafoussam', 1], ['Garoua', 1], ['Kribi', 1]]
    .flatMap(([c, w]) => Array(w).fill(c));
  const methods = ['mobile_money', 'mobile_money', 'mobile_money', 'card', 'card', 'cod', 'cod', 'paypal', 'bank_transfer', 'wallet'];
  const sellable = db.products.filter((p) => p.status === 'active' && p.vendorId !== GF.id);
  const taxRate = db.settings.taxRate;
  const orders = [];
  for (let n = 0; n < 150; n++) {
    const age = Math.floor(75 * Math.pow(rand(), 1.6)); // more recent orders than old ones
    const buyer = rand() < 0.2 ? demoBuyer : pick(buyers);
    const lines = [];
    for (let k = between(1, 3); k > 0; k--) {
      const p = pick(sellable);
      if (lines.some((l) => l.p === p)) continue;
      lines.push({ p, qty: between(1, 2), color: p.colors.length ? pick(p.colors).name : '', size: p.sizes.length ? pick(p.sizes) : '' });
    }
    const createdAt = daysAgo(age);
    const shipments = [];
    for (const { p, qty, color, size } of lines) {
      let sh = shipments.find((s) => s.vendorId === p.vendorId);
      const vendor = D.vendorById(p.vendorId);
      if (!sh) {
        sh = { vendorId: vendor.id, storeName: vendor.storeName, status: 'placed', items: [], subtotal: 0, vendorDiscount: 0, commission: 0, net: 0, tax: 0,
          trackingNumber: '', carrier: '', return: null, timeline: [{ status: 'placed', at: createdAt }] };
        shipments.push(sh);
      }
      const price = p.price;
      sh.items.push({ productId: p.id, name: p.name, image: p.images[0], price, quantity: qty, color, size, lineTotal: price * qty });
      sh.subtotal += price * qty;
      p.sold += qty;
    }
    const subtotal = shipments.reduce((s, sh) => s + sh.subtotal, 0);
    const tax = Math.round(subtotal * taxRate);
    const delivery = pick(D.DELIVERY_OPTIONS);
    const city = pick(cities);
    const shippingFee = subtotal >= db.settings.freeShippingThreshold && delivery.id === 'standard' ? 0 : delivery.fee;
    // status by age
    const step = (sh, status, hoursAfter) => {
      sh.status = status;
      sh.timeline.push({ status, at: new Date(new Date(createdAt).getTime() + hoursAfter * 3600000).toISOString() });
    };
    for (const sh of shipments) {
      const vendor = D.vendorById(sh.vendorId);
      const rate = vendor.commissionRate != null ? vendor.commissionRate : db.settings.defaultCommission;
      sh.commission = Math.round(sh.subtotal * rate);
      sh.net = sh.subtotal - sh.commission;
      sh.tax = Math.round(tax * sh.subtotal / subtotal);
      const roll = rand();
      if (age <= 1) { if (roll > 0.5) step(sh, 'processing', 3); }
      else if (roll < 0.05) step(sh, 'cancelled', 6);
      else if (age <= 3) { step(sh, 'processing', 5); if (roll > 0.5) { step(sh, 'shipped', 20); sh.trackingNumber = 'TRK' + between(100000, 999999); sh.carrier = 'Express Cameroon'; } }
      else if (age <= 8) {
        step(sh, 'processing', 5); step(sh, 'shipped', 26); sh.trackingNumber = 'TRK' + between(100000, 999999); sh.carrier = pick(['Express Cameroon', 'SwiftRoad', 'Bus parcel']);
        if (roll > 0.45) step(sh, 'delivered', 70);
      } else {
        step(sh, 'processing', 5); step(sh, 'shipped', 26); sh.trackingNumber = 'TRK' + between(100000, 999999); sh.carrier = pick(['Express Cameroon', 'SwiftRoad', 'Bus parcel']);
        step(sh, 'delivered', 72 + between(0, 48));
        if (age < 30 && rand() < 0.07) sh.return = { status: age < 14 && rand() < 0.5 ? 'requested' : pick(['refunded', 'refunded', 'rejected']), reason: pick(['Item arrived damaged', 'Not as described', 'Changed my mind']), at: new Date(new Date(createdAt).getTime() + 5 * 86400000).toISOString() };
      }
    }
    const method = pick(methods);
    const allCancelled = shipments.every((s) => s.status === 'cancelled');
    const allDelivered = shipments.every((s) => s.status === 'delivered' || s.status === 'cancelled');
    const paid = D.PAYMENT_METHODS[method].paid || allDelivered;
    const order = {
      id: 'PM-' + crypto.randomBytes(4).toString('hex').toUpperCase(), userId: buyer.id, createdAt, shipments, subtotal, discount: 0, couponCode: null,
      shippingFee, tax, total: subtotal + shippingFee + tax, delivery: { id: delivery.id, label: delivery.label, days: delivery.days },
      shippingAddress: { fullName: buyer.name, phone: '+237 6' + between(50000000, 99999999), address: `${between(1, 99)} ${pick(['Main Street', 'Market Road', 'Airport Road', 'Hill Avenue'])}`, city, region: '', country: 'Cameroon' },
      billingAddress: null, paymentMethod: method, paymentStatus: allCancelled ? (paid ? 'refunded' : 'pending') : paid ? 'paid' : 'pending',
      paymentRef: paid ? 'SIM-' + crypto.randomBytes(5).toString('hex').toUpperCase() : null, momoNumber: '',
    };
    order.billingAddress = order.shippingAddress;
    if (allCancelled) for (const sh of shipments) for (const it of sh.items) { const pr = db.products.find((x) => x.id === it.productId); pr.sold -= it.quantity; }
    orders.push(order);
    if (!allCancelled) D.addPoints(buyer, Math.floor(order.total / 1000), `Order ${order.id}`);
  }
  db.orders = orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // ----- reviews -----
  const good = ['Works exactly as described and arrived earlier than promised. Very happy with this purchase.', 'Great quality for the price. The seller packed it carefully and answered all my questions.', 'Excellent! I have been using it every day for weeks and it still looks and works like new.', 'Fast delivery and the product is even better than the pictures. I would buy from this store again.'];
  const ok = ['Good product overall, though the delivery took a day longer than expected.', 'Does the job. The packaging could be better but the item itself is fine.'];
  const bad = ['Not what I expected. The seller was polite but the quality is average for the price.'];
  const reviews = [];
  for (const o of db.orders) {
    for (const sh of o.shipments.filter((s) => s.status === 'delivered')) {
      for (const it of sh.items) {
        if (rand() > 0.3 || reviews.some((r) => r.productId === it.productId && r.userId === o.userId)) continue;
        const roll = rand();
        const rating = roll < 0.6 ? 5 : roll < 0.85 ? 4 : roll < 0.95 ? 3 : 2;
        const buyer = D.userById(o.userId);
        const r = { id: D.newId('r_'), productId: it.productId, userId: o.userId, userName: buyer.name, rating, title: rating >= 4 ? pick(['Love it', 'Great value', 'Recommended', 'Very good']) : pick(['It is okay', 'Mixed feelings']),
          body: pick(rating >= 4 ? good : rating === 3 ? ok : bad), photos: [], verified: true, createdAt: new Date(new Date(o.createdAt).getTime() + between(4, 12) * 86400000).toISOString(), reply: null };
        if (new Date(r.createdAt) > new Date()) continue;
        if (rand() < 0.4) r.reply = { body: 'Thank you for shopping with us. We are glad you like it and look forward to serving you again!', at: r.createdAt, store: D.vendorById(db.products.find((p) => p.id === r.productId).vendorId).storeName };
        reviews.push(r);
      }
    }
  }
  db.reviews = reviews;

  // ----- coupons, ads, pages, support -----
  db.coupons = [
    { code: 'WELCOME10', type: 'percent', value: 10, minSpend: 5000, maxDiscount: 10000, active: true, public: true, vendorId: null, description: '10% off your first order', used: 12, usedBy: [], usageLimit: 0, endsAt: null },
    { code: 'PRINCE5000', type: 'fixed', value: 5000, minSpend: 50000, active: true, public: true, vendorId: null, description: '5,000 off orders above 50,000', used: 4, usedBy: [], usageLimit: 0, endsAt: null },
    { code: 'CHRONO15', type: 'percent', value: 15, minSpend: 15000, maxDiscount: 8000, active: true, public: true, vendorId: CW.id, description: '15% off Chrono Watches', used: 3, usedBy: [], usageLimit: 0, endsAt: new Date(Date.now() + 30 * 86400000).toISOString() },
  ];
  db.ads = [
    { id: D.newId('ad_'), title: 'Home upgrade season', subtitle: 'Up to 25% off fans, washers and kitchen appliances', image: '', link: '#/shop?deals=1', placement: 'hero', active: true, startsAt: null, endsAt: null, createdAt: daysAgo(10) },
    { id: D.newId('ad_'), title: 'Gift-ready watches', subtitle: 'Free gift box with every Chrono Watches order', image: '', link: '#/store/chrono-watches', placement: 'hero', active: true, startsAt: null, endsAt: null, createdAt: daysAgo(9) },
    { id: D.newId('ad_'), title: 'Sell on PrinceMall', subtitle: 'Open your store in minutes and reach thousands of buyers', image: '', link: '/vendor/#/register', placement: 'promo', active: true, startsAt: null, endsAt: null, createdAt: daysAgo(8) },
  ];
  const page = (slug, title, body) => ({ slug, title, body, published: true, updatedAt: daysAgo(20) });
  db.pages = [
    page('about', 'About PrinceMall', 'PrinceMall is a marketplace where independent shops sell to buyers across the country.\n\nEvery store is reviewed before it can sell, and every order is split between shops so that each seller ships their own items.\n\nThis is a sample page. Edit it from the admin panel (CMS).'),
    page('shipping', 'Shipping & delivery', 'Standard delivery takes 3-5 business days, express takes 1-2 business days, and you can also pick up from the seller.\n\nOrders above the free-shipping amount ship free with standard delivery.\n\nThis is a sample page. Edit it from the admin panel (CMS).'),
    page('returns', 'Returns & refunds', 'You can request a return within 14 days of delivery from your order page. The seller reviews the request and, once approved, your refund is issued.\n\nThis is a sample page. Edit it from the admin panel (CMS).'),
    page('privacy', 'Privacy policy', 'We keep only the information needed to run your account and orders. Passwords are stored hashed, and card details are never stored by this demo.\n\nThis is a sample page. Replace it with your real policy before launch.'),
    page('terms', 'Terms of service', 'By using PrinceMall you agree to follow our marketplace rules.\n\nThis is a sample page. Replace it with your real terms before launch.'),
  ];
  db.tickets = [{
    id: 'T-' + crypto.randomBytes(3).toString('hex').toUpperCase(), userId: buyers[0].id, userName: buyers[0].name, userEmail: buyers[0].email,
    subject: 'Where is my parcel?', category: 'order', priority: 'normal', status: 'open', createdAt: daysAgo(1), updatedAt: daysAgo(1),
    messages: [{ from: 'user', name: buyers[0].name, body: 'My order has been marked as shipped for three days but I have no tracking updates. Can you help?', at: daysAgo(1) }],
  }];
  db.conversations = [{
    id: D.newId('cv_'), buyerId: demoBuyer.id, vendorId: PE.id, productId: products[0].id, unread: { buyer: 0, vendor: 1 }, updatedAt: daysAgo(0, 9),
    messages: [{ from: 'buyer', userId: demoBuyer.id, name: demoBuyer.name, body: 'Hello, does this microwave come with a warranty?', at: daysAgo(0, 9) }],
  }];
  db.notifications = [
    { id: D.newId('n_'), userId: demoBuyer.id, type: 'promo', title: 'Flash sale: 18 hours left', body: 'Neckband earphones are 17% off until tomorrow.', link: '#/shop?deals=1', read: false, createdAt: daysAgo(0, 7) },
    { id: D.newId('n_'), userId: demoBuyer.id, type: 'system', title: 'Welcome to PrinceMall', body: 'Use code WELCOME10 for 10% off your first order.', link: '#/shop', read: true, createdAt: daysAgo(30) },
  ];
  db.audit = [{ at: new Date().toISOString(), userId: adminUser.id, who: adminUser.email, action: 'seed', detail: 'Demo data created', ip: 'local' }];

  saveAll();
  const lines = credentials.map((c) => `${c.role.padEnd(55)} ${c.email.padEnd(32)} ${c.password}`);
  const text = 'DEMO ACCOUNTS (generated once, local development only)\n' + lines.join('\n') + '\n';
  fs.writeFileSync(path.join(DATA_DIR, 'credentials.txt'), text);
  return text;
}

module.exports = { seedIfEmpty };
