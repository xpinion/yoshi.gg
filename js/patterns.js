// patterns.js - The Patterns page: what gets played at which time of year, how each system rose and faded, and
// when playthroughs get abandoned.

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
    ${abandonPatternsHtml()}
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

// --- ABANDONMENT PATTERNS ---
// How far in playthroughs are when they're dropped, by genre, and what that says about the ones still going.
const ABANDON_BUCKETS = [
  { label: 'Under 1h', max: 3600 }, { label: '1h – 2h', max: 7200 }, { label: '2h – 5h', max: 18000 },
  { label: '5h – 10h', max: 36000 }, { label: '10h – 20h', max: 72000 }, { label: '20h+', max: Infinity }
];
// A genre needs this many abandoned playthroughs for its own row, and finish odds need this many to go on
const ABANDON_MIN_PER_GENRE = 3, ABANDON_MIN_FOR_ODDS = 5;

function abandonPatternsHtml() {
  if (!rawData.playthroughHistory) return '';
  const median = list => { const sorted = [...list].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; };
  const playthroughs = Object.values(rawData.playthroughHistory).filter(isMainPt).map(pt => ({ ...pt, sec: timeStringToSeconds(pt.finalPtLifetime) }));
  const finished = playthroughs.filter(pt => ['Completed', 'Postgame'].includes(pt.finalStatus));
  const abandoned = playthroughs.filter(pt => pt.finalStatus === 'Abandoned');
  if (abandoned.length === 0) return '';
  const decided = [...finished, ...abandoned];

  const buckets = ABANDON_BUCKETS.map(b => ({ ...b, count: 0 }));
  abandoned.forEach(pt => buckets.find(b => pt.sec < b.max).count++);
  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  const byGenre = {};
  decided.forEach(pt => {
    if (!pt.genre || pt.genre === 'N/A') return;
    const g = byGenre[pt.genre] = byGenre[pt.genre] || { name: pt.genre, abandoned: [], finished: [] };
    (pt.finalStatus === 'Abandoned' ? g.abandoned : g.finished).push(pt);
  });
  const genres = Object.values(byGenre).filter(g => g.abandoned.length >= ABANDON_MIN_PER_GENRE)
    .map(g => ({ ...g, rate: g.abandoned.length / (g.abandoned.length + g.finished.length), longest: g.abandoned.reduce((a, b) => b.sec > a.sec ? b : a) }))
    .sort((a, b) => b.rate - a.rate);

  // For a playthrough still going: of the decided ones that got at least this far, how many were finished.
  // Its own genre is used when there are enough to go on, otherwise every genre.
  const active = playthroughs.filter(pt => pt.finalStatus === 'Active').sort((a, b) => b.sec - a.sec).map(pt => {
    const reached = list => list.filter(other => other.sec >= pt.sec);
    const own = byGenre[pt.genre] ? reached([...byGenre[pt.genre].abandoned, ...byGenre[pt.genre].finished]) : [];
    const pool = own.length >= ABANDON_MIN_FOR_ODDS ? own : reached(decided);
    const genreDrop = byGenre[pt.genre] && byGenre[pt.genre].abandoned.length >= ABANDON_MIN_PER_GENRE ? median(byGenre[pt.genre].abandoned.map(a => a.sec)) : null;
    return { pt, pool, ownGenre: pool === own, odds: pool.length ? pool.filter(other => other.finalStatus !== 'Abandoned').length / pool.length : null, genreDrop };
  });
  const game = name => `<span class="hover-trigger" data-game="${escapeHTML(name)}">${escapeHTML(name)}</span>`;

  return `
    <section class="card-row grid-2">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>When Playthroughs Get Abandoned</h2></div>
        <div class="card-content">
          <div class="score-dist-summary"><strong>${abandoned.length}</strong> of ${decided.length.toLocaleString()} finished-or-dropped playthroughs were abandoned (${(abandoned.length / decided.length * 100).toFixed(1)}%). Half were dropped within <strong>${formatTime(median(abandoned.map(pt => pt.sec)))}</strong> and <strong>${median(abandoned.map(pt => pt.finalPtLifetimeDays))} days</strong> of play; completed ones took a median of ${formatTime(median(finished.map(pt => pt.sec)))}.</div>
          ${buckets.map(b => `
            <div class="score-dist-row">
              <span class="score-dist-label session-length-label">${b.label}</span>
              <div class="score-dist-track"><div class="score-dist-bar" style="width: ${(b.count / maxCount) * 100}%;"></div></div>
              <span class="score-dist-count session-length-count">${b.count} · ${Math.round(b.count / abandoned.length * 100)}%</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>Still Going: Finish Odds</h2></div>
        <div class="card-content">
          <div class="score-dist-summary">For each active playthrough: of the past ones that got at least this far, the share that were finished.</div>
          ${active.length ? rankedListHtml(active.map(a => ({
            title: a.pt.gameName, game: a.pt.gameName,
            sub: `${a.pt.finalPtLifetime} over ${a.pt.finalPtLifetimeDays} day${a.pt.finalPtLifetimeDays === 1 ? "" : "s"} · ${a.pool.length} ${a.ownGenre ? escapeHTML(a.pt.genre) : 'playthroughs of any genre'} got this far${a.genreDrop !== null ? ` · ${escapeHTML(a.pt.genre)} drops come at a median of ${formatTime(a.genreDrop)}` : ''}`,
            badge: a.odds === null ? 'Uncharted' : `${Math.round(a.odds * 100)}% finished`
          }))) : '<div class="loading-text">No active playthroughs.</div>'}
        </div>
      </div>
    </section>
    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>Abandonment by Genre</h2></div>
        <div class="card-content hub-flush">
          <div class="monthly-table-wrapper hub-pad">
            <table class="monthly-table" style="min-width: 760px;">
              <thead><tr><th>Genre</th><th>Abandoned</th><th>Finished</th><th>Abandon Rate</th><th>Median Time When Dropped</th><th>Median Time to Finish</th><th>Longest Before Dropping</th></tr></thead>
              <tbody>${genres.map(g => `
                <tr>
                  <td class="text-left hub-bold"><a href="genre.html?item=${encodeURIComponent(g.name)}" class="toc-link">${escapeHTML(g.name)}</a></td>
                  <td class="text-center">${g.abandoned.length}</td>
                  <td class="text-center">${g.finished.length}</td>
                  <td class="text-center"><span class="stat-highlight">${(g.rate * 100).toFixed(0)}%</span></td>
                  <td class="text-center">${formatTime(median(g.abandoned.map(pt => pt.sec)))}</td>
                  <td class="text-center">${g.finished.length ? formatTime(median(g.finished.map(pt => pt.sec))) : '-'}</td>
                  <td class="text-left">${game(g.longest.gameName)} (${formatTime(g.longest.sec)})</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="score-scatter-note">Genres with at least ${ABANDON_MIN_PER_GENRE} abandoned playthroughs, highest abandon rate first. Multiplayer and non-completable playthroughs are left out.</div>
        </div>
      </div>
    </section>`;
}
