'use strict';
// Super-admin panel: boot, navigation and the overview dashboard.

(function () {
  const { h, api, icon, fmt } = PM;
  const A = (window.A = { me: null, routes: [], router: null });
  A.page = (path, fn) => A.routes.push({ path, fn });

  const NAV = [
    { key: 'dashboard', label: 'Dashboard', icon: 'home', path: '/' },
    { group: 'People' },
    { key: 'users', label: 'Users', icon: 'users', path: '/users' },
    { key: 'vendors', label: 'Store approval', icon: 'store', path: '/vendors' },
    { group: 'Marketplace' },
    { key: 'products', label: 'Product monitoring', icon: 'package', path: '/products' },
    { key: 'categories', label: 'Categories', icon: 'grid', path: '/categories' },
    { key: 'ads', label: 'Advertising', icon: 'megaphone', path: '/ads' },
    { key: 'cms', label: 'Content (CMS)', icon: 'file', path: '/cms' },
    { group: 'Money' },
    { key: 'analytics', label: 'Platform analytics', icon: 'chart', path: '/analytics' },
    { key: 'commission', label: 'Commission', icon: 'percent', path: '/commission' },
    { key: 'payments', label: 'Payments & payouts', icon: 'wallet', path: '/payments' },
    { group: 'Operations' },
    { key: 'orders', label: 'All orders', icon: 'truck', path: '/orders' },
    { key: 'reviews', label: 'Review moderation', icon: 'star', path: '/reviews' },
    { key: 'coupons', label: 'Coupons', icon: 'tag', path: '/coupons' },
    { key: 'tickets', label: 'Support tickets', icon: 'help', path: '/tickets' },
    { key: 'communications', label: 'Communications', icon: 'megaphone', path: '/communications' },
    { group: 'System' },
    { key: 'system', label: 'System health', icon: 'activity', path: '/system' },
    { key: 'security', label: 'Security', icon: 'shield', path: '/security' },
    { key: 'settings', label: 'System settings', icon: 'settings', path: '/settings' },
  ];

  A.logout = async () => { await api('/auth/logout', { method: 'POST' }); A.me = null; A.boot(); };

  A.boot = async function () {
    const app = document.getElementById('app');
    if (A.router) { A.router.stop(); A.router = null; }
    let me;
    try { me = await api('/auth/me'); } catch (e) { app.replaceChildren(PM.errorState(e, () => location.reload())); return; }
    if (me.site) PM.currency = me.site.currency;
    A.me = me.user;
    if (!A.me || A.me.role !== 'admin') {
      app.replaceChildren(PM.dash.login({ title: 'Admin panel', subtitle: 'Platform administration', roles: ['admin'], onSuccess: () => { location.hash = '#/'; A.boot(); } }));
      return;
    }
    const shell = PM.dash.shell({ appName: 'PrinceMall Admin', nav: NAV, user: A.me, onLogout: A.logout, storeLink: { href: '/', label: 'View the shop' } });
    A.shell = shell;
    app.replaceChildren(shell.el);
    const router = PM.createRouter({
      outlet: shell.outlet, titleSuffix: ' - Admin', onAfter: (ctx) => shell.setActive(ctx.path),
      onError: (err) => { if (err.status === 401 || err.status === 403) { A.boot(); return null; } return null; },
    });
    for (const r of A.routes) router.add(r.path, r.fn);
    A.router = router;
    router.start();
    api('/admin/overview').then((o) => { shell.setBadge('vendors', o.queue.pendingVendors); shell.setBadge('tickets', o.queue.openTickets); shell.setBadge('payments', o.queue.pendingPayouts); }).catch(() => {});
  };

  A.page('/', async () => {
    const [d, feed] = await Promise.all([api('/admin/overview'), api('/admin/activity').catch(() => ({ events: [] }))]);
    const t = d.totals; const k = d.kpis;
    const q = d.queue;
    const todo = [['store', q.pendingVendors, 'store application(s) to review', '#/vendors?status=pending'], ['help', q.openTickets, 'open support ticket(s)', '#/tickets'], ['wallet', q.pendingPayouts, 'payout request(s) waiting', '#/payments'], ['alert', q.flaggedProducts, 'flagged product(s)', '#/products?flagged=1']].filter((x) => x[1]);
    return h('div', { class: 'stack' }, PM.dash.title('Platform overview', 'Last 30 days compared with the 30 days before.'),
      todo.length ? h('div', { class: 'row' }, todo.map(([i, n, label, href]) => h('a', { class: 'chip', href }, icon(i), h('strong', null, String(n)), label))) : PM.alert('success', 'Nothing is waiting for your review.'),
      h('div', { class: 'grid cols-4' },
        PM.kpi({ label: 'Gross sales (30d)', value: fmt.price(k.gmv.value), change: k.gmv.change, icon: 'dollar', spark: d.series.gmv }),
        PM.kpi({ label: 'Commission revenue (30d)', value: fmt.price(k.commission.value), change: k.commission.change, icon: 'percent', spark: d.series.commission }),
        PM.kpi({ label: 'Orders (30d)', value: fmt.num(k.orders.value), change: k.orders.change, icon: 'package' }),
        PM.kpi({ label: 'Total sales (all time)', value: fmt.price(t.sales), icon: 'chart', note: `Commission earned: ${fmt.price(t.revenue)}` }),
        PM.kpi({ label: 'Users', value: fmt.num(t.users), icon: 'users', note: `${t.buyers} buyers` }),
        PM.kpi({ label: 'Vendors', value: `${t.approvedVendors} / ${t.vendors}`, icon: 'store', note: 'approved / total' }),
        PM.kpi({ label: 'Products', value: fmt.num(t.products), icon: 'box' }), PM.kpi({ label: 'Orders (all time)', value: fmt.num(t.orders), icon: 'receipt' })),
      h('div', { class: 'two-col' },
        PM.dash.panel('Sales and commission', PM.charts.line({ labels: d.series.labels.map((x) => x.slice(5)), series: [{ name: 'Gross sales', values: d.series.gmv }, { name: 'Commission', values: d.series.commission, color: 'var(--chart-4)' }], fmt: fmt.price, height: 260 })),
        PM.dash.panel('Top vendors by sales', d.topVendors.length ? PM.charts.hbar(d.topVendors.map((v) => ({ label: v.name, value: v.value })), { fmt: fmt.price }) : h('p', { class: 'muted' }, 'No sales yet.'))),
      h('div', { class: 'two-col' },
        PM.dash.panel('New sign-ups per day', PM.charts.bar({ labels: d.series.labels.map((x) => x.slice(5)), series: [{ name: 'Sign-ups', values: d.series.signups, color: 'var(--chart-2)' }], height: 200 })),
        PM.dash.panel('Latest activity', feed.events.length ? h('div', { class: 'stack-sm' }, feed.events.map((e) => h('a', { class: 'menu-item', href: e.link, style: 'align-items:flex-start' }, h('span', { class: 'kpi-ico', style: 'flex:none;width:28px;height:28px' }, icon(e.icon)), h('span', { class: 'grow small' }, e.text, h('div', { class: 'xs muted' }, fmt.ago(e.at)))))) : h('p', { class: 'muted' }, 'Nothing yet.'))));
  });
})();
