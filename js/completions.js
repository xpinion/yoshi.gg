// completions.js - The Completions page.

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
      ${getExtraCompletions().length ? `<p class="viz-note" style="margin-top: 4px;">Plus ${getExtraCompletions().filter(x => x.kind === 'dlc').length} DLC and ${getExtraCompletions().filter(x => x.kind === 'mode').length} modes finished: <a href="#dlc-and-modes" class="reach-link">see them below</a></p>` : ''}
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
  html += extraCompletionsHtml();
  container.innerHTML = html;
  setupCompletionFilters(container, completions);
}

// The DLC and side modes finished, newest first: they aren't game completions, so they get their own list
function extraCompletionsHtml() {
  const extras = getExtraCompletions().slice().reverse();
  if (!extras.length) return '';
  return `
    <section class="card-row grid-1" id="dlc-and-modes">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>DLC and Modes Finished <span class="goty-gap-count">${extras.filter(x => x.kind === 'dlc').length} DLC · ${extras.filter(x => x.kind === 'mode').length} modes</span></h2></div>
        <div class="card-content hub-flush"><div class="monthly-table-wrapper hub-pad">
          <table class="monthly-table">
            <thead><tr><th>Finished</th><th>Game</th><th>Kind</th><th>Name</th><th>System</th><th>Time</th></tr></thead>
            <tbody>${extras.map(x => `<tr>
              <td class="text-center">${formatFullDate(x.date)}</td>
              <td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(x.gameName)}">${escapeHTML(x.gameName)}</span></td>
              <td class="text-center">${PT_KIND_LABELS[x.kind] || x.kind}</td>
              <td class="text-left">${escapeHTML(x.name)}</td>
              <td class="text-center">${escapeHTML(x.system)}</td>
              <td class="text-center">${escapeHTML(x.time || '')}</td></tr>`).join('')}</tbody>
          </table>
        </div></div>
      </div>
    </section>`;
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
