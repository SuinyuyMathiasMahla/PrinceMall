'use strict';
// Dispatcher for every /api/* request. Route handlers live in lib/routes/.

const auth = require('./auth');
const { db } = require('./store');
const { HttpError, sendJson, routes, errorLog, stats } = require('./http');

require('./routes/public');
require('./routes/buyer');
require('./routes/vendor');
require('./routes/admin');
require('./routes/admin-ops');

function resolveUser(session) {
  if (!session || !session.userId) return null;
  const user = db.users.find((u) => u.id === session.userId);
  return user && user.status !== 'suspended' ? user : null;
}

async function handleApi(req, res, url) {
  stats.requests += 1;
  const session = auth.getSession(req);
  const ctx = { req, res, url, session, user: resolveUser(session), params: {} };
  try {
    let pathMatched = false;
    for (const r of routes) {
      const match = r.re.exec(url.pathname);
      if (!match) continue;
      pathMatched = true;
      if (r.method !== req.method) continue;
      r.names.forEach((name, i) => {
        try { ctx.params[name] = decodeURIComponent(match[i + 1]); } catch { throw new HttpError(400, 'Bad request'); }
      });
      await r.handler(ctx);
      return;
    }
    throw pathMatched ? new HttpError(405, 'Method not allowed') : new HttpError(404, 'Not found');
  } catch (err) {
    if (res.headersSent) return res.end();
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    console.error(err);
    errorLog.push({ at: new Date().toISOString(), route: `${req.method} ${url.pathname}`, message: String(err && err.message).slice(0, 200) });
    if (errorLog.length > 50) errorLog.shift();
    sendJson(res, 500, { error: 'Something went wrong on the server' });
  }
}

module.exports = { handleApi };
