// review.js - The Year in Review page (review.html?year=...): one year of the log on a single page.

function initReviewPage() {
  const container = document.getElementById('review-page-container');
  if (!container || !rawData || !rawData.allEntries) return;

  const years = [...new Set(rawData.allEntries.map(e => e.date.slice(0, 4)))].sort().reverse();
  const requested = new URLSearchParams(window.location.search).get('year');
  container.innerHTML = `
    <div class="card-row grid-1">
      <h2 class="page-title">
        <select id="review-year" class="header-dropdown card-title-lg">${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select>
        in Review
      </h2>
    </div>
    <div id="review-body" class="page-stack"></div>
  `;
  const select = document.getElementById('review-year');
  select.value = years.includes(requested) ? requested : years[0];
  const render = () => {
    document.title = `${select.value} in Review | yoshi xcx's Videogame Dashboard`;
    document.getElementById('review-body').innerHTML = reviewBodyHtml(select.value);
  };
  select.addEventListener('change', () => { history.replaceState(null, '', `?year=${select.value}`); render(); });
  render();
}

function reviewBodyHtml(year) {
  const entries = rawData.allEntries.filter(e => e.date.startsWith(year));
  const sum = summarizeEntries(entries);
  const today = dataDateKey();
  const inProgress = today.startsWith(year);
  // The year before, cut off at the same day of the year when this one is still in progress
  const prevYear = String(Number(year) - 1);
  const prevEntries = rawData.allEntries.filter(e => e.date.startsWith(prevYear) && (!inProgress || e.date.slice(5, 10) <= today.slice(5)));
  const prev = prevEntries.length ? summarizeEntries(prevEntries) : null;
  const completionsOf = y => getSortedCompletions(y);
  const completions = completionsOf(year);
  const prevCompletions = prev ? completionsOf(prevYear).filter(pt => !inProgress || pt.displayDate.toISOString().slice(5, 10) <= today.slice(5)).length : 0;

  // Games first played this year
  const firstPlayed = {};
  rawData.allEntries.forEach(e => { if (!firstPlayed[e.game]) firstPlayed[e.game] = e.date.slice(0, 4); });
  const newGames = [...sum.games.keys()].filter(g => firstPlayed[g] === year);

  const dayTotals = {}, gameDays = {};
  entries.forEach(e => {
    const day = e.date.slice(0, 10);
    dayTotals[day] = (dayTotals[day] || 0) + timeStringToSeconds(e.time);
    (gameDays[e.game] = gameDays[e.game] || new Set()).add(day);
  });
  const bestDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
  const bestMonth = Object.entries(sum.byMonth).sort((a, b) => b[1] - a[1])[0];
  const streak = longestDayStreak(sum.days);
  const daysSoFar = inProgress ? Math.round((Date.parse(today) - Date.parse(`${year}-01-01`)) / 86400000) + 1 : (Number(year) % 4 === 0 ? 366 : 365);

  const versus = (now, before, show = formatTime) => {
    if (!prev) return '';
    const diff = now - before;
    return `<span class="tf-compare ${diff >= 0 ? 'tf-up' : 'tf-down'}">${diff >= 0 ? '▲' : '▼'} ${show(Math.abs(diff))} vs ${prevYear}${inProgress ? ' at this point' : ''}</span>`;
  };
  const plain = v => String(Math.round(v));
  const stat = (label, value, extra = '') => `<div class="tf-stat"><span class="sys-widget-title">${label}</span><strong>${value}</strong>${extra}</div>`;
  const sub = text => `<span class="tf-sub">${text}</span>`;

  const months = MONTH_NAMES.map((name, m) => ({ name: name.slice(0, 3), sec: sum.byMonth[`${year}-${String(m + 1).padStart(2, '0')}`] || 0 }));
  const maxMonth = Math.max(1, ...months.map(m => m.sec));

  const gameRows = topOfMap(sum.games, 15).map(([game, sec]) => ({
    title: game, game, badge: formatTime(sec),
    sub: `${gameDays[game].size} day${gameDays[game].size === 1 ? '' : 's'} · ${((sec / sum.seconds) * 100).toFixed(1)}% of the year${firstPlayed[game] === year ? ' · new this year' : ''}`
  }));
  const mapRows = map => topOfMap(map, 8).map(([name, sec]) => ({ title: name, badge: formatTime(sec), sub: `${((sec / sum.seconds) * 100).toFixed(1)}% of the year` }));
  const completionRows = [...completions].reverse().map(pt => {
    const score = getGameScore(pt.gameName);
    return { title: pt.gameName, game: pt.gameName, rank: formatShortDate(pt.displayDate), sub: `${toList(pt.systems).join(', ')}${score !== null ? ` · score ${formatScore(score)}` : ''}`, badge: pt.finalPtLifetime };
  });
  const scoredCompletions = completions.map(pt => ({ pt, score: getGameScore(pt.gameName) })).filter(c => c.score !== null).sort((a, b) => b.score - a.score);
  const releases = metaGames.filter(g => g.releaseYear === year && g.score !== null && sum.games.has(g.name)).sort((a, b) => b.score - a.score);

  const partnerStats = getPartners().map(p => ({ name: p.name, sum: summarizeEntries(partnerEntries(p).filter(e => e.date.startsWith(year))) })).filter(p => p.sum.sessions > 0);

  const milestones = (rawData.metrics.milestones || []).filter(m => String(m.date).startsWith(year));
  const records = milestones.filter(m => m.type === 'record');
  const highlights = milestones.filter(m => m.type === 'first' || m.type === 'hours' || m.type === 'anniversary' || /unique game:|th entry:/.test(m.details));

  return `
    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>${year} at a Glance${inProgress ? ` <span class="goty-gap-count">through ${formatFullDate(today)}</span>` : ''}</h2></div>
        <div class="card-content">
          <div class="tf-stats">
            ${stat('Time Played', formatTime(sum.seconds), versus(sum.seconds, prev ? prev.seconds : 0))}
            ${stat('Days Played', sum.days.size, sub(`of ${daysSoFar} · ${formatTime(sum.seconds / Math.max(1, sum.days.size))} per day played`))}
            ${stat('Games', sum.games.size, versus(sum.games.size, prev ? prev.games.size : 0, plain))}
            ${stat('New Games', newGames.length, sub(`${sum.games.size - newGames.length} returning`))}
            ${stat('Completions', completions.length, versus(completions.length, prevCompletions, plain))}
            ${stat('Longest Streak', `${streak.length} days`, sub(`${formatFullDate(streak.start)} to ${formatFullDate(streak.end)}`))}
            ${stat('Longest Session', formatTime(sum.longest.sec), sub(`${escapeHTML(sum.longest.entry.game)} · ${formatFullDate(sum.longest.entry.date)}`))}
            ${stat('Busiest Day', formatTime(bestDay[1]), sub(formatFullDate(bestDay[0])))}
            ${stat('Busiest Month', formatTime(bestMonth[1]), sub(MONTH_NAMES[Number(bestMonth[0].slice(5)) - 1]))}
            ${stat('Multiplayer', formatTime(sum.multiplayerSeconds), sub(`${((sum.multiplayerSeconds / sum.seconds) * 100).toFixed(1)}% of the year`))}
          </div>
          <div class="tf-strip tf-strip-months">${months.map(m => `<div class="tf-month" title="${m.name} ${year}: ${formatTime(m.sec)}"><div class="tf-month-fill" style="height: ${(m.sec / maxMonth) * 100}%;"></div><span>${m.name}</span></div>`).join('')}</div>
        </div>
      </div>
    </section>

    <section class="card-row grid-2">
      <div class="card">
        <div class="card-header"><h2>Most Played Games</h2></div>
        <div class="card-content">${rankedListHtml(gameRows)}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Completions <span class="goty-gap-count">${completions.length}</span></h2></div>
        <div class="card-content">${rankedListHtml(completionRows, 'No completions this year.')}</div>
      </div>
    </section>

    <section class="card-row grid-3">
      <div class="card">
        <div class="card-header"><h2>Systems</h2></div>
        <div class="card-content">${rankedListHtml(mapRows(sum.systems))}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Genres</h2></div>
        <div class="card-content">${rankedListHtml(mapRows(sum.genres))}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Franchises</h2></div>
        <div class="card-content">${rankedListHtml(mapRows(sum.series), 'No franchise games.')}</div>
      </div>
    </section>

    <section class="card-row grid-3">
      <div class="card">
        <div class="card-header"><h2>Best Completions by Score</h2></div>
        <div class="card-content">${rankedListHtml(scoredCompletions.slice(0, 10).map(c => ({ title: c.pt.gameName, game: c.pt.gameName, sub: `${toList(c.pt.systems).join(', ')} · completed ${formatFullDate(c.pt.displayDate)}`, badge: formatScore(c.score) })), 'No scored completions.')}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Best ${year} Releases Played</h2></div>
        <div class="card-content">${rankedListHtml(releases.slice(0, 10).map(g => ({ title: g.name, game: g.name, sub: `${g.genre} · ${formatTime(sum.games.get(g.name))} this year`, badge: formatScore(g.score) })), `No scored ${year} releases played.`)}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Played With</h2></div>
        <div class="card-content">${rankedListHtml(partnerStats.map(p => {
          const [game, sec] = topOfMap(p.sum.games, 1)[0];
          return { title: p.name, rank: '', sub: `${p.sum.days.size} days · ${p.sum.games.size} games · most played ${game} (${formatTime(sec)})`, badge: formatTime(p.sum.seconds) };
        }), getPartners().length ? 'No partner sessions this year.' : 'The partner list arrives with the next data sync.')}</div>
      </div>
    </section>

    <section class="card-row grid-2">
      <div class="card">
        <div class="card-header"><h2>Records Set <span class="goty-gap-count">${records.length}</span></h2></div>
        <div class="card-content">${records.length ? records.slice(0, 40).map(milestoneItemHtml).join('') + (records.length > 40 ? `<a class="toc-link review-more" href="milestones.html">All ${records.length} on the Milestones page</a>` : '') : '<div class="loading-text">No Spotlight records changed hands.</div>'}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Firsts and Round Numbers <span class="goty-gap-count">${highlights.length}</span></h2></div>
        <div class="card-content">${highlights.length ? highlights.map(milestoneItemHtml).join('') : '<div class="loading-text">Nothing this year.</div>'}</div>
      </div>
    </section>
  `;
}
