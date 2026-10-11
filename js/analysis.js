// analysis.js - The Analysis page and the analysis tables it shares with the Index.

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

// --- UPDATE: RENDER ANALYSIS (Add Container ID parameter) ---
function renderAnalysis(type, targetContainerId = 'analysis-content') {
  const container = document.getElementById(targetContainerId);
  if (!container || !rawData || !rawData.metrics || !rawData.metrics.playthroughAnalysis) return;

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
