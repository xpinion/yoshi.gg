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
          <h2>${displayTitle} Summary</h2>
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
  const target = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
  if (target) target.scrollIntoView();

  // 4. Stagger the fade-in animation
  document.querySelectorAll('.card').forEach((card, index) => {
    const delay = Math.min(index * 0.08, 1.5);
    card.style.animationDelay = `${delay}s`;
  });
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
  const daySeconds = new Map(), totals = {};
  rawData.allEntries.forEach(e => {
    const day = e.date.slice(0, 10);
    const key = mode === 'monthly' ? day.slice(0, 7) : day.slice(0, 4);
    const sec = timeStringToSeconds(e.time);
    daySeconds.set(day, (daySeconds.get(day) || 0) + sec);
    const t = totals[key] || (totals[key] = { seconds: 0, days: new Set(), games: new Set() });
    t.seconds += sec; t.days.add(day); t.games.add(e.game);
  });
  const completions = {};
  getSortedCompletions('All-Time').forEach(pt => {
    const d = pt.displayDate.toISOString().slice(0, 10);
    const key = mode === 'monthly' ? d.slice(0, 7) : d.slice(0, 4);
    completions[key] = (completions[key] || 0) + 1;
  });
  return { daySeconds, totals, completions };
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
  const inProgress = monthly ? (year === today.getFullYear() && month === today.getMonth() + 1) : year === today.getFullYear();
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
  const rank = k => ranks ? yearRankHtml(ranks[k], ranks.partial) : '';

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
  `;
}
