// metrics.js - The Metrics page and the heatmaps it shares with the Index.

// --- NEW: METRICS PAGE ROUTING ---
function initMetricsPage() {
  const container = document.getElementById('metrics-page-container');
  if (!container || !rawData || !rawData.metrics) return;

  const sections = [
    { id: 'gameSummary', title: 'Table: Game Timeframe Summary' },
    { id: 'genreSummary', title: 'Table: Genre Timeframe Summary' },
    { id: 'gotySummary', title: 'Table: Game of the Year (Scores)' },
    { id: 'calendar', title: 'Calendar: Every Day, by Year' },
    { id: 'days', title: 'Heatmap: Days Played' },
    { id: 'time', title: 'Heatmap: Total Time Spent' }
  ];

  let html = '';
  sections.forEach(sec => {
    html += `
      <section class="card-row grid-1" style="margin-bottom: 30px;">
        <div class="card" style="max-height: none;">
          <div class="card-header"><h2>${sec.title}</h2></div>
          <div class="card-content" id="metrics-page-${sec.id}" style="overflow-x: auto; padding: 0;"></div>
        </div>
      </section>
    `;
  });

  container.innerHTML = html;

  sections.forEach(sec => {
    if (sec.id === 'calendar') renderYearCalendars(`metrics-page-${sec.id}`);
    else renderHeatmap(sec.id, `metrics-page-${sec.id}`);
  });
}

// --- METRICS: GitHub-style calendar, one grid per year, each day shaded by hours played ---
const CALENDAR_LEVELS = [
  { max: 0, label: 'No play' }, { max: 3600, label: 'Under 1h' }, { max: 7200, label: '1-2h' },
  { max: 14400, label: '2-4h' }, { max: 28800, label: '4-8h' }, { max: Infinity, label: '8h+' }
];

function renderYearCalendars(targetContainerId) {
  const container = document.getElementById(targetContainerId);
  if (!container || !rawData || !rawData.allEntries) return;

  const daySeconds = new Map();
  rawData.allEntries.forEach(e => {
    const day = e.date.slice(0, 10);
    daySeconds.set(day, (daySeconds.get(day) || 0) + timeStringToSeconds(e.time));
  });
  const years = [...new Set([...daySeconds.keys()].map(d => Number(d.slice(0, 4))))].sort((a, b) => b - a);
  const level = sec => CALENDAR_LEVELS.findIndex(l => sec <= l.max);
  const cell = 12, gap = 2, step = cell + gap, left = 30, top = 18;
  const todayStr = dataDateKey(); // grids stop at the latest logged day

  const yearHtml = year => {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const offset = jan1.getUTCDay(); // weeks start on Sunday
    let rects = '', monthLabels = '', total = 0, played = 0;
    for (let d = new Date(jan1); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      const index = Math.round((d - jan1) / 86400000) + offset;
      const x = left + Math.floor(index / 7) * step, y = top + (index % 7) * step;
      if (d.getUTCDate() === 1) monthLabels += `<text x="${x}" y="${top - 6}" class="cal-label">${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}</text>`;
      if (day > todayStr) continue;
      const sec = daySeconds.get(day) || 0;
      total += sec; if (sec) played++;
      rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" class="cal-l${level(sec)}"><title>${day.replace(/-/g, '/')}: ${sec ? formatTime(sec) : 'no play'}</title></rect>`;
    }
    const weekdays = ['Mon', 'Wed', 'Fri'].map((name, i) => `<text x="0" y="${top + (2 * i + 1) * step + cell - 2}" class="cal-label">${name}</text>`).join('');
    const width = left + 54 * step, height = top + 7 * step;
    return `
      <div class="cal-year">
        <div class="cal-year-title"><strong>${year}</strong> ${formatTime(total)} over ${played} day${played === 1 ? '' : 's'}</div>
        <div class="cal-scroll"><svg class="cal-svg" viewBox="0 0 ${width} ${height}">${monthLabels}${weekdays}${rects}</svg></div>
      </div>`;
  };

  container.innerHTML = `
    <div class="cal-wrap">
      <div class="cal-legend">${CALENDAR_LEVELS.map((l, i) => `<span><svg width="12" height="12"><rect width="12" height="12" rx="2" class="cal-l${i}"/></svg>${l.label}</span>`).join('')}</div>
      ${years.map(yearHtml).join('')}
    </div>`;
}

// --- UPDATE: RENDER HEATMAP (Add Container ID parameter) ---
function renderHeatmap(mode, targetContainerId = 'heatmap-content') {
  const container = document.getElementById(targetContainerId);
  if (!container || !rawData || !rawData.metrics || !rawData.metrics.calendarData) return;

  if (mode === 'gotySummary') {
    const ratedGames = metaGames.filter(g => g.score !== null);
    const gamesByYear = {};
    ratedGames.forEach(g => {
      const y = g.releaseYear;
      if (y !== 'Unknown') {
        if (!gamesByYear[y]) gamesByYear[y] = [];
        gamesByYear[y].push(g);
      }
    });

    const sortedYears = Object.keys(gamesByYear).sort((a,b) => b - a);
    let html = `<div style="overflow-x: auto;"><table class="analysis-table"><thead><tr>`;
    html += `<th>Release Year</th><th>🏆 GOTY</th><th>2nd Place</th><th>3rd Place</th><th>4th Place</th><th>5th Place</th></tr></thead><tbody>`;

    const allTimeTop5 = [...ratedGames].sort((a,b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5);
    html += `<tr class="all-time-row"><td class="text-center" style="font-weight: bold;">All-Time</td>${[0,1,2,3,4].map(i => {
      if (allTimeTop5[i]) {
        const displayScore = Number.isInteger(allTimeTop5[i].score) ? allTimeTop5[i].score : allTimeTop5[i].score.toFixed(1);
        return `<td style="font-size: 0.85rem; text-align: left;">[${displayScore}] <span class="hover-trigger" data-game="${escapeHTML(allTimeTop5[i].name)}">${escapeHTML(allTimeTop5[i].name)}</span></td>`;
      } else return `<td></td>`;
    }).join('')}</tr>`;

    sortedYears.forEach(year => {
      const yearTop5 = gamesByYear[year].sort((a,b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5);
      html += `<tr><td class="text-center" style="font-weight: bold; font-size: 1.1rem;">${year}</td>${[0,1,2,3,4].map(i => {
        if (yearTop5[i]) {
          const displayScore = Number.isInteger(yearTop5[i].score) ? yearTop5[i].score : yearTop5[i].score.toFixed(1);
          return `<td style="font-size: 0.85rem; text-align: left;">[${displayScore}] <span class="hover-trigger" data-game="${escapeHTML(yearTop5[i].name)}">${escapeHTML(yearTop5[i].name)}</span></td>`;
        } else return `<td></td>`;
      }).join('')}</tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
    return;
  }

  if (mode === 'gameSummary' || mode === 'genreSummary') {
    const isGame = mode === 'gameSummary';
    const map = isGame ? { 'All-Time': rawData.metrics.allTimeGameStats, ...rawData.metrics.yearlyGameStats, ...rawData.metrics.monthlyStats } : { 'All-Time': rawData.metrics.allTimeGenreStats, ...rawData.metrics.yearlyGenreStats, ...rawData.metrics.monthlyGenreStats };
    const gameMapForDays = { 'All-Time': rawData.metrics.allTimeGameStats, ...rawData.metrics.yearlyGameStats, ...rawData.metrics.monthlyStats };
    const yearKeys = Object.keys(rawData.metrics.yearlyGameStats).sort().reverse();
    const monthKeys = Object.keys(rawData.metrics.monthlyStats).sort().reverse();
    const timeframes = ['All-Time', ...yearKeys, ...monthKeys];

    let html = `<div style="overflow-x: auto;"><table class="analysis-table"><thead><tr>`;
    html += `<th>Timeframe</th><th>Time Spent</th><th>Days Played</th><th>1st Most</th><th>2nd Most</th><th>3rd Most</th><th>4th Most</th><th>5th Most</th></tr></thead><tbody>`;

    timeframes.forEach(key => {
      const stats = map[key] || {};
      const top5 = Object.entries(stats).map(([name, data]) => ({ name, ...data })).sort((a,b) => b.totalSeconds - a.totalSeconds).slice(0, 5);
      const totalTime = Object.values(stats).reduce((sum, item) => sum + item.totalSeconds, 0);

      const totalDaysSet = new Set();
      const statsForDays = isGame ? stats : gameMapForDays[key];
      if (statsForDays) {
        Object.values(statsForDays).forEach(item => {
          if (item.days) {
            const daysArr = toList(item.days);
            daysArr.forEach(d => totalDaysSet.add(d));
          }
        });
      }

      let displayKey = key;
      if (key !== 'All-Time' && key.includes('-')) {
        const [y, m] = key.split('-');
        displayKey = `${y}-${m} ${new Date(Date.UTC(y, m-1, 1)).toLocaleString('en-US', {month: 'long', timeZone: 'UTC'})}`;
      }

      html += `<tr class="${key === 'All-Time' ? 'all-time-row' : ''}"><td class="text-left" style="white-space: nowrap; font-weight: bold;">${displayKey}</td><td>${formatHHMM(totalTime)}</td><td>${totalDaysSet.size}</td>${[0,1,2,3,4].map(i => {
        if (top5[i]) {
          if (isGame) {
            const sysStr = toList(top5[i].systems).join(', ');
            return `<td style="font-size: 0.75rem; text-align: left;">[${formatHHMM(top5[i].totalSeconds)}] ${escapeHTML(top5[i].name)} (${escapeHTML(sysStr)})</td>`;
          } else {
            return `<td style="font-size: 0.75rem; text-align: left;">[${formatHHMM(top5[i].totalSeconds)}] ${escapeHTML(top5[i].name)}</td>`;
          }
        } else return `<td></td>`;
      }).join('')}</tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
    return;
  }

  const calData = rawData.metrics.calendarData;
  const possible = rawData.metrics.possibleYears;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let maxTime = 0;
  if (mode === 'time') {
    for (let m=0; m<12; m++) {
      for (let d=1; d<=31; d++) {
        if (calData[m][d].totalSeconds > maxTime) maxTime = calData[m][d].totalSeconds;
      }
    }
  }

  let html = `<div style="overflow-x: auto; padding: 20px;"><table class="heatmap-table"><thead><tr><th></th>`;
  for (let i = 1; i <= 31; i++) html += `<th>${i}</th>`;
  html += `</tr></thead><tbody>`;

  for (let m = 0; m < 12; m++) {
    html += `<tr><th style="text-align: right; padding-right: 10px;">${monthNames[m]}</th>`;
    const daysInBaseYear = new Date(2023, m + 1, 0).getDate();

    for (let d = 1; d <= 31; d++) {
      if (d > daysInBaseYear && !(m === 1 && d === 29)) {
        html += `<td class="heatmap-empty"></td>`;
        continue;
      }
      const dayData = calData[m][d];
      const poss = possible[m][d];
      const playedCount = toList(dayData.yearsPlayed).length;
      const timeSec = dayData.totalSeconds;

      let bgColor = '#f7f7f7', titleText = `${monthNames[m]} ${d}`, innerText = '';

      if (mode === 'days') {
        if (poss > 0) {
          if (playedCount > 0 && playedCount === poss) bgColor = '#7CFC00';
          else {
            const ratio = playedCount / poss;
            if (ratio >= 0.8) bgColor = '#008837';
            else if (ratio >= 0.6) bgColor = '#a6dba0';
            else if (ratio >= 0.4) bgColor = '#ffffbf';
            else if (ratio >= 0.2) bgColor = '#fee08b';
            else if (ratio > 0) bgColor = '#f1a340';
          }
          innerText = playedCount > 0 ? `${playedCount}` : '';
          titleText += `: ${playedCount}/${poss} Years Played`;
        }
      } else if (mode === 'time') {
        if (timeSec > 0) {
          const ratio = Math.sqrt(timeSec) / Math.sqrt(maxTime);
          if (ratio >= 0.85) bgColor = '#990000';
          else if (ratio >= 0.65) bgColor = '#d7301f';
          else if (ratio >= 0.45) bgColor = '#fc8d59';
          else if (ratio >= 0.25) bgColor = '#fdcc8a';
          else bgColor = '#fef0d9';
          titleText += `: ${formatHHMM(timeSec)} Hours`;
        }
      }
      // The cell colors are the same in light and dark mode, so the number's color is set to suit the cell
      const textColor = ['#008837', '#990000', '#d7301f'].includes(bgColor) ? '#fff' : '#111';
      html += `<td style="background-color: ${bgColor}; color: ${textColor};" title="${titleText}">${innerText}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;

  if (mode === 'time') {
      html += `<div style="display: flex; justify-content: flex-end; gap: 5px; align-items: center; margin-top: 15px; font-size: 0.75rem; color: var(--text-muted);"><span>Less</span><div style="width: 15px; height: 15px; background: #fef0d9; border: 1px solid var(--heatmap-border);"></div><div style="width: 15px; height: 15px; background: #fdcc8a; border: 1px solid var(--heatmap-border);"></div><div style="width: 15px; height: 15px; background: #fc8d59; border: 1px solid var(--heatmap-border);"></div><div style="width: 15px; height: 15px; background: #d7301f; border: 1px solid var(--heatmap-border);"></div><div style="width: 15px; height: 15px; background: #990000; border: 1px solid var(--heatmap-border);"></div><span>More</span></div>`;
  } else if (mode === 'days') {
      html += `<div style="display: flex; justify-content: flex-end; gap: 5px; align-items: center; margin-top: 15px; font-size: 0.75rem; color: var(--text-muted);"><span>0%</span><div style="width: 15px; height: 15px; background: #f1a340; border: 1px solid var(--heatmap-border);"></div><div style="width: 15px; height: 15px; background: #fee08b; border: 1px solid var(--heatmap-border);"></div><div style="width: 15px; height: 15px; background: #ffffbf; border: 1px solid var(--heatmap-border);"></div><div style="width: 15px; height: 15px; background: #a6dba0; border: 1px solid var(--heatmap-border);"></div><div style="width: 15px; height: 15px; background: #008837; border: 1px solid var(--heatmap-border);"></div><div style="width: 15px; height: 15px; background: #7CFC00; border: 1px solid var(--heatmap-border);"></div><span>100%</span></div>`;
  }
  html += `</div>`;
  container.innerHTML = html;
}
