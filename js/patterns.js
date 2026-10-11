// patterns.js - The Patterns page: what gets played at which time of year, and how each system rose and faded.

const SEASONALITY_KINDS = [
  { id: 'genre', label: 'Genres', valueOf: e => e.genre },
  { id: 'system', label: 'Systems', valueOf: e => e.system },
  { id: 'series', label: 'Franchises', valueOf: e => e.series }
];
const SEASONALITY_ROWS = 15;
// Systems with less total time than this are left off the lifecycle chart
const LIFECYCLE_MIN_HOURS = 20;

function initPatternsPage() {
  const container = document.getElementById('patterns-page-container');
  if (!container || !rawData || !rawData.allEntries) return;

  container.innerHTML = `
    <div class="card-row grid-1"><h2 class="page-title">Patterns</h2></div>
    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header">
          <h2>Seasonality:
            <select id="seasonality-kind" class="header-dropdown">${SEASONALITY_KINDS.map(k => `<option value="${k.id}">${k.label}</option>`).join('')}</select>
          </h2>
        </div>
        <div class="card-content" id="seasonality-content"></div>
      </div>
    </section>
    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>System Lifecycles</h2></div>
        <div class="card-content">${systemLifecyclesHtml()}</div>
      </div>
    </section>
  `;
  const select = document.getElementById('seasonality-kind');
  const render = () => { document.getElementById('seasonality-content').innerHTML = seasonalityHtml(SEASONALITY_KINDS.find(k => k.id === select.value)); };
  select.addEventListener('change', render);
  render();
}

// Each cell: the share of all the time ever played in that calendar month that went to the row's genre (or system,
// or franchise). Shading is relative to the row's own best month, so every row shows when it peaks.
function seasonalityHtml(kind) {
  const monthTotals = Array(12).fill(0);
  const items = new Map();
  let allSeconds = 0;
  rawData.allEntries.forEach(e => {
    const m = Number(e.date.slice(5, 7)) - 1, sec = timeStringToSeconds(e.time);
    monthTotals[m] += sec;
    allSeconds += sec;
    const val = kind.valueOf(e);
    if (!val || val === 'N/A' || val === 'ZZNONE') return;
    const item = items.get(val) || { name: val, total: 0, months: Array(12).fill(0) };
    item.total += sec;
    item.months[m] += sec;
    items.set(val, item);
  });
  const rows = [...items.values()].sort((a, b) => b.total - a.total).slice(0, SEASONALITY_ROWS);
  const page = { genre: 'genre.html', system: 'systems.html', series: 'franchise.html' }[kind.id];

  return `
    <div class="goty-gap-subtitle">The ${rows.length} most played ${kind.label.toLowerCase()}. Each cell is the share of that calendar month's play time, across every year, and the shading shows where each row peaks.</div>
    <div class="monthly-table-wrapper">
      <table class="season-table">
        <thead><tr><th></th>${MONTH_NAMES.map(n => `<th>${n.slice(0, 3)}</th>`).join('')}<th>All Year</th><th>Peak</th></tr></thead>
        <tbody>${rows.map(item => {
          const shares = item.months.map((sec, m) => sec / Math.max(1, monthTotals[m]));
          const max = Math.max(...shares), overall = item.total / allSeconds;
          const peak = shares.indexOf(max);
          return `<tr>
            <th class="season-name"><a href="${page}?item=${encodeURIComponent(item.name)}">${escapeHTML(item.name)}</a></th>
            ${shares.map((share, m) => `<td style="background: rgba(46, 125, 50, ${(0.08 + 0.92 * (share / max)).toFixed(2)}); color: ${share / max > 0.55 ? '#fff' : 'var(--text-title)'};" title="${escapeHTML(item.name)} in ${MONTH_NAMES[m]}: ${formatTime(item.months[m])} across all years, ${(share * 100).toFixed(1)}% of ${MONTH_NAMES[m]}'s play time (${(share / overall).toFixed(2)}× its usual share)">${(share * 100).toFixed(0)}%</td>`).join('')}
            <td class="season-total">${(overall * 100).toFixed(1)}%</td>
            <td class="season-total">${MONTH_NAMES[peak].slice(0, 3)} <span class="hub-sub">${(max / overall).toFixed(1)}×</span></td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
}

// One row per system, oldest first: hours per quarter as a filled curve scaled to the system's own best quarter
function systemLifecyclesHtml() {
  const quarterOf = date => Number(date.slice(0, 4)) * 4 + Math.floor((Number(date.slice(5, 7)) - 1) / 3);
  const firstQuarter = quarterOf(rawData.allEntries[0].date), lastQuarter = quarterOf(dataDateKey());
  const quarters = lastQuarter - firstQuarter + 1;
  const today = Date.parse(dataDateKey());
  const systems = new Map();
  rawData.allEntries.forEach(e => {
    const sec = timeStringToSeconds(e.time);
    const s = systems.get(e.system) || { name: e.system, total: 0, quarters: Array(quarters).fill(0), first: e.date, last: e.date, launch: 0, games: new Set(), lastYear: 0 };
    s.total += sec;
    s.quarters[quarterOf(e.date) - firstQuarter] += sec;
    s.last = e.date;
    s.games.add(e.game);
    if ((Date.parse(e.date.slice(0, 10)) - Date.parse(s.first.slice(0, 10))) / 86400000 < 30) s.launch += sec;
    if ((today - Date.parse(e.date.slice(0, 10))) / 86400000 < 365) s.lastYear += sec;
    systems.set(e.system, s);
  });
  const rows = [...systems.values()].filter(s => s.total >= LIFECYCLE_MIN_HOURS * 3600).sort((a, b) => a.first.localeCompare(b.first) || b.total - a.total);
  const quarterLabel = q => `Q${((q + firstQuarter) % 4) + 1} ${Math.floor((q + firstQuarter) / 4)}`;

  const width = 1000, padL = 70, padR = 150, rowH = 44, top = 26;
  const innerW = width - padL - padR, height = top + rows.length * rowH + 10;
  const x = q => padL + (q / Math.max(1, quarters - 1)) * innerW;
  let svg = `<svg class="hub-chart" viewBox="0 0 ${width} ${height}">`;
  for (let q = 0; q < quarters; q++) {
    if ((q + firstQuarter) % 4 !== 0 && q !== 0) continue;
    svg += `<line x1="${x(q)}" y1="${top - 6}" x2="${x(q)}" y2="${height - 6}" stroke="var(--border-table)" />`;
    svg += `<text x="${x(q) + 4}" y="14" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="var(--text-muted)">${Math.floor((q + firstQuarter) / 4)}</text>`;
  }
  rows.forEach((s, r) => {
    const base = top + (r + 1) * rowH - 8, peak = Math.max(...s.quarters), peakAt = s.quarters.indexOf(peak);
    const y = sec => base - (sec / peak) * (rowH - 12);
    const color = timelineSystemColor(s.name);
    const firstQ = quarterOf(s.first) - firstQuarter, lastQ = quarterOf(s.last) - firstQuarter;
    let path = `M${x(firstQ).toFixed(1)},${base}`;
    for (let q = firstQ; q <= lastQ; q++) path += ` L${x(q).toFixed(1)},${y(s.quarters[q]).toFixed(1)}`;
    path += ` L${x(lastQ).toFixed(1)},${base} Z`;
    svg += `<line x1="${padL}" y1="${base}" x2="${width - padR}" y2="${base}" stroke="var(--border-light)" />`;
    svg += `<path d="${path}" fill="${color}" opacity="0.8"><title>${escapeHTML(s.name)}: ${formatTime(s.total)} from ${formatFullDate(s.first)} to ${formatFullDate(s.last)}</title></path>`;
    svg += `<circle cx="${x(peakAt)}" cy="${y(peak)}" r="4" fill="${color}" stroke="var(--card-bg)" stroke-width="1.5"><title>${escapeHTML(s.name)} peak: ${formatTime(peak)} in ${quarterLabel(peakAt)}</title></circle>`;
    svg += `<text x="${padL - 10}" y="${base - 6}" font-family="Inter, sans-serif" font-size="13" font-weight="800" fill="var(--text-title)" text-anchor="end">${escapeHTML(s.name)}</text>`;
    svg += `<text x="${width - padR + 10}" y="${base - 6}" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="var(--text-muted)">peak ${formatTime(peak)}, ${quarterLabel(peakAt)}</text>`;
  });
  svg += `</svg>`;

  return `
    <div class="goty-gap-subtitle">Hours per quarter for each system with at least ${LIFECYCLE_MIN_HOURS} hours, in the order they were first played. Each curve is scaled to that system's own best quarter (the dot).</div>
    ${svg}
    <div class="monthly-table-wrapper hub-pad">
      <table class="monthly-table" style="min-width: 900px;">
        <thead><tr><th>System</th><th>First Played</th><th>First 30 Days</th><th>Peak Quarter</th><th>Last Played</th><th>Years Active</th><th>Games</th><th>Total</th><th>Last 12 Months</th></tr></thead>
        <tbody>${rows.map(s => {
          const peak = Math.max(...s.quarters);
          const span = (Date.parse(s.last.slice(0, 10)) - Date.parse(s.first.slice(0, 10))) / 86400000 / 365.25;
          return `<tr>
            <td class="text-left hub-bold"><a href="systems.html?item=${encodeURIComponent(s.name)}" class="toc-link">${escapeHTML(s.name)}</a></td>
            <td class="text-center">${formatFullDate(s.first)}</td>
            <td class="text-center">${formatTime(s.launch)}</td>
            <td class="text-center">${quarterLabel(s.quarters.indexOf(peak))} · ${formatTime(peak)}</td>
            <td class="text-center">${formatFullDate(s.last)}</td>
            <td class="text-center">${span.toFixed(1)}</td>
            <td class="text-center">${s.games.size}</td>
            <td class="text-center hub-bold">${formatTime(s.total)}</td>
            <td class="text-center">${s.lastYear ? formatTime(s.lastYear) : '-'}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
}

// A steady color per system name
function timelineSystemColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 55% 45%)`;
}
