// spotlight.js - The Spotlight page and the Top 25 tables it shares with the Index.

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

    // A past holder that kept beating its own record: show how far it got
    const peakHtml = (i < wrpData.timeline.length - 1 && event.peakValue) ? ` &rarr; ${escapeHTML(event.peakValue)}` : '';

    blocks.push(`
    <div class="wrp-step">
    <div class="wrp-step-date">${formatFullDate(event.date)}</div>
    ${eventChampHtml}
    <div class="wrp-step-sub">${isFirst ? 'Inaugural Record' : `Dethroned ${escapeHTML(event.dethroned)}`} &bull; <strong style="color: var(--text-title);">${escapeHTML(event.takeoverValue)}</strong>${peakHtml}</div>
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
      const isEmptyYear = row[7] === true; // A year with nothing to show (by-year tables list every year of the log)

      const currentYear = getDataDate().getFullYear().toString();
      const isBold = !isEmptyYear && ((end && end.toString().startsWith(currentYear)) || (col1 && col1.toString() === currentYear));
      // Ensure we keep your custom active class or bold styling here
      const boldStyle = isBold ? 'style="font-weight: 800; color: #000; background-color: #f0fff4;"' : '';

      const detailMainHtml = isEmptyYear
        ? `<span style="font-style: italic; color: var(--text-muted);">${escapeHTML(String(detail))}</span>`
        : isGameList
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
      <td class="text-center" style="${isEmptyYear ? 'color: var(--text-muted);' : 'background: var(--highlight-green-bg); color: var(--primary-green); font-weight: 900;'} white-space: nowrap;">${escapeHTML(String(val))}</td>
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
  <h2 class="spotlight-list-title">${escapeHTML(listObj.titleLeft)}${typeof openShareCard === 'function' ? ` ${shareButtonHtml(`data-share-list="${rawData.metrics.top25Lists.indexOf(listObj)}"`)}` : ''}</h2>
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

// Share card for a list: its top rows, with ranks filled in where ties left them blank
document.addEventListener('click', e => {
  const button = e.target.closest('.share-btn[data-share-list]');
  if (!button) return;
  const list = rawData.metrics.top25Lists[Number(button.dataset.shareList)];
  if (!list) return;
  let rank = '';
  openShareCard({
    kicker: `Spotlight · ${list.category}`, title: list.titleLeft,
    rows: list.allTime.slice(0, 9).map(row => {
      rank = row[0] || rank;
      return { left: `${rank} ${row[1]}${row[2] ? ` (${row[2]})` : ''}`, right: String(row[3]) };
    })
  });
});

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
