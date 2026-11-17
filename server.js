'use strict';
// PrinceMall server. Run with:  node server.js   then open http://localhost:3000
// Uses only Node's built-in modules, so there is nothing to install.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi } = require('./lib/api');
const { purgeExpiredSessions } = require('./lib/auth');
const { seedIfEmpty } = require('./lib/seed');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Scripts only from this site; images may also be data: URLs (previews).
const CSP = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function sendText(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');

  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    return sendText(res, 400, 'Bad request');
  }
  if (relative.includes('\0')) return sendText(res, 400, 'Bad request');
  if (relative.endsWith('/')) relative += 'index.html';

  // Never serve anything outside the public folder.
  const file = path.join(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendText(res, 403, 'Forbidden');

  fs.stat(file, (err, stats) => {
    if (!err && stats.isDirectory()) {
      res.writeHead(301, { Location: pathname + '/' });
      return res.end();
    }
    if (err || !stats.isFile()) return sendText(res, 404, 'Page not found');
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=3600',
    };
    if (ext === '.html') headers['Content-Security-Policy'] = CSP;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) handleApi(req, res, url);
  else serveStatic(req, res, url.pathname);
});

const credentials = seedIfEmpty();
purgeExpiredSessions();
server.listen(PORT, () => {
  console.log(`PrinceMall is running at http://localhost:${PORT}`);
  console.log(`  Shop:   http://localhost:${PORT}/`);
  console.log(`  Vendor: http://localhost:${PORT}/vendor/`);
  console.log(`  Admin:  http://localhost:${PORT}/admin/`);
  if (credentials) {
    console.log('\nDemo data was created. Demo logins (also saved in data/credentials.txt):\n' + credentials);
  }
});
