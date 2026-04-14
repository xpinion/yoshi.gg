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
    case 'Completed': case 'M-Completed': return '#00FF00';
    case 'Active': return '#FFFF00';
    case 'Multiplayer': return '#00FFFF';
    case 'Abandoned': return '#FFCCCC';
    case 'Postgame': return '#FFA500';
    case 'Non-Completable': return '#DDDDDD';
    default: return '#FFFFFF';
  }
}
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// Initialization
async function initDashboard() {
  try {
    const [rawResponse, metaResponse, top25Response] = await Promise.all([
      fetch('raw_dashboard_data.json'),
      fetch('metadata_data.json'),
      fetch('top25_data.json')
    ]);

    rawData = await rawResponse.json();
    const metaData = await metaResponse.json();
    const top25Data = await top25Response.json();

    for (let i = 1; i < metaData.values.length; i++) {
      const row = metaData.values[i];
      if (row && row[META_GAME]) {
        const score = parseFloat(row[META_YOSCORE]);
        metaGames.push({
          name: row[META_GAME], releaseYear: row[META_RELEASE_YEAR] || 'Unknown',
          genre: row[META_GENRE] || 'Unknown', franchise: row[META_SERIES] || 'Unknown',
          score: isNaN(score) ? null : score
        });
        metaScores.set(row[META_GAME], isNaN(score) ? '-' : score);
      }
    }

    parseTop25Data(top25Data.values);
    setupDropdowns();
    setupHoverHistory();
    renderOnThisDay();
    renderMilestones();
    renderAnalysis('playthrough');
    renderHeatmap('days');
    
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    document.querySelectorAll('.card-content').forEach(el => el.innerHTML = `<div class="loading-text" style="color: red;">Error loading data.</div>`);
  }
}

function parseTop25Data(rows) {
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];
    if (!row) continue;
    if (row[0] && row[1] === "" && row[6]) {
      let titleLeft = row[0], titleRight = row[6];
      let headersLeft = rows[i+1].slice(0, 5), headersRight = rows[i+1].slice(6, 11);
      let dataLeft = [], dataRight = [];
      let j = i + 2;
      while (j < rows.length) {
        let dataRow = rows[j];
        let leftHasData = dataRow.slice(0, 5).some(c => c && c.trim() !== "");
        let rightHasData = dataRow.slice(6, 11).some(c => c && c.trim() !== "");
        if (!leftHasData && !rightHasData) break;
        if (leftHasData) dataLeft.push(dataRow.slice(0, 5));
        if (rightHasData) dataRight.push(dataRow.slice(6, 11));
        j++;
      }
      if (dataLeft.length > 0) allTop25Tables.push({ title: titleLeft, headers: headersLeft, rows: dataLeft });
      if (dataRight.length > 0) allTop25Tables.push({ title: titleRight, headers: headersRight, rows: dataRight });
      i = j - 1;
    }
  }
  
  const select = document.getElementById('random-top25-select');
  if(select && allTop25Tables.length > 0) {
     select.innerHTML = allTop25Tables.map(t => `<option value="${escapeHTML(t.title)}">${escapeHTML(t.title)}</option>`).join('');
     const randomIdx = Math.floor(Math.random() * allTop25Tables.length);
     select.value = allTop25Tables[randomIdx].title;
     select.addEventListener('change', renderRandomTop25);
     renderRandomTop25();
  }
}

function setupDropdowns() {
  if (!rawData || !rawData.metrics) return;
  const currentYear = new Date().getFullYear().toString();

  const monthKeys = Object.keys(rawData.metrics.monthlyStats).sort().reverse();
  const monthSelect = document.getElementById('month-select');
  if (monthSelect && monthKeys.length > 0) {
    monthSelect.innerHTML = monthKeys.map(m => `<option value="${m}">${m}</option>`).join('');
    monthSelect.value = monthKeys[0];
    monthSelect.addEventListener('change', (e) => renderMonthlySummary(e.target.value));
    renderMonthlySummary(monthKeys[0]);
  }

  const years = Object.keys(rawData.metrics.yearlyGameStats).sort().reverse();
  const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');
  
  const compSelect = document.getElementById('year-select-comp');
  if (compSelect) {
    compSelect.innerHTML = yearOptions; compSelect.value = currentYear;
    compSelect.addEventListener('change', (e) => renderCompletions(e.target.value));
    renderCompletions(currentYear);
  }

  const playedSelect = document.getElementById('year-select-played');
  if (playedSelect) {
    playedSelect.innerHTML = yearOptions; playedSelect.value = currentYear;
    playedSelect.addEventListener('change', (e) => {
      renderMostPlayed(e.target.value); renderMostDays(e.target.value); renderLongestSession(e.target.value);
    });
    renderMostPlayed(currentYear); renderMostDays(currentYear); renderLongestSession(currentYear);
  }

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
  // 4. Analysis Dropdown
  const analysisSelect = document.getElementById('analysis-select');
  if (analysisSelect) {
    analysisSelect.addEventListener('change', (e) => renderAnalysis(e.target.value));
  }

  // 5. Heatmap Dropdown
  const heatmapSelect = document.getElementById('heatmap-select');
  if (heatmapSelect) {
    heatmapSelect.addEventListener('change', (e) => renderHeatmap(e.target.value));
  }
}

function setupHoverHistory() {
  const tooltip = document.getElementById('game-tooltip');
  
  document.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('hover-trigger')) {
      const gameName = e.target.getAttribute('data-game');
      if (!gameName) return;
      
      const entries = rawData.allEntries.filter(entry => entry.game === gameName).slice().reverse().slice(0, 15);
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

      const rect = e.target.getBoundingClientRect();
      let top = rect.bottom + window.scrollY + 10;
      let left = rect.left + window.scrollX;
      if (left + 350 > window.innerWidth) left = window.innerWidth - 370;
      
      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (e.target.classList.contains('hover-trigger')) {
      tooltip.classList.remove('visible');
    }
  });
}

// --- RENDER FUNCTIONS ---

function renderMonthlySummary(monthKey) {
  const container = document.getElementById('monthly-summary-list');
  if (!rawData || !rawData.allEntries) return;

  const monthEntries = rawData.allEntries.filter(e => e.date.startsWith(monthKey));
  if (monthEntries.length === 0) { container.innerHTML = `<div class="loading-text">No data for ${monthKey}.</div>`; return; }

  const monthData = { games: {}, allEntryDays: new Set() };
  let totalSecondsInMonth = 0;

  monthEntries.forEach(entry => {
    const timeSec = timeStringToSeconds(entry.time);
    totalSecondsInMonth += timeSec;
    monthData.allEntryDays.add(entry.date.split('T')[0]);

    if (!monthData.games[entry.game]) {
      monthData.games[entry.game] = { name: entry.game, totalSeconds: 0, latestGameLifetime: entry.gameLifetime, latestGameLifetimeDays: entry.gameLifetimeDays, activePlaythroughs: {} };
    }
    const g = monthData.games[entry.game];
    g.totalSeconds += timeSec; g.latestGameLifetime = entry.gameLifetime; g.latestGameLifetimeDays = entry.gameLifetimeDays;

    if (!g.activePlaythroughs[entry.ptTag]) {
      g.activePlaythroughs[entry.ptTag] = { timeframeTime: 0, timeframeDays: new Set(), timeframeSystems: new Set(), lastDate: entry.date, lastStatus: entry.status, lastPtLifetime: entry.ptLifetime, lastPtLifetimeDays: entry.ptLifetimeDays, latestNote: entry.note };
    }
    const pt = g.activePlaythroughs[entry.ptTag];
    pt.timeframeTime += timeSec; pt.timeframeDays.add(entry.date.split('T')[0]); pt.timeframeSystems.add(entry.system);
    if (entry.date >= pt.lastDate) { pt.lastDate = entry.date; pt.lastStatus = entry.status; pt.lastPtLifetime = entry.ptLifetime; pt.lastPtLifetimeDays = entry.ptLifetimeDays; pt.latestNote = entry.note; }
  });

  const sortedGames = Object.values(monthData.games).sort((a, b) => b.totalSeconds - a.totalSeconds);

  let html = `<div class="monthly-table-wrapper"><table class="monthly-table"><thead>
    <tr><th rowspan="2">Videogame</th><th rowspan="2">System</th><th colspan="2">Active Month</th><th colspan="2">Playthrough Lifetime</th><th colspan="2">Game Lifetime</th><th rowspan="2">Date Started</th><th rowspan="2">Last Updated</th><th rowspan="2">Game Status</th><th rowspan="2">Playthrough Details</th></tr>
    <tr><th>Time</th><th>Days</th><th>Time</th><th>Days</th><th>Time</th><th>Days</th></tr>
    </thead><tbody>`;

  sortedGames.forEach(game => {
    const activeTags = Object.keys(game.activePlaythroughs);
    activeTags.forEach(ptTag => {
      const ptLocal = game.activePlaythroughs[ptTag]; const ptHistory = rawData.playthroughHistory[ptTag];
      const sysStr = Array.from(ptLocal.timeframeSystems).join(', '); const bgColor = getStatusColor(ptHistory.finalStatus);
      html += `<tr class="active-row"><td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span></td><td class="text-center">${escapeHTML(sysStr)}</td><td class="text-center">${formatHHMM(ptLocal.timeframeTime)}</td><td class="text-center">${ptLocal.timeframeDays.size}</td><td class="text-center">${ptLocal.lastPtLifetime}</td><td class="text-center">${ptLocal.lastPtLifetimeDays}</td><td class="text-center">${game.latestGameLifetime}</td><td class="text-center">${game.latestGameLifetimeDays}</td><td class="text-center">${formatFullDate(ptHistory.startDate)}</td><td class="text-center">${formatFullDate(ptLocal.lastDate)}</td><td class="text-center status-cell" style="background-color: ${bgColor};">${ptLocal.lastStatus}</td><td class="text-left">${escapeHTML(ptLocal.latestNote)}</td></tr>`;
    });
    const allGamePlaythroughs = Object.keys(rawData.playthroughHistory).filter(tag => rawData.playthroughHistory[tag].gameName === game.name);
    allGamePlaythroughs.forEach(oldTag => {
      if (!activeTags.includes(oldTag)) {
        const oldPt = rawData.playthroughHistory[oldTag]; const bgColor = getStatusColor(oldPt.finalStatus);
        html += `<tr class="inactive-row"><td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span></td><td class="text-center">${escapeHTML(oldPt.system)}</td><td class="text-center">00:00</td><td class="text-center">0</td><td class="text-center">${oldPt.finalPtLifetime}</td><td class="text-center">${oldPt.finalPtLifetimeDays}</td><td class="text-center">${game.latestGameLifetime}</td><td class="text-center">${game.latestGameLifetimeDays}</td><td class="text-center">${formatFullDate(oldPt.startDate)}</td><td class="text-center">${formatFullDate(oldPt.lastDate)}</td><td class="text-center status-cell" style="background-color: ${bgColor};">${oldPt.finalStatus}</td><td class="text-left">${escapeHTML(oldPt.finalNote)}</td></tr>`;
      }
    });
  });

  const [yearStr, monthStr] = monthKey.split('-');
  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  html += `<tr class="grand-total-row"><td colspan="2" class="text-left">Grand Total</td><td class="text-center">${formatHHMM(totalSecondsInMonth)}</td><td class="text-center">'${monthData.allEntryDays.size}/${daysInMonth}</td><td colspan="8"></td></tr></tbody></table></div>`;
  container.innerHTML = html;
}

function renderCompletions(year) {
  const container = document.getElementById('completions-list');
  const completions = Object.values(rawData.playthroughHistory).filter(pt => {
    if (!['Completed', 'M-Completed'].includes(pt.finalStatus)) return false;
    return new Date(pt.lastDate).getUTCFullYear().toString() === year;
  });

  completions.forEach(pt => {
    const finalEntry = rawData.allEntries.slice().reverse().find(e => e.ptTag === pt.ptTag && e.status === pt.finalStatus);
    pt.entryNum = finalEntry ? Number(finalEntry.entryNum) : 0;
  });

  completions.sort((a, b) => {
    const dateDiff = new Date(a.lastDate).getTime() - new Date(b.lastDate).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.entryNum - b.entryNum;
  });
  
  completions.forEach((c, index) => c.yearRank = index + 1);
  completions.reverse();

  if (completions.length === 0) { container.innerHTML = `<div class="loading-text">No completions logged for ${year}.</div>`; return; }

  container.innerHTML = completions.map(pt => {
    const score = metaScores.get(pt.gameName) || '-';
    const badgeHTML = score !== '-' ? `<div class="item-badge">${score}</div>` : `<div class="item-badge" style="background: #eee; color: #888;">-</div>`;
    return `<div class="list-item"><div class="item-info"><span class="item-date">${formatShortDate(pt.lastDate)}</span><div class="item-text"><span class="item-title hover-trigger" data-game="${escapeHTML(pt.gameName)}">${escapeHTML(pt.gameName)} (${escapeHTML(pt.system)})</span><span class="item-sub">(#${pt.yearRank})</span></div></div>${badgeHTML}</div>`;
  }).join('');
}

// Most Played Time
function renderMostPlayed(year) {
  const container = document.getElementById('most-played-list');
  const yearStats = rawData.metrics.yearlyGameStats[year];
  if (!yearStats) { container.innerHTML = `<div class="loading-text">No playtime logged.</div>`; return; }

  const sortedGames = Object.entries(yearStats).map(([name, stats]) => {
    // Parse out the systems array
    const sysStr = Array.isArray(stats.systems) ? stats.systems.join(', ') : (stats.systems && stats.systems.data ? stats.systems.data.join(', ') : '');
    return { name, seconds: stats.totalSeconds, systems: sysStr };
  }).sort((a, b) => b.seconds - a.seconds).slice(0, 25);

  container.innerHTML = sortedGames.map((game, index) => `
    <div class="list-item">
      <div class="item-info">
        <span class="item-rank">#${index + 1}</span>
        <div class="item-text">
          <span class="item-title hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}${game.systems ? ` (${escapeHTML(game.systems)})` : ''}</span>
        </div>
      </div>
      <div class="item-badge">${formatTime(game.seconds)}</div>
    </div>
  `).join('');
}

// Most Days Played
function renderMostDays(year) {
  const container = document.getElementById('most-days-list');
  const yearStats = rawData.metrics.yearlyGameStats[year];
  if (!yearStats) { container.innerHTML = `<div class="loading-text">No playtime logged.</div>`; return; }

  const sortedDays = Object.entries(yearStats).map(([name, stats]) => {
    const dayCount = Array.isArray(stats.days) ? stats.days.length : (stats.days && stats.days.data ? stats.days.data.length : 0);
    const sysStr = Array.isArray(stats.systems) ? stats.systems.join(', ') : (stats.systems && stats.systems.data ? stats.systems.data.join(', ') : '');
    return { name, days: dayCount, systems: sysStr };
  }).sort((a, b) => b.days - a.days).slice(0, 25);

  container.innerHTML = sortedDays.map((game, index) => `
    <div class="list-item">
      <div class="item-info">
        <span class="item-rank">#${index + 1}</span>
        <div class="item-text">
          <span class="item-title hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}${game.systems ? ` (${escapeHTML(game.systems)})` : ''}</span>
        </div>
      </div>
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
          <span class="item-title hover-trigger" data-game="${escapeHTML(s.game)}">${escapeHTML(s.game)}${s.system ? ` (${escapeHTML(s.system)})` : ''}</span>
          <span class="item-sub">on ${formatShortDate(s.date)}</span>
        </div>
      </div>
      <div class="item-badge">${formatTime(s.time)}</div>
    </div>
  `).join('');
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
    return `<div class="list-item"><div class="item-info"><span class="item-rank">${rankText}</span><div class="item-text"><span class="item-title hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span></div></div><div class="item-badge">${displayScore}</div></div>`;
  }).join('');
}

function renderOnThisDay() {
  const container = document.getElementById('on-this-day-list');
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11
  const currentDay = today.getDate(); // 1-31
  
  document.getElementById('today-date').innerText = `${String(currentMonth + 1).padStart(2, '0')}/${String(currentDay).padStart(2, '0')}`;

  const historyEntries = rawData.allEntries.filter(e => {
    const d = new Date(e.date);
    return d.getUTCMonth() === currentMonth && d.getUTCDate() === currentDay;
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

function renderRandomTop25() {
  const selectedTitle = document.getElementById('random-top25-select').value;
  const tableObj = allTop25Tables.find(t => t.title === selectedTitle);
  if (!tableObj) return;

  document.getElementById('random-top25-content').innerHTML = `
    <table class="top25-table">
      <thead><tr>${tableObj.headers.map(h => `<th>${escapeHTML(h)}</th>`).join('')}</tr></thead>
      <tbody>
        ${tableObj.rows.map(r => `<tr>${r.map((c, idx) => {
           // We don't know exactly which column holds the game name, 
           // but adding hover-triggers to all cells is safe. The listener ignores empty data-game tags.
           return `<td><span class="hover-trigger" data-game="${escapeHTML(c)}">${escapeHTML(c)}</span></td>`;
        }).join('')}</tr>`).join('')}
      </tbody>
    </table>`;
}

// --- ANALYSIS TABLES ---
function renderAnalysis(type) {
  const container = document.getElementById('analysis-content');
  if (!rawData || !rawData.metrics) return;

  let html = `<div style="overflow-x: auto;"><table class="analysis-table"><thead><tr>`;
  
  if (type === 'playthrough') {
    const data = rawData.metrics.playthroughAnalysis;
    const timeframes = Object.keys(data).sort((a, b) => a === 'All-Time' ? -1 : b === 'All-Time' ? 1 : b - a);
    
    html += `<th>Timeframe</th><th>Total PTs</th><th># Completed</th><th># Abandoned</th><th># Active</th><th>Comp Rate</th><th># Multiplayer</th><th># Non-Comp</th><th>Avg Time</th><th>Avg Days</th></tr></thead><tbody>`;
    
    timeframes.forEach(key => {
      const s = data[key];
      const completions = s.completed + s.postgame;
      html += `<tr class="${key === 'All-Time' ? 'all-time-row' : ''}">
        <td class="text-left">${key}</td><td>${s.totalPlaythroughs}</td><td>${completions}</td><td>${s.abandoned}</td><td>${s.active}</td>
        <td>${(s.completionRate * 100).toFixed(1)}%</td><td>${s.multiplayer}</td><td>${s.nonCompletable}</td>
        <td>${formatHHMM(s.avgCompletionTimeSeconds)}</td><td>${s.avgCompletionDays.toFixed(1)}</td>
      </tr>`;
    });
  } 
  else if (type === 'dayOfWeek') {
    const data = rawData.metrics.dayOfWeekStats;
    const timeframes = Object.keys(data).sort((a, b) => a === 'All-Time' ? -1 : b === 'All-Time' ? 1 : b.localeCompare(a));
    const dowObj = { 1:'Mon', 2:'Tue', 3:'Wed', 4:'Thu', 5:'Fri', 6:'Sat', 0:'Sun' };
    
    html += `<th>Timeframe</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr></thead><tbody>`;
    
    timeframes.forEach(key => {
      const s = data[key];
      html += `<tr class="${key === 'All-Time' ? 'all-time-row' : ''}">
        <td class="text-left">${key}</td>
        ${[1,2,3,4,5,6,0].map(day => `<td>${formatHHMM(s[day] || 0)}</td>`).join('')}
      </tr>`;
    });
  } 
  else {
    // Meta tables (Genre, Year, Dev, Pub)
    const map = { genre: 'genreAnalysis', releaseYear: 'releaseYearAnalysis', developer: 'developerAnalysis', publisher: 'publisherAnalysis' };
    const dataKey = map[type];
    const data = rawData.metrics[dataKey];
    const nameKey = type;
    
    let sortedData = Object.values(data).filter(item => item[nameKey] !== "N/A");
    if (type === 'releaseYear') sortedData.sort((a,b) => b[nameKey] - a[nameKey]);
    else sortedData.sort((a,b) => b.totalPlaythroughs - a.totalPlaythroughs);

    html += `<th>${type.charAt(0).toUpperCase() + type.slice(1)}</th><th>Total PTs</th><th># Completed</th><th># Abandoned</th><th># Active</th><th>Comp Rate</th><th># Multiplayer</th><th># Non-Comp</th><th>Avg Time</th><th>Avg Days</th></tr></thead><tbody>`;
    
    sortedData.forEach(s => {
      const completions = s.completed + s.postgame;
      html += `<tr>
        <td class="text-left">${escapeHTML(s[nameKey])}</td><td>${s.totalPlaythroughs}</td><td>${completions}</td><td>${s.abandoned}</td><td>${s.active}</td>
        <td>${(s.completionRate * 100).toFixed(1)}%</td><td>${s.multiplayer}</td><td>${s.nonCompletable}</td>
        <td>${formatHHMM(s.avgCompletionTimeSeconds)}</td><td>${s.avgCompletionDays.toFixed(1)}</td>
      </tr>`;
    });
  }
  
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// --- MILESTONES ---
function renderMilestones() {
  const container = document.getElementById('milestones-list');
  if (!rawData || !rawData.metrics || !rawData.metrics.milestones) return;
  
  const milestones = rawData.metrics.milestones.slice().sort((a,b) => new Date(b.date) - new Date(a.date));
  
  container.innerHTML = milestones.map(m => `
    <div class="milestone-item">
      <div class="milestone-date">${formatShortDate(m.date)}/${new Date(m.date).getUTCFullYear()}</div>
      <div class="milestone-detail">${escapeHTML(m.details)}</div>
    </div>
  `).join('');
}

// --- CALENDAR HEATMAP ---
function renderHeatmap(mode) {
  const container = document.getElementById('heatmap-content');
  if (!rawData || !rawData.metrics || !rawData.metrics.calendarData) return;

  const calData = rawData.metrics.calendarData;
  const possible = rawData.metrics.possibleYears;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  // Find max time for log scaling
  let maxTime = 0;
  if (mode === 'time') {
    for (let m=0; m<12; m++) {
      for (let d=1; d<=31; d++) {
        if (calData[m][d].totalSeconds > maxTime) maxTime = calData[m][d].totalSeconds;
      }
    }
  }
  const logMax = Math.log(maxTime > 0 ? maxTime : 1);

  let html = `<table class="heatmap-table"><thead><tr><th></th>`;
  for (let i = 1; i <= 31; i++) html += `<th>${i}</th>`;
  html += `</tr></thead><tbody>`;

  for (let m = 0; m < 12; m++) {
    html += `<tr><th style="text-align: right; padding-right: 10px;">${monthNames[m]}</th>`;
    const daysInBaseYear = new Date(2023, m + 1, 0).getDate(); // Base non-leap year

    for (let d = 1; d <= 31; d++) {
      if (d > daysInBaseYear && !(m === 1 && d === 29)) {
        html += `<td class="heatmap-empty"></td>`;
        continue;
      }

      const dayData = calData[m][d];
      const poss = possible[m][d];
      // Safely extract Set data (handles normal arrays or {data: []} formats)
      const playedCount = dayData.yearsPlayed ? (Array.isArray(dayData.yearsPlayed) ? dayData.yearsPlayed.length : (dayData.yearsPlayed.data ? dayData.yearsPlayed.data.length : 0)) : 0;
      const timeSec = dayData.totalSeconds;

      let bgColor = '#f7f7f7';
      let titleText = `${monthNames[m]} ${d}`;
      let innerText = '';

      if (mode === 'days') {
        if (poss > 0) {
          if (playedCount > 0 && playedCount === poss) bgColor = '#7CFC00'; // Perfect
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
          const ratio = Math.log(timeSec) / logMax;
          if (ratio >= 0.9) bgColor = '#cc4c02';
          else if (ratio >= 0.75) bgColor = '#ec7014';
          else if (ratio >= 0.6) bgColor = '#fe9929';
          else if (ratio >= 0.45) bgColor = '#fec44f';
          else if (ratio >= 0.3) bgColor = '#fee391';
          else bgColor = '#fff7bc';
          titleText += `: ${formatHHMM(timeSec)} Hours`;
        }
      }

      html += `<td style="background-color: ${bgColor};" title="${titleText}">${innerText}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  container.innerHTML = html;
}

initDashboard();
