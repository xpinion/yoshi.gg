// app.js - Logic for Yoshi's Videogame Dashboard

// Global State
let rawData = null;
let metaScores = new Map();

// Constants for Metadata Columns (from your BTY script)
const META_GAME = 0;
const META_YOSCORE = 6;

// Utility: Format seconds into "XXh XXm" or "XXm"
function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds === 0) return "0m";
  const mins = Math.floor(totalSeconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

// Utility: Format date to "MM/DD"
function formatShortDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Utility: Escape HTML to prevent weird rendering issues
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// Initialization
async function initDashboard() {
  try {
    // Fetch both the new raw data and the metadata (for scores)
    const [rawResponse, metaResponse] = await Promise.all([
      fetch('raw_dashboard_data.json'),
      fetch('metadata_data.json')
    ]);

    rawData = await rawResponse.json();
    const metaData = await metaResponse.json();

    // Build a quick lookup map for your scores
    for (let i = 1; i < metaData.values.length; i++) {
      const row = metaData.values[i];
      if (row && row[META_GAME]) {
        metaScores.set(row[META_GAME], row[META_YOSCORE] || '-');
      }
    }

    setupDropdowns();
    
    // Initial Renders (Defaulting to current year)
    const currentYear = new Date().getFullYear().toString();
    document.getElementById('year-select-comp').value = currentYear;
    document.getElementById('year-select-played').value = currentYear;
    
    renderCompletions(currentYear);
    renderMostPlayed(currentYear);

    // TODO: Call other render functions as we build them
    // renderMostDays(currentYear);
    // renderLongestSession(currentYear);

  } catch (error) {
    console.error("Error loading dashboard data:", error);
    document.getElementById('completions-list').innerHTML = `<div class="loading-text" style="color: red;">Error loading data. Ensure raw_dashboard_data.json is pushed to GitHub!</div>`;
  }
}

// Populate the <select> dropdowns
function setupDropdowns() {
  if (!rawData || !rawData.metrics) return;

  // Extract all years from the yearlyGameStats keys
  const years = Object.keys(rawData.metrics.yearlyGameStats).sort().reverse();
  const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');

  const compSelect = document.getElementById('year-select-comp');
  const playedSelect = document.getElementById('year-select-played');

  if (compSelect) {
    compSelect.innerHTML = yearOptions;
    compSelect.addEventListener('change', (e) => renderCompletions(e.target.value));
  }

  if (playedSelect) {
    playedSelect.innerHTML = yearOptions;
    playedSelect.addEventListener('change', (e) => renderMostPlayed(e.target.value));
  }
}

// --- RENDER FUNCTIONS ---

// 1. Render Yoshi's Completions Card
function renderCompletions(year) {
  const container = document.getElementById('completions-list');
  if (!rawData || !rawData.playthroughHistory) return;

  // Filter for completed games in the selected year
  const completions = Object.values(rawData.playthroughHistory).filter(pt => {
    if (!['Completed', 'M-Completed'].includes(pt.finalStatus)) return false;
    const ptYear = new Date(pt.lastDate).getUTCFullYear().toString();
    return ptYear === year;
  });

  // Sort chronologically (oldest first) so we can assign the correct # rank for the year
  completions.sort((a, b) => new Date(a.lastDate) - new Date(b.lastDate));
  
  // Assign the completion number for the year, then reverse it so newest is at the top
  completions.forEach((c, index) => c.yearRank = index + 1);
  completions.reverse();

  if (completions.length === 0) {
    container.innerHTML = `<div class="loading-text">No completions logged for ${year}.</div>`;
    return;
  }

  // Generate the HTML
  container.innerHTML = completions.map(pt => {
    const score = metaScores.get(pt.gameName) || '-';
    // Hide the badge if there is no score
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

// 2. Render Most Played Card
function renderMostPlayed(year) {
  const container = document.getElementById('most-played-list');
  if (!rawData || !rawData.metrics || !rawData.metrics.yearlyGameStats[year]) {
    container.innerHTML = `<div class="loading-text">No playtime logged for ${year}.</div>`;
    return;
  }

  const yearStats = rawData.metrics.yearlyGameStats[year];
  
  // Convert object to array and sort by totalSeconds
  const sortedGames = Object.entries(yearStats)
    .map(([gameName, stats]) => ({
      name: gameName,
      seconds: stats.totalSeconds,
      systems: Array.isArray(stats.systems) ? stats.systems : Array.from(stats.systems.data || [])
    }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 25); // Top 25 limit to match mockups

  // Generate the HTML
  container.innerHTML = sortedGames.map((game, index) => {
    return `
      <div class="list-item">
        <div class="item-info">
          <span class="item-rank">#${index + 1}</span>
          <div class="item-text">
            <span class="item-title">${escapeHTML(game.name)}</span>
          </div>
        </div>
        <div class="item-badge">${formatTime(game.seconds)}</div>
      </div>
    `;
  }).join('');
}

// Fire it up!
initDashboard();
