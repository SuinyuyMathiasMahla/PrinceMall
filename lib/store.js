'use strict';
// Tiny JSON-file "database". Everything is kept in memory and written back
// to data/<name>.json whenever it changes (atomic write: temp file + rename).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const DEFAULTS = {
  products: [],
  users: [],
  sessions: {},
  carts: {},          // { "u:<userId>" | "s:<sid>": { items: [...], coupon } }
  orders: [],
  vendors: [],
  reviews: [],
  wishlists: {},      // { userId: [productId] }
  coupons: [],
  notifications: [],
  tickets: [],
  conversations: [],
  categories: [],
  ads: [],
  pages: [],
  audit: [],
  payouts: [],
  newsletter: [],
  tokens: {},         // password-reset / email-verify tokens (stored hashed)
};

const SETTINGS_DEFAULTS = {
  siteName: 'PrinceMall',
  currency: 'FCFA',
  taxRate: 0.05,
  freeShippingThreshold: 100000,
  defaultCommission: 0.10,
  pointsPerThousand: 1,
};

function clone(value) {
  return value === undefined ? {} : JSON.parse(JSON.stringify(value));
}

function load(name) {
  const file = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(file)) return clone(DEFAULTS[name]);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Could not read data/${name}.json (${err.message}); starting it empty.`);
    return clone(DEFAULTS[name]);
  }
}

const db = {};
for (const name of Object.keys(DEFAULTS)) db[name] = load(name);
db.settings = { ...SETTINGS_DEFAULTS, ...load('settings') };

function save(name) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name + '.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db[name], null, 2));
  fs.renameSync(tmp, file);
}

// For frequent, low-value writes (page views): batch them.
const timers = {};
function saveSoon(name, delay = 1500) {
  if (timers[name]) return;
  timers[name] = setTimeout(() => {
    delete timers[name];
    try { save(name); } catch (err) { console.error('save failed:', err.message); }
  }, delay);
}

function saveAll() {
  for (const name of Object.keys(db)) save(name);
}

process.on('exit', () => {
  for (const name of Object.keys(timers)) {
    try { save(name); } catch { /* ignore */ }
  }
});

module.exports = { db, save, saveSoon, saveAll, DATA_DIR };
