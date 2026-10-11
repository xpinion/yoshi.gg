// ratings.js - The Ratings page: Yoshi scores across every played game. Uses the score charts in hubs.js.

// Scores below this with a lot of play time are Guilty Pleasures; HIGH_SCORE (hubs.js) and up with little are Hidden Gems
const LOW_SCORE = 6;
// A group (genre, release year) needs this many scored games to be averaged
const MIN_SCORED_FOR_RATING_AVG = 3;

function initRatingsPage() {
  const container = document.getElementById('ratings-page-container');
  if (!container || !rawData || !rawData.metrics.allTimeGameStats) return;

  const stats = rawData.metrics.allTimeGameStats;
  const scored = metaGames.filter(g => g.score !== null && stats[g.name])
    .map(g => ({ ...g, seconds: stats[g.name].totalSeconds, systems: toList(stats[g.name].systems).join(', ') }));
  if (scored.length === 0) { container.innerHTML = '<div class="loading-text">No scored games yet.</div>'; return; }

  const scores = scored.map(g => g.score).sort((a, b) => a - b);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const median = scores[Math.floor(scores.length / 2)];
  const playedHours = Object.values(stats).map(s => s.totalSeconds / 3600).sort((a, b) => a - b);
  const medianHours = playedHours[Math.floor(playedHours.length / 2)];
  const totalSeconds = scored.reduce((sum, g) => sum + g.seconds, 0);
  const weighted = scored.reduce((sum, g) => sum + g.score * g.seconds, 0) / Math.max(1, totalSeconds);
  const best = [...scored].sort((a, b) => b.score - a.score || b.seconds - a.seconds)[0];

  // Average score per group, for groups with enough scored games
  const averagesBy = key => {
    const groups = {};
    scored.forEach(g => {
      if (!g[key] || g[key] === 'Unknown' || g[key] === 'ZZNONE') return;
      const group = groups[g[key]] = groups[g[key]] || { name: g[key], count: 0, total: 0, seconds: 0, top: g };
      group.count++; group.total += g.score; group.seconds += g.seconds;
      if (g.score > group.top.score) group.top = g;
    });
    return Object.values(groups).filter(g => g.count >= MIN_SCORED_FOR_RATING_AVG).map(g => ({ ...g, avg: g.total / g.count }));
  };
  const genres = averagesBy('genre').sort((a, b) => b.avg - a.avg);
  const years = averagesBy('releaseYear').sort((a, b) => a.name.localeCompare(b.name));

  const gameRow = g => ({ title: g.name, game: g.name, sub: `${g.systems} · ${g.genre} · ${g.releaseYear}`, badge: `${formatScore(g.score)} · ${formatTime(g.seconds)}` });
  const guilty = scored.filter(g => g.score < LOW_SCORE).sort((a, b) => b.seconds - a.seconds).slice(0, 25);
  const gems = scored.filter(g => g.score >= HIGH_SCORE).sort((a, b) => a.seconds - b.seconds).slice(0, 25);
  const stat = (label, value, sub = '') => `<div class="card hub-stat-card"><div class="sys-widget-title">${label}</div><div class="sys-widget-value hub-value-md">${value}</div><div class="sys-widget-sub">${sub}</div></div>`;

  container.innerHTML = `
    <div class="card-row grid-1"><h2 class="page-title">Ratings</h2></div>
    <section class="card-row grid-4">
      ${stat('Scored Games', scored.length, `of ${Object.keys(stats).length} played`)}
      ${stat('Average Score', avg.toFixed(2), `median ${formatScore(median)}`)}
      ${stat('Average by Time Played', weighted.toFixed(2), 'each game weighted by its hours')}
      ${stat('Highest Rated', formatScore(best.score), escapeHTML(best.name))}
    </section>

    <section class="card-row grid-2">
      <div class="card">
        <div class="card-header"><h2>Score Distribution</h2></div>
        <div class="card-content">${scoreDistributionHtml(scored, avg)}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Highest Rated Games Played</h2></div>
        <div class="card-content">${rankedListHtml([...scored].sort((a, b) => b.score - a.score || b.seconds - a.seconds).slice(0, 25).map(gameRow))}</div>
      </div>
    </section>

    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>Average Score by Release Year</h2></div>
        <div class="card-content">${ratingYearChartHtml(years)}<div class="score-scatter-note">Years with at least ${MIN_SCORED_FOR_RATING_AVG} scored games. Hover a bar for the year's top game.</div></div>
      </div>
    </section>

    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>Score vs. Hours: Every Scored Game</h2></div>
        <div class="card-content">${scoreHoursScatterHtml(scored, medianHours)}</div>
      </div>
    </section>

    <section class="card-row grid-2">
      <div class="card">
        <div class="card-header"><h2>Guilty Pleasures <span class="goty-gap-count">most time on games scored under ${LOW_SCORE}</span></h2></div>
        <div class="card-content">${rankedListHtml(guilty.map(gameRow), 'No low-scored games.')}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Hidden Gems <span class="goty-gap-count">least time on games scored ${HIGH_SCORE}+</span></h2></div>
        <div class="card-content">${rankedListHtml(gems.map(gameRow), 'No high-scored games.')}</div>
      </div>
    </section>

    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>Average Score by Genre</h2></div>
        <div class="card-content hub-flush">
          <div class="monthly-table-wrapper hub-pad">
            <table class="monthly-table" style="min-width: 700px;">
              <thead><tr><th>Genre</th><th>Average</th><th>Scored Games</th><th>Time Played</th><th>Highest Rated</th></tr></thead>
              <tbody>${genres.map(g => `
                <tr>
                  <td class="text-left hub-bold"><a href="genre.html?item=${encodeURIComponent(g.name)}" class="toc-link">${escapeHTML(g.name)}</a></td>
                  <td class="text-center"><span class="stat-highlight">${g.avg.toFixed(2)}</span></td>
                  <td class="text-center">${g.count}</td>
                  <td class="text-center">${formatTime(g.seconds)}</td>
                  <td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(g.top.name)}">${escapeHTML(g.top.name)}</span> (${formatScore(g.top.score)})</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  `;
}

// One bar per release year, scaled between the lowest and highest yearly average so differences show
function ratingYearChartHtml(years) {
  if (years.length === 0) return '<div class="loading-text">Not enough scored games per year.</div>';
  const width = 1000, height = 300, padL = 50, padB = 30, padT = 14;
  const innerW = width - padL - 10, innerH = height - padB - padT;
  const min = Math.floor(Math.min(...years.map(y => y.avg))), max = 10;
  const barW = innerW / years.length;
  let svg = `<svg class="hub-chart" viewBox="0 0 ${width} ${height}">`;
  for (let s = min; s <= max; s += Math.max(1, Math.ceil((max - min) / 5))) {
    const y = padT + innerH - ((s - min) / (max - min)) * innerH;
    svg += `<line x1="${padL}" y1="${y}" x2="${width - 10}" y2="${y}" stroke="var(--border-table)" />`;
    svg += `<text x="${padL - 8}" y="${y + 4}" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="var(--text-muted)" text-anchor="end">${s}</text>`;
  }
  years.forEach((yr, i) => {
    const h = ((yr.avg - min) / (max - min)) * innerH;
    svg += `<rect x="${padL + i * barW + barW * 0.12}" y="${padT + innerH - h}" width="${Math.max(1, barW * 0.76)}" height="${h}" fill="var(--primary-green)" rx="2"><title>${escapeHTML(yr.name)}: average ${yr.avg.toFixed(2)} across ${yr.count} games. Top: ${escapeHTML(yr.top.name)} (${formatScore(yr.top.score)})</title></rect>`;
    if (i % Math.ceil(years.length / 12) === 0) {
      svg += `<text x="${padL + i * barW + barW / 2}" y="${height - 10}" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="var(--text-muted)" text-anchor="middle">${escapeHTML(yr.name)}</text>`;
    }
  });
  return svg + `</svg>`;
}
