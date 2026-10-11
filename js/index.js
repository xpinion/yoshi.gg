// index.js - The Index page's own widgets. It also draws with timeframe.js, game.js, spotlight.js,
// metrics.js, analysis.js and history.js, which index.html loads too.

// --- INIT INDEX PAGE ---
function initIndexPage() {
  renderIndexGlance();
  renderNowPlaying();
  setupIndexTabs();
  setupDropdowns();
  setupLiveSearch();
  renderOnThisDay(); // Calls the generalized render function
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
// Data only one Index tab shows is downloaded the first time that tab opens, then its cards are drawn
const INDEX_TAB_DATA = {
  rankings: { groups: ['sessions'], cards: ['longest-session-list'], render: () => renderLongestSession(document.getElementById('year-select-session').value) },
  breakdowns: { groups: ['analysis'], cards: ['analysis-content'], render: () => renderAnalysis(document.getElementById('analysis-select').value, 'analysis-content') },
  history: { groups: ['milestones'], cards: ['milestones-list'], render: () => renderMilestones('milestones-list') },
  spotlight: { groups: ['lists'], cards: ['random-top25-content'], render: setupSpotlightDropdown }
};
function loadIndexTab(tab) {
  const extra = INDEX_TAB_DATA[tab];
  if (!extra || extra.requested) return;
  extra.requested = true;
  const setCards = html => extra.cards.forEach(id => { document.getElementById(id).innerHTML = html; });
  setCards('<div class="loading-text">Loading Data...</div>');
  loadData(extra.groups).then(extra.render).catch(error => {
    console.error("Dashboard Error:", error);
    extra.requested = false; // opening the tab again retries
    setCards(`<div class="loading-text" style="color: red;">${escapeHTML(error.message)}</div>`);
  });
}

function setupIndexTabs() {
  const buttons = [...document.querySelectorAll('.index-tabs button')];
  if (buttons.length === 0) return;
  const sections = [...document.querySelectorAll('section[data-tab]')];
  const valid = buttons.map(b => b.dataset.tab);
  const select = tab => {
    buttons.forEach(b => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-pressed', String(b.dataset.tab === tab)); });
    sections.forEach(sec => { sec.hidden = sec.dataset.tab !== tab; });
    loadIndexTab(tab);
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

// Backwards compatibility wrapper for index.html
function renderMonthlySummary(monthKey, containerId = 'monthly-summary-list') {
  renderTimeframeSummary(monthKey, 'monthly', containerId);
}

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
  if (!rawData.metrics.singleDaySessions) return; // drawn once the Rankings tab has loaded its data

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

// --- UPDATE: RENDER MILESTONES (Add Container ID parameter) ---
function renderMilestones(targetContainerId = 'milestones-list') {
  const container = document.getElementById(targetContainerId);
  if (!container || !rawData || !rawData.metrics || !rawData.metrics.milestones) return;

  const milestones = rawData.metrics.milestones.slice().sort((a,b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = milestones.map(milestoneItemHtml).join('');
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
