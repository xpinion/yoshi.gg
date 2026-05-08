//================================================================//
//                                                                //
//                       REPORT GENERATORS                        //
//                                                                //
//================================================================//

function generateTop25AndExport() {
  SpreadsheetApp.getActiveSpreadsheet().toast('Generating Top 25 Data...', 'In Progress', -1);
  generateTop25Report();
  
  SpreadsheetApp.getActiveSpreadsheet().toast('Exporting JSON payloads to GitHub...', 'In Progress', -1);
  exportWebDataToGitHub();
  
  SpreadsheetApp.getActiveSpreadsheet().toast('All operations complete! Dashboards updated.', 'Success', 5);
}

function getActiveSS() {
  if (!_SS_CACHE) {
    _SS_CACHE = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return _SS_CACHE;
}

function generateStandardReport(reportSheetName, writerFunction) {
  const ss = getActiveSS(); 
  const masterSheet = ss.getSheetByName("Master");
  const reportSheet = ss.getSheetByName(reportSheetName);

  if (!masterSheet || !reportSheet) {
    Logger.log(`Error: Could not find Master or ${reportSheetName} sheet.`);
    return;
  }

  reportSheet.setFrozenRows(0);
  const { allEntries, playthroughHistory, metrics } = getAggregatedData();

  if (!allEntries || !playthroughHistory) {
    Logger.log(`Could not retrieve aggregated data for ${reportSheetName}.`);
    return;
  }
  
  writerFunction(reportSheet, allEntries, playthroughHistory, metrics, masterSheet);
}

function generateTop25Report() {
  generateStandardReport("top25", writeTop25Report);
}

function writeTop25Report(sheet, allEntries, playthroughHistory, metrics) {
  const currentYear = new Date().getFullYear();
   
  const getTopList = (dataArray, sortValueFn, secondarySortFn = null) => {
    if (!dataArray) return [];
    dataArray.sort((a, b) => {
      const valDiff = sortValueFn(b) - sortValueFn(a);
      if (valDiff !== 0) return valDiff;
      return secondarySortFn ? secondarySortFn(a, b) : 0;
    });
    return sliceWithTies(dataArray, 25, sortValueFn);
  };

  const entriesToSortedList = (objData, sortKey) => {
    if (!objData) return [];
    const array = Object.entries(objData).map(([key, stats]) => {
        return typeof stats === 'number' 
            ? { name: key, value: stats } 
            : { name: key, ...stats };
    });
    return getTopList(array, item => {
       if (sortKey.endsWith('.size') && item[sortKey.split('.')[0]] instanceof Set) {
           return item[sortKey.split('.')[0]].size;
       }
       return item[sortKey];
    });
  };

  const allBusiestMonthData = Object.entries(metrics.busiestMonthData).map(([monthKey, monthData]) => {
    const gamesInMonth = metrics.monthlyStats[monthKey];
    let top3Games = [];
    if (gamesInMonth) {
      top3Games = Object.entries(gamesInMonth)
        .sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)
        .slice(0, 3)
        .map(([name, data]) => ({ name: `${name} (${Array.from(data.systems).join(', ')})`, time: data.totalSeconds }));
    }
    return { monthKey, ...monthData, top3Games };
  });

  const processedBusiestMultiplayerDays = Object.values(metrics.busiestMultiplayerDayData).map(day => ({
    ...day,
    top3Games: Object.entries(day.games)
      .sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)
      .slice(0, 3)
      .map(([name, data]) => ({ name: `${name} (${Array.from(data.systems).join(', ')})`, time: data.totalSeconds }))
  }));

  const processedBusiestMultiplayerMonths = Object.entries(metrics.busiestMultiplayerMonthData).map(([monthKey, monthData]) => {
    let top3Games = [];
    if (monthData.games) {
      top3Games = Object.entries(monthData.games)
        .sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)
        .slice(0, 3)
        .map(([name, data]) => ({ name: `${name} (${Array.from(data.systems).join(', ')})`, time: data.totalSeconds }));
    }
    return { monthKey, ...monthData, top3Games };
  });

  const gamesByMonthCountProcessed = Object.entries(metrics.gameMonthlyPresence).map(([game, months]) => {
      const sortedRawMonths = Array.from(months).sort((a, b) => a.localeCompare(b));
      return { 
          game, 
          count: months.size, 
          months: compressMonthRanges(sortedRawMonths), 
          firstPlayed: metrics.allTimeGameStats[game].firstPlayedDate, 
          lastPlayed: metrics.allTimeGameStats[game].lastPlayedDate,
          systems: metrics.allTimeGameStats[game].systems 
      };
  });

  const gamesByYearCountProcessed = Object.entries(metrics.gameYearlyPresence).map(([game, years]) => ({ 
      game, 
      count: years.size, 
      years: Array.from(years).sort(), 
      firstPlayed: metrics.allTimeGameStats[game].firstPlayedDate, 
      lastPlayed: metrics.allTimeGameStats[game].lastPlayedDate,
      systems: metrics.allTimeGameStats[game].systems 
  }));

  // --- ADDED IN STEP 1: Calculate running leader for "Most Years Played" ---
  let minPresenceYear = currentYear;
  for (const years of Object.values(metrics.gameYearlyPresence)) {
      for (const y of years) {
          if (parseInt(y) < minPresenceYear) minPresenceYear = parseInt(y);
      }
  }
  
  const yearlyRunningYearsPlayed = [];
  for (let y = currentYear; y >= minPresenceYear; y--) {
      let maxYearsCount = 0;
      let leaders = [];
      
      for (const [game, yearsSet] of Object.entries(metrics.gameYearlyPresence)) {
          // Only count years that occurred ON or BEFORE the current evaluation year
          const playedYearsUpToY = Array.from(yearsSet).filter(yearStr => parseInt(yearStr) <= y);
          const count = playedYearsUpToY.length;
          
          if (count > maxYearsCount) {
              maxYearsCount = count;
              leaders = [{ game, count, systems: metrics.allTimeGameStats[game].systems }];
          } else if (count === maxYearsCount && maxYearsCount > 0) {
              leaders.push({ game, count, systems: metrics.allTimeGameStats[game].systems });
          }
      }
      
      // Break ties by looking at total all-time playtime
      leaders.sort((a, b) => metrics.allTimeGameStats[b.game].totalSeconds - metrics.allTimeGameStats[a.game].totalSeconds);

      yearlyRunningYearsPlayed.push({
          year: y,
          maxCount: maxYearsCount,
          leaders: leaders
      });
  }
  // --- END OF ADDED CODE ---

  const processPresence = (presenceObj) => Object.values(presenceObj).map(item => ({
      name: item.name, 
      count: item.years ? item.years.size : item.months.size,
      values: Array.from(item.years || item.months).sort((a, b) => (typeof a === 'string') ? a.localeCompare(b) : a - b),
      firstSeen: item.firstSeen, 
      lastSeen: item.lastSeen 
  }));

  const filteredYearlySeriesStats = {};
  for (const year in metrics.yearlySeriesStats) {
    const yearData = metrics.yearlySeriesStats[year];
    filteredYearlySeriesStats[year] = {};
    for (const series in yearData) {
      if (yearData[series].games.size >= 2) {
        filteredYearlySeriesStats[year][series] = yearData[series];
      }
    }
  }

  const metaGameCountData = {};
  ['series', 'genre', 'developer', 'publisher', 'releaseYear'].forEach(key => {
    const rawObj = metrics.gamesByMetaInTimeframe[key].yearly;
    const flatList = Object.values(rawObj).map(item => {
      const totalSeconds = Object.values(item.gameTimes).reduce((a, b) => a + b, 0);
      return {
        name: item.metaValue,
        year: parseInt(item.year),
        count: item.games.size,
        totalSeconds: totalSeconds, 
        minDate: item.minDate,
        maxDate: item.maxDate
      };
    });
    metaGameCountData[`top${key}`] = getTopList(flatList, i => i.count);
    metaGameCountData[`yearly${key}`] = getYearlyBests('event', flatList, 'count', 'maxDate');
  });

  const allStreaksData = {
    systemStreaks: getTopList(metrics.systemStreaks, i => i.length),
    yearlySystemStreaks: Object.keys(metrics.yearlySystemStreaks || {}) 
        .sort((a, b) => b - a)
        .flatMap(year => metrics.yearlySystemStreaks[year].map(item => ({
            year: parseInt(year),
            data: item,
            isTie: metrics.yearlySystemStreaks[year].length > 1
        }))),
    oneSittingCompletions: getTopList(metrics.oneSittingCompletions, i => timeStringToSeconds(i.finalPtLifetime)),
    yearlyOneSittingCompletions: getYearlyBests('event', metrics.oneSittingCompletions.map(i => ({...i, seconds: timeStringToSeconds(i.finalPtLifetime)})), 'seconds', 'lastDate'),
    
    topGamingStreaks: getTopList(metrics.gamingStreaks, i => i.length),
    yearlyGamingStreaks: metrics.yearlyGamingStreaks,

    topBreakStreaks: getTopList(metrics.breakStreaks, i => i.length),
    yearlyBreakStreaks: getYearlyBestStreaks(metrics.breakStreaks),

    topSameGameStreaks: getTopList(metrics.allSameGameStreaks, i => i.length),
    yearlySameGameStreaks: getYearlyBestStreaks(metrics.allSameGameStreaks, allEntries),

    topCompletionStreaks: getTopList(metrics.completionStreaks, i => i.length),
    yearlyCompletionStreaks: getYearlyBestCompletionStreaks(metrics.completionStreaks),

    topGamesByYearCount: getTopList(gamesByYearCountProcessed, i => i.count, (a,b) => b.lastPlayed - a.lastPlayed),
    yearlyMostPlayedGame: getYearlyBests('stats', null, 'totalSeconds', metrics.yearlyGameStats),
    yearlyRunningYearsPlayed: yearlyRunningYearsPlayed,

    topGamesByMonthCount: getTopList(gamesByMonthCountProcessed, i => i.count, (a,b) => b.lastPlayed - a.lastPlayed),
    yearlyGamesByMonthCount: getYearlyBests('stats', null, 'months.size', metrics.gameMonthlyPresencePerYear),
    
    yearlySeriesByMonthCount: getYearlyBests('stats', null, 'months.size', metrics.seriesMonthlyPresencePerYear),
    yearlyGenreByMonthCount: getYearlyBests('stats', null, 'months.size', metrics.genreMonthlyPresencePerYear),
    yearlyDeveloperByMonthCount: getYearlyBests('stats', null, 'months.size', metrics.developerMonthlyPresencePerYear),
    yearlyPublisherByMonthCount: getYearlyBests('stats', null, 'months.size', metrics.publisherMonthlyPresencePerYear),

    topGameOverlaps: getTopList(metrics.gameOverlapAllTime, i => i.count),
    yearlyGameOverlaps: getYearlyBests('stats', null, 'count', metrics.gameOverlapByYear),

    topSeries: entriesToSortedList(metrics.seriesData, 'totalSeconds'),
    yearlySeries: getYearlyBests('stats', null, 'totalSeconds', filteredYearlySeriesStats),

    topDevelopers: entriesToSortedList(metrics.developerStats, 'totalSeconds'),
    yearlyDevelopers: getYearlyBests('stats', null, 'totalSeconds', metrics.yearlyDeveloperStats),

    topPublishers: entriesToSortedList(metrics.publisherStats, 'totalSeconds'),
    yearlyPublishers: getYearlyBests('stats', null, 'totalSeconds', metrics.yearlyPublisherStats),
    
    topGenres: entriesToSortedList(metrics.allTimeGenreStats, 'totalSeconds'),
    yearlyGenres: getYearlyBests('stats', null, 'totalSeconds', metrics.yearlyGenreStats || {}),

    topReleaseYears: entriesToSortedList(metrics.releaseYearStats, 'totalSeconds'),
    yearlyReleaseYears: getYearlyBests('stats', null, 'totalSeconds', metrics.yearlyReleaseYearStats),

    topSeriesByDays: entriesToSortedList(metrics.seriesData, 'days.size'),
    yearlySeriesByDays: getYearlyBests('stats', null, 'days.size', metrics.yearlySeriesStats),

    topGenreByDays: entriesToSortedList(metrics.allTimeGenreStats, 'days.size'),
    yearlyGenreByDays: getYearlyBests('stats', null, 'days.size', metrics.yearlyGenreStats),

    topDeveloperByDays: entriesToSortedList(metrics.developerStats, 'days.size'),
    yearlyDeveloperByDays: getYearlyBests('stats', null, 'days.size', metrics.yearlyDeveloperStats),

    topPublisherByDays: entriesToSortedList(metrics.publisherStats, 'days.size'),
    yearlyPublisherByDays: getYearlyBests('stats', null, 'days.size', metrics.yearlyPublisherStats),

    topReleaseYearByDays: entriesToSortedList(metrics.releaseYearStats, 'days.size'),
    yearlyReleaseYearByDays: getYearlyBests('stats', null, 'days.size', metrics.yearlyReleaseYearStats),

    topMultiplayerGames: entriesToSortedList(metrics.multiplayerGameData, 'totalSeconds'),
    yearlyMultiplayerGames: getYearlyBests('stats', null, 'totalSeconds', metrics.yearlyMultiplayerGameStats),

    topMonthlyBinges: getTopList(Object.values(metrics.monthlyGameBingeData), i => i.totalSeconds),
    yearlyMonthlyBinges: getYearlyBests('event', Object.values(metrics.monthlyGameBingeData), 'totalSeconds', 'maxDate'),

    topWeeklyBinges: getTopList(metrics.allWeeklyBinges, i => i.totalSeconds),
    yearlyWeeklyBinges: getYearlyBests('event', metrics.allWeeklyBinges, 'totalSeconds', 'endDate'),

    topBusiestMonths: getTopList(allBusiestMonthData, i => i.totalSeconds),
    yearlyBusiestMonths: getYearlyBests('event', allBusiestMonthData, 'totalSeconds', 'maxDate'),

    topBusiestWeeks: getTopList(findTopNonOverlappingWeeks(allEntries), i => i.totalSeconds),
    yearlyBusiestWeeks: getYearlyBests('event', findTopNonOverlappingWeeks(allEntries), 'totalSeconds', 'endDate'),

    topMonthlyConcentration: getTopList(metrics.monthlyConcentration, i => i.percent),
     yearlyMonthlyConcentration: getYearlyBests('event', metrics.monthlyConcentration, 'percent', 'minDate'),

     topYearlyConcentration: getTopList(metrics.yearlyConcentration, i => i.percent),
     yearlyYearlyConcentration: getYearlyBests('event', metrics.yearlyConcentration, 'percent', 'year'),

    topGameHiatuses: getTopList(metrics.gameHiatuses, i => i.gapDays),
    yearlyGameHiatuses: getYearlyBests('event', metrics.gameHiatuses, 'gapDays', 'endDate'),

    topMetaHiatuses: metrics.topMetaHiatuses,
    yearlyMetaHiatuses: metrics.yearlyMetaHiatuses,

    topDiverseDays: getTopList(Object.keys(metrics.dailyVariety).map(dateStr => ({ 
        date: new Date(dateStr + 'T12:00:00Z'), 
        numGames: metrics.dailyVariety[dateStr].size, 
        totalTime: metrics.dailyTimeTotals[dateStr], 
        games: Array.from(metrics.dailyVariety[dateStr]).join(', ') 
    })), i => i.numGames, (a,b) => b.totalTime - a.totalTime), 
    yearlyDiverseDays: getYearlyBests('event', Object.keys(metrics.dailyVariety).map(dateStr => ({ date: new Date(dateStr + 'T12:00:00Z'), numGames: metrics.dailyVariety[dateStr].size, totalTime: metrics.dailyTimeTotals[dateStr], games: Array.from(metrics.dailyVariety[dateStr]).join(', ') })), 'numGames', 'date'),

    sortedLongestCompletionsByTime: getTopList(metrics.longestCompletionsByTime, i => timeStringToSeconds(i.finalPtLifetime)),
    yearlyCompletionsByTime: getYearlyBests('event', metrics.longestCompletionsByTime.map(i => ({...i, seconds: timeStringToSeconds(i.finalPtLifetime)})), 'seconds', 'lastDate'),

    fastestCompletionsByTime: metrics.fastestCompletionsByTime,
    
    sortedLongestCompletionsByDays: getTopList(metrics.longestCompletionsByDays, i => i.durationDays),
    yearlyCompletionsByDays: getYearlyBests('event', metrics.longestCompletionsByDays, 'durationDays', 'lastDate'),

    topAbandoned: getTopList(metrics.abandonedPlaythroughs, i => i.totalSeconds),
    yearlyAbandoned: getYearlyBests('event', metrics.abandonedPlaythroughs, 'totalSeconds', 'lastDate'),

    topCompletedGames: getTopList(metrics.completionStats, i => i.completions),
    yearlyCompletedGames: Object.keys(metrics.yearlyCompletionStats).map(year => {
       const yearData = metrics.yearlyCompletionStats[year];
       if (!yearData) return { year: parseInt(year), data: null, maxCompletions: 0 };
       const topGame = Object.values(yearData).sort((a, b) => b.completions - a.completions)[0];
       return { year: parseInt(year), data: topGame, maxCompletions: topGame.completions };
    }).sort((a, b) => b.year - a.year),

    topMarathons: getTopList(metrics.marathonGames, i => i.count),
    yearlyMarathons: getYearlyBests('stats', null, 'count', metrics.yearlyMarathonCounts),

    topShortSessions: getTopList(metrics.shortSessionGames, i => i.count),
    yearlyShortSessions: getYearlyBests('stats', null, 'count', metrics.yearlyShortSessionCounts),

    topSeriesByYearCount: getTopList(processPresence(metrics.seriesYearlyPresence), i => i.count, (a,b) => b.lastSeen - a.lastSeen),
    topSeriesByMonthCount: getTopList(processPresence(metrics.seriesMonthlyPresence), i => i.count, (a,b) => b.lastSeen - a.lastSeen),
    
    topGenreByYearCount: getTopList(processPresence(metrics.genreYearlyPresence), i => i.count, (a,b) => b.lastSeen - a.lastSeen),
    topGenreByMonthCount: getTopList(processPresence(metrics.genreMonthlyPresence), i => i.count, (a,b) => b.lastSeen - a.lastSeen),
    
    topDeveloperByYearCount: getTopList(processPresence(metrics.developerYearlyPresence), i => i.count, (a,b) => b.lastSeen - a.lastSeen),
    topDeveloperByMonthCount: getTopList(processPresence(metrics.developerMonthlyPresence), i => i.count, (a,b) => b.lastSeen - a.lastSeen),
    
    topPublisherByYearCount: getTopList(processPresence(metrics.publisherYearlyPresence), i => i.count, (a,b) => b.lastSeen - a.lastSeen),
    topPublisherByMonthCount: getTopList(processPresence(metrics.publisherMonthlyPresence), i => i.count, (a,b) => b.lastSeen - a.lastSeen),

    topBusiestMultiplayerMonths: getTopList(processedBusiestMultiplayerMonths, i => i.totalSeconds),
    yearlyBusiestMultiplayerMonths: getYearlyBests('event', processedBusiestMultiplayerMonths, 'totalSeconds', 'maxDate'),

    topCompletionDays: getTopList(Object.values(metrics.completionsByDay), i => i.count),
    yearlyCompletionDays: metrics.yearlyCompletionDayData, 

    topCompletionMonths: getTopList(Object.values(metrics.completionsByMonth), i => i.count),
    yearlyCompletionMonths: getYearlyBests('event', Object.values(metrics.completionsByMonth), 'count', 'maxDate'),

    topCompletionWeeks: getTopList(metrics.topCompletionWeeks, i => i.count),
    yearlyCompletionWeeks: getYearlyBests('event', metrics.topCompletionWeeks, 'count', 'endDate'),

    topMonthlyGameVariety: getTopList(Object.values(metrics.monthlyGameVariety), i => i.games.size),
    yearlyMonthlyGameVariety: getYearlyBests('event', Object.values(metrics.monthlyGameVariety), 'games.size', 'maxDate'),

    topWeeklyGameVariety: getTopList(metrics.topWeeklyGameVariety, i => i.count),
    yearlyWeeklyGameVariety: getYearlyBests('event', metrics.topWeeklyGameVariety, 'count', 'endDate'),

    topBusiestMultiplayerDays: getTopList(processedBusiestMultiplayerDays, i => i.totalSeconds),
    yearlyBusiestMultiplayerDays: getYearlyBests('event', processedBusiestMultiplayerDays, 'totalSeconds', 'date'),

    topBusiestMultiplayerWeeks: getTopList(findTopNonOverlappingWeeks(metrics.allMultiplayerEntries), i => i.totalSeconds),
    yearlyBusiestMultiplayerWeeks: getYearlyBests('event', findTopNonOverlappingWeeks(metrics.allMultiplayerEntries), 'totalSeconds', 'endDate'),

    metaGameCountData,
    bestMonthsByName: metrics.bestMonthsByName,
    topGamesByGenreData: metrics.topGamesByGenreData
  };

  cleanSheet(sheet, 1);
  formatMetricsStreaksAndRecords(sheet, allStreaksData, currentYear, metrics.allTimeGameStats);
  cleanSheet(sheet, sheet.getLastRow());
}

/**
 * Formats the highly specific 11-column grid layout for the Top 25 tab.
 */
function formatMetricsStreaksAndRecords(sheet, allStreaksData, currentYear, allTimeGameStats) {
  const {
    topGamingStreaks, yearlyGamingStreaks, systemStreaks, yearlySystemStreaks,
    oneSittingCompletions, yearlyOneSittingCompletions, topBreakStreaks, yearlyBreakStreaks,
    topSameGameStreaks, yearlySameGameStreaks, topGamesByYearCount, yearlyMostPlayedGame, yearlyRunningYearsPlayed,
    topGamesByMonthCount, yearlyGamesByMonthCount, yearlySeriesByMonthCount, yearlyGenreByMonthCount,
    yearlyDeveloperByMonthCount, yearlyPublisherByMonthCount, topGameOverlaps, yearlyGameOverlaps,
    topSeries, yearlySeries, topMultiplayerGames, yearlyMultiplayerGames,
    topMonthlyBinges, yearlyMonthlyBinges, topWeeklyBinges, yearlyWeeklyBinges,
    topBusiestMonths, yearlyBusiestMonths, topBusiestWeeks, yearlyBusiestWeeks,
    topGameHiatuses, yearlyGameHiatuses, topDiverseDays, yearlyDiverseDays,
    sortedLongestCompletionsByTime, yearlyCompletionsByTime, sortedLongestCompletionsByDays, yearlyCompletionsByDays,
    fastestCompletionsByTime, topAbandoned, yearlyAbandoned, topCompletionStreaks, yearlyCompletionStreaks,
    topMarathons, yearlyMarathons,  topShortSessions, yearlyShortSessions,
    topSeriesByYearCount, topSeriesByMonthCount, topGenreByYearCount, topGenreByMonthCount,
    topDeveloperByYearCount, topDeveloperByMonthCount, topPublisherByYearCount, topPublisherByMonthCount,
    topDevelopers, yearlyDevelopers, topPublishers, yearlyPublishers,
    topReleaseYears, yearlyReleaseYears, topSeriesByDays, yearlySeriesByDays,
    topGenreByDays, yearlyGenreByDays, topDeveloperByDays, yearlyDeveloperByDays,
    topPublisherByDays, yearlyPublisherByDays, topReleaseYearByDays, yearlyReleaseYearByDays,
    topGenres, yearlyGenres, topCompletedGames, yearlyCompletedGames,
    topBusiestMultiplayerMonths, yearlyBusiestMultiplayerMonths, topCompletionDays, yearlyCompletionDays,
    topCompletionMonths, yearlyCompletionMonths, topCompletionWeeks, yearlyCompletionWeeks,
    topMonthlyGameVariety, yearlyMonthlyGameVariety, topWeeklyGameVariety, yearlyWeeklyGameVariety,
    topMonthlyConcentration, yearlyMonthlyConcentration, topYearlyConcentration, yearlyYearlyConcentration,
    topBusiestMultiplayerDays, yearlyBusiestMultiplayerDays, topBusiestMultiplayerWeeks, yearlyBusiestMultiplayerWeeks,
    topMetaHiatuses, yearlyMetaHiatuses, metaGameCountData, bestMonthsByName, topGamesByGenreData
  } = allStreaksData;

  // --- 1. Initialization ---
  const outputValues = [];
  const outputBackgrounds = [];
  const outputFontWeights = [];
  const outputFontColors = [];
  const outputFontSizes = [];
  const outputAlignments = [];
  const outputNumberFormats = []; 
  const mergeRangesA1 = [];
  
  const NUM_COLS = 11;
  const DEFAULTS = { bg: null, weight: "normal", color: "black", size: STYLES.BOLD_FONT_SIZE, align: "center", format: "@" };

  // --- 2. Helpers ---
  const STANDARD_BG = Array(NUM_COLS).fill(DEFAULTS.bg);
  const STANDARD_WEIGHT = Array(NUM_COLS).fill(DEFAULTS.weight);
  const STANDARD_COLOR = Array(NUM_COLS).fill(DEFAULTS.color);
  const STANDARD_SIZE = Array(NUM_COLS).fill(DEFAULTS.size);
  const STANDARD_FORMAT = Array(NUM_COLS).fill(DEFAULTS.format);
  const STANDARD_ALIGN = Array(NUM_COLS).fill("center");
  STANDARD_ALIGN[4] = "left"; // Detail Column Left
  STANDARD_ALIGN[10] = "left"; // Detail Column Right

  const addRow = (rowArray) => {
    if (rowArray.length < NUM_COLS) {
      rowArray = rowArray.concat(Array(NUM_COLS - rowArray.length).fill(""));
    }
    outputValues.push(rowArray);
    outputBackgrounds.push(STANDARD_BG.slice());
    outputFontWeights.push(STANDARD_WEIGHT.slice());
    outputFontColors.push(STANDARD_COLOR.slice());
    outputFontSizes.push(STANDARD_SIZE.slice());
    outputNumberFormats.push(STANDARD_FORMAT.slice()); 
    outputAlignments.push(STANDARD_ALIGN.slice());
    return outputValues.length - 1; 
  };

const buildDualTable = (titleLeft, titleRight, leftData, rightData, headersLeft, formatFnLeft, formatFnRight, numberFormatColB, numberFormatColH, headersRightOverride = null) => {
    addRow(Array(NUM_COLS).fill("")); 
    const titleRowIdx = addRow([titleLeft, "", "", "", "", "", titleRight, "", "", "", ""]);
    
    outputBackgrounds[titleRowIdx].fill(STYLES.TITLE_BG);
    outputFontColors[titleRowIdx].fill(STYLES.TITLE_FONT_COLOR);
    outputFontWeights[titleRowIdx].fill("bold");
    outputFontSizes[titleRowIdx].fill(14);
    mergeRangesA1.push(`A${titleRowIdx + 1}:E${titleRowIdx + 1}`);
    mergeRangesA1.push(`G${titleRowIdx + 1}:K${titleRowIdx + 1}`);

    const headersRight = headersRightOverride ? headersRightOverride : [...headersLeft]; 
    if (!headersRightOverride) headersRight[0] = "Year"; 
    
    const headerRowIdx = addRow([...headersLeft, "", ...headersRight]);
    outputBackgrounds[headerRowIdx].fill(STYLES.HEADER_BG);
    outputFontWeights[headerRowIdx].fill("bold");

    const leftLen = leftData ? leftData.length : 0;
    const rightLen = rightData ? rightData.length : 0;
    const maxRows = Math.max(leftLen, rightLen);
    
    let prevValLeft = null;
    let prevValRight_Year = null;

    for (let i = 0; i < maxRows; i++) {
      const row = Array(NUM_COLS).fill("");
      let leftIsBold = false;
      let rightIsBold = false;

      // Left Table
      if (i < leftLen) {
        const item = leftData[i];
        const formatted = formatFnLeft(item, i, prevValLeft);
        prevValLeft = formatted.valForTie; // Update for next tie check
        row[0] = formatted.c1; row[1] = formatted.c2; row[2] = formatted.c3; row[3] = formatted.c4; row[4] = formatted.c5;
        if (formatted.isBold) leftIsBold = true; 
      }
      
      // Right Table
      if (i < rightLen) {
        const item = rightData[i]; 
        const formatted = formatFnRight ? formatFnRight(item) : formatFnLeft(item.data, -1, null); 
        row[6] = (item.year === prevValRight_Year) ? "" : item.year; 
        prevValRight_Year = item.year;
        row[7] = formatted.c2; row[8] = formatted.c3; row[9] = formatted.c4; row[10] = formatted.c5;
        if (formatted.isBold) rightIsBold = true;
      }
      
      const rIdx = addRow(row);
      
      // Apply the "bold" weight to the sheet's data array
      if (leftIsBold) {
        for (let col = 0; col < 5; col++) outputFontWeights[rIdx][col] = "bold";
      }
      if (rightIsBold) {
        for (let col = 6; col < 11; col++) outputFontWeights[rIdx][col] = "bold";
      }
      
      // Keep your number formats
      if (numberFormatColB) outputNumberFormats[rIdx][1] = numberFormatColB; 
      if (numberFormatColH) outputNumberFormats[rIdx][7] = numberFormatColH; 
    }
};

  // --- 4. Formatters ---
  const clipDateToYear = (date, year, isStartDate) => {
    if (!(date instanceof Date) || isNaN(date)) return date;
    const dateYear = date.getUTCFullYear();
    if (dateYear === year) return date;
    if (isStartDate && dateYear < year) return new Date(Date.UTC(year, 0, 1, 12, 0, 0));
    if (!isStartDate && dateYear > year) return new Date(Date.UTC(year, 11, 31, 12, 0, 0));
    return date; 
  };

  const fmt_Streak = (item, i, prev) => {
    const val = item.length;
    const rank = (val === prev) ? "" : `'${i + 1}`;
    const detail = item.detailsString || (item.game ? `${item.game} (${Array.from(item.systems || []).join(', ')})` : "");
    return { c1: rank, c2: val, c3: formatDate(item.start, true), c4: formatDate(item.end, true), c5: detail, valForTie: val, isBold: (item.end instanceof Date && item.end.getFullYear() === currentYear) };
  };
  const fmt_Streak_Yearly = (wrapper) => {
    const item = wrapper.data; if (!item) return { c2: "", c3: "", c4: "", c5: "" };
    const detail = item.detailsString || (item.game ? `${item.game} (${Array.from(item.systems || []).join(', ')})` : "");
    return { c2: item.clippedLength, c3: formatDate(item.clippedStart, true), c4: formatDate(item.clippedEnd, true), c5: detail, valForTie: item.clippedLength };
  };
  const fmt_Event = (metricKey, dateKey1, dateKey2, detailFn) => (item, i, prev) => {
    const val = item[metricKey];
    const rank = (val === prev) ? "" : `'${i + 1}`;
    const detail = detailFn ? detailFn(item) : (item.game || item.gameName);
    const d1 = item[dateKey1];
    const d2 = item[dateKey2] || item[dateKey1];
    const isCurrent = (d2 instanceof Date) ? d2.getFullYear() === currentYear : false;
    let valDisp = val;
    if (metricKey === 'totalSeconds' || metricKey === 'finalPtLifetime'  || metricKey === 'seconds') valDisp = secondsToTimeString(val);
    return { c1: rank, c2: valDisp, c3: formatDate(d1, true), c4: formatDate(d2, true), c5: detail, valForTie: val, isBold: isCurrent };
  };
  const fmt_Event_Yearly = (metricKey, dateKey1, dateKey2, detailFn) => (wrapper) => {
    const item = wrapper.data; const year = wrapper.year;
    const val = item[metricKey]; const detail = detailFn ? detailFn(item) : (item.game || item.gameName);
    const d1 = clipDateToYear(item[dateKey1], year, true);
    const d2 = clipDateToYear(item[dateKey2] || item[dateKey1], year, false);
    let valDisp = val;
    if (metricKey === 'totalSeconds' || metricKey === 'finalPtLifetime' || metricKey === 'seconds') valDisp = secondsToTimeString(val);
    return { c2: valDisp, c3: formatDate(d1, true), c4: formatDate(d2, true), c5: detail, valForTie: val };
  };
  const fmt_Event_Yearly_NoClipStart = (metricKey, dateKey1, dateKey2, detailFn) => (wrapper) => {
    const item = wrapper.data; const year = wrapper.year;
    const val = item[metricKey]; const detail = detailFn ? detailFn(item) : (item.game || item.gameName);
    const d1 = item[dateKey1]; // NO CLIP
    const d2 = clipDateToYear(item[dateKey2] || item[dateKey1], year, false);
    let valDisp = val;
    if (metricKey === 'totalSeconds' || metricKey === 'finalPtLifetime' || metricKey === 'seconds') valDisp = secondsToTimeString(val);
    return { c2: valDisp, c3: formatDate(d1, true), c4: formatDate(d2, true), c5: detail, valForTie: val };
  };
  const fmt_Stats = (item, i, prev) => {
    const isArray = Array.isArray(item); const stats = isArray ? item[1] : item; const name = isArray ? item[0] : item.name;
    if (!stats) return { c1: "", c2: "", c3: "", c4: "", c5: "Error", valForTie: 0 };
    const val = stats.totalSeconds || stats.value; const rank = (val === prev) ? "" : `'${i + 1}`;
    const d1 = stats.minDate || stats.firstPlayed; const d2 = stats.maxDate || stats.lastPlayed; 
    let detail = name; if (stats.games) { const count = stats.games.size || 0; detail = `${name} (${count} Games)`; }
    const isCurrent = (d2 instanceof Date) ? d2.getFullYear() === currentYear : false;
    return { c1: rank, c2: secondsToTimeString(val), c3: formatDate(d1, true), c4: formatDate(d2, true), c5: detail, valForTie: val, isBold: isCurrent };
  };
  const fmt_SameGameStreak = (item, i, prev) => {
    const val = item.length; const rank = (val === prev) ? "" : `'${i+1}`;
    const detail = `${item.game} (${Array.from(item.systems).join(', ')}) [${secondsToTimeString(item.totalSeconds)}]`;
    return { c1: rank, c2: val, c3: formatDate(item.start, true), c4: formatDate(item.end, true), c5: detail, valForTie: val, isBold: item.end instanceof Date && item.end.getFullYear() === currentYear };
  };
  const fmt_SameGameStreak_Yearly = (wrapper) => {
    const item = wrapper.data; if (!item) return { c2: "", c3: "", c4: "", c5: "" };
    const detail = `${item.game} (${Array.from(item.systems).join(', ')}) [${secondsToTimeString(item.totalSeconds)}]`;
    return { c2: item.clippedLength, c3: formatDate(item.clippedStart, true), c4: formatDate(item.clippedEnd, true), c5: detail, valForTie: item.clippedLength };
  };
  const fmt_Stats_Right = (wrapper) => {
    const item = wrapper.data; const val = item.value;
    const d1 = item.minDate ? formatDate(item.minDate, true) : "-"; const d2 = item.maxDate ? formatDate(item.maxDate, true) : "-";
    let detail = item.name; if (item.systems && item.systems.size > 0) { detail = `${item.name} (${Array.from(item.systems).join(', ')})`; } else if (item.games) { const gameCount = item.games ? (item.games.size || item.games.length || 0) : 0; detail = `${item.name} (${gameCount} Games)`; }
    return { c1: wrapper.year, c2: secondsToTimeString(val), c3: d1, c4: d2, c5: detail, valForTie: val };
  };
  const fmt_Stats_Count_Right = (wrapper) => {
      const item = wrapper.data; if (!item) return { c2: "", c3: "", c4: "", c5: "" };
      const val = item.value; const d1 = item.minDate ? formatDate(item.minDate, true) : "-"; const d2 = item.maxDate ? formatDate(item.maxDate, true) : "-";
      let detail = item.name;
      if (detail && detail.includes(' / ')) {
          const [game1Name, game2Name] = detail.split(' / '); const game1Stats = allTimeGameStats[game1Name]; const game2Stats = allTimeGameStats[game2Name];
          const game1Systems = game1Stats ? `(${Array.from(game1Stats.systems).join(', ')})` : ''; const game2Systems = game2Stats ? `(${Array.from(game2Stats.systems).join(', ')})` : '';
          detail = `${game1Name} ${game1Systems} / ${game2Name} ${game2Systems}`;
      } else if (item.systems && item.systems.size > 0) { detail = `${item.name} (${Array.from(item.systems).join(', ')})`; } 
      else if (item.games) { const gameCount = item.games ? (item.games.size || item.games.length || 0) : 0; if (gameCount > 0) { detail = `${item.name} (${gameCount} Games)`; } }
      return { c1: wrapper.year, c2: val, c3: d1, c4: d2, c5: detail, valForTie: val };
  };
  const fmt_CompletionDay_Yearly = (wrapper) => {
    if (wrapper.maxCount === 1 || !wrapper.data) { return { c2: 1, c3: "-", c4: "-", c5: "(Many Games)" }; }
    const item = wrapper.data; const year = wrapper.year;
    const val = item.count; const detail = item.games.map(g => `${g.name} (${g.system})`).join(', ');
    const d1 = clipDateToYear(item.date, year, true); const d2 = clipDateToYear(item.date, year, false);
    return { c2: val, c3: formatDate(d1, true), c4: formatDate(d2, true), c5: detail, valForTie: val };
  };

  const fmt_MetaCount = (item, i, prev) => {
    const val = item.count; 
    const rank = (val === prev) ? "" : `'${i + 1}`;
    const label = `[${item.year}] ${item.name} [${secondsToTimeString(item.totalSeconds)}]`;
    const thisYear = new Date().getFullYear();
    return { c1: rank, c2: val, c3: formatDate(item.minDate, true), c4: formatDate(item.maxDate, true), c5: label, valForTie: val, isBold: item.year === thisYear };
  };
  const fmt_MetaCount_Yearly = (wrapper) => {
    const item = wrapper.data; if (!item) return { c2: "", c3: "", c4: "", c5: "" };
    const label = `[${item.year}] ${item.name} [${secondsToTimeString(item.totalSeconds)}]`;
    return { c2: item.count, c3: formatDate(item.minDate, true), c4: formatDate(item.maxDate, true), c5: label, valForTie: item.count };
  };

  // --- 6. Execute Build Calls ---
  buildDualTable("Top 25 Gaming Streaks", "Longest Gaming Streak by Year", topGamingStreaks, yearlyGamingStreaks, ["Rank", "Length (Days)", "Start Date", "End Date", "# Games / Top 3 Played"], fmt_Streak, fmt_Streak_Yearly, "0", "0");
  buildDualTable("Top 25 Non-Gaming Streaks", "Longest Break by Year", topBreakStreaks, yearlyBreakStreaks, ["Rank", "Length (Days)", "Start Date", "End Date", ""], fmt_Streak, fmt_Streak_Yearly, "0", "0");
  buildDualTable("Top 25 Same-Game Streaks", "Longest Same-Game Streak by Year", topSameGameStreaks, yearlySameGameStreaks, ["Rank", "Length (Days)", "Start Date", "End Date", "Videogame [Time Spent]"], fmt_SameGameStreak, fmt_SameGameStreak_Yearly, "0", "0");
  buildDualTable("Top 25 Consecutive Entries for One System", "Longest System Streak by Year", systemStreaks, yearlySystemStreaks, ["Rank", "Entries", "Start", "End", "System"], (item, i, prev) => { const val = item.length; const rank = (val === prev) ? "" : `'${i + 1}`; return { c1: rank, c2: val, c3: formatDate(item.start, true), c4: formatDate(item.end, true), c5: item.system, valForTie: val, isBold: (item.end instanceof Date && item.end.getFullYear() === currentYear) }; }, (w) => { const item = w.data; if (!item) return { c2: "", c3: "", c4: "", c5: "" }; return { c2: item.value, c3: formatDate(item.minDate, true), c4: formatDate(item.maxDate, true), c5: item.system, valForTie: item.value }; }, "0", "0");
  buildDualTable("Top 25 One-Sitting Completions", "Longest One-Sitting Clear by Year", oneSittingCompletions, yearlyOneSittingCompletions, ["Rank", "Time", "Date", "System", "Game [Note]"], (item, i, prev) => { const val = timeStringToSeconds(item.finalPtLifetime); const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.gameName} (${item.system}) [${item.finalNote}]`; return { c1: rank, c2: item.finalPtLifetime, c3: formatDate(item.lastDate, true), c4: item.system, c5: detail, valForTie: val, isBold: (item.lastDate instanceof Date && item.lastDate.getFullYear() === currentYear) }; }, (w) => { const d = w.data; if (!d) return { c2: "", c3: "", c4: "", c5: "" }; return { c2: d.finalPtLifetime, c3: formatDate(d.lastDate, true), c4: d.system, c5: `${d.gameName} (${d.system}) [${d.finalNote}]`, valForTie: timeStringToSeconds(d.finalPtLifetime) }; }, "[hh]:mm", "[hh]:mm" );
  const fmt_RunningYears_Yearly = (item) => {
      // Catch the 2015 tie state you requested, or any year with no repeat games
      if (item.maxCount <= 1 || (item.year === 2015 && item.maxCount === 1)) {
          return { c2: item.maxCount, c3: "-", c4: "-", c5: "(Many games tied at 1 year)", valForTie: item.maxCount };
      }
      let detail = "";
      if (item.leaders.length > 15) {
          detail = `(${item.leaders.length} Games Tied at ${item.maxCount} Years)`;
      } else {
          detail = item.leaders.map(l => `${l.game} (${Array.from(l.systems || []).join(', ')})`).join(' / ');
      }
      return { c2: item.maxCount, c3: "-", c4: "-", c5: detail, valForTie: item.maxCount };
  };

  buildDualTable(
      "Games Played Across Most Years", 
      "Active Leader (Most Years) by Year", 
      topGamesByYearCount, 
      yearlyRunningYearsPlayed, 
      ["Rank", "# Years", "Start", "Last", "Game [Years]"], 
      (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const systems = item.systems ? `(${Array.from(item.systems).join(', ')}) ` : ""; const detail = `${item.game} ${systems}[${compressYearRanges(item.years).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstPlayed, true), c4: formatDate(item.lastPlayed, true), c5: detail, valForTie: val, isBold: item.lastPlayed instanceof Date && item.lastPlayed.getFullYear()===currentYear }; }, 
      fmt_RunningYears_Yearly, 
      "0", 
      "0",
      ["Year", "# Years", "-", "-", "Active Leader(s)"]
  );
  buildDualTable("Games Played Across Most Months", "Game Played Across Most Months during Calendar Year", topGamesByMonthCount, yearlyGamesByMonthCount, ["Rank", "# Months", "First", "Last", "Game [Months]"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const systems = item.systems ? `(${Array.from(item.systems).join(', ')}) ` : ""; const detail = `${item.game} ${systems}[${item.months.join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstPlayed, true), c4: formatDate(item.lastPlayed, true), c5: detail, valForTie: val, isBold: item.lastPlayed instanceof Date && item.lastPlayed.getFullYear() === currentYear }; }, fmt_Stats_Count_Right, "0", "0");
  buildDualTable("Top 25 Most Played Series", "Most Played Series by Year (Min 2 Games)", topSeries, yearlySeries, ["Rank", "Total Time", "Start", "End", "Series"], (item, i, p) => fmt_Stats(item, i, p), fmt_Stats_Right, "[hh]:mm", "[hh]:mm");
  buildDualTable("Top 25 Multiplayer Games", "Top Multiplayer Game by Year", topMultiplayerGames, yearlyMultiplayerGames, ["Rank", "Total Time", "Start", "End", "Videogame"], (item, i, p) => { const name = item.name; const totalSeconds = item.totalSeconds; return { c1: (totalSeconds===p?"":`'${i+1}`), c2: secondsToTimeString(totalSeconds), c3: formatDate(item.minDate, true), c4: formatDate(item.maxDate, true), c5: `${name} (${Array.from(item.systems).join(', ')})`, valForTie: totalSeconds, isBold: item.maxDate instanceof Date && item.maxDate.getFullYear()===currentYear }; }, fmt_Stats_Right, "[hh]:mm", "[hh]:mm");
  const fmt_Binge = fmt_Event('totalSeconds', 'minDate', 'maxDate', (i)=>`${i.game} (${Array.from(i.systems).join(', ')})`);
  buildDualTable("Top 25 Monthly Binges", "Biggest Monthly Binge by Year", topMonthlyBinges, yearlyMonthlyBinges, ["Rank", "Time", "Start", "End", "Game [Month]"], (item,i,p) => { const res = fmt_Binge(item,i,p); res.c5 = `${item.game} (${Array.from(item.systems).join(', ')}) [${item.monthKey}]`; return res; }, (w) => { const d=w.data; return { c2:secondsToTimeString(d.totalSeconds), c3:formatDate(d.minDate,true), c4:formatDate(d.maxDate,true), c5: `${d.game} (${Array.from(d.systems).join(', ')}) [${d.monthKey}]` }; }, "[hh]:mm", "[hh]:mm");
  buildDualTable("Top 25 Weekly Binges", "Biggest Weekly Binge by Year", topWeeklyBinges, yearlyWeeklyBinges, ["Rank", "Time", "Start", "End", "Game"], fmt_Event('totalSeconds', 'startDate', 'endDate', (i)=>`${i.game} (${Array.from(i.systems).join(', ')})`), fmt_Event_Yearly('totalSeconds', 'startDate', 'endDate', (i)=>`${i.game} (${Array.from(i.systems).join(', ')})`), "[hh]:mm", "[hh]:mm");
  buildDualTable("Top 25 Busiest Months", "Busiest Month by Year", topBusiestMonths, yearlyBusiestMonths, ["Rank", "Total Time", "Start", "End", "Month / Top 3"], (item, i, p) => { const val = item.totalSeconds; const rank = val===p?"":`'${i+1}`; const top3 = item.top3Games ? ` [${item.top3Games.map(g=>g.name).join(', ')}]` : ""; return { c1: rank, c2: secondsToTimeString(val), c3: formatDate(item.minDate,true), c4: formatDate(item.maxDate,true), c5: `${item.monthKey}${top3}`, valForTie: val, isBold: item.maxDate instanceof Date && item.maxDate.getFullYear()===currentYear }; }, (w) => { const d=w.data; const top3 = d.top3Games && d.top3Games.length > 0 ? ` [${d.top3Games.map(g=>g.name).join(', ')}]` : ""; return { c2:secondsToTimeString(d.totalSeconds), c3:formatDate(d.minDate,true), c4:formatDate(d.maxDate,true), c5: `${d.monthKey}${top3}` }; }, "[hh]:mm", "[hh]:mm");

  const fmt_Percent = (item, i, prev) => {
    const val = item.percent; const rank = (val === prev) ? "" : `'${i + 1}`;
    const getSysStr = (sysSet) => { if (!sysSet || sysSet.size === 0) return ""; return ` (${Array.from(sysSet).join(', ')})`; };
    let d1 = "-", d2 = "-", label = "";
    if (item.timeframe) { d1 = item.timeframe; label = `${item.game}${getSysStr(item.systems)} [${secondsToTimeString(item.gameSeconds)}/${secondsToTimeString(item.totalSeconds)}]`; } 
    else if (item.startDate) { d1 = formatDate(item.startDate, true); d2 = formatDate(item.endDate, true); label = `${item.game}${getSysStr(item.systems)}`; } 
    else if (item.year) { d1 = item.year; label = `${item.game}${getSysStr(item.systems)} [${secondsToTimeString(item.gameSeconds)}]`; }
    let isBold = false; if (item.year === currentYear) isBold = true; if (item.minDate && item.minDate.getFullYear() === currentYear) isBold = true; if (item.endDate && item.endDate.getFullYear() === currentYear) isBold = true;
    return { c1: rank, c2: val, c3: d1, c4: d2, c5: label, valForTie: val, isBold: isBold };
  };
  
  const fmt_Percent_Yearly = (wrapper) => {
      const item = wrapper.data; if(!item) return {c2:"",c3:"",c4:"",c5:""};
      const getSysStr = (sysSet) => { if (!sysSet || sysSet.size === 0) return ""; return ` (${Array.from(sysSet).join(', ')})`; };
      let d1 = "-", d2 = "-", label = "";
      if (item.timeframe) { d1 = item.timeframe; label = `${item.game}${getSysStr(item.systems)}`; } 
      else if (item.startDate) { d1 = formatDate(item.startDate, true); d2 = formatDate(item.endDate, true); label = `${item.game}${getSysStr(item.systems)}`; } 
      else if (item.year) { d1 = item.year; label = `${item.game}${getSysStr(item.systems)}`; }
      return { c2: item.percent, c3: d1, c4: d2, c5: label, valForTie: item.percent };
  };

  buildDualTable("Highest % of Year Spent on One Game", "Most Dominant Game by Year", topYearlyConcentration, yearlyYearlyConcentration, ["Rank", "% Share", "Year", "", "Game [Time Spent]"], fmt_Percent, fmt_Percent_Yearly, "0.0%", "0.0%");
  buildDualTable("Highest % of Month Spent on One Game", "Most Dominant Month by Year", topMonthlyConcentration, yearlyMonthlyConcentration, ["Rank", "% Share", "Month", "", "Game [Time / Total]"], fmt_Percent, fmt_Percent_Yearly, "0.0%", "0.0%");
  buildDualTable("Top 25 Busiest Weeks", "Busiest Week by Year", topBusiestWeeks, yearlyBusiestWeeks, ["Rank", "Total Time", "Start", "End", "Top 3 Games"], fmt_Event('totalSeconds', 'startDate', 'endDate', (i)=>i.gamesPlayed), fmt_Event_Yearly('totalSeconds', 'startDate', 'endDate', (i)=>i.gamesPlayed), "[hh]:mm", "[hh]:mm");
  buildDualTable("Top 25 Busiest Multiplayer Days", "Busiest Multiplayer Day by Year", topBusiestMultiplayerDays, yearlyBusiestMultiplayerDays, ["Rank", "Total Time", "Date", "", "Top 3 Games"], fmt_Event('totalSeconds', 'date', null, (i) => i.top3Games.map(g => `${g.name} [${secondsToTimeString(g.time)}]`).join(', ')), fmt_Event_Yearly('totalSeconds', 'date', null, (i) => i.top3Games.map(g => `${g.name} [${secondsToTimeString(g.time)}]`).join(', ')), "[hh]:mm", "[hh]:mm");
  buildDualTable("Top 25 Busiest Multiplayer Weeks", "Busiest Multiplayer Week by Year", topBusiestMultiplayerWeeks, yearlyBusiestMultiplayerWeeks, ["Rank", "Total Time", "Start", "End", "Top Games"], fmt_Event('totalSeconds', 'startDate', 'endDate', (i) => i.gamesPlayed), fmt_Event_Yearly('totalSeconds', 'startDate', 'endDate', (i) => i.gamesPlayed), "[hh]:mm", "[hh]:mm");
  buildDualTable("Top 25 Busiest Multiplayer Months", "Busiest Multiplayer Month by Year", topBusiestMultiplayerMonths, yearlyBusiestMultiplayerMonths, ["Rank", "Total Time", "Start", "End", "Month / Top 3"], (item, i, p) => { const val = item.totalSeconds; const rank = val === p ? "" : `'${i + 1}`; const top3 = item.top3Games && item.top3Games.length > 0 ? ` [${item.top3Games.map(g => `${g.name} [${secondsToTimeString(g.time)}]`).join(', ')}]` : ""; return { c1: rank, c2: secondsToTimeString(val), c3: formatDate(item.minDate, true), c4: formatDate(item.maxDate, true), c5: `${item.monthKey}${top3}`, valForTie: val, isBold: item.maxDate instanceof Date && item.maxDate.getFullYear() === currentYear }; }, (w) => { const d = w.data; const top3 = d.top3Games && d.top3Games.length > 0 ? ` [${d.top3Games.map(g => `${g.name} [${secondsToTimeString(g.time)}]`).join(', ')}]` : ""; return { c2: secondsToTimeString(d.totalSeconds), c3: formatDate(d.minDate, true), c4: formatDate(d.maxDate, true), c5: `${d.monthKey}${top3}` }; }, "[hh]:mm", "[hh]:mm");
  buildDualTable("Top 25 Hiatuses", "Longest Hiatus Ending by Year", topGameHiatuses, yearlyGameHiatuses, ["Rank", "Gap Days", "Start", "End", "Game"], fmt_Event('gapDays', 'startDate', 'endDate', (i)=>`${i.game} (${i.prevSystem}->${i.currentSystem})`), fmt_Event_Yearly_NoClipStart('gapDays', 'startDate', 'endDate', (i)=>`${i.game} (${i.prevSystem}->${i.currentSystem})`), "0", "0");
  buildDualTable("Top 25 Diverse Days", "Most Diverse Day by Year", topDiverseDays, yearlyDiverseDays, ["Rank", "# Games", "Time", "Date", "Games"], (item, i, p) => ({ c1: (item.numGames===p?"":`'${i+1}`), c2: item.numGames, c3: secondsToTimeString(item.totalTime), c4: formatDate(item.date, true), c5: item.games, valForTie: item.numGames, isBold: item.date instanceof Date && item.date.getFullYear()===currentYear }), (w) => { const d=w.data; return { c2:d.numGames, c3:secondsToTimeString(d.totalTime), c4:formatDate(d.date,true), c5:d.games }; }, "0", "0");
  buildDualTable("Longest Completions (Time)", "Longest Completion (Time) by Year", sortedLongestCompletionsByTime, yearlyCompletionsByTime, ["Rank", "Time", "Start", "End", "Game [Note]"], fmt_Event('finalPtLifetime', 'startDate', 'lastDate', (i)=>`${i.gameName} (${i.system}) [${i.finalNote}]`), fmt_Event_Yearly_NoClipStart('seconds', 'startDate', 'lastDate', (i)=>`${i.gameName} (${i.system}) [${i.finalNote}]`), "[hh]:mm", "[hh]:mm");
  buildDualTable("Longest Completions (Days)", "Longest Completion (Days) by Year", sortedLongestCompletionsByDays, yearlyCompletionsByDays, ["Rank", "Days", "Start", "End", "Game [Note]"], fmt_Event('durationDays', 'startDate', 'lastDate', (i)=>`${i.gameName} (${i.system}) [${i.finalNote}]`), fmt_Event_Yearly_NoClipStart('durationDays', 'startDate', 'lastDate', (i)=>`${i.gameName} (${i.system}) [${i.finalNote}]`), "0", "0");
  buildDualTable("Fastest Completions (Time)", "Fastest Completion by Year", fastestCompletionsByTime, [], ["Rank", "Time", "Start", "End", "Game [Note]"], (item, i, prev) => { const sec = timeStringToSeconds(item.finalPtLifetime); const rank = (sec === prev) ? "" : `'${i + 1}`; const detail = `${item.gameName} (${item.system}) [${item.finalNote}]`; return { c1: rank, c2: item.finalPtLifetime, c3: formatDate(item.startDate, true), c4: formatDate(item.lastDate, true), c5: detail, valForTie: sec, isBold: item.lastDate instanceof Date && item.lastDate.getFullYear() === currentYear }; }, null, "[hh]:mm", "[hh]:mm" );
  buildDualTable("Top 25 Longest to Abandon", "Longest Abandon by Year", topAbandoned, yearlyAbandoned, ["Rank", "Time Invested", "Start", "End", "Game"], fmt_Event('totalSeconds', 'startDate', 'lastDate', (i)=>`${i.gameName} (${i.system})`), fmt_Event_Yearly_NoClipStart('totalSeconds', 'startDate', 'lastDate', (i)=>`${i.gameName} (${i.system})`), "[hh]:mm", "[hh]:mm");
  buildDualTable("Completion Streaks", "Longest Completion Streak by Year", topCompletionStreaks, yearlyCompletionStreaks, ["Rank", "Count", "Start", "End", "Start / End / Broken By"], 
    fmt_Event('length', 'startDate', 'endDate', (i)=>`${i.games[0]} / ${i.games[i.games.length-1]} / ${i.brokenBy||''}`), 
    (w) => {
      const item = w.data;
      if (!item) return { c2: "", c3: "", c4: "", c5: "" };
      const detail = `${item.clippedGames[0]} / ${item.clippedGames[item.clippedGames.length-1]} / ${item.brokenBy||''}`;
      return { c2: item.clippedLength, c3: formatDate(item.clippedStart, true), c4: formatDate(item.clippedEnd, true), c5: detail, valForTie: item.clippedLength };
    }, "0", "0");
  buildDualTable("Top 25 Busiest Completion Days", "Busiest Completion Day by Year", topCompletionDays, yearlyCompletionDays, ["Rank", "# Completions", "Date", "", "Games"], fmt_Event('count', 'date', null, (i) => i.games.map(g => `${g.name} (${g.system})`).join(', ')), fmt_CompletionDay_Yearly, "0", "0");
  buildDualTable("Top 25 Busiest Completion Months", "Busiest Completion Month by Year", topCompletionMonths, yearlyCompletionMonths, ["Rank", "# Completions", "Start", "End", "Month [Games]"], fmt_Event('count', 'minDate', 'maxDate', (i) => `${i.monthKey} [${i.games.map(g => g.name).join(', ')}]`), fmt_Event_Yearly('count', 'minDate', 'maxDate', (i) => `${i.monthKey} [${i.games.map(g => g.name).join(', ')}]`), "0", "0");
  buildDualTable("Top 25 Busiest Completion Weeks", "Busiest Completion Week by Year", topCompletionWeeks, yearlyCompletionWeeks, ["Rank", "# Completions", "Start", "End", "Games Completed"], fmt_Event('count', 'startDate', 'endDate', (i) => i.gamesPlayed), fmt_Event_Yearly('count', 'startDate', 'endDate', (i) => i.gamesPlayed), "0", "0");
  buildDualTable("Top 25 Busiest Game Variety (Weekly)", "Busiest Game Variety (Week) by Year", topWeeklyGameVariety, yearlyWeeklyGameVariety, ["Rank", "# Games", "Start", "End", "Top 3 Games"], fmt_Event('count', 'startDate', 'endDate', (i) => i.gamesPlayed), fmt_Event_Yearly('count', 'startDate', 'endDate', (i) => i.gamesPlayed), "0", "0");
  buildDualTable("Top 25 Busiest Game Variety (Monthly)", "Busiest Game Variety (Month) by Year", topMonthlyGameVariety, yearlyMonthlyGameVariety, ["Rank", "# Games", "Start", "End", "Month [Top 3 Games]"], (item, i, p) => { const val = item.games.size; const rank = val === p ? "" : `'${i + 1}`; const sortedGames = Object.entries(item.gameTimes).sort((a, b) => b[1] - a[1]).slice(0, 3); const top3 = `[${sortedGames.map(g => `${g[0]} [${secondsToTimeString(g[1])}]`).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.minDate, true), c4: formatDate(item.maxDate, true), c5: `${item.monthKey} ${top3}`, valForTie: val, isBold: item.maxDate instanceof Date && item.maxDate.getFullYear() === currentYear }; }, (w) => { const d = w.data; if (!d || !d.games) return { c2: "", c3: "", c4: "", c5: "" }; const val = d.games.size; const sortedGames = Object.entries(d.gameTimes).sort((a, b) => b[1] - a[1]).slice(0, 3); const top3 = `[${sortedGames.map(g => `${g[0]} [${secondsToTimeString(g[1])}]`).join(', ')}]`; return { c2: val, c3: formatDate(d.minDate, true), c4: formatDate(d.maxDate, true), c5: `${d.monthKey} ${top3}` }; }, "0", "0");
  buildDualTable("Top 25 Marathons (>4h)", "Top Marathon Game by Year", topMarathons, yearlyMarathons, ["Rank", "Count", "First", "Last", "Game"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.gameName} (${Array.from(item.systems).join(', ')})`; return { c1: rank, c2: val, c3: formatDate(item.firstPlayed, true), c4: formatDate(item.lastPlayed, true), c5: detail, valForTie: val, isBold: item.lastPlayed instanceof Date && item.lastPlayed.getFullYear() === currentYear }; }, (w) => { const d = w.data; if (!d) return { c2: "", c3: "", c4: "", c5: "" }; const detail = `${d.name} (${Array.from(d.systems).join(', ')})`; return { c2: d.value, c3: formatDate(d.minDate, true), c4: formatDate(d.maxDate, true), c5: detail }; }, "0", "0");
  buildDualTable("Top 25 Short Sessions (<30m)", "Top Short Session Game by Year", topShortSessions, yearlyShortSessions, ["Rank", "Count", "First", "Last", "Game"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.gameName} (${Array.from(item.systems).join(', ')})`; return { c1: rank, c2: val, c3: formatDate(item.firstPlayed, true), c4: formatDate(item.lastPlayed, true), c5: detail, valForTie: val, isBold: item.lastPlayed instanceof Date && item.lastPlayed.getFullYear() === currentYear }; }, (w) => { const d = w.data; if (!d) return { c2: "", c3: "", c4: "", c5: "" }; const detail = `${d.name} (${Array.from(d.systems).join(', ')})`; return { c2: d.value, c3: formatDate(d.minDate, true), c4: formatDate(d.maxDate, true), c5: detail }; }, "0", "0");
  buildDualTable("Most Completed Games", "Most Completed Game by Year", topCompletedGames, yearlyCompletedGames, ["Rank", "Count", "First", "Last", "Game [Dates]"], (item, i, p) => ({ c1: (item.completions===p?"":`'${i+1}`), c2: item.completions, c3: formatDate(item.firstStartDate,true), c4: formatDate(item.lastUpdateDate,true), c5: `${item.gameName} [${item.completionDates.map(d=>formatDate(d,true)).join(', ')}]`, valForTie: item.completions, isBold: item.lastUpdateDate instanceof Date && item.lastUpdateDate.getFullYear()===currentYear }), (w) => { if (!w.data) return { c2: 0, c3: "-", c4: "-", c5: "(N/A)"}; const d = w.data; if (w.maxCompletions === 1) { return { c2: 1, c3: "-", c4: "-", c5: "(Many Games)" }; } return { c2: d.completions, c3: formatDate(d.firstStartDate, true), c4: formatDate(d.lastUpdateDate, true), c5: `${d.gameName} [${d.completionDates.map(date=>formatDate(date,true)).join(', ')}]`}; }, "0", "0");
  buildDualTable("Top 25 Developers", "Top Developer by Year", topDevelopers, yearlyDevelopers, ["Rank", "Total Time", "Start", "Last", "Developer"], (item, i, p) => fmt_Stats(item, i, p), fmt_Stats_Right, "[hh]:mm", "[hh]:mm");
  buildDualTable("Top 25 Publishers", "Top Publisher by Year", topPublishers, yearlyPublishers, ["Rank", "Total Time", "Start", "Last", "Publisher"], (item, i, p) => fmt_Stats(item, i, p), fmt_Stats_Right, "[hh]:mm", "[hh]:mm");
  buildDualTable("Top 25 Release Years", "Top Release Year by Year", topReleaseYears, yearlyReleaseYears, ["Rank", "Total Time", "Start", "Last", "Release Year"], (item, i, p) => fmt_Stats(item, i, p), fmt_Stats_Right, "[hh]:mm", "[hh]:mm");
  buildDualTable("Series Presence (Most Years)", "Top Series by Year (by Time)", topSeriesByYearCount, yearlySeries, ["Rank", "# Years", "First", "Last", "Series [Years]"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.name} [${compressYearRanges(item.values).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstSeen, true), c4: formatDate(item.lastSeen, true), c5: detail, valForTie: val, isBold: item.lastSeen instanceof Date && item.lastSeen.getFullYear() === currentYear }; }, fmt_Stats_Right, "0", "[hh]:mm");
  buildDualTable("Series Presence (Most Months)", "Top Series by Year (by Months)", topSeriesByMonthCount, yearlySeriesByMonthCount, ["Rank", "# Months", "First", "Last", "Series [Months]"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.name} [${compressMonthRanges(item.values).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstSeen, true), c4: formatDate(item.lastSeen, true), c5: detail, valForTie: val, isBold: item.lastSeen instanceof Date && item.lastSeen.getFullYear() === currentYear }; }, fmt_Stats_Count_Right, "0", "0");
  buildDualTable("Genre Presence (Most Years)", "Top Genre by Year (by Time)", topGenreByYearCount, yearlyGenres, ["Rank", "# Years", "First", "Last", "Genre [Years]"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.name} [${compressYearRanges(item.values).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstSeen, true), c4: formatDate(item.lastSeen, true), c5: detail, valForTie: val, isBold: item.lastSeen instanceof Date && item.lastSeen.getFullYear() === currentYear }; }, fmt_Stats_Right, "0", "[hh]:mm");
  buildDualTable("Genre Presence (Most Months)", "Top Genre by Year (by Months)", topGenreByMonthCount, yearlyGenreByMonthCount, ["Rank", "# Months", "First", "Last", "Genre [Months]"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.name} [${compressMonthRanges(item.values).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstSeen, true), c4: formatDate(item.lastSeen, true), c5: detail, valForTie: val, isBold: item.lastSeen instanceof Date && item.lastSeen.getFullYear() === currentYear }; }, fmt_Stats_Count_Right, "0", "0");
  buildDualTable("Developer Presence (Most Years)", "Top Developer by Year (by Time)", topDeveloperByYearCount, yearlyDevelopers, ["Rank", "# Years", "First", "Last", "Developer [Years]"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.name} [${compressYearRanges(item.values).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstSeen, true), c4: formatDate(item.lastSeen, true), c5: detail, valForTie: val, isBold: item.lastSeen instanceof Date && item.lastSeen.getFullYear() === currentYear }; }, fmt_Stats_Right, "0", "[hh]:mm");
  buildDualTable("Developer Presence (Most Months)", "Top Developer by Year (by Months)", topDeveloperByMonthCount, yearlyDeveloperByMonthCount, ["Rank", "# Months", "First", "Last", "Developer [Months]"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.name} [${compressMonthRanges(item.values).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstSeen, true), c4: formatDate(item.lastSeen, true), c5: detail, valForTie: val, isBold: item.lastSeen instanceof Date && item.lastSeen.getFullYear() === currentYear }; }, fmt_Stats_Count_Right, "0", "0");
  buildDualTable("Publisher Presence (Most Years)", "Top Publisher by Year (by Time)", topPublisherByYearCount, yearlyPublishers, ["Rank", "# Years", "First", "Last", "Publisher [Years]"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.name} [${compressYearRanges(item.values).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstSeen, true), c4: formatDate(item.lastSeen, true), c5: detail, valForTie: val, isBold: item.lastSeen instanceof Date && item.lastSeen.getFullYear() === currentYear }; }, fmt_Stats_Right, "0", "[hh]:mm");
  buildDualTable("Publisher Presence (Most Months)", "Top Publisher by Year (by Months)", topPublisherByMonthCount, yearlyPublisherByMonthCount, ["Rank", "# Months", "First", "Last", "Publisher [Months]"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.name} [${compressMonthRanges(item.values).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstSeen, true), c4: formatDate(item.lastSeen, true), c5: detail, valForTie: val, isBold: item.lastSeen instanceof Date && item.lastSeen.getFullYear() === currentYear }; }, fmt_Stats_Count_Right, "0", "0");
  buildDualTable( "Top 25 Game Overlaps (Same Day)", "Top Game Overlap by Year", topGameOverlaps, yearlyGameOverlaps, ["Rank", "# Days", "First Date", "Last Date", "Game Pair"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const [game1Name, game2Name] = item.pair.split(' / '); const game1Stats = allTimeGameStats[game1Name]; const game2Stats = allTimeGameStats[game2Name]; const game1Systems = game1Stats ? `(${Array.from(game1Stats.systems).join(', ')})` : ''; const game2Systems = game2Stats ? `(${Array.from(game2Stats.systems).join(', ')})` : ''; const detail = `${game1Name} ${game1Systems} / ${game2Name} ${game2Systems}`; return { c1: rank, c2: val, c3: formatDate(item.firstDate, true), c4: formatDate(item.lastDate, true), c5: detail, valForTie: val, isBold: item.lastDate instanceof Date && item.lastDate.getFullYear() === currentYear }; }, fmt_Stats_Count_Right, "0", "0");
  buildDualTable("Top 25 Genres", "Top Genre by Year", topGenres, yearlyGenres, ["Rank", "Total Time", "Start", "Last", "Genre"], (item, i, p) => fmt_Stats(item, i, p), fmt_Stats_Right, "[hh]:mm", "[hh]:mm");
  
  const fmt_Stats_Days = (item, i, prev) => { const stats = Array.isArray(item) ? item[1] : item; const name = Array.isArray(item) ? item[0] : item.name; if (!stats) return { c1: "", c2: "", c3: "", c4: "", c5: "Error", valForTie: 0 }; const val = stats.days ? stats.days.size : 0; const rank = (val === prev) ? "" : `'${i + 1}`; const d1 = stats.minDate || stats.firstPlayed; const d2 = stats.maxDate || stats.lastPlayed; let detail = name; if (stats.games) { const count = stats.games.size || 0; detail = `${name} (${count} Games)`; } const isCurrent = (d2 instanceof Date) ? d2.getFullYear() === currentYear : false; return { c1: rank, c2: val, c3: formatDate(d1, true), c4: formatDate(d2, true), c5: detail, valForTie: val, isBold: isCurrent }; };
  const fmt_Days_Right = fmt_Stats_Count_Right; 
  
  buildDualTable("Most Days Playing a Series", "Most Days Playing Series by Year", topSeriesByDays, yearlySeriesByDays, ["Rank", "Days Played", "Start", "Last", "Series"], fmt_Stats_Days, fmt_Days_Right, "0", "0");
  buildDualTable("Most Days Playing a Genre", "Most Days Playing Genre by Year", topGenreByDays, yearlyGenreByDays, ["Rank", "Days Played", "Start", "Last", "Genre"], fmt_Stats_Days, fmt_Days_Right, "0", "0");
  buildDualTable("Most Days Playing a Developer", "Most Days Playing Developer by Year", topDeveloperByDays, yearlyDeveloperByDays, ["Rank", "Days Played", "Start", "Last", "Developer"], fmt_Stats_Days, fmt_Days_Right, "0", "0");
  buildDualTable("Most Days Playing a Publisher", "Most Days Playing Publisher by Year", topPublisherByDays, yearlyPublisherByDays, ["Rank", "Days Played", "Start", "Last", "Publisher"], fmt_Stats_Days, fmt_Days_Right, "0", "0");
  buildDualTable("Most Days Playing a Release Year", "Most Days Playing Release Year by Year", topReleaseYearByDays, yearlyReleaseYearByDays, ["Rank", "Days Played", "Start", "Last", "Release Year"], fmt_Stats_Days, fmt_Days_Right, "0", "0");
  
  const fmt_MetaHiatus = (item, i, prev) => {
      const val = item.gapDays; const rank = (val === prev) ? "" : `'${i + 1}`; 
      const detail = item.details || `${item.name} [${item.prevGame} -> ${item.currentGame}]`;
      return { c1: rank, c2: val, c3: formatDate(item.startDate, true), c4: formatDate(item.endDate, true), c5: detail, valForTie: val, isBold: item.endDate instanceof Date && item.endDate.getFullYear() === currentYear };
  };
  const fmt_MetaHiatus_Yearly = fmt_Event_Yearly_NoClipStart('gapDays', 'startDate', 'endDate', (i) => i.details || `${i.name} [${i.prevGame} -> ${i.currentGame}]`);

  buildDualTable("Top 25 Series Hiatuses", "Longest Series Hiatus Ending by Year", topMetaHiatuses.series, yearlyMetaHiatuses.series, ["Rank", "Gap Days", "Start", "End", "Series [From -> To]"], fmt_MetaHiatus, fmt_MetaHiatus_Yearly, "0", "0");
  buildDualTable("Top 25 Genre Hiatuses", "Longest Genre Hiatus Ending by Year", topMetaHiatuses.genre, yearlyMetaHiatuses.genre, ["Rank", "Gap Days", "Start", "End", "Genre [From -> To]"], fmt_MetaHiatus, fmt_MetaHiatus_Yearly, "0", "0");
  buildDualTable("Top 25 Developer Hiatuses", "Longest Developer Hiatus Ending by Year", topMetaHiatuses.developer, yearlyMetaHiatuses.developer, ["Rank", "Gap Days", "Start", "End", "Developer [From -> To]"], fmt_MetaHiatus, fmt_MetaHiatus_Yearly, "0", "0");
  buildDualTable("Top 25 Publisher Hiatuses", "Longest Publisher Hiatus Ending by Year", topMetaHiatuses.publisher, yearlyMetaHiatuses.publisher, ["Rank", "Gap Days", "Start", "End", "Publisher [From -> To]"], fmt_MetaHiatus, fmt_MetaHiatus_Yearly, "0", "0");
  buildDualTable("Top 25 Release Year Hiatuses", "Longest Release Year Hiatus Ending by Year", topMetaHiatuses.releaseYear, yearlyMetaHiatuses.releaseYear, ["Rank", "Gap Days", "Start", "End", "Rel Year [From -> To]"], fmt_MetaHiatus, fmt_MetaHiatus_Yearly, "0", "0");
  buildDualTable("Top 25 System Hiatuses", "Longest System Hiatus Ending by Year", topMetaHiatuses.system, yearlyMetaHiatuses.system, ["Rank", "Gap Days", "Start", "End", "System [From -> To]"], fmt_MetaHiatus, fmt_MetaHiatus_Yearly, "0", "0");

  ['series', 'genre', 'developer', 'publisher', 'releaseYear'].forEach(key => {
    const title = {series: "Series", genre: "Genre", developer: "Developer", publisher: "Publisher", releaseYear: "Release Year"}[key];
    buildDualTable(`Most Unique ${title} Games in One Year`, `Most Unique ${title} Games by Year`, metaGameCountData[`top${key}`], metaGameCountData[`yearly${key}`], ["Rank", "Count", "Start", "End", `Details`], fmt_MetaCount, fmt_MetaCount_Yearly, "0", "0");
  });

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const fmt_MonthBest = (item, i, prev) => {
    const val = item.totalSeconds;
    const rank = (val === prev) ? "" : `'${i + 1}`;
    const displayYear = item.year;
    return { 
      c1: rank, 
      c2: secondsToTimeString(val), 
      c3: formatDate(item.startDate, true), 
      c4: formatDate(item.endDate, true), 
      c5: `[${displayYear}] ${item.details}`, 
      valForTie: val, 
      isBold: item.year === currentYear 
    };
  };

  const fmt_MonthBest_Yearly = (wrapper) => {
      const item = wrapper.data;
      if (!item) return { c2: "", c3: "", c4: "", c5: "" };
      return { 
        c2: secondsToTimeString(item.totalSeconds), 
        c3: formatDate(item.startDate, true), 
        c4: formatDate(item.endDate, true), 
        c5: item.details, 
        valForTie: item.totalSeconds 
      };
  };

  for (let m = 0; m < 12; m++) {
    const dataForMonth = bestMonthsByName[m] || [];
    const top25 = sliceWithTies([...dataForMonth].sort((a,b) => b.totalSeconds - a.totalSeconds), 25, i => i.totalSeconds);
    const yearlyData = [...dataForMonth]
       .sort((a,b) => b.year - a.year)
       .map(item => ({ year: item.year, data: item, isTie: false }));

    buildDualTable(
      `Top 25 Best of ${monthNames[m]}`, 
      `${monthNames[m]} Stats by Year`, 
      top25, 
      yearlyData, 
      ["Rank", "Time", "Start", "End", "Year / Top 5 Games"], 
      fmt_MonthBest, 
      fmt_MonthBest_Yearly, 
      "[hh]:mm", 
      "[hh]:mm"
    );
  }

  let globalStartYear = currentYear;
  if (topGamesByGenreData) {
    Object.values(topGamesByGenreData).forEach(genreData => {
      genreData.yearly.forEach(entry => {
        if (entry.year < globalStartYear) globalStartYear = entry.year;
      });
    });
  }
  if (globalStartYear > 2015) globalStartYear = 2015;

  const fmt_GenreGame = (item, i, prev) => {
    const val = item.totalSeconds;
    const rank = (val === prev) ? "" : `'${i + 1}`;
    const sysStr = item.systems ? `(${Array.from(item.systems).join(', ')})` : "";
    const detail = `${item.name} ${sysStr}`;
    return { 
      c1: rank, 
      c2: secondsToTimeString(val), 
      c3: formatDate(item.startDate, true), 
      c4: formatDate(item.lastDate, true), 
      c5: detail, 
      valForTie: val, 
      isBold: item.lastDate instanceof Date && item.lastDate.getFullYear() === currentYear 
    };
  };

  const fmt_GenreGame_Yearly = (wrapper) => {
    if (wrapper.isEmpty) {
      return { c2: "-", c3: "-", c4: "-", c5: "(No games in this genre played)", valForTie: 0 };
    }
    const item = wrapper.data; 
    if (!item) return { c2: "", c3: "", c4: "", c5: "" };
    
    const sysStr = item.systems ? `(${Array.from(item.systems).join(', ')})` : "";
    const detail = `${item.name} ${sysStr}`;
    return { 
      c2: secondsToTimeString(item.totalSeconds), 
      c3: formatDate(item.startDate, true), 
      c4: formatDate(item.endDate, true), 
      c5: detail, 
      valForTie: item.totalSeconds 
    };
  };

  const genreList = Object.keys(topGamesByGenreData || {}).sort();

  for (const genre of genreList) {
    if (genre === 'N/A') continue;

    const data = topGamesByGenreData[genre];
    const top25 = sliceWithTies(data.allTime, 25, i => i.totalSeconds);
    const yearlyMap = new Map();
    data.yearly.forEach(item => yearlyMap.set(item.year, item));

    const fullYearlyWrapper = [];
    for (let y = currentYear; y >= globalStartYear; y--) {
      if (yearlyMap.has(y)) {
        fullYearlyWrapper.push({ year: y, data: yearlyMap.get(y), isTie: false });
      } else {
        fullYearlyWrapper.push({ year: y, isEmpty: true });
      }
    }

    buildDualTable(
      `Top 25 Most Played ${genre}`, 
      `Most Played ${genre} by Year`, 
      top25, 
      fullYearlyWrapper, 
      ["Rank", "Time", "Start", "Last", "Game"], 
      fmt_GenreGame, 
      fmt_GenreGame_Yearly, 
      "[hh]:mm", 
      "[hh]:mm"
    );
  }
  
  if (outputValues.length === 0) return;
  const range = sheet.getRange(1, 1, outputValues.length, NUM_COLS);
  range.setValues(outputValues);
  range.setBackgrounds(outputBackgrounds);
  range.setFontWeights(outputFontWeights);
  range.setFontColors(outputFontColors);
  range.setFontSizes(outputFontSizes);
  range.setHorizontalAlignments(outputAlignments);
  range.setNumberFormats(outputNumberFormats);
  
  // Apply formatting
  range.setFontFamily(STYLES.FONT_FAMILY).setVerticalAlignment("middle").setWrap(true);
  mergeRangesA1.forEach(a1 => sheet.getRange(a1).merge());
  
  // Optimized column width setting
  const columnWidths = [35, 100, 85, 85, 1000, 20, 40, 100, 85, 85, 1000];
  columnWidths.forEach((width, index) => {
    sheet.setColumnWidth(index + 1, width);
  });
}

function cleanSheet(sheet, dataLastRow) {
  const maxRows = sheet.getMaxRows();
  const rowsToKeep = dataLastRow + 2; 
  
  if (maxRows > rowsToKeep) {
    sheet.getRange(rowsToKeep + 1, 1, maxRows - rowsToKeep, sheet.getMaxColumns())
         .clearContent()
         .setBackground(null)
         .setFontWeight("normal");
  }

  if (maxRows > rowsToKeep + 50) {
    sheet.deleteRows(rowsToKeep + 1, maxRows - rowsToKeep);
  }
}
