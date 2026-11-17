'use strict';
// Password hashing and cookie sessions.

const crypto = require('crypto');
const { db, save } = require('./store');

const SESSION_SECONDS = 7 * 24 * 60 * 60; // 7 days
const COOKIE_NAME = 'sid';

// ---------- passwords ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---------- sessions ----------

function readSid(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) {
      const sid = rest.join('=');
      return /^[a-f0-9]{64}$/.test(sid) ? sid : null;
    }
  }
  return null;
}

// Returns { sid, userId } or null.
function getSession(req) {
  const sid = readSid(req);
  if (!sid) return null;
  const session = db.sessions[sid];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    removeSession(sid);
    return null;
  }
  return { sid, userId: session.userId };
}

// userId is null for a guest (someone with a cart who has not logged in).
function createSession(res, userId) {
  const sid = crypto.randomBytes(32).toString('hex');
  db.sessions[sid] = { userId, expiresAt: Date.now() + SESSION_SECONDS * 1000 };
  save('sessions');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`);
  return { sid, userId };
}

function removeSession(sid) {
  delete db.sessions[sid];
  save('sessions');
  if (db.carts['s:' + sid]) {
    delete db.carts['s:' + sid];
    save('carts');
  }
}

function destroySession(req, res) {
  const sid = readSid(req);
  if (sid && db.sessions[sid]) removeSession(sid);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function purgeExpiredSessions() {
  const now = Date.now();
  for (const [sid, session] of Object.entries(db.sessions)) {
    if (session.expiresAt < now) removeSession(sid);
  }
}

// ---------- login throttling (in memory) ----------

const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;
const attempts = new Map(); // key -> { count, lockedUntil }

function isLocked(key) {
  const entry = attempts.get(key);
  return Boolean(entry && entry.lockedUntil > Date.now());
}

function recordFailure(key) {
  const entry = attempts.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.count = 0;
    entry.lockedUntil = Date.now() + LOCK_MS;
  }
  attempts.set(key, entry);
}

function clearFailures(key) {
  attempts.delete(key);
}

module.exports = {
  hashPassword, verifyPassword,
  getSession, createSession, destroySession, removeSession, purgeExpiredSessions,
  isLocked, recordFailure, clearFailures,
};
