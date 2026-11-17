'use strict';
// Starts the storefront once every page module has registered its routes.
window.Shop.boot().catch((err) => {
  console.error(err);
  document.getElementById('app').replaceChildren(PM.errorState(err, () => location.reload()));
});
