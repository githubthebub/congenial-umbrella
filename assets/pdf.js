/* pdf.js — a ~100 line PDF writer for the one job we have:
   N pages, each a single full-bleed JPEG.

   A general PDF library is ~350KB and would have to come from a CDN.
   All we actually need is a page tree and DCTDecode image XObjects,
   which is small enough to own — and it means the app makes no
   network requests at all. */
(function (w) {
  'use strict';

  function dataUrlToBytes(url) {
    var bin = atob(url.slice(url.indexOf(',') + 1));
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) & 0xFF;
    return arr;
  }

  function latin1(str) {
    var arr = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xFF;
    return arr;
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  /* pages: [{ bytes: Uint8Array (JPEG), w: Number, h: Number }] */
  function build(pages) {
    if (!pages.length) throw new Error('nothing to export');

    var chunks = [], length = 0, offsets = [];

    function push(part) {
      var bytes = typeof part === 'string' ? latin1(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    }

    function obj(num, dict, stream) {
      offsets[num] = length;
      push(num + ' 0 obj\n' + dict + '\n');
      if (stream) {
        push('stream\n');
        push(stream);
        push('\nendstream\n');
      }
      push('endobj\n');
    }

    /* object numbering: 1 catalog, 2 page tree, then 3 per page */
    var kids = pages.map(function (_, i) { return (3 + i * 3) + ' 0 R'; }).join(' ');
    var total = 2 + pages.length * 3;

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>');

    pages.forEach(function (page, i) {
      var pageNum = 3 + i * 3, contentNum = pageNum + 1, imageNum = pageNum + 2;
      var content = 'q ' + page.w + ' 0 0 ' + page.h + ' 0 0 cm /Im0 Do Q';

      obj(pageNum,
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + page.w + ' ' + page.h + ']' +
        ' /Resources << /XObject << /Im0 ' + imageNum + ' 0 R >> >>' +
        ' /Contents ' + contentNum + ' 0 R >>');

      obj(contentNum, '<< /Length ' + content.length + ' >>', latin1(content));

      obj(imageNum,
        '<< /Type /XObject /Subtype /Image /Width ' + page.w + ' /Height ' + page.h +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode' +
        ' /Length ' + page.bytes.length + ' >>', page.bytes);
    });

    var xrefAt = length;
    var xref = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (var n = 1; n <= total; n++) xref += pad(offsets[n], 10) + ' 00000 n \n';
    push(xref);
    push('trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n');

    return new Blob(chunks, { type: 'application/pdf' });
  }

  function fromCanvases(canvases, quality) {
    return build(canvases.map(function (c) {
      return {
        bytes: dataUrlToBytes(c.toDataURL('image/jpeg', quality || 0.94)),
        w: c.width, h: c.height
      };
    }));
  }

  function save(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  w.MiniPDF = { build: build, fromCanvases: fromCanvases, save: save };
})(window);
