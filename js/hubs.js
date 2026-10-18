// hubs.js - The Systems, Franchise, Genre and Release Year pages.

// Scores: a score at or above this counts as "high" in the score-vs-hours charts
const HIGH_SCORE = 8;
// Averages only compete for the "best average" highlight with at least this many scored games
const MIN_SCORED_FOR_AVG_HIGHLIGHT = 3;

// --- HUB ROUTING TRIGGERS ---
function initSystemsPage() { buildAnalyticsHub('systems-page-container', 'system', 'System'); }
function initFranchisePage() { buildAnalyticsHub('franchise-page-container', 'series', 'Franchise'); }
function initGenrePage() { buildAnalyticsHub('genre-page-container', 'genre', 'Genre'); }
function initReleaseYearPage() { buildAnalyticsHub('releaseyear-page-container', 'releaseYear', 'Release Year'); }

// --- MASTER ANALYTICS HUB FACTORY ---
function buildAnalyticsHub(containerId, dataKey, titleLabel) {
  const container = document.getElementById(containerId);
  if (!container || !rawData || !rawData.allEntries) return;

  const hubData = {};
  let totalGlobalTime = 0;
  
  let globalMinDate = new Date('2099-01-01');
  let globalMaxDate = new Date('2000-01-01');

  // 1. Core Data Aggregation
  rawData.allEntries.forEach(e => {
    const rawVal = e[dataKey];
    if (!rawVal || rawVal === "N/A" || rawVal === "Unknown" || rawVal === "ZZNONE") return;
    
    const valName = String(rawVal);
    const sec = timeStringToSeconds(e.time);
    const dateKey = e.date.split('T')[0];
    
    const entryDate = new Date(e.date);
    const dow = entryDate.getUTCDay();
    const year = entryDate.getUTCFullYear();
    const monthKey = `${year}-${(entryDate.getUTCMonth() + 1).toString().padStart(2, '0')}`;
    
    if (entryDate < globalMinDate) globalMinDate = entryDate;
    if (entryDate > globalMaxDate) globalMaxDate = entryDate;

    totalGlobalTime += sec;

    if (!hubData[valName]) {
      hubData[valName] = {
        name: valName, totalSeconds: 0, days: new Set(), games: new Set(),
        sessions: [], gamePlaytimes: {}, entries: [], yearStats: {},
        monthlyTime: {}, cumulativeTime: {}, 
        sysTime: {}, genreTime: {}, devTime: {}, seriesTime: {},
        dowStats: { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 }, completions: 0,
        multiplayerSeconds: 0, sessionBuckets: { micro: 0, standard: 0, deep: 0, marathon: 0, epic: 0 }
      };
    }

    const hubItem = hubData[valName];
    hubItem.totalSeconds += sec;
    hubItem.days.add(dateKey);
    hubItem.games.add(e.game);
    hubItem.sessions.push({ game: e.game, time: sec, date: e.date });
    hubItem.entries.push(e);
    
    hubItem.yearStats[year] = (hubItem.yearStats[year] || 0) + sec;
    hubItem.monthlyTime[monthKey] = (hubItem.monthlyTime[monthKey] || 0) + sec;
    hubItem.dowStats[dow] += sec;

    if (['Multiplayer', 'M-Completed'].includes(e.status)) hubItem.multiplayerSeconds += sec;

    if (sec < 1800) hubItem.sessionBuckets.micro += sec;
    else if (sec < 7200) hubItem.sessionBuckets.standard += sec;
    else if (sec < 14400) hubItem.sessionBuckets.deep += sec;
    else if (sec < 28800) hubItem.sessionBuckets.marathon += sec;
    else hubItem.sessionBuckets.epic += sec;

    // Track cross-metadata for Vibe Checks
    if (e.system && e.system !== "N/A") hubItem.sysTime[e.system] = (hubItem.sysTime[e.system] || 0) + sec;
    if (e.genre && e.genre !== "N/A") hubItem.genreTime[e.genre] = (hubItem.genreTime[e.genre] || 0) + sec;
    if (e.developer && e.developer !== "N/A") hubItem.devTime[e.developer] = (hubItem.devTime[e.developer] || 0) + sec;
    if (e.series && e.series !== "N/A" && e.series !== "ZZNONE") hubItem.seriesTime[e.series] = (hubItem.seriesTime[e.series] || 0) + sec;

    if (!hubItem.gamePlaytimes[e.game]) {
      hubItem.gamePlaytimes[e.game] = { seconds: 0, days: new Set(), minDate: e.date, maxDate: e.date };
    }
    hubItem.gamePlaytimes[e.game].seconds += sec;
    hubItem.gamePlaytimes[e.game].days.add(dateKey);
    
    if (e.date < hubItem.gamePlaytimes[e.game].minDate) hubItem.gamePlaytimes[e.game].minDate = e.date;
    if (e.date > hubItem.gamePlaytimes[e.game].maxDate) hubItem.gamePlaytimes[e.game].maxDate = e.date;
  });

  // 2. Playthrough Tallying
  if (rawData.playthroughHistory) {
    Object.values(rawData.playthroughHistory).forEach(pt => {
      if (isMainPt(pt) && ['Completed', 'M-Completed', 'Postgame'].includes(pt.finalStatus)) {
        if (dataKey === 'system') {
          const ptSystems = pt.systems && pt.systems.has ? Array.from(pt.systems) : (pt.systems || []);
          ptSystems.forEach(sysName => { if (hubData[sysName]) hubData[sysName].completions++; });
        } else {
          const ptVal = pt[dataKey];
          if (ptVal && hubData[ptVal]) hubData[ptVal].completions++;
        }
      }
    });
  }

  // 3. Timeline Bounds Setup
  const allMonthKeys = [];
  if (globalMinDate <= globalMaxDate) {
    let currY = globalMinDate.getUTCFullYear();
    let currM = globalMinDate.getUTCMonth() + 1;
    const endY = globalMaxDate.getUTCFullYear();
    const endM = globalMaxDate.getUTCMonth() + 1;
    while (currY < endY || (currY === endY && currM <= endM)) {
      allMonthKeys.push(`${currY}-${currM.toString().padStart(2, '0')}`);
      currM++;
      if (currM > 12) { currM = 1; currY++; }
    }
  }

  // 4. Determine Global Maximums
  let maxTime = 0, maxDays = 0, maxGames = 0, maxComp = 0, maxLongestSess = 0, maxMpgTime = 0, maxAvgScore = 0;
  const sortedItems = Object.values(hubData).sort((a, b) => b.totalSeconds - a.totalSeconds);
  
  sortedItems.forEach(item => {
    item.firstEntryDate = item.entries[0].date;
    item.lastEntryDate = item.entries[item.entries.length - 1].date;
    
    let mostPlayedGame = { name: "N/A", seconds: 0, minDate: null, maxDate: null };
    Object.entries(item.gamePlaytimes).forEach(([g, data]) => {
      if (data.seconds > mostPlayedGame.seconds) mostPlayedGame = { name: g, seconds: data.seconds, minDate: data.minDate, maxDate: data.maxDate }; 
    });
    item.mostPlayedGame = mostPlayedGame;
    
    let longestSess = { game: "N/A", time: 0, date: null };
    item.sessions.forEach(s => { if (s.time > longestSess.time) longestSess = s; });
    item.longestSession = longestSess;

    item.scoredGames = [...item.games]
      .map(g => ({ name: g, score: getGameScore(g), seconds: item.gamePlaytimes[g].seconds }))
      .filter(g => g.score !== null);
    item.avgScore = item.scoredGames.length ? item.scoredGames.reduce((sum, g) => sum + g.score, 0) / item.scoredGames.length : null;
    item.topRated = [...item.scoredGames].sort((a, b) => b.score - a.score || b.seconds - a.seconds)[0] || null;
    if (item.avgScore !== null && item.scoredGames.length >= MIN_SCORED_FOR_AVG_HIGHLIGHT && item.avgScore > maxAvgScore) maxAvgScore = item.avgScore;

    let runningSec = 0;
    allMonthKeys.forEach(mk => {
      runningSec += (item.monthlyTime[mk] || 0);
      item.cumulativeTime[mk] = runningSec;
    });

    if (item.totalSeconds > maxTime) maxTime = item.totalSeconds;
    if (item.days.size > maxDays) maxDays = item.days.size;
    if (item.games.size > maxGames) maxGames = item.games.size;
    if (item.completions > maxComp) maxComp = item.completions;
    if (item.longestSession.time > maxLongestSess) maxLongestSess = item.longestSession.time;
    if (item.mostPlayedGame.seconds > maxMpgTime) maxMpgTime = item.mostPlayedGame.seconds;
  });

  const allGameHours = Object.values(rawData.metrics.allTimeGameStats).map(g => g.totalSeconds / 3600).sort((a, b) => a - b);
  const medianGameHours = allGameHours.length ? allGameHours[Math.floor(allGameHours.length / 2)] : 0;

  const mostPlayedItem = sortedItems[0] || { name: "N/A", totalSeconds: 0 };
  const mostDiverseItem = [...sortedItems].sort((a, b) => b.games.size - a.games.size)[0] || { name: "N/A", games: new Set() };
  
  const formatTimeCompact = (val) => formatTime(val).replace(' ', '');
  const getHighlightStr = (val, max, formatFn) => {
    const displayStr = formatFn ? formatFn(val) : val;
    if (val === max && val > 0) return `<span class="stat-highlight">${displayStr}</span>`;
    return displayStr;
  };

  const avgScoreCell = item => {
    if (item.avgScore === null) return '-';
    const avg = item.avgScore.toFixed(1);
    const best = item.avgScore === maxAvgScore && item.scoredGames.length >= MIN_SCORED_FOR_AVG_HIGHLIGHT;
    return `${best ? `<span class="stat-highlight">${avg}</span>` : avg}<br><span class="hub-game-sub">${item.scoredGames.length} scored</span>`;
  };
  const topRatedCell = item => {
    const g = item.topRated;
    if (!g) return '-';
    return `<span class="hover-trigger hub-game-name" data-game="${escapeHTML(g.name)}">${escapeHTML(g.name)}</span><br>
          <span class="hub-game-sub">Score ${formatScore(g.score)} &nbsp;|&nbsp; ${formatTimeCompact(g.seconds)}</span>`;
  };

  const summaryRowsHtml = sortedItems.map(item => {
    const mpg = item.mostPlayedGame;
    const ls = item.longestSession;
    return `
      <tr>
        <td class="text-left hub-row-name">${escapeHTML(item.name)}</td>
        <td class="text-center hub-period">${formatFullDate(item.firstEntryDate)}-${formatFullDate(item.lastEntryDate)}</td>
        <td class="text-center hub-nowrap">${getHighlightStr(item.totalSeconds, maxTime, formatTimeCompact)}</td>
        <td class="text-center">${getHighlightStr(item.days.size, maxDays)}</td>
        <td class="text-center">${getHighlightStr(item.games.size, maxGames)}</td>
        <td class="text-center">${getHighlightStr(item.completions, maxComp)}</td>
        <td class="text-center hub-two-line">${avgScoreCell(item)}</td>
        <td class="text-left hub-two-line">
          <span class="hover-trigger hub-game-name" data-game="${escapeHTML(mpg.name)}">${escapeHTML(mpg.name)}</span><br>
          <span class="hub-game-sub">
            ${getHighlightStr(mpg.seconds, maxMpgTime, formatTimeCompact)} &nbsp;|&nbsp; (${mpg.minDate ? formatFullDate(mpg.minDate) : "-"}-${mpg.maxDate ? formatFullDate(mpg.maxDate) : "-"})
          </span>
        </td>
        <td class="text-left hub-two-line">${topRatedCell(item)}</td>
        <td class="text-left hub-two-line">
          <span class="hover-trigger hub-game-name" data-game="${escapeHTML(ls.game)}">${escapeHTML(ls.game)}</span><br>
          <span class="hub-game-sub">
            ${getHighlightStr(ls.time, maxLongestSess, formatTimeCompact)} &nbsp;|&nbsp; Date: ${ls.date ? formatFullDate(ls.date) : "-"}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  // 5. SVG Line Charts
  const top10Items = sortedItems.slice(0, 10);
  const chartColors = ['#ff0054', '#ffbd00', '#00b4d8', '#8ac926', '#9d4edd', '#ff9f1c', '#38b000', '#e56b6f', '#3a0ca3', '#00f5d4'];
  
  const generateLineChart = (isCumulative) => {
    if (allMonthKeys.length === 0) return '';
    const width = 1200, height = 400, padL = 70, padR = 20, padT = 20, padB = 40;
    const innerW = width - padL - padR, innerH = height - padT - padB;
    
    let chartMaxVal = 0;
    top10Items.forEach(item => {
      allMonthKeys.forEach(mk => {
        const val = isCumulative ? (item.cumulativeTime[mk] || 0) : (item.monthlyTime[mk] || 0);
        if (val > chartMaxVal) chartMaxVal = val;
      });
    });
    if (chartMaxVal === 0) chartMaxVal = 1;

    let gridHtml = '';
    for(let k=0; k<=4; k++) {
       const y = padT + innerH - (k/4)*innerH;
       const valSec = (k/4) * chartMaxVal;
       const valLabel = Math.round(valSec / 3600) + 'h';
       gridHtml += `<line x1="${padL}" y1="${y}" x2="${width-padR}" y2="${y}" stroke="var(--border-table)" stroke-width="1" />`;
       gridHtml += `<text x="${padL - 10}" y="${y + 4}" fill="var(--text-muted)" font-family="Inter, sans-serif" font-size="12" font-weight="600" text-anchor="end">${valLabel}</text>`;
    }

    let currentYearLabel = "";
    allMonthKeys.forEach((mk, j) => {
      const year = mk.split('-')[0];
      if (year !== currentYearLabel) {
         currentYearLabel = year;
         const x = padL + (j / Math.max(1, allMonthKeys.length - 1)) * innerW;
         gridHtml += `<line x1="${x}" y1="${padT + innerH}" x2="${x}" y2="${padT + innerH + 5}" stroke="var(--text-muted)" stroke-width="2" />`;
         gridHtml += `<text x="${x}" y="${padT + innerH + 20}" fill="var(--text-muted)" font-family="Inter, sans-serif" font-size="12" font-weight="600" text-anchor="middle">${year}</text>`;
      }
    });

    gridHtml += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="var(--text-muted)" stroke-width="2" />`;
    gridHtml += `<line x1="${padL}" y1="${padT + innerH}" x2="${width-padR}" y2="${padT + innerH}" stroke="var(--text-muted)" stroke-width="2" />`;

    let linesHtml = '', circlesHtml = '';
    top10Items.forEach((item, i) => {
      const color = chartColors[i];
      let points = [];
      allMonthKeys.forEach((mk, j) => {
        const val = isCumulative ? (item.cumulativeTime[mk] || 0) : (item.monthlyTime[mk] || 0);
        const x = padL + (j / Math.max(1, allMonthKeys.length - 1)) * innerW;
        const y = padT + innerH - (val / chartMaxVal) * innerH;
        points.push(`${x},${y}`);
        
        if (val > 0) {
          circlesHtml += `<circle class="hub-clickable" cx="${x}" cy="${y}" r="6" fill="transparent" stroke="transparent">
                            <title>${escapeHTML(item.name)} - ${mk}: ${formatTime(val)}</title>
                          </circle>`;
        }
      });
      linesHtml += `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
    });

    return `<svg class="hub-chart" viewBox="0 0 ${width} ${height}">${gridHtml}${linesHtml}${circlesHtml}</svg>`;
  };

  const legendHtml = `
    <div class="hub-chart-legend">
      ${top10Items.map((item, i) => `
        <div class="hub-chart-legend-item">
          <div style="width: 12px; height: 12px; background: ${chartColors[i]}; border-radius: 50%;"></div>
          ${escapeHTML(item.name)}
        </div>
      `).join('')}
    </div>
  `;

  // 6. Gantt-Style Eras Timeline
  let timelineHtml = '';
  if (allMonthKeys.length > 0) {
    timelineHtml += `
      <div class="hub-timeline">
        <div class="hub-timeline-header">
          <div class="hub-timeline-header-label">${escapeHTML(titleLabel)}</div>
          <div class="hub-timeline-years">
    `;
    
    let currentYearStr = allMonthKeys[0].substring(0,4);
    let yearColspan = 0;
    allMonthKeys.forEach((mk, i) => {
      if (mk.substring(0,4) !== currentYearStr || i === allMonthKeys.length - 1) {
        if (i === allMonthKeys.length - 1) yearColspan++;
        timelineHtml += `<div style="flex: ${yearColspan}; font-size: 0.75rem; font-weight: 900; color: var(--text-muted); border-left: 1px solid var(--border-light); padding-left: 4px;">${currentYearStr}</div>`;
        currentYearStr = mk.substring(0,4);
        yearColspan = 1;
      } else {
        yearColspan++;
      }
    });
    timelineHtml += `</div></div>`;

    sortedItems.forEach(item => {
      const itemMaxMonthlySec = Math.max(...allMonthKeys.map(mk => item.monthlyTime[mk] || 0));

      timelineHtml += `<div class="hub-timeline-row">`;
      timelineHtml += `<div class="hub-timeline-label" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div>`;
      timelineHtml += `<div class="hub-timeline-cells">`;
      
      allMonthKeys.forEach(mk => {
        const time = item.monthlyTime[mk] || 0;
        const bg = time > 0 ? 'var(--primary-green)' : 'var(--heatmap-empty)';
        const opacity = time > 0 ? (itemMaxMonthlySec > 0 ? 0.2 + (0.8 * (time / itemMaxMonthlySec)) : 1) : 1; 
        timelineHtml += `<div title="${mk}: ${formatTime(time)}" style="flex: 1; background: ${bg}; opacity: ${opacity}; border-radius: 1px;"></div>`;
      });
      timelineHtml += `</div></div>`;
    });
    timelineHtml += `</div>`;
  }

  // 7. Session Buckets Visualizer
  const generateSessionBucketsHtml = () => {
    let bHtml = `<div class="hub-buckets">`;
    bHtml += `
      <div class="hub-buckets-legend">
        <div class="hub-legend-item"><div class="hub-swatch-micro"></div>Micro (&lt;30m)</div>
        <div class="hub-legend-item"><div class="hub-swatch-standard"></div>Standard (30m-2h)</div>
        <div class="hub-legend-item"><div class="hub-swatch-deep"></div>Deep (2h-4h)</div>
        <div class="hub-legend-item"><div class="hub-swatch-marathon"></div>Marathon (4h-8h)</div>
        <div class="hub-legend-item"><div class="hub-swatch-epic"></div>Epic (8h+)</div>
      </div>
    `;

    sortedItems.slice(0, 50).forEach(item => { 
      const t = item.totalSeconds || 1;
      const b = item.sessionBuckets;
      const p1 = (b.micro/t)*100, p2 = (b.standard/t)*100, p3 = (b.deep/t)*100, p4 = (b.marathon/t)*100, p5 = (b.epic/t)*100;
      
      bHtml += `
        <div class="hub-bucket-row">
          <div class="hub-bucket-label" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div>
          <div class="hub-bucket-bar">
            <div style="width: ${p1}%; background: #4cc9f0;" title="Micro (<30m): ${formatTime(b.micro)}"></div>
            <div style="width: ${p2}%; background: #4361ee;" title="Standard (30m-2h): ${formatTime(b.standard)}"></div>
            <div style="width: ${p3}%; background: #7209b7;" title="Deep (2h-4h): ${formatTime(b.deep)}"></div>
            <div style="width: ${p4}%; background: #f72585;" title="Marathon (4h-8h): ${formatTime(b.marathon)}"></div>
            <div style="width: ${p5}%; background: #ff9f1c;" title="Epic (8h+): ${formatTime(b.epic)}"></div>
          </div>
        </div>
      `;
    });
    bHtml += `</div>`;
    return bHtml;
  };

  // 8. Scatter Plot Generator
  const generateScatterPlot = () => {
    const width = 1000, height = 450;
    const padL = 80, padR = 40, padT = 40, padB = 60;
    const innerW = width - padL - padR, innerH = height - padT - padB;
    
    let mxX = Math.max(...sortedItems.map(s => s.games.size));
    let mxY = Math.max(...sortedItems.map(s => s.totalSeconds));
    if (mxX === 0) mxX = 1; if (mxY === 0) mxY = 1;
    mxX *= 1.1; mxY *= 1.1;

    let svg = `<svg class="hub-chart" viewBox="0 0 ${width} ${height}">`;
    
    const midX = padL + innerW / 2, midY = padT + innerH / 2;
    svg += `<rect x="${padL}" y="${padT}" width="${innerW/2}" height="${innerH/2}" fill="var(--item-bg)" opacity="0.6" />`;
    svg += `<rect x="${midX}" y="${padT}" width="${innerW/2}" height="${innerH/2}" fill="var(--highlight-green-bg)" opacity="0.4" />`;
    svg += `<rect x="${padL}" y="${midY}" width="${innerW/2}" height="${innerH/2}" fill="transparent" />`;
    svg += `<rect x="${midX}" y="${midY}" width="${innerW/2}" height="${innerH/2}" fill="var(--item-bg)" opacity="0.6" />`;

    svg += `<text x="${padL + 15}" y="${padT + 25}" fill="var(--text-sub)" font-family="Inter, sans-serif" font-weight="800" font-size="12">DEEP DIVES (High Time, Few Games)</text>`;
    svg += `<text x="${width - padR - 15}" y="${padT + 25}" fill="var(--primary-green)" font-family="Inter, sans-serif" font-weight="800" font-size="12" text-anchor="end">JUGGERNAUTS (High Time, Many Games)</text>`;
    svg += `<text x="${padL + 15}" y="${height - padB - 15}" fill="var(--text-sub)" font-family="Inter, sans-serif" font-weight="800" font-size="12">DALLIANCES (Low Time, Few Games)</text>`;
    svg += `<text x="${width - padR - 15}" y="${height - padB - 15}" fill="var(--text-sub)" font-family="Inter, sans-serif" font-weight="800" font-size="12" text-anchor="end">TASTING MENUS (Low Time, Many Games)</text>`;

    svg += `<line x1="${padL}" y1="${height-padB}" x2="${width-padR}" y2="${height-padB}" stroke="var(--text-muted)" stroke-width="2" />`;
    svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height-padB}" stroke="var(--text-muted)" stroke-width="2" />`;

    for(let k=0; k<=4; k++) {
       const y = padT + innerH - (k/4)*innerH;
       const valLabel = Math.round(((k/4) * mxY) / 3600) + 'h';
       svg += `<text x="${padL - 10}" y="${y + 4}" fill="var(--text-muted)" font-family="Inter, sans-serif" font-size="12" font-weight="600" text-anchor="end">${valLabel}</text>`;
    }
    for(let k=0; k<=4; k++) {
       const x = padL + (k/4)*innerW;
       const valLabel = Math.round((k/4) * mxX);
       svg += `<text x="${x}" y="${height - padB + 20}" fill="var(--text-muted)" font-family="Inter, sans-serif" font-size="12" font-weight="600" text-anchor="middle">${valLabel}</text>`;
    }
    
    sortedItems.forEach((item, i) => {
       const cx = padL + (item.games.size / mxX) * innerW;
       const cy = padT + innerH - (item.totalSeconds / mxY) * innerH;
       const color = chartColors[i % chartColors.length];
       
       svg += `<circle class="hub-clickable" cx="${cx}" cy="${cy}" r="7" fill="${color}" stroke="var(--card-bg)" stroke-width="2">
                 <title>${escapeHTML(item.name)}: ${item.games.size} Games, ${formatTime(item.totalSeconds)}</title>
               </circle>`;
       if (i < 20) {
         svg += `<text x="${cx}" y="${cy - 12}" fill="var(--text-title)" font-family="Inter, sans-serif" font-size="11" font-weight="800" text-anchor="middle">${escapeHTML(item.name)}</text>`;
       }
    });

    svg += `</svg>`;
    return svg;
  };

  // 9. Static Global Hub Layout
  let html = `
    <!-- Global Ribbon -->
    <section class="card-row grid-4">
      <div class="card hub-stat-card">
        <div class="sys-widget-title">Total ${escapeHTML(titleLabel)}s</div>
        <div class="sys-widget-value hub-green">${sortedItems.length}</div>
      </div>
      <div class="card hub-stat-card">
        <div class="sys-widget-title">Most Played</div>
        <div class="sys-widget-value hub-value-md">${escapeHTML(mostPlayedItem.name)}</div>
        <div class="sys-widget-sub">${formatTime(mostPlayedItem.totalSeconds)}</div>
      </div>
      <div class="card hub-stat-card">
        <div class="sys-widget-title">Largest Library</div>
        <div class="sys-widget-value hub-value-md">${escapeHTML(mostDiverseItem.name)}</div>
        <div class="sys-widget-sub">${mostDiverseItem.games.size} Unique Games</div>
      </div>
      <div class="card hub-stat-card">
        <div class="sys-widget-title">Total Logged Time</div>
        <div class="sys-widget-value hub-value-lg">${formatTime(totalGlobalTime)}</div>
      </div>
    </section>

    <!-- Global Summary Table -->
    <section class="card-row grid-1">
      <div class="card">
        <div class="card-header"><h2>All-Time ${escapeHTML(titleLabel)} Summary</h2></div>
        <div class="card-content hub-flush">
          <div class="monthly-table-wrapper hub-pad">
            <table class="analysis-table hub-summary-table">
              <thead>
                <tr>
                  <th class="hub-col-name">${escapeHTML(titleLabel)}</th>
                  <th class="hub-col-period">Active Period</th>
                  <th class="hub-col-100">Total Playtime</th>
                  <th class="hub-col-90">Days Played</th>
                  <th class="hub-col-90">Unique Games</th>
                  <th class="hub-col-90">Completions</th>
                  <th class="hub-col-90">Avg Score</th>
                  <th class="hub-col-game">Most Played Game</th>
                  <th class="hub-col-game">Top Rated Game</th>
                  <th class="hub-left">Longest Single Session</th>
                </tr>
              </thead>
              <tbody>${summaryRowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- Scatter Plot -->
    <section class="card-row grid-1 hub-section-gap">
      <div class="card">
        <div class="card-header"><h2>The Deep Dive vs. Tasting Menu Matrix</h2></div>
        <div class="card-content hub-card-body">
          ${generateScatterPlot()}
        </div>
      </div>
    </section>

    <!-- Session Buckets -->
    <section class="card-row grid-1 hub-section-gap">
      <div class="card">
        <div class="card-header"><h2>Sprint vs. Marathon: Session Length Breakdown</h2></div>
        <div class="card-content hub-card-body">
          ${generateSessionBucketsHtml()}
        </div>
      </div>
    </section>

    <!-- Trend Line Charts -->
    <section class="card-row grid-1 hub-section-gap">
      <div class="card">
        <div class="card-header"><h2>Top 10 ${escapeHTML(titleLabel)}s: Monthly Playtime</h2></div>
        <div class="card-content hub-card-body">
          ${generateLineChart(false)}
          ${legendHtml}
        </div>
      </div>
      <div class="card hub-section-gap">
        <div class="card-header"><h2>Top 10 ${escapeHTML(titleLabel)}s: Cumulative Playtime</h2></div>
        <div class="card-content hub-card-body">
          ${generateLineChart(true)}
          ${legendHtml}
        </div>
      </div>
    </section>

    <!-- Eras Timeline -->
    <section class="card-row grid-1 hub-section-gap">
      <div class="card">
        <div class="card-header"><h2>Global ${escapeHTML(titleLabel)} Eras Timeline (${allMonthKeys.length > 0 ? allMonthKeys[0].slice(0, 4) : ''} - Present)</h2></div>
        <div class="card-content">
          ${timelineHtml}
        </div>
      </div>
    </section>

    <!-- Deep Dive Selector -->
    <section class="card-row grid-1 hub-section-gap">
      <div class="card">
        <div class="card-header hub-header-plain">
          <h2 class="hub-title-lg">
            Deep Dive: 
            <select id="hub-item-select" class="header-dropdown hub-title-lg">
              ${sortedItems.map(s => `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)}</option>`).join('')}
            </select>
            ${['series', 'system', 'genre'].includes(dataKey) ? '<a id="hub-share-link" class="share-btn" href="card.html">Share card</a>' : ''}
          </h2>
        </div>
      </div>
    </section>

    <!-- Dynamic Container -->
    <div id="dynamic-hub-content"></div>
  `;

  container.innerHTML = html;

  // 10. Dynamic Deep Dive Rendering Logic
  const renderSelectedItem = (valName) => {
    const item = hubData[valName];
    if (!item) return;
    const shareLink = document.getElementById('hub-share-link');
    if (shareLink) shareLink.href = `card.html?${dataKey}=${encodeURIComponent(valName)}`;

    const dynamicContainer = document.getElementById('dynamic-hub-content');
    
    // Dynamic Identity "Vibe Check" Algorithm
    let attr1Name = "System", attr2Name = "Genre";
    let topAttr1 = [], topAttr2 = [];

    if (dataKey === 'system') {
      attr1Name = "Genre"; attr2Name = "Developer";
      topAttr1 = Object.entries(item.genreTime).sort((a, b) => b[1] - a[1]);
      topAttr2 = Object.entries(item.devTime).sort((a, b) => b[1] - a[1]);
    } else if (dataKey === 'genre') {
      attr2Name = "Developer";
      topAttr1 = Object.entries(item.sysTime).sort((a, b) => b[1] - a[1]);
      topAttr2 = Object.entries(item.devTime).sort((a, b) => b[1] - a[1]);
    } else {
      topAttr1 = Object.entries(item.sysTime).sort((a, b) => b[1] - a[1]);
      topAttr2 = Object.entries(item.genreTime).sort((a, b) => b[1] - a[1]);
    }

    const best1 = topAttr1.length > 0 ? topAttr1[0][0] : "Gaming";
    const best2 = topAttr2.length > 0 ? topAttr2[0][0] : "";
    const identityTitle = dataKey === 'system' ? `The ${best2} ${best1} Machine` : `The ${best1} ${best2} ${escapeHTML(titleLabel)}`;

    const firstEntry = item.entries[0];
    const lastEntry = item.entries[item.entries.length - 1];

    let peakYear = "-", peakTime = 0;
    Object.entries(item.yearStats).forEach(([year, time]) => { if (time > peakTime) { peakTime = time; peakYear = year; } });
    const peakPct = item.totalSeconds > 0 ? Math.round((peakTime / item.totalSeconds) * 100) : 0;

    const weekdaySec = item.dowStats[1] + item.dowStats[2] + item.dowStats[3] + item.dowStats[4] + item.dowStats[5];
    const weekendSec = item.dowStats[0] + item.dowStats[6];
    const weekdayPct = item.totalSeconds > 0 ? Math.round((weekdaySec / item.totalSeconds) * 100) : 0;
    const weekendPct = item.totalSeconds > 0 ? Math.round((weekendSec / item.totalSeconds) * 100) : 0;

    const itemPlaythroughs = Object.values(rawData.playthroughHistory).filter(pt => {
      if (dataKey === 'system') return pt.systems && (pt.systems.has ? pt.systems.has(valName) : Array.from(pt.systems).includes(valName));
      return pt[dataKey] === valName;
    });
    itemPlaythroughs.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
    
    let compCount = 0, abanCount = 0, actCount = 0, multiCount = 0;
    itemPlaythroughs.forEach(pt => {
      if (!isMainPt(pt)) return; // DLC and modes don't count toward a hub's completions or abandons
      if (['Completed', 'M-Completed', 'Postgame'].includes(pt.finalStatus)) compCount++;
      else if (pt.finalStatus === 'Abandoned') abanCount++;
      else if (pt.finalStatus === 'Active') actCount++;
      else multiCount++;
    });
    
    const compRate = (compCount + abanCount) > 0 ? Math.round((compCount / (compCount + abanCount)) * 100) : 0;
    const totalPts = itemPlaythroughs.length;
    const compRatePct = totalPts > 0 ? ((compCount / totalPts) * 100) : 0;
    const actRatePct = totalPts > 0 ? ((actCount / totalPts) * 100) : 0;
    const abanRatePct = totalPts > 0 ? ((abanCount / totalPts) * 100) : 0;
    
    const topGamesTime = Object.entries(item.gamePlaytimes).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.seconds - a.seconds).slice(0, 10);
    const topGamesDays = Object.entries(item.gamePlaytimes).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.days.size - a.days.size).slice(0, 10);
    const topSessions = [...item.sessions].sort((a, b) => b.time - a.time).slice(0, 10);

    const multiSec = item.multiplayerSeconds || 0;
    const singleSec = item.totalSeconds - multiSec;
    const multiPct = item.totalSeconds > 0 ? Math.round((multiSec / item.totalSeconds) * 100) : 0;
    const circleRadius = 40;
    const circleCircumference = 2 * Math.PI * circleRadius;
    const multiDash = (multiPct / 100) * circleCircumference;
    const donutHtml = `
      <svg class="hub-donut" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="${circleRadius}" fill="transparent" stroke="var(--item-bg)" stroke-width="15" />
        <circle cx="50" cy="50" r="${circleRadius}" fill="transparent" stroke="var(--primary-green)" stroke-width="15" stroke-dasharray="${multiDash} ${circleCircumference}" />
      </svg>
    `;

    // Dynamic Exclusivity vs Hardware Loyalty Wording
    let exclusiveCount = 0;
    item.games.forEach(game => { if (rawData.metrics?.allTimeGameStats?.[game]?.systems.size === 1) exclusiveCount++; });
    const exclusivityPct = item.games.size > 0 ? Math.round((exclusiveCount / item.games.size) * 100) : 0;
    const excTitle = dataKey === 'system' ? "Platform Exclusivity" : "Hardware Loyalty";
    const excSub = dataKey === 'system' ? `${exclusiveCount} of ${item.games.size} games played ONLY on this hardware` : `${exclusiveCount} of ${item.games.size} games played on a single system`;

    // Release Year hub: that year's Game of the Year, from the same scores as the GotY page
    let gotyHtml = '';
    if (dataKey === 'releaseYear') {
      const goty = metaGames.filter(g => g.score !== null && g.releaseYear === valName)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))[0];
      if (goty) {
        gotyHtml = `<div class="hub-goty">🏆 Game of the Year: <a href="goty.html#year-${encodeURIComponent(valName)}" class="hover-trigger" data-game="${escapeHTML(goty.name)}">${escapeHTML(goty.name)}</a> <span class="hub-goty-score">${formatScore(goty.score)}</span></div>`;
      }
    }

    let itemHtml = `
      <section class="card-row grid-1 hub-pull-up">
        <div class="card hub-identity-card">
          <div class="sys-widget-title hub-spaced">Identity</div>
          <div class="hub-identity-title">${escapeHTML(identityTitle)}</div>
          <div class="hub-identity-columns">
            <div>
              <div class="sys-widget-title">Top ${escapeHTML(attr1Name)}s</div>
              <div class="hub-identity-list">
                ${topAttr1.slice(0,3).map(g => `${g[0]} <span class="hub-sub">(${formatTime(g[1])})</span>`).join('<br>')}
              </div>
            </div>
            <div>
              <div class="sys-widget-title">Top ${escapeHTML(attr2Name)}s</div>
              <div class="hub-identity-list">
                ${topAttr2.slice(0,3).map(d => `${d[0]} <span class="hub-sub">(${formatTime(d[1])})</span>`).join('<br>')}
              </div>
            </div>
          </div>
          ${gotyHtml}
        </div>
      </section>

      <section class="card-row grid-1">
        <div class="card">
          <div class="card-header"><h2>Spotlight Records: ${escapeHTML(valName)}</h2></div>
          <div class="card-content" id="hub-spotlight-records"><div class="loading-text">Loading Spotlight records...</div></div>
        </div>
      </section>

      ${dataKey === 'series' ? `
      <section class="card-row grid-1">
        <div class="card" style="max-height: none;">
          <div class="card-header"><h2>Series Timeline: ${escapeHTML(valName)}</h2></div>
          <div class="card-content">${seriesTimelineHtml(item, valName)}</div>
        </div>
      </section>` : ''}

      <section class="card-row grid-strict-3">
        <div class="card hub-sessions-card">
          <div class="hub-session-first">
            <div class="sys-widget-title">Inaugural Session</div>
            <div class="sys-widget-value hub-session-game">${escapeHTML(firstEntry.game)}</div>
            <div class="sys-widget-sub">${formatFullDate(firstEntry.date)}</div>
          </div>
          <div class="hub-session-last">
            <div class="sys-widget-title">Most Recent Session</div>
            <div class="sys-widget-value hub-session-game">${escapeHTML(lastEntry.game)}</div>
            <div class="sys-widget-sub">${formatFullDate(lastEntry.date)}</div>
          </div>
        </div>
        
        <div class="card hub-completion-card">
          <div class="sys-widget-title hub-mb-12">Completion Rate (${compRate}%)</div>
          <div class="hub-completion-bar">
            <div style="width: ${compRatePct}%; background: var(--status-completed);" title="Completed: ${compCount}"></div>
            <div style="width: ${actRatePct}%; background: var(--status-active);" title="Active: ${actCount}"></div>
            <div style="width: ${abanRatePct}%; background: var(--status-abandoned);" title="Abandoned: ${abanCount}"></div>
            <div class="hub-bar-other" title="Other: ${multiCount}"></div>
          </div>
          <div class="hub-completion-legend">
            <span><span class="hub-status-completed">■</span> Completed: ${compCount}</span>
            <span><span class="hub-status-active">■</span> Active: ${actCount}</span>
            <span><span class="hub-status-abandoned">■</span> Abandoned: ${abanCount}</span>
          </div>
        </div>

        <div class="card hub-social-card">
          <div class="sys-widget-title hub-mb-10">The Social Hub Index</div>
          <div class="hub-donut-wrap">
            ${donutHtml}
            <div class="hub-donut-center">
              <span class="hub-donut-value">${multiPct}%</span>
              <span class="hub-donut-label">Multi</span>
            </div>
          </div>
          <div class="hub-donut-legend">
            <span><span class="hub-green">■</span> Multi (${formatTime(multiSec)})</span>
            <span><span class="hub-swatch-single">■</span> Single (${formatTime(singleSec)})</span>
          </div>
        </div>
      </section>

      <section class="card-row grid-strict-3">
        <div class="card hub-stat-card">
          <div class="sys-widget-title">${excTitle}</div>
          <div class="sys-widget-value">${exclusivityPct}%</div>
          <div class="sys-widget-sub">${excSub}</div>
        </div>
        <div class="card hub-stat-card">
          <div class="sys-widget-title">Golden Era</div>
          <div class="sys-widget-value">${peakYear}</div>
          <div class="sys-widget-sub">${formatTime(peakTime)} (${peakPct}% of total ${escapeHTML(titleLabel)} runtime)</div>
        </div>
        <div class="card hub-stat-card">
          <div class="sys-widget-title">Habit Breakdown</div>
          <div class="sys-widget-value hub-value-md">${weekdayPct}% <span class="hub-unit">WK</span> | ${weekendPct}% <span class="hub-unit">WKND</span></div>
          <div class="sys-widget-sub">${formatTime(weekdaySec)} vs ${formatTime(weekendSec)}</div>
        </div>
      </section>

      <section class="card-row grid-strict-3">
        <div class="card">
          <div class="card-header"><h2>Most Played Games (Time)</h2></div>
          <div class="card-content">
            ${topGamesTime.map((g, i) => `
              <div class="list-item">
                <div class="item-info">
                  <span class="item-rank">#${i + 1}</span>
                  <div class="item-text">
                    <span class="item-title hover-trigger" data-game="${escapeHTML(g.name)}">${escapeHTML(g.name)}</span>
                    <span class="item-sub">${g.days.size} Days logged</span>
                  </div>
                </div>
                <div class="item-badge">${formatTime(g.seconds)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2>Most Played Games (Days)</h2></div>
          <div class="card-content">
            ${topGamesDays.map((g, i) => `
              <div class="list-item">
                <div class="item-info">
                  <span class="item-rank">#${i + 1}</span>
                  <div class="item-text">
                    <span class="item-title hover-trigger" data-game="${escapeHTML(g.name)}">${escapeHTML(g.name)}</span>
                    <span class="item-sub">${formatTime(g.seconds)} logged</span>
                  </div>
                </div>
                <div class="item-badge hub-badge-dark">${g.days.size} Days</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2>Longest Sessions</h2></div>
          <div class="card-content">
            ${topSessions.map((s, i) => `
              <div class="list-item">
                <div class="item-info">
                  <span class="item-rank">#${i + 1}</span>
                  <div class="item-text">
                    <span class="item-title hover-trigger" data-game="${escapeHTML(s.game)}">${escapeHTML(s.game)}</span>
                    <span class="item-sub">${formatShortDate(s.date)}/${new Date(s.date).getUTCFullYear()}</span>
                  </div>
                </div>
                <div class="item-badge hub-badge-title">${formatTime(s.time)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      ${item.scoredGames.length ? `
      <section class="card-row grid-2">
        <div class="card">
          <div class="card-header"><h2>Highest Rated Games</h2></div>
          <div class="card-content">
            ${[...item.scoredGames].sort((a, b) => b.score - a.score || b.seconds - a.seconds).slice(0, 10).map((g, i) => `
              <div class="list-item">
                <div class="item-info">
                  <span class="item-rank">#${i + 1}</span>
                  <div class="item-text">
                    <span class="item-title hover-trigger" data-game="${escapeHTML(g.name)}">${escapeHTML(g.name)}</span>
                    <span class="item-sub">${formatTime(g.seconds)} logged</span>
                  </div>
                </div>
                <div class="item-badge">${formatScore(g.score)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2>Score Distribution</h2></div>
          <div class="card-content">${scoreDistributionHtml(item.scoredGames, item.avgScore)}</div>
        </div>
      </section>

      <section class="card-row grid-1">
        <div class="card">
          <div class="card-header"><h2>Score vs. Hours: ${escapeHTML(valName)}</h2></div>
          <div class="card-content hub-card-body">${scoreHoursScatterHtml(item.scoredGames, medianGameHours)}</div>
        </div>
      </section>` : ''}

      <section class="card-row grid-1">
        <div class="card">
          <div class="card-header"><h2>Full Playthrough Archive: ${escapeHTML(valName)}</h2></div>
          <div class="card-content hub-flush">
            <div class="monthly-table-wrapper hub-pad">
              <table class="monthly-table hub-archive-table">
                <thead>
                  <tr>
                    <th rowspan="2">Videogame</th>
                    <th rowspan="2">Systems Used</th>
                    <th colspan="2">Playthrough Lifetime</th>
                    <th colspan="2">Game Lifetime</th>
                    <th rowspan="2">Date Started</th>
                    <th rowspan="2">Last Updated</th>
                    <th rowspan="2">Game Status</th>
                    <th rowspan="2">Playthrough Details</th>
                  </tr>
                  <tr>
                    <th>Time</th>
                    <th>Days</th>
                    <th>Time</th>
                    <th>Days</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemPlaythroughs.map(pt => `
                    <tr>
                      <td class="text-left hub-bold">
                        <span class="hover-trigger" data-game="${escapeHTML(pt.gameName)}">${escapeHTML(pt.gameName)}</span>
                      </td>
                      <td class="text-center">${escapeHTML(Array.from(pt.systems).join(', '))}</td>
                      <td class="text-center">${pt.finalPtLifetime}</td>
                      <td class="text-center">${pt.finalPtLifetimeDays}</td>
                      <td class="text-center">${pt.finalGameLifetime}</td>
                      <td class="text-center">${pt.finalGameLifetimeDays}</td>
                      <td class="text-center">${formatFullDate(pt.startDate)}</td>
                      <td class="text-center">${formatFullDate(pt.lastDate)}</td>
                      <td class="text-center status-cell" style="background-color: ${getStatusColor(pt.finalStatus)}; font-weight: bold;">${pt.finalStatus}</td>
                      <td class="text-left">${escapeHTML(pt.finalNote)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    `;
    
    dynamicContainer.innerHTML = itemHtml;
    renderHubSpotlightRecords(dataKey, valName);

    dynamicContainer.querySelectorAll('.card').forEach((card, index) => {
      card.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;
    });
  };

  const hubSelect = document.getElementById('hub-item-select');
  hubSelect.addEventListener('change', (e) => renderSelectedItem(e.target.value));
  // ?item=NS2 (from a game profile) opens that item's deep dive
  const requested = new URLSearchParams(window.location.search).get('item');
  const initial = requested && hubData[requested] ? requested : sortedItems[0].name;
  hubSelect.value = initial;
  renderSelectedItem(initial);
  if (requested && hubData[requested]) hubSelect.scrollIntoView({ behavior: 'instant', block: 'start' });
}

// --- SPOTLIGHT RECORDS HELD BY A HUB ITEM ---
// The Spotlight column heading that ranks each kind of hub item
// Franchise deep dive: one row per game in the series (in the order first played), a cell for each year it was
// played (darker for more hours) and a dot for each completion of the main game
function seriesTimelineHtml(item, seriesName) {
  const firstYear = Number(rawData.allEntries[0].date.slice(0, 4)), lastYear = Number(dataDateKey().slice(0, 4));
  const games = new Map();
  item.entries.forEach(e => {
    if (!games.has(e.game)) games.set(e.game, { name: e.game, years: new Map(), completions: [] });
    const y = Number(e.date.slice(0, 4));
    games.get(e.game).years.set(y, (games.get(e.game).years.get(y) || 0) + timeStringToSeconds(e.time));
  });
  getSortedCompletions('All-Time').filter(pt => pt.series === seriesName && games.has(pt.gameName))
    .forEach(pt => games.get(pt.gameName).completions.push(pt.displayDate.toISOString().slice(0, 10)));
  const rows = [...games.values()];
  const yearTotals = new Map();
  rows.forEach(g => g.years.forEach((sec, y) => yearTotals.set(y, (yearTotals.get(y) || 0) + sec)));
  const maxSec = Math.max(...rows.flatMap(g => [...g.years.values()]));
  const padL = 250, padR = 12, padT = 22, rowH = 22, width = 1000, cellW = (width - padL - padR) / (lastYear - firstYear + 1);
  const height = padT + (rows.length + 1) * rowH + 6;
  const x = y => padL + (y - firstYear) * cellW;
  // Shade by the square root of the hours, so a 2-hour visit still shows beside a 100-hour year
  const shade = sec => (0.15 + 0.85 * Math.sqrt(sec / maxSec)).toFixed(2);
  const label = (text, y, bold) => `<text x="${padL - 10}" y="${y}" text-anchor="end" font-family="Inter, sans-serif" font-size="12" font-weight="${bold ? 800 : 600}" fill="var(--text-title)">${escapeHTML(text.length > 36 ? text.slice(0, 35) + '…' : text)}</text>`;
  let svg = `<svg class="hub-chart series-timeline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Years each ${escapeHTML(seriesName)} game was played">`;
  for (let y = firstYear; y <= lastYear; y++) {
    if ((y - firstYear) % 2 === 0) svg += `<text x="${x(y) + cellW / 2}" y="${padT - 8}" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="var(--text-muted)">${y}</text>`;
  }
  // The series as a whole on top, then each game
  svg += label('All games', padT + rowH / 2 + 4, true);
  const maxYear = Math.max(...yearTotals.values());
  yearTotals.forEach((sec, y) => {
    svg += `<rect x="${x(y) + 1}" y="${padT + 3}" width="${cellW - 2}" height="${rowH - 6}" rx="3" fill="var(--text-title)" opacity="${(0.15 + 0.85 * Math.sqrt(sec / maxYear)).toFixed(2)}"><title>${escapeHTML(seriesName)} in ${y}: ${formatTime(sec)}</title></rect>`;
  });
  rows.forEach((g, i) => {
    const top = padT + (i + 1) * rowH;
    svg += label(g.name, top + rowH / 2 + 4, false);
    svg += `<line x1="${padL}" x2="${width - padR}" y1="${top + rowH / 2}" y2="${top + rowH / 2}" stroke="var(--border-light)"/>`;
    g.years.forEach((sec, y) => {
      svg += `<rect x="${x(y) + 1}" y="${top + 3}" width="${cellW - 2}" height="${rowH - 6}" rx="3" fill="var(--primary-green)" opacity="${shade(sec)}"><title>${escapeHTML(g.name)} in ${y}: ${formatTime(sec)}</title></rect>`;
    });
    g.completions.forEach(date => {
      const y = Number(date.slice(0, 4)), cx = x(y) + cellW * (dayOfYear(date) + 0.5) / 366;
      svg += `<circle cx="${cx.toFixed(1)}" cy="${top + rowH / 2}" r="4.5" fill="var(--card-bg)" stroke="var(--text-title)" stroke-width="2"><title>${escapeHTML(g.name)} completed ${formatFullDate(date)}</title></circle>`;
    });
  });
  svg += '</svg>';
  const spanYears = [...yearTotals.keys()];
  const active = spanYears.length, span = Math.max(...spanYears) - Math.min(...spanYears) + 1;
  return `<div class="goty-gap-subtitle">Played in ${active} of the ${span} years from ${Math.min(...spanYears)} to ${Math.max(...spanYears)}. Darker cells mean more hours; a dot is a completion.</div>
    <div class="monthly-table-wrapper">${svg}</div>`;
}

const HUB_SPOTLIGHT_HEADERS = { system: 'System', series: 'Series', genre: 'Genre', releaseYear: 'Release Year' };

// Lists this system, franchise, genre or release year leads or appears in. The lists are downloaded only when needed.
let _hubShownItem = null;
function renderHubSpotlightRecords(dataKey, valName) {
  _hubShownItem = valName;
  const target = () => document.getElementById('hub-spotlight-records');
  loadData(['lists']).then(() => {
    // Another item may have been picked while the lists were loading
    if (!target() || _hubShownItem !== valName) return;
    const lists = rawData.metrics.top25Lists || [];
    const slugs = spotlightSlugs(lists);
    const leads = [], appearsIn = [];
    let ownList = null;
    lists.forEach((list, i) => {
      if (/^Top Games by /.test(list.category) && (list.titleLeft === `Top 25 ${valName} Games` || list.titleLeft === `Top 25 ${valName}s Games`)) ownList = { title: list.titleLeft, slug: slugs[i] };
      if (list.headersLeft[1] !== HUB_SPOTLIGHT_HEADERS[dataKey]) return;
      const rowIndex = list.allTime.findIndex(row => String(row[1]) === valName);
      if (rowIndex === -1) return;
      // Tied rows leave the rank blank, so use the nearest rank above
      let rank = '';
      for (let r = rowIndex; r >= 0 && !rank; r--) rank = list.allTime[r][0] || '';
      const entry = { title: list.titleLeft, slug: slugs[i], value: list.allTime[rowIndex][3], rank };
      if (rowIndex === 0) leads.push(entry); else appearsIn.push(entry);
    });
    const row = e => `<a class="game-spotlight-item" href="spotlight.html#${e.slug}"><span><span class="game-spotlight-rank">${escapeHTML(String(e.rank))}</span>${escapeHTML(e.title)}</span><strong>${escapeHTML(String(e.value))}</strong></a>`;
    target().innerHTML = `
      ${ownList ? `<a class="game-spotlight-item" href="spotlight.html#${ownList.slug}"><span><span class="game-spotlight-rank">▶</span>${escapeHTML(ownList.title)}</span><strong>Open list</strong></a>` : ''}
      ${leads.length ? `<div class="game-spotlight-heading">Holds #1 in ${leads.length} list${leads.length === 1 ? '' : 's'}</div>${leads.map(row).join('')}` : '<div class="game-spotlight-heading">Not #1 in any Spotlight list</div>'}
      ${appearsIn.length ? `<div class="game-spotlight-heading">Also ranked in ${appearsIn.length} list${appearsIn.length === 1 ? '' : 's'}</div>${appearsIn.map(row).join('')}` : ''}
    `;
  }).catch(error => {
    console.error("Dashboard Error:", error);
    if (target()) target().innerHTML = `<div class="loading-text">Spotlight records could not be loaded.</div>`;
  });
}

// --- SCORE CHARTS (hub deep dives) ---
const SCORE_BUCKETS = [
  { label: '9+', min: 9 }, { label: '8 – 8.9', min: 8 }, { label: '7 – 7.9', min: 7 },
  { label: '6 – 6.9', min: 6 }, { label: '5 – 5.9', min: 5 }, { label: 'Under 5', min: -Infinity }
];

function scoreDistributionHtml(scoredGames, avgScore) {
  const counts = SCORE_BUCKETS.map(() => 0);
  scoredGames.forEach(g => { counts[SCORE_BUCKETS.findIndex(b => g.score >= b.min)]++; });
  const max = Math.max(...counts, 1);
  return `
    <div class="score-dist-summary">Average <strong>${avgScore.toFixed(1)}</strong> across ${scoredGames.length} scored game${scoredGames.length === 1 ? '' : 's'}</div>
    ${SCORE_BUCKETS.map((b, i) => `
      <div class="score-dist-row">
        <span class="score-dist-label">${b.label}</span>
        <div class="score-dist-track"><div class="score-dist-bar" style="width: ${(counts[i] / max) * 100}%;"></div></div>
        <span class="score-dist-count">${counts[i]}</span>
      </div>
    `).join('')}
  `;
}

// Each scored game by score (x) and hours played (y, square-root scale so small games stay visible)
function scoreHoursScatterHtml(scoredGames, medianHours) {
  const width = 1000, height = 440, padL = 70, padR = 30, padT = 30, padB = 50;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const games = scoredGames.map(g => ({ ...g, hours: g.seconds / 3600 }));
  const minScore = Math.min(Math.floor(Math.min(...games.map(g => g.score))), HIGH_SCORE - 1);
  const maxHours = Math.max(...games.map(g => g.hours), medianHours * 2, 1) * 1.1;
  const x = score => padL + ((score - minScore) / (10 - minScore)) * innerW;
  const y = hours => padT + innerH - (Math.sqrt(hours) / Math.sqrt(maxHours)) * innerH;
  const quadrant = g => g.score >= HIGH_SCORE ? (g.hours >= medianHours ? 'favorite' : 'gem') : (g.hours >= medianHours ? 'comfort' : 'tried');
  const QUADRANT_COLORS = { favorite: 'var(--primary-green)', gem: '#00b4d8', comfort: '#ff9f1c', tried: 'var(--text-muted)' };
  const splitX = x(HIGH_SCORE), splitY = y(medianHours);
  const text = (tx, ty, str, extra = '') => `<text x="${tx}" y="${ty}" font-family="Inter, sans-serif" ${extra}>${str}</text>`;

  let svg = `<svg class="hub-chart" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect x="${splitX}" y="${padT}" width="${padL + innerW - splitX}" height="${splitY - padT}" fill="var(--highlight-green-bg)" opacity="0.5" />`;
  svg += `<line x1="${splitX}" y1="${padT}" x2="${splitX}" y2="${padT + innerH}" stroke="var(--border-table)" stroke-dasharray="4 4" />`;
  svg += `<line x1="${padL}" y1="${splitY}" x2="${padL + innerW}" y2="${splitY}" stroke="var(--border-table)" stroke-dasharray="4 4" />`;
  svg += `<line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="var(--text-muted)" stroke-width="2" />`;
  svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="var(--text-muted)" stroke-width="2" />`;
  for (let s = minScore; s <= 10; s++) svg += text(x(s), padT + innerH + 20, s, 'fill="var(--text-muted)" font-size="12" font-weight="600" text-anchor="middle"');
  svg += text(padL + innerW / 2, height - 8, 'Score', 'fill="var(--text-muted)" font-size="12" font-weight="800" text-anchor="middle"');
  [0, maxHours / 16, maxHours / 4, maxHours * 9 / 16, maxHours].forEach(h => {
    svg += text(padL - 10, y(h) + 4, `${Math.round(h)}h`, 'fill="var(--text-muted)" font-size="12" font-weight="600" text-anchor="end"');
  });
  games.forEach(g => {
    svg += `<circle cx="${x(g.score)}" cy="${y(g.hours)}" r="6" fill="${QUADRANT_COLORS[quadrant(g)]}" stroke="var(--card-bg)" stroke-width="1.5"><title>${escapeHTML(g.name)}: score ${formatScore(g.score)}, ${formatTime(g.seconds)}</title></circle>`;
  });
  // Label the most-played games, skipping any label that would overlap one already placed (hover shows the rest)
  const placed = [];
  [...games].sort((a, b) => b.hours - a.hours).slice(0, 12).forEach(g => {
    const lx = x(g.score), ly = y(g.hours) - 10, halfWidth = Math.min(g.name.length, 40) * 3.2;
    const left = Math.max(padL + halfWidth, Math.min(lx, padL + innerW - halfWidth));
    if (placed.some(p => Math.abs(p.y - ly) < 14 && Math.abs(p.x - left) < p.halfWidth + halfWidth)) return;
    placed.push({ x: left, y: ly, halfWidth });
    svg += text(left, ly, escapeHTML(g.name), 'fill="var(--text-title)" font-size="11" font-weight="800" text-anchor="middle"');
  });
  const QUADRANTS = [
    ['favorite', 'Favorites', 'high score, lots of time'], ['gem', 'Hidden Gems', 'high score, little time'],
    ['comfort', 'Comfort Picks', 'lower score, lots of time'], ['tried', 'Tried It', 'lower score, little time']
  ];
  const counts = {};
  games.forEach(g => { counts[quadrant(g)] = (counts[quadrant(g)] || 0) + 1; });
  return svg + `</svg>
    <div class="score-scatter-legend">
      ${QUADRANTS.map(([key, name, desc]) => `<span><i style="background: ${QUADRANT_COLORS[key]};"></i><strong>${name}</strong> ${counts[key] || 0} <span class="score-scatter-desc">(${desc})</span></span>`).join('')}
    </div>
    <div class="score-scatter-note">Dividing lines: score ${HIGH_SCORE}, and ${medianHours.toFixed(1)}h, the median play time across all your games. Hover a dot for its game.</div>`;
}
