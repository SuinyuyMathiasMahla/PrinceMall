'use strict';
// Storefront pages: home, catalog/search, product details, store, CMS pages, support.

(function () {
  const { h, api, icon, fmt } = PM;
  const S = window.Shop;

  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  S.registerRoutes.push((r) => {
    // =========================================================== HOME
    r.add('/', async (ctx) => {
      ctx.title('');
      const d = await api('/home');
      const slides = (d.banners.filter((b) => b.placement === 'hero').length ? d.banners.filter((b) => b.placement === 'hero') : [{ title: 'Everything you need, from stores you can trust', subtitle: 'Appliances, watches, audio and more with fast delivery.', link: '#/shop' }]);
      const variants = ['', 'alt', 'alt2'];
      let current = 0;
      const hero = h('section', { class: 'hero', 'aria-roledescription': 'carousel', 'aria-label': 'Featured offers' });
      const dots = h('div', { class: 'hero-dots' });
      const paint = () => {
        const s = slides[current];
        hero.className = 'hero ' + variants[current % variants.length];
        const pic = d.featured[current % Math.max(d.featured.length, 1)];
        const link = (s.link || '#/shop').startsWith('/') ? s.link : s.link || '#/shop';
        hero.replaceChildren(
          h('div', { class: 'eyebrow', style: 'color:#fff;opacity:.85' }, `Offer ${current + 1} of ${slides.length}`),
          h('h1', null, s.title), h('p', null, s.subtitle || ''),
          h('div', { class: 'row mt-1' }, h('a', { class: 'btn btn-lg btn-accent', href: link }, 'Shop now', icon('chevron-right')), h('a', { class: 'btn btn-lg', style: 'background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.4)', href: '#/shop' }, 'Browse all')),
          pic ? PM.img(pic.image, '', { class: 'hero-pic', loading: 'eager' }) : null,
          slides.length > 1 ? dots : null);
        dots.replaceChildren(...slides.map((_, i) => h('button', { type: 'button', 'aria-label': `Show offer ${i + 1}`, 'aria-current': String(i === current), onclick: () => { current = i; paint(); } })));
      };
      paint();
      if (slides.length > 1 && !reducedMotion()) {
        const timer = setInterval(() => { if (!hero.isConnected) return clearInterval(timer); if (!hero.matches(':hover, :focus-within')) { current = (current + 1) % slides.length; paint(); } }, 6500);
      }

      const flash = d.deals.filter((p) => p.flashEndsAt).sort((a, b) => a.flashEndsAt.localeCompare(b.flashEndsAt))[0];
      const promo = d.banners.find((b) => b.placement === 'promo');
      return h('div', null,
        hero,
        h('div', { class: 'section', style: 'margin-top:24px' }, S.trustStrip()),
        h('section', { class: 'section', 'aria-labelledby': 'cats-h' },
          h('div', { class: 'section-head' }, h('h2', { id: 'cats-h' }, 'Shop by category'), h('a', { class: 'btn btn-ghost btn-sm', href: '#/shop' }, 'All products', icon('chevron-right'))),
          h('div', { class: 'grid cols-4', style: 'grid-template-columns:repeat(auto-fit,minmax(130px,1fr))' }, d.categories.filter((c) => c.count).map((c) =>
            h('a', { class: 'card card-hover cat-tile', href: '#/shop?category=' + c.slug }, h('span', { class: 'kpi-ico' }, icon(c.icon || 'tag')), h('strong', null, c.name), h('span', { class: 'xs muted' }, `${c.count} products`))))),
        d.deals.length ? h('section', { class: 'section deal-strip', 'aria-labelledby': 'deals-h' },
          h('div', { class: 'section-head' }, h('div', { class: 'row' }, h('h2', { id: 'deals-h' }, 'Deals of the day'), flash ? h('span', { class: 'row', style: 'gap:8px' }, h('span', { class: 'small muted' }, 'Flash sale ends in'), PM.countdown(flash.flashEndsAt)) : null),
            h('a', { class: 'btn btn-ghost btn-sm', href: '#/shop?deals=1' }, 'More deals', icon('chevron-right'))),
          S.productGrid(d.deals.slice(0, 4))) : null,
        h('section', { class: 'section' }, S.sectionHead('Featured products', '#/shop?sort=rating'), S.productGrid(d.featured.slice(0, 8))),
        h('section', { class: 'section' }, S.sectionHead('Best sellers', '#/shop?sort=bestselling'), S.productGrid(d.bestSellers.slice(0, 4))),
        promo ? h('a', { class: 'hero alt2 section', href: promo.link || '#/shop', style: 'min-height:180px;text-decoration:none;color:#fff;margin-top:48px' }, h('h1', { style: 'max-width:none;font-size:1.8rem' }, promo.title), h('p', { style: 'margin:0' }, promo.subtitle)) : null,
        h('section', { class: 'section' }, S.sectionHead('Trending now', '#/shop?sort=bestselling'), S.productGrid(d.trending.slice(0, 4))),
        d.testimonials.length ? h('section', { class: 'section', 'aria-labelledby': 'rev-h' }, h('div', { class: 'section-head' }, h('h2', { id: 'rev-h' }, 'Loved by buyers')),
          h('div', { class: 'grid cols-3' }, d.testimonials.map((t) => h('figure', { class: 'card quote', style: 'margin:0' }, PM.stars(t.rating), h('blockquote', { style: 'margin:0' }, `“${t.body}”`),
            h('figcaption', { class: 'row' }, h('span', { class: 'avatar' }, fmt.initials(t.name)), h('div', null, h('strong', { class: 'small' }, t.name), h('div', { class: 'xs muted' }, 'on ' + (t.product || 'a product')))))))) : null,
        h('section', { class: 'section' }, h('div', { class: 'grid cols-3' },
          [['store', fmt.num(d.stats.vendors), 'verified stores'], ['package', fmt.num(d.stats.products), 'products live'], ['users', fmt.num(d.stats.buyers), 'happy buyers']].map(([i, n, l]) =>
            h('div', { class: 'card card-pad-sm row', style: 'gap:16px' }, h('span', { class: 'kpi-ico', style: 'width:48px;height:48px' }, icon(i)), h('div', null, h('div', { class: 'kpi-value' }, n), h('div', { class: 'muted small' }, l)))))),
        S.newsletterBlock());
    });

    // =========================================================== CATALOG / SEARCH
    const catalog = async (ctx) => {
      const isSearch = ctx.path === '/search';
      const get = (k) => ctx.query.get(k) || '';
      const state = {
        q: get('q'), category: get('category'), minPrice: get('minPrice'), maxPrice: get('maxPrice'), rating: get('rating'),
        inStock: get('inStock') === '1', deals: get('deals') === '1', vendor: get('vendor'), sort: get('sort') || (get('q') ? 'relevance' : 'bestselling'),
        page: Number(get('page')) || 1, view: PM.store.get('pm-view', 'grid'),
      };
      const results = h('div', { 'aria-live': 'polite' });
      const filters = h('details', { class: 'card card-pad-sm filters', open: window.matchMedia('(min-width: 900px)').matches });
      const head = h('div', { class: 'stack-sm' });
      let reqId = 0;

      const sync = () => {
        const { view, ...rest } = state;
        history.replaceState(null, '', '#' + ctx.path + PM.qs({ ...rest, page: state.page > 1 ? state.page : '', sort: state.sort === (state.q ? 'relevance' : 'bestselling') ? '' : state.sort }));
      };
      const apply = (patch) => { Object.assign(state, { page: 1 }, patch); load(); };

      const sortSel = PM.select([{ value: 'relevance', label: 'Best match' }, { value: 'bestselling', label: 'Best selling' }, { value: 'rating', label: 'Top rated' }, { value: 'newest', label: 'Newest' }, { value: 'price_asc', label: 'Price: low to high' }, { value: 'price_desc', label: 'Price: high to low' }, { value: 'discount', label: 'Biggest discount' }], state.sort, { 'aria-label': 'Sort products', style: 'width:auto;min-width:170px', onchange: (e) => apply({ sort: e.target.value }) });

      function renderFilters(facets) {
        const min = PM.input({ type: 'number', min: 0, placeholder: 'Min', value: state.minPrice, 'aria-label': 'Minimum price' });
        const max = PM.input({ type: 'number', min: 0, placeholder: 'Max', value: state.maxPrice, 'aria-label': 'Maximum price' });
        filters.replaceChildren(h('summary', { class: 'row between', style: 'cursor:pointer;font-weight:700;list-style:none' }, h('span', null, icon('filter'), ' Filters'), h('span', { class: 'xs muted' }, 'tap to toggle')),
          h('div', { class: 'filter-group' }, h('h4', null, 'Category'), h('div', { class: 'filter-list' },
            h('label', { class: 'check' }, h('input', { type: 'radio', name: 'cat', checked: !state.category, onchange: () => apply({ category: '' }) }), 'All categories'),
            facets.categories.map((c) => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'cat', checked: state.category === c.slug, onchange: () => apply({ category: c.slug }) }), `${c.name} (${c.count})`)))),
          h('div', { class: 'filter-group' }, h('h4', null, `Price (${PM.currency})`),
            h('form', { class: 'input-group', onsubmit: (e) => { e.preventDefault(); apply({ minPrice: min.value, maxPrice: max.value }); } }, min, max, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Go')),
            facets.priceMax ? h('div', { class: 'hint mt-1' }, `Range here: ${fmt.num(facets.priceMin)} – ${fmt.num(facets.priceMax)}`) : null),
          h('div', { class: 'filter-group' }, h('h4', null, 'Rating'), h('div', { class: 'filter-list' }, [['', 'Any rating'], ['4', '4 stars & up'], ['3', '3 stars & up']].map(([v, l]) =>
            h('label', { class: 'check' }, h('input', { type: 'radio', name: 'rating', checked: state.rating === v, onchange: () => apply({ rating: v }) }), l)))),
          h('div', { class: 'filter-group' }, h('h4', null, 'More'), h('div', { class: 'filter-list' },
            PM.check('In stock only', { checked: state.inStock, onchange: (e) => apply({ inStock: e.target.checked }) }),
            PM.check('On sale / deals', { checked: state.deals, onchange: (e) => apply({ deals: e.target.checked }) }))),
          h('button', { class: 'btn btn-block', type: 'button', onclick: () => apply({ q: isSearch ? state.q : '', category: '', minPrice: '', maxPrice: '', rating: '', inStock: false, deals: false, vendor: '' }) }, 'Clear all filters'));
      }

      async function load() {
        const my = ++reqId;
        sync();
        results.setAttribute('aria-busy', 'true');
        results.replaceChildren(PM.skeleton('grid'));
        try {
          const d = await api('/products' + PM.qs({ q: state.q, category: state.category, minPrice: state.minPrice, maxPrice: state.maxPrice, rating: state.rating, inStock: state.inStock, deals: state.deals, vendor: state.vendor, sort: state.sort, page: state.page, limit: 12 }));
          if (my !== reqId) return;
          renderFilters(d.facets);
          sortSel.value = state.sort;
          const cat = d.facets.categories.find((c) => c.slug === state.category);
          const chips = [];
          if (state.q && !isSearch) chips.push(['Search: ' + state.q, { q: '' }]);
          if (cat) chips.push([cat.name, { category: '' }]);
          if (state.minPrice || state.maxPrice) chips.push([`${state.minPrice || 0} – ${state.maxPrice || '∞'}`, { minPrice: '', maxPrice: '' }]);
          if (state.rating) chips.push([`${state.rating}★ & up`, { rating: '' }]);
          if (state.inStock) chips.push(['In stock', { inStock: false }]);
          if (state.deals) chips.push(['Deals', { deals: false }]);
          if (state.vendor) chips.push(['Store: ' + state.vendor, { vendor: '' }]);
          const recent = PM.store.get('pm-recent', []);
          head.replaceChildren(
            PM.breadcrumbs([{ label: 'Home', href: '#/' }, { label: isSearch ? 'Search' : 'Shop', href: isSearch ? null : null }]),
            h('div', { class: 'page-title', style: 'margin-bottom:8px' }, h('div', null, h('h1', null, isSearch && state.q ? `Results for “${state.q}”` : cat ? cat.name : state.deals ? 'Deals' : 'All products'), h('p', null, `${fmt.num(d.total)} product${d.total === 1 ? '' : 's'}`)),
              h('div', { class: 'row' }, sortSel,
                h('div', { class: 'row-nowrap', role: 'group', 'aria-label': 'View' },
                  h('button', { class: 'btn btn-icon', type: 'button', 'aria-pressed': String(state.view === 'grid'), 'aria-label': 'Grid view', style: state.view === 'grid' ? 'border-color:var(--brand);color:var(--brand)' : '', onclick: () => { state.view = 'grid'; PM.store.set('pm-view', 'grid'); load(); } }, icon('grid')),
                  h('button', { class: 'btn btn-icon', type: 'button', 'aria-pressed': String(state.view === 'list'), 'aria-label': 'List view', style: state.view === 'list' ? 'border-color:var(--brand);color:var(--brand)' : '', onclick: () => { state.view = 'list'; PM.store.set('pm-view', 'list'); load(); } }, icon('list'))))),
            chips.length ? h('div', { class: 'row' }, chips.map(([label, patch]) => h('button', { class: 'chip active', type: 'button', onclick: () => apply(patch), 'aria-label': `Remove filter ${label}` }, label, icon('x')))) : null,
            isSearch && recent.length ? h('div', { class: 'row small' }, h('span', { class: 'muted' }, 'Recent searches:'), recent.slice(0, 5).map((q) => h('a', { class: 'chip', href: '#/search?q=' + encodeURIComponent(q) }, q))) : null);
          results.removeAttribute('aria-busy');
          if (!d.products.length) {
            results.replaceChildren(PM.empty({ icon: 'search', title: 'No products found', text: state.q ? `We couldn't find anything for “${state.q}”. Try a different word or remove some filters.` : 'Try removing some filters.', action: h('div', { class: 'row', style: 'justify-content:center' }, S.categories.slice(0, 4).map((c) => h('a', { class: 'chip', href: '#/shop?category=' + c.slug }, c.name))) }));
            return;
          }
          results.replaceChildren(state.view === 'list' ? h('div', { class: 'stack' }, d.products.map((p) => S.productCard(p, { view: 'list' }))) : S.productGrid(d.products),
            PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }));
        } catch (e) { if (my === reqId) results.replaceChildren(PM.errorState(e, load)); }
      }

      ctx.title(isSearch && state.q ? `Search: ${state.q}` : 'Shop');
      ctx.keepScroll = false;
      const root = h('div', null, head, h('div', { class: 'catalog' }, h('aside', { 'aria-label': 'Filters' }, filters), results));
      load();
      return root;
    };
    r.add('/shop', catalog);
    r.add('/search', catalog);
    r.add('/category/:slug', (ctx) => { r.go('/shop?category=' + ctx.params.slug); return null; });

    // =========================================================== PRODUCT
    r.add('/product/:id', async (ctx) => {
      const { product: p, related, ratingDistribution, seller } = await api('/products/' + encodeURIComponent(ctx.params.id));
      ctx.title(p.name);
      const out = p.stock < 1;
      const state = { color: p.colors.length === 1 ? p.colors[0].name : '', size: p.sizes.length === 1 ? p.sizes[0] : '', qty: 1, image: 0 };

      // gallery
      const media = h('div', { class: 'gallery-main' });
      const thumbs = h('div', { class: 'thumbs' });
      const items = [...p.images.map((u) => ({ type: 'img', u })), ...(p.video ? [{ type: 'video', u: p.video }] : [])];
      const showMedia = (i) => {
        state.image = i;
        const it = items[i];
        media.replaceChildren(it.type === 'img' ? PM.img(it.u, p.name, { loading: 'eager' }) : (/\.(mp4|webm)(\?|$)/i.test(it.u) ? h('video', { src: it.u, controls: true, preload: 'metadata' }) : h('div', { class: 'state' }, h('p', null, 'This product has a video.'), h('a', { class: 'btn btn-primary', href: it.u, target: '_blank', rel: 'noopener noreferrer' }, icon('play'), 'Watch video'))));
        thumbs.replaceChildren(...items.map((x, k) => h('button', { class: 'thumb', type: 'button', 'aria-pressed': String(k === i), 'aria-label': x.type === 'video' ? 'Show product video' : `Show image ${k + 1}`, onclick: () => showMedia(k) }, x.type === 'img' ? PM.img(x.u, '') : h('span', { class: 'state', style: 'padding:0;height:100%;justify-content:center' }, icon('play')))));
      };
      showMedia(0);

      // options
      const colorLabel = h('span', { class: 'muted small' }, state.color || 'Choose a color');
      const colorRow = p.colors.length ? h('div', { class: 'stack-sm' }, h('div', { class: 'label' }, 'Color: ', colorLabel),
        h('div', { class: 'row', role: 'group', 'aria-label': 'Color' }, p.colors.map((c) => h('button', { class: 'swatch', type: 'button', style: `background:${c.hex}`, title: c.name, 'aria-label': c.name, 'aria-pressed': String(state.color === c.name),
          onclick: (e) => { state.color = c.name; colorLabel.textContent = c.name; colorRow.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } })))) : null;
      const sizeRow = p.sizes.length ? h('div', { class: 'stack-sm' }, h('div', { class: 'label' }, 'Size'),
        h('div', { class: 'row', role: 'group', 'aria-label': 'Size' }, p.sizes.map((s) => h('button', { class: 'btn size-opt', type: 'button', 'aria-pressed': String(state.size === s), style: state.size === s ? 'border-color:var(--brand);color:var(--brand)' : '',
          onclick: (e) => { state.size = s; sizeRow.querySelectorAll('.size-opt').forEach((b) => { const on = b === e.currentTarget; b.setAttribute('aria-pressed', String(on)); b.style.cssText = on ? 'border-color:var(--brand);color:var(--brand)' : ''; }); } }, s)))) : null;
      const qtyOut = h('output', null, '1');
      const qty = h('div', { class: 'qty' },
        h('button', { type: 'button', 'aria-label': 'Decrease quantity', onclick: () => { state.qty = Math.max(1, state.qty - 1); qtyOut.textContent = state.qty; } }, '−'), qtyOut,
        h('button', { type: 'button', 'aria-label': 'Increase quantity', onclick: () => { state.qty = Math.min(p.stock, state.qty + 1); qtyOut.textContent = state.qty; } }, '+'));

      const choose = () => {
        if (p.colors.length && !state.color) { PM.toast('Please choose a color', 'error'); return false; }
        if (p.sizes.length && !state.size) { PM.toast('Please choose a size', 'error'); return false; }
        return true;
      };
      const add = async (buyNow, btn) => {
        if (!choose()) return;
        await PM.busy(btn, async () => {
          const cart = await S.addToCart(p, { quantity: state.qty, color: state.color, size: state.size, openDrawer: !buyNow });
          if (cart && buyNow) S.router.go('/checkout');
        });
      };
      const addBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', disabled: out, onclick: (e) => add(false, e.currentTarget) }, icon('cart'), out ? 'Sold out' : 'Add to cart');
      const buyBtn = h('button', { class: 'btn btn-accent btn-lg', type: 'button', disabled: out, onclick: (e) => add(true, e.currentTarget) }, 'Buy now');
      const wishBtn = h('button', { class: 'btn btn-lg btn-icon pcard-wish-inline', type: 'button', 'aria-pressed': String(S.wish.has(p.id)), 'aria-label': 'Save to wishlist', onclick: (e) => S.toggleWish(p.id, e.currentTarget), style: 'width:48px' }, icon('heart'));
      const shareBtn = h('button', { class: 'btn btn-lg btn-icon', type: 'button', 'aria-label': 'Share product', style: 'width:48px', onclick: async () => {
        const url = location.href;
        try { if (navigator.share) await navigator.share({ title: p.name, url }); else { await navigator.clipboard.writeText(url); PM.toast('Link copied to clipboard'); } } catch { /* cancelled */ }
      } }, icon('share'));

      const contactSeller = () => {
        if (!S.me) { S.router.go('/login?next=' + encodeURIComponent('/product/' + p.id)); return; }
        const msg = PM.textarea({ rows: 4, placeholder: `Hi, I have a question about ${p.name}…`, maxLength: 2000 });
        PM.modal({ title: 'Message ' + seller.name, content: PM.field('Your message', msg, { required: true }), actions: [{ label: 'Cancel' }, { label: 'Send message', kind: 'primary', onClick: async () => {
          if (!msg.value.trim()) { PM.toast('Write a message first', 'error'); return false; }
          await api('/conversations', { method: 'POST', body: { vendorId: seller.id, productId: p.id, body: msg.value } });
          PM.toast('Message sent. Replies appear in your account.');
        } }] });
      };

      const info = h('div', { class: 'stack' },
        h('div', null, h('a', { class: 'small', href: '#/store/' + seller.slug }, icon('store'), ' ' + seller.name), h('h1', { style: 'margin:6px 0' }, p.name),
          h('div', { class: 'row' }, p.reviewCount ? h('a', { href: '#reviews', style: 'text-decoration:none', onclick: (e) => { e.preventDefault(); tabs.querySelectorAll('.tab')[1].click(); document.getElementById('tab-body').scrollIntoView({ behavior: 'smooth' }); } }, PM.stars(p.rating, p.reviewCount)) : h('span', { class: 'small muted' }, 'No reviews yet'), PM.badge(p.category, 'brand'),
            out ? PM.badge('Out of stock', 'danger') : p.stock <= 5 ? PM.badge(`Only ${p.stock} left`, 'warning') : PM.badge('In stock', 'success'))),
        h('div', null, h('span', { class: 'price', style: 'font-size:2rem' }, fmt.price(p.price)), p.originalPrice ? h('span', { class: 'price-old', style: 'font-size:1.1rem' }, fmt.price(p.originalPrice)) : null, p.discountPct ? h('span', { class: 'discount-tag', style: 'margin-left:10px' }, `Save ${p.discountPct}%`) : null,
          p.flashEndsAt ? h('div', { class: 'row mt-1' }, icon('zap'), h('strong', { class: 'small' }, 'Flash deal ends in'), PM.countdown(p.flashEndsAt)) : null),
        h('p', { class: 'text-2' }, p.description.length > 220 ? p.description.slice(0, 220) + '…' : p.description),
        colorRow, sizeRow,
        h('div', { class: 'row' }, h('div', { class: 'label' }, 'Quantity'), qty),
        h('div', { class: 'row' }, addBtn, buyBtn, wishBtn, shareBtn),
        h('div', { class: 'card card-pad-sm stack-sm' },
          h('div', { class: 'row-nowrap' }, icon('truck'), h('span', { class: 'small' }, `Ships within ${seller.processingDays} business day(s) · free standard delivery over ${fmt.price(S.site.freeShippingThreshold || 100000)}`)),
          h('div', { class: 'row-nowrap' }, icon('undo'), h('span', { class: 'small' }, '14-day returns on delivered items')),
          h('div', { class: 'row-nowrap' }, icon('shield'), h('span', { class: 'small' }, 'Sold by a verified seller. Payments are confirmed before the seller ships.'))),
        h('div', { class: 'card card-pad-sm row between' },
          h('div', { class: 'row-nowrap' }, h('span', { class: 'avatar avatar-lg', style: 'width:52px;height:52px;font-size:1rem' }, fmt.initials(seller.name)),
            h('div', null, h('a', { href: '#/store/' + seller.slug, style: 'font-weight:700' }, seller.name), h('div', { class: 'xs muted' }, `${seller.city || ''}${seller.city ? ' · ' : ''}Selling since ${new Date(seller.since).getFullYear()} · ${seller.productCount} products`),
              seller.reviewCount ? PM.stars(seller.rating, seller.reviewCount) : null)),
          h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', type: 'button', onclick: contactSeller }, icon('message'), 'Contact'), h('a', { class: 'btn btn-sm', href: '#/store/' + seller.slug }, 'Visit store'))));

      // tabs: description / reviews / shipping
      const tabBody = h('div', { id: 'tab-body', class: 'card card-pad' });
      let reviewState = { sort: 'newest', page: 1 };
      const reviewsPane = async () => {
        const box = h('div');
        const list = h('div');
        const write = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => writeReview() }, icon('edit'), 'Write a review');
        const dist = h('div', { class: 'stack-sm', style: 'min-width:220px' }, [5, 4, 3, 2, 1].map((n) => {
          const c = ratingDistribution[n - 1];
          return h('div', { class: 'rating-bar' }, h('span', null, `${n} ★`), h('div', { class: 'progress' }, h('span', { style: `width:${p.reviewCount ? (c / p.reviewCount) * 100 : 0}%` })), h('span', { class: 'muted' }, String(c)));
        }));
        box.append(h('div', { class: 'row between', style: 'align-items:flex-start;gap:24px' },
          h('div', { class: 'row', style: 'gap:24px' }, h('div', { class: 'center' }, h('div', { style: 'font-size:3rem;font-weight:800;line-height:1' }, p.reviewCount ? String(p.rating) : '–'), PM.stars(p.rating), h('div', { class: 'xs muted' }, `${p.reviewCount} review${p.reviewCount === 1 ? '' : 's'}`)), dist), write), h('div', { class: 'divider' }),
          h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, 'Customer reviews'), PM.select([{ value: 'newest', label: 'Newest' }, { value: 'highest', label: 'Highest rated' }, { value: 'lowest', label: 'Lowest rated' }], reviewState.sort, { 'aria-label': 'Sort reviews', style: 'width:auto', onchange: (e) => { reviewState = { sort: e.target.value, page: 1 }; loadReviews(); } })), list);
        async function loadReviews() {
          list.replaceChildren(h('div', { class: 'spinner' }));
          try {
            const d = await api(`/products/${p.id}/reviews?sort=${reviewState.sort}&page=${reviewState.page}`);
            list.replaceChildren(...(d.reviews.length ? d.reviews.map((rv) => h('article', { class: 'review' },
              h('div', { class: 'row' }, PM.stars(rv.rating), rv.verified ? PM.badge('Verified purchase', 'success') : null, h('span', { class: 'xs muted' }, `${rv.userName} · ${fmt.date(rv.createdAt)}`)),
              rv.title ? h('strong', null, rv.title) : null, h('p', { class: 'mb-0' }, rv.body),
              rv.photos.length ? h('div', { class: 'review-photos' }, rv.photos.map((u) => PM.img(u, 'Customer photo'))) : null,
              rv.reply ? h('div', { class: 'reply' }, h('strong', null, `${rv.reply.store} replied:`), h('div', null, rv.reply.body)) : null)) : [PM.empty({ icon: 'star', title: 'No reviews yet', text: 'Be the first to share your experience.' })]),
              PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { reviewState.page = n; loadReviews(); } }));
          } catch (e) { list.replaceChildren(PM.errorState(e, loadReviews)); }
        }
        loadReviews();
        return box;
      };
      function writeReview() {
        if (!S.me) { S.router.go('/login?next=' + encodeURIComponent('/product/' + p.id)); return; }
        let rating = 0;
        const starRow = h('div', { class: 'row', role: 'radiogroup', 'aria-label': 'Rating' });
        const drawStars = () => starRow.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', { class: 'btn btn-ghost btn-icon', type: 'button', role: 'radio', 'aria-checked': String(rating === n), 'aria-label': `${n} star${n > 1 ? 's' : ''}`, style: `color:${n <= rating ? 'var(--accent)' : 'var(--border-strong)'}`, onclick: () => { rating = n; drawStars(); } }, icon('star', 'filled'))));
        drawStars();
        const title = PM.input({ maxLength: 100, placeholder: 'Sum it up in a few words' });
        const body = PM.textarea({ rows: 4, maxLength: 2000, placeholder: 'What did you like or dislike? Was it as described?' });
        const photos = PM.imagePicker({ max: 4 });
        const err = PM.errorBox();
        PM.modal({ title: `Review ${p.name}`, size: 'lg', content: h('div', { class: 'stack' }, h('div', null, h('div', { class: 'label' }, 'Your rating'), starRow), PM.field('Title (optional)', title), PM.field('Your review', body, { required: true, hint: 'At least 10 characters.' }), h('div', null, h('div', { class: 'label' }, 'Photos (optional)'), photos), err),
          actions: [{ label: 'Cancel' }, { label: 'Submit review', kind: 'primary', onClick: async () => {
            err.clear();
            if (!rating) { err.show('Please choose a star rating'); return false; }
            try { await api(`/products/${p.id}/reviews`, { method: 'POST', body: { rating, title: title.value, body: body.value, photos: photos.values() } }); PM.toast('Thanks! Your review is live.'); S.router.render(); } catch (e) { err.show(e.message); return false; }
          } }] });
      }
      const panes = {
        desc: () => h('div', { class: 'stack' }, h('p', null, p.description), h('div', { class: 'row' }, p.tags.map((t) => h('span', { class: 'badge' }, '#' + t))), h('div', { class: 'xs muted' }, `SKU: ${p.sku || '—'}`)),
        reviews: reviewsPane,
        ship: () => h('div', { class: 'stack' }, h('p', null, `This item ships from ${seller.city || 'the seller'} within ${seller.processingDays} business day(s) after payment is confirmed.`), h('ul', { class: 'text-2' }, h('li', null, 'Standard delivery: 3–5 business days'), h('li', null, 'Express delivery: 1–2 business days'), h('li', null, 'Pick-up from the seller is also available')), h('p', null, 'Returns: you can request a return within 14 days of delivery from your order page. The seller reviews it and, once approved, issues your refund.'), p.shipping && p.shipping.weightKg ? h('p', { class: 'muted small' }, `Approximate weight: ${p.shipping.weightKg} kg`) : null),
      };
      const showPane = async (id) => { tabBody.replaceChildren(h('div', { class: 'spinner' })); tabBody.replaceChildren(await panes[id]()); };
      const tabs = PM.tabs([{ id: 'desc', label: 'Description' }, { id: 'reviews', label: 'Reviews', count: p.reviewCount }, { id: 'ship', label: 'Shipping & returns' }], 'desc', showPane);
      showPane('desc');

      const sticky = h('div', { class: 'sticky-buy glass' }, h('div', { class: 'grow' }, h('div', { class: 'price' }, fmt.price(p.price)), h('div', { class: 'xs muted truncate' }, p.name)), h('button', { class: 'btn btn-primary', type: 'button', disabled: out, onclick: (e) => add(false, e.currentTarget) }, icon('cart'), 'Add to cart'));
      return h('div', { style: 'padding-bottom:70px' },
        PM.breadcrumbs([{ label: 'Home', href: '#/' }, { label: p.category, href: '#/shop?category=' + p.categorySlug }, { label: p.name }]),
        h('div', { class: 'product-page' }, h('div', null, media, thumbs), info),
        h('div', { class: 'mt-4' }, tabs, tabBody),
        related.length ? h('section', { class: 'section' }, S.sectionHead('You may also like', '#/shop?category=' + p.categorySlug), S.productGrid(related)) : null, sticky);
    });

    // =========================================================== STORE
    r.add('/store/:slug', async (ctx) => {
      const d = await api('/vendors/' + encodeURIComponent(ctx.params.slug));
      const s = d.store;
      ctx.title(s.name);
      const contact = () => {
        if (!S.me) { S.router.go('/login?next=' + encodeURIComponent('/store/' + s.slug)); return; }
        const msg = PM.textarea({ rows: 4, maxLength: 2000 });
        PM.modal({ title: 'Message ' + s.name, content: PM.field('Your message', msg, { required: true }), actions: [{ label: 'Cancel' }, { label: 'Send', kind: 'primary', onClick: async () => { if (!msg.value.trim()) return false; await api('/conversations', { method: 'POST', body: { vendorId: s.id, body: msg.value } }); PM.toast('Message sent'); } }] });
      };
      return h('div', { class: 'stack' },
        PM.breadcrumbs([{ label: 'Home', href: '#/' }, { label: 'Stores' }, { label: s.name }]),
        h('section', { class: 'store-hero', style: `--store:${s.branding.color || '#4f46e5'}` },
          h('span', { class: 'avatar avatar-lg', style: 'background:#fff3;color:#fff;width:84px;height:84px' }, s.branding.logo ? PM.img(s.branding.logo, '') : fmt.initials(s.name)),
          h('div', { class: 'grow' }, h('h1', { style: 'margin:0 0 4px' }, s.name), h('p', { style: 'margin:0;opacity:.9' }, s.branding.tagline || s.description),
            h('div', { class: 'row mt-1', style: 'gap:16px;font-size:.9rem' }, h('span', null, icon('pin'), ` ${s.city || ''}${s.country ? ', ' + s.country : ''}`), h('span', null, icon('award'), ` Since ${new Date(s.since).getFullYear()}`), s.reviewCount ? h('span', null, icon('star'), ` ${s.rating} (${s.reviewCount} reviews)`) : null, h('span', null, icon('package'), ` ${s.sales} orders delivered`))),
          h('button', { class: 'btn', type: 'button', onclick: contact }, icon('message'), 'Contact store')),
        s.banners.length ? h('div', { class: 'grid cols-3' }, s.banners.map((b) => h('a', { class: 'card card-pad-sm card-hover', href: b.link || '#/store/' + s.slug, style: 'display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit' }, PM.img(b.image, b.title, { style: 'width:80px;height:60px;object-fit:cover;border-radius:8px' }), h('strong', null, b.title)))) : null,
        h('p', { class: 'text-2' }, s.description),
        h('h2', null, `Products (${d.products.length})`),
        d.products.length ? S.productGrid(d.products) : PM.empty({ icon: 'package', title: 'No products yet', text: 'This store is still setting up its shelves.' }));
    });

    // =========================================================== CMS PAGE
    r.add('/page/:slug', async (ctx) => {
      const { page } = await api('/pages/' + encodeURIComponent(ctx.params.slug));
      ctx.title(page.title);
      return h('article', { class: 'card card-pad', style: 'max-width:800px;margin:0 auto' }, PM.breadcrumbs([{ label: 'Home', href: '#/' }, { label: page.title }]), h('h1', null, page.title),
        ...page.body.split(/\n{2,}/).map((para) => h('p', { class: 'text-2' }, para)), h('p', { class: 'xs muted' }, `Last updated ${fmt.date(page.updatedAt)}`));
    });

    // =========================================================== SUPPORT CENTER
    r.add('/support', async (ctx) => {
      ctx.title('Help & support');
      const faqs = [
        ['How do I track my order?', 'Open Account → Orders and choose an order. Each seller updates the status as they pack and ship, and tracking numbers appear once an item has shipped.'],
        ['Which payment methods can I use?', 'Mobile Money, card, PayPal, Stripe, digital wallets, bank transfer and cash on delivery. This demo store simulates payment: nothing real is charged.'],
        ['Can I cancel an order?', 'Yes, as long as the sellers have not shipped it. Open the order and choose Cancel order. Items are returned to stock.'],
        ['How do returns work?', 'Within 14 days of delivery, open the order and request a return with a reason. The seller reviews it and approves or declines it.'],
        ['Why did my order split into several parcels?', 'PrinceMall is a marketplace: each store ships its own items, so an order with products from different stores arrives in separate parcels.'],
        ['How do reward points work?', 'You earn points on every order and can redeem them for coupons in Account → Rewards.'],
        ['I forgot my password.', 'Use “Forgot password” on the login page. We send a reset link that is valid for one hour.'],
        ['How can I sell on PrinceMall?', 'Choose “Sell with us”, create your store and submit your business details. Our team reviews it before you can list products.'],
      ].map(([title, body]) => ({ title, body }));
      const subject = PM.input({ maxLength: 120, placeholder: 'What do you need help with?' });
      const category = PM.select([{ value: 'order', label: 'An order' }, { value: 'payment', label: 'Payment' }, { value: 'account', label: 'My account' }, { value: 'product', label: 'A product' }, { value: 'other', label: 'Something else' }], 'order');
      const message = PM.textarea({ rows: 5, maxLength: 3000, placeholder: 'Tell us what happened. Include an order number if you have one.' });
      const err = PM.errorBox();
      const form = h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault(); err.clear();
        try { await PM.busy(e.submitter, () => api('/tickets', { method: 'POST', body: { subject: subject.value, category: category.value, message: message.value } })); PM.toast('Ticket created. We will reply in your account.'); S.router.go('/account/support'); } catch (x) { err.show(x.message); }
      } }, PM.field('Subject', subject, { required: true }), PM.field('Topic', category), PM.field('Message', message, { required: true }), err, h('button', { class: 'btn btn-primary', type: 'submit' }, icon('mail'), 'Send to support'));
      return h('div', { class: 'stack' }, PM.breadcrumbs([{ label: 'Home', href: '#/' }, { label: 'Help' }]),
        h('div', { class: 'page-title' }, h('div', null, h('h1', null, 'How can we help?'), h('p', null, 'Browse answers or send us a message. We reply within one business day.'))),
        h('div', { class: 'grid cols-2', style: 'align-items:start' },
          h('section', null, h('h2', null, 'Frequently asked questions'), PM.accordion(faqs)),
          h('section', { class: 'card card-pad' }, h('h2', null, 'Contact support'),
            S.me ? form : h('div', { class: 'stack' }, PM.alert('info', 'Log in so we can link your message to your account and orders.'), h('a', { class: 'btn btn-primary', href: '#/login?next=%2Fsupport' }, 'Log in to contact us')),
            h('div', { class: 'divider' }), h('div', { class: 'row small muted' }, icon('mail'), 'Your conversation continues in Account → Support, where our team’s replies appear.'))));
    });
  });

  // ---------- newsletter ----------
  S.newsletterBlock = function () {
    const email = PM.input({ type: 'email', placeholder: 'you@example.com', 'aria-label': 'Email address', required: true });
    return h('section', { class: 'section newsletter', 'aria-labelledby': 'news-h' },
      h('div', null, h('h2', { id: 'news-h', style: 'margin:0 0 4px' }, 'Get deals before everyone else'), h('p', { style: 'margin:0;opacity:.9' }, 'Join the newsletter for flash sales and new store launches. Unsubscribe any time.')),
      h('form', { class: 'input-group', style: 'flex:1 1 320px;max-width:440px', onsubmit: async (e) => {
        e.preventDefault();
        try { await PM.busy(e.submitter, () => api('/newsletter', { method: 'POST', body: { email: email.value } })); PM.toast('You are subscribed. Thank you!'); email.value = ''; } catch (x) { PM.toast(x.message, 'error'); }
      } }, email, h('button', { class: 'btn btn-accent', type: 'submit' }, 'Subscribe')));
  };
})();
