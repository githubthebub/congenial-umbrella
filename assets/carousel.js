/* carousel.js — slide model, canvas templates, PDF/PNG export.

   Slides are drawn straight onto a 1080-wide canvas rather than
   screenshotted from the DOM: it keeps the type crisp, makes the
   PDF and the PNGs come from one code path, and means a template
   is just a function. */
(function (w) {
  'use strict';

  var RATIOS = { '4:5': [1080, 1350], '1:1': [1080, 1080] };

  /* System stacks only. A webfont would mean a network request, and the
     whole promise of this thing is that nothing leaves the browser. */
  var FONTS = {
    sans:  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    serif: 'Georgia, "Iowan Old Style", "Times New Roman", Times, serif',
    mono:  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
  };

  /* ── text helpers ─────────────────────────────────── */

  function wrapLines(ctx, text, maxW) {
    var out = [];
    (text || '').split('\n').forEach(function (para) {
      if (!para.trim()) { out.push(''); return; }
      var line = '';
      para.split(/\s+/).forEach(function (word) {
        var attempt = line ? line + ' ' + word : word;
        if (ctx.measureText(attempt).width > maxW && line) {
          out.push(line);
          line = word;
        } else {
          line = attempt;
        }
      });
      if (line) out.push(line);
    });
    return out;
  }

  /* Shrink until the block fits its box. Better than truncating —
     the writer keeps their words, the slide keeps its margins. */
  function fitBlock(ctx, text, opts) {
    var size = opts.max;
    var lines, lh;
    while (size >= opts.min) {
      ctx.font = opts.weight + ' ' + size + 'px ' + opts.family;
      lh = size * (opts.lineHeight || 1.25);
      lines = wrapLines(ctx, text, opts.maxW);
      if (lines.length * lh <= opts.maxH) break;
      size -= 2;
    }
    return { size: size, lines: lines || [], lineHeight: lh || size * 1.25 };
  }

  function drawBlock(ctx, block, x, y, opts) {
    ctx.font = (opts.weight || '400') + ' ' + block.size + 'px ' + opts.family;
    ctx.fillStyle = opts.color;
    ctx.textBaseline = 'alphabetic';
    block.lines.forEach(function (line, i) {
      var lx = x;
      if (opts.align === 'center') { ctx.textAlign = 'center'; }
      else if (opts.align === 'right') { ctx.textAlign = 'right'; }
      else { ctx.textAlign = 'left'; }
      ctx.fillText(line, lx, y + block.size + i * block.lineHeight);
    });
    ctx.textAlign = 'left';
    return y + block.lines.length * block.lineHeight;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function luminance(hex) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join('');
    var rgb = [0, 2, 4].map(function (i) {
      var v = parseInt(c.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function inkOn(bg) { return luminance(bg) > 0.45 ? '#101418' : '#FFFFFF'; }

  function mix(hex, target, amount) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join('');
    var t = target.replace('#', '');
    if (t.length === 3) t = t.split('').map(function (x) { return x + x; }).join('');
    var out = '#';
    for (var i = 0; i < 6; i += 2) {
      var a = parseInt(c.substr(i, 2), 16), b = parseInt(t.substr(i, 2), 16);
      var v = Math.round(a + (b - a) * amount);
      out += ('0' + v.toString(16)).slice(-2);
    }
    return out;
  }

  /* ── shared furniture ─────────────────────────────── */

  function drawFooter(ctx, S, color, accent) {
    var pad = S.W * 0.075;
    ctx.font = '600 ' + Math.round(S.W * 0.026) + 'px ' + S.font;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    if (S.brand.handle) ctx.fillText(S.brand.handle, pad, S.H - pad * 0.62);
    ctx.textAlign = 'right';
    ctx.fillText((S.index + 1) + ' / ' + S.total, S.W - pad, S.H - pad * 0.62);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    if (S.watermark && S.index === S.total - 1) {
      ctx.font = '600 ' + Math.round(S.W * 0.023) + 'px ' + S.font;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.85;
      ctx.textAlign = 'center';
      ctx.fillText('made with Hookline', S.W / 2, S.H - pad * 0.62);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  function drawSwipe(ctx, S, color) {
    if (S.index >= S.total - 1) return;
    var pad = S.W * 0.075;
    ctx.font = '700 ' + Math.round(S.W * 0.03) + 'px ' + S.font;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.textAlign = 'right';
    ctx.fillText('swipe →', S.W - pad, S.H - pad * 1.55);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  function drawLogo(ctx, S, x, y, size, round) {
    if (!S.logoImg) return false;
    ctx.save();
    if (round) {
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    var img = S.logoImg;
    var scale = Math.max(size / img.width, size / img.height);
    var dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
    ctx.restore();
    return true;
  }

  /* ── templates ────────────────────────────────────── */

  var TEMPLATES = [
    {
      id: 'bold', name: 'Bold', pro: false,
      base: { bg: '#0B0E14', fg: '#FFFFFF', font: 'sans' },
      draw: function (ctx, S) {
        var pad = S.W * 0.09, inner = S.W - pad * 2;
        ctx.fillStyle = S.bg; ctx.fillRect(0, 0, S.W, S.H);
        ctx.fillStyle = S.accent;
        ctx.fillRect(pad, pad, S.W * 0.11, S.W * 0.014);

        var y = pad + S.W * 0.11;
        var isCover = S.slide.kind === 'cover';
        if (S.slide.title) {
          var t = fitBlock(ctx, S.slide.title, {
            max: isCover ? Math.round(S.W * 0.105) : Math.round(S.W * 0.082),
            min: 34, weight: '800', family: S.font, maxW: inner,
            maxH: S.H * (S.slide.body ? 0.42 : 0.62), lineHeight: 1.12
          });
          if (!S.slide.body) y = Math.max(y, S.H - pad * 2.3 - t.lines.length * t.lineHeight);
          y = drawBlock(ctx, t, pad, y, { weight: '800', family: S.font, color: S.fg }) + S.W * 0.045;
        }
        if (S.slide.body) {
          var b = fitBlock(ctx, S.slide.body, {
            max: Math.round(S.W * 0.045), min: 24, weight: '400', family: S.font,
            maxW: inner, maxH: S.H - y - pad * 2, lineHeight: 1.45
          });
          drawBlock(ctx, b, pad, y, { weight: '400', family: S.font, color: mix(S.fg, S.bg, 0.32) });
        }
        drawSwipe(ctx, S, S.accent);
        drawFooter(ctx, S, S.fg, S.accent);
      }
    },
    {
      id: 'clean', name: 'Clean', pro: false,
      base: { bg: '#FFFFFF', fg: '#12161C', font: 'sans' },
      draw: function (ctx, S) {
        var pad = S.W * 0.095, inner = S.W - pad * 2;
        ctx.fillStyle = S.bg; ctx.fillRect(0, 0, S.W, S.H);

        var y = pad * 1.1;
        if (S.slide.title) {
          var t = fitBlock(ctx, S.slide.title, {
            max: Math.round(S.W * (S.slide.kind === 'cover' ? 0.095 : 0.072)),
            min: 32, weight: '700', family: S.font, maxW: inner,
            maxH: S.H * (S.slide.body ? 0.38 : 0.6), lineHeight: 1.16
          });
          y = drawBlock(ctx, t, pad, y, { weight: '700', family: S.font, color: S.fg });
          ctx.fillStyle = S.accent;
          ctx.fillRect(pad, y + S.W * 0.035, S.W * 0.075, 5);
          y += S.W * 0.085;
        }
        if (S.slide.body) {
          var b = fitBlock(ctx, S.slide.body, {
            max: Math.round(S.W * 0.043), min: 22, weight: '400', family: S.font,
            maxW: inner, maxH: S.H - y - pad * 2, lineHeight: 1.5
          });
          drawBlock(ctx, b, pad, y, { weight: '400', family: S.font, color: mix(S.fg, S.bg, 0.3) });
        }
        /* page dots instead of numerals */
        var dots = Math.min(S.total, 12), dw = S.W * 0.017, gap = dw * 1.9;
        var startX = pad, dy = S.H - pad * 0.8;
        for (var i = 0; i < dots; i++) {
          ctx.beginPath();
          ctx.arc(startX + i * gap, dy, dw / 2, 0, Math.PI * 2);
          ctx.fillStyle = i === S.index ? S.accent : mix(S.fg, S.bg, 0.78);
          ctx.fill();
        }
        if (S.brand.handle) {
          ctx.font = '600 ' + Math.round(S.W * 0.025) + 'px ' + S.font;
          ctx.fillStyle = mix(S.fg, S.bg, 0.45);
          ctx.textAlign = 'right';
          ctx.fillText(S.brand.handle, S.W - pad, dy + S.W * 0.008);
          ctx.textAlign = 'left';
        }
        if (S.watermark && S.index === S.total - 1) {
          ctx.font = '600 ' + Math.round(S.W * 0.022) + 'px ' + S.font;
          ctx.fillStyle = mix(S.fg, S.bg, 0.6);
          ctx.textAlign = 'center';
          ctx.fillText('made with Hookline', S.W / 2, dy + S.W * 0.008);
          ctx.textAlign = 'left';
        }
      }
    },
    {
      id: 'punch', name: 'Punch', pro: false,
      base: { bg: '#3B5BFF', fg: '#FFFFFF', font: 'sans' },
      draw: function (ctx, S) {
        var bg = S.brandOverride ? S.bg : S.accent;
        var fg = inkOn(bg);
        var pad = S.W * 0.09, inner = S.W - pad * 2;
        ctx.fillStyle = bg; ctx.fillRect(0, 0, S.W, S.H);

        /* ghosted index numeral */
        ctx.font = '800 ' + Math.round(S.W * 0.62) + 'px ' + S.font;
        ctx.fillStyle = fg;
        ctx.globalAlpha = 0.1;
        ctx.textAlign = 'right';
        ctx.fillText(String(S.index + 1), S.W + S.W * 0.04, S.H - S.H * 0.02);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;

        var y = pad * 1.2;
        if (S.slide.title) {
          var t = fitBlock(ctx, S.slide.title, {
            max: Math.round(S.W * 0.1), min: 34, weight: '800', family: S.font,
            maxW: inner, maxH: S.H * (S.slide.body ? 0.44 : 0.66), lineHeight: 1.1
          });
          if (!S.slide.body) y = Math.max(y, S.H - pad * 2.5 - t.lines.length * t.lineHeight);
          y = drawBlock(ctx, t, pad, y, { weight: '800', family: S.font, color: fg }) + S.W * 0.05;
        }
        if (S.slide.body) {
          var b = fitBlock(ctx, S.slide.body, {
            max: Math.round(S.W * 0.046), min: 24, weight: '500', family: S.font,
            maxW: inner, maxH: S.H - y - pad * 2.2, lineHeight: 1.42
          });
          drawBlock(ctx, b, pad, y, { weight: '500', family: S.font, color: fg });
        }
        drawSwipe(ctx, S, fg);
        drawFooter(ctx, S, fg, fg);
      }
    },
    {
      id: 'editorial', name: 'Editorial', pro: true,
      base: { bg: '#F6F1E7', fg: '#1A1712', font: 'serif' },
      draw: function (ctx, S) {
        var pad = S.W * 0.1, inner = S.W - pad * 2;
        ctx.fillStyle = S.bg; ctx.fillRect(0, 0, S.W, S.H);
        ctx.strokeStyle = mix(S.fg, S.bg, 0.75);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(S.W - pad, pad); ctx.stroke();

        ctx.font = '600 ' + Math.round(S.W * 0.024) + 'px ' + S.sans;
        ctx.fillStyle = S.accent;
        ctx.fillText(String(S.index + 1).padStart(2, '0'), pad, pad + S.W * 0.055);

        var y = pad + S.W * 0.1;
        if (S.slide.title) {
          var t = fitBlock(ctx, S.slide.title, {
            max: Math.round(S.W * 0.098), min: 34, weight: '700', family: S.font,
            maxW: inner, maxH: S.H * (S.slide.body ? 0.4 : 0.6), lineHeight: 1.1
          });
          y = drawBlock(ctx, t, pad, y, { weight: '700', family: S.font, color: S.fg }) + S.W * 0.05;
        }
        if (S.slide.body) {
          var b = fitBlock(ctx, S.slide.body, {
            max: Math.round(S.W * 0.042), min: 22, weight: '400', family: S.sans,
            maxW: inner, maxH: S.H - y - pad * 2, lineHeight: 1.55
          });
          drawBlock(ctx, b, pad, y, { weight: '400', family: S.sans, color: mix(S.fg, S.bg, 0.25) });
        }
        ctx.beginPath(); ctx.moveTo(pad, S.H - pad); ctx.lineTo(S.W - pad, S.H - pad); ctx.stroke();
        drawFooter(ctx, S, S.fg, S.accent);
      }
    },
    {
      id: 'mono', name: 'Terminal', pro: true,
      base: { bg: '#0D1117', fg: '#E6EDF3', font: 'mono' },
      draw: function (ctx, S) {
        var pad = S.W * 0.08, inner = S.W - pad * 2;
        ctx.fillStyle = S.bg; ctx.fillRect(0, 0, S.W, S.H);
        /* window chrome */
        ctx.fillStyle = mix(S.bg, '#FFFFFF', 0.08);
        ctx.fillRect(0, 0, S.W, S.H * 0.055);
        ['#FF5F57', '#FEBC2E', '#28C840'].forEach(function (c, i) {
          ctx.beginPath();
          ctx.arc(pad * 0.6 + i * S.W * 0.032, S.H * 0.0275, S.W * 0.011, 0, Math.PI * 2);
          ctx.fillStyle = c; ctx.fill();
        });

        var y = S.H * 0.055 + pad;
        if (S.slide.title) {
          ctx.font = '700 ' + Math.round(S.W * 0.036) + 'px ' + S.font;
          ctx.fillStyle = S.accent;
          ctx.fillText('$ ' + String(S.index + 1).padStart(2, '0'), pad, y);
          y += S.W * 0.06;
          var t = fitBlock(ctx, S.slide.title, {
            max: Math.round(S.W * 0.072), min: 28, weight: '700', family: S.font,
            maxW: inner, maxH: S.H * (S.slide.body ? 0.34 : 0.55), lineHeight: 1.22
          });
          y = drawBlock(ctx, t, pad, y, { weight: '700', family: S.font, color: S.fg }) + S.W * 0.05;
        }
        if (S.slide.body) {
          var b = fitBlock(ctx, S.slide.body, {
            max: Math.round(S.W * 0.036), min: 20, weight: '400', family: S.font,
            maxW: inner, maxH: S.H - y - pad * 2, lineHeight: 1.6
          });
          drawBlock(ctx, b, pad, y, { weight: '400', family: S.font, color: mix(S.fg, S.bg, 0.3) });
        }
        drawFooter(ctx, S, S.accent, S.accent);
      }
    },
    {
      id: 'split', name: 'Split', pro: true,
      base: { bg: '#FFFFFF', fg: '#12161C', font: 'sans' },
      draw: function (ctx, S) {
        var pad = S.W * 0.085, inner = S.W - pad * 2;
        var topH = S.H * 0.44;
        ctx.fillStyle = S.bg; ctx.fillRect(0, 0, S.W, S.H);
        ctx.fillStyle = S.accent; ctx.fillRect(0, 0, S.W, topH);
        var topInk = inkOn(S.accent);

        if (S.slide.title) {
          var t = fitBlock(ctx, S.slide.title, {
            max: Math.round(S.W * 0.085), min: 30, weight: '800', family: S.font,
            maxW: inner, maxH: topH - pad * 2.2, lineHeight: 1.12
          });
          var ty = topH - pad * 0.9 - t.lines.length * t.lineHeight;
          drawBlock(ctx, t, pad, Math.max(pad, ty), { weight: '800', family: S.font, color: topInk });
        }
        if (S.slide.body) {
          var y = topH + pad;
          var b = fitBlock(ctx, S.slide.body, {
            max: Math.round(S.W * 0.044), min: 22, weight: '400', family: S.font,
            maxW: inner, maxH: S.H - y - pad * 2, lineHeight: 1.5
          });
          drawBlock(ctx, b, pad, y, { weight: '400', family: S.font, color: mix(S.fg, S.bg, 0.25) });
        }
        drawFooter(ctx, S, S.fg, S.accent);
      }
    },
    {
      id: 'card', name: 'Card', pro: true,
      base: { bg: '#EEF1F6', fg: '#12161C', font: 'sans' },
      draw: function (ctx, S) {
        var m = S.W * 0.055, pad = S.W * 0.085, inner = S.W - (m + pad) * 2;
        ctx.fillStyle = S.bg; ctx.fillRect(0, 0, S.W, S.H);
        ctx.save();
        ctx.shadowColor = 'rgba(10,16,28,.16)';
        ctx.shadowBlur = S.W * 0.05;
        ctx.shadowOffsetY = S.W * 0.014;
        ctx.fillStyle = '#FFFFFF';
        roundRect(ctx, m, m, S.W - m * 2, S.H - m * 2, S.W * 0.035);
        ctx.fill();
        ctx.restore();

        var y = m + pad;
        if (drawLogo(ctx, S, m + pad, y, S.W * 0.09, true)) y += S.W * 0.125;

        if (S.slide.title) {
          var t = fitBlock(ctx, S.slide.title, {
            max: Math.round(S.W * 0.082), min: 30, weight: '750', family: S.font,
            maxW: inner, maxH: S.H * (S.slide.body ? 0.34 : 0.5), lineHeight: 1.14
          });
          y = drawBlock(ctx, t, m + pad, y, { weight: '750', family: S.font, color: '#12161C' }) + S.W * 0.04;
        }
        if (S.slide.body) {
          var b = fitBlock(ctx, S.slide.body, {
            max: Math.round(S.W * 0.042), min: 21, weight: '400', family: S.font,
            maxW: inner, maxH: S.H - y - m - pad * 2, lineHeight: 1.5
          });
          drawBlock(ctx, b, m + pad, y, { weight: '400', family: S.font, color: '#4A5568' });
        }
        var fy = S.H - m - pad * 0.55;
        ctx.font = '600 ' + Math.round(S.W * 0.024) + 'px ' + S.font;
        ctx.fillStyle = '#8B95A5';
        if (S.brand.handle) ctx.fillText(S.brand.handle, m + pad, fy);
        ctx.textAlign = 'right';
        ctx.fillStyle = S.accent;
        ctx.fillText((S.index + 1) + '/' + S.total, S.W - m - pad, fy);
        ctx.textAlign = 'left';
      }
    },
    {
      id: 'glow', name: 'Glow', pro: true,
      base: { bg: '#08090F', fg: '#FFFFFF', font: 'sans' },
      draw: function (ctx, S) {
        var pad = S.W * 0.09, inner = S.W - pad * 2;
        ctx.fillStyle = S.bg; ctx.fillRect(0, 0, S.W, S.H);
        var g = ctx.createRadialGradient(S.W * 0.15, S.H * 0.1, 0, S.W * 0.15, S.H * 0.1, S.W * 1.1);
        g.addColorStop(0, mix(S.bg, S.accent, 0.55));
        g.addColorStop(0.45, mix(S.bg, S.accent, 0.12));
        g.addColorStop(1, S.bg);
        ctx.fillStyle = g; ctx.fillRect(0, 0, S.W, S.H);

        var y = S.H * 0.2;
        if (S.slide.title) {
          var t = fitBlock(ctx, S.slide.title, {
            max: Math.round(S.W * 0.1), min: 32, weight: '800', family: S.font,
            maxW: inner, maxH: S.H * (S.slide.body ? 0.4 : 0.55), lineHeight: 1.1
          });
          if (!S.slide.body) y = Math.max(y, S.H - pad * 2.5 - t.lines.length * t.lineHeight);
          y = drawBlock(ctx, t, pad, y, { weight: '800', family: S.font, color: S.fg }) + S.W * 0.05;
        }
        if (S.slide.body) {
          var b = fitBlock(ctx, S.slide.body, {
            max: Math.round(S.W * 0.044), min: 22, weight: '400', family: S.font,
            maxW: inner, maxH: S.H - y - pad * 2.2, lineHeight: 1.48
          });
          drawBlock(ctx, b, pad, y, { weight: '400', family: S.font, color: 'rgba(255,255,255,.72)' });
        }
        drawSwipe(ctx, S, S.fg);
        drawFooter(ctx, S, S.fg, S.accent);
      }
    }
  ];

  function templateById(id) {
    return TEMPLATES.filter(function (t) { return t.id === id; })[0] || TEMPLATES[0];
  }

  /* ── render ───────────────────────────────────────── */

  function render(canvas, slide, index, total, cfg) {
    var tpl = templateById(cfg.templateId);
    var dims = RATIOS[cfg.ratio] || RATIOS['4:5'];
    var W = dims[0], H = dims[1];
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    var brand = cfg.brand || {};
    var pro = cfg.pro;
    var override = pro && brand.custom;

    var S = {
      W: W, H: H, slide: slide, index: index, total: total,
      bg: override && brand.bg ? brand.bg : tpl.base.bg,
      fg: override && brand.fg ? brand.fg : tpl.base.fg,
      accent: brand.accent || '#3B5BFF',
      font: FONTS[(override && brand.font ? brand.font : tpl.base.font)] || FONTS.sans,
      sans: FONTS.sans,
      brand: { handle: pro ? (brand.handle || '') : '' },
      logoImg: pro ? cfg.logoImg : null,
      brandOverride: override,
      watermark: !pro
    };
    tpl.draw(ctx, S);
    return canvas;
  }

  /* ── auto-split a post into slides ────────────────── */

  function fromPost(text) {
    var clean = (w.Composer ? w.Composer.stripStyles(text) : text).trim();
    if (!clean) return [];

    var blocks;
    if (/^\s*---\s*$/m.test(clean)) {
      blocks = clean.split(/^\s*---\s*$/m);
    } else {
      blocks = clean.split(/\n\s*\n/);
    }
    blocks = blocks.map(function (b) { return b.trim(); }).filter(Boolean);

    /* merge runt blocks so no slide carries three words */
    var merged = [];
    blocks.forEach(function (b) {
      var last = merged[merged.length - 1];
      if (last && (last.length + b.length) < 230 && merged.length > 1) {
        merged[merged.length - 1] = last + '\n' + b;
      } else {
        merged.push(b);
      }
    });

    var slides = merged.map(function (b, i) {
      var lines = b.split('\n');
      var head = lines[0].replace(/^[•→✓↳\-\d.)\s]+/, '').trim();
      var rest = lines.slice(1).join('\n').trim();
      if (!rest && head.length > 120) {
        /* one long paragraph: lead with its first sentence */
        var m = head.match(/^(.{20,110}?[.!?])\s+(.+)$/s);
        if (m) { head = m[1]; rest = m[2]; }
        else { rest = head; head = ''; }
      }
      return {
        kind: i === 0 ? 'cover' : 'point',
        title: head.slice(0, 140),
        body: rest.slice(0, 400)
      };
    });

    slides.push({
      kind: 'outro',
      title: 'Found this useful?',
      body: 'Repost it for someone who needs it, and follow for more.'
    });
    return slides;
  }

  /* ── export ───────────────────────────────────────── */

  function exportPdf(slides, cfg, filename) {
    /* Each slide gets its own canvas: MiniPDF reads them after the loop,
       so they cannot share one scratch element. */
    var canvases = slides.map(function (s, i) {
      return render(document.createElement('canvas'), s, i, slides.length, cfg);
    });
    var blob = w.MiniPDF.fromCanvases(canvases, 0.94);
    w.MiniPDF.save(blob, filename || 'carousel.pdf');
    return blob.size;
  }

  function exportPngs(slides, cfg) {
    var i = 0;
    function next() {
      if (i >= slides.length) return;
      var off = document.createElement('canvas');
      render(off, slides[i], i, slides.length, cfg);
      var a = document.createElement('a');
      a.href = off.toDataURL('image/png');
      a.download = 'slide-' + String(i + 1).padStart(2, '0') + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      i++;
      setTimeout(next, 320);
    }
    next();
  }

  w.Carousel = {
    TEMPLATES: TEMPLATES,
    RATIOS: RATIOS,
    templateById: templateById,
    render: render,
    fromPost: fromPost,
    exportPdf: exportPdf,
    exportPngs: exportPngs
  };
})(window);
