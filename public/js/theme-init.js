'use strict';
// Runs in <head> before first paint so there is no light/dark flash.
(function () {
  var theme = null;
  try { theme = localStorage.getItem('pm-theme'); } catch (e) { /* storage can be blocked */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
