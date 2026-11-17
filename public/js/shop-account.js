'use strict';
// Authentication pages and the buyer account area.

(function () {
  const { h, api, icon, fmt } = PM;
  const S = window.Shop;

  function strength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(score, 4);
  }

  function passwordField(label, props = {}) {
    const input = PM.input({ type: 'password', autocomplete: 'current-password', minLength: 8, style: 'padding-right:64px', ...props });
    const toggle = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'position:absolute;right:6px;top:5px', 'aria-label': 'Show password', onclick: () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    } }, 'Show');
    const field = PM.field(label, input, { required: true });
    const wrap = h('div', { style: 'position:relative' });
    input.replaceWith(wrap);
    wrap.append(input, toggle);
    field.input = input;
    return field;
  }

  const socialButtons = () => h('div', { class: 'social-btns' },
    h('button', { class: 'btn btn-block', type: 'button', disabled: true, title: 'Google sign-in needs OAuth credentials to be configured on the server' }, icon('globe'), 'Continue with Google'),
    h('button', { class: 'btn btn-block', type: 'button', disabled: true, title: 'Facebook sign-in needs OAuth credentials to be configured on the server' }, icon('users'), 'Continue with Facebook'),
    h('div', { class: 'xs muted center' }, 'Social login is shown for layout; it needs provider keys before it can work.'));

  const authCard = (title, subtitle, ...body) => h('div', { class: 'auth-wrap' }, h('div', { class: 'card card-pad auth-card' }, h('div', { class: 'center', style: 'margin-bottom:16px' }, h('span', { class: 'logo-mark', style: 'margin:0 auto 12px;width:44px;height:44px;font-size:20px' }, 'P'), h('h1', { style: 'margin:0' }, title), subtitle ? h('p', { class: 'muted', style: 'margin:4px 0 0' }, subtitle) : null), ...body));

  const reviewModal = (productId, name, done) => {
    let rating = 0;
    const starRow = h('div', { class: 'row', role: 'radiogroup', 'aria-label': 'Rating' });
    const draw = () => starRow.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', { class: 'btn btn-ghost btn-icon', type: 'button', role: 'radio', 'aria-checked': String(rating === n), 'aria-label': `${n} star${n > 1 ? 's' : ''}`, style: `color:${n <= rating ? 'var(--accent)' : 'var(--border-strong)'}`, onclick: () => { rating = n; draw(); } }, icon('star', 'filled'))));
    draw();
    const title = PM.input({ maxLength: 100 });
    const body = PM.textarea({ rows: 4, maxLength: 2000 });
    const photos = PM.imagePicker({ max: 4 });
    const err = PM.errorBox();
    PM.modal({ title: `Review ${name}`, size: 'lg', content: h('div', { class: 'stack' }, h('div', null, h('div', { class: 'label' }, 'Your rating'), starRow), PM.field('Title (optional)', title), PM.field('Your review', body, { required: true, hint: 'At least 10 characters.' }), h('div', null, h('div', { class: 'label' }, 'Photos (optional)'), photos), err),
      actions: [{ label: 'Cancel' }, { label: 'Submit review', kind: 'primary', onClick: async () => {
        err.clear();
        if (!rating) { err.show('Please choose a star rating'); return false; }
        try { await api(`/products/${productId}/reviews`, { method: 'POST', body: { rating, title: title.value, body: body.value, photos: photos.values() } }); PM.toast('Thanks for your review!'); if (done) done(); } catch (e) { err.show(e.message); return false; }
      } }] });
  };

  const messageModal = (vendorId, vendorName, productId) => {
    if (!S.me) { S.router.go('/login'); return; }
    const msg = PM.textarea({ rows: 4, maxLength: 2000 });
    PM.modal({ title: 'Message ' + vendorName, content: PM.field('Your message', msg, { required: true }), actions: [{ label: 'Cancel' }, { label: 'Send', kind: 'primary', onClick: async () => { if (!msg.value.trim()) return false; await api('/conversations', { method: 'POST', body: { vendorId, productId, body: msg.value } }); PM.toast('Message sent. See replies under Account → Messages.'); } }] });
  };

  const NAV = [
    ['overview', '/account', 'Overview', 'home'], ['orders', '/account/orders', 'Orders', 'package'], ['wishlist', '/account/wishlist', 'Wishlist', 'heart'],
    ['reviews', '/account/reviews', 'Reviews', 'star'], ['notifications', '/account/notifications', 'Notifications', 'bell'], ['messages', '/account/messages', 'Messages', 'message'],
    ['support', '/account/support', 'Support', 'help'], ['loyalty', '/account/loyalty', 'Rewards', 'award'], ['profile', '/account/profile', 'Profile & security', 'settings'],
  ];
  const layout = (key, content) => h('div', { class: 'account-grid' },
    h('nav', { class: 'side-nav card card-pad-sm', 'aria-label': 'Account' }, NAV.map(([k, path, label, ic]) => h('a', { href: '#' + path, 'aria-current': k === key ? 'page' : null }, icon(ic), label))),
    h('section', { style: 'min-width:0' }, content));
  const account = (key, title, fn) => async (ctx) => {
    if (!S.requireLogin(ctx)) return null;
    ctx.title(title);
    return layout(key, await fn(ctx));
  };

  const orderLine = (it) => h('div', { class: 'row-nowrap', style: 'padding:6px 0' }, PM.img(it.image, '', { style: 'width:44px;height:44px;border-radius:8px;object-fit:cover' }), h('div', { class: 'grow small' }, h('a', { href: '#/product/' + it.productId, style: 'color:inherit;font-weight:600;text-decoration:none' }, it.name), h('div', { class: 'xs muted' }, `Qty ${it.quantity}${it.color ? ' · ' + it.color : ''}${it.size ? ' · ' + it.size : ''}`)), h('span', { class: 'num small' }, fmt.price(it.lineTotal)));

  S.registerRoutes.push((r) => {
    // =========================================================== AUTH
    r.add('/login', async (ctx) => {
      ctx.title('Log in');
      const next = ctx.query.get('next') || '';
      if (S.me) { S.afterLogin(S.me, next); return null; }
      const email = PM.input({ type: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
      const pw = passwordField('Password');
      const err = PM.errorBox();
      return authCard('Welcome back', 'Log in to your PrinceMall account',
        h('form', { class: 'stack', onsubmit: async (e) => {
          e.preventDefault(); err.clear();
          try {
            const { user } = await PM.busy(e.submitter, () => api('/auth/login', { method: 'POST', body: { email: email.value, password: pw.input.value } }));
            await S.refresh(); S.rebuildHeader();
            PM.toast(`Welcome back, ${user.name.split(' ')[0]}!`);
            S.afterLogin(user, next);
          } catch (x) { err.show(x.message); }
        } }, PM.field('Email', email, { required: true }), pw, h('div', { class: 'row between' }, PM.check('Keep me signed in', { checked: true, disabled: true }), h('a', { class: 'small', href: '#/forgot' }, 'Forgot password?')), err, h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, 'Log in')),
        h('div', { class: 'or' }, 'or'), socialButtons(),
        h('p', { class: 'center small mt-2 mb-0' }, 'New to PrinceMall? ', h('a', { href: '#/register' + (next ? '?next=' + encodeURIComponent(next) : '') }, 'Create an account')));
    });

    r.add('/register', async (ctx) => {
      ctx.title('Create account');
      const next = ctx.query.get('next') || '';
      if (S.me) { S.afterLogin(S.me, next); return null; }
      const name = PM.input({ autocomplete: 'name', maxLength: 60 });
      const email = PM.input({ type: 'email', autocomplete: 'email' });
      const pw = passwordField('Password', { autocomplete: 'new-password' });
      const confirm = passwordField('Confirm password', { autocomplete: 'new-password' });
      const meter = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Password strength' }, h('span', { style: 'width:0' }));
      const meterText = h('div', { class: 'hint' }, 'Use 8+ characters with a mix of letters, numbers and symbols.');
      pw.input.addEventListener('input', () => {
        const s = strength(pw.input.value);
        meter.firstChild.style.width = (s / 4) * 100 + '%';
        meter.firstChild.style.background = ['var(--danger)', 'var(--danger)', 'var(--warning)', 'var(--success)', 'var(--success)'][s];
        meterText.textContent = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'][s];
      });
      const terms = PM.check(h('span', null, 'I agree to the ', h('a', { href: '#/page/terms', target: '_blank' }, 'terms'), ' and ', h('a', { href: '#/page/privacy', target: '_blank' }, 'privacy policy')), { required: true });
      const err = PM.errorBox();
      return authCard('Create your account', 'Shop from verified stores in minutes',
        h('form', { class: 'stack', onsubmit: async (e) => {
          e.preventDefault(); err.clear();
          if (pw.input.value !== confirm.input.value) return err.show('The two passwords do not match');
          try {
            const { user } = await PM.busy(e.submitter, () => api('/auth/signup', { method: 'POST', body: { name: name.value, email: email.value, password: pw.input.value } }));
            await S.refresh(); S.rebuildHeader();
            PM.toast('Account created. Welcome! Use code WELCOME10 on your first order.');
            S.afterLogin(user, next);
          } catch (x) { err.show(x.message); }
        } }, PM.field('Full name', name, { required: true }), PM.field('Email', email, { required: true }), pw, meter, meterText, confirm, terms, err, h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, 'Create account')),
        h('div', { class: 'or' }, 'or'), socialButtons(),
        h('p', { class: 'center small mt-2 mb-0' }, 'Already have an account? ', h('a', { href: '#/login' }, 'Log in')),
        h('p', { class: 'center small mb-0' }, 'Want to sell? ', h('a', { href: '/vendor/#/register' }, 'Open a store')));
    });

    r.add('/forgot', (ctx) => {
      ctx.title('Forgot password');
      const email = PM.input({ type: 'email', autocomplete: 'email' });
      const out = h('div');
      return authCard('Forgot your password?', 'Enter your email and we will send a reset link',
        out, h('form', { class: 'stack', onsubmit: async (e) => {
          e.preventDefault();
          try {
            await PM.busy(e.submitter, () => api('/auth/forgot', { method: 'POST', body: { email: email.value } }));
            out.replaceChildren(PM.alert('success', 'If an account exists for that email, a reset link has been sent. It is valid for one hour. (Demo: no email service is connected, so the link is printed in the server console.)'));
          } catch (x) { out.replaceChildren(PM.alert('error', x.message)); }
        } }, PM.field('Email', email, { required: true }), h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, 'Send reset link')),
        h('p', { class: 'center small mt-2 mb-0' }, h('a', { href: '#/login' }, '← Back to log in')));
    });

    r.add('/reset', (ctx) => {
      ctx.title('Reset password');
      const token = ctx.query.get('token') || '';
      const pw = passwordField('New password', { autocomplete: 'new-password' });
      const confirm = passwordField('Confirm new password', { autocomplete: 'new-password' });
      const err = PM.errorBox();
      if (!token) return authCard('Reset link missing', null, PM.alert('error', 'This page needs the link from your reset email.'), h('a', { class: 'btn btn-block mt-2', href: '#/forgot' }, 'Request a new link'));
      return authCard('Choose a new password', null, h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault(); err.clear();
        if (pw.input.value !== confirm.input.value) return err.show('The two passwords do not match');
        try { await PM.busy(e.submitter, () => api('/auth/reset', { method: 'POST', body: { token, password: pw.input.value } })); PM.toast('Password updated. Please log in.'); S.router.go('/login'); } catch (x) { err.show(x.message); }
      } }, pw, confirm, err, h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, 'Update password')));
    });

    r.add('/verify', async (ctx) => {
      ctx.title('Verify email');
      const token = ctx.query.get('token') || '';
      let ok = false; let msg = 'This verification link is missing.';
      if (token) { try { await api('/auth/verify', { method: 'POST', body: { token } }); ok = true; await S.refresh(); } catch (e) { msg = e.message; } }
      return authCard(ok ? 'Email verified' : 'Verification failed', null, PM.alert(ok ? 'success' : 'error', ok ? 'Thanks! Your email address is confirmed.' : msg), h('a', { class: 'btn btn-primary btn-block mt-2', href: ok ? '#/account' : '#/account/profile' }, ok ? 'Go to my account' : 'Request a new link'));
    });

    // =========================================================== OVERVIEW
    r.add('/account', account('overview', 'My account', async () => {
      const d = await api('/account/dashboard');
      const t = d.tier;
      const target = t.next ? d.stats.points + t.next.needed : d.stats.points;
      return h('div', { class: 'stack' },
        h('div', { class: 'page-title' }, h('div', null, h('h1', null, `Welcome back, ${S.me.name.split(' ')[0]}`), h('p', null, 'Here is what is happening with your orders.')), h('a', { class: 'btn btn-primary', href: '#/shop' }, 'Continue shopping')),
        !S.me.emailVerified ? PM.alert('warning', h('span', null, 'Your email is not verified yet. ', h('a', { href: '#/account/profile' }, 'Verify it'), ' to secure your account.')) : null,
        h('div', { class: 'grid cols-4' },
          PM.kpi({ label: 'Orders', value: fmt.num(d.stats.orders), icon: 'package' }), PM.kpi({ label: 'Total spent', value: fmt.price(d.stats.spent), icon: 'wallet' }),
          PM.kpi({ label: 'In transit', value: fmt.num(d.stats.inTransit), icon: 'truck' }), PM.kpi({ label: 'Reward points', value: fmt.num(d.stats.points), icon: 'award', note: `${t.name} member` })),
        h('div', { class: 'two-col' },
          h('div', { class: 'card card-pad' }, h('h3', null, 'Spending, last 6 months'), PM.charts.bar({ labels: d.spendingByMonth.map((m) => m.label), series: [{ name: 'Spent', values: d.spendingByMonth.map((m) => m.value) }], height: 220, fmt: fmt.price })),
          h('div', { class: 'card card-pad' }, h('h3', null, 'By category'), d.spendingByCategory.length ? PM.charts.donut({ items: d.spendingByCategory, size: 150, fmt: fmt.price, centerLabel: 'Spent' }) : h('p', { class: 'muted' }, 'Your categories will show up after your first order.'))),
        h('div', { class: 'card card-pad' }, h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, `${t.name} tier`), h('a', { href: '#/account/loyalty', class: 'small' }, 'View rewards')),
          h('div', { class: 'progress mt-1', role: 'progressbar', 'aria-label': 'Progress to next tier', 'aria-valuenow': t.next ? Math.round((d.stats.points / target) * 100) : 100 }, h('span', { style: `width:${t.next ? Math.min(100, (d.stats.points / target) * 100) : 100}%` })),
          h('p', { class: 'small muted mb-0 mt-1' }, t.next ? `${fmt.num(t.next.needed)} more points to reach ${t.next.name}.` : 'You have reached the top tier. Thank you!')),
        h('div', { class: 'card card-pad' }, h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, 'Recent orders'), h('a', { class: 'small', href: '#/account/orders' }, 'See all')),
          d.recentOrders.length ? h('div', { class: 'stack-sm mt-1' }, d.recentOrders.map((o) => h('a', { class: 'menu-item', href: '#/account/orders/' + o.id, style: 'border:1px solid var(--border)' }, h('span', { class: 'grow' }, h('strong', null, o.id), h('div', { class: 'xs muted' }, fmt.date(o.createdAt))), PM.status(o.status), h('span', { class: 'price' }, fmt.price(o.total))))) : PM.empty({ icon: 'package', title: 'No orders yet', text: 'When you order, it will appear here.' })),
        d.recommendations.length ? h('div', null, h('h2', null, 'Recommended for you'), S.productGrid(d.recommendations)) : null);
    }));

    // =========================================================== ORDERS
    r.add('/account/orders', account('orders', 'My orders', async (ctx) => {
      const state = { status: ctx.query.get('status') || '', page: 1 };
      const list = h('div', { class: 'stack' });
      const tabs = PM.tabs([{ id: '', label: 'All' }, { id: 'placed', label: 'Placed' }, { id: 'processing', label: 'Processing' }, { id: 'shipped', label: 'Shipped' }, { id: 'delivered', label: 'Delivered' }, { id: 'cancelled', label: 'Cancelled' }], state.status, (id) => { state.status = id; state.page = 1; load(); });
      async function load() {
        list.replaceChildren(h('div', { class: 'spinner' }));
        try {
          const d = await api('/orders' + PM.qs({ status: state.status, page: state.page }));
          list.replaceChildren(...(d.orders.length ? d.orders.map((o) => h('article', { class: 'card card-pad-sm card-hover' },
            h('div', { class: 'row between' }, h('div', null, h('strong', null, o.id), h('div', { class: 'xs muted' }, `${fmt.dateTime(o.createdAt)} · ${o.shipments.length} parcel${o.shipments.length > 1 ? 's' : ''}`)), h('div', { class: 'row' }, PM.status(o.status), PM.payStatus(o.paymentStatus), h('strong', { class: 'price' }, fmt.price(o.total)))),
            h('div', { class: 'row mt-1' }, o.shipments.flatMap((s) => s.items).slice(0, 5).map((it) => PM.img(it.image, it.name, { style: 'width:52px;height:52px;border-radius:10px;object-fit:cover' })), h('a', { class: 'btn btn-sm right', href: '#/account/orders/' + o.id }, 'View details', icon('chevron-right'))))) : [PM.empty({ icon: 'package', title: 'No orders here', text: state.status ? 'No orders with this status.' : 'You have not placed any orders yet.', action: h('a', { class: 'btn btn-primary', href: '#/shop' }, 'Start shopping') })]),
            PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }));
        } catch (e) { list.replaceChildren(PM.errorState(e, load)); }
      }
      load();
      return h('div', null, h('div', { class: 'page-title' }, h('h1', null, 'My orders')), tabs, list);
    }));

    r.add('/account/orders/:id', account('orders', 'Order details', async (ctx) => {
      const d = await api('/orders/' + encodeURIComponent(ctx.params.id));
      const o = d.order;
      const reviewed = new Set(d.reviewed);
      const reload = () => S.router.render();
      const canCancel = o.shipments.every((s) => ['placed', 'processing', 'cancelled'].includes(s.status)) && o.status !== 'cancelled';
      const STEPS = ['placed', 'processing', 'shipped', 'delivered'];
      const shipmentCard = (sh) => {
        const at = Object.fromEntries(sh.timeline.map((t) => [t.status, t.at]));
        const cancelled = sh.status === 'cancelled';
        const returnBadge = sh.return ? h('div', { class: 'alert alert-info mt-1' }, icon('undo'), h('div', null, h('strong', null, `Return ${sh.return.status}`), h('div', { class: 'small' }, sh.return.reason, sh.return.note ? ` — Seller note: ${sh.return.note}` : ''))) : null;
        const deliveredAt = at.delivered && Date.now() - new Date(at.delivered).getTime() < 14 * 86400000;
        return h('div', { class: 'card card-pad' },
          h('div', { class: 'row between' }, h('div', null, h('span', { class: 'xs muted' }, 'Sold & shipped by '), h('a', { href: '#/store/' + (sh.seller ? sh.seller.slug : ''), style: 'font-weight:700' }, sh.storeName)), PM.status(sh.status)),
          cancelled ? h('p', { class: 'muted' }, 'This parcel was cancelled.') : h('ol', { class: 'timeline mt-2', 'aria-label': 'Delivery progress' }, STEPS.map((s) => h('li', { class: at[s] ? '' : 'pending' }, h('strong', { class: 'small', style: at[s] ? '' : 'color:var(--text-3)' }, fmt.label(s)), at[s] ? h('div', { class: 'xs muted' }, fmt.dateTime(at[s])) : null))),
          sh.trackingNumber ? h('div', { class: 'alert alert-info' }, icon('truck'), h('div', null, `Tracking: ${sh.trackingNumber}`, sh.carrier ? ` via ${sh.carrier}` : '')) : null,
          h('div', { class: 'divider' }), sh.items.map((it) => h('div', null, orderLine(it), sh.status === 'delivered' && !reviewed.has(it.productId) ? h('button', { class: 'btn btn-sm', type: 'button', style: 'margin:0 0 8px 54px', onclick: () => reviewModal(it.productId, it.name, reload) }, icon('star'), 'Write a review') : null)),
          returnBadge,
          h('div', { class: 'row mt-1' },
            h('button', { class: 'btn btn-sm', type: 'button', onclick: () => messageModal(sh.vendorId, sh.storeName) }, icon('message'), 'Contact seller'),
            sh.status === 'delivered' && !sh.return && deliveredAt ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
              const reason = PM.textarea({ rows: 3, maxLength: 500, placeholder: 'What is wrong with the item?' });
              PM.modal({ title: 'Request a return', content: PM.field('Reason', reason, { required: true, hint: `The seller (${sh.storeName}) will review your request.` }), actions: [{ label: 'Cancel' }, { label: 'Request return', kind: 'primary', onClick: async () => { try { await api(`/orders/${o.id}/return`, { method: 'POST', body: { vendorId: sh.vendorId, reason: reason.value } }); PM.toast('Return requested'); reload(); } catch (e) { PM.toast(e.message, 'error'); return false; } } }] });
            } }, icon('undo'), 'Return items') : null));
      };
      return h('div', { class: 'stack' },
        PM.breadcrumbs([{ label: 'Account', href: '#/account' }, { label: 'Orders', href: '#/account/orders' }, { label: o.id }]),
        h('div', { class: 'page-title' }, h('div', null, h('h1', null, `Order ${o.id}`), h('p', null, `Placed ${fmt.dateTime(o.createdAt)}`)),
          h('div', { class: 'row' }, PM.status(o.status), PM.payStatus(o.paymentStatus), h('a', { class: 'btn', href: `#/account/orders/${o.id}/invoice` }, icon('receipt'), 'Invoice'),
            canCancel ? h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (await PM.confirm({ title: 'Cancel this order?', message: 'Items go back to stock and any payment is marked as refunded.', confirmLabel: 'Cancel order', danger: true })) { try { await api(`/orders/${o.id}/cancel`, { method: 'POST' }); PM.toast('Order cancelled'); reload(); } catch (e) { PM.toast(e.message, 'error'); } } } }, 'Cancel order') : null)),
        o.shipments.length > 1 ? PM.alert('info', `Your order comes from ${o.shipments.length} stores, so it arrives in ${o.shipments.length} separate parcels.`) : null,
        o.shipments.map(shipmentCard),
        h('div', { class: 'grid cols-2' },
          h('div', { class: 'card card-pad' }, h('h3', null, 'Delivery'), h('div', { class: 'small text-2' }, o.shippingAddress.fullName, h('br'), `${o.shippingAddress.address}, ${o.shippingAddress.city}`, h('br'), o.shippingAddress.phone, h('br'), h('br'), `${o.delivery.label} · ${o.delivery.days}`)),
          h('div', { class: 'card card-pad' }, h('h3', null, 'Payment'), h('div', { class: 'small text-2' }, fmt.label(o.paymentMethod), h('br'), PM.payStatus(o.paymentStatus),
            h('div', { class: 'xs muted mt-1' }, { pending: o.paymentMethod === 'cod' ? 'You pay the courier on delivery. The seller confirms the cash.' : 'Waiting for the PrinceMall team to confirm your payment.', paid: o.paidAt ? `Confirmed ${fmt.date(o.paidAt)}.` : 'Payment confirmed.', refund_due: 'Your refund is being prepared by the PrinceMall team.', refunded: 'Your refund has been sent.' }[o.paymentStatus] || ''),
            o.paymentRef ? h('div', { class: 'xs muted mt-1' }, 'Reference ' + o.paymentRef) : null), h('div', { class: 'mt-2' }, S.totalsBlock({ subtotal: o.subtotal, discount: o.discount, couponCode: o.couponCode, shippingFee: o.shippingFee, tax: o.tax, total: o.total })))));
    }));

    r.add('/account/orders/:id/invoice', async (ctx) => {
      if (!S.requireLogin(ctx)) return null;
      ctx.title('Invoice');
      const { order: o, buyer } = await api('/orders/' + encodeURIComponent(ctx.params.id));
      return h('div', { class: 'stack' },
        h('div', { class: 'row between no-print' }, h('a', { class: 'btn', href: '#/account/orders/' + o.id }, icon('chevron-left'), 'Back to order'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => window.print() }, icon('receipt'), 'Print / save as PDF')),
        h('article', { class: 'invoice' }, h('div', { class: 'row between' }, h('div', null, h('h1', { style: 'margin:0' }, 'INVOICE'), h('div', { class: 'small' }, `Order ${o.id}`)), h('div', { style: 'text-align:right' }, h('strong', null, 'PrinceMall'), h('div', { class: 'small' }, fmt.date(o.createdAt)))),
          h('div', { class: 'grid cols-2 small', style: 'margin:20px 0' }, h('div', null, h('strong', null, 'Billed to'), h('div', null, (o.billingAddress || o.shippingAddress).fullName, h('br'), (o.billingAddress || o.shippingAddress).address + ', ' + (o.billingAddress || o.shippingAddress).city, h('br'), buyer.email)), h('div', null, h('strong', null, 'Shipped to'), h('div', null, o.shippingAddress.fullName, h('br'), o.shippingAddress.address + ', ' + o.shippingAddress.city))),
          h('table', null, h('thead', null, h('tr', null, ['Item', 'Seller', 'Qty', 'Price', 'Total'].map((t) => h('th', null, t)))), h('tbody', null, o.shipments.flatMap((s) => s.items.map((it) => h('tr', null, h('td', null, it.name + (it.color ? ` (${it.color})` : '')), h('td', null, s.storeName), h('td', null, String(it.quantity)), h('td', null, fmt.price(it.price)), h('td', null, fmt.price(it.lineTotal))))))),
          h('div', { style: 'max-width:320px;margin-left:auto;margin-top:16px' }, S.totalsBlock({ subtotal: o.subtotal, discount: o.discount, couponCode: o.couponCode, shippingFee: o.shippingFee, tax: o.tax, total: o.total })),
          h('p', { class: 'small', style: 'margin-top:24px' }, `Payment: ${fmt.label(o.paymentMethod)} (${o.paymentStatus}). Thank you for shopping with PrinceMall. Demo invoice: not a tax document.`)));
    });

    // =========================================================== WISHLIST
    r.add('/account/wishlist', account('wishlist', 'Wishlist', async () => {
      const d = await api('/wishlist');
      const root = h('div');
      const draw = (products) => root.replaceChildren(h('div', { class: 'page-title' }, h('div', null, h('h1', null, 'Wishlist'), h('p', null, `${products.length} saved item${products.length === 1 ? '' : 's'}`))),
        products.length ? h('div', { class: 'grid grid-products' }, products.map((p) => h('div', { class: 'stack-sm' }, S.productCard(p),
          h('button', { class: 'btn btn-block', type: 'button', onclick: async () => { const cart = await S.addToCart(p, { openDrawer: true }); if (cart) { await api('/wishlist/' + p.id, { method: 'POST' }); S.wish.delete(p.id); S.paintBadges(); draw(products.filter((x) => x.id !== p.id)); } } }, icon('cart'), 'Move to cart')))) : PM.empty({ icon: 'heart', title: 'Nothing saved yet', text: 'Tap the heart on any product to save it for later.', action: h('a', { class: 'btn btn-primary', href: '#/shop' }, 'Browse products') }));
      draw(d.products);
      return root;
    }));

    // =========================================================== REVIEWS
    r.add('/account/reviews', account('reviews', 'My reviews', async () => {
      const d = await api('/account/reviews');
      return h('div', { class: 'stack' }, h('div', { class: 'page-title' }, h('h1', null, 'Reviews & ratings')),
        d.toReview.length ? h('div', { class: 'card card-pad' }, h('h3', null, 'Waiting for your review'), h('div', { class: 'tile-grid' }, d.toReview.map((t) => h('div', { class: 'card card-pad-sm stack-sm' }, PM.img(t.image, t.name, { style: 'height:100px;object-fit:cover;border-radius:10px' }), h('strong', { class: 'small' }, t.name), h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => reviewModal(t.productId, t.name, () => S.router.render()) }, icon('star'), 'Write review'))))) : null,
        h('h2', null, 'Review history'),
        d.reviews.length ? d.reviews.map((rv) => h('article', { class: 'card card-pad-sm' }, h('div', { class: 'row-nowrap' }, PM.img(rv.image, '', { style: 'width:56px;height:56px;border-radius:10px;object-fit:cover' }), h('div', { class: 'grow' }, h('a', { href: '#/product/' + rv.productId, style: 'font-weight:700' }, rv.productName), h('div', { class: 'row' }, PM.stars(rv.rating), h('span', { class: 'xs muted' }, fmt.date(rv.createdAt))))),
          rv.title ? h('strong', null, rv.title) : null, h('p', { class: 'mb-0' }, rv.body), rv.photos.length ? h('div', { class: 'review-photos mt-1' }, rv.photos.map((u) => PM.img(u, 'Your photo'))) : null, rv.reply ? h('div', { class: 'reply mt-1' }, h('strong', null, `${rv.reply.store} replied:`), h('div', null, rv.reply.body)) : null)) : PM.empty({ icon: 'star', title: 'No reviews yet', text: 'After your items arrive you can rate them here.' }));
    }));

    // =========================================================== NOTIFICATIONS
    r.add('/account/notifications', account('notifications', 'Notifications', async () => {
      const state = { type: '' };
      const list = h('div', { class: 'stack-sm' });
      const tabs = PM.tabs([{ id: '', label: 'All' }, { id: 'order', label: 'Order updates' }, { id: 'promo', label: 'Promotions' }, { id: 'message', label: 'Messages' }, { id: 'system', label: 'System' }], '', (id) => { state.type = id; load(); });
      async function load() {
        list.replaceChildren(h('div', { class: 'spinner' }));
        try {
          const d = await api('/notifications' + PM.qs({ type: state.type, limit: 30 }));
          S.counts.unread = d.unread; S.paintBadges();
          list.replaceChildren(...(d.notifications.length ? d.notifications.map((n) => S.notificationRow(n)) : [PM.empty({ icon: 'bell', title: 'Nothing here', text: 'You are all caught up.' })]));
        } catch (e) { list.replaceChildren(PM.errorState(e, load)); }
      }
      load();
      return h('div', null, h('div', { class: 'page-title' }, h('h1', null, 'Notifications'), h('button', { class: 'btn', type: 'button', onclick: async () => { await api('/notifications/read', { method: 'POST', body: { all: true } }); S.counts.unread = 0; S.paintBadges(); load(); } }, icon('check'), 'Mark all as read')), tabs, h('div', { class: 'card card-pad-sm' }, list));
    }));

    // =========================================================== MESSAGES (buyer <-> seller)
    r.add('/account/messages', account('messages', 'Messages', async () => {
      const d = await api('/conversations');
      const thread = h('div', { class: 'card card-pad' }, h('p', { class: 'muted' }, d.conversations.length ? 'Select a conversation.' : 'Message a seller from any product or store page.'));
      let timer;
      async function open(id) {
        clearInterval(timer);
        const draw = async () => {
          if (!thread.isConnected) return clearInterval(timer);
          const t = await api('/conversations/' + id);
          const chat = h('div', { class: 'chat', tabindex: 0, 'aria-label': 'Conversation' }, t.messages.map((m) => h('div', { class: 'bubble' + (m.from === 'buyer' ? ' me' : '') }, m.body, h('small', null, `${m.name} · ${fmt.ago(m.at)}`))));
          const input = PM.input({ placeholder: 'Write a reply…', 'aria-label': 'Reply', maxLength: 2000 });
          const prev = thread.querySelector('input');
          thread.replaceChildren(h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, t.conversation.vendorName), t.conversation.product ? h('a', { class: 'small', href: '#/product/' + t.conversation.product.id }, t.conversation.product.name) : null), chat,
            h('form', { class: 'input-group mt-1', onsubmit: async (e) => { e.preventDefault(); if (!input.value.trim()) return; await api(`/conversations/${id}/messages`, { method: 'POST', body: { body: input.value } }); draw(); } }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Send')));
          chat.scrollTop = chat.scrollHeight;
          if (prev && prev.value) input.value = prev.value;
        };
        await draw();
        timer = setInterval(() => draw().catch(() => {}), 15000);
      }
      return h('div', { class: 'stack' }, h('div', { class: 'page-title' }, h('h1', null, 'Messages')),
        h('div', { class: 'convo' }, h('div', { class: 'card', style: 'overflow:hidden;align-self:start' }, d.conversations.length ? d.conversations.map((c) => h('button', { class: 'convo-item', type: 'button', onclick: () => open(c.id) }, h('strong', null, c.vendorName), c.unread ? h('span', { class: 'badge badge-accent', style: 'margin-left:8px' }, String(c.unread)) : null, h('div', { class: 'xs muted truncate' }, c.last ? c.last.body : ''))) : h('div', { class: 'card-pad-sm muted small' }, 'No conversations yet.')), thread));
    }));

    // =========================================================== SUPPORT TICKETS
    r.add('/account/support', account('support', 'Support', async () => {
      const d = await api('/tickets');
      const thread = h('div', { class: 'card card-pad' }, h('p', { class: 'muted' }, d.tickets.length ? 'Select a ticket to see the conversation.' : 'No tickets yet. Create one and our team will reply here.'));
      let timer;
      async function open(id) {
        clearInterval(timer);
        const draw = async () => {
          if (!thread.isConnected) return clearInterval(timer);
          const { tickets } = await api('/tickets');
          const t = tickets.find((x) => x.id === id);
          if (!t) return;
          const input = PM.textarea({ rows: 2, placeholder: 'Write a reply…', 'aria-label': 'Reply', maxLength: 3000 });
          const prev = thread.querySelector('textarea');
          const chat = h('div', { class: 'chat', tabindex: 0, 'aria-label': 'Ticket conversation' }, t.messages.map((m) => h('div', { class: 'bubble' + (m.from === 'user' ? ' me' : '') }, m.body, h('small', null, `${m.from === 'staff' ? 'Support' : 'You'} · ${fmt.ago(m.at)}`))));
          thread.replaceChildren(h('div', { class: 'row between' }, h('div', null, h('h3', { style: 'margin:0' }, t.subject), h('span', { class: 'xs muted' }, `${t.id} · ${fmt.label(t.category)}`)), PM.status(t.status)), chat,
            t.status === 'closed' ? h('p', { class: 'muted mt-1' }, 'This ticket is closed. Open a new one if you need more help.') : h('form', { class: 'stack-sm mt-1', onsubmit: async (e) => { e.preventDefault(); if (!input.value.trim()) return; await api(`/tickets/${id}/reply`, { method: 'POST', body: { message: input.value } }); draw(); } }, input, h('button', { class: 'btn btn-primary', type: 'submit', style: 'justify-self:start' }, 'Send reply')));
          chat.scrollTop = chat.scrollHeight;
          if (prev && prev.value) input.value = prev.value;
        };
        await draw();
        timer = setInterval(() => draw().catch(() => {}), 15000);
      }
      const newTicket = () => {
        const subject = PM.input({ maxLength: 120 });
        const category = PM.select([{ value: 'order', label: 'An order' }, { value: 'payment', label: 'Payment' }, { value: 'account', label: 'My account' }, { value: 'product', label: 'A product' }, { value: 'other', label: 'Other' }], 'order');
        const message = PM.textarea({ rows: 5, maxLength: 3000 });
        const err = PM.errorBox();
        PM.modal({ title: 'New support ticket', content: h('div', { class: 'stack' }, PM.field('Subject', subject, { required: true }), PM.field('Topic', category), PM.field('Message', message, { required: true }), err), actions: [{ label: 'Cancel' }, { label: 'Create ticket', kind: 'primary', onClick: async () => { try { await api('/tickets', { method: 'POST', body: { subject: subject.value, category: category.value, message: message.value } }); PM.toast('Ticket created'); S.router.render(); } catch (e) { err.show(e.message); return false; } } }] });
      };
      return h('div', { class: 'stack' }, h('div', { class: 'page-title' }, h('div', null, h('h1', null, 'Support'), h('p', null, 'Chat with our team. Replies appear here and in your notifications.')), h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/support' }, icon('help'), 'FAQs'), h('button', { class: 'btn btn-primary', type: 'button', onclick: newTicket }, icon('plus'), 'New ticket'))),
        h('div', { class: 'convo' }, h('div', { class: 'card', style: 'overflow:hidden;align-self:start' }, d.tickets.length ? d.tickets.map((t) => h('button', { class: 'convo-item', type: 'button', onclick: () => open(t.id) }, h('div', { class: 'row between' }, h('strong', { class: 'truncate' }, t.subject), PM.status(t.status)), h('div', { class: 'xs muted' }, `${t.id} · ${fmt.ago(t.updatedAt)}`))) : h('div', { class: 'card-pad-sm muted small' }, 'No tickets yet.')), thread));
    }));

    // =========================================================== LOYALTY
    r.add('/account/loyalty', account('loyalty', 'Rewards', async () => {
      const d = await api('/loyalty');
      const target = d.tier.next ? d.points + d.tier.next.needed : d.points;
      return h('div', { class: 'stack' }, h('div', { class: 'page-title' }, h('h1', null, 'Rewards & coupons')),
        h('div', { class: 'card card-pad', style: 'background:linear-gradient(120deg,var(--brand),#7c3aed);color:#fff;border:0' },
          h('div', { class: 'row between' }, h('div', null, h('div', { class: 'small', style: 'opacity:.85' }, 'Your points'), h('div', { style: 'font-size:2.6rem;font-weight:800;line-height:1' }, fmt.num(d.points))), h('span', { class: 'badge badge-accent' }, `${d.tier.name} member`)),
          h('div', { class: 'progress mt-2', style: 'background:rgba(255,255,255,.25)', role: 'progressbar', 'aria-label': 'Progress to next tier' }, h('span', { style: `width:${d.tier.next ? Math.min(100, (d.points / target) * 100) : 100}%;background:#fff` })),
          h('p', { class: 'small mb-0 mt-1', style: 'opacity:.9' }, d.tier.next ? `${fmt.num(d.tier.next.needed)} points to ${d.tier.next.name}. You earn 1 point for every 1,000 spent.` : 'Top tier reached. You earn 1 point for every 1,000 spent.')),
        h('h2', null, 'Redeem points'),
        h('div', { class: 'grid cols-4' }, d.rewards.map((rw) => h('div', { class: 'card card-pad-sm stack-sm' }, h('span', { class: 'kpi-ico' }, icon('gift')), h('strong', null, rw.label), h('div', { class: 'small muted' }, `${fmt.num(rw.cost)} points`),
          h('button', { class: 'btn btn-sm btn-primary', type: 'button', disabled: d.points < rw.cost, onclick: async () => { if (!await PM.confirm({ title: 'Redeem reward?', message: `Spend ${rw.cost} points on “${rw.label}”.`, confirmLabel: 'Redeem' })) return; try { const res = await api('/loyalty/redeem', { method: 'POST', body: { rewardId: rw.id } }); S.me.points = res.points; PM.toast(`Coupon ${res.code} created`); S.router.render(); } catch (e) { PM.toast(e.message, 'error'); } } }, d.points < rw.cost ? 'Not enough points' : 'Redeem')))),
        h('h2', null, 'Your coupons'),
        d.coupons.length ? h('div', { class: 'grid cols-3' }, d.coupons.map((c) => h('div', { class: 'card card-pad-sm', style: 'border-style:dashed' }, h('div', { class: 'row between' }, h('span', { class: 'code', style: 'font-size:1rem' }, c.code), h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(c.code); PM.toast('Code copied'); } catch { PM.toast(c.code); } } }, 'Copy')),
          h('div', { class: 'bold mt-1' }, c.type === 'percent' ? `${c.value}% off` : `${fmt.price(c.value)} off`), h('div', { class: 'xs muted' }, c.description || '', c.minSpend ? ` · min ${fmt.price(c.minSpend)}` : '', c.endsAt ? ` · until ${fmt.date(c.endsAt)}` : '')))) : PM.empty({ icon: 'tag', title: 'No coupons yet', text: 'Redeem points above to get one.' }),
        h('h2', null, 'Points history'), d.ledger.length ? h('div', { class: 'card card-pad-sm' }, d.ledger.map((l) => h('div', { class: 'sum-row' }, h('span', null, l.reason, h('span', { class: 'xs muted' }, ' · ' + fmt.date(l.at))), h('strong', { style: `color:var(--${l.delta > 0 ? 'success' : 'danger'})` }, (l.delta > 0 ? '+' : '') + l.delta)))) : h('p', { class: 'muted' }, 'Points will appear after your first order.'));
    }));

    // =========================================================== PROFILE & SECURITY
    r.add('/account/profile', account('profile', 'Profile & security', async () => {
      const name = PM.input({ value: S.me.name, maxLength: 60 });
      const phone = PM.input({ value: S.me.phone || '', type: 'tel', maxLength: 20 });
      const infoErr = PM.errorBox();
      const avatar = PM.imagePicker({ values: S.me.avatar ? [S.me.avatar] : [], max: 1, onChange: async (urls) => { try { const r2 = await api('/account', { method: 'PATCH', body: { avatar: urls[0] || '' } }); S.me = r2.user; S.rebuildHeader(); PM.toast('Photo updated'); } catch (e) { PM.toast(e.message, 'error'); } } });
      const cur = passwordField('Current password');
      const nw = passwordField('New password', { autocomplete: 'new-password' });
      const nw2 = passwordField('Confirm new password', { autocomplete: 'new-password' });
      const pwErr = PM.errorBox();
      const addrBox = h('div', { class: 'stack-sm' });
      const drawAddr = async () => {
        const { addresses } = await api('/account/addresses');
        addrBox.replaceChildren(...(addresses.length ? addresses.map((a) => h('div', { class: 'card card-pad-sm row between' }, h('div', null, h('strong', null, a.label), a.isDefault ? PM.badge('Default', 'brand') : null, h('div', { class: 'small text-2' }, `${a.fullName}, ${a.address}, ${a.city} · ${a.phone}`)), h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: async () => { await api('/account/addresses/' + a.id, { method: 'DELETE' }); drawAddr(); } }, icon('trash'), 'Delete'))) : [h('p', { class: 'muted' }, 'No saved addresses.')]));
      };
      drawAddr();
      const addAddress = () => {
        const f = { label: 'Home', fullName: S.me.name, phone: '', address: '', city: '', region: '', country: 'Cameroon' };
        const err = PM.errorBox();
        const inputs = Object.keys(f).map((k) => PM.field(fmt.label(k.replace(/([A-Z])/g, ' $1')), PM.input({ value: f[k], oninput: (e) => { f[k] = e.target.value; } }), { required: ['fullName', 'phone', 'address', 'city'].includes(k) }));
        PM.modal({ title: 'Add an address', content: h('div', { class: 'stack' }, h('div', { class: 'form-grid' }, inputs), err), actions: [{ label: 'Cancel' }, { label: 'Save address', kind: 'primary', onClick: async () => { try { await api('/account/addresses', { method: 'POST', body: f }); PM.toast('Address saved'); drawAddr(); } catch (e) { err.show(e.message); return false; } } }] });
      };
      return h('div', { class: 'stack' }, h('div', { class: 'page-title' }, h('h1', null, 'Profile & security')),
        h('section', { class: 'card card-pad stack' }, h('h2', { style: 'margin:0' }, 'Personal information'),
          h('div', { class: 'row-nowrap' }, h('div', { class: 'avatar avatar-lg' }, S.me.avatar ? PM.img(S.me.avatar, '') : fmt.initials(S.me.name)), h('div', null, h('div', { class: 'label' }, 'Profile photo'), avatar)),
          h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); infoErr.clear(); try { const r2 = await PM.busy(e.submitter, () => api('/account', { method: 'PATCH', body: { name: name.value, phone: phone.value } })); S.me = r2.user; S.rebuildHeader(); PM.toast('Profile saved'); } catch (x) { infoErr.show(x.message); } } },
            h('div', { class: 'form-grid' }, PM.field('Full name', name, { required: true }), PM.field('Phone', phone), PM.field('Email', PM.input({ value: S.me.email, readOnly: true }), { hint: S.me.emailVerified ? 'Verified' : undefined })),
            !S.me.emailVerified ? h('div', { class: 'row' }, PM.badge('Email not verified', 'warning'), h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { await api('/auth/resend', { method: 'POST' }); PM.toast('Verification link sent (demo: printed in the server console)'); } }, 'Send verification link')) : PM.badge('Email verified', 'success'),
            infoErr, h('button', { class: 'btn btn-primary', type: 'submit', style: 'justify-self:start' }, 'Save changes'))),
        h('section', { class: 'card card-pad stack' }, h('h2', { style: 'margin:0' }, 'Change password'), h('form', { class: 'stack', style: 'max-width:420px', onsubmit: async (e) => {
          e.preventDefault(); pwErr.clear();
          if (nw.input.value !== nw2.input.value) return pwErr.show('The new passwords do not match');
          try { await PM.busy(e.submitter, () => api('/account/password', { method: 'POST', body: { current: cur.input.value, next: nw.input.value } })); PM.toast('Password updated. Other devices were signed out.'); cur.input.value = nw.input.value = nw2.input.value = ''; } catch (x) { pwErr.show(x.message); }
        } }, cur, nw, nw2, pwErr, h('button', { class: 'btn btn-primary', type: 'submit', style: 'justify-self:start' }, 'Update password'))),
        h('section', { class: 'card card-pad stack' }, h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, 'Addresses'), h('button', { class: 'btn', type: 'button', onclick: addAddress }, icon('plus'), 'Add address')), addrBox));
    }));
  });
})();
