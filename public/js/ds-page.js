'use strict';
// Living design-system documentation: tokens, components (rendered with the
// real code), accessibility rules, user flows and developer handoff.

(function () {
  const { h, icon, fmt } = PM;

  const section = (id, title, intro, ...body) => h('section', { class: 'section', id, 'aria-labelledby': id + '-h' }, h('h2', { id: id + '-h' }, title), intro ? h('p', { class: 'text-2' }, intro) : null, ...body);
  const demo = (label, ...kids) => h('div', { class: 'card card-pad stack-sm' }, h('div', { class: 'xs muted bold' }, label), h('div', { class: 'row' }, ...kids));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function colorTokens() {
    const groups = {
      Brand: ['--brand', '--brand-hover', '--brand-soft', '--accent', '--accent-soft'],
      Surface: ['--bg', '--surface', '--surface-2', '--surface-3', '--border', '--border-strong'],
      Text: ['--text', '--text-2', '--text-3'],
      Status: ['--success', '--success-soft', '--warning', '--warning-soft', '--danger', '--danger-soft', '--info', '--info-soft'],
      'Chart series': ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'],
    };
    const box = h('div', { class: 'stack' });
    const draw = () => box.replaceChildren(...Object.entries(groups).map(([g, tokens]) => h('div', null, h('h3', null, g),
      h('div', { class: 'grid cols-4' }, tokens.map((t) => h('div', null, h('div', { class: 'swatch-demo', style: `background:var(${t})` }), h('div', { class: 'code mt-1' }, t), h('div', { class: 'xs muted' }, css(t))))))));
    draw();
    document.addEventListener('themechange', () => setTimeout(draw, 50));
    return box;
  }

  const flow = (title, steps) => h('div', { class: 'card card-pad' }, h('h3', null, title), h('ol', { style: 'list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px;align-items:center' },
    steps.flatMap((s, i) => [h('li', { class: 'chip', style: 'cursor:default' }, h('strong', { class: 'xs', style: 'opacity:.6' }, String(i + 1)), s), i < steps.length - 1 ? h('li', { 'aria-hidden': 'true', style: 'display:flex' }, icon('chevron-right')) : null])));

  function build() {
    const toast = () => PM.toast('Saved. This is a success toast.');
    const modal = () => PM.modal({ title: 'Modal window', content: h('p', null, 'Focus is trapped inside, Esc and the backdrop close it, and focus returns to the button that opened it.'), actions: [{ label: 'Cancel' }, { label: 'Confirm', kind: 'primary' }] });
    const drawer = () => PM.drawer({ title: 'Drawer', content: h('p', null, 'Used for the cart and notifications.') });
    const sampleRows = [{ id: 1, name: 'Hisense Microwave', price: 65000, stock: 14, status: 'active' }, { id: 2, name: 'Cold-Press Juicer', price: 25000, stock: 3, status: 'draft' }, { id: 3, name: 'Standing Fan', price: 30000, stock: 0, status: 'archived' }];
    const table = PM.table({ selectable: true, columns: [{ key: 'name', label: 'Product', sortable: true }, { key: 'price', label: 'Price', sortable: true, align: 'r', render: (r) => fmt.price(r.price) }, { key: 'stock', label: 'Stock', sortable: true, align: 'r' }, { key: 'status', label: 'Status', render: (r) => PM.status(r.status) }], rows: sampleRows });
    const days = Array.from({ length: 14 }, (_, i) => `D${i + 1}`);
    const vals = days.map((_, i) => 40 + Math.round(Math.sin(i / 2) * 18 + i * 3));

    return h('div', null,
      h('header', { class: 'header glass' }, h('div', { class: 'container' }, h('div', { class: 'header-inner' }, h('a', { class: 'logo', href: '/' }, h('span', { class: 'logo-mark' }, 'P'), 'PrinceMall'), h('span', { class: 'badge badge-brand' }, 'Design system'), h('div', { class: 'header-actions' }, PM.theme.toggleButton())))),
      h('main', { id: 'main', class: 'container', style: 'padding-top:32px', tabindex: -1 },
        h('div', { class: 'page-title' }, h('div', null, h('h1', null, 'PrinceMall design system'), h('p', null, 'Tokens, components and guidelines shared by the shop, seller portal and admin panel. Every example below is rendered with the real code. Toggle dark mode with the button above.'))),
        h('nav', { 'aria-label': 'Contents', class: 'row' }, ['tokens', 'type', 'components', 'data', 'overlays', 'states', 'a11y', 'flows', 'handoff'].map((id) => h('a', { class: 'chip', href: '#' + id }, fmt.label(id)))),

        section('tokens', 'Design tokens', 'All values are CSS custom properties on :root. The dark theme overrides the same names under [data-theme="dark"], so components never hard-code a colour.', colorTokens(),
          h('h3', { class: 'mt-3' }, 'Spacing (4px base)'), h('div', { class: 'stack-sm' }, [['--s-1', 4], ['--s-2', 8], ['--s-3', 12], ['--s-4', 16], ['--s-5', 24], ['--s-6', 32], ['--s-7', 48], ['--s-8', 64]].map(([t, px]) => h('div', { class: 'row-nowrap' }, h('span', { class: 'code', style: 'min-width:70px' }, t), h('div', { style: `height:12px;width:${px * 2}px;background:var(--brand);border-radius:4px` }), h('span', { class: 'xs muted' }, px + 'px')))),
          h('h3', { class: 'mt-3' }, 'Radius, elevation and glass'), h('div', { class: 'grid cols-4' }, [['--r-sm 6px', 'var(--r-sm)', 'var(--shadow-1)'], ['--r-md 10px', 'var(--r-md)', 'var(--shadow-1)'], ['--r-lg 16px', 'var(--r-lg)', 'var(--shadow-2)'], ['--r-xl 24px', 'var(--r-xl)', 'var(--shadow-3)']].map(([l, r, s]) => h('div', { class: 'card card-pad-sm center', style: `border-radius:${r};box-shadow:${s}` }, l))),
          h('div', { class: 'grid cols-3 mt-2' }, h('div', { class: 'glass card-pad center', style: 'border-radius:16px;background-image:linear-gradient(120deg,var(--brand),var(--chart-5))' }, h('div', { class: 'glass', style: 'padding:16px;border-radius:12px' }, 'Glass surface (header, sticky bars)')), h('div', { class: 'neu card-pad center' }, 'Neumorphic raised'), h('div', { class: 'neu-inset card-pad center' }, 'Neumorphic inset (toggles)'))),

        section('type', 'Typography', 'System font stack for speed and native feel. Scale in rem so it follows the user’s browser setting.',
          h('div', { class: 'card card-pad stack-sm' }, [['--fs-4xl', '3rem', 'Display'], ['--fs-3xl', '2.25rem', 'Hero title'], ['--fs-2xl', '1.75rem', 'Page title (h1)'], ['--fs-xl', '1.375rem', 'Section title (h2)'], ['--fs-lg', '1.125rem', 'Card title (h3)'], ['--fs-md', '1rem', 'Body'], ['--fs-sm', '0.875rem', 'Secondary text'], ['--fs-xs', '0.75rem', 'Captions, badges']].map(([t, size, label]) => h('div', { class: 'row-nowrap' }, h('span', { class: 'code', style: 'min-width:90px' }, t), h('span', { style: `font-size:${size};font-weight:${size.startsWith('0.') || size === '1rem' ? 500 : 700};line-height:1.2` }, label))))),

        section('components', 'Components', 'Buttons, forms, cards, badges, navigation.',
          h('div', { class: 'grid cols-2' },
            demo('Buttons', h('button', { class: 'btn btn-primary', type: 'button' }, 'Primary'), h('button', { class: 'btn', type: 'button' }, 'Secondary'), h('button', { class: 'btn btn-accent', type: 'button' }, 'Accent'), h('button', { class: 'btn btn-success', type: 'button' }, 'Success'), h('button', { class: 'btn btn-danger', type: 'button' }, 'Danger'), h('button', { class: 'btn btn-ghost', type: 'button' }, 'Ghost'), h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Disabled'), h('button', { class: 'btn btn-primary', type: 'button', 'aria-busy': 'true' }, 'Loading')),
            demo('Button sizes & icons', h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, 'Small'), h('button', { class: 'btn btn-primary', type: 'button' }, icon('cart'), 'Medium'), h('button', { class: 'btn btn-primary btn-lg', type: 'button' }, 'Large'), h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Wishlist' }, icon('heart'))),
            demo('Badges & status', ...['placed', 'processing', 'shipped', 'delivered', 'cancelled', 'pending', 'approved', 'vip'].map((s) => PM.status(s)), PM.badge('Brand', 'brand'), PM.badge('Info', 'info')),
            demo('Rating, price, discount', PM.stars(4.5, 128), h('span', { class: 'price' }, fmt.price(65000), h('span', { class: 'price-old' }, fmt.price(78000))), h('span', { class: 'discount-tag' }, '-17%'), PM.countdown(new Date(Date.now() + 5 * 3600000).toISOString()))),
          h('h3', { class: 'mt-3' }, 'Form elements'),
          h('div', { class: 'card card-pad' }, h('div', { class: 'form-grid' }, PM.field('Text input', PM.input({ placeholder: 'Full name' }), { required: true, hint: 'Helper text sits under the field.' }), PM.field('Select', PM.select(['Kitchen Appliances', 'Audio', 'Watches'], 'Audio')), PM.field('Search', h('div', { class: 'input-icon' }, icon('search'), PM.input({ type: 'search', placeholder: 'Search…' }))), PM.field('With error', h('input', { class: 'input', 'aria-invalid': 'true', value: 'abc' }), { error: 'Enter a valid email address' }), PM.field('Textarea', PM.textarea({ rows: 3, placeholder: 'Write something…' })), h('div', { class: 'stack-sm' }, PM.check('Checkbox', { checked: true }), PM.check('Another option'), h('label', { class: 'row-nowrap' }, PM.switch({ checked: true }), 'Switch')))),
          h('h3', { class: 'mt-3' }, 'Product card, vendor card, KPI card'),
          h('div', { class: 'grid cols-3' },
            h('article', { class: 'pcard' }, h('div', { class: 'pcard-media' }, PM.img('images/standing-fan.jpg', 'Fan'), h('div', { class: 'pcard-tags' }, h('span', { class: 'discount-tag' }, '-17%'), PM.badge('Only 3 left', 'warning')), h('button', { class: 'pcard-wish glass', type: 'button', 'aria-label': 'Save', 'aria-pressed': 'true' }, icon('heart'))), h('div', { class: 'pcard-body' }, h('span', { class: 'pcard-title' }, 'Oscillating Standing Fan 18"'), h('span', { class: 'pcard-vendor' }, 'by HomeNest Appliances'), PM.stars(4.5, 42), h('div', { class: 'pcard-price price' }, fmt.price(30000), h('span', { class: 'price-old' }, fmt.price(36000)))), h('div', { class: 'pcard-actions' }, h('button', { class: 'btn btn-sm', type: 'button' }, 'See more'), h('button', { class: 'btn btn-sm btn-primary', type: 'button' }, icon('cart'), 'Add'))),
            h('div', { class: 'card card-pad stack-sm' }, h('div', { class: 'row-nowrap' }, h('span', { class: 'avatar avatar-lg' }, 'CW'), h('div', null, h('strong', null, 'Chrono Watches'), h('div', { class: 'xs muted' }, 'Buea · Selling since 2026'))), PM.stars(4.6, 31), h('div', { class: 'row' }, PM.badge('Verified', 'success'), PM.badge('Fast shipper', 'info')), h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', type: 'button' }, 'Contact'), h('button', { class: 'btn btn-sm btn-primary', type: 'button' }, 'Visit store'))),
            PM.kpi({ label: 'Revenue', value: fmt.price(1620000), change: 12.4, icon: 'dollar', spark: vals })),
          h('h3', { class: 'mt-3' }, 'Navigation: tabs, accordion, breadcrumbs, pagination, stepper'),
          h('div', { class: 'stack' }, PM.tabs([{ id: 'a', label: 'Overview' }, { id: 'b', label: 'Orders', count: 12 }, { id: 'c', label: 'Returns', count: 2 }], 'a', () => {}), PM.breadcrumbs([{ label: 'Home', href: '#' }, { label: 'Audio', href: '#' }, { label: 'Earphones' }]),
            PM.accordion([{ title: 'How do returns work?', body: 'Request a return within 14 days of delivery.' }, { title: 'Which payment methods are accepted?', body: 'Mobile Money, card, PayPal, Stripe, wallets, bank transfer and cash on delivery.' }]),
            PM.pagination({ page: 3, pages: 9, onChange: () => {} }), h('ol', { class: 'steps' }, ['Shipping', 'Delivery', 'Payment', 'Review'].map((s, i) => h('li', { class: i < 1 ? 'done' : i === 1 ? 'current' : '' }, s))))),

        section('data', 'Data display: tables and charts', 'Charts are inline SVG that follow the theme, show tooltips on hover, and include a hidden data table for screen readers.',
          table.el, h('div', { class: 'grid cols-2 mt-2' }, PM.dash ? null : null, h('div', { class: 'card card-pad' }, h('h3', null, 'Line chart'), PM.charts.line({ labels: days, series: [{ name: 'Revenue', values: vals }, { name: 'Target', values: vals.map((v) => v * 0.8 + 6), color: 'var(--chart-4)' }], height: 220 })), h('div', { class: 'card card-pad' }, h('h3', null, 'Bar chart'), PM.charts.bar({ labels: days.slice(0, 8), series: [{ name: 'Orders', values: vals.slice(0, 8) }], height: 220 }))),
          h('div', { class: 'grid cols-2 mt-2' }, h('div', { class: 'card card-pad' }, h('h3', null, 'Donut'), PM.charts.donut({ items: [{ label: 'Kitchen', value: 420 }, { label: 'Home', value: 310 }, { label: 'Audio', value: 180 }, { label: 'Watches', value: 140 }], size: 150 })), h('div', { class: 'card card-pad' }, h('h3', null, 'Horizontal bars'), PM.charts.hbar([{ label: 'Douala', value: 820000 }, { label: 'Yaounde', value: 610000 }, { label: 'Buea', value: 320000 }], { fmt: fmt.price })))),

        section('overlays', 'Overlays and feedback', 'Modals trap focus, close on Esc, and restore focus. Toasts are announced politely.',
          h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: modal }, 'Open modal'), h('button', { class: 'btn', type: 'button', onclick: drawer }, 'Open drawer'), h('button', { class: 'btn', type: 'button', onclick: toast }, 'Show toast'), h('button', { class: 'btn', type: 'button', onclick: () => PM.toast('Something went wrong.', 'error') }, 'Show error toast')),
          h('div', { class: 'stack-sm mt-2' }, PM.alert('success', 'Success: your order was placed.'), PM.alert('info', 'Info: shipping takes 3-5 business days.'), PM.alert('warning', 'Warning: only 3 items left.'), PM.alert('error', 'Error: your card was declined.'))),

        section('states', 'Empty, loading and error states', null,
          h('div', { class: 'grid cols-3' }, h('div', { class: 'card' }, PM.empty({ icon: 'cart', title: 'Your cart is empty', text: 'Add something you love.', action: h('button', { class: 'btn btn-primary', type: 'button' }, 'Start shopping') })), h('div', { class: 'card card-pad' }, PM.skeleton()), h('div', { class: 'card' }, PM.errorState(new Error('We could not load your orders.'), () => {})))),

        section('a11y', 'Accessibility guidelines (WCAG 2.2 AA)', null,
          h('div', { class: 'card card-pad' }, h('ul', { class: 'stack-sm text-2', style: 'margin:0;padding-left:20px' }, [
            'Colour contrast: body text is at least 4.5:1 and large text 3:1 in both themes. Status is never conveyed by colour alone: badges include text.',
            'Keyboard: every control is reachable with Tab, has a visible 3px focus ring, and a skip link jumps to the main content.',
            'Overlays: modals and drawers are role="dialog" with aria-modal, trap focus, close on Esc and return focus to the trigger.',
            'Routing: on each page change focus moves to the page heading and the title is announced in a polite live region.',
            'Forms: every input has a visible label, errors are text (role="alert") and required fields are marked with an asterisk and the required attribute.',
            'Images have alt text; decorative icons are aria-hidden. Charts have an aria-label plus a hidden data table.',
            'Motion: animations are short and are disabled when the user prefers reduced motion; the hero carousel does not auto-advance in that case.',
            'Touch targets are at least 40px (32px for dense table actions), and layouts reflow from 320px without horizontal scrolling.',
          ].map((t) => h('li', null, t))))),

        section('flows', 'User flows', 'The three journeys the product is built around.',
          h('div', { class: 'stack' },
            flow('Buyer: discover to delivery', ['Landing', 'Search / category', 'Product details', 'Add to cart', 'Cart (coupon, shipping estimate)', 'Log in or register', 'Shipping', 'Delivery', 'Payment', 'Review', 'Order confirmation', 'Track, review or return']),
            flow('Vendor: open a store and sell', ['Register (account)', 'Business details', 'Identity verification', 'Admin review', 'Approved', 'Add products', 'Receive order', 'Process, ship, add tracking', 'Delivered', 'Payout request']),
            flow('Admin: keep the marketplace healthy', ['Review application', 'Approve / reject', 'Monitor products', 'Handle tickets', 'Set commission', 'Approve payouts', 'Watch security log']))),

        section('handoff', 'Developer handoff', null,
          h('div', { class: 'grid cols-2' },
            h('div', { class: 'card card-pad stack-sm' }, h('h3', null, 'Breakpoints'), h('table', { class: 'table token-table' }, h('tbody', null, [['640px', '3-column product grid'], ['720px', 'Wider gutters and dashboard padding'], ['860px', 'Header search bar appears'], ['900px', 'Two-column catalog, product page, account'], ['960px', 'Dashboard sidebar becomes permanent'], ['1100px', 'Header navigation links appear']].map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, b)))))),
            h('div', { class: 'card card-pad stack-sm' }, h('h3', null, 'Roles and access'), h('table', { class: 'table' }, h('thead', null, h('tr', null, ['Area', 'Buyer', 'Owner', 'Manager', 'Fulfillment', 'Support', 'Admin'].map((t) => h('th', null, t)))), h('tbody', null, [['Shop & account', '✓', '✓', '✓', '✓', '✓', '✓'], ['Products & marketing', '', '✓', '✓', '', '', 'monitor'], ['Orders & inventory', '', '✓', '✓', '✓', '', ''], ['Reviews & messages', '', '✓', '✓', '', '✓', ''], ['Finance, team, settings', '', '✓', '', '', '', ''], ['Approvals, commission, CMS', '', '', '', '', '', '✓']].map((r) => h('tr', null, r.map((c) => h('td', { class: 'ta-c' }, c))))))),
            h('div', { class: 'card card-pad stack-sm' }, h('h3', null, 'Code map'), h('ul', { class: 'text-2 small', style: 'margin:0;padding-left:18px' }, [
              ['css/ds.css', 'tokens, components, layouts'], ['js/core.js', 'DOM helper h(), API client, icons, router, modals, tables, charts'], ['js/shop*.js', 'storefront (home, catalog, product, cart, checkout, account)'], ['vendor/*.js', 'seller portal'], ['admin/*.js', 'admin panel'], ['lib/routes/*.js', 'REST API by audience'], ['lib/domain.js, lib/cart.js', 'pricing, coupons, orders, commission'],
            ].map(([a, b]) => h('li', null, h('span', { class: 'code' }, a), ' ' + b)))),
            h('div', { class: 'card card-pad stack-sm' }, h('h3', null, 'API conventions'), h('ul', { class: 'text-2 small', style: 'margin:0;padding-left:18px' }, ['JSON in/out under /api/*; errors are { "error": "message" } with a meaningful status.', 'Sessions use an HttpOnly, SameSite=Lax cookie; mutating routes require a JSON content type.', 'Lists accept page, limit and filter params and return { items, total, page, pages }.', 'Money is stored as integers in the currency set under System settings.', 'Images are uploaded as data URLs to /api/upload and referenced by path.'].map((t) => h('li', null, t)))))),
        h('footer', { class: 'footer', style: 'margin-top:48px' }, h('p', { class: 'small muted mb-0' }, 'Figma frames and clickable prototypes are not part of this repository; this page and the running apps are the source of truth for the design.'))));
  }
  document.getElementById('app').replaceChildren(build());
})();
