// reach.js - The Within Reach page: records, rankings and round numbers that are close to changing.

// A game, system or series counts as active if it was played this recently (days before the latest entry)
const REACH_ACTIVE_DAYS = 30;
// How close something must be to show up
const REACH_MAX_HOURS = 10;       // a time gap to the next rank or round number
const REACH_MAX_COUNT = 3;        // a count gap (days, months, sessions, completions) to the next rank
const REACH_MAX_HUB_HOURS = 25;   // series, genres and the like move in bigger steps
// Spotlight lists a game keeps climbing as it's played, besides the "Top Games by ..." sections (weekday lists
// are left out: they'd fill the page with one row per day of the week)
const REACH_GROWING_LISTS = new Set([
  'Most Played Games', 'Most Days Played', 'Top 25 Multiplayer Games', 'Games Played Across Most Years', 'Games Played Across Most Months',
  'Top 25 Short Sessions (<=30m)', 'Top 25 Marathons (>=4h)', 'Top 25 Epics (>=8h)', 'Most Completed Games', 'Most Post-Completion Playtime',
  'Most Months as a Top 5 Game', 'Most Days as Top Game'
]);

function initReachPage() {
  const container = document.getElementById('reach-page-container');
  if (!container || !rawData || !rawData.allEntries) return;

  const today = dataDateKey();
  const todayTime = Date.parse(today + 'T12:00:00Z');
  const [year, month] = today.split('-');
  const isRecent = date => (todayTime - Date.parse(String(date).slice(0, 10) + 'T12:00:00Z')) / 86400000 <= REACH_ACTIVE_DAYS;
  const hours = sec => formatTime(Math.max(60, sec));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // --- Totals from the log ---
  const dayTotals = {}, monthTotals = {}, yearTotals = {}, yearGames = {}, systemSeconds = {}, lastPlayed = {};
  const hubs = { series: {}, genre: {}, developer: {}, publisher: {}, system: {} };
  let allSeconds = 0;
  rawData.allEntries.forEach(e => {
    const day = e.date.slice(0, 10), sec = timeStringToSeconds(e.time);
    allSeconds += sec;
    dayTotals[day] = (dayTotals[day] || 0) + sec;
    monthTotals[day.slice(0, 7)] = (monthTotals[day.slice(0, 7)] || 0) + sec;
    yearTotals[day.slice(0, 4)] = (yearTotals[day.slice(0, 4)] || 0) + sec;
    (yearGames[day.slice(0, 4)] = yearGames[day.slice(0, 4)] || new Set()).add(e.game);
    systemSeconds[e.system] = (systemSeconds[e.system] || 0) + sec;
    lastPlayed[e.game] = e.date;
    Object.keys(hubs).forEach(key => {
      const val = e[key];
      if (!val || val === 'N/A' || val === 'ZZNONE') return;
      const item = hubs[key][val] = hubs[key][val] || { seconds: 0, last: e.date };
      item.seconds += sec;
      item.last = e.date;
    });
  });
  const activeGames = Object.keys(lastPlayed).filter(g => isRecent(lastPlayed[g]));

  // --- 1. Records in play: this month, this year and the current streak against the best ---
  const inPlay = [];
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  const daysLeftInMonth = daysInMonth - Number(today.slice(8));
  const daysLeftInYear = Math.round((Date.parse(`${year}-12-31`) - Date.parse(today)) / 86400000);
  // Rows compare a running total with a past best: needs X more with N days left, or already ahead.
  // unit is the smallest step past the target (a minute, or one more game); perDay adds the daily pace needed
  const chase = (label, now, target, targetLabel, daysLeft, show, unit, perDay = false) => {
    if (!target) return;
    const gap = target - now;
    inPlay.push({
      title: `${label}: ${show(now)}`,
      sub: gap >= 0
        ? `${targetLabel} is ${show(target)}. Needs ${show(gap + unit)} more${daysLeft > 0 ? ` in ${plural(daysLeft, 'day')}${perDay ? ` (${show(Math.ceil((gap + unit) / daysLeft))} a day)` : ''}` : ''}.`
        : `Already past ${targetLabel.toLowerCase()} of ${show(target)}, by ${show(-gap)}.`,
      badge: gap >= 0 ? show(gap + unit) : 'Passed', done: gap < 0, sort: gap >= 0 ? (gap + unit) / Math.max(1, target) : -1
    });
  };
  const monthKey = `${year}-${month}`, monthName = MONTH_NAMES[Number(month) - 1];
  const bestOf = (totals, keep) => Object.entries(totals).filter(([k]) => keep(k)).sort((a, b) => b[1] - a[1])[0];
  const bestSameMonth = bestOf(monthTotals, k => k !== monthKey && k.endsWith(`-${month}`));
  const bestMonth = bestOf(monthTotals, k => k !== monthKey);
  const bestYear = bestOf(yearTotals, k => k !== year);
  if (bestSameMonth) chase(`${monthName} ${year}`, monthTotals[monthKey] || 0, bestSameMonth[1], `The best ${monthName} (${bestSameMonth[0].slice(0, 4)})`, daysLeftInMonth, hours, 300, true);
  if (bestMonth) chase(`${monthName} ${year} against every month`, monthTotals[monthKey] || 0, bestMonth[1], `The busiest month ever (${bestMonth[0]})`, daysLeftInMonth, hours, 300, true);
  if (bestYear) chase(`${year}`, yearTotals[year] || 0, bestYear[1], `The busiest year (${bestYear[0]})`, daysLeftInYear, hours, 300, true);
  const gamesByYear = Object.fromEntries(Object.entries(yearGames).map(([y, games]) => [y, games.size]));
  const bestGamesYear = bestOf(gamesByYear, k => k !== year);
  if (bestGamesYear) chase(`Games played in ${year}`, gamesByYear[year] || 0, bestGamesYear[1], `The most in one year (${bestGamesYear[0]})`, daysLeftInYear, n => String(n), 1);
  const completionsByYear = {};
  getSortedCompletions('All-Time').forEach(pt => { const y = String(pt.displayDate.getUTCFullYear()); completionsByYear[y] = (completionsByYear[y] || 0) + 1; });
  const bestCompletionYear = bestOf(completionsByYear, k => k !== year);
  if (bestCompletionYear) chase(`Completions in ${year}`, completionsByYear[year] || 0, bestCompletionYear[1], `The most in one year (${bestCompletionYear[0]})`, daysLeftInYear, n => String(n), 1);

  // Current streak: back-to-back days played, ending on the latest logged day
  let streak = 0;
  for (let t = todayTime; dayTotals[new Date(t).toISOString().slice(0, 10)] !== undefined; t -= 86400000) streak++;
  const allDays = Object.keys(dayTotals);
  const bestStreak = longestDayStreak(allDays);
  const bestYearStreak = longestDayStreak(allDays.filter(d => d.startsWith(year)));
  const streakChase = (target, label) => {
    if (streak >= target.length) return;
    const gap = target.length - streak + 1;
    inPlay.push({ title: `Current streak: ${plural(streak, 'day')}`, sub: `${label} is ${plural(target.length, 'day')} (${formatFullDate(target.start)} to ${formatFullDate(target.end)}). Needs ${plural(gap, 'more day')} without a break.`, badge: plural(gap, 'day'), sort: gap / target.length });
  };
  streakChase(bestYearStreak, `The longest streak of ${year}`);
  // The all-time streak only shows once it's a month or less away
  if (bestStreak.length !== bestYearStreak.length && bestStreak.length - streak <= 30) streakChase(bestStreak, 'The longest streak ever');
  inPlay.sort((a, b) => a.sort - b.sort);

  // --- 2. Round numbers coming up (the same marks the Milestones page records) ---
  const marks = [];
  const nextStep = (value, step) => (Math.floor(value / step) + 1) * step;
  // 25, 50, then every 100
  const nextGameMark = value => [25, 50].find(m => value < m) || nextStep(value, 100);
  const pushMark = (title, gap, show, sub, game) => marks.push({ title, sub, badge: show(gap), game, sort: gap });
  const totalHours = allSeconds / 3600, nextTotal = nextStep(totalHours, 500);
  marks.push({ title: `${nextTotal.toLocaleString()} total hours played`, sub: `Now at ${formatTime(allSeconds)}.`, badge: hours(nextTotal * 3600 - allSeconds), sort: -3 });
  const entryCount = rawData.allEntries.length;
  marks.push({ title: `Log entry #${nextStep(entryCount, 250).toLocaleString()}`, sub: `Now at ${entryCount.toLocaleString()} entries.`, badge: plural(nextStep(entryCount, 250) - entryCount, 'entry').replace('entrys', 'entries'), sort: -2 });
  const gameCount = Object.keys(lastPlayed).length;
  marks.push({ title: `Unique game #${nextStep(gameCount, 50).toLocaleString()}`, sub: `Now at ${gameCount.toLocaleString()} games played.`, badge: plural(nextStep(gameCount, 50) - gameCount, 'game'), sort: -1 });
  Object.entries(systemSeconds).filter(([system]) => isRecent(hubs.system[system].last)).forEach(([system, sec]) => {
    const next = nextStep(sec / 3600, 250), gap = next * 3600 - sec;
    if (gap <= REACH_MAX_HUB_HOURS * 3600) pushMark(`${next.toLocaleString()} hours on ${system}`, gap, hours, `Now at ${formatTime(sec)}.`);
  });
  activeGames.forEach(game => {
    const stats = rawData.metrics.allTimeGameStats[game];
    if (!stats) return;
    const nextHours = nextGameMark(stats.totalSeconds / 3600), hourGap = nextHours * 3600 - stats.totalSeconds;
    if (hourGap <= REACH_MAX_HOURS * 3600) pushMark(`${game}: ${nextHours} hours played`, hourGap, hours, `Now at ${formatTime(stats.totalSeconds)}.`, game);
    const days = stats.days.size, nextDays = nextGameMark(days);
    if (nextDays - days <= 5) marks.push({ title: `${game}: ${nextDays} days played`, sub: `Now at ${plural(days, 'day')}.`, badge: plural(nextDays - days, 'day'), game, sort: (nextDays - days) * 3600 });
  });
  marks.sort((a, b) => a.sort - b.sort);

  // --- 3. Races: this year's most played, and the all-time hub rankings ---
  const races = [];
  const yearRanking = Object.entries((rawData.metrics.yearlyGameStats || {})[year] || {}).map(([name, s]) => [name, s.totalSeconds]).sort((a, b) => b[1] - a[1]);
  yearRanking.slice(1, 8).forEach(([game, sec], i) => {
    const [above, aboveSec] = yearRanking[i];
    if (!isRecent(lastPlayed[game])) return;
    races.push({ rank: `#${i + 2}`, title: `${game}: #${i + 1} most played game of ${year}`, game, sub: `At ${formatTime(sec)}, ${hours(aboveSec - sec)} behind ${above} (${formatTime(aboveSec)}).`, badge: hours(aboveSec - sec), sort: aboveSec - sec });
  });
  const HUB_LABELS = { series: ['series', 'Most Played Series'], genre: ['genre', 'Most Played Genres'], developer: ['developer', 'Most Played Developers'], publisher: ['publisher', 'Most Played Publishers'], system: ['system', 'Most Played Systems'] };
  Object.entries(hubs).forEach(([key, items]) => {
    const ranking = Object.entries(items).sort((a, b) => b[1].seconds - a[1].seconds);
    ranking.slice(1, 25).forEach(([name, item], i) => {
      const [above, aboveItem] = ranking[i];
      const gap = aboveItem.seconds - item.seconds;
      if (!isRecent(item.last) || gap > REACH_MAX_HUB_HOURS * 3600) return;
      races.push({ rank: `#${i + 2}`, title: `${name} (${HUB_LABELS[key][0]}): #${i + 1} in ${HUB_LABELS[key][1]}`, sub: `At ${formatTime(item.seconds)}, ${hours(gap)} behind ${above} (${formatTime(aboveItem.seconds)}).`, badge: hours(gap), sort: gap });
    });
  });
  races.sort((a, b) => a.sort - b.sort);

  // --- 4. Spotlight lists where a game being played now is close to the next rank ---
  const climbs = [];
  const lists = rawData.metrics.top25Lists || [];
  const slugs = spotlightSlugs(lists);
  const valueOf = cell => typeof cell === 'number' ? { n: cell, time: false } : /^\d+:\d\d$/.test(String(cell)) ? { n: timeStringToSeconds(String(cell)), time: true } : null;
  lists.forEach((list, li) => {
    if (list.headersLeft[1] !== 'Videogame') return;
    const growing = (/^Top Games by /.test(list.category) && list.category !== 'Top Games by Weekday') || REACH_GROWING_LISTS.has(list.titleLeft) || /Multiplayer Experiences$/.test(list.titleLeft);
    if (!growing) return;
    let rank = '';
    const rows = list.allTime.map(row => { rank = row[0] || rank; return { game: row[1], value: valueOf(row[3]), rank, shown: row[3] }; });
    rows.forEach((row, i) => {
      if (i === 0 || !row.value || !isRecent(lastPlayed[row.game] || '2000-01-01')) return;
      // The nearest row above with a higher value is the one to pass
      let j = i - 1;
      while (j >= 0 && (!rows[j].value || rows[j].value.n <= row.value.n)) j--;
      if (j < 0) return;
      const gap = rows[j].value.n - row.value.n;
      if (gap > (row.value.time ? REACH_MAX_HOURS * 3600 : REACH_MAX_COUNT)) return;
      const behind = row.value.time ? hours(gap) : String(gap);
      climbs.push({
        rank: row.rank, title: `${row.game}: ${rows[j].rank} in ${list.titleLeft}`, game: row.game, href: `spotlight.html#${slugs[li]}`,
        sub: `At ${row.shown}, ${behind} behind ${rows[j].game} (${rows[j].shown}).`,
        badge: behind, sort: row.value.time ? gap : gap * 3600
      });
    });
  });
  climbs.sort((a, b) => a.sort - b.sort);

  const rowHtml = row => `
    <div class="list-item${row.done ? ' reach-done' : ''}">
      <div class="item-info">
        ${row.rank !== undefined ? `<span class="item-rank">${escapeHTML(String(row.rank))}</span>` : ''}
        <div class="item-text">
          <span class="item-title${row.game ? ' hover-trigger' : ''}"${row.game ? ` data-game="${escapeHTML(row.game)}"` : ''}>${escapeHTML(row.title)}</span>
          <span class="item-sub">${escapeHTML(row.sub)}${row.href ? ` <a href="${row.href}" class="reach-link">Open list</a>` : ''}</span>
        </div>
      </div>
      <div class="item-badge">${escapeHTML(String(row.badge))}</div>
    </div>`;
  const card = (title, note, rows, empty) => `
    <div class="card">
      <div class="card-header"><h2>${title} <span class="goty-gap-count">${rows.length}</span></h2></div>
      <div class="card-content"><div class="goty-gap-subtitle">${note}</div>${rows.length ? rows.map(rowHtml).join('') : `<div class="loading-text">${empty}</div>`}</div>
    </div>`;

  container.innerHTML = `
    <div class="card-row grid-1">
      <h2 class="page-title">Within Reach</h2>
      <div class="reach-intro">As of ${formatFullDate(today)}, the latest log entry. "Being played" means played in the ${REACH_ACTIVE_DAYS} days before that.</div>
    </div>
    <section class="card-row grid-2">
      ${card('Records in Play', 'This month, this year and the current streak against the best so far.', inPlay, 'Nothing to chase right now.')}
      ${card('Round Numbers Coming Up', `Totals, and games being played that are within ${REACH_MAX_HOURS} hours or 5 days of their next mark.`, marks, 'No marks close by.')}
    </section>
    <section class="card-row grid-2">
      ${card('Climbing the Spotlight', `Games being played that are within ${REACH_MAX_HOURS} hours (or ${REACH_MAX_COUNT} days, months or sessions) of the next rank in a list. The badge is how far behind they are.`, climbs, 'No game is close to its next rank.')}
      ${card('Races', `The most played games of ${year}, and series, genres, developers, publishers and systems within ${REACH_MAX_HUB_HOURS} hours of the next rank.`, races, 'No close races.')}
    </section>
  `;
}
