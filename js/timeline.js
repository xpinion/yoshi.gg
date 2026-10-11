// timeline.js - The Timeline page: every month of the log side by side, with what led each one.

// Rows of bands: back-to-back months led by the same thing join into one block
const TIMELINE_BANDS = [
  { label: 'Top Game', valueOf: e => e.game, game: true },
  { label: 'Top System', valueOf: e => e.system },
  { label: 'Top Genre', valueOf: e => e.genre },
  { label: 'Top Franchise', valueOf: e => e.series }
];
// A steady color for a name, so a game or system looks the same wherever it appears
function timelineColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 52% ${38 + (hash >> 9) % 12}%)`;
}

function initTimelinePage() {
  const container = document.getElementById('timeline-page-container');
  if (!container || !rawData || !rawData.allEntries) return;

  // Every month from the first entry to the latest, even ones with no play
  const months = [];
  const first = rawData.allEntries[0].date.slice(0, 7), last = dataDateKey().slice(0, 7);
  for (let [y, m] = first.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= last; m === 12 ? (y++, m = 1) : m++) {
    months.push({ key: `${y}-${String(m).padStart(2, '0')}`, year: y, month: m, seconds: 0, days: new Set(), completions: 0, tallies: TIMELINE_BANDS.map(() => new Map()) });
  }
  const byKey = Object.fromEntries(months.map(mo => [mo.key, mo]));
  rawData.allEntries.forEach(e => {
    const mo = byKey[e.date.slice(0, 7)], sec = timeStringToSeconds(e.time);
    mo.seconds += sec;
    mo.days.add(e.date.slice(0, 10));
    TIMELINE_BANDS.forEach((band, b) => {
      const val = band.valueOf(e);
      if (val && val !== 'N/A' && val !== 'ZZNONE') mo.tallies[b].set(val, (mo.tallies[b].get(val) || 0) + sec);
    });
  });
  getSortedCompletions('All-Time').forEach(pt => { const mo = byKey[pt.displayDate.toISOString().slice(0, 7)]; if (mo) mo.completions++; });
  months.forEach(mo => { mo.tops = mo.tallies.map(t => topOfMap(t, 1)[0] || null); });

  const maxSeconds = Math.max(1, ...months.map(mo => mo.seconds));
  const label = mo => `${MONTH_NAMES[mo.month - 1]} ${mo.year}`;
  const col = i => i + 2; // column 1 holds the row labels

  // Year headings, each spanning its months
  let html = '';
  const years = [...new Set(months.map(mo => mo.year))];
  years.forEach(year => {
    const start = months.findIndex(mo => mo.year === year), count = months.filter(mo => mo.year === year).length;
    html += `<a class="tl-year" href="review.html?year=${year}" style="grid-column: ${col(start)} / span ${count}; grid-row: 1;">${year}</a>`;
  });
  months.forEach((mo, i) => {
    html += `<div class="tl-month" style="grid-column: ${col(i)}; grid-row: 2;">${MONTH_NAMES[mo.month - 1].slice(0, 3)}</div>`;
    const topGame = mo.tops[0];
    const tip = `${label(mo)}: ${formatTime(mo.seconds)} over ${mo.days.size} days` + (topGame ? `. Most played: ${topGame[0]} (${formatTime(topGame[1])})` : '') + `. ${mo.completions} completion${mo.completions === 1 ? '' : 's'}`;
    html += `<div class="tl-bar-cell" style="grid-column: ${col(i)}; grid-row: 3;" title="${escapeHTML(tip)}"><div class="tl-bar" style="height: ${(mo.seconds / maxSeconds) * 100}%;"></div><span>${mo.seconds ? Math.round(mo.seconds / 3600) : ''}</span></div>`;
    html += `<div class="tl-count${mo.completions ? '' : ' tl-count-zero'}" style="grid-column: ${col(i)}; grid-row: ${4 + TIMELINE_BANDS.length};" title="${escapeHTML(label(mo))}: ${mo.completions} completion${mo.completions === 1 ? '' : 's'}">${mo.completions || ''}</div>`;
  });
  // Bands
  TIMELINE_BANDS.forEach((band, b) => {
    const row = 4 + b;
    let i = 0;
    while (i < months.length) {
      const top = months[i].tops[b];
      let j = i + 1;
      while (top && j < months.length && months[j].tops[b] && months[j].tops[b][0] === top[0]) j++;
      if (top) {
        const total = months.slice(i, j).reduce((sum, mo) => sum + mo.tops[b][1], 0);
        const span = j - i === 1 ? label(months[i]) : `${label(months[i])} to ${label(months[j - 1])}`;
        const tip = `${top[0]}: ${band.label.toLowerCase()} for ${j - i} month${j - i === 1 ? '' : 's'} (${span}), ${formatTime(total)}`;
        const style = `grid-column: ${col(i)} / span ${j - i}; grid-row: ${row}; background: ${timelineColor(top[0])};`;
        html += band.game
          ? `<a class="tl-band" href="${gameProfileUrl(top[0])}" style="${style}" title="${escapeHTML(tip)}">${escapeHTML(top[0])}</a>`
          : `<div class="tl-band" style="${style}" title="${escapeHTML(tip)}">${escapeHTML(top[0])}</div>`;
      }
      i = top ? j : i + 1;
    }
  });
  const rowLabels = ['', '', 'Hours', ...TIMELINE_BANDS.map(b => b.label), 'Completions'];
  rowLabels.forEach((text, r) => { html += `<div class="tl-label" style="grid-column: 1; grid-row: ${r + 1};">${text}</div>`; });

  container.innerHTML = `
    <div class="card-row grid-1">
      <h2 class="page-title">Timeline</h2>
      <div class="reach-intro">${months.length} months, ${label(months[0])} to ${label(months[months.length - 1])}. Scroll sideways; hover anything for details. A band runs for as long as the same game, system, genre or franchise led each month.</div>
    </div>
    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="tl-scroll" id="timeline-scroll">
          <div class="tl-grid" style="grid-template-columns: var(--tl-label) repeat(${months.length}, var(--tl-col));">${html}</div>
        </div>
      </div>
    </section>
  `;
  // Open on the newest months
  const scroller = document.getElementById('timeline-scroll');
  scroller.scrollLeft = scroller.scrollWidth;
}
