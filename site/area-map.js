// The service-area map, loaded after the page so it follows the site's colors (light, dark, or the theme switch).
(function () {
  var f = document.getElementById('areaMap'); if (!f || !window.fetch) return;
  fetch('/area-map.svg').then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) { if (t.indexOf('<svg') === 0) f.innerHTML = t; }).catch(function () {});
})();
