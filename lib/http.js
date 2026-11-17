'use strict';
// Small helpers shared by every route file: errors, JSON in/out, validation,
// pagination, route registry and role guards.

const { db } = require('./store');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 100000) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) {
      return reject(new HttpError(415, 'Request body must be JSON'));
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        resolve(value);
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---------- validation ----------

function str(value, field, min = 1, max = 200) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (s.length < min || s.length > max) {
    throw new HttpError(400, min === 0
      ? `${field} must be at most ${max} characters`
      : `${field} must be between ${min} and ${max} characters`);
  }
  return s;
}

function optStr(value, field, max = 200) {
  if (value == null || value === '') return '';
  return str(value, field, 0, max);
}

function num(value, field, min, max, integer = true) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) {
    throw new HttpError(400, `${field} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}`);
  }
  return n;
}

function email(value) {
  const s = str(value, 'Email', 5, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'Enter a valid email address');
  return s;
}

function password(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }
  return value;
}

function oneOf(value, list, field) {
  if (!list.includes(value)) throw new HttpError(400, `${field} must be one of: ${list.join(', ')}`);
  return value;
}

// Only accept images that live in our own uploads folder or the bundled images.
function imageUrl(value, field = 'Image') {
  const s = str(value, field, 1, 300);
  if (!/^(uploads|images)\/[A-Za-z0-9._-]+$/.test(s)) throw new HttpError(400, `${field} must be an uploaded image`);
  return s;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function paginate(list, query, defaultLimit = 12, maxLimit = 100) {
  const limit = Math.min(Math.max(parseInt(query.get('limit'), 10) || defaultLimit, 1), maxLimit);
  const total = list.length;
  const pages = Math.max(Math.ceil(total / limit), 1);
  const page = Math.min(Math.max(parseInt(query.get('page'), 10) || 1, 1), pages);
  return { items: list.slice((page - 1) * limit, page * limit), total, page, pages, limit };
}

// ---------- routes ----------

const routes = [];
const errorLog = [];                 // last unexpected server errors, shown on the admin System page
const stats = { startedAt: Date.now(), requests: 0 };

function route(method, pattern, handler) {
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, name) => {
    names.push(name);
    return '([^/]+)';
  }) + '$');
  routes.push({ method, re, names, handler });
}

// ---------- guards ----------

function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Please log in first');
  return ctx.user;
}

function requireRole(ctx, ...roles) {
  const user = requireUser(ctx);
  if (!roles.includes(user.role)) throw new HttpError(403, 'You do not have access to this');
  return user;
}

// Team roles inside a store and what each may touch. Owners may do everything.
const TEAM_PERMISSIONS = {
  owner: '*',
  manager: ['products', 'inventory', 'orders', 'customers', 'marketing', 'analytics', 'reviews', 'messages'],
  fulfillment: ['orders', 'inventory'],
  support: ['reviews', 'messages', 'customers'],
};

// allowPending: any status may pass (used to show the status page and settings).
// pendingOk: stores waiting for approval may prepare products and stock, but rejected or suspended ones may not.
function requireVendor(ctx, permission, { allowPending = false, pendingOk = false } = {}) {
  const user = requireRole(ctx, 'vendor');
  const vendor = db.vendors.find((v) => v.id === user.vendorId);
  if (!vendor) throw new HttpError(403, 'No store is linked to this account');
  const role = user.staffRole || 'owner';
  const allowed = TEAM_PERMISSIONS[role];
  if (permission && allowed !== '*' && !(allowed || []).includes(permission)) {
    throw new HttpError(403, 'Your team role cannot access this area');
  }
  if (!allowPending && !(pendingOk && vendor.status === 'pending') && vendor.status !== 'approved') {
    throw new HttpError(403, vendor.status === 'pending'
      ? 'Your store is waiting for approval'
      : `Your store is ${vendor.status}`);
  }
  return { user, vendor, role };
}

function audit(ctx, action, detail) {
  db.audit.push({
    at: new Date().toISOString(),
    userId: ctx.user ? ctx.user.id : null,
    who: ctx.user ? ctx.user.email : 'anonymous',
    action,
    detail: detail || '',
    ip: ctx.req && ctx.req.socket ? ctx.req.socket.remoteAddress : '',
  });
  if (db.audit.length > 3000) db.audit.splice(0, db.audit.length - 3000);
  require('./store').saveSoon('audit', 500);
}

module.exports = {
  HttpError, sendJson, readJson, str, optStr, num, email, password, oneOf, imageUrl, slugify, paginate,
  routes, errorLog, stats, route, requireUser, requireRole, requireVendor, TEAM_PERMISSIONS, audit,
};
