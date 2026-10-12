// core.js - Shared by every page of Yoshi's Videogame Dashboard: data loading, the header, the theme,
// game-name tooltips, formatting helpers, and the start-up that calls the page's own script.
//
// Each page loads core.js first, then the files in js/ that draw it (see its <script> tags):
//   index.js      Index widgets; also uses timeframe, game, spotlight, metrics, analysis and history
//   timeframe.js  Monthly and Yearly        hubs.js        Systems, Franchise, Genre, Release Year
//   completions.js, goty.js, game.js, spotlight.js, metrics.js, milestones.js, analysis.js, history.js
//   reach.js (Within Reach), review.js (Year in Review), partner.js, compare.js, ratings.js (also uses hubs)
//   timeline.js, patterns.js (Seasonality, System Lifecycles), checks.js (Data Checks)
//   share.js      Share cards, loaded by the pages that offer them (game, review, spotlight)

// Global State
let rawData = null;
let metaGames = [];
let metaScores = new Map();

// Constants for Metadata Columns
const META_GAME = 0;
const META_RELEASE_YEAR = 1;
const META_GENRE = 2;
const META_DEVELOPER = 3;
const META_PUBLISHER = 4;
const META_SERIES = 5;
const META_YOSCORE = 6;

// "Now" for the dashboard: the day of the latest log entry, not today's date. Entries are often
// added a week at a time, so measuring against today would shorten streaks, lower projections,
// and make active games look idle.
let _dataDate = null;
function getDataDate() {
  if (!_dataDate) {
    const [y, m, d] = rawData.latestEntryDate.slice(0, 10).split('-').map(Number);
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
  { label: 'Log', links: [['Monthly', 'monthly.html'], ['Yearly', 'yearly.html'], ['Year in Review', 'review.html'], ['Timeline', 'timeline.html'], ['History', 'history.html'], ['Completions', 'completions.html']] },
  { label: 'Collections', links: [['Systems', 'systems.html'], ['Franchise', 'franchise.html'], ['Genre', 'genre.html'], ['Release Year', 'releaseyear.html'], ['Partners', 'partner.html']] },
  { label: 'Records', links: [['Spotlight', 'spotlight.html'], ['Milestones', 'milestones.html'], ['Within Reach', 'reach.html'], ['GotY', 'goty.html']] },
  { label: 'Stats', links: [['Analysis', 'analysis.html'], ['Metrics', 'metrics.html'], ['Ratings', 'ratings.html'], ['Patterns', 'patterns.html'], ['Compare', 'compare.html'], ['Share Cards', 'card.html'], ['Data Checks', 'checks.html']] }
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
  const games = rawData ? [...rawData.gameNames].sort((a, b) => a.localeCompare(b)) : [];

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
      if (!open) button.blur(); // or the focused button would hold the menu open
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

// --- DATA LOADING ---
// The data is split into one file per group in data/ (built by buildWebDataFiles in Integration.gs),
// so a page only downloads the groups it shows.
const DATA_GROUPS = ['core', 'entries', 'playthroughs', 'games', 'genres', 'analysis', 'lists', 'milestones', 'sessions'];
// Groups each page needs, counting everything its dropdowns can show. A page not listed loads them all.
// If a page starts reading something new, add its group here (tools/usage.js lists what a page reads).
// The hub pages (Systems, Franchise, Genre, Release Year) also fetch 'lists' after drawing, for their Spotlight records card.
const PAGE_DATA = {
  'index.html': ['entries', 'playthroughs', 'games', 'genres'], // its other tabs load theirs: see INDEX_TAB_DATA
  'analysis.html': ['analysis'],
  'card.html': ['entries', 'playthroughs', 'games', 'milestones', 'lists'],
  'checks.html': ['entries', 'playthroughs'],
  'compare.html': ['entries', 'playthroughs'],
  'completions.html': ['entries', 'playthroughs'],
  'franchise.html': ['entries', 'playthroughs', 'games'],
  'game.html': ['entries', 'playthroughs', 'games', 'milestones', 'lists'],
  'genre.html': ['entries', 'playthroughs', 'games'],
  'goty.html': ['games'],
  'history.html': ['entries'],
  'metrics.html': ['entries', 'games', 'genres'],
  'milestones.html': ['milestones'],
  'monthly.html': ['entries', 'playthroughs', 'games', 'genres'],
  'partner.html': ['entries'],
  'patterns.html': ['entries'],
  'ratings.html': ['games'],
  'reach.html': ['entries', 'playthroughs', 'games', 'lists'],
  'releaseyear.html': ['entries', 'playthroughs', 'games'],
  'review.html': ['entries', 'playthroughs', 'milestones'],
  'spotlight.html': ['lists'],
  'systems.html': ['entries', 'playthroughs', 'games'],
  'timeline.html': ['entries', 'playthroughs'],
  'yearly.html': ['entries', 'playthroughs', 'games', 'genres']
};

// The function that draws each page. It lives in the page's own script file, loaded after this one.
const PAGE_INIT = {
  'index.html': () => initIndexPage(),
  'analysis.html': () => initAnalysisPage(),
  'card.html': () => initCardPage(),
  'checks.html': () => initChecksPage(),
  'compare.html': () => initComparePage(),
  'completions.html': () => initCompletionsPage(),
  'franchise.html': () => initFranchisePage(),
  'game.html': () => initGamePage(),
  'genre.html': () => initGenrePage(),
  'goty.html': () => initGotyPage(),
  'history.html': () => initHistoryPage(),
  'metrics.html': () => initMetricsPage(),
  'milestones.html': () => initMilestonesPage(),
  'monthly.html': () => initMonthlyPage(),
  'partner.html': () => initPartnerPage(),
  'patterns.html': () => initPatternsPage(),
  'ratings.html': () => initRatingsPage(),
  'reach.html': () => initReachPage(),
  'releaseyear.html': () => initReleaseYearPage(),
  'review.html': () => initReviewPage(),
  'spotlight.html': () => initSpotlightPage(),
  'systems.html': () => initSystemsPage(),
  'timeline.html': () => initTimelinePage(),
  'yearly.html': () => initYearlyPage()
};

// Downloads the named groups (once each) and adds them to rawData. core is always included.
const _dataLoads = {};
function loadData(groups) {
  if (!rawData) rawData = { metrics: {} };
  return Promise.all(['core', ...groups].map(group => {
    if (!_dataLoads[group]) {
      _dataLoads[group] = fetch(`data/${group}.json`, { cache: 'no-cache' })
        .then(response => {
          if (!response.ok) throw new Error(`Could not load data/${group}.json (${response.status})`);
          return response.text();
        })
        .then(text => {
          const part = JSON.parse(text, (key, value) => {
            if (value && typeof value === 'object' && value._dataType === 'Set') {
              return new Set(value.value || value.data || []);
            }
            return value;
          });
          const { metrics, ...rest } = part;
          Object.assign(rawData.metrics, metrics);
          Object.assign(rawData, rest);
        });
    }
    return _dataLoads[group];
  }));
}

// --- UPDATE: DASHBOARD INIT (Add routing and global parsing) ---
async function initDashboard() {
  try {
    // Route on the page's file name only, so a #tab or ?name= in the address can't pick the wrong page.
    // The site also answers to addresses without ".html" (yoshi.gg/monthly).
    let page = window.location.pathname.toLowerCase().split('/').pop() || 'index.html';
    if (!page.endsWith('.html')) page += '.html';
    if (!PAGE_INIT[page]) page = 'index.html';

    // 'no-cache' asks GitHub whether the file changed; it's only re-downloaded after a sync
    const [, metaResponse] = await Promise.all([
      loadData(PAGE_DATA[page] || DATA_GROUPS),
      fetch('metadata_data.json', { cache: 'no-cache' })
    ]);

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

    renderGlobalHeader();
    setupThemeToggle();
    setupHoverHistory();

    PAGE_INIT[page]();

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

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
    if (gameName && rawData.gameNames.includes(gameName)) window.location.href = gameProfileUrl(gameName);
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

      // Pages that don't show the log fetch it the first time a game name is hovered
      if (!rawData.allEntries) {
        const target = e.target;
        loadData(['entries']).then(() => {
          if (target.matches(':hover')) target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        }).catch(() => {});
        return;
      }

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

function milestoneItemHtml(m) {
  return `
  <div class="milestone-item">
    <div class="milestone-date">${formatShortDate(m.date)}/${new Date(m.date).getUTCFullYear()}</div>
    <div class="milestone-detail">${escapeHTML(m.details)}</div>
  </div>
  `;
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


// --- MULTIPLAYER PARTNERS ---
// The people with their own multiplayer lists, as set in the Apps Script config: [{ name, noteNames }]
function getPartners() { return rawData.partners || []; }
function isMultiplayerEntry(e) { return e.status === 'Multiplayer' || e.status === 'M-Completed'; }
// Multiplayer sessions whose note mentions the partner (any spelling in noteNames)
function partnerEntries(partner) {
  return rawData.allEntries.filter(e => isMultiplayerEntry(e) && partner.noteNames.some(n => (e.note || '').toUpperCase().includes(n)));
}

// --- SHARED SUMMARIES AND CHARTS ---
// Totals for any set of log entries (oldest first), used by the Compare, Partner and Year in Review pages
function summarizeEntries(entries) {
  const sum = {
    entries, seconds: 0, multiplayerSeconds: 0, sessions: entries.length, days: new Set(), games: new Map(), systems: new Map(),
    genres: new Map(), series: new Map(), byYear: {}, byMonth: {}, byWeekday: [0, 0, 0, 0, 0, 0, 0], longest: null,
    first: entries.length ? entries[0] : null, last: entries.length ? entries[entries.length - 1] : null
  };
  const add = (map, key, sec) => { if (key && key !== 'N/A' && key !== 'ZZNONE') map.set(key, (map.get(key) || 0) + sec); };
  entries.forEach(e => {
    const sec = timeStringToSeconds(e.time), day = e.date.slice(0, 10);
    sum.seconds += sec;
    if (isMultiplayerEntry(e)) sum.multiplayerSeconds += sec;
    sum.days.add(day);
    add(sum.games, e.game, sec); add(sum.systems, e.system, sec); add(sum.genres, e.genre, sec); add(sum.series, e.series, sec);
    sum.byYear[day.slice(0, 4)] = (sum.byYear[day.slice(0, 4)] || 0) + sec;
    sum.byMonth[day.slice(0, 7)] = (sum.byMonth[day.slice(0, 7)] || 0) + sec;
    sum.byWeekday[new Date(e.date).getUTCDay()] += sec;
    if (!sum.longest || sec > sum.longest.sec) sum.longest = { sec, entry: e };
  });
  return sum;
}
// Days since January 1 of the date's own year (0 for January 1), from a "YYYY-MM-DD..." string
function dayOfYear(date) {
  return Math.round((Date.parse(date.slice(0, 10)) - Date.parse(date.slice(0, 4) + '-01-01')) / 86400000);
}
// [[name, seconds], ...] from one of a summary's maps, longest first
function topOfMap(map, limit = 10) { return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit); }
// The longest run of back-to-back days in a set of "YYYY-MM-DD" days: { length, start, end }
function longestDayStreak(days) {
  let best = { length: 0, start: null, end: null }, run = null;
  [...days].sort().forEach(day => {
    const t = Date.parse(day + 'T12:00:00Z');
    run = run && Math.round((t - run.endTime) / 86400000) === 1 ? { ...run, length: run.length + 1, end: day, endTime: t } : { length: 1, start: day, end: day, endTime: t };
    if (run.length > best.length) best = run;
  });
  return best;
}
// A ranked list in the site's list-item style. rows: [{ title, sub, badge, game }]; game makes the title a profile link
function rankedListHtml(rows, emptyText = 'Nothing to show.') {
  if (rows.length === 0) return `<div class="loading-text">${emptyText}</div>`;
  return rows.map((row, i) => `
    <div class="list-item">
      <div class="item-info">
        <span class="item-rank">${row.rank !== undefined ? escapeHTML(String(row.rank)) : `#${i + 1}`}</span>
        <div class="item-text">
          <span class="item-title${row.game ? ' hover-trigger' : ''}"${row.game ? ` data-game="${escapeHTML(row.game)}"` : ''}>${escapeHTML(row.title)}</span>
          ${row.sub ? `<span class="item-sub">${escapeHTML(row.sub)}</span>` : ''}
        </div>
      </div>
      ${row.badge !== undefined ? `<div class="item-badge">${escapeHTML(String(row.badge))}</div>` : ''}
    </div>`).join('');
}
// Line chart. series: [{ label, color, points: [[x, y], ...], width, dashed, opacity }]; xTicks: [[x, label], ...]
// width is the drawing's own width: pass about 600 for a chart in a half-width card so its labels stay readable
function lineChartSvg(series, { xMin = 0, xMax, xTicks = [], yFormat = v => `${Math.round(v)}h`, width = 1000, height = 320 } = {}) {
  const padL = 60, padR = 20, padT = 16, padB = 34;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const yMax = Math.max(1, ...series.flatMap(s => s.points.map(p => p[1]))) * 1.05;
  const x = v => padL + ((v - xMin) / Math.max(1e-9, xMax - xMin)) * innerW;
  const y = v => padT + innerH - (v / yMax) * innerH;
  let svg = `<svg class="hub-chart" viewBox="0 0 ${width} ${height}">`;
  [0, 0.25, 0.5, 0.75, 1].forEach(f => {
    svg += `<line x1="${padL}" y1="${y(f * yMax)}" x2="${width - padR}" y2="${y(f * yMax)}" stroke="var(--border-table)" />`;
    svg += `<text x="${padL - 8}" y="${y(f * yMax) + 4}" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="var(--text-muted)" text-anchor="end">${yFormat(f * yMax)}</text>`;
  });
  xTicks.forEach(([v, label]) => {
    svg += `<text x="${x(v)}" y="${height - 10}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="var(--text-muted)" text-anchor="middle">${escapeHTML(String(label))}</text>`;
  });
  series.forEach(s => {
    if (s.points.length === 0) return;
    const path = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
    svg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" opacity="${s.opacity || 1}"${s.dashed ? ' stroke-dasharray="6 5"' : ''}><title>${escapeHTML(s.label)}: ${yFormat(s.points[s.points.length - 1][1])}</title></path>`;
  });
  return svg + `</svg>`;
}
function chartLegendHtml(items) {
  return `<div class="chart-legend">${items.map(i => `<span><i style="background: ${i.color};"></i>${escapeHTML(i.label)}</span>`).join('')}</div>`;
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

// Start once the page's other script files (listed after this one) have loaded
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboard);
else initDashboard();
