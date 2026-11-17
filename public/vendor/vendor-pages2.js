'use strict';
// Seller portal pages (2/2): marketing, analytics, finance, reviews, messages, team, settings.

(function () {
  const { h, api, icon, fmt } = PM;
  const V = window.V;
  const money = fmt.price;
  const toIso = (local) => (local ? new Date(local).toISOString() : null);
  const localIn = (days) => { const d = new Date(Date.now() + days * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  // =========================================================== MARKETING
  V.page('/marketing', 'marketing', async () => {
    const body = h('div');
    const panes = {
      async coupons() {
        const { coupons } = await api('/vendor/coupons');
        const root = h('div', { class: 'stack' });
        const draw = (list) => root.replaceChildren(h('div', { class: 'row between' }, h('p', { class: 'muted mb-0' }, 'Codes buyers can enter in their cart. They only discount your products.'), h('button', { class: 'btn btn-primary', type: 'button', onclick: create }, icon('plus'), 'New coupon')),
          PM.table({ rowKey: 'code', columns: [
            { key: 'code', label: 'Code', render: (c) => h('span', { class: 'code' }, c.code) }, { key: 'v', label: 'Discount', render: (c) => (c.type === 'percent' ? `${c.value}%` : money(c.value)) },
            { key: 'minSpend', label: 'Min. spend', render: (c) => (c.minSpend ? money(c.minSpend) : '—') }, { key: 'used', label: 'Used', render: (c) => `${c.used || 0}${c.usageLimit ? ' / ' + c.usageLimit : ''}` },
            { key: 'endsAt', label: 'Ends', render: (c) => (c.endsAt ? fmt.date(c.endsAt) : 'No end') },
            { key: 'active', label: 'Active', render: (c) => PM.switch({ checked: c.active, 'aria-label': `Coupon ${c.code} active`, onchange: async (e) => { try { await api('/vendor/coupons/' + c.code, { method: 'PATCH', body: { active: e.target.checked } }); } catch (x) { PM.toast(x.message, 'error'); } } }) },
            { key: 'x', label: '', align: 'r', render: (c) => h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: async () => { await api('/vendor/coupons/' + c.code, { method: 'DELETE' }); const r = await api('/vendor/coupons'); draw(r.coupons); } }, icon('trash')) },
          ], rows: list, empty: PM.empty({ icon: 'tag', title: 'No coupons yet', text: 'Create a code to reward loyal customers.' }) }).el);
        function create() {
          const f = { code: PM.input({ placeholder: 'SUMMER10', style: 'text-transform:uppercase' }), type: PM.select([{ value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }], 'percent'), value: PM.input({ type: 'number', min: 1 }), min: PM.input({ type: 'number', min: 0 }), max: PM.input({ type: 'number', min: 0 }), limit: PM.input({ type: 'number', min: 0 }), ends: PM.input({ type: 'datetime-local', value: localIn(30) }), desc: PM.input({ maxLength: 120 }) };
          const err = PM.errorBox();
          PM.modal({ title: 'New coupon', content: h('div', { class: 'stack' }, h('div', { class: 'form-grid' }, PM.field('Code', f.code, { required: true }), PM.field('Type', f.type), PM.field('Value', f.value, { required: true, hint: '% or amount' }), PM.field('Minimum spend', f.min), PM.field('Max discount (for %)', f.max), PM.field('Usage limit', f.limit, { hint: '0 = unlimited' }), PM.field('Ends', f.ends)), PM.field('Description', f.desc), err),
            actions: [{ label: 'Cancel' }, { label: 'Create', kind: 'primary', onClick: async () => { try { await api('/vendor/coupons', { method: 'POST', body: { code: f.code.value, type: f.type.value, value: Number(f.value.value), minSpend: f.min.value, maxDiscount: f.max.value, usageLimit: f.limit.value, endsAt: toIso(f.ends.value), description: f.desc.value, public: true } }); PM.toast('Coupon created'); draw((await api('/vendor/coupons')).coupons); } catch (e) { err.show(e.message); return false; } } }] });
        }
        draw(coupons);
        return root;
      },
      async flash() {
        const root = h('div', { class: 'stack' });
        const draw = async () => {
          const [{ sales }, { products }] = await Promise.all([api('/vendor/flash'), api('/vendor/products?limit=100&status=active')]);
          root.replaceChildren(h('div', { class: 'row between' }, h('p', { class: 'muted mb-0' }, 'Limited-time prices with a countdown on the product page and home page.'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => create(products) }, icon('zap'), 'New flash sale')),
            PM.table({ columns: [{ key: 'name', label: 'Product', render: (p) => h('div', { class: 'cell-product' }, PM.img(p.image, ''), h('strong', null, p.name)) }, { key: 'price', label: 'Regular price', render: (p) => money(p.price) }, { key: 'flash', label: 'Flash price', render: (p) => h('strong', null, money(p.flash.price)) }, { key: 'e', label: 'Ends', render: (p) => (new Date(p.flash.endsAt) > new Date() ? fmt.dateTime(p.flash.endsAt) : PM.badge('Ended', 'neutral')) }, { key: 'x', label: '', align: 'r', render: (p) => h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { await api('/vendor/flash/' + p.id, { method: 'DELETE' }); draw(); } }, 'End now') }], rows: sales, empty: PM.empty({ icon: 'zap', title: 'No flash sales', text: 'Pick a product and a price to create urgency.' }) }).el);
        };
        function create(products) {
          const sel = PM.select(products.map((p) => ({ value: p.id, label: `${p.name} (${money(p.price)})` })), '');
          const price = PM.input({ type: 'number', min: 1 }); const ends = PM.input({ type: 'datetime-local', value: localIn(1) });
          PM.modal({ title: 'New flash sale', content: h('div', { class: 'stack' }, PM.field('Product', sel), PM.field('Flash price', price, { required: true, hint: 'Must be lower than the regular price.' }), PM.field('Ends at', ends, { required: true })),
            actions: [{ label: 'Cancel' }, { label: 'Start sale', kind: 'primary', onClick: async () => { try { await api('/vendor/flash', { method: 'POST', body: { productId: sel.value, price: Number(price.value), endsAt: toIso(ends.value) } }); PM.toast('Flash sale started'); draw(); } catch (e) { PM.toast(e.message, 'error'); return false; } } }] });
        }
        await draw();
        return root;
      },
      async discounts() {
        const { products } = await api('/vendor/products?limit=100');
        const root = h('div', { class: 'stack' });
        const draw = (list) => {
          const on = list.filter((p) => p.comparePrice && p.comparePrice > p.price);
          const pct = PM.input({ type: 'number', min: 1, max: 90, value: 10 });
          const tbl = PM.table({ selectable: true, columns: [{ key: 'name', label: 'Product', render: (p) => h('div', { class: 'cell-product' }, PM.img(p.image, ''), h('strong', null, p.name)) }, { key: 'price', label: 'Price', render: (p) => h('span', null, money(p.price), p.comparePrice ? h('span', { class: 'price-old' }, money(p.comparePrice)) : null) }, { key: 's', label: '', render: (p) => (p.comparePrice && p.comparePrice > p.price ? PM.badge(`-${Math.round((1 - p.price / p.comparePrice) * 100)}% active`, 'success') : '') }], rows: list.filter((p) => p.status !== 'blocked') });
          root.replaceChildren(PM.alert('info', 'Select products and apply a percentage. The old price is kept so shoppers see the saving. End a campaign any time to restore prices.'),
            h('div', { class: 'row' }, PM.field('Discount %', pct), h('button', { class: 'btn btn-primary', type: 'button', style: 'align-self:end', onclick: () => act('discount', { percent: Number(pct.value) }) }, icon('percent'), 'Apply to selected'), h('button', { class: 'btn', type: 'button', style: 'align-self:end', onclick: () => act('end_discount') }, 'End discount on selected')),
            tbl.el, h('p', { class: 'small muted' }, `${on.length} product(s) currently discounted.`));
          async function act(action, extra = {}) { const ids = tbl.selected(); if (!ids.length) return PM.toast('Select at least one product', 'error'); try { await api('/vendor/products/bulk', { method: 'POST', body: { ids, action, ...extra } }); PM.toast('Prices updated'); draw((await api('/vendor/products?limit=100')).products); } catch (e) { PM.toast(e.message, 'error'); } }
        };
        draw(products);
        return root;
      },
      async banners() {
        const root = h('div', { class: 'stack' });
        const draw = (list) => root.replaceChildren(h('div', { class: 'row between' }, h('p', { class: 'muted mb-0' }, 'Banners appear on your public store page.'), h('button', { class: 'btn btn-primary', type: 'button', onclick: add }, icon('plus'), 'Add banner')),
          list.length ? h('div', { class: 'grid cols-3' }, list.map((b) => h('div', { class: 'card' }, PM.img(b.image, b.title, { style: 'height:120px;width:100%;object-fit:cover;border-radius:16px 16px 0 0' }), h('div', { class: 'card-pad-sm stack-sm' }, h('strong', null, b.title), h('div', { class: 'row between' }, PM.switch({ checked: b.active, 'aria-label': 'Banner visible', onchange: async (e) => { await api('/vendor/banners/' + b.id, { method: 'PATCH', body: { active: e.target.checked } }); } }), h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: async () => draw((await api('/vendor/banners/' + b.id, { method: 'DELETE' })).banners) }, icon('trash'))))))) : PM.empty({ icon: 'image', title: 'No banners', text: 'Add a banner to promote an offer.' }));
        function add() {
          const title = PM.input({ maxLength: 80 }); const link = PM.input({ placeholder: '#/store/your-store (optional)' }); const pic = PM.imagePicker({ max: 1 });
          PM.modal({ title: 'Add banner', content: h('div', { class: 'stack' }, PM.field('Title', title, { required: true }), PM.field('Link', link), h('div', null, h('div', { class: 'label' }, 'Image'), pic)), actions: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', onClick: async () => { try { if (!pic.values()[0]) throw new Error('Upload an image'); draw((await api('/vendor/banners', { method: 'POST', body: { title: title.value, link: link.value, image: pic.values()[0] } })).banners); } catch (e) { PM.toast(e.message, 'error'); return false; } } }] });
        }
        draw((await api('/vendor/banners')).banners);
        return root;
      },
    };
    const show = (id) => PM.dash.load(body, panes[id]);
    const tabs = PM.tabs([{ id: 'coupons', label: 'Coupons' }, { id: 'flash', label: 'Flash sales' }, { id: 'discounts', label: 'Discount campaigns' }, { id: 'banners', label: 'Banners' }], 'coupons', show);
    show('coupons');
    return h('div', null, PM.dash.title('Marketing', 'Promotions that bring buyers back.'), tabs, body);
  });

  // =========================================================== ANALYTICS
  V.page('/analytics', 'analytics', async () => {
    const state = { days: 90 };
    const box = h('div', { class: 'stack' });
    async function draw() {
      try {
        const d = await api('/vendor/analytics?days=' + state.days);
        box.replaceChildren(
          h('div', { class: 'two-col' }, PM.dash.panel('Revenue trend', PM.charts.line({ labels: d.revenueTrend.labels, series: [{ name: 'Revenue', values: d.revenueTrend.revenue }], fmt: money, height: 260 })), PM.dash.panel('Sales by category', d.categoryShare.length ? PM.charts.donut({ items: d.categoryShare, size: 160, fmt: money, centerLabel: 'Revenue' }) : h('p', { class: 'muted' }, 'No data yet.'))),
          h('div', { class: 'two-col' }, PM.dash.panel('Customer growth', PM.charts.line({ labels: d.customerGrowth.map((g) => g.label), series: [{ name: 'Total customers', values: d.customerGrowth.map((g) => g.total), color: 'var(--chart-4)' }], height: 220 })), PM.dash.panel('Sales by city', d.geography.length ? PM.charts.hbar(d.geography.map((g) => ({ label: g.city, value: g.revenue })), { fmt: money }) : h('p', { class: 'muted' }, 'No data yet.'))),
          h('div', { class: 'grid cols-3' }, PM.kpi({ label: 'Product views', value: fmt.num(d.funnel.views), icon: 'eye' }), PM.kpi({ label: 'Orders in period', value: fmt.num(d.funnel.orders), icon: 'package' }), PM.kpi({ label: 'Conversion', value: fmt.pct(d.funnel.conversion), icon: 'percent', note: 'Orders ÷ all-time views' })),
          PM.dash.panel('Product performance', PM.table({ columns: [{ key: 'name', label: 'Product', sortable: true }, { key: 'units', label: 'Units', sortable: true, align: 'r' }, { key: 'revenue', label: 'Revenue', sortable: true, align: 'r', render: (p) => money(p.revenue) }, { key: 'views', label: 'Views', sortable: true, align: 'r', render: (p) => fmt.num(p.views) }, { key: 'conversion', label: 'Conversion', sortable: true, align: 'r', render: (p) => fmt.pct(p.conversion) }], rows: d.topProducts, rowKey: 'id' }).el, { flush: false }));
      } catch (e) { box.replaceChildren(PM.errorState(e, draw)); }
    }
    draw();
    return h('div', null, PM.dash.title('Analytics', 'Understand what sells and who buys.', PM.dash.periodSelect([[30, 'Last 30 days'], [90, 'Last 90 days'], [180, 'Last 180 days']], 90, (n) => { state.days = n; draw(); })), box);
  });

  // =========================================================== FINANCE
  V.page('/finance', 'owner', async () => {
    const d = await api('/vendor/finance');
    const s = d.summary;
    const invoice = (t) => PM.modal({ title: t.invoice, size: 'lg', content: h('div', { class: 'invoice' }, h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, 'SELLER STATEMENT'), h('div', { class: 'small' }, fmt.date(t.at))),
      h('p', { class: 'small' }, `Order ${t.orderId} · ${V.info.vendor.storeName}`), h('table', null, h('tbody', null, [['Sales', t.gross], ['Platform commission', -t.commission], ['Net earnings', t.net], ['Tax collected on your behalf', t.tax]].map(([k, v]) => h('tr', null, h('td', null, k), h('td', { style: 'text-align:right' }, money(v)))))), h('p', { class: 'xs' }, t.refunded ? 'This parcel was refunded and is excluded from your revenue.' : 'Demo statement, not a tax document.')),
      actions: [{ label: 'Close' }, { label: 'Print', kind: 'primary', onClick: () => { window.print(); return false; } }] });
    const payout = () => {
      const amount = PM.input({ type: 'number', min: 5000, value: Math.max(5000, s.available) });
      PM.modal({ title: 'Request a payout', content: h('div', { class: 'stack' }, PM.alert('info', `Available: ${money(s.available)}. Paid to ${fmt.label(d.payment.method || 'your account')} ${d.payment.account || '(add one in Settings)'}.`), PM.field('Amount', amount, { hint: 'Minimum 5,000.' })),
        actions: [{ label: 'Cancel' }, { label: 'Request payout', kind: 'primary', onClick: async () => { try { await api('/vendor/payouts', { method: 'POST', body: { amount: Number(amount.value) } }); PM.toast('Payout requested'); V.router.render(); } catch (e) { PM.toast(e.message, 'error'); return false; } } }] });
    };
    const tx = PM.table({ rowKey: 'orderId', columns: [{ key: 'at', label: 'Date', sortable: true, render: (t) => fmt.date(t.at) }, { key: 'orderId', label: 'Order', sortable: true }, { key: 'status', label: 'Status', render: (t) => (t.refunded ? PM.badge('Refunded', 'neutral') : PM.status(t.status)) }, { key: 'gross', label: 'Sales', align: 'r', sortable: true, render: (t) => money(t.gross) }, { key: 'commission', label: 'Commission', align: 'r', render: (t) => '−' + money(t.commission) }, { key: 'net', label: 'Net', align: 'r', sortable: true, render: (t) => h('strong', null, money(t.net)) }, { key: 'x', label: 'Invoice', align: 'r', render: (t) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => invoice(t) }, icon('receipt'), 'View') }], rows: d.transactions });
    return h('div', { class: 'stack' }, PM.dash.title('Finance', 'Earnings, commission, taxes and payouts.', h('button', { class: 'btn', type: 'button', onclick: () => PM.downloadCsv('transactions.csv', [['Date', 'Order', 'Status', 'Sales', 'Commission', 'Net', 'Tax', 'Invoice'], ...d.transactions.map((t) => [t.at.slice(0, 10), t.orderId, t.refunded ? 'refunded' : t.status, t.gross, t.commission, t.net, t.tax, t.invoice])]) }, icon('download'), 'Export CSV'), h('button', { class: 'btn btn-primary', type: 'button', onclick: payout }, icon('wallet'), 'Request payout')),
      h('div', { class: 'grid cols-4' }, PM.kpi({ label: 'Available to withdraw', value: money(s.available), icon: 'wallet' }), PM.kpi({ label: 'Pending (not delivered)', value: money(s.pending), icon: 'clock' }), PM.kpi({ label: 'Paid out', value: money(s.paidOut), icon: 'check' }), PM.kpi({ label: 'Commission paid', value: money(s.commission), icon: 'percent', note: `Your rate: ${fmt.pct(d.commissionRate * 100)}` }), PM.kpi({ label: 'Gross sales', value: money(s.gross), icon: 'dollar' }), PM.kpi({ label: 'Taxes collected', value: money(s.taxes), icon: 'receipt' }), PM.kpi({ label: 'Refunded', value: money(s.refunded), icon: 'undo' })),
      PM.dash.panel('Monthly earnings', d.monthly.length ? PM.charts.bar({ labels: d.monthly.map((m) => m.month), series: [{ name: 'Sales', values: d.monthly.map((m) => m.gross), color: 'var(--chart-1)' }, { name: 'Net earnings', values: d.monthly.map((m) => m.net), color: 'var(--chart-4)' }], fmt: money, height: 240 }) : h('p', { class: 'muted' }, 'No sales yet.')),
      PM.dash.panel('Transactions', tx.el, { flush: true }),
      PM.dash.panel('Payouts', PM.table({ columns: [{ key: 'createdAt', label: 'Requested', render: (p) => fmt.date(p.createdAt) }, { key: 'amount', label: 'Amount', align: 'r', render: (p) => money(p.amount) }, { key: 'method', label: 'Method', render: (p) => fmt.label(p.method) }, { key: 'status', label: 'Status', render: (p) => PM.status(p.status) }], rows: d.payouts, empty: PM.empty({ icon: 'wallet', title: 'No payouts yet' }) }).el, { flush: true }));
  });

  // =========================================================== REVIEWS
  V.page('/reviews', 'reviews', async () => {
    const state = { filter: '', page: 1 };
    const insights = h('div', { class: 'grid cols-3' }); const list = h('div', { class: 'stack' });
    async function load() {
      try {
        const d = await api('/vendor/reviews' + PM.qs({ ...state, limit: 8 }));
        const i = d.insights;
        insights.replaceChildren(PM.kpi({ label: 'Average rating', value: `${i.average} / 5`, icon: 'star', note: `${i.count} reviews` }), PM.dash.panel('Rating breakdown', h('div', { class: 'stack-sm' }, [5, 4, 3, 2, 1].map((n) => h('div', { class: 'rating-bar' }, h('span', null, `${n} ★`), h('div', { class: 'progress' }, h('span', { style: `width:${i.count ? (i.distribution[n - 1] / i.count) * 100 : 0}%` })), h('span', { class: 'muted' }, String(i.distribution[n - 1])))))), PM.kpi({ label: 'Awaiting your reply', value: String(i.unanswered), icon: 'message', note: `${i.verifiedShare}% verified purchases` }));
        list.replaceChildren(...(d.reviews.length ? d.reviews.map((rv) => {
          const reply = PM.textarea({ rows: 2, placeholder: 'Write a public reply…', maxLength: 1000 });
          return h('article', { class: 'card card-pad-sm stack-sm' }, h('div', { class: 'row-nowrap' }, PM.img(rv.productImage, '', { style: 'width:44px;height:44px;border-radius:8px;object-fit:cover' }), h('div', { class: 'grow' }, h('strong', { class: 'small' }, rv.productName), h('div', { class: 'row' }, PM.stars(rv.rating), rv.verified ? PM.badge('Verified', 'success') : null, h('span', { class: 'xs muted' }, `${rv.userName} · ${fmt.date(rv.createdAt)}`)))),
            rv.title ? h('strong', null, rv.title) : null, h('p', { class: 'mb-0' }, rv.body), rv.photos && rv.photos.length ? h('div', { class: 'review-photos' }, rv.photos.map((u) => PM.img(u, 'Customer photo'))) : null,
            rv.reply ? h('div', { class: 'reply' }, h('strong', null, 'Your reply'), h('div', null, rv.reply.body)) : h('form', { class: 'stack-sm', onsubmit: async (e) => { e.preventDefault(); if (!reply.value.trim()) return; try { await PM.busy(e.submitter, () => api(`/vendor/reviews/${rv.id}/reply`, { method: 'POST', body: { body: reply.value } })); PM.toast('Reply posted'); load(); } catch (x) { PM.toast(x.message, 'error'); } } }, reply, h('button', { class: 'btn btn-sm btn-primary', type: 'submit', style: 'justify-self:start' }, 'Reply')));
        }) : [PM.empty({ icon: 'star', title: 'No reviews here' })]), PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }));
      } catch (e) { list.replaceChildren(PM.errorState(e, load)); }
    }
    load();
    return h('div', { class: 'stack' }, PM.dash.title('Reviews', 'What customers say about your products.'), insights, PM.tabs([{ id: '', label: 'All' }, { id: 'unanswered', label: 'Needs reply' }, { id: 'negative', label: '1-2 stars' }], '', (id) => { state.filter = id; state.page = 1; load(); }), list);
  });

  // =========================================================== MESSAGES
  V.page('/messages', 'messages', async () => {
    const { conversations } = await api('/vendor/conversations');
    const thread = h('div', { class: 'card card-pad' }, h('p', { class: 'muted' }, conversations.length ? 'Select a conversation.' : 'Customer questions from your product and store pages will appear here.'));
    let timer;
    async function open(id) {
      clearInterval(timer);
      const draw = async () => {
        if (!thread.isConnected) return clearInterval(timer);
        const t = await api('/vendor/conversations/' + id);
        const chat = h('div', { class: 'chat', tabindex: 0, 'aria-label': 'Conversation' }, t.messages.map((m) => h('div', { class: 'bubble' + (m.from === 'vendor' ? ' me' : '') }, m.body, h('small', null, `${m.name} · ${fmt.ago(m.at)}`))));
        const input = PM.input({ placeholder: 'Write a reply…', 'aria-label': 'Reply', maxLength: 2000 });
        const prev = thread.querySelector('input');
        thread.replaceChildren(h('h3', { style: 'margin-top:0' }, t.buyerName), chat, h('form', { class: 'input-group mt-1', onsubmit: async (e) => { e.preventDefault(); if (!input.value.trim()) return; await api(`/vendor/conversations/${id}/messages`, { method: 'POST', body: { body: input.value } }); draw(); } }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Send')));
        chat.scrollTop = chat.scrollHeight;
        if (prev && prev.value) input.value = prev.value;
        V.info.unreadMessages = 0; V.shell.setBadge('messages', 0);
      };
      await draw();
      timer = setInterval(() => draw().catch(() => {}), 12000);
    }
    return h('div', { class: 'stack' }, PM.dash.title('Messages', 'Chat with your customers.'), h('div', { class: 'convo' },
      h('div', { class: 'card', style: 'overflow:hidden;align-self:start' }, conversations.length ? conversations.map((c) => h('button', { class: 'convo-item', type: 'button', onclick: () => open(c.id) }, h('strong', null, c.buyerName), c.unread ? h('span', { class: 'badge badge-accent', style: 'margin-left:8px' }, String(c.unread)) : null, h('div', { class: 'xs muted truncate' }, c.product ? c.product.name : 'General question'), h('div', { class: 'xs muted truncate' }, c.last ? c.last.body : ''))) : h('div', { class: 'card-pad-sm muted small' }, 'No conversations yet.')), thread));
  });

  // =========================================================== TEAM
  V.page('/team', 'owner', async () => {
    const d = await api('/vendor/team');
    const roleHelp = { owner: 'Everything, including finance, team and settings', manager: 'Products, inventory, orders, customers, marketing, analytics, reviews, messages', fulfillment: 'Orders and inventory only', support: 'Reviews, messages and customers only' };
    const add = () => {
      const f = { name: PM.input({ maxLength: 60 }), email: PM.input({ type: 'email' }), pw: PM.input({ type: 'password', autocomplete: 'new-password' }), role: PM.select([{ value: 'manager', label: 'Manager' }, { value: 'fulfillment', label: 'Fulfillment' }, { value: 'support', label: 'Support' }], 'fulfillment') };
      const err = PM.errorBox();
      PM.modal({ title: 'Add a team member', content: h('div', { class: 'stack' }, PM.field('Full name', f.name, { required: true }), PM.field('Email', f.email, { required: true }), PM.field('Temporary password', f.pw, { required: true, hint: 'At least 8 characters. Share it securely and ask them to change it.' }), PM.field('Role', f.role), err),
        actions: [{ label: 'Cancel' }, { label: 'Create account', kind: 'primary', onClick: async () => { try { await api('/vendor/team', { method: 'POST', body: { name: f.name.value, email: f.email.value, password: f.pw.value, role: f.role.value } }); PM.toast('Team member added'); V.router.render(); } catch (e) { err.show(e.message); return false; } } }] });
    };
    return h('div', { class: 'stack' }, PM.dash.title('Team', 'Give staff access without sharing your password.', h('button', { class: 'btn btn-primary', type: 'button', onclick: add }, icon('plus'), 'Add member')),
      PM.dash.panel(null, PM.table({ rowKey: 'userId', columns: [{ key: 'name', label: 'Member', render: (m) => h('div', { class: 'row-nowrap' }, h('span', { class: 'avatar' }, fmt.initials(m.name)), h('div', null, h('strong', null, m.name), h('div', { class: 'xs muted' }, m.email))) }, { key: 'role', label: 'Role', render: (m) => (m.role === 'owner' ? PM.status('owner') : PM.select([{ value: 'manager', label: 'Manager' }, { value: 'fulfillment', label: 'Fulfillment' }, { value: 'support', label: 'Support' }], m.role, { 'aria-label': `Role for ${m.name}`, style: 'width:auto', onchange: async (e) => { try { await api('/vendor/team/' + m.userId, { method: 'PATCH', body: { role: e.target.value } }); PM.toast('Role updated'); } catch (x) { PM.toast(x.message, 'error'); } } })) },
        { key: 'status', label: 'Access', render: (m) => (m.role === 'owner' ? PM.badge('Always', 'brand') : PM.switch({ checked: m.status !== 'suspended', 'aria-label': `Access for ${m.name}`, onchange: async (e) => { await api('/vendor/team/' + m.userId, { method: 'PATCH', body: { status: e.target.checked ? 'active' : 'suspended' } }); } })) },
        { key: 'x', label: '', align: 'r', render: (m) => (m.role === 'owner' ? '' : h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: async () => { if (await PM.confirm({ title: `Remove ${m.name}?`, message: 'Their account is deleted and they are signed out.', confirmLabel: 'Remove', danger: true })) { await api('/vendor/team/' + m.userId, { method: 'DELETE' }); V.router.render(); } } }, 'Remove')) }], rows: d.members }).el, { flush: true }),
      PM.dash.panel('What each role can do', h('dl', { style: 'margin:0', class: 'stack-sm' }, Object.entries(roleHelp).map(([k, v]) => h('div', { class: 'row-nowrap' }, PM.status(k), h('span', { class: 'small text-2' }, v))))));
  });

  // =========================================================== SETTINGS
  V.page('/settings', 'owner', async (ctx) => {
    const v = (await api('/vendor/me')).vendor;
    const body = h('div');
    const save = async (patch, btn) => { try { await PM.busy(btn, () => api('/vendor/store', { method: 'PATCH', body: patch })); PM.toast('Settings saved'); V.info.vendor = (await api('/vendor/me')).vendor; } catch (e) { PM.toast(e.message, 'error'); } };
    const form = (children, build) => h('form', { class: 'card card-pad stack', style: 'max-width:720px', onsubmit: (e) => { e.preventDefault(); save(build(), e.submitter); } }, ...children, h('button', { class: 'btn btn-primary', type: 'submit', style: 'justify-self:start' }, 'Save changes'));
    const panes = {
      profile() {
        const f = { description: PM.textarea({ value: v.description, rows: 3, maxLength: 600 }), phone: PM.input({ value: v.phone }), city: PM.input({ value: v.city }), country: PM.input({ value: v.country }), taxId: PM.input({ value: v.taxId || '' }) };
        return form([PM.field('Store description', f.description), h('div', { class: 'form-grid' }, PM.field('Business phone', f.phone), PM.field('City', f.city), PM.field('Country', f.country), PM.field('Tax ID', f.taxId)), h('p', { class: 'xs muted mb-0' }, `Store name “${v.storeName}” and verification details can only be changed by contacting support.`)], () => ({ description: f.description.value, phone: f.phone.value, city: f.city.value, country: f.country.value, taxId: f.taxId.value }));
      },
      branding() {
        const b = v.branding || {};
        const f = { color: h('input', { type: 'color', value: b.color || '#4f46e5', style: 'width:64px;height:42px;border:1px solid var(--border-strong);border-radius:8px;padding:2px;background:none' }), tagline: PM.input({ value: b.tagline || '', maxLength: 100 }), logo: PM.imagePicker({ values: b.logo ? [b.logo] : [], max: 1 }), banner: PM.imagePicker({ values: b.banner ? [b.banner] : [], max: 1 }) };
        return form([PM.field('Brand color', f.color), PM.field('Tagline', f.tagline), h('div', null, h('div', { class: 'label' }, 'Logo'), f.logo), h('div', null, h('div', { class: 'label' }, 'Cover image'), f.banner)], () => ({ branding: { color: f.color.value, tagline: f.tagline.value, logo: f.logo.values()[0] || '', banner: f.banner.values()[0] || '' } }));
      },
      shipping() {
        const s = v.shipping || {};
        const f = { flat: PM.input({ type: 'number', min: 0, value: s.flatRate }), free: PM.input({ type: 'number', min: 0, value: s.freeOver }), days: PM.input({ type: 'number', min: 0, value: s.processingDays }) };
        return form([PM.alert('info', 'Buyers currently see the platform delivery options at checkout; these values describe your own shipping policy and processing time.'), h('div', { class: 'form-grid' }, PM.field('Flat shipping rate', f.flat), PM.field('Free shipping over', f.free), PM.field('Processing time (days)', f.days))], () => ({ shipping: { flatRate: Number(f.flat.value), freeOver: Number(f.free.value), processingDays: Number(f.days.value) } }));
      },
      payments() {
        const p = v.payment || {};
        const f = { method: PM.select([{ value: 'mobile_money', label: 'Mobile Money' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'paypal', label: 'PayPal' }], p.method), account: PM.input({ value: p.account || '', placeholder: 'Number, IBAN or email' }), name: PM.input({ value: p.accountName || '' }) };
        return form([PM.alert('info', 'Your earnings are paid out to this account after you request a payout.'), h('div', { class: 'form-grid' }, PM.field('Payout method', f.method), PM.field('Account', f.account, { required: true }), PM.field('Account holder', f.name, { required: true }))], () => ({ payment: { method: f.method.value, account: f.account.value, accountName: f.name.value } }));
      },
      tax() {
        const f = { collect: PM.check('Collect sales tax on my products', { checked: (v.tax || {}).collect !== false }) };
        return form([h('p', { class: 'text-2' }, `Platform tax rate: ${fmt.pct(((V.info.site && V.info.site.taxRate) || 0.05) * 100)} is applied at checkout. Tax collected is shown in Finance.`), f.collect, h('p', { class: 'small muted' }, `Registered Tax ID: ${v.taxId || 'not provided'}. Update it under Store profile.`)], () => ({ tax: { collect: f.collect.querySelector('input').checked } }));
      },
    };
    const show = (id) => { body.replaceChildren(panes[id]()); };
    const tabs = PM.tabs([{ id: 'profile', label: 'Store profile' }, { id: 'branding', label: 'Branding' }, { id: 'shipping', label: 'Shipping' }, { id: 'payments', label: 'Payments' }, { id: 'tax', label: 'Tax' }], 'profile', show);
    show('profile');
    return h('div', null, PM.dash.title('Store settings', v.storeName), tabs, body);
  });
})();
