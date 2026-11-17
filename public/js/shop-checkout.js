'use strict';
// Cart, checkout (shipping > delivery > payment > review) and order confirmation.

(function () {
  const { h, api, icon, fmt } = PM;
  const S = window.Shop;

  const PAYMENTS = [
    ['mobile_money', 'Mobile Money', 'MTN MoMo or Orange Money', 'phone'],
    ['card', 'Credit / debit card', 'Visa, Mastercard', 'card'],
    ['paypal', 'PayPal', 'Pay with your PayPal balance', 'wallet'],
    ['stripe', 'Stripe', 'Secure card checkout by Stripe', 'lock'],
    ['wallet', 'Digital wallet', 'Apple Pay / Google Pay', 'zap'],
    ['bank_transfer', 'Bank transfer', 'Pay from your bank; we hold your items', 'receipt'],
    ['cod', 'Cash on delivery', 'Pay when your parcel arrives', 'truck'],
  ];
  const payLabel = (id) => (PAYMENTS.find((p) => p[0] === id) || [id, id])[1];

  // Totals block reused by cart, checkout, success and order pages.
  function totalsBlock(t) {
    const row = (label, value, cls = '') => h('div', { class: 'sum-row ' + cls }, h('span', null, label), h('span', { class: 'num' }, value));
    return h('div', null,
      row('Subtotal', fmt.price(t.subtotal)),
      t.discount ? row(`Discount${t.couponCode || (t.coupon && t.coupon.code) ? ' (' + (t.couponCode || t.coupon.code) + ')' : ''}`, '−' + fmt.price(t.discount)) : null,
      row('Shipping', (t.shipping ?? t.shippingFee) ? fmt.price(t.shipping ?? t.shippingFee) : 'Free'),
      row(`Tax${t.taxRate ? ' (' + fmt.pct(t.taxRate * 100) + ')' : ''}`, fmt.price(t.tax)),
      row('Total', fmt.price(t.total), 'total'));
  }
  S.totalsBlock = totalsBlock;

  function couponForm(cart, reload) {
    const input = PM.input({ placeholder: 'Coupon code', 'aria-label': 'Coupon code', style: 'text-transform:uppercase' });
    if (cart.coupon) {
      return h('div', { class: 'row between', style: 'background:var(--success-soft);color:var(--success);padding:8px 12px;border-radius:10px' },
        h('span', null, icon('tag'), ` ${cart.coupon.code} applied`),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => { await api('/cart/coupon', { method: 'DELETE' }); reload(); } }, 'Remove'));
    }
    return h('div', null, h('form', { class: 'input-group', onsubmit: async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      try { await PM.busy(e.submitter, () => api('/cart/coupon', { method: 'POST', body: { code: input.value } })); PM.toast('Coupon applied'); reload(); } catch (x) { PM.toast(x.message, 'error'); }
    } }, input, h('button', { class: 'btn', type: 'submit' }, 'Apply')),
    cart.couponError ? h('div', { class: 'field-error mt-1' }, cart.couponError) : null);
  }

  S.registerRoutes.push((r) => {
    // =========================================================== CART
    r.add('/cart', async (ctx) => {
      ctx.title('Your cart');
      const state = { city: PM.store.get('pm-city', ''), delivery: 'standard' };
      const root = h('div');
      let recs = null;
      const load = async () => {
        const cart = await api('/cart' + PM.qs({ delivery: state.delivery, city: state.city }));
        S.counts.cart = cart.count; S.paintBadges();
        draw(cart);
      };
      const act = (fn) => async (...args) => { try { await fn(...args); await load(); } catch (e) { PM.toast(e.message, 'error'); } };

      function draw(cart) {
        if (!cart.items.length) {
          root.replaceChildren(h('div', { class: 'page-title' }, h('h1', null, 'Your cart')), PM.empty({ icon: 'cart', title: 'Your cart is empty', text: 'Looks like you have not added anything yet.', action: h('a', { class: 'btn btn-primary btn-lg', href: '#/shop' }, 'Start shopping') }));
          return;
        }
        const after = cart.subtotal - cart.discount;
        const pct = Math.min(100, Math.round((after / cart.freeShippingThreshold) * 100));
        const lines = h('div', null, cart.items.map((l) => h('div', { class: 'cart-line' },
          h('a', { href: '#/product/' + l.productId }, PM.img(l.image, l.name)),
          h('div', { class: 'stack-sm' },
            h('a', { href: '#/product/' + l.productId, style: 'font-weight:700;text-decoration:none;color:inherit' }, l.name),
            h('div', { class: 'xs muted' }, `Sold by ${l.vendorName}${l.color ? ' · ' + l.color : ''}${l.size ? ' · ' + l.size : ''}`),
            h('div', { class: 'row' }, S.qtyControl(l, act((q) => api('/cart/items/' + l.id, { method: 'PATCH', body: { quantity: q } }))),
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: act(async () => { await api('/cart/items/' + l.id, { method: 'DELETE' }); }) }, icon('trash'), 'Remove'),
              h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: act(async () => { if (!S.me) { PM.toast('Log in to save items', 'error'); return; } if (!S.wish.has(l.productId)) await S.toggleWish(l.productId); await api('/cart/items/' + l.id, { method: 'DELETE' }); }) }, icon('heart'), 'Save for later')),
            l.quantity >= l.stock ? h('div', { class: 'xs', style: 'color:var(--warning)' }, `Maximum available: ${l.stock}`) : null),
          h('div', { class: 'price', style: 'text-align:right' }, fmt.price(l.lineTotal), l.quantity > 1 ? h('div', { class: 'xs muted', style: 'font-weight:500' }, `${fmt.price(l.price)} each`) : null))));
        const city = PM.input({ placeholder: 'Your city (e.g. Douala)', value: state.city, 'aria-label': 'City for delivery estimate' });
        const estimate = h('div', { class: 'stack-sm' }, h('strong', { class: 'small' }, 'Estimate delivery'),
          h('form', { class: 'input-group', onsubmit: (e) => { e.preventDefault(); state.city = city.value.trim(); PM.store.set('pm-city', state.city); load(); } }, city, h('button', { class: 'btn', type: 'submit' }, 'Update')),
          cart.deliveryOptions.map((o) => h('label', { class: 'option', style: 'padding:8px 12px' }, h('input', { type: 'radio', name: 'dl', checked: state.delivery === o.id, onchange: () => { state.delivery = o.id; load(); } }), h('span', { class: 'grow' }, h('strong', { class: 'small' }, o.label), h('div', { class: 'xs muted' }, o.days)), h('strong', { class: 'small' }, o.fee ? fmt.price(o.fee) : 'Free'))));
        root.replaceChildren(
          h('div', { class: 'page-title' }, h('div', null, h('h1', null, 'Your cart'), h('p', null, `${cart.count} item${cart.count === 1 ? '' : 's'}`)), h('a', { class: 'btn', href: '#/shop' }, icon('chevron-left'), 'Continue shopping')),
          h('div', { class: 'cart-grid' },
            h('div', { class: 'stack' },
              h('div', { class: 'card card-pad-sm' },
                cart.freeShippingRemaining > 0 ? h('div', { class: 'small' }, icon('truck'), ` Add `, h('strong', null, fmt.price(cart.freeShippingRemaining)), ' more for free standard delivery') : h('div', { class: 'small', style: 'color:var(--success)' }, icon('check'), ' You qualify for free standard delivery!'),
                h('div', { class: 'progress mt-1', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Progress to free shipping' }, h('span', { style: `width:${pct}%` }))),
              h('div', { class: 'card card-pad-sm' }, lines)),
            h('aside', { class: 'card card-pad summary stack', 'aria-label': 'Order summary' },
              h('h2', { style: 'margin:0' }, 'Order summary'), couponForm(cart, load), estimate, totalsBlock(cart),
              S.me ? h('a', { class: 'btn btn-primary btn-lg btn-block', href: '#/checkout' }, icon('lock'), 'Proceed to checkout') : h('a', { class: 'btn btn-primary btn-lg btn-block', href: '#/login?next=%2Fcheckout' }, 'Log in to check out'),
              h('div', { class: 'xs muted center' }, 'Taxes and final delivery are confirmed at checkout.'))),
          h('section', { class: 'section', id: 'recs' }));
        if (!recs) {
          api('/cart/recommendations').then((d) => {
            recs = d.products;
            const slot = root.querySelector('#recs');
            if (slot && recs.length) slot.replaceChildren(S.sectionHead('Recommended for you'), S.productGrid(recs));
          }).catch(() => {});
        } else {
          const slot = root.querySelector('#recs');
          if (slot && recs.length) slot.replaceChildren(S.sectionHead('Recommended for you'), S.productGrid(recs));
        }
      }
      await load();
      return root;
    });

    // =========================================================== CHECKOUT
    r.add('/checkout', async (ctx) => {
      if (!S.requireLogin(ctx)) return null;
      ctx.title('Checkout');
      const addressesRes = await api('/account/addresses').catch(() => ({ addresses: [] }));
      const saved = addressesRes.addresses;
      const def = saved.find((a) => a.isDefault) || saved[0];
      const st = {
        step: 1, savedId: def ? def.id : 'new',
        ship: def ? { ...def } : { fullName: S.me.name, phone: '', address: '', city: PM.store.get('pm-city', ''), region: '', country: 'Cameroon' },
        billingSame: true, bill: { fullName: S.me.name, phone: '', address: '', city: '', region: '', country: 'Cameroon' },
        delivery: 'standard', method: 'mobile_money', momo: '', provider: 'MTN MoMo', saveAddress: !saved.length,
        card: { name: '', number: '', exp: '', cvc: '' },
      };
      let cart = null;
      const reloadCart = async () => { cart = await api('/cart' + PM.qs({ delivery: st.delivery, city: st.ship.city })); S.counts.cart = cart.count; S.paintBadges(); };
      await reloadCart();
      if (!cart.items.length) return PM.empty({ icon: 'cart', title: 'Nothing to check out', text: 'Your cart is empty.', action: h('a', { class: 'btn btn-primary', href: '#/shop' }, 'Shop now') });

      const stepNames = ['Shipping', 'Delivery', 'Payment', 'Review'];
      const stepper = () => h('ol', { class: 'steps', 'aria-label': 'Checkout progress' }, stepNames.map((n, i) => h('li', { class: i + 1 < st.step ? 'done' : i + 1 === st.step ? 'current' : '', 'aria-current': i + 1 === st.step ? 'step' : null }, n)));

      // Each address form remembers its inputs so a validation error can highlight the exact box.
      const addrFields = (a, prefix) => {
        const inputs = {};
        const f = (key, label, props = {}) => {
          const inp = PM.input({ value: a[key] || '', placeholder: props.ph, oninput: (e) => { a[key] = e.target.value; inp.removeAttribute('aria-invalid'); }, autocomplete: props.ac, ...props.attrs });
          inputs[key] = inp;
          return PM.field(label, inp, { required: props.req, hint: props.hint });
        };
        const grid = h('div', { class: 'form-grid' },
          f('fullName', 'Full name', { req: true, ac: prefix + ' name', ph: 'e.g. Grace Nkeng' }),
          f('phone', 'Phone number', { req: true, ac: 'tel', attrs: { type: 'tel' }, ph: 'e.g. 670 00 00 00' }),
          f('address', 'Street address', { req: true, ac: prefix + ' street-address', ph: 'e.g. 12 Main Street, Molyko', hint: 'House number and street or neighbourhood. Put the town in "City".' }),
          f('city', 'City / town', { req: true, ac: prefix + ' address-level2', ph: 'e.g. Buea' }),
          f('region', 'Region / state', { ac: prefix + ' address-level1', ph: 'e.g. South West' }),
          f('country', 'Country', { ac: prefix + ' country-name' }));
        grid.inputs = inputs;
        return grid;
      };
      // Returns { key, msg } for the first problem, or null.
      const validAddress = (a) => {
        if (!a.fullName || a.fullName.trim().length < 2) return { key: 'fullName', msg: 'Enter the recipient’s full name.' };
        if (!/^\+?[0-9 ()-]{6,20}$/.test((a.phone || '').trim())) return { key: 'phone', msg: 'Enter a valid phone number (digits, spaces, + or -).' };
        if (!a.address || a.address.trim().length < 5) return { key: 'address', msg: 'The street address is too short. Enter the house number and street, for example “12 Main Street”. Your town goes in the City box.' };
        if (!a.city || a.city.trim().length < 2) return { key: 'city', msg: 'Enter the city or town.' };
        return null;
      };

      function stepShipping() {
        const err = PM.errorBox();
        const newForm = h('div', { class: 'mt-1' });
        let shipGrid = null; let billGrid = null;
        const drawNew = () => { shipGrid = st.savedId === 'new' ? addrFields(st.ship, 'shipping') : null; newForm.replaceChildren(...(st.savedId === 'new' ? [shipGrid, PM.check('Save this address to my account', { checked: st.saveAddress, onchange: (e) => { st.saveAddress = e.target.checked; } })] : [])); };
        const billBox = h('div', { class: 'mt-1' });
        const drawBill = () => { billGrid = st.billingSame ? null : addrFields(st.bill, 'billing'); billBox.replaceChildren(...(st.billingSame ? [] : [h('h3', null, 'Billing address'), billGrid])); };
        drawNew(); drawBill();
        return h('div', { class: 'stack' }, h('h2', { style: 'margin:0' }, 'Where should we deliver?'),
          saved.length ? h('div', { class: 'stack-sm' }, saved.map((a) => h('label', { class: 'option' }, h('input', { type: 'radio', name: 'addr', checked: st.savedId === a.id, onchange: () => { st.savedId = a.id; st.ship = { ...a }; drawNew(); } }),
            h('span', null, h('strong', null, a.label || 'Address'), h('div', { class: 'small text-2' }, `${a.fullName}, ${a.address}, ${a.city} · ${a.phone}`)))),
            h('label', { class: 'option' }, h('input', { type: 'radio', name: 'addr', checked: st.savedId === 'new', onchange: () => { st.savedId = 'new'; st.ship = { fullName: S.me.name, phone: '', address: '', city: '', region: '', country: 'Cameroon' }; drawNew(); } }), h('strong', null, 'Use a new address'))) : null,
          newForm,
          PM.check('Billing address is the same as shipping', { checked: st.billingSame, onchange: (e) => { st.billingSame = e.target.checked; drawBill(); } }), billBox, err,
          h('div', { class: 'row between' }, h('a', { class: 'btn', href: '#/cart' }, icon('chevron-left'), 'Back to cart'),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
              err.clear();
              const shipProblem = validAddress(st.ship);
              const billProblem = !st.billingSame && validAddress(st.bill);
              const problem = shipProblem || billProblem;
              if (problem) {
                const grid = shipProblem ? shipGrid : billGrid;
                const box = grid && grid.inputs[problem.key];
                err.show((shipProblem ? '' : 'Billing address: ') + problem.msg);
                if (box) { box.setAttribute('aria-invalid', 'true'); box.focus(); box.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
                return;
              }
              await reloadCart(); st.step = 2; draw();
            } }, 'Continue to delivery', icon('chevron-right'))));
      }

      function stepDelivery() {
        return h('div', { class: 'stack' }, h('h2', { style: 'margin:0' }, 'Choose a delivery option'),
          cart.deliveryOptions.map((o) => h('label', { class: 'option' }, h('input', { type: 'radio', name: 'dl', checked: st.delivery === o.id, onchange: async () => { st.delivery = o.id; await reloadCart(); drawSummary(); } }),
            h('span', { class: 'grow' }, h('strong', null, o.label), h('div', { class: 'small muted' }, `${o.days}${o.id === 'pickup' ? '' : ' · to ' + (st.ship.city || 'your city')}`)), h('strong', null, o.fee ? fmt.price(o.fee) : 'Free'))),
          h('div', { class: 'row between' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.step = 1; draw(); } }, icon('chevron-left'), 'Back'),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { st.step = 3; draw(); } }, 'Continue to payment', icon('chevron-right'))));
      }

      function stepPayment() {
        const err = PM.errorBox();
        const panel = h('div', { class: 'card card-pad-sm mt-1' });
        const drawPanel = () => {
          const m = st.method;
          if (m === 'card') {
            panel.replaceChildren(PM.alert('info', 'No card details are collected on this site. Place your order and a member of the PrinceMall team will contact you to take the card payment securely. The order is marked as paid only after they confirm it.'));
          } else if (m === 'mobile_money') {
            panel.replaceChildren(h('div', { class: 'stack' }, h('div', { class: 'row', role: 'radiogroup', 'aria-label': 'Provider' }, ['MTN MoMo', 'Orange Money'].map((p) => h('label', { class: 'option', style: 'padding:8px 14px' }, h('input', { type: 'radio', name: 'prov', checked: st.provider === p, onchange: () => { st.provider = p; } }), p))),
              PM.field('Mobile Money number', PM.input({ type: 'tel', value: st.momo, placeholder: '6 70 00 00 00', autocomplete: 'tel', oninput: (e) => { st.momo = e.target.value; } }), { required: true, hint: 'We use this number to contact you for the payment. Nothing is charged automatically; the order is marked paid once our team confirms the money arrived.' })));
          } else if (m === 'paypal' || m === 'stripe') {
            panel.replaceChildren(PM.alert('info', `Place your order and the PrinceMall team will send you a ${m === 'paypal' ? 'PayPal' : 'Stripe'} payment request. The order is marked as paid only after they confirm the money arrived.`));
          } else if (m === 'wallet') {
            panel.replaceChildren(PM.alert('info', 'Place your order and the PrinceMall team will contact you to complete the wallet payment. The order is marked as paid only after they confirm it.'));
          } else if (m === 'bank_transfer') {
            panel.replaceChildren(PM.alert('warning', 'Your order is placed as “payment pending”. The PrinceMall team will send you the bank details and mark the order as paid once the transfer arrives.'));
          } else panel.replaceChildren(PM.alert('info', 'Pay the courier in cash when your parcel arrives. Please have the exact amount ready.'));
        };
        drawPanel();
        return h('div', { class: 'stack' }, h('h2', { style: 'margin:0' }, 'How would you like to pay?'),
          h('div', { class: 'stack-sm', role: 'radiogroup', 'aria-label': 'Payment method' }, PAYMENTS.map(([id, label, sub, ic]) => h('label', { class: 'option' }, h('input', { type: 'radio', name: 'pay', checked: st.method === id, onchange: () => { st.method = id; drawPanel(); } }), h('span', { class: 'kpi-ico', style: 'flex:none' }, icon(ic)), h('span', null, h('strong', null, label), h('div', { class: 'small muted' }, sub))))),
          panel, err,
          h('div', { class: 'row between' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.step = 2; draw(); } }, icon('chevron-left'), 'Back'),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
              err.clear();
              if (st.method === 'mobile_money' && !/^\+?[0-9 ()-]{6,20}$/.test(st.momo.trim())) return err.show('Enter a valid Mobile Money number');
              st.step = 4; draw();
            } }, 'Review order', icon('chevron-right'))));
      }

      function stepReview() {
        const err = PM.errorBox();
        const place = h('button', { class: 'btn btn-success btn-lg', type: 'button', onclick: async (e) => {
          err.clear();
          try {
            const res = await PM.busy(e.currentTarget, () => api('/checkout', { method: 'POST', body: {
              shipping: st.ship, billingSame: st.billingSame, billing: st.billingSame ? undefined : st.bill, deliveryId: st.delivery,
              paymentMethod: st.method, momoNumber: st.method === 'mobile_money' ? st.momo : undefined, saveAddress: st.savedId === 'new' && st.saveAddress,
            } }));
            S.counts.cart = 0; S.paintBadges();
            S.router.go('/order-success/' + res.order.id);
          } catch (x) { err.show(x.message); }
        } }, icon('lock'), `Place order · ${fmt.price(cart.total)}`);
        const block = (title, step, body) => h('div', { class: 'card card-pad-sm' }, h('div', { class: 'row between' }, h('strong', null, title), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { st.step = step; draw(); } }, 'Change')), body);
        return h('div', { class: 'stack' }, h('h2', { style: 'margin:0' }, 'Review and place your order'),
          block('Ship to', 1, h('div', { class: 'small text-2' }, `${st.ship.fullName}`, h('br'), `${st.ship.address}, ${st.ship.city}${st.ship.region ? ', ' + st.ship.region : ''}`, h('br'), st.ship.phone)),
          block('Delivery', 2, h('div', { class: 'small text-2' }, `${cart.delivery.label} · ${cart.delivery.days} · ${cart.delivery.fee ? fmt.price(cart.delivery.fee) : 'Free'}`)),
          block('Payment', 3, h('div', { class: 'small text-2' }, payLabel(st.method), st.method === 'mobile_money' ? ` · ${st.provider} ${st.momo}` : '', h('div', { class: 'xs muted' }, st.method === 'cod' ? 'You pay the courier when the parcel arrives.' : 'Marked as paid after our team confirms the money arrived.'))),
          h('div', { class: 'card card-pad-sm' }, h('strong', null, 'Items'), cart.items.map((l) => h('div', { class: 'row-nowrap mt-1' }, PM.img(l.image, '', { style: 'width:48px;height:48px;border-radius:8px;object-fit:cover' }), h('div', { class: 'grow small' }, l.name, h('div', { class: 'xs muted' }, `Qty ${l.quantity} · ${l.vendorName}`)), h('span', { class: 'price small' }, fmt.price(l.lineTotal))))),
          err, h('div', { class: 'row between' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.step = 3; draw(); } }, icon('chevron-left'), 'Back'), place),
          h('p', { class: 'xs muted center' }, 'By placing your order you agree to our terms. Nothing is charged automatically: payment is confirmed by a person.'));
      }

      const main = h('div', { class: 'card card-pad' });
      const sum = h('aside', { class: 'card card-pad summary stack', 'aria-label': 'Order summary' });
      function drawSummary() {
        sum.replaceChildren(h('h2', { style: 'margin:0' }, 'Order summary'),
          h('div', { class: 'stack-sm' }, cart.items.map((l) => h('div', { class: 'row-nowrap small' }, h('span', { class: 'grow' }, `${l.quantity} × ${l.name}`), h('span', { class: 'num' }, fmt.price(l.lineTotal))))),
          couponForm(cart, async () => { await reloadCart(); drawSummary(); }), totalsBlock(cart), h('div', { class: 'xs muted' }, icon('shield'), ' Secure checkout · 14-day returns'));
      }
      const stepperSlot = h('div');
      function draw() {
        stepperSlot.replaceChildren(stepper());
        main.replaceChildren([stepShipping, stepDelivery, stepPayment, stepReview][st.step - 1]());
        drawSummary();
        if (st.step > 1) window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      draw();
      return h('div', null, h('div', { class: 'page-title' }, h('h1', null, 'Checkout')), stepperSlot, h('div', { class: 'checkout-grid' }, main, sum));
    });

    // =========================================================== ORDER SUCCESS
    r.add('/order-success/:id', async (ctx) => {
      if (!S.requireLogin(ctx)) return null;
      ctx.title('Order confirmed');
      const { order } = await api('/orders/' + encodeURIComponent(ctx.params.id));
      const total = (o) => ({ subtotal: o.subtotal, discount: o.discount, couponCode: o.couponCode, shippingFee: o.shippingFee, tax: o.tax, total: o.total });
      return h('div', { class: 'stack', style: 'max-width:820px;margin:0 auto' },
        h('div', { class: 'card card-pad center stack', style: 'align-items:center' },
          h('div', { class: 'state-icon', style: 'width:72px;height:72px;border-radius:50%;background:var(--success-soft);color:var(--success);display:grid;place-items:center' }, icon('check', 'icon')),
          h('h1', { style: 'margin:0' }, 'Thank you! Your order is placed'),
          h('p', { class: 'muted', style: 'margin:0' }, `Order ${order.id} · ${fmt.dateTime(order.createdAt)}`),
          order.paymentMethod === 'cod'
            ? PM.alert('info', 'You pay the courier in cash when your parcel arrives. The seller confirms the cash once it is collected.')
            : PM.alert('warning', 'Payment pending: the PrinceMall team will contact you to take the payment and mark the order as paid once the money arrives. Your reward points are added at that moment.'),
          h('div', { class: 'row no-print', style: 'justify-content:center' }, h('a', { class: 'btn btn-primary btn-lg', href: '#/account/orders/' + order.id }, icon('truck'), 'Track order'), h('button', { class: 'btn btn-lg', type: 'button', onclick: () => window.print() }, icon('receipt'), 'Print receipt'), h('a', { class: 'btn btn-lg', href: '#/shop' }, 'Keep shopping'))),
        h('section', { class: 'card card-pad', 'aria-label': 'Receipt' }, h('h2', null, 'Receipt'),
          order.shipments.map((sh) => h('div', { class: 'mt-1' }, h('div', { class: 'row between' }, h('strong', null, sh.storeName), PM.status(sh.status)), sh.items.map((it) => h('div', { class: 'order-line row between small', style: 'padding:6px 0' }, h('span', null, `${it.quantity} × ${it.name}${it.color ? ' (' + it.color + ')' : ''}`), h('span', { class: 'num' }, fmt.price(it.lineTotal)))))),
          h('div', { class: 'divider' }), totalsBlock(total(order)), h('div', { class: 'divider' }),
          h('div', { class: 'grid cols-3 small' },
            h('div', null, h('strong', null, 'Delivery to'), h('div', { class: 'text-2' }, order.shippingAddress.fullName, h('br'), order.shippingAddress.address + ', ' + order.shippingAddress.city, h('br'), order.shippingAddress.phone)),
            h('div', null, h('strong', null, 'Delivery'), h('div', { class: 'text-2' }, `${order.delivery.label}`, h('br'), order.delivery.days)),
            h('div', null, h('strong', null, 'Payment'), h('div', { class: 'text-2' }, payLabel(order.paymentMethod), h('br'), PM.payStatus(order.paymentStatus), order.paymentRef ? h('div', { class: 'xs muted' }, 'Ref ' + order.paymentRef) : null)))));
    });
  });
})();
