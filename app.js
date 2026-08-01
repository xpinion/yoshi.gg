// app.js - Logic for Yoshi's Videogame Dashboard

// Global State
let rawData = null;
let metaGames = [];
let metaScores = new Map();
let allTop25Tables = [];

// Constants for Metadata Columns
const META_GAME = 0;
const META_RELEASE_YEAR = 1;
const META_GENRE = 2;
const META_DEVELOPER = 3;
const META_PUBLISHER = 4;
const META_SERIES = 5;
const META_YOSCORE = 6;

// Utilities
function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds === 0) return "0m";
  const mins = Math.floor(totalSeconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}
function formatShortDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}
// Utility: Format date to "YYYY/MM/DD"
function formatFullDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}
function timeStringToSeconds(timeString) {
  if (!timeString || typeof timeString !== 'string') return 0;
  const p = timeString.split(':').map(s => parseInt(s, 10));
  if (p.length === 3) return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
  if (p.length === 2) return (p[0] || 0) * 3600 + (p[1] || 0) * 60;
  return 0;
}
function formatHHMM(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return "00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
function getStatusColor(status) {
  switch (status) {
    case 'Completed': case 'M-Completed': return '#00FF00';
    case 'Active': return '#FFFF00';
    case 'Multiplayer': return '#00FFFF';
    case 'Abandoned': return '#FFCCCC';
    case 'Postgame': return '#FFA500';
    case 'Non-Completable': return '#DDDDDD';
    default: return '#FFFFFF';
  }
}
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// Initialization
async function initDashboard() {
  try {
    const [rawResponse, metaResponse, top25Response] = await Promise.all([
      fetch('raw_dashboard_data.json'),
      fetch('metadata_data.json'),
      fetch('top25_data.json')
    ]);

    const rawText = await rawResponse.text();
    rawData = JSON.parse(rawText);
      // ONLY Revive Sets (Leave Dates as strings so .startsWith() and .split() work!)
      if (value && typeof value === 'object' && value._dataType === 'Set') {
        // Look for the array in value.value, falling back to value.data just in case
        const arrayItems = value.value || value.data || [];
        return new Set(arrayItems);
      }
      return value;
    });
    
    const metaData = await metaResponse.json();
    const top25Data = await top25Response.json();

    for (let i = 1; i < metaData.values.length; i++) {
      const row = metaData.values[i];
      if (row && row[META_GAME]) {
        const score = parseFloat(row[META_YOSCORE]);
        metaGames.push({
          name: row[META_GAME], releaseYear: row[META_RELEASE_YEAR] || 'Unknown',
          genre: row[META_GENRE] || 'Unknown', developer: row[META_DEVELOPER] || 'Unknown',
          publisher: row[META_PUBLISHER] || 'Unknown', franchise: row[META_SERIES] || 'Unknown',
          score: isNaN(score) ? null : score
        });
        metaScores.set(row[META_GAME], isNaN(score) ? '-' : score);
      }
    }

    parseTop25Data(top25Data);
    setupDropdowns();
    setupThemeToggle();
    setupLiveSearch();
    setupHoverHistory();
    renderOnThisDay();
    renderMilestones();
    renderAnalysis('playthrough');
    renderHeatmap('gameSummary');

    // Trigger the staggered fade-in animations for all cards
    document.querySelectorAll('.card').forEach((card, index) => {
      card.style.animationDelay = `${index * 0.08}s`; // 80ms delay per card
    });
    
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    document.querySelectorAll('.card-content').forEach(el => el.innerHTML = `<div class="loading-text" style="color: red;">Error loading data.</div>`);
  }
}

function parseTop25Data(top25Data) {
  allTop25Tables = [];
  const currentYear = new Date().getFullYear();

  // --- CORE HELPERS ---
  const getRank = (val, prev, idx) => val === prev ? "" : `#${idx + 1}`;
  const getSysStr = (sys) => Array.isArray(sys) ? sys.join(', ') : (sys?.data ? sys.data.join(', ') : (sys || ''));
  const getBold = (dateStr) => dateStr ? new Date(dateStr).getFullYear() === currentYear : false;

  const buildDualTable = (mainTitle, rightTitle, leftData, rightData, headers, leftFn, rightFn, rightHeaders = null) => {
    if (!leftData || leftData.length === 0) return;
    
    let prevVal = null;
    const leftRows = leftData.map((item, i) => {
      const row = leftFn(item, i, prevVal);
      prevVal = row.rawVal;
      return [
        { val: row.c1, isBold: row.isBold }, { val: row.c2, isBold: row.isBold },
        { val: row.c3, isBold: row.isBold }, { val: row.c4, isBold: row.isBold },
        { val: row.c5, isBold: row.isBold }
      ];
    });

    const rightRows = rightData ? rightData.map(w => {
      const row = rightFn(w);
      return [
        { val: row.c1, isBold: false }, { val: row.c2, isBold: false },
        { val: row.c3, isBold: false }, { val: row.c4, isBold: false },
        { val: row.c5, isBold: false }
      ];
    }) : [];

    allTop25Tables.push({
      type: rightData ? 'dual' : 'single',
      mainTitle: mainTitle,
      left: { title: mainTitle, headers: headers, rows: leftRows },
      right: rightData ? { title: rightTitle, headers: rightHeaders || ["Year", ...headers.slice(1)], rows: rightRows } : null
    });
  };

  // --- STANDARD FORMATTERS ---
  
  const fmtStreak = (item, i, prev) => ({
    rawVal: item.length, c1: getRank(item.length, prev, i), c2: item.length,
    c3: formatFullDate(item.start || item.startDate), c4: formatFullDate(item.end || item.endDate),
    c5: item.detailsString || item.brokenBy || `${item.game || item.system} ${item.systems ? `(${getSysStr(item.systems)})` : ''}`,
    isBold: getBold(item.end || item.endDate)
  });
  
  const fmtStreakYr = (w) => ({
    c1: w.year, c2: w.data.clippedLength || w.data.length || w.data.value,
    c3: formatFullDate(w.data.clippedStart || w.data.minDate || w.data.start || w.data.startDate), 
    c4: formatFullDate(w.data.clippedEnd || w.data.maxDate || w.data.end || w.data.endDate),
    c5: w.data.detailsString || w.data.brokenBy || `${w.data.game || w.data.system} ${w.data.systems ? `(${getSysStr(w.data.systems)})` : ''}`
  });

  const fmtEvt = (valKey, sKey, eKey, descFn, isTime=false) => (item, i, prev) => {
    const v = item[valKey]; const endD = item[eKey] || item[sKey];
    return { rawVal: v, c1: getRank(v, prev, i), c2: isTime ? formatHHMM(v) : v,
      c3: formatFullDate(item[sKey]), c4: formatFullDate(endD),
      c5: descFn(item), isBold: getBold(endD) };
  };
  
  const fmtEvtYr = (valKey, sKey, eKey, descFn, isTime=false) => (w) => {
    if(!w || !w.data) return { c1: w.year, c2: "-", c3: "-", c4: "-", c5: "-" };
    const endD = w.data[eKey] || w.data[sKey];
    return { c1: w.year, c2: isTime ? formatHHMM(w.data[valKey]) : w.data[valKey],
      c3: formatFullDate(w.data[sKey]), c4: formatFullDate(endD), c5: descFn(w.data) };
  };

  const fmtStat = (isTime) => (item, i, prev) => {
    const v = item.totalSeconds ?? item.value ?? item.count ?? item.days?.length ?? item.days?.size ?? 0;
    const d1 = item.minDate || item.firstPlayed || item.firstSeen || item.firstDate;
    const d2 = item.maxDate || item.lastPlayed || item.lastSeen || item.lastDate;
    let desc = item.name || item.game || item.gameName;
    if (item.systems) desc += ` (${getSysStr(item.systems)})`;
    if (item.games && (item.games.size > 0 || item.games.length > 0)) desc += ` (${item.games.size || item.games.length} Games)`;
    return { rawVal: v, c1: getRank(v, prev, i), c2: isTime ? formatHHMM(v) : v,
      c3: formatFullDate(d1), c4: formatFullDate(d2), c5: desc, isBold: getBold(d2) };
  };
  
  const fmtStatYr = (isTime) => (w) => {
    const d = w.data; if (!d) return { c1: w.year, c2: "-", c3: "-", c4: "-", c5: "-" };
    const v = d.totalSeconds ?? d.value ?? d.count ?? d.days?.length ?? d.days?.size ?? 0;
    const d1 = d.minDate || d.firstPlayed || d.firstSeen || d.firstDate;
    const d2 = d.maxDate || d.lastPlayed || d.lastSeen || d.lastDate;
    let desc = d.name || d.game || d.gameName;
    if (d.systems) desc += ` (${getSysStr(d.systems)})`;
    if (d.games && (d.games.size > 0 || d.games.length > 0)) desc += ` (${d.games.size || d.games.length} Games)`;
    return { c1: w.year, c2: isTime ? formatHHMM(v) : v, c3: formatFullDate(d1), c4: formatFullDate(d2), c5: desc };
  };

  // --- INJECTING THE TABLES ---
  if (!top25Data) return;

  // 1. Streaks
  buildDualTable("Top 25 Gaming Streaks", "Longest Gaming Streak by Year", top25Data.topGamingStreaks, top25Data.yearlyGamingStreaks, ["Rank", "Length (Days)", "Start Date", "End Date", "# Games / Top 3 Played"], fmtStreak, fmtStreakYr);
  buildDualTable("Top 25 Non-Gaming Streaks", "Longest Break by Year", top25Data.topBreakStreaks, top25Data.yearlyBreakStreaks, ["Rank", "Length (Days)", "Start Date", "End Date", ""], fmtStreak, fmtStreakYr);
  buildDualTable("Top 25 Same-Game Streaks", "Longest Same-Game Streak by Year", top25Data.topSameGameStreaks, top25Data.yearlySameGameStreaks, ["Rank", "Length (Days)", "Start Date", "End Date", "Videogame [Time Spent]"], fmtStreak, fmtStreakYr);
  buildDualTable("Top 25 Consecutive Entries for One System", "Longest System Streak by Year", top25Data.systemStreaks, top25Data.yearlySystemStreaks, ["Rank", "Entries", "Start", "End", "System"], fmtStreak, fmtStreakYr);
  buildDualTable("Completion Streaks", "Longest Completion Streak by Year", top25Data.topCompletionStreaks, top25Data.yearlyCompletionStreaks, ["Rank", "Count", "Start", "End", "Start / End / Broken By"], 
    fmtEvt('length', 'startDate', 'endDate', i => `${i.games[0]} / ${i.games[i.games.length-1]} / ${i.brokenBy||''}`), 
    fmtEvtYr('clippedLength', 'clippedStart', 'clippedEnd', i => `${i.clippedGames[0]} / ${i.clippedGames[i.clippedGames.length-1]} / ${i.brokenBy||''}`));

  // 2. Completions
  buildDualTable("Top 25 One-Sitting Completions", "Longest One-Sitting Clear by Year", top25Data.oneSittingCompletions, top25Data.yearlyOneSittingCompletions, ["Rank", "Time", "Date", "System", "Game [Note]"], 
    fmtEvt('finalPtLifetime', 'lastDate', 'lastDate', i => `${i.gameName} (${i.system}) [${i.finalNote}]`), fmtEvtYr('finalPtLifetime', 'lastDate', 'lastDate', i => `${i.gameName} (${i.system}) [${i.finalNote}]`));
  buildDualTable("Longest Completions (Time)", "Longest Completion (Time) by Year", top25Data.sortedLongestCompletionsByTime, top25Data.yearlyCompletionsByTime, ["Rank", "Time", "Start", "End", "Game [Note]"],
    fmtEvt('finalPtLifetime', 'startDate', 'lastDate', i => `${i.gameName} (${i.system}) [${i.finalNote}]`), fmtEvtYr('finalPtLifetime', 'startDate', 'lastDate', i => `${i.gameName} (${i.system}) [${i.finalNote}]`));
  buildDualTable("Longest Completions (Days)", "Longest Completion (Days) by Year", top25Data.sortedLongestCompletionsByDays, top25Data.yearlyCompletionsByDays, ["Rank", "Days", "Start", "End", "Game [Note]"],
    fmtEvt('durationDays', 'startDate', 'lastDate', i => `${i.gameName} (${i.system}) [${i.finalNote}]`), fmtEvtYr('durationDays', 'startDate', 'lastDate', i => `${i.gameName} (${i.system}) [${i.finalNote}]`));
  buildDualTable("Fastest Completions (Time)", "Fastest Completion by Year", top25Data.topFastestCompletions, top25Data.yearlyFastestCompletions, ["Rank", "Time", "Start", "End", "Game [Note]"],
    fmtEvt('finalPtLifetime', 'startDate', 'lastDate', i => `${i.gameName} (${i.system}) [${i.finalNote}]`), fmtEvtYr('finalPtLifetime', 'startDate', 'lastDate', i => `${i.gameName} (${i.system}) [${i.finalNote}]`));
  buildDualTable("Top 25 Longest to Abandon", "Longest Abandon by Year", top25Data.topAbandoned, top25Data.yearlyAbandoned, ["Rank", "Time Invested", "Start", "End", "Game"],
    fmtEvt('totalSeconds', 'startDate', 'lastDate', i => `${i.gameName} (${i.system})`, true), fmtEvtYr('totalSeconds', 'startDate', 'lastDate', i => `${i.gameName} (${i.system})`, true));
  buildDualTable("Most Completed Games", "Most Completed Game by Year", top25Data.topCompletedGames, top25Data.yearlyCompletedGames, ["Rank", "Count", "First", "Last", "Game [Dates]"],
    fmtEvt('completions', 'firstStartDate', 'lastUpdateDate', i => `${i.gameName} [${i.completionDates.map(d=>formatFullDate(d)).join(', ')}]`),
    fmtEvtYr('completions', 'firstStartDate', 'lastUpdateDate', i => `${i.gameName} [${i.completionDates.map(d=>formatFullDate(d)).join(', ')}]`));
  
  buildDualTable("Top 25 Busiest Completion Days", "Busiest Completion Day by Year", top25Data.topCompletionDays, top25Data.yearlyCompletionDays, ["Rank", "# Completions", "Date", "", "Games"],
    fmtEvt('count', 'date', 'date', i => i.games.map(g => `${g.name} (${g.system})`).join(', ')), fmtEvtYr('count', 'date', 'date', i => i.games.map(g => `${g.name} (${g.system})`).join(', ')));
  buildDualTable("Top 25 Busiest Completion Months", "Busiest Completion Month by Year", top25Data.topCompletionMonths, top25Data.yearlyCompletionMonths, ["Rank", "# Completions", "Start", "End", "Month [Games]"],
    fmtEvt('count', 'minDate', 'maxDate', i => `${i.monthKey} [${i.games.map(g => g.name).join(', ')}]`), fmtEvtYr('count', 'minDate', 'maxDate', i => `${i.monthKey} [${i.games.map(g => g.name).join(', ')}]`));
  buildDualTable("Top 25 Busiest Completion Weeks", "Busiest Completion Week by Year", top25Data.topCompletionWeeks, top25Data.yearlyCompletionWeeks, ["Rank", "# Completions", "Start", "End", "Games Completed"],
    fmtEvt('count', 'startDate', 'endDate', i => i.gamesPlayed), fmtEvtYr('count', 'startDate', 'endDate', i => i.gamesPlayed));

  // 3. Time & Days Played Presence
  buildDualTable("Games Played Across Most Years", "Active Leader (Most Years) by Year", top25Data.topGamesByYearCount, top25Data.yearlyRunningYearsPlayed, ["Rank", "# Years", "First", "Last", "Game [Years]"],
    fmtEvt('count', 'firstPlayed', 'lastPlayed', i => `${i.game} [${i.years.join(', ')}]`),
    (w) => ({ c1: w.year, c2: w.maxCount, c3: "-", c4: "-", c5: w.leaders ? w.leaders.map(l => l.game).join(' / ') : "(Many Tied)" }), ["Year", "# Years", "-", "-", "Active Leader(s)"]);
  buildDualTable("Games Played Across Most Months", "Game Played Across Most Months by Year", top25Data.topGamesByMonthCount, top25Data.yearlyGamesByMonthCount, ["Rank", "# Months", "First", "Last", "Game [Months]"],
    fmtEvt('count', 'firstPlayed', 'lastPlayed', i => `${i.game} [${i.months.join(', ')}]`), fmtStatYr(false));

  // 4. Metadata (Series, Dev, Pub, Genre, Year) - Time & Days
  buildDualTable("Top 25 Most Played Series", "Most Played Series by Year", top25Data.topSeries, top25Data.yearlySeries, ["Rank", "Total Time", "Start", "End", "Series"], fmtStat(true), fmtStatYr(true));
  buildDualTable("Top 25 Developers", "Top Developer by Year", top25Data.topDevelopers, top25Data.yearlyDevelopers, ["Rank", "Total Time", "Start", "End", "Developer"], fmtStat(true), fmtStatYr(true));
  buildDualTable("Top 25 Publishers", "Top Publisher by Year", top25Data.topPublishers, top25Data.yearlyPublishers, ["Rank", "Total Time", "Start", "End", "Publisher"], fmtStat(true), fmtStatYr(true));
  buildDualTable("Top 25 Genres", "Top Genre by Year", top25Data.topGenres, top25Data.yearlyGenres, ["Rank", "Total Time", "Start", "End", "Genre"], fmtStat(true), fmtStatYr(true));
  buildDualTable("Top 25 Release Years", "Top Release Year by Year", top25Data.topReleaseYears, top25Data.yearlyReleaseYears, ["Rank", "Total Time", "Start", "End", "Release Year"], fmtStat(true), fmtStatYr(true));

  buildDualTable("Most Days Playing a Series", "Most Days Playing Series by Year", top25Data.topSeriesByDays, top25Data.yearlySeriesByDays, ["Rank", "Days Played", "Start", "Last", "Series"], fmtStat(false), fmtStatYr(false));
  buildDualTable("Most Days Playing a Genre", "Most Days Playing Genre by Year", top25Data.topGenreByDays, top25Data.yearlyGenreByDays, ["Rank", "Days Played", "Start", "Last", "Genre"], fmtStat(false), fmtStatYr(false));
  buildDualTable("Most Days Playing a Developer", "Most Days Playing Developer by Year", top25Data.topDeveloperByDays, top25Data.yearlyDeveloperByDays, ["Rank", "Days Played", "Start", "Last", "Developer"], fmtStat(false), fmtStatYr(false));
  buildDualTable("Most Days Playing a Publisher", "Most Days Playing Publisher by Year", top25Data.topPublisherByDays, top25Data.yearlyPublisherByDays, ["Rank", "Days Played", "Start", "Last", "Publisher"], fmtStat(false), fmtStatYr(false));
  buildDualTable("Most Days Playing a Release Year", "Most Days Playing Release Year by Year", top25Data.topReleaseYearByDays, top25Data.yearlyReleaseYearByDays, ["Rank", "Days Played", "Start", "Last", "Release Year"], fmtStat(false), fmtStatYr(false));

  buildDualTable("Series Presence (Most Years)", "Top Series by Year (by Time)", top25Data.topSeriesByYearCount, top25Data.yearlySeries, ["Rank", "# Years", "First", "Last", "Series [Years]"],
    fmtEvt('count', 'firstSeen', 'lastSeen', i => `${i.name} [${i.values.join(', ')}]`), fmtStatYr(true));
  buildDualTable("Series Presence (Most Months)", "Top Series by Year (by Months)", top25Data.topSeriesByMonthCount, top25Data.yearlySeriesByMonthCount, ["Rank", "# Months", "First", "Last", "Series [Months]"],
    fmtEvt('count', 'firstSeen', 'lastSeen', i => `${i.name} [${i.values.join(', ')}]`), fmtStatYr(false));
  
  buildDualTable("Genre Presence (Most Years)", "Top Genre by Year (by Time)", top25Data.topGenreByYearCount, top25Data.yearlyGenres, ["Rank", "# Years", "First", "Last", "Genre [Years]"],
    fmtEvt('count', 'firstSeen', 'lastSeen', i => `${i.name} [${i.values.join(', ')}]`), fmtStatYr(true));
  buildDualTable("Genre Presence (Most Months)", "Top Genre by Year (by Months)", top25Data.topGenreByMonthCount, top25Data.yearlyGenreByMonthCount, ["Rank", "# Months", "First", "Last", "Genre [Months]"],
    fmtEvt('count', 'firstSeen', 'lastSeen', i => `${i.name} [${i.values.join(', ')}]`), fmtStatYr(false));

  buildDualTable("Developer Presence (Most Years)", "Top Developer by Year (by Time)", top25Data.topDeveloperByYearCount, top25Data.yearlyDevelopers, ["Rank", "# Years", "First", "Last", "Developer [Years]"],
    fmtEvt('count', 'firstSeen', 'lastSeen', i => `${i.name} [${i.values.join(', ')}]`), fmtStatYr(true));
  buildDualTable("Developer Presence (Most Months)", "Top Developer by Year (by Months)", top25Data.topDeveloperByMonthCount, top25Data.yearlyDeveloperByMonthCount, ["Rank", "# Months", "First", "Last", "Developer [Months]"],
    fmtEvt('count', 'firstSeen', 'lastSeen', i => `${i.name} [${i.values.join(', ')}]`), fmtStatYr(false));

  buildDualTable("Publisher Presence (Most Years)", "Top Publisher by Year (by Time)", top25Data.topPublisherByYearCount, top25Data.yearlyPublishers, ["Rank", "# Years", "First", "Last", "Publisher [Years]"],
    fmtEvt('count', 'firstSeen', 'lastSeen', i => `${i.name} [${i.values.join(', ')}]`), fmtStatYr(true));
  buildDualTable("Publisher Presence (Most Months)", "Top Publisher by Year (by Months)", top25Data.topPublisherByMonthCount, top25Data.yearlyPublisherByMonthCount, ["Rank", "# Months", "First", "Last", "Publisher [Months]"],
    fmtEvt('count', 'firstSeen', 'lastSeen', i => `${i.name} [${i.values.join(', ')}]`), fmtStatYr(false));

  // 5. Binges, Sessions, Marathons
  buildDualTable("Top 25 Monthly Binges", "Biggest Monthly Binge by Year", top25Data.topMonthlyBinges, top25Data.yearlyMonthlyBinges, ["Rank", "Time", "Start", "End", "Game [Month]"],
    fmtEvt('totalSeconds', 'minDate', 'maxDate', i => `${i.game} (${getSysStr(i.systems)}) [${i.monthKey}]`, true), fmtEvtYr('totalSeconds', 'minDate', 'maxDate', i => `${i.game} (${getSysStr(i.systems)}) [${i.monthKey}]`, true));
  buildDualTable("Top 25 Weekly Binges", "Biggest Weekly Binge by Year", top25Data.topWeeklyBinges, top25Data.yearlyWeeklyBinges, ["Rank", "Time", "Start", "End", "Game"],
    fmtEvt('totalSeconds', 'startDate', 'endDate', i => `${i.game} (${getSysStr(i.systems)})`, true), fmtEvtYr('totalSeconds', 'startDate', 'endDate', i => `${i.game} (${getSysStr(i.systems)})`, true));
  
  buildDualTable("Top 25 Busiest Months", "Busiest Month by Year", top25Data.topBusiestMonths, top25Data.yearlyBusiestMonths, ["Rank", "Total Time", "Start", "End", "Month / Top 3"],
    fmtEvt('totalSeconds', 'minDate', 'maxDate', i => `${i.monthKey} ${i.top3Games ? `[${i.top3Games.map(g=>g.name).join(', ')}]` : ''}`, true),
    fmtEvtYr('totalSeconds', 'minDate', 'maxDate', i => `${i.monthKey} ${i.top3Games ? `[${i.top3Games.map(g=>g.name).join(', ')}]` : ''}`, true));
  buildDualTable("Top 25 Busiest Weeks", "Busiest Week by Year", top25Data.topBusiestWeeks, top25Data.yearlyBusiestWeeks, ["Rank", "Total Time", "Start", "End", "Top 3 Games"],
    fmtEvt('totalSeconds', 'startDate', 'endDate', i => i.gamesPlayed, true), fmtEvtYr('totalSeconds', 'startDate', 'endDate', i => i.gamesPlayed, true));

  buildDualTable("Top 25 Marathons (>4h)", "Top Marathon Game by Year", top25Data.topMarathons, top25Data.yearlyMarathons, ["Rank", "Count", "First", "Last", "Game"],
    fmtEvt('count', 'firstPlayed', 'lastPlayed', i => `${i.gameName} (${getSysStr(i.systems)})`), fmtStatYr(false));
  buildDualTable("Top 25 Short Sessions (<30m)", "Top Short Session Game by Year", top25Data.topShortSessions, top25Data.yearlyShortSessions, ["Rank", "Count", "First", "Last", "Game"],
    fmtEvt('count', 'firstPlayed', 'lastPlayed', i => `${i.gameName} (${getSysStr(i.systems)})`), fmtStatYr(false));

  // 6. Multiplayer
  buildDualTable("Top 25 Multiplayer Games", "Top Multiplayer Game by Year", top25Data.topMultiplayerGames, top25Data.yearlyMultiplayerGames, ["Rank", "Total Time", "Start", "End", "Videogame"], fmtStat(true), fmtStatYr(true));
  buildDualTable("Top 25 Busiest Multiplayer Days", "Busiest Multiplayer Day by Year", top25Data.topBusiestMultiplayerDays, top25Data.yearlyBusiestMultiplayerDays, ["Rank", "Total Time", "Date", "", "Top 3 Games"],
    fmtEvt('totalSeconds', 'date', 'date', i => i.top3Games.map(g => `${g.name} [${formatHHMM(g.time)}]`).join(', '), true),
    fmtEvtYr('totalSeconds', 'date', 'date', i => i.top3Games.map(g => `${g.name} [${formatHHMM(g.time)}]`).join(', '), true));
  buildDualTable("Top 25 Busiest Multiplayer Weeks", "Busiest Multiplayer Week by Year", top25Data.topBusiestMultiplayerWeeks, top25Data.yearlyBusiestMultiplayerWeeks, ["Rank", "Total Time", "Start", "End", "Top Games"],
    fmtEvt('totalSeconds', 'startDate', 'endDate', i => i.gamesPlayed, true), fmtEvtYr('totalSeconds', 'startDate', 'endDate', i => i.gamesPlayed, true));
  buildDualTable("Top 25 Busiest Multiplayer Months", "Busiest Multiplayer Month by Year", top25Data.topBusiestMultiplayerMonths, top25Data.yearlyBusiestMultiplayerMonths, ["Rank", "Total Time", "Start", "End", "Month / Top 3"],
    fmtEvt('totalSeconds', 'minDate', 'maxDate', i => `${i.monthKey} ${i.top3Games ? `[${i.top3Games.map(g => `${g.name} [${formatHHMM(g.time)}]`).join(', ')}]` : ''}`, true),
    fmtEvtYr('totalSeconds', 'minDate', 'maxDate', i => `${i.monthKey} ${i.top3Games ? `[${i.top3Games.map(g => `${g.name} [${formatHHMM(g.time)}]`).join(', ')}]` : ''}`, true));

  // 7. Variety, Hiatuses, Concentration & Overlaps
  buildDualTable("Top 25 Diverse Days", "Most Diverse Day by Year", top25Data.topDiverseDays, top25Data.yearlyDiverseDays, ["Rank", "# Games", "Time", "Date", "Games"],
    (item, i, prev) => ({ rawVal: item.numGames, c1: getRank(item.numGames, prev, i), c2: item.numGames, c3: formatHHMM(item.totalTime), c4: formatFullDate(item.date), c5: item.games, isBold: getBold(item.date) }),
    (w) => ({ c1: w.year, c2: w.data.numGames, c3: formatHHMM(w.data.totalTime), c4: formatFullDate(w.data.date), c5: w.data.games }));

  buildDualTable("Top 25 Busiest Game Variety (Weekly)", "Busiest Game Variety (Week) by Year", top25Data.topWeeklyGameVariety, top25Data.yearlyWeeklyGameVariety, ["Rank", "# Games", "Start", "End", "Top 3 Games"],
    fmtEvt('count', 'startDate', 'endDate', i => i.gamesPlayed), fmtEvtYr('count', 'startDate', 'endDate', i => i.gamesPlayed));
  buildDualTable("Top 25 Busiest Game Variety (Monthly)", "Busiest Game Variety (Month) by Year", top25Data.topMonthlyGameVariety, top25Data.yearlyMonthlyGameVariety, ["Rank", "# Games", "Start", "End", "Month [Top 3 Games]"],
    fmtEvt('games.size', 'minDate', 'maxDate', i => `${i.monthKey} [${Object.entries(i.gameTimes).sort((a,b)=>b[1]-a[1]).slice(0,3).map(g=>`${g[0]} [${formatHHMM(g[1])}]`).join(', ')}]`),
    fmtEvtYr('games.size', 'minDate', 'maxDate', i => `${i.monthKey} [${Object.entries(i.gameTimes).sort((a,b)=>b[1]-a[1]).slice(0,3).map(g=>`${g[0]} [${formatHHMM(g[1])}]`).join(', ')}]`));

  buildDualTable("Top 25 Game Hiatuses", "Longest Game Hiatus by Year", top25Data.topGameHiatuses, top25Data.yearlyGameHiatuses, ["Rank", "Gap Days", "Start", "End", "Game"],
    fmtEvt('gapDays', 'startDate', 'endDate', i => `${i.game} (${i.prevSystem}->${i.currentSystem})`), fmtEvtYr('gapDays', 'startDate', 'endDate', i => `${i.game} (${i.prevSystem}->${i.currentSystem})`));

  buildDualTable("Top 25 Game Overlaps (Same Day)", "Top Game Overlap by Year", top25Data.topGameOverlaps, top25Data.yearlyGameOverlaps, ["Rank", "# Days", "First Date", "Last Date", "Game Pair"],
    fmtEvt('count', 'firstDate', 'lastDate', i => i.pair), fmtStatYr(false));

  buildDualTable("Highest % of Year Spent on One Game", "Most Dominant Game by Year", top25Data.topYearlyConcentration, top25Data.yearlyYearlyConcentration, ["Rank", "% Share", "Year", "", "Game [Time Spent]"],
    fmtEvt('percent', 'year', 'year', i => `${i.game} (${getSysStr(i.systems)}) [${formatHHMM(i.gameSeconds)}]`),
    fmtEvtYr('percent', 'year', 'year', i => `${i.game} (${getSysStr(i.systems)}) [${formatHHMM(i.gameSeconds)}]`));
  buildDualTable("Highest % of Month Spent on One Game", "Most Dominant Month by Year", top25Data.topMonthlyConcentration, top25Data.yearlyMonthlyConcentration, ["Rank", "% Share", "Month", "", "Game [Time / Total]"],
    fmtEvt('percent', 'minDate', 'minDate', i => `${i.game} (${getSysStr(i.systems)}) [${formatHHMM(i.gameSeconds)}/${formatHHMM(i.totalSeconds)}]`),
    fmtEvtYr('percent', 'minDate', 'minDate', i => `${i.game} (${getSysStr(i.systems)}) [${formatHHMM(i.gameSeconds)}/${formatHHMM(i.totalSeconds)}]`));

  // Loop through Meta Hiatuses (Series, Genre, Dev, Pub, System, Release Year)
  const hiatusLabels = { series: "Series", genre: "Genre", developer: "Developer", publisher: "Publisher", releaseYear: "Rel Year", system: "System" };
  Object.keys(top25Data.topMetaHiatuses).forEach(key => {
    buildDualTable(`Top 25 ${hiatusLabels[key]} Hiatuses`, `Longest ${hiatusLabels[key]} Hiatus Ending by Year`, top25Data.topMetaHiatuses[key], top25Data.yearlyMetaHiatuses[key], ["Rank", "Gap Days", "Start", "End", `${hiatusLabels[key]} [From -> To]`],
      fmtEvt('gapDays', 'startDate', 'endDate', i => i.details || `${i.name} [${i.prevGame} -> ${i.currentGame}]`),
      fmtEvtYr('gapDays', 'startDate', 'endDate', i => i.details || `${i.name} [${i.prevGame} -> ${i.currentGame}]`));
  });

  // Loop through Most Unique Games by Meta (Series, Genre, Dev, Pub, Release Year)
  ['series', 'genre', 'developer', 'publisher', 'releaseYear'].forEach(key => {
    if (top25Data.metaGameCountData[`top${key}`]) {
      buildDualTable(`Most Unique ${hiatusLabels[key]} Games in One Year`, `Most Unique ${hiatusLabels[key]} Games by Year`, top25Data.metaGameCountData[`top${key}`], top25Data.metaGameCountData[`yearly${key}`], ["Rank", "Count", "Start", "End", "Details"],
        fmtEvt('count', 'minDate', 'maxDate', i => `[${i.year}] ${i.name} [${formatHHMM(i.totalSeconds)}]`),
        fmtEvtYr('count', 'minDate', 'maxDate', i => `[${i.year}] ${i.name} [${formatHHMM(i.totalSeconds)}]`));
    }
  });

  // 8. DYNAMIC DATA (12 Months, Genres)
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  for (let m = 0; m < 12; m++) {
    const dataForMonth = top25Data.bestMonthsByName[m] || [];
    const top25 = [...dataForMonth].sort((a,b) => b.totalSeconds - a.totalSeconds).slice(0, 25);
    const yearlyData = [...dataForMonth].sort((a,b) => b.year - a.year).map(item => ({ year: item.year, data: item }));
    
    buildDualTable(`Top 25 Best of ${monthNames[m]}`, `${monthNames[m]} Stats by Year`, top25, yearlyData, ["Rank", "Time", "Start", "End", "Year / Top 5 Games"],
      fmtEvt('totalSeconds', 'startDate', 'endDate', i => `[${i.year}] ${i.details}`, true),
      fmtEvtYr('totalSeconds', 'startDate', 'endDate', i => i.details, true));
  }

  if (top25Data.topGamesByGenreData) {
    Object.keys(top25Data.topGamesByGenreData).sort().forEach(genre => {
      if (genre === 'N/A') return;
      const data = top25Data.topGamesByGenreData[genre];
      const top25 = [...data.allTime].sort((a,b) => b.totalSeconds - a.totalSeconds).slice(0, 25);
      const yearlyData = data.yearly.map(item => ({ year: item.year, data: item })).sort((a,b) => b.year - a.year);
      
      buildDualTable(`Top 25 Most Played ${genre}`, `Most Played ${genre} by Year`, top25, yearlyData, ["Rank", "Time", "Start", "Last", "Game"],
        fmtEvt('totalSeconds', 'startDate', 'lastDate', i => `${i.name} ${i.systems ? `(${getSysStr(i.systems)})` : ""}`, true),
        fmtEvtYr('totalSeconds', 'startDate', 'endDate', i => `${i.name} ${i.systems ? `(${getSysStr(i.systems)})` : ""}`, true));
    });
  }

  // Populate the Dropdown Menu with all generated tables
  const select = document.getElementById('random-top25-select');
  if (select && allTop25Tables.length > 0) {
    select.innerHTML = allTop25Tables.map(t => `<option value="${escapeHTML(t.mainTitle)}">${escapeHTML(t.mainTitle)}</option>`).join('');
    select.onchange = renderRandomTop25;
    renderRandomTop25();
  }
}

// --- DROPDOWN SETUP ---
function setupDropdowns() {
  if (!rawData || !rawData.metrics) return;
  const currentYear = new Date().getFullYear().toString();

  // 1. Sync Logic for the "By Year" Dropdowns (Now 7 total)
  const compSelect = document.getElementById('year-select-comp');
  const playedSelect = document.getElementById('year-select-played');
  const daysSelect = document.getElementById('year-select-days');
  const sessionSelect = document.getElementById('year-select-session');
  const metricSelect1 = document.getElementById('year-select-metrics');
  const metricSelect2 = document.getElementById('year-select-metrics-2');
  const metricSelect3 = document.getElementById('year-select-metrics-3');

  const syncYearDropdowns = (val) => {
    // Update all dropdown values to match
    [compSelect, playedSelect, daysSelect, sessionSelect, metricSelect1, metricSelect2, metricSelect3].forEach(s => {
      if (s) s.value = val;
    });
    
    // Refresh all cards simultaneously
    renderCompletions(val);
    renderMostPlayed(val);
    renderMostDays(val);
    renderLongestSession(val);
    renderSideBySideMetrics(val);
  };

  const years = Object.keys(rawData.metrics.yearlyGameStats).sort().reverse();
  const yearOptionsHtml = `<option value="All-Time">All-Time</option>` + years.map(y => `<option value="${y}">${y}</option>`).join('');
  const defaultChoice = Math.random() < 0.5 ? 'All-Time' : currentYear;

  // Initialize the dropdown options and attach the MASTER listener
  [compSelect, playedSelect, daysSelect, sessionSelect, metricSelect1, metricSelect2, metricSelect3].forEach(select => {
    if (select) {
      select.innerHTML = yearOptionsHtml;
      select.value = defaultChoice;
      select.addEventListener('change', (e) => syncYearDropdowns(e.target.value));
    }
  });

  // Initial render for all
  syncYearDropdowns(defaultChoice);

  // 2. Month Select (Independent)
  const monthKeys = Object.keys(rawData.metrics.monthlyStats).sort().reverse();
  const monthSelect = document.getElementById('month-select');
  if (monthSelect && monthKeys.length > 0) {
    monthSelect.innerHTML = monthKeys.map(m => `<option value="${m}">${m}</option>`).join('');
    monthSelect.value = monthKeys[0];
    monthSelect.addEventListener('change', (e) => renderMonthlySummary(e.target.value));
    renderMonthlySummary(monthKeys[0]);
  }

  // 3. Rankings & Metadata (Scores)
  const releaseYears = [...new Set(metaGames.map(g => g.releaseYear))].filter(y => y !== 'Unknown').sort().reverse();
  const franchises = [...new Set(metaGames.map(g => g.franchise))].filter(f => f !== 'Unknown' && f !== 'ZZNONE').sort();
  const genres = [...new Set(metaGames.map(g => g.genre))].filter(g => g !== 'Unknown').sort();

  const getValidRandoms = (key) => {
    const counts = {};
    metaGames.filter(g => g.score !== null).forEach(g => {
      const val = g[key];
      if (val && val !== 'Unknown' && val !== 'ZZNONE') {
        counts[val] = (counts[val] || 0) + 1;
      }
    });
    return Object.keys(counts).filter(val => counts[val] >= 3);
  };

  const validFranchises = getValidRandoms('franchise');
  const validGenres = getValidRandoms('genre');

  const top100Select = document.getElementById('top100-year-select');
  if (top100Select) {
    top100Select.innerHTML = `<option value="All-Time">All-Time</option>` + releaseYears.map(y => `<option value="${y}">${y}</option>`).join('');
    top100Select.value = "All-Time";
    top100Select.addEventListener('change', (e) => renderRankings('year', e.target.value, 'top100-list', 100));
    renderRankings('year', 'All-Time', 'top100-list', 100);
  }

  const franchiseSelect = document.getElementById('franchise-select');
  if (franchiseSelect) {
    franchiseSelect.innerHTML = franchises.map(f => `<option value="${escapeHTML(f)}">${escapeHTML(f)}</option>`).join('');
    const pool = validFranchises.length > 0 ? validFranchises : franchises;
    const randomFranchise = pool[Math.floor(Math.random() * pool.length)];
    franchiseSelect.value = randomFranchise;
    franchiseSelect.addEventListener('change', (e) => renderRankings('franchise', e.target.value, 'franchise-list', 100));
    renderRankings('franchise', randomFranchise, 'franchise-list', 100);
  }

  const genreSelect = document.getElementById('genre-select');
  if (genreSelect) {
    genreSelect.innerHTML = genres.map(g => `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('');
    const pool = validGenres.length > 0 ? validGenres : genres;
    const randomGenre = pool[Math.floor(Math.random() * pool.length)];
    genreSelect.value = randomGenre;
    genreSelect.addEventListener('change', (e) => renderRankings('genre', e.target.value, 'genre-list', 100));
    renderRankings('genre', randomGenre, 'genre-list', 100);
  }

  // 4. Analysis Dropdown
  const analysisSelect = document.getElementById('analysis-select');
  if (analysisSelect) {
    analysisSelect.addEventListener('change', (e) => renderAnalysis(e.target.value));
  }

  // 5. Heatmap Dropdown
  const heatmapSelect = document.getElementById('heatmap-select');
  if (heatmapSelect) {
    heatmapSelect.value = 'gameSummary'; 
    heatmapSelect.addEventListener('change', (e) => renderHeatmap(e.target.value));
  }

  // 6. Game History Dropdown
  const gameHistorySelect = document.getElementById('game-history-select');
  if (gameHistorySelect) {
    const uniqueGames = [...new Set(rawData.allEntries.map(e => e.game))].sort((a,b) => a.localeCompare(b));
    gameHistorySelect.innerHTML = uniqueGames.map(g => `<option value="${escapeHTML(g)}">${escapeHTML(g)}</option>`).join('');
    const mostRecentGame = rawData.allEntries[rawData.allEntries.length - 1].game;
    gameHistorySelect.value = mostRecentGame;
    gameHistorySelect.addEventListener('change', (e) => renderGameHistory(e.target.value));
  }

  // 7. Series Archive Dropdown
  const seriesArchiveSelect = document.getElementById('series-archive-select');
  if (seriesArchiveSelect) {
    seriesArchiveSelect.innerHTML = franchises.map(f => `<option value="${escapeHTML(f)}">${escapeHTML(f)}</option>`).join('');
    const pool = validFranchises.length > 0 ? validFranchises : franchises;
    const randomSeries = pool[Math.floor(Math.random() * pool.length)];
    seriesArchiveSelect.value = randomSeries;
    seriesArchiveSelect.addEventListener('change', (e) => renderSeriesArchive(e.target.value));
  }
}

function setupHoverHistory() {
  const tooltip = document.getElementById('game-tooltip');
  let tooltipTimeout; // The grace-period timer
  
  document.addEventListener('mouseover', (e) => {
    // If hovering over the game name OR the tooltip itself, cancel the closing timer
    if (e.target.classList.contains('hover-trigger') || e.target.closest('#game-tooltip')) {
      clearTimeout(tooltipTimeout);
    }

    // If hovering over a game name, build and show the tooltip
    if (e.target.classList.contains('hover-trigger')) {
      const gameName = e.target.getAttribute('data-game');
      if (!gameName) return;
      
      // Removed the .slice(0, 15) so you can scroll the FULL history!
      const entries = rawData.allEntries.filter(entry => entry.game === gameName).slice().reverse();
      if (entries.length === 0) return;

      let html = `<h3>${escapeHTML(gameName)} History</h3>`;
      html += entries.map(entry => `
        <div class="tooltip-entry">
          <div class="tooltip-meta">${formatShortDate(entry.date)} (${entry.date.substring(0,4)}) | ${escapeHTML(entry.system)} | ${entry.time} | <span style="color:${getStatusColor(entry.status)}">${entry.status}</span></div>
          <div class="tooltip-note">${escapeHTML(entry.note)}</div>
        </div>
      `).join('');
      
      tooltip.innerHTML = html;
      tooltip.classList.add('visible');

      // Positioning logic
      const rect = e.target.getBoundingClientRect();
      let top = rect.bottom + window.scrollY + 10;
      let left = rect.left + window.scrollX;
      
      // Prevent it from flying off the right side of the screen
      if (left + 350 > window.innerWidth) left = window.innerWidth - 370;
      
      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';
    }
  });

  document.addEventListener('mouseout', (e) => {
    // If the mouse leaves the game name OR leaves the tooltip, start the countdown
    if (e.target.classList.contains('hover-trigger') || e.target.closest('#game-tooltip')) {
      tooltipTimeout = setTimeout(() => {
        tooltip.classList.remove('visible');
      }, 300); // 300ms gives you time to casually move the mouse into the box
    }
  });
}

// --- RENDER FUNCTIONS ---

function renderMonthlySummary(monthKey) {
  const container = document.getElementById('monthly-summary-list');
  if (!rawData || !rawData.allEntries) return;

  const monthEntries = rawData.allEntries.filter(e => e.date.startsWith(monthKey));
  if (monthEntries.length === 0) { container.innerHTML = `<div class="loading-text">No data for ${monthKey}.</div>`; return; }

  const monthData = { games: {}, allEntryDays: new Set() };
  let totalSecondsInMonth = 0;

  monthEntries.forEach(entry => {
    const timeSec = timeStringToSeconds(entry.time);
    totalSecondsInMonth += timeSec;
    monthData.allEntryDays.add(entry.date.split('T')[0]);

    if (!monthData.games[entry.game]) {
      monthData.games[entry.game] = { name: entry.game, totalSeconds: 0, latestGameLifetime: entry.gameLifetime, latestGameLifetimeDays: entry.gameLifetimeDays, activePlaythroughs: {} };
    }
    const g = monthData.games[entry.game];
    g.totalSeconds += timeSec; g.latestGameLifetime = entry.gameLifetime; g.latestGameLifetimeDays = entry.gameLifetimeDays;

    if (!g.activePlaythroughs[entry.ptTag]) {
      g.activePlaythroughs[entry.ptTag] = { timeframeTime: 0, timeframeDays: new Set(), timeframeSystems: new Set(), lastDate: entry.date, lastStatus: entry.status, lastPtLifetime: entry.ptLifetime, lastPtLifetimeDays: entry.ptLifetimeDays, latestNote: entry.note };
    }
    const pt = g.activePlaythroughs[entry.ptTag];
    pt.timeframeTime += timeSec; pt.timeframeDays.add(entry.date.split('T')[0]); pt.timeframeSystems.add(entry.system);
    if (entry.date >= pt.lastDate) { pt.lastDate = entry.date; pt.lastStatus = entry.status; pt.lastPtLifetime = entry.ptLifetime; pt.lastPtLifetimeDays = entry.ptLifetimeDays; pt.latestNote = entry.note; }
  });

  const sortedGames = Object.values(monthData.games).sort((a, b) => b.totalSeconds - a.totalSeconds);

  // 1. Calculate the days in the month FIRST
  const [yearStr, monthStr] = monthKey.split('-');
  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();

  // 2. Build the headers
  let html = `<div class="monthly-table-wrapper"><table class="monthly-table"><thead>
    <tr><th rowspan="2">Videogame</th><th rowspan="2">System</th><th colspan="2">Active Month</th><th colspan="2">Playthrough Lifetime</th><th colspan="2">Game Lifetime</th><th rowspan="2">Date Started</th><th rowspan="2">Last Updated</th><th rowspan="2">Game Status</th><th rowspan="2">Playthrough Details</th></tr>
    <tr><th>Time</th><th>Days</th><th>Time</th><th>Days</th><th>Time</th><th>Days</th></tr>
    </thead><tbody>`;

  // 3. Print the Grand Total row BEFORE the games
  html += `<tr class="grand-total-row"><td colspan="2" class="text-left">Grand Total</td><td class="text-center">${formatHHMM(totalSecondsInMonth)}</td><td class="text-center">${monthData.allEntryDays.size}/${daysInMonth}</td><td colspan="8"></td></tr>`;

  // 4. Print the games
  sortedGames.forEach((game, index) => {
    const activeTags = Object.keys(game.activePlaythroughs);
    activeTags.forEach(ptTag => {
      const ptLocal = game.activePlaythroughs[ptTag]; const ptHistory = rawData.playthroughHistory[ptTag];
      const sysStr = Array.from(ptLocal.timeframeSystems).join(', '); const bgColor = getStatusColor(ptHistory.finalStatus);
      html += `<tr class="active-row"><td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span></td><td class="text-center">${escapeHTML(sysStr)}</td><td class="text-center">${formatHHMM(ptLocal.timeframeTime)}</td><td class="text-center">${ptLocal.timeframeDays.size}</td><td class="text-center">${ptLocal.lastPtLifetime}</td><td class="text-center">${ptLocal.lastPtLifetimeDays}</td><td class="text-center">${game.latestGameLifetime}</td><td class="text-center">${game.latestGameLifetimeDays}</td><td class="text-center">${formatFullDate(ptHistory.startDate)}</td><td class="text-center">${formatFullDate(ptLocal.lastDate)}</td><td class="text-center status-cell" style="background-color: ${bgColor};">${ptLocal.lastStatus}</td><td class="text-left">${escapeHTML(ptLocal.latestNote)}</td></tr>`;
    });
const allGamePlaythroughs = Object.keys(rawData.playthroughHistory).filter(tag => rawData.playthroughHistory[tag].gameName === game.name);
    
    // Filter out the ones we already printed as active
    const inactiveTags = allGamePlaythroughs.filter(oldTag => !activeTags.includes(oldTag));
    
    if (inactiveTags.length > 0) {
      const safeGameId = `collapse-${index}`;
      
      // 1. The Toggle Button Row
      html += `
        <tr class="accordion-toggle-row" onclick="toggleAccordion('${safeGameId}', this)" style="cursor: pointer; background-color: rgba(0,0,0,0.03);">
          <td colspan="12" class="text-left" style="padding: 6px 12px; font-size: 0.85rem; color: #666;">
            <span class="toggle-icon">▶</span> Show ${inactiveTags.length} Past Playthrough${inactiveTags.length !== 1 ? 's' : ''}
          </td>
        </tr>
      `;

      // 2. The Hidden Inactive Rows
      inactiveTags.forEach(oldTag => {
        const oldPt = rawData.playthroughHistory[oldTag]; 
        const bgColor = getStatusColor(oldPt.finalStatus);
        
        // Notice the added class: ${safeGameId} and inline style: display: none;
        html += `<tr class="inactive-row ${safeGameId}" style="display: none; opacity: 0.65;">
          <td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span></td>
          <td class="text-center">${escapeHTML(oldPt.system)}</td>
          <td class="text-center">00:00</td>
          <td class="text-center">0</td>
          <td class="text-center">${oldPt.finalPtLifetime}</td>
          <td class="text-center">${oldPt.finalPtLifetimeDays}</td>
          <td class="text-center">${game.latestGameLifetime}</td>
          <td class="text-center">${game.latestGameLifetimeDays}</td>
          <td class="text-center">${formatFullDate(oldPt.startDate)}</td>
          <td class="text-center">${formatFullDate(oldPt.lastDate)}</td>
          <td class="text-center status-cell" style="background-color: ${bgColor};">${oldPt.finalStatus}</td>
          <td class="text-left">${escapeHTML(oldPt.finalNote)}</td>
        </tr>`;
      });
    }
  });

  // 5. Close it out
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

function renderCompletions(year) {
  const container = document.getElementById('completions-list');
  
  const completions = Object.values(rawData.playthroughHistory).filter(pt => {
    const isComp = (pt.completionDates && pt.completionDates.length > 0) || ['Completed', 'M-Completed', 'Postgame'].includes(pt.finalStatus);
    if (!isComp) return false;
    
    const cDate = (pt.completionDates && pt.completionDates.length > 0) ? new Date(pt.completionDates[0]) : new Date(pt.lastDate);
    pt.displayDate = cDate;
    
    if (year === 'All-Time') return true;
    return cDate.getUTCFullYear().toString() === year;
  });

  completions.forEach(pt => {
    const finalEntry = rawData.allEntries.slice().reverse().find(e => e.ptTag === pt.ptTag && ['Completed', 'M-Completed', 'Postgame'].includes(e.status));
    pt.entryNum = finalEntry ? Number(finalEntry.entryNum) : 0;
  });

  completions.sort((a, b) => {
    const dateDiff = a.displayDate.getTime() - b.displayDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.entryNum - b.entryNum;
  });
  
  completions.forEach((c, index) => c.yearRank = index + 1);
  completions.reverse();

  if (completions.length === 0) { container.innerHTML = `<div class="loading-text">No completions logged for ${year}.</div>`; return; }

  container.innerHTML = completions.map(pt => {
    const score = metaScores.get(pt.gameName) || '-';
    const badgeHTML = score !== '-' ? `<div class="item-badge">${score}</div>` : `<div class="item-badge" style="background: var(--heatmap-empty); color: var(--text-muted);">-</div>`;
    
    let pastCompletionsHtml = '';
    if (rawData.metrics && rawData.metrics.completionStats) {
        const allTimeGameData = rawData.metrics.completionStats.find(g => g.gameName === pt.gameName);
        if (allTimeGameData && allTimeGameData.completionDates.length > 1) {
          const currentCompletionStr = formatFullDate(pt.displayDate);
          const pastDates = allTimeGameData.completionDates
              .map(d => formatFullDate(d))
              .filter(d => d !== currentCompletionStr);
            if (pastDates.length > 0) {
                const uniquePastDates = [...new Set(pastDates)];
                pastCompletionsHtml = `<div style="font-size: 0.75rem; font-style: italic; color: var(--text-sub); margin-top: 4px;">Also completed on: ${uniquePastDates.join(', ')}</div>`;
            }
        }
    }

    // Standardize the time output (turns "13:45" into "13h 45m")
    const formattedTime = formatTime(timeStringToSeconds(pt.finalPtLifetime));

    return `
      <div class="list-item" style="align-items: center; padding: 12px 16px;">
        <div style="display: flex; width: 100%; align-items: center;">
          
          <!-- Left Column: Date & Rank -->
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-right: 15px; min-width: 45px;">
            <span style="font-weight: 800; color: var(--text-main); font-size: 0.95rem;">${formatShortDate(pt.displayDate)}</span>
            <span style="color: var(--text-muted); font-size: 0.75rem; font-weight: 700; margin-top: 2px;">(#${pt.yearRank})</span>
          </div>
          
          <!-- Middle Column: Game Info & Stats -->
          <div style="display: flex; flex-direction: column; flex: 1; overflow: hidden; padding-right: 10px;">
            <span class="item-title hover-trigger" data-game="${escapeHTML(pt.gameName)}" style="font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHTML(pt.gameName)} (${escapeHTML(pt.system)})
            </span>
            <div class="item-sub" style="display: flex; justify-content: space-between; margin-top: 2px;">
              <span style="color: var(--text-muted);">
                <strong>${formattedTime}</strong> (${pt.finalPtLifetimeDays} Day${pt.finalPtLifetimeDays == 1 ? '' : 's'})
              </span>
              <span style="color: var(--text-sub);">Started: ${formatFullDate(pt.startDate)}</span>
            </div>
            ${pastCompletionsHtml}
          </div>
          
          <!-- Right Column: Score Badge -->
          <div style="margin-left: auto;">
            ${badgeHTML}
          </div>
          
        </div>
      </div>
    `;
  }).join('');
}

// Most Played Time
function renderMostPlayed(year) {
  const container = document.getElementById('most-played-list');
  const statsObj = year === 'All-Time' ? rawData.metrics.allTimeGameStats : rawData.metrics.yearlyGameStats[year];
  
  if (!statsObj) { container.innerHTML = `<div class="loading-text">No playtime logged.</div>`; return; }

  const sortedGames = Object.entries(statsObj).map(([name, stats]) => {
    const sysStr = stats.systems instanceof Set ? Array.from(stats.systems).join(', ') : (Array.isArray(stats.systems) ? stats.systems.join(', ') : (stats.systems && stats.systems.data ? stats.systems.data.join(', ') : ''));
    const daysSet = stats.days instanceof Set ? Array.from(stats.days) : (Array.isArray(stats.days) ? stats.days : (stats.days && stats.days.data ? stats.days.data : []));
    const daysArr = daysSet.sort();
    
    // Check Date Objects (All-Time) or fallback to String parsing (Yearly)
    const minDate = stats.firstPlayedDate ? formatFullDate(stats.firstPlayedDate) : (daysArr.length > 0 ? daysArr[0].replace(/-/g, '/') : "N/A");
    const maxDate = stats.lastPlayedDate ? formatFullDate(stats.lastPlayedDate) : (daysArr.length > 0 ? daysArr[daysArr.length - 1].replace(/-/g, '/') : "N/A");

    return { name, seconds: stats.totalSeconds, days: daysArr.length, systems: sysStr, minDate, maxDate };
  }).sort((a, b) => b.seconds - a.seconds).slice(0, 100);

  container.innerHTML = sortedGames.map((game, index) => `
    <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 12px;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
        <span class="item-title" style="font-weight: bold;">
          <span style="color: var(--text-muted); margin-right: 5px;">#${index + 1}</span><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span> ${game.systems ? `(${escapeHTML(game.systems)})` : ''}
        </span>
        <div class="item-badge">${formatTime(game.seconds)}</div>
      </div>
      <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 4px;">
        <span><strong>${game.days}</strong> Days Played</span>
        <span>${game.minDate} - ${game.maxDate}</span>
      </div>
    </div>
  `).join('');
}

// Most Days Played
function renderMostDays(year) {
  const container = document.getElementById('most-days-list');
  const statsObj = year === 'All-Time' ? rawData.metrics.allTimeGameStats : rawData.metrics.yearlyGameStats[year];
  
  if (!statsObj) { container.innerHTML = `<div class="loading-text">No playtime logged.</div>`; return; }

  const sortedDays = Object.entries(statsObj).map(([name, stats]) => {
    const sysStr = stats.systems instanceof Set ? Array.from(stats.systems).join(', ') : (Array.isArray(stats.systems) ? stats.systems.join(', ') : (stats.systems && stats.systems.data ? stats.systems.data.join(', ') : ''));
    const daysSet = stats.days instanceof Set ? Array.from(stats.days) : (Array.isArray(stats.days) ? stats.days : (stats.days && stats.days.data ? stats.days.data : []));
    const daysArr = daysSet.sort();
    
    const minDate = stats.firstPlayedDate ? formatFullDate(stats.firstPlayedDate) : (daysArr.length > 0 ? daysArr[0].replace(/-/g, '/') : "N/A");
    const maxDate = stats.lastPlayedDate ? formatFullDate(stats.lastPlayedDate) : (daysArr.length > 0 ? daysArr[daysArr.length - 1].replace(/-/g, '/') : "N/A");

    return { name, seconds: stats.totalSeconds, days: daysArr.length, systems: sysStr, minDate, maxDate };
  }).sort((a, b) => b.days - a.days).slice(0, 100);

  container.innerHTML = sortedDays.map((game, index) => `
    <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 12px;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
        <span class="item-title" style="font-weight: bold;">
          <span style="color: var(--text-muted); margin-right: 5px;">#${index + 1}</span><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span> ${game.systems ? `(${escapeHTML(game.systems)})` : ''}
        </span>
        <div class="item-badge">${game.days} Days</div>
      </div>
      <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 4px;">
        <span><strong>${formatTime(game.seconds)}</strong> Played</span>
        <span>${game.minDate} - ${game.maxDate}</span>
      </div>
    </div>
  `).join('');
}

// Longest Single Session
function renderLongestSession(year) {
  const container = document.getElementById('longest-session-list');
  
  const sessions = year === 'All-Time' 
    ? rawData.metrics.singleDaySessions 
    : rawData.metrics.singleDaySessions.filter(s => new Date(s.date).getUTCFullYear().toString() === year);
    
  if (sessions.length === 0) { container.innerHTML = `<div class="loading-text">No sessions logged.</div>`; return; }

  const sortedSessions = sessions.sort((a, b) => b.time - a.time).slice(0, 100);
  
  container.innerHTML = sortedSessions.map((s, index) => {
    const displayDate = year === 'All-Time' ? formatFullDate(s.date) : formatShortDate(s.date);
    
    // Calculate the percentage of total playtime this single session represents
    const totalGameSecs = rawData.metrics.allTimeGameStats[s.game] ? rawData.metrics.allTimeGameStats[s.game].totalSeconds : s.time;
    const pct = ((s.time / totalGameSecs) * 100).toFixed(1);
    
    return `
    <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 12px;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
        <span class="item-title" style="font-weight: bold;">
          <span style="color: var(--text-muted); margin-right: 5px;">#${index + 1}</span><span class="hover-trigger" data-game="${escapeHTML(s.game)}">${escapeHTML(s.game)}</span> ${s.system ? `(${escapeHTML(s.system)})` : ''}
        </span>
        <div class="item-badge">${formatTime(s.time)}</div>
      </div>
      <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 4px;">
        <span>Accounts for <strong>${pct}%</strong> of total playtime (${formatTime(totalGameSecs)})</span>
        <span>${displayDate}</span>
      </div>
    </div>
  `}).join('');
}

function renderRankings(filterType, filterValue, containerId, limit) {
  const container = document.getElementById(containerId);
  let filtered = metaGames.filter(g => g.score !== null);
  
  if (filterValue !== 'All-Time') {
    if (filterType === 'year') filtered = filtered.filter(g => g.releaseYear === filterValue);
    if (filterType === 'franchise') filtered = filtered.filter(g => g.franchise === filterValue);
    if (filterType === 'genre') filtered = filtered.filter(g => g.genre === filterValue);
  }

  filtered.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  filtered = filtered.slice(0, limit);

  if (filtered.length === 0) { container.innerHTML = `<div class="loading-text">No rated games found.</div>`; return; }

  let actualPosition = 1, lastScore = -1;
  container.innerHTML = filtered.map(game => {
    let rankText = game.score !== lastScore ? `#${actualPosition}` : '';
    lastScore = game.score; actualPosition++;
    const displayScore = Number.isInteger(game.score) ? game.score : game.score.toFixed(1);
    
    // Grab the aggregated stats to display playtime next to the score
    const gameStats = rawData.metrics.allTimeGameStats[game.name];
    const timeStr = gameStats ? formatTime(gameStats.totalSeconds) : "0m";
    const daysCount = gameStats && gameStats.days ? (gameStats.days.size || gameStats.days.length || (gameStats.days.data ? gameStats.days.data.length : 0)) : 0;
    
    return `
    <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 12px;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
        <span class="item-title" style="font-weight: bold;">
          <span style="color: var(--text-muted); margin-right: 5px; min-width: 25px; display: inline-block;">${rankText}</span><span class="hover-trigger" data-game="${escapeHTML(game.name)}">${escapeHTML(game.name)}</span>
        </span>
        <div class="item-badge">${displayScore}</div>
      </div>
      <div class="item-sub" style="display: flex; justify-content: space-between; width: 100%; margin-top: 4px;">
        <span>Dev: <strong>${escapeHTML(game.developer)}</strong> (${escapeHTML(game.releaseYear)})</span>
        <span><strong>${timeStr}</strong> | ${daysCount} Days</span>
      </div>
    </div>
    `;
  }).join('');
}

function renderOnThisDay() {
  const container = document.getElementById('on-this-day-list');
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11
  const currentDay = today.getDate(); // 1-31
  
  document.getElementById('today-date').innerText = `${String(currentMonth + 1).padStart(2, '0')}/${String(currentDay).padStart(2, '0')}`;

  const historyEntries = rawData.allEntries.filter(e => {
    const d = new Date(e.date);
    return d.getUTCMonth() === currentMonth && d.getUTCDate() === currentDay;
  });

  if (historyEntries.length === 0) {
    container.innerHTML = `<div class="loading-text" style="padding: 20px;">No gaming history on this day.</div>`;
    return;
  }

  historyEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = historyEntries.map(e => {
    const year = new Date(e.date).getUTCFullYear();
    const bgColor = getStatusColor(e.status);
    return `
      <div class="list-item" style="border-left-color: ${bgColor};">
        <div class="item-info">
          <span class="item-rank" style="color: #444;">${year}</span>
          <div class="item-text">
            <span class="item-title hover-trigger" data-game="${escapeHTML(e.game)}">${escapeHTML(e.game)} (${escapeHTML(e.system)})</span>
            <span class="item-sub" style="color: #666;">${escapeHTML(e.note)}</span>
          </div>
        </div>
        <div class="item-badge" style="background-color: ${bgColor}; color: #000; text-shadow: 0 0 2px rgba(255,255,255,0.5);">${formatTime(timeStringToSeconds(e.time))}</div>
      </div>
    `;
  }).join('');
}
function renderRandomTop25() {
  const selected = document.getElementById('random-top25-select').value;
  const pair = allTop25Tables.find(t => t.mainTitle === selected);
  if (!pair) return;

  const renderTable = (data, title) => `
    <div class="spotlight-section">
      <h3 class="spotlight-subtitle">${escapeHTML(title)}</h3>
      <table class="top25-table">
        <thead><tr>${data.headers.map(h => `<th>${escapeHTML(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${data.rows.map(row => `<tr>${row.map(cell => {
            // Apply inline style for bolding if marked in the sheet
            const boldStyle = cell.isBold ? 'style="font-weight: 800; color: #000; background-color: #f0fff4;"' : '';
            return `<td ${boldStyle}><span class="hover-trigger" data-game="${escapeHTML(cell.val)}">${escapeHTML(cell.val)}</span></td>`;
          }).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('random-top25-content').innerHTML = `
    <div class="spotlight-dual-container">
      ${renderTable(pair.left, pair.left.title)}
      ${pair.right ? renderTable(pair.right, pair.right.title) : ''}
    </div>`;
}

// --- ANALYSIS TABLES ---
function renderAnalysis(type) {
  const container = document.getElementById('analysis-content');
  if (!rawData || !rawData.metrics) return;

  let html = `<div style="overflow-x: auto;"><table class="analysis-table"><thead><tr>`;
  
  if (type === 'playthrough') {
    const data = rawData.metrics.playthroughAnalysis;
    const timeframes = Object.keys(data).sort((a, b) => a === 'All-Time' ? -1 : b === 'All-Time' ? 1 : b - a);
    
    html += `<th>Timeframe</th><th>Total PTs</th><th># Completed</th><th># Abandoned</th><th># Active</th><th>Comp Rate</th><th># Multiplayer</th><th># Non-Comp</th><th>Avg Time</th><th>Avg Days</th></tr></thead><tbody>`;
    
    timeframes.forEach(key => {
      const s = data[key];
      const completions = s.completed + s.postgame;
      html += `<tr class="${key === 'All-Time' ? 'all-time-row' : ''}">
        <td class="text-left">${key}</td><td>${s.totalPlaythroughs}</td><td>${completions}</td><td>${s.abandoned}</td><td>${s.active}</td>
        <td>${(s.completionRate * 100).toFixed(1)}%</td><td>${s.multiplayer}</td><td>${s.nonCompletable}</td>
        <td>${formatHHMM(s.avgCompletionTimeSeconds)}</td><td>${s.avgCompletionDays.toFixed(1)}</td>
      </tr>`;
    });
  } 
  else if (type === 'dayOfWeek') {
    const data = rawData.metrics.dayOfWeekStats;
    const timeframes = Object.keys(data).sort((a, b) => a === 'All-Time' ? -1 : b === 'All-Time' ? 1 : b.localeCompare(a));
    
    html += `<th>Timeframe</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr></thead><tbody>`;
    
    timeframes.forEach(key => {
      const s = data[key];
      html += `<tr class="${key === 'All-Time' ? 'all-time-row' : ''}">
        <td class="text-left">${key}</td>
        ${[1,2,3,4,5,6,0].map(day => `<td>${formatHHMM(s[day] || 0)}</td>`).join('')}
      </tr>`;
    });
  } 
  else {
    const map = { genre: 'genreAnalysis', releaseYear: 'releaseYearAnalysis', developer: 'developerAnalysis', publisher: 'publisherAnalysis' };
    const dataKey = map[type];
    const data = rawData.metrics[dataKey];
    const nameKey = type;
    
    let sortedData = Object.values(data).filter(item => item[nameKey] !== "N/A");
    if (type === 'releaseYear') sortedData.sort((a,b) => b[nameKey] - a[nameKey]);
    else sortedData.sort((a,b) => b.totalPlaythroughs - a.totalPlaythroughs);

    html += `<th>${type.charAt(0).toUpperCase() + type.slice(1)}</th><th>Total PTs</th><th># Completed</th><th># Abandoned</th><th># Active</th><th>Comp Rate</th><th># Multiplayer</th><th># Non-Comp</th><th>Avg Time</th><th>Avg Days</th></tr></thead><tbody>`;
    
    sortedData.forEach(s => {
      const completions = s.completed + s.postgame;
      html += `<tr>
        <td class="text-left">${escapeHTML(s[nameKey])}</td><td>${s.totalPlaythroughs}</td><td>${completions}</td><td>${s.abandoned}</td><td>${s.active}</td>
        <td>${(s.completionRate * 100).toFixed(1)}%</td><td>${s.multiplayer}</td><td>${s.nonCompletable}</td>
        <td>${formatHHMM(s.avgCompletionTimeSeconds)}</td><td>${s.avgCompletionDays.toFixed(1)}</td>
      </tr>`;
    });
  }
  
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// --- MILESTONES ---
function renderMilestones() {
  const container = document.getElementById('milestones-list');
  if (!rawData || !rawData.metrics || !rawData.metrics.milestones) return;
  
  const milestones = rawData.metrics.milestones.slice().sort((a,b) => new Date(b.date) - new Date(a.date));
  
  container.innerHTML = milestones.map(m => `
    <div class="milestone-item">
      <div class="milestone-date">${formatShortDate(m.date)}/${new Date(m.date).getUTCFullYear()}</div>
      <div class="milestone-detail">${escapeHTML(m.details)}</div>
    </div>
  `).join('');
}

// --- CALENDAR HEATMAP & TIMEFRAME SUMMARIES ---
function renderHeatmap(mode) {
  const container = document.getElementById('heatmap-content');
  if (!rawData || !rawData.metrics || !rawData.metrics.calendarData) return;

  // --- NEW: Game of the Year (Scores) Summary ---
  if (mode === 'gotySummary') {
    const ratedGames = metaGames.filter(g => g.score !== null);
    
    // Group games by their release year
    const gamesByYear = {};
    ratedGames.forEach(g => {
      const y = g.releaseYear;
      if (y !== 'Unknown') {
        if (!gamesByYear[y]) gamesByYear[y] = [];
        gamesByYear[y].push(g);
      }
    });
    
    const sortedYears = Object.keys(gamesByYear).sort((a,b) => b - a);
    
    let html = `<div style="overflow-x: auto;"><table class="analysis-table"><thead><tr>`;
    html += `<th>Release Year</th><th>🏆 GOTY</th><th>2nd Place</th><th>3rd Place</th><th>4th Place</th><th>5th Place</th></tr></thead><tbody>`;
    
    // 1. Render All-Time Top 5
    const allTimeTop5 = [...ratedGames].sort((a,b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5);
    html += `<tr class="all-time-row">
      <td class="text-center" style="font-weight: bold;">All-Time</td>
      ${[0,1,2,3,4].map(i => {
         if (allTimeTop5[i]) {
             const displayScore = Number.isInteger(allTimeTop5[i].score) ? allTimeTop5[i].score : allTimeTop5[i].score.toFixed(1);
             return `<td style="font-size: 0.85rem; text-align: left;">[${displayScore}] <span class="hover-trigger" data-game="${escapeHTML(allTimeTop5[i].name)}">${escapeHTML(allTimeTop5[i].name)}</span></td>`;
         } else {
             return `<td></td>`;
         }
      }).join('')}
    </tr>`;

    // 2. Render Top 5 for each individual Release Year
    sortedYears.forEach(year => {
      const yearTop5 = gamesByYear[year].sort((a,b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5);
      html += `<tr>
        <td class="text-center" style="font-weight: bold; font-size: 1.1rem;">${year}</td>
        ${[0,1,2,3,4].map(i => {
           if (yearTop5[i]) {
               const displayScore = Number.isInteger(yearTop5[i].score) ? yearTop5[i].score : yearTop5[i].score.toFixed(1);
               return `<td style="font-size: 0.85rem; text-align: left;">[${displayScore}] <span class="hover-trigger" data-game="${escapeHTML(yearTop5[i].name)}">${escapeHTML(yearTop5[i].name)}</span></td>`;
           } else {
               return `<td></td>`;
           }
        }).join('')}
      </tr>`;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
    return;
  }
  
  // 1. Render Chart Tables (Game/Genre Summaries)
  if (mode === 'gameSummary' || mode === 'genreSummary') {
    const isGame = mode === 'gameSummary';
    const map = isGame ? 
      { 'All-Time': rawData.metrics.allTimeGameStats, ...rawData.metrics.yearlyGameStats, ...rawData.metrics.monthlyStats } :
      { 'All-Time': rawData.metrics.allTimeGenreStats, ...rawData.metrics.yearlyGenreStats, ...rawData.metrics.monthlyGenreStats };
    
    const gameMapForDays = { 'All-Time': rawData.metrics.allTimeGameStats, ...rawData.metrics.yearlyGameStats, ...rawData.metrics.monthlyStats };

    const yearKeys = Object.keys(rawData.metrics.yearlyGameStats).sort().reverse();
    const monthKeys = Object.keys(rawData.metrics.monthlyStats).sort().reverse();
    const timeframes = ['All-Time', ...yearKeys, ...monthKeys];

    let html = `<div style="overflow-x: auto;"><table class="analysis-table"><thead><tr>`;
    html += `<th>Timeframe</th><th>Time Spent</th><th>Days Played</th><th>1st Most</th><th>2nd Most</th><th>3rd Most</th><th>4th Most</th><th>5th Most</th></tr></thead><tbody>`;

    timeframes.forEach(key => {
      const stats = map[key] || {};
      const top5 = Object.entries(stats).map(([name, data]) => ({ name, ...data })).sort((a,b) => b.totalSeconds - a.totalSeconds).slice(0, 5);
      const totalTime = Object.values(stats).reduce((sum, item) => sum + item.totalSeconds, 0);
      
      const totalDaysSet = new Set();
      const statsForDays = isGame ? stats : gameMapForDays[key];
      if (statsForDays) {
          Object.values(statsForDays).forEach(item => {
              if (item.days) {
                  // Safely handle Sets, Arrays, or raw data objects
                  const daysArr = item.days instanceof Set 
                      ? Array.from(item.days) 
                      : (Array.isArray(item.days) ? item.days : (item.days.data || []));
                  daysArr.forEach(d => totalDaysSet.add(d));
              }
          });
      }
      
      let displayKey = key;
      if (key !== 'All-Time' && key.includes('-')) {
          const [y, m] = key.split('-');
          const dateObj = new Date(Date.UTC(y, m-1, 1));
          displayKey = `${y}-${m} ${dateObj.toLocaleString('en-US', {month: 'long', timeZone: 'UTC'})}`;
      }

      html += `<tr class="${key === 'All-Time' ? 'all-time-row' : ''}">
        <td class="text-left" style="white-space: nowrap; font-weight: bold;">${displayKey}</td>
        <td>${formatHHMM(totalTime)}</td>
        <td>${totalDaysSet.size}</td>
        ${[0,1,2,3,4].map(i => {
           if (top5[i]) {
               if (isGame) {
                   // Safely handle Sets, Arrays, or raw data objects for Systems
                   const sysStr = top5[i].systems instanceof Set 
                       ? Array.from(top5[i].systems).join(', ') 
                       : (Array.isArray(top5[i].systems) ? top5[i].systems.join(', ') : (top5[i].systems && top5[i].systems.data ? top5[i].systems.data.join(', ') : ''));
                       
                   return `<td style="font-size: 0.75rem; text-align: left;">[${formatHHMM(top5[i].totalSeconds)}] ${escapeHTML(top5[i].name)} (${escapeHTML(sysStr)})</td>`;
               } else {
                   return `<td style="font-size: 0.75rem; text-align: left;">[${formatHHMM(top5[i].totalSeconds)}] ${escapeHTML(top5[i].name)}</td>`;
               }
           } else {
               return `<td></td>`;
           }
        }).join('')}
      </tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
    return;
  }

  // 2. Render Calendar Heatmaps (Days/Time)
  const calData = rawData.metrics.calendarData;
  const possible = rawData.metrics.possibleYears;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  let maxTime = 0;
  if (mode === 'time') {
    for (let m=0; m<12; m++) {
      for (let d=1; d<=31; d++) {
        if (calData[m][d].totalSeconds > maxTime) maxTime = calData[m][d].totalSeconds;
      }
    }
  }
  const logMax = Math.log(maxTime > 0 ? maxTime : 1);

  let html = `<div style="overflow-x: auto; padding: 20px;"><table class="heatmap-table"><thead><tr><th></th>`;
  for (let i = 1; i <= 31; i++) html += `<th>${i}</th>`;
  html += `</tr></thead><tbody>`;

  for (let m = 0; m < 12; m++) {
    html += `<tr><th style="text-align: right; padding-right: 10px;">${monthNames[m]}</th>`;
    const daysInBaseYear = new Date(2023, m + 1, 0).getDate();

    for (let d = 1; d <= 31; d++) {
      if (d > daysInBaseYear && !(m === 1 && d === 29)) {
        html += `<td class="heatmap-empty"></td>`;
        continue;
      }

      const dayData = calData[m][d];
      const poss = possible[m][d];
      const playedCount = dayData.yearsPlayed ? (Array.isArray(dayData.yearsPlayed) ? dayData.yearsPlayed.length : (dayData.yearsPlayed.data ? dayData.yearsPlayed.data.length : 0)) : 0;
      const timeSec = dayData.totalSeconds;

      let bgColor = '#f7f7f7';
      let titleText = `${monthNames[m]} ${d}`;
      let innerText = '';

      if (mode === 'days') {
        if (poss > 0) {
          if (playedCount > 0 && playedCount === poss) bgColor = '#7CFC00'; // Perfect
          else {
            const ratio = playedCount / poss;
            if (ratio >= 0.8) bgColor = '#008837';
            else if (ratio >= 0.6) bgColor = '#a6dba0';
            else if (ratio >= 0.4) bgColor = '#ffffbf';
            else if (ratio >= 0.2) bgColor = '#fee08b';
            else if (ratio > 0) bgColor = '#f1a340';
          }
          innerText = playedCount > 0 ? `${playedCount}` : '';
          titleText += `: ${playedCount}/${poss} Years Played`;
        }
      } else if (mode === 'time') {
        if (timeSec > 0) {
          const ratio = Math.log(timeSec) / logMax;
          if (ratio >= 0.9) bgColor = '#cc4c02';
          else if (ratio >= 0.75) bgColor = '#ec7014';
          else if (ratio >= 0.6) bgColor = '#fe9929';
          else if (ratio >= 0.45) bgColor = '#fec44f';
          else if (ratio >= 0.3) bgColor = '#fee391';
          else bgColor = '#fff7bc';
          titleText += `: ${formatHHMM(timeSec)} Hours`;
        }
      }

      html += `<td style="background-color: ${bgColor};" title="${titleText}">${innerText}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

let currentGameHistory = [];
let historyDisplayLimit = 50;

function renderGameHistory(gameName) {
  const container = document.getElementById('game-history-content');
  if (!rawData || !rawData.allEntries) return;

  // Store the full array in state and reset the limit
  currentGameHistory = rawData.allEntries.filter(e => e.game === gameName).slice().reverse();
  historyDisplayLimit = 50; 

  if (currentGameHistory.length === 0) {
    container.innerHTML = `<div class="loading-text" style="padding: 20px;">No entries found.</div>`;
    return;
  }

  updateGameHistoryDOM();
}

function updateGameHistoryDOM() {
  const container = document.getElementById('game-history-content');
  const entriesToShow = currentGameHistory.slice(0, historyDisplayLimit);

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

  entriesToShow.forEach(entry => {
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

  // Add the Load More button if there are remaining entries
  if (currentGameHistory.length > historyDisplayLimit) {
    html += `
      <div style="text-align: center; padding: 10px;">
        <button id="load-more-history" class="theme-btn" style="position: static; margin-bottom: 20px;">Load More Entries (${currentGameHistory.length - historyDisplayLimit} remaining)</button>
      </div>
    `;
  }

  container.innerHTML = html;

  // Attach listener to the new button
  const loadMoreBtn = document.getElementById('load-more-history');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      historyDisplayLimit += 50;
      updateGameHistoryDOM();
    });
  }
}

// --- SERIES ARCHIVE ---
function renderSeriesArchive(seriesName) {
  const container = document.getElementById('series-archive-content');
  if (!rawData || !rawData.playthroughHistory || !metaGames) return;

  // 1. Find all games belonging to this series
  const seriesGames = metaGames.filter(g => g.franchise === seriesName).map(g => g.name);

  // 2. Find all playthroughs for these games
  const pts = Object.values(rawData.playthroughHistory).filter(pt => seriesGames.includes(pt.gameName));

  if (pts.length === 0) {
    container.innerHTML = `<div class="loading-text" style="padding: 20px;">No playthroughs logged for this series.</div>`;
    return;
  }

  // 3. Sort playthroughs: Group by game, sort groups by newest overall update, sort PTs within group by newest
  const gameMaxDates = {};
  // First pass: find the absolute latest update date for every single game in the series
  pts.forEach(pt => {
      const ptDate = new Date(pt.lastDate).getTime();
      if (!gameMaxDates[pt.gameName] || ptDate > gameMaxDates[pt.gameName]) {
          gameMaxDates[pt.gameName] = ptDate;
      }
  });

  pts.sort((a, b) => {
      // Compare the overall max lastDate for the two games (Newest Game Group on top)
      const gameDateDiff = gameMaxDates[b.gameName] - gameMaxDates[a.gameName];
      if (gameDateDiff !== 0) return gameDateDiff; 
      
      // If it's the exact same game, sort its individual playthroughs by their own lastDate (Newest PT on top)
      return new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime();
  });

  // 4. Get the absolute latest Game Lifetime totals for each game
  const gameTotals = {};
  seriesGames.forEach(game => {
     const gameEntries = rawData.allEntries.filter(e => e.game === game);
     if (gameEntries.length > 0) {
         const lastE = gameEntries[gameEntries.length - 1];
         gameTotals[game] = { time: lastE.gameLifetime, days: lastE.gameLifetimeDays };
     }
  });

  // 5. Calculate Series Totals
  const uniqueGamesCount = new Set(pts.map(pt => pt.gameName)).size;
  let totalSeconds = 0;
  let totalDays = 0;

  pts.forEach(pt => {
     totalSeconds += timeStringToSeconds(pt.finalPtLifetime);
     totalDays += parseInt(pt.finalPtLifetimeDays) || 0;
  });

  // 6. Build the HTML (Using the clean standard dashboard theme)
  let html = `
    <div class="monthly-table-wrapper" style="padding: 20px;">
      <table class="monthly-table" style="min-width: 1100px;">
        <thead>
          <tr>
            <th rowspan="2">Videogame</th>
            <th rowspan="2">System</th>
            <th colspan="2">Playthrough Lifetime</th>
            <th colspan="2">Game Lifetime</th>
            <th rowspan="2">Date Started</th>
            <th rowspan="2">Last Updated</th>
            <th rowspan="2">Game Status</th>
            <th rowspan="2">Playthrough Details</th>
          </tr>
          <tr>
            <th>Time</th>
            <th>Days</th>
            <th>Time</th>
            <th>Days</th>
          </tr>
        </thead>
        <tbody>
  `;

  pts.forEach(pt => {
    const bgColor = getStatusColor(pt.finalStatus);
    const gTime = gameTotals[pt.gameName] ? gameTotals[pt.gameName].time : "00:00";
    const gDays = gameTotals[pt.gameName] ? gameTotals[pt.gameName].days : "0";

    html += `
      <tr>
        <td class="text-left" style="font-weight: bold;">
          <span class="hover-trigger" data-game="${escapeHTML(pt.gameName)}">${escapeHTML(pt.gameName)}</span>
        </td>
        <td class="text-center">${escapeHTML(pt.system)}</td>
        <td class="text-center">${pt.finalPtLifetime}</td>
        <td class="text-center">${pt.finalPtLifetimeDays}</td>
        <td class="text-center">${gTime}</td>
        <td class="text-center">${gDays}</td>
        <td class="text-center">${formatFullDate(pt.startDate)}</td>
        <td class="text-center">${formatFullDate(pt.lastDate)}</td>
        <td class="text-center status-cell" style="background-color: ${bgColor}; font-weight: bold;">${pt.finalStatus}</td>
        <td class="text-left">${escapeHTML(pt.finalNote)}</td>
      </tr>
    `;
  });

  // The Totals Row using the clean dark theme
  html += `
          <tr class="grand-total-row">
            <td colspan="2" class="text-right" style="padding-right: 15px;">Series Total: ${uniqueGamesCount} Game${uniqueGamesCount !== 1 ? 's' : ''}</td>
            <td class="text-center">${formatHHMM(totalSeconds)}</td>
            <td class="text-center">${totalDays}</td>
            <td colspan="6"></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
  container.innerHTML = html;
}

// Accordion Helper
window.toggleAccordion = function(targetClass, toggleRow) {
  const rows = document.querySelectorAll(`.${targetClass}`);
  const icon = toggleRow.querySelector('.toggle-icon');
  
  let isHidden = true;
  rows.forEach(row => {
    if (row.style.display === 'none') {
      row.style.display = 'table-row';
      isHidden = false;
    } else {
      row.style.display = 'none';
    }
  });

  // Update the text and icon direction based on the state
  if (!isHidden) {
    icon.innerHTML = '▼';
    toggleRow.innerHTML = toggleRow.innerHTML.replace(/Show \d+ Past/, "Hide Past");
  } else {
    icon.innerHTML = '▶';
    toggleRow.innerHTML = toggleRow.innerHTML.replace("Hide Past", `Show ${rows.length} Past`);
  }
};

function renderSideBySideMetrics(year) {
  const systemsContainer = document.getElementById('most-played-systems-list');
  const franchisesContainer = document.getElementById('most-played-franchises-list');
  const genresContainer = document.getElementById('most-played-genres-list');

  if (!rawData || !rawData.allEntries) return;

  // Filter based on the string date (no .toISOString() needed)
  const entries = year === 'All-Time' 
    ? rawData.allEntries 
    : rawData.allEntries.filter(e => e.date && e.date.startsWith(year));

  const systems = {};
  const franchises = {};
  const genres = {};

  const initMetricObj = (name) => ({ 
    name: name, 
    totalSeconds: 0, 
    uniqueGames: new Set(), 
    gamePlaytimes: {},
    days: new Set(),
    firstPlayed: null,
    lastPlayed: null
  });

  entries.forEach(e => {
    const seconds = timeStringToSeconds(e.time);
    const dateKey = e.date.split('T')[0]; // Safe string split
    const entryDate = new Date(e.date);

    const updateObj = (obj) => {
        obj.totalSeconds += seconds;
        obj.uniqueGames.add(e.game);
        obj.gamePlaytimes[e.game] = (obj.gamePlaytimes[e.game] || 0) + seconds;
        obj.days.add(dateKey);
        if (!obj.firstPlayed || entryDate < obj.firstPlayed) obj.firstPlayed = entryDate;
        if (!obj.lastPlayed || entryDate > obj.lastPlayed) obj.lastPlayed = entryDate;
    };

    if (e.system && e.system !== "N/A") {
      if (!systems[e.system]) systems[e.system] = initMetricObj(e.system);
      updateObj(systems[e.system]);
    }

    if (e.series && e.series !== "N/A" && e.series.toUpperCase() !== 'ZZNONE') {
      if (!franchises[e.series]) franchises[e.series] = initMetricObj(e.series);
      updateObj(franchises[e.series]);
    }

    if (e.genre && e.genre !== "N/A") {
      if (!genres[e.genre]) genres[e.genre] = initMetricObj(e.genre);
      updateObj(genres[e.genre]);
    }
  });

  const getTopGameString = (gamePlaytimes) => {
    let topGame = "";
    let maxSeconds = -1;
    for (const [game, seconds] of Object.entries(gamePlaytimes)) {
      if (seconds > maxSeconds) {
        maxSeconds = seconds;
        topGame = game;
      }
    }
    return maxSeconds > 0 ? `${topGame} (${formatTime(maxSeconds)})` : "N/A";
  };

  const generateListHtml = (metricsObj) => {
    const sorted = Object.values(metricsObj).sort((a, b) => b.totalSeconds - a.totalSeconds);
    if (sorted.length === 0) return `<div class="loading-text">No data logged.</div>`;

    return sorted.map((item, index) => {
      const topGameInfo = getTopGameString(item.gamePlaytimes);
      const formatDate = (d) => d ? `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}` : '';
      
      return `
        <div class="list-item" style="align-items: flex-start; flex-direction: column; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
          <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
            <span class="item-title" style="font-weight: bold;">#${index + 1} ${escapeHTML(item.name)}</span>
            <div class="item-badge">${formatTime(item.totalSeconds)}</div>
          </div>
          <div class="item-sub" style="font-size: 0.8rem; color: #666; margin-top: 4px; width: 100%;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span><strong>${item.uniqueGames.size}</strong> games | <strong>${item.days.size}</strong> days</span>
              <span style="font-size: 0.75rem;">${formatDate(item.firstPlayed)} - ${formatDate(item.lastPlayed)}</span>
            </div>
            <div style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              Top Game: <span class="hover-trigger" data-game="${escapeHTML(topGameInfo.split(' (')[0])}" style="color: #0056b3; cursor: pointer;">${escapeHTML(topGameInfo)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  systemsContainer.innerHTML = generateListHtml(systems);
  franchisesContainer.innerHTML = generateListHtml(franchises);
  genresContainer.innerHTML = generateListHtml(genres);
}

// --- THEME TOGGLE LOGIC ---
function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  
  // Check local storage for user preference
  const savedTheme = localStorage.getItem('yoshi-theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    btn.innerText = '☀️ Light Mode';
  }

  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('yoshi-theme', isDark ? 'dark' : 'light');
    btn.innerText = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
    
  });
}

// --- LIVE SEARCH (ARCHIVES) ---
function setupLiveSearch() {
  const gameSearch = document.getElementById('game-search');
  const gameDatalist = document.getElementById('game-datalist');
  const seriesSearch = document.getElementById('series-search');
  const seriesDatalist = document.getElementById('series-datalist');

  // Populate Game Search
  if (gameSearch && gameDatalist) {
    const uniqueGames = [...new Set(rawData.allEntries.map(e => e.game))].sort((a,b) => a.localeCompare(b));
    gameDatalist.innerHTML = uniqueGames.map(g => `<option value="${escapeHTML(g)}">`).join('');
    
    // Set initial value to the most recently played game
    const mostRecentGame = rawData.allEntries[rawData.allEntries.length - 1].game;
    gameSearch.value = mostRecentGame;
    renderGameHistory(mostRecentGame);

    // Listen for typing/selection
    gameSearch.addEventListener('input', (e) => {
      const val = e.target.value;
      if (uniqueGames.includes(val)) {
        renderGameHistory(val);
      }
    });
  }

  // Populate Series Search
  if (seriesSearch && seriesDatalist) {
    const franchises = [...new Set(metaGames.map(g => g.franchise))].filter(f => f !== 'Unknown' && f !== 'ZZNONE').sort();
    seriesDatalist.innerHTML = franchises.map(f => `<option value="${escapeHTML(f)}">`).join('');
    
    // Find the most recently played franchise for the initial render
    let initialSeries = franchises.length > 0 ? franchises[0] : "";
    for (let i = rawData.allEntries.length - 1; i >= 0; i--) {
        if (rawData.allEntries[i].series && rawData.allEntries[i].series !== "N/A" && rawData.allEntries[i].series.toUpperCase() !== 'ZZNONE') {
            initialSeries = rawData.allEntries[i].series;
            break;
        }
    }
    
    seriesSearch.value = initialSeries;
    renderSeriesArchive(initialSeries);

    // Listen for typing/selection
    seriesSearch.addEventListener('input', (e) => {
      const val = e.target.value;
      if (franchises.includes(val)) {
        renderSeriesArchive(val);
      }
    });
  }
}

initDashboard();
