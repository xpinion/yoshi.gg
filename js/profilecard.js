// profilecard.js - Builds the share cards for one game or one series: every number the site has on it, laid out
// for drawProfileCard in share.js. Used by the Share Cards page (card.html) and the game profile's Share button.

// --- Lookups shared by both cards, built once ---
let _profileCache = null;
function profileCache() {
  if (_profileCache) return _profileCache;
  const cache = { daySeconds: new Map(), monthSeries: {}, yearSeries: {}, seriesSeconds: new Map(), seriesOfGame: new Map() };
  const bump = (obj, key, name, sec) => { (obj[key] = obj[key] || {})[name] = (obj[key][name] || 0) + sec; };
  rawData.allEntries.forEach(e => {
    const sec = timeStringToSeconds(e.time), day = e.date.slice(0, 10);
    if (!cache.daySeconds.has(day)) cache.daySeconds.set(day, new Map());
    const games = cache.daySeconds.get(day);
    games.set(e.game, (games.get(e.game) || 0) + sec);
    if (!isRealSeries(e.series)) return;
    cache.seriesOfGame.set(e.game, e.series);
    cache.seriesSeconds.set(e.series, (cache.seriesSeconds.get(e.series) || 0) + sec);
    bump(cache.monthSeries, day.slice(0, 7), e.series, sec);
    bump(cache.yearSeries, day.slice(0, 4), e.series, sec);
  });
  return (_profileCache = cache);
}
function isRealSeries(series) { return !!series && !['ZZNONE', 'N/A', 'Unknown', '-'].includes(series); }
// Every series in the log, alphabetical
function profileSeriesNames() { return [...profileCache().seriesSeconds.keys()].sort((a, b) => a.localeCompare(b)); }

// Place of `name` among { name: value } (1 = highest; ties share a place), and how many there are
function profileRank(values, name) {
  const all = Object.values(values);
  return { rank: all.filter(v => v > values[name]).length + 1, total: all.length };
}
const rankText = r => `#${r.rank} of ${r.total.toLocaleString('en-US')}`;
const shortMonth = key => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1].slice(0, 3)} ${key.slice(0, 4)}`;
const pluralCount = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A long table becomes two side by side, so the card grows wider-looking rather than endlessly tall
function splitTable(section, minRows = 12) {
  if (section.rows.length < minRows) return [section];
  const half = Math.ceil(section.rows.length / 2);
  return [{ ...section, rows: section.rows.slice(0, half), note: '' }, { ...section, title: `${section.title} (continued)`, rows: section.rows.slice(half) }];
}

// The stat tiles, habit facts and monthly chart that any set of log entries (oldest first) gets
function profilePlayFacts(entries) {
  const sum = summarizeEntries(entries);
  const byDay = {};
  entries.forEach(e => { const day = e.date.slice(0, 10); byDay[day] = (byDay[day] || 0) + timeStringToSeconds(e.time); });
  const days = Object.keys(byDay).sort();
  const best = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
  const [bestDay, bestDaySec] = best(byDay), [bestMonth, bestMonthSec] = best(sum.byMonth), [bestYear, bestYearSec] = best(sum.byYear);
  const streak = longestDayStreak(days);
  // Longest stretch with no session, between two days it was played
  let gap = { days: 0 };
  for (let i = 1; i < days.length; i++) {
    const length = Math.round((Date.parse(days[i]) - Date.parse(days[i - 1])) / 86400000) - 1;
    if (length > gap.days) gap = { days: length, from: days[i - 1], to: days[i] };
  }
  const weekday = sum.byWeekday.indexOf(Math.max(...sum.byWeekday));
  const lengths = entries.map(e => timeStringToSeconds(e.time));
  const marathons = lengths.filter(s => s >= 14400).length, epics = lengths.filter(s => s >= 28800).length;
  const partners = getPartners().map(p => {
    const sec = entries.filter(e => isMultiplayerEntry(e) && p.noteNames.some(n => (e.note || '').toUpperCase().includes(n))).reduce((t, e) => t + timeStringToSeconds(e.time), 0);
    return sec > 0 ? `${p.name} ${formatTime(sec)}` : '';
  }).filter(Boolean);
  const systems = topOfMap(sum.systems, 20);

  const facts = [
    { label: 'First session', value: formatFullDate(sum.first.date) },
    { label: 'Latest session', value: formatFullDate(sum.last.date) },
    { label: 'Biggest day', value: `${formatTime(bestDaySec)} on ${formatFullDate(bestDay)}` },
    { label: 'Biggest month', value: `${formatTime(bestMonthSec)} in ${shortMonth(bestMonth)}` },
    { label: 'Biggest year', value: `${formatTime(bestYearSec)} in ${bestYear}` },
    { label: 'Longest day streak', value: streak.length > 1 ? `${streak.length} days (${formatFullDate(streak.start)} to ${formatFullDate(streak.end)})` : '1 day' }
  ];
  if (gap.days > 30) facts.push({ label: 'Longest break', value: `${pluralCount(gap.days, 'day')} (${formatFullDate(gap.from)} to ${formatFullDate(gap.to)})` });
  facts.push({ label: 'Favorite weekday', value: `${WEEKDAY_NAMES[weekday]} (${Math.round(sum.byWeekday[weekday] / sum.seconds * 100)}% of the time)` });
  facts.push({ label: 'Long sessions', value: `${pluralCount(marathons, 'marathon')} (4h+), ${pluralCount(epics, 'epic')} (8h+)` });
  if (systems.length > 1) facts.push({ label: 'Time by system', value: systems.map(([name, sec]) => `${name} ${formatTime(sec)}`).join(', ') });
  if (sum.multiplayerSeconds > 0) facts.push({ label: 'Multiplayer', value: `${formatTime(sum.multiplayerSeconds)}${partners.length ? ` (${partners.join(', ')})` : ''}` });

  // One bar per month from the first month played to the last
  const bars = [];
  const firstKey = days[0].slice(0, 7), lastKey = days[days.length - 1].slice(0, 7);
  for (let [y, m] = firstKey.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= lastKey; m === 12 ? (y++, m = 1) : m++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    bars.push({ value: sum.byMonth[key] || 0, label: m === 1 || bars.length === 0 ? String(y) : '' });
  }
  const chart = bars.length > 2
    ? { type: 'bars', title: 'Play Time by Month', bars, axisLabel: sec => sec >= 36000 ? `${Math.round(sec / 3600)}h` : `${(sec / 3600).toFixed(1)}h` }
    : null;
  const longest = sum.longest;
  return { sum, days, byDay, facts, chart, systems: systems.map(s => s[0]), longest, firstYear: days[0].slice(0, 4), lastYear: days[days.length - 1].slice(0, 4) };
}

// Months where `name` was the most played or in the top 5, from { month: { name: seconds } }
function profileMonthChips(byMonth, name, what) {
  const top = [], top5 = [];
  Object.keys(byMonth).sort().forEach(key => {
    const month = byMonth[key];
    if (!month[name]) return;
    const rank = Object.values(month).filter(sec => sec > month[name]).length + 1;
    if (rank === 1) top.push(`${shortMonth(key)} · ${formatTime(month[name])}`);
    else if (rank <= 5) top5.push(`#${rank} ${shortMonth(key)} · ${formatTime(month[name])}`);
  });
  const groups = [];
  if (top.length) groups.push({ label: `Most played ${what} of the month: ${pluralCount(top.length, 'month')}`, chips: top, gold: true });
  if (top5.length) groups.push({ label: `Top 5 ${what} of the month: ${pluralCount(top5.length, 'more month')}`, chips: top5 });
  return groups.length ? { type: 'chips', title: 'Months on Top', groups } : null;
}

// Spotlight lists where `name` is a row (lists ranking `heading`, e.g. "Videogame" or "Series"), best rank first,
// and the by-year tables it wins
function profileSpotlight(name, heading) {
  const ranked = [], yearly = [];
  (rawData.metrics.top25Lists || []).forEach(list => {
    if (list.headersLeft[1] === heading) {
      const rowIndex = list.allTime.findIndex(row => String(row[1]) === name);
      if (rowIndex !== -1) {
        // Tied rows leave the rank blank, so use the nearest rank above
        let rank = '';
        for (let r = rowIndex; r >= 0 && !rank; r--) rank = list.allTime[r][0] || '';
        ranked.push({ rank: String(rank), title: list.titleLeft, value: String(list.allTime[rowIndex][3]) });
      }
    }
    if (list.headersRight && list.headersRight[1] === heading) {
      let year = '';
      const years = [];
      list.yearly.forEach(row => { year = row[0] || year; if (String(row[1]) === name) years.push(year); });
      if (years.length) yearly.push({ title: list.titleRight, years: [...new Set(years)].sort() });
    }
  });
  ranked.sort((a, b) => parseInt(a.rank.slice(1)) - parseInt(b.rank.slice(1)));
  yearly.sort((a, b) => b.years.length - a.years.length);
  const sections = [];
  if (ranked.length) {
    const leads = ranked.filter(r => r.rank === '#1').length;
    sections.push(splitTable({
      type: 'table', title: `Spotlight: ranked in ${pluralCount(ranked.length, 'list')}${leads ? `, #1 in ${leads}` : ''}`,
      columns: [{ label: 'Rank', width: 80, align: 'center', weight: 900, color: SHARE_COLORS.green }, { label: 'List', flex: 1, weight: 700 }, { label: 'Record', width: 130, align: 'right', weight: 800 }],
      rows: ranked.map(r => [r.rank, r.title, r.value])
    }));
  }
  if (yearly.length) {
    sections.push(splitTable({
      type: 'table', title: `Spotlight: year titles in ${pluralCount(yearly.length, 'list')}`,
      columns: [{ label: 'By-Year List', flex: 1, weight: 700 }, { label: 'Years Won', flex: 1, align: 'right', weight: 800, color: SHARE_COLORS.green, maxLines: 3 }],
      rows: yearly.map(r => [r.title, r.years.join(', ')])
    }));
  }
  return sections;
}

// "Legend of Zelda (NES)" must not also match "Legend of Zelda: Tears of the Kingdom"
function profileNamePattern(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s:])${escaped}(?=$|[\\s.,)]*(\\(|took|entered|jumped|became|$|\\.))`);
}

// --- GAME CARD ---
function buildGameCard(gameName) {
  const entries = rawData.allEntries.filter(e => e.game === gameName);
  if (entries.length === 0) return null;
  const cache = profileCache();
  const play = profilePlayFacts(entries), sum = play.sum;
  const meta = metaGames.find(g => g.name === gameName) || {};
  const known = v => v && v !== 'Unknown' && v !== 'ZZNONE';
  const score = getGameScore(gameName);
  const allTime = rawData.metrics.allTimeGameStats || {};
  const timeRank = profileRank(Object.fromEntries(Object.entries(allTime).map(([g, s]) => [g, s.totalSeconds])), gameName);
  const playthroughs = Object.values(rawData.playthroughHistory).filter(pt => pt.gameName === gameName).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const completions = playthroughs.filter(pt => (pt.completionDates && pt.completionDates.length) || ['Completed', 'M-Completed', 'Postgame'].includes(pt.finalStatus));
  const daysOnTop = play.days.filter(day => Math.max(...cache.daySeconds.get(day).values()) === cache.daySeconds.get(day).get(gameName)).length;

  // Ratings: the score, and where it places among every group the game belongs to
  const ratings = [];
  if (score !== null) {
    const scored = metaGames.filter(g => g.score !== null);
    const place = (label, group) => {
      if (group.length < 2) return;
      const rank = group.filter(g => g.score > score).length + 1;
      ratings.push({ label, value: `#${rank} of ${group.length.toLocaleString('en-US')}` });
    };
    ratings.push({ label: 'Yoshi score', value: `${formatScore(score)} / 10` });
    place('Among all scored games', scored);
    if (known(meta.releaseYear)) place(`Among ${meta.releaseYear} releases (GotY)`, scored.filter(g => g.releaseYear === meta.releaseYear));
    if (known(meta.franchise)) place(`In the ${meta.franchise} series`, scored.filter(g => g.franchise === meta.franchise));
    if (known(meta.genre)) place(`Among ${meta.genre} games`, scored.filter(g => g.genre === meta.genre));
    if (known(meta.developer)) place(`Among ${meta.developer} games`, scored.filter(g => g.developer === meta.developer));
    if (known(meta.publisher) && meta.publisher !== meta.developer) place(`Among ${meta.publisher} games`, scored.filter(g => g.publisher === meta.publisher));
  } else ratings.push({ label: 'Yoshi score', value: 'Not scored' });
  ratings.push({ label: 'Most played games, all-time', value: rankText(timeRank) });
  ratings.push({ label: 'Share of all play time', value: `${(sum.seconds / [...cache.daySeconds.values()].reduce((t, games) => t + [...games.values()].reduce((a, b) => a + b, 0), 0) * 100).toFixed(2)}%` });
  ratings.push({ label: "Days as the day's most played game", value: `${daysOnTop} of ${play.days.length}` });
  if (completions.length) {
    const first = completions[0];
    ratings.push({ label: 'First completion', value: `${formatFullDate(first.completionDates && first.completionDates[0] || first.lastDate)} after ${first.finalPtLifetime}` });
  }

  // Each year it was played, with its place among that year's games
  const yearRows = Object.keys(rawData.metrics.yearlyGameStats || {}).sort().filter(y => rawData.metrics.yearlyGameStats[y][gameName]).map(y => {
    const year = rawData.metrics.yearlyGameStats[y];
    const rank = profileRank(Object.fromEntries(Object.entries(year).map(([g, s]) => [g, s.totalSeconds])), gameName);
    return [y, formatTime(year[gameName].totalSeconds), toList(year[gameName].days).length, { text: rankText(rank), color: rank.rank <= 5 ? SHARE_COLORS.green : SHARE_COLORS.text, weight: rank.rank <= 5 ? 900 : 600 }, toList(year[gameName].systems).join(', ')];
  });
  const yearTable = {
    type: 'table', title: 'Year by Year',
    columns: [{ label: 'Year', width: 80, weight: 900 }, { label: 'Time', width: 130, align: 'right', weight: 800 }, { label: 'Days', width: 80, align: 'right' }, { label: 'Rank That Year', flex: 1, align: 'right' }, { label: 'Systems', flex: 1, align: 'right' }],
    rows: yearRows
  };
  const monthGames = Object.fromEntries(Object.entries(rawData.metrics.monthlyStats || {}).map(([key, games]) => [key, Object.fromEntries(Object.entries(games).map(([g, s]) => [g, s.totalSeconds]))]));
  const months = profileMonthChips(monthGames, gameName, 'game');

  const playthroughTable = {
    type: 'table', title: `Playthroughs: ${playthroughs.length}, completed ${completions.length}`,
    columns: [
      { label: 'Tag', width: 120, weight: 800 }, { label: 'Systems', width: 120 }, { label: 'Status', width: 190, align: 'center' },
      { label: 'Started', width: 125, align: 'center' }, { label: 'Completed', width: 125, align: 'center' }, { label: 'Last Played', width: 125, align: 'center' },
      { label: 'Time', width: 95, align: 'right', weight: 800 }, { label: 'Days', width: 70, align: 'right' }, { label: 'Where It Ended', flex: 1, maxLines: 3, size: 17 }
    ],
    rows: playthroughs.map(pt => [
      pt.ptTag || '', toList(pt.systems).join(', '), { text: pt.finalStatus, pill: SHARE_STATUS_COLORS[pt.finalStatus] || ['#ececec', '#555555'] },
      formatFullDate(pt.startDate), (pt.completionDates || []).map(d => formatFullDate(d)).join(', ') || '-', formatFullDate(pt.lastDate),
      pt.finalPtLifetime, pt.finalPtLifetimeDays, String(pt.finalNote || '').trim()
    ])
  };

  const pattern = profileNamePattern(gameName);
  const allMilestones = (rawData.metrics.milestones || []).filter(m => pattern.test(m.details));
  const notable = allMilestones.filter(m => m.type !== 'ranking').sort((a, b) => new Date(b.date) - new Date(a.date));
  const shown = notable.slice(0, 10);
  const milestoneTable = shown.length ? {
    type: 'table', title: `Milestones: ${allMilestones.length}`,
    columns: [{ label: 'Date', width: 130, weight: 800 }, { label: 'Milestone', flex: 1, maxLines: 3 }],
    rows: shown.map(m => [formatFullDate(m.date), m.details]),
    note: allMilestones.length > shown.length ? `Plus ${allMilestones.length - shown.length} more, mostly ranking changes, on the game's page at yoshi.gg` : ''
  } : null;

  const span = play.firstYear === play.lastYear ? play.firstYear : `${play.firstYear}–${play.lastYear}`;
  return {
    kicker: 'Game Profile', title: gameName,
    subtitle: [known(meta.releaseYear) && `Released ${meta.releaseYear}`, known(meta.genre) && meta.genre, known(meta.developer) && meta.developer,
      known(meta.publisher) && meta.publisher !== meta.developer && meta.publisher, known(meta.franchise) && `${meta.franchise} series`, play.systems.join(', ')].filter(Boolean).join(' · '),
    badge: score !== null ? { value: formatScore(score), label: 'Yoshi score' } : null,
    footer: 'yoshi.gg · game profile',
    layout: [
      [{ type: 'stats', items: [
        { label: 'Total Time', value: formatTime(sum.seconds), sub: `${rankText(timeRank)} games` },
        { label: 'Days Played', value: play.days.length, sub: `avg ${formatTime(sum.seconds / play.days.length)} a day` },
        { label: 'Sessions', value: sum.sessions, sub: `avg ${formatTime(sum.seconds / sum.sessions)}` },
        { label: 'Longest Session', value: formatTime(play.longest.sec), sub: formatFullDate(play.longest.entry.date) },
        { label: 'Completions', value: completions.length, sub: pluralCount(playthroughs.length, 'playthrough') },
        { label: 'Played', value: span, sub: `${formatFullDate(sum.first.date)} to ${formatFullDate(sum.last.date)}` }
      ] }],
      [{ type: 'facts', title: 'Ratings and Rankings', items: ratings }, { type: 'facts', title: 'Records and Habits', items: play.facts }],
      play.chart ? [play.chart] : [],
      [yearTable, months].filter(Boolean),
      [playthroughTable],
      ...profileSpotlight(gameName, 'Videogame'),
      milestoneTable ? [milestoneTable] : []
    ]
  };
}

// --- SERIES CARD ---
function buildSeriesCard(series) {
  const entries = rawData.allEntries.filter(e => e.series === series);
  if (entries.length === 0) return null;
  const cache = profileCache();
  const play = profilePlayFacts(entries), sum = play.sum;
  const gameNames = [...sum.games.keys()];
  const inSeries = new Set(gameNames);
  const scoredGames = gameNames.map(g => ({ name: g, score: getGameScore(g) })).filter(g => g.score !== null).sort((a, b) => b.score - a.score);
  const average = scoredGames.length ? scoredGames.reduce((t, g) => t + g.score, 0) / scoredGames.length : null;
  const playthroughs = Object.values(rawData.playthroughHistory).filter(pt => inSeries.has(pt.gameName));
  const completions = getSortedCompletions('All-Time').filter(pt => inSeries.has(pt.gameName));
  const timeRank = profileRank(Object.fromEntries(cache.seriesSeconds), series);
  const metaOf = new Map(metaGames.map(g => [g.name, g]));
  const releaseYears = gameNames.map(g => (metaOf.get(g) || {}).releaseYear).filter(y => /^\d{4}$/.test(y)).sort();

  const ratings = [];
  if (average !== null) {
    ratings.push({ label: 'Average Yoshi score', value: `${average.toFixed(2)} across ${pluralCount(scoredGames.length, 'scored game')}` });
    // Against other series with at least three scored games
    const bySeries = {};
    metaGames.forEach(g => { if (g.score !== null && isRealSeries(g.franchise)) (bySeries[g.franchise] = bySeries[g.franchise] || []).push(g.score); });
    const averages = Object.fromEntries(Object.entries(bySeries).filter(([, scores]) => scores.length >= 3).map(([name, scores]) => [name, scores.reduce((a, b) => a + b, 0) / scores.length]));
    if (averages[series] !== undefined) ratings.push({ label: 'Average score, series with 3+ scored games', value: rankText(profileRank(averages, series)) });
    ratings.push({ label: 'Highest rated', value: `${scoredGames[0].name} (${formatScore(scoredGames[0].score)})` });
    if (scoredGames.length > 1) ratings.push({ label: 'Lowest rated', value: `${scoredGames[scoredGames.length - 1].name} (${formatScore(scoredGames[scoredGames.length - 1].score)})` });
    ratings.push({ label: 'Games scored 9 or higher', value: String(scoredGames.filter(g => g.score >= 9).length) });
    // Games that top their release year
    const winners = scoredGames.filter(g => {
      const year = (metaOf.get(g.name) || {}).releaseYear;
      return year && year !== 'Unknown' && !metaGames.some(o => o.releaseYear === year && o.score !== null && o.score > g.score);
    });
    ratings.push({ label: 'Games of the Year', value: winners.length ? winners.map(g => `${g.name} (${metaOf.get(g.name).releaseYear})`).join(', ') : 'None' });
  }
  ratings.push({ label: 'Most played series, all-time', value: rankText(timeRank) });
  ratings.push({ label: 'Share of all play time', value: `${(sum.seconds / [...cache.daySeconds.values()].reduce((t, games) => t + [...games.values()].reduce((a, b) => a + b, 0), 0) * 100).toFixed(2)}%` });
  const [topGame, topGameSec] = topOfMap(sum.games, 1)[0];
  ratings.push({ label: 'Most played game', value: `${topGame} (${formatTime(topGameSec)})` });
  const topGenre = topOfMap(sum.genres, 1)[0];
  if (topGenre) ratings.push({ label: 'Main genre', value: `${topGenre[0]} (${Math.round(topGenre[1] / sum.seconds * 100)}% of the time)` });
  ratings.push({ label: 'Playthroughs', value: `${playthroughs.length}: ${completions.length} completed, ${playthroughs.filter(pt => pt.finalStatus === 'Abandoned').length} abandoned` });

  // Every game in the series, most played first
  const completionsOf = name => completions.filter(pt => pt.gameName === name).length;
  const lists = rawData.metrics.top25Lists || [];
  const gameRows = topOfMap(sum.games, Infinity).map(([name, sec]) => {
    const gameEntries = entries.filter(e => e.game === name);
    const score = getGameScore(name);
    const latest = playthroughs.filter(pt => pt.gameName === name).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate))[0];
    const ranked = lists.filter(list => list.headersLeft[1] === 'Videogame' && list.allTime.some(row => row[1] === name));
    const leads = ranked.filter(list => list.allTime[0][1] === name).length;
    return [
      name, (metaOf.get(name) || {}).releaseYear || '', score !== null ? { text: formatScore(score), color: SHARE_COLORS.green, weight: 900 } : '-', formatTime(sec),
      new Set(gameEntries.map(e => e.date.slice(0, 10))).size, completionsOf(name) || '-',
      latest ? { text: latest.finalStatus, pill: SHARE_STATUS_COLORS[latest.finalStatus] || ['#ececec', '#555555'] } : '',
      formatFullDate(gameEntries[0].date), ranked.length ? `${ranked.length}${leads ? ` (#1 in ${leads})` : ''}` : '-'
    ];
  });
  const gamesTable = {
    type: 'table', title: `Games: ${gameRows.length}`,
    columns: [
      { label: 'Game', flex: 1, weight: 800 }, { label: 'Released', width: 105, align: 'center' }, { label: 'Score', width: 80, align: 'center' },
      { label: 'Time', width: 125, align: 'right', weight: 800 }, { label: 'Days', width: 70, align: 'right' }, { label: 'Completed', width: 110, align: 'center' },
      { label: 'Latest Status', width: 190, align: 'center' }, { label: 'First Played', width: 130, align: 'center' }, { label: 'Spotlight Lists', width: 165, align: 'right' }
    ],
    rows: gameRows
  };

  const yearRows = Object.keys(sum.byYear).sort().map(y => {
    const rank = profileRank(cache.yearSeries[y], series);
    const yearEntries = entries.filter(e => e.date.startsWith(y));
    const top = topOfMap(summarizeEntries(yearEntries).games, 1)[0];
    return [y, formatTime(sum.byYear[y]), new Set(yearEntries.map(e => e.date.slice(0, 10))).size, new Set(yearEntries.map(e => e.game)).size,
      { text: rankText(rank), color: rank.rank <= 5 ? SHARE_COLORS.green : SHARE_COLORS.text, weight: rank.rank <= 5 ? 900 : 600 }, `${top[0]} (${formatTime(top[1])})`];
  });
  const yearTable = {
    type: 'table', title: 'Year by Year',
    columns: [{ label: 'Year', width: 70, weight: 900 }, { label: 'Time', width: 120, align: 'right', weight: 800 }, { label: 'Days', width: 65, align: 'right' }, { label: 'Games', width: 75, align: 'right' },
      { label: 'Rank That Year', width: 130, align: 'right' }, { label: 'Most Played', flex: 1, align: 'right', size: 17 }],
    rows: yearRows
  };

  const completionTable = completions.length ? splitTable({
    type: 'table', title: `Completions: ${completions.length}`,
    columns: [{ label: 'Date', width: 125, weight: 800 }, { label: 'Game', flex: 1, weight: 700 }, { label: 'System', width: 110, align: 'center' }, { label: 'Time', width: 95, align: 'right', weight: 800 }],
    rows: completions.map(pt => [formatFullDate(pt.displayDate), pt.gameName, toList(pt.systems).join(', '), pt.finalPtLifetime])
  }) : [];

  const span = play.firstYear === play.lastYear ? play.firstYear : `${play.firstYear}–${play.lastYear}`;
  return {
    kicker: 'Series Profile', title: series,
    subtitle: [pluralCount(gameNames.length, 'game'), releaseYears.length ? `Released ${releaseYears[0]}${releaseYears[releaseYears.length - 1] !== releaseYears[0] ? `–${releaseYears[releaseYears.length - 1]}` : ''}` : '',
      topGenre ? topGenre[0] : '', play.systems.join(', ')].filter(Boolean).join(' · '),
    badge: average !== null ? { value: average.toFixed(1), label: 'Average score' } : null,
    footer: 'yoshi.gg · series profile',
    layout: [
      [{ type: 'stats', items: [
        { label: 'Total Time', value: formatTime(sum.seconds), sub: `${rankText(timeRank)} series` },
        { label: 'Games', value: gameNames.length, sub: `${pluralCount(scoredGames.length, 'game')} scored` },
        { label: 'Days Played', value: play.days.length, sub: `avg ${formatTime(sum.seconds / play.days.length)} a day` },
        { label: 'Longest Session', value: formatTime(play.longest.sec), sub: play.longest.entry.game },
        { label: 'Completions', value: completions.length, sub: pluralCount(playthroughs.length, 'playthrough') },
        { label: 'Played', value: span, sub: `${formatFullDate(sum.first.date)} to ${formatFullDate(sum.last.date)}` }
      ] }],
      [{ type: 'facts', title: 'Ratings and Rankings', items: ratings }, { type: 'facts', title: 'Records and Habits', items: play.facts }],
      play.chart ? [play.chart] : [],
      [gamesTable],
      [yearTable, profileMonthChips(cache.monthSeries, series, 'series')].filter(Boolean),
      completionTable,
      ...profileSpotlight(series, 'Series')
    ]
  };
}
