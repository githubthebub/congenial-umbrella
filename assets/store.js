/* store.js — local persistence, plan state, tiny helpers.
   Nothing here talks to a network. That is the point. */
(function (w) {
  'use strict';

  var NS = 'hookline.';
  var LIMITS = { freeSlides: 8, freeTemplates: ['bold', 'clean', 'punch'] };

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function remove(key) {
    try { localStorage.removeItem(NS + key); } catch (e) {}
  }

  /* ── plan ─────────────────────────────────────────────
     A real deployment replaces isPro() with a check against
     your billing provider. See README → "Wiring up billing". */
  var proUntil = read('proUntil', 0);

  function isPro() {
    return proUntil > Date.now();
  }

  function startProPreview(days) {
    proUntil = Date.now() + (days || 7) * 864e5;
    write('proUntil', proUntil);
  }

  function endPro() {
    proUntil = 0;
    write('proUntil', 0);
  }

  /* ── toast ──────────────────────────────────────────── */
  var toastTimer = null;
  function toast(msg) {
    var el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 2600);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  w.Store = {
    read: read, write: write, remove: remove,
    isPro: isPro, startProPreview: startProPreview, endPro: endPro,
    proExpiry: function () { return proUntil; },
    LIMITS: LIMITS,
    toast: toast, debounce: debounce, fileToDataUrl: fileToDataUrl
  };
})(window);
