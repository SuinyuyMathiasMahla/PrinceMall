'use strict';
// PrinceMall UI toolkit shared by the shop, vendor portal and admin panel:
// DOM helper, API client, icons, formatting, router, overlays, forms, tables, charts.

(function () {
  const PM = (window.PM = {});
  PM.currency = 'FCFA';

  // ---------- DOM helper ----------

  PM.h = function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'style') el.style.cssText = value;
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'for') el.htmlFor = value;
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (key in el && key !== 'list') el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
    append(el, children);
    return el;
  };
  const h = PM.h;

  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  PM.append = append;

  PM.debounce = function (fn, ms = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  let uidCount = 0;
  PM.uid = (p = 'id') => `${p}-${++uidCount}`;

  PM.store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
  };

  // ---------- API ----------

  PM.api = async function api(path, options = {}) {
    let res;
    try {
      res = await fetch('/api' + path, {
        method: options.method || 'GET',
        headers: options.body ? { 'Content-Type': 'application/json' } : {},
        body: options.body ? JSON.stringify(options.body) : undefined,
        credentials: 'same-origin',
      });
    } catch {
      throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
    return data;
  };

  PM.qs = function (obj) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null && v !== false) p.set(k, v === true ? '1' : v);
    const s = p.toString();
    return s ? '?' + s : '';
  };

  // ---------- icons (24x24 stroke set) ----------

  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 7H6"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a7 7 0 0 1 4 6"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    package: '<path d="m21 8-9-5-9 5v8l9 5 9-5z"/><path d="m3.3 7.5 8.7 5 8.7-5M12 22V12.5"/>',
    truck: '<path d="M1 4h13v12H1zM14 8h5l4 4v4h-9z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    gift: '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/>',
    home: '<path d="m3 11 9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    store: '<path d="M3 9 5 3h14l2 6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v9h14v-9"/><path d="M10 21v-5h4v5"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
    bars: '<path d="M4 21V10M10 21V3M16 21v-8M22 21H2"/>',
    dollar: '<path d="M12 2v20M17 6.5C16 5 14.3 4.5 12 4.5c-3 0-5 1.3-5 3.5 0 5 10 2.5 10 7.500 0 2.200-2.200 3.500-5 3.500-2.500 0-4.400-.8-5.500-2.500"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.100-1.500 1.700 1.700 0 0 0-1.800.3l-.1.1a2 2 0 1 1-2.800-2.800l.1-.1a1.700 1.700 0 0 0 .3-1.800 1.700 1.700 0 0 0-1.500-1H3a2 2 0 1 1 0-4h.1a1.700 1.700 0 0 0 1.500-1.100 1.700 1.700 0 0 0-.3-1.800l-.1-.1a2 2 0 1 1 2.800-2.800l.1.1a1.700 1.700 0 0 0 1.800.3H9a1.700 1.700 0 0 0 1-1.500V3a2 2 0 1 1 4 0v.1a1.700 1.700 0 0 0 1 1.500 1.700 1.700 0 0 0 1.800-.3l.1-.1a2 2 0 1 1 2.800 2.800l-.1.1a1.700 1.700 0 0 0-.3 1.800V9a1.700 1.700 0 0 0 1.500 1H21a2 2 0 1 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    trending: '<path d="m22 7-8.500 8.500-5-5L2 17"/><path d="M16 7h6v6"/>',
    alert: '<path d="M10.300 3.900 1.800 18a2 2 0 0 0 1.700 3h17a2 2 0 0 0 1.700-3L13.700 3.900a2 2 0 0 0-3.400 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.500 6.200L3 16M3 12A9 9 0 0 1 18.500 5.800L21 8M21 3v5h-5M3 21v-5h5"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.600 13.500 6.800 4M15.400 6.500l-6.800 4"/>',
    play: '<path d="m6 4 14 8-14 8z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="6.500" cy="6.500" r="2.500"/><circle cx="17.500" cy="17.500" r="2.500"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    phone: '<path d="M22 16.900v3a2 2 0 0 1-2.200 2 19.800 19.800 0 0 1-8.600-3.100 19.500 19.500 0 0 1-6-6A19.800 19.800 0 0 1 2.100 4.200 2 2 0 0 1 4.100 2h3a2 2 0 0 1 2 1.700c.1 1 .4 1.900.7 2.800a2 2 0 0 1-.5 2.100L8.100 9.900a16 16 0 0 0 6 6l1.300-1.300a2 2 0 0 1 2.100-.4c.9.300 1.800.6 2.800.7a2 2 0 0 1 1.700 2z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.700l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.700l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.700z"/>',
    headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3zM3 19a2 2 0 0 0 2 2h1v-7H3z"/>',
    watch: '<circle cx="12" cy="12" r="6"/><path d="M12 9v3l1.500 1.500M16.500 17.500 16 22H8l-.5-4.500M7.500 6.500 8 2h8l.5 4.500"/>',
    chef: '<path d="M6 13.800A4 4 0 0 1 7 6a5 5 0 0 1 10 0 4 4 0 0 1 1 7.800V21H6z"/><path d="M6 17h12"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    shirt: '<path d="m16 3 5 3-2.500 4L16 9v12H8V9l-2.500 1L3 6l5-3a4 4 0 0 0 8 0z"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="m15.500 13.500 1.500 8.500-5-3-5 3 1.500-8.500"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.100 9a3 3 0 0 1 5.800 1c0 2-3 3-3 3M12 17h.01"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
    more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.500" cy="8.500" r="1.500"/><path d="m21 15-5-5L5 21"/>',
    receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 2 1V2l-2 1-3-1-3 2-3-2-3 2z"/><path d="M8 8h8M8 12h8"/>',
    wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v14H5a2 2 0 0 1-2-2V5"/><path d="M16 14h.01"/>',
    megaphone: '<path d="m3 11 18-6v14L3 13z"/><path d="M11.600 16.800a3 3 0 1 1-5.800-1.600"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    key: '<circle cx="7.500" cy="15.500" r="4.500"/><path d="m10.700 12.300 9.300-9.300M16 7l3 3"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.700L3 13"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.500 2.500M15.500 15.500 18 18M18 6l-2.500 2.500M8.500 15.500 6 18"/>',
    arrowup: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    arrowdown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    sort: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
  };
  const iconCache = {};
  PM.icon = function icon(name, cls) {
    if (!iconCache[name]) {
      const t = document.createElement('template');
      t.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.info}</svg>`;
      iconCache[name] = t;
    }
    const svg = iconCache[name].content.firstChild.cloneNode(true);
    if (cls) svg.setAttribute('class', 'icon ' + cls);
    return svg;
  };
  PM.iconNames = Object.keys(ICONS);

  // ---------- formatting ----------

  PM.fmt = {
    price: (n) => `${Math.round(Number(n) || 0).toLocaleString('en-US')} ${PM.currency}`,
    num: (n) => (Number(n) || 0).toLocaleString('en-US'),
    compact: (n) => {
      const v = Number(n) || 0;
      const a = Math.abs(v);
      if (a >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
      if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
      if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
      return String(Math.round(v));
    },
    pct: (n, d = 1) => `${(Number(n) || 0).toFixed(d).replace(/\.0+$/, '')}%`,
    date: (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'),
    dateTime: (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'),
    ago(iso) {
      const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
      if (s < 60) return 'just now';
      if (s < 3600) return Math.round(s / 60) + ' min ago';
      if (s < 86400) return Math.round(s / 3600) + ' h ago';
      if (s < 86400 * 30) return Math.round(s / 86400) + ' d ago';
      return PM.fmt.date(iso);
    },
    initials: (name) => String(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
    label: (s) => String(s || '').replace(/_/g, ' ').replace(/\bid\b/g, 'ID').replace(/^./, (c) => c.toUpperCase()),
  };

  const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"><rect width="200" height="160" fill="#e8eaf4"/><path d="M60 110l30-36 22 26 16-18 24 28z" fill="#c9cde0"/><circle cx="76" cy="56" r="10" fill="#c9cde0"/></svg>');
  PM.asset = (u) => (!u ? PLACEHOLDER : /^(https?:|data:|blob:|\/)/.test(u) ? u : '/' + u);
  PM.img = function (src, alt, props) {
    const el = h('img', { src: PM.asset(src), alt: alt || '', loading: 'lazy', decoding: 'async', ...props });
    el.addEventListener('error', () => { if (el.src !== PLACEHOLDER) el.src = PLACEHOLDER; }, { once: true });
    return el;
  };

  // ---------- status badges ----------

  const TONES = {
    placed: 'info', processing: 'warning', shipped: 'brand', delivered: 'success', cancelled: 'danger',
    paid: 'success', pending: 'warning', refunded: 'neutral', open: 'warning', resolved: 'success', closed: 'neutral',
    approved: 'success', rejected: 'danger', suspended: 'danger', active: 'success', draft: 'neutral', archived: 'neutral',
    blocked: 'danger', requested: 'warning', vip: 'accent', returning: 'brand', new: 'info', at_risk: 'danger',
    owner: 'brand', manager: 'info', fulfillment: 'warning', support: 'success', admin: 'brand', vendor: 'info', buyer: 'neutral',
    low: 'warning', normal: 'neutral', high: 'danger', received: 'success', refund_due: 'danger',
  };
  // Payment badges use plainer words than parcel statuses: "pending" really means "nobody has confirmed the money yet".
  const PAY = { pending: ['Payment pending', 'warning'], paid: ['Paid', 'success'], refund_due: ['Refund due', 'danger'], refunded: ['Refunded', 'neutral'] };
  PM.payStatus = (s) => PM.badge((PAY[s] || [PM.fmt.label(s)])[0], (PAY[s] || [])[1] || 'neutral');
  PM.badge = (text, tone) => h('span', { class: 'badge' + (tone && tone !== 'neutral' ? ' badge-' + tone : '') }, text);
  PM.status = (s) => PM.badge(PM.fmt.label(s), TONES[s] || 'neutral');

  PM.stars = function (rating, count) {
    const wrap = h('span', { class: 'stars', role: 'img', 'aria-label': `Rated ${rating} out of 5` });
    for (let i = 1; i <= 5; i++) {
      const icon = PM.icon('star', 'filled' + (rating >= i - 0.25 ? '' : ' off'));
      wrap.append(icon);
    }
    const out = h('span', { class: 'row-nowrap', style: 'gap:2px;display:inline-flex' }, wrap);
    if (count != null) out.append(h('span', { class: 'rating-count' }, `(${count})`));
    return out;
  };

  // ---------- theme ----------

  PM.theme = {
    get: () => document.documentElement.getAttribute('data-theme') || 'light',
    set(t) {
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('pm-theme', t); } catch { /* ignore */ }
      document.dispatchEvent(new CustomEvent('themechange'));
    },
    toggleButton() {
      const btn = h('button', { class: 'btn btn-ghost btn-icon', type: 'button' });
      const sync = () => {
        const dark = PM.theme.get() === 'dark';
        btn.replaceChildren(PM.icon(dark ? 'sun' : 'moon'));
        btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
        btn.title = btn.getAttribute('aria-label');
      };
      btn.addEventListener('click', () => { PM.theme.set(PM.theme.get() === 'dark' ? 'light' : 'dark'); sync(); });
      sync();
      return btn;
    },
  };

  // ---------- toast ----------

  PM.toast = function (message, kind = 'success') {
    let box = document.querySelector('.toasts');
    if (!box) {
      box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.append(box);
    }
    const t = h('div', { class: 'toast ' + kind }, PM.icon(kind === 'error' ? 'alert' : 'check'), h('span', null, message));
    box.append(t);
    setTimeout(() => t.remove(), kind === 'error' ? 5000 : 3000);
  };

  // ---------- overlays ----------

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function openLayer(panel, { className = '', onClose, label } = {}) {
    const previous = document.activeElement;
    const backdrop = h('div', { class: 'backdrop ' + className }, panel);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (label) panel.setAttribute('aria-label', label);
    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      if (!document.querySelector('.backdrop')) document.body.style.overflow = '';
      if (previous && previous.focus) previous.focus();
      if (onClose) onClose(result);
    };
    function onKey(e) {
      if (!backdrop.parentNode || backdrop !== [...document.querySelectorAll('.backdrop')].pop()) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        const items = [...panel.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(backdrop);
    document.body.style.overflow = 'hidden';
    const auto = panel.querySelector('[autofocus]') || panel.querySelector('input, select, textarea') || panel.querySelector(FOCUSABLE);
    if (auto) setTimeout(() => auto.focus(), 30);
    return { close, el: panel, backdrop };
  }

  // actions: [{label, kind, onClick(close) -> may return false to stay open}]
  PM.modal = function ({ title, content, actions = [], size = '', onClose }) {
    const titleId = PM.uid('modal-title');
    let layer;
    const head = h('div', { class: 'modal-head' }, h('h2', { id: titleId }, title),
      h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': 'Close', onclick: () => layer.close() }, PM.icon('x')));
    const foot = actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', {
      class: 'btn ' + (a.kind ? 'btn-' + a.kind : ''), type: 'button',
      onclick: async (e) => {
        if (!a.onClick) return layer.close();
        const btn = e.currentTarget;
        btn.setAttribute('aria-busy', 'true');
        try { if ((await a.onClick(layer.close)) !== false) layer.close(); } finally { btn.removeAttribute('aria-busy'); }
      },
    }, a.label))) : null;
    const panel = h('div', { class: 'modal ' + size, 'aria-labelledby': titleId }, head, h('div', { class: 'modal-body' }, content), foot);
    layer = openLayer(panel, { onClose });
    return layer;
  };

  PM.confirm = function ({ title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      let answered = false;
      PM.modal({
        title, content: h('p', { class: 'mb-0' }, message),
        actions: [
          { label: 'Cancel' },
          { label: confirmLabel, kind: danger ? 'danger solid' : 'primary', onClick: () => { answered = true; resolve(true); } },
        ],
        onClose: () => { if (!answered) resolve(false); },
      });
    });
  };

  PM.drawer = function ({ title, content, footer, side = 'right', onClose }) {
    let layer;
    const head = h('div', { class: 'modal-head' }, h('h2', null, title),
      h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': 'Close', onclick: () => layer.close() }, PM.icon('x')));
    const panel = h('div', { class: 'drawer' }, head, h('div', { class: 'modal-body' }, content), footer ? h('div', { class: 'modal-foot', style: 'justify-content:stretch' }, footer) : null);
    layer = openLayer(panel, { className: 'side' + (side === 'left' ? ' side-left' : ''), onClose, label: title });
    return layer;
  };

  // Small floating menu anchored to a button.
  PM.popover = function (anchor, content, { align = 'right' } = {}) {
    const rect = anchor.getBoundingClientRect();
    const pop = h('div', { class: 'popover', role: 'menu' }, content);
    pop.style.top = window.scrollY + rect.bottom + 6 + 'px';
    document.body.append(pop);
    const w = pop.offsetWidth;
    const left = align === 'right' ? rect.right - w : rect.left;
    pop.style.left = Math.max(8, Math.min(window.scrollX + left, window.innerWidth - w - 8)) + 'px';
    const close = () => { pop.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', key, true); anchor.setAttribute('aria-expanded', 'false'); };
    const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') { close(); anchor.focus(); } };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', key, true);
    pop.addEventListener('click', (e) => { if (e.target.closest('a, button')) setTimeout(close, 0); });
    anchor.setAttribute('aria-expanded', 'true');
    const first = pop.querySelector(FOCUSABLE);
    if (first) first.focus();
    return { close };
  };

  // ---------- states ----------

  PM.empty = function ({ icon = 'package', title, text, action }) {
    return h('div', { class: 'state' },
      h('div', { class: 'state-icon' }, PM.icon(icon)), h('h3', null, title), text ? h('p', null, text) : null, action || null);
  };

  PM.errorState = function (err, retry) {
    return h('div', { class: 'state error', role: 'alert' },
      h('div', { class: 'state-icon' }, PM.icon('alert')), h('h3', null, 'Something went wrong'), h('p', null, err.message || 'Please try again.'),
      retry ? h('button', { class: 'btn', type: 'button', onclick: retry }, PM.icon('refresh'), 'Try again') : null);
  };

  PM.skeleton = function (kind = 'page') {
    const sk = (w, hgt) => h('div', { class: 'skeleton', style: `width:${w};height:${hgt}` });
    if (kind === 'grid') {
      return h('div', { class: 'grid grid-products', 'aria-busy': 'true', 'aria-label': 'Loading' },
        Array.from({ length: 8 }, () => h('div', { class: 'card' }, sk('100%', '160px'), h('div', { style: 'padding:12px;display:grid;gap:8px' }, sk('80%', '14px'), sk('50%', '14px'), sk('100%', '34px')))));
    }
    return h('div', { class: 'stack', 'aria-busy': 'true', 'aria-label': 'Loading' }, sk('40%', '28px'), sk('100%', '120px'), sk('100%', '220px'));
  };

  PM.busy = async function (button, fn) {
    button.setAttribute('aria-busy', 'true');
    try { return await fn(); } finally { button.removeAttribute('aria-busy'); }
  };

  // ---------- forms ----------

  PM.field = function (label, control, { hint, required, error } = {}) {
    if (!control.id) control.id = PM.uid('f');
    const hintEl = hint ? h('div', { class: 'hint', id: control.id + '-hint' }, hint) : null;
    if (hintEl) control.setAttribute('aria-describedby', hintEl.id);
    if (required) control.required = true;
    return h('div', { class: 'field' },
      h('label', { class: 'label', for: control.id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
      control, hintEl, error ? h('div', { class: 'field-error' }, error) : null);
  };
  PM.input = (props) => h('input', { class: 'input', ...props });
  PM.textarea = (props) => h('textarea', { class: 'textarea', ...props });
  PM.select = function (options, value, props) {
    const sel = h('select', { class: 'select', ...props });
    for (const o of options) {
      const opt = typeof o === 'string' ? { value: o, label: o } : o;
      sel.append(h('option', { value: opt.value, selected: String(opt.value) === String(value) }, opt.label));
    }
    return sel;
  };
  PM.switch = (props) => h('label', { class: 'switch' }, h('input', { type: 'checkbox', role: 'switch', ...props }), h('span'));
  PM.check = (label, props) => h('label', { class: 'check' }, h('input', { type: 'checkbox', ...props }), label);
  PM.alert = (kind, text) => h('div', { class: 'alert alert-' + kind, role: kind === 'error' ? 'alert' : 'status' }, PM.icon(kind === 'error' || kind === 'warning' ? 'alert' : kind === 'success' ? 'check' : 'info'), h('div', null, text));

  // An error box you can show and hide above a form.
  PM.errorBox = function () {
    const el = h('div', { class: 'alert alert-error', role: 'alert', hidden: true });
    el.show = (msg) => { el.textContent = msg; el.hidden = false; el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    el.clear = () => { el.hidden = true; };
    return el;
  };

  // ---------- image upload ----------

  function resizeToDataUrl(file, maxSide = 1400) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return reject(new Error('Choose a JPG, PNG, GIF or WebP image'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image')); };
      img.src = url;
    });
  }

  PM.uploadImage = async function (file) {
    const dataUrl = await resizeToDataUrl(file);
    return (await PM.api('/upload', { method: 'POST', body: { dataUrl } })).url;
  };

  // A row of image tiles with an "add" button. Returns an element with .values().
  PM.imagePicker = function ({ values = [], max = 8, onChange } = {}) {
    let urls = [...values];
    const wrap = h('div', { class: 'upload-grid' });
    const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: max > 1, class: 'sr-only', tabindex: -1 });
    const render = () => {
      wrap.replaceChildren(...urls.map((u, i) => h('div', { class: 'upload-tile' }, PM.img(u, `Image ${i + 1}`),
        h('button', { type: 'button', 'aria-label': `Remove image ${i + 1}`, onclick: () => { urls.splice(i, 1); render(); if (onChange) onChange(urls); } }, PM.icon('x')))));
      if (urls.length < max) wrap.append(h('button', { class: 'upload-add', type: 'button', onclick: () => input.click() }, PM.icon('upload'), 'Add image'));
      wrap.append(input);
    };
    input.addEventListener('change', async () => {
      for (const file of [...input.files].slice(0, max - urls.length)) {
        try { urls.push(await PM.uploadImage(file)); } catch (e) { PM.toast(e.message, 'error'); }
      }
      input.value = '';
      render();
      if (onChange) onChange(urls);
    });
    render();
    wrap.values = () => [...urls];
    return wrap;
  };

  PM.downloadCsv = function (filename, rows) {
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a);
    a.click();
    a.remove();
  };

  // ---------- tabs, accordion, breadcrumbs, pagination ----------

  PM.tabs = function (items, active, onChange) {
    const list = h('div', { class: 'tabs', role: 'tablist' });
    const draw = (current) => {
      list.replaceChildren(...items.map((t) => h('button', {
        class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(t.id === current), tabindex: t.id === current ? 0 : -1,
        onclick: () => { draw(t.id); onChange(t.id); },
        onkeydown: (e) => {
          const i = items.findIndex((x) => x.id === current);
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
            draw(next.id); onChange(next.id); list.querySelector('[aria-selected="true"]').focus();
          }
        },
      }, t.label, t.count != null ? h('span', { class: 'count' }, PM.fmt.num(t.count)) : null)));
    };
    draw(active);
    return list;
  };

  PM.accordion = (items) => h('div', { class: 'accordion' }, items.map((i) => h('details', null, h('summary', null, i.title), h('div', { class: 'acc-body' }, i.body))));

  PM.breadcrumbs = (items) => h('nav', { 'aria-label': 'Breadcrumb' }, h('ol', { class: 'breadcrumbs' }, items.map((it, i) =>
    h('li', i === items.length - 1 ? { 'aria-current': 'page' } : null, it.href ? h('a', { href: it.href }, it.label) : it.label))));

  PM.pagination = function ({ page, pages, onChange }) {
    if (pages <= 1) return h('span');
    const nums = new Set([1, pages, page, page - 1, page + 1, page - 2, page + 2].filter((n) => n >= 1 && n <= pages));
    const sorted = [...nums].sort((a, b) => a - b);
    const nav = h('nav', { class: 'pagination', 'aria-label': 'Pagination' });
    const btn = (label, n, props = {}) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => onChange(n), ...props }, label);
    nav.append(btn(PM.icon('chevron-left'), page - 1, { disabled: page <= 1, 'aria-label': 'Previous page' }));
    let prev = 0;
    for (const n of sorted) {
      if (n - prev > 1) nav.append(h('span', { class: 'muted', style: 'align-self:center' }, '…'));
      nav.append(btn(String(n), n, n === page ? { 'aria-current': 'page' } : { 'aria-label': `Page ${n}` }));
      prev = n;
    }
    nav.append(btn(PM.icon('chevron-right'), page + 1, { disabled: page >= pages, 'aria-label': 'Next page' }));
    return nav;
  };

  // ---------- data table ----------

  PM.table = function ({ columns, rows = [], selectable = false, empty, rowKey = 'id', onSelect }) {
    let data = rows;
    let sortKey = null;
    let sortDir = 1;
    const selected = new Set();
    const wrap = h('div', { class: 'table-wrap' });
    const draw = () => {
      let list = data;
      if (sortKey) {
        const col = columns.find((c) => c.key === sortKey);
        const get = col.sortValue || ((r) => r[sortKey]);
        list = [...data].sort((a, b) => { const x = get(a); const y = get(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
      }
      if (!list.length) { wrap.replaceChildren(empty || PM.empty({ icon: 'file', title: 'Nothing here yet' })); return; }
      const allChecked = list.length && list.every((r) => selected.has(r[rowKey]));
      const head = h('tr', null,
        selectable ? h('th', { style: 'width:40px' }, h('input', { type: 'checkbox', 'aria-label': 'Select all rows', checked: allChecked,
          onchange: (e) => { list.forEach((r) => (e.target.checked ? selected.add(r[rowKey]) : selected.delete(r[rowKey]))); if (onSelect) onSelect([...selected]); draw(); } })) : null,
        columns.map((c) => h('th', { class: c.align === 'r' ? 'ta-r' : c.align === 'c' ? 'ta-c' : '', 'aria-sort': sortKey === c.key ? (sortDir === 1 ? 'ascending' : 'descending') : null },
          c.sortable ? h('button', { type: 'button', onclick: () => { if (sortKey === c.key) sortDir *= -1; else { sortKey = c.key; sortDir = 1; } draw(); } }, c.label, PM.icon('sort')) : c.label)));
      const body = list.map((r, i) => h('tr', null,
        selectable ? h('td', null, h('input', { type: 'checkbox', 'aria-label': 'Select row', checked: selected.has(r[rowKey]),
          onchange: (e) => { if (e.target.checked) selected.add(r[rowKey]); else selected.delete(r[rowKey]); if (onSelect) onSelect([...selected]); draw(); } })) : null,
        columns.map((c) => h('td', { class: (c.align === 'r' ? 'ta-r ' : c.align === 'c' ? 'ta-c ' : '') + (c.cls || '') }, c.render ? c.render(r, i) : r[c.key]))));
      wrap.replaceChildren(h('table', { class: 'table' }, h('thead', null, head), h('tbody', null, body)));
    };
    draw();
    return {
      el: wrap,
      update(next) { data = next; for (const k of [...selected]) if (!next.some((r) => r[rowKey] === k)) selected.delete(k); draw(); if (onSelect) onSelect([...selected]); },
      selected: () => [...selected],
      clear() { selected.clear(); draw(); if (onSelect) onSelect([]); },
    };
  };

  // ---------- KPI card ----------

  PM.kpi = function ({ label, value, change, icon = 'chart', spark, invert = false, note }) {
    const dir = change == null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    const good = dir === 'flat' ? 'flat' : (dir === 'up') !== invert ? 'up' : 'down';
    const el = h('div', { class: 'card kpi' },
      h('div', { class: 'kpi-label' }, h('span', { class: 'kpi-ico' }, PM.icon(icon)), label),
      h('div', { class: 'kpi-value' }, value),
      dir ? h('div', { class: 'kpi-delta ' + good }, PM.icon(dir === 'down' ? 'arrowdown' : 'arrowup'), `${Math.abs(change)}%`, h('span', { class: 'muted', style: 'font-weight:500' }, ' vs previous')) : (note ? h('div', { class: 'xs muted' }, note) : null));
    if (spark && spark.length > 1) el.append(h('div', { class: 'spark' }, PM.charts.spark(spark)));
    return el;
  };

  // ---------- charts (inline SVG, theme aware) ----------

  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
  const niceMax = (max) => {
    if (max <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  };

  function a11yTable(labels, series, fmt) {
    return h('table', { class: 'sr-only' }, h('caption', null, 'Chart data'),
      h('thead', null, h('tr', null, h('th', null, 'Period'), series.map((s) => h('th', null, s.name)))),
      h('tbody', null, labels.map((l, i) => h('tr', null, h('td', null, l), series.map((s) => h('td', null, fmt(s.values[i])))))));
  }

  function attachTip(wrap, plot, labels, series, fmt, geom, onMove, onLeave) {
    const tip = h('div', { class: 'chart-tip', hidden: true });
    wrap.append(tip);
    plot.addEventListener('pointermove', (e) => {
      const box = plot.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * geom.W;
      const i = Math.max(0, Math.min(labels.length - 1, Math.round((x - geom.l) / geom.step - geom.offset)));
      tip.hidden = false;
      tip.replaceChildren(h('strong', null, labels[i]), ...series.map((s) => h('div', null, h('i', { style: `display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${s.color}` }), `${s.name}: ${fmt(s.values[i])}`)));
      const px = ((geom.l + geom.step * (i + geom.offset)) / geom.W) * box.width;
      tip.style.left = Math.max(60, Math.min(px, box.width - 60)) + 'px';
      tip.style.top = '24px';
      if (onMove) onMove(i);
    });
    plot.addEventListener('pointerleave', () => { tip.hidden = true; if (onLeave) onLeave(); });
  }

  function axes(root, W, H, l, r, t, b, max, fmtAxis, ticks = 4) {
    for (let i = 0; i <= ticks; i++) {
      const y = t + ((H - t - b) * i) / ticks;
      root.append(svg('line', { x1: l, x2: W - r, y1: y, y2: y, class: 'grid-line' }));
      const lab = svg('text', { x: l - 8, y: y + 4, 'text-anchor': 'end' });
      lab.textContent = fmtAxis(max - (max * i) / ticks);
      root.append(lab);
    }
  }

  PM.charts = {
    line({ labels, series, height = 240, fmt = PM.fmt.num, fmtAxis = PM.fmt.compact, area = true }) {
      const W = 720; const H = height; const l = 46; const r = 14; const t = 12; const b = 28;
      series = series.map((s, i) => ({ ...s, color: s.color || COLORS[i % COLORS.length] }));
      const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
      const step = labels.length > 1 ? (W - l - r) / (labels.length - 1) : 0;
      const X = (i) => l + step * i;
      const Y = (v) => t + (H - t - b) * (1 - v / max);
      const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Line chart of ${series.map((s) => s.name).join(', ')} over ${labels.length} periods` });
      const gid = PM.uid('g');
      const defs = svg('defs');
      series.forEach((s, i) => {
        const g = svg('linearGradient', { id: gid + i, x1: 0, x2: 0, y1: 0, y2: 1 });
        g.append(svg('stop', { offset: '0%', style: `stop-color:${s.color};stop-opacity:.28` }), svg('stop', { offset: '100%', style: `stop-color:${s.color};stop-opacity:0` }));
        defs.append(g);
      });
      root.append(defs);
      axes(root, W, H, l, r, t, b, max, fmtAxis);
      const every = Math.max(1, Math.ceil(labels.length / 7));
      labels.forEach((lab, i) => { if (i % every === 0 || i === labels.length - 1) { const tx = svg('text', { x: X(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle' }); tx.textContent = lab; root.append(tx); } });
      series.forEach((s, si) => {
        const pts = s.values.map((v, i) => [X(i), Y(v)]);
        if (!pts.length) return;
        const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
        if (area && si === 0) root.append(svg('path', { d: `${d} L${X(pts.length - 1)} ${H - b} L${X(0)} ${H - b} Z`, fill: `url(#${gid}${si})` }));
        root.append(svg('path', { d, fill: 'none', style: `stroke:${s.color}`, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      });
      const cursor = svg('line', { y1: t, y2: H - b, style: 'stroke:var(--border-strong)', 'stroke-dasharray': '3 3', visibility: 'hidden' });
      root.append(cursor);
      const dots = series.map((s) => { const c = svg('circle', { r: 4.5, style: `fill:var(--surface);stroke:${s.color}`, 'stroke-width': 2.4, visibility: 'hidden' }); root.append(c); return c; });
      const plot = svg('rect', { x: l, y: t, width: W - l - r, height: H - t - b, fill: 'transparent' });
      root.append(plot);
      const wrap = h('div', { class: 'chart' }, root, a11yTable(labels, series, fmt));
      attachTip(wrap, plot, labels, series, fmt, { W, l, step, offset: 0 }, (i) => {
        cursor.setAttribute('x1', X(i)); cursor.setAttribute('x2', X(i)); cursor.setAttribute('visibility', 'visible');
        dots.forEach((d, si) => { d.setAttribute('cx', X(i)); d.setAttribute('cy', Y(series[si].values[i])); d.setAttribute('visibility', 'visible'); });
      }, () => { cursor.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); });
      if (series.length > 1) wrap.append(PM.charts.legend(series));
      return wrap;
    },

    bar({ labels, series, height = 240, fmt = PM.fmt.num, fmtAxis = PM.fmt.compact }) {
      const W = 720; const H = height; const l = 46; const r = 14; const t = 12; const b = 28;
      series = series.map((s, i) => ({ ...s, color: s.color || COLORS[i % COLORS.length] }));
      const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
      const slot = (W - l - r) / labels.length;
      const bw = Math.min(46, (slot * 0.72) / series.length);
      const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Bar chart of ${series.map((s) => s.name).join(', ')}` });
      axes(root, W, H, l, r, t, b, max, fmtAxis);
      const every = Math.max(1, Math.ceil(labels.length / 8));
      labels.forEach((lab, i) => {
        if (i % every === 0) { const tx = svg('text', { x: l + slot * (i + 0.5), y: H - 8, 'text-anchor': 'middle' }); tx.textContent = lab; root.append(tx); }
        series.forEach((s, si) => {
          const v = s.values[i] || 0;
          const bh = (H - t - b) * (v / max);
          const x = l + slot * (i + 0.5) - (bw * series.length) / 2 + bw * si;
          const rect = svg('rect', { x, y: H - b - bh, width: Math.max(bw - 2, 1), height: Math.max(bh, 0), rx: 4, style: `fill:${s.color}` });
          rect.append(Object.assign(svg('title'), { textContent: `${lab} - ${s.name}: ${fmt(v)}` }));
          root.append(rect);
        });
      });
      const wrap = h('div', { class: 'chart' }, root, a11yTable(labels, series, fmt));
      if (series.length > 1) wrap.append(PM.charts.legend(series));
      return wrap;
    },

    donut({ items, size = 180, fmt = PM.fmt.num, centerLabel = 'Total' }) {
      const total = items.reduce((s, i) => s + i.value, 0);
      const R = 70; const C = 2 * Math.PI * R;
      const root = svg('svg', { viewBox: '0 0 200 200', width: size, height: size, role: 'img', 'aria-label': `Donut chart: ${items.map((i) => `${i.label} ${fmt(i.value)}`).join(', ')}`, style: 'max-width:100%' });
      root.append(svg('circle', { cx: 100, cy: 100, r: R, fill: 'none', style: 'stroke:var(--surface-3)', 'stroke-width': 26 }));
      let offset = 0;
      items.forEach((it, i) => {
        const len = total ? (it.value / total) * C : 0;
        const c = svg('circle', { cx: 100, cy: 100, r: R, fill: 'none', style: `stroke:${COLORS[i % COLORS.length]}`, 'stroke-width': 26, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 100 100)' });
        c.append(Object.assign(svg('title'), { textContent: `${it.label}: ${fmt(it.value)} (${total ? Math.round((it.value / total) * 100) : 0}%)` }));
        root.append(c);
        offset += len;
      });
      const t1 = svg('text', { x: 100, y: 98, 'text-anchor': 'middle', style: 'fill:var(--text);font-size:20px;font-weight:800' }); t1.textContent = PM.fmt.compact(total);
      const t2 = svg('text', { x: 100, y: 116, 'text-anchor': 'middle', style: 'fill:var(--text-3);font-size:11px' }); t2.textContent = centerLabel;
      root.append(t1, t2);
      const legend = h('ul', { class: 'legend', style: 'flex-direction:column;list-style:none;padding:0;margin:0;gap:6px' }, items.map((it, i) =>
        h('li', null, h('i', { style: `background:${COLORS[i % COLORS.length]}` }), `${it.label} `, h('strong', null, total ? Math.round((it.value / total) * 100) + '%' : '0%'))));
      return h('div', { class: 'row', style: 'gap:24px;justify-content:center' }, h('div', { class: 'chart', style: `width:${size}px;max-width:100%` }, root), legend);
    },

    hbar(items, { fmt = PM.fmt.num } = {}) {
      const max = Math.max(1, ...items.map((i) => i.value));
      return h('div', null, items.map((it) => h('div', { class: 'hbar' }, h('span', { class: 'truncate', title: it.label }, it.label),
        h('div', { class: 'track', role: 'img', 'aria-label': `${it.label}: ${fmt(it.value)}` }, h('span', { style: `width:${(it.value / max) * 100}%` })), h('span', { class: 'num bold' }, fmt(it.value)))));
    },

    spark(values, color = 'var(--chart-1)') {
      const W = 100; const H = 40;
      const max = Math.max(...values); const min = Math.min(...values);
      const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 4 - ((v - min) / (max - min || 1)) * (H - 8)}`);
      const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', style: 'width:100%;height:100%' });
      root.append(svg('polyline', { points: pts.join(' '), fill: 'none', style: `stroke:${color}`, 'stroke-width': 2, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
      return root;
    },

    legend: (series) => h('div', { class: 'legend' }, series.map((s) => h('span', null, h('i', { style: `background:${s.color}` }), s.name))),
  };

  // ---------- countdown ----------

  PM.countdown = function (iso) {
    const el = h('span', { class: 'countdown', role: 'timer' });
    const tick = () => {
      if (!el.isConnected && el.dataset.started) return clearInterval(timer);
      el.dataset.started = '1';
      const s = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
      const d = Math.floor(s / 86400); const hh = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60;
      const pad = (n) => String(n).padStart(2, '0');
      el.replaceChildren(...(d ? [h('span', null, d + 'd')] : []), h('span', null, pad(hh) + 'h'), h('span', null, pad(m) + 'm'), h('span', null, pad(ss) + 's'));
    };
    const timer = setInterval(tick, 1000);
    tick();
    return el;
  };

  // ---------- router ----------

  PM.createRouter = function ({ outlet, onError, onAfter, titleSuffix = '' }) {
    const routes = [];
    let token = 0;
    const live = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
    document.body.append(live);

    const router = {
      add(pattern, handler) {
        const names = [];
        const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
        routes.push({ re, names, handler });
        return router;
      },
      parse() {
        const raw = location.hash.slice(1) || '/';
        const [path, qs] = raw.split('?');
        return { path: path || '/', query: new URLSearchParams(qs || '') };
      },
      go(path) { if (location.hash === '#' + path) router.render(); else location.hash = path; },
      async render() {
        const my = ++token;
        const { path, query } = router.parse();
        let found = null;
        for (const r of routes) {
          const m = r.re.exec(path);
          if (m) { found = { r, params: Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) }; break; }
        }
        const ctx = { path, query, params: found ? found.params : {}, title: (t) => { document.title = t ? `${t}${titleSuffix}` : titleSuffix.replace(/^ [-|] /, ''); } };
        outlet.setAttribute('aria-busy', 'true');
        outlet.replaceChildren(PM.skeleton());
        let node;
        try {
          if (!found) node = PM.empty({ icon: 'search', title: 'Page not found', text: 'The page you are looking for does not exist.', action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Go home') });
          else node = await found.r.handler(ctx);
        } catch (err) {
          if (my !== token) return;
          node = (onError && onError(err, ctx, router)) || PM.errorState(err, () => router.render());
        }
        if (my !== token) return;
        outlet.removeAttribute('aria-busy');
        if (node === null || node === undefined) return; // handler redirected
        outlet.replaceChildren(node);
        if (!ctx.keepScroll) window.scrollTo(0, 0);
        const heading = outlet.querySelector('h1');
        if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); live.textContent = heading.textContent; }
        if (onAfter) onAfter(ctx);
      },
      start() { window.addEventListener('hashchange', onHash); router.render(); },
      stop() { window.removeEventListener('hashchange', onHash); token += 1; },
    };
    const onHash = () => router.render();
    return router;
  };

  PM.link = (href, label, props) => h('a', { href, ...props }, label);
})();
