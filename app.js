// app.js - Logic for Yoshi's Videogame Dashboard

// Global State
let rawData = null;
let metaGames = [];
let metaScores = new Map();

// Constants for Metadata Columns
const META_GAME = 0;
const META_RELEASE_YEAR = 1;
const META_GENRE = 2;
const META_SERIES = 5;
const META_YOSCORE = 6;

// Utility: Format seconds into "XXh XXm" or "XXm"
function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds === 0) return "0m";
  const mins = Math.floor(totalSeconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

// Utility: Format date to "MM/DD" (Using UTC to prevent timezone shifts)
function formatShortDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Utility: Escape HTML
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// Initialization
async function initDashboard() {
  try {
    const [rawResponse, metaResponse] = await Promise.all([
      fetch('raw_dashboard_data.json'),
      fetch('metadata_data.json')
    ]);

    rawData = await rawResponse.json();
    const metaData = await metaResponse.json();

    // Build Metadata Lookups
    for (let i = 1; i < metaData.values.length; i++) {
      const row = metaData.values[i];
      if (row && row[META_GAME]) {
        const score = parseFloat(row[META_YOSCORE]);
        metaGames.push({
          name: row[META_GAME],
          releaseYear: row[META_RELEASE_YEAR] || 'Unknown',
          genre: row[META_GENRE] || 'Unknown',
          franchise: row[META_SERIES] || 'Unknown',
          score: isNaN(score) ? null : score
        });
        metaScores.set(row[META_GAME], isNaN(score) ? '-' : score);
      }
    }

    setupDropdowns();
    
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    document.querySelectorAll('.card-content').forEach(el => {
      el.innerHTML = `<div class="loading-text" style="color: red;">Error loading data.</div>`;
    });
  }
}

// Populate the <select> dropdowns and trigger initial renders
function setupDropdowns() {
  if (!rawData || !rawData.metrics) return;

  const currentYear = new Date().getFullYear().toString();

  // 1. Month Dropdown
  const monthKeys = Object.keys(rawData.metrics.monthlyStats).sort().reverse();
  const monthSelect = document.getElementById('month-select');
  if (monthSelect && monthKeys.length > 0) {
    monthSelect.innerHTML = monthKeys.map(m => `<option value="${m}">${m}</option>`).join('');
    monthSelect.value = monthKeys[0]; // Default to most recent
    monthSelect.addEventListener('change', (e) => renderMonthlySummary(e.target.value));
    renderMonthlySummary(monthKeys[0]);
  }

  // 2. Year Dropdowns (For The Big Four)
  const years = Object.keys(rawData.metrics.yearlyGameStats).sort().reverse();
  const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');
  
  const compSelect = document.getElementById('year-select-comp');
  const playedSelect = document.getElementById('year-select-played');

  if (compSelect) {
    compSelect.innerHTML = yearOptions;
    compSelect.value = currentYear;
    compSelect.addEventListener('change', (e) => renderCompletions(e.target.value));
    renderCompletions(currentYear);
  }

  if (playedSelect) {
    playedSelect.innerHTML = yearOptions;
    playedSelect.value = currentYear;
    playedSelect.addEventListener('change', (e) => {
      renderMostPlayed(e.target.value);
      renderMostDays(e.target.value);
      renderLongestSession(e.target.value);
    });
    renderMostPlayed(currentYear);
    renderMostDays(currentYear);
    renderLongestSession(currentYear);
  }

  // 3. Rankings Dropdowns
  const releaseYears = [...new Set(metaGames.map(g => g.releaseYear))].filter(y => y !== 'Unknown').sort().reverse();
  const franchises = [...new Set(metaGames.map(g => g.franchise))].filter(f => f !== 'Unknown' && f !== 'ZZNONE').sort();
  const genres = [...new Set(metaGames.map(g => g.genre))].filter(g => g !== 'Unknown').sort();

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
    const randomFranchise = franchises[Math.floor(Math.random() * franchises.length)];
    franchiseSelect.value = randomFranchise;
    franchiseSelect.addEventListener('change', (e) => renderRankings('franchise', e.target.value, 'franchise-list', 100));
    renderRankings('franchise', randomFranchise, 'franchise-list', 100);
  }

  const genreSelect = document.getElementById('genre-select');
  if (genreSelect) {
    genreSelect.innerHTML = genres.map(g => `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('');
    const randomGenre = genres[Math.floor(Math.random() * genres.length)];
    genreSelect.value = randomGenre;
    genreSelect.addEventListener('change', (e) => renderRankings('genre', e.target.value, 'genre-list', 100));
    renderRankings('genre', randomGenre, 'genre-list', 100);
  }
}

// --- RENDER FUNCTIONS ---

// Monthly Summary
function renderMonthlySummary(monthKey) {
  const container = document.getElementById('monthly-summary-list');
  const monthStats = rawData.metrics.monthlyStats[monthKey];
  
  if (!monthStats) {
    container.innerHTML = `<div class="loading-text">No data for this month.</div>`;
    return;
  }

  const sortedGames = Object.entries(monthStats)
    .map(([name, stats]) => ({ name, seconds: stats.totalSeconds }))
    .sort((a, b) => b.seconds - a.seconds);

  container.innerHTML = sortedGames.map((game, index) => `
    <div class="list-item">
      <div class="item-info">
        <span class="item-rank">#${index + 1}</span>
        <div class="item-text">
          <span class="item-title">${escapeHTML(game.name)}</span>
        </div>
      </div>
      <div class="item-badge">${formatTime(game.seconds)}</div>
    </div>
  `).join('');
}

// Completions (With Exact Spreadsheet Tie-Breaker Fix)
function renderCompletions(year) {
  const container = document.getElementById('completions-list');

  const completions = Object.values(rawData.playthroughHistory).filter(pt => {
    if (!['Completed', 'M-Completed'].includes(pt.finalStatus)) return false;
    return new Date(pt.lastDate).getUTCFullYear().toString() === year;
  });

  // THE FIX: Find the exact Entry Number from allEntries for perfect tie-breaking
  completions.forEach(pt => {
    const finalEntry = rawData.allEntries.slice().reverse().find(e => e.ptTag === pt.ptTag && e.status === pt.finalStatus);
    pt.entryNum = finalEntry ? Number(finalEntry.entryNum) : 0;
  });

  completions.sort((a, b) => {
    const dateDiff = new Date(a.lastDate).getTime() - new Date(b.lastDate).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.entryNum - b.entryNum; // Exact spreadsheet order!
  });
  
  completions.forEach((c, index) => c.yearRank = index + 1);
  completions.reverse(); // Newest at the top

  if (completions.length === 0) {
    container.innerHTML = `<div class="loading-text">No completions logged for ${year}.</div>`;
    return;
  }

  container.innerHTML = completions.map(pt => {
    const score = metaScores.get(pt.gameName) || '-';
    const badgeHTML = score !== '-' ? `<div class="item-badge">${score}</div>` : `<div class="item-badge" style="background: #eee; color: #888;">-</div>`;

    return `
      <div class="list-item">
        <div class="item-info">
          <span class="item-date">${formatShortDate(pt.lastDate)}</span>
          <div class="item-text">
            <span class="item-title">${escapeHTML(pt.gameName)} (${escapeHTML(pt.system)})</span>
            <span class="item-sub">(#${pt.yearRank})</span>
          </div>
        </div>
        ${badgeHTML}
      </div>
    `;
  }).join('');
}

// Most Played Time
function renderMostPlayed(year) {
  const container = document.getElementById('most-played-list');
  const yearStats = rawData.metrics.yearlyGameStats[year];
  
  if (!yearStats) { container.innerHTML = `<div class="loading-text">No playtime logged.</div>`; return; }

  const sortedGames = Object.entries(yearStats)
    .map(([name, stats]) => ({ name, seconds: stats.totalSeconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 25);

  container.innerHTML = sortedGames.map((game, index) => `
    <div class="list-item">
      <div class="item-info"><span class="item-rank">#${index + 1}</span><div class="item-text"><span class="item-title">${escapeHTML(game.name)}</span></div></div>
      <div class="item-badge">${formatTime(game.seconds)}</div>
    </div>
  `).join('');
}

// Most Days Played
function renderMostDays(year) {
  const container = document.getElementById('most-days-list');
  const yearStats = rawData.metrics.yearlyGameStats[year];
  
  if (!yearStats) { container.innerHTML = `<div class="loading-text">No playtime logged.</div>`; return; }

  const sortedDays = Object.entries(yearStats)
    .map(([name, stats]) => {
      // Handles standard Arrays or the custom { data: [] } Set export
      const dayCount = Array.isArray(stats.days) ? stats.days.length : (stats.days.data ? stats.days.data.length : 0);
      return { name, days: dayCount };
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, 25);

  container.innerHTML = sortedDays.map((game, index) => `
    <div class="list-item">
      <div class="item-info"><span class="item-rank">#${index + 1}</span><div class="item-text"><span class="item-title">${escapeHTML(game.name)}</span></div></div>
      <div class="item-badge">${game.days} Days</div>
    </div>
  `).join('');
}

// Longest Single Session
function renderLongestSession(year) {
  const container = document.getElementById('longest-session-list');
  const sessions = rawData.metrics.singleDaySessions.filter(s => new Date(s.date).getUTCFullYear().toString() === year);
  
  if (sessions.length === 0) { container.innerHTML = `<div class="loading-text">No sessions logged.</div>`; return; }

  const sortedSessions = sessions.sort((a, b) => b.time - a.time).slice(0, 25);

  container.innerHTML = sortedSessions.map((s, index) => `
    <div class="list-item">
      <div class="item-info">
        <span class="item-rank">#${index + 1}</span>
        <div class="item-text">
          <span class="item-title">${escapeHTML(s.game)}</span>
          <span class="item-sub">on ${formatShortDate(s.date)}</span>
        </div>
      </div>
      <div class="item-badge">${formatTime(s.time)}</div>
    </div>
  `).join('');
}

// Generic Rankings Renderer (Top 100, Franchise, Genre)
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

  if (filtered.length === 0) {
    container.innerHTML = `<div class="loading-text">No rated games found.</div>`;
    return;
  }

  let actualPosition = 1;
  let lastScore = -1;

  container.innerHTML = filtered.map(game => {
    let rankText = game.score !== lastScore ? `#${actualPosition}` : '';
    lastScore = game.score;
    actualPosition++;

    // Format score beautifully (e.g. "9" instead of "9.0")
    const displayScore = Number.isInteger(game.score) ? game.score : game.score.toFixed(1);

    return `
      <div class="list-item">
        <div class="item-info">
          <span class="item-rank">${rankText}</span>
          <div class="item-text">
            <span class="item-title">${escapeHTML(game.name)}</span>
          </div>
        </div>
        <div class="item-badge">${displayScore}</div>
      </div>
    `;
  }).join('');
}

initDashboard();
