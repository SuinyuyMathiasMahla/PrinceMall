'use strict';
// Shared chrome for the vendor portal and the admin panel: login screen,
// sidebar + topbar shell, page headers, notifications.

(function () {
  const { h, api, icon, fmt } = PM;

  PM.dash = {
    // Full-screen login card. `roles` lists the roles allowed into this app.
    login({ title, subtitle, roles, onSuccess, footer }) {
      const email = PM.input({ type: 'email', autocomplete: 'email' });
      const pw = PM.input({ type: 'password', autocomplete: 'current-password' });
      const err = PM.errorBox();
      return h('div', { class: 'login-shell' }, h('div', { class: 'card card-pad auth-card', style: 'width:100%;max-width:420px' },
        h('div', { class: 'center', style: 'margin-bottom:16px' }, h('span', { class: 'logo-mark', style: 'margin:0 auto 12px;width:44px;height:44px;font-size:20px' }, 'P'), h('h1', { style: 'margin:0' }, title), h('p', { class: 'muted', style: 'margin:4px 0 0' }, subtitle)),
        h('form', { class: 'stack', onsubmit: async (e) => {
          e.preventDefault(); err.clear();
          try {
            const { user } = await PM.busy(e.submitter, () => api('/auth/login', { method: 'POST', body: { email: email.value, password: pw.value } }));
            if (!roles.includes(user.role)) {
              await api('/auth/logout', { method: 'POST' });
              return err.show('This account does not have access to this area.');
            }
            onSuccess(user);
          } catch (x) { err.show(x.message); }
        } }, PM.field('Email', email, { required: true }), PM.field('Password', pw, { required: true }), err, h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, 'Log in')),
        footer || null,
        h('div', { class: 'center mt-2' }, PM.theme.toggleButton())));
    },

    // nav: [{group}, {key,label,icon,path,badge}]
    shell({ appName, nav, user, onLogout, storeLink }) {
      const links = new Map();
      const buildNav = (closeFn) => {
        const box = h('nav', { 'aria-label': appName });
        for (const item of nav) {
          if (item.group) { box.append(h('div', { class: 'nav-group' }, item.group)); continue; }
          const a = h('a', { class: 'nav-item', href: '#' + item.path, onclick: closeFn }, icon(item.icon), item.label, h('span', { class: 'badge badge-accent', hidden: true, 'data-badge': item.key }));
          box.append(a);
          if (!closeFn) links.set(item.path, a);
        }
        return box;
      };
      const side = h('aside', { class: 'sidebar', 'aria-label': 'Sidebar' }, h('a', { class: 'logo', href: '#/' }, h('span', { class: 'logo-mark' }, 'P'), appName), buildNav(null),
        h('div', { style: 'margin-top:auto;padding-top:16px' }, storeLink ? h('a', { class: 'nav-item', href: storeLink.href, target: '_blank', rel: 'noopener' }, icon('external'), storeLink.label) : null));
      const outlet = h('main', { id: 'main', class: 'app-main', tabindex: -1 });
      const notifBadge = h('span', { class: 'badge-dot', hidden: true });
      const topbar = h('header', { class: 'topbar glass' },
        h('button', { class: 'btn btn-ghost btn-icon menu-btn', type: 'button', 'aria-label': 'Open menu', onclick: () => {
          let layer;
          const wrap = h('div', { class: 'sidebar in-drawer' }, buildNav(() => layer.close()));
          layer = PM.drawer({ title: appName, side: 'left', content: wrap });
        } }, icon('menu')),
        h('div', { class: 'grow' }),
        PM.theme.toggleButton(),
        h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Notifications', onclick: () => PM.dash.notifications(notifBadge) }, icon('bell'), notifBadge),
        h('button', { class: 'btn btn-ghost', type: 'button', 'aria-haspopup': 'menu', onclick: (e) => PM.popover(e.currentTarget, [
          h('div', { style: 'padding:8px 12px' }, h('strong', null, user.name), h('div', { class: 'xs muted' }, user.email)), h('hr', { style: 'margin:4px 0' }),
          h('a', { class: 'menu-item', href: '/' }, icon('store'), 'Visit the shop'), h('button', { class: 'menu-item', type: 'button', onclick: onLogout }, icon('logout'), 'Log out')]) },
        h('span', { class: 'avatar', style: 'width:30px;height:30px' }, fmt.initials(user.name)), h('span', { class: 'small bold', style: 'max-width:140px', title: user.name }, user.name.split(' ')[0]), icon('chevron-down')));
      api('/notifications?limit=1').then((d) => { notifBadge.textContent = d.unread; notifBadge.hidden = !d.unread; }).catch(() => {});
      return {
        el: h('div', { class: 'app' }, side, h('div', { style: 'min-width:0' }, topbar, outlet)),
        outlet,
        setActive(path) {
          const best = [...links.keys()].filter((p) => p === path || (p !== '/' && path.startsWith(p + '/'))).sort((a, b) => b.length - a.length)[0];
          for (const [p, a] of links) a.setAttribute('aria-current', p === best ? 'page' : 'false');
          document.querySelectorAll('[data-badge]').forEach((b) => b.removeAttribute('data-x'));
        },
        setBadge(key, n) { document.querySelectorAll(`[data-badge="${key}"]`).forEach((b) => { b.textContent = n; b.hidden = !n; }); },
      };
    },

    notifications(badge) {
      const body = h('div', null, h('div', { class: 'spinner' }));
      const layer = PM.drawer({ title: 'Notifications', content: body, footer: h('button', { class: 'btn btn-block', type: 'button', onclick: async () => { await api('/notifications/read', { method: 'POST', body: { all: true } }); if (badge) badge.hidden = true; load(); } }, 'Mark all as read') });
      async function load() {
        try {
          const d = await api('/notifications?limit=25');
          body.replaceChildren(d.notifications.length ? h('div', { class: 'stack-sm' }, d.notifications.map((n) => h('a', { class: 'menu-item', href: n.link || '#', style: `align-items:flex-start;${n.read ? '' : 'background:var(--brand-soft)'}`, onclick: () => { api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(() => {}); layer.close(); } },
            h('span', { class: 'grow' }, h('strong', { class: 'small' }, n.title), n.body ? h('div', { class: 'small text-2' }, n.body) : null, h('div', { class: 'xs muted' }, fmt.ago(n.createdAt)))))) : PM.empty({ icon: 'bell', title: 'All caught up' }));
        } catch (e) { body.replaceChildren(PM.errorState(e, load)); }
      }
      load();
    },

    title(title, subtitle, ...actions) {
      return h('div', { class: 'page-title' }, h('div', null, h('h1', null, title), subtitle ? h('p', null, subtitle) : null), actions.length ? h('div', { class: 'row' }, actions) : null);
    },

    // a card with a heading, used everywhere for dashboard panels
    panel(title, body, { actions, flush } = {}) {
      return h('section', { class: 'card ' + (flush ? '' : 'card-pad') }, title ? h('div', { class: 'row between', style: flush ? 'padding:16px 20px 0' : 'margin-bottom:12px' }, h('h3', { style: 'margin:0' }, title), actions || null) : null, body);
    },

    // <select> for choosing a period in days
    periodSelect(options, value, onChange) {
      return PM.select(options.map(([v, l]) => ({ value: v, label: l })), value, { 'aria-label': 'Time period', style: 'width:auto', onchange: (e) => onChange(Number(e.target.value)) });
    },

    searchBox(onInput, placeholder = 'Search…') {
      const input = PM.input({ type: 'search', placeholder, 'aria-label': placeholder });
      input.addEventListener('input', PM.debounce(() => onInput(input.value.trim()), 300));
      return h('div', { class: 'input-icon search' }, icon('search'), input);
    },

    // Re-fetches into `target` and shows loading / error states.
    async load(target, fn) {
      target.replaceChildren(h('div', { class: 'spinner' }));
      try { target.replaceChildren(await fn()); } catch (e) { target.replaceChildren(PM.errorState(e, () => PM.dash.load(target, fn))); }
    },

    money: (n) => fmt.price(n),
  };
})();
