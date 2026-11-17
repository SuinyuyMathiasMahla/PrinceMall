'use strict';
// Seller portal pages (1/2): products, inventory, orders, customers.

(function () {
  const { h, api, icon, fmt } = PM;
  const V = window.V;
  const money = fmt.price;

  const stockBadge = (p) => (p.stock === 0 ? PM.badge('Out of stock', 'danger') : p.stock <= p.lowStockThreshold ? PM.badge(`Low: ${p.stock}`, 'warning') : PM.badge(String(p.stock), 'success'));
  const productCell = (p) => h('div', { class: 'cell-product' }, PM.img(p.image, ''), h('div', null, h('strong', null, p.name), h('div', { class: 'xs muted' }, `SKU ${p.sku || '—'}`)));

  // Says plainly whether shoppers can see a product, and why not.
  const publish = async (p, reload) => {
    try { await api('/vendor/products/' + p.id, { method: 'PATCH', body: { status: 'active' } }); PM.toast(V.info.vendor.status === 'approved' ? `${p.name} is now live in the shop` : `${p.name} will go live when your store is approved`); reload(); } catch (e) { PM.toast(e.message, 'error'); }
  };
  function visibility(p, reload) {
    const approved = V.info.vendor.status === 'approved';
    if (p.status === 'blocked') return h('div', null, PM.badge('Blocked by admin', 'danger'));
    if (p.status === 'archived') return h('div', null, PM.badge('Archived: hidden', 'neutral'));
    if (p.status === 'draft') {
      return h('div', { class: 'stack-sm' }, PM.badge('Draft: hidden', 'warning'),
        h('button', { class: 'btn btn-sm btn-success', type: 'button', onclick: () => publish(p, reload || (() => V.router.render())) }, icon('check'), 'Publish'));
    }
    if (!approved) return h('div', null, PM.badge('Waiting for store approval', 'warning'), h('div', { class: 'xs muted' }, 'Hidden until approved'));
    return h('div', null, PM.badge('Live', 'success'), ' ', h('a', { class: 'xs', href: '/#/product/' + p.id, target: '_blank', rel: 'noopener' }, 'View'));
  }

  // =========================================================== PRODUCTS LIST
  V.page('/products', 'products', async (ctx) => {
    const state = { q: '', status: ctx.query.get('status') || '', category: '', stock: ctx.query.get('stock') || '', page: 1 };
    const bulk = h('div');
    const wrap = h('div');
    let tbl;
    const run = async (action, extra = {}) => {
      const ids = tbl.selected();
      if (!ids.length) return;
      if (action === 'delete' && !(await PM.confirm({ title: `Delete ${ids.length} product(s)?`, message: 'This cannot be undone. Past orders keep their own copy of the product details.', confirmLabel: 'Delete', danger: true }))) return;
      try { const r = await api('/vendor/products/bulk', { method: 'POST', body: { ids, action, ...extra } }); PM.toast(`${r.affected} product(s) updated`); tbl.clear(); load(); } catch (e) { PM.toast(e.message, 'error'); }
    };
    const showBulk = (ids) => {
      bulk.replaceChildren(...(ids.length ? [h('div', { class: 'bulkbar' }, h('span', null, `${ids.length} selected`),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => run('activate') }, 'Activate'), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => run('draft') }, 'Set as draft'), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => run('archive') }, 'Archive'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { const pct = PM.input({ type: 'number', min: 1, max: 90, value: 10 }); PM.modal({ title: 'Apply a discount', content: PM.field('Discount percent', pct, { hint: 'The current price becomes the “was” price.' }), actions: [{ label: 'Cancel' }, { label: 'Apply', kind: 'primary', onClick: () => run('discount', { percent: Number(pct.value) }) }] }); } }, icon('percent'), 'Discount'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => run('end_discount') }, 'End discount'), h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => run('delete') }, icon('trash'), 'Delete'))] : []));
    };
    tbl = PM.table({ selectable: true, onSelect: showBulk, columns: [
      { key: 'name', label: 'Product', sortable: true, render: productCell },
      { key: 'category', label: 'Category', sortable: true },
      { key: 'price', label: 'Price', sortable: true, align: 'r', render: (p) => h('span', { class: 'num' }, money(p.price), p.comparePrice ? h('div', { class: 'xs muted', style: 'text-decoration:line-through' }, money(p.comparePrice)) : null) },
      { key: 'stock', label: 'Stock', sortable: true, render: stockBadge },
      { key: 'status', label: 'In the shop?', render: (p) => visibility(p) },
      { key: 'sold', label: 'Sold', sortable: true, align: 'r' },
      { key: 'x', label: '', align: 'r', render: (p) => h('a', { class: 'btn btn-sm', href: '#/products/' + p.id }, icon('edit'), 'Edit') },
    ], empty: PM.empty({ icon: 'package', title: 'No products found', text: 'Add your first product to start selling.', action: h('a', { class: 'btn btn-primary', href: '#/products/new' }, icon('plus'), 'Add product') }) });
    const pager = h('div');
    async function load() {
      try {
        const d = await api('/vendor/products' + PM.qs({ ...state, limit: 10 }));
        tbl.update(d.products);
        pager.replaceChildren(PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }), h('p', { class: 'xs muted center' }, `${d.total} product${d.total === 1 ? '' : 's'}`));
      } catch (e) { pager.replaceChildren(PM.errorState(e, load)); }
    }
    load();
    const cats = V.info.categories;
    const tools = h('div', { class: 'toolbar' }, PM.dash.searchBox((q) => { state.q = q; state.page = 1; load(); }, 'Search name or SKU'),
      PM.select([{ value: '', label: 'All statuses' }, 'active', 'draft', 'archived', 'blocked'].map((o) => (typeof o === 'string' ? { value: o, label: fmt.label(o) } : o)), state.status, { 'aria-label': 'Status', style: 'width:auto', onchange: (e) => { state.status = e.target.value; state.page = 1; load(); } }),
      PM.select([{ value: '', label: 'All categories' }, ...cats.map((c) => ({ value: c, label: c }))], '', { 'aria-label': 'Category', style: 'width:auto', onchange: (e) => { state.category = e.target.value; state.page = 1; load(); } }),
      PM.select([{ value: '', label: 'Any stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }], state.stock, { 'aria-label': 'Stock', style: 'width:auto', onchange: (e) => { state.stock = e.target.value; state.page = 1; load(); } }));
    const notLive = V.info.vendor.status !== 'approved';
    const banner = notLive
      ? PM.alert('warning', h('span', null, h('strong', null, 'Your store is waiting for approval. '), 'Your products are saved, but shoppers cannot see any of them until an administrator approves the store. They go live automatically afterwards (drafts need to be published).'))
      : null;
    const draftNote = h('div');
    api('/vendor/products?status=draft&limit=1').then((d) => {
      if (d.total) draftNote.replaceChildren(PM.alert('info', h('span', null, `${d.total} product${d.total > 1 ? 's are' : ' is'} saved as a draft and hidden from shoppers. `, h('button', { class: 'btn-link', type: 'button', style: 'background:none;border:0;padding:0;color:var(--info);text-decoration:underline;cursor:pointer', onclick: () => { state.status = 'draft'; state.page = 1; load(); } }, 'Show drafts'), ' then use Publish.')));
    }).catch(() => {});
    wrap.append(tools, bulk, tbl.el, pager);
    return h('div', { class: 'stack' }, PM.dash.title('Products', 'Manage everything you sell.', h('a', { class: 'btn btn-primary', href: '#/products/new' }, icon('plus'), 'Add product')), banner, draftNote, wrap);
  });

  // =========================================================== PRODUCT FORM
  async function productForm(ctx, id) {
    const isNew = !id;
    const p = isNew ? { name: '', category: '', description: '', price: '', comparePrice: '', stock: 0, lowStockThreshold: 5, sku: '', warehouse: (V.info.vendor.warehouses[0] || {}).name || '', images: [], video: '', colors: [], sizes: [], shipping: { weightKg: '', processingDays: 2, freeShipping: false }, seo: { title: '', description: '' }, tags: [], status: 'active' } : (await api('/vendor/products/' + id)).product;
    ctx.title(isNew ? 'New product' : p.name);
    const colors = (p.colors || []).map((c) => ({ ...c }));
    // The seller picks an existing category or types a new one; the server creates it on save.
    const NEW_CATEGORY = '__new__';
    const catNames = [...V.info.categories];
    if (p.category && !catNames.includes(p.category)) catNames.push(p.category);
    const f = {
      name: PM.input({ value: p.name, maxLength: 120 }),
      category: PM.select([{ value: '', label: 'Choose a category…' }, ...catNames.map((c) => ({ value: c, label: c })), { value: NEW_CATEGORY, label: '+ Add a new category…' }], p.category),
      newCategory: PM.input({ maxLength: 40, placeholder: 'e.g. Car parts, Baby clothes, Phones' }),
      description: PM.textarea({ value: p.description, rows: 6, maxLength: 4000 }),
      status: PM.select([{ value: 'active', label: 'Active (visible in shop)' }, { value: 'draft', label: 'Draft (hidden)' }, { value: 'archived', label: 'Archived' }], p.status === 'blocked' ? 'archived' : p.status),
      video: PM.input({ value: p.video || '', placeholder: 'https://… .mp4', type: 'url' }),
      price: PM.input({ type: 'number', min: 1, value: p.price }), comparePrice: PM.input({ type: 'number', min: 1, value: p.comparePrice || '' }),
      stock: PM.input({ type: 'number', min: 0, value: p.stock }), low: PM.input({ type: 'number', min: 0, value: p.lowStockThreshold ?? 5 }), sku: PM.input({ value: p.sku || '', maxLength: 40 }),
      warehouse: PM.select([{ value: '', label: '— none —' }, ...V.info.vendor.warehouses.map((w) => ({ value: w.name, label: w.name }))], p.warehouse || ''),
      sizes: PM.input({ value: (p.sizes || []).join(', '), placeholder: 'e.g. S, M, L, XL' }),
      weight: PM.input({ type: 'number', min: 0, step: '0.1', value: (p.shipping || {}).weightKg ?? '' }), proc: PM.input({ type: 'number', min: 0, value: (p.shipping || {}).processingDays ?? 2 }),
      free: PM.check('Offer free shipping on this product', { checked: Boolean((p.shipping || {}).freeShipping) }),
      seoTitle: PM.input({ value: (p.seo || {}).title || '', maxLength: 70 }), seoDesc: PM.textarea({ value: (p.seo || {}).description || '', rows: 2, maxLength: 160 }),
      tags: PM.input({ value: (p.tags || []).join(', '), placeholder: 'comma, separated, keywords' }),
    };
    const newCategoryField = PM.field('New category name', f.newCategory, { hint: 'Shoppers will see this name. If a similar category already exists, it is reused instead of creating a duplicate.' });
    newCategoryField.hidden = true;
    f.category.addEventListener('change', () => {
      newCategoryField.hidden = f.category.value !== NEW_CATEGORY;
      if (!newCategoryField.hidden) f.newCategory.focus();
    });
    const images = PM.imagePicker({ values: p.images, max: 8 });
    const colorBox = h('div', { class: 'stack-sm' });
    const drawColors = () => colorBox.replaceChildren(...colors.map((c, i) => h('div', { class: 'row-nowrap' },
      PM.input({ value: c.name, placeholder: 'Color name', 'aria-label': 'Color name', oninput: (e) => { c.name = e.target.value; } }),
      h('input', { type: 'color', value: c.hex, 'aria-label': 'Color', style: 'width:48px;height:42px;border:1px solid var(--border-strong);border-radius:8px;background:none;padding:2px', oninput: (e) => { c.hex = e.target.value; } }),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Remove color', onclick: () => { colors.splice(i, 1); drawColors(); } }, icon('trash')))),
      h('button', { class: 'btn btn-sm', type: 'button', style: 'justify-self:start', onclick: () => { colors.push({ name: '', hex: '#4f46e5' }); drawColors(); } }, icon('plus'), 'Add color'));
    drawColors();
    const snippet = h('div', { class: 'card card-pad-sm', style: 'background:var(--surface-2)' });
    const drawSnippet = () => snippet.replaceChildren(h('div', { style: 'color:var(--info);font-size:1.05rem' }, f.seoTitle.value || f.name.value || 'Product title'), h('div', { class: 'xs', style: 'color:var(--success)' }, `princemall.example/#/product/${p.id || 'your-product'}`), h('div', { class: 'small text-2' }, f.seoDesc.value || f.description.value.slice(0, 160) || 'Meta description appears here.'), h('div', { class: 'xs muted mt-1' }, `Title ${f.seoTitle.value.length}/70 · Description ${f.seoDesc.value.length}/160`));
    [f.seoTitle, f.seoDesc, f.name, f.description].forEach((el) => el.addEventListener('input', drawSnippet));
    drawSnippet();
    const err = PM.errorBox();
    const num = (v) => (v === '' ? undefined : Number(v));
    const save = async (e) => {
      e.preventDefault(); err.clear();
      const category = f.category.value === NEW_CATEGORY ? f.newCategory.value.trim() : f.category.value;
      if (!category) { err.show(f.category.value === NEW_CATEGORY ? 'Type the name of your new category' : 'Choose a category for this product, or add a new one'); (f.category.value === NEW_CATEGORY ? f.newCategory : f.category).focus(); return; }
      const body = {
        name: f.name.value, category, description: f.description.value, status: f.status.value, images: images.values(), video: f.video.value,
        price: num(f.price.value), comparePrice: f.comparePrice.value === '' ? null : Number(f.comparePrice.value), stock: num(f.stock.value), lowStockThreshold: num(f.low.value), sku: f.sku.value, warehouse: f.warehouse.value,
        colors: colors.filter((c) => c.name.trim()), sizes: f.sizes.value.split(',').map((s) => s.trim()).filter(Boolean),
        shipping: { weightKg: f.weight.value, processingDays: f.proc.value, freeShipping: f.free.querySelector('input').checked },
        seo: { title: f.seoTitle.value, description: f.seoDesc.value }, tags: f.tags.value.split(',').map((s) => s.trim()).filter(Boolean),
      };
      if (!images.values().length) return err.show('Add at least one product image');
      try {
        await PM.busy(e.submitter, () => (isNew ? api('/vendor/products', { method: 'POST', body }) : api('/vendor/products/' + id, { method: 'PATCH', body })));
        PM.toast(isNew ? 'Product created' : 'Product saved');
        try { V.info = await api('/vendor/me'); } catch { /* the category list refreshes on the next page load */ }
        V.router.go('/products');
      } catch (x) { err.show(x.message); }
    };
    const section = (title, ...kids) => h('section', { class: 'card card-pad stack' }, h('h2', { style: 'margin:0;font-size:1.1rem' }, title), ...kids);
    return h('form', { class: 'stack', style: 'max-width:900px', onsubmit: save },
      PM.breadcrumbs([{ label: 'Products', href: '#/products' }, { label: isNew ? 'New product' : p.name }]),
      PM.dash.title(isNew ? 'Add product' : 'Edit product', p.status === 'blocked' ? 'An administrator blocked this product.' : null),
      p.status === 'blocked' ? PM.alert('error', 'This product was blocked by moderation and cannot be edited. Contact support.') : null,
      section('Basic information', PM.field('Product name', f.name, { required: true }), h('div', { class: 'form-grid' }, h('div', { class: 'stack-sm' }, PM.field('Category', f.category, { required: true, hint: 'What kind of product is this? Pick one, or add your own.' }), newCategoryField), PM.field('Status', f.status, { hint: 'Choose Active to show it to shoppers. Draft and Archived products stay hidden.' })), PM.field('Description', f.description, { required: true, hint: 'Explain materials, size, what is in the box, and warranty.' })),
      section('Media', h('div', null, h('div', { class: 'label' }, 'Images (first one is the cover)'), images), PM.field('Video link (optional)', f.video, { hint: 'A direct https link to an .mp4 or .webm file.' })),
      section('Pricing', h('div', { class: 'form-grid' }, PM.field(`Selling price (${PM.currency})`, f.price, { required: true }), PM.field('Original price (optional)', f.comparePrice, { hint: 'Shows a discount badge when higher than the selling price.' }))),
      section('Inventory', h('div', { class: 'form-grid' }, PM.field('Stock quantity', f.stock, { required: true }), PM.field('Low stock alert at', f.low), PM.field('SKU', f.sku, { hint: 'Leave blank to generate one.' }), PM.field('Warehouse', f.warehouse))),
      section('Variations', h('div', null, h('div', { class: 'label' }, 'Colors'), colorBox), PM.field('Sizes', f.sizes, { hint: 'Optional. Buyers must pick a size when you list some.' }), h('p', { class: 'xs muted mb-0' }, 'Stock is tracked for the whole product, not per color or size.')),
      section('Shipping', h('div', { class: 'form-grid' }, PM.field('Weight (kg)', f.weight), PM.field('Processing time (days)', f.proc)), f.free),
      section('Search engine listing (SEO)', PM.field('Page title', f.seoTitle), PM.field('Meta description', f.seoDesc), snippet, PM.field('Tags', f.tags)),
      err,
      h('div', { class: 'row between' }, h('div', null, !isNew ? h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (await PM.confirm({ title: 'Delete this product?', message: 'It will disappear from your store. Past orders keep their details.', confirmLabel: 'Delete', danger: true })) { await api('/vendor/products/' + id, { method: 'DELETE' }); PM.toast('Product deleted'); V.router.go('/products'); } } }, icon('trash'), 'Delete') : null),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/products' }, 'Cancel'), h('button', { class: 'btn btn-primary', type: 'submit', disabled: p.status === 'blocked' }, isNew ? 'Create product' : 'Save changes'))));
  }
  V.page('/products/new', 'products', (ctx) => productForm(ctx, null));
  V.page('/products/:id', 'products', (ctx) => productForm(ctx, ctx.params.id));

  // =========================================================== INVENTORY
  V.page('/inventory', 'inventory', async (ctx) => {
    const state = { filter: ctx.query.get('filter') || '', warehouse: '' };
    const kpis = h('div', { class: 'grid cols-4' });
    const wrap = h('div');
    let d;
    const tbl = PM.table({ columns: [
      { key: 'name', label: 'Product', sortable: true, render: productCell },
      { key: 'warehouse', label: 'Warehouse', sortable: true, render: (p) => p.warehouse || '—' },
      { key: 'stock', label: 'Stock', sortable: true, render: (p) => h('div', { class: 'row-nowrap' },
        h('button', { class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': `Remove one ${p.name}`, onclick: () => adjust(p, -1) }, icon('minus')), h('strong', { class: 'num', style: 'min-width:34px;text-align:center' }, String(p.stock)),
        h('button', { class: 'btn btn-sm btn-icon', type: 'button', 'aria-label': `Add one ${p.name}`, onclick: () => adjust(p, 1) }, icon('plus'))) },
      { key: 'lowStockThreshold', label: 'Alert at', align: 'r' }, { key: 'x', label: 'Health', render: stockBadge },
      { key: 'y', label: '', align: 'r', render: (p) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => edit(p) }, icon('edit'), 'Edit') },
    ] });
    async function adjust(p, by) { try { await api('/vendor/inventory/' + p.id, { method: 'PATCH', body: { adjust: by } }); load(); } catch (e) { PM.toast(e.message, 'error'); } }
    function edit(p) {
      const stock = PM.input({ type: 'number', min: 0, value: p.stock }); const sku = PM.input({ value: p.sku }); const low = PM.input({ type: 'number', min: 0, value: p.lowStockThreshold });
      const wh = PM.select([{ value: '', label: '— none —' }, ...d.warehouses.map((w) => ({ value: w.name, label: w.name }))], p.warehouse);
      PM.modal({ title: p.name, content: h('div', { class: 'form-grid' }, PM.field('Stock on hand', stock), PM.field('Low stock alert at', low), PM.field('SKU', sku), PM.field('Warehouse', wh)), actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => { try { await api('/vendor/inventory/' + p.id, { method: 'PATCH', body: { stock: Number(stock.value), sku: sku.value, lowStockThreshold: Number(low.value), warehouse: wh.value } }); PM.toast('Inventory updated'); load(); } catch (e) { PM.toast(e.message, 'error'); return false; } } }] });
    }
    function warehouses() {
      const name = PM.input({ placeholder: 'Warehouse name' }); const city = PM.input({ placeholder: 'City' });
      const list = h('div', { class: 'stack-sm' });
      const draw = () => list.replaceChildren(...d.warehouses.map((w) => h('div', { class: 'row between card card-pad-sm' }, h('span', null, h('strong', null, w.name), ` · ${w.city}`), h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: async () => { try { const r = await api('/vendor/warehouses/' + w.id, { method: 'DELETE' }); d.warehouses = r.warehouses; V.info.vendor.warehouses = r.warehouses; draw(); } catch (e) { PM.toast(e.message, 'error'); } } }, 'Remove'))));
      draw();
      PM.modal({ title: 'Warehouses', content: h('div', { class: 'stack' }, list, h('form', { class: 'input-group', onsubmit: async (e) => { e.preventDefault(); try { const r = await api('/vendor/warehouses', { method: 'POST', body: { name: name.value, city: city.value } }); d.warehouses = r.warehouses; V.info.vendor.warehouses = r.warehouses; name.value = city.value = ''; draw(); } catch (x) { PM.toast(x.message, 'error'); } } }, name, city, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add'))), actions: [{ label: 'Done', kind: 'primary', onClick: () => load() }] });
    }
    const tabs = PM.tabs([{ id: '', label: 'All' }, { id: 'low', label: 'Low stock' }, { id: 'out', label: 'Out of stock' }], state.filter, (id) => { state.filter = id; load(); });
    async function load() {
      try {
        d = await api('/vendor/inventory' + PM.qs(state));
        const s = d.summary;
        kpis.replaceChildren(PM.kpi({ label: 'SKUs', value: fmt.num(s.skus), icon: 'layers' }), PM.kpi({ label: 'Units in stock', value: fmt.num(s.units), icon: 'box' }), PM.kpi({ label: 'Stock value', value: money(s.value), icon: 'dollar' }), PM.kpi({ label: 'Needs attention', value: `${s.low} low · ${s.out} out`, icon: 'alert' }));
        tbl.update(d.items);
      } catch (e) { wrap.replaceChildren(PM.errorState(e, load)); }
    }
    wrap.append(tabs, tbl.el);
    load();
    return h('div', { class: 'stack' }, PM.dash.title('Inventory', 'Track stock, SKUs and warehouses.', h('button', { class: 'btn', type: 'button', onclick: warehouses }, icon('home'), 'Warehouses')), kpis, wrap);
  });

  // =========================================================== ORDERS
  V.page('/orders', 'orders', async (ctx) => {
    const state = { status: ctx.query.get('status') || '', q: '', page: 1 };
    const tabsBox = h('div'); const body = h('div');
    const tbl = PM.table({ columns: [
      { key: 'id', label: 'Order', sortable: true, render: (o) => h('div', null, h('strong', null, o.id), h('div', { class: 'xs muted' }, fmt.dateTime(o.createdAt))) },
      { key: 'customer', label: 'Customer', sortable: true, render: (o) => h('div', null, o.customer, h('div', { class: 'xs muted' }, o.address.city)) },
      { key: 'items', label: 'Items', render: (o) => `${o.items.reduce((s, i) => s + i.quantity, 0)} item(s)` },
      { key: 'subtotal', label: 'Total', align: 'r', sortable: true, render: (o) => h('span', { class: 'num' }, money(o.subtotal - o.vendorDiscount)) },
      { key: 'paymentStatus', label: 'Payment', render: (o) => PM.payStatus(o.paymentStatus) },
      { key: 'status', label: 'Status', render: (o) => h('div', { class: 'row', style: 'gap:4px' }, PM.status(o.status), o.return ? PM.badge(`Return ${o.return.status}`, o.return.status === 'requested' ? 'warning' : 'neutral') : null) },
      { key: 'x', label: '', align: 'r', render: (o) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => detail(o) }, 'Manage') },
    ] });
    const pager = h('div');
    function detail(o) {
      const tracking = PM.input({ value: o.trackingNumber, placeholder: 'Tracking number' }); const carrier = PM.input({ value: o.carrier, placeholder: 'Carrier (e.g. DHL)' });
      const advance = { placed: ['processing', 'Start processing'], processing: ['shipped', 'Mark as shipped'], shipped: ['delivered', 'Mark as delivered'] }[o.status];
      const update = async (status, layer) => { try { await api('/vendor/orders/' + o.id, { method: 'PATCH', body: { status, trackingNumber: tracking.value, carrier: carrier.value } }); PM.toast('Order updated'); layer(); load(); V.refreshBadges(); } catch (e) { PM.toast(e.message, 'error'); } };
      const note = PM.input({ placeholder: 'Note to the buyer (optional)' });
      const restock = PM.check('The items are in good condition: add them back to my stock', { checked: false });
      const returnAct = async (action, close) => {
        try {
          await api(`/vendor/orders/${o.id}/return`, { method: 'POST', body: { action, note: note.value, restock: restock.querySelector('input').checked } });
          PM.toast({ approve: 'Return approved. The buyer can send the items back.', reject: 'Return declined', received: 'Marked as received. PrinceMall staff will send the refund.' }[action]);
          close(); load();
        } catch (e) { PM.toast(e.message, 'error'); }
      };
      // Returns are a chain of human steps: the seller approves, confirms the goods arrived (and whether they can be resold), staff send the refund.
      const rs = o.return && o.return.status;
      const returnBlock = !o.return ? null
        : rs === 'requested' ? h('div', { class: 'alert alert-warning' }, icon('undo'), h('div', { class: 'grow stack-sm' }, h('strong', null, 'Return requested'), h('div', null, `“${o.return.reason}”`), note,
          h('div', { class: 'row' }, h('button', { class: 'btn btn-sm btn-success', type: 'button', onclick: () => returnAct('approve', () => layer.close()) }, 'Approve return'), h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => returnAct('reject', () => layer.close()) }, 'Decline'))))
        : rs === 'approved' ? h('div', { class: 'alert alert-info' }, icon('undo'), h('div', { class: 'grow stack-sm' }, h('strong', null, 'Return approved: waiting for the items'), h('div', null, 'When the parcel is back in your hands, confirm it here. Stock is only changed if you tick the box.'), restock,
          h('div', { class: 'row' }, h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => returnAct('received', () => layer.close()) }, 'I received the items'))))
        : PM.alert(rs === 'received' ? 'info' : 'warning', rs === 'received' ? `You confirmed the items came back${o.return.restocked ? ' and added them to stock' : ''}. PrinceMall staff will send the refund.` : `Return ${rs}: ${o.return.reason}`);
      let layer;
      layer = PM.modal({ title: `Order ${o.id}`, size: 'lg', content: h('div', { class: 'stack' },
        h('div', { class: 'row between' }, h('div', null, PM.status(o.status), ' ', PM.payStatus(o.paymentStatus), h('span', { class: 'small muted' }, ` via ${fmt.label(o.paymentMethod)}`)), h('span', { class: 'xs muted' }, fmt.dateTime(o.createdAt))),
        h('div', { class: 'grid cols-2' }, h('div', { class: 'card card-pad-sm small' }, h('strong', null, 'Ship to'), h('div', { class: 'text-2' }, o.address.fullName, h('br'), `${o.address.address}, ${o.address.city}`, h('br'), o.address.phone, h('br'), `${o.delivery.label} (${o.delivery.days})`)),
          h('div', { class: 'card card-pad-sm small' }, h('strong', null, 'Your earnings'), h('div', { class: 'sum-row' }, h('span', null, 'Sales'), h('span', null, money(o.subtotal))), o.vendorDiscount ? h('div', { class: 'sum-row' }, h('span', null, 'Your coupon'), h('span', null, '−' + money(o.vendorDiscount))) : null, h('div', { class: 'sum-row' }, h('span', null, 'Commission'), h('span', null, '−' + money(o.commission))), h('div', { class: 'sum-row total', style: 'font-size:1rem' }, h('span', null, 'You receive'), h('span', null, money(o.net))))),
        h('div', null, o.items.map((it) => h('div', { class: 'row-nowrap', style: 'padding:6px 0' }, PM.img(it.image, '', { style: 'width:44px;height:44px;border-radius:8px;object-fit:cover' }), h('div', { class: 'grow small' }, h('strong', null, it.name), h('div', { class: 'xs muted' }, `${it.quantity} × ${money(it.price)}${it.color ? ' · ' + it.color : ''}${it.size ? ' · ' + it.size : ''}`)), h('span', { class: 'num small' }, money(it.lineTotal))))),
        ['processing', 'shipped'].includes(o.status) || advance ? h('div', { class: 'form-grid' }, PM.field('Tracking number', tracking), PM.field('Carrier', carrier)) : null,
        h('ol', { class: 'timeline' }, o.timeline.map((t) => h('li', null, h('strong', { class: 'small' }, fmt.label(t.status)), h('div', { class: 'xs muted' }, fmt.dateTime(t.at))))),
        returnBlock,
        o.cashPending ? PM.alert('warning', 'Cash on delivery: this parcel is delivered. Confirm below once the courier has handed you the cash. The order is only marked paid when you do.') : null,
        o.refundDue ? PM.alert('info', 'A refund for this parcel is waiting for PrinceMall staff to send.') : null),
      actions: [{ label: 'Close' }, ...(o.cashPending ? [{ label: 'Confirm cash collected', kind: 'success', onClick: async () => { if (!(await PM.confirm({ title: 'Cash collected?', message: `Only confirm if you really received ${money(o.subtotal - o.vendorDiscount)} for this parcel.`, confirmLabel: 'Yes, cash received' }))) return false; try { await api(`/vendor/orders/${o.id}/payment`, { method: 'POST', body: {} }); PM.toast('Cash confirmed'); load(); } catch (e) { PM.toast(e.message, 'error'); return false; } } }] : []), ...(['placed', 'processing'].includes(o.status) ? [{ label: 'Cancel order', kind: 'danger', onClick: async () => { if (!(await PM.confirm({ title: 'Cancel this order?', message: 'The stock reserved for it goes back on your shelf and the buyer is notified. Any payment already received is flagged for a refund.', confirmLabel: 'Cancel order', danger: true }))) return false; await update('cancelled', () => {}); } }] : []), ...(advance ? [{ label: advance[1], kind: 'primary', onClick: async () => { await update(advance[0], () => {}); } }] : [])] });
    }
    async function load() {
      try {
        const d = await api('/vendor/orders' + PM.qs({ ...state, limit: 10 }));
        const c = d.counts;
        tabsBox.replaceChildren(PM.tabs([{ id: '', label: 'All', count: c.all }, { id: 'placed', label: 'New', count: c.placed }, { id: 'processing', label: 'Processing', count: c.processing }, { id: 'shipped', label: 'Shipping', count: c.shipped }, { id: 'delivered', label: 'Delivered', count: c.delivered }, { id: 'cancelled', label: 'Cancelled', count: c.cancelled }, { id: 'returns', label: 'Returns', count: c.returns }], state.status, (id) => { state.status = id; state.page = 1; load(); }));
        tbl.update(d.orders);
        pager.replaceChildren(PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }));
      } catch (e) { body.replaceChildren(PM.errorState(e, load)); }
    }
    body.append(tbl.el, pager);
    load();
    return h('div', null, PM.dash.title('Orders', 'Process, ship and track what customers bought from you.'), h('div', { class: 'toolbar' }, PM.dash.searchBox((q) => { state.q = q; state.page = 1; load(); }, 'Search order or customer')), tabsBox, body);
  });

  // =========================================================== CUSTOMERS
  V.page('/customers', 'customers', async () => {
    const state = { segment: '', q: '', page: 1 };
    const tabsBox = h('div'); const pager = h('div');
    const tbl = PM.table({ columns: [
      { key: 'name', label: 'Customer', sortable: true, render: (c) => h('div', { class: 'row-nowrap' }, h('span', { class: 'avatar' }, fmt.initials(c.name)), h('div', null, h('strong', null, c.name), h('div', { class: 'xs muted' }, c.city))) },
      { key: 'segment', label: 'Segment', render: (c) => PM.status(c.segment) },
      { key: 'orders', label: 'Orders', sortable: true, align: 'r' }, { key: 'spent', label: 'Total spent', sortable: true, align: 'r', render: (c) => h('span', { class: 'num' }, money(c.spent)) },
      { key: 'lastOrder', label: 'Last order', sortable: true, render: (c) => fmt.date(c.lastOrder) }, { key: 'tier', label: 'Loyalty', render: (c) => PM.badge(c.tier, 'brand') },
      { key: 'x', label: '', align: 'r', render: (c) => h('button', { class: 'btn btn-sm', type: 'button', onclick: () => profile(c) }, 'View') },
    ] });
    async function profile(c) {
      const box = h('div', null, h('div', { class: 'spinner' }));
      PM.modal({ title: c.name, size: 'lg', content: box });
      try {
        const d = await api('/vendor/customers/' + c.id);
        box.replaceChildren(h('div', { class: 'stack' }, h('div', { class: 'grid cols-4' }, [['Orders', d.customer.orders], ['Spent', money(d.customer.spent)], ['Customer since', fmt.date(d.customer.joined)], ['Loyalty tier', d.customer.tier]].map(([k, v]) => h('div', { class: 'card card-pad-sm' }, h('div', { class: 'xs muted' }, k), h('strong', null, String(v))))),
          h('h3', { style: 'margin:0' }, 'Purchase history'), d.history.map((o) => h('div', { class: 'row between card card-pad-sm' }, h('div', null, h('strong', { class: 'small' }, o.id), h('div', { class: 'xs muted' }, `${fmt.date(o.createdAt)} · ${o.items.join(', ')}`)), h('div', { class: 'row' }, PM.status(o.status), h('span', { class: 'price small' }, money(o.total)))))));
      } catch (e) { box.replaceChildren(PM.errorState(e)); }
    }
    async function load() {
      try {
        const d = await api('/vendor/customers' + PM.qs({ ...state, limit: 10 }));
        const s = d.segments;
        tabsBox.replaceChildren(PM.tabs([{ id: '', label: 'All', count: s.all }, { id: 'vip', label: 'VIP', count: s.vip }, { id: 'returning', label: 'Returning', count: s.returning }, { id: 'new', label: 'New', count: s.new }, { id: 'at_risk', label: 'At risk', count: s.at_risk }], state.segment, (id) => { state.segment = id; state.page = 1; load(); }));
        tbl.update(d.customers);
        pager.replaceChildren(PM.pagination({ page: d.page, pages: d.pages, onChange: (n) => { state.page = n; load(); } }));
      } catch (e) { pager.replaceChildren(PM.errorState(e, load)); }
    }
    load();
    return h('div', null, PM.dash.title('Customers', 'Who buys from you, and how often.'), h('div', { class: 'toolbar' }, PM.dash.searchBox((q) => { state.q = q; state.page = 1; load(); }, 'Search name or city')),
      PM.alert('info', 'VIP: 150,000+ spent or 5+ orders · Returning: 2+ orders · At risk: returning customers silent for 45+ days. To protect buyers, contact details are only visible on orders you fulfil.'), h('div', { class: 'mt-2' }, tabsBox, tbl.el, pager));
  });
})();
