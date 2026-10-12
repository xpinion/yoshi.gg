// share.js - Share cards: a picture of a game profile, a year in review or a Spotlight list, drawn in the browser
// and offered to download, copy or share. Pages that load this file show their "Share card" buttons.

const SHARE_WIDTH = 1200, SHARE_HEIGHT = 630;
const SHARE_COLORS = { page: '#f4f5f7', card: '#ffffff', green: '#2e7d32', greenSoft: '#e8f5e9', title: '#111111', text: '#222222', muted: '#888888', line: '#e6e6e6', gold: '#b7791f', goldSoft: '#fdf3d7' };
// Pill colors for playthrough statuses on profile cards: [background, text]
const SHARE_STATUS_COLORS = {
  Completed: ['#d7f0d9', '#1b5e20'], 'M-Completed': ['#d7f0d9', '#1b5e20'], Postgame: ['#c8ecd9', '#14532d'], Active: ['#fff3bf', '#7a5d00'],
  Abandoned: ['#fde0dc', '#a12a1e'], Multiplayer: ['#dbe9fb', '#1c4e8a'], 'Non-Completable': ['#ececec', '#555555']
};

function shareButtonHtml(attrs = '') {
  return `<button type="button" class="share-btn" ${attrs}>Share card</button>`;
}

// card: { kicker, title, subtitle, stats: [{ label, value }] (up to 4), rows: [{ left, right }], footer }
// A card with `tables` (a Spotlight list) or `layout` (a game or series profile) is drawn in full instead, as tall
// as its content needs: see drawShareTables and drawProfileCard.
// Draws the card and returns { canvas, blob, url, fileName, file }; the caller revokes url when done with it.
async function makeShareImage(card) {
  // The page's own font has to be ready before it can be drawn
  if (document.fonts && document.fonts.load) {
    try { await Promise.all(['900 60px Inter', '800 30px Inter', '700 22px Inter', '600 22px Inter'].map(f => document.fonts.load(f))); } catch (e) { /* drawn with the fallback font */ }
  }
  const canvas = document.createElement('canvas');
  if (card.layout) drawProfileCard(canvas, card);
  else if (card.tables) drawShareTables(canvas, card);
  else {
    canvas.width = SHARE_WIDTH; canvas.height = SHARE_HEIGHT;
    drawShareCard(canvas.getContext('2d'), card);
  }
  const fileName = `${String(card.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card'}.png`;
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return { canvas, blob, url: URL.createObjectURL(blob), fileName, file: typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null };
}

// Download, Copy and Share buttons for an image from makeShareImage
function shareActionButtonsHtml(image) {
  const canCopy = !!(navigator.clipboard && window.ClipboardItem);
  const canShare = !!(image.file && navigator.canShare && navigator.canShare({ files: [image.file] }));
  return `
    <a class="share-btn share-primary" href="${image.url}" download="${escapeHTML(image.fileName)}">Download</a>
    ${canCopy ? '<button type="button" class="share-btn" data-share-action="copy">Copy image</button>' : ''}
    ${canShare ? '<button type="button" class="share-btn" data-share-action="share">Share…</button>' : ''}`;
}
// Runs a clicked Copy or Share button
async function runShareAction(button, image, title) {
  const action = button.dataset.shareAction;
  if (action === 'copy') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image.blob })]);
      button.textContent = 'Copied';
    } catch (error) { button.textContent = 'Could not copy'; }
  }
  if (action === 'share') {
    try { await navigator.share({ files: [image.file], title }); } catch (error) { /* closed without sharing */ }
  }
}

async function openShareCard(card) {
  const image = await makeShareImage(card);
  const modal = document.createElement('div');
  modal.className = 'share-modal';
  modal.innerHTML = `
    <div class="share-dialog${card.tables || card.layout ? ' share-wide' : ''}" role="dialog" aria-modal="true" aria-label="Share card">
      <img src="${image.url}" alt="${escapeHTML(card.title)} share card" width="${image.canvas.width}" height="${image.canvas.height}">
      <div class="share-actions">
        ${shareActionButtonsHtml(image)}
        <button type="button" class="share-btn" data-share-action="close">Close</button>
      </div>
    </div>`;
  const close = () => { modal.remove(); URL.revokeObjectURL(image.url); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.dataset.shareAction === 'close') return close();
    if (e.target.dataset.shareAction) runShareAction(e.target, image, card.title);
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

// A game or series profile. card: { kicker, title, subtitle, badge: { value, label }, footer, layout }, where layout
// is a list of rows and each row is one or more sections drawn side by side. Sections:
//   { type: 'stats', items: [{ label, value, sub }] }
//   { type: 'facts', title, items: [{ label, value }] }
//   { type: 'table', title, columns: [{ label, width | flex, align, weight, color, size, maxLines }], rows: [[cell]] }
//       a cell is text or { text, pill: [background, color], color, weight }
//   { type: 'chips', title, groups: [{ label, chips: [text], gold }] }
//   { type: 'bars', title, bars: [{ value, label }], maxLabel }
// Sizes the canvas itself: everything is measured first, then drawn.
function drawProfileCard(canvas, card) {
  const C = SHARE_COLORS, WIDTH = 1800, edge = 32, colGap = 44, rowGap = 40;
  const left = edge + 14 + 40, right = WIDTH - edge - 40, inner = right - left;
  let ctx = canvas.getContext('2d');
  const font = (weight, size) => { ctx.font = `${weight} ${size}px Inter, "Segoe UI", sans-serif`; };
  const text = (str, x, y, weight, size, color, align = 'left') => { font(weight, size); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(str, x, y); };
  // Shrinks to minSize, then cuts with an ellipsis, so the text is never wider than maxWidth
  const fit = (str, x, y, maxWidth, weight, size, minSize, color, align = 'left') => {
    str = String(str);
    font(weight, size);
    while (size > minSize && ctx.measureText(str).width > maxWidth) font(weight, --size);
    while (str.length > 1 && ctx.measureText(str).width > maxWidth) str = str.slice(0, -2).trimEnd() + '…';
    ctx.fillStyle = color; ctx.textAlign = align;
    ctx.fillText(str, x, y);
  };
  // Lines no wider than maxWidth (the font must be set first); past maxLines the last line ends with an ellipsis
  const wrap = (str, maxWidth, maxLines) => {
    const lines = [];
    let line = '';
    String(str).split(/\s+/).filter(Boolean).forEach(word => {
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
    return lines.length ? lines : [''];
  };
  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  const rule = (x, y, w) => { ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke(); };
  const TITLE_H = 52;
  const drawTitle = (title, x, y, w) => {
    text(String(title).toUpperCase(), x, y + 24, 900, 21, C.green);
    ctx.fillStyle = C.green; ctx.fillRect(x, y + 36, w, 3);
  };

  // Each maker measures a section at a width and returns { height, draw(x, y) }
  const makers = {
    stats(section, w) {
      const gap = 16, boxH = 132, boxW = (w - gap * (section.items.length - 1)) / section.items.length;
      return { height: boxH, draw: (x, y) => section.items.forEach((item, i) => {
        const bx = x + i * (boxW + gap);
        ctx.fillStyle = C.greenSoft; roundRect(bx, y, boxW, boxH, 14); ctx.fill();
        fit(String(item.label).toUpperCase(), bx + boxW / 2, y + 30, boxW - 20, 800, 15, 11, C.muted, 'center');
        fit(item.value, bx + boxW / 2, y + 78, boxW - 20, 900, 40, 22, C.green, 'center');
        if (item.sub) fit(item.sub, bx + boxW / 2, y + 110, boxW - 20, 600, 17, 12, C.text, 'center');
      }) };
    },
    facts(section, w) {
      const labelW = Math.min(300, w * 0.4), valueW = w - labelW - 16, lineH = 26;
      font(800, 20);
      const rows = section.items.map(item => {
        const lines = wrap(item.value, valueW, 8);
        return { label: item.label, lines, h: Math.max(42, lines.length * lineH + 16) };
      });
      return { height: TITLE_H + rows.reduce((sum, r) => sum + r.h, 0), draw: (x, y) => {
        drawTitle(section.title, x, y, w);
        y += TITLE_H;
        rows.forEach(row => {
          const ty = y + (row.h - row.lines.length * lineH) / 2 + 19;
          text(row.label, x, y + row.h / 2 + 7, 600, 19, C.muted);
          row.lines.forEach((line, i) => text(line, x + w, ty + i * lineH, 800, 20, C.title, 'right'));
          y += row.h;
          rule(x, y, w);
        });
      } };
    },
    table(section, w) {
      const pad = 10, HEAD = 40, lineH = 25;
      const fixed = section.columns.reduce((sum, c) => sum + (c.width || 0), 0);
      const flexTotal = section.columns.reduce((sum, c) => sum + (c.flex || 0), 0) || 1;
      const widths = section.columns.map(c => c.width || (w - fixed) * (c.flex / flexTotal));
      const rows = section.rows.map(cells => {
        const drawn = cells.map((cell, i) => {
          const col = section.columns[i], c = cell !== null && typeof cell === 'object' ? cell : { text: cell };
          const weight = c.weight || col.weight || 600, size = col.size || 19;
          font(weight, size);
          return { ...c, weight, size, lines: wrap(c.text === undefined || c.text === null ? '' : c.text, widths[i] - pad * 2, c.pill ? 1 : (col.maxLines || 2)) };
        });
        return { cells: drawn, h: Math.max(...drawn.map(c => c.lines.length)) * lineH + 17 };
      });
      const noteH = section.note ? 34 : 0;
      return { height: TITLE_H + HEAD + rows.reduce((sum, r) => sum + r.h, 0) + noteH, draw: (x, y) => {
        drawTitle(section.title, x, y, w);
        y += TITLE_H;
        const xs = widths.map((cw, i) => x + widths.slice(0, i).reduce((a, b) => a + b, 0));
        const anchor = (i, align) => align === 'center' ? xs[i] + widths[i] / 2 : align === 'right' ? xs[i] + widths[i] - pad : xs[i] + pad;
        ctx.fillStyle = C.page; ctx.fillRect(x, y, w, HEAD);
        section.columns.forEach((col, i) => fit(String(col.label).toUpperCase(), anchor(i, col.align || 'left'), y + 26, widths[i] - pad, 800, 14, 10, C.muted, col.align || 'left'));
        y += HEAD;
        rows.forEach(row => {
          row.cells.forEach((cell, i) => {
            const col = section.columns[i], align = col.align || 'left';
            let ty = y + (row.h - cell.lines.length * lineH) / 2 + 19;
            if (cell.pill) {
              font(800, 16);
              const pw = Math.min(widths[i] - 8, ctx.measureText(cell.lines[0]).width + 24);
              ctx.fillStyle = cell.pill[0]; roundRect(xs[i] + (widths[i] - pw) / 2, y + row.h / 2 - 15, pw, 30, 15); ctx.fill();
              fit(cell.lines[0], xs[i] + widths[i] / 2, y + row.h / 2 + 6, pw - 12, 800, 16, 11, cell.pill[1], 'center');
              return;
            }
            cell.lines.forEach(line => { text(line, anchor(i, align), ty, cell.weight, cell.size, cell.color || col.color || C.text, align); ty += lineH; });
          });
          y += row.h;
          rule(x, y, w);
        });
        if (section.note) text(section.note, x, y + 25, 600, 17, C.muted);
      } };
    },
    chips(section, w) {
      const chipH = 34, gap = 8, labelH = 34;
      font(700, 17);
      let height = TITLE_H;
      const groups = section.groups.map(group => {
        let cx = 0, cy = 0;
        const chips = group.chips.map(chip => {
          const cw = Math.min(w, ctx.measureText(chip).width + 26);
          if (cx > 0 && cx + cw > w) { cx = 0; cy += chipH + gap; }
          const placed = { chip, x: cx, y: cy, w: cw };
          cx += cw + gap;
          return placed;
        });
        const h = labelH + cy + chipH + 14;
        height += h;
        return { ...group, chips, h };
      });
      return { height, draw: (x, y) => {
        drawTitle(section.title, x, y, w);
        y += TITLE_H;
        groups.forEach(group => {
          text(group.label, x, y + 22, 800, 18, C.title);
          group.chips.forEach(c => {
            ctx.fillStyle = group.gold ? C.goldSoft : C.greenSoft; roundRect(x + c.x, y + labelH + c.y, c.w, chipH, 17); ctx.fill();
            fit(c.chip, x + c.x + c.w / 2, y + labelH + c.y + 23, c.w - 16, 700, 17, 12, group.gold ? C.gold : C.green, 'center');
          });
          y += group.h;
        });
      } };
    },
    bars(section, w) {
      const chartH = 190, labelH = 30, padL = 64;
      return { height: TITLE_H + chartH + labelH, draw: (x, y) => {
        drawTitle(section.title, x, y, w);
        y += TITLE_H + 8;
        const max = Math.max(...section.bars.map(b => b.value), 1), plotH = chartH - 8, plotW = w - padL;
        [0, 0.5, 1].forEach(f => {
          rule(x + padL, y + plotH - f * plotH, plotW);
          text(section.axisLabel(f * max), x + padL - 10, y + plotH - f * plotH + 6, 600, 15, C.muted, 'right');
        });
        const barW = plotW / section.bars.length;
        let lastLabelX = -Infinity;
        section.bars.forEach((bar, i) => {
          const h = (bar.value / max) * plotH, bx = x + padL + i * barW;
          if (h > 0) { ctx.fillStyle = C.green; ctx.fillRect(bx + barW * 0.1, y + plotH - Math.max(2, h), Math.max(1, barW * 0.8), Math.max(2, h)); }
          if (bar.label && bx - lastLabelX > 56) { text(bar.label, bx, y + plotH + 24, 700, 15, C.muted); lastLabelX = bx; }
        });
      } };
    }
  };

  // Pass 1: measure. The header's height depends on how the subtitle wraps.
  const badgeW = card.badge ? 200 : 0, headW = inner - (badgeW ? badgeW + 30 : 0);
  font(600, 24);
  const subLines = card.subtitle ? wrap(card.subtitle, headW, 2) : [];
  const headerH = 62 + 78 + subLines.length * 32 + 22;
  const rows = card.layout.filter(row => row.length).map(row => {
    const w = (inner - colGap * (row.length - 1)) / row.length;
    const sections = row.map(section => makers[section.type](section, w));
    return { sections, w, height: Math.max(...sections.map(s => s.height)) };
  });
  canvas.width = WIDTH;
  canvas.height = edge + headerH + rows.reduce((sum, r) => sum + r.height + rowGap, 0) + 70 + edge;
  ctx = canvas.getContext('2d'); // sizing the canvas clears its settings

  // Pass 2: draw
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.page; ctx.fillRect(0, 0, WIDTH, canvas.height);
  ctx.fillStyle = C.card; roundRect(edge, edge, WIDTH - edge * 2, canvas.height - edge * 2, 24); ctx.fill();
  ctx.fillStyle = C.green; roundRect(edge, edge, 14, canvas.height - edge * 2, 7); ctx.fill();
  text(String(card.kicker || '').toUpperCase(), left, edge + 62, 800, 22, C.green);
  fit(card.title, left, edge + 132, headW, 900, 66, 34, C.title);
  subLines.forEach((line, i) => text(line, left, edge + 172 + i * 32, 600, 24, C.muted));
  if (card.badge) {
    ctx.fillStyle = C.green; roundRect(right - badgeW, edge + 40, badgeW, 124, 18); ctx.fill();
    fit(card.badge.value, right - badgeW / 2, edge + 110, badgeW - 24, 900, 62, 30, '#ffffff', 'center');
    fit(String(card.badge.label).toUpperCase(), right - badgeW / 2, edge + 144, badgeW - 20, 800, 15, 10, '#ffffff', 'center');
  }
  let y = edge + headerH;
  rows.forEach(row => {
    row.sections.forEach((section, i) => section.draw(left + i * (row.w + colGap), y));
    y += row.height + rowGap;
  });
  const footerY = canvas.height - edge - 30;
  text(card.footer || 'yoshi.gg', left, footerY, 800, 22, C.muted);
  text(`as of ${formatFullDate(dataDateKey())}`, right, footerY, 600, 22, C.muted, 'right');
}
