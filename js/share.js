// share.js - Share cards: a picture of a game profile, a year in review or a Spotlight list, drawn in the browser
// and offered to download, copy or share. Pages that load this file show their "Share card" buttons.

const SHARE_WIDTH = 1200, SHARE_HEIGHT = 630;
const SHARE_COLORS = { page: '#f4f5f7', card: '#ffffff', green: '#2e7d32', greenSoft: '#e8f5e9', title: '#111111', text: '#222222', muted: '#888888', line: '#e6e6e6' };

function shareButtonHtml(attrs = '') {
  return `<button type="button" class="share-btn" ${attrs}>Share card</button>`;
}

// card: { kicker, title, subtitle, stats: [{ label, value }] (up to 4), rows: [{ left, right }], footer }
async function openShareCard(card) {
  // The page's own font has to be ready before it can be drawn
  if (document.fonts && document.fonts.load) {
    try { await Promise.all(['900 60px Inter', '800 30px Inter', '600 22px Inter'].map(f => document.fonts.load(f))); } catch (e) { /* drawn with the fallback font */ }
  }
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_WIDTH; canvas.height = SHARE_HEIGHT;
  drawShareCard(canvas.getContext('2d'), card);
  const fileName = `${String(card.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card'}.png`;
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const url = URL.createObjectURL(blob);
  const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canCopy = !!(navigator.clipboard && window.ClipboardItem);
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));

  const modal = document.createElement('div');
  modal.className = 'share-modal';
  modal.innerHTML = `
    <div class="share-dialog" role="dialog" aria-modal="true" aria-label="Share card">
      <img src="${url}" alt="${escapeHTML(card.title)} share card" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}">
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
