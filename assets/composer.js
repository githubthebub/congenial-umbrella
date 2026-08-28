/* composer.js — Unicode text styling, the hook score, the feed preview. */
(function (w) {
  'use strict';

  /* ─────────────────────────────────────────────────────
     1. Unicode styling

     LinkedIn strips rich text, so every "bold" post you have
     ever seen is really Mathematical Alphanumeric Symbols.
     We build forward and reverse maps from the block offsets.
     ───────────────────────────────────────────────────── */

  var STYLES = {
    bold:       { upper: 0x1D5D4, lower: 0x1D5EE, digit: 0x1D7EC },
    italic:     { upper: 0x1D608, lower: 0x1D622, digit: null },
    bolditalic: { upper: 0x1D63C, lower: 0x1D656, digit: null }
  };
  var COMBINING = { strike: '̶', under: '̲' };

  var forward = {}, reverse = {};
  Object.keys(STYLES).forEach(function (name) {
    var s = STYLES[name], map = {};
    for (var i = 0; i < 26; i++) {
      map[String.fromCharCode(65 + i)] = String.fromCodePoint(s.upper + i);
      map[String.fromCharCode(97 + i)] = String.fromCodePoint(s.lower + i);
    }
    if (s.digit) {
      for (var d = 0; d < 10; d++) map[String(d)] = String.fromCodePoint(s.digit + d);
    }
    forward[name] = map;
    Object.keys(map).forEach(function (plain) { reverse[map[plain]] = plain; });
  });

  function toStyle(str, name) {
    var map = forward[name];
    return Array.from(stripStyles(str)).map(function (ch) {
      return map[ch] || ch;
    }).join('');
  }

  function stripStyles(str) {
    var out = '';
    for (var ch of str) {
      if (ch === COMBINING.strike || ch === COMBINING.under) continue;
      out += (reverse[ch] !== undefined ? reverse[ch] : ch);
    }
    return out;
  }

  function toCombining(str, name) {
    var mark = COMBINING[name];
    var stripped = str.split(mark).join('');
    return Array.from(stripped).map(function (ch) {
      return /\s/.test(ch) ? ch : ch + mark;
    }).join('');
  }

  function hasCombining(str, name) {
    return str.indexOf(COMBINING[name]) !== -1;
  }

  function isFullyStyled(str, name) {
    var map = forward[name];
    var letters = Array.from(str).filter(function (ch) { return reverse[ch] !== undefined || /[A-Za-z0-9]/.test(ch); });
    if (!letters.length) return false;
    return letters.every(function (ch) { return Object.values(map).indexOf(ch) !== -1; });
  }

  /* Apply a format to the current textarea selection, toggling if already applied. */
  function applyFormat(ta, kind) {
    var start = ta.selectionStart, end = ta.selectionEnd;
    var value = ta.value;
    var sel = value.slice(start, end);
    if (!sel) { Store.toast('Select some text first'); return; }

    var out;
    if (kind === 'plain') {
      out = stripStyles(sel);
    } else if (COMBINING[kind]) {
      out = hasCombining(sel, kind) ? sel.split(COMBINING[kind]).join('') : toCombining(sel, kind);
    } else {
      out = isFullyStyled(sel, kind) ? stripStyles(sel) : toStyle(sel, kind);
    }

    ta.value = value.slice(0, start) + out + value.slice(end);
    ta.focus();
    ta.setSelectionRange(start, start + out.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertAtCursor(ta, text) {
    var start = ta.selectionStart;
    var value = ta.value;
    /* bullets belong at the start of the line */
    var lineStart = value.lastIndexOf('\n', start - 1) + 1;
    var at = /^[•→✓↳]\s/.test(value.slice(lineStart)) ? start : lineStart;
    ta.value = value.slice(0, at) + text + value.slice(at);
    ta.focus();
    ta.setSelectionRange(start + text.length, start + text.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ─────────────────────────────────────────────────────
     2. The hook score

     Ten checks, weighted to 100. Every failing check has to
     name a fix — a number without an instruction is decoration.
     ───────────────────────────────────────────────────── */

  var CUTOFF = { mobile: 210, desktop: 270 };
  var MAX_CHARS = 3000;

  var URL_RE = /https?:\/\/[^\s]+/g;
  var HASH_RE = /(^|\s)#[A-Za-z0-9_]+/g;
  var EMOJI_RE = /[←-⇿☀-➿⬀-⯿]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF]/g;
  var CONTRARIAN = /\b(nobody|no one|everyone|stop|wrong|myth|mistake|unpopular|never|don't|worst|hate|lied|truth|actually|forget)\b/i;
  var STAT_RE = /\b\d+([.,]\d+)?\s*(%|k|m|x|hours?|days?|weeks?|months?|years?|people|customers?|users?)?\b|[£$€]\s?\d/i;
  var ASK_RE = /\b(what('s| is| do| would)|how (do|would|are)|which|agree|disagree|thoughts|tell me|comment|drop|share|curious|your take|am i wrong)\b/i;

  function analyse(raw, device) {
    var text = stripStyles(raw || '');
    var trimmed = text.trim();
    var lines = text.split('\n');
    var firstLine = (lines.find(function (l) { return l.trim().length; }) || '').trim();
    var paras = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    var chars = trimmed.length;
    var words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
    var sentences = trimmed ? trimmed.split(/[.!?]+(?:\s|$)/).filter(function (s) { return s.trim().length > 1; }) : [];
    var cut = CUTOFF[device] || CUTOFF.mobile;

    var urls = trimmed.match(URL_RE) || [];
    var tags = trimmed.match(HASH_RE) || [];
    var emoji = trimmed.match(EMOJI_RE) || [];
    var shouty = words.filter(function (word) { return word.length > 3 && word === word.toUpperCase() && /[A-Z]/.test(word); });
    var tail = trimmed.slice(-250);

    var checks = [];
    function add(id, weight, status, title, fix) {
      checks.push({ id: id, weight: weight, status: status, title: title, fix: fix });
    }

    /* 1 — opening line */
    var fl = firstLine.length;
    if (!fl) {
      add('hook', 16, 'bad', 'No opening line yet', 'The first line does 90% of the work. Write it first.');
    } else if (fl <= 70) {
      add('hook', 16, 'ok', 'Opening line is ' + fl + ' characters', 'Short and scannable. Good.');
    } else if (fl <= 120) {
      add('hook', 16, 'warn', 'Opening line is ' + fl + ' characters', 'Try cutting it to under 70 — a one-breath line stops the scroll harder.');
    } else {
      add('hook', 16, 'bad', 'Opening line is ' + fl + ' characters', 'Way too long. Break it after the first idea and let line two carry the rest.');
    }

    /* 2 — above the fold */
    var firstBreak = trimmed.indexOf('\n');
    var firstBlock = paras.length ? paras[0].length : 0;
    if (!chars) {
      add('fold', 14, 'bad', 'Nothing above the fold', 'Readers see ' + cut + ' characters before "see more".');
    } else if (chars <= cut) {
      add('fold', 14, 'ok', 'Whole post fits above the fold', 'No "see more" to earn. Fine for a short post.');
    } else if (firstBreak > -1 && firstBreak < cut && firstBlock <= cut) {
      add('fold', 14, 'ok', 'Opening block sits inside the preview',
        'It runs ' + firstBlock + ' of the ' + cut + ' characters visible before "see more".');
    } else {
      add('fold', 14, 'warn', 'Preview is one ' + Math.min(chars, cut) + '-character block',
        'Add a line break inside the first ' + cut + ' characters so the hook breathes before the cut.');
    }

    /* 3 — hook pattern */
    var opener = lines.slice(0, 2).join(' ');
    var patterns = [];
    if (STAT_RE.test(opener)) patterns.push('a specific number');
    if (opener.indexOf('?') > -1) patterns.push('a question');
    if (CONTRARIAN.test(opener)) patterns.push('a contrarian turn');
    if (/\b(I|my|me|we|our)\b/.test(opener)) patterns.push('a personal stake');
    if (/\byou(r|'re)?\b/i.test(opener)) patterns.push('direct address');
    if (patterns.length >= 2) {
      add('pattern', 12, 'ok', 'Hook uses ' + patterns.slice(0, 2).join(' + '), 'This is the part most posts skip.');
    } else if (patterns.length === 1) {
      add('pattern', 12, 'warn', 'Hook leans on ' + patterns[0] + ' alone', 'Stack a second device — a number, a question, or a contrarian turn.');
    } else {
      add('pattern', 12, 'bad', 'Hook has no pull', 'Open with a number, a question, a contradiction, or something that happened to you.');
    }

    /* 4 — whitespace */
    var longest = paras.reduce(function (m, p) { return Math.max(m, p.length); }, 0);
    if (!paras.length) {
      add('space', 12, 'bad', 'No structure', 'Break the post into short paragraphs with blank lines between them.');
    } else if (longest > 400) {
      add('space', 12, 'bad', 'One paragraph runs ' + longest + ' characters', 'Nobody reads a wall on a phone. Split anything over ~250 characters.');
    } else if (longest > 250 || (chars > 500 && paras.length < 3)) {
      add('space', 12, 'warn', 'Paragraphs are getting heavy', 'Aim for 1–2 sentences per block, with blank lines between.');
    } else {
      add('space', 12, 'ok', paras.length + ' short blocks', 'Scannable on a phone.');
    }

    /* 5 — readability */
    var wps = sentences.length ? words.length / sentences.length : 0;
    if (!sentences.length) {
      add('read', 10, 'warn', 'Not enough to read yet', 'Keep going.');
    } else if (wps <= 14) {
      add('read', 10, 'ok', Math.round(wps) + ' words per sentence', 'Reads fast. Keep it there.');
    } else if (wps <= 20) {
      add('read', 10, 'warn', Math.round(wps) + ' words per sentence', 'Trim to under 15. Full stops beat commas here.');
    } else {
      add('read', 10, 'bad', Math.round(wps) + ' words per sentence', 'Sentences this long lose people mid-scroll. Cut them in half.');
    }

    /* 6 — length */
    if (chars > MAX_CHARS) {
      add('len', 10, 'bad', chars + ' characters — over the limit', 'LinkedIn caps posts at 3,000. Cut ' + (chars - MAX_CHARS) + '.');
    } else if (chars < 200) {
      add('len', 10, 'bad', 'Only ' + chars + ' characters', 'Too thin to be worth a stop. Add the specific detail you left out.');
    } else if (chars < 600) {
      add('len', 10, 'warn', chars + ' characters', 'Short posts work, but 900–1,600 gives you room to land a point.');
    } else if (chars <= 2000) {
      add('len', 10, 'ok', chars + ' characters', 'In the range that tends to hold attention.');
    } else {
      add('len', 10, 'warn', chars + ' characters', 'Long. Make sure every block earns its place.');
    }

    /* 7 — links */
    if (!urls.length) {
      add('link', 8, 'ok', 'No outbound links in the body', 'Keeps the post native.');
    } else {
      add('link', 8, 'warn', urls.length + ' link' + (urls.length > 1 ? 's' : '') + ' in the body', 'Move them to the first comment and say "link in the comments".');
    }

    /* 8 — closing ask */
    if (!chars) {
      add('cta', 8, 'bad', 'No close', 'End with a question people can answer in one line.');
    } else if (tail.indexOf('?') > -1 || ASK_RE.test(tail)) {
      add('cta', 8, 'ok', 'Ends with an ask', 'Comments are the whole game.');
    } else {
      add('cta', 8, 'warn', 'No closing ask', 'Finish with a question that takes five seconds to answer.');
    }

    /* 9 — hashtags */
    if (tags.length === 0) {
      add('tags', 5, 'warn', 'No hashtags', 'Three specific ones at the end help the post get filed.');
    } else if (tags.length <= 5) {
      add('tags', 5, 'ok', tags.length + ' hashtag' + (tags.length > 1 ? 's' : ''), 'Right range.');
    } else {
      add('tags', 5, 'bad', tags.length + ' hashtags', 'Past five it reads as spam. Keep the three that are actually specific.');
    }

    /* 10 — tone signals */
    if (emoji.length > 12) {
      add('tone', 5, 'bad', emoji.length + ' emoji', 'Strip most of them — they are doing the job your sentences should.');
    } else if (shouty.length > 3) {
      add('tone', 5, 'warn', shouty.length + ' ALL-CAPS words', 'Shouting reads as a sales page. Use one at most.');
    } else {
      add('tone', 5, 'ok', 'Tone signals look clean', 'Emoji and caps used sparingly.');
    }

    var earned = checks.reduce(function (sum, c) {
      return sum + c.weight * (c.status === 'ok' ? 1 : c.status === 'warn' ? 0.5 : 0);
    }, 0);
    var score = chars ? Math.round(earned) : 0;

    return {
      score: score, checks: checks, chars: chars, words: words.length,
      firstLine: firstLine, cutoff: cut, patterns: patterns, plain: text
    };
  }

  function gradeFor(score, chars) {
    if (!chars) return 'Waiting for a draft';
    if (score >= 85) return 'Ready to post';
    if (score >= 70) return 'Strong — two fixes from great';
    if (score >= 50) return 'Middle of the feed';
    return 'Start again at the hook';
  }

  /* ─────────────────────────────────────────────────────
     3. Hook variants (Pro) — pattern rewrites, not a model.
     ───────────────────────────────────────────────────── */

  /* Every frame keeps the writer's own words and their capitalisation.
     Rewriting a sentence properly needs a model; reshaping one does not,
     and a reshape that always reads correctly beats six that sometimes do. */

  /* Words that lean on whatever follows them. Cutting a hook just
     before one keeps the fragment readable; ending on one does not. */
  var PARTICLE = /^(for|to|with|about|at|on|in|of|from|than|as)$/i;
  var HINGE = /^(for|and|but|because|so|with|in|on|at|to|of|from|that|which|when|while|after|before|about|as|than|a|an|the|my|our|their|his|her|its|this)$/i;

  function shorten(line, maxWords) {
    var clause = line.match(/^(.{18,}?)(?:,| — | - | and | but | because | so )/);
    var out = clause ? clause[1] : line;
    var words = out.split(/\s+/);
    var cap = maxWords || 10;

    if (words.length > cap + 1) {
      /* cut at the last hinge inside the budget rather than mid-phrase */
      var at = cap;
      for (var i = cap; i >= 4; i--) {
        if (HINGE.test(words[i])) { at = i; break; }
      }
      words = words.slice(0, at);
    }
    /* Drop a dangling hinge — unless it is a particle the verb needs
       ("nobody asked for" must not become "nobody asked"). */
    while (words.length > 4) {
      var last = words[words.length - 1];
      if (!HINGE.test(last)) break;
      var prev = words[words.length - 2] || '';
      if (PARTICLE.test(last) && /(ed|ing|s)$/i.test(prev)) break;
      words.pop();
    }

    return words.join(' ').replace(/[,;:\s]+$/, '').replace(/[.!?]*$/, '') + '.';
  }

  function splitInTwo(line) {
    var m = line.match(/^(.{15,}?)(?:,\s+|\s+—\s+|\s+-\s+|\s+(?:and|but|because|so|which)\s+)(.+)$/);
    if (!m) return null;
    var head = m[1].replace(/[,;:\s]+$/, '');
    var tail = m[2].charAt(0).toUpperCase() + m[2].slice(1);
    return head + '.\n\n' + tail.replace(/[.!?]*$/, '') + '.';
  }

  function endStop(line) {
    return /[.!?…:]$/.test(line) ? line : line + '.';
  }

  function variants(firstLine) {
    var line = (firstLine || '').trim();
    if (line.length < 12) return [];

    var short = shorten(line);
    var split = splitInTwo(line);
    var out = [];

    if (short.length < line.length - 4) {
      out.push({ name: 'Shorter', text: short,
        why: 'A one-breath hook outperforms a full sentence.' });
    }
    if (split) {
      out.push({ name: 'Split in two', text: split,
        why: 'Two short lines beat one long one on a phone.' });
    }
    out.push({ name: 'Cliffhanger', text: short + '\n\nHere\u2019s what happened.',
      why: 'Withhold the payoff so the tap is worth it.' });
    out.push({ name: 'Stakes', text: short + '\n\nHere\u2019s what it cost me.',
      why: 'A cost makes the story worth reading.' });
    out.push({ name: 'Contrarian', text: 'Unpopular opinion — ' + endStop(line),
      why: 'Disagreement earns comments; agreement earns nothing.' });
    out.push({ name: 'Confession', text: 'I\u2019ll be honest \u2014 ' + endStop(line),
      why: 'Candour reads as a person, not a brand account.' });

    return out.slice(0, 6);
  }

  /* ─────────────────────────────────────────────────────
     4. Feed preview
     ───────────────────────────────────────────────────── */

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function previewHtml(text, cutoff) {
    if (!text.trim()) return '<span class="seemore">Your post will appear here.</span>';
    if (text.length <= cutoff) return escapeHtml(text);
    /* break on the last space before the cut, the way the real thing does */
    var head = text.slice(0, cutoff);
    var space = head.lastIndexOf(' ');
    if (space > cutoff - 30) head = head.slice(0, space);
    var tail = text.slice(head.length);
    return escapeHtml(head) +
      '<span class="cut hidden">' + escapeHtml(tail) + '</span>' +
      '<span class="seemore">…&nbsp;see more</span>';
  }

  w.Composer = {
    applyFormat: applyFormat,
    insertAtCursor: insertAtCursor,
    stripStyles: stripStyles,
    analyse: analyse,
    gradeFor: gradeFor,
    variants: variants,
    previewHtml: previewHtml,
    CUTOFF: CUTOFF,
    MAX_CHARS: MAX_CHARS
  };
})(window);
