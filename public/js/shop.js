'use strict';
// Buyer storefront: shell (header, drawers, search, footer) and shared pieces.

(function () {
  const { h, api, icon, fmt } = PM;
  const Shop = (window.Shop = { me: null, counts: { cart: 0, wishlist: 0, unread: 0 }, wish: new Set(), site: {}, categories: [] });

  // ---------- session ----------

  Shop.refresh = async function () {
    try {
      const data = await api('/auth/me');
      Shop.me = data.user;
      Shop.counts = data.counts;
      if (data.site) { Shop.site = data.site; PM.currency = data.site.currency || PM.currency; }
      if (Shop.me) Shop.wish = new Set((await api('/wishlist')).ids);
      else Shop.wish = new Set();
    } catch { /* offline: render as guest */ }
    Shop.paintBadges();
  };

  Shop.paintBadges = function () {
    const set = (id, n) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = n > 99 ? '99+' : String(n);
      el.hidden = !n;
    };
    set('badge-cart', Shop.counts.cart);
    set('badge-wish', Shop.wish.size);
    set('badge-notif', Shop.counts.unread);
  };

  Shop.requireLogin = function (ctx) {
    if (Shop.me) return true;
    Shop.router.go('/login?next=' + encodeURIComponent(ctx.path + (ctx.query.toString() ? '?' + ctx.query : '')));
    return false;
  };

  Shop.afterLogin = function (user, next) {
    if (user.role === 'admin') { location.href = '/admin/'; return; }
    if (user.role === 'vendor') { location.href = '/vendor/'; return; }
    Shop.router.go(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
  };

  Shop.logout = async function () {
    await api('/auth/logout', { method: 'POST' });
    Shop.me = null; Shop.wish = new Set(); Shop.counts = { cart: 0, wishlist: 0, unread: 0 };
    Shop.paintBadges();
    Shop.rebuildHeader();
    PM.toast('You are logged out');
    Shop.router.go('/');
  };

  // ---------- cart & wishlist actions ----------

  Shop.addToCart = async function (product, { quantity = 1, color = '', size = '', openDrawer = false } = {}) {
    if ((product.colors || []).length && !color && !openDrawer) {
      PM.toast('Choose your options first', 'success');
      Shop.router.go('/product/' + product.id);
      return null;
    }
    try {
      const cart = await api('/cart/items', { method: 'POST', body: { productId: product.id, quantity, color, size } });
      Shop.counts.cart = cart.count;
      Shop.paintBadges();
      if (openDrawer) Shop.openCart(); else PM.toast(`${product.name} added to cart`);
      return cart;
    } catch (e) { PM.toast(e.message, 'error'); return null; }
  };

  Shop.toggleWish = async function (productId, btn) {
    if (!Shop.me) { PM.toast('Log in to save items to your wishlist', 'error'); Shop.router.go('/login?next=' + encodeURIComponent(Shop.router.parse().path)); return; }
    try {
      const r = await api('/wishlist/' + productId, { method: 'POST' });
      if (r.saved) Shop.wish.add(productId); else Shop.wish.delete(productId);
      if (btn) btn.setAttribute('aria-pressed', String(r.saved));
      Shop.paintBadges();
      PM.toast(r.saved ? 'Saved to your wishlist' : 'Removed from wishlist');
    } catch (e) { PM.toast(e.message, 'error'); }
  };

  // ---------- product card ----------

  Shop.productCard = function (p, { view = 'grid' } = {}) {
    const href = '#/product/' + p.id;
    const out = p.stock < 1;
    const wish = h('button', { class: 'pcard-wish glass', type: 'button', 'aria-pressed': String(Shop.wish.has(p.id)), 'aria-label': `Save ${p.name} to wishlist`, onclick: (e) => { e.preventDefault(); Shop.toggleWish(p.id, e.currentTarget); } }, icon('heart'));
    const tags = h('div', { class: 'pcard-tags' },
      p.discountPct ? h('span', { class: 'discount-tag' }, `-${p.discountPct}%`) : null,
      p.flashEndsAt ? PM.badge('Flash deal', 'accent') : null,
      out ? PM.badge('Sold out', 'danger') : p.stock <= 5 ? PM.badge(`Only ${p.stock} left`, 'warning') : null);
    const price = h('div', { class: 'pcard-price price' }, fmt.price(p.price), p.originalPrice ? h('span', { class: 'price-old' }, fmt.price(p.originalPrice)) : null);
    const body = h('div', { class: 'pcard-body' },
      h('a', { class: 'pcard-title', href }, p.name),
      p.vendor ? h('a', { class: 'pcard-vendor', href: '#/store/' + p.vendor.slug, style: 'text-decoration:none;color:inherit' }, 'by ' + p.vendor.name) : null,
      p.reviewCount ? PM.stars(p.rating, p.reviewCount) : h('span', { class: 'xs muted' }, 'No reviews yet'),
      price);
    const actions = h('div', { class: 'pcard-actions' },
      h('a', { class: 'btn btn-sm', href }, 'See more'),
      h('button', { class: 'btn btn-sm btn-primary', type: 'button', disabled: out, onclick: () => Shop.addToCart(p) }, icon('cart'), out ? 'Sold out' : 'Add'));
    const media = h('a', { class: 'pcard-media', href, 'aria-label': p.name, tabindex: -1 }, PM.img(p.image, p.name), tags);
    if (view === 'list') {
      return h('article', { class: 'pcard plist' }, h('div', { style: 'position:relative' }, media, wish), h('div', { style: 'display:flex;flex-direction:column' }, body, h('p', { class: 'small muted', style: 'padding:0 12px;margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden' }, p.description)), actions);
    }
    return h('article', { class: 'pcard' }, media, wish, body, actions);
  };

  Shop.productGrid = (products, opts) => h('div', { class: 'grid grid-products' }, products.map((p) => Shop.productCard(p, opts)));

  // ---------- cart drawer ----------

  Shop.openCart = async function () {
    const body = h('div', null, h('div', { class: 'spinner' }));
    const footer = h('div', { style: 'width:100%;display:grid;gap:8px' });
    const layer = PM.drawer({ title: 'Your cart', content: body, footer });
    const paint = (cart) => {
      Shop.counts.cart = cart.count; Shop.paintBadges();
      if (!cart.items.length) {
        body.replaceChildren(PM.empty({ icon: 'cart', title: 'Your cart is empty', text: 'Add something you love and it will show up here.', action: h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { layer.close(); Shop.router.go('/shop'); } }, 'Start shopping') }));
        footer.replaceChildren();
        return;
      }
      body.replaceChildren(...cart.items.map((l) => h('div', { class: 'cart-line', style: 'grid-template-columns:64px 1fr' },
        PM.img(l.image, l.name),
        h('div', { class: 'stack-sm' },
          h('a', { href: '#/product/' + l.productId, onclick: () => layer.close(), style: 'font-weight:600;text-decoration:none;color:inherit' }, l.name),
          h('div', { class: 'xs muted' }, [l.color, l.size].filter(Boolean).join(' / ') || l.vendorName),
          h('div', { class: 'row between' }, Shop.qtyControl(l, async (q) => paint(await api('/cart/items/' + l.id, { method: 'PATCH', body: { quantity: q } }))), h('span', { class: 'price' }, fmt.price(l.lineTotal))),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: 'justify-self:start;padding:0;color:var(--danger)', onclick: async () => paint(await api('/cart/items/' + l.id, { method: 'DELETE' })) }, 'Remove')))));
      footer.replaceChildren(
        h('div', { class: 'sum-row total', style: 'border:0;margin:0;padding:0' }, h('span', null, 'Subtotal'), h('span', null, fmt.price(cart.subtotal))),
        h('a', { class: 'btn btn-primary btn-block btn-lg', href: '#/checkout', onclick: () => layer.close() }, 'Checkout'),
        h('a', { class: 'btn btn-block', href: '#/cart', onclick: () => layer.close() }, 'View full cart'));
    };
    try { paint(await api('/cart')); } catch (e) { body.replaceChildren(PM.errorState(e)); }
  };

  Shop.qtyControl = function (line, onChange) {
    const out = h('output', null, String(line.quantity));
    const wrap = h('div', { class: 'qty' },
      h('button', { type: 'button', 'aria-label': `Decrease quantity of ${line.name}`, disabled: line.quantity <= 1, onclick: () => safe(line.quantity - 1) }, '−'),
      out,
      h('button', { type: 'button', 'aria-label': `Increase quantity of ${line.name}`, disabled: line.quantity >= line.stock, onclick: () => safe(line.quantity + 1) }, '+'));
    const safe = async (q) => { try { await onChange(q); } catch (e) { PM.toast(e.message, 'error'); } };
    return wrap;
  };

  // ---------- search modal ----------

  Shop.openSearch = function () {
    const input = PM.input({ type: 'search', placeholder: 'Search products, categories and stores', 'aria-label': 'Search', autocomplete: 'off', autofocus: true, style: 'min-height:52px;font-size:1.05rem;padding-left:42px' });
    const results = h('div', { class: 'mt-2' });
    let layer = { close: () => {} };
    const go = (q) => {
      q = q.trim();
      if (!q) return;
      const recent = [q, ...PM.store.get('pm-recent', []).filter((x) => x !== q)].slice(0, 6);
      PM.store.set('pm-recent', recent);
      layer.close();
      Shop.router.go('/search?q=' + encodeURIComponent(q));
    };
    const idle = () => {
      const recent = PM.store.get('pm-recent', []);
      results.replaceChildren(
        recent.length ? h('div', null, h('div', { class: 'row between' }, h('strong', { class: 'small' }, 'Recent searches'), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { PM.store.set('pm-recent', []); idle(); } }, 'Clear')),
          h('div', { class: 'row mt-1' }, recent.map((r) => h('button', { class: 'chip', type: 'button', onclick: () => go(r) }, icon('clock'), r)))) : null,
        h('div', { class: 'mt-2' }, h('strong', { class: 'small' }, 'Browse categories'),
          h('div', { class: 'row mt-1' }, Shop.categories.map((c) => h('a', { class: 'chip', href: '#/shop?category=' + c.slug, onclick: () => layer.close() }, c.name)))));
    };
    const suggest = PM.debounce(async () => {
      const q = input.value.trim();
      if (!q) return idle();
      try {
        const s = await api('/suggest?q=' + encodeURIComponent(q));
        results.replaceChildren(
          s.products.length ? h('div', { class: 'stack-sm' }, h('strong', { class: 'small' }, 'Products'), s.products.map((p) => h('a', { class: 'menu-item', href: '#/product/' + p.id, onclick: () => layer.close() }, PM.img(p.image, '', { style: 'width:40px;height:40px;border-radius:8px;object-fit:cover' }), h('span', { class: 'grow' }, p.name, h('div', { class: 'xs muted' }, p.category)), h('span', { class: 'price small' }, fmt.price(p.price))))) : null,
          s.categories.length ? h('div', { class: 'mt-1' }, h('strong', { class: 'small' }, 'Categories'), h('div', { class: 'row mt-1' }, s.categories.map((c) => h('a', { class: 'chip', href: '#/shop?category=' + c.slug, onclick: () => layer.close() }, c.name)))) : null,
          s.stores.length ? h('div', { class: 'mt-1' }, h('strong', { class: 'small' }, 'Stores'), h('div', { class: 'row mt-1' }, s.stores.map((c) => h('a', { class: 'chip', href: '#/store/' + c.slug, onclick: () => layer.close() }, icon('store'), c.name)))) : null,
          !s.products.length && !s.categories.length && !s.stores.length ? h('p', { class: 'muted' }, `No suggestions for "${q}". Press Enter to search anyway.`) : h('button', { class: 'btn btn-block mt-1', type: 'button', onclick: () => go(q) }, `See all results for "${q}"`));
      } catch { /* ignore suggestion errors */ }
    }, 200);
    input.addEventListener('input', suggest);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(input.value); });
    // spotlight-style panel without a title bar
    const spot = h('div', { class: 'modal lg', role: 'dialog' }, h('div', { class: 'modal-body' }, h('div', { class: 'input-icon' }, icon('search'), input), results));
    const back = h('div', { class: 'backdrop top' }, spot);
    document.body.append(back);
    document.body.style.overflow = 'hidden';
    const close = () => { back.remove(); document.removeEventListener('keydown', esc, true); if (!document.querySelector('.backdrop')) document.body.style.overflow = ''; };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    layer = { close };
    spot.setAttribute('aria-modal', 'true'); spot.setAttribute('aria-label', 'Search');
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', esc, true);
    idle();
    setTimeout(() => input.focus(), 30);
  };

  // ---------- notifications drawer ----------

  Shop.openNotifications = async function () {
    if (!Shop.me) { Shop.router.go('/login'); return; }
    const body = h('div', null, h('div', { class: 'spinner' }));
    const mark = h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { await api('/notifications/read', { method: 'POST', body: { all: true } }); Shop.counts.unread = 0; Shop.paintBadges(); load(); } }, 'Mark all as read');
    const layer = PM.drawer({ title: 'Notifications', content: body, footer: [mark, h('a', { class: 'btn btn-primary', href: '#/account/notifications', onclick: () => layer.close() }, 'See all')] });
    async function load() {
      try {
        const r = await api('/notifications?limit=12');
        Shop.counts.unread = r.unread; Shop.paintBadges();
        body.replaceChildren(r.notifications.length ? h('div', { class: 'stack-sm' }, r.notifications.map((n) => Shop.notificationRow(n, () => layer.close()))) : PM.empty({ icon: 'bell', title: 'You are all caught up', text: 'Order updates, offers and messages will appear here.' }));
      } catch (e) { body.replaceChildren(PM.errorState(e, load)); }
    }
    load();
  };

  const NOTE_ICON = { order: 'package', promo: 'gift', message: 'message', system: 'info' };
  Shop.notificationRow = (n, onClick) => h('a', { class: 'menu-item', href: n.link || '#/account/notifications', style: `align-items:flex-start;${n.read ? '' : 'background:var(--brand-soft)'}`, onclick: async () => { if (!n.read) api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(() => {}); if (onClick) onClick(); } },
    h('span', { class: 'kpi-ico', style: 'flex:none' }, icon(NOTE_ICON[n.type] || 'bell')),
    h('span', { class: 'grow' }, h('strong', { class: 'small' }, n.title), n.body ? h('div', { class: 'small text-2' }, n.body) : null, h('div', { class: 'xs muted' }, fmt.ago(n.createdAt))));

  // ---------- header ----------

  Shop.rebuildHeader = function () {
    const slot = document.getElementById('header-slot');
    if (slot) slot.replaceWith(Shop.buildHeader());
  };

  Shop.buildHeader = function () {
    const me = Shop.me;
    const badge = (id) => h('span', { class: 'badge-dot', id, hidden: true });
    let megaOpen = null;
    const closeMega = () => { if (megaOpen) { megaOpen.remove(); megaOpen = null; } };
    const catBtn = h('button', { class: 'btn btn-ghost', type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'true', onclick: (e) => {
      if (megaOpen) { closeMega(); e.currentTarget.setAttribute('aria-expanded', 'false'); return; }
      e.currentTarget.setAttribute('aria-expanded', 'true');
      megaOpen = h('div', { class: 'mega' }, h('div', { class: 'container' }, h('div', { class: 'mega-grid' },
        ...Shop.categories.map((c) => h('a', { class: 'mega-item', href: '#/shop?category=' + c.slug, onclick: closeMega },
          h('span', { class: 'mega-ico' }, icon(c.icon || 'tag')), h('span', null, h('strong', null, c.name), h('div', { class: 'xs muted' }, `${c.count} products`)))),
        h('a', { class: 'mega-promo', href: '#/shop?deals=1', style: 'text-decoration:none;color:#fff', onclick: closeMega }, h('strong', { style: 'font-size:1.2rem' }, 'Today\'s deals'), h('span', null, 'Save up to 30% on top-rated products →')))));
      header.append(megaOpen);
      document.addEventListener('mousedown', function outside(ev) { if (megaOpen && !megaOpen.contains(ev.target) && !catBtn.contains(ev.target)) { closeMega(); catBtn.setAttribute('aria-expanded', 'false'); } if (!megaOpen) document.removeEventListener('mousedown', outside); });
    } }, icon('grid'), 'Categories', icon('chevron-down'));
    window.addEventListener('hashchange', () => { closeMega(); catBtn.setAttribute('aria-expanded', 'false'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && megaOpen) { closeMega(); catBtn.setAttribute('aria-expanded', 'false'); catBtn.focus(); } });

    const profile = me
      ? h('button', { class: 'btn btn-ghost', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Account menu', onclick: (e) => {
          const items = [
            h('div', { style: 'padding:8px 12px' }, h('strong', null, me.name), h('div', { class: 'xs muted' }, me.email)),
            h('hr', { style: 'margin:4px 0' }),
            h('a', { class: 'menu-item', href: '#/account' }, icon('home'), 'My dashboard'),
            h('a', { class: 'menu-item', href: '#/account/orders' }, icon('package'), 'Orders'),
            h('a', { class: 'menu-item', href: '#/account/wishlist' }, icon('heart'), 'Wishlist'),
            h('a', { class: 'menu-item', href: '#/account/loyalty' }, icon('award'), `Rewards (${me.points} pts)`),
            h('a', { class: 'menu-item', href: '#/account/profile' }, icon('settings'), 'Profile & security'),
            me.role === 'vendor' ? h('a', { class: 'menu-item', href: '/vendor/' }, icon('store'), 'Seller portal') : null,
            me.role === 'admin' ? h('a', { class: 'menu-item', href: '/admin/' }, icon('shield'), 'Admin panel') : null,
            h('hr', { style: 'margin:4px 0' }),
            h('button', { class: 'menu-item', type: 'button', onclick: Shop.logout }, icon('logout'), 'Log out'),
          ];
          PM.popover(e.currentTarget, items);
        } }, h('span', { class: 'avatar', style: 'width:30px;height:30px' }, me.avatar ? PM.img(me.avatar, '') : fmt.initials(me.name)))
      : h('a', { class: 'btn btn-ghost', href: '#/login', 'aria-label': 'Log in' }, icon('user'), h('span', { class: 'hide-xs' }, 'Log in'));

    const header = h('header', { class: 'header glass', id: 'header-slot' },
      h('div', { class: 'announce' }, `Free standard delivery on orders over ${fmt.price(Shop.site.freeShippingThreshold || 100000)}  ·  Verified sellers  ·  14-day returns`),
      h('div', { class: 'container' }, h('div', { class: 'header-inner' },
        h('button', { class: 'btn btn-ghost btn-icon only-mobile', type: 'button', 'aria-label': 'Open menu', onclick: Shop.openMenu }, icon('menu')),
        h('a', { class: 'logo', href: '#/' }, h('span', { class: 'logo-mark' }, 'P'), 'PrinceMall'),
        h('div', { class: 'nav-links' }, catBtn, h('a', { class: 'btn btn-ghost', href: '#/shop?deals=1' }, icon('percent'), 'Deals'), h('a', { class: 'btn btn-ghost', href: '/vendor/#/register' }, icon('store'), 'Sell with us')),
        h('div', { class: 'searchbar' }, h('button', { class: 'btn', type: 'button', onclick: Shop.openSearch, 'aria-label': 'Search products' }, icon('search'), 'Search products, categories, stores…')),
        h('div', { class: 'header-actions' },
          h('button', { class: 'btn btn-ghost btn-icon only-mobile', type: 'button', 'aria-label': 'Search', onclick: Shop.openSearch }, icon('search')),
          PM.theme.toggleButton(),
          me ? h('a', { class: 'btn btn-ghost hide-xs', href: '#/account/orders', title: 'See your orders and track deliveries' }, icon('package'), h('span', { class: 'nav-orders-label' }, 'My orders')) : null,
          h('a', { class: 'btn btn-ghost btn-icon hide-xs', href: '#/account/wishlist', 'aria-label': 'Wishlist' }, icon('heart'), badge('badge-wish')),
          h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Notifications', onclick: Shop.openNotifications }, icon('bell'), badge('badge-notif')),
          h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Open cart', onclick: Shop.openCart }, icon('cart'), badge('badge-cart')),
          profile))));
    setTimeout(Shop.paintBadges, 0);
    return header;
  };

  Shop.openMenu = function () {
    let layer;
    const close = () => layer.close();
    layer = PM.drawer({ title: 'Menu', side: 'left', content: h('nav', { class: 'stack-sm', 'aria-label': 'Main' },
      h('a', { class: 'menu-item', href: '#/', onclick: close }, icon('home'), 'Home'),
      h('a', { class: 'menu-item', href: '#/shop', onclick: close }, icon('grid'), 'All products'),
      h('a', { class: 'menu-item', href: '#/shop?deals=1', onclick: close }, icon('percent'), 'Deals'),
      Shop.me ? h('a', { class: 'menu-item', href: '#/account/orders', onclick: close }, icon('package'), 'My orders') : null,
      h('a', { class: 'menu-item', href: '#/account/wishlist', onclick: close }, icon('heart'), 'Wishlist'),
      h('div', { class: 'nav-group' }, 'Categories'),
      Shop.categories.map((c) => h('a', { class: 'menu-item', href: '#/shop?category=' + c.slug, onclick: close }, icon(c.icon || 'tag'), c.name)),
      h('div', { class: 'nav-group' }, 'More'),
      h('a', { class: 'menu-item', href: '#/support', onclick: close }, icon('help'), 'Help & support'),
      h('a', { class: 'menu-item', href: '/vendor/#/register', onclick: close }, icon('store'), 'Sell with us')) });
  };

  // ---------- footer ----------

  Shop.buildFooter = function () {
    const col = (title, links) => h('div', null, h('h4', null, title), h('ul', null, links.map(([label, href]) => h('li', null, h('a', { href }, label)))));
    return h('footer', { class: 'footer' }, h('div', { class: 'container' },
      h('div', { class: 'footer-grid' },
        h('div', null, h('a', { class: 'logo', href: '#/' }, h('span', { class: 'logo-mark' }, 'P'), 'PrinceMall'), h('p', { class: 'small muted mt-1' }, 'A marketplace where independent, verified stores sell to buyers across the country.')),
        col('Shop', [['All products', '#/shop'], ['Deals', '#/shop?deals=1'], ...Shop.categories.slice(0, 4).map((c) => [c.name, '#/shop?category=' + c.slug])]),
        col('Help', [['Help center', '#/support'], ['Shipping & delivery', '#/page/shipping'], ['Returns & refunds', '#/page/returns'], ['Track an order', '#/account/orders']]),
        col('Company', [['About us', '#/page/about'], ['Sell on PrinceMall', '/vendor/#/register'], ['Privacy policy', '#/page/privacy'], ['Terms of service', '#/page/terms']])),
      h('hr'),
      h('div', { class: 'row between small muted' }, h('span', null, `© ${new Date().getFullYear()} PrinceMall. Demo marketplace - no real payments are processed.`), h('span', null, 'Accepted: Mobile Money · Card · PayPal · Stripe · Bank transfer'))));
  };

  Shop.trustStrip = () => h('div', { class: 'trust' }, [
    ['truck', 'Fast delivery', 'Standard, express or pick-up'],
    ['shield', 'Verified sellers', 'Every store is reviewed first'],
    ['undo', '14-day returns', 'Easy refunds on delivered items'],
    ['lock', 'Secure checkout', 'Your password is never stored in plain text'],
  ].map(([i, t, s]) => h('div', { class: 'trust-item' }, h('span', { class: 'kpi-ico' }, icon(i)), h('div', null, h('strong', null, t), h('div', { class: 'small muted' }, s)))));

  Shop.sectionHead = (title, link, linkLabel = 'View all') => h('div', { class: 'section-head' }, h('h2', null, title), link ? h('a', { class: 'btn btn-ghost btn-sm', href: link }, linkLabel, icon('chevron-right')) : null);

  // ---------- boot ----------

  Shop.boot = async function () {
    await Shop.refresh();
    try { Shop.categories = (await api('/categories')).categories.filter((c) => c.count > 0); } catch { Shop.categories = []; }
    const main = h('main', { id: 'main', class: 'container', style: 'padding-top:24px;min-height:60vh', tabindex: -1 });
    document.getElementById('app').replaceChildren(Shop.buildHeader(), main, Shop.buildFooter());
    Shop.router = PM.createRouter({
      outlet: main, titleSuffix: ' - PrinceMall',
      onError: (err, ctx, router) => {
        if (err.status === 401) { Shop.me = null; router.go('/login?next=' + encodeURIComponent(ctx.path)); return null; }
        return null;
      },
    });
    Shop.registerRoutes.forEach((fn) => fn(Shop.router));
    Shop.router.start();
  };
  Shop.registerRoutes = [];
})();
