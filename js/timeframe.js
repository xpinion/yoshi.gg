// timeframe.js - The Monthly and Yearly pages, and the Index's Monthly Summary.

// --- TIMEFRAME PAGE ROUTING ---
function initMonthlyPage() { buildTimeframeFeed('monthly-page-container', 'monthly'); }
function initYearlyPage() { buildTimeframeFeed('yearly-page-container', 'yearly'); }

// --- MASTER TIMEFRAME FACTORY ---
function buildTimeframeFeed(containerId, mode) {
  const mainContainer = document.getElementById(containerId);
  if (!mainContainer || !rawData || !rawData.metrics) return;

  // 1. Get the correct keys (e.g., "2026-09" vs "2026")
  let keys = [];
  if (mode === 'monthly') {
    keys = Object.keys(rawData.metrics.monthlyStats).sort().reverse();
  } else {
    keys = Object.keys(rawData.metrics.yearlyGameStats).sort().reverse();
  }

  let html = '';

  // 2. Build the structural cards for every timeframe
  keys.forEach(key => {
    let displayTitle = key;
    if (mode === 'monthly') {
      const [yearStr, monthStr] = key.split('-');
      displayTitle = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    }

    html += `
    <section class="card-row grid-1" id="${mode}-${key}">
      <div class="card">
        <div class="card-header">
          <h2>${displayTitle} Summary${mode === 'monthly' && typeof openShareCard === 'function' ? ` ${shareButtonHtml(`data-share-month="${key}"`)}<button type="button" class="share-btn" data-share-month="${key}" data-share-mini="1">Mini card</button>` : ''}</h2>
        </div>
        
        <!-- Future Home for Charts & Widgets! -->
        <div id="${mode}-widgets-${key}" class="timeframe-widgets" style="margin-bottom: 15px;"></div>
        
        <div class="card-content" id="${mode}-summary-${key}">
          <div class="loading-text">Loading Data...</div>
        </div>
      </div>
    </section>
    `;
  });

  mainContainer.innerHTML = html;

  // 3. Populate each card with its specific data table
  const widgetData = buildTimeframeWidgetData(mode);
  keys.forEach(key => {
    renderTimeframeWidgets(key, mode, `${mode}-widgets-${key}`, widgetData);
    renderTimeframeSummary(key, mode, `${mode}-summary-${key}`);
  });

  // A link to one period (monthly.html#monthly-2016-10) scrolls to it once the cards exist
  mainContainer.addEventListener('click', e => {
    const button = e.target.closest('.share-btn[data-share-month]');
    if (button) openShareCard((button.dataset.shareMini ? buildMonthCard : buildFullMonthCard)(button.dataset.shareMonth, widgetData));
  });

  const target = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
  if (target) target.scrollIntoView();

  // 4. Stagger the fade-in animation
  document.querySelectorAll('.card').forEach((card, index) => {
    const delay = Math.min(index * 0.08, 1.5);
    card.style.animationDelay = `${delay}s`;
  });
}

// Mini share card for one month: its totals, and every game played in it by time
function buildMonthCard(key, data) {
  const t = data.totals[key];
  const [year, month] = key.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const completed = new Set(getSortedCompletions('All-Time').filter(pt => pt.displayDate.toISOString().startsWith(key)).map(pt => pt.gameName));
  const games = [...t.gameSeconds].sort((a, b) => b[1] - a[1]);
  const rows = games.map(([name, sec]) => ({ left: name, right: completed.has(name) ? `Completed · ${formatTime(sec)}` : formatTime(sec) }));
  const genreStats = (rawData.metrics.monthlyGenreStats || {})[key];
  const topGenre = genreStats ? Object.entries(genreStats).sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)[0] : null;
  const today = getDataDate();
  const inProgress = year === today.getFullYear() && month === today.getMonth() + 1 && today.getDate() < daysInMonth;
  const ranks = monthRankings(key, data);
  return {
    kicker: inProgress ? 'Monthly Summary · so far' : 'Monthly Summary',
    title: `${MONTH_NAMES[month - 1]} ${year}`,
    subtitle: [`Hours: ${ranks.all.seconds.text}`, ranks.same.seconds.text, topGenre ? `Top genre: ${topGenre[0]}` : ''].filter(Boolean).join(' · '),
    stats: [
      { label: 'Time Played', value: formatTime(t.seconds) },
      { label: 'Days Played', value: `${t.days.size}/${daysInMonth}` },
      { label: 'Games', value: t.games.size },
      { label: 'Completions', value: data.completions[key] || 0 }
    ],
    rows, tall: true,
    footer: `yoshi.gg/monthly#monthly-${key}`
  };
}

// The full share card for one month, drawn like a game profile: the totals with their ranks, the highlights, hours by
// day, every playthrough played that month and the month's milestones
function buildFullMonthCard(key, data) {
  const t = data.totals[key];
  const [year, month] = key.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const ranks = monthRankings(key, data);
  const rankSub = stat => `${ranks.all[stat].text} · ${ranks.same[stat].text}`;
  const today = getDataDate();
  const inProgress = year === today.getFullYear() && month === today.getMonth() + 1 && today.getDate() < daysInMonth;
  const genreStats = (rawData.metrics.monthlyGenreStats || {})[key];
  const topGenre = genreStats ? Object.entries(genreStats).sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)[0] : null;
  const highlights = monthHighlights(t, data);
  if (topGenre) highlights.push({ label: 'Top Genre', value: topGenre[0], sub: formatTime(topGenre[1].totalSeconds) });

  // Every playthrough with time this month, the games in order of time
  const games = new Map();
  rawData.allEntries.forEach(e => {
    if (!e.date.startsWith(key)) return;
    if (!games.has(e.game)) games.set(e.game, new Map());
    const pts = games.get(e.game);
    const pt = pts.get(e.ptTag) || { seconds: 0, days: new Set(), systems: new Set(), last: e };
    pt.seconds += timeStringToSeconds(e.time); pt.days.add(e.date.slice(0, 10)); pt.systems.add(e.system);
    if (e.date >= pt.last.date) pt.last = e;
    pts.set(e.ptTag, pt);
  });
  const rows = [];
  [...games].sort((a, b) => t.gameSeconds.get(b[0]) - t.gameSeconds.get(a[0])).forEach(([game, pts]) => {
    pts.forEach((pt, tag) => {
      const history = rawData.playthroughHistory[tag] || {};
      const status = pt.last.status;
      rows.push([game, [...pt.systems].join(', '), formatHHMM(pt.seconds), pt.days.size, formatFullDate(history.startDate || pt.last.date),
        { text: status, pill: SHARE_STATUS_COLORS[status] || ['#ececec', '#555555'] }, pt.last.note || '']);
    });
  });

  const { all, shown, rest } = monthMilestones(key);
  const layout = [
    [{ type: 'stats', items: [
      { label: 'Time Played', value: formatTime(t.seconds), sub: rankSub('seconds') },
      { label: 'Days Played', value: `${t.days.size}/${daysInMonth}`, sub: rankSub('days') },
      { label: 'Games', value: String(t.games.size), sub: rankSub('games') },
      { label: 'Completions', value: String(data.completions[key] || 0), sub: rankSub('completions') }
    ] }],
    [{ type: 'stats', items: highlights.slice(0, 4) }],
    [{ type: 'stats', items: highlights.slice(4) }],
    [{ type: 'bars', title: 'Hours by Day', axisLabel: v => `${Math.round(v / 3600)}h`,
      bars: Array.from({ length: daysInMonth }, (_, i) => ({ value: data.daySeconds.get(`${key}-${String(i + 1).padStart(2, '0')}`) || 0, label: String(i + 1) })) }],
    [{ type: 'table', title: `Games Played: ${t.games.size}`, columns: [
      { label: 'Game', width: 380, weight: 800 }, { label: 'System', width: 120, align: 'center' }, { label: 'Time', width: 100, align: 'center', weight: 900, color: SHARE_COLORS.green },
      { label: 'Days', width: 70, align: 'center' }, { label: 'Started', width: 140, align: 'center', size: 17 }, { label: 'Status', width: 170, align: 'center' },
      { label: 'Playthrough Details', flex: 1, size: 16, maxLines: 3 }
    ], rows }]
  ];
  if (all.length) layout.push([{ type: 'table', title: `Milestones: ${all.length}`, note: rest ? `+ ${rest} on the Milestones page` : '',
    columns: [{ label: 'Date', width: 150, weight: 800, color: SHARE_COLORS.green }, { label: 'Milestone', flex: 1, maxLines: 3 }],
    rows: shown.map(m => [formatFullDate(m.date), m.details]) }]);
  return {
    kicker: inProgress ? 'Monthly Summary · so far' : 'Monthly Summary',
    title: `${MONTH_NAMES[month - 1]} ${year}`,
    subtitle: `${formatTime(t.seconds)} over ${t.days.size} of ${daysInMonth} days · ${t.games.size} game${t.games.size === 1 ? '' : 's'}`,
    layout, footer: `yoshi.gg/monthly#monthly-${key}`
  };
}

function renderTimeframeSummary(timeframeStr, mode, containerId) {
  const container = document.getElementById(containerId);
  if (!container || !rawData || !rawData.allEntries) return;

  // Filter entries that start with the requested string (e.g., "2026-09" or "2026")
  const tfEntries = rawData.allEntries.filter(e => e.date.startsWith(timeframeStr));
  if (tfEntries.length === 0) { 
    container.innerHTML = `<div class="loading-text">No data for ${timeframeStr}.</div>`; 
    return; 
  }

  const tfData = { games: {}, allEntryDays: new Set() };
  let totalSecondsInTf = 0;

  tfEntries.forEach(entry => {
    const timeSec = timeStringToSeconds(entry.time);
    totalSecondsInTf += timeSec;
    tfData.allEntryDays.add(entry.date.split('T')[0]);

    if (!tfData.games[entry.game]) {
      tfData.games[entry.game] = { name: entry.game, totalSeconds: 0, latestGameLifetime: entry.gameLifetime, latestGameLifetimeDays: entry.gameLifetimeDays, activePlaythroughs: {} };
    }
    const g = tfData.games[entry.game];
    g.totalSeconds += timeSec;
    g.latestGameLifetime = entry.gameLifetime;
    g.latestGameLifetimeDays = entry.gameLifetimeDays;

    if (!g.activePlaythroughs[entry.ptTag]) {
      g.activePlaythroughs[entry.ptTag] = { timeframeTime: 0, timeframeDays: new Set(), timeframeSystems: new Set(), lastDate: entry.date, lastStatus: entry.status, lastPtLifetime: entry.ptLifetime, lastPtLifetimeDays: entry.ptLifetimeDays, latestNote: entry.note };
    }
    const pt = g.activePlaythroughs[entry.ptTag];
    pt.timeframeTime += timeSec;
    pt.timeframeDays.add(entry.date.split('T')[0]);
    pt.timeframeSystems.add(entry.system);

    if (entry.date >= pt.lastDate) {
      pt.lastDate = entry.date;
      pt.lastStatus = entry.status;
      pt.lastPtLifetime = entry.ptLifetime;
      pt.lastPtLifetimeDays = entry.ptLifetimeDays;
      pt.latestNote = entry.note;
    }
  });

  const sortedGames = Object.values(tfData.games).sort((a, b) => b.totalSeconds - a.totalSeconds);

  // Calculate timeframe denominator (Days in Month vs Days in Year)
  let daysInTf = 0;
  if (mode === 'monthly') {
    const [yStr, mStr] = timeframeStr.split('-');
    daysInTf = new Date(parseInt(yStr), parseInt(mStr), 0).getDate();
  } else {
    const yInt = parseInt(timeframeStr);
    daysInTf = (yInt % 4 === 0 && (yInt % 100 !== 0 || yInt % 400 === 0)) ? 366 : 365;
  }

  const activeTitle = mode === 'monthly' ? 'Active Month' : 'Active Year';

  let html = `<div class="monthly-table-wrapper"><table class="monthly-table"><thead>
  <tr><th rowspan="2">Videogame</th><th rowspan="2">System</th><th colspan="2">${activeTitle}</th><th colspan="2">Playthrough Lifetime</th><th colspan="2">Game Lifetime</th><th rowspan="2">Date Started</th><th rowspan="2">Last Updated</th><th rowspan="2">Game Status</th><th rowspan="2">Playthrough Details</th></tr>
  <tr><th>Time</th><th>Days</th><th>Time</th><th>Days</th><th>Time</th><th>Days</th></tr>
  </thead><tbody>`;

  html += `<tr class="grand-total-row"><td colspan="2" class="text-left">Grand Total</td><td class="text-center">${formatHHMM(totalSecondsInTf)}</td><td class="text-center">${tfData.allEntryDays.size}/${daysInTf}</td><td colspan="8"></td></tr>`;

  sortedGames.forEach((game, index) => {
    const activeTags = Object.keys(game.activePlaythroughs);
    activeTags.forEach(ptTag => {
      const ptLocal = game.activePlaythroughs[ptTag];
      const ptHistory = rawData.playthroughHistory[ptTag];
      const sysStr = Array.from(ptLocal.timeframeSystems).join(', ');
      const bgColor = getStatusColor(ptHistory.finalStatus);
      html += `<tr class="active-row"><td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span></td><td class="text-center">${escapeHTML(sysStr)}</td><td class="text-center">${formatHHMM(ptLocal.timeframeTime)}</td><td class="text-center">${ptLocal.timeframeDays.size}</td><td class="text-center">${ptLocal.lastPtLifetime}</td><td class="text-center">${ptLocal.lastPtLifetimeDays}</td><td class="text-center">${game.latestGameLifetime}</td><td class="text-center">${game.latestGameLifetimeDays}</td><td class="text-center">${formatFullDate(ptHistory.startDate)}</td><td class="text-center">${formatFullDate(ptLocal.lastDate)}</td><td class="text-center status-cell" style="background-color: ${bgColor};">${ptLocal.lastStatus}</td><td class="text-left">${escapeHTML(ptLocal.latestNote)}</td></tr>`;
    });

    const allGamePlaythroughs = Object.keys(rawData.playthroughHistory).filter(tag => rawData.playthroughHistory[tag].gameName === game.name);
    const inactiveTags = allGamePlaythroughs.filter(oldTag => !activeTags.includes(oldTag));

    if (inactiveTags.length > 0) {
      const safeGameId = `collapse-${mode}-${timeframeStr}-${index}`;

      html += `
      <tr class="accordion-toggle-row" onclick="toggleAccordion('${safeGameId}', this)" style="cursor: pointer; background-color: rgba(0,0,0,0.03);">
      <td colspan="12" class="text-left" style="padding: 6px 12px; font-size: 0.85rem; color: #666;">
      <span class="toggle-icon">▶</span> Show ${inactiveTags.length} Past Playthrough${inactiveTags.length !== 1 ? 's' : ''}
      </td>
      </tr>
      `;

      inactiveTags.forEach(oldTag => {
        const oldPt = rawData.playthroughHistory[oldTag];
        const bgColor = getStatusColor(oldPt.finalStatus);
        html += `<tr class="inactive-row ${safeGameId}" style="display: none; opacity: 0.65;">
        <td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span></td>
        <td class="text-center">${escapeHTML(oldPt.system)}</td>
        <td class="text-center">00:00</td>
        <td class="text-center">0</td>
        <td class="text-center">${oldPt.finalPtLifetime}</td>
        <td class="text-center">${oldPt.finalPtLifetimeDays}</td>
        <td class="text-center">${game.latestGameLifetime}</td>
        <td class="text-center">${game.latestGameLifetimeDays}</td>
        <td class="text-center">${formatFullDate(oldPt.startDate)}</td>
        <td class="text-center">${formatFullDate(oldPt.lastDate)}</td>
        <td class="text-center status-cell" style="background-color: ${bgColor};">${oldPt.finalStatus}</td>
        <td class="text-left">${escapeHTML(oldPt.finalNote)}</td>
        </tr>`;
      });
    }
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// Totals per day, per timeframe key, and completions per key, computed once for the whole feed
function buildTimeframeWidgetData(mode) {
  const daySeconds = new Map(), dayGames = new Map(), totals = {}, firstPlayed = new Map();
  const add = (map, k, sec) => map.set(k, (map.get(k) || 0) + sec);
  rawData.allEntries.forEach(e => {
    const day = e.date.slice(0, 10);
    const key = mode === 'monthly' ? day.slice(0, 7) : day.slice(0, 4);
    const sec = timeStringToSeconds(e.time);
    daySeconds.set(day, (daySeconds.get(day) || 0) + sec);
    if (!dayGames.has(day)) dayGames.set(day, new Map());
    add(dayGames.get(day), e.game, sec);
    if (!firstPlayed.has(e.game) || day < firstPlayed.get(e.game)) firstPlayed.set(e.game, day);
    const t = totals[key] || (totals[key] = { seconds: 0, days: new Set(), games: new Set(), gameSeconds: new Map(), systemSeconds: new Map(), newGames: new Set() });
    t.seconds += sec; t.days.add(day); t.games.add(e.game);
    add(t.gameSeconds, e.game, sec); add(t.systemSeconds, e.system, sec);
  });
  // Games played for the first time ever in each period
  firstPlayed.forEach((day, game) => totals[mode === 'monthly' ? day.slice(0, 7) : day.slice(0, 4)].newGames.add(game));
  const completions = {};
  getSortedCompletions('All-Time').forEach(pt => {
    const d = pt.displayDate.toISOString().slice(0, 10);
    const key = mode === 'monthly' ? d.slice(0, 7) : d.slice(0, 4);
    completions[key] = (completions[key] || 0) + 1;
  });
  return { daySeconds, dayGames, totals, completions };
}

// Where a month ranks among every month of the log (each month from January of the first logged year up to the
// latest logged month, months without play counting as zero), and among the same month of every year ({ all, same, partial },
// each with seconds, days, games and completions as { rank, text }). The month still in progress is measured against
// the others up to the same day of the month.
function monthRankings(key, data) {
  const [year, month] = key.split('-').map(Number);
  const today = dataDateKey(), partial = today.startsWith(key) && Number(today.slice(8, 10)) < new Date(year, month, 0).getDate();
  const cutoff = partial ? today.slice(8, 10) : '31';
  data.monthTables = data.monthTables || {};
  // Each month's totals up to the cutoff day, built once per cutoff
  if (!data.monthTables[cutoff]) {
    const table = {};
    const monthOf = k => table[k] || (table[k] = { seconds: 0, days: new Set(), games: new Set(), completions: 0 });
    rawData.allEntries.forEach(e => {
      if (e.date.slice(8, 10) > cutoff) return;
      const t = monthOf(e.date.slice(0, 7));
      t.seconds += timeStringToSeconds(e.time); t.days.add(e.date.slice(0, 10)); t.games.add(e.game);
    });
    getSortedCompletions('All-Time').forEach(pt => {
      const d = pt.displayDate.toISOString();
      if (d.slice(8, 10) <= cutoff) monthOf(d.slice(0, 7)).completions++;
    });
    data.monthTables[cutoff] = table;
  }
  const table = data.monthTables[cutoff];
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
  const monthName = MONTH_NAMES[Number(key.slice(5)) - 1];
  const value = { seconds: t => t.seconds, days: t => t.days.size, games: t => t.games.size, completions: t => t.completions };
  const rankAmong = (keys, noun) => {
    const result = {};
    Object.entries(value).forEach(([stat, of]) => {
      const mine = table[key] ? of(table[key]) : 0;
      const values = keys.map(k => of(table[k]));
      const rank = 1 + values.filter(v => v > mine).length, tied = values.filter(v => v === mine).length > 1;
      const place = rank === 1 ? 'Best' : ordinal(rank);
      result[stat] = { rank, text: `${tied ? `Tied ${rank === 1 ? 'best' : place}` : place} of ${keys.length} ${noun}` };
    });
    return result;
  };
  const keys = [], first = Number(rawData.allEntries.reduce((min, e) => e.date < min ? e.date : min, today).slice(0, 4));
  for (let y = first, m = 1; `${y}-${String(m).padStart(2, '0')}` <= today.slice(0, 7); m === 12 ? (y++, m = 1) : m++) keys.push(`${y}-${String(m).padStart(2, '0')}`);
  const empty = { seconds: 0, days: new Set(), games: new Set(), completions: 0 };
  keys.forEach(k => { if (!table[k]) table[k] = empty; });
  return { all: rankAmong(keys, 'months'), same: rankAmong(keys.filter(k => k.endsWith(key.slice(4))), `${monthName}s`), partial };
}

// A month's highlights: streak, biggest day, game of the month, new games, top system, busiest weekday and oldest game,
// each { label, value, sub }. game names which of value or sub is a game ('value' or 'sub'), for the page's links.
function monthHighlights(t, data) {
  const shortDay = day => `${MONTH_NAMES[Number(day.slice(5, 7)) - 1].slice(0, 3)} ${Number(day.slice(8))}`;
  const pct = sec => `${Math.round(sec / t.seconds * 100)}%`;
  const facts = [];

  const streak = longestDayStreak(t.days);
  facts.push({ label: 'Longest Streak', value: `${streak.length} day${streak.length === 1 ? '' : 's'}`, sub: streak.length > 1 ? `${shortDay(streak.start)} – ${shortDay(streak.end)}` : shortDay(streak.start) });

  const [bigDay, bigSec] = [...t.days].map(d => [d, data.daySeconds.get(d) || 0]).sort((a, b) => b[1] - a[1])[0];
  const [dayGame] = topOfMap(data.dayGames.get(bigDay), 1)[0];
  const weekday = new Date(bigDay + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  facts.push({ label: 'Biggest Day', value: formatTime(bigSec), sub: `${weekday} ${shortDay(bigDay)}, mostly ${dayGame}` });

  const [topGame, topSec] = topOfMap(t.gameSeconds, 1)[0];
  facts.push({ label: 'Game of the Month', value: topGame, game: 'value', sub: `${formatTime(topSec)}, ${pct(topSec)} of the month` });

  const returning = t.games.size - t.newGames.size;
  facts.push({ label: 'New Games', value: String(t.newGames.size), sub: `first played this month · ${returning} returning` });

  const [topSystem, systemSec] = topOfMap(t.systemSeconds, 1)[0];
  facts.push({ label: 'Top System', value: topSystem, sub: `${pct(systemSec)} of the hours${t.systemSeconds.size > 1 ? ` · ${t.systemSeconds.size} systems played` : ''}` });

  const weekdays = new Array(7).fill(0);
  t.days.forEach(d => { weekdays[new Date(d + 'T12:00:00Z').getUTCDay()] += data.daySeconds.get(d) || 0; });
  const busiest = weekdays.indexOf(Math.max(...weekdays));
  facts.push({ label: 'Busiest Weekday', value: `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][busiest]}s`, sub: formatTime(weekdays[busiest]) });

  const released = new Map(metaGames.filter(g => /^\d{4}$/.test(g.releaseYear)).map(g => [g.name, g.releaseYear]));
  const oldest = [...t.games].filter(g => released.has(g)).sort((a, b) => released.get(a) - released.get(b) || a.localeCompare(b))[0];
  if (oldest) facts.push({ label: 'Oldest Game', value: released.get(oldest), sub: oldest, game: 'sub' });
  return facts;
}
function monthHighlightsHtml(t, data) {
  const show = (f, part) => f.game === part ? `<span class="hover-trigger" data-game="${escapeHTML(f[part])}">${escapeHTML(f[part])}</span>` : escapeHTML(f[part]);
  return `<div class="tf-stats tf-highlights">${monthHighlights(t, data).map(f =>
    `<div class="tf-stat"><span class="sys-widget-title">${f.label}</span><strong>${show(f, 'value')}</strong>${f.sub ? `<span class="tf-sub">${show(f, 'sub')}</span>` : ''}</div>`).join('')}</div>`;
}

// The month's milestones: firsts, records, hour marks, counts and anniversaries in date order (up to eight, picked in that order), with the
// ranking moves and anything else counted in one line that links to the month on the Milestones page
const MONTH_MILESTONE_ORDER = ['first', 'record', 'hours', 'count', 'anniversary'];
function monthMilestones(key) {
  const all = (rawData.metrics.milestones || []).filter(m => String(m.date).startsWith(key));
  const notable = all.filter(m => MONTH_MILESTONE_ORDER.includes(m.type))
    .sort((a, b) => MONTH_MILESTONE_ORDER.indexOf(a.type) - MONTH_MILESTONE_ORDER.indexOf(b.type) || String(a.date).localeCompare(String(b.date)));
  const shown = notable.slice(0, 8).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const rankings = all.filter(m => m.type === 'ranking').length, moreNotable = notable.length - shown.length;
  const rest = [moreNotable ? `${moreNotable} more` : '', rankings ? `${rankings} ranking move${rankings === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
  return { all, shown, rest };
}
function monthMilestonesHtml(key) {
  const { all, shown, rest } = monthMilestones(key);
  if (!all.length) return '';
  return `
    <div class="tf-milestones">
      <h3 class="tf-milestones-title">Milestones <span>${all.length}</span></h3>
      <div class="tf-milestone-list">${shown.map(milestoneItemHtml).join('')}</div>
      <a class="toc-link tf-milestones-more" href="milestones.html?month=${key}">${rest ? `+ ${rest}: ` : ''}all ${all.length} on the Milestones page →</a>
    </div>`;
}

function renderTimeframeWidgets(key, mode, containerId, data) {
  const container = document.getElementById(containerId);
  const t = data.totals[key];
  if (!container || !t) return;
  const monthly = mode === 'monthly';
  const [year, month] = key.split('-').map(Number);

  const genreStats = monthly ? (rawData.metrics.monthlyGenreStats || {})[key] : (rawData.metrics.yearlyGenreStats || {})[key];
  const topGenre = genreStats ? Object.entries(genreStats).sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)[0] : null;

  // Comparisons: previous period, and (monthly) the same month a year earlier
  const shiftKey = (months) => {
    if (!monthly) return String(year + months);
    const d = new Date(Date.UTC(year, month - 1 + months, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const labelFor = k => monthly ? `${MONTH_NAMES[Number(k.slice(5)) - 1].slice(0, 3)} ${k.slice(0, 4)}` : k;
  const today = getDataDate(); // the latest logged day stands in for today
  const inProgress = monthly ? (year === today.getFullYear() && month === today.getMonth() + 1 && today.getDate() < new Date(year, month, 0).getDate()) : year === today.getFullYear();
  // Days into the period (1-based) as "MM-DD" or "DD", so a period in progress is compared at the same point
  const cutoff = inProgress ? (monthly ? String(today.getDate()).padStart(2, '0') : `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`) : null;
  const secondsUpTo = (k) => {
    let sec = 0;
    data.daySeconds.forEach((v, day) => { if (day.startsWith(k) && day.slice(k.length + 1) <= cutoff) sec += v; });
    return sec;
  };
  const compare = k => {
    const other = data.totals[k];
    if (!other) return '';
    const otherSeconds = inProgress ? secondsUpTo(k) : other.seconds;
    const diff = t.seconds - otherSeconds;
    const cls = diff >= 0 ? 'tf-up' : 'tf-down';
    return `<span class="tf-compare ${cls}">${diff >= 0 ? '▲' : '▼'} ${formatTime(Math.abs(diff))} vs ${labelFor(k)}${inProgress ? ' at this point' : ''}</span>`;
  };
  const comparisons = monthly ? [compare(shiftKey(-1)), compare(shiftKey(-12))] : [compare(shiftKey(-1))];

  // Yearly: where this year ranks among every year of the log
  const ranks = monthly ? null : yearRankings(key);
  const monthRanks = monthly ? monthRankings(key, data) : null;
  const rank = k => ranks ? yearRankHtml(ranks[k], ranks.partial)
    : yearRankHtml(monthRanks.all[k], false) + yearRankHtml(monthRanks.same[k], monthRanks.partial);

  // Projection for the period that's still in progress
  let projection = '';
  if (inProgress) {
    const start = monthly ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
    const end = monthly ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
    const elapsed = Math.round((today - start) / 86400000) + 1; // days so far, counting the latest logged day
    const length = Math.round((end - start) / 86400000);
    projection = `<div class="tf-stat"><span class="sys-widget-title">Projected ${monthly ? 'Month' : 'Year'}-End</span><strong>${formatTime(t.seconds / elapsed * length)}</strong><span class="tf-sub">at the current pace (day ${elapsed} of ${length})</span></div>`;
  }

  // Calendar strip: each day of the month, or each month of the year
  let strip = '';
  if (monthly) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = Array.from({ length: daysInMonth }, (_, i) => {
      const day = `${key}-${String(i + 1).padStart(2, '0')}`;
      return { label: String(i + 1), title: day.replace(/-/g, '/'), sec: data.daySeconds.get(day) || 0, future: inProgress && i + 1 > today.getDate() };
    });
    const max = Math.max(1, ...cells.map(c => c.sec));
    strip = `<div class="tf-strip tf-strip-days">${cells.map(c => c.future
      ? `<div class="tf-day tf-future" title="${c.title}: not logged yet"><span>${c.label}</span></div>`
      : `<div class="tf-day" title="${c.title}: ${c.sec ? formatTime(c.sec) : 'no play'}" style="opacity: ${c.sec ? 0.25 + 0.75 * (c.sec / max) : 1}; background: ${c.sec ? 'var(--primary-green)' : 'var(--heatmap-empty)'};"><span>${c.label}</span></div>`).join('')}</div>`;
  } else {
    const months = MONTH_NAMES.map((name, i) => {
      const k = `${key}-${String(i + 1).padStart(2, '0')}`;
      let sec = 0;
      data.daySeconds.forEach((v, day) => { if (day.startsWith(k)) sec += v; });
      return { name: name.slice(0, 3), sec };
    });
    const max = Math.max(1, ...months.map(m => m.sec));
    strip = `<div class="tf-strip tf-strip-months">${months.map(m => `<div class="tf-month" title="${m.name} ${key}: ${formatTime(m.sec)}"><div class="tf-month-fill" style="height: ${(m.sec / max) * 100}%;"></div><span>${m.name}</span></div>`).join('')}</div>`;
  }

  container.innerHTML = `
    <div class="tf-stats">
      <div class="tf-stat"><span class="sys-widget-title">Time Played</span><strong>${formatTime(t.seconds)}</strong>${comparisons.join('')}${rank('seconds')}</div>
      <div class="tf-stat"><span class="sys-widget-title">Days Played</span><strong>${t.days.size}</strong>${rank('days')}</div>
      <div class="tf-stat"><span class="sys-widget-title">Games</span><strong>${t.games.size}</strong>${rank('games')}</div>
      <div class="tf-stat"><span class="sys-widget-title">Completions</span><strong>${data.completions[key] || 0}</strong>${rank('completions')}</div>
      <div class="tf-stat"><span class="sys-widget-title">Top Genre</span><strong class="tf-genre">${topGenre ? escapeHTML(topGenre[0]) : '-'}</strong>${topGenre ? `<span class="tf-sub">${formatTime(topGenre[1].totalSeconds)}</span>` : ''}</div>
      ${projection}
    </div>
    ${strip}
    ${monthly ? monthHighlightsHtml(t, data) + monthMilestonesHtml(key) : ''}
  `;
}
