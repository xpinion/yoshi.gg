// compare.js - The Compare page (compare.html?type=...&a=...&b=...): two games, systems, years and so on, side by side.

// What can be compared, and how to pick the log entries for one item of that kind
const COMPARE_TYPES = [
  { id: 'game', label: 'Games', valueOf: e => e.game },
  { id: 'system', label: 'Systems', valueOf: e => e.system },
  { id: 'series', label: 'Franchises', valueOf: e => e.series },
  { id: 'genre', label: 'Genres', valueOf: e => e.genre },
  { id: 'developer', label: 'Developers', valueOf: e => e.developer },
  { id: 'publisher', label: 'Publishers', valueOf: e => e.publisher },
  { id: 'releaseYear', label: 'Release Years', valueOf: e => e.releaseYear },
  { id: 'year', label: 'Years Played', valueOf: e => e.date.slice(0, 4) }
];
const COMPARE_COLORS = ['var(--primary-green)', '#00b4d8'];

function initComparePage() {
  const container = document.getElementById('compare-page-container');
  if (!container || !rawData || !rawData.allEntries) return;

  // Every item of each kind with its total time, most played first
  const totals = {};
  COMPARE_TYPES.forEach(type => {
    const map = new Map();
    rawData.allEntries.forEach(e => {
      const val = type.valueOf(e);
      if (val && val !== 'N/A' && val !== 'ZZNONE') map.set(val, (map.get(val) || 0) + timeStringToSeconds(e.time));
    });
    totals[type.id] = type.id === 'year' ? [...map.keys()].sort().reverse() : topOfMap(map, Infinity).map(([name]) => name);
  });

  const params = new URLSearchParams(window.location.search);
  const startType = COMPARE_TYPES.find(t => t.id === params.get('type')) || COMPARE_TYPES[0];
  container.innerHTML = `
    <div class="card-row grid-1"><h2 class="page-title">Compare</h2></div>
    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="compare-controls">
          <select id="compare-type" class="milestone-year" aria-label="What to compare">${COMPARE_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}</select>
          <input type="search" id="compare-a" class="spotlight-filter" list="compare-list" aria-label="First item">
          <span class="compare-vs">vs</span>
          <input type="search" id="compare-b" class="spotlight-filter" list="compare-list" aria-label="Second item">
          <datalist id="compare-list"></datalist>
        </div>
        <div id="compare-body"></div>
      </div>
    </section>
  `;
  const typeSelect = document.getElementById('compare-type');
  const inputA = document.getElementById('compare-a'), inputB = document.getElementById('compare-b');
  const fillList = () => {
    document.getElementById('compare-list').innerHTML = totals[typeSelect.value].map(v => `<option value="${escapeHTML(v)}">`).join('');
  };
  const render = () => {
    const type = COMPARE_TYPES.find(t => t.id === typeSelect.value);
    const names = [inputA.value, inputB.value];
    const body = document.getElementById('compare-body');
    if (!names.every(n => totals[type.id].includes(n))) {
      body.innerHTML = `<div class="loading-text">Pick two ${type.label.toLowerCase()} from the lists above.</div>`;
      return;
    }
    history.replaceState(null, '', `?type=${type.id}&a=${encodeURIComponent(names[0])}&b=${encodeURIComponent(names[1])}`);
    body.innerHTML = compareBodyHtml(type, names);
  };
  // Start with what the link asks for, or the two most played items of the kind
  const setDefaults = (a, b) => {
    const list = totals[typeSelect.value];
    inputA.value = list.includes(a) ? a : (list[0] || '');
    inputB.value = list.includes(b) ? b : (list[1] || '');
  };
  typeSelect.value = startType.id;
  fillList();
  setDefaults(params.get('a'), params.get('b'));
  typeSelect.addEventListener('change', () => { fillList(); setDefaults(); render(); });
  [inputA, inputB].forEach(input => input.addEventListener('change', render));
  render();
}

function compareBodyHtml(type, names) {
  const sides = names.map(name => {
    const entries = rawData.allEntries.filter(e => type.valueOf(e) === name);
    const sum = summarizeEntries(entries);
    const tags = new Set(entries.map(e => e.ptTag));
    const playthroughs = [...tags].map(tag => rawData.playthroughHistory[tag]).filter(Boolean);
    // A year's completions are the ones finished that year; anything else counts its playthroughs that were completed
    const completions = type.id === 'year'
      ? getSortedCompletions(name).length
      : playthroughs.filter(pt => (pt.completionDates && pt.completionDates.length > 0) || ['Completed', 'M-Completed', 'Postgame'].includes(pt.finalStatus)).length;
    const scores = [...sum.games.keys()].map(getGameScore).filter(s => s !== null);
    return { name, sum, completions, playthroughs: playthroughs.length, avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null, scored: scores.length };
  });

  // Each row: label, the number compared (higher wins), and how to show it
  const isGame = type.id === 'game';
  const rows = [
    ['Total Time', s => s.sum.seconds, s => formatTime(s.sum.seconds)],
    ['Days Played', s => s.sum.days.size, s => s.sum.days.size],
    ['Sessions', s => s.sum.sessions, s => s.sum.sessions],
    ['Average Session', s => s.sum.seconds / s.sum.sessions, s => formatTime(s.sum.seconds / s.sum.sessions)],
    ['Longest Session', s => s.sum.longest.sec, s => `${formatTime(s.sum.longest.sec)}<div class="compare-sub">${isGame ? '' : escapeHTML(s.sum.longest.entry.game) + ' · '}${formatFullDate(s.sum.longest.entry.date)}</div>`],
    isGame ? null : ['Games', s => s.sum.games.size, s => s.sum.games.size],
    ['Playthroughs', s => s.playthroughs, s => s.playthroughs],
    ['Completions', s => s.completions, s => s.completions],
    ['Multiplayer Share', s => s.sum.multiplayerSeconds / Math.max(1, s.sum.seconds), s => `${((s.sum.multiplayerSeconds / Math.max(1, s.sum.seconds)) * 100).toFixed(1)}%`],
    [isGame ? 'Score' : 'Average Score', s => s.avgScore === null ? -1 : s.avgScore, s => s.avgScore === null ? '-' : `${isGame ? formatScore(s.avgScore) : s.avgScore.toFixed(2)}${isGame ? '' : `<div class="compare-sub">${s.scored} scored games</div>`}`],
    isGame ? null : ['Most Played Game', null, s => { const [game, sec] = topOfMap(s.sum.games, 1)[0]; return `<span class="hover-trigger" data-game="${escapeHTML(game)}">${escapeHTML(game)}</span><div class="compare-sub">${formatTime(sec)}</div>`; }],
    type.id === 'system' ? null : ['Most Played System', null, s => { const [system, sec] = topOfMap(s.sum.systems, 1)[0]; return `${escapeHTML(system)}<div class="compare-sub">${formatTime(sec)}</div>`; }],
    ['First Played', null, s => formatFullDate(s.sum.first.date)],
    ['Last Played', null, s => formatFullDate(s.sum.last.date)],
    type.id === 'year' ? null : ['Years Played', s => Object.keys(s.sum.byYear).length, s => Object.keys(s.sum.byYear).length]
  ].filter(Boolean);

  const cell = (side, other, valueOf, show) => {
    const wins = valueOf && valueOf(side) > valueOf(other);
    return wins ? `<span class="stat-highlight">${show(side)}</span>` : show(side);
  };
  const header = (side, i) => type.id === 'game'
    ? `<span class="hover-trigger" data-game="${escapeHTML(side.name)}" style="color: ${COMPARE_COLORS[i]};">${escapeHTML(side.name)}</span>`
    : `<span style="color: ${COMPARE_COLORS[i]};">${escapeHTML(side.name)}</span>`;

  return `
    <table class="h2h-table">
      <tr><td class="h2h-val-left compare-name">${header(sides[0], 0)}</td><td class="h2h-label"></td><td class="h2h-val-right compare-name">${header(sides[1], 1)}</td></tr>
      ${rows.map(([label, valueOf, show]) => `
        <tr>
          <td class="h2h-val-left">${cell(sides[0], sides[1], valueOf, show)}</td>
          <td class="h2h-label">${label}</td>
          <td class="h2h-val-right">${cell(sides[1], sides[0], valueOf, show)}</td>
        </tr>`).join('')}
    </table>
    <div class="card-header compare-chart-title"><h2>${type.id === 'year' ? 'Hours Through the Year' : 'Hours Over Time'}</h2></div>
    ${compareChartHtml(type, sides)}
    ${chartLegendHtml(sides.map((s, i) => ({ label: `${s.name} (${formatTime(s.sum.seconds)})`, color: COMPARE_COLORS[i] })))}
  `;
}

// Running total of hours for both sides: by day of the year when comparing years, otherwise across the whole log
function compareChartHtml(type, sides) {
  const byYear = type.id === 'year';
  const logStart = Date.parse(rawData.allEntries[0].date.slice(0, 10));
  const logEnd = Date.parse(dataDateKey());
  const xOf = e => byYear ? dayOfYear(e.date) : (Date.parse(e.date.slice(0, 10)) - logStart) / 86400000;
  const series = sides.map((side, i) => {
    let total = 0;
    const points = [[byYear ? 0 : xOf(side.sum.first), 0]];
    side.sum.entries.forEach(e => { total += timeStringToSeconds(e.time) / 3600; points.push([xOf(e), total]); });
    return { label: side.name, color: COMPARE_COLORS[i], points, width: 3 };
  });
  const xMax = byYear ? 365 : (logEnd - logStart) / 86400000;
  const xTicks = byYear
    ? MONTH_NAMES.map((name, m) => [dayOfYear(`2001-${String(m + 1).padStart(2, '0')}-15`), name.slice(0, 3)])
    : Array.from({ length: getDataDate().getFullYear() - new Date(logStart).getUTCFullYear() + 1 }, (_, i) => {
      const year = new Date(logStart).getUTCFullYear() + i;
      return [(Date.parse(`${year}-07-01`) - logStart) / 86400000, year];
    }).filter(([x]) => x >= 0 && x <= xMax);
  return lineChartSvg(series, { xMax, xTicks });
}
