'use strict';
// Admin pages (1/2): users, store approval, product monitoring, analytics, commission, payments.

(function () {
  const { h, api, icon, fmt } = PM;
  const A = window.A;
  const money = fmt.price;

  // =========================================================== USERS
  A.page('/users', async () => {
    const state = { role: '', q: '', page: 1 };
    const tabsBox = h('div'); const pager = h('div');
    const tbl = PM.table({ columns: [
      { key: 'name', label: 'User', sortable: true, render: (u) => h('div', { class: 'row-nowrap' }, h('span', { class: 'avatar' }, fmt.initials(u.name)), h('div', null, h('strong', null, u.name), h('div', { class: 'xs muted' }, u.email, u.emailVerified ? '' : ' · unverified'))) },
      { key: 'role', label: 'Role', render: (u) => h('div', null, PM.status(u.role), u.store ? h('div', { class: 'xs muted' }, `${u.store}${u.staffRole && u.staffRole !== 'owner' ? ' (' + u.staffRole + ')' : ''}`) : null) },
      { key: 'spent', label: 'Spent', sortable: true, align: 'r', render: (u) => money(u.spent) }, { key: 'createdAt', label: 'Joined', sortable: true, render: (u) => fmt.date(u.createdAt) },
      { key: 'status', label: 'Status', render: (u) => PM.status(u.status) },
      { key: 'x', label: '', align: 'r', render: (u) => (u.id === A.me.id ? h('span', { class: 'xs muted' }, 'You') : h('div', { class: 'row', style: 'justify-content:flex-end;gap:4px' },
        h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { try { await api('/admin/users/' + u.id, { method: 'PATCH', body: { status: u.status === 'suspended' ? 'active' : 'suspended' } }); PM.toast(u.status === 'suspended' ? 'User reactivated' : 'User suspended'); load(); } catch (e) { PM.toast(e.message, 'error'); } } }, u.status === 'suspended' ? 'Reactivate' : 'Suspend'),
        h('button', { class: 'btn btn-sm', type: 'button', title: 'Sign this user out everywhere', onclick: async () => { const r = await api(`/admin/users/${u.id}/revoke-sessions`, { method: 'POST' }); PM.toast(`${r.revoked} session(s) ended`); } }, icon('key')),
        u.role !== 'vendor' ? h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { const to = u.role === 'admin' ? 'buyer' : 'admin'; if (await PM.confirm({ title: `Make ${u.name} ${to === 'admin' ? 'an administrator' : 'a buyer'}?`, message: to === 'admin' ? 'Administrators can approve stores, change settings and see all data.' : 'They will lose admin access.', confirmLabel: 'Confirm', danger: to === 'admin' })) { try { await api('/admin/users/' + u.id, { method: 'PATCH', body: { role: to } }); load(); } catch (e) { PM.toast(e.message, 'error'); } } } }, u.role === 'admin' ? 'Remove admin' : 'Make admin') : null)) },
    ] });
    async function load() {
      try {
        const d = await api('/admin/users' + PM.qs({ ...state, limit: 10 }));
        const c = d.counts;
        tabsBox.replaceChildren(PM.tabs([{ id: '', label: 'All', count: c.buyer + c.vendor + c.admin }, { id: 'buyer', label: 'Buyers', count: c.buyer }, { id: 'vendor', label: 'Vendors & staff', count: c.vendor }, { id: 'admin', label: 'Admins', count: c.admin }], state.role, (id) => { state.role = id; state.page = 1; load(); }));
        tbl.update(d.users);
        pager.replaceChildren(PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }));
      } catch (e) { pager.replaceChildren(PM.errorState(e, load)); }
    }
    const addAdmin = () => {
      const f = { name: PM.input({ maxLength: 60 }), email: PM.input({ type: 'email' }), pw: PM.input({ type: 'password', autocomplete: 'new-password' }) }; const err = PM.errorBox();
      PM.modal({ title: 'Add an administrator', content: h('div', { class: 'stack' }, PM.field('Name', f.name, { required: true }), PM.field('Email', f.email, { required: true }), PM.field('Temporary password', f.pw, { required: true, hint: 'At least 8 characters.' }), err), actions: [{ label: 'Cancel' }, { label: 'Create admin', kind: 'primary', onClick: async () => { try { await api('/admin/users', { method: 'POST', body: { name: f.name.value, email: f.email.value, password: f.pw.value } }); PM.toast('Administrator created'); load(); } catch (e) { err.show(e.message); return false; } } }] });
    };
    load();
    return h('div', null, PM.dash.title('Users', 'Buyers, vendors and administrators.', h('button', { class: 'btn btn-primary', type: 'button', onclick: addAdmin }, icon('plus'), 'Add admin')), h('div', { class: 'toolbar' }, PM.dash.searchBox((q) => { state.q = q; state.page = 1; load(); }, 'Search name or email')), tabsBox, tbl.el, pager);
  });

  // =========================================================== STORE APPROVAL
  A.page('/vendors', async (ctx) => {
    const state = { status: ctx.query.get('status') || '', q: '', page: 1 };
    const tabsBox = h('div'); const pager = h('div');
    const tbl = PM.table({ columns: [
      { key: 'storeName', label: 'Store', sortable: true, render: (v) => h('div', null, h('strong', null, v.storeName), h('div', { class: 'xs muted' }, `${v.owner.name} · ${v.city}`)) },
      { key: 'status', label: 'Status', render: (v) => PM.status(v.status) }, { key: 'products', label: 'Products', align: 'r', sortable: true },
      { key: 'sales', label: 'Sales', align: 'r', sortable: true, render: (v) => money(v.sales) }, { key: 'createdAt', label: 'Applied', sortable: true, render: (v) => fmt.date(v.createdAt) },
      { key: 'x', label: '', align: 'r', render: (v) => h('button', { class: v.status === 'pending' ? 'btn btn-sm btn-primary' : 'btn btn-sm', type: 'button', onclick: () => review(v) }, v.status === 'pending' ? 'Review' : 'Manage') },
    ] });
    function review(v) {
      const rate = PM.input({ type: 'number', min: 0, max: 50, step: '0.5', value: v.commissionRate == null ? '' : v.commissionRate * 100, placeholder: 'Default' });
      const reason = PM.input({ placeholder: 'Reason (required to reject)' });
      const act = async (action) => {
        try { await api('/admin/vendors/' + v.id, { method: 'PATCH', body: { action, reason: reason.value, commissionRate: rate.value === '' ? null : Number(rate.value) } }); PM.toast(`Store ${action}${action.endsWith('e') ? 'd' : 'ed'}`); load(); return true; } catch (e) { PM.toast(e.message, 'error'); return false; }
      };
      let layer;
      const actions = [{ label: 'Close' },
        ...(v.status === 'pending' || v.status === 'rejected' ? [{ label: 'Approve', kind: 'success', onClick: () => act('approve') }] : []),
        ...(v.status === 'pending' ? [{ label: 'Reject', kind: 'danger', onClick: () => act('reject') }] : []),
        ...(v.status === 'approved' ? [{ label: 'Suspend store', kind: 'danger', onClick: () => act('suspend') }] : []),
        ...(v.status === 'suspended' ? [{ label: 'Reinstate', kind: 'success', onClick: () => act('reinstate') }] : []),
        { label: 'Save commission', kind: 'primary', onClick: async () => { try { await api('/admin/vendors/' + v.id, { method: 'PATCH', body: { commissionRate: rate.value === '' ? null : Number(rate.value) } }); PM.toast('Commission saved'); load(); } catch (e) { PM.toast(e.message, 'error'); return false; } } }];
      layer = PM.modal({ title: v.storeName, size: 'lg', content: h('div', { class: 'stack' }, h('div', { class: 'row' }, PM.status(v.status), v.rejectionReason ? h('span', { class: 'small muted' }, 'Reason: ' + v.rejectionReason) : null),
        h('p', { class: 'text-2 mb-0' }, v.description),
        h('dl', { class: 'grid cols-3', style: 'margin:0' }, [['Owner', `${v.owner.name} (${v.owner.email})`], ['Business type', fmt.label(v.businessType)], ['Location', `${v.city}, ${v.country}`], ['Phone', v.phone], ['Tax ID', v.taxId || 'Not provided'], ['ID document', `${fmt.label(v.idType)} · ends ${v.idLast4}`], ['Products', v.products], ['Sales', money(v.sales)], ['Commission earned', money(v.commission)]].map(([k, val]) => h('div', null, h('dt', { class: 'xs muted' }, k), h('dd', { style: 'margin:0 0 8px;font-weight:600;word-break:break-word' }, String(val))))),
        PM.alert('warning', 'Verify the owner’s identity and business registration before approving. Only the last 4 characters of the ID are stored here.'),
        h('div', { class: 'form-grid' }, PM.field('Commission override (%)', rate, { hint: 'Leave empty to use the platform default.' }), PM.field('Reason', reason))), actions });
    }
    async function load() {
      try {
        const d = await api('/admin/vendors' + PM.qs({ ...state, limit: 10 }));
        const c = d.counts;
        tabsBox.replaceChildren(PM.tabs([{ id: '', label: 'All', count: c.all }, { id: 'pending', label: 'Pending review', count: c.pending }, { id: 'approved', label: 'Approved', count: c.approved }, { id: 'rejected', label: 'Rejected', count: c.rejected }, { id: 'suspended', label: 'Suspended', count: c.suspended }], state.status, (id) => { state.status = id; state.page = 1; load(); }));
        tbl.update(d.vendors);
        pager.replaceChildren(PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }));
      } catch (e) { pager.replaceChildren(PM.errorState(e, load)); }
    }
    load();
    return h('div', null, PM.dash.title('Store approval & moderation', 'Verify new vendors and keep the marketplace trustworthy.'), h('div', { class: 'toolbar' }, PM.dash.searchBox((q) => { state.q = q; state.page = 1; load(); }, 'Search stores')), tabsBox, tbl.el, pager);
  });

  // =========================================================== PRODUCT MONITORING
  A.page('/products', async (ctx) => {
    const state = { status: '', flagged: ctx.query.get('flagged') || '', q: '', page: 1 };
    const pager = h('div');
    const patch = async (p, body, msg) => { try { await api('/admin/products/' + p.id, { method: 'PATCH', body }); PM.toast(msg); load(); } catch (e) { PM.toast(e.message, 'error'); } };
    const tbl = PM.table({ columns: [
      { key: 'name', label: 'Product', sortable: true, render: (p) => h('div', { class: 'cell-product' }, PM.img(p.image, ''), h('div', null, h('strong', null, p.name), h('div', { class: 'xs muted' }, `${p.store} · ${p.category}`))) },
      { key: 'price', label: 'Price', sortable: true, align: 'r', render: (p) => money(p.price) }, { key: 'stock', label: 'Stock', align: 'r', sortable: true }, { key: 'sold', label: 'Sold', align: 'r', sortable: true },
      { key: 'status', label: 'Status', render: (p) => h('div', { class: 'row', style: 'gap:4px' }, PM.status(p.status), p.flagged ? PM.badge('Flagged', 'warning') : null, p.featured ? PM.badge('Featured', 'brand') : null) },
      { key: 'x', label: '', align: 'r', render: (p) => h('div', { class: 'row', style: 'justify-content:flex-end;gap:4px' },
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => patch(p, { flagged: !p.flagged }, p.flagged ? 'Flag removed' : 'Product flagged') }, icon('alert'), p.flagged ? 'Unflag' : 'Flag'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => patch(p, { featured: !p.featured }, p.featured ? 'Removed from featured' : 'Featured on home page') }, icon('star'), p.featured ? 'Unfeature' : 'Feature'),
        p.status === 'blocked' ? h('button', { class: 'btn btn-sm btn-success', type: 'button', onclick: () => patch(p, { status: 'active' }, 'Product restored') }, 'Restore') : h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: async () => { if (await PM.confirm({ title: 'Block this product?', message: 'It is hidden from the shop and the vendor cannot edit it until you restore it.', confirmLabel: 'Block', danger: true })) patch(p, { status: 'blocked' }, 'Product blocked'); } }, 'Block')) },
    ] });
    async function load() {
      try { const d = await api('/admin/products' + PM.qs({ ...state, limit: 10 })); tbl.update(d.products); pager.replaceChildren(PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }), h('p', { class: 'xs muted center' }, `${d.total} products`)); } catch (e) { pager.replaceChildren(PM.errorState(e, load)); }
    }
    load();
    return h('div', null, PM.dash.title('Product monitoring', 'Review listings across all stores.'), h('div', { class: 'toolbar' }, PM.dash.searchBox((q) => { state.q = q; state.page = 1; load(); }, 'Search name or SKU'),
      PM.select([{ value: '', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }, { value: 'blocked', label: 'Blocked' }], '', { 'aria-label': 'Status', style: 'width:auto', onchange: (e) => { state.status = e.target.value; state.page = 1; load(); } }),
      PM.check('Flagged only', { checked: state.flagged === '1', onchange: (e) => { state.flagged = e.target.checked ? '1' : ''; state.page = 1; load(); } })), tbl.el, pager);
  });

  // =========================================================== ANALYTICS
  A.page('/analytics', async () => {
    const d = await api('/admin/analytics');
    return h('div', { class: 'stack' }, PM.dash.title('Platform analytics', 'The last 12 weeks across every store.'),
      h('div', { class: 'two-col' }, PM.dash.panel('Gross sales per week', PM.charts.line({ labels: d.weekly.labels, series: [{ name: 'Gross sales', values: d.weekly.gmv }], fmt: money, height: 260 })), PM.dash.panel('Sales by category', d.categories.length ? PM.charts.donut({ items: d.categories, size: 160, fmt: money, centerLabel: 'Sales' }) : h('p', { class: 'muted' }, 'No data'))),
      h('div', { class: 'grid cols-2' }, PM.dash.panel('New users per week', PM.charts.bar({ labels: d.weekly.labels, series: [{ name: 'New users', values: d.weekly.users, color: 'var(--chart-2)' }], height: 200 })), PM.dash.panel('Orders per week', PM.charts.bar({ labels: d.weekly.labels, series: [{ name: 'Orders', values: d.weekly.orders, color: 'var(--chart-4)' }], height: 200 }))),
      h('div', { class: 'grid cols-2' }, PM.dash.panel('Sales by city', PM.charts.hbar(d.geography.map((g) => ({ label: g.label, value: g.value })), { fmt: money })), PM.dash.panel('Payment methods', d.paymentMethods.length ? PM.charts.donut({ items: d.paymentMethods, size: 150, fmt: money, centerLabel: 'Paid' }) : h('p', { class: 'muted' }, 'No data'))),
      h('div', { class: 'grid cols-4' }, PM.kpi({ label: 'Product views', value: fmt.num(d.funnel.views), icon: 'eye' }), PM.kpi({ label: 'Orders', value: fmt.num(d.funnel.orders), icon: 'package' }), PM.kpi({ label: 'Buyers who ordered', value: `${d.funnel.buyers} / ${d.funnel.users}`, icon: 'users', note: 'of registered buyers' }), PM.kpi({ label: 'Conversion', value: fmt.pct(d.funnel.conversion), icon: 'percent', note: 'Orders per product view' })));
  });

  // =========================================================== COMMISSION
  A.page('/commission', async () => {
    const d = await api('/admin/commission');
    const def = PM.input({ type: 'number', min: 0, max: 50, step: '0.5', value: d.defaultRate * 100, style: 'max-width:140px' });
    const edit = (v) => {
      const r = PM.input({ type: 'number', min: 0, max: 50, step: '0.5', value: v.rate == null ? '' : v.rate * 100, placeholder: 'Default' });
      PM.modal({ title: `Commission for ${v.name}`, content: PM.field('Rate (%)', r, { hint: 'Leave empty to use the platform default.' }), actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => { try { await api('/admin/vendors/' + v.id, { method: 'PATCH', body: { commissionRate: r.value === '' ? null : Number(r.value) } }); PM.toast('Commission updated'); A.router.render(); } catch (e) { PM.toast(e.message, 'error'); return false; } } }] });
    };
    return h('div', { class: 'stack' }, PM.dash.title('Commission management', 'What the platform keeps from each sale.'),
      h('div', { class: 'card card-pad row' }, h('div', null, h('h3', { style: 'margin:0' }, 'Default commission'), h('p', { class: 'muted small mb-0' }, 'Applies to every store without its own rate. Changes affect new orders only.')), h('form', { class: 'input-group right', onsubmit: async (e) => { e.preventDefault(); try { await PM.busy(e.submitter, () => api('/admin/settings', { method: 'PATCH', body: { defaultCommission: Number(def.value) } })); PM.toast('Default commission saved'); A.router.render(); } catch (x) { PM.toast(x.message, 'error'); } } }, def, h('span', { style: 'align-self:center' }, '%'), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'))),
      PM.dash.panel('Commission earned by store', d.vendors.some((v) => v.earned) ? PM.charts.hbar(d.vendors.filter((v) => v.earned).map((v) => ({ label: v.name, value: v.earned })), { fmt: money }) : h('p', { class: 'muted' }, 'No commission yet.')),
      PM.table({ rowKey: 'id', columns: [{ key: 'name', label: 'Store', sortable: true }, { key: 'status', label: 'Status', render: (v) => PM.status(v.status) }, { key: 'effective', label: 'Rate', sortable: true, align: 'r', render: (v) => h('span', null, fmt.pct(v.effective * 100), v.rate == null ? h('span', { class: 'xs muted' }, ' (default)') : PM.badge(' custom', 'brand')) }, { key: 'sales', label: 'Sales', align: 'r', sortable: true, render: (v) => money(v.sales) }, { key: 'earned', label: 'Commission', align: 'r', sortable: true, render: (v) => money(v.earned) }, { key: 'x', label: '', align: 'r', render: (v) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => edit(v) }, 'Edit rate') }], rows: d.vendors }).el);
  });

  // =========================================================== PAYMENTS
  A.page('/payments', async () => {
    const state = { status: '', method: '', page: 1 };
    const kpis = h('div', { class: 'grid cols-4' }); const pager = h('div'); const payoutBox = h('div');
    const tbl = PM.table({ columns: [{ key: 'at', label: 'Date', sortable: true, render: (t) => fmt.dateTime(t.at) }, { key: 'id', label: 'Order', sortable: true }, { key: 'buyer', label: 'Buyer' }, { key: 'method', label: 'Method' }, { key: 'status', label: 'Payment', render: (t) => h('div', null, PM.payStatus(t.status), t.confirmedBy ? h('div', { class: 'xs muted' }, 'by ' + t.confirmedBy) : null) }, { key: 'total', label: 'Amount', align: 'r', sortable: true, render: (t) => money(t.total) }, { key: 'commission', label: 'Commission', align: 'r', render: (t) => money(t.commission) },
      { key: 'x', label: '', align: 'r', render: (t) => (t.status === 'pending' && t.orderStatus !== 'cancelled' ? h('a', { class: 'btn btn-sm btn-success', href: '#/orders?open=' + t.id }, 'Confirm payment') : t.refundDue ? h('a', { class: 'btn btn-sm btn-danger', href: '#/orders?open=' + t.id }, 'Send refund') : h('a', { class: 'btn btn-sm', href: '#/orders?open=' + t.id }, 'Open')) }] });
    async function load() {
      try {
        const d = await api('/admin/payments' + PM.qs({ ...state, limit: 10 }));
        const s = d.summary;
        kpis.replaceChildren(PM.kpi({ label: 'Paid', value: money(s.paid), icon: 'check' }), PM.kpi({ label: 'Waiting for confirmation', value: money(s.pending), icon: 'clock', note: 'Nothing is marked paid automatically' }), PM.kpi({ label: 'Refunds to send', value: money(s.refundDue), icon: 'wallet' }), PM.kpi({ label: 'Refunded', value: money(s.refunded), icon: 'undo' }), PM.kpi({ label: 'Payouts waiting', value: money(s.payoutsPending), icon: 'wallet' }));
        tbl.update(d.transactions);
        pager.replaceChildren(PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }));
        payoutBox.replaceChildren(PM.table({ columns: [{ key: 'createdAt', label: 'Requested', render: (p) => fmt.date(p.createdAt) }, { key: 'storeName', label: 'Store' }, { key: 'amount', label: 'Amount', align: 'r', render: (p) => money(p.amount) }, { key: 'account', label: 'Pay to', render: (p) => `${fmt.label(p.method)} · ${p.account}` }, { key: 'status', label: 'Status', render: (p) => PM.status(p.status) },
          { key: 'x', label: '', align: 'r', render: (p) => (p.status === 'pending' || p.status === 'approved' ? h('div', { class: 'row', style: 'justify-content:flex-end;gap:4px' },
            p.status === 'pending' ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => setPayout(p, 'approved') }, 'Approve') : null, h('button', { class: 'btn btn-sm btn-success', type: 'button', onclick: () => setPayout(p, 'paid') }, 'Mark paid'), h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => setPayout(p, 'rejected') }, 'Reject')) : '') }], rows: d.payouts, empty: PM.empty({ icon: 'wallet', title: 'No payout requests' }) }).el);
      } catch (e) { pager.replaceChildren(PM.errorState(e, load)); }
    }
    async function setPayout(p, status) { try { await api('/admin/payouts/' + p.id, { method: 'PATCH', body: { status } }); PM.toast(`Payout ${status}`); load(); } catch (e) { PM.toast(e.message, 'error'); } }
    load();
    return h('div', { class: 'stack' }, PM.dash.title('Payments & payouts', 'Money in from buyers, money out to stores. Payments here are simulated.'), kpis,
      PM.dash.panel('Vendor payouts', payoutBox, { flush: true }),
      h('div', { class: 'toolbar', style: 'margin:0' }, h('h3', { style: 'margin:0' }, 'Transactions'),
        PM.select([{ value: '', label: 'All statuses' }, { value: 'paid', label: 'Paid' }, { value: 'pending', label: 'Waiting for confirmation' }, { value: 'refund_due', label: 'Refund due' }, { value: 'refunded', label: 'Refunded' }], '', { 'aria-label': 'Payment status', style: 'width:auto', onchange: (e) => { state.status = e.target.value; state.page = 1; load(); } }),
        PM.select([{ value: '', label: 'All methods' }, ...['mobile_money', 'card', 'paypal', 'stripe', 'wallet', 'bank_transfer', 'cod'].map((m) => ({ value: m, label: fmt.label(m) }))], '', { 'aria-label': 'Payment method', style: 'width:auto', onchange: (e) => { state.method = e.target.value; state.page = 1; load(); } })), tbl.el, pager);
  });
})();
