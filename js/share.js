// share.js - Share cards: a picture of a game profile, a year in review or a Spotlight list, drawn in the browser
// and offered to download, copy or share. Pages that load this file show their "Share card" buttons.

const SHARE_WIDTH = 1200, SHARE_HEIGHT = 630;
const SHARE_COLORS = { page: '#f4f5f7', card: '#ffffff', green: '#2e7d32', greenSoft: '#e8f5e9', title: '#111111', text: '#222222', muted: '#888888', line: '#e6e6e6' };

function shareButtonHtml(attrs = '') {
  return `<button type="button" class="share-btn" ${attrs}>Share card</button>`;
}

// card: { kicker, title, subtitle, stats: [{ label, value }] (up to 4), rows: [{ left, right }], footer }
// A card with `tables` (a Spotlight list) is drawn in full instead, as tall as its rows need: see drawShareTables.
async function openShareCard(card) {
  // The page's own font has to be ready before it can be drawn
  if (document.fonts && document.fonts.load) {
    try { await Promise.all(['900 60px Inter', '800 30px Inter', '600 22px Inter'].map(f => document.fonts.load(f))); } catch (e) { /* drawn with the fallback font */ }
  }
  const canvas = document.createElement('canvas');
  if (card.tables) drawShareTables(canvas, card);
  else {
    canvas.width = SHARE_WIDTH; canvas.height = SHARE_HEIGHT;
    drawShareCard(canvas.getContext('2d'), card);
  }
  const fileName = `${String(card.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card'}.png`;
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const url = URL.createObjectURL(blob);
  const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canCopy = !!(navigator.clipboard && window.ClipboardItem);
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));

  const modal = document.createElement('div');
  modal.className = 'share-modal';
  modal.innerHTML = `
    <div class="share-dialog${card.tables ? ' share-wide' : ''}" role="dialog" aria-modal="true" aria-label="Share card">
      <img src="${url}" alt="${escapeHTML(card.title)} share card" width="${canvas.width}" height="${canvas.height}">
      <div class="share-actions">
        <a class="share-btn share-primary" href="${url}" download="${escapeHTML(fileName)}">Download</a>
        ${canCopy ? '<button type="button" class="share-btn" data-share-action="copy">Copy image</button>' : ''}
        ${canShare ? '<button type="button" class="share-btn" data-share-action="share">Share…</button>' : ''}
        <button type="button" class="share-btn" data-share-action="close">Close</button>
      </div>
    </div>`;
  const close = () => { modal.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  modal.addEventListener('click', async e => {
    const action = e.target.dataset.shareAction;
    if (e.target === modal || action === 'close') return close();
    if (action === 'copy') {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        e.target.textContent = 'Copied';
      } catch (error) { e.target.textContent = 'Could not copy'; }
    }
    if (action === 'share') {
      try { await navigator.share({ files: [file], title: card.title }); } catch (error) { /* closed without sharing */ }
    }
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(modal);
}

function drawShareCard(ctx, card) {
  const C = SHARE_COLORS, pad = 56, inner = SHARE_WIDTH - pad * 2 - 64;
  const font = (weight, size) => { ctx.font = `${weight} ${size}px Inter, "Segoe UI", sans-serif`; };
  // Draws text no wider than maxWidth: the size shrinks to minSize first, then the text is cut with an ellipsis
  const fit = (text, x, y, maxWidth, weight, size, minSize, color, align = 'left') => {
    text = String(text);
    font(weight, size);
    while (size > minSize && ctx.measureText(text).width > maxWidth) font(weight, --size);
    while (text.length > 1 && ctx.measureText(text).width > maxWidth) text = text.slice(0, -2).trimEnd() + '…';
    ctx.fillStyle = color; ctx.textAlign = align;
    ctx.fillText(text, x, y);
    return size;
  };
  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };

  ctx.fillStyle = C.page; ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  ctx.fillStyle = C.card; roundRect(pad - 24, pad - 24, SHARE_WIDTH - (pad - 24) * 2, SHARE_HEIGHT - (pad - 24) * 2, 24); ctx.fill();
  ctx.fillStyle = C.green; roundRect(pad - 24, pad - 24, 14, SHARE_HEIGHT - (pad - 24) * 2, 7); ctx.fill();
  ctx.textBaseline = 'alphabetic';

  const left = pad + 32;
  let y = pad + 36;
  fit(String(card.kicker || '').toUpperCase(), left, y, inner, 800, 22, 16, C.green);
  y += 68;
  fit(card.title, left, y, inner, 900, 62, 34, C.title);
  if (card.subtitle) { y += 40; fit(card.subtitle, left, y, inner, 600, 24, 16, C.muted); }
  y += 34;

  const stats = (card.stats || []).slice(0, 4);
  if (stats.length) {
    const gap = 16, boxW = (inner - gap * (stats.length - 1)) / stats.length, boxH = 104;
    stats.forEach((s, i) => {
      const x = left + i * (boxW + gap);
      ctx.fillStyle = C.greenSoft; roundRect(x, y, boxW, boxH, 14); ctx.fill();
      fit(s.value, x + boxW / 2, y + 54, boxW - 24, 900, 40, 22, C.green, 'center');
      fit(String(s.label).toUpperCase(), x + boxW / 2, y + 84, boxW - 24, 800, 16, 12, C.muted, 'center');
    });
    y += boxH + 26;
  }

  // As many rows as fit above the footer
  const footerY = SHARE_HEIGHT - pad - 8;
  const rowH = 42;
  const rows = (card.rows || []).slice(0, Math.max(0, Math.floor((footerY - 34 - y) / rowH)));
  rows.forEach((row, i) => {
    const ry = y + i * rowH + 28;
    if (i > 0) { ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, ry - 28); ctx.lineTo(left + inner, ry - 28); ctx.stroke(); }
    font(900, 24);
    const rightWidth = Math.min(ctx.measureText(String(row.right || '')).width, inner * 0.4);
    if (row.right) fit(row.right, left + inner, ry, inner * 0.4, 900, 24, 16, C.green, 'right');
    fit(row.left, left, ry, inner - rightWidth - 24, 700, 24, 16, C.text);
  });

  fit(card.footer || 'yoshi.gg', left, footerY, inner * 0.6, 800, 20, 14, C.muted);
  fit(`as of ${formatFullDate(dataDateKey())}`, left + inner, footerY, inner * 0.4, 600, 20, 14, C.muted, 'right');
}

// A Spotlight list in full: card.tables is one or two of { title, headers: [key, name, value, start, end],
// rows: [{ key, name, context, value, start, end, sub, empty }] }, drawn side by side like the page.
// Sizes the canvas itself, since the height depends on how many rows there are and how their text wraps.
function drawShareTables(canvas, card) {
  const C = SHARE_COLORS, WIDTH = 2200, edge = 32, gap = 48, pad = 12;
  const left = edge + 14 + 40, right = WIDTH - edge - 40;
  const tableW = (right - left - gap * (card.tables.length - 1)) / card.tables.length;
  const COL = { key: 78, value: 150, date: 128 };
  const nameW = tableW - COL.key - COL.value - COL.date * 2 - pad * 2;
  let ctx = canvas.getContext('2d');
  const font = (weight, size) => { ctx.font = `${weight} ${size}px Inter, "Segoe UI", sans-serif`; };
  // Breaks text into lines no wider than maxWidth; past maxLines the last line ends with an ellipsis
  const wrap = (text, maxWidth, maxLines) => {
    const lines = [];
    let line = '';
    String(text).split(/\s+/).filter(Boolean).forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      let last = lines[maxLines - 1] + '…';
      while (last.length > 2 && ctx.measureText(last).width > maxWidth) last = last.slice(0, -2).trimEnd() + '…';
      lines.length = maxLines;
      lines[maxLines - 1] = last;
    }
    return lines;
  };
  const NAME = 23, SUB = 17, NAME_LINE = 29, SUB_LINE = 23, HEAD = 46;

  // Pass 1: wrap each row's text to find its height
  const tables = card.tables.map(table => {
    let height = 62 + HEAD;
    const rows = table.rows.map(row => {
      font(row.empty ? 600 : 800, NAME);
      const nameLines = wrap(row.context ? `${row.name} (${row.context})` : row.name, nameW, 6);
      font(600, SUB);
      const subLines = row.sub ? wrap(row.sub, nameW, 6) : [];
      const rowH = Math.max(52, 22 + nameLines.length * NAME_LINE + subLines.length * SUB_LINE);
      height += rowH;
      return { ...row, nameLines, subLines, rowH };
    });
    return { ...table, rows, height };
  });
  const top = edge + 132;
  canvas.width = WIDTH;
  canvas.height = top + Math.max(...tables.map(t => t.height)) + 84 + edge;
  ctx = canvas.getContext('2d'); // sizing the canvas clears its settings

  const text = (str, x, y, weight, size, color, align = 'left') => { font(weight, size); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(str, x, y); };
  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.page; ctx.fillRect(0, 0, WIDTH, canvas.height);
  ctx.fillStyle = C.card; roundRect(edge, edge, WIDTH - edge * 2, canvas.height - edge * 2, 24); ctx.fill();
  ctx.fillStyle = C.green; roundRect(edge, edge, 14, canvas.height - edge * 2, 7); ctx.fill();
  text(String(card.kicker || '').toUpperCase(), left, edge + 62, 800, 24, C.green);

  tables.forEach((table, t) => {
    const x = left + t * (tableW + gap);
    const xName = x + COL.key + pad, xValue = xName + nameW + pad;
    const xStart = xValue + COL.value, xEnd = xStart + COL.date;
    let y = top;
    text(table.title, x, y + 34, 900, 38, C.title);
    y += 62;
    // Column headings
    ctx.fillStyle = C.page; ctx.fillRect(x, y, tableW, HEAD);
    const head = (label, hx, align) => text(String(label || '').toUpperCase(), hx, y + 30, 800, 16, C.muted, align);
    head(table.headers[0], x + COL.key / 2, 'center'); head(table.headers[1], xName, 'left');
    head(table.headers[2], xValue + COL.value / 2, 'center'); head(table.headers[3], xStart + COL.date / 2, 'center'); head(table.headers[4], xEnd + COL.date / 2, 'center');
    y += HEAD;

    table.rows.forEach(row => {
      const mid = y + row.rowH / 2 + 8;
      if (!row.empty) { ctx.fillStyle = C.greenSoft; ctx.fillRect(xValue, y, COL.value, row.rowH); }
      text(row.key, x + COL.key / 2, mid, 800, 22, C.muted, 'center');
      const blockH = row.nameLines.length * NAME_LINE + row.subLines.length * SUB_LINE;
      let ty = y + (row.rowH - blockH) / 2 + 22;
      row.nameLines.forEach(line => { text(line, xName, ty, row.empty ? 600 : 800, NAME, row.empty ? C.muted : C.title); ty += NAME_LINE; });
      ty -= 3;
      row.subLines.forEach(line => { text(line, xName, ty, 600, SUB, C.muted); ty += SUB_LINE; });
      text(row.value, xValue + COL.value / 2, mid, 900, 24, row.empty ? C.muted : C.green, 'center');
      text(row.start, xStart + COL.date / 2, mid - 1, 600, 18, C.text, 'center');
      text(row.end, xEnd + COL.date / 2, mid - 1, 600, 18, C.text, 'center');
      y += row.rowH;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + tableW, y); ctx.stroke();
    });
  });

  const footerY = canvas.height - edge - 34;
  text(card.footer || 'yoshi.gg', left, footerY, 800, 24, C.muted);
  text(`as of ${formatFullDate(dataDateKey())}`, right, footerY, 600, 24, C.muted, 'right');
}
