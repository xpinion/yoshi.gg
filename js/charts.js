// charts.js - The Charts page (charts.html): six pictures of the whole log.
//   Year in Pixels    every day since the log began, coloured by the genre played most that day
//   Genre River       hours (or share of hours) by genre, quarter by quarter
//   Rank Race         where each of the top series (or systems) ranked by hours, year by year
//   How Fresh         the age of the games played each year, weighted by hours
//   Replays           finishing a game again: faster or slower than before
//   Family Time       hours played with each partner, year by year, and the games played most together
// Colours: the categorical slots and ramps in dashboard.css (.viz-root), validated for colour-blind separation
// in both themes. Every mark has a hover tooltip (vizTip) and the larger charts have a "Show the numbers" table.

const VIZ_TOP_GENRES = 8;   // genres with their own colour (all eight slots); the rest are "Other"
const VIZ_RACE_LINES = 8;   // series or systems in the rank race
const VIZ_RACE_DEPTH = 10;  // ranks shown
const VIZ_AGE_BUCKETS = [
  { label: 'Released that year', max: 0 }, { label: '1–2 years old', max: 2 }, { label: '3–5 years old', max: 5 },
  { label: '6–10 years old', max: 10 }, { label: '11–20 years old', max: 20 }, { label: 'Over 20 years old', max: Infinity }
];
const VIZ_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Each chart's hover text, looked up from the hovered mark's data-viz and data-k (marks carry keys, not text)
const vizTips = {};

function initChartsPage() {
  const container = document.getElementById('charts-page-container');
  if (!container || !rawData || !rawData.allEntries) return;
  const data = chartsData();
  container.innerHTML = `
    <div class="card-row grid-1"><h2 class="page-title">Charts</h2></div>
    <div class="viz-root page-stack">
      ${vizCard('pixels', 'Year in Pixels', 'Every day since the log began, coloured by the genre played most that day. Hover a day for what was played.', yearInPixelsHtml(data))}
      ${vizCard('river', 'Genre River', 'Each genre\'s share of the hours (or the hours themselves) over the year up to each quarter, so the flow shows taste shifting rather than single busy months.', `
        <div class="viz-controls"><select id="river-mode" class="milestone-year" aria-label="Show"><option value="share">Share of hours</option><option value="hours">Hours</option></select></div>
        <div id="river-chart">${genreRiverHtml(data, 'share')}</div>`)}
      ${vizCard('race', 'Rank Race', 'Where the most-played series ranked by hours each year (top 10 shown). Hover a line to follow it.', `
        <div class="viz-controls"><select id="race-kind" class="milestone-year" aria-label="Rank"><option value="series">Series</option><option value="system">Systems</option></select></div>
        <div id="race-chart">${rankRaceHtml(data, 'series')}</div>`)}
      ${vizCard('fresh', 'How Fresh Are the Games?', 'How old each year\'s games were when they were played, by share of that year\'s hours.', howFreshHtml(data))}
      ${vizCard('replays', 'Replays: Faster or Slower?', 'Games finished more than once: the time each completion took, first to latest. Blue got faster, red got slower.', `
        <div class="viz-controls"><select id="replay-show" class="milestone-year" aria-label="Show"><option value="changes">Biggest changes</option><option value="all">All replayed games</option></select></div>
        <div id="replay-chart">${replaysHtml(data, 'changes')}</div>`)}
      ${vizCard('family', 'Family Time', 'Multiplayer hours with each partner, year by year.', familyTimeHtml(data))}
      <div id="viz-tip" class="viz-tip" hidden></div>
    </div>`;

  document.getElementById('river-mode').addEventListener('change', e => { document.getElementById('river-chart').innerHTML = genreRiverHtml(data, e.target.value); });
  document.getElementById('race-kind').addEventListener('change', e => { document.getElementById('race-chart').innerHTML = rankRaceHtml(data, e.target.value); });
  document.getElementById('replay-show').addEventListener('change', e => { document.getElementById('replay-chart').innerHTML = replaysHtml(data, e.target.value); });
  wireVizTips(container);
}

function vizCard(id, title, note, body) {
  return `
    <section class="card-row grid-1" id="chart-${id}">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>${title}</h2></div>
        <div class="card-content"><p class="viz-note">${note}</p>${body}</div>
      </div>
    </section>`;
}

// --- THE DATA ---
// One pass over the log: each day's games, the genres in colour order, and each playthrough's first completion
function chartsData() {
  const entries = rawData.allEntries;
  const genreSeconds = new Map(), days = new Map();
  const genreOf = e => (e.genre && e.genre !== 'Unknown' && e.genre !== 'N/A') ? e.genre : null;
  entries.forEach(e => {
    const sec = timeStringToSeconds(e.time), day = e.date.slice(0, 10), genre = genreOf(e);
    if (genre) genreSeconds.set(genre, (genreSeconds.get(genre) || 0) + sec);
    if (!days.has(day)) days.set(day, new Map());
    const games = days.get(day);
    games.set(e.game, { sec: ((games.get(e.game) || {}).sec || 0) + sec, genre });
  });
  // The top genres by all-time hours take the colour slots in that order; the order never changes on the page
  const genres = [...genreSeconds.entries()].sort((a, b) => b[1] - a[1]).slice(0, VIZ_TOP_GENRES).map(([g]) => g);
  const genreGroup = genre => genres.includes(genre) ? genre : 'Other';
  return { entries, days, genres, genreGroup, last: dataDateKey() };
}
const vizGenreColor = (data, group) => group === 'Other' ? 'var(--viz-other)' : `var(--series-${data.genres.indexOf(group) + 1})`;
// Round axis ticks: steps of 1, 2 or 5 times a power of ten, enough to cover max in about four steps
function vizTicks(max) {
  const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw);
  const ticks = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(t);
  return ticks;
}
const vizHours = sec => sec >= 36000 ? `${Math.round(sec / 3600)}h` : formatTime(sec);

function vizLegendHtml(items) {
  return `<div class="viz-legend">${items.map(([label, color, extra]) => `<span><i style="background:${color}"></i>${escapeHTML(label)}${extra ? ` <em>${extra}</em>` : ''}</span>`).join('')}</div>`;
}
const vizText = (x, y, str, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${str}</text>`;
// One segment of a stacked bar, from bottom (px up from the baseline) for h px: every segment above the first
// leaves a 2px gap under it, and only the topmost has rounded corners
function vizSegment(cx, barW, baseY, bottom, h, isTop, fill, attrs) {
  const gap = bottom > 0 ? 2 : 0, height = Math.max(0, h - gap);
  return `<rect x="${(cx - barW / 2).toFixed(1)}" y="${(baseY - bottom - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}" rx="${isTop ? 3 : 0}" fill="${fill}" ${attrs}/>`;
}

// --- 1. YEAR IN PIXELS ---
function yearInPixelsHtml(data) {
  const firstYear = Number(data.entries[0].date.slice(0, 4)), lastYear = Number(data.last.slice(0, 4));
  const years = []; for (let y = firstYear; y <= lastYear; y++) years.push(y);
  const padL = 52, padT = 26, cellW = 2.6, rowH = 20, gap = 6, width = padL + 366 * cellW + 8, height = padT + years.length * (rowH + gap);
  const dayIndex = d => Math.round((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(+d.slice(0, 4), 0, 1)) / 86400000);
  // Each day's genre: the one with the most seconds that day
  const dayGenre = new Map(), count = new Map();
  data.days.forEach((games, day) => {
    const byGenre = new Map();
    games.forEach(g => { const k = data.genreGroup(g.genre); byGenre.set(k, (byGenre.get(k) || 0) + g.sec); });
    const top = [...byGenre.entries()].sort((a, b) => b[1] - a[1])[0][0];
    dayGenre.set(day, top);
    count.set(top, (count.get(top) || 0) + 1);
  });
  let svg = `<svg class="viz-svg viz-pixels" viewBox="0 0 ${width} ${height}" role="img" aria-label="Year in pixels: each day coloured by the genre played most">`;
  // Month ticks along the top, at their place in a non-leap year
  let doy = 0;
  VIZ_MONTHS.forEach((m, i) => {
    svg += vizText(padL + doy * cellW, padT - 9, m, 'class="viz-axis"');
    doy += [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i];
  });
  years.forEach((year, row) => {
    const y = padT + row * (rowH + gap);
    svg += vizText(padL - 8, y + rowH / 2 + 4, year, 'class="viz-axis" text-anchor="end"');
    const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
    for (let i = 0; i < daysInYear; i++) {
      const date = new Date(Date.UTC(year, 0, 1 + i)).toISOString().slice(0, 10);
      if (date > data.last) break;
      const genre = dayGenre.get(date);
      svg += `<rect x="${(padL + i * cellW).toFixed(1)}" y="${y}" width="${(cellW - 0.4).toFixed(1)}" height="${rowH}" rx="0.6" fill="${genre ? vizGenreColor(data, genre) : 'var(--viz-empty)'}" data-viz="pixels" data-k="${date}"/>`;
    }
  });
  svg += '</svg>';
  vizTips.pixels = date => {
    const games = data.days.get(date);
    if (!games) return `<b>${formatFullDate(date)}</b><div>Nothing played</div>`;
    const list = [...games.entries()].sort((a, b) => b[1].sec - a[1].sec);
    return `<b>${formatFullDate(date)}</b> · ${escapeHTML(dayGenre.get(date))}${list.map(([game, g]) => `<div>${escapeHTML(game)} <span>${formatTime(g.sec)}</span></div>`).join('')}`;
  };
  const playedDays = [...count.values()].reduce((a, b) => a + b, 0);
  return `<div class="viz-scroll">${svg}</div>` + vizLegendHtml([...data.genres, 'Other'].map(g => [g, vizGenreColor(data, g), `${Math.round((count.get(g) || 0) / playedDays * 100)}% of days`]).concat([['Nothing played', 'var(--viz-empty)']]));
}

// --- 2. GENRE RIVER ---
function genreRiverHtml(data, mode) {
  const groups = [...data.genres, 'Other'];
  // Seconds per quarter and genre group
  const quarters = [], byQuarter = new Map();
  const qKey = d => `${d.slice(0, 4)} Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}`;
  const firstYear = +data.entries[0].date.slice(0, 4), lastKey = qKey(data.last);
  for (let y = firstYear; ; y++) {
    let done = false;
    for (let q = 1; q <= 4; q++) { const k = `${y} Q${q}`; quarters.push(k); byQuarter.set(k, new Map()); if (k === lastKey) { done = true; break; } }
    if (done) break;
  }
  data.entries.forEach(e => {
    const m = byQuarter.get(qKey(e.date.slice(0, 10)));
    if (!m) return;
    const g = data.genreGroup(e.genre);
    m.set(g, (m.get(g) || 0) + timeStringToSeconds(e.time));
  });
  // Each point is the year up to that quarter (it and the three before), which smooths out one-off busy months
  const rolling = quarters.map((q, i) => {
    const m = new Map();
    for (let j = Math.max(0, i - 3); j <= i; j++) byQuarter.get(quarters[j]).forEach((s, g) => m.set(g, (m.get(g) || 0) + s));
    return m;
  });
  const totals = rolling.map(m => [...m.values()].reduce((a, b) => a + b, 0));
  const value = (q, g) => { const s = rolling[q].get(g) || 0; return mode === 'share' ? (totals[q] ? s / totals[q] : 0) : s / 3600; };
  const width = 1000, height = 380, padL = 52, padR = 150, padT = 14, padB = 30, innerW = width - padL - padR, innerH = height - padT - padB;
  const maxY = mode === 'share' ? 1 : Math.max(...quarters.map((q, i) => totals[i] / 3600)) * 1.05;
  const x = i => padL + (i / (quarters.length - 1)) * innerW, y = v => padT + innerH - (v / maxY) * innerH;
  // Stacked in colour order, the biggest genre at the bottom
  const tops = quarters.map(() => 0);
  const layers = groups.map(g => {
    const bottom = tops.slice();
    quarters.forEach((q, i) => { tops[i] += value(i, g); });
    return { g, bottom, top: tops.slice() };
  });
  let svg = `<svg class="viz-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Genre river">`;
  const ticks = mode === 'share' ? [0, 0.25, 0.5, 0.75, 1] : vizTicks(maxY);
  ticks.forEach(t => {
    svg += `<line x1="${padL}" x2="${padL + innerW}" y1="${y(t)}" y2="${y(t)}" class="viz-grid"/>`;
    svg += vizText(padL - 8, y(t) + 4, mode === 'share' ? `${Math.round(t * 100)}%` : `${t}h`, 'class="viz-axis" text-anchor="end"');
  });
  layers.forEach(l => {
    const top = quarters.map((q, i) => `${x(i).toFixed(1)},${y(l.top[i]).toFixed(1)}`).join(' ');
    const bottom = quarters.map((q, i) => `${x(i).toFixed(1)},${y(l.bottom[i]).toFixed(1)}`).reverse().join(' ');
    svg += `<polygon points="${top} ${bottom}" fill="${vizGenreColor(data, l.g)}" class="viz-band"/>`;
  });
  quarters.forEach((q, i) => { if (q.endsWith('Q1')) svg += vizText(x(i), height - 10, q.slice(0, 4), 'class="viz-axis" text-anchor="middle"'); });
  svg += `<line x1="${padL}" x2="${padL + innerW}" y1="${y(0)}" y2="${y(0)}" class="viz-baseline"/>`;
  // Labels at the right end, beside each band's last stretch, nudged apart so none overlap
  const ends = layers.map(l => ({ g: l.g, mid: y((l.top[quarters.length - 1] + l.bottom[quarters.length - 1]) / 2) })).sort((a, b) => a.mid - b.mid);
  for (let i = 1; i < ends.length; i++) ends[i].mid = Math.max(ends[i].mid, ends[i - 1].mid + 15);
  // Pushed past the bottom: move the whole stack of labels back up
  const over = ends.length ? ends[ends.length - 1].mid - (padT + innerH - 4) : 0;
  if (over > 0) ends.forEach(e => { e.mid -= over; });
  ends.forEach(e => {
    svg += `<rect x="${padL + innerW + 8}" y="${e.mid - 5}" width="10" height="10" rx="2" fill="${vizGenreColor(data, e.g)}"/>`;
    svg += vizText(padL + innerW + 24, e.mid + 4, escapeHTML(e.g), 'class="viz-label"');
  });
  // Hover: one strip per quarter, with a line marking it
  svg += `<line id="river-cursor" class="viz-cursor" x1="0" x2="0" y1="${padT}" y2="${padT + innerH}" visibility="hidden"/>`;
  quarters.forEach((q, i) => {
    const w = innerW / (quarters.length - 1);
    svg += `<rect x="${x(i) - w / 2}" y="${padT}" width="${w}" height="${innerH}" fill="transparent" data-viz="river" data-k="${i}" data-cx="${x(i)}"/>`;
  });
  svg += '</svg>';
  vizTips.river = i => {
    const rows = groups.map(g => [g, rolling[i].get(g) || 0]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
    return `<b>Year to ${quarters[i]}</b> · ${formatTime(totals[i])}${rows.map(([g, s]) => `<div><i style="background:${vizGenreColor(data, g)}"></i>${escapeHTML(g)} <span>${formatTime(s)} · ${Math.round(s / totals[i] * 100)}%</span></div>`).join('')}`;
  };
  const table = `<details class="viz-table"><summary>Show the numbers</summary><div class="monthly-table-wrapper"><table class="monthly-table">
    <thead><tr><th>Quarter</th>${groups.map(g => `<th>${escapeHTML(g)}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${quarters.map(q => { const m = byQuarter.get(q), t = [...m.values()].reduce((a, b) => a + b, 0); return `<tr><td class="text-left">${q}</td>${groups.map(g => `<td>${formatTime(m.get(g) || 0)}</td>`).join('')}<td>${formatTime(t)}</td></tr>`; }).join('')}</tbody>
  </table></div></details>`;
  return `<div class="viz-scroll">${svg}</div>${vizLegendHtml(groups.map(g => [g, vizGenreColor(data, g)]))}${table}`;
}

// --- 3. RANK RACE ---
function rankRaceHtml(data, kind) {
  const keyOf = e => kind === 'series' ? e.series : e.system;
  const byYear = new Map(), overall = new Map();
  data.entries.forEach(e => {
    const k = keyOf(e);
    if (!k || k === 'N/A' || k === 'ZZNONE') return;
    const year = e.date.slice(0, 4), sec = timeStringToSeconds(e.time);
    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year).set(k, (byYear.get(year).get(k) || 0) + sec);
    overall.set(k, (overall.get(k) || 0) + sec);
  });
  const years = [...byYear.keys()].sort();
  // Each year's ranks, among every series (or system) played that year
  const rank = new Map();
  years.forEach(y => [...byYear.get(y).entries()].sort((a, b) => b[1] - a[1]).forEach(([k], i) => rank.set(`${y}|${k}`, i + 1)));
  const lines = [...overall.entries()].sort((a, b) => b[1] - a[1]).slice(0, VIZ_RACE_LINES).map(([k]) => k);
  const width = 1000, height = 380, padL = 44, padR = 190, padT = 20, padB = 34, innerW = width - padL - padR, innerH = height - padT - padB;
  const x = i => padL + (i / Math.max(years.length - 1, 1)) * innerW, y = r => padT + ((r - 1) / (VIZ_RACE_DEPTH - 1)) * innerH;
  let svg = `<svg class="viz-svg viz-race" viewBox="0 0 ${width} ${height}" role="img" aria-label="Rank race">`;
  for (let r = 1; r <= VIZ_RACE_DEPTH; r++) {
    svg += `<line x1="${padL}" x2="${padL + innerW}" y1="${y(r)}" y2="${y(r)}" class="viz-grid"/>`;
    svg += vizText(padL - 10, y(r) + 4, `#${r}`, 'class="viz-axis" text-anchor="end"');
  }
  years.forEach((yr, i) => { svg += vizText(x(i), height - 10, yr, 'class="viz-axis" text-anchor="middle"'); });
  const ends = [];
  lines.forEach((k, li) => {
    const color = `var(--series-${li + 1})`;
    let g = `<g class="viz-line" data-line="${li}">`, path = '', prev = false;
    years.forEach((yr, i) => {
      const r = rank.get(`${yr}|${k}`);
      if (r && r <= VIZ_RACE_DEPTH) { path += `${prev ? 'L' : 'M'}${x(i).toFixed(1)},${y(r).toFixed(1)}`; prev = true; } else prev = false;
    });
    g += `<path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    let last = null;
    years.forEach((yr, i) => {
      const r = rank.get(`${yr}|${k}`);
      if (!r || r > VIZ_RACE_DEPTH) return;
      g += `<circle cx="${x(i)}" cy="${y(r)}" r="5.5" fill="${color}" stroke="var(--card-bg)" stroke-width="2" data-viz="race" data-k="${li}|${yr}"/>`;
      last = { i, r };
    });
    if (last) ends.push({ li, k, yPos: y(last.r), x: x(last.i), color });
    svg += g + '</g>';
  });
  // A name beside each line's last point; names ending in the same spot are stacked apart
  ends.sort((a, b) => a.yPos - b.yPos);
  ends.forEach((e, i) => {
    const clash = ends.slice(0, i).filter(o => Math.abs(o.x - e.x) < 1 && Math.abs(o.yPos - e.yPos) < 14).length;
    const lx = e.x + 12, ly = e.yPos + 4 + clash * 14;
    svg += vizText(lx, ly, escapeHTML(e.k.length > 26 ? e.k.slice(0, 25) + '…' : e.k), `class="viz-label viz-race-name" data-line="${e.li}"`);
  });
  svg += '</svg>';
  vizTips.race = key => {
    const [li, yr] = key.split('|'), k = lines[li];
    return `<b>${escapeHTML(k)}</b> · ${yr}<div>#${rank.get(`${yr}|${k}`)} with ${formatTime(byYear.get(yr).get(k))}</div><div>${formatTime(overall.get(k))} all-time</div>`;
  };
  const table = `<details class="viz-table"><summary>Show the numbers</summary><div class="monthly-table-wrapper"><table class="monthly-table">
    <thead><tr><th>${kind === 'series' ? 'Series' : 'System'}</th>${years.map(yr => `<th>${yr}</th>`).join('')}</tr></thead>
    <tbody>${lines.map(k => `<tr><td class="text-left">${escapeHTML(k)}</td>${years.map(yr => { const r = rank.get(`${yr}|${k}`); return `<td>${r ? `#${r}` : '–'}</td>`; }).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
  return `<div class="viz-scroll">${svg}</div>${vizLegendHtml(lines.map((k, i) => [k, `var(--series-${i + 1})`, vizHours(overall.get(k))]))}${table}`;
}

// --- 4. HOW FRESH ---
function howFreshHtml(data) {
  const years = new Map(), unknown = new Map(), topGame = new Map();
  data.entries.forEach(e => {
    const year = +e.date.slice(0, 4), sec = timeStringToSeconds(e.time), released = parseInt(e.releaseYear, 10);
    if (!years.has(year)) years.set(year, VIZ_AGE_BUCKETS.map(() => 0));
    if (!released) { unknown.set(year, (unknown.get(year) || 0) + sec); return; }
    const b = VIZ_AGE_BUCKETS.findIndex(bucket => Math.max(0, year - released) <= bucket.max);
    years.get(year)[b] += sec;
    const k = `${year}|${b}`, games = topGame.get(k) || new Map();
    games.set(e.game, (games.get(e.game) || 0) + sec);
    topGame.set(k, games);
  });
  const list = [...years.keys()].sort((a, b) => a - b);
  const width = 1000, height = 360, padL = 52, padR = 16, padT = 16, padB = 34, innerW = width - padL - padR, innerH = height - padT - padB;
  const slot = innerW / list.length, barW = Math.min(56, slot - 14);
  let svg = `<svg class="viz-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="How old the games played each year were">`;
  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    const y = padT + innerH - t * innerH;
    svg += `<line x1="${padL}" x2="${padL + innerW}" y1="${y}" y2="${y}" class="viz-grid"/>` + vizText(padL - 8, y + 4, `${t * 100}%`, 'class="viz-axis" text-anchor="end"');
  });
  list.forEach((year, i) => {
    const parts = years.get(year), total = parts.reduce((a, b) => a + b, 0);
    const cx = padL + slot * i + slot / 2;
    let acc = 0;
    const lastBucket = parts.reduce((top, sec, b) => sec ? b : top, -1);
    parts.forEach((sec, b) => {
      if (!sec) return;
      const h = sec / total * innerH;
      svg += vizSegment(cx, barW, padT + innerH, acc, h, b === lastBucket, `var(--age-${b + 1})`, `data-viz="fresh" data-k="${year}|${b}"`);
      acc += h;
    });
    svg += vizText(cx, height - 12, year, 'class="viz-axis" text-anchor="middle"');
  });
  svg += '</svg>';
  vizTips.fresh = key => {
    const [year, b] = key.split('|').map(Number), parts = years.get(year), total = parts.reduce((a, c) => a + c, 0);
    const games = [...(topGame.get(key) || new Map()).entries()].sort((a, c) => c[1] - a[1]).slice(0, 3);
    return `<b>${year}</b> · ${VIZ_AGE_BUCKETS[b].label}<div>${formatTime(parts[b])} · ${Math.round(parts[b] / total * 100)}% of the year</div>${games.map(([g, s]) => `<div>${escapeHTML(g)} <span>${formatTime(s)}</span></div>`).join('')}`;
  };
  // The headline: how much of the latest year went to games out that year or the year before, against the first
  const newShare = year => { const p = years.get(year), t = p.reduce((a, b) => a + b, 0); return t ? Math.round((p[0] + p[1]) / t * 100) : 0; };
  const first = list[0], last = list[list.length - 1];
  const lead = `<p class="viz-lead">Games no more than 2 years old: <b>${newShare(first)}%</b> of hours in ${first}, <b>${newShare(last)}%</b> in ${last}.</p>`;
  const table = `<details class="viz-table"><summary>Show the numbers</summary><div class="monthly-table-wrapper"><table class="monthly-table">
    <thead><tr><th>Year</th>${VIZ_AGE_BUCKETS.map(b => `<th>${b.label}</th>`).join('')}<th>No release year</th></tr></thead>
    <tbody>${list.map(year => `<tr><td class="text-left">${year}</td>${years.get(year).map(s => `<td>${formatTime(s)}</td>`).join('')}<td>${formatTime(unknown.get(year) || 0)}</td></tr>`).join('')}</tbody>
  </table></div></details>`;
  return lead + `<div class="viz-scroll">${svg}</div>` + vizLegendHtml(VIZ_AGE_BUCKETS.map((b, i) => [b.label, `var(--age-${i + 1})`])) + table;
}

// --- 5. REPLAYS ---
function replayGames(data) {
  // Each playthrough's first Completed (or M-Completed) entry: the time it had taken by then
  const done = new Map();
  data.entries.forEach(e => {
    if (!['Completed', 'M-Completed'].includes(e.status) || !e.ptTag || done.has(e.ptTag)) return;
    done.set(e.ptTag, { game: e.game, tag: e.ptTag, date: e.date.slice(0, 10), sec: timeStringToSeconds(e.ptLifetime), system: e.system });
  });
  const byGame = new Map();
  done.forEach(d => { if (d.sec > 0) { if (!byGame.has(d.game)) byGame.set(d.game, []); byGame.get(d.game).push(d); } });
  return [...byGame.entries()].filter(([, list]) => list.length > 1).map(([game, list]) => {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const first = list[0], latest = list[list.length - 1];
    return { game, list, change: (latest.sec - first.sec) / first.sec };
  });
}
function replaysHtml(data, show) {
  let games = replayGames(data).sort((a, b) => a.change - b.change);
  const faster = games.filter(g => g.change < 0).length, slower = games.filter(g => g.change > 0).length;
  if (show === 'changes') games = [...games.slice(0, 12), ...games.slice(-12).filter(g => !games.slice(0, 12).includes(g))];
  const rowH = 30, padL = 300, padR = 90, padT = 30, width = 1000, innerW = width - padL - padR, height = padT + games.length * rowH + 10;
  const all = games.flatMap(g => g.list.map(d => d.sec / 3600));
  const lo = Math.max(0.1, Math.min(...all)), hi = Math.max(...all);
  // Hours on a log scale: a 1-hour game and a 60-hour one both get room
  const x = h => padL + (Math.log(Math.max(h, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1) * innerW;
  let svg = `<svg class="viz-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Replays, first to latest completion time">`;
  [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100].filter(h => h >= lo * 0.9 && h <= hi * 1.1).forEach(h => {
    svg += `<line x1="${x(h)}" x2="${x(h)}" y1="${padT - 6}" y2="${height - 6}" class="viz-grid"/>` + vizText(x(h), padT - 12, h < 1 ? `${h * 60}m` : `${h}h`, 'class="viz-axis" text-anchor="middle"');
  });
  games.forEach((g, i) => {
    const cy = padT + i * rowH + rowH / 2, color = g.change < 0 ? 'var(--viz-faster)' : g.change > 0 ? 'var(--viz-slower)' : 'var(--viz-other)';
    const first = g.list[0], latest = g.list[g.list.length - 1];
    svg += vizText(padL - 14, cy + 4, escapeHTML(g.game.length > 38 ? g.game.slice(0, 37) + '…' : g.game), 'class="viz-label" text-anchor="end"');
    svg += `<line x1="${x(first.sec / 3600)}" x2="${x(latest.sec / 3600)}" y1="${cy}" y2="${cy}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
    g.list.forEach((d, n) => {
      const isEnd = n === 0 || n === g.list.length - 1;
      svg += `<circle cx="${x(d.sec / 3600)}" cy="${cy}" r="${isEnd ? 6 : 4.5}" fill="${n === 0 ? 'var(--card-bg)' : color}" stroke="${color}" stroke-width="2.5" data-viz="replay" data-k="${i}|${n}"/>`;
    });
    // The change in words beside the row, with an arrow so it isn't colour alone
    const pct = Math.round(g.change * 100);
    svg += vizText(padL + innerW + 16, cy + 4, `${pct < 0 ? '↓' : pct > 0 ? '↑' : '='} ${Math.abs(pct)}%`, 'class="viz-label viz-change"');
  });
  svg += '</svg>';
  vizTips.replay = key => {
    const [i, n] = key.split('|').map(Number), g = games[i], d = g.list[n];
    return `<b>${escapeHTML(g.game)}</b><div>Completion ${n + 1} of ${g.list.length}: ${formatTime(d.sec)}</div><div>${formatFullDate(d.date)} · ${escapeHTML(d.system)} · ${escapeHTML(d.tag)}</div>`;
  };
  const lead = `<p class="viz-lead">${faster + slower} replayed games: <b>${faster}</b> finished faster the latest time, <b>${slower}</b> slower. A hollow dot is the first completion, a filled one later ones. Different modes or campaigns of the same game count as replays.</p>`;
  return lead + `<div class="viz-scroll">${svg}</div>` + vizLegendHtml([['Faster than the first time', 'var(--viz-faster)'], ['Slower than the first time', 'var(--viz-slower)']]);
}

// --- 6. FAMILY TIME ---
function familyTimeHtml(data) {
  const partners = getPartners();
  if (!partners.length) return '<div class="loading-text">The partner list arrives with the next data sync.</div>';
  // Each multiplayer session goes to the one partner it names, or to "Together" when it names them all
  const groups = [...partners.map(p => p.name), partners.length > 1 ? 'Together' : null].filter(Boolean);
  const named = e => partners.filter(p => p.noteNames.some(n => (e.note || '').toUpperCase().includes(n)));
  const byYear = new Map(), games = new Map(groups.map(g => [g, new Map()]));
  data.entries.forEach(e => {
    if (!isMultiplayerEntry(e)) return;
    const who = named(e);
    if (!who.length) return;
    const group = who.length === partners.length && partners.length > 1 ? 'Together' : who.length === 1 ? who[0].name : null;
    if (!group) return;
    const year = e.date.slice(0, 4), sec = timeStringToSeconds(e.time);
    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year).set(group, (byYear.get(year).get(group) || 0) + sec);
    games.get(group).set(e.game, (games.get(group).get(e.game) || 0) + sec);
  });
  const years = [...byYear.keys()].sort();
  const color = g => `var(--series-${groups.indexOf(g) + 1})`;
  const width = 1000, height = 320, padL = 52, padR = 16, padT = 16, padB = 34, innerW = width - padL - padR, innerH = height - padT - padB;
  const ticks = vizTicks(Math.max(...years.map(y => [...byYear.get(y).values()].reduce((a, b) => a + b, 0))) / 3600 * 1.08);
  const maxH = ticks[ticks.length - 1] * 1.04;
  const slot = innerW / years.length, barW = Math.min(56, slot - 14);
  let svg = `<svg class="viz-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Family time by year">`;
  ticks.forEach(v => {
    const y = padT + innerH - (v / maxH) * innerH;
    svg += `<line x1="${padL}" x2="${padL + innerW}" y1="${y}" y2="${y}" class="viz-grid"/>` + vizText(padL - 8, y + 4, `${v}h`, 'class="viz-axis" text-anchor="end"');
  });
  years.forEach((year, i) => {
    const cx = padL + slot * i + slot / 2;
    let acc = 0;
    const total = [...byYear.get(year).values()].reduce((a, b) => a + b, 0);
    const topGroup = groups.reduce((top, g, gi) => byYear.get(year).get(g) ? gi : top, -1);
    groups.forEach((g, gi) => {
      const sec = byYear.get(year).get(g) || 0;
      if (!sec) return;
      const h = (sec / 3600) / maxH * innerH;
      svg += vizSegment(cx, barW, padT + innerH, acc, h, gi === topGroup, color(g), `data-viz="family" data-k="${year}|${gi}"`);
      acc += h;
    });
    svg += vizText(cx, height - 12, year, 'class="viz-axis" text-anchor="middle"');
    svg += vizText(cx, padT + innerH - acc - 6, vizHours(total), 'class="viz-label" text-anchor="middle"');
  });
  svg += '</svg>';
  vizTips.family = key => {
    const [year, gi] = key.split('|'), g = groups[gi];
    return `<b>${year}</b> · ${escapeHTML(g)}<div>${formatTime(byYear.get(year).get(g))}</div>`;
  };
  const tops = groups.map(g => {
    const list = [...games.get(g).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const total = [...games.get(g).values()].reduce((a, b) => a + b, 0);
    return `<div class="viz-top"><h3><i style="background:${color(g)}"></i>${escapeHTML(g)} <em>${formatTime(total)}</em></h3>
      <ol>${list.map(([game, s]) => `<li><span class="hover-trigger" data-game="${escapeHTML(game)}">${escapeHTML(game)}</span> <em>${formatTime(s)}</em></li>`).join('')}</ol></div>`;
  }).join('');
  return `<div class="viz-scroll">${svg}</div>${vizLegendHtml(groups.map(g => [g, color(g)]))}<div class="viz-tops">${tops}</div>`;
}

// --- HOVER ---
// One tooltip for the page: a mark with data-viz and data-k shows its chart's text; the rank race also lights up
// the hovered line and the river moves its cursor line.
function wireVizTips(root) {
  const tip = document.getElementById('viz-tip');
  const show = (target, x, y) => {
    const make = vizTips[target.dataset.viz];
    if (!make) return;
    tip.innerHTML = make(target.dataset.k);
    tip.hidden = false;
    const box = tip.getBoundingClientRect(), left = Math.min(x + 14, window.innerWidth - box.width - 8), top = y + 16 + box.height > window.innerHeight ? y - box.height - 12 : y + 16;
    tip.style.left = `${Math.max(8, left)}px`; tip.style.top = `${Math.max(8, top)}px`;
    if (target.dataset.viz === 'river') {
      const cursor = target.ownerSVGElement.querySelector('#river-cursor');
      cursor.setAttribute('x1', target.dataset.cx); cursor.setAttribute('x2', target.dataset.cx); cursor.setAttribute('visibility', 'visible');
    }
  };
  const hide = () => {
    tip.hidden = true;
    root.querySelectorAll('#river-cursor').forEach(c => c.setAttribute('visibility', 'hidden'));
    root.querySelectorAll('.viz-race.focus').forEach(svg => { svg.classList.remove('focus'); svg.querySelectorAll('.hot').forEach(el => el.classList.remove('hot')); });
  };
  root.addEventListener('pointermove', e => {
    const target = e.target.closest('[data-viz]');
    const line = e.target.closest('.viz-race [data-line]');
    root.querySelectorAll('.viz-race.focus').forEach(svg => { if (!line || !svg.contains(line)) { svg.classList.remove('focus'); svg.querySelectorAll('.hot').forEach(el => el.classList.remove('hot')); } });
    if (line) {
      const svg = line.ownerSVGElement;
      svg.classList.add('focus');
      svg.querySelectorAll('.hot').forEach(el => el.classList.remove('hot'));
      svg.querySelectorAll(`[data-line="${line.dataset.line}"]`).forEach(el => el.classList.add('hot'));
    }
    if (target) show(target, e.clientX, e.clientY); else { tip.hidden = true; root.querySelectorAll('#river-cursor').forEach(c => c.setAttribute('visibility', 'hidden')); }
  });
  root.addEventListener('pointerleave', hide);
  document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
}
