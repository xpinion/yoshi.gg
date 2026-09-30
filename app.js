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

// Earliest release year shown in the Game of the Year highlights table
const GOTY_HIGHLIGHT_START_YEAR = 1985;

// Scores: a score at or above this counts as "high" in the score-vs-hours charts
const HIGH_SCORE = 8;
// Averages only compete for the "best average" highlight with at least this many scored games
const MIN_SCORED_FOR_AVG_HIGHLIGHT = 3;

// "Now" for the dashboard: the day of the latest log entry, not today's date. Entries are often
// added a week at a time, so measuring against today would shorten streaks, lower projections,
// and make active games look idle.
let _dataDate = null;
function getDataDate() {
  if (!_dataDate) {
    const last = rawData.allEntries[rawData.allEntries.length - 1];
    const [y, m, d] = last.date.slice(0, 10).split('-').map(Number);
    _dataDate = new Date(y, m - 1, d);
  }
  return new Date(_dataDate);
}
function dataDateKey() {
  const d = getDataDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A game's score from the Metadata sheet, or null if it isn't scored
function getGameScore(game) {
  const score = metaScores.get(game);
  return typeof score === 'number' ? score : null;
}
function formatScore(score) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

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
// Status colors live in dashboard.css (--status-*) so light and dark mode can each get a fitting shade
function getStatusColor(status) {
  switch (status) {
    case 'Completed': case 'M-Completed': case 'Postgame': return 'var(--status-completed)';
    case 'Active': return 'var(--status-active)';
    case 'Multiplayer': return 'var(--status-multiplayer)';
    case 'Abandoned': return 'var(--status-abandoned)';
    case 'Non-Completable': return 'var(--status-noncompletable)';
    default: return '#FFFFFF';
  }
}
// Completed playthroughs (optionally for one year), oldest first, with displayDate and entryNum set
function getSortedCompletions(year) {
  return Object.values(rawData.playthroughHistory)
    .filter(pt => (pt.completionDates && pt.completionDates.length > 0) || ['Completed', 'M-Completed', 'Postgame'].includes(pt.finalStatus))
    .map(pt => {
      pt.displayDate = new Date((pt.completionDates && pt.completionDates.length > 0) ? pt.completionDates[0] : pt.lastDate);
      pt.entryNum = getCompletionEntryNum(pt.ptTag);
      return pt;
    })
    .filter(pt => year === 'All-Time' || pt.displayDate.getUTCFullYear().toString() === year)
    .sort((a, b) => (a.displayDate - b.displayDate) || (a.entryNum - b.entryNum));
}
// Other dates this playthrough's game was completed, formatted and without repeats
let _completionDatesByGame = null;
function getOtherCompletionDates(pt) {
  if (!_completionDatesByGame) {
    _completionDatesByGame = new Map((rawData.metrics.completionStats || []).map(g => [g.gameName, g.completionDates]));
  }
  const dates = _completionDatesByGame.get(pt.gameName) || [];
  if (dates.length < 2) return [];
  const current = formatFullDate(pt.displayDate);
  return [...new Set(dates.map(d => formatFullDate(d)).filter(d => d !== current))];
}
// Values that may be a Set, an array, or a serialized {data: [...]} as a plain array
function toList(v) {
  if (v instanceof Set || Array.isArray(v)) return [...v];
  return (v && v.data) || [];
}
// Entry # of each playthrough's last completion-status entry, used to order same-day completions
let _completionEntryNums = null;
function getCompletionEntryNum(ptTag) {
  if (!_completionEntryNums) {
    _completionEntryNums = new Map();
    rawData.allEntries.forEach(e => {
      if (['Completed', 'M-Completed', 'Postgame'].includes(e.status)) _completionEntryNums.set(e.ptTag, Number(e.entryNum));
    });
  }
  return _completionEntryNums.get(ptTag) || 0;
}
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// --- UPDATE: GLOBAL HEADER ---
const NAV_GROUPS = [
  { label: 'Index', href: 'index.html' },
  { label: 'Log', links: [['Monthly', 'monthly.html'], ['Yearly', 'yearly.html'], ['History', 'history.html'], ['Completions', 'completions.html']] },
  { label: 'Collections', links: [['Systems', 'systems.html'], ['Franchise', 'franchise.html'], ['Genre', 'genre.html'], ['Release Year', 'releaseyear.html']] },
  { label: 'Records', links: [['Spotlight', 'spotlight.html'], ['Milestones', 'milestones.html'], ['GotY', 'goty.html']] },
  { label: 'Stats', links: [['Analysis', 'analysis.html'], ['Metrics', 'metrics.html']] }
];

function renderGlobalHeader() {
  const headerContainer = document.getElementById('global-header');
  if (!headerContainer) return;

  const current = window.location.pathname.split('/').pop() || 'index.html';
  const link = (label, href) => `<a href="${href}" class="nav-link${href === current ? ' active' : ''}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`;
  const groupsHtml = NAV_GROUPS.map(group => {
    if (group.href) return link(group.label, group.href);
    const active = group.links.some(([, href]) => href === current);
    return `
      <div class="nav-group${active ? ' active' : ''}" data-label="${group.label}">
        <button type="button" class="nav-group-button" aria-expanded="false">${group.label} <span aria-hidden="true">▾</span></button>
        <div class="nav-menu">${group.links.map(([label, href]) => link(label, href)).join('')}</div>
      </div>`;
  }).join('');
  const games = rawData ? [...new Set(rawData.allEntries.map(e => e.game))].sort((a, b) => a.localeCompare(b)) : [];

  headerContainer.innerHTML = `
    <div class="site-bar">
      <a href="index.html" class="site-brand"><img src="favicon.svg" alt="" width="26" height="26"> <span>yoshi xcx's videogame dashboard</span></a>
      <button type="button" class="nav-menu-toggle" aria-expanded="false" aria-controls="site-nav-panel">Menu</button>
      <div class="site-nav-panel" id="site-nav-panel">
        <nav class="site-nav" aria-label="Site">${groupsHtml}</nav>
        <div class="site-tools">
          <input type="search" id="site-search" class="site-search" list="site-search-list" placeholder="Find a game…" aria-label="Find a game">
          <datalist id="site-search-list">${games.map(g => `<option value="${escapeHTML(g)}">`).join('')}</datalist>
          <button id="theme-toggle" class="theme-btn" type="button" aria-label="Switch to dark mode">🌙</button>
        </div>
      </div>
    </div>
  `;

  // Menus open on hover (desktop) and on tap/click; tapping elsewhere or Escape closes them
  const groups = [...headerContainer.querySelectorAll('.nav-group')];
  const closeAll = except => groups.forEach(g => {
    if (g === except) return;
    g.classList.remove('open');
    g.querySelector('.nav-group-button').setAttribute('aria-expanded', 'false');
  });
  groups.forEach(group => {
    const button = group.querySelector('.nav-group-button');
    button.addEventListener('click', e => {
      e.stopPropagation();
      const open = !group.classList.contains('open');
      closeAll(group);
      group.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
    });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.nav-group')) closeAll(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeAll();
    if (document.activeElement && document.activeElement.closest('.nav-group')) document.activeElement.blur();
  });

  // Phone: the Menu button shows the whole panel
  const toggle = headerContainer.querySelector('.nav-menu-toggle');
  toggle.addEventListener('click', () => {
    const open = headerContainer.classList.toggle('menu-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  const search = document.getElementById('site-search');
  search.addEventListener('change', () => {
    if (games.includes(search.value)) window.location.href = gameProfileUrl(search.value);
  });
}

// --- UPDATE: DASHBOARD INIT (Add routing and global parsing) ---
async function initDashboard() {
  try {
    // 'no-cache' asks GitHub whether the file changed; it's only re-downloaded after a sync
    const [rawResponse, metaResponse] = await Promise.all([
      fetch('raw_dashboard_data.json', { cache: 'no-cache' }),
      fetch('metadata_data.json', { cache: 'no-cache' })
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

    // Route on the page's file name only, so a #tab or ?name= in the address can't pick the wrong page
    const page = window.location.pathname.toLowerCase().split('/').pop() || 'index.html';
    const path = page;

    if (page === 'game.html') initGamePage();
    else if (path.includes('monthly')) initMonthlyPage();
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
      initMilestonesPage();
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
  renderIndexGlance();
  renderNowPlaying();
  setupIndexTabs();
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

// --- INDEX: key numbers, Now Playing, and section tabs ---
function renderIndexGlance() {
  const container = document.getElementById('index-glance');
  if (!container) return;
  const thisYear = String(getDataDate().getFullYear());
  const daySeconds = new Map();
  let yearSeconds = 0, allSeconds = 0;
  const yearGames = new Set(), yearDays = new Set();
  rawData.allEntries.forEach(e => {
    const day = e.date.slice(0, 10), sec = timeStringToSeconds(e.time);
    daySeconds.set(day, (daySeconds.get(day) || 0) + sec);
    allSeconds += sec;
    if (day.startsWith(thisYear)) { yearSeconds += sec; yearGames.add(e.game); yearDays.add(day); }
  });
  const completions = getSortedCompletions('All-Time');
  const yearCompletions = completions.filter(pt => String(pt.displayDate.getUTCFullYear()) === thisYear).length;

  // Current streak: consecutive days played, ending on the latest logged day
  let streak = 0;
  const cursor = getDataDate();
  const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  while (daySeconds.has(key(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }

  const stat = (label, value, sub = '') => `<div class="glance-stat"><span class="sys-widget-title">${label}</span><strong>${value}</strong>${sub ? `<span class="tf-sub">${sub}</span>` : ''}</div>`;
  container.innerHTML = `
    <div class="glance-row">
      ${stat(`${thisYear} Time`, formatTime(yearSeconds), `${yearDays.size} days played`)}
      ${stat(`${thisYear} Games`, yearGames.size)}
      ${stat(`${thisYear} Completions`, yearCompletions)}
      ${stat('Current Streak', `${streak} day${streak === 1 ? '' : 's'}`, `through ${formatFullDate(dataDateKey())}`)}
      ${stat('All-Time', formatTime(allSeconds), `${Object.keys(rawData.metrics.allTimeGameStats).length} games`)}
      ${stat('All-Time Completions', completions.length)}
    </div>`;
}

// Active playthroughs untouched for longer than this are dimmed in Now Playing
const NOW_PLAYING_IDLE_DAYS = 30;

function renderNowPlaying() {
  const container = document.getElementById('now-playing-list');
  if (!container) return;
  const active = Object.values(rawData.playthroughHistory)
    .filter(pt => pt.finalStatus === 'Active')
    .sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
  if (active.length === 0) { container.innerHTML = '<div class="loading-text">Nothing active right now.</div>'; return; }
  container.innerHTML = `<div class="now-playing">${active.map(pt => {
    const idleDays = Math.round((new Date(dataDateKey()) - new Date(String(pt.lastDate).slice(0, 10))) / 86400000);
    const score = getGameScore(pt.gameName);
    return `
      <div class="now-playing-item${idleDays > NOW_PLAYING_IDLE_DAYS ? ' now-playing-idle' : ''}">
        <div class="now-playing-top">
          <span class="item-title hover-trigger" data-game="${escapeHTML(pt.gameName)}">${escapeHTML(pt.gameName)}</span>
          ${score !== null ? `<span class="item-badge">${formatScore(score)}</span>` : ''}
        </div>
        <div class="now-playing-meta">${escapeHTML(toList(pt.systems).join(', '))} · ${formatTime(timeStringToSeconds(pt.finalPtLifetime))} over ${pt.finalPtLifetimeDays} day${pt.finalPtLifetimeDays == 1 ? '' : 's'} · last played ${formatFullDate(pt.lastDate)}${idleDays > 0 ? ` (${idleDays} day${idleDays === 1 ? '' : 's'} before the latest entry)` : ''}</div>
        <div class="note-clamp now-playing-note">${escapeHTML(pt.finalNote)}</div>
      </div>`;
  }).join('')}</div>`;
}

// Tabs show one group of index sections at a time; the choice is remembered and linkable (#rankings)
function setupIndexTabs() {
  const buttons = [...document.querySelectorAll('.index-tabs button')];
  if (buttons.length === 0) return;
  const sections = [...document.querySelectorAll('section[data-tab]')];
  const valid = buttons.map(b => b.dataset.tab);
  const select = tab => {
    buttons.forEach(b => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-pressed', String(b.dataset.tab === tab)); });
    sections.forEach(sec => { sec.hidden = sec.dataset.tab !== tab; });
    try { localStorage.setItem('yoshi-index-tab', tab); } catch (e) { /* storage unavailable */ }
  };
  buttons.forEach(b => b.addEventListener('click', () => {
    select(b.dataset.tab);
    history.replaceState(null, '', `#${b.dataset.tab}`);
  }));
  let saved = null;
  try { saved = localStorage.getItem('yoshi-index-tab'); } catch (e) { /* storage unavailable */ }
  const fromHash = location.hash.slice(1);
  select(valid.includes(fromHash) ? fromHash : valid.includes(saved) ? saved : 'overview');
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
  const widgetData = buildTimeframeWidgetData(mode);
  keys.forEach(key => {
    renderTimeframeWidgets(key, mode, `${mode}-widgets-${key}`, widgetData);
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

// --- TIMEFRAME WIDGETS (Monthly / Yearly cards) ---
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
      <div class="tf-stat"><span class="sys-widget-title">Time Played</span><strong>${formatTime(t.seconds)}</strong>${comparisons.join('')}</div>
      <div class="tf-stat"><span class="sys-widget-title">Days Played</span><strong>${t.days.size}</strong></div>
      <div class="tf-stat"><span class="sys-widget-title">Games</span><strong>${t.games.size}</strong></div>
      <div class="tf-stat"><span class="sys-widget-title">Completions</span><strong>${data.completions[key] || 0}</strong></div>
      <div class="tf-stat"><span class="sys-widget-title">Top Genre</span><strong class="tf-genre">${topGenre ? escapeHTML(topGenre[0]) : '-'}</strong>${topGenre ? `<span class="tf-sub">${formatTime(topGenre[1].totalSeconds)}</span>` : ''}</div>
      ${projection}
    </div>
    ${strip}
  `;
}

// Backwards compatibility wrapper for index.html
function renderMonthlySummary(monthKey, containerId = 'monthly-summary-list') {
  renderTimeframeSummary(monthKey, 'monthly', containerId);
}

// --- COMPLETIONS PAGE ROUTING ---
function initCompletionsPage() {
  const container = document.getElementById('completions-page-container');
  if (!container || !rawData || !rawData.playthroughHistory) return;

  // OLDEST first to calculate running metadata totals accurately
  const completions = getSortedCompletions('All-Time');

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
      <h2 class="page-title">All-Time Completions: <span class="page-title-accent">${totalCompletions}</span></h2>
    </div>
  </div>
  ${completionFiltersHtml(completions)}
  <div class="completion-grid">
  `;

  html += completions.map((pt, index) => {
    const score = metaScores.get(pt.gameName) || '-';
    const badgeHTML = score !== '-' ? `<div class="item-badge cc-score">${score}</div>` : `<div class="item-badge cc-score" style="background: var(--heatmap-empty); color: var(--text-muted);">-</div>`;
    const formattedTime = formatTime(timeStringToSeconds(pt.finalPtLifetime));
    const statusColor = getStatusColor(pt.finalStatus);
    
    const pastDates = getOtherCompletionDates(pt);
    const pastCompletionsHtml = pastDates.length > 0 ? `<div class="cc-past"><strong>Also completed on:</strong> ${pastDates.join(', ')}</div>` : '';

    // Build the metadata rank pills
    let metaRanksHtml = '';
    if (pt.genreRank) metaRanksHtml += `<span class="meta-rank-pill">${escapeHTML(pt.genre)} #${pt.genreRank}</span>`;
    if (pt.seriesRank) metaRanksHtml += `<span class="meta-rank-pill">${escapeHTML(pt.series)} #${pt.seriesRank}</span>`;
    if (pt.devRank) metaRanksHtml += `<span class="meta-rank-pill">${escapeHTML(pt.developer)} #${pt.devRank}</span>`;

    return `
    <div class="completion-card card" data-year="${pt.displayDate.getUTCFullYear()}" data-system="${escapeHTML(pt.system)}" data-genre="${escapeHTML(pt.genre || '')}" style="border-top: 6px solid ${statusColor}; animation-delay: ${Math.min(index * 0.03, 1.2)}s;">
      
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
  setupCompletionFilters(container, completions);
}

// Year / system / genre pickers for the Completions page
function completionFiltersHtml(completions) {
  const options = values => [...new Set(values.filter(Boolean))].sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }));
  const select = (id, label, values, sortAsc) => `
    <select id="${id}" class="milestone-year" aria-label="${label}">
      <option value="all">All ${label.toLowerCase()}s</option>
      ${(sortAsc ? [...values].reverse() : values).map(v => `<option value="${escapeHTML(String(v))}">${escapeHTML(String(v))}</option>`).join('')}
    </select>`;
  return `
    <div class="completion-filters">
      ${select('completion-year', 'Year', options(completions.map(pt => pt.displayDate.getUTCFullYear())))}
      ${select('completion-system', 'System', options(completions.map(pt => pt.system)), true)}
      ${select('completion-genre', 'Genre', options(completions.map(pt => pt.genre)), true)}
      <button type="button" id="completion-reset" class="spotlight-toggle-all">Reset</button>
    </div>
    <div id="completion-summary" class="completion-summary"></div>`;
}

// Filters the completion cards and keeps the summary strip in step with them
function setupCompletionFilters(container, completions) {
  const pickers = { year: 'completion-year', system: 'completion-system', genre: 'completion-genre' };
  const get = key => document.getElementById(pickers[key]).value;
  const cards = [...container.querySelectorAll('.completion-card')];
  const abandoned = Object.values(rawData.playthroughHistory).filter(pt => pt.finalStatus === 'Abandoned');
  const matches = (pt, date, ignoreYear) =>
    (ignoreYear || get('year') === 'all' || String(new Date(date).getUTCFullYear()) === get('year')) &&
    (get('system') === 'all' || pt.system === get('system')) &&
    (get('genre') === 'all' || pt.genre === get('genre'));

  const render = () => {
    cards.forEach(card => {
      card.hidden = !((get('year') === 'all' || card.dataset.year === get('year')) &&
        (get('system') === 'all' || card.dataset.system === get('system')) &&
        (get('genre') === 'all' || card.dataset.genre === get('genre')));
    });
    const shown = completions.filter(pt => matches(pt, pt.displayDate));
    const abandonedShown = abandoned.filter(pt => matches(pt, pt.lastDate)).length;
    const hours = shown.map(pt => timeStringToSeconds(pt.finalPtLifetime));
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const rate = shown.length + abandonedShown > 0 ? Math.round(shown.length / (shown.length + abandonedShown) * 100) : 0;

    // Completions per year for the chosen system and genre (all years, so the chart doubles as a year picker)
    const perYear = {};
    completions.filter(pt => matches(pt, pt.displayDate, true)).forEach(pt => {
      const y = pt.displayDate.getUTCFullYear();
      perYear[y] = (perYear[y] || 0) + 1;
    });
    const years = Object.keys(perYear).sort();
    const maxYear = Math.max(1, ...Object.values(perYear));

    document.getElementById('completion-summary').innerHTML = `
      <div class="completion-stats">
        <div><span class="sys-widget-title">Completions</span><strong>${shown.length}</strong></div>
        <div><span class="sys-widget-title">Avg Time to Finish</span><strong>${formatTime(avg(hours))}</strong></div>
        <div><span class="sys-widget-title">Avg Days Played</span><strong>${avg(shown.map(pt => Number(pt.finalPtLifetimeDays) || 0)).toFixed(1)}</strong></div>
        <div><span class="sys-widget-title">Completion Rate</span><strong>${rate}%</strong><span class="completion-stat-sub">${shown.length} done vs ${abandonedShown} abandoned</span></div>
      </div>
      <div class="completion-years" aria-label="Completions per year">
        ${years.map(y => `
          <button type="button" class="completion-year-bar${get('year') === y ? ' active' : ''}" data-year="${y}" title="${y}: ${perYear[y]} completions">
            <span class="completion-year-count">${perYear[y]}</span>
            <span class="completion-year-fill" style="height: ${(perYear[y] / maxYear) * 100}%;"></span>
            <span class="completion-year-label">${y}</span>
          </button>`).join('')}
      </div>`;
    document.querySelectorAll('.completion-year-bar').forEach(bar => bar.addEventListener('click', () => {
      const picker = document.getElementById(pickers.year);
      picker.value = picker.value === bar.dataset.year ? 'all' : bar.dataset.year;
      render();
    }));
  };

  Object.values(pickers).forEach(id => document.getElementById(id).addEventListener('change', render));
  document.getElementById('completion-reset').addEventListener('click', () => {
    Object.values(pickers).forEach(id => { document.getElementById(id).value = 'all'; });
    render();
  });
  render();
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
      const daysCount = gameStats ? toList(gameStats.days).length : 0;
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

  // SECTION 1: GOTY Highlight Table (3 Equal Columns, GOTY_HIGHLIGHT_START_YEAR - Present)
  const highlightYears = sortedYears.filter(y => parseInt(y) >= GOTY_HIGHLIGHT_START_YEAR);
  const totalYears = highlightYears.length;
  const col1Count = Math.ceil(totalYears / 3);
  const col2Count = Math.ceil((totalYears - col1Count) / 2);

  const col1Years = highlightYears.slice(0, col1Count);
  const col2Years = highlightYears.slice(col1Count, col1Count + col2Count);
  const col3Years = highlightYears.slice(col1Count + col2Count);

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
        <h2>Game of the Year Highlights (${GOTY_HIGHLIGHT_START_YEAR} - Present)</h2>
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

  // SECTION 3B: Games missing a score or missing from the log
  const playedStats = (rawData && rawData.metrics && rawData.metrics.allTimeGameStats) || {};
  const unscoredPlayed = Object.entries(playedStats)
    .filter(([name]) => getGameScore(name) === null)
    .map(([name, stats]) => ({ name, stats }))
    .sort((a, b) => b.stats.totalSeconds - a.stats.totalSeconds);
  const scoredNeverLogged = ratedGames.filter(g => !playedStats[g.name])
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const gapListHtml = (title, subtitle, rows) => `
    <div class="card goty-card">
      <div class="card-header"><h2>${title} <span class="goty-gap-count">${rows.length}</span></h2></div>
      <div class="card-content goty-list-container">
        <div class="goty-gap-subtitle">${subtitle}</div>
        ${rows.length ? rows.join('') : '<div class="loading-text">None. Everything lines up.</div>'}
      </div>
    </div>`;
  html += `<section class="card-row grid-2">
    ${gapListHtml('Played but Not Scored', 'Logged games with no score in the Metadata sheet.', unscoredPlayed.map(({ name, stats }) => `
      <div class="list-item">
        <div class="item-text">
          <span class="item-title hover-trigger" data-game="${escapeHTML(name)}">${escapeHTML(name)}</span>
          <span class="item-sub">${toList(stats.days).length} day${toList(stats.days).length === 1 ? '' : 's'} | last played ${formatFullDate(stats.lastPlayedDate)}</span>
        </div>
        <div class="item-badge">${formatTime(stats.totalSeconds)}</div>
      </div>`))}
    ${gapListHtml('Scored but Never Logged', 'Scored in the Metadata sheet but with no log entries, like games played before the log began, or a name spelled differently in the two sheets.', scoredNeverLogged.map(g => `
      <div class="list-item">
        <div class="item-text">
          <span class="item-title">${escapeHTML(g.name)}</span>
          <span class="item-sub">${escapeHTML(g.releaseYear)} | ${escapeHTML(g.developer)}</span>
        </div>
        <div class="item-badge">${formatScore(g.score)}</div>
      </div>`))}
  </section>`;

  // SECTION 4: Yearly Rankings (Strict 3-Column Grid)
  html += `
    <div class="card-row grid-1" style="margin-top: 20px;">
      <h2 class="page-title page-title-divider">Top 25 Games by Release Year</h2>
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

// --- SPOTLIGHT PARSING (Grouped & Bolded) ---

// --- DROPDOWN SETUP ---
function setupDropdowns() {
  if (!rawData || !rawData.metrics) return;
  const currentYear = getDataDate().getFullYear().toString();

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

const TOOLTIP_INITIAL_ENTRIES = 20;
let _entriesByGame = null;
function getGameEntriesNewestFirst(gameName) {
  if (!_entriesByGame) {
    _entriesByGame = new Map();
    for (let i = rawData.allEntries.length - 1; i >= 0; i--) {
      const e = rawData.allEntries[i];
      if (!_entriesByGame.has(e.game)) _entriesByGame.set(e.game, []);
      _entriesByGame.get(e.game).push(e);
    }
  }
  return _entriesByGame.get(gameName) || [];
}
function tooltipEntryHtml(entry) {
  return `
        <div class="tooltip-entry">
          <div class="tooltip-meta">${formatShortDate(entry.date)} (${entry.date.substring(0,4)}) | ${escapeHTML(entry.system)} | ${entry.time} | <span style="color:${getStatusColor(entry.status)}">${entry.status}</span></div>
          <div class="tooltip-note">${escapeHTML(entry.note)}</div>
        </div>
      `;
}

function gameProfileUrl(gameName) {
  return `game.html?name=${encodeURIComponent(gameName)}`;
}

function setupHoverHistory() {
  const tooltip = document.getElementById('game-tooltip');
  let tooltipTimeout; // The grace-period timer

  // Clicking a game name opens its profile (links keep their own destination)
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.hover-trigger');
    if (!trigger || trigger.closest('a') || e.defaultPrevented) return;
    const gameName = trigger.getAttribute('data-game');
    if (gameName && getGameEntriesNewestFirst(gameName).length > 0) window.location.href = gameProfileUrl(gameName);
  });

  tooltip.addEventListener('click', (e) => {
    const button = e.target.closest('.tooltip-show-all');
    if (!button) return;
    const rest = getGameEntriesNewestFirst(button.getAttribute('data-game')).slice(TOOLTIP_INITIAL_ENTRIES);
    button.insertAdjacentHTML('beforebegin', rest.map(tooltipEntryHtml).join(''));
    button.remove();
  });

  document.addEventListener('mouseover', (e) => {
    // If hovering over the game name OR the tooltip itself, cancel the closing timer
    if (e.target.classList.contains('hover-trigger') || e.target.closest('#game-tooltip')) {
      clearTimeout(tooltipTimeout);
    }

    // If hovering over a game name, build and show the tooltip
    if (e.target.classList.contains('hover-trigger')) {
      const gameName = e.target.getAttribute('data-game');
      if (!gameName) return;

      const entries = getGameEntriesNewestFirst(gameName);
      if (entries.length === 0) return;

      // Latest entries first; the full history is one click away
      let html = `<h3>${escapeHTML(gameName)} History</h3>`;
      html += entries.slice(0, TOOLTIP_INITIAL_ENTRIES).map(tooltipEntryHtml).join('');
      if (entries.length > TOOLTIP_INITIAL_ENTRIES) {
        html += `<button type="button" class="tooltip-show-all" data-game="${escapeHTML(gameName)}">Show all ${entries.length} entries</button>`;
      }

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

  const completions = getSortedCompletions(year);

  completions.forEach((c, index) => c.yearRank = index + 1);
  completions.reverse();

  if (completions.length === 0) { container.innerHTML = `<div class="loading-text">No completions logged for ${year}.</div>`; return; }

  container.innerHTML = completions.map(pt => {
    const score = metaScores.get(pt.gameName) || '-';
    const badgeHTML = score !== '-' ? `<div class="item-badge">${score}</div>` : `<div class="item-badge" style="background: var(--heatmap-empty); color: var(--text-muted);">-</div>`;

    const pastDates = getOtherCompletionDates(pt);
    const pastCompletionsHtml = pastDates.length > 0 ? `<div style="font-size: 0.75rem; font-style: italic; color: var(--text-sub); margin-top: 4px;">Also completed on: ${pastDates.join(', ')}</div>` : '';

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

// Most Played (time) and Most Days Played share one list renderer
function renderMostPlayed(year) { renderTopGamesList(year, 'most-played-list', 'seconds'); }
function renderMostDays(year) { renderTopGamesList(year, 'most-days-list', 'days'); }

function renderTopGamesList(year, containerId, sortBy) {
  const container = document.getElementById(containerId);
  const statsObj = year === 'All-Time' ? rawData.metrics.allTimeGameStats : rawData.metrics.yearlyGameStats[year];

  if (!statsObj) { container.innerHTML = `<div class="loading-text">No playtime logged.</div>`; return; }

  const sortedGames = Object.entries(statsObj).map(([name, stats]) => {
    const daysArr = toList(stats.days).sort();

    // Check Date Objects (All-Time) or fallback to String parsing (Yearly)
    const minDate = stats.firstPlayedDate ? formatFullDate(stats.firstPlayedDate) : (daysArr.length > 0 ? daysArr[0].replace(/-/g, '/') : "N/A");
    const maxDate = stats.lastPlayedDate ? formatFullDate(stats.lastPlayedDate) : (daysArr.length > 0 ? daysArr[daysArr.length - 1].replace(/-/g, '/') : "N/A");

    return { name, seconds: stats.totalSeconds, days: daysArr.length, systems: toList(stats.systems).join(', '), minDate, maxDate };
  }).sort((a, b) => b[sortBy] - a[sortBy]).slice(0, 100);

  const byDays = sortBy === 'days';
  container.innerHTML = sortedGames.map((game, index) => `
    <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 12px;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
        <span class="item-title" style="font-weight: bold;">
          <span style="color: var(--text-muted); margin-right: 5px;">#${index + 1}</span><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span> ${game.systems ? `(${escapeHTML(game.systems)})` : ''}
        </span>
        <div class="item-badge">${byDays ? `${game.days} Days` : formatTime(game.seconds)}</div>
      </div>
      <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 4px;">
        ${byDays ? `<span><strong>${formatTime(game.seconds)}</strong> Played</span>` : `<span><strong>${game.days}</strong> Days Played</span>`}
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
    const daysCount = gameStats ? toList(gameStats.days).length : 0;

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

  container.innerHTML = milestones.map(milestoneItemHtml).join('');
}

// --- GAME PROFILE PAGE (game.html?name=...) ---
function initGamePage() {
  const container = document.getElementById('game-page-container');
  if (!container || !rawData) return;
  const gameName = new URLSearchParams(window.location.search).get('name') || '';
  const entries = getGameEntriesNewestFirst(gameName).slice().reverse(); // oldest first
  const allGames = [...new Set(rawData.allEntries.map(e => e.game))].sort((a, b) => a.localeCompare(b));

  const searchHtml = `
    <div class="game-search-row">
      <input type="search" id="game-profile-search" class="spotlight-filter" list="game-profile-list" placeholder="Open another game…" aria-label="Open another game">
      <datalist id="game-profile-list">${allGames.map(g => `<option value="${escapeHTML(g)}">`).join('')}</datalist>
    </div>`;

  if (entries.length === 0) {
    container.innerHTML = `${searchHtml}<div class="loading-text">${gameName ? `No log entries for "${escapeHTML(gameName)}".` : 'Pick a game to see its profile.'}</div>`;
    setupGameProfileSearch(allGames);
    return;
  }
  document.title = `${gameName} | yoshi xcx's Videogame Dashboard`;

  const meta = metaGames.find(g => g.name === gameName) || {};
  const score = getGameScore(gameName);
  const stats = rawData.metrics.allTimeGameStats[gameName] || {};
  const sessions = entries.map(e => ({ date: e.date, sec: timeStringToSeconds(e.time), system: e.system }));
  const totalSeconds = sessions.reduce((sum, s) => sum + s.sec, 0);
  const longest = sessions.reduce((best, s) => s.sec > best.sec ? s : best, sessions[0]);
  const systems = [...new Set(entries.map(e => e.system))];
  const days = new Set(entries.map(e => e.date.slice(0, 10)));

  // GotY rank among games from the same release year
  let gotyHtml = '';
  if (score !== null && meta.releaseYear && meta.releaseYear !== 'Unknown') {
    const sameYear = metaGames.filter(g => g.score !== null && g.releaseYear === meta.releaseYear)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const rank = sameYear.findIndex(g => g.name === gameName) + 1;
    gotyHtml = `<a class="game-goty" href="goty.html#year-${encodeURIComponent(meta.releaseYear)}">${rank === 1 ? '🏆 Game of the Year' : `#${rank}`} of ${sameYear.length} scored ${escapeHTML(meta.releaseYear)} games</a>`;
  }

  const metaLink = (label, value, page) => value && value !== 'Unknown' && value !== 'ZZNONE'
    ? `<div><span class="sys-widget-title">${label}</span><a href="${page}?item=${encodeURIComponent(value)}">${escapeHTML(value)}</a></div>`
    : (value && value !== 'ZZNONE' ? `<div><span class="sys-widget-title">${label}</span><span>${escapeHTML(value)}</span></div>` : '');
  const plainMeta = (label, value) => value && value !== 'Unknown' ? `<div><span class="sys-widget-title">${label}</span><span>${escapeHTML(value)}</span></div>` : '';

  // Playthroughs, newest first
  const playthroughs = Object.values(rawData.playthroughHistory).filter(pt => pt.gameName === gameName)
    .sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));

  // Spotlight: lists this game currently leads, and how many it appears in
  const lists = (rawData.metrics.top25Lists || []);
  const slugs = spotlightSlugs(lists);
  const leads = [], appearsIn = [];
  lists.forEach((list, i) => {
    const rowIndex = list.allTime.findIndex(row => row[1] === gameName);
    if (rowIndex === -1) return;
    // Tied rows leave the rank blank, so use the nearest rank above
    let rank = '';
    for (let r = rowIndex; r >= 0 && !rank; r--) rank = list.allTime[r][0] || '';
    const entry = { title: list.titleLeft, slug: slugs[i], value: list.allTime[rowIndex][3], rank };
    if (rowIndex === 0) leads.push(entry); else appearsIn.push(entry);
  });
  const spotlightRow = e => `<a class="game-spotlight-item" href="spotlight.html#${e.slug}"><span><span class="game-spotlight-rank">${escapeHTML(String(e.rank))}</span>${escapeHTML(e.title)}</span><strong>${escapeHTML(String(e.value))}</strong></a>`;

  // The name must stand alone ("Persona 5 (PS5)"), so "Persona 5" doesn't also match "Persona 5 Royal"
  const escapedName = gameName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namePattern = new RegExp(`(^|[\\s:])${escapedName}(?=$|[\\s.,)]*(\\(|took|entered|jumped|became|$|\\.))`);
  const milestones = (rawData.metrics.milestones || []).filter(m => namePattern.test(m.details))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = `
    ${searchHtml}
    <section class="card-row grid-1">
      <div class="card game-hero">
        <div class="game-hero-top">
          <h1 class="game-title">${escapeHTML(gameName)}</h1>
          ${score !== null ? `<div class="game-score">${formatScore(score)}</div>` : ''}
        </div>
        ${gotyHtml}
        <div class="game-meta">
          ${plainMeta('Release Year', meta.releaseYear)}
          ${metaLink('Genre', meta.genre, 'genre.html')}
          ${metaLink('Franchise', meta.franchise, 'franchise.html')}
          ${plainMeta('Developer', meta.developer)}
          ${plainMeta('Publisher', meta.publisher)}
          <div><span class="sys-widget-title">Systems</span><span>${systems.map(sys => `<a href="systems.html?item=${encodeURIComponent(sys)}">${escapeHTML(sys)}</a>`).join(', ')}</span></div>
        </div>
      </div>
    </section>

    <section class="card-row grid-4">
      <div class="card hub-stat-card"><div class="sys-widget-title">Total Time</div><div class="sys-widget-value hub-value-md">${formatTime(totalSeconds)}</div><div class="sys-widget-sub">${sessions.length} sessions</div></div>
      <div class="card hub-stat-card"><div class="sys-widget-title">Days Played</div><div class="sys-widget-value hub-value-md">${days.size}</div><div class="sys-widget-sub">avg ${formatTime(totalSeconds / days.size)} per day</div></div>
      <div class="card hub-stat-card"><div class="sys-widget-title">Longest Session</div><div class="sys-widget-value hub-value-md">${formatTime(longest.sec)}</div><div class="sys-widget-sub">${formatFullDate(longest.date)}</div></div>
      <div class="card hub-stat-card"><div class="sys-widget-title">Played</div><div class="sys-widget-value hub-value-md">${formatFullDate(entries[0].date).slice(0, 4)}${formatFullDate(entries[entries.length - 1].date).slice(0, 4) !== formatFullDate(entries[0].date).slice(0, 4) ? `–${formatFullDate(entries[entries.length - 1].date).slice(0, 4)}` : ''}</div><div class="sys-widget-sub">${formatFullDate(entries[0].date)} to ${formatFullDate(entries[entries.length - 1].date)}</div></div>
    </section>

    <section class="card-row grid-1">
      <div class="card">
        <div class="card-header"><h2>Play Time by Month</h2></div>
        <div class="card-content hub-card-body">${gameMonthlyChartHtml(sessions)}</div>
      </div>
    </section>

    <section class="card-row grid-2">
      <div class="card">
        <div class="card-header"><h2>Spotlight Records</h2></div>
        <div class="card-content">
          ${leads.length ? `<div class="game-spotlight-heading">Holds #1 in ${leads.length} list${leads.length === 1 ? '' : 's'}</div>${leads.map(spotlightRow).join('')}` : '<div class="game-spotlight-heading">Not #1 in any Spotlight list</div>'}
          ${appearsIn.length ? `<div class="game-spotlight-heading">Also ranked in ${appearsIn.length} list${appearsIn.length === 1 ? '' : 's'}</div>${appearsIn.map(spotlightRow).join('')}` : ''}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Milestones <span class="goty-gap-count">${milestones.length}</span></h2></div>
        <div class="card-content">${milestones.length ? milestones.map(milestoneItemHtml).join('') : '<div class="loading-text">No milestones mention this game.</div>'}</div>
      </div>
    </section>

    <section class="card-row grid-1">
      <div class="card">
        <div class="card-header"><h2>Playthroughs <span class="goty-gap-count">${playthroughs.length}</span></h2></div>
        <div class="card-content hub-flush">
          <div class="monthly-table-wrapper hub-pad">
            <table class="monthly-table hub-archive-table">
              <thead><tr><th>Tag</th><th>Systems</th><th>Time</th><th>Days</th><th>Started</th><th>Last Updated</th><th>Status</th><th>Details</th></tr></thead>
              <tbody>${playthroughs.map(pt => `
                <tr>
                  <td class="text-center">${escapeHTML(pt.ptTag || '')}</td>
                  <td class="text-center">${escapeHTML(toList(pt.systems).join(', '))}</td>
                  <td class="text-center">${pt.finalPtLifetime}</td>
                  <td class="text-center">${pt.finalPtLifetimeDays}</td>
                  <td class="text-center">${formatFullDate(pt.startDate)}</td>
                  <td class="text-center">${formatFullDate(pt.lastDate)}</td>
                  <td class="text-center status-cell hub-bold" style="background-color: ${getStatusColor(pt.finalStatus)};">${pt.finalStatus}</td>
                  <td class="text-left">${escapeHTML(pt.finalNote)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <section class="card-row grid-1">
      <div class="card">
        <div class="card-header"><h2>Every Session <span class="goty-gap-count">${entries.length}</span></h2></div>
        <div class="card-content hub-flush" id="game-history-content"></div>
      </div>
    </section>
  `;
  renderGameHistory(gameName);
  setupGameProfileSearch(allGames);
}

function setupGameProfileSearch(allGames) {
  const input = document.getElementById('game-profile-search');
  input.addEventListener('change', () => {
    if (allGames.includes(input.value)) window.location.href = gameProfileUrl(input.value);
  });
}

// Bars for each month from the first to the last month the game was played
function gameMonthlyChartHtml(sessions) {
  const byMonth = {};
  sessions.forEach(s => { const k = s.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + s.sec; });
  const first = sessions[0].date.slice(0, 7), last = sessions[sessions.length - 1].date.slice(0, 7);
  const months = [];
  for (let [y, m] = first.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= last; m === 12 ? (y++, m = 1) : m++) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  const width = 1000, height = 240, padL = 50, padB = 30, padT = 14;
  const innerW = width - padL - 10, innerH = height - padB - padT;
  const max = Math.max(...months.map(k => byMonth[k] || 0), 1);
  const barW = innerW / months.length;
  let svg = `<svg class="hub-chart" viewBox="0 0 ${width} ${height}">`;
  [0, 0.5, 1].forEach(f => {
    const y = padT + innerH - f * innerH;
    svg += `<line x1="${padL}" y1="${y}" x2="${width - 10}" y2="${y}" stroke="var(--border-table)" />`;
    svg += `<text x="${padL - 8}" y="${y + 4}" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="var(--text-muted)" text-anchor="end">${Math.round(f * max / 3600)}h</text>`;
  });
  months.forEach((k, i) => {
    const sec = byMonth[k] || 0;
    const h = (sec / max) * innerH;
    svg += `<rect x="${padL + i * barW + barW * 0.1}" y="${padT + innerH - h}" width="${Math.max(1, barW * 0.8)}" height="${h}" fill="var(--primary-green)" rx="2"><title>${MONTH_NAMES[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}: ${formatTime(sec)}</title></rect>`;
    if (k.endsWith('-01') || i === 0) {
      svg += `<text x="${padL + i * barW}" y="${height - 10}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="var(--text-muted)">${k.slice(0, 4)}</text>`;
    }
  });
  return svg + `</svg>`;
}

// --- MILESTONES PAGE: filters by type, year, and text ---
const MILESTONE_TYPES = [
  { id: 'record', label: 'World Records' }, { id: 'ranking', label: 'Rankings' }, { id: 'count', label: 'Counts' },
  { id: 'hours', label: 'Hour Totals' }, { id: 'first', label: 'Firsts' }, { id: 'anniversary', label: 'Anniversaries' }
];

function initMilestonesPage() {
  const container = document.getElementById('milestones-page-container');
  if (!container || !rawData || !rawData.metrics || !rawData.metrics.milestones) return;

  const milestones = rawData.metrics.milestones.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const typeOf = m => m.type || 'other';
  const counts = {};
  milestones.forEach(m => { counts[typeOf(m)] = (counts[typeOf(m)] || 0) + 1; });
  const types = MILESTONE_TYPES.filter(t => counts[t.id]);
  const years = [...new Set(milestones.map(m => new Date(m.date).getUTCFullYear()))].sort((a, b) => b - a);

  container.innerHTML = `
    <div class="milestone-filters">
      <div class="milestone-type-buttons">
        <button type="button" class="milestone-type active" data-type="all">All <span>${milestones.length}</span></button>
        ${types.map(t => `<button type="button" class="milestone-type" data-type="${t.id}">${t.label} <span>${counts[t.id]}</span></button>`).join('')}
      </div>
      <div class="milestone-filter-row">
        <select id="milestone-year" class="milestone-year" aria-label="Year">
          <option value="all">All years</option>
          ${years.map(y => `<option value="${y}">${y}</option>`).join('')}
        </select>
        <input type="search" id="milestone-search" class="spotlight-filter" placeholder="Search milestones: try Zelda, 1000 hours, Top 25…" aria-label="Search milestones">
        <span id="milestone-count" class="spotlight-filter-count"></span>
      </div>
    </div>
    <div id="milestones-filtered-list"></div>
  `;

  let activeType = 'all';
  const list = document.getElementById('milestones-filtered-list');
  const yearSelect = document.getElementById('milestone-year');
  const search = document.getElementById('milestone-search');
  const count = document.getElementById('milestone-count');

  const render = () => {
    const year = yearSelect.value;
    const query = search.value.trim().toLowerCase();
    const shown = milestones.filter(m =>
      (activeType === 'all' || typeOf(m) === activeType) &&
      (year === 'all' || String(new Date(m.date).getUTCFullYear()) === year) &&
      (!query || m.details.toLowerCase().includes(query)));
    count.textContent = `${shown.length} of ${milestones.length}`;
    list.innerHTML = shown.length ? shown.map(milestoneItemHtml).join('') : `<div class="loading-text">No milestones match.</div>`;
  };

  container.querySelectorAll('.milestone-type').forEach(button => {
    button.addEventListener('click', () => {
      activeType = button.dataset.type;
      container.querySelectorAll('.milestone-type').forEach(b => b.classList.toggle('active', b === button));
      render();
    });
  });
  yearSelect.addEventListener('change', render);
  search.addEventListener('input', render);
  render();
}

function milestoneItemHtml(m) {
  return `
  <div class="milestone-item">
    <div class="milestone-date">${formatShortDate(m.date)}/${new Date(m.date).getUTCFullYear()}</div>
    <div class="milestone-detail">${escapeHTML(m.details)}</div>
  </div>
  `;
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
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const apply = isDark => {
    document.body.classList.toggle('dark-theme', isDark);
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = btn.getAttribute('aria-label');
  };

  // A saved choice wins; otherwise follow the device's light/dark setting, including later changes
  const saved = localStorage.getItem('yoshi-theme');
  apply(saved ? saved === 'dark' : !!(systemDark && systemDark.matches));
  if (systemDark && systemDark.addEventListener) {
    systemDark.addEventListener('change', e => { if (!localStorage.getItem('yoshi-theme')) apply(e.matches); });
  }

  btn.addEventListener('click', () => {
    const isDark = !document.body.classList.contains('dark-theme');
    localStorage.setItem('yoshi-theme', isDark ? 'dark' : 'light');
    apply(isDark);
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

      const currentYear = getDataDate().getFullYear().toString();
      const isBold = (end && end.toString().startsWith(currentYear)) || (col1 && col1.toString() === currentYear);
      // Ensure we keep your custom active class or bold styling here
      const boldStyle = isBold ? 'style="font-weight: 800; color: #000; background-color: #f0fff4;"' : '';

      const detailMainHtml = isGameList
        ? `<span class="hover-trigger" data-game="${escapeHTML(String(detail))}">${escapeHTML(String(detail))}</span>`
        : `<span style="font-weight: 800; color: var(--text-title);">${escapeHTML(String(detail))}</span>`;

      // Subtext rendering
      const detailSubHtml = detailSub
        ? `<div style="font-size: 0.8rem; font-weight: 600; color: var(--text-sub); margin-top: 2px;">${escapeHTML(String(detailSub))}</div>`
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
  <h2 class="spotlight-list-title">${escapeHTML(listObj.titleLeft)}</h2>
  <h2 class="spotlight-list-title">${escapeHTML(listObj.titleRight)}</h2>
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
function initSpotlightPage() {
  const container = document.getElementById('spotlight-page-container');
  if (!container || !rawData || !rawData.metrics) return;

  if (!rawData.metrics.top25Lists) {
    container.innerHTML = `<div class="loading-text" style="color: #ff9f1c;">Spotlight data not found. Please clear cache and sync!</div>`;
    return;
  }

  const lists = rawData.metrics.top25Lists;
  const slugs = spotlightSlugs(lists);

  // 1. Group lists by the category set in Apps Script (sections appear in the order first used)
  const categories = {};

  rawData.metrics.top25Lists.forEach((list, index) => {
    const category = list.category || "Other";
    const title = list.titleLeft;

    // Extract the #1 Record Holder from the first row of the All-Time list
    let recordName = "-", recordContext = "", recordValue = "-", startDate = "-", endDate = "-", subDetail = "";

    if (list.allTime && list.allTime.length > 0) {
      const topRow = list.allTime[0];
      recordName = topRow[1] || "-";    
      recordContext = topRow[2] || "";  
      recordValue = topRow[3] || "-";   
      startDate = topRow[4] || "-";
      endDate = topRow[5] || "-";
      subDetail = list.hideTocDetail ? "" : (topRow[6] || "");
    }

    if (!categories[category]) categories[category] = [];
    categories[category].push({ index, title, recordName, recordContext, recordValue, startDate, endDate, subDetail });
  });

  // 2. Build the TOC HTML with inline table styling
  const currentYearStr = getDataDate().getFullYear().toString();

  let html = `
  
  <div class="card-row grid-1">
    <h2 class="page-title">Spotlight Archive Directory</h2>
  </div>

  <div class="spotlight-tools">
    <input type="search" id="spotlight-filter" class="spotlight-filter" placeholder="Filter lists: try hiatus, Zelda, January…" aria-label="Filter Spotlight lists">
    <span id="spotlight-filter-count" class="spotlight-filter-count">${lists.length} lists</span>
    <button type="button" class="spotlight-toggle-all" data-open="true">Expand all</button>
    <button type="button" class="spotlight-toggle-all" data-open="false">Collapse all</button>
  </div>
  `;

  // Render each category block as a wide table
  for (const [catName, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    
    html += `
    <details class="toc-category-wrapper" open style="animation: fadeInUp 0.4s ease forwards;">
      <summary><h3 class="toc-category-title">${escapeHTML(catName)} <span class="toc-category-count">${items.length}</span></h3></summary>
      <div style="overflow-x: auto;">
        <table class="toc-table">
          <thead>
            <tr>
              <th style="width: 25%;">List Name</th>
              <th style="width: 35%;">Record Holder</th>
              <th style="width: 15%; text-align: center;">Record</th>
              <th style="width: 12.5%; text-align: center;">Start Date</th>
              <th style="width: 12.5%; text-align: center;">End Date</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    items.forEach(item => {
      const subDetailHtml = item.subDetail ? `<div style="font-size: 0.75rem; color: var(--text-sub); margin-top: 4px; font-weight: 600;">${escapeHTML(item.subDetail)}</div>` : '';
      const contextHtml = (item.recordContext && item.recordContext !== '-') ? `<span style="color: var(--text-muted); font-size: 0.85rem; font-weight: 600; margin-left: 4px;">(${escapeHTML(item.recordContext)})</span>` : '';
      
      // Determine if this record is active in the current calendar year
      const isActive = (item.endDate && item.endDate.toString().startsWith(currentYearStr)) || 
                       (item.startDate && item.startDate.toString().startsWith(currentYearStr));
      const rowClass = isActive ? 'class="toc-active-row"' : '';

      html += `
        <tr ${rowClass} data-list="${item.index}">
          <td><a href="#${slugs[item.index]}" class="toc-link">▶ ${escapeHTML(item.title)}</a></td>
          <td style="font-weight: 800; color: var(--text-title);">
            ${escapeHTML(item.recordName)}${contextHtml}
            ${subDetailHtml}
          </td>
          <td style="text-align: center; font-weight: 900; color: var(--primary-green); background: var(--highlight-green-bg); border-left: 2px solid var(--primary-green);">${escapeHTML(item.recordValue)}</td>
          <td style="text-align: center; font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">${escapeHTML(item.startDate)}</td>
          <td style="text-align: center; font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">${escapeHTML(item.endDate)}</td>
        </tr>
      `;
    });
    
    html += `</tbody></table></div></details>`;
  }

  // 3. Build the actual spotlight lists underneath, wrapping them in anchor IDs
  lists.forEach((list, index) => {
    html += `
    <section id="${slugs[index]}" data-list="${index}" class="card-row grid-1" style="margin-bottom: 30px; scroll-margin-top: 80px;">
      <div class="card" style="max-height: none; padding: 0;">
        ${generateUniversalDualTableHtml(list)}
      </div>
    </section>
    `;
  });

  container.innerHTML = html;
  setupSpotlightFilter(container, lists);

  // The page is drawn after the data loads, so jump to a linked list ourselves
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView({ behavior: 'instant' });
  }
}

// Link-friendly ids from list titles ("Top 25 Series Hiatuses" -> "top-25-series-hiatuses"), unique per page
function spotlightSlugs(lists) {
  const used = new Set();
  return lists.map(list => {
    const base = String(list.titleLeft).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'list';
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    return slug;
  });
}

// Filters the directory and lists by name or any text inside a list; hides sections with no matches
function setupSpotlightFilter(container, lists) {
  const input = document.getElementById('spotlight-filter');
  const count = document.getElementById('spotlight-filter-count');
  const searchText = lists.map(list => [list.titleLeft, list.titleRight, list.category, ...list.allTime.flat(), ...list.yearly.flat()].join(' ').toLowerCase());
  const rows = [...container.querySelectorAll('tr[data-list]')];
  const sections = [...container.querySelectorAll('section[data-list]')];
  const groups = [...container.querySelectorAll('details.toc-category-wrapper')];

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    const matches = searchText.map(text => !query || text.includes(query));
    rows.forEach(row => { row.hidden = !matches[row.dataset.list]; });
    sections.forEach(section => { section.hidden = !matches[section.dataset.list]; });
    groups.forEach(group => {
      const visible = group.querySelectorAll('tr[data-list]:not([hidden])').length;
      group.hidden = visible === 0;
      group.querySelector('.toc-category-count').textContent = visible;
      if (query && visible > 0) group.open = true;
    });
    const shown = matches.filter(Boolean).length;
    count.textContent = query ? `${shown} of ${lists.length} lists` : `${lists.length} lists`;
  });

  container.querySelectorAll('.spotlight-toggle-all').forEach(button => {
    button.addEventListener('click', () => groups.forEach(group => { group.open = button.dataset.open === 'true'; }));
  });
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


// --- PHONE CARD LAYOUT FOR SUMMARY TABLES ---
// Gives each cell of a .monthly-table a data-label from its column header(s), e.g. "Active Month · Time",
// so the phone layout in dashboard.css can show every row as a card of label/value pairs.
function labelTableCells(table) {
  const headerRows = [...table.querySelectorAll('thead tr')];
  const labels = [];
  const pending = []; // columns whose group header is waiting for a second-row sub-label
  headerRows.forEach((row, r) => {
    let col = 0;
    [...row.children].forEach(th => {
      const text = th.textContent.trim();
      if (r === 0) {
        const span = th.colSpan || 1;
        for (let k = 0; k < span; k++) {
          labels.push(text);
          if (span > 1 || (th.rowSpan || 1) < headerRows.length) pending.push(labels.length - 1);
        }
      } else {
        const idx = pending[col++];
        if (idx !== undefined) labels[idx] = `${labels[idx]} · ${text}`;
      }
    });
  });
  table.querySelectorAll('tbody tr').forEach(row => {
    let col = 0;
    [...row.children].forEach(td => {
      const span = td.colSpan || 1;
      if (span === 1 && labels[col]) {
        td.setAttribute('data-label', labels[col]);
        if (/details/i.test(labels[col])) clampLongNote(td);
      }
      col += span;
    });
  });
  table.classList.add('has-cell-labels');
}

// Long playthrough notes show two lines, with a button to expand
const NOTE_CLAMP_CHARS = 140;
function clampLongNote(td) {
  if (td.textContent.trim().length <= NOTE_CLAMP_CHARS) return;
  td.innerHTML = `<div class="note-clamp">${td.innerHTML}</div><button type="button" class="note-toggle">more</button>`;
}
document.addEventListener('click', e => {
  const button = e.target.closest('.note-toggle');
  if (!button) return;
  const expanded = button.previousElementSibling.classList.toggle('expanded');
  button.textContent = expanded ? 'less' : 'more';
});

// Chart and grid hover labels: move native title text into data-tip, shown by one styled tooltip
function convertTitlesToTips(root) {
  root.querySelectorAll('svg title').forEach(t => {
    if (t.parentElement) t.parentElement.setAttribute('data-tip', t.textContent.trim());
    t.remove();
  });
  root.querySelectorAll('main [title]').forEach(el => {
    el.setAttribute('data-tip', el.getAttribute('title'));
    el.removeAttribute('title');
  });
}

function setupChartTips() {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  let hideTimer;
  const place = (x, y) => {
    const rect = tip.getBoundingClientRect();
    const left = Math.min(x + 14, window.innerWidth - rect.width - 8);
    const top = y - rect.height - 12 < 8 ? y + 16 : y - rect.height - 12;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${top}px`;
  };
  const show = (el, x, y) => {
    clearTimeout(hideTimer);
    tip.textContent = el.getAttribute('data-tip');
    tip.hidden = false;
    place(x, y);
  };
  document.addEventListener('pointerover', e => {
    const el = e.target.closest('[data-tip]');
    if (el && e.pointerType !== 'touch') show(el, e.clientX, e.clientY);
  });
  document.addEventListener('pointermove', e => { if (!tip.hidden && e.pointerType !== 'touch') place(e.clientX, e.clientY); });
  document.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]') && e.pointerType !== 'touch') tip.hidden = true; });
  // Touch: a tap shows the tip for a few seconds
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const el = e.target.closest('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    show(el, e.clientX, e.clientY);
    hideTimer = setTimeout(() => { tip.hidden = true; }, 2500);
  });
  window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
}

new MutationObserver(() => {
  document.querySelectorAll('table.monthly-table:not(.has-cell-labels)').forEach(labelTableCells);
  convertTitlesToTips(document);
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', setupChartTips);
if (document.readyState !== 'loading') setupChartTips();

// Initialize the dashboard
initDashboard();
