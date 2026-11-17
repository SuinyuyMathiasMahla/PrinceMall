'use strict';
// Seller portal: boot, login, store registration, approval status and dashboard.

(function () {
  const { h, api, icon, fmt } = PM;
  const V = (window.V = { me: null, info: null, routes: [] });

  V.can = (perm) => {
    const p = V.info && V.info.permissions;
    if (!p) return false;
    if (p.includes('*')) return true;
    return perm !== 'owner' && p.includes(perm);
  };
  V.isOwner = () => Boolean(V.info && V.info.permissions.includes('*'));

  const NAV = [
    { key: 'dashboard', label: 'Dashboard', icon: 'home', path: '/' },
    { group: 'Catalog' },
    { key: 'products', label: 'Products', icon: 'package', path: '/products', perm: 'products' },
    { key: 'inventory', label: 'Inventory', icon: 'layers', path: '/inventory', perm: 'inventory' },
    { group: 'Sales' },
    { key: 'orders', label: 'Orders', icon: 'truck', path: '/orders', perm: 'orders' },
    { key: 'customers', label: 'Customers', icon: 'users', path: '/customers', perm: 'customers' },
    { key: 'marketing', label: 'Marketing', icon: 'megaphone', path: '/marketing', perm: 'marketing' },
    { group: 'Insights' },
    { key: 'analytics', label: 'Analytics', icon: 'chart', path: '/analytics', perm: 'analytics' },
    { key: 'finance', label: 'Finance', icon: 'wallet', path: '/finance', perm: 'owner' },
    { key: 'reviews', label: 'Reviews', icon: 'star', path: '/reviews', perm: 'reviews' },
    { key: 'messages', label: 'Messages', icon: 'message', path: '/messages', perm: 'messages' },
    { group: 'Store' },
    { key: 'team', label: 'Team', icon: 'users', path: '/team', perm: 'owner' },
    { key: 'settings', label: 'Settings', icon: 'settings', path: '/settings', perm: 'owner' },
  ];

  V.page = (path, perm, fn) => V.routes.push({ path, perm, fn });

  V.logout = async () => { await api('/auth/logout', { method: 'POST' }); V.me = null; V.info = null; location.hash = '#/'; V.boot(); };

  V.boot = async function () {
    const app = document.getElementById('app');
    if (V.router) { V.router.stop(); V.router = null; }
    let me;
    try { me = await api('/auth/me'); } catch (e) { app.replaceChildren(PM.errorState(e, () => location.reload())); return; }
    if (me.site) PM.currency = me.site.currency;
    V.me = me.user;

    const isRegister = location.hash.startsWith('#/register');
    if (!V.me || V.me.role !== 'vendor') {
      if (isRegister) { app.replaceChildren(registerView()); return; }
      if (V.me) {
        // Signed in, but not as a seller (a buyer or an admin): explain and offer the right next step.
        const isBuyer = V.me.role === 'buyer';
        app.replaceChildren(h('div', { class: 'login-shell' }, h('div', { class: 'card card-pad stack', style: 'width:100%;max-width:480px' },
          h('div', { class: 'center' }, h('span', { class: 'logo-mark', style: 'margin:0 auto 12px;width:44px;height:44px;font-size:20px' }, 'P'), h('h1', { style: 'margin:0' }, isBuyer ? 'Open your own store' : 'This is the seller area')),
          h('p', { class: 'text-2 center mb-0' }, isBuyer ? `You are signed in as ${V.me.email}, which is a shopping account. Turn it into a seller account to add products, manage stock and receive orders.` : `You are signed in as ${V.me.email} (${V.me.role}).`),
          isBuyer ? h('a', { class: 'btn btn-primary btn-lg btn-block', href: '#/register', onclick: () => setTimeout(V.boot, 0) }, icon('store'), 'Open a store with this account') : h('a', { class: 'btn btn-primary btn-lg btn-block', href: '/admin/' }, 'Go to the admin panel'),
          h('button', { class: 'btn btn-block', type: 'button', onclick: V.logout }, 'Log in with a different account'),
          h('a', { class: 'btn btn-ghost btn-block', href: '/' }, 'Back to the shop'))));
        return;
      }
      app.replaceChildren(PM.dash.login({
        title: 'Seller portal', subtitle: 'Manage your store on PrinceMall', roles: ['vendor'],
        onSuccess: () => { location.hash = '#/'; V.boot(); },
        footer: h('p', { class: 'center small mt-2 mb-0' }, 'New seller? ', h('a', { href: '#/register', onclick: () => setTimeout(V.boot, 0) }, 'Open your store')),
      }));
      return;
    }
    if (isRegister) location.hash = '#/';
    V.info = await api('/vendor/me');
    const v = V.info.vendor;

    if (v.status !== 'approved') {
      // Waiting for approval: the owner can already prepare products and stock (they go live on approval).
      // Rejected or suspended stores only get the status page and settings.
      const prep = v.status === 'pending';
      const prepPaths = prep ? ['/products', '/products/new', '/products/:id', '/inventory'] : [];
      const nav = [{ key: 'dashboard', label: 'Status', icon: 'shield', path: '/' },
        ...(prep && V.can('products') ? [{ key: 'products', label: 'Products', icon: 'package', path: '/products' }] : []),
        ...(prep && V.can('inventory') ? [{ key: 'inventory', label: 'Inventory', icon: 'layers', path: '/inventory' }] : []),
        ...(V.isOwner() ? [{ key: 'settings', label: 'Settings', icon: 'settings', path: '/settings' }] : [])];
      const shell = PM.dash.shell({ appName: v.storeName, nav, user: V.me, onLogout: V.logout });
      V.shell = shell;
      app.replaceChildren(shell.el);
      const router = PM.createRouter({ outlet: shell.outlet, titleSuffix: ' - Seller portal', onAfter: (ctx) => shell.setActive(ctx.path) });
      router.add('/', () => statusView(v));
      router.add('/settings', (ctx) => V.routes.find((r) => r.path === '/settings').fn(ctx));
      for (const p of prepPaths) router.add(p, (ctx) => { const r = V.routes.find((x) => x.path === p); return r.perm && !V.can(r.perm) ? PM.empty({ icon: 'lock', title: 'No access' }) : r.fn(ctx); });
      V.router = router;
      router.start();
      return;
    }

    const nav = NAV.filter((n) => n.group || !n.perm || V.can(n.perm));
    const cleaned = nav.filter((n, i) => !n.group || (nav[i + 1] && !nav[i + 1].group));
    const shell = PM.dash.shell({ appName: v.storeName, nav: cleaned, user: V.me, onLogout: V.logout, storeLink: { href: '/#/store/' + v.slug, label: 'View my store' } });
    V.shell = shell;
    app.replaceChildren(shell.el);
    const router = PM.createRouter({
      outlet: shell.outlet, titleSuffix: ' - Seller portal',
      onAfter: (ctx) => shell.setActive(ctx.path),
      onError: (err, ctx, r) => { if (err.status === 401) { V.boot(); return null; } return null; },
    });
    V.router = router;
    for (const r of V.routes) {
      router.add(r.path, (ctx) => {
        if (r.perm && !V.can(r.perm)) return PM.empty({ icon: 'lock', title: 'No access', text: 'Your team role does not include this area. Ask the store owner for access.' });
        return r.fn(ctx);
      });
    }
    router.start();
    refreshBadges();
  };

  async function refreshBadges() {
    try {
      if (V.can('orders')) { const o = await api('/vendor/orders?limit=1'); V.shell.setBadge('orders', o.counts.placed); }
      if (V.can('messages')) V.shell.setBadge('messages', V.info.unreadMessages);
    } catch { /* ignore */ }
  }
  V.refreshBadges = refreshBadges;

  // ---------- approval status ----------

  function statusView(v) {
    const map = {
      pending: ['clock', 'Your store is under review', 'Our team is verifying your business details, usually within one to two business days. You can already add your products and set their stock quantities: they go live in the shop as soon as the store is approved.', 'info'],
      rejected: ['x', 'Your application was not approved', v.rejectionReason || 'Please contact support for details.', 'error'],
      suspended: ['alert', 'Your store is suspended', v.rejectionReason || 'Please contact support to resolve this.', 'error'],
    };
    const [ic, title, text, tone] = map[v.status] || map.pending;
    return h('div', { class: 'stack', style: 'max-width:760px' }, PM.dash.title(v.storeName, 'Store status'),
      h('div', { class: 'card card-pad center stack', style: 'align-items:center' }, h('div', { class: 'state-icon', style: 'width:64px;height:64px;border-radius:50%;background:var(--brand-soft);color:var(--brand);display:grid;place-items:center' }, icon(ic)), h('h2', { style: 'margin:0' }, title), h('p', { class: 'muted', style: 'margin:0;max-width:52ch' }, text), PM.status(v.status),
        v.status === 'pending' && V.can('products') ? h('div', { class: 'row', style: 'justify-content:center' }, h('a', { class: 'btn btn-primary btn-lg', href: '#/products/new' }, icon('plus'), 'Add your first product'), h('a', { class: 'btn btn-lg', href: '#/inventory' }, icon('layers'), 'Manage stock')) : null),
      h('div', { class: 'card card-pad' }, h('h3', null, 'What we received'), h('dl', { class: 'grid cols-2', style: 'margin:0' },
        [['Store name', v.storeName], ['Business type', fmt.label(v.businessType)], ['Location', `${v.city}, ${v.country}`], ['Phone', v.phone], ['Tax ID', v.taxId || 'Not provided'], ['ID document', `${fmt.label(v.idType)} ending ${v.idLast4}`]].map(([k, val]) => h('div', null, h('dt', { class: 'xs muted' }, k), h('dd', { style: 'margin:0 0 8px;font-weight:600' }, val))))),
      PM.alert('info', v.status === 'pending' ? 'Products you add now stay hidden from shoppers until the store is approved. Orders, marketing and finance unlock after approval.' : 'Contact support if you think this is a mistake.'));
  }

  // ---------- registration ----------

  function registerView() {
    const loggedIn = Boolean(V.me && V.me.role === 'buyer'); // a buyer opening a store keeps their account
    const st = { step: loggedIn ? 2 : 1, name: '', email: '', password: '', storeName: '', description: '', businessType: 'individual', country: 'Cameroon', city: '', phone: '', taxId: '', idType: 'national_id', idNumber: '', terms: false };
    const steps = ['Your account', 'Business details', 'Verification'];
    const body = h('div');
    const stepper = h('ol', { class: 'steps' });
    const err = PM.errorBox();
    const f = (key, label, props = {}, field = {}) => {
      const el = props.tag === 'textarea' ? PM.textarea({ value: st[key], oninput: (e) => { st[key] = e.target.value; }, rows: 3, ...props.attrs }) : props.options ? PM.select(props.options, st[key], { onchange: (e) => { st[key] = e.target.value; } }) : PM.input({ value: st[key], oninput: (e) => { st[key] = e.target.value; }, ...props.attrs });
      return PM.field(label, el, field);
    };
    function draw() {
      err.clear();
      stepper.replaceChildren(...steps.map((n, i) => h('li', { class: i + 1 < st.step ? 'done' : i + 1 === st.step ? 'current' : '' }, n)));
      const next = (validate) => () => { const m = validate(); if (m) return err.show(m); st.step += 1; draw(); };
      if (st.step === 1) {
        body.replaceChildren(h('div', { class: 'stack' }, h('h2', { style: 'margin:0' }, 'Create your seller account'),
          f('name', 'Your full name', { attrs: { autocomplete: 'name' } }, { required: true }), f('email', 'Email', { attrs: { type: 'email', autocomplete: 'email' } }, { required: true }), f('password', 'Password', { attrs: { type: 'password', autocomplete: 'new-password' } }, { required: true, hint: 'At least 8 characters.' }),
          h('p', { class: 'small muted' }, 'Already have a PrinceMall buyer account? ', h('a', { href: '/#/login?next=%2F' }, 'Log in'), ' first and you can skip this step.'), err,
          h('div', { class: 'row between' }, h('a', { class: 'btn', href: '#/' }, 'Cancel'), h('button', { class: 'btn btn-primary', type: 'button', onclick: next(() => (st.name.trim().length < 2 ? 'Enter your name' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(st.email) ? 'Enter a valid email' : st.password.length < 8 ? 'Password must be at least 8 characters' : null)) }, 'Continue', icon('chevron-right')))));
      } else if (st.step === 2) {
        body.replaceChildren(h('div', { class: 'stack' }, h('h2', { style: 'margin:0' }, 'Tell us about your business'),
          loggedIn ? PM.alert('info', `You are logged in as ${V.me.email}. Your store will be linked to this account.`) : null,
          f('storeName', 'Store name', { attrs: { maxLength: 60 } }, { required: true }), f('description', 'What do you sell?', { tag: 'textarea', attrs: { maxLength: 600 } }, { required: true, hint: 'Shown on your store page.' }),
          h('div', { class: 'form-grid' }, f('businessType', 'Business type', { options: [{ value: 'individual', label: 'Individual / sole trader' }, { value: 'company', label: 'Registered company' }] }), f('taxId', 'Tax ID (optional)', { attrs: { maxLength: 40 } }), f('country', 'Country', {}, { required: true }), f('city', 'City', {}, { required: true }), f('phone', 'Business phone', { attrs: { type: 'tel' } }, { required: true })), err,
          h('div', { class: 'row between' }, loggedIn ? h('a', { class: 'btn', href: '/#/' }, 'Cancel') : h('button', { class: 'btn', type: 'button', onclick: () => { st.step = 1; draw(); } }, icon('chevron-left'), 'Back'), h('button', { class: 'btn btn-primary', type: 'button', onclick: next(() => (st.storeName.trim().length < 3 ? 'Store name must be at least 3 characters' : st.description.trim().length < 10 ? 'Describe what you sell (at least 10 characters)' : !st.city.trim() || !st.country.trim() ? 'Enter your city and country' : !/^\+?[0-9 ()-]{6,20}$/.test(st.phone.trim()) ? 'Enter a valid phone number' : null)) }, 'Continue', icon('chevron-right')))));
      } else {
        body.replaceChildren(h('div', { class: 'stack' }, h('h2', { style: 'margin:0' }, 'Identity verification'),
          PM.alert('info', 'We keep only the last 4 characters of your ID number. A reviewer checks your details before approving the store. Never email ID documents to anyone.'),
          h('div', { class: 'form-grid' }, f('idType', 'ID type', { options: [{ value: 'national_id', label: 'National ID card' }, { value: 'passport', label: 'Passport' }, { value: 'driver_license', label: 'Driver licence' }, { value: 'company_registration', label: 'Company registration' }] }), f('idNumber', 'ID number', { attrs: { maxLength: 40, autocomplete: 'off' } }, { required: true })),
          PM.check('I confirm my details are accurate and I accept the seller terms and commission policy.', { checked: st.terms, onchange: (e) => { st.terms = e.target.checked; } }), err,
          h('div', { class: 'row between' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.step = 2; draw(); } }, icon('chevron-left'), 'Back'),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: async (e) => {
              err.clear();
              if (st.idNumber.trim().length < 4) return err.show('Enter your ID number');
              if (!st.terms) return err.show('Please accept the seller terms');
              try {
                await PM.busy(e.currentTarget, () => api('/vendor/register', { method: 'POST', body: { name: st.name, email: st.email, password: st.password, storeName: st.storeName, description: st.description, businessType: st.businessType, country: st.country, city: st.city, phone: st.phone, taxId: st.taxId, idType: st.idType, idNumber: st.idNumber, acceptTerms: true } }));
                PM.toast('Application submitted!');
                location.hash = '#/';
                V.boot();
              } catch (x) { err.show(x.message); }
            } }, 'Submit application'))));
      }
    }
    draw();
    return h('div', { class: 'login-shell' }, h('div', { class: 'card card-pad', style: 'width:100%;max-width:640px' },
      h('div', { class: 'row between' }, h('a', { class: 'logo', href: '/' }, h('span', { class: 'logo-mark' }, 'P'), 'PrinceMall'), PM.theme.toggleButton()),
      h('h1', { style: 'margin-top:16px' }, 'Open your store'), h('p', { class: 'muted' }, 'Reach thousands of buyers. Low commission, fast payouts, and tools to run your shop.'), stepper, body));
  }

  // ---------- dashboard ----------

  V.page('/', null, async () => {
    const state = { days: 30 };
    const box = h('div', { class: 'stack' });
    const actionsSlot = h('div');
    // Quick actions and a setup checklist (hidden once everything is done).
    (async () => {
      try {
        // Staff roles without product access never ask for the product count (it would be refused).
        const [prods, v] = [V.can('products') ? await api('/vendor/products?limit=1') : { total: 1 }, V.info.vendor];
        const steps = [
          [prods.total > 0, 'Add your first product', '#/products/new', 'package'],
          [Boolean(v.payment && v.payment.account), 'Add a payout account to get paid', '#/settings', 'wallet'],
          [Boolean(v.branding && v.branding.logo), 'Upload your store logo', '#/settings', 'image'],
        ];
        const done = steps.filter((s) => s[0]).length;
        actionsSlot.replaceChildren(
          h('div', { class: 'row' },
            V.can('products') ? h('a', { class: 'btn btn-primary', href: '#/products/new' }, icon('plus'), 'Add product') : null,
            V.can('inventory') ? h('a', { class: 'btn', href: '#/inventory' }, icon('layers'), 'Update stock') : null,
            V.can('orders') ? h('a', { class: 'btn', href: '#/orders' }, icon('truck'), 'View orders') : null,
            V.can('marketing') ? h('a', { class: 'btn', href: '#/marketing' }, icon('megaphone'), 'Create a promotion') : null),
          done < steps.length && V.isOwner() ? h('div', { class: 'card card-pad-sm mt-1' }, h('div', { class: 'row between' }, h('strong', null, 'Finish setting up your store'), h('span', { class: 'small muted' }, `${done} of ${steps.length} done`)),
            h('div', { class: 'progress mt-1', role: 'progressbar', 'aria-label': 'Setup progress', 'aria-valuenow': Math.round((done / steps.length) * 100) }, h('span', { style: `width:${(done / steps.length) * 100}%` })),
            h('div', { class: 'stack-sm mt-1' }, steps.map(([ok, label, href, ic]) => h('a', { class: 'menu-item', href, style: ok ? 'opacity:.6;text-decoration:line-through' : '' }, icon(ok ? 'check' : ic), label)))) : null);
      } catch { /* the dashboard still works without the checklist */ }
    })();
    async function draw() {
      try {
        const d = await api('/vendor/overview?days=' + state.days);
        const k = d.kpis;
        const alerts = [];
        if (d.alerts.newOrders) alerts.push(['truck', `${d.alerts.newOrders} new order${d.alerts.newOrders > 1 ? 's' : ''} to process`, '#/orders?status=placed']);
        if (d.alerts.lowStock) alerts.push(['alert', `${d.alerts.lowStock} product${d.alerts.lowStock > 1 ? 's' : ''} low on stock`, '#/inventory?filter=low']);
        if (d.alerts.returns) alerts.push(['undo', `${d.alerts.returns} return request${d.alerts.returns > 1 ? 's' : ''} waiting`, '#/orders?status=returns']);
        if (d.alerts.unreadMessages) alerts.push(['message', `${d.alerts.unreadMessages} unread message${d.alerts.unreadMessages > 1 ? 's' : ''}`, '#/messages']);
        box.replaceChildren(
          alerts.length ? h('div', { class: 'row' }, alerts.map(([i, t, href]) => h('a', { class: 'chip', href }, icon(i), t))) : null,
          h('div', { class: 'grid cols-4' },
            PM.kpi({ label: 'Revenue', value: fmt.price(k.revenue.value), change: k.revenue.change, icon: 'dollar', spark: d.series.revenue }),
            PM.kpi({ label: 'Orders', value: fmt.num(k.orders.value), change: k.orders.change, icon: 'package', spark: d.series.orders }),
            PM.kpi({ label: 'Customers', value: fmt.num(k.customers.value), change: k.customers.change, icon: 'users' }),
            PM.kpi({ label: 'Units sold', value: fmt.num(k.units.value), change: k.units.change, icon: 'box' }),
            PM.kpi({ label: 'Avg. order value', value: fmt.price(k.aov.value), change: k.aov.change, icon: 'receipt' }),
            PM.kpi({ label: 'Refunds', value: fmt.price(k.refunds.value), change: k.refunds.change, icon: 'undo', invert: true }),
            PM.kpi({ label: 'Conversion rate', value: fmt.pct(k.conversion.value), icon: 'percent', note: 'Orders per product view (all time)' })),
          h('div', { class: 'two-col' },
            PM.dash.panel('Revenue', PM.charts.line({ labels: d.series.labels.map((x) => x.slice(5)), series: [{ name: 'Revenue', values: d.series.revenue }], fmt: fmt.price, height: 260 })),
            PM.dash.panel('Top products', d.topProducts.length ? PM.charts.hbar(d.topProducts.map((p) => ({ label: p.name, value: p.revenue })), { fmt: fmt.price }) : h('p', { class: 'muted' }, 'No sales in this period.'))),
          h('div', { class: 'two-col' },
            PM.dash.panel('Orders per day', PM.charts.bar({ labels: d.series.labels.map((x) => x.slice(5)), series: [{ name: 'Orders', values: d.series.orders, color: 'var(--chart-2)' }], height: 200 })),
            PM.dash.panel('Recent orders', d.recentOrders.length ? h('div', { class: 'stack-sm' }, d.recentOrders.map((o) => h('a', { class: 'menu-item', href: '#/orders', style: 'border:1px solid var(--border)' }, h('span', { class: 'grow' }, h('strong', { class: 'small' }, o.id), h('div', { class: 'xs muted' }, `${o.customer} · ${fmt.ago(o.createdAt)}`)), PM.status(o.status), h('span', { class: 'price small' }, fmt.price(o.total))))) : PM.empty({ icon: 'package', title: 'No orders yet' }))));
      } catch (e) { box.replaceChildren(PM.errorState(e, draw)); }
    }
    draw();
    return h('div', null, PM.dash.title(`Welcome back, ${V.me.name.split(' ')[0]}`, 'Here is how your store is doing.', PM.dash.periodSelect([[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']], 30, (n) => { state.days = n; draw(); })), actionsSlot, box);
  });
})();
