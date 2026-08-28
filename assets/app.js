/* app.js — wiring. */
(function (w, d) {
  'use strict';

  var $ = function (sel, root) { return (root || d).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); };

  var SAMPLE = [
    'I turned down a client last week for the first time in four years.',
    '',
    'The budget was fine. The work was interesting. The founder was smart.',
    '',
    'But three separate people had told me the same thing about how he treats his team, and I kept finding reasons to ignore it.',
    '',
    'So here is the filter I use now, and it has saved me twice already:',
    '',
    '1. Ask who left in the last year, and why.',
    '2. Ask to speak to whoever will actually do the work.',
    '3. Notice how they talk about the last agency.',
    '',
    'None of that shows up in a proposal. All of it shows up in month three.',
    '',
    'What is your version of this test?',
    '',
    '#consulting #freelancing #clientwork'
  ].join('\n');

  /* ── state ─────────────────────────────────────────── */

  var state = {
    device: 'mobile',
    ratio: Store.read('ratio', '4:5'),
    templateId: Store.read('templateId', 'bold'),
    slides: Store.read('slides', null),
    sel: 0,
    brand: Store.read('brand', { accent: '#3B5BFF', bg: '#0B0E14', fg: '#FFFFFF', font: 'sans', handle: '', logo: '', custom: false }),
    profile: Store.read('profile', { name: 'Your Name', headline: 'Your headline goes here', avatar: '' })
  };
  var logoImg = null, avatarReady = false;

  /* ── plan gating ───────────────────────────────────── */

  function refreshPlan() {
    var pro = Store.isPro();
    $('#planBadge').textContent = pro ? 'Pro' : 'Free';
    $('#planBadge').className = 'badge ' + (pro ? 'badge-pro' : 'badge-free');
    $('#openUpgrade').textContent = pro ? 'Manage plan' : 'Upgrade to Pro';
    $('#proBanner').hidden = !pro;
    $$('[data-pro-feature]').forEach(function (el) { el.classList.toggle('is-locked', !pro); });
    buildTemplates();
    paintStage();
  }

  /* Show the pricing once, then get out of the way — a modal that
     reopens on every blocked click stops reading as an offer. */
  var lastGate = 0;
  function gate(what) {
    if (Store.isPro()) return true;
    var now = Date.now();
    if (now - lastGate > 30000) { openUpgrade(); lastGate = now; }
    if (what) Store.toast(what + ' is a Pro feature');
    return false;
  }

  function openUpgrade() { $('#upgrade').hidden = false; }
  function closeUpgrade() { $('#upgrade').hidden = true; }

  /* ── tabs ──────────────────────────────────────────── */

  $$('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('.tab').forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      $$('.view').forEach(function (v) { v.classList.remove('is-active'); });
      $('#view-' + tab.dataset.view).classList.add('is-active');
      if (tab.dataset.view === 'carousel') { buildTemplates(); paintStage(); }
    });
  });

  /* ── composer ──────────────────────────────────────── */

  var editor = $('#editor');
  editor.value = Store.read('draft', SAMPLE);

  function renderScore() {
    var text = editor.value;
    var a = Composer.analyse(text, state.device);

    $('#charCount').textContent = a.chars + ' / ' + Composer.MAX_CHARS;
    $('#charCount').style.color = a.chars > Composer.MAX_CHARS ? 'var(--bad)' : '';

    var ring = $('#ring');
    ring.style.setProperty('--pct', a.score);
    ring.style.setProperty('--hue', a.score >= 75 ? 'var(--ok)' : a.score >= 55 ? 'var(--warn)' : 'var(--bad)');
    $('#scoreNum').textContent = a.chars ? a.score : '—';
    $('#scoreGrade').textContent = Composer.gradeFor(a.score, a.chars);

    var bad = a.checks.filter(function (c) { return c.status !== 'ok'; }).length;
    $('#scoreBlurb').textContent = a.chars
      ? (bad ? bad + ' of 10 checks want attention' : 'All ten checks clean.')
      : 'Ten checks run as you type. Nothing leaves your browser.';

    var order = { bad: 0, warn: 1, ok: 2 };
    var sorted = a.checks.slice().sort(function (x, y) { return order[x.status] - order[y.status]; });
    $('#checks').innerHTML = sorted.map(function (c) {
      var icon = c.status === 'ok' ? '✓' : c.status === 'warn' ? '!' : '×';
      return '<li class="' + c.status + '"><span class="chk-icon">' + icon + '</span>' +
        '<span class="chk-body"><strong>' + esc(c.title) + '</strong><span>' + esc(c.fix) + '</span></span></li>';
    }).join('');

    /* hook lab */
    $('#hookLine').textContent = a.firstLine || '—';
    $('#hookVerdict').textContent = !a.firstLine
      ? 'Type something above.'
      : a.firstLine.length + ' characters · ' +
        (a.patterns.length ? a.patterns.join(', ') : 'no hook pattern detected');

    /* preview */
    $('#pvBody').innerHTML = Composer.previewHtml(text, a.cutoff);
    Store.write('draft', text);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  editor.addEventListener('input', Store.debounce(renderScore, 180));

  $$('.tbtn[data-fmt]').forEach(function (b) {
    b.addEventListener('click', function () { Composer.applyFormat(editor, b.dataset.fmt); });
  });
  $$('.tbtn[data-ins]').forEach(function (b) {
    b.addEventListener('click', function () { Composer.insertAtCursor(editor, b.dataset.ins); });
  });

  $('#copyPost').addEventListener('click', function () {
    navigator.clipboard.writeText(editor.value).then(function () {
      Store.toast('Post copied — paste it straight in');
    }, function () {
      editor.select();
      Store.toast('Press ⌘/Ctrl+C to copy');
    });
  });

  $('#clearDraft').addEventListener('click', function () {
    if (!editor.value.trim() || confirm('Clear the draft?')) {
      editor.value = '';
      renderScore();
    }
  });

  $('#pvBody').addEventListener('click', function (e) {
    if (!e.target.classList.contains('seemore')) return;
    var cut = $('#pvBody .cut');
    if (cut) { cut.classList.toggle('hidden'); e.target.hidden = !cut.classList.contains('hidden'); }
  });

  $$('#deviceToggle .seg').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#deviceToggle .seg').forEach(function (x) { x.classList.remove('is-active'); });
      b.classList.add('is-active');
      state.device = b.dataset.device;
      renderScore();
    });
  });

  /* hook variants (Pro) */
  $('.lockwrap').addEventListener('click', function (e) {
    if (!Store.isPro()) { e.preventDefault(); gate('Hook rewrites'); }
  }, true);

  $('#genVariants').addEventListener('click', function () {
    if (!gate('Hook rewrites')) return;
    var a = Composer.analyse(editor.value, state.device);
    var list = Composer.variants(a.firstLine);
    if (!list.length) { Store.toast('Write an opening line first'); return; }
    $('#variants').innerHTML = list.map(function (v, i) {
      return '<li data-i="' + i + '"><b>' + esc(v.name) + '</b>' + esc(v.text) +
        '<em>' + esc(v.why) + '</em></li>';
    }).join('');
    $$('#variants li').forEach(function (li, i) {
      li.addEventListener('click', function () {
        var lines = editor.value.split('\n');
        var idx = lines.findIndex(function (l) { return l.trim().length; });
        if (idx < 0) idx = 0;
        lines[idx] = list[i].text;
        editor.value = lines.join('\n');
        renderScore();
        Store.toast('Hook swapped in');
      });
    });
  });

  /* preview identity */
  function paintProfile() {
    $('#pvName').textContent = state.profile.name || 'Your Name';
    $('#pvHeadline').textContent = state.profile.headline || 'Your headline goes here';
    var av = $('#pvAvatar');
    if (state.profile.avatar) {
      av.style.backgroundImage = 'url(' + state.profile.avatar + ')';
      av.textContent = '';
    } else {
      av.style.backgroundImage = '';
      av.textContent = (state.profile.name || 'YN').split(/\s+/).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase();
    }
    $('#inName').value = state.profile.name === 'Your Name' ? '' : state.profile.name;
    $('#inHeadline').value = state.profile.headline === 'Your headline goes here' ? '' : state.profile.headline;
  }

  ['inName', 'inHeadline'].forEach(function (id) {
    $('#' + id).addEventListener('input', function (e) {
      state.profile[id === 'inName' ? 'name' : 'headline'] = e.target.value;
      Store.write('profile', state.profile);
      $('#pv' + (id === 'inName' ? 'Name' : 'Headline')).textContent =
        e.target.value || (id === 'inName' ? 'Your Name' : 'Your headline goes here');
      if (id === 'inName') paintProfile();
    });
  });

  $('#inAvatar').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    Store.fileToDataUrl(f).then(function (url) {
      state.profile.avatar = url;
      Store.write('profile', state.profile);
      paintProfile();
    });
  });

  /* ── carousel ──────────────────────────────────────── */

  if (!state.slides || !state.slides.length) state.slides = Carousel.fromPost(SAMPLE);

  function cfg() {
    return {
      templateId: state.templateId, ratio: state.ratio, brand: state.brand,
      pro: Store.isPro(), logoImg: logoImg
    };
  }

  function slideCap() { return Store.isPro() ? Infinity : Store.LIMITS.freeSlides; }

  function paintSlideList() {
    var list = $('#slideList');
    list.innerHTML = state.slides.map(function (s, i) {
      var label = s.title || s.body || 'Empty slide';
      return '<li data-i="' + i + '" class="' + (i === state.sel ? 'is-sel' : '') + '">' +
        '<span class="slide-n">' + (i + 1) + '</span>' +
        '<span class="slide-t">' + esc(label.slice(0, 70)) + '</span></li>';
    }).join('');
    $$('#slideList li').forEach(function (li) {
      li.addEventListener('click', function () { select(+li.dataset.i); });
    });
    $('#slideCount').textContent = state.slides.length + ' slide' + (state.slides.length === 1 ? '' : 's');
    $('#slideLimitNote').hidden = Store.isPro() || state.slides.length < Store.LIMITS.freeSlides;
    Store.write('slides', state.slides);
  }

  function select(i) {
    state.sel = Math.max(0, Math.min(i, state.slides.length - 1));
    var s = state.slides[state.sel] || { title: '', body: '' };
    $('#slideTitle').value = s.title || '';
    $('#slideBody').value = s.body || '';
    $('#editingWhich').textContent = 'slide ' + (state.sel + 1) + (s.kind === 'cover' ? ' · cover' : s.kind === 'outro' ? ' · outro' : '');
    paintSlideList();
    paintStage();
  }

  function paintStage() {
    var canvas = $('#stage');
    if (!canvas || !state.slides.length) return;
    Carousel.render(canvas, state.slides[state.sel] || state.slides[0], state.sel, state.slides.length, cfg());
    $('#stageIdx').textContent = (state.sel + 1) + ' of ' + state.slides.length;
  }

  ['slideTitle', 'slideBody'].forEach(function (id) {
    $('#' + id).addEventListener('input', Store.debounce(function (e) {
      var s = state.slides[state.sel];
      if (!s) return;
      s[id === 'slideTitle' ? 'title' : 'body'] = e.target.value;
      paintSlideList();
      paintStage();
    }, 140));
  });

  $('#addSlide').addEventListener('click', function () {
    if (state.slides.length >= slideCap()) { gate('More than ' + Store.LIMITS.freeSlides + ' slides'); return; }
    state.slides.splice(state.sel + 1, 0, { kind: 'point', title: '', body: '' });
    select(state.sel + 1);
  });

  $('#dupSlide').addEventListener('click', function () {
    if (state.slides.length >= slideCap()) { gate('More than ' + Store.LIMITS.freeSlides + ' slides'); return; }
    var s = state.slides[state.sel];
    state.slides.splice(state.sel + 1, 0, { kind: 'point', title: s.title, body: s.body });
    select(state.sel + 1);
  });

  $('#delSlide').addEventListener('click', function () {
    if (state.slides.length <= 1) { Store.toast('A deck needs at least one slide'); return; }
    state.slides.splice(state.sel, 1);
    select(Math.min(state.sel, state.slides.length - 1));
  });

  $('#upSlide').addEventListener('click', function () { move(-1); });
  $('#downSlide').addEventListener('click', function () { move(1); });
  function move(delta) {
    var to = state.sel + delta;
    if (to < 0 || to >= state.slides.length) return;
    var s = state.slides.splice(state.sel, 1)[0];
    state.slides.splice(to, 0, s);
    select(to);
  }

  $('#prevSlide').addEventListener('click', function () { select(state.sel - 1); });
  $('#nextSlide').addEventListener('click', function () { select(state.sel + 1); });

  $('#fromPost').addEventListener('click', function () {
    var slides = Carousel.fromPost(editor.value);
    if (!slides.length) { Store.toast('Write a draft in the Composer first'); return; }
    var cap = slideCap();
    var trimmed = false;
    if (slides.length > cap) {
      var outro = slides[slides.length - 1];
      slides = slides.slice(0, cap - 1).concat([outro]);
      trimmed = true;
    }
    state.slides = slides;
    select(0);
    Store.toast(trimmed
      ? 'Split into ' + slides.length + ' slides (Free caps at ' + cap + ')'
      : 'Split into ' + slides.length + ' slides');
    if (trimmed) $('#slideLimitNote').hidden = false;
  });

  /* templates */
  function buildTemplates() {
    var grid = $('#templateGrid');
    if (!grid) return;
    var pro = Store.isPro();
    grid.innerHTML = Carousel.TEMPLATES.map(function (t) {
      var locked = t.pro && !pro;
      return '<button class="tpl ' + (t.id === state.templateId ? 'is-sel' : '') + (locked ? ' locked' : '') +
        '" data-tpl="' + t.id + '"><canvas></canvas>' +
        (locked ? '<span class="tpl-lock">Pro</span>' : '') +
        '<span class="tpl-name">' + t.name + '</span></button>';
    }).join('');

    var sample = { kind: 'cover', title: 'One idea per slide', body: 'Then a line of support underneath it.' };
    var off = d.createElement('canvas');
    $$('#templateGrid .tpl').forEach(function (btn) {
      var id = btn.dataset.tpl;
      var thumb = $('canvas', btn);
      Carousel.render(off, sample, 0, 5, {
        templateId: id, ratio: state.ratio, brand: state.brand, pro: pro, logoImg: logoImg
      });
      thumb.width = 300;
      thumb.height = Math.round(300 * off.height / off.width);
      thumb.getContext('2d').drawImage(off, 0, 0, thumb.width, thumb.height);

      btn.addEventListener('click', function () {
        var tpl = Carousel.templateById(id);
        if (tpl.pro && !Store.isPro()) { gate(tpl.name + ' template'); return; }
        state.templateId = id;
        Store.write('templateId', id);
        $$('#templateGrid .tpl').forEach(function (x) { x.classList.remove('is-sel'); });
        btn.classList.add('is-sel');
        paintStage();
      });
    });
  }

  $$('#ratioToggle .seg').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#ratioToggle .seg').forEach(function (x) { x.classList.remove('is-active'); });
      b.classList.add('is-active');
      state.ratio = b.dataset.ratio;
      Store.write('ratio', state.ratio);
      buildTemplates();
      paintStage();
    });
  });

  /* brand kit */
  $('.brandkit').addEventListener('click', function (e) {
    if (!Store.isPro()) { e.preventDefault(); gate('The brand kit'); }
  }, true);

  function bindBrand(id, key) {
    var el = $('#' + id);
    el.addEventListener('input', function () {
      state.brand[key] = el.value;
      state.brand.custom = true;
      Store.write('brand', state.brand);
      buildTemplates();
      paintStage();
    });
  }
  bindBrand('bAccent', 'accent');
  bindBrand('bBg', 'bg');
  bindBrand('bFg', 'fg');
  bindBrand('bFont', 'font');
  bindBrand('bHandle', 'handle');

  $('#bLogo').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    Store.fileToDataUrl(f).then(function (url) {
      state.brand.logo = url;
      Store.write('brand', state.brand);
      loadLogo().then(function () { buildTemplates(); paintStage(); });
    });
  });

  $('#resetBrand').addEventListener('click', function () {
    state.brand = { accent: '#3B5BFF', bg: '#0B0E14', fg: '#FFFFFF', font: 'sans', handle: '', logo: '', custom: false };
    Store.write('brand', state.brand);
    logoImg = null;
    paintBrandInputs();
    buildTemplates();
    paintStage();
  });

  function paintBrandInputs() {
    $('#bAccent').value = state.brand.accent || '#3B5BFF';
    $('#bBg').value = state.brand.bg || '#0B0E14';
    $('#bFg').value = state.brand.fg || '#FFFFFF';
    $('#bFont').value = state.brand.font || 'sans';
    $('#bHandle').value = state.brand.handle || '';
  }

  function loadLogo() {
    return new Promise(function (resolve) {
      if (!state.brand.logo) { logoImg = null; return resolve(); }
      var img = new Image();
      img.onload = function () { logoImg = img; resolve(); };
      img.onerror = function () { logoImg = null; resolve(); };
      img.src = state.brand.logo;
    });
  }

  /* export */
  $('#exportPdf').addEventListener('click', function () {
    try {
      Carousel.exportPdf(state.slides, cfg(), 'hookline-carousel.pdf');
      Store.toast('PDF saved — upload it as a document post');
    } catch (err) {
      Store.toast('Export failed: ' + err.message);
    }
  });

  $('#exportPng').addEventListener('click', function () {
    if (!gate('PNG export')) return;
    Carousel.exportPngs(state.slides, cfg());
    Store.toast('Saving ' + state.slides.length + ' PNGs');
  });

  /* ── upgrade ───────────────────────────────────────── */

  $('#openUpgrade').addEventListener('click', openUpgrade);
  $('#closeUpgrade').addEventListener('click', closeUpgrade);
  $('#upgrade').addEventListener('click', function (e) { if (e.target.id === 'upgrade') closeUpgrade(); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeUpgrade(); });

  $('#startPro').addEventListener('click', function () {
    /* Replace this with your checkout. See README → Wiring up billing. */
    Store.startProPreview(7);
    closeUpgrade();
    refreshPlan();
    Store.toast('Pro unlocked for 7 days');
  });

  $('#teamBtn').addEventListener('click', function () {
    Store.toast('Team plans are not wired up in this build');
  });

  $('#exitPro').addEventListener('click', function () {
    Store.endPro();
    refreshPlan();
    Store.toast('Back on Free');
  });

  /* ── boot ──────────────────────────────────────────── */

  function boot() {
    paintProfile();
    paintBrandInputs();
    renderScore();
    select(Math.min(state.sel, state.slides.length - 1));
    refreshPlan();
  }

  loadLogo().then(function () {
    if (d.fonts && d.fonts.ready) {
      d.fonts.ready.then(function () { boot(); paintStage(); buildTemplates(); });
      boot();
    } else {
      boot();
    }
  });
})(window, document);
