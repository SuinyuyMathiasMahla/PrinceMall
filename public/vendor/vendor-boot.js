'use strict';
window.V.boot();
// While logged out, hash changes (login <-> register) re-run boot to swap screens.
window.addEventListener('hashchange', () => { if (!window.V.info) window.V.boot(); });
