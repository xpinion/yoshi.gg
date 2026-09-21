// app.js - Logic for Yoshi's Videogame Dashboard

// Global State
let rawData = null;
let metaGames = [];
let metaScores = new Map();
let allTop25Tables = [];

// Constants for Metadata Columns
const META_GAME = 0;
const META_RELEASE_YEAR = 1;
const META_GENRE = 2;
const META_DEVELOPER = 3;
const META_PUBLISHER = 4;
const META_SERIES = 5;
const META_YOSCORE = 6;

// Utilities
function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds === 0) return "0m";
  const mins = Math.floor(totalSeconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}
function formatShortDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}
// Utility: Format date to "YYYY/MM/DD"
function formatFullDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}
function timeStringToSeconds(timeString) {
  if (!timeString || typeof timeString !== 'string') return 0;
  const p = timeString.split(':').map(s => parseInt(s, 10));
  if (p.length === 3) return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
  if (p.length === 2) return (p[0] || 0) * 3600 + (p[1] || 0) * 60;
  return 0;
}
function formatHHMM(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return "00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
function getStatusColor(status) {
  switch (status) {
    case 'Completed': case 'M-Completed': case 'Postgame': return '#00FF00';
    case 'Active': return '#FFFF00';
    case 'Multiplayer': return '#00FFFF';
    case 'Abandoned': return '#FFCCCC';
    case 'Non-Completable': return '#DDDDDD';
    default: return '#FFFFFF';
  }
}
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// --- UPDATE: GLOBAL HEADER ---
function renderGlobalHeader() {
  const headerContainer = document.getElementById('global-header');
  if (!headerContainer) return;

  headerContainer.innerHTML = `
  <div class="dashboard-header">
    <h1>yoshi xcx's videogame dashboard</h1>
    <button id="theme-toggle" class="theme-btn">🌙 Dark Mode</button>
  </div>
  <nav class="global-nav">
    <a href="index.html">Index</a>
    <a href="monthly.html">Monthly</a>
    <a href="yearly.html">Yearly</a>
    <a href="completions.html">Completions</a>
    <a href="goty.html">GotY</a>
    <a href="systems.html">Systems</a>
    <a href="franchise.html">Franchise</a>
    <a href="genre.html">Genre</a>
    <a href="releaseyear.html">Release Year</a>
    <a href="spotlight.html">Spotlight</a>
    <a href="analysis.html">Analysis</a>
    <a href="metrics.html">Metrics</a>
    <a href="milestones.html">Milestones</a>
    <a href="history.html">History</a>
  </nav>
  `;
}

// --- UPDATE: DASHBOARD INIT (Add routing and global parsing) ---
async function initDashboard() {
  try {
    const cacheBuster = new Date().getTime(); 

    const [rawResponse, metaResponse] = await Promise.all([
      fetch(`raw_dashboard_data.json?v=${cacheBuster}`),
      fetch(`metadata_data.json?v=${cacheBuster}`)
    ]);

    const rawText = await rawResponse.text();
    rawData = JSON.parse(rawText, (key, value) => {
      if (value && typeof value === 'object' && value._dataType === 'Set') {
        return new Set(value.value || value.data || []);
      }
      return value;
    });

    const metaData = await metaResponse.json();

    for (let i = 1; i < metaData.values.length; i++) {
      const row = metaData.values[i];
      if (row && row[META_GAME]) {
        const score = parseFloat(row[META_YOSCORE]);
        metaGames.push({
          name: row[META_GAME], releaseYear: row[META_RELEASE_YEAR] || 'Unknown',
          genre: row[META_GENRE] || 'Unknown', developer: row[META_DEVELOPER] || 'Unknown',
          publisher: row[META_PUBLISHER] || 'Unknown', franchise: row[META_SERIES] || 'Unknown',
          score: isNaN(score) ? null : score
        });
        metaScores.set(row[META_GAME], isNaN(score) ? '-' : score);
      }
    }

    setupSpotlightDropdown(); // NEW: Wires up the Index page dropdown!

    renderGlobalHeader();
    setupThemeToggle();
    setupHoverHistory();

    const path = window.location.href.toLowerCase();

    if (path.includes('monthly')) initMonthlyPage();
    else if (path.includes('yearly')) initYearlyPage();
    else if (path.includes('completions')) initCompletionsPage();
    else if (path.includes('goty')) initGotyPage();
    else if (path.includes('systems')) initSystemsPage();
    else if (path.includes('franchise')) initFranchisePage();
    else if (path.includes('genre')) initGenrePage();
    else if (path.includes('releaseyear')) initReleaseYearPage();
    else if (path.includes('spotlight')) initSpotlightPage();
    else if (path.includes('analysis')) initAnalysisPage();
    else if (path.includes('metrics')) initMetricsPage();
    else if (path.includes('milestones')) {
      const msContainer = document.getElementById('milestones-page-container');
      if (msContainer) renderMilestones('milestones-page-container');
    }
    else if (path.includes('history')) initHistoryPage();
    else initIndexPage();

  } catch (error) {
    console.error("Dashboard Error:", error);
    document.querySelectorAll('.card-content, .dashboard-container').forEach(el => {
      el.innerHTML = `<div class="loading-text" style="color: red; padding: 20px;">
        <h3>Error Loading Dashboard</h3>
        <p>${error.message}</p>
      </div>`;
    });
  }
}

// --- UPDATE: INIT INDEX PAGE (Remove redundant parseTop25Data) ---
function initIndexPage() {
  setupDropdowns();
  setupLiveSearch();
  renderOnThisDay(); // Calls the generalized render function
  renderMilestones('milestones-list'); // Passes explicit ID
  renderAnalysis('playthrough', 'analysis-content');
  renderHeatmap('gameSummary', 'heatmap-content');

  document.querySelectorAll('.card').forEach((card, index) => {
    card.style.animationDelay = `${index * 0.08}s`;
  });
}

// --- NEW: ANALYSIS PAGE ROUTING ---
function initAnalysisPage() {
  const container = document.getElementById('analysis-page-container');
  if (!container || !rawData || !rawData.metrics) return;

  const sections = [
    { id: 'playthrough', title: 'Playthrough Stats' },
    { id: 'dayOfWeek', title: 'Day of Week Stats' },
    { id: 'genre', title: 'Genre Stats' },
    { id: 'releaseYear', title: 'Release Year Stats' },
    { id: 'developer', title: 'Developer Stats' },
    { id: 'publisher', title: 'Publisher Stats' }
  ];

  let html = '';
  sections.forEach(sec => {
    html += `
      <section class="card-row grid-1" style="margin-bottom: 30px;">
        <div class="card" style="max-height: none;">
          <div class="card-header"><h2>${sec.title}</h2></div>
          <div class="card-content" id="analysis-page-${sec.id}" style="padding: 0;"></div>
        </div>
      </section>
    `;
  });

  container.innerHTML = html;

  sections.forEach(sec => {
    renderAnalysis(sec.id, `analysis-page-${sec.id}`);
  });
}

// --- NEW: METRICS PAGE ROUTING ---
function initMetricsPage() {
  const container = document.getElementById('metrics-page-container');
  if (!container || !rawData || !rawData.metrics) return;

  const sections = [
    { id: 'gameSummary', title: 'Table: Game Timeframe Summary' },
    { id: 'genreSummary', title: 'Table: Genre Timeframe Summary' },
    { id: 'gotySummary', title: 'Table: Game of the Year (Scores)' },
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
    renderHeatmap(sec.id, `metrics-page-${sec.id}`);
  });
}

// --- NEW: HISTORY PAGE ROUTING ---
function initHistoryPage() {
  const select = document.getElementById('history-day-select');
  if (!select) return;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Allow Feb 29

  let optionsHtml = '';
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= daysInMonth[m]; d++) {
      const val = `${m}-${d}`;
      const text = `${monthNames[m]} ${d.toString().padStart(2, '0')}`;
      optionsHtml += `<option value="${val}">${text}</option>`;
    }
  }
  select.innerHTML = optionsHtml;

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();
  const todayVal = `${currentMonth}-${currentDay}`;
  
  select.value = todayVal;
  select.addEventListener('change', (e) => {
    const [m, d] = e.target.value.split('-').map(Number);
    renderOnThisDay(m, d, 'history-page-container');
  });

  renderOnThisDay(currentMonth, currentDay, 'history-page-container');
}

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
    <section class="card-row grid-1">
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
  keys.forEach(key => {
    renderTimeframeSummary(key, mode, `${mode}-summary-${key}`);
  });

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

// Backwards compatibility wrapper for index.html
function renderMonthlySummary(monthKey, containerId = 'monthly-summary-list') {
  renderTimeframeSummary(monthKey, 'monthly', containerId);
}

// --- COMPLETIONS PAGE ROUTING ---
function initCompletionsPage() {
  const container = document.getElementById('completions-page-container');
  if (!container || !rawData || !rawData.playthroughHistory) return;

  // Filter for completed/postgame states
  const completions = Object.values(rawData.playthroughHistory).filter(pt => {
    return (pt.completionDates && pt.completionDates.length > 0) || ['Completed', 'M-Completed', 'Postgame'].includes(pt.finalStatus);
  });

  // Calculate display dates and entry numbers
  completions.forEach(pt => {
    const cDate = (pt.completionDates && pt.completionDates.length > 0) ? new Date(pt.completionDates[0]) : new Date(pt.lastDate);
    pt.displayDate = cDate;
    const finalEntry = rawData.allEntries.slice().reverse().find(e => e.ptTag === pt.ptTag && ['Completed', 'M-Completed', 'Postgame'].includes(e.status));
    pt.entryNum = finalEntry ? Number(finalEntry.entryNum) : 0;
  });

  // Sort OLDEST first to calculate running metadata totals accurately
  completions.sort((a, b) => {
    const dateDiff = a.displayDate.getTime() - b.displayDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.entryNum - b.entryNum;
  });

  const genreCounts = {};
  const seriesCounts = {};
  const devCounts = {};

  // Assign overall rank and metadata ranks
  completions.forEach((pt, index) => {
    pt.overallRank = index + 1;

    if (pt.genre && pt.genre !== "N/A") {
      genreCounts[pt.genre] = (genreCounts[pt.genre] || 0) + 1;
      pt.genreRank = genreCounts[pt.genre];
    }
    if (pt.series && pt.series !== "N/A" && pt.series.toUpperCase() !== "ZZNONE") {
      seriesCounts[pt.series] = (seriesCounts[pt.series] || 0) + 1;
      pt.seriesRank = seriesCounts[pt.series];
    }
    if (pt.developer && pt.developer !== "N/A") {
      devCounts[pt.developer] = (devCounts[pt.developer] || 0) + 1;
      pt.devRank = devCounts[pt.developer];
    }
  });

  // Reverse back to NEWEST first for dashboard display
  completions.reverse();
  const totalCompletions = completions.length;

  let html = `
  <div class="card-row grid-1">
    <div style="text-align: center; margin-bottom: 10px;">
      <h2 style="font-size: 2.5rem; color: var(--text-header); font-weight: 900;">All-Time Completions: <span style="color: var(--primary-green);">${totalCompletions}</span></h2>
    </div>
  </div>
  <div class="completion-grid">
  `;

  html += completions.map((pt, index) => {
    const score = metaScores.get(pt.gameName) || '-';
    const badgeHTML = score !== '-' ? `<div class="item-badge cc-score">${score}</div>` : `<div class="item-badge cc-score" style="background: var(--heatmap-empty); color: var(--text-muted);">-</div>`;
    const formattedTime = formatTime(timeStringToSeconds(pt.finalPtLifetime));
    const statusColor = getStatusColor(pt.finalStatus);
    
    let pastCompletionsHtml = '';
    if (rawData.metrics && rawData.metrics.completionStats) {
      const allTimeGameData = rawData.metrics.completionStats.find(g => g.gameName === pt.gameName);
      if (allTimeGameData && allTimeGameData.completionDates.length > 1) {
        const currentCompletionStr = formatFullDate(pt.displayDate);
        const pastDates = allTimeGameData.completionDates
          .map(d => formatFullDate(d))
          .filter(d => d !== currentCompletionStr);
        if (pastDates.length > 0) {
          const uniquePastDates = [...new Set(pastDates)];
          pastCompletionsHtml = `<div class="cc-past"><strong>Also completed on:</strong> ${uniquePastDates.join(', ')}</div>`;
        }
      }
    }

    // Build the metadata rank pills
    let metaRanksHtml = '';
    if (pt.genreRank) metaRanksHtml += `<span class="meta-rank-pill">${escapeHTML(pt.genre)} #${pt.genreRank}</span>`;
    if (pt.seriesRank) metaRanksHtml += `<span class="meta-rank-pill">${escapeHTML(pt.series)} #${pt.seriesRank}</span>`;
    if (pt.devRank) metaRanksHtml += `<span class="meta-rank-pill">${escapeHTML(pt.developer)} #${pt.devRank}</span>`;

    return `
    <div class="completion-card card" style="border-top: 6px solid ${statusColor}; animation-delay: ${Math.min(index * 0.03, 1.2)}s;">
      
      <div class="cc-header">
        <span class="cc-rank">Completion #${pt.overallRank}</span>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
          <span class="cc-title hover-trigger" data-game="${escapeHTML(pt.gameName)}">${escapeHTML(pt.gameName)}</span>
          ${badgeHTML}
        </div>
        <div class="cc-meta">
          <span class="cc-pill" style="background: var(--item-bg); border: 1px solid var(--border-light);">${escapeHTML(pt.system)}</span>
          <span class="cc-pill" style="background: var(--item-bg); border: 1px solid ${statusColor}; color: var(--text-main); font-weight: 900;">${pt.finalStatus}</span>
        </div>
      </div>

      <div class="cc-stats-grid">
        <div class="cc-stat-block">
          <span class="cc-stat-label">Total Time</span>
          <span class="cc-stat-val">${formattedTime}</span>
        </div>
        <div class="cc-stat-block">
          <span class="cc-stat-label">Days Played</span>
          <span class="cc-stat-val">${pt.finalPtLifetimeDays}</span>
        </div>
      </div>

      <div class="cc-footer-dates">
        <span><strong>Start:</strong> ${formatFullDate(pt.startDate)} &nbsp;|&nbsp; <strong>End:</strong> ${formatFullDate(pt.displayDate)}</span>
        ${pastCompletionsHtml}
      </div>

      ${metaRanksHtml ? `<div class="cc-meta-ranks">${metaRanksHtml}</div>` : ''}

      <div class="cc-note-toggle" onclick="this.nextElementSibling.classList.toggle('visible')">
        📖 Toggle Playthrough Details
      </div>
      <div class="cc-note-content">
        ${escapeHTML(pt.finalNote)}
      </div>

    </div>
    `;
  }).join('');

  html += `</div>`;
  container.innerHTML = html;
}

// --- GOTY / RANKINGS PAGE ROUTING ---
function initGotyPage() {
  const container = document.getElementById('goty-page-container');
  if (!container || !metaGames) return;

  const ratedGames = metaGames.filter(g => g.score !== null);

  // 1. Grouping Data
  const allTime = [...ratedGames];
  const decades = { '2020s': [], '2010s': [], '2000s': [], '1990s': [], '1980s': [] };
  const byYear = {};

  ratedGames.forEach(g => {
    const yStr = g.releaseYear;
    if (yStr && yStr !== 'Unknown') {
      const y = parseInt(yStr, 10);
      if (!isNaN(y)) {
        // Decades
        if (y >= 2020 && y <= 2029) decades['2020s'].push(g);
        else if (y >= 2010 && y <= 2019) decades['2010s'].push(g);
        else if (y >= 2000 && y <= 2009) decades['2000s'].push(g);
        else if (y >= 1990 && y <= 1999) decades['1990s'].push(g);
        else if (y >= 1980 && y <= 1989) decades['1980s'].push(g);

        // Years
        if (!byYear[y]) byYear[y] = [];
        byYear[y].push(g);
      }
    }
  });

  const sortedYears = Object.keys(byYear).sort((a, b) => b - a);

  // 2. Render Helper for Cards
  const buildRankCard = (title, gamesArray, limit, anchorId = null) => {
    if (!gamesArray || gamesArray.length === 0) return '';
    
    gamesArray.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const idAttr = anchorId ? `id="${anchorId}"` : '';

    let html = `
    <div class="card goty-card" ${idAttr} style="scroll-margin-top: 100px;">
      <div class="card-header">
        <h2>${escapeHTML(title)}</h2>
      </div>
      <div class="card-content goty-list-container">
    `;

    let actualPosition = 1;
    let lastScore = -1;

    gamesArray.forEach((game, index) => {
      let rankText = game.score !== lastScore ? `#${actualPosition}` : '';
      lastScore = game.score; 
      actualPosition++;

      const displayScore = Number.isInteger(game.score) ? game.score : game.score.toFixed(1);
      
      const gameStats = rawData && rawData.metrics && rawData.metrics.allTimeGameStats[game.name] ? rawData.metrics.allTimeGameStats[game.name] : null;
      const timeStr = gameStats ? formatTime(gameStats.totalSeconds) : "0m";
      const daysCount = gameStats && gameStats.days ? (gameStats.days.size || gameStats.days.length || (gameStats.days.data ? gameStats.days.data.length : 0)) : 0;
      const firstStr = (gameStats && gameStats.firstPlayedDate) ? formatFullDate(gameStats.firstPlayedDate) : "-";
      const lastStr = (gameStats && gameStats.lastPlayedDate) ? formatFullDate(gameStats.lastPlayedDate) : "-";
      
      const hiddenClass = index >= limit ? 'goty-hidden-item' : '';

      html += `
        <div class="list-item ${hiddenClass}" style="align-items: flex-start; flex-direction: column; padding: 12px; border-left-color: var(--primary-green);">
          
          <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
            <span class="item-title" style="font-weight: 900; font-size: 1.05rem;">
              <span style="color: var(--text-muted); margin-right: 8px; min-width: 25px; display: inline-block;">${rankText}</span>
              <span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span>
            </span>
            <div class="item-badge" style="font-size: 1rem; padding: 6px 12px;">${displayScore}</div>
          </div>
          
          <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 8px;">
            <span>Dev: <strong>${escapeHTML(game.developer)}</strong></span>
            <span><strong>${timeStr}</strong> | ${daysCount} Days</span>
          </div>
          
          <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 4px; color: var(--text-muted); font-size: 0.7rem;">
            <span>First Played: ${firstStr}</span>
            <span>Last Update: ${lastStr}</span>
          </div>

        </div>
      `;
    });

    if (gamesArray.length > limit) {
      html += `
        <div class="goty-toggle-btn" onclick="this.parentElement.classList.toggle('expanded'); this.innerText = this.parentElement.classList.contains('expanded') ? 'Hide Extra Rankings' : 'Show All ${gamesArray.length} Rankings';">
          Show All ${gamesArray.length} Rankings
        </div>
      `;
    }

    html += `</div></div>`;
    return html;
  };

  // 3. Assemble Layout
  let html = '';

  // SECTION 1: GOTY Highlight Table (3 Equal Columns, 1985 - Present)
  const yearsSince1985 = sortedYears.filter(y => parseInt(y) >= 1985);
  const totalYears = yearsSince1985.length;
  const col1Count = Math.ceil(totalYears / 3);
  const col2Count = Math.ceil((totalYears - col1Count) / 2);

  const col1Years = yearsSince1985.slice(0, col1Count);
  const col2Years = yearsSince1985.slice(col1Count, col1Count + col2Count);
  const col3Years = yearsSince1985.slice(col1Count + col2Count);

  const renderGotyColumnTable = (yearList) => {
    let tHtml = `
      <table class="analysis-table goty-highlight-table">
        <thead>
          <tr>
            <th style="width: 65px;">Year</th>
            <th>Game of the Year</th>
            <th style="width: 65px;">Score</th>
          </tr>
        </thead>
        <tbody>
    `;
    yearList.forEach(year => {
      const games = [...byYear[year]];
      games.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
      if (games.length > 0) {
        const goty = games[0];
        const displayScore = Number.isInteger(goty.score) ? goty.score : goty.score.toFixed(1);
        tHtml += `
          <tr>
            <td style="font-weight: 800; font-size: 1rem;">${year}</td>
            <td class="text-left" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">
              <span class="hover-trigger" style="font-weight: 800; color: var(--text-title);" data-game="${escapeHTML(goty.name)}">${escapeHTML(goty.name)}</span>
            </td>
            <td><div class="item-badge" style="display: inline-block; padding: 3px 8px; font-size: 0.85rem;">${displayScore}</div></td>
          </tr>
        `;
      }
    });
    tHtml += `</tbody></table>`;
    return tHtml;
  };

  html += `
  <section class="card-row grid-1">
    <div class="card">
      <div class="card-header">
        <h2>Game of the Year Highlights (1985 - Present)</h2>
      </div>
      <div class="card-content">
        <div class="goty-highlight-grid">
          <div>${renderGotyColumnTable(col1Years)}</div>
          <div>${renderGotyColumnTable(col2Years)}</div>
          <div>${renderGotyColumnTable(col3Years)}</div>
        </div>
      </div>
    </div>
  </section>
  `;

  // SECTION 2: Table of Contents
  html += `
  <section class="card-row grid-1">
    <div class="card">
      <div class="card-header" style="border-bottom: none; padding-bottom: 0; margin-bottom: 10px;">
        <h2>Jump to Year</h2>
      </div>
      <div class="card-content">
        <div class="goty-toc">
  `;
  sortedYears.forEach(year => {
    html += `<a href="#year-${year}" class="goty-toc-link">${year}</a>`;
  });
  html += `
        </div>
      </div>
    </div>
  </section>
  `;

  // SECTION 3: All-Time and Decades (Top 25)
  html += `<section class="card-row grid-strict-3">`;
  html += buildRankCard("Top 25 All-Time", allTime, 25);
  html += buildRankCard("Top 25: 2020s", decades['2020s'], 25);
  html += buildRankCard("Top 25: 2010s", decades['2010s'], 25);
  html += `</section>`;

  html += `<section class="card-row grid-strict-3">`;
  html += buildRankCard("Top 25: 2000s", decades['2000s'], 25);
  html += buildRankCard("Top 25: 1990s", decades['1990s'], 25);
  html += buildRankCard("Top 25: 1980s", decades['1980s'], 25);
  html += `</section>`;

  // SECTION 4: Yearly Rankings (Strict 3-Column Grid)
  html += `
    <div class="card-row grid-1" style="margin-top: 20px;">
      <h2 style="font-size: 2rem; color: var(--text-header); font-weight: 900; text-align: center; border-bottom: 2px solid var(--border-light); padding-bottom: 10px;">Top 25 Games by Release Year</h2>
    </div>
    <section class="card-row grid-strict-3">
  `;
  
  sortedYears.forEach(year => {
    html += buildRankCard(`${year} Rankings`, byYear[year], 25, `year-${year}`);
  });

  html += `</section>`;
  container.innerHTML = html;

  document.querySelectorAll('.goty-card').forEach((card, index) => {
    card.style.animationDelay = `${Math.min(index * 0.05, 1.5)}s`;
  });
}

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
      if (['Completed', 'M-Completed', 'Postgame'].includes(pt.finalStatus)) {
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
  let maxTime = 0, maxDays = 0, maxGames = 0, maxComp = 0, maxLongestSess = 0, maxMpgTime = 0;
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

  const mostPlayedItem = sortedItems[0] || { name: "N/A", totalSeconds: 0 };
  const mostDiverseItem = [...sortedItems].sort((a, b) => b.games.size - a.games.size)[0] || { name: "N/A", games: new Set() };
  
  const formatTimeCompact = (val) => formatTime(val).replace(' ', '');
  const getHighlightStr = (val, max, formatFn) => {
    const displayStr = formatFn ? formatFn(val) : val;
    if (val === max && val > 0) return `<span class="stat-highlight">${displayStr}</span>`;
    return displayStr;
  };

  const summaryRowsHtml = sortedItems.map(item => {
    const mpg = item.mostPlayedGame;
    const ls = item.longestSession;
    return `
      <tr>
        <td class="text-left" style="font-weight: 900; font-size: 1.05rem;">${escapeHTML(item.name)}</td>
        <td class="text-center" style="font-size: 0.85rem; white-space: nowrap;">${formatFullDate(item.firstEntryDate)}-${formatFullDate(item.lastEntryDate)}</td>
        <td class="text-center" style="white-space: nowrap;">${getHighlightStr(item.totalSeconds, maxTime, formatTimeCompact)}</td>
        <td class="text-center">${getHighlightStr(item.days.size, maxDays)}</td>
        <td class="text-center">${getHighlightStr(item.games.size, maxGames)}</td>
        <td class="text-center">${getHighlightStr(item.completions, maxComp)}</td>
        <td class="text-left" style="line-height: 1.5;">
          <span class="hover-trigger" style="font-weight: 800; font-size: 0.95rem; color: var(--text-title);" data-game="${escapeHTML(mpg.name)}">${escapeHTML(mpg.name)}</span><br>
          <span style="font-size: 0.8rem; color: var(--text-sub); white-space: nowrap;">
            ${getHighlightStr(mpg.seconds, maxMpgTime, formatTimeCompact)} &nbsp;|&nbsp; (${mpg.minDate ? formatFullDate(mpg.minDate) : "-"}-${mpg.maxDate ? formatFullDate(mpg.maxDate) : "-"})
          </span>
        </td>
        <td class="text-left" style="line-height: 1.5;">
          <span class="hover-trigger" style="font-weight: 800; font-size: 0.95rem; color: var(--text-title);" data-game="${escapeHTML(ls.game)}">${escapeHTML(ls.game)}</span><br>
          <span style="font-size: 0.8rem; color: var(--text-sub); white-space: nowrap;">
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
          circlesHtml += `<circle cx="${x}" cy="${y}" r="6" fill="transparent" stroke="transparent" style="cursor: pointer;">
                            <title>${escapeHTML(item.name)} - ${mk}: ${formatTime(val)}</title>
                          </circle>`;
        }
      });
      linesHtml += `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
    });

    return `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; display: block; overflow: visible;">${gridHtml}${linesHtml}${circlesHtml}</svg>`;
  };

  const legendHtml = `
    <div style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; margin-top: 15px;">
      ${top10Items.map((item, i) => `
        <div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 800; color: var(--text-title);">
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
      <div style="width: 100%; display: flex; flex-direction: column; gap: 6px; padding-bottom: 10px;">
        <div style="display: flex; align-items: center; padding-bottom: 5px; border-bottom: 2px solid var(--border-light);">
          <div style="width: 140px; min-width: 140px; font-weight: 800; font-size: 0.85rem; padding-right: 15px; text-align: right; color: var(--text-muted); text-transform: uppercase;">${escapeHTML(titleLabel)}</div>
          <div style="display: flex; flex: 1;">
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

      timelineHtml += `<div style="display: flex; align-items: center;">`;
      timelineHtml += `<div style="width: 140px; min-width: 140px; font-weight: 800; font-size: 0.85rem; padding-right: 15px; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div>`;
      timelineHtml += `<div style="display: flex; flex: 1; gap: 1px; height: 16px;">`;
      
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
    let bHtml = `<div style="display: flex; flex-direction: column; gap: 15px; padding: 10px;">`;
    bHtml += `
      <div style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; margin-bottom: 10px; font-size: 0.85rem; font-weight: 800;">
        <div style="display:flex; align-items:center; gap:5px;"><div style="width:12px;height:12px;background:#4cc9f0; border-radius: 2px;"></div>Micro (&lt;30m)</div>
        <div style="display:flex; align-items:center; gap:5px;"><div style="width:12px;height:12px;background:#4361ee; border-radius: 2px;"></div>Standard (30m-2h)</div>
        <div style="display:flex; align-items:center; gap:5px;"><div style="width:12px;height:12px;background:#7209b7; border-radius: 2px;"></div>Deep (2h-4h)</div>
        <div style="display:flex; align-items:center; gap:5px;"><div style="width:12px;height:12px;background:#f72585; border-radius: 2px;"></div>Marathon (4h-8h)</div>
        <div style="display:flex; align-items:center; gap:5px;"><div style="width:12px;height:12px;background:#ff9f1c; border-radius: 2px;"></div>Epic (8h+)</div>
      </div>
    `;

    sortedItems.slice(0, 50).forEach(item => { 
      const t = item.totalSeconds || 1;
      const b = item.sessionBuckets;
      const p1 = (b.micro/t)*100, p2 = (b.standard/t)*100, p3 = (b.deep/t)*100, p4 = (b.marathon/t)*100, p5 = (b.epic/t)*100;
      
      bHtml += `
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 130px; text-align: right; font-weight: 800; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div>
          <div style="flex: 1; display: flex; height: 24px; border-radius: 4px; overflow: hidden; background: var(--item-bg);">
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

    let svg = `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; display: block; overflow: visible;">`;
    
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
       
       svg += `<circle cx="${cx}" cy="${cy}" r="7" fill="${color}" stroke="var(--card-bg)" stroke-width="2" style="cursor: pointer;">
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
      <div class="card" style="text-align: center; padding: 20px;">
        <div class="sys-widget-title">Total ${escapeHTML(titleLabel)}s</div>
        <div class="sys-widget-value" style="color: var(--primary-green);">${sortedItems.length}</div>
      </div>
      <div class="card" style="text-align: center; padding: 20px;">
        <div class="sys-widget-title">Most Played</div>
        <div class="sys-widget-value" style="font-size: 1.4rem;">${escapeHTML(mostPlayedItem.name)}</div>
        <div class="sys-widget-sub">${formatTime(mostPlayedItem.totalSeconds)}</div>
      </div>
      <div class="card" style="text-align: center; padding: 20px;">
        <div class="sys-widget-title">Largest Library</div>
        <div class="sys-widget-value" style="font-size: 1.4rem;">${escapeHTML(mostDiverseItem.name)}</div>
        <div class="sys-widget-sub">${mostDiverseItem.games.size} Unique Games</div>
      </div>
      <div class="card" style="text-align: center; padding: 20px;">
        <div class="sys-widget-title">Total Logged Time</div>
        <div class="sys-widget-value" style="font-size: 1.8rem;">${formatTime(totalGlobalTime)}</div>
      </div>
    </section>

    <!-- Global Summary Table -->
    <section class="card-row grid-1">
      <div class="card">
        <div class="card-header"><h2>All-Time ${escapeHTML(titleLabel)} Summary</h2></div>
        <div class="card-content" style="padding: 0;">
          <div class="monthly-table-wrapper" style="padding: 20px;">
            <table class="analysis-table" style="min-width: 1200px; text-align: left;">
              <thead>
                <tr>
                  <th style="width: 130px; text-align: left;">${escapeHTML(titleLabel)}</th>
                  <th style="width: 180px;">Active Period</th>
                  <th style="width: 100px;">Total Playtime</th>
                  <th style="width: 90px;">Days Played</th>
                  <th style="width: 90px;">Unique Games</th>
                  <th style="width: 90px;">Completions</th>
                  <th style="width: 320px; text-align: left;">Most Played Game</th>
                  <th style="text-align: left;">Longest Single Session</th>
                </tr>
              </thead>
              <tbody>${summaryRowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- Scatter Plot -->
    <section class="card-row grid-1" style="margin-top: 20px;">
      <div class="card">
        <div class="card-header"><h2>The Deep Dive vs. Tasting Menu Matrix</h2></div>
        <div class="card-content" style="padding: 10px 20px;">
          ${generateScatterPlot()}
        </div>
      </div>
    </section>

    <!-- Session Buckets -->
    <section class="card-row grid-1" style="margin-top: 20px;">
      <div class="card">
        <div class="card-header"><h2>Sprint vs. Marathon: Session Length Breakdown</h2></div>
        <div class="card-content" style="padding: 10px 20px;">
          ${generateSessionBucketsHtml()}
        </div>
      </div>
    </section>

    <!-- Trend Line Charts -->
    <section class="card-row grid-1" style="margin-top: 20px;">
      <div class="card">
        <div class="card-header"><h2>Top 10 ${escapeHTML(titleLabel)}s: Monthly Playtime</h2></div>
        <div class="card-content" style="padding: 10px 20px;">
          ${generateLineChart(false)}
          ${legendHtml}
        </div>
      </div>
      <div class="card" style="margin-top: 20px;">
        <div class="card-header"><h2>Top 10 ${escapeHTML(titleLabel)}s: Cumulative Playtime</h2></div>
        <div class="card-content" style="padding: 10px 20px;">
          ${generateLineChart(true)}
          ${legendHtml}
        </div>
      </div>
    </section>

    <!-- Eras Timeline -->
    <section class="card-row grid-1" style="margin-top: 20px;">
      <div class="card">
        <div class="card-header"><h2>Global ${escapeHTML(titleLabel)} Eras Timeline (2015 - Present)</h2></div>
        <div class="card-content">
          ${timelineHtml}
        </div>
      </div>
    </section>

    <!-- Deep Dive Selector -->
    <section class="card-row grid-1" style="margin-top: 20px;">
      <div class="card">
        <div class="card-header" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0;">
          <h2 style="font-size: 2rem;">
            Deep Dive: 
            <select id="hub-item-select" class="header-dropdown" style="font-size: 2rem;">
              ${sortedItems.map(s => `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)}</option>`).join('')}
            </select>
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
      <svg viewBox="0 0 100 100" style="width: 100px; height: 100px; transform: rotate(-90deg);">
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

    let itemHtml = `
      <section class="card-row grid-1" style="margin-top: -10px;">
        <div class="card" style="text-align: center; padding: 25px; background: linear-gradient(135deg, var(--card-bg) 0%, var(--item-bg) 100%);">
          <div class="sys-widget-title" style="letter-spacing: 2px;">Identity</div>
          <div style="font-size: 2.2rem; font-weight: 900; color: var(--primary-green); text-transform: uppercase;">${escapeHTML(identityTitle)}</div>
          <div style="display: flex; justify-content: center; gap: 40px; margin-top: 15px;">
            <div>
              <div class="sys-widget-title">Top ${escapeHTML(attr1Name)}s</div>
              <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-title);">
                ${topAttr1.slice(0,3).map(g => `${g[0]} <span style="color:var(--text-sub)">(${formatTime(g[1])})</span>`).join('<br>')}
              </div>
            </div>
            <div>
              <div class="sys-widget-title">Top ${escapeHTML(attr2Name)}s</div>
              <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-title);">
                ${topAttr2.slice(0,3).map(d => `${d[0]} <span style="color:var(--text-sub)">(${formatTime(d[1])})</span>`).join('<br>')}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card-row grid-strict-3">
        <div class="card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px;">
          <div style="width: 100%; text-align: center; border-bottom: 1px dashed var(--border-light); padding-bottom: 15px; margin-bottom: 15px;">
            <div class="sys-widget-title">Inaugural Session</div>
            <div class="sys-widget-value" style="font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 10px;">${escapeHTML(firstEntry.game)}</div>
            <div class="sys-widget-sub">${formatFullDate(firstEntry.date)}</div>
          </div>
          <div style="width: 100%; text-align: center;">
            <div class="sys-widget-title">Most Recent Session</div>
            <div class="sys-widget-value" style="font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 10px;">${escapeHTML(lastEntry.game)}</div>
            <div class="sys-widget-sub">${formatFullDate(lastEntry.date)}</div>
          </div>
        </div>
        
        <div class="card" style="padding: 20px; text-align: center; display: flex; flex-direction: column; justify-content: center;">
          <div class="sys-widget-title" style="margin-bottom: 12px;">Completion Rate (${compRate}%)</div>
          <div style="display: flex; height: 16px; border-radius: 8px; overflow: hidden; background: var(--item-bg); margin-bottom: 8px;">
            <div style="width: ${compRatePct}%; background: #00FF00;" title="Completed: ${compCount}"></div>
            <div style="width: ${actRatePct}%; background: #FFFF00;" title="Active: ${actCount}"></div>
            <div style="width: ${abanRatePct}%; background: #FFCCCC;" title="Abandoned: ${abanCount}"></div>
            <div style="flex: 1; background: #00FFFF;" title="Other: ${multiCount}"></div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; font-weight: 800; color: var(--text-main); align-items: flex-start; margin-top: 10px; margin-left: 10%;">
            <span><span style="color: #00FF00;">■</span> Completed: ${compCount}</span>
            <span><span style="color: #FFFF00;">■</span> Active: ${actCount}</span>
            <span><span style="color: #FFCCCC;">■</span> Abandoned: ${abanCount}</span>
          </div>
        </div>

        <div class="card" style="padding: 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div class="sys-widget-title" style="margin-bottom: 10px;">The Social Hub Index</div>
          <div style="position: relative; width: 100px; height: 100px;">
            ${donutHtml}
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column;">
              <span style="font-size: 1.2rem; font-weight: 900; color: var(--text-title);">${multiPct}%</span>
              <span style="font-size: 0.6rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Multi</span>
            </div>
          </div>
          <div style="display: flex; justify-content: space-around; width: 100%; margin-top: 15px; font-size: 0.75rem; font-weight: 800;">
            <span><span style="color: var(--primary-green);">■</span> Multi (${formatTime(multiSec)})</span>
            <span><span style="color: var(--item-bg);">■</span> Single (${formatTime(singleSec)})</span>
          </div>
        </div>
      </section>

      <section class="card-row grid-strict-3">
        <div class="card" style="text-align: center; padding: 20px;">
          <div class="sys-widget-title">${excTitle}</div>
          <div class="sys-widget-value">${exclusivityPct}%</div>
          <div class="sys-widget-sub">${excSub}</div>
        </div>
        <div class="card" style="text-align: center; padding: 20px;">
          <div class="sys-widget-title">Golden Era</div>
          <div class="sys-widget-value">${peakYear}</div>
          <div class="sys-widget-sub">${formatTime(peakTime)} (${peakPct}% of total ${escapeHTML(titleLabel)} runtime)</div>
        </div>
        <div class="card" style="text-align: center; padding: 20px;">
          <div class="sys-widget-title">Habit Breakdown</div>
          <div class="sys-widget-value" style="font-size: 1.4rem;">${weekdayPct}% <span style="font-weight: 600; color: var(--text-muted); font-size: 0.9rem;">WK</span> | ${weekendPct}% <span style="font-weight: 600; color: var(--text-muted); font-size: 0.9rem;">WKND</span></div>
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
                <div class="item-badge" style="background: var(--text-main); color: var(--card-bg);">${g.days.size} Days</div>
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
                <div class="item-badge" style="background: var(--text-title); color: var(--card-bg);">${formatTime(s.time)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <section class="card-row grid-1">
        <div class="card">
          <div class="card-header"><h2>Full Playthrough Archive: ${escapeHTML(valName)}</h2></div>
          <div class="card-content" style="padding: 0;">
            <div class="monthly-table-wrapper" style="padding: 20px;">
              <table class="monthly-table" style="min-width: 1100px;">
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
                      <td class="text-left" style="font-weight: bold;">
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

    dynamicContainer.querySelectorAll('.card').forEach((card, index) => {
      card.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;
    });
  };

  document.getElementById('hub-item-select').addEventListener('change', (e) => renderSelectedItem(e.target.value));
  renderSelectedItem(sortedItems[0].name);
}

// --- SPOTLIGHT PARSING (Grouped & Bolded) ---

// --- DROPDOWN SETUP ---
function setupDropdowns() {
  if (!rawData || !rawData.metrics) return;
  const currentYear = new Date().getFullYear().toString();

  // 1. Sync Logic for the "By Year" Dropdowns (Now 7 total)
  const compSelect = document.getElementById('year-select-comp');
  const playedSelect = document.getElementById('year-select-played');
  const daysSelect = document.getElementById('year-select-days');
  const sessionSelect = document.getElementById('year-select-session');
  const metricSelect1 = document.getElementById('year-select-metrics');
  const metricSelect2 = document.getElementById('year-select-metrics-2');
  const metricSelect3 = document.getElementById('year-select-metrics-3');

  const syncYearDropdowns = (val) => {
    // Update all dropdown values to match
    [compSelect, playedSelect, daysSelect, sessionSelect, metricSelect1, metricSelect2, metricSelect3].forEach(s => {
      if (s) s.value = val;
    });

    // Refresh all cards simultaneously
    renderCompletions(val);
    renderMostPlayed(val);
    renderMostDays(val);
    renderLongestSession(val);
    renderSideBySideMetrics(val);
  };

  const years = Object.keys(rawData.metrics.yearlyGameStats).sort().reverse();
  const yearOptionsHtml = `<option value="All-Time">All-Time</option>` + years.map(y => `<option value="${y}">${y}</option>`).join('');
  const defaultChoice = Math.random() < 0.5 ? 'All-Time' : currentYear;

  // Initialize the dropdown options and attach the MASTER listener
  [compSelect, playedSelect, daysSelect, sessionSelect, metricSelect1, metricSelect2, metricSelect3].forEach(select => {
    if (select) {
      select.innerHTML = yearOptionsHtml;
      select.value = defaultChoice;
      select.addEventListener('change', (e) => syncYearDropdowns(e.target.value));
    }
  });

  // Initial render for all
  syncYearDropdowns(defaultChoice);

  // 2. Month Select (Independent)
  const monthKeys = Object.keys(rawData.metrics.monthlyStats).sort().reverse();
  const monthSelect = document.getElementById('month-select');
  if (monthSelect && monthKeys.length > 0) {
    monthSelect.innerHTML = monthKeys.map(m => `<option value="${m}">${m}</option>`).join('');
    monthSelect.value = monthKeys[0];
    monthSelect.addEventListener('change', (e) => renderMonthlySummary(e.target.value));
    renderMonthlySummary(monthKeys[0]);
  }

  // 3. Rankings & Metadata (Scores)
  const releaseYears = [...new Set(metaGames.map(g => g.releaseYear))].filter(y => y !== 'Unknown').sort().reverse();
  const franchises = [...new Set(metaGames.map(g => g.franchise))].filter(f => f !== 'Unknown' && f !== 'ZZNONE').sort();
  const genres = [...new Set(metaGames.map(g => g.genre))].filter(g => g !== 'Unknown').sort();

  const getValidRandoms = (key) => {
    const counts = {};
    metaGames.filter(g => g.score !== null).forEach(g => {
      const val = g[key];
      if (val && val !== 'Unknown' && val !== 'ZZNONE') {
        counts[val] = (counts[val] || 0) + 1;
      }
    });
    return Object.keys(counts).filter(val => counts[val] >= 3);
  };

  const validFranchises = getValidRandoms('franchise');
  const validGenres = getValidRandoms('genre');

  const top100Select = document.getElementById('top100-year-select');
  if (top100Select) {
    top100Select.innerHTML = `<option value="All-Time">All-Time</option>` + releaseYears.map(y => `<option value="${y}">${y}</option>`).join('');
    top100Select.value = "All-Time";
    top100Select.addEventListener('change', (e) => renderRankings('year', e.target.value, 'top100-list', 100));
    renderRankings('year', 'All-Time', 'top100-list', 100);
  }

  const franchiseSelect = document.getElementById('franchise-select');
  if (franchiseSelect) {
    franchiseSelect.innerHTML = franchises.map(f => `<option value="${escapeHTML(f)}">${escapeHTML(f)}</option>`).join('');
    const pool = validFranchises.length > 0 ? validFranchises : franchises;
    const randomFranchise = pool[Math.floor(Math.random() * pool.length)];
    franchiseSelect.value = randomFranchise;
    franchiseSelect.addEventListener('change', (e) => renderRankings('franchise', e.target.value, 'franchise-list', 100));
    renderRankings('franchise', randomFranchise, 'franchise-list', 100);
  }

  const genreSelect = document.getElementById('genre-select');
  if (genreSelect) {
    genreSelect.innerHTML = genres.map(g => `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('');
    const pool = validGenres.length > 0 ? validGenres : genres;
    const randomGenre = pool[Math.floor(Math.random() * pool.length)];
    genreSelect.value = randomGenre;
    genreSelect.addEventListener('change', (e) => renderRankings('genre', e.target.value, 'genre-list', 100));
    renderRankings('genre', randomGenre, 'genre-list', 100);
  }

  // 4. Analysis Dropdown
  const analysisSelect = document.getElementById('analysis-select');
  if (analysisSelect) {
    analysisSelect.addEventListener('change', (e) => renderAnalysis(e.target.value));
  }

  // 5. Heatmap Dropdown
  const heatmapSelect = document.getElementById('heatmap-select');
  if (heatmapSelect) {
    heatmapSelect.value = 'gameSummary';
    heatmapSelect.addEventListener('change', (e) => renderHeatmap(e.target.value));
  }

  // 6. Game History Dropdown
  const gameHistorySelect = document.getElementById('game-history-select');
  if (gameHistorySelect) {
    const uniqueGames = [...new Set(rawData.allEntries.map(e => e.game))].sort((a,b) => a.localeCompare(b));
    gameHistorySelect.innerHTML = uniqueGames.map(g => `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('');
    const mostRecentGame = rawData.allEntries[rawData.allEntries.length - 1].game;
    gameHistorySelect.value = mostRecentGame;
    gameHistorySelect.addEventListener('change', (e) => renderGameHistory(e.target.value));
  }

  // 7. Series Archive Dropdown
  const seriesArchiveSelect = document.getElementById('series-archive-select');
  if (seriesArchiveSelect) {
    seriesArchiveSelect.innerHTML = franchises.map(f => `<option value="${escapeHTML(f)}">${escapeHTML(f)}</option>`).join('');
    const pool = validFranchises.length > 0 ? validFranchises : franchises;
    const randomSeries = pool[Math.floor(Math.random() * pool.length)];
    seriesArchiveSelect.value = randomSeries;
    seriesArchiveSelect.addEventListener('change', (e) => renderSeriesArchive(e.target.value));
  }
}

function setupHoverHistory() {
  const tooltip = document.getElementById('game-tooltip');
  let tooltipTimeout; // The grace-period timer

  document.addEventListener('mouseover', (e) => {
    // If hovering over the game name OR the tooltip itself, cancel the closing timer
    if (e.target.classList.contains('hover-trigger') || e.target.closest('#game-tooltip')) {
      clearTimeout(tooltipTimeout);
    }

    // If hovering over a game name, build and show the tooltip
    if (e.target.classList.contains('hover-trigger')) {
      const gameName = e.target.getAttribute('data-game');
      if (!gameName) return;

      // Removed the .slice(0, 15) so you can scroll the FULL history!
      const entries = rawData.allEntries.filter(entry => entry.game === gameName).slice().reverse();
      if (entries.length === 0) return;

      let html = `<h3>${escapeHTML(gameName)} History</h3>`;
      html += entries.map(entry => `
        <div class="tooltip-entry">
          <div class="tooltip-meta">${formatShortDate(entry.date)} (${entry.date.substring(0,4)}) | ${escapeHTML(entry.system)} | ${entry.time} | <span style="color:${getStatusColor(entry.status)}">${entry.status}</span></div>
          <div class="tooltip-note">${escapeHTML(entry.note)}</div>
        </div>
      `).join('');

      tooltip.innerHTML = html;
      tooltip.classList.add('visible');

      // Positioning logic
      const rect = e.target.getBoundingClientRect();
      let top = rect.bottom + window.scrollY + 10;
      let left = rect.left + window.scrollX;

      // Prevent it from flying off the right side of the screen
      if (left + 350 > window.innerWidth) left = window.innerWidth - 370;

      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';
    }
  });

  document.addEventListener('mouseout', (e) => {
    // If the mouse leaves the game name OR leaves the tooltip, start the countdown
    if (e.target.classList.contains('hover-trigger') || e.target.closest('#game-tooltip')) {
      tooltipTimeout = setTimeout(() => {
        tooltip.classList.remove('visible');
      }, 300); // 300ms gives you time to casually move the mouse into the box
    }
  });
}

function renderCompletions(year) {
  const container = document.getElementById('completions-list');

  const completions = Object.values(rawData.playthroughHistory).filter(pt => {
    const isComp = (pt.completionDates && pt.completionDates.length > 0) || ['Completed', 'M-Completed', 'Postgame'].includes(pt.finalStatus);
    if (!isComp) return false;

    const cDate = (pt.completionDates && pt.completionDates.length > 0) ? new Date(pt.completionDates[0]) : new Date(pt.lastDate);
    pt.displayDate = cDate;

    if (year === 'All-Time') return true;
    return cDate.getUTCFullYear().toString() === year;
  });

  completions.forEach(pt => {
    const finalEntry = rawData.allEntries.slice().reverse().find(e => e.ptTag === pt.ptTag && ['Completed', 'M-Completed', 'Postgame'].includes(e.status));
    pt.entryNum = finalEntry ? Number(finalEntry.entryNum) : 0;
  });

  completions.sort((a, b) => {
    const dateDiff = a.displayDate.getTime() - b.displayDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.entryNum - b.entryNum;
  });

  completions.forEach((c, index) => c.yearRank = index + 1);
  completions.reverse();

  if (completions.length === 0) { container.innerHTML = `<div class="loading-text">No completions logged for ${year}.</div>`; return; }

  container.innerHTML = completions.map(pt => {
    const score = metaScores.get(pt.gameName) || '-';
    const badgeHTML = score !== '-' ? `<div class="item-badge">${score}</div>` : `<div class="item-badge" style="background: var(--heatmap-empty); color: var(--text-muted);">-</div>`;

    let pastCompletionsHtml = '';
    if (rawData.metrics && rawData.metrics.completionStats) {
        const allTimeGameData = rawData.metrics.completionStats.find(g => g.gameName === pt.gameName);
        if (allTimeGameData && allTimeGameData.completionDates.length > 1) {
          const currentCompletionStr = formatFullDate(pt.displayDate);
          const pastDates = allTimeGameData.completionDates
              .map(d => formatFullDate(d))
              .filter(d => d !== currentCompletionStr);
            if (pastDates.length > 0) {
                const uniquePastDates = [...new Set(pastDates)];
                pastCompletionsHtml = `<div style="font-size: 0.75rem; font-style: italic; color: var(--text-sub); margin-top: 4px;">Also completed on: ${uniquePastDates.join(', ')}</div>`;
            }
        }
    }

    // Standardize the time output (turns "13:45" into "13h 45m")
    const formattedTime = formatTime(timeStringToSeconds(pt.finalPtLifetime));

    return `
      <div class="list-item" style="align-items: center; padding: 12px 16px;">
        <div style="display: flex; width: 100%; align-items: center;">

          <!-- Left Column: Date & Rank -->
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-right: 15px; min-width: 45px;">
            <span style="font-weight: 800; color: var(--text-main); font-size: 0.95rem;">${formatShortDate(pt.displayDate)}</span>
            <span style="color: var(--text-muted); font-size: 0.75rem; font-weight: 700; margin-top: 2px;">(#${pt.yearRank})</span>
          </div>

          <!-- Middle Column: Game Info & Stats -->
          <div style="display: flex; flex-direction: column; flex: 1; overflow: hidden; padding-right: 10px;">
            <span class="item-title hover-trigger" data-game="${escapeHTML(pt.gameName)}" style="font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHTML(pt.gameName)} (${escapeHTML(pt.system)})
            </span>
            <div class="item-sub" style="display: flex; justify-content: space-between; margin-top: 2px;">
              <span style="color: var(--text-muted);">
                <strong>${formattedTime}</strong> (${pt.finalPtLifetimeDays} Day${pt.finalPtLifetimeDays == 1 ? '' : 's'})
              </span>
              <span style="color: var(--text-sub);">Started: ${formatFullDate(pt.startDate)}</span>
            </div>
            ${pastCompletionsHtml}
          </div>

          <!-- Right Column: Score Badge -->
          <div style="margin-left: auto;">
            ${badgeHTML}
          </div>

        </div>
      </div>
    `;
  }).join('');
}

// Most Played Time
function renderMostPlayed(year) {
  const container = document.getElementById('most-played-list');
  const statsObj = year === 'All-Time' ? rawData.metrics.allTimeGameStats : rawData.metrics.yearlyGameStats[year];

  if (!statsObj) { container.innerHTML = `<div class="loading-text">No playtime logged.</div>`; return; }

  const sortedGames = Object.entries(statsObj).map(([name, stats]) => {
    const sysStr = stats.systems instanceof Set ? Array.from(stats.systems).join(', ') : (Array.isArray(stats.systems) ? stats.systems.join(', ') : (stats.systems && stats.systems.data ? stats.systems.data.join(', ') : ''));
    const daysSet = stats.days instanceof Set ? Array.from(stats.days) : (Array.isArray(stats.days) ? stats.days : (stats.days && stats.days.data ? stats.days.data : []));
    const daysArr = daysSet.sort();

    // Check Date Objects (All-Time) or fallback to String parsing (Yearly)
    const minDate = stats.firstPlayedDate ? formatFullDate(stats.firstPlayedDate) : (daysArr.length > 0 ? daysArr[0].replace(/-/g, '/') : "N/A");
    const maxDate = stats.lastPlayedDate ? formatFullDate(stats.lastPlayedDate) : (daysArr.length > 0 ? daysArr[daysArr.length - 1].replace(/-/g, '/') : "N/A");

    return { name, seconds: stats.totalSeconds, days: daysArr.length, systems: sysStr, minDate, maxDate };
  }).sort((a, b) => b.seconds - a.seconds).slice(0, 100);

  container.innerHTML = sortedGames.map((game, index) => `
    <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 12px;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
        <span class="item-title" style="font-weight: bold;">
          <span style="color: var(--text-muted); margin-right: 5px;">#${index + 1}</span><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span> ${game.systems ? `(${escapeHTML(game.systems)})` : ''}
        </span>
        <div class="item-badge">${formatTime(game.seconds)}</div>
      </div>
      <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 4px;">
        <span><strong>${game.days}</strong> Days Played</span>
        <span>${game.minDate} - ${game.maxDate}</span>
      </div>
    </div>
  `).join('');
}

// Most Days Played
function renderMostDays(year) {
  const container = document.getElementById('most-days-list');
  const statsObj = year === 'All-Time' ? rawData.metrics.allTimeGameStats : rawData.metrics.yearlyGameStats[year];

  if (!statsObj) { container.innerHTML = `<div class="loading-text">No playtime logged.</div>`; return; }

  const sortedDays = Object.entries(statsObj).map(([name, stats]) => {
    const sysStr = stats.systems instanceof Set ? Array.from(stats.systems).join(', ') : (Array.isArray(stats.systems) ? stats.systems.join(', ') : (stats.systems && stats.systems.data ? stats.systems.data.join(', ') : ''));
    const daysSet = stats.days instanceof Set ? Array.from(stats.days) : (Array.isArray(stats.days) ? stats.days : (stats.days && stats.days.data ? stats.days.data : []));
    const daysArr = daysSet.sort();

    const minDate = stats.firstPlayedDate ? formatFullDate(stats.firstPlayedDate) : (daysArr.length > 0 ? daysArr[0].replace(/-/g, '/') : "N/A");
    const maxDate = stats.lastPlayedDate ? formatFullDate(stats.lastPlayedDate) : (daysArr.length > 0 ? daysArr[daysArr.length - 1].replace(/-/g, '/') : "N/A");

    return { name, seconds: stats.totalSeconds, days: daysArr.length, systems: sysStr, minDate, maxDate };
  }).sort((a, b) => b.days - a.days).slice(0, 100);

  container.innerHTML = sortedDays.map((game, index) => `
    <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 12px;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
        <span class="item-title" style="font-weight: bold;">
          <span style="color: var(--text-muted); margin-right: 5px;">#${index + 1}</span><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span> ${game.systems ? `(${escapeHTML(game.systems)})` : ''}
        </span>
        <div class="item-badge">${game.days} Days</div>
      </div>
      <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 4px;">
        <span><strong>${formatTime(game.seconds)}</strong> Played</span>
        <span>${game.minDate} - ${game.maxDate}</span>
      </div>
    </div>
  `).join('');
}

// Longest Single Session
function renderLongestSession(year) {
  const container = document.getElementById('longest-session-list');

  const sessions = year === 'All-Time'
    ? rawData.metrics.singleDaySessions
    : rawData.metrics.singleDaySessions.filter(s => new Date(s.date).getUTCFullYear().toString() === year);

  if (sessions.length === 0) { container.innerHTML = `<div class="loading-text">No sessions logged.</div>`; return; }

  const sortedSessions = sessions.sort((a, b) => b.time - a.time).slice(0, 100);

  container.innerHTML = sortedSessions.map((s, index) => {
    const displayDate = year === 'All-Time' ? formatFullDate(s.date) : formatShortDate(s.date);

    // Calculate the percentage of total playtime this single session represents
    const totalGameSecs = rawData.metrics.allTimeGameStats[s.game] ? rawData.metrics.allTimeGameStats[s.game].totalSeconds : s.time;
    const pct = ((s.time / totalGameSecs) * 100).toFixed(1);

    return `
    <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 12px;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
        <span class="item-title" style="font-weight: bold;">
          <span style="color: var(--text-muted); margin-right: 5px;">#${index + 1}</span><span class="hover-trigger" data-game="${escapeHTML(s.game)}">${escapeHTML(s.game)}</span> ${s.system ? `(${escapeHTML(s.system)})` : ''}
        </span>
        <div class="item-badge">${formatTime(s.time)}</div>
      </div>
      <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 4px;">
        <span>Accounts for <strong>${pct}%</strong> of total playtime (${formatTime(totalGameSecs)})</span>
        <span>${displayDate}</span>
      </div>
    </div>
  `}).join('');
}

function renderRankings(filterType, filterValue, containerId, limit) {
  const container = document.getElementById(containerId);
  let filtered = metaGames.filter(g => g.score !== null);

  if (filterValue !== 'All-Time') {
    if (filterType === 'year') filtered = filtered.filter(g => g.releaseYear === filterValue);
    if (filterType === 'franchise') filtered = filtered.filter(g => g.franchise === filterValue);
    if (filterType === 'genre') filtered = filtered.filter(g => g.genre === filterValue);
  }

  filtered.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  filtered = filtered.slice(0, limit);

  if (filtered.length === 0) { container.innerHTML = `<div class="loading-text">No rated games found.</div>`; return; }

  let actualPosition = 1, lastScore = -1;
  container.innerHTML = filtered.map(game => {
    let rankText = game.score !== lastScore ? `#${actualPosition}` : '';
    lastScore = game.score; actualPosition++;
    const displayScore = Number.isInteger(game.score) ? game.score : game.score.toFixed(1);

    // Grab the aggregated stats to display playtime next to the score
    const gameStats = rawData.metrics.allTimeGameStats[game.name];
    const timeStr = gameStats ? formatTime(gameStats.totalSeconds) : "0m";
    const daysCount = gameStats && gameStats.days ? (gameStats.days.size || gameStats.days.length || (gameStats.days.data ? gameStats.days.data.length : 0)) : 0;

    return `
    <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 12px;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
        <span class="item-title" style="font-weight: bold;">
          <span style="color: var(--text-muted); margin-right: 5px; min-width: 25px; display: inline-block;">${rankText}</span><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span>
        </span>
        <div class="item-badge">${displayScore}</div>
      </div>
      <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 4px;">
        <span>Dev: <strong>${escapeHTML(game.developer)}</strong> (${escapeHTML(game.releaseYear)})</span>
        <span><strong>${timeStr}</strong> | ${daysCount} Days</span>
      </div>
    </div>
    `;
  }).join('');
}

// --- UPDATE: RENDER ON THIS DAY (Generalize to accept month, day, container) ---
function renderOnThisDay(monthIndex = new Date().getMonth(), dayIndex = new Date().getDate(), targetContainerId = 'on-this-day-list') {
  const container = document.getElementById(targetContainerId);
  const dateSpan = document.getElementById('today-date'); // Optional, exists on Index but not History page
  
  if (!container || !rawData || !rawData.allEntries) return;

  if (dateSpan) {
    dateSpan.innerText = `${String(monthIndex + 1).padStart(2, '0')}/${String(dayIndex).padStart(2, '0')}`;
  }

  const historyEntries = rawData.allEntries.filter(e => {
    const d = new Date(e.date);
    return d.getUTCMonth() === monthIndex && d.getUTCDate() === dayIndex;
  });

  if (historyEntries.length === 0) {
    container.innerHTML = `<div class="loading-text" style="padding: 20px;">No gaming history on this day.</div>`;
    return;
  }

  historyEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = historyEntries.map(e => {
    const year = new Date(e.date).getUTCFullYear();
    const bgColor = getStatusColor(e.status);
    return `
    <div class="list-item" style="border-left-color: ${bgColor};">
      <div class="item-info">
        <span class="item-rank" style="color: #444;">${year}</span>
        <div class="item-text">
          <span class="item-title hover-trigger" data-game="${escapeHTML(e.game)}">${escapeHTML(e.game)} (${escapeHTML(e.system)})</span>
          <span class="item-sub" style="color: #666;">${escapeHTML(e.note)}</span>
        </div>
      </div>
      <div class="item-badge" style="background-color: ${bgColor}; color: #000; text-shadow: 0 0 2px rgba(255,255,255,0.5);">${formatTime(timeStringToSeconds(e.time))}</div>
    </div>
    `;
  }).join('');
}

// --- UPDATE: RENDER ANALYSIS (Add Container ID parameter) ---
function renderAnalysis(type, targetContainerId = 'analysis-content') {
  const container = document.getElementById(targetContainerId);
  if (!container || !rawData || !rawData.metrics) return;

  let html = `<div style="overflow-x: auto;"><table class="analysis-table"><thead><tr>`;

  if (type === 'playthrough') {
    const data = rawData.metrics.playthroughAnalysis;
    const timeframes = Object.keys(data).sort((a, b) => a === 'All-Time' ? -1 : b === 'All-Time' ? 1 : b - a);
    html += `<th>Timeframe</th><th>Total PTs</th><th># Completed</th><th># Abandoned</th><th># Active</th><th>Comp Rate</th><th># Multiplayer</th><th># Non-Comp</th><th>Avg Time</th><th>Avg Days</th></tr></thead><tbody>`;
    timeframes.forEach(key => {
      const s = data[key];
      const completions = s.completed + s.postgame;
      html += `<tr class="${key === 'All-Time' ? 'all-time-row' : ''}"><td class="text-left">${key}</td><td>${s.totalPlaythroughs}</td><td>${completions}</td><td>${s.abandoned}</td><td>${s.active}</td><td>${(s.completionRate * 100).toFixed(1)}%</td><td>${s.multiplayer}</td><td>${s.nonCompletable}</td><td>${formatHHMM(s.avgCompletionTimeSeconds)}</td><td>${s.avgCompletionDays.toFixed(1)}</td></tr>`;
    });
  } else if (type === 'dayOfWeek') {
    const data = rawData.metrics.dayOfWeekStats;
    const timeframes = Object.keys(data).sort((a, b) => a === 'All-Time' ? -1 : b === 'All-Time' ? 1 : b.localeCompare(a));
    html += `<th>Timeframe</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr></thead><tbody>`;
    timeframes.forEach(key => {
      const s = data[key];
      html += `<tr class="${key === 'All-Time' ? 'all-time-row' : ''}"><td class="text-left">${key}</td>${[1,2,3,4,5,6,0].map(day => `<td>${formatHHMM(s[day] || 0)}</td>`).join('')}</tr>`;
    });
  } else {
    const map = { genre: 'genreAnalysis', releaseYear: 'releaseYearAnalysis', developer: 'developerAnalysis', publisher: 'publisherAnalysis' };
    const dataKey = map[type];
    const data = rawData.metrics[dataKey];
    let sortedData = Object.values(data).filter(item => item[type] !== "N/A");
    if (type === 'releaseYear') sortedData.sort((a,b) => b[type] - a[type]);
    else sortedData.sort((a,b) => b.totalPlaythroughs - a.totalPlaythroughs);

    html += `<th>${type.charAt(0).toUpperCase() + type.slice(1)}</th><th>Total PTs</th><th># Completed</th><th># Abandoned</th><th># Active</th><th>Comp Rate</th><th># Multiplayer</th><th># Non-Comp</th><th>Avg Time</th><th>Avg Days</th></tr></thead><tbody>`;
    sortedData.forEach(s => {
      const completions = s.completed + s.postgame;
      html += `<tr><td class="text-left">${escapeHTML(s[type])}</td><td>${s.totalPlaythroughs}</td><td>${completions}</td><td>${s.abandoned}</td><td>${s.active}</td><td>${(s.completionRate * 100).toFixed(1)}%</td><td>${s.multiplayer}</td><td>${s.nonCompletable}</td><td>${formatHHMM(s.avgCompletionTimeSeconds)}</td><td>${s.avgCompletionDays.toFixed(1)}</td></tr>`;
    });
  }

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// --- UPDATE: RENDER MILESTONES (Add Container ID parameter) ---
function renderMilestones(targetContainerId = 'milestones-list') {
  const container = document.getElementById(targetContainerId);
  if (!container || !rawData || !rawData.metrics || !rawData.metrics.milestones) return;

  const milestones = rawData.metrics.milestones.slice().sort((a,b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = milestones.map(m => `
  <div class="milestone-item">
    <div class="milestone-date">${formatShortDate(m.date)}/${new Date(m.date).getUTCFullYear()}</div>
    <div class="milestone-detail">${escapeHTML(m.details)}</div>
  </div>
  `).join('');
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
            const daysArr = item.days instanceof Set ? Array.from(item.days) : (Array.isArray(item.days) ? item.days : (item.days.data || []));
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
            const sysStr = top5[i].systems instanceof Set ? Array.from(top5[i].systems).join(', ') : (Array.isArray(top5[i].systems) ? top5[i].systems.join(', ') : (top5[i].systems && top5[i].systems.data ? top5[i].systems.data.join(', ') : ''));
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
      const playedCount = dayData.yearsPlayed ? (Array.isArray(dayData.yearsPlayed) ? dayData.yearsPlayed.length : (dayData.yearsPlayed.data ? dayData.yearsPlayed.data.length : 0)) : 0;
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
      html += `<td style="background-color: ${bgColor};" title="${titleText}">${innerText}</td>`;
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

// --- FULL GAME ARCHIVE ---
function renderGameHistory(gameName) {
  const container = document.getElementById('game-history-content');
  if (!rawData || !rawData.allEntries) return;

  // Grab all entries for this game and reverse them so the newest is at the top
  const entries = rawData.allEntries.filter(e => e.game === gameName).slice().reverse();

  if (entries.length === 0) {
    container.innerHTML = `<div class="loading-text" style="padding: 20px;">No entries found.</div>`;
    return;
  }

  // We reuse the 'monthly-table' CSS class because it already looks perfect!
  let html = `
    <div class="monthly-table-wrapper" style="padding: 20px;">
      <table class="monthly-table" style="min-width: 1100px;">
        <thead>
          <tr>
            <th style="width: 80px;">Entry #</th>
            <th style="width: 120px;">Date</th>
            <th style="width: 100px;">System</th>
            <th style="width: 100px;">Session Time</th>
            <th style="width: 100px;">PT Total</th>
            <th style="width: 100px;">Game Total</th>
            <th style="width: 150px;">Status</th>
            <th>Playthrough Details</th>
          </tr>
        </thead>
        <tbody>
  `;

  entries.forEach(entry => {
    const bgColor = getStatusColor(entry.status);
    html += `
      <tr>
        <td class="text-center">${entry.entryNum}</td>
        <td class="text-center" style="font-weight: bold;">${formatFullDate(entry.date)}</td>
        <td class="text-center">${escapeHTML(entry.system)}</td>
        <td class="text-center">${entry.time}</td>
        <td class="text-center">${entry.ptLifetime}</td>
        <td class="text-center">${entry.gameLifetime}</td>
        <td class="text-center status-cell" style="background-color: ${bgColor}; font-weight: bold;">${entry.status}</td>
        <td class="text-left">${escapeHTML(entry.note)}</td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// --- SERIES ARCHIVE ---
function renderSeriesArchive(seriesName) {
  const container = document.getElementById('series-archive-content');
  if (!rawData || !rawData.playthroughHistory || !metaGames) return;

  // 1. Find all games belonging to this series
  const seriesGames = metaGames.filter(g => g.franchise === seriesName).map(g => g.name);

  // 2. Find all playthroughs for these games
  const pts = Object.values(rawData.playthroughHistory).filter(pt => seriesGames.includes(pt.gameName));

  if (pts.length === 0) {
    container.innerHTML = `<div class="loading-text" style="padding: 20px;">No playthroughs logged for this series.</div>`;
    return;
  }

  // 3. Sort playthroughs: Group by game, sort groups by newest overall update, sort PTs within group by newest
  const gameMaxDates = {};
  // First pass: find the absolute latest update date for every single game in the series
  pts.forEach(pt => {
      const ptDate = new Date(pt.lastDate).getTime();
      if (!gameMaxDates[pt.gameName] || ptDate > gameMaxDates[pt.gameName]) {
          gameMaxDates[pt.gameName] = ptDate;
      }
  });

  pts.sort((a, b) => {
      // Compare the overall max lastDate for the two games (Newest Game Group on top)
      const gameDateDiff = gameMaxDates[b.gameName] - gameMaxDates[a.gameName];
      if (gameDateDiff !== 0) return gameDateDiff;

      // If it's the exact same game, sort its individual playthroughs by their own lastDate (Newest PT on top)
      return new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime();
  });

  // 4. Get the absolute latest Game Lifetime totals for each game
  const gameTotals = {};
  seriesGames.forEach(game => {
     const gameEntries = rawData.allEntries.filter(e => e.game === game);
     if (gameEntries.length > 0) {
         const lastE = gameEntries[gameEntries.length - 1];
         gameTotals[game] = { time: lastE.gameLifetime, days: lastE.gameLifetimeDays };
     }
  });

  // 5. Calculate Series Totals
  const uniqueGamesCount = new Set(pts.map(pt => pt.gameName)).size;
  let totalSeconds = 0;
  let totalDays = 0;

  pts.forEach(pt => {
     totalSeconds += timeStringToSeconds(pt.finalPtLifetime);
     totalDays += parseInt(pt.finalPtLifetimeDays) || 0;
  });

  // 6. Build the HTML (Using the clean standard dashboard theme)
  let html = `
    <div class="monthly-table-wrapper" style="padding: 20px;">
      <table class="monthly-table" style="min-width: 1100px;">
        <thead>
          <tr>
            <th rowspan="2">Videogame</th>
            <th rowspan="2">System</th>
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
  `;

  pts.forEach(pt => {
    const bgColor = getStatusColor(pt.finalStatus);
    const gTime = gameTotals[pt.gameName] ? gameTotals[pt.gameName].time : "00:00";
    const gDays = gameTotals[pt.gameName] ? gameTotals[pt.gameName].days : "0";

    html += `
      <tr>
        <td class="text-left" style="font-weight: bold;">
          <span class="hover-trigger" data-game="${escapeHTML(pt.gameName)}">${escapeHTML(pt.gameName)}</span>
        </td>
        <td class="text-center">${escapeHTML(pt.system)}</td>
        <td class="text-center">${pt.finalPtLifetime}</td>
        <td class="text-center">${pt.finalPtLifetimeDays}</td>
        <td class="text-center">${gTime}</td>
        <td class="text-center">${gDays}</td>
        <td class="text-center">${formatFullDate(pt.startDate)}</td>
        <td class="text-center">${formatFullDate(pt.lastDate)}</td>
        <td class="text-center status-cell" style="background-color: ${bgColor}; font-weight: bold;">${pt.finalStatus}</td>
        <td class="text-left">${escapeHTML(pt.finalNote)}</td>
      </tr>
    `;
  });

  // The Totals Row using the clean dark theme
  html += `
          <tr class="grand-total-row">
            <td colspan="2" class="text-right" style="padding-right: 15px;">Series Total: ${uniqueGamesCount} Game${uniqueGamesCount !== 1 ? 's' : ''}</td>
            <td class="text-center">${formatHHMM(totalSeconds)}</td>
            <td class="text-center">${totalDays}</td>
            <td colspan="6"></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
  container.innerHTML = html;
}

// Accordion Helper
window.toggleAccordion = function(targetClass, toggleRow) {
  const rows = document.querySelectorAll(`.${targetClass}`);
  const icon = toggleRow.querySelector('.toggle-icon');

  let isHidden = true;
  rows.forEach(row => {
    if (row.style.display === 'none') {
      row.style.display = 'table-row';
      isHidden = false;
    } else {
      row.style.display = 'none';
    }
  });

  // Update the text and icon direction based on the state
  if (!isHidden) {
    icon.innerHTML = '▼';
    toggleRow.innerHTML = toggleRow.innerHTML.replace(/Show \d+ Past/, "Hide Past");
  } else {
    icon.innerHTML = '▶';
    toggleRow.innerHTML = toggleRow.innerHTML.replace("Hide Past", `Show ${rows.length} Past`);
  }
};

function renderSideBySideMetrics(year) {
  const systemsContainer = document.getElementById('most-played-systems-list');
  const franchisesContainer = document.getElementById('most-played-franchises-list');
  const genresContainer = document.getElementById('most-played-genres-list');

  if (!rawData || !rawData.allEntries) return;

  // Filter based on the string date (no .toISOString() needed)
  const entries = year === 'All-Time'
    ? rawData.allEntries
    : rawData.allEntries.filter(e => e.date && e.date.startsWith(year));

  const systems = {};
  const franchises = {};
  const genres = {};

  const initMetricObj = (name) => ({
    name: name,
    totalSeconds: 0,
    uniqueGames: new Set(),
    gamePlaytimes: {},
    days: new Set(),
    firstPlayed: null,
    lastPlayed: null
  });

  entries.forEach(e => {
    const seconds = timeStringToSeconds(e.time);
    const dateKey = e.date.split('T')[0]; // Safe string split
    const entryDate = new Date(e.date);

    const updateObj = (obj) => {
        obj.totalSeconds += seconds;
        obj.uniqueGames.add(e.game);
        obj.gamePlaytimes[e.game] = (obj.gamePlaytimes[e.game] || 0) + seconds;
        obj.days.add(dateKey);
        if (!obj.firstPlayed || entryDate < obj.firstPlayed) obj.firstPlayed = entryDate;
        if (!obj.lastPlayed || entryDate > obj.lastPlayed) obj.lastPlayed = entryDate;
    };

    if (e.system && e.system !== "N/A") {
      if (!systems[e.system]) systems[e.system] = initMetricObj(e.system);
      updateObj(systems[e.system]);
    }

    if (e.series && e.series !== "N/A" && e.series.toUpperCase() !== 'ZZNONE') {
      if (!franchises[e.series]) franchises[e.series] = initMetricObj(e.series);
      updateObj(franchises[e.series]);
    }

    if (e.genre && e.genre !== "N/A") {
      if (!genres[e.genre]) genres[e.genre] = initMetricObj(e.genre);
      updateObj(genres[e.genre]);
    }
  });

  const getTopGameString = (gamePlaytimes) => {
    let topGame = "";
    let maxSeconds = -1;
    for (const [game, seconds] of Object.entries(gamePlaytimes)) {
      if (seconds > maxSeconds) {
        maxSeconds = seconds;
        topGame = game;
      }
    }
    return maxSeconds > 0 ? `${topGame} (${formatTime(maxSeconds)})` : "N/A";
  };

  const generateListHtml = (metricsObj) => {
    const sorted = Object.values(metricsObj).sort((a, b) => b.totalSeconds - a.totalSeconds);
    if (sorted.length === 0) return `<div class="loading-text">No data logged.</div>`;

    return sorted.map((item, index) => {
      const topGameInfo = getTopGameString(item.gamePlaytimes);
      const formatDate = (d) => d ? `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}` : '';

      return `
        <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
          <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
            <span class="item-title" style="font-weight: bold;">#${index + 1} ${escapeHTML(item.name)}</span>
            <div class="item-badge">${formatTime(item.totalSeconds)}</div>
          </div>
          <div class="item-sub" style="font-size: 0.8rem; color: #666; margin-top: 4px; width: 100%;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span><strong>${item.uniqueGames.size}</strong> games | <strong>${item.days.size}</strong> days</span>
              <span style="font-size: 0.75rem;">${formatDate(item.firstPlayed)} - ${formatDate(item.lastPlayed)}</span>
            </div>
            <div style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              Top Game: <span class="hover-trigger" data-game="${escapeHTML(topGameInfo.split(' (')[0])}" style="color: #0056b3; cursor: pointer;">${escapeHTML(topGameInfo)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  systemsContainer.innerHTML = generateListHtml(systems);
  franchisesContainer.innerHTML = generateListHtml(franchises);
  genresContainer.innerHTML = generateListHtml(genres);
}

// --- THEME TOGGLE LOGIC ---
function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');

  // Check local storage for user preference
  const savedTheme = localStorage.getItem('yoshi-theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    btn.innerText = '☀️ Light Mode';
  }

  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('yoshi-theme', isDark ? 'dark' : 'light');
    btn.innerText = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';

  });
}

// --- LIVE SEARCH (ARCHIVES) ---
function setupLiveSearch() {
  const gameSearch = document.getElementById('game-search');
  const gameDatalist = document.getElementById('game-datalist');
  const seriesSearch = document.getElementById('series-search');
  const seriesDatalist = document.getElementById('series-datalist');

  // Helper for better Datalist UX (clears on click, restores on blur)
  const applyDatalistUX = (inputElement, validOptions, renderFn) => {
    let prevVal = inputElement.value;
    
    // Clear the box on click to show all datalist suggestions
    inputElement.addEventListener('focus', () => {
      prevVal = inputElement.value;
      inputElement.value = '';
    });
    
    // Restore the previous valid text if they click away without picking one
    inputElement.addEventListener('blur', () => {
      if (!inputElement.value.trim() || !validOptions.includes(inputElement.value)) {
        inputElement.value = prevVal;
      }
    });

    // Re-render immediately when a valid option is selected
    inputElement.addEventListener('input', (e) => {
      const val = e.target.value;
      if (validOptions.includes(val)) {
        prevVal = val;
        renderFn(val);
      }
    });
  };

  // Populate Game Search
  if (gameSearch && gameDatalist) {
    const uniqueGames = [...new Set(rawData.allEntries.map(e => e.game))].sort((a,b) => a.localeCompare(b));
    gameDatalist.innerHTML = uniqueGames.map(g => `<option value="${escapeHTML(g)}">`).join('');

    const mostRecentGame = rawData.allEntries[rawData.allEntries.length - 1].game;
    gameSearch.value = mostRecentGame;
    renderGameHistory(mostRecentGame);

    applyDatalistUX(gameSearch, uniqueGames, renderGameHistory);
  }

  // Populate Series Search
  if (seriesSearch && seriesDatalist) {
    const franchises = [...new Set(metaGames.map(g => g.franchise))].filter(f => f !== 'Unknown' && f !== 'ZZNONE').sort();
    seriesDatalist.innerHTML = franchises.map(f => `<option value="${escapeHTML(f)}">`).join('');

    let initialSeries = franchises.length > 0 ? franchises[0] : "";
    for (let i = rawData.allEntries.length - 1; i >= 0; i--) {
        if (rawData.allEntries[i].series && rawData.allEntries[i].series !== "N/A" && rawData.allEntries[i].series.toUpperCase() !== 'ZZNONE') {
            initialSeries = rawData.allEntries[i].series;
            break;
        }
    }

    seriesSearch.value = initialSeries;
    renderSeriesArchive(initialSeries);

    applyDatalistUX(seriesSearch, franchises, renderSeriesArchive);
  }
}

function generateWRPTrackerHtml(wrpData, isGameList = true) {
  if (!wrpData || !wrpData.timeline || wrpData.timeline.length === 0) return '';

  const blocks = [];
  const currentEvent = wrpData.timeline[wrpData.timeline.length - 1];

  const currentChampHtml = isGameList
    ? `<div class="wrp-step-title hover-trigger" data-game="${escapeHTML(currentEvent.champion)}">${escapeHTML(currentEvent.champion)}</div>`
    : `<div class="wrp-step-title" style="font-weight: 800; color: var(--text-title);">${escapeHTML(currentEvent.champion)}</div>`;

  blocks.push(`
  <div class="wrp-step current">
  <div class="wrp-step-date">CURRENT RECORD</div>
  ${currentChampHtml}
  <div class="wrp-step-sub" style="color: var(--primary-green); font-weight: bold;">Extended to ${escapeHTML(wrpData.val)}</div>
  </div>
  `);

  for (let i = wrpData.timeline.length - 1; i >= 0; i--) {
    const event = wrpData.timeline[i];
    const isFirst = (i === 0);
    
    const eventChampHtml = isGameList
      ? `<div class="wrp-step-title hover-trigger" data-game="${escapeHTML(event.champion)}">${escapeHTML(event.champion)}</div>`
      : `<div class="wrp-step-title" style="font-weight: 800; color: var(--text-title);">${escapeHTML(event.champion)}</div>`;

    blocks.push(`
    <div class="wrp-step">
    <div class="wrp-step-date">${formatFullDate(event.date)}</div>
    ${eventChampHtml}
    <div class="wrp-step-sub">${isFirst ? 'Inaugural Record' : `Dethroned ${escapeHTML(event.dethroned)}`} &bull; <strong style="color: var(--text-title);">${escapeHTML(event.takeoverValue)}</strong></div>
    </div>
    `);
  }

  return `
  <div class="wrp-slim-container">
  <div class="wrp-slim-label">World Record Progression (Newest to Oldest)</div>
  <div class="wrp-slim-track">${blocks.join('<div class="wrp-arrow">←</div>')}</div>
  </div>
  `;
}

function generateUniversalDualTableHtml(listObj) {
  const renderTable = (rows, headers) => {
    let html = `<table class="top25-table">
    <thead>
    <tr>
    <th style="width: 55px;">${escapeHTML(headers[0])}</th>
    <th>${escapeHTML(headers[1])}</th>
    <th style="width: 95px;">${escapeHTML(headers[3])}</th>
    <th style="width: 95px;">${escapeHTML(headers[4])}</th>
    <th style="width: 95px;">${escapeHTML(headers[5])}</th>
    </tr>
    </thead>
    <tbody>`;

    const isGameList = headers[1] === "Videogame";

    rows.forEach(row => {
      const col1 = row[0] || '';
      const detail = row[1] || '';
      const sysStr = row[2] || '';
      const val = row[3] || '';
      const start = row[4] || '';
      const end = row[5] || '';
      const detailSub = row[6] || ''; 

      const currentYear = new Date().getFullYear().toString();
      const isBold = (end && end.toString().startsWith(currentYear)) || (col1 && col1.toString() === currentYear);
      // Ensure we keep your custom active class or bold styling here
      const boldStyle = isBold ? 'style="font-weight: 800; color: #000; background-color: #f0fff4;"' : '';

      const detailMainHtml = isGameList
        ? `<span class="hover-trigger" data-game="${escapeHTML(String(detail))}">${escapeHTML(String(detail))}</span>`
        : `<span style="font-weight: 800; color: var(--text-title);">${escapeHTML(String(detail))}</span>`;

      // Subtext rendering (e.g., "Most Played: Legend of Zelda... [224:30]")
      const detailSubHtml = detailSub
        ? `<div style="font-size: 0.8rem; font-weight: 600; color: var(--text-sub); margin-top: 2px;">Most Played: ${escapeHTML(String(detailSub))}</div>`
        : '';

      html += `
      <tr>
      <td class="text-center" style="font-weight: 800; color: var(--text-muted);">${escapeHTML(String(col1))}</td>
      <td class="text-left" ${boldStyle}>
        ${detailMainHtml}
        ${sysStr ? `<span style="color: var(--text-muted); font-size: 0.85rem; font-weight: 600; margin-left: 4px;">(${escapeHTML(String(sysStr))})</span>` : ''}
        ${detailSubHtml}
      </td>
      <td class="text-center" style="background: var(--highlight-green-bg); color: var(--primary-green); font-weight: 900; white-space: nowrap;">${escapeHTML(String(val))}</td>
      <td class="text-center" style="font-size: 0.85rem; white-space: nowrap;">${escapeHTML(String(start))}</td>
      <td class="text-center" style="font-size: 0.85rem; white-space: nowrap;">${escapeHTML(String(end))}</td>
      </tr>
      `;
    });

    html += `</tbody></table>`;
    return html;
  };

  const isGameLeft = listObj.headersLeft && listObj.headersLeft[1] === "Videogame";

  let wrpHtml = '';
  if (listObj.wrp) wrpHtml = generateWRPTrackerHtml(listObj.wrp, isGameLeft);

  return `
  <div class="card-header" style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--border-light); padding: 15px 20px;">
  <h2 style="flex: 1; text-align: center; font-size: 1.2rem; color: var(--primary-green); font-weight: 800;">${escapeHTML(listObj.titleLeft)}</h2>
  <h2 style="flex: 1; text-align: center; font-size: 1.2rem; color: var(--primary-green); font-weight: 800;">${escapeHTML(listObj.titleRight)}</h2>
  </div>
  <div class="card-content" style="padding: 0;">
  <div class="spotlight-dual-container" style="padding: 20px;">
  <div class="spotlight-section" style="overflow-x: auto;">
  ${renderTable(listObj.allTime, listObj.headersLeft)}
  </div>
  <div class="spotlight-section" style="overflow-x: auto;">
  ${renderTable(listObj.yearly, listObj.headersRight)}
  </div>
  </div>
  ${wrpHtml}
  </div>
  `;
}

// Routes to spotlight.html
// Routes to spotlight.html
function initSpotlightPage() {
  const container = document.getElementById('spotlight-page-container');
  if (!container || !rawData || !rawData.metrics) return;

  if (!rawData.metrics.top25Lists) {
    container.innerHTML = `<div class="loading-text" style="color: #ff9f1c;">Spotlight data not found. Please clear cache and sync!</div>`;
    return;
  }

  // 1. Categorize lists for the Table of Contents
  const categories = {
    "Playtime & Activity": [],
    "Co-Op & Multiplayer": [],
    "Metadata Hubs": [],
    "Streaks & Habits": [],
    "Completions & Abandons": []
  };

  rawData.metrics.top25Lists.forEach((list, index) => {
    let category = "Playtime & Activity";
    const title = list.titleLeft;
    
    // Auto-categorize based on title keywords
    if (title.includes("Multiplayer") || title.includes("Mallory") || title.includes("Enzo")) category = "Co-Op & Multiplayer";
    else if (title.includes("Streak")) category = "Streaks & Habits";
    else if (title.includes("Completion") || title.includes("Abandon")) category = "Completions & Abandons";
    else if (title.includes("Series") || title.includes("Genre") || title.includes("Developer") || title.includes("Publisher") || title.includes("Release Year")) category = "Metadata Hubs";

    // Extract the #1 Record Holder from the first row of the All-Time list
    let colB = "-", colC = "-", colD = "-", colE = "-", subDetail = "";

    if (list.allTime && list.allTime.length > 0) {
      const topRow = list.allTime[0];
      colB = topRow[1] || "-";
      colC = topRow[2] || "-";
      colD = topRow[3] || "-";
      colE = topRow[4] || "-";
      subDetail = topRow[6] || "";
    }

    categories[category].push({ index, title, colB, colC, colD, colE, subDetail });
  });

  // 2. Build the TOC HTML with inline table styling
  let html = `
  <style>
    .toc-category-wrapper { margin-bottom: 40px; }
    .toc-category-title { font-size: 1.2rem; color: var(--primary-green); margin-bottom: 12px; border-bottom: 2px solid var(--primary-green); padding-bottom: 5px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
    .toc-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; background: var(--card-bg); box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-radius: 8px; overflow: hidden; }
    .toc-table th { background-color: var(--primary-green); color: white; padding: 12px 10px; text-align: left; font-weight: 700; border: 1px solid rgba(0,0,0,0.2); }
    .toc-table td { padding: 12px 10px; border: 1px solid var(--border-table); vertical-align: middle; }
    .toc-table tr:nth-child(even) { background-color: var(--table-row-even); }
    .toc-table tr:hover { background-color: var(--table-row-hover); }
    .toc-link { font-weight: 900; color: var(--primary-green); text-decoration: none; display: flex; align-items: center; gap: 5px; transition: color 0.2s; }
    .toc-link:hover { color: var(--text-main); text-decoration: underline; }
  </style>
  
  <div class="card-row grid-1">
    <h2 style="font-size: 2.5rem; color: var(--text-header); font-weight: 900; text-align: center; margin-bottom: 15px;">Spotlight Archive Directory</h2>
  </div>
  `;

  // Render each category block as a wide table
  for (const [catName, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    
    html += `
    <div class="toc-category-wrapper" style="animation: fadeInUp 0.4s ease forwards;">
      <h3 class="toc-category-title">${escapeHTML(catName)}</h3>
      <div style="overflow-x: auto;">
        <table class="toc-table">
          <thead>
            <tr>
              <th style="width: 25%;">List Name</th>
              <th style="width: 35%;">Record Holder (Col B)</th>
              <th style="width: 15%;">Context (Col C)</th>
              <th style="width: 10%; text-align: center;">Record (Col D)</th>
              <th style="width: 15%; text-align: center;">Start Date (Col E)</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    items.forEach(item => {
      // Inject the subtext if it exists (e.g., "Most Played: Legend of Zelda...")
      const subDetailHtml = item.subDetail ? `<div style="font-size: 0.75rem; color: var(--text-sub); margin-top: 4px; font-weight: 600;">Most Played: ${escapeHTML(item.subDetail)}</div>` : '';
      
      html += `
        <tr>
          <td><a href="#spotlight-list-${item.index}" class="toc-link">▶ ${escapeHTML(item.title)}</a></td>
          <td style="font-weight: 800; color: var(--text-title);">
            ${escapeHTML(item.colB)}
            ${subDetailHtml}
          </td>
          <td style="color: var(--text-muted); font-weight: 600;">${escapeHTML(item.colC)}</td>
          <td style="text-align: center; font-weight: 900; color: var(--primary-green); background: var(--highlight-green-bg); border-left: 2px solid var(--primary-green);">${escapeHTML(item.colD)}</td>
          <td style="text-align: center; font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">${escapeHTML(item.colE)}</td>
        </tr>
      `;
    });
    
    html += `</tbody></table></div></div>`;
  }

  // 3. Build the actual spotlight lists underneath, wrapping them in anchor IDs
  rawData.metrics.top25Lists.forEach((list, index) => {
    html += `
    <section id="spotlight-list-${index}" class="card-row grid-1" style="margin-bottom: 30px; scroll-margin-top: 80px;">
      <div class="card" style="max-height: none; padding: 0;">
        ${generateUniversalDualTableHtml(list)}
      </div>
    </section>
    `;
  });

  container.innerHTML = html;
}

// Setup for the Index Page Dropdown
function setupSpotlightDropdown() {
  const spotSelect = document.getElementById('random-top25-select');
  if (!spotSelect || !rawData || !rawData.metrics || !rawData.metrics.top25Lists) return;

  const options = rawData.metrics.top25Lists.map((list, i) => ({ val: `list-${i}`, text: list.titleLeft }));
  
  spotSelect.innerHTML = options.map(o => `<option value="${o.val}">${escapeHTML(o.text)}</option>`).join('');
  spotSelect.addEventListener('change', (e) => renderSpotlightSingle(e.target.value, 'random-top25-content'));
  
  if (options.length > 0) renderSpotlightSingle(options[0].val, 'random-top25-content');
}

// Routes to index.html widget
function renderSpotlightSingle(selectionVal, targetContainerId) {
  const container = document.getElementById(targetContainerId);
  if (!container || !selectionVal.startsWith('list-')) return;
  
  const index = parseInt(selectionVal.replace('list-', ''));
  const listObj = rawData.metrics.top25Lists[index];

  if (listObj) container.innerHTML = generateUniversalDualTableHtml(listObj);
}


// Initialize the dashboard
initDashboard();
