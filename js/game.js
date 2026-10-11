// game.js - Game profiles (game.html) and the Index's Full Game Archive.

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
