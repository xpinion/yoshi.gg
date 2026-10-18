// eras.js - The Eras page (eras.html): the log seen in long stretches.
//   The Eras         five-year blocks side by side, with each one's Game of the Era and top games
//   Era Bests        the personal bests set inside each era
//   Taste Drift      which genres (or series, systems...) rose and faded between two eras
//   Reigns           the #1 game (or system, genre, series) of each year, and how long each one stayed on top
//   Life Chapters    stretches found in the log itself, where weekly hours or the main systems shifted for good
// Uses the Charts page's drawing helpers (charts.js): vizCard, vizTicks, vizText, vizLegendHtml, wireVizTips.

const ERA_YEARS = 5;
const ERA_TOP_GAMES = 5;
const DRIFT_KINDS = [
  { id: 'genre', label: 'Genres' }, { id: 'series', label: 'Series' }, { id: 'system', label: 'Systems' },
  { id: 'developer', label: 'Developers' }, { id: 'publisher', label: 'Publishers' }
];
const DRIFT_ROWS = 8; // risers and faders shown on each side
const REIGN_KINDS = [{ id: 'game', label: 'Game' }, { id: 'system', label: 'System' }, { id: 'genre', label: 'Genre' }, { id: 'series', label: 'Series' }];

// Life chapters: the log is split where a month-by-month signal (hours per week, plus each top system's share)
// changes level. Each split must gain at least CHAPTER_MIN_GAIN and leave CHAPTER_MIN_MONTHS on each side.
const CHAPTER_MIN_MONTHS = 12;
const CHAPTER_MIN_GAIN = 4;
const CHAPTER_SYSTEMS = 8;
// Names for chapters, by the month they start ("YYYY-MM"). A chapter with no name here is named after its main system.
// The latest chapter's start can still move as new months are logged.
const CHAPTER_NAMES = {};

// "YYYY/MM/DD", the date style of the Spotlight tables
const eraDate = d => String(d).slice(0, 10).replace(/-/g, '/');
const isEraValue = v => v && v !== 'N/A' && v !== 'ZZNONE' && v !== 'Unknown';

function initErasPage() {
  const container = document.getElementById('eras-page-container');
  if (!container || !rawData || !rawData.allEntries) return;
  const eras = eraList();
  const full = eras.filter(e => !e.inProgress);
  const eraOptions = selected => eras.map((e, i) => `<option value="${i}"${i === selected ? ' selected' : ''}>${e.label}</option>`).join('');

  container.innerHTML = `
    <div class="card-row grid-1"><h2 class="page-title">Eras</h2></div>
    <div class="viz-root page-stack">
      ${vizCard('eras', 'The Eras', `The log in ${ERA_YEARS}-year blocks. The Game of the Era is the one played most inside it.`, erasOverviewHtml(eras))}
      ${vizCard('bests', 'Era Bests', 'The personal bests set inside each era. The highlighted cell is the best of all time.', eraBestsHtml(eras))}
      ${vizCard('drift', 'Taste Drift', 'Each one\'s share of the hours in one era against another, with the biggest risers and faders.', `
        <div class="viz-controls">
          <select id="drift-kind" class="milestone-year" aria-label="Compare">${DRIFT_KINDS.map(k => `<option value="${k.id}">${k.label}</option>`).join('')}</select>
          <select id="drift-from" class="milestone-year" aria-label="From">${eraOptions(0)}</select>
          <select id="drift-to" class="milestone-year" aria-label="To">${eraOptions(eras.indexOf(full[full.length - 1] || eras[eras.length - 1]))}</select>
        </div>
        <div id="drift-content"></div>`)}
      ${vizCard('reigns', 'Reigns', 'The most played of each year, and each run of years on top.', `
        <div class="viz-controls"><select id="reign-kind" class="milestone-year" aria-label="Show">${REIGN_KINDS.map(k => `<option value="${k.id}">${k.label}</option>`).join('')}</select></div>
        <div id="reign-content"></div>`)}
      ${vizCard('chapters', 'Life Chapters', 'Stretches the log splits into on its own: each break is where hours per week or the main systems changed and stayed changed.', lifeChaptersHtml())}
      <div id="viz-tip" class="viz-tip" hidden></div>
    </div>`;

  const drift = () => {
    document.getElementById('drift-content').innerHTML = tasteDriftHtml(eras, document.getElementById('drift-kind').value,
      Number(document.getElementById('drift-from').value), Number(document.getElementById('drift-to').value));
  };
  ['drift-kind', 'drift-from', 'drift-to'].forEach(id => document.getElementById(id).addEventListener('change', drift));
  drift();
  const reigns = () => { document.getElementById('reign-content').innerHTML = reignsHtml(document.getElementById('reign-kind').value); };
  document.getElementById('reign-kind').addEventListener('change', reigns);
  reigns();
  wireVizTips(container);
}

// --- THE ERAS ---
// Five-year blocks from the first year of the log; the last one is marked in progress until its final year is over
function eraList() {
  const firstYear = Number(rawData.allEntries[0].date.slice(0, 4)), today = dataDateKey(), lastYear = Number(today.slice(0, 4));
  const completions = getSortedCompletions('All-Time');
  const eras = [];
  for (let start = firstYear; start <= lastYear; start += ERA_YEARS) {
    const end = start + ERA_YEARS - 1;
    const inProgress = end > lastYear || (end === lastYear && today.slice(5) < '12-31');
    const entries = rawData.allEntries.filter(e => { const y = Number(e.date.slice(0, 4)); return y >= start && y <= end; });
    eras.push({
      start, end, inProgress, entries, sum: summarizeEntries(entries),
      label: inProgress ? `${start}–${end} (so far)` : `${start}–${end}`,
      completions: completions.filter(pt => { const y = pt.displayDate.getUTCFullYear(); return y >= start && y <= end; })
    });
  }
  return eras;
}

function erasOverviewHtml(eras) {
  const firstPlayed = new Map();
  rawData.allEntries.forEach(e => { if (!firstPlayed.has(e.game)) firstPlayed.set(e.game, Number(e.date.slice(0, 4))); });
  const top = map => { const t = topOfMap(map, 1)[0]; return t ? t[0] : '–'; };
  const rows = eras.map(era => {
    const s = era.sum, newGames = [...s.games.keys()].filter(g => firstPlayed.get(g) >= era.start).length;
    const [game, gameSec] = topOfMap(s.games, 1)[0] || ['–', 0];
    return `<tr>
      <td class="text-left"><b>${era.label}</b></td>
      <td>${formatTime(s.seconds)}</td><td>${s.days.size}</td><td>${s.games.size}</td><td>${newGames}</td><td>${era.completions.length}</td>
      <td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(game)}">${escapeHTML(game)}</span> <span class="hub-sub">${formatTime(gameSec)}</span></td>
      <td>${escapeHTML(top(s.systems))}</td><td>${escapeHTML(top(s.genres))}</td><td>${escapeHTML(top(s.series))}</td>
    </tr>`;
  }).join('');
  const tops = eras.map(era => {
    const list = topOfMap(era.sum.games, ERA_TOP_GAMES);
    return `<div class="viz-top"><h3>${era.label} <em>${formatTime(era.sum.seconds)}</em></h3>
      <ol>${list.map(([game, sec]) => `<li><span class="hover-trigger" data-game="${escapeHTML(game)}">${escapeHTML(game)}</span> <em>${formatTime(sec)}</em></li>`).join('')}</ol></div>`;
  }).join('');
  return `<div class="monthly-table-wrapper"><table class="monthly-table">
      <thead><tr><th>Era</th><th>Time</th><th>Days</th><th>Games</th><th>New Games</th><th>Completions</th><th>Game of the Era</th><th>Top System</th><th>Top Genre</th><th>Top Series</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="viz-tops">${tops}</div>`;
}

// --- ERA BESTS ---
function eraBestsHtml(eras) {
  const bests = eras.map(era => {
    const dayTotals = new Map(), monthGames = new Map(), monthDone = new Map();
    era.entries.forEach(e => {
      dayTotals.set(e.date.slice(0, 10), (dayTotals.get(e.date.slice(0, 10)) || 0) + timeStringToSeconds(e.time));
      const m = e.date.slice(0, 7);
      if (!monthGames.has(m)) monthGames.set(m, new Set());
      monthGames.get(m).add(e.game);
    });
    era.completions.forEach(pt => { const m = pt.displayDate.toISOString().slice(0, 7); monthDone.set(m, (monthDone.get(m) || 0) + 1); });
    const bestOf = map => [...map.entries()].reduce((best, cur) => (!best || cur[1] > best[1]) ? cur : best, null);
    const day = bestOf(dayTotals), month = bestOf(new Map(Object.entries(era.sum.byMonth)));
    const games = bestOf(new Map([...monthGames].map(([m, set]) => [m, set.size]))), done = bestOf(monthDone);
    const streak = longestDayStreak(era.sum.days), longest = era.sum.longest;
    const monthLabel = m => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(0, 4)}`;
    return [
      longest && { value: longest.sec, text: formatTime(longest.sec), sub: `${longest.entry.game} · ${eraDate(longest.entry.date)}` },
      day && { value: day[1], text: formatTime(day[1]), sub: eraDate(day[0]) },
      month && { value: month[1], text: formatTime(month[1]), sub: monthLabel(month[0]) },
      streak.length && { value: streak.length, text: `${streak.length} days`, sub: `${eraDate(streak.start)} to ${eraDate(streak.end)}` },
      games && { value: games[1], text: `${games[1]} games`, sub: monthLabel(games[0]) },
      done && { value: done[1], text: `${done[1]} completions`, sub: monthLabel(done[0]) }
    ];
  });
  const columns = ['Longest Session', 'Busiest Day', 'Busiest Month', 'Longest Streak', 'Most Games in a Month', 'Most Completions in a Month'];
  const best = columns.map((c, i) => Math.max(...bests.map(b => b[i] ? b[i].value : 0)));
  return `<div class="monthly-table-wrapper"><table class="monthly-table era-bests">
    <thead><tr><th>Era</th>${columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${eras.map((era, r) => `<tr><td class="text-left"><b>${era.label}</b></td>${bests[r].map((b, i) => b
      ? `<td${b.value === best[i] ? ' class="era-best"' : ''}><b>${b.text}</b><div class="hub-sub">${escapeHTML(b.sub)}</div></td>` : '<td>–</td>').join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// --- TASTE DRIFT ---
function tasteDriftHtml(eras, kind, fromIndex, toIndex) {
  const from = eras[fromIndex], to = eras[toIndex];
  if (fromIndex === toIndex) return '<div class="loading-text">Pick two different eras.</div>';
  const shares = era => {
    const totals = new Map();
    let all = 0;
    era.entries.forEach(e => {
      const sec = timeStringToSeconds(e.time);
      all += sec;
      if (isEraValue(e[kind])) totals.set(e[kind], (totals.get(e[kind]) || 0) + sec);
    });
    return new Map([...totals].map(([k, s]) => [k, all ? s / all : 0]));
  };
  const a = shares(from), b = shares(to);
  const rows = [...new Set([...a.keys(), ...b.keys()])].map(name => ({ name, a: a.get(name) || 0, b: b.get(name) || 0 })).map(r => ({ ...r, change: r.b - r.a }));
  const risers = rows.filter(r => r.change > 0).sort((x, y) => y.change - x.change).slice(0, DRIFT_ROWS);
  const faders = rows.filter(r => r.change < 0).sort((x, y) => x.change - y.change).slice(0, DRIFT_ROWS);
  const maxShare = Math.max(0.01, ...[...risers, ...faders].flatMap(r => [r.a, r.b]));
  const pct = v => `${(v * 100).toFixed(1)}%`;
  const label = DRIFT_KINDS.find(k => k.id === kind).label.toLowerCase();
  const list = (title, items, rising) => `<div class="drift-col"><h3>${title}</h3>${items.length ? items.map(r => `
      <div class="drift-row">
        <div class="drift-name">${kind === 'game' ? `<span class="hover-trigger" data-game="${escapeHTML(r.name)}">${escapeHTML(r.name)}</span>` : escapeHTML(r.name)}</div>
        <div class="drift-bars" title="${escapeHTML(r.name)}: ${pct(r.a)} of ${from.label}, ${pct(r.b)} of ${to.label}">
          <i class="drift-from" style="width: ${(r.a / maxShare * 100).toFixed(1)}%"></i>
          <i class="drift-to ${rising ? 'up' : 'down'}" style="width: ${(r.b / maxShare * 100).toFixed(1)}%"></i>
        </div>
        <div class="drift-change ${rising ? 'up' : 'down'}">${rising ? '▲' : '▼'} ${(Math.abs(r.change) * 100).toFixed(1)} pts<span>${pct(r.a)} → ${pct(r.b)}</span></div>
      </div>`).join('') : `<div class="loading-text">No ${label} ${rising ? 'rose' : 'faded'}.</div>`}</div>`;
  return `<p class="viz-lead">Share of the hours in <b>${from.label}</b> against <b>${to.label}</b>, in percentage points.</p>
    <div class="drift-grid">${list('Rising', risers, true)}${list('Fading', faders, false)}</div>
    ${vizLegendHtml([[from.label, 'var(--viz-other)'], [`${to.label}, rising`, 'var(--viz-faster)'], [`${to.label}, fading`, 'var(--viz-slower)']])}`;
}

// --- REIGNS ---
function reignsHtml(kind) {
  const keyOf = e => kind === 'game' ? e.game : e[kind];
  const byYear = new Map();
  rawData.allEntries.forEach(e => {
    const k = keyOf(e);
    if (!isEraValue(k)) return;
    const y = e.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, { total: 0, items: new Map() });
    const year = byYear.get(y), sec = timeStringToSeconds(e.time);
    year.total += sec;
    year.items.set(k, (year.items.get(k) || 0) + sec);
  });
  const years = [...byYear.keys()].sort(), latest = dataDateKey().slice(0, 4);
  const winners = years.map(y => { const [name, sec] = topOfMap(byYear.get(y).items, 1)[0]; return { year: y, name, sec, share: sec / byYear.get(y).total }; });
  // Runs of back-to-back years with the same #1
  const reigns = [];
  winners.forEach(w => {
    const last = reigns[reigns.length - 1];
    if (last && last.name === w.name) { last.years.push(w); return; }
    reigns.push({ name: w.name, years: [w] });
  });
  const yearsOnTop = new Map();
  winners.forEach(w => yearsOnTop.set(w.name, (yearsOnTop.get(w.name) || 0) + 1));
  const ranked = [...yearsOnTop.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
  // Colours go round in order of first reign, so neighbouring reigns always differ; a holder keeps its colour
  const firstSeen = [...new Set(winners.map(w => w.name))];
  const color = name => `var(--series-${(firstSeen.indexOf(name) % 8) + 1})`;

  // Each year's holder is written under its cell, turned on its side
  const width = 1000, padL = 100, padR = 8, cellH = 40, labelH = 22, nameH = 190, height = labelH + cellH + nameH;
  const cellW = (width - padL - padR) / winners.length;
  const maxChars = 30;
  let svg = `<svg class="viz-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Number one by year">`;
  winners.forEach((w, i) => {
    const x = padL + i * cellW, cx = x + cellW / 2;
    svg += `<rect x="${(x + 1).toFixed(1)}" y="${labelH}" width="${(cellW - 2).toFixed(1)}" height="${cellH}" rx="4" fill="${color(w.name)}" data-viz="reign" data-k="${i}"${w.year === latest ? ' opacity="0.6"' : ''}/>`;
    svg += vizText(cx.toFixed(1), labelH - 7, `’${w.year.slice(2)}`, 'class="viz-axis" text-anchor="middle"');
    const name = w.name.length > maxChars ? w.name.slice(0, maxChars - 1) + '…' : w.name;
    const ty = labelH + cellH + 8;
    svg += `<text x="${(cx + 4).toFixed(1)}" y="${ty}" class="viz-label" text-anchor="end" transform="rotate(-60 ${(cx + 4).toFixed(1)} ${ty})" data-viz="reign" data-k="${i}">${escapeHTML(name)}</text>`;
  });
  svg += '</svg>';
  vizTips.reign = i => {
    const w = winners[i];
    return `<b>${w.year}${w.year === latest ? ' (so far)' : ''}</b> · ${escapeHTML(w.name)}<div>${formatTime(w.sec)} <span>${Math.round(w.share * 100)}% of the year</span></div>`;
  };
  const longest = [...reigns].sort((a, b) => b.years.length - a.years.length)[0];
  const most = ranked[0];
  const noun = REIGN_KINDS.find(k => k.id === kind).label.toLowerCase();
  const longestText = longest.years.length > 1
    ? `Longest reign: <b>${escapeHTML(longest.name)}</b>, ${longest.years.length} years in a row (${longest.years[0].year}–${longest.years[longest.years.length - 1].year}).`
    : `No ${noun} was #1 two years in a row.`;
  const mostText = yearsOnTop.get(most) > 1 ? ` Most years on top: <b>${escapeHTML(most)}</b> with ${yearsOnTop.get(most)}.` : '';
  const lead = `<p class="viz-lead">${longestText}${mostText}</p>`;
  const table = `<details class="viz-table" open><summary>Every reign</summary><div class="monthly-table-wrapper"><table class="monthly-table">
    <thead><tr><th>${REIGN_KINDS.find(k => k.id === kind).label}</th><th>Years</th><th>Length</th><th>Time in Those Years</th></tr></thead>
    <tbody>${[...reigns].reverse().map(r => {
      const span = r.years.length === 1 ? r.years[0].year : `${r.years[0].year}–${r.years[r.years.length - 1].year}`;
      const name = kind === 'game' ? `<span class="hover-trigger" data-game="${escapeHTML(r.name)}">${escapeHTML(r.name)}</span>` : escapeHTML(r.name);
      return `<tr><td class="text-left"><i class="era-swatch" style="background:${color(r.name)}"></i>${name}</td><td>${span}${r.years.some(w => w.year === latest) ? ' (so far)' : ''}</td><td>${r.years.length} ${r.years.length === 1 ? 'year' : 'years'}</td><td>${formatTime(r.years.reduce((s, w) => s + w.sec, 0))}</td></tr>`;
    }).join('')}</tbody></table></div></details>`;
  return lead + `<div class="viz-scroll">${svg}</div>` + table;
}

// --- LIFE CHAPTERS ---
function lifeChapters() {
  const entries = rawData.allEntries, today = dataDateKey();
  const months = [], byMonth = new Map(), systemTotals = new Map();
  for (let y = Number(entries[0].date.slice(0, 4)), m = Number(entries[0].date.slice(5, 7)); ; m++) {
    if (m > 12) { y++; m = 1; }
    const key = `${y}-${String(m).padStart(2, '0')}`;
    months.push(key);
    byMonth.set(key, { seconds: 0, systems: new Map(), games: new Map(), genres: new Map() });
    if (key === today.slice(0, 7)) break;
  }
  entries.forEach(e => {
    const month = byMonth.get(e.date.slice(0, 7)), sec = timeStringToSeconds(e.time);
    if (!month) return;
    month.seconds += sec;
    [['systems', e.system], ['games', e.game], ['genres', e.genre]].forEach(([field, k]) => { if (isEraValue(k)) month[field].set(k, (month[field].get(k) || 0) + sec); });
    if (isEraValue(e.system)) systemTotals.set(e.system, (systemTotals.get(e.system) || 0) + sec);
  });
  const weeksIn = key => {
    const [y, m] = key.split('-').map(Number), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return (key === today.slice(0, 7) ? Number(today.slice(8, 10)) : days) / 7;
  };
  const perWeek = months.map(k => byMonth.get(k).seconds / 3600 / weeksIn(k));
  const mean = perWeek.reduce((a, b) => a + b, 0) / perWeek.length;
  const sd = Math.sqrt(perWeek.reduce((a, b) => a + (b - mean) ** 2, 0) / perWeek.length) || 1;
  const topSystems = [...systemTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, CHAPTER_SYSTEMS).map(([s]) => s);
  // Each month as a point: hours per week (in standard deviations) and each top system's share of the month
  const points = months.map((k, i) => {
    const month = byMonth.get(k);
    return [perWeek[i] / sd, ...topSystems.map(s => month.seconds ? (month.systems.get(s) || 0) / month.seconds : 0)];
  });
  const dims = points[0].length;
  // Running sums make the spread (sum of squared distances from the mean) of any run of months quick to get
  const sums = [Array(dims).fill(0)], squares = [Array(dims).fill(0)];
  points.forEach((p, i) => { sums.push(p.map((v, d) => sums[i][d] + v)); squares.push(p.map((v, d) => squares[i][d] + v * v)); });
  const spread = (a, b) => {
    let total = 0;
    for (let d = 0; d < dims; d++) { const s = sums[b][d] - sums[a][d]; total += (squares[b][d] - squares[a][d]) - s * s / (b - a); }
    return total;
  };
  // Keep splitting wherever a split cuts the spread the most, until no split gains enough
  let segments = [[0, months.length]];
  for (;;) {
    let best = null;
    segments.forEach(([a, b]) => {
      const whole = spread(a, b);
      for (let c = a + CHAPTER_MIN_MONTHS; c <= b - CHAPTER_MIN_MONTHS; c++) {
        const gain = whole - spread(a, c) - spread(c, b);
        if (!best || gain > best.gain) best = { gain, a, b, c };
      }
    });
    if (!best || best.gain < CHAPTER_MIN_GAIN) break;
    segments = segments.filter(([a, b]) => a !== best.a || b !== best.b).concat([[best.a, best.c], [best.c, best.b]]).sort((x, y) => x[0] - y[0]);
  }
  const chapters = segments.map(([a, b]) => {
    const totals = { seconds: 0, systems: new Map(), games: new Map(), genres: new Map() };
    let weeks = 0;
    months.slice(a, b).forEach(k => {
      const month = byMonth.get(k);
      weeks += weeksIn(k);
      totals.seconds += month.seconds;
      ['systems', 'games', 'genres'].forEach(f => month[f].forEach((s, key) => totals[f].set(key, (totals[f].get(key) || 0) + s)));
    });
    const mainSystem = (topOfMap(totals.systems, 1)[0] || ['–'])[0];
    return { a, b, start: months[a], end: months[b - 1], months: b - a, perWeek: totals.seconds / 3600 / weeks, ...totals, mainSystem,
             name: CHAPTER_NAMES[months[a]], current: b === months.length };
  });
  // Unnamed chapters are named after their main system, with "Part 2" (and on) when the one before had the same
  chapters.forEach((c, n) => {
    if (c.name) return;
    const prev = chapters[n - 1], base = `The ${c.mainSystem} Years`;
    c.part = prev && !CHAPTER_NAMES[prev.start] && prev.mainSystem === c.mainSystem ? (prev.part || 1) + 1 : 1;
    c.name = c.part > 1 ? `${base}, Part ${c.part}` : base;
  });
  return { months, perWeek, chapters };
}

function lifeChaptersHtml() {
  const { months, perWeek, chapters } = lifeChapters();
  const width = 1000, height = 300, padL = 52, padR = 12, padT = 34, padB = 30, innerW = width - padL - padR, innerH = height - padT - padB;
  const ticks = vizTicksCovering(Math.max(...perWeek) * 1.05), maxY = ticks[ticks.length - 1];
  const x = i => padL + (i / months.length) * innerW, y = v => padT + innerH - (v / maxY) * innerH, barW = innerW / months.length;
  const monthLabel = k => `${MONTH_NAMES[Number(k.slice(5, 7)) - 1].slice(0, 3)} ${k.slice(0, 4)}`;
  let svg = `<svg class="viz-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Hours per week by month, split into life chapters">`;
  // Alternate chapters get a shaded band, so the breaks read at a glance
  chapters.forEach((c, n) => {
    if (n % 2 === 0) svg += `<rect x="${x(c.a)}" y="${padT - 26}" width="${x(c.b) - x(c.a)}" height="${innerH + 26}" fill="var(--viz-empty)" opacity="0.6"/>`;
    svg += vizText(x(c.a) + 4, padT - 10, n + 1, 'class="viz-axis"');
  });
  ticks.forEach(t => { svg += `<line x1="${padL}" x2="${padL + innerW}" y1="${y(t)}" y2="${y(t)}" class="viz-grid"/>` + vizText(padL - 8, y(t) + 4, `${t}h`, 'class="viz-axis" text-anchor="end"'); });
  months.forEach((k, i) => {
    if (perWeek[i] > 0) svg += `<rect x="${(x(i) + 0.3).toFixed(1)}" y="${y(perWeek[i]).toFixed(1)}" width="${Math.max(0.6, barW - 0.6).toFixed(1)}" height="${(y(0) - y(perWeek[i])).toFixed(1)}" fill="var(--series-1)" opacity="0.55" data-viz="chapter-month" data-k="${i}"/>`;
    if (k.endsWith('-01') && Number(k.slice(0, 4)) % 2 === 0) svg += vizText(x(i), height - 10, k.slice(0, 4), 'class="viz-axis" text-anchor="middle"');
  });
  // Each chapter's average as a level line
  chapters.forEach(c => { svg += `<line x1="${x(c.a)}" x2="${x(c.b)}" y1="${y(c.perWeek)}" y2="${y(c.perWeek)}" stroke="var(--series-2)" stroke-width="3" stroke-linecap="round"/>`; });
  svg += `<line x1="${padL}" x2="${padL + innerW}" y1="${y(0)}" y2="${y(0)}" class="viz-baseline"/></svg>`;
  vizTips['chapter-month'] = i => `<b>${monthLabel(months[i])}</b><div>${perWeek[i].toFixed(1)}h per week</div>`;

  const cards = chapters.map((c, n) => {
    const share = (sec) => `${Math.round(sec / c.seconds * 100)}%`;
    const systems = topOfMap(c.systems, 3).map(([s, sec]) => `${escapeHTML(s)} <em>${share(sec)}</em>`).join(', ');
    const games = topOfMap(c.games, 3).map(([g]) => `<span class="hover-trigger" data-game="${escapeHTML(g)}">${escapeHTML(g)}</span>`).join(', ');
    const years = c.months >= 24 ? `${(c.months / 12).toFixed(1)} years` : `${c.months} months`;
    return `<div class="chapter-card">
      <div class="chapter-num">Chapter ${n + 1}${c.current ? ' · now' : ''}</div>
      <h3>${escapeHTML(c.name)}</h3>
      <div class="hub-sub">${monthLabel(c.start)} – ${c.current ? 'now' : monthLabel(c.end)} · ${years}</div>
      <div class="chapter-stat"><b>${c.perWeek.toFixed(1)}h</b> per week · ${formatTime(c.seconds)} in all</div>
      <div class="chapter-line"><span>Systems</span> ${systems}</div>
      <div class="chapter-line"><span>Top games</span> ${games}</div>
      <div class="chapter-line"><span>Top genre</span> ${escapeHTML((topOfMap(c.genres, 1)[0] || ['–'])[0])}</div>
    </div>`;
  }).join('');
  return `<div class="viz-scroll">${svg}</div>${vizLegendHtml([['Hours per week, each month', 'var(--series-1)'], ['Chapter average', 'var(--series-2)']])}<div class="chapter-grid">${cards}</div>`;
}
