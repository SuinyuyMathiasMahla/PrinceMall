'use strict';
// Admin pages (2/2): advertising, categories, CMS, tickets, security, settings.

(function () {
  const { h, api, icon, fmt } = PM;
  const A = window.A;
  const toIso = (v) => (v ? new Date(v).toISOString() : null);
  const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  // =========================================================== ADS
  A.page('/ads', async () => {
    const { ads } = await api('/admin/ads');
    const root = h('div');
    const draw = (list) => root.replaceChildren(PM.table({ rowKey: 'id', columns: [
      { key: 'title', label: 'Campaign', render: (a) => h('div', { class: 'cell-product' }, a.image ? PM.img(a.image, '') : h('span', { class: 'kpi-ico' }, icon('megaphone')), h('div', null, h('strong', null, a.title), h('div', { class: 'xs muted' }, a.subtitle))) },
      { key: 'placement', label: 'Placement', render: (a) => PM.badge(fmt.label(a.placement), 'brand') }, { key: 'dates', label: 'Runs', render: (a) => (a.startsAt || a.endsAt ? `${a.startsAt ? fmt.date(a.startsAt) : 'now'} → ${a.endsAt ? fmt.date(a.endsAt) : 'no end'}` : 'Always') },
      { key: 'active', label: 'Live', render: (a) => PM.switch({ checked: a.active, 'aria-label': `${a.title} live`, onchange: async (e) => { await api('/admin/ads/' + a.id, { method: 'PATCH', body: { active: e.target.checked } }); } }) },
      { key: 'x', label: '', align: 'r', render: (a) => h('div', { class: 'row', style: 'justify-content:flex-end;gap:4px' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => form(a) }, icon('edit')), h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: async () => { await api('/admin/ads/' + a.id, { method: 'DELETE' }); draw((await api('/admin/ads')).ads); } }, icon('trash'))) },
    ], rows: list, empty: PM.empty({ icon: 'megaphone', title: 'No campaigns', text: 'Create a hero banner to promote offers on the home page.' }) }).el);
    function form(a) {
      const f = { title: PM.input({ value: a ? a.title : '', maxLength: 80 }), subtitle: PM.input({ value: a ? a.subtitle || '' : '', maxLength: 140 }), link: PM.input({ value: a ? a.link || '' : '', placeholder: '#/shop?deals=1' }),
        placement: PM.select([{ value: 'hero', label: 'Home hero slider' }, { value: 'promo', label: 'Home promo banner' }, { value: 'category', label: 'Category page' }], a ? a.placement : 'hero'), start: PM.input({ type: 'datetime-local', value: toLocal(a && a.startsAt) }), end: PM.input({ type: 'datetime-local', value: toLocal(a && a.endsAt) }), image: PM.imagePicker({ values: a && a.image ? [a.image] : [], max: 1 }), active: PM.check('Live', { checked: a ? a.active : true }) };
      const err = PM.errorBox();
      PM.modal({ title: a ? 'Edit campaign' : 'New campaign', size: 'lg', content: h('div', { class: 'stack' }, PM.field('Headline', f.title, { required: true }), PM.field('Sub-headline', f.subtitle), h('div', { class: 'form-grid' }, PM.field('Link', f.link), PM.field('Placement', f.placement), PM.field('Starts', f.start), PM.field('Ends', f.end)), h('div', null, h('div', { class: 'label' }, 'Image (optional)'), f.image), f.active, err),
        actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => { const body = { title: f.title.value, subtitle: f.subtitle.value, link: f.link.value, placement: f.placement.value, startsAt: toIso(f.start.value), endsAt: toIso(f.end.value), image: f.image.values()[0] || '', active: f.active.querySelector('input').checked }; try { await (a ? api('/admin/ads/' + a.id, { method: 'PATCH', body }) : api('/admin/ads', { method: 'POST', body })); PM.toast('Campaign saved'); draw((await api('/admin/ads')).ads); } catch (e) { err.show(e.message); return false; } } }] });
    }
    draw(ads);
    return h('div', null, PM.dash.title('Advertising', 'Banners shown on the storefront.', h('button', { class: 'btn btn-primary', type: 'button', onclick: () => form(null) }, icon('plus'), 'New campaign')), root);
  });

  // =========================================================== CATEGORIES
  A.page('/categories', async () => {
    const root = h('div');
    const ICONS = ['tag', 'chef', 'home', 'headphones', 'watch', 'cpu', 'shirt', 'activity', 'gift', 'box', 'zap', 'sparkle'];
    async function draw() {
      const { categories } = await api('/admin/categories');
      root.replaceChildren(PM.table({ rowKey: 'slug', columns: [
        { key: 'name', label: 'Category', sortable: true, render: (c) => h('div', { class: 'row-nowrap' }, h('span', { class: 'kpi-ico' }, icon(c.icon || 'tag')), h('div', null, h('strong', null, c.name), h('div', { class: 'xs muted' }, c.description))) },
        { key: 'products', label: 'Products', align: 'r', sortable: true }, { key: 'active', label: 'Visible', render: (c) => PM.switch({ checked: c.active !== false, 'aria-label': `${c.name} visible`, onchange: async (e) => { await api('/admin/categories/' + c.slug, { method: 'PATCH', body: { active: e.target.checked } }); } }) },
        { key: 'x', label: '', align: 'r', render: (c) => h('div', { class: 'row', style: 'justify-content:flex-end;gap:4px' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => form(c) }, icon('edit')), h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: async () => { try { await api('/admin/categories/' + c.slug, { method: 'DELETE' }); PM.toast('Category deleted'); draw(); } catch (e) { PM.toast(e.message, 'error'); } } }, icon('trash'))) },
      ], rows: categories }).el);
    }
    function form(c) {
      const f = { name: PM.input({ value: c ? c.name : '', maxLength: 40 }), desc: PM.input({ value: c ? c.description || '' : '', maxLength: 140 }), icon: PM.select(ICONS, c ? c.icon : 'tag') }; const err = PM.errorBox();
      PM.modal({ title: c ? 'Edit category' : 'New category', content: h('div', { class: 'stack' }, PM.field('Name', f.name, { required: true }), PM.field('Description', f.desc), PM.field('Icon', f.icon), err), actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => { const body = { name: f.name.value, description: f.desc.value, icon: f.icon.value }; try { await (c ? api('/admin/categories/' + c.slug, { method: 'PATCH', body }) : api('/admin/categories', { method: 'POST', body })); PM.toast('Category saved'); draw(); } catch (e) { err.show(e.message); return false; } } }] });
    }
    await draw();
    return h('div', null, PM.dash.title('Categories', 'How products are organised in the shop.', h('button', { class: 'btn btn-primary', type: 'button', onclick: () => form(null) }, icon('plus'), 'New category')), root);
  });

  // =========================================================== CMS
  A.page('/cms', async () => {
    const root = h('div');
    async function draw() {
      const { pages } = await api('/admin/pages');
      root.replaceChildren(PM.table({ rowKey: 'slug', columns: [{ key: 'title', label: 'Page', sortable: true, render: (p) => h('div', null, h('strong', null, p.title), h('div', { class: 'xs muted' }, '#/page/' + p.slug)) }, { key: 'updatedAt', label: 'Updated', render: (p) => fmt.date(p.updatedAt) },
        { key: 'published', label: 'Published', render: (p) => PM.switch({ checked: p.published, 'aria-label': `${p.title} published`, onchange: async (e) => { await api('/admin/pages/' + p.slug, { method: 'PATCH', body: { published: e.target.checked } }); } }) },
        { key: 'x', label: '', align: 'r', render: (p) => h('div', { class: 'row', style: 'justify-content:flex-end;gap:4px' }, h('a', { class: 'btn btn-sm', href: '/#/page/' + p.slug, target: '_blank', rel: 'noopener' }, icon('external')), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => form(p) }, icon('edit'), 'Edit'), h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: async () => { if (await PM.confirm({ title: `Delete “${p.title}”?`, message: 'The page will disappear from the shop.', confirmLabel: 'Delete', danger: true })) { await api('/admin/pages/' + p.slug, { method: 'DELETE' }); draw(); } } }, icon('trash'))) }], rows: pages }).el);
    }
    function form(p) {
      const f = { title: PM.input({ value: p ? p.title : '', maxLength: 80 }), body: PM.textarea({ value: p ? p.body : '', rows: 10, maxLength: 20000 }), pub: PM.check('Published', { checked: p ? p.published : true }) }; const err = PM.errorBox();
      PM.modal({ title: p ? `Edit ${p.title}` : 'New page', size: 'lg', content: h('div', { class: 'stack' }, PM.field('Title', f.title, { required: true }), PM.field('Content', f.body, { required: true, hint: 'Plain text. Leave a blank line between paragraphs.' }), f.pub, err), actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => { const body = { title: f.title.value, body: f.body.value, published: f.pub.querySelector('input').checked }; try { await (p ? api('/admin/pages/' + p.slug, { method: 'PATCH', body }) : api('/admin/pages', { method: 'POST', body })); PM.toast('Page saved'); draw(); } catch (e) { err.show(e.message); return false; } } }] });
    }
    await draw();
    return h('div', null, PM.dash.title('Content management', 'Static pages linked from the shop footer.', h('button', { class: 'btn btn-primary', type: 'button', onclick: () => form(null) }, icon('plus'), 'New page')), root);
  });

  // =========================================================== TICKETS
  A.page('/tickets', async () => {
    const state = { status: 'open' };
    const listBox = h('div', { class: 'card', style: 'overflow:hidden;align-self:start' }); const thread = h('div', { class: 'card card-pad' }, h('p', { class: 'muted' }, 'Select a ticket.')); const tabsBox = h('div');
    let tickets = [];
    function openTicket(id) {
      const t = tickets.find((x) => x.id === id);
      if (!t) return;
      const reply = PM.textarea({ rows: 3, placeholder: 'Write a reply to the customer…', maxLength: 3000 });
      const status = PM.select(['open', 'pending', 'resolved', 'closed'].map((s) => ({ value: s, label: fmt.label(s) })), t.status === 'open' ? 'pending' : t.status, { 'aria-label': 'Set status after reply', style: 'width:auto' });
      const chat = h('div', { class: 'chat', tabindex: 0, 'aria-label': 'Ticket conversation' }, t.messages.map((m) => h('div', { class: 'bubble' + (m.from === 'staff' ? ' me' : '') }, m.body, h('small', null, `${m.name} · ${fmt.ago(m.at)}`))));
      thread.replaceChildren(h('div', { class: 'row between' }, h('div', null, h('h3', { style: 'margin:0' }, t.subject), h('div', { class: 'xs muted' }, `${t.id} · ${t.userName} (${t.userEmail}) · ${fmt.label(t.category)}`)), PM.status(t.status)), chat,
        h('form', { class: 'stack-sm mt-1', onsubmit: async (e) => { e.preventDefault(); if (!reply.value.trim()) return; try { await PM.busy(e.submitter, () => api(`/admin/tickets/${id}/reply`, { method: 'POST', body: { message: reply.value, status: status.value } })); PM.toast('Reply sent'); load(id); } catch (x) { PM.toast(x.message, 'error'); } } }, reply, h('div', { class: 'row' }, status, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Send reply'))));
      chat.scrollTop = chat.scrollHeight;
    }
    async function load(selectId) {
      try {
        const d = await api('/admin/tickets');
        tickets = d.tickets;
        const c = d.counts;
        tabsBox.replaceChildren(PM.tabs([{ id: 'open', label: 'Open', count: c.open }, { id: 'pending', label: 'Awaiting customer', count: c.pending }, { id: 'resolved', label: 'Resolved', count: c.resolved }, { id: 'closed', label: 'Closed', count: c.closed }, { id: '', label: 'All', count: c.all }], state.status, (id) => { state.status = id; paint(); }));
        paint();
        if (selectId) openTicket(selectId);
      } catch (e) { listBox.replaceChildren(PM.errorState(e, () => load())); }
    }
    function paint() {
      const shown = tickets.filter((t) => !state.status || t.status === state.status);
      listBox.replaceChildren(...(shown.length ? shown.map((t) => h('button', { class: 'convo-item', type: 'button', onclick: () => openTicket(t.id) }, h('div', { class: 'row between' }, h('strong', { class: 'truncate' }, t.subject), PM.status(t.status)), h('div', { class: 'xs muted' }, `${t.userName} · ${fmt.ago(t.updatedAt)}`))) : [h('div', { class: 'card-pad-sm muted small' }, 'No tickets in this view.')]));
    }
    load();
    return h('div', { class: 'stack' }, PM.dash.title('Support tickets', 'Replies appear in the customer’s account and notifications.'), tabsBox, h('div', { class: 'convo' }, listBox, thread));
  });

  // =========================================================== SECURITY
  A.page('/security', async () => {
    const state = { action: '', page: 1 };
    const box = h('div', { class: 'stack' });
    async function load() {
      try {
        const d = await api('/admin/security' + PM.qs({ ...state, limit: 15 }));
        const s = d.summary;
        box.replaceChildren(
          h('div', { class: 'grid cols-4' }, PM.kpi({ label: 'Failed logins (24h)', value: String(s.failedLogins24h), icon: 'alert', invert: true }), PM.kpi({ label: 'Successful logins (24h)', value: String(s.logins24h), icon: 'check' }), PM.kpi({ label: 'Active sessions', value: String(s.activeSessions), icon: 'key' }), PM.kpi({ label: 'Suspended accounts', value: String(s.suspendedAccounts), icon: 'lock', note: `${s.unverifiedEmails} unverified emails` })),
          s.failedLogins24h > 10 ? PM.alert('warning', 'Many failed logins in the last 24 hours. Logins are rate-limited per IP and email (5 tries, then a 10 minute lock).') : null,
          h('div', { class: 'toolbar', style: 'margin:0' }, h('h3', { style: 'margin:0' }, 'Audit log'), PM.select([{ value: '', label: 'All events' }, ...['login', 'login_failed', 'signup', 'password_changed', 'password_reset', 'vendor_approve', 'vendor_reject', 'vendor_suspend', 'user_updated', 'product_updated', 'settings_changed', 'sessions_revoked'].map((a) => ({ value: a, label: fmt.label(a) }))], state.action, { 'aria-label': 'Event type', style: 'width:auto', onchange: (e) => { state.action = e.target.value; state.page = 1; load(); } })),
          PM.table({ columns: [{ key: 'at', label: 'When', render: (a) => fmt.dateTime(a.at) }, { key: 'who', label: 'Who' }, { key: 'action', label: 'Event', render: (a) => PM.badge(fmt.label(a.action), a.action.includes('fail') ? 'danger' : 'neutral') }, { key: 'detail', label: 'Detail', render: (a) => h('span', { class: 'small text-2' }, a.detail) }, { key: 'ip', label: 'IP', render: (a) => h('span', { class: 'code' }, a.ip || '—') }], rows: d.events, empty: PM.empty({ icon: 'shield', title: 'No events yet' }) }).el,
          PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }));
      } catch (e) { box.replaceChildren(PM.errorState(e, load)); }
    }
    load();
    return h('div', null, PM.dash.title('Security monitoring', 'Sign-ins and administrative actions.'), box);
  });

  // =========================================================== SETTINGS
  A.page('/settings', async () => {
    const { settings: s } = await api('/admin/settings');
    const f = { siteName: PM.input({ value: s.siteName }), currency: PM.input({ value: s.currency, maxLength: 8 }), tax: PM.input({ type: 'number', min: 0, max: 50, step: '0.25', value: s.taxRate * 100 }), free: PM.input({ type: 'number', min: 0, value: s.freeShippingThreshold }), comm: PM.input({ type: 'number', min: 0, max: 50, step: '0.5', value: s.defaultCommission * 100 }), pts: PM.input({ type: 'number', min: 0, max: 100, step: '0.5', value: s.pointsPerThousand }) };
    const err = PM.errorBox();
    return h('div', null, PM.dash.title('System settings', 'Marketplace-wide rules.'),
      h('form', { class: 'card card-pad stack', style: 'max-width:720px', onsubmit: async (e) => {
        e.preventDefault(); err.clear();
        try { await PM.busy(e.submitter, () => api('/admin/settings', { method: 'PATCH', body: { siteName: f.siteName.value, currency: f.currency.value, taxRate: Number(f.tax.value), freeShippingThreshold: Number(f.free.value), defaultCommission: Number(f.comm.value), pointsPerThousand: Number(f.pts.value) } })); PM.toast('Settings saved'); } catch (x) { err.show(x.message); }
      } }, h('div', { class: 'form-grid' }, PM.field('Site name', f.siteName), PM.field('Currency label', f.currency), PM.field('Tax rate (%)', f.tax, { hint: 'Added to every order.' }), PM.field('Free standard shipping from', f.free), PM.field('Default commission (%)', f.comm), PM.field('Loyalty points per 1,000 spent', f.pts)), err,
        h('button', { class: 'btn btn-primary', type: 'submit', style: 'justify-self:start' }, 'Save settings')),
      h('div', { class: 'card card-pad mt-3', style: 'max-width:720px' }, h('h3', null, 'Integrations'), h('p', { class: 'muted small mb-0' }, 'Payments are simulated, email is printed to the server console, and social login is not configured. Connect a payment provider, an email service and OAuth keys before going live.')));
  });
})();
