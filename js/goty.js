// goty.js - The Game of the Year page.

// Earliest release year shown in the Game of the Year highlights table
const GOTY_HIGHLIGHT_START_YEAR = 1985;

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
