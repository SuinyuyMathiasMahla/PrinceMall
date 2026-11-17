'use strict';
// Admin pages (3/3): all orders, review moderation, coupons, communications, system health.

(function () {
  const { h, api, icon, fmt } = PM;
  const A = window.A;
  const money = fmt.price;
  const localIn = (days) => { const d = new Date(Date.now() + days * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  // =========================================================== ALL ORDERS
  A.page('/orders', async (ctx) => {
    const state = { status: ctx.query.get('status') || '', q: '', page: 1 };
    const tabsBox = h('div'); const pager = h('div');
    const tbl = PM.table({ columns: [
      { key: 'id', label: 'Order', sortable: true, render: (o) => h('div', null, h('strong', null, o.id), h('div', { class: 'xs muted' }, fmt.dateTime(o.createdAt))) },
      { key: 'buyer', label: 'Buyer', render: (o) => h('div', null, o.buyer.name, h('div', { class: 'xs muted' }, o.city)) },
      { key: 'stores', label: 'Stores', render: (o) => h('div', { class: 'small' }, o.stores.join(', ')) },
      { key: 'total', label: 'Total', align: 'r', sortable: true, render: (o) => money(o.total) },
      { key: 'paymentStatus', label: 'Payment', render: (o) => PM.payStatus(o.paymentStatus) },
      { key: 'status', label: 'Status', render: (o) => h('div', { class: 'row', style: 'gap:4px' }, PM.status(o.status), o.shipments.some((s) => s.return === 'requested') ? PM.badge('Return asked', 'warning') : null) },
      { key: 'x', label: '', align: 'r', render: (o) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => detail(o.id) }, 'Open') },
    ] });
    async function detail(id) {
      const box = h('div', null, h('div', { class: 'spinner' }));
      let layer;
      layer = PM.modal({ title: `Order ${id}`, size: 'xl', content: box, actions: [{ label: 'Close' }] });
      try {
        const { order: o } = await api('/admin/orders/' + encodeURIComponent(id));
        const pay = PM.select([{ value: 'pending', label: 'Payment pending' }, { value: 'paid', label: 'Paid' }, { value: 'refund_due', label: 'Refund due' }, { value: 'refunded', label: 'Refunded' }], o.paymentStatus, { 'aria-label': 'Payment status', style: 'width:auto' });
        const reference = PM.input({ placeholder: 'Reference, e.g. MoMo transaction ID (optional)', maxLength: 60, 'aria-label': 'Payment reference' });
        const patch = async (body, msg) => { try { await api('/admin/orders/' + o.id, { method: 'PATCH', body }); PM.toast(msg); layer.close(); load(); } catch (e) { PM.toast(e.message, 'error'); } };
        const canCancel = o.shipments.some((s) => s.status !== 'cancelled' && s.status !== 'delivered');
        box.replaceChildren(h('div', { class: 'stack' },
          h('div', { class: 'row between' }, h('div', { class: 'row' }, PM.status(o.status), PM.payStatus(o.paymentStatus), h('span', { class: 'small muted' }, `${fmt.label(o.paymentMethod)} · ${fmt.dateTime(o.createdAt)}`)), h('strong', { class: 'price' }, money(o.total))),
          h('div', { class: 'grid cols-3 small' },
            h('div', { class: 'card card-pad-sm' }, h('strong', null, 'Buyer'), h('div', { class: 'text-2' }, o.buyer.name, h('br'), o.buyer.email)),
            h('div', { class: 'card card-pad-sm' }, h('strong', null, 'Deliver to'), h('div', { class: 'text-2' }, o.shippingAddress.fullName, h('br'), `${o.shippingAddress.address}, ${o.shippingAddress.city}`, h('br'), o.shippingAddress.phone)),
            h('div', { class: 'card card-pad-sm' }, h('strong', null, 'Delivery & payment'), h('div', { class: 'text-2' }, `${o.delivery.label}`, h('br'), o.paymentRef ? 'Ref ' + o.paymentRef : 'No payment reference'))),
          o.shipments.map((sh) => h('div', { class: 'card card-pad-sm stack-sm' },
            h('div', { class: 'row between' }, h('strong', null, sh.storeName), h('div', { class: 'row', style: 'gap:6px' }, sh.trackingNumber ? h('span', { class: 'xs muted' }, `${sh.carrier || 'Carrier'} ${sh.trackingNumber}`) : null, PM.status(sh.status))),
            sh.items.map((it) => h('div', { class: 'row between small' }, h('span', null, `${it.quantity} × ${it.name}${it.color ? ' (' + it.color + ')' : ''}`), h('span', { class: 'num' }, money(it.lineTotal)))),
            h('div', { class: 'xs muted' }, `Store earns ${money(sh.net)} · commission ${money(sh.commission)}`),
            sh.return ? PM.alert(sh.return.status === 'requested' ? 'warning' : 'info', `Return ${sh.return.status}: ${sh.return.reason}`) : null,
            sh.cashCollected ? PM.alert('success', 'Seller confirmed the cash was collected.') : null,
            sh.refundDue ? h('div', { class: 'alert alert-warning' }, icon('wallet'), h('div', { class: 'grow row between' }, h('span', null, h('strong', null, 'Refund due to the buyer'), ` for this parcel (${money(sh.subtotal - (sh.vendorDiscount || 0) + (sh.tax || 0))}). Send the money, then mark it.`),
              h('button', { class: 'btn btn-sm btn-success', type: 'button', onclick: async () => { if (await PM.confirm({ title: 'Mark refund as sent?', message: `Only confirm after you have really sent the money back to ${o.buyer.name}.`, confirmLabel: 'Yes, refund sent' })) patch({ refundedVendorId: sh.vendorId }, 'Refund marked as sent'); } }, 'Mark refund sent'))) : null)),
          S_totals(o),
          o.paymentStatus === 'pending' && o.status !== 'cancelled' ? h('div', { class: 'card card-pad-sm stack-sm', style: 'border-color:var(--warning)' },
            h('strong', null, `Waiting for payment: ${fmt.label(o.paymentMethod)}`), h('div', { class: 'small text-2' }, o.paymentMethod === 'cod' ? 'Cash on delivery is normally confirmed by the seller after delivery. You can also confirm it here.' : `Check that ${money(o.total)} really arrived${o.momoNumber ? ' from ' + o.momoNumber : ''}, then confirm. Nothing is marked paid automatically.`),
            h('div', { class: 'row' }, reference, h('button', { class: 'btn btn-success', type: 'button', onclick: async () => { if (await PM.confirm({ title: 'Confirm payment received?', message: `This marks order ${o.id} as paid (${money(o.total)}), unlocks the sellers' earnings and gives the buyer their reward points.`, confirmLabel: 'Yes, payment received' })) patch({ paymentStatus: 'paid', reference: reference.value }, 'Payment confirmed'); } }, icon('check'), 'Confirm payment received'))) : null,
          h('div', { class: 'card card-pad-sm row between' }, h('div', { class: 'row' }, h('strong', { class: 'small' }, 'Correct payment status'), pay, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => patch({ paymentStatus: pay.value }, 'Payment status updated') }, 'Save')),
            canCancel ? h('button', { class: 'btn btn-danger', type: 'button', onclick: () => cancel(o, layer) }, icon('x'), 'Cancel order as admin') : h('span', { class: 'xs muted' }, 'Nothing left to cancel'))));
      } catch (e) { box.replaceChildren(PM.errorState(e)); }
    }
    const S_totals = (o) => h('div', { style: 'max-width:320px;margin-left:auto;width:100%' },
      [['Subtotal', o.subtotal], ['Discount', -o.discount], ['Shipping', o.shippingFee], ['Tax', o.tax]].filter(([, v]) => v).map(([k, v]) => h('div', { class: 'sum-row' }, h('span', null, k), h('span', null, (v < 0 ? '−' : '') + money(Math.abs(v))))), h('div', { class: 'sum-row total' }, h('span', null, 'Total'), h('span', null, money(o.total))));
    function cancel(o, parent) {
      const reason = PM.input({ placeholder: 'Reason shown to the buyer and the stores', maxLength: 300 });
      PM.modal({ title: `Cancel order ${o.id}?`, content: h('div', { class: 'stack' }, PM.alert('warning', 'Every parcel that has not been delivered is cancelled. Parcels still in the warehouse get their reserved stock back. If the order was paid, a refund is flagged for you to send and mark manually. This cannot be undone.'), PM.field('Reason', reason, { required: true })),
        actions: [{ label: 'Keep order' }, { label: 'Cancel order', kind: 'danger solid', onClick: async () => { try { await api(`/admin/orders/${o.id}/cancel`, { method: 'POST', body: { reason: reason.value } }); PM.toast('Order cancelled'); parent.close(); load(); } catch (e) { PM.toast(e.message, 'error'); return false; } } }] });
    }
    async function load() {
      try {
        const d = await api('/admin/orders' + PM.qs({ ...state, limit: 10 }));
        const c = d.counts;
        tabsBox.replaceChildren(PM.tabs([{ id: '', label: 'All', count: c.all }, { id: 'placed', label: 'New', count: c.placed }, { id: 'processing', label: 'Processing', count: c.processing }, { id: 'shipped', label: 'Shipped', count: c.shipped }, { id: 'delivered', label: 'Delivered', count: c.delivered }, { id: 'cancelled', label: 'Cancelled', count: c.cancelled }, { id: 'returns', label: 'Return requests', count: c.returns }, { id: 'unpaid', label: 'Awaiting payment', count: c.unpaid }, { id: 'refunds', label: 'Refunds due', count: c.refunds }], state.status, (id) => { state.status = id; state.page = 1; load(); }));
        tbl.update(d.orders);
        pager.replaceChildren(PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }));
      } catch (e) { pager.replaceChildren(PM.errorState(e, load)); }
    }
    load();
    if (ctx.query.get('open')) setTimeout(() => detail(ctx.query.get('open')), 300); // deep link from the Payments page
    return h('div', null, PM.dash.title('All orders', 'Every order on the platform, across all stores. Open one to confirm payments, send refunds or step in when something goes wrong.'),
      h('div', { class: 'toolbar' }, PM.dash.searchBox((q) => { state.q = q; state.page = 1; load(); }, 'Search order, buyer or store')), tabsBox, tbl.el, pager);
  });

  // =========================================================== REVIEW MODERATION
  A.page('/reviews', async () => {
    const state = { rating: '', photos: '', q: '', page: 1 };
    const list = h('div', { class: 'stack' });
    async function load() {
      try {
        const d = await api('/admin/reviews' + PM.qs({ ...state, limit: 8 }));
        list.replaceChildren(...(d.reviews.length ? d.reviews.map((r) => h('article', { class: 'card card-pad-sm stack-sm' },
          h('div', { class: 'row between' }, h('div', { class: 'row' }, PM.stars(r.rating), r.verified ? PM.badge('Verified purchase', 'success') : PM.badge('Not verified'), h('span', { class: 'xs muted' }, `${r.userName} · ${fmt.date(r.createdAt)}`)),
            h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: async () => { if (await PM.confirm({ title: 'Remove this review?', message: 'It disappears from the product page and the rating is recalculated. Use this for abuse, spam or fake reviews.', confirmLabel: 'Remove', danger: true })) { await api('/admin/reviews/' + r.id, { method: 'DELETE' }); PM.toast('Review removed'); load(); } } }, icon('trash'), 'Remove')),
          h('div', { class: 'xs muted' }, `${r.product} · ${r.store}`), r.title ? h('strong', null, r.title) : null, h('p', { class: 'mb-0' }, r.body),
          r.photos.length ? h('div', { class: 'review-photos' }, r.photos.map((u) => PM.img(u, 'Review photo'))) : null, r.reply ? h('div', { class: 'reply' }, h('strong', null, 'Store reply: '), r.reply) : null)) : [PM.empty({ icon: 'star', title: 'No reviews match' })]),
          PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }));
      } catch (e) { list.replaceChildren(PM.errorState(e, load)); }
    }
    load();
    return h('div', { class: 'stack' }, PM.dash.title('Review moderation', 'Keep reviews honest. Remove spam, abuse and fakes.'),
      h('div', { class: 'toolbar', style: 'margin:0' }, PM.dash.searchBox((q) => { state.q = q; state.page = 1; load(); }, 'Search reviews'),
        PM.select([{ value: '', label: 'All ratings' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} star${n > 1 ? 's' : ''}` }))], '', { 'aria-label': 'Rating', style: 'width:auto', onchange: (e) => { state.rating = e.target.value; state.page = 1; load(); } }),
        PM.check('With photos only', { onchange: (e) => { state.photos = e.target.checked ? '1' : ''; state.page = 1; load(); } })), list);
  });

  // =========================================================== COUPONS
  A.page('/coupons', async () => {
    const root = h('div');
    async function draw() {
      const { coupons } = await api('/admin/coupons');
      root.replaceChildren(PM.table({ rowKey: 'code', columns: [
        { key: 'code', label: 'Code', sortable: true, render: (c) => h('span', { class: 'code' }, c.code) }, { key: 'scope', label: 'Applies to', sortable: true },
        { key: 'v', label: 'Discount', render: (c) => (c.type === 'percent' ? `${c.value}%` : money(c.value)) + (c.minSpend ? ` (min ${money(c.minSpend)})` : '') },
        { key: 'used', label: 'Used', align: 'r', sortable: true, render: (c) => `${c.used || 0}${c.usageLimit ? ' / ' + c.usageLimit : ''}` }, { key: 'endsAt', label: 'Ends', render: (c) => (c.endsAt ? fmt.date(c.endsAt) : 'No end') },
        { key: 'active', label: 'Active', render: (c) => PM.switch({ checked: c.active, 'aria-label': `Coupon ${c.code} active`, onchange: async (e) => { try { await api('/admin/coupons/' + c.code, { method: 'PATCH', body: { active: e.target.checked } }); } catch (x) { PM.toast(x.message, 'error'); } } }) },
        { key: 'x', label: '', align: 'r', render: (c) => h('button', { class: 'btn btn-danger btn-sm', type: 'button', 'aria-label': `Delete ${c.code}`, onclick: async () => { if (await PM.confirm({ title: `Delete ${c.code}?`, message: 'Buyers can no longer use this code.', confirmLabel: 'Delete', danger: true })) { await api('/admin/coupons/' + c.code, { method: 'DELETE' }); draw(); } } }, icon('trash')) },
      ], rows: coupons }).el);
    }
    function create() {
      const f = { code: PM.input({ placeholder: 'WELCOME20', style: 'text-transform:uppercase' }), type: PM.select([{ value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }], 'percent'), value: PM.input({ type: 'number', min: 1 }), min: PM.input({ type: 'number', min: 0 }), max: PM.input({ type: 'number', min: 0 }), limit: PM.input({ type: 'number', min: 0 }), ends: PM.input({ type: 'datetime-local', value: localIn(30) }), desc: PM.input({ maxLength: 120 }) };
      const err = PM.errorBox();
      PM.modal({ title: 'New platform coupon', content: h('div', { class: 'stack' }, h('div', { class: 'form-grid' }, PM.field('Code', f.code, { required: true }), PM.field('Type', f.type), PM.field('Value', f.value, { required: true, hint: '% or amount' }), PM.field('Minimum spend', f.min), PM.field('Max discount (for %)', f.max), PM.field('Usage limit', f.limit, { hint: '0 = unlimited' }), PM.field('Ends', f.ends)), PM.field('Description', f.desc), err),
        actions: [{ label: 'Cancel' }, { label: 'Create', kind: 'primary', onClick: async () => { try { await api('/admin/coupons', { method: 'POST', body: { code: f.code.value, type: f.type.value, value: Number(f.value.value), minSpend: f.min.value, maxDiscount: f.max.value, usageLimit: f.limit.value, endsAt: f.ends.value ? new Date(f.ends.value).toISOString() : null, description: f.desc.value } }); PM.toast('Coupon created'); draw(); } catch (e) { err.show(e.message); return false; } } }] });
    }
    await draw();
    return h('div', null, PM.dash.title('Coupons', 'Platform-wide codes and every store’s own codes in one place.', h('button', { class: 'btn btn-primary', type: 'button', onclick: create }, icon('plus'), 'New coupon')), root);
  });

  // =========================================================== COMMUNICATIONS
  A.page('/communications', async () => {
    const [{ broadcasts }, { subscribers }] = await Promise.all([api('/admin/broadcasts'), api('/admin/subscribers')]);
    const audience = PM.select([{ value: 'buyers', label: 'All buyers' }, { value: 'vendors', label: 'All sellers and their staff' }, { value: 'everyone', label: 'Everyone' }], 'buyers');
    const title = PM.input({ maxLength: 80, placeholder: 'e.g. Weekend flash sale' }); const body = PM.textarea({ rows: 3, maxLength: 300, placeholder: 'Keep it short: this shows in the notification bell.' }); const link = PM.input({ placeholder: '#/shop?deals=1 (optional)' });
    const err = PM.errorBox();
    return h('div', { class: 'stack' }, PM.dash.title('Communications', 'Send announcements to users and see who subscribed to the newsletter.'),
      h('div', { class: 'two-col' },
        h('form', { class: 'card card-pad stack', onsubmit: async (e) => {
          e.preventDefault(); err.clear();
          if (!(await PM.confirm({ title: 'Send this announcement?', message: `It goes to ${audience.options[audience.selectedIndex].text.toLowerCase()} as a notification. It cannot be recalled.`, confirmLabel: 'Send' }))) return;
          try { const r = await PM.busy(e.submitter, () => api('/admin/broadcast', { method: 'POST', body: { audience: audience.value, title: title.value, body: body.value, link: link.value } })); PM.toast(`Sent to ${r.sent} people`); A.router.render(); } catch (x) { err.show(x.message); }
        } }, h('h3', { style: 'margin:0' }, 'New announcement'), PM.field('Send to', audience), PM.field('Title', title, { required: true }), PM.field('Message', body, { required: true }), PM.field('Link', link, { hint: 'Where the notification takes people.' }), err, h('button', { class: 'btn btn-primary', type: 'submit', style: 'justify-self:start' }, icon('megaphone'), 'Send announcement')),
        PM.dash.panel('Recent announcements', broadcasts.length ? h('div', { class: 'stack-sm' }, broadcasts.map((b) => h('div', { class: 'card card-pad-sm' }, h('div', { class: 'small' }, b.detail), h('div', { class: 'xs muted' }, `${fmt.dateTime(b.at)} · ${b.who}`)))) : h('p', { class: 'muted' }, 'Nothing sent yet.'))),
      PM.dash.panel(`Newsletter subscribers (${subscribers.length})`, subscribers.length ? h('div', { class: 'stack-sm' }, h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => PM.downloadCsv('subscribers.csv', [['Email'], ...subscribers.map((s) => [s])]) }, icon('download'), 'Export CSV')), h('div', { class: 'row' }, subscribers.slice(0, 60).map((s) => h('span', { class: 'chip', style: 'cursor:default' }, s)))) : h('p', { class: 'muted' }, 'No subscribers yet. The sign-up box is at the bottom of the shop home page.')));
  });

  // =========================================================== SYSTEM HEALTH
  A.page('/system', async () => {
    const d = await api('/admin/system');
    const dur = (s) => { const dd = Math.floor(s / 86400); const hh = Math.floor((s % 86400) / 3600); const mm = Math.floor((s % 3600) / 60); return `${dd ? dd + 'd ' : ''}${hh}h ${mm}m`; };
    const bytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
    const allGood = d.checks.every((c) => c.ok);
    return h('div', { class: 'stack' },
      PM.dash.title('System health', 'How the application itself is doing.', h('button', { class: 'btn', type: 'button', onclick: async (e) => {
        try {
          await PM.busy(e.currentTarget, async () => {
            const res = await fetch('/api/admin/export', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const a = h('a', { href: URL.createObjectURL(blob), download: `princemall-export-${new Date().toISOString().slice(0, 10)}.json` });
            document.body.append(a); a.click(); a.remove();
          });
          PM.toast('Data export downloaded');
        } catch (x) { PM.toast(x.message, 'error'); }
      } }, icon('download'), 'Export data (JSON)')),
      allGood ? PM.alert('success', 'All checks passed.') : PM.alert('warning', 'Some checks need attention (below).'),
      h('div', { class: 'grid cols-4' }, PM.kpi({ label: 'Uptime', value: dur(d.server.uptimeSeconds), icon: 'clock', note: `Started ${fmt.dateTime(d.server.startedAt)}` }), PM.kpi({ label: 'Memory', value: d.server.memoryMb + ' MB', icon: 'cpu', note: `Heap ${d.server.heapMb} MB` }), PM.kpi({ label: 'API requests', value: fmt.num(d.server.requests), icon: 'zap', note: 'since last start' }), PM.kpi({ label: 'Signed-in sessions', value: String(d.sessions.active), icon: 'key', note: `${d.sessions.guests} guest carts` })),
      h('div', { class: 'grid cols-2' },
        PM.dash.panel('Health checks', h('div', { class: 'stack-sm' }, d.checks.map((c) => h('div', { class: 'row between' }, h('span', { class: 'row-nowrap' }, icon(c.ok ? 'check' : 'alert'), c.name), c.ok ? PM.badge('OK', 'success') : PM.badge(c.detail || 'Check', 'warning'))))),
        PM.dash.panel('Records', h('table', { class: 'table' }, h('tbody', null, Object.entries(d.data).map(([k, v]) => h('tr', null, h('td', null, fmt.label(k.replace(/([A-Z])/g, ' $1').toLowerCase())), h('td', { class: 'ta-r num' }, fmt.num(v)))))))),
      h('div', { class: 'grid cols-2' },
        PM.dash.panel('Storage', h('div', { class: 'stack-sm' }, h('div', { class: 'sum-row' }, h('span', null, 'Database files'), h('strong', null, bytes(d.storage.total))), d.storage.files.map((f) => h('div', { class: 'sum-row xs muted' }, h('span', null, f.name), h('span', null, bytes(f.size)))), h('div', { class: 'sum-row' }, h('span', null, 'Uploaded images'), h('strong', null, `${d.storage.uploads} files · ${bytes(d.storage.uploadBytes)}`)), h('p', { class: 'xs muted mb-0' }, 'For a real backup, copy the data/ and public/uploads/ folders while the server is stopped.'))),
        PM.dash.panel('Recent server errors', d.errors.length ? h('div', { class: 'stack-sm' }, d.errors.map((e) => h('div', { class: 'card card-pad-sm' }, h('div', { class: 'small bold' }, e.route), h('div', { class: 'xs muted' }, `${fmt.dateTime(e.at)} · ${e.message}`)))) : h('p', { class: 'muted' }, 'No unexpected errors since the server started.'))),
      h('p', { class: 'xs muted' }, `Node ${d.server.node} on ${d.server.platform}. Payments are simulated and email is printed to the server console in this demo.`));
  });
})();
