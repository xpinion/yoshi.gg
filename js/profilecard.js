// profilecard.js - Builds the share cards for one game or one series: every number the site has on it, laid out
// for drawProfileCard in share.js. Used by the Share Cards page (card.html) and the game profile's Share button.

// --- Lookups shared by both cards, built once ---
let _profileCache = null;
function profileCache() {
  if (_profileCache) return _profileCache;
  // Each day's time per game: { day: Map(game -> seconds) }
  const cache = { daySeconds: new Map() };
  rawData.allEntries.forEach(e => {
    const day = e.date.slice(0, 10);
    if (!cache.daySeconds.has(day)) cache.daySeconds.set(day, new Map());
    const games = cache.daySeconds.get(day);
    games.set(e.game, (games.get(e.game) || 0) + timeStringToSeconds(e.time));
  });
  return (_profileCache = cache);
}
function isRealSeries(series) { return !!series && !['ZZNONE', 'N/A', 'Unknown', '-'].includes(series); }

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

  // Then and now: the longest wait between finishing it and finishing it again
  if (completions.length > 1) {
    const finished = completions.map(pt => ({ pt, date: pt.completionDates && pt.completionDates[0] || pt.lastDate })).sort((a, b) => new Date(a.date) - new Date(b.date));
    let wait = null;
    for (let i = 1; i < finished.length; i++) {
      const days = Math.round((new Date(finished[i].date) - new Date(finished[i - 1].date)) / 86400000);
      if (!wait || days > wait.days) wait = { days, then: finished[i - 1], now: finished[i] };
    }
    ratings.push({ label: 'Longest wait between completions', value: `${pluralCount(wait.days, 'day')}: ${wait.then.pt.finalPtLifetime} on ${toList(wait.then.pt.systems).join(', ')} in ${formatFullDate(wait.then.date).slice(0, 4)}, then ${wait.now.pt.finalPtLifetime} on ${toList(wait.now.pt.systems).join(', ')} in ${formatFullDate(wait.now.date).slice(0, 4)}` });
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

// --- GROUP CARDS: a series, system, genre, developer, publisher, multiplayer partner or year ---
// valueOf picks the group a log entry belongs to. Kinds without it choose their entries another way and have no
// rivals to rank against. spotlight is the Spotlight column heading that ranks this kind.
const CARD_KINDS = {
  series: { label: 'Series', noun: 'series', plural: 'series', valueOf: e => e.series, spotlight: 'Series', page: name => `franchise.html?item=${encodeURIComponent(name)}` },
  system: { label: 'System', noun: 'system', plural: 'systems', valueOf: e => e.system, spotlight: 'System', page: name => `systems.html?item=${encodeURIComponent(name)}` },
  genre: { label: 'Genre', noun: 'genre', plural: 'genres', valueOf: e => e.genre, spotlight: 'Genre', page: name => `genre.html?item=${encodeURIComponent(name)}` },
  developer: { label: 'Developer', noun: 'developer', plural: 'developers', valueOf: e => e.developer, spotlight: 'Developer' },
  publisher: { label: 'Publisher', noun: 'publisher', plural: 'publishers', valueOf: e => e.publisher, spotlight: 'Publisher' },
  partner: { label: 'Partner', noun: 'partner', plural: 'partners', page: name => `partner.html?name=${encodeURIComponent(name)}` },
  year: { label: 'Year', noun: 'year', plural: 'years', valueOf: e => e.date.slice(0, 4), page: name => `review.html?year=${name}` }
};
const CARD_MAX_GAME_ROWS = 30, CARD_MAX_COMPLETION_ROWS = 60;

// For a kind with valueOf: every group's total time, its time by month and by year, and the games in it
const _kindTotals = {};
function cardKindTotals(kind) {
  if (_kindTotals[kind]) return _kindTotals[kind];
  const totals = { seconds: {}, byMonth: {}, byYear: {}, games: {} };
  const bump = (obj, key, name, sec) => { (obj[key] = obj[key] || {})[name] = (obj[key][name] || 0) + sec; };
  rawData.allEntries.forEach(e => {
    const name = CARD_KINDS[kind].valueOf(e);
    if (!isRealSeries(name)) return;
    const sec = timeStringToSeconds(e.time);
    totals.seconds[name] = (totals.seconds[name] || 0) + sec;
    bump(totals.byMonth, e.date.slice(0, 7), name, sec);
    bump(totals.byYear, e.date.slice(0, 4), name, sec);
    (totals.games[name] = totals.games[name] || new Set()).add(e.game);
  });
  return (_kindTotals[kind] = totals);
}
// Names a card of this kind can be made for
function cardNames(kind) {
  if (kind === 'game') return [...new Set(rawData.allEntries.map(e => e.game))].sort((a, b) => a.localeCompare(b));
  if (kind === 'partner') return [...getPartners().map(p => p.name), ...(getPartners().length > 1 ? ['Family'] : [])];
  const names = Object.keys(cardKindTotals(kind).seconds);
  return kind === 'year' ? names.sort().reverse() : names.sort((a, b) => a.localeCompare(b));
}
function cardEntries(kind, name) {
  if (kind === 'partner') {
    const partners = getPartners();
    // "Family" is the sessions that mention everyone
    if (name === 'Family') return rawData.allEntries.filter(e => isMultiplayerEntry(e) && partners.every(p => p.noteNames.some(n => (e.note || '').toUpperCase().includes(n))));
    const partner = partners.find(p => p.name === name);
    return partner ? partnerEntries(partner) : [];
  }
  return rawData.allEntries.filter(e => CARD_KINDS[kind].valueOf(e) === name);
}
// Any card by kind: 'game' or one of CARD_KINDS
function buildCard(kind, name) { return kind === 'game' ? buildGameCard(name) : buildGroupCard(kind, name); }

function buildGroupCard(kind, name) {
  const info = CARD_KINDS[kind];
  const entries = info ? cardEntries(kind, name) : [];
  if (entries.length === 0) return null;
  const cache = profileCache();
  const totals = info.valueOf ? cardKindTotals(kind) : null;
  const isYear = kind === 'year';
  const play = profilePlayFacts(entries), sum = play.sum;
  const gameNames = [...sum.games.keys()];
  const scoredGames = gameNames.map(g => ({ name: g, score: getGameScore(g) })).filter(g => g.score !== null).sort((a, b) => b.score - a.score);
  const average = scoredGames.length ? scoredGames.reduce((t, g) => t + g.score, 0) / scoredGames.length : null;
  // Playthroughs with at least one session in the group
  const tags = new Set(entries.map(e => e.ptTag));
  const playthroughs = Object.values(rawData.playthroughHistory).filter(pt => tags.has(pt.ptTag));
  const completions = getSortedCompletions('All-Time').filter(pt => tags.has(pt.ptTag) && (!isYear || pt.displayDate.toISOString().startsWith(name)));
  const timeRank = totals ? profileRank(totals.seconds, name) : null;
  const metaOf = new Map(metaGames.map(g => [g.name, g]));
  const releaseYears = gameNames.map(g => (metaOf.get(g) || {}).releaseYear).filter(y => /^\d{4}$/.test(y)).sort();
  const allSeconds = [...cache.daySeconds.values()].reduce((t, games) => t + [...games.values()].reduce((a, b) => a + b, 0), 0);

  // A year's own releases: the scored games that came out that year, best first, whenever they were played
  const everPlayed = new Set(rawData.gameNames || []);
  const yearReleases = isYear ? metaGames.filter(g => g.releaseYear === name && g.score !== null && everPlayed.has(g.name))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)) : [];
  const releasesTable = yearReleases.length ? {
    type: 'table', title: `Best ${name} Releases: ${Math.min(10, yearReleases.length)} of ${yearReleases.length} scored`,
    columns: [{ label: '#', width: 50, align: 'center', weight: 900, color: SHARE_COLORS.green }, { label: 'Game', flex: 1, weight: 800 }, { label: 'Score', width: 80, align: 'center', weight: 900, color: SHARE_COLORS.green },
      { label: `Time in ${name}`, width: 140, align: 'right', weight: 800 }, { label: 'Genre', width: 230, align: 'right', size: 17 }],
    rows: yearReleases.slice(0, 10).map((g, i) => [i + 1, g.name, formatScore(g.score), sum.games.has(g.name) ? formatTime(sum.games.get(g.name)) : 'Played later', g.genre === 'Unknown' ? '' : g.genre])
  } : null;

  const ratings = [];
  if (average !== null) {
    ratings.push({ label: 'Average Yoshi score', value: `${average.toFixed(2)} across ${pluralCount(scoredGames.length, 'scored game')}` });
    if (totals) {
      // Against the other groups of this kind with at least three scored games
      const averages = {};
      Object.entries(totals.games).forEach(([group, games]) => {
        const scores = [...games].map(g => getGameScore(g)).filter(v => v !== null);
        if (scores.length >= 3) averages[group] = scores.reduce((a, b) => a + b, 0) / scores.length;
      });
      if (averages[name] !== undefined) ratings.push({ label: `Average score, ${info.plural} with 3+ scored games`, value: rankText(profileRank(averages, name)) });
    }
    if (yearReleases.length) ratings.push({ label: `Best ${name} release`, value: `${yearReleases[0].name} (${formatScore(yearReleases[0].score)})` });
    ratings.push({ label: isYear ? 'Highest rated game played, any release year' : 'Highest rated', value: `${scoredGames[0].name} (${formatScore(scoredGames[0].score)})` });
    if (scoredGames.length > 1) ratings.push({ label: 'Lowest rated', value: `${scoredGames[scoredGames.length - 1].name} (${formatScore(scoredGames[scoredGames.length - 1].score)})` });
    ratings.push({ label: 'Games scored 9 or higher', value: String(scoredGames.filter(g => g.score >= 9).length) });
    // Games that top their release year
    const winners = scoredGames.filter(g => {
      const year = (metaOf.get(g.name) || {}).releaseYear;
      return year && year !== 'Unknown' && !metaGames.some(o => o.releaseYear === year && o.score !== null && o.score > g.score);
    });
    ratings.push({ label: 'Games of the Year', value: winners.length ? `${winners.slice(0, 8).map(g => `${g.name} (${metaOf.get(g.name).releaseYear})`).join(', ')}${winners.length > 8 ? ` and ${winners.length - 8} more` : ''}` : 'None' });
  }
  if (timeRank) ratings.push({ label: `Most played ${info.plural}, all-time`, value: rankText(timeRank) });
  ratings.push({ label: 'Share of all play time', value: `${(sum.seconds / allSeconds * 100).toFixed(2)}%` });
  const [topGame, topGameSec] = topOfMap(sum.games, 1)[0];
  ratings.push({ label: 'Most played game', value: `${topGame} (${formatTime(topGameSec)})` });
  const topGenre = kind === 'genre' ? null : topOfMap(sum.genres, 1)[0];
  if (topGenre) ratings.push({ label: 'Main genre', value: `${topGenre[0]} (${Math.round(topGenre[1] / sum.seconds * 100)}% of the time)` });
  const topSeries = kind === 'series' ? null : topOfMap(sum.series, 1)[0];
  if (topSeries) ratings.push({ label: 'Main series', value: `${topSeries[0]} (${formatTime(topSeries[1])})` });
  ratings.push({ label: 'Playthroughs', value: `${playthroughs.length}: ${completions.length} completed, ${playthroughs.filter(pt => pt.finalStatus === 'Abandoned').length} abandoned` });
  if (isYear) {
    // Games whose very first session was this year, and the year's milestones
    const firstYear = {};
    rawData.allEntries.forEach(e => { if (!firstYear[e.game]) firstYear[e.game] = e.date.slice(0, 4); });
    ratings.push({ label: 'Games played for the first time', value: `${gameNames.filter(g => firstYear[g] === name).length} of ${gameNames.length}` });
  }

  // The games in the group, most played first
  const completionsOf = game => completions.filter(pt => pt.gameName === game).length;
  const lists = rawData.metrics.top25Lists || [];
  const rankedGames = topOfMap(sum.games, Infinity);
  const gameRows = rankedGames.slice(0, CARD_MAX_GAME_ROWS).map(([game, sec]) => {
    const gameEntries = entries.filter(e => e.game === game);
    const score = getGameScore(game);
    const latest = playthroughs.filter(pt => pt.gameName === game).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate))[0];
    const ranked = lists.filter(list => list.headersLeft[1] === 'Videogame' && list.allTime.some(row => row[1] === game));
    const leads = ranked.filter(list => list.allTime[0][1] === game).length;
    return [
      game, (metaOf.get(game) || {}).releaseYear || '', score !== null ? { text: formatScore(score), color: SHARE_COLORS.green, weight: 900 } : '-', formatTime(sec),
      new Set(gameEntries.map(e => e.date.slice(0, 10))).size, completionsOf(game) || '-',
      latest ? { text: latest.finalStatus, pill: SHARE_STATUS_COLORS[latest.finalStatus] || ['#ececec', '#555555'] } : '',
      formatFullDate(gameEntries[0].date), ranked.length ? `${ranked.length}${leads ? ` (#1 in ${leads})` : ''}` : '-'
    ];
  });
  const gamesTable = {
    type: 'table', title: rankedGames.length > gameRows.length ? `Games: the ${gameRows.length} most played of ${rankedGames.length}` : `Games: ${gameRows.length}`,
    columns: [
      { label: 'Game', flex: 1, weight: 800 }, { label: 'Released', width: 105, align: 'center' }, { label: 'Score', width: 80, align: 'center' },
      { label: 'Time', width: 125, align: 'right', weight: 800 }, { label: 'Days', width: 70, align: 'right' }, { label: 'Completed', width: 110, align: 'center' },
      { label: 'Latest Status', width: 190, align: 'center' }, { label: isYear ? 'First That Year' : 'First Played', width: 140, align: 'center' }, { label: 'Spotlight Lists', width: 165, align: 'right' }
    ],
    rows: gameRows
  };

  // A year is broken down by month; everything else by year
  const periodKeys = Object.keys(isYear ? sum.byMonth : sum.byYear).sort();
  const periodRows = periodKeys.map(key => {
    const periodEntries = entries.filter(e => e.date.startsWith(key));
    const top = topOfMap(summarizeEntries(periodEntries).games, 1)[0];
    const row = [isYear ? MONTH_NAMES[Number(key.slice(5)) - 1] : key, formatTime((isYear ? sum.byMonth : sum.byYear)[key]),
      new Set(periodEntries.map(e => e.date.slice(0, 10))).size, new Set(periodEntries.map(e => e.game)).size];
    if (totals && !isYear) {
      const rank = profileRank(totals.byYear[key], name);
      row.push({ text: rankText(rank), color: rank.rank <= 5 ? SHARE_COLORS.green : SHARE_COLORS.text, weight: rank.rank <= 5 ? 900 : 600 });
    }
    row.push(`${top[0]} (${formatTime(top[1])})`);
    return row;
  });
  const periodTable = {
    type: 'table', title: isYear ? 'Month by Month' : 'Year by Year',
    columns: [{ label: isYear ? 'Month' : 'Year', width: isYear ? 130 : 70, weight: 900 }, { label: 'Time', width: 120, align: 'right', weight: 800 }, { label: 'Days', width: 65, align: 'right' }, { label: 'Games', width: 75, align: 'right' },
      ...(totals && !isYear ? [{ label: 'Rank That Year', width: 130, align: 'right' }] : []), { label: 'Most Played', flex: 1, align: 'right', size: 17 }],
    rows: periodRows
  };
  const months = totals && !isYear ? profileMonthChips(totals.byMonth, name, info.noun) : null;

  const shownCompletions = isYear ? completions : completions.slice(-CARD_MAX_COMPLETION_ROWS); // a year shows all of its own
  const completionTable = completions.length ? splitTable({
    type: 'table', title: shownCompletions.length < completions.length ? `Completions: the latest ${shownCompletions.length} of ${completions.length}` : `Completions: ${completions.length}`,
    columns: [{ label: 'Date', width: 125, weight: 800 }, { label: 'Game', flex: 1, weight: 700 }, { label: 'System', width: 110, align: 'center' }, { label: 'Time', width: 95, align: 'right', weight: 800 }],
    rows: shownCompletions.map(pt => [formatFullDate(pt.displayDate), pt.gameName, toList(pt.systems).join(', '), pt.finalPtLifetime])
  }) : [];

  // A year's own milestones: records and firsts, newest first
  let milestoneTable = null;
  if (isYear) {
    const all = (rawData.metrics.milestones || []).filter(m => String(m.date).startsWith(name));
    const shown = all.filter(m => m.type !== 'ranking').sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);
    if (shown.length) milestoneTable = {
      type: 'table', title: `Milestones: ${all.length}`,
      columns: [{ label: 'Date', width: 130, weight: 800 }, { label: 'Milestone', flex: 1, maxLines: 3 }],
      rows: shown.map(m => [formatFullDate(m.date), m.details]),
      note: all.length > shown.length ? `Plus ${all.length - shown.length} more on the Milestones page at yoshi.gg` : ''
    };
  }

  const span = play.firstYear === play.lastYear ? play.firstYear : `${play.firstYear}–${play.lastYear}`;
  const inProgress = isYear && dataDateKey().startsWith(name);
  return {
    kicker: isYear ? 'Year in Review' : `${info.label} Profile`, title: isYear ? `${name} in Review` : (kind === 'partner' ? `Multiplayer with ${name}` : name),
    subtitle: [inProgress ? `So far, through ${formatFullDate(dataDateKey())}` : '', pluralCount(gameNames.length, 'game'),
      !isYear && releaseYears.length ? `Released ${releaseYears[0]}${releaseYears[releaseYears.length - 1] !== releaseYears[0] ? `–${releaseYears[releaseYears.length - 1]}` : ''}` : '',
      topGenre ? topGenre[0] : '', kind === 'system' ? '' : play.systems.slice(0, 12).join(', ')].filter(Boolean).join(' · '),
    badge: average !== null ? { value: average.toFixed(1), label: 'Average score' } : null,
    footer: `yoshi.gg · ${isYear ? 'year in review' : `${info.noun} profile`}`,
    layout: [
      [{ type: 'stats', items: [
        { label: 'Total Time', value: formatTime(sum.seconds), sub: timeRank ? `${rankText(timeRank)} ${info.plural}` : `${sum.sessions.toLocaleString('en-US')} sessions` },
        { label: 'Games', value: gameNames.length, sub: `${pluralCount(scoredGames.length, 'game')} scored` },
        { label: 'Days Played', value: play.days.length, sub: `avg ${formatTime(sum.seconds / play.days.length)} a day` },
        { label: 'Longest Session', value: formatTime(play.longest.sec), sub: play.longest.entry.game },
        { label: 'Completions', value: completions.length, sub: pluralCount(playthroughs.length, 'playthrough') },
        isYear ? { label: 'Sessions', value: sum.sessions.toLocaleString('en-US'), sub: `avg ${formatTime(sum.seconds / sum.sessions)}` }
          : { label: 'Played', value: span, sub: `${formatFullDate(sum.first.date)} to ${formatFullDate(sum.last.date)}` }
      ] }],
      [{ type: 'facts', title: 'Ratings and Rankings', items: ratings }, { type: 'facts', title: 'Records and Habits', items: play.facts }],
      play.chart ? [play.chart] : [],
      [gamesTable],
      [periodTable, months, releasesTable].filter(Boolean),
      completionTable,
      ...(info.spotlight ? profileSpotlight(name, info.spotlight) : []),
      milestoneTable ? [milestoneTable] : []
    ]
  };
}
