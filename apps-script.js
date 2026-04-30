/**
 * A central, high-fidelity function to get all data and rich formatting from a sheet.
 */
function getSheetData(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return {
      values: [['Sheet not found: ' + sheetName]], backgrounds: [], widths: [], fontWeights: [],
      fontSizes: [], fontColors: [], horizontalAlignments: [], mergedRanges: []
    };
  }

  const range = sheet.getDataRange();
  const numColumns = range.getNumColumns();
  const widths = [];
  for (let i = 1; i <= numColumns; i++) {
    widths.push(sheet.getColumnWidth(i));
  }

  const mergedRangesRaw = range.getMergedRanges();
  const mergedRanges = mergedRangesRaw.map(range => ({
    row: range.getRow() - 1,
    col: range.getColumn() - 1,
    numRows: range.getNumRows(),
    numCols: range.getNumColumns()
  }));

  return {
    values: range.getDisplayValues(),
    backgrounds: range.getBackgrounds(),
    widths: widths,
    fontWeights: range.getFontWeights(),
    fontSizes: range.getFontSizes(),
    fontColors: range.getFontColors(),
    horizontalAlignments: range.getHorizontalAlignments(),
    mergedRanges: mergedRanges
  };
}

/**
 * A helper to get data and formatting from a specific A1 notation range.
 */
function getSheetDataByRange(sheetName, rangeA1) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return {
      values: [['Sheet not found: ' + sheetName]],
      backgrounds: [], widths: [], fontWeights: [],
      fontSizes: [], fontColors: [], horizontalAlignments: [], mergedRanges: []
    };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    return {
      values: [[`The '${sheetName}' report sheet is currently empty. Please run the report generator.`]],
      backgrounds: [], widths: [600], fontWeights: [], fontSizes: [], fontColors: [], horizontalAlignments: [], mergedRanges: []
    };
  }

  const columns = rangeA1.split(':');
  const scopedRangeA1 = `${columns[0]}1:${columns[1]}${lastRow}`;

  const range = sheet.getRange(scopedRangeA1);
  const startCol = range.getColumn();
  const numColumns = range.getNumColumns();
  const widths = [];
  for (let i = 0; i < numColumns; i++) {
    widths.push(sheet.getColumnWidth(startCol + i));
  }

  const mergedRangesRaw = range.getMergedRanges();
  const mergedRanges = mergedRangesRaw.map(r => ({
    row: r.getRow() - 1,
    col: r.getColumn() - startCol,
    numRows: r.getNumRows(),
    numCols: r.getNumColumns()
  }));

  return {
    values: range.getDisplayValues(),
    backgrounds: range.getBackgrounds(),
    widths: widths,
    fontWeights: range.getFontWeights(),
    fontSizes: range.getFontSizes(),
    fontColors: range.getFontColors(),
    horizontalAlignments: range.getHorizontalAlignments(),
    mergedRanges: mergedRanges
  };
}

//================================================================//
//                                                                //
//                     GAME LOG TOOLS - MASTER SCRIPT             //
//                                                                //
//================================================================//

// Global constant for the Spreadsheet ID. This is REQUIRED for time-based triggers to work.
const SPREADSHEET_ID = "1k79wwChpG4AXUDb1o8CZaKWr0vSQ5FplCsRDkHKXftk";

// Global constants for column indices.
const COLS = {
  ENTRY_NUM: 0, DATE: 1, VIDEOGAME: 2, SYSTEM: 3, TIME: 4, 
  PT_TOTAL: 5, GAME_TOTAL: 6, PT_TAG: 7, STATUS: 8, DETAILS: 9 
};

// Streamlined Styles (Only what is needed for the Top 25 visual parse)
const STYLES = {
  FONT_FAMILY: "Courier New",
  TITLE_BG: "#0000ff",
  TITLE_FONT_COLOR: "#ffffff",
  HEADER_BG: "#00ffff",
  ROW_BG_1: "#ffffff",
  ROW_BG_2: "#f3f3f3",
  BOLD_FONT_SIZE: 8,
  SMALL_FONT_SIZE: 7
};

// --- Cache key for aggregated data ---
const CACHE_KEY = 'videogame_log_aggregated_data';
const CACHE_KEY_ENTRIES = 'videogame_log_all_entries_v4_REFRESH'; 
const CACHE_KEY_HISTORY = 'videogame_log_playthrough_history_v4_REFRESH';
const CACHE_KEY_METRICS = 'videogame_log_metrics_v4_REFRESH';
const CACHE_CHUNK_SIZE = 90000; 

function warmUpCache() {
  SpreadsheetApp.getActiveSpreadsheet().toast('Warming up the cache... This may take several minutes.', 'In Progress', -1);
  getAggregatedData(); 
  SpreadsheetApp.getActiveSpreadsheet().toast('Cache is ready! Reports will now load quickly.', 'Complete', 10);
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('Game Log Tools')
    .addItem('Process New Entries', 'processNewEntries')
    .addItem('Update Metadata Sheet', 'updateMetadataSheet')
    .addItem('Update Completed Games', 'updateMainCompletedGames')
    .addSeparator()
    .addItem('Warm Up Cache', 'warmUpCache')
    .addItem('Clear Log Cache', 'clearAggregatedDataCache')
    .addSeparator()
    .addItem('Generate Top 25 & Sync to Github', 'generateTop25AndExport');
  
  menu.addToUi();
}

function processNewEntries() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const startRow = 4;
  const values = sheet.getRange(startRow, 1, sheet.getLastRow() - startRow + 1, sheet.getLastColumn()).getDisplayValues();

  const rowsToProcess = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row[COLS.ENTRY_NUM] && row[COLS.VIDEOGAME] && row[COLS.TIME] && row[COLS.DETAILS]) {
      rowsToProcess.push(i);
    }
  }

  if (rowsToProcess.length === 0) {
    ui.alert("No new entries to process.");
    return;
  }

  for (let i = rowsToProcess.length - 1; i >= 0; i--) {
    const rowIndex = rowsToProcess[i];
    const rowData = values[rowIndex];
    const gameName = rowData[COLS.VIDEOGAME];
    const sessionTimeStr = rowData[COLS.TIME];
    const playNote = rowData[COLS.DETAILS];
    const playNoteMatch = playNote.match(/^Game (\d+)/);
    const playthroughNumPrefix = playNoteMatch ? playNoteMatch[0] : null;

    let lifetimeTimeSec = 0, playthroughTimeSec = 0, system = "", playthroughTag = "", status = "", series = "";
    let prevGameFound = false, prevPlaythroughFound = false;

    for (let j = 0; j < values.length; j++) {
      if (i === j || !values[j][COLS.ENTRY_NUM]) continue;
      const historicalRow = values[j];
      const historicalGameName = historicalRow[COLS.VIDEOGAME];
      if (!prevGameFound && historicalGameName === gameName) {
        lifetimeTimeSec = timeStringToSeconds(historicalRow[COLS.GAME_TOTAL]);
        prevGameFound = true;
      }
      if (!prevPlaythroughFound && historicalGameName === gameName && historicalRow[COLS.DETAILS].startsWith(playthroughNumPrefix)) {
        playthroughTimeSec = timeStringToSeconds(historicalRow[COLS.PT_TOTAL]);
        system = historicalRow[COLS.SYSTEM];
        playthroughTag = historicalRow[COLS.PT_TAG];
        status = historicalRow[COLS.STATUS];
        prevPlaythroughFound = true;
      }
      if (prevGameFound && prevPlaythroughFound) break;
    }

    if (!prevPlaythroughFound) status = "Active";

    const entryNumBelow = (rowIndex + 1 < values.length) ? values[rowIndex + 1][COLS.ENTRY_NUM] : 0;
    const newEntryNum = Number(entryNumBelow) + 1;
    const sessionTimeSec = timeStringToSeconds(sessionTimeStr);

    values[rowIndex][COLS.ENTRY_NUM] = newEntryNum;
    values[rowIndex][COLS.SYSTEM] = system;
    values[rowIndex][COLS.PT_TOTAL] = secondsToTimeString(playthroughTimeSec + sessionTimeSec);
    values[rowIndex][COLS.GAME_TOTAL] = secondsToTimeString(lifetimeTimeSec + sessionTimeSec);
    values[rowIndex][COLS.PT_TAG] = playthroughTag;
    values[rowIndex][COLS.STATUS] = status;
  }

  sheet.getRange(startRow, 1, values.length, sheet.getLastColumn()).setValues(values);
  clearAggregatedDataCache(false);
  ui.alert(`Success!`, `Processed ${rowsToProcess.length} new log entries.`, ui.ButtonSet.OK);
}

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

let _SS_CACHE = null;

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
    systemStreaks: metrics.systemStreaks,
    yearlySystemStreaks: Object.keys(metrics.yearlySystemStreaks || {}) 
        .sort((a, b) => b - a)
        .flatMap(year => metrics.yearlySystemStreaks[year].map(item => ({
            year: parseInt(year),
            data: item,
            isTie: metrics.yearlySystemStreaks[year].length > 1
        }))),
    oneSittingCompletions: metrics.oneSittingCompletions,

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
 * This physical layout is strictly required because the web frontend parses the blank columns.
 */
function formatMetricsStreaksAndRecords(sheet, allStreaksData, currentYear, allTimeGameStats) {
  const {
    topGamingStreaks, yearlyGamingStreaks, systemStreaks, yearlySystemStreaks,
    oneSittingCompletions, topBreakStreaks, yearlyBreakStreaks,
    topSameGameStreaks, yearlySameGameStreaks, topGamesByYearCount, yearlyMostPlayedGame, 
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

  const buildDualTable = (titleLeft, titleRight, leftData, rightData, headersLeft, formatFnLeft, formatFnRight, numberFormatColB, numberFormatColH) => {
    addRow(Array(NUM_COLS).fill(""));
    const titleRowIdx = addRow([titleLeft, "", "", "", "", "", titleRight, "", "", "", ""]);
    outputBackgrounds[titleRowIdx].fill(STYLES.TITLE_BG);
    outputFontColors[titleRowIdx].fill(STYLES.TITLE_FONT_COLOR);
    outputFontWeights[titleRowIdx].fill("bold");
    outputFontSizes[titleRowIdx].fill(14);
    mergeRangesA1.push(`A${titleRowIdx + 1}:E${titleRowIdx + 1}`);
    mergeRangesA1.push(`G${titleRowIdx + 1}:K${titleRowIdx + 1}`);

    const headersRight = [...headersLeft]; 
    headersRight[0] = "Year"; 
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
      if (i < leftLen) {
        const item = leftData[i];
        const formatted = formatFnLeft(item, i, prevValLeft); 
        prevValLeft = formatted.valForTie; 
        row[0] = formatted.c1; row[1] = formatted.c2; row[2] = formatted.c3; row[3] = formatted.c4; row[4] = formatted.c5;
        if (formatted.isBold) leftIsBold = true;
      }
      if (i < rightLen) {
        const item = rightData[i]; 
        const formatted = formatFnRight ? formatFnRight(item) : formatFnLeft(item.data, -1, null); 
        row[6] = (item.year === prevValRight_Year) ? "" : item.year; 
        prevValRight_Year = item.year;
        row[7] = formatted.c2; row[8] = formatted.c3; row[9] = formatted.c4; row[10] = formatted.c5;
      }
      const rIdx = addRow(row);
      if (numberFormatColB) outputNumberFormats[rIdx][1] = numberFormatColB; 
      if (numberFormatColH) outputNumberFormats[rIdx][7] = numberFormatColH; 
      if (leftIsBold) {
         outputFontWeights[rIdx][0] = "bold"; outputFontWeights[rIdx][1] = "bold"; outputFontWeights[rIdx][2] = "bold"; outputFontWeights[rIdx][3] = "bold"; outputFontWeights[rIdx][4] = "bold";
      }
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
  buildDualTable("Top 25 System Streaks", "Longest System Streak by Year", systemStreaks, yearlySystemStreaks, ["Rank", "Entries", "Start", "End", "System"], (item, i, prev) => { const val = item.length; const rank = (val === prev) ? "" : `'${i + 1}`; return { c1: rank, c2: val, c3: formatDate(item.start, true), c4: formatDate(item.end, true), c5: item.system, valForTie: val, isBold: (item.end instanceof Date && item.end.getFullYear() === currentYear) }; }, (w) => { const item = w.data; if (!item) return { c2: "", c3: "", c4: "", c5: "" }; return { c2: item.value, c3: formatDate(item.minDate, true), c4: formatDate(item.maxDate, true), c5: item.system, valForTie: item.value }; }, "0", "0");
  buildDualTable("Top 25 One-Sitting Completions", "Longest One-Sitting Clear by Year", oneSittingCompletions, [], ["Rank", "Time", "Date", "System", "Game [Note]"], (item, i, prev) => { const val = timeStringToSeconds(item.finalPtLifetime); const rank = (val === prev) ? "" : `'${i + 1}`; const detail = `${item.gameName} (${item.system}) [${item.finalNote}]`; return { c1: rank, c2: item.finalPtLifetime, c3: formatDate(item.lastDate, true), c4: item.system, c5: detail, valForTie: val, isBold: (item.lastDate instanceof Date && item.lastDate.getFullYear() === currentYear) }; }, fmt_Event_Yearly_NoClipStart('seconds', 'lastDate', 'lastDate', (i) => `${i.gameName} (${i.system}) [${i.finalNote}]`), "[hh]:mm", "[hh]:mm" );
  buildDualTable("Games Played Across Most Years", "Most Played Game by Year", topGamesByYearCount, yearlyMostPlayedGame, ["Rank", "# Years", "Start", "Last", "Game [Years]"], (item, i, prev) => { const val = item.count; const rank = (val === prev) ? "" : `'${i + 1}`; const systems = item.systems ? `(${Array.from(item.systems).join(', ')}) ` : ""; const detail = `${item.game} ${systems}[${compressYearRanges(item.years).join(', ')}]`; return { c1: rank, c2: val, c3: formatDate(item.firstPlayed, true), c4: formatDate(item.lastPlayed, true), c5: detail, valForTie: val, isBold: item.lastPlayed instanceof Date && item.lastPlayed.getFullYear()===currentYear }; }, fmt_Stats_Right, "0", "[hh]:mm");
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
  range.setFontFamily(STYLES.FONT_FAMILY).setVerticalAlignment("middle").setWrap(true);
  mergeRangesA1.forEach(a1 => sheet.getRange(a1).merge());
  sheet.setColumnWidth(1, 35); sheet.setColumnWidth(2, 100); sheet.setColumnWidth(3, 85); sheet.setColumnWidth(4, 85); sheet.setColumnWidth(5, 1000); sheet.setColumnWidth(6, 20); sheet.setColumnWidth(7, 40); sheet.setColumnWidth(8, 100); sheet.setColumnWidth(9, 85); sheet.setColumnWidth(10, 85); sheet.setColumnWidth(11, 1000); 
}


//================================================================//
//                DATA AGGREGATION & HELPERS                      //
//================================================================//

const dataReviver = (key, value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return new Date(value);
  }
  if (value && typeof value === 'object' && value._dataType === 'Set') {
    return new Set(value.data);
  }
  return value;
};

const dataReplacer = (key, value) => {
  if (value instanceof Set) {
    return { _dataType: 'Set', data: [...value] };
  }
  return value;
};

function saveToCache(key, data) {
  const cache = CacheService.getScriptCache();
  const jsonString = JSON.stringify(data, dataReplacer);
  
  if (jsonString.length <= CACHE_CHUNK_SIZE) {
    cache.put(key, jsonString, 21600); 
  } else {
    const chunks = {};
    const chunkCount = Math.ceil(jsonString.length / CACHE_CHUNK_SIZE);
    
    for (let i = 0; i < chunkCount; i++) {
      const chunkKey = `${key}_${i}`;
      const chunkData = jsonString.substr(i * CACHE_CHUNK_SIZE, CACHE_CHUNK_SIZE);
      chunks[chunkKey] = chunkData;
    }
    
    cache.putAll(chunks, 21600);
    cache.put(key, `__CHUNKED__${chunkCount}`, 21600);
  }
}

function loadFromCache(key) {
  const cache = CacheService.getScriptCache();
  const mainValue = cache.get(key);
  
  if (!mainValue) return null;

  let finalJsonString = mainValue;

  if (mainValue.startsWith('__CHUNKED__')) {
    const count = parseInt(mainValue.replace('__CHUNKED__', ''));
    const chunkKeys = [];
    for (let i = 0; i < count; i++) {
      chunkKeys.push(`${key}_${i}`);
    }
    
    const chunkMap = cache.getAll(chunkKeys);
    finalJsonString = chunkKeys.map(k => chunkMap[k]).join('');
  }

  return JSON.parse(finalJsonString, dataReviver);
}

function clearAggregatedDataCache(showAlert = true) {
  const cache = CacheService.getScriptCache();
  
  [CACHE_KEY_ENTRIES, CACHE_KEY_HISTORY, CACHE_KEY_METRICS].forEach(key => {
    const val = cache.get(key);
    if (val && val.startsWith('__CHUNKED__')) {
      const count = parseInt(val.replace('__CHUNKED__', ''));
      const keysToRemove = [];
      for (let i = 0; i < count; i++) keysToRemove.push(`${key}_${i}`);
      cache.removeAll(keysToRemove);
    }
    cache.remove(key);
  });

  Logger.log('Aggregated data cache has been cleared.');
  if (showAlert) {
    try {
      SpreadsheetApp.getUi().alert('Cache Cleared', 'The aggregated data cache has been cleared. The next report will run a full data refresh.', SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) { /* Ignore UI errors */ }
  }
}

let _MEMORY_CACHE = null;

function getAggregatedData() {
  if (_MEMORY_CACHE) {
    return _MEMORY_CACHE;
  }

  const cachedEntries = loadFromCache(CACHE_KEY_ENTRIES);
  const cachedHistory = loadFromCache(CACHE_KEY_HISTORY);
  const cachedMetrics = loadFromCache(CACHE_KEY_METRICS);

  if (cachedEntries != null && cachedHistory != null && cachedMetrics != null) { 
    Logger.log('Retrieved all data parts from cache.');
    _MEMORY_CACHE = { allEntries: cachedEntries, playthroughHistory: cachedHistory, metrics: cachedMetrics };
    return _MEMORY_CACHE;
  }

  Logger.log('Cache incomplete or empty. Performing full data aggregation.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const masterSheet = ss.getSheetByName("Master");
  const metadataSheet = ss.getSheetByName("Metadata");

  const metadataMap = new Map();
  if (metadataSheet) {
    const metadataValues = metadataSheet.getDataRange().getDisplayValues();
    for (let i = 1; i < metadataValues.length; i++) {
      const gameName = metadataValues[i][0];
      if (gameName) {
        const series = metadataValues[i][5]; 
        metadataMap.set(gameName, {
          releaseYear: metadataValues[i][1],
          genre: metadataValues[i][2],
          developer: metadataValues[i][3],
          publisher: metadataValues[i][4],
          series: (series && series.toUpperCase() !== 'ZZNONE') ? series : null
        });
      }
    }
  }

  const lastRow = masterSheet.getLastRow();
  const numRows = lastRow - 3;
   
  if (numRows < 1) return { allEntries: [], playthroughHistory: {}, metrics: {} };

  const masterValues = masterSheet.getRange(4, 1, numRows, masterSheet.getLastColumn()).getDisplayValues();
  const statusColors = masterSheet.getRange(4, 9, numRows, 1).getBackgrounds();
   
  const { allEntries, playthroughHistory, metrics } = aggregateMasterData(masterValues, statusColors, metadataMap);

  try {
    saveToCache(CACHE_KEY_ENTRIES, allEntries);
    saveToCache(CACHE_KEY_HISTORY, playthroughHistory);
    saveToCache(CACHE_KEY_METRICS, metrics);
    Logger.log('Successfully stored data in cache.');
  } catch (e) {
    Logger.log(`Error caching data: ${e.message}`);
  }

  _MEMORY_CACHE = { allEntries, playthroughHistory, metrics };
  return { allEntries, playthroughHistory, metrics };
}

function aggregateMasterData(values, statusColors, metadataMap) {
  const allEntries = [];
    
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (row[COLS.DATE] && row[COLS.VIDEOGAME] && row[COLS.PT_TAG]) {
      const dateParts = row[COLS.DATE].split('/');
      if (dateParts.length < 3) continue;
        
      const correctDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], 12, 0, 0));
      const gameName = row[COLS.VIDEOGAME];
      const metadata = metadataMap.get(gameName) || {};

      allEntries.push({
        entryNum: row[COLS.ENTRY_NUM],
        date: correctDate,
        game: gameName,
        system: row[COLS.SYSTEM],
        time: row[COLS.TIME],
        ptLifetime: row[COLS.PT_TOTAL],
        gameLifetime: row[COLS.GAME_TOTAL],
        ptTag: row[COLS.PT_TAG],
        status: row[COLS.STATUS],
        series: metadata.series,
        note: row[COLS.DETAILS],
        bgColor: statusColors[i][0], 
        releaseYear: metadata.releaseYear,
        genre: metadata.genre,
        developer: metadata.developer,
        publisher: metadata.publisher
      });
    }
  }

  allEntries.sort((a, b) => a.date - b.date);

  const ptDayTracker = {}, gameDayTracker = {}, gameTimeTracker = {}, playthroughHistory = {};
    
  for (const entry of allEntries) {
    if (!ptDayTracker[entry.ptTag]) ptDayTracker[entry.ptTag] = new Set();
    if (!gameDayTracker[entry.game]) gameDayTracker[entry.game] = new Set();
    if (!gameTimeTracker[entry.game]) gameTimeTracker[entry.game] = 0;

    const dateKey = entry.date.toISOString().split('T')[0];
    ptDayTracker[entry.ptTag].add(dateKey);
    gameDayTracker[entry.game].add(dateKey);
    gameTimeTracker[entry.game] += timeStringToSeconds(entry.time);

    entry.ptLifetimeDays = ptDayTracker[entry.ptTag].size;
    entry.gameLifetimeDays = gameDayTracker[entry.game].size;
    entry.runningGameLifetimeSeconds = gameTimeTracker[entry.game];

    if (!playthroughHistory[entry.ptTag]) {
        playthroughHistory[entry.ptTag] = { 
            startDate: entry.date, 
            systems: new Set() 
        };
    }
    
    playthroughHistory[entry.ptTag].systems.add(entry.system);

    Object.assign(playthroughHistory[entry.ptTag], {
      lastDate: entry.date, finalStatus: entry.status, finalNote: entry.note,
      finalPtLifetime: entry.ptLifetime, finalPtLifetimeDays: entry.ptLifetimeDays,
      finalGameLifetime: secondsToTimeString(entry.runningGameLifetimeSeconds),
            finalGameLifetimeDays: entry.gameLifetimeDays,
            finalBgColor: entry.bgColor, gameName: entry.game, 
            system: entry.system, 
            systemDisplay: Array.from(playthroughHistory[entry.ptTag].systems).join(', '),
            series: entry.series,
            releaseYear: entry.releaseYear,
            genre: entry.genre,
            developer: entry.developer,
            publisher: entry.publisher
    });
  }

  const metrics = aggregateAllMetrics(allEntries, playthroughHistory);

  return { allEntries, playthroughHistory, metrics };
}

function aggregateMetrics_TopGamesByGenre(gameTimeByGenre, gamesByMetaInTimeframe, allTimeGameStats, yearlyGameStats) {
  const result = {};
  
  for (const [genre, gameMap] of Object.entries(gameTimeByGenre)) {
    if (!result[genre]) result[genre] = { allTime: [], yearly: [] };
    
    const allTimeList = Object.entries(gameMap).map(([gameName, seconds]) => {
      const mainStats = allTimeGameStats[gameName] || {};
      return {
        name: gameName,
        totalSeconds: seconds,
        systems: mainStats.systems || new Set(),
        startDate: mainStats.firstPlayedDate,
        lastDate: mainStats.lastPlayedDate
      };
    });
    
    result[genre].allTime = allTimeList.sort((a, b) => b.totalSeconds - a.totalSeconds);
  }

  const yearlyGenreData = gamesByMetaInTimeframe.genre.yearly;
  
  for (const [key, data] of Object.entries(yearlyGenreData)) {
    const genre = data.metaValue;
    if (!result[genre]) continue; 

    let bestGameName = "";
    let maxSeconds = -1;
    
    for (const [game, seconds] of Object.entries(data.gameTimes)) {
      if (seconds > maxSeconds) {
        maxSeconds = seconds;
        bestGameName = game;
      }
    }

    if (bestGameName) {
      const year = parseInt(data.year);
      const systems = allTimeGameStats[bestGameName] ? allTimeGameStats[bestGameName].systems : new Set();
      
      let minDate = null, maxDate = null;
      if (yearlyGameStats[year] && yearlyGameStats[year][bestGameName]) {
        const dateStrings = Array.from(yearlyGameStats[year][bestGameName].days).sort();
        if (dateStrings.length > 0) {
          minDate = new Date(dateStrings[0] + "T12:00:00Z");
          maxDate = new Date(dateStrings[dateStrings.length - 1] + "T12:00:00Z");
        }
      }

      result[genre].yearly.push({
        year: year,
        name: bestGameName,
        totalSeconds: maxSeconds,
        systems: systems,
        startDate: minDate,
        endDate: maxDate
      });
    }
  }

  return result;
}

function aggregateAllMetrics(allEntries, playthroughHistory) {
  const metrics = createMetricsObject();
  const yearlyMostPlayedGame = {};
  const yearlyTopSession = {};
  const yearlyMostPlayedSystem = {};
  
  const previousRankings = {
    time: new Map(),
    days: new Map(),
    sessions: new Map(),
    systems: new Map()
  };

  for (const [index, entry] of allEntries.entries()) {
    const context = {
      entry: entry,
      year: entry.date.getFullYear(),
      monthKey: `${entry.date.getFullYear()}-${(entry.date.getMonth() + 1).toString().padStart(2, '0')}`,
      dateStr: entry.date.toISOString().split('T')[0],
      timeSec: timeStringToSeconds(entry.time),
      game: entry.game,
      system: entry.system
    };

    updateRankingSnapshots(metrics, previousRankings);
    updateBasicTimeStats(metrics, context);
    
    if (entry.status === 'Multiplayer' || entry.status === 'M-Completed') {
      updateMultiplayerStats(metrics, context);
    }

    updateMetadataStats(metrics, context);
    checkMilestones(metrics, context, index, previousRankings, yearlyMostPlayedGame, yearlyMostPlayedSystem, yearlyTopSession);
  }

  finalizeDerivedMetrics(metrics, allEntries, playthroughHistory);

  return metrics;
}

function createMetricsObject() {
  return {
    allTimeGameStats: {}, yearlyGameStats: {}, monthlyStats: {},
    allTimeSystemStats: {}, yearlySystemStats: {}, monthlySystemStats: {},
    singleDaySessions: [], 
    dayOfWeekStats: { 'All-Time': { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } },
    
    allTimeGenreStats: {}, yearlyGenreStats: {}, monthlyGenreStats: {},
    seriesData: {}, developerStats: {}, publisherStats: {}, releaseYearStats: {}, genreStats: {},
    yearlySeriesStats: {}, yearlyDeveloperStats: {}, yearlyPublisherStats: {}, yearlyReleaseYearStats: {},
    
    gameYearlyPresence: {}, gameMonthlyPresence: {},
    gameMonthlyPresencePerYear: {}, 
    seriesMonthlyPresencePerYear: {}, genreMonthlyPresencePerYear: {},
    developerMonthlyPresencePerYear: {}, publisherMonthlyPresencePerYear: {},
    seriesYearlyPresence: {}, seriesMonthlyPresence: {},
    genreYearlyPresence: {}, genreMonthlyPresence: {},
    developerYearlyPresence: {}, developerMonthlyPresence: {},
    publisherYearlyPresence: {}, publisherMonthlyPresence: {},
    
    systemLastUsedDate: {},
    marathonCounts: {}, yearlyMarathonCounts: {},
    shortSessionCounts: {}, yearlyShortSessionCounts: {},
    
    milestones: [],
    firsts: { system: new Set(), genre: new Set(), releaseYear: new Set() },
    totalTimeSec: 0, uniqueGamesPlayed: new Set(), systemTimeSec: {},
    genreUniqueGames: {}, devUniqueGames: {}, pubUniqueGames: {},
    
    multiplayerGameData: {}, busiestMultiplayerMonthData: {}, busiestMultiplayerDayData: {},
    yearlyMultiplayerGameStats: {}, allMultiplayerEntries: [],
    
    gamesByMetaInTimeframe: {
      series: { yearly: {}, monthly: {} }, genre: { yearly: {}, monthly: {} },
      developer: { yearly: {}, monthly: {} }, publisher: { yearly: {}, monthly: {} },
      releaseYear: { yearly: {}, monthly: {} }
    },
    dailyVariety: {}, dailyTimeTotals: {},
    gameTimeByGenre: {}
  };
}

function updateBasicTimeStats(metrics, ctx) {
  const { entry, year, monthKey, dateStr, timeSec, game, system } = ctx;

  if (!metrics.allTimeGameStats[game]) metrics.allTimeGameStats[game] = { totalSeconds: 0, days: new Set(), systems: new Set(), firstPlayedDate: entry.date, lastPlayedDate: null };
  if (!metrics.yearlyGameStats[year]) metrics.yearlyGameStats[year] = {};
  if (!metrics.yearlyGameStats[year][game]) metrics.yearlyGameStats[year][game] = { totalSeconds: 0, days: new Set(), systems: new Set() };
  if (!metrics.monthlyStats[monthKey]) metrics.monthlyStats[monthKey] = {};
  if (!metrics.monthlyStats[monthKey][game]) metrics.monthlyStats[monthKey][game] = { totalSeconds: 0, days: new Set(), systems: new Set() };
  
  if (!metrics.allTimeSystemStats[system]) metrics.allTimeSystemStats[system] = 0;
  if (!metrics.yearlySystemStats[year]) metrics.yearlySystemStats[year] = {};
  if (!metrics.yearlySystemStats[year][system]) metrics.yearlySystemStats[year][system] = 0;
  if (!metrics.monthlySystemStats[monthKey]) metrics.monthlySystemStats[monthKey] = {};
  if (!metrics.monthlySystemStats[monthKey][system]) metrics.monthlySystemStats[monthKey][system] = 0;

  metrics.allTimeGameStats[game].totalSeconds += timeSec;
  metrics.allTimeGameStats[game].days.add(dateStr);
  metrics.allTimeGameStats[game].systems.add(system);
  metrics.allTimeGameStats[game].lastPlayedDate = entry.date;

  metrics.yearlyGameStats[year][game].totalSeconds += timeSec;
  metrics.yearlyGameStats[year][game].days.add(dateStr);
  metrics.yearlyGameStats[year][game].systems.add(system);

  metrics.monthlyStats[monthKey][game].totalSeconds += timeSec;
  metrics.monthlyStats[monthKey][game].days.add(dateStr);
  metrics.monthlyStats[monthKey][game].systems.add(system);

  metrics.allTimeSystemStats[system] += timeSec;
  metrics.yearlySystemStats[year][system] += timeSec;
  metrics.monthlySystemStats[monthKey][system] += timeSec;

  metrics.systemLastUsedDate[system] = entry.date;

  metrics.singleDaySessions.push({ time: timeSec, date: entry.date, game: game, system: system });
  
  if (!metrics.dailyVariety[dateStr]) metrics.dailyVariety[dateStr] = new Set();
  metrics.dailyVariety[dateStr].add(game);
  
  if (!metrics.dailyTimeTotals[dateStr]) metrics.dailyTimeTotals[dateStr] = 0;
  metrics.dailyTimeTotals[dateStr] += timeSec;

  const dayIndex = entry.date.getDay();
  if (!metrics.dayOfWeekStats[year]) metrics.dayOfWeekStats[year] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  metrics.dayOfWeekStats[year][dayIndex] += timeSec;
  metrics.dayOfWeekStats['All-Time'][dayIndex] += timeSec;

  if (timeSec >= 14400) { 
    if (!metrics.marathonCounts[game]) metrics.marathonCounts[game] = { gameName: game, count: 0, systems: new Set() };
    metrics.marathonCounts[game].count++; metrics.marathonCounts[game].systems.add(system);
    
    if (!metrics.yearlyMarathonCounts[year]) metrics.yearlyMarathonCounts[year] = {};
    if (!metrics.yearlyMarathonCounts[year][game]) metrics.yearlyMarathonCounts[year][game] = { gameName: game, count: 0, systems: new Set(), firstDate: entry.date, lastDate: entry.date };
    metrics.yearlyMarathonCounts[year][game].count++;
    metrics.yearlyMarathonCounts[year][game].systems.add(system);
    metrics.yearlyMarathonCounts[year][game].lastDate = entry.date;
  }
  if (timeSec > 0 && timeSec <= 1800) { 
    if (!metrics.shortSessionCounts[game]) metrics.shortSessionCounts[game] = { gameName: game, count: 0, systems: new Set() };
    metrics.shortSessionCounts[game].count++; metrics.shortSessionCounts[game].systems.add(system);
    
    if (!metrics.yearlyShortSessionCounts[year]) metrics.yearlyShortSessionCounts[year] = {};
    if (!metrics.yearlyShortSessionCounts[year][game]) metrics.yearlyShortSessionCounts[year][game] = { gameName: game, count: 0, systems: new Set(), firstDate: entry.date, lastDate: entry.date };
    metrics.yearlyShortSessionCounts[year][game].count++;
    metrics.yearlyShortSessionCounts[year][game].systems.add(system);
    metrics.yearlyShortSessionCounts[year][game].lastDate = entry.date;
  }
}

function updateMultiplayerStats(metrics, ctx) {
  const { entry, year, monthKey, dateStr, timeSec, game, system } = ctx;
  
  metrics.allMultiplayerEntries.push(entry);

  if (!metrics.multiplayerGameData[game]) metrics.multiplayerGameData[game] = { totalSeconds: 0, minDate: entry.date, maxDate: entry.date, systems: new Set() };
  metrics.multiplayerGameData[game].totalSeconds += timeSec; 
  metrics.multiplayerGameData[game].systems.add(system);
  if (entry.date < metrics.multiplayerGameData[game].minDate) metrics.multiplayerGameData[game].minDate = entry.date;
  if (entry.date > metrics.multiplayerGameData[game].maxDate) metrics.multiplayerGameData[game].maxDate = entry.date;

  if (!metrics.busiestMultiplayerMonthData[monthKey]) {
    metrics.busiestMultiplayerMonthData[monthKey] = { totalSeconds: 0, minDate: entry.date, maxDate: entry.date, games: {} };
  }
  const monthData = metrics.busiestMultiplayerMonthData[monthKey];
  monthData.totalSeconds += timeSec;
  if (entry.date > monthData.maxDate) monthData.maxDate = entry.date;
  if (!monthData.games[game]) monthData.games[game] = { totalSeconds: 0, systems: new Set() };
  monthData.games[game].totalSeconds += timeSec;
  monthData.games[game].systems.add(system);

  if (!metrics.yearlyMultiplayerGameStats[year]) metrics.yearlyMultiplayerGameStats[year] = {};
  if (!metrics.yearlyMultiplayerGameStats[year][game]) {
    metrics.yearlyMultiplayerGameStats[year][game] = { totalSeconds: 0, days: new Set(), systems: new Set() };
  }
  const yearMPData = metrics.yearlyMultiplayerGameStats[year][game];
  yearMPData.totalSeconds += timeSec;
  yearMPData.days.add(dateStr);
  yearMPData.systems.add(system);

  if (!metrics.busiestMultiplayerDayData[dateStr]) {
    metrics.busiestMultiplayerDayData[dateStr] = { totalSeconds: 0, date: entry.date, games: {} };
  }
  const dayData = metrics.busiestMultiplayerDayData[dateStr];
  dayData.totalSeconds += timeSec;
  if (!dayData.games[game]) dayData.games[game] = { totalSeconds: 0, systems: new Set() };
  dayData.games[game].totalSeconds += timeSec;
  dayData.games[game].systems.add(system);
}

function updateMetadataStats(metrics, ctx) {
  const { entry, year, monthKey, dateStr, timeSec, game, system } = ctx;
  const series = entry.series || "N/A";
  const genre = entry.genre || "N/A";
  const developer = entry.developer || "N/A";
  const publisher = entry.publisher || "N/A";
  const releaseYear = entry.releaseYear || "N/A";

  if (genre !== "N/A") {
    if (!metrics.allTimeGenreStats[genre]) metrics.allTimeGenreStats[genre] = { totalSeconds: 0, days: new Set(), games: new Set(), maxDate: entry.date };
    metrics.allTimeGenreStats[genre].totalSeconds += timeSec;
    metrics.allTimeGenreStats[genre].days.add(dateStr);
    metrics.allTimeGenreStats[genre].games.add(game);
    metrics.allTimeGenreStats[genre].maxDate = entry.date;

    if (!metrics.yearlyGenreStats[year]) metrics.yearlyGenreStats[year] = {};
    if (!metrics.yearlyGenreStats[year][genre]) metrics.yearlyGenreStats[year][genre] = { totalSeconds: 0, days: new Set(), games: new Set() };
    metrics.yearlyGenreStats[year][genre].totalSeconds += timeSec;
    metrics.yearlyGenreStats[year][genre].days.add(dateStr);
    metrics.yearlyGenreStats[year][genre].games.add(game);

    if (!metrics.monthlyGenreStats[monthKey]) metrics.monthlyGenreStats[monthKey] = {};
    if (!metrics.monthlyGenreStats[monthKey][genre]) metrics.monthlyGenreStats[monthKey][genre] = { totalSeconds: 0, days: new Set() };
    metrics.monthlyGenreStats[monthKey][genre].totalSeconds += timeSec;
    metrics.monthlyGenreStats[monthKey][genre].days.add(dateStr);

    if (!metrics.gameTimeByGenre[genre]) metrics.gameTimeByGenre[genre] = {};
    metrics.gameTimeByGenre[genre][game] = (metrics.gameTimeByGenre[genre][game] || 0) + timeSec;
  }

  const metadataMap = { developer: developer, publisher: publisher, releaseYear: releaseYear };
  for (const key in metadataMap) {
    const metaValue = metadataMap[key];
    if (metaValue !== "N/A") {
      const statsObject = metrics[`${key}Stats`];
      
      if (!statsObject[metaValue]) statsObject[metaValue] = { totalSeconds: 0, minDate: entry.date, maxDate: entry.date, games: new Set(), gamesPlaytime: {}, gamesSystems: {}, days: new Set() };
      const stats = statsObject[metaValue];
      stats.totalSeconds += timeSec;
      stats.days.add(dateStr);
      if (entry.date < stats.minDate) stats.minDate = entry.date;
      if (entry.date > stats.maxDate) stats.maxDate = entry.date;
      stats.games.add(game);
      stats.gamesPlaytime[game] = (stats.gamesPlaytime[game] || 0) + timeSec;
      if (!stats.gamesSystems[game]) stats.gamesSystems[game] = new Set();
      stats.gamesSystems[game].add(system);

      const yearlyStatsObject = metrics[`yearly${key.charAt(0).toUpperCase() + key.slice(1)}Stats`];
      if (!yearlyStatsObject[year]) yearlyStatsObject[year] = {};
      if (!yearlyStatsObject[year][metaValue]) yearlyStatsObject[year][metaValue] = { totalSeconds: 0, games: new Set(), days: new Set() };
      yearlyStatsObject[year][metaValue].totalSeconds += timeSec;
      yearlyStatsObject[year][metaValue].games.add(game);
      yearlyStatsObject[year][metaValue].days.add(dateStr);
    }
  }

  if (series && series !== "N/A") {
    if (!metrics.seriesData[series]) metrics.seriesData[series] = { totalSeconds: 0, minDate: entry.date, maxDate: entry.date, games: new Set(), gamesPlaytime: {}, days: new Set() };
    const sData = metrics.seriesData[series];
    sData.totalSeconds += timeSec;
    sData.games.add(game);
    sData.days.add(dateStr);
    if (entry.date < sData.minDate) sData.minDate = entry.date;
    if (entry.date > sData.maxDate) sData.maxDate = entry.date;
    sData.gamesPlaytime[game] = (sData.gamesPlaytime[game] || 0) + timeSec;

    if (!metrics.yearlySeriesStats[year]) metrics.yearlySeriesStats[year] = {};
    if (!metrics.yearlySeriesStats[year][series]) metrics.yearlySeriesStats[year][series] = { totalSeconds: 0, games: new Set(), days: new Set() };
    metrics.yearlySeriesStats[year][series].totalSeconds += timeSec;
    metrics.yearlySeriesStats[year][series].games.add(game);
    metrics.yearlySeriesStats[year][series].days.add(dateStr);
  }

  if (!metrics.gameYearlyPresence[game]) metrics.gameYearlyPresence[game] = new Set();
  metrics.gameYearlyPresence[game].add(year);
  if (!metrics.gameMonthlyPresence[game]) metrics.gameMonthlyPresence[game] = new Set();
  metrics.gameMonthlyPresence[game].add(monthKey);

  if (!metrics.gameMonthlyPresencePerYear[year]) metrics.gameMonthlyPresencePerYear[year] = {};
  if (!metrics.gameMonthlyPresencePerYear[year][game]) {
    metrics.gameMonthlyPresencePerYear[year][game] = { months: new Set(), systems: new Set(), minDate: entry.date, maxDate: entry.date };
  }
  const gMYear = metrics.gameMonthlyPresencePerYear[year][game];
  gMYear.months.add(monthKey);
  gMYear.systems.add(system);
  if (entry.date > gMYear.maxDate) gMYear.maxDate = entry.date;
  if (entry.date < gMYear.minDate) gMYear.minDate = entry.date;

  const presenceMap = {
    series: { value: series, obj: metrics.seriesMonthlyPresencePerYear },
    genre: { value: genre, obj: metrics.genreMonthlyPresencePerYear },
    developer: { value: developer, obj: metrics.developerMonthlyPresencePerYear },
    publisher: { value: publisher, obj: metrics.publisherMonthlyPresencePerYear }
  };
  for (const k in presenceMap) {
    const { value, obj } = presenceMap[k];
    if (value && value !== "N/A" && value.toUpperCase() !== 'ZZNONE') {
      if (!obj[year]) obj[year] = {};
      if (!obj[year][value]) obj[year][value] = { months: new Set(), games: new Set(), minDate: entry.date, maxDate: entry.date };
      obj[year][value].months.add(monthKey);
      obj[year][value].games.add(game);
      if (entry.date > obj[year][value].maxDate) obj[year][value].maxDate = entry.date;
      if (entry.date < obj[year][value].minDate) obj[year][value].minDate = entry.date;
    }
  }

  for (const key of ['series', 'genre', 'developer', 'publisher']) {
    const val = entry[key];
    if (val && val !== "N/A" && val.toUpperCase() !== 'ZZNONE') {
      const yPres = metrics[`${key}YearlyPresence`];
      const mPres = metrics[`${key}MonthlyPresence`];
      
      if (!yPres[val]) yPres[val] = { name: val, years: new Set(), firstSeen: entry.date, lastSeen: entry.date };
      yPres[val].years.add(year);
      if (entry.date > yPres[val].lastSeen) yPres[val].lastSeen = entry.date;

      if (!mPres[val]) mPres[val] = { name: val, months: new Set(), firstSeen: entry.date, lastSeen: entry.date };
      mPres[val].months.add(monthKey);
      if (entry.date > mPres[val].lastSeen) mPres[val].lastSeen = entry.date;
    }
  }

  const metaKeys = ['series', 'genre', 'developer', 'publisher', 'releaseYear'];
  for (const key of metaKeys) {
    const val = entry[key];
    if (!val || val === 'N/A') continue;
    
    const yearId = `${year}-${val}`;
    if (!metrics.gamesByMetaInTimeframe[key].yearly[yearId]) {
      metrics.gamesByMetaInTimeframe[key].yearly[yearId] = { metaValue: val, year, games: new Set(), gameTimes: {}, minDate: entry.date, maxDate: entry.date };
    }
    const yStat = metrics.gamesByMetaInTimeframe[key].yearly[yearId];
    yStat.games.add(game); 
    yStat.gameTimes[game] = (yStat.gameTimes[game] || 0) + timeSec;
    if (entry.date < yStat.minDate) yStat.minDate = entry.date;
    if (entry.date > yStat.maxDate) yStat.maxDate = entry.date;

    const monthId = `${monthKey}-${val}`;
    if (!metrics.gamesByMetaInTimeframe[key].monthly[monthId]) {
      metrics.gamesByMetaInTimeframe[key].monthly[monthId] = { metaValue: val, monthKey, games: new Set(), gameTimes: {}, minDate: entry.date, maxDate: entry.date };
    }
    const mStat = metrics.gamesByMetaInTimeframe[key].monthly[monthId];
    mStat.games.add(game);
    mStat.gameTimes[game] = (mStat.gameTimes[game] || 0) + timeSec;
    if (entry.date < mStat.minDate) mStat.minDate = entry.date;
    if (entry.date > mStat.maxDate) mStat.maxDate = entry.date;
  }
}

function updateRankingSnapshots(metrics, previousRankings) {
  previousRankings.time = new Map(Object.entries(metrics.allTimeGameStats)
    .sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)
    .slice(0, 10).map(([name,], i) => [name, i + 1]));

  previousRankings.days = new Map(Object.entries(metrics.allTimeGameStats)
    .sort((a, b) => b[1].days.size - a[1].days.size)
    .slice(0, 10).map(([name,], i) => [name, i + 1]));

  previousRankings.sessions = new Map(metrics.singleDaySessions
    .sort((a, b) => b.time - a.time)
    .slice(0, 10).map((s, i) => [`${s.game}-${s.date.getTime()}`, i + 1]));

  previousRankings.systems = new Map(Object.entries(metrics.allTimeSystemStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10).map(([name,], i) => [name, i + 1]));
}

function checkMilestones(metrics, ctx, index, oldRanks, yearlyGameLeader, yearlySystemLeader, yearlyTopSession) {
  const { entry, timeSec, game, system, year } = ctx;
  const gameWithSystem = `${game} (${system})`;
  const entryNum = index + 1;

  if (system && !metrics.firsts.system.has(system)) { 
    metrics.milestones.push({ date: entry.date, details: `First time playing on ${system}: ${game}` }); 
    metrics.firsts.system.add(system); 
  }
  if (entry.genre !== "N/A" && !metrics.firsts.genre.has(entry.genre)) { 
    metrics.milestones.push({ date: entry.date, details: `First ${entry.genre} game played: ${gameWithSystem}` }); 
    metrics.firsts.genre.add(entry.genre); 
  }
  if (entry.releaseYear !== "N/A" && !metrics.firsts.releaseYear.has(entry.releaseYear)) { 
    metrics.milestones.push({ date: entry.date, details: `First game played from ${entry.releaseYear}: ${gameWithSystem}` }); 
    metrics.firsts.releaseYear.add(entry.releaseYear); 
  }

  const prevTotalHours = Math.floor(metrics.totalTimeSec / 3600);
  metrics.totalTimeSec += timeSec;
  const newTotalHours = Math.floor(metrics.totalTimeSec / 3600);
  const milestoneHour = (Math.floor(prevTotalHours / 500) + 1) * 500;
  if (newTotalHours >= milestoneHour && prevTotalHours < milestoneHour) {
    metrics.milestones.push({ date: entry.date, details: `Reached ${milestoneHour} total hours played while playing ${gameWithSystem}.` });
  }

  const prevUniqueSize = metrics.uniqueGamesPlayed.size;
  metrics.uniqueGamesPlayed.add(game);
  if (metrics.uniqueGamesPlayed.size > prevUniqueSize && metrics.uniqueGamesPlayed.size % 50 === 0) {
    metrics.milestones.push({ date: entry.date, details: `Played the ${metrics.uniqueGamesPlayed.size}th unique game: ${gameWithSystem}.` });
  }

  if (entryNum > 0 && entryNum % 250 === 0) {
    metrics.milestones.push({ date: entry.date, details: `Logged the ${entryNum}th entry: ${gameWithSystem}.` });
  }

  if (system) {
    const prevSystemHours = Math.floor((metrics.systemTimeSec[system] || 0) / 3600);
    metrics.systemTimeSec[system] = (metrics.systemTimeSec[system] || 0) + timeSec;
    const newSystemHours = Math.floor(metrics.systemTimeSec[system] / 3600);
    const milestoneSystemHour = (Math.floor(prevSystemHours / 250) + 1) * 250;
    if (newSystemHours >= milestoneSystemHour && prevSystemHours < milestoneSystemHour) {
      metrics.milestones.push({ date: entry.date, details: `Reached ${milestoneSystemHour} hours played on ${system} while playing ${game}.` });
    }
  }

  const metaChecks = [
    { key: 'genre', name: 'Genre', target: metrics.genreUniqueGames },
    { key: 'developer', name: 'Developer', target: metrics.devUniqueGames },
    { key: 'publisher', name: 'Publisher', target: metrics.pubUniqueGames }
  ];
  metaChecks.forEach(check => {
    const val = entry[check.key];
    if (val && val !== "N/A") {
      if (!check.target[val]) check.target[val] = new Set();
      const prevSize = check.target[val].size;
      check.target[val].add(game);
      if (check.target[val].size > prevSize && check.target[val].size > 0 && check.target[val].size % 10 === 0) {
        let detStr = `Played the ${check.target[val].size}th unique game from ${check.name.toLowerCase()} ${val}`;
        if (check.key === 'genre') detStr = `Played the ${check.target[val].size}th unique ${val} game`;
        metrics.milestones.push({ date: entry.date, details: `${detStr}: ${gameWithSystem}.` });
      }
    }
  });

  const newTop10Time = Object.entries(metrics.allTimeGameStats).sort((a, b) => b[1].totalSeconds - a[1].totalSeconds).slice(0, 10);
  newTop10Time.forEach(([gameName, stats], i) => {
    const newRank = i + 1;
    const oldRank = oldRanks.time.get(gameName);
    if (!oldRank || newRank < oldRank) {
      const details = oldRank ? `jumped from #${oldRank} to #${newRank} in Most Played` : `entered the Top 10 Most Played at #${newRank}`;
      metrics.milestones.push({ date: entry.date, details: `${gameName} (${Array.from(stats.systems).join(', ')}) ${details} with ${secondsToTimeString(stats.totalSeconds)}.` });
    }
  });

  const newTop10Days = Object.entries(metrics.allTimeGameStats).sort((a, b) => b[1].days.size - a[1].days.size).slice(0, 10);
  newTop10Days.forEach(([gameName, stats], i) => {
    const newRank = i + 1;
    const oldRank = oldRanks.days.get(gameName);
    if (!oldRank || newRank < oldRank) {
      const details = oldRank ? `jumped from #${oldRank} to #${newRank} in Most Days Played` : `entered the Top 10 Most Days Played at #${newRank}`;
      metrics.milestones.push({ date: entry.date, details: `${gameName} (${Array.from(stats.systems).join(', ')}) ${details} with ${stats.days.size} days.` });
    }
  });

  const newTop10Systems = Object.entries(metrics.allTimeSystemStats).sort((a, b) => b[1] - a[1]).slice(0, 10);
  newTop10Systems.forEach(([systemName, time], i) => {
    const newRank = i + 1;
    const oldRank = oldRanks.systems.get(systemName);
    if (!oldRank || newRank < oldRank) {
      const details = oldRank ? `jumped from #${oldRank} to #${newRank} in Most Played Systems` : `entered the Top 10 Most Played Systems at #${newRank}`;
      metrics.milestones.push({ date: entry.date, details: `${systemName} ${details} with ${secondsToTimeString(time)}.` });
    }
  });

  const newTop10Sessions = metrics.singleDaySessions.sort((a, b) => b.time - a.time).slice(0, 10);
  newTop10Sessions.forEach((session, i) => {
    const newRank = i + 1;
    const sessionKey = `${session.game}-${session.date.getTime()}`;
    const oldRank = oldRanks.sessions.get(sessionKey);
    if (!oldRank) {
      metrics.milestones.push({ date: session.date, details: `A session of ${session.game} (${session.system}) entered the Top 10 Longest Single Sessions at #${newRank} with a time of ${secondsToTimeString(session.time)}.` });
    }
  });

  const oldYearlyLeaderGame = yearlyGameLeader[year] ? yearlyGameLeader[year].game : null;
  const newYearlyLeaderGame = Object.entries(metrics.yearlyGameStats[year]).reduce((leader, [gameName, stats]) => {
    return stats.totalSeconds > leader.time ? { game: gameName, time: stats.totalSeconds } : leader;
  }, { game: null, time: 0 });
  if (newYearlyLeaderGame.game && newYearlyLeaderGame.game !== oldYearlyLeaderGame) {
    metrics.milestones.push({ date: entry.date, details: `${newYearlyLeaderGame.game} (${system}) became the most played game of ${year} with ${secondsToTimeString(newYearlyLeaderGame.time)}.` });
    yearlyGameLeader[year] = newYearlyLeaderGame;
  }

  const oldYearlyLeaderSystem = yearlySystemLeader[year] ? yearlySystemLeader[year].system : null;
  const newYearlyLeaderSystem = Object.entries(metrics.yearlySystemStats[year]).reduce((leader, [systemName, time]) => {
    return time > leader.time ? { system: systemName, time: time } : leader;
  }, { system: null, time: 0 });
  if (newYearlyLeaderSystem.system && newYearlyLeaderSystem.system !== oldYearlyLeaderSystem) {
    metrics.milestones.push({ date: entry.date, details: `${newYearlyLeaderSystem.system} became the most played system of ${year} with ${secondsToTimeString(newYearlyLeaderSystem.time)}.` });
    yearlySystemLeader[year] = newYearlyLeaderSystem;
  }

  const currentTopSessionTime = yearlyTopSession[year] ? yearlyTopSession[year].time : 0;
  if (timeSec > currentTopSessionTime) {
    metrics.milestones.push({ date: entry.date, details: `A session of ${gameWithSystem} became the longest single session of ${year} with a time of ${secondsToTimeString(timeSec)}.` });
    yearlyTopSession[year] = { game: game, time: timeSec };
  }
}

function finalizeDerivedMetrics(metrics, allEntries, playthroughHistory) {
  const sysStreakStats = aggregateMetrics_SystemStreaks(allEntries);
  metrics.systemStreaks = sysStreakStats.systemStreaks;
  metrics.yearlySystemStreaks = sysStreakStats.yearlySystemStreaks;

  metrics.oneSittingCompletions = Object.values(playthroughHistory).filter(pt => 
    ["Completed", "M-Completed"].includes(pt.finalStatus) && 
    pt.finalPtLifetimeDays === 1
  ).sort((a, b) => timeStringToSeconds(b.finalPtLifetime) - timeStringToSeconds(a.finalPtLifetime));

  metrics.longestCompletionsByTime = [];
  metrics.longestCompletionsByDays = [];
  for (const ptTag in playthroughHistory) {
    const pt = playthroughHistory[ptTag];
    if (["Completed", "Postgame", "M-Completed"].includes(pt.finalStatus)) {
      metrics.longestCompletionsByTime.push(pt);
      const durationDays = Math.round((pt.lastDate - pt.startDate) / (1000 * 3600 * 24)) + 1;
      metrics.longestCompletionsByDays.push({ ...pt, durationDays });
    }
  }

  metrics.fastestCompletionsByTime = [...metrics.longestCompletionsByTime].sort((a, b) => 
    timeStringToSeconds(a.finalPtLifetime) - timeStringToSeconds(b.finalPtLifetime)
  );

  const completionCounts = {};
  for (const ptTag in playthroughHistory) {
    const pt = playthroughHistory[ptTag];
    const gameName = pt.gameName;
    if (!completionCounts[gameName]) {
      completionCounts[gameName] = {
        gameName: gameName, completions: 0, completionDates: [],
        allSystems: new Set(), firstStartDate: pt.startDate, lastUpdateDate: pt.lastDate
      };
    }
    const stats = completionCounts[gameName];
    if (pt.startDate < stats.firstStartDate) stats.firstStartDate = pt.startDate;
    if (pt.lastDate > stats.lastUpdateDate) stats.lastUpdateDate = pt.lastDate;
    stats.allSystems.add(pt.system);
    if (['Completed', 'M-Completed'].includes(pt.finalStatus)) {
      stats.completions++;
      stats.completionDates.push(pt.lastDate);
    }
  }
  metrics.completionStats = Object.values(completionCounts).filter(g => g.completions > 0);

  const sortedCompletions = Object.values(playthroughHistory)
    .filter(pt => ["Completed", "M-Completed"].includes(pt.finalStatus))
    .sort((a, b) => a.lastDate - b.lastDate);

  const completionPeriodStats = aggregateMetrics_CompletionPeriods(sortedCompletions);
  metrics.completionsByDay = completionPeriodStats.completionsByDay;
  metrics.completionsByMonth = completionPeriodStats.completionsByMonth;
  metrics.topCompletionWeeks = completionPeriodStats.topCompletionWeeks;

  const yearlyCompletionCounts = {};
  for (const pt of sortedCompletions) {
    const year = pt.lastDate.getUTCFullYear();
    const gameName = pt.gameName;
    if (!yearlyCompletionCounts[year]) yearlyCompletionCounts[year] = {};
    if (!yearlyCompletionCounts[year][gameName]) {
       yearlyCompletionCounts[year][gameName] = {
           gameName: gameName, completions: 0, completionDates: [],
           allSystems: new Set(), firstStartDate: pt.startDate, lastUpdateDate: pt.lastDate
       };
    }
    const stats = yearlyCompletionCounts[year][gameName];
    stats.completions++;
    stats.completionDates.push(pt.lastDate);
    stats.allSystems.add(pt.system);
    if (pt.startDate < stats.firstStartDate) stats.firstStartDate = pt.startDate;
    if (pt.lastDate > stats.lastUpdateDate) stats.lastUpdateDate = pt.lastDate;
  }
  metrics.yearlyCompletionStats = yearlyCompletionCounts;

  const yearlyCompletionDayStats = {};
  Object.values(metrics.completionsByDay).forEach(dayData => {
      const year = dayData.date.getUTCFullYear();
      if (!yearlyCompletionDayStats[year]) yearlyCompletionDayStats[year] = { maxCount: 0, days: [] };
      if (dayData.count > yearlyCompletionDayStats[year].maxCount) {
          yearlyCompletionDayStats[year].maxCount = dayData.count;
          yearlyCompletionDayStats[year].days = [dayData];
      } else if (dayData.count === yearlyCompletionDayStats[year].maxCount) {
          yearlyCompletionDayStats[year].days.push(dayData);
      }
  });
  metrics.yearlyCompletionDayData = Object.keys(yearlyCompletionDayStats)
      .sort((a, b) => b - a)
      .flatMap(yearStr => {
          const year = parseInt(yearStr);
          const { maxCount, days } = yearlyCompletionDayStats[year];
          if (maxCount === 1) return [{ year: year, maxCount: 1, data: null }];
          return days.map(dayData => ({ year: year, maxCount: maxCount, data: dayData }));
      });

  const streakStats = aggregateMetrics_StreakStats(allEntries);
  metrics.gamingStreaks = streakStats.gamingStreaks;
  metrics.yearlyGamingStreaks = aggregateMetrics_YearlyGamingStreaks(allEntries, metrics.gamingStreaks);
  metrics.breakStreaks = streakStats.breakStreaks;
  metrics.allSameGameStreaks = streakStats.allSameGameStreaks;
  metrics.gameHiatuses = streakStats.gameHiatuses;

  metrics.topMetaHiatuses = {};
  metrics.yearlyMetaHiatuses = {};
  const metaKeys = ['series', 'genre', 'developer', 'publisher', 'releaseYear', 'system'];
  
  metaKeys.forEach(key => {
      const data = streakStats.metaHiatuses[key] || [];
      metrics.topMetaHiatuses[key] = sliceWithTies(
          [...data].sort((a, b) => b.gapDays - a.gapDays), 
          25, 
          i => i.gapDays
      );
      metrics.yearlyMetaHiatuses[key] = getYearlyBests('event', data, 'gapDays', 'endDate');
  });

  const bingeStats = aggregateMetrics_BingePeriods(allEntries);
  metrics.monthlyGameBingeData = bingeStats.monthlyGameBingeData;
  metrics.busiestMonthData = bingeStats.busiestMonthData;
  metrics.allWeeklyBinges = bingeStats.allWeeklyBinges;
  metrics.bestMonthsByName = aggregateMetrics_BestMonthsByName(metrics.busiestMonthData, metrics.monthlyStats);
  metrics.topGamesByGenreData = aggregateMetrics_TopGamesByGenre(metrics.gameTimeByGenre, metrics.gamesByMetaInTimeframe, metrics.allTimeGameStats, metrics.yearlyGameStats);
  
  const varietyPeriodStats = aggregateMetrics_VarietyPeriods(allEntries);
  metrics.monthlyGameVariety = varietyPeriodStats.monthlyGameVariety;
  metrics.topWeeklyGameVariety = varietyPeriodStats.topWeeklyGameVariety;

  const overlapStats = aggregateMetrics_GameOverlap(metrics.dailyVariety);
  metrics.gameOverlapAllTime = overlapStats.allTime;
  metrics.gameOverlapByYear = overlapStats.byYear;

  metrics.playthroughAnalysis = aggregateMetrics_PlaythroughAnalysis(allEntries, playthroughHistory);
  metrics.abandonedPlaythroughs = aggregateMetrics_AbandonStats(playthroughHistory).abandonedPlaythroughs;
  
  metrics.marathonGames = Object.values(metrics.marathonCounts).map(g => ({ ...g, firstPlayed: metrics.allTimeGameStats[g.gameName]?.firstPlayedDate, lastPlayed: metrics.allTimeGameStats[g.gameName]?.lastPlayedDate, }));
  metrics.shortSessionGames = Object.values(metrics.shortSessionCounts).map(g => ({ ...g, firstPlayed: metrics.allTimeGameStats[g.gameName]?.firstPlayedDate, lastPlayed: metrics.allTimeGameStats[g.gameName]?.lastPlayedDate, }));

  metrics.genreAnalysis = aggregateMetrics_GenreAnalysis(playthroughHistory);
  metrics.releaseYearAnalysis = aggregateMetrics_ReleaseYearAnalysis(playthroughHistory);
  metrics.developerAnalysis = aggregateMetrics_DeveloperAnalysis(playthroughHistory);
  metrics.publisherAnalysis = aggregateMetrics_PublisherAnalysis(playthroughHistory);
  metrics.completionStreaks = aggregateMetrics_CompletionStreakStats(playthroughHistory).completionStreaks;

  const calendarStats = aggregateMetrics_CalendarStats(allEntries);
  metrics.calendarData = calendarStats.calendarData;
  metrics.possibleYears = calendarStats.possibleYears;

  const concentrationStats = aggregateMetrics_Concentration(allEntries, metrics.monthlyStats, metrics.yearlyGameStats);
  metrics.monthlyConcentration = concentrationStats.monthlyConcentration;
  metrics.yearlyConcentration = concentrationStats.yearlyConcentration;

  const completedGames = new Set();
  sortedCompletions.forEach(pt => {
    const prevSize = completedGames.size;
    completedGames.add(pt.gameName);
    if (completedGames.size > prevSize && completedGames.size > 0 && completedGames.size % 25 === 0) {
      metrics.milestones.push({ date: pt.lastDate, details: `Completed the ${completedGames.size}th unique game: ${pt.gameName} (${pt.system}).` });
    }
  });
  
  metrics.milestones.sort((a, b) => b.date - a.date);
}

function aggregateMetrics_StreakStats(allEntries) {
  const gamingStreaks = [], breakStreaks = [], allSameGameStreaks = [], gameHiatuses = [];
  const metaHiatuses = { series: [], genre: [], developer: [], publisher: [], releaseYear: [], system: [] };

  const uniqueDates = [...new Set(allEntries.map(e => e.date.getTime()))].map(t => new Date(t));
  uniqueDates.sort((a,b) => a - b);
  if (uniqueDates.length > 0) {
    let currentStreak = { start: uniqueDates[0], end: uniqueDates[0], length: 1 };
    for (let i = 1; i < uniqueDates.length; i++) {
      const dayDifference = Math.round((uniqueDates[i] - uniqueDates[i-1]) / 86400000);
      if (dayDifference === 1) {
        currentStreak.length++; currentStreak.end = uniqueDates[i];
      } else {
        gamingStreaks.push(currentStreak);
        if (dayDifference > 1) {
          const breakStart = new Date(uniqueDates[i-1]); breakStart.setDate(breakStart.getDate() + 1);
          const breakEnd = new Date(uniqueDates[i]); breakEnd.setDate(breakEnd.getDate() - 1);
          breakStreaks.push({ start: breakStart, end: breakEnd, length: dayDifference - 1 });
        }
        currentStreak = { start: uniqueDates[i], end: uniqueDates[i], length: 1 };
      }
    }
    gamingStreaks.push(currentStreak);
  }

  for (const streak of gamingStreaks) {
    const entriesInStreak = allEntries.filter(e => e.date >= streak.start && e.date <= streak.end);
    const gamesInStreak = new Set(entriesInStreak.map(e => e.game));
    const uniqueGamesCount = gamesInStreak.size;
    const timePerGame = entriesInStreak.reduce((acc, entry) => {
      const key = `${entry.game} (${entry.system})`;
      if (!acc[key]) acc[key] = 0;
      acc[key] += timeStringToSeconds(entry.time);
      return acc;
    }, {});
    const sortedGames = Object.entries(timePerGame).sort((a, b) => b[1] - a[1]);
    const top3GamesString = sortedGames.slice(0, 3)
    .map(([name, sec]) => `${name} [${secondsToTimeString(sec)}]`)
    .join(', ');
    streak.detailsString = `${uniqueGamesCount} Games / ${top3GamesString}`;
  }

  const entriesByGame = allEntries.reduce((acc, entry) => {
    if (!acc[entry.game]) acc[entry.game] = [];
    acc[entry.game].push({date: entry.date, system: entry.system, time: entry.time});
    return acc;
  }, {});

  for (const gameName in entriesByGame) {
    const gameEntries = entriesByGame[gameName].sort((a,b) => a.date - b.date);
    const uniqueGameDates = [...new Map(gameEntries.map(e => [e.date.getTime(), e])).values()];

    if (uniqueGameDates.length > 1) {
      let currentSameGameStreak = { game: gameName, start: uniqueGameDates[0].date, end: uniqueGameDates[0].date, length: 1, systems: new Set(), totalSeconds: 0 };
      for (let i = 1; i < uniqueGameDates.length; i++) {
        const prevEntry = uniqueGameDates[i - 1];
        const currentEntry = uniqueGameDates[i];
        const dayDiff = Math.round((currentEntry.date.getTime() - prevEntry.date.getTime()) / (1000 * 3600 * 24));

        if (dayDiff > 1) {
          const gapStart = new Date(prevEntry.date); gapStart.setDate(gapStart.getDate() + 1);
          const gapEnd = new Date(currentEntry.date); gapEnd.setDate(gapEnd.getDate() - 1);
          gameHiatuses.push({ game: gameName, prevSystem: prevEntry.system, currentSystem: currentEntry.system, gapDays: dayDiff - 1, startDate: gapStart, endDate: gapEnd });
        }

        if (dayDiff === 1) {
          currentSameGameStreak.length++;
          currentSameGameStreak.end = currentEntry.date;
        } else {
          if (currentSameGameStreak.length > 1) {
            const entriesInStreak = gameEntries.filter(e => e.date >= currentSameGameStreak.start && e.date <= currentSameGameStreak.end);
            currentSameGameStreak.totalSeconds = entriesInStreak.reduce((sum, entry) => sum + timeStringToSeconds(entry.time), 0);
            entriesInStreak.forEach(e => currentSameGameStreak.systems.add(e.system));
            allSameGameStreaks.push(currentSameGameStreak);
          }
          currentSameGameStreak = { game: gameName, start: currentEntry.date, end: currentEntry.date, length: 1, systems: new Set(), totalSeconds: 0 };
        }
      }
      if (currentSameGameStreak.length > 1) {
        const entriesInStreak = gameEntries.filter(e => e.date >= currentSameGameStreak.start && e.date <= currentSameGameStreak.end);
        currentSameGameStreak.totalSeconds = entriesInStreak.reduce((sum, entry) => sum + timeStringToSeconds(entry.time), 0);
        entriesInStreak.forEach(e => currentSameGameStreak.systems.add(e.system));
        allSameGameStreaks.push(currentSameGameStreak);
      }
    }
  }

  const metaTypes = ['series', 'genre', 'developer', 'publisher', 'releaseYear', 'system'];
  const lastSeen = {}; 

  for (const entry of allEntries) {
      const entryDate = entry.date;
      
      metaTypes.forEach(type => {
          const val = entry[type];
          if (val && val !== 'N/A' && val !== 'ZZNONE') {
              const key = `${type}_${val}`;
              
              if (lastSeen[key]) {
                  const prev = lastSeen[key];
                  const dayDiff = Math.round((entryDate.getTime() - prev.date.getTime()) / (1000 * 3600 * 24));
                  
                  if (dayDiff > 1) {
                      const gapStart = new Date(prev.date); gapStart.setDate(gapStart.getDate() + 1);
                      const gapEnd = new Date(entryDate); gapEnd.setDate(gapEnd.getDate() - 1);
                      
                      metaHiatuses[type].push({
                          name: val,
                          gapDays: dayDiff - 1,
                          startDate: gapStart,
                          endDate: gapEnd,
                          prevGame: prev.game,
                          currentGame: entry.game,
                          prevSystem: prev.system,
                          currentSystem: entry.system,
                          details: `${val} [${prev.game} -> ${entry.game}]`
                      });
                  }
              }
              lastSeen[key] = { date: entryDate, game: entry.game, system: entry.system };
          }
      });
  }

  return { gamingStreaks, breakStreaks, allSameGameStreaks, gameHiatuses, metaHiatuses };
}

function aggregateMetrics_YearlyGamingStreaks(allEntries, gamingStreaks) {
  const yearlyBests = {};
  const yearsSeen = new Set();
  
  gamingStreaks.forEach(s => {
    if (s.start) yearsSeen.add(s.start.getFullYear());
    if (s.end) yearsSeen.add(s.end.getFullYear());
  });
  yearsSeen.add(new Date().getFullYear());
  
  const sortedYears = [...yearsSeen].sort((a, b) => b - a);

  for (const year of sortedYears) {
    let bestStreaksForYear = [];
    let maxClippedLength = 0;
    
    const yearStartTs = new Date(Date.UTC(year, 0, 1, 0, 0, 0)).getTime();
    const yearEndTs = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0)).getTime();

    for (const streak of gamingStreaks) {
      const streakStartTs = streak.start.getTime();
      const streakEndTs = streak.end.getTime();

      const overlapStartTs = Math.max(streakStartTs, yearStartTs);
      const overlapEndTs = Math.min(streakEndTs, yearEndTs - 1); 

      if (overlapStartTs <= overlapEndTs) {
        const clippedLength = Math.round((overlapEndTs - overlapStartTs) / 86400000) + 1;
        
        if (clippedLength >= maxClippedLength) {
          
          const entriesInWindow = allEntries.filter(e => {
            const t = e.date.getTime();
            return t >= overlapStartTs && t <= overlapEndTs;
          });
          
          const uniqueGames = new Set(entriesInWindow.map(e => e.game));
          
          const timePerGame = entriesInWindow.reduce((acc, entry) => {
             const key = `${entry.game} (${entry.system})`;
             acc[key] = (acc[key] || 0) + timeStringToSeconds(entry.time);
             return acc;
          }, {});
          
          const sortedGames = Object.entries(timePerGame).sort((a, b) => b[1] - a[1]);
          
          const top3 = sortedGames
            .slice(0, 3)
            .map(([name, sec]) => `${name} [${secondsToTimeString(sec)}]`)
            .join(', ');
            
          const newDetailsString = `${uniqueGames.size} Games / ${top3}`;

          const newEntry = {
            ...streak,
            clippedStart: new Date(overlapStartTs),
            clippedEnd: new Date(overlapEndTs),
            clippedLength: clippedLength,
            detailsString: newDetailsString
          };

          if (clippedLength > maxClippedLength) {
            maxClippedLength = clippedLength;
            bestStreaksForYear = [newEntry];
          } else if (clippedLength === maxClippedLength) {
            bestStreaksForYear.push(newEntry);
          }
        }
      }
    }
    
    if (bestStreaksForYear.length > 0) {
      yearlyBests[year] = bestStreaksForYear;
    }
  }

  return Object.keys(yearlyBests)
    .sort((a, b) => b - a)
    .flatMap(year => 
       yearlyBests[year].map(item => ({ year: parseInt(year), data: item, isTie: yearlyBests[year].length > 1 }))
    );
}

function aggregateMetrics_BingePeriods(allEntries) {
  const monthlyGameBingeData = {}, busiestMonthData = {};

  for (const entry of allEntries) {
    const year = entry.date.getFullYear(), monthKey = `${year}-${(entry.date.getMonth() + 1).toString().padStart(2, '0')}`;
    const timeSec = timeStringToSeconds(entry.time);
    const bingeKey = `${monthKey}-${entry.game}`;

    if (!monthlyGameBingeData[bingeKey]) {
      monthlyGameBingeData[bingeKey] = { game: entry.game, monthKey, totalSeconds: 0, minDate: entry.date, maxDate: entry.date, systems: new Set() };
    }
    monthlyGameBingeData[bingeKey].totalSeconds += timeSec;
    monthlyGameBingeData[bingeKey].systems.add(entry.system);
    if (entry.date > monthlyGameBingeData[bingeKey].maxDate) monthlyGameBingeData[bingeKey].maxDate = entry.date;

    if (!busiestMonthData[monthKey]) {
      busiestMonthData[monthKey] = { totalSeconds: 0, minDate: entry.date, maxDate: entry.date };
    }
    busiestMonthData[monthKey].totalSeconds += timeSec;
    if (entry.date > busiestMonthData[monthKey].maxDate) busiestMonthData[monthKey].maxDate = entry.date;
  }

  const entriesByGameForBinge = allEntries.reduce((acc, entry) => {
    if (!acc[entry.game]) acc[entry.game] = [];
    acc[entry.game].push(entry);
    return acc;
  }, {});

  let allWeeklyBinges = [];
  for(const game in entriesByGameForBinge) {
    allWeeklyBinges.push(...findTopNonOverlappingWeeks(entriesByGameForBinge[game], true));
  }

  return { monthlyGameBingeData, busiestMonthData, allWeeklyBinges };
}

function aggregateMetrics_SystemStreaks(allEntries) {
  const systemStreaks = [];
  const yearlySystemStreaks = {}; 
  
  if (allEntries.length === 0) return { systemStreaks, yearlySystemStreaks };

  const checkYearlyBests = (streakObj) => {
    for (const [year, count] of Object.entries(streakObj.yearlyCounts)) {
        const y = parseInt(year);
        if (!yearlySystemStreaks[y]) yearlySystemStreaks[y] = [];
        
        const currentMax = yearlySystemStreaks[y].length > 0 ? yearlySystemStreaks[y][0].value : 0;
        
        if (count > currentMax) {
            yearlySystemStreaks[y] = [{
                system: streakObj.system,
                value: count,
                minDate: streakObj.start, 
                maxDate: streakObj.end
            }];
        } else if (count === currentMax) {
            yearlySystemStreaks[y].push({
                system: streakObj.system,
                value: count,
                minDate: streakObj.start,
                maxDate: streakObj.end
            });
        }
    }
  };

  let currentStreak = { 
    system: allEntries[0].system, 
    start: allEntries[0].date, 
    end: allEntries[0].date, 
    length: 1,
    yearlyCounts: { [allEntries[0].date.getFullYear()]: 1 }
  };

  for (let i = 1; i < allEntries.length; i++) {
    const entry = allEntries[i];
    const year = entry.date.getFullYear();
    
    if (entry.system === currentStreak.system) {
      currentStreak.length++;
      currentStreak.end = entry.date;
      currentStreak.yearlyCounts[year] = (currentStreak.yearlyCounts[year] || 0) + 1;
    } else {
      systemStreaks.push(currentStreak);
      checkYearlyBests(currentStreak); 
      
      currentStreak = { 
        system: entry.system, 
        start: entry.date, 
        end: entry.date, 
        length: 1,
        yearlyCounts: { [year]: 1 }
      };
    }
  }
  systemStreaks.push(currentStreak);
  checkYearlyBests(currentStreak);

  return { systemStreaks, yearlySystemStreaks };
}

function aggregateMetrics_VarietyPeriods(allEntries) {
  const monthlyGameVariety = {};

  for (const entry of allEntries) {
    const monthKey = `${entry.date.getFullYear()}-${(entry.date.getMonth() + 1).toString().padStart(2, '0')}`;

    if (!monthlyGameVariety[monthKey]) {
      monthlyGameVariety[monthKey] = {
        monthKey: monthKey,
        games: new Set(),
        minDate: entry.date,
        maxDate: entry.date,
        gameTimes: {} 
      };
    }
    const monthData = monthlyGameVariety[monthKey];
    monthData.games.add(entry.game);
    if (entry.date > monthData.maxDate) monthData.maxDate = entry.date;
    if (entry.date < monthData.minDate) monthData.minDate = entry.date;

    const timeSec = timeStringToSeconds(entry.time);
    const gameKey = `${entry.game} (${entry.system})`;
    monthData.gameTimes[gameKey] = (monthData.gameTimes[gameKey] || 0) + timeSec;
  }

  const findTopNonOverlappingWeeksByVariety = (sourceEntries) => {
    if (!sourceEntries || sourceEntries.length === 0) return [];
    const allPossibleWeeks = [], queue = [];

    let currentWindow = {
      games: new Map(), 
      gameTimes: new Map() 
    };

    for (const entry of sourceEntries) {
      const entryTimeSec = timeStringToSeconds(entry.time);
      const gameKey = entry.game;
      const gameSystemKey = `${entry.game} (${entry.system})`;

      queue.push(entry);

      currentWindow.games.set(gameKey, (currentWindow.games.get(gameKey) || 0) + 1);
      currentWindow.gameTimes.set(gameSystemKey, (currentWindow.gameTimes.get(gameSystemKey) || 0) + entryTimeSec);

      while ((entry.date.getTime() - queue[0].date.getTime()) / (1000 * 3600 * 24) > 6) {
        const removedEntry = queue.shift();
        const removedGameKey = removedEntry.game;
        const removedGameSystemKey = `${removedEntry.game} (${removedEntry.system})`;

        const gameEntryCount = currentWindow.games.get(removedGameKey);
        if (gameEntryCount === 1) {
          currentWindow.games.delete(removedGameKey);
        } else {
          currentWindow.games.set(removedGameKey, gameEntryCount - 1);
        }

        const gameTime = currentWindow.gameTimes.get(removedGameSystemKey);
        const removedTimeSec = timeStringToSeconds(removedEntry.time);
        if (!gameTime || gameTime <= (removedTimeSec + 0.001)) {
          currentWindow.gameTimes.delete(removedGameSystemKey);
        } else {
          currentWindow.gameTimes.set(removedGameSystemKey, gameTime - removedTimeSec);
        }
      }

      allPossibleWeeks.push({
        count: currentWindow.games.size,
        startDate: queue[0].date,
        endDate: entry.date,
        entries: [...queue], 
        gameTimes: new Map(currentWindow.gameTimes) 
      });
    }

    if (queue.length > 0) {
      const lastEntryDate = sourceEntries[sourceEntries.length - 1].date;
      for (let i = 1; i <= 6; i++) {
        const currentDate = new Date(lastEntryDate);
        currentDate.setDate(lastEntryDate.getDate() + i);

        while (queue.length > 0 && (currentDate.getTime() - queue[0].date.getTime()) / (1000 * 3600 * 24) > 6) {
          const removedEntry = queue.shift();
          const removedGameKey = removedEntry.game;
          const removedGameSystemKey = `${removedEntry.game} (${removedEntry.system})`;

          const gameEntryCount = currentWindow.games.get(removedGameKey);
          if (gameEntryCount === 1) {
            currentWindow.games.delete(removedGameKey);
          } else {
            currentWindow.games.set(removedGameKey, gameEntryCount - 1);
          }

          const gameTime = currentWindow.gameTimes.get(removedGameSystemKey);
          const removedTimeSec = timeStringToSeconds(removedEntry.time);
          if (!gameTime || gameTime <= (removedTimeSec + 0.001)) {
            currentWindow.gameTimes.delete(removedGameSystemKey);
          } else {
            currentWindow.gameTimes.set(removedGameSystemKey, gameTime - removedTimeSec);
          }
        }

        if (queue.length > 0) {
          allPossibleWeeks.push({
            count: currentWindow.games.size,
            startDate: queue[0].date,
            endDate: queue[queue.length-1].date,
            entries: [...queue],
            gameTimes: new Map(currentWindow.gameTimes)
          });
        }
      }
    }

    allPossibleWeeks.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.endDate.getTime() - b.endDate.getTime();
    });

    const topWeeks = [];
    let availableWeeks = allPossibleWeeks;

    while(availableWeeks.length > 0) {
      const bestWeek = availableWeeks[0];

      const sortedGames = [...bestWeek.gameTimes.entries()]
      .sort((a, b) => b[1] - a[1]) 
      .slice(0, 3);

      const gamesString = sortedGames
      .map(([name, sec]) => `${name} [${secondsToTimeString(sec)}]`)
      .join(', ');

      topWeeks.push({ ...bestWeek, gamesPlayed: gamesString });

      const usedDatesInBestWeek = new Set(bestWeek.entries.map(e => e.date.getTime()));
      availableWeeks = availableWeeks.filter(candidate => !candidate.entries.some(entry => usedDatesInBestWeek.has(entry.date.getTime())));
    }
    return topWeeks;
  };

  const topWeeklyGameVariety = findTopNonOverlappingWeeksByVariety(allEntries);

  return { monthlyGameVariety, topWeeklyGameVariety };
}

function aggregateMetrics_AbandonStats(playthroughHistory) {
  const abandonedPlaythroughs = [];
  for (const ptTag in playthroughHistory) {
    const pt = playthroughHistory[ptTag];
    if (pt.finalStatus === "Abandoned") {
      abandonedPlaythroughs.push({
        ...pt,
        totalSeconds: timeStringToSeconds(pt.finalPtLifetime)
      });
    }
  }
  return { abandonedPlaythroughs };
}

function aggregateMetrics_PlaythroughAnalysis(allEntries, playthroughHistory) {
  const analysisData = {};

  if (allEntries.length === 0) {
    return {};
  }

  const playthroughActiveDays = {};
  for (const entry of allEntries) {
    const ptTag = entry.ptTag;
    if (!playthroughActiveDays[ptTag]) {
      playthroughActiveDays[ptTag] = new Set();
    }
    playthroughActiveDays[ptTag].add(entry.date.toISOString().split('T')[0]);
  }

  const yearlyData = {};
  for (const entry of allEntries) {
    const year = entry.date.getFullYear();
    const ptTag = entry.ptTag;
    const currentStatus = entry.status;

    if (!yearlyData[year]) {
      yearlyData[year] = { activePTs: new Set(), lastStatus: {} };
    }
    yearlyData[year].activePTs.add(ptTag);

    const existingStatus = yearlyData[year].lastStatus[ptTag];
    if (!(existingStatus === 'Completed' && currentStatus === 'Postgame')) {
      yearlyData[year].lastStatus[ptTag] = currentStatus;
    }
  }

  const firstYear = allEntries[0].date.getFullYear();
  const currentYear = new Date().getFullYear();
  const timeframes = ['All-Time'];
  for (let y = currentYear; y >= firstYear; y--) {
    timeframes.push(y.toString());
  }

  const processStatsForStatus = (stats, status) => {
    switch (status) {
      case 'M-Completed': 
      case 'Completed': stats.completed++; break;
      case 'Postgame': stats.postgame++; break;
      case 'Abandoned': stats.abandoned++; break;
      case 'Active': stats.active++; break;
      case 'Multiplayer': stats.multiplayer++; break;
      case 'Non-Completable': stats.nonCompletable++; break;
    }
  };

  timeframes.forEach(timeframe => {
    const stats = {
      totalPlaythroughs: 0, completed: 0, postgame: 0, abandoned: 0, active: 0,
      multiplayer: 0, nonCompletable: 0, completionTimes: [], completionDays: [],
    };

    if (timeframe === 'All-Time') {
      stats.totalPlaythroughs = Object.keys(playthroughHistory).length;
      for (const ptTag in playthroughHistory) {
        const pt = playthroughHistory[ptTag];
        processStatsForStatus(stats, pt.finalStatus);
        if (["Completed", "Postgame", "M-Completed"].includes(pt.finalStatus)) {
          stats.completionTimes.push(timeStringToSeconds(pt.finalPtLifetime));
          stats.completionDays.push(playthroughActiveDays[ptTag] ? playthroughActiveDays[ptTag].size : 0);
        }
      }
    } else {
      const year = parseInt(timeframe);
      const yearData = yearlyData[year];
      if (!yearData) return;

      stats.totalPlaythroughs = yearData.activePTs.size;
      yearData.activePTs.forEach(ptTag => {
        const ptHistory = playthroughHistory[ptTag];
        if (!ptHistory) return;
        const statusToUse = (year === currentYear) ? ptHistory.finalStatus : yearData.lastStatus[ptTag];
        processStatsForStatus(stats, statusToUse);
        if (["Completed", "Postgame", "M-Completed"].includes(ptHistory.finalStatus) && ptHistory.lastDate.getFullYear() === year) {
          stats.completionTimes.push(timeStringToSeconds(ptHistory.finalPtLifetime));
          stats.completionDays.push(playthroughActiveDays[ptTag] ? playthroughActiveDays[ptTag].size : 0);
        }
      });
    }

    const totalCompletions = stats.completed + stats.postgame;
    const totalDecided = totalCompletions + stats.abandoned;
    stats.completionRate = totalDecided > 0 ? (totalCompletions / totalDecided) : 0;
    stats.avgCompletionTimeSeconds = stats.completionTimes.length > 0 ? stats.completionTimes.reduce((a, b) => a + b, 0) / stats.completionTimes.length : 0;
    stats.avgCompletionDays = stats.completionDays.length > 0 ? stats.completionDays.reduce((a, b) => a + b, 0) / stats.completionDays.length : 0;
    analysisData[timeframe] = stats;
  });

  return analysisData;
}

function aggregateMetrics_CalendarStats(allEntries) {
  if (allEntries.length === 0) {
    return { calendarData: {}, possibleYears: {} };
  }
  const calendarData = {};
  const possibleYears = {};

  for (let m = 0; m < 12; m++) {
    calendarData[m] = {};
    possibleYears[m] = {};
    for (let d = 1; d <= 31; d++) {
      calendarData[m][d] = { yearsPlayed: new Set(), totalSeconds: 0 };
      possibleYears[m][d] = 0;
    }
  }

  for (const entry of allEntries) {
    const month = entry.date.getMonth();
    const day = entry.date.getDate();
    const year = entry.date.getFullYear();
    calendarData[month][day].yearsPlayed.add(year);
    calendarData[month][day].totalSeconds += timeStringToSeconds(entry.time);
  }

  const firstLogDate = new Date(Date.UTC(2015, 0, 1, 12, 0, 0));
  const today_local = new Date();
  const today = new Date(Date.UTC(today_local.getFullYear(), today_local.getMonth(), today_local.getDate(), 12, 0, 0));

  const startYear = firstLogDate.getUTCFullYear();
  const endYear = today.getUTCFullYear();

  for (let y = startYear; y <= endYear; y++) {
    for (let m = 0; m < 12; m++) {
      const daysInMonth = getDaysInMonth(y, m + 1);
      for (let d = 1; d <= daysInMonth; d++) {
        const currentDate = new Date(Date.UTC(y, m, d, 12, 0, 0));
        if (currentDate >= firstLogDate && currentDate <= today) {
          possibleYears[m][d]++;
        }
      }
    }
  }
  return { calendarData, possibleYears };
}

function aggregateMetrics_GenreAnalysis(playthroughHistory) {
  const data = {};
  for (const ptTag in playthroughHistory) {
    const pt = playthroughHistory[ptTag];
    const key = pt.genre || "N/A";
    if (!data[key]) {
      data[key] = {
        genre: key, totalPlaythroughs: 0, completed: 0, postgame: 0, abandoned: 0, active: 0,
        multiplayer: 0, nonCompletable: 0, completionTimes: [], completionDays: [],
      };
    }
    const stats = data[key];
    stats.totalPlaythroughs++;
    switch (pt.finalStatus) {
      case 'M-Completed':
      case 'Completed': stats.completed++; break;
      case 'Postgame': stats.postgame++; break;
      case 'Abandoned': stats.abandoned++; break;
      case 'Active': stats.active++; break;
      case 'Multiplayer': stats.multiplayer++; break;
      case 'Non-Completable': stats.nonCompletable++; break;
    }
    if (["Completed", "Postgame", "M-Completed"].includes(pt.finalStatus)) {
      stats.completionTimes.push(timeStringToSeconds(pt.finalPtLifetime));
      stats.completionDays.push(pt.finalPtLifetimeDays);
    }
  }
  for (const key in data) {
    const stats = data[key];
    const totalCompletions = stats.completed + stats.postgame;
    const totalDecided = totalCompletions + stats.abandoned;
    stats.completionRate = totalDecided > 0 ? (totalCompletions / totalDecided) : 0;
    stats.avgCompletionTimeSeconds = stats.completionTimes.length > 0 ? stats.completionTimes.reduce((a, b) => a + b, 0) / stats.completionTimes.length : 0;
    stats.avgCompletionDays = stats.completionDays.length > 0 ? stats.completionDays.reduce((a, b) => a + b, 0) / stats.completionDays.length : 0;
  }
  return data;
}

function aggregateMetrics_ReleaseYearAnalysis(playthroughHistory) {
  const data = {};
  for (const ptTag in playthroughHistory) {
    const pt = playthroughHistory[ptTag];
    const key = pt.releaseYear || "N/A";
    if (!data[key]) {
      data[key] = {
        releaseYear: key, 
        totalPlaythroughs: 0, completed: 0, postgame: 0, abandoned: 0, active: 0,
        multiplayer: 0, nonCompletable: 0, completionTimes: [], completionDays: [],
      };
    }
    const stats = data[key];
    stats.totalPlaythroughs++;
    switch (pt.finalStatus) {
      case 'M-Completed':
      case 'Completed': stats.completed++; break;
      case 'Postgame': stats.postgame++; break;
      case 'Abandoned': stats.abandoned++; break;
      case 'Active': stats.active++; break;
      case 'Multiplayer': stats.multiplayer++; break;
      case 'Non-Completable': stats.nonCompletable++; break;
    }
    if (["Completed", "Postgame", "M-Completed"].includes(pt.finalStatus)) {
      stats.completionTimes.push(timeStringToSeconds(pt.finalPtLifetime));
      stats.completionDays.push(pt.finalPtLifetimeDays);
    }
  }
  for (const key in data) {
    const stats = data[key];
    const totalCompletions = stats.completed + stats.postgame;
    const totalDecided = totalCompletions + stats.abandoned;
    stats.completionRate = totalDecided > 0 ? (totalCompletions / totalDecided) : 0;
    stats.avgCompletionTimeSeconds = stats.completionTimes.length > 0 ? stats.completionTimes.reduce((a, b) => a + b, 0) / stats.completionTimes.length : 0;
    stats.avgCompletionDays = stats.completionDays.length > 0 ? stats.completionDays.reduce((a, b) => a + b, 0) / stats.completionDays.length : 0;
  }
  return data;
}

function aggregateMetrics_DeveloperAnalysis(playthroughHistory) {
  const data = {};
  for (const ptTag in playthroughHistory) {
    const pt = playthroughHistory[ptTag];
    const key = pt.developer || "N/A";
    if (!data[key]) {
      data[key] = {
        developer: key, totalPlaythroughs: 0, completed: 0, postgame: 0, abandoned: 0, active: 0,
        multiplayer: 0, nonCompletable: 0, completionTimes: [], completionDays: [],
      };
    }
    const stats = data[key];
    stats.totalPlaythroughs++;
    switch (pt.finalStatus) {
      case 'M-Completed':
      case 'Completed': stats.completed++; break;
      case 'Postgame': stats.postgame++; break;
      case 'Abandoned': stats.abandoned++; break;
      case 'Active': stats.active++; break;
      case 'Multiplayer': stats.multiplayer++; break;
      case 'Non-Completable': stats.nonCompletable++; break;
    }
    if (["Completed", "Postgame", "M-Completed"].includes(pt.finalStatus)) {
      stats.completionTimes.push(timeStringToSeconds(pt.finalPtLifetime));
      stats.completionDays.push(pt.finalPtLifetimeDays);
    }
  }
  for (const key in data) {
    const stats = data[key];
    const totalCompletions = stats.completed + stats.postgame;
    const totalDecided = totalCompletions + stats.abandoned;
    stats.completionRate = totalDecided > 0 ? (totalCompletions / totalDecided) : 0;
    stats.avgCompletionTimeSeconds = stats.completionTimes.length > 0 ? stats.completionTimes.reduce((a, b) => a + b, 0) / stats.completionTimes.length : 0;
    stats.avgCompletionDays = stats.completionDays.length > 0 ? stats.completionDays.reduce((a, b) => a + b, 0) / stats.completionDays.length : 0;
  }
  return data;
}

function aggregateMetrics_PublisherAnalysis(playthroughHistory) {
  const data = {};
  for (const ptTag in playthroughHistory) {
    const pt = playthroughHistory[ptTag];
    const key = pt.publisher || "N/A";
    if (!data[key]) {
      data[key] = {
        publisher: key, totalPlaythroughs: 0, completed: 0, postgame: 0, abandoned: 0, active: 0,
        multiplayer: 0, nonCompletable: 0, completionTimes: [], completionDays: [],
      };
    }
    const stats = data[key];
    stats.totalPlaythroughs++;
    switch (pt.finalStatus) {
      case 'M-Completed':
      case 'Completed': stats.completed++; break;
      case 'Postgame': stats.postgame++; break;
      case 'Abandoned': stats.abandoned++; break;
      case 'Active': stats.active++; break;
      case 'Multiplayer': stats.multiplayer++; break;
      case 'Non-Completable': stats.nonCompletable++; break;
    }
    if (["Completed", "Postgame", "M-Completed"].includes(pt.finalStatus)) {
      stats.completionTimes.push(timeStringToSeconds(pt.finalPtLifetime));
      stats.completionDays.push(pt.finalPtLifetimeDays);
    }
  }
  for (const key in data) {
    const stats = data[key];
    const totalCompletions = stats.completed + stats.postgame;
    const totalDecided = totalCompletions + stats.abandoned;
    stats.completionRate = totalDecided > 0 ? (totalCompletions / totalDecided) : 0;
    stats.avgCompletionTimeSeconds = stats.completionTimes.length > 0 ? stats.completionTimes.reduce((a, b) => a + b, 0) / stats.completionTimes.length : 0;
    stats.avgCompletionDays = stats.completionDays.length > 0 ? stats.completionDays.reduce((a, b) => a + b, 0) / stats.completionDays.length : 0;
  }
  return data;
}

function aggregateMetrics_CompletionStreakStats(playthroughHistory) {
  const decidedPlaythroughs = Object.values(playthroughHistory)
  .filter(pt => ["Completed", "M-Completed", "Postgame", "Abandoned"].includes(pt.finalStatus))
  .sort((a, b) => a.lastDate - b.lastDate);

  const completionStreaks = [];
  let currentStreak = { length: 0, games: [], gameDates: [], startDate: null, endDate: null, brokenBy: null };

  for (const pt of decidedPlaythroughs) {
    if (pt.finalStatus === "Completed" || pt.finalStatus === "M-Completed" || pt.finalStatus === "Postgame") {
      if (currentStreak.length === 0) {
        currentStreak.startDate = pt.lastDate;
      }
      currentStreak.length++;
      currentStreak.games.push(`${pt.gameName} (${pt.system})`);
      currentStreak.gameDates.push(pt.lastDate); 
      currentStreak.endDate = pt.lastDate;
    } else if (pt.finalStatus === "Abandoned") {
      if (currentStreak.length > 0) {
        currentStreak.brokenBy = `${pt.gameName} (${pt.system})`;
        completionStreaks.push(currentStreak);
      }
      currentStreak = { length: 0, games: [], gameDates: [], startDate: null, endDate: null, brokenBy: null };
    }
  }
  if (currentStreak.length > 0) {
    completionStreaks.push(currentStreak);
  }
  return { completionStreaks };
}

function aggregateMetrics_GameOverlap(dailyVariety) {
  const allTimeAgg = {};
  const byYearAgg = {};

  for (const dateStr in dailyVariety) {
    const gamesSet = dailyVariety[dateStr];
    if (gamesSet.size < 2) continue; 

    const year = dateStr.substring(0, 4); 
    if (!byYearAgg[year]) byYearAgg[year] = {};
    const dateObj = new Date(dateStr + 'T12:00:00Z');

    const gamesArray = [...gamesSet].sort();

    for (let i = 0; i < gamesArray.length; i++) {
      for (let j = i + 1; j < gamesArray.length; j++) {
        const pairKey = `${gamesArray[i]} / ${gamesArray[j]}`;

        if (!allTimeAgg[pairKey]) {
          allTimeAgg[pairKey] = {
            pair: pairKey,
            count: 0,
            firstDate: dateObj,
            lastDate: dateObj
          };
        }
        allTimeAgg[pairKey].count++;
        allTimeAgg[pairKey].lastDate = dateObj;

        if (!byYearAgg[year][pairKey]) {
          byYearAgg[year][pairKey] = {
            count: 0, 
            minDate: dateObj, 
            maxDate: dateObj, 
            systems: new Set(), 
            days: new Set()     
          };
        }
        byYearAgg[year][pairKey].count++;
        byYearAgg[year][pairKey].maxDate = dateObj;
      }
    }
  }
  const allTimeArray = Object.values(allTimeAgg);

  return { allTime: allTimeArray, byYear: byYearAgg };
}

function aggregateMetrics_CompletionPeriods(sortedCompletions) {
  const completionsByDay = {};
  const completionsByMonth = {};

  for (const pt of sortedCompletions) {
    const completionDate = pt.lastDate;
    const gameDetail = { name: pt.gameName, system: pt.system, date: completionDate };

    const dateKey = completionDate.toISOString().split('T')[0];
    if (!completionsByDay[dateKey]) {
      completionsByDay[dateKey] = { date: completionDate, count: 0, games: [] };
    }
    completionsByDay[dateKey].count++;
    completionsByDay[dateKey].games.push(gameDetail);

    const monthKey = `${completionDate.getFullYear()}-${(completionDate.getMonth() + 1).toString().padStart(2, '0')}`;
    if (!completionsByMonth[monthKey]) {
      completionsByMonth[monthKey] = { monthKey: monthKey, count: 0, games: [], minDate: completionDate, maxDate: completionDate };
    }
    completionsByMonth[monthKey].count++;
    completionsByMonth[monthKey].games.push(gameDetail);
    if (completionDate > completionsByMonth[monthKey].maxDate) {
      completionsByMonth[monthKey].maxDate = completionDate;
    }
  }

  const findTopNonOverlappingWeeksByCount = (sourceEntries) => {
    if (!sourceEntries || sourceEntries.length === 0) return [];
    const allPossibleWeeks = [], queue = [];
    let currentSum = 0; 

    for (const entry of sourceEntries) {
      queue.push(entry);
      currentSum += 1; 

      while ((entry.lastDate.getTime() - queue[0].lastDate.getTime()) / (1000 * 3600 * 24) > 6) {
        queue.shift();
        currentSum -= 1;
      }
      allPossibleWeeks.push({ count: currentSum, startDate: queue[0].lastDate, endDate: entry.lastDate, entries: [...queue] });
    }

    if (queue.length > 0) {
      const lastEntryDate = sourceEntries[sourceEntries.length - 1].lastDate;
      for (let i = 1; i <= 6; i++) {
        const currentDate = new Date(lastEntryDate);
        currentDate.setDate(lastEntryDate.getDate() + i);

        while (queue.length > 0 && (currentDate.getTime() - queue[0].lastDate.getTime()) / (1000 * 3600 * 24) > 6) {
          queue.shift();
          currentSum -= 1;
        }

        if (queue.length > 0) {
          allPossibleWeeks.push({
            count: currentSum,
            startDate: queue[0].lastDate,
            endDate: queue[queue.length-1].lastDate,
            entries: [...queue]
          });
        }
      }
    }

    allPossibleWeeks.sort((a, b) => b.count - a.count);
    const topWeeks = [];
    let availableWeeks = allPossibleWeeks;

    while(availableWeeks.length > 0) {
      const bestWeek = availableWeeks[0];

      const gamesString = bestWeek.entries
      .map(e => `${e.gameName} (${e.system}) [${formatDate(e.lastDate, true)}]`)
      .join(', ');

      topWeeks.push({ ...bestWeek, gamesPlayed: gamesString });

      const usedDatesInBestWeek = new Set(bestWeek.entries.map(e => e.lastDate.getTime()));
      availableWeeks = availableWeeks.filter(candidate => !candidate.entries.some(entry => usedDatesInBestWeek.has(entry.lastDate.getTime())));
    }
    return topWeeks;
  };

  const topCompletionWeeks = findTopNonOverlappingWeeksByCount(sortedCompletions);

  return { completionsByDay, completionsByMonth, topCompletionWeeks };
}

function aggregateMetrics_Concentration(allEntries, monthlyStats, yearlyGameStats) {
  const monthlyConcentration = [];
  const yearlyConcentration = [];
  
  const MONTH_THRESHOLD = 18000; 
  for (const [monthKey, gamesObj] of Object.entries(monthlyStats)) {
    let totalSeconds = 0;
    const gameArr = [];
    for (const [game, stats] of Object.entries(gamesObj)) {
      totalSeconds += stats.totalSeconds;
      gameArr.push({ game, ...stats });
    }
    if (totalSeconds > MONTH_THRESHOLD) {
      for (const gameData of gameArr) {
        monthlyConcentration.push({
          timeframe: monthKey,
          minDate: new Date(monthKey + "-01T12:00:00Z"),
          game: gameData.game || "Unknown",
          percent: (gameData.totalSeconds / totalSeconds),
          gameSeconds: gameData.totalSeconds,
          totalSeconds: totalSeconds,
          systems: gameData.systems
        });
      }
    }
  }

  const YEAR_THRESHOLD = 72000;
  for (const [year, gamesObj] of Object.entries(yearlyGameStats)) {
    let totalSeconds = 0;
    const gameArr = [];
    for (const [game, stats] of Object.entries(gamesObj)) {
      totalSeconds += stats.totalSeconds;
      gameArr.push({ game, ...stats });
    }
    if (totalSeconds > YEAR_THRESHOLD) {
      for (const gameData of gameArr) {
        yearlyConcentration.push({
          year: parseInt(year),
          game: gameData.game || "Unknown",
          percent: (gameData.totalSeconds / totalSeconds),
          gameSeconds: gameData.totalSeconds,
          totalSeconds: totalSeconds,
          systems: gameData.systems
        });
      }
    }
  }

  return { monthlyConcentration, yearlyConcentration };
}

function getYearlyBestStreaks(allStreaks, allEntries = null) {
  const yearlyBests = {};
  const yearsSeen = new Set();
  
  if (!allStreaks || allStreaks.length === 0) return [];

  allStreaks.forEach(s => {
    if (s.start instanceof Date) yearsSeen.add(s.start.getUTCFullYear());
    if (s.end instanceof Date) yearsSeen.add(s.end.getUTCFullYear());
  });
  
  const sortedYears = [...yearsSeen].sort((a, b) => b - a);

  for (const year of sortedYears) {
    let bestStreaksForYear = []; 
    let maxClippedLength = 0;
    
    const yearStart = new Date(Date.UTC(year, 0, 1, 12, 0, 0));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 12, 0, 0));

    for (const streak of allStreaks) {
      if (!streak.start || !streak.end) continue; 

      const overlapStart = Math.max(streak.start.getTime(), yearStart.getTime());
      const overlapEnd = Math.min(streak.end.getTime(), yearEnd.getTime());

      if (overlapStart <= overlapEnd) {
        const clippedLength = Math.round((overlapEnd - overlapStart) / 86400000) + 1;
        
        let clippedTotalSeconds = streak.totalSeconds;
        let clippedSystems = streak.systems;
        
        if (allEntries && streak.game) {
           const entriesInWindow = allEntries.filter(e => {
               const t = e.date.getTime();
               return e.game === streak.game && t >= overlapStart && t <= overlapEnd;
           });
           clippedTotalSeconds = entriesInWindow.reduce((sum, e) => sum + timeStringToSeconds(e.time), 0);
           clippedSystems = new Set(entriesInWindow.map(e => e.system));
        }

        const newStreakData = {
          ...streak, 
          clippedStart: new Date(overlapStart),
          clippedEnd: new Date(overlapEnd),
          clippedLength: clippedLength,
          totalSeconds: clippedTotalSeconds !== undefined ? clippedTotalSeconds : streak.totalSeconds,
          systems: clippedSystems || streak.systems
        };
        
        if (clippedLength > maxClippedLength) {
          maxClippedLength = clippedLength;
          bestStreaksForYear = [newStreakData];
        } else if (clippedLength === maxClippedLength) {
          bestStreaksForYear.push(newStreakData);
        }
      }
    }
    
    if (bestStreaksForYear.length > 0) {
      yearlyBests[year] = bestStreaksForYear;
    }
  }
  
  return Object.keys(yearlyBests)
    .sort((a, b) => b - a) 
    .flatMap(year => 
        yearlyBests[year].map(item => ({ year: parseInt(year), data: item, isTie: yearlyBests[year].length > 1 }))
    );
}

function getYearlyBestCompletionStreaks(completionStreaks) {
  const yearlyBests = {};
  const yearsSeen = new Set();

  completionStreaks.forEach(s => {
    if (s.startDate) yearsSeen.add(s.startDate.getUTCFullYear());
    if (s.endDate) yearsSeen.add(s.endDate.getUTCFullYear());
  });

  const sortedYears = [...yearsSeen].sort((a, b) => b - a);

  for (const year of sortedYears) {
    let bestStreaksForYear = [];
    let maxLength = 0;

    for (const streak of completionStreaks) {
      if (!streak.startDate || !streak.endDate) continue;

      const gamesInYear = [];
      let yearStart = null;
      let yearEnd = null;

      for (let i = 0; i < streak.games.length; i++) {
        const gDate = streak.gameDates[i];
        if (gDate.getUTCFullYear() === year) {
          gamesInYear.push(streak.games[i]);
          if (!yearStart) yearStart = gDate;
          yearEnd = gDate; 
        }
      }

      if (gamesInYear.length > 0) {
        const clippedLength = gamesInYear.length;
        const newStreakData = {
          ...streak, 
          clippedLength: clippedLength,
          clippedGames: gamesInYear,
          clippedStart: yearStart,
          clippedEnd: yearEnd
        };

        if (clippedLength > maxLength) {
          maxLength = clippedLength;
          bestStreaksForYear = [newStreakData];
        } else if (clippedLength === maxLength) {
          bestStreaksForYear.push(newStreakData);
        }
      }
    }
    if (bestStreaksForYear.length > 0) {
      yearlyBests[year] = bestStreaksForYear;
    }
  }

  return Object.keys(yearlyBests)
    .sort((a, b) => b - a)
    .flatMap(year => 
        yearlyBests[year].map(item => ({ year: parseInt(year), data: item, isTie: yearlyBests[year].length > 1 }))
    );
}

function findTopNonOverlappingWeeks(sourceEntries, isPerGame = false) {
  if (!sourceEntries || sourceEntries.length === 0) return [];
  const allPossibleWeeks = [], queue = [];
  let currentSum = 0;

  for (const entry of sourceEntries) {
    const entryTimeSec = timeStringToSeconds(entry.time);
    queue.push(entry);
    currentSum += entryTimeSec;
    while ((entry.date.getTime() - queue[0].date.getTime()) / (1000 * 3600 * 24) > 6) {
      currentSum -= timeStringToSeconds(queue.shift().time);
    }
    allPossibleWeeks.push({ totalSeconds: currentSum, startDate: queue[0].date, endDate: entry.date, entries: [...queue] });
  }

  if (queue.length > 0) {
    const lastEntryDate = sourceEntries[sourceEntries.length - 1].date;
    for (let i = 1; i <= 6; i++) {
      const currentDate = new Date(lastEntryDate);
      currentDate.setDate(lastEntryDate.getDate() + i);

      while (queue.length > 0 && (currentDate.getTime() - queue[0].date.getTime()) / (1000 * 3600 * 24) > 6) {
        currentSum -= timeStringToSeconds(queue.shift().time);
      }

      if (queue.length > 0) {
        allPossibleWeeks.push({
          totalSeconds: currentSum,
          startDate: queue[0].date,
          endDate: queue[queue.length-1].date, 
          entries: [...queue]
        });
      }
    }
  }

  allPossibleWeeks.sort((a, b) => b.totalSeconds - a.totalSeconds);
  const topWeeks = [];
  let availableWeeks = allPossibleWeeks;

  while(availableWeeks.length > 0) {
    const bestWeek = availableWeeks[0];
    const gamesPlayedInWindow = bestWeek.entries.reduce((acc, e) => {
      const key = `${e.game} (${e.system})`;
      if (!acc[key]) acc[key] = 0;
      acc[key] += timeStringToSeconds(e.time);
      return acc;
    }, {});
    const sortedGames = Object.entries(gamesPlayedInWindow).sort((a, b) => b[1] - a[1]);
    const gamesString = sortedGames.slice(0, 3).map(([name, sec]) => `${name} [${secondsToTimeString(sec)}]`).join(', ');
    topWeeks.push({ ...bestWeek, game: isPerGame ? bestWeek.entries[0].game : null, systems: new Set(bestWeek.entries.map(e => e.system)), gamesPlayed: gamesString });

    const usedDatesInBestWeek = new Set(bestWeek.entries.map(e => e.date.getTime()));
    availableWeeks = availableWeeks.filter(candidate => !candidate.entries.some(entry => usedDatesInBestWeek.has(entry.date.getTime())));
  }
  return topWeeks;
}

function aggregateMetrics_BestMonthsByName(busiestMonthData, monthlyStats) {
  const byMonthIndex = Array.from({ length: 12 }, () => []);

  for (const [monthKey, data] of Object.entries(busiestMonthData)) {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = parseInt(yearStr);
    const monthIndex = parseInt(monthStr) - 1; 

    const gamesInMonth = monthlyStats[monthKey];
    const topGames = Object.entries(gamesInMonth)
      .sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)
      .slice(0, 5)
      .map(([gameName, stats]) => {
        const sysStr = Array.from(stats.systems).join(', ');
        return `[${secondsToTimeString(stats.totalSeconds)}] ${gameName} (${sysStr})`;
      })
      .join(', ');

    byMonthIndex[monthIndex].push({
      year: year,
      monthKey: monthKey,
      totalSeconds: data.totalSeconds,
      startDate: data.minDate,
      endDate: data.maxDate,
      details: topGames
    });
  }

  return byMonthIndex;
}


//================================================================//
//                                                                //
//                   GENERAL HELPER FUNCTIONS                     //
//                                                                //
//================================================================//

function getDaysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function formatDate(d, useSlash = false) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const dateString = d.getUTCFullYear() + '/' + (d.getUTCMonth() + 1).toString().padStart(2, '0') + '/' + d.getUTCDate().toString().padStart(2, '0');
  return useSlash ? dateString : d;
}
function timeStringToSeconds(timeString) {
  if (!timeString || typeof timeString !== 'string') return 0;
  const p = timeString.split(':').map(s => parseInt(s, 10));
  let s = 0;
  if (p.length === 3) s = (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
  else if (p.length === 2) s = (p[0] || 0) * 3600 + (p[1] || 0) * 60;
  return isNaN(s) ? 0 : s;
}
function secondsToTimeString(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const m = Math.floor(totalSeconds / 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}
function sliceWithTies(array, limit, valueGetter) {
  if (array.length <= limit) return array;
  const cutoffValue = valueGetter(array[limit - 1]);
  let lastTieIndex = limit - 1;
  while (lastTieIndex + 1 < array.length && valueGetter(array[lastTieIndex + 1]) === cutoffValue) {
    lastTieIndex++;
  }
  return array.slice(0, lastTieIndex + 1);
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

function compressYearRanges(sortedYears) {
  if (!sortedYears || sortedYears.length === 0) return [];

  const formatYear = (year) => year.toString();

  if (sortedYears.length === 1) return [formatYear(sortedYears[0])];

  const ranges = [];
  let rangeStart = sortedYears[0];

  for (let i = 1; i < sortedYears.length; i++) {
    const prevY = Number(sortedYears[i-1]);
    const currY = Number(sortedYears[i]);

    const isConsecutive = (currY === prevY + 1);

    if (!isConsecutive) {
      const rangeEnd = sortedYears[i-1];
      if (rangeStart == rangeEnd) ranges.push(formatYear(rangeStart));
      else ranges.push(`${formatYear(rangeStart)}-${formatYear(rangeEnd)}`);
      rangeStart = sortedYears[i];
    }
  }

  const finalRangeEnd = sortedYears[sortedYears.length - 1];
  if (rangeStart == finalRangeEnd) ranges.push(formatYear(rangeStart));
  else ranges.push(`${formatYear(rangeStart)}-${formatYear(finalRangeEnd)}`);

  return ranges;
}

function compressMonthRanges(sortedMonths) {
  if (!sortedMonths || sortedMonths.length === 0) return [];
  const formatMonth = (monthStr) => { const [y, m] = monthStr.split('-'); return `${m.padStart(2, '0')}/${y}`; };
  if (sortedMonths.length === 1) return [formatMonth(sortedMonths[0])];
  const ranges = [];
  let rangeStart = sortedMonths[0];
  for (let i = 1; i < sortedMonths.length; i++) {
    const [prevY, prevM] = sortedMonths[i-1].split('-').map(Number);
    const [currY, currM] = sortedMonths[i].split('-').map(Number);
    const isConsecutive = (prevY === currY && currM === prevM + 1) || (currY === prevY + 1 && prevM === 12 && currM === 1);
    if (!isConsecutive) {
      const rangeEnd = sortedMonths[i-1];
      if (rangeStart === rangeEnd) ranges.push(formatMonth(rangeStart));
      else ranges.push(`${formatMonth(rangeStart)}-${formatMonth(rangeEnd)}`);
      rangeStart = sortedMonths[i];
    }
  }
  const finalRangeEnd = sortedMonths[sortedMonths.length - 1];
  if (rangeStart === finalRangeEnd) ranges.push(formatMonth(rangeStart));
  else ranges.push(`${formatMonth(rangeStart)}-${formatMonth(finalRangeEnd)}`);
  return ranges;
}

function getWeekdayCounts(startDate, endDate) {
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const current = new Date(startDate.getTime());
  current.setHours(12, 0, 0, 0);
  const finalDate = new Date(endDate.getTime());
  finalDate.setHours(12, 0, 0, 0);
  while (current <= finalDate) {
    counts[current.getDay()]++;
    current.setDate(current.getDate() + 1);
  }
  return counts;
}

function getOrdinalSuffix(d) {
  if (d > 3 && d < 21) return 'th';
  switch (d % 10) {
    case 1:  return "st";
    case 2:  return "nd";
    case 3:  return "rd";
    default: return "th";
  }
}

function getYearlyBests(type, sourceData, metricKey, dateKeyOrYearlyStats) {
  const bests = {};
  const years = [];

  const getYear = (obj, key) => {
    if (!obj || !obj[key]) return null;
    const val = obj[key];
    if (val instanceof Date) return val.getFullYear();
    if (typeof val === 'string') return new Date(val).getFullYear();
    return null;
  };

  const getMetricValue = (obj, key) => {
    if (!obj || !key) return 0;
    
    if (key.endsWith('.size')) {
      const propName = key.split('.')[0]; 
      if (obj[propName] instanceof Set) {
        return obj[propName].size;
      }
    }

    if (!key.includes('.')) {
      return obj[key] || 0;
    }
    
    try {
      let value = obj;
      for (const k of key.split('.')) {
        value = value[k];
      }
      return value || 0;
    } catch (e) {
      return 0; 
    }
  };
  
  if (type === 'event') {
    if (!Array.isArray(sourceData)) return [];
    
    sourceData.forEach(item => {
      const year = getYear(item, dateKeyOrYearlyStats);
      if (!year) return;

      const val = getMetricValue(item, metricKey); 
      
      if (!bests[year] || val > bests[year].val) {
        bests[year] = { items: [item], val: val };
      } else if (val === bests[year].val && val > 0) { 
        bests[year].items.push(item);
      }
    });

    Object.keys(bests).forEach(y => years.push(parseInt(y)));
    return years.sort((a, b) => b - a).flatMap(year => {
        if (!bests[year]) {
            return [];
        }
        return bests[year].items.map(item => ({ year: year, data: item, isTie: bests[year].items.length > 1 }))
    });
  } 
  else if (type === 'stats') {
    const yearlyStats = dateKeyOrYearlyStats || {};
    for (const year in yearlyStats) {
      let topNames = []; 
      let topVal = -1;
      let topObjs = []; 
      
      const yearData = yearlyStats[year];
      if (!yearData) continue;

      for (const name in yearData) {
          const entry = yearData[name];
          const val = getMetricValue(entry, metricKey); 
          if (val > topVal) {
              topVal = val;
          }
      }

      if (topVal > 0) { 
          for (const name in yearData) {
              const entry = yearData[name];
              const val = getMetricValue(entry, metricKey); 
              if (val === topVal) {
                  topNames.push(name);
                  topObjs.push(entry);
              }
          }
      }

      if (topNames.length > 0) {
        for (let j = 0; j < topNames.length; j++) {
            const topName = topNames[j];
            const topObj = topObjs[j];

            let minDate = null, maxDate = null;
            if (topObj.days && topObj.days.size > 0) {
              const sortedDays = [...topObj.days].sort();
              minDate = new Date(sortedDays[0] + 'T12:00:00Z');
              maxDate = new Date(sortedDays[sortedDays.length - 1] + 'T12:00:00Z');
            } else {
              minDate = topObj.firstDate || topObj.minDate || null;
              maxDate = topObj.lastDate || topObj.maxDate || null;
            }

            if (!bests[year]) {
                bests[year] = []; 
                years.push(parseInt(year));
            }
            bests[year].push({ 
                name: topName, 
                value: topVal, 
                games: topObj.games || new Set(), 
                minDate: minDate,
                maxDate: maxDate, 
                systems: topObj.systems || new Set()
            });
        }
      }
    }
    return years.sort((a, b) => b - a).flatMap(year => {
        if (!bests[year]) {
            return [];
        }
        return bests[year].map(item => ({ year: year, data: item, isTie: bests[year].length > 1 }))
    });
  }
  return [];
}

//================================================================//
//                        UTILITY FUNCTIONS                       //
//================================================================//

function updateMetadataSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const masterSheet = ss.getSheetByName("Master");
  const metadataSheet = ss.getSheetByName("Metadata");
  if (!masterSheet || !metadataSheet) {
    SpreadsheetApp.getUi().alert("Error: Could not find 'Master' or 'Metadata' sheet.");
    return;
  }

  const masterGameValues = masterSheet.getRange(4, 3, masterSheet.getLastRow() - 3, 1).getDisplayValues();
  const masterGames = new Set(masterGameValues.flat().filter(game => game)); 

  const lastRow = metadataSheet.getLastRow();
  const metadataGames = new Map(); 
  
  if (lastRow > 1) { 
    const existingMetadataValues = metadataSheet.getRange(2, 1, lastRow - 1, 11).getDisplayValues();
    for (let i = 0; i < existingMetadataValues.length; i++) {
      metadataGames.set(existingMetadataValues[i][0], true); 
    }
  } else if (lastRow === 0) {
    metadataSheet.getRange("A1:K1").setValues([
      ["Videogame", "Release Year", "Genre", "Developer", "Publisher", "Series", "Yoshi Rating", "Apple Rating", "Apple Date", "A-System", "GOTM"]
    ]);
  }

  const newGamesToAdd = [];
  for (const game of masterGames) {
    if (!metadataGames.has(game)) {
      newGamesToAdd.push([game, "", "", "", "", "", "", "", "", "", ""]); 
    }
  }

  if (newGamesToAdd.length > 0) {
    const nextRow = metadataSheet.getLastRow() + 1;
    metadataSheet.getRange(nextRow, 1, newGamesToAdd.length, 11).setValues(newGamesToAdd);
    
    if (metadataSheet.getLastRow() > 2) { 
      const dataRange = metadataSheet.getRange(2, 1, metadataSheet.getLastRow() - 1, metadataSheet.getLastColumn());
      dataRange.sort({column: 1, ascending: true});
    }
    
    SpreadsheetApp.getUi().alert("Metadata sheet updated successfully!", `Added ${newGamesToAdd.length} new games and re-sorted the list.`, SpreadsheetApp.getUi().ButtonSet.OK);
  } else {
    SpreadsheetApp.getUi().alert("Metadata sheet is already up-to-date.", "No new games found in Master.", SpreadsheetApp.getUi().ButtonSet.OK);
  }
  
  metadataSheet.setFrozenRows(1);
  metadataSheet.getRange("A1:K1").setFontWeight("bold");
  metadataSheet.getRange("A:A").setNumberFormat("@");
  metadataSheet.getRange("I:I").setNumberFormat("@"); 
  metadataSheet.setColumnWidth(1, 300);
  metadataSheet.setColumnWidths(2, 10, 120); 
}

function updateMainCompletedGames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Main");
  
  if (!sheet) {
    Logger.log("Error: 'Main' sheet not found.");
    return;
  }

  const { playthroughHistory } = getAggregatedData();
  const completedList = [];

  for (const ptTag in playthroughHistory) {
    const pt = playthroughHistory[ptTag];
    if (pt.finalStatus === "Completed" || pt.finalStatus === "M-Completed") {
      const d = pt.lastDate;
      const dateStr = `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
      const entryString = `${pt.gameName} (${pt.system}) [${dateStr}]`;
      completedList.push(entryString);
    }
  }

  completedList.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const outputValues = completedList.map(item => [item]);
  const maxRows = sheet.getMaxRows();
  
  if (maxRows > 1) {
    sheet.getRange(2, 10, maxRows - 1, 1).clearContent();
  }

  if (outputValues.length > 0) {
    sheet.getRange(2, 10, outputValues.length, 1).setValues(outputValues);
  }
}

function runDailyBackup() {
  const BACKUP_FOLDER_NAME = "Videogame Log Backups"; 
  const RETENTION_DAYS = 30; 
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fileId = ss.getId();
  const file = DriveApp.getFileById(fileId);
  const timezone = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  
  let folder;
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  }
  
  const backupName = `${ss.getName()}_Backup_${today}`;
  file.makeCopy(backupName, folder);
  console.log(`Backup created: ${backupName}`);
  
  const files = folder.getFiles();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  
  while (files.hasNext()) {
    const backupFile = files.next();
    const createdDate = backupFile.getDateCreated();
    
    if (createdDate < cutoffDate) {
      if (backupFile.getName().includes("_Backup_")) {
        backupFile.setTrashed(true);
        console.log(`Deleted old backup: ${backupFile.getName()}`);
      }
    }
  }
}

//================================================================//
//                        GITHUB CONFIGURATION                    //
//================================================================//

const GITHUB_USER = "xpinion";
const GITHUB_REPO = "yoshi.gg";

function exportWebDataToGitHub() {
  // 1. Specific visual grid JSONs needed for bty.html and the Top 25 Spotlight
  const requiredSheets = ['Metadata', 'Master', 'top25'];
  
  requiredSheets.forEach(sheetName => {
     const data = getSheetData(sheetName);
     const fileName = `${sheetName.toLowerCase()}_data.json`;
     const jsonString = JSON.stringify(data);
     pushFileToGitHub(fileName, jsonString);
  });

  // 2. The raw data JSON (Powers the modern dashboard)
  const dashboardData = getAggregatedData();
  const rawJsonString = JSON.stringify(dashboardData, dataReplacer);
  pushFileToGitHub('raw_dashboard_data.json', rawJsonString);

  Logger.log("Essential files pushed to GitHub successfully!");
}

function pushFileToGitHub(fileName, content) {
  // Use PropertiesService for security!
  const githubToken = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  
  if (!githubToken) {
     Logger.log("Error: GITHUB_TOKEN not found in Script Properties.");
     return;
  }

  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${fileName}`;
  const headers = {
    "Authorization": "token " + githubToken,
    "Accept": "application/vnd.github.v3+json"
  };

  let sha = null;
  try {
    const getResponse = UrlFetchApp.fetch(url, { method: "get", headers: headers, muteHttpExceptions: true });
    if (getResponse.getResponseCode() === 200) {
      const fileData = JSON.parse(getResponse.getContentText());
      sha = fileData.sha;
    }
  } catch(e) {} 

  const payload = {
    message: `Automated nightly spreadsheet sync: ${fileName}`,
    content: Utilities.base64Encode(Utilities.newBlob(content).getBytes())
  };
  
  if (sha) payload.sha = sha;

  const options = {
    method: "put",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}

function saveWebJsonFile(folder, fileName, dataObj) {
  const jsonString = JSON.stringify(dataObj);
  let files = folder.getFilesByName(fileName);

  if (files.hasNext()) {
    let file = files.next();
    file.setContent(jsonString);
  } else {
    folder.createFile(fileName, jsonString, MimeType.PLAIN_TEXT);
  }
}

// -----------------------------------------------------------
// APPLE BETTER THAN YOU GAMING PROJECT
// 
// ------------------------------------------------

// --- CONFIGURATION ---
const MACRODROID_ID = "3be027d7-8061-4794-aa80-4e4677ce7555"; // Replace this with your actual ID from the app
const SHEET_NAME = "metadata";
// ---------------------

function sendDailySignalGames() {
  // --- NEW: Check if it's the weekend and stop if it is ---
  const dayOfWeek = new Date().getDay();
  // 0 is Sunday, 6 is Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    Logger.log("It's the weekend! No games today.");
    return; 
  }
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  // Exclude the header row
  const rows = data.slice(1);
  
  // --- SEGMENT 1: 5 NEW GAMES TO RATE ---
  // STRICTLY checks for blank cells only. Ignores "N" or any numbers.
  const unratedGames = rows.filter(row => row[7] === ""); 
  
  if (unratedGames.length === 0) {
    Logger.log("No unrated games left!");
    return;
  }
  
  // Pick 5 random games
  const selectedGames = [];
  const unratedCopy = [...unratedGames];
  for (let i = 0; i < 5 && unratedCopy.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * unratedCopy.length);
    selectedGames.push(unratedCopy.splice(randomIndex, 1)[0]);
  }
  
  // --- SEGMENT 2: 3 EXISTING RATINGS TO REVIEW ---
  const ratedGames = rows.filter(row => {
    const rating = String(row[7]).trim();
    return rating !== "" && rating !== "N" && rating.includes(".");
  });
  
  const reviewGames = [];
  const ratedCopy = [...ratedGames];
  for (let i = 0; i < 3 && ratedCopy.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * ratedCopy.length);
    reviewGames.push(ratedCopy.splice(randomIndex, 1)[0]);
  }

  // Helper function 1: Apple's Series Ratings
  function getAppleSeriesRatings(seriesName) {
    if (!seriesName) return "";
    const ratedInSeries = rows.filter(row => row[5] === seriesName && row[7] !== "" && row[7] !== "N");
    if (ratedInSeries.length <= 1) return "";
    
    ratedInSeries.sort((a, b) => {
      const ratingA = parseFloat(a[7]) || 0;
      const ratingB = parseFloat(b[7]) || 0;
      return ratingB - ratingA; 
    });
    
    const formattedRatings = ratedInSeries.map((row, index) => {
      return `#${index + 1}. ${row[0]}: ${row[7]}`;
    }).join(" / ");
    
    return `🍎 Apple's Past Ratings for ${seriesName}:\n${formattedRatings}`;
  }

  // Helper function 2: Yoshi's Series Ratings
  function getYoshiSeriesRatings(seriesName) {
    if (!seriesName) return "";
    const ratedInSeries = rows.filter(row => row[5] === seriesName && row[6] !== "" && row[6] !== "N");
    if (ratedInSeries.length <= 1) return "";
    
    ratedInSeries.sort((a, b) => {
      const ratingA = parseFloat(a[6]) || 0;
      const ratingB = parseFloat(b[6]) || 0;
      return ratingB - ratingA; 
    });
    
    const formattedRatings = ratedInSeries.map((row, index) => {
      return `#${index + 1}. ${row[0]}: ${row[6]}`;
    }).join(" / ");
    
    return `🦖 Yoshi's Past Ratings for ${seriesName}:\n${formattedRatings}`;
  }
  
  // --- BUILD THE TEXT MESSAGE ---
  let message = "🎮 *NEW GAMES TO RATE TODAY* 🎮\n\n";
  
  selectedGames.forEach(game => {
    const title = game[0];
    const releaseYear = game[1];
    const genre = game[2];
    const developer = game[3];
    const publisher = game[4];
    const series = game[5];
    const yoshiRating = game[6]; 
    
    // Condensed single-line format for game details
    message += `• *${title}* (${releaseYear}) / ${genre} / ${developer} / ${publisher}\n`;
    
    if (yoshiRating && yoshiRating !== "N") {
      message += `Yoshi's Rating: ${yoshiRating}\n`;
    }
    
    // Only fetch Apple's ratings for the new games segment
    if (series) {
      const appleSeriesText = getAppleSeriesRatings(series);
      if (appleSeriesText) {
        message += `${appleSeriesText}\n`;
      }
    }
    message += "\n"; 
  });

  // --- APPEND THE REVIEW SEGMENT ---
  if (reviewGames.length > 0) {
    message += "----------\n\n";
    message += "⚖️ *RATING REVIEW* ⚖️\n";
    message += "BETTER THAN YOU DISCUSSION: Do these past ratings still hold up?\n\n";
    
    reviewGames.forEach(game => {
      const appleRating = game[7];
      const yoshiRating = game[6] === "" ? "Unrated" : game[6];
      const series = game[5];
      
      message += `• *${game[0]}*\n   Apple: ${appleRating}  |  Yoshi: ${yoshiRating}\n`;
      
      // Fetch BOTH Apple's and Yoshi's ratings for the review segment
      if (series) {
        const appleSeriesText = getAppleSeriesRatings(series);
        const yoshiSeriesText = getYoshiSeriesRatings(series);
        
        if (appleSeriesText) {
          message += `${appleSeriesText}\n`;
        }
        if (yoshiSeriesText) {
          message += `${yoshiSeriesText}\n`;
        }
      }
      message += "\n"; 
    });
  }

// --- SEND TO MACRODROID VIA POST REQUEST ---
  const macroUrl = `https://trigger.macrodroid.com/${MACRODROID_ID}/signalgames`; 
  
  const options = {
    'method': 'post',
    'payload': message,
    'contentType': 'text/plain; charset=utf-8' // <--- Added the charset here!
  };
  
  try {
    UrlFetchApp.fetch(macroUrl, options);
    Logger.log("Message sent to MacroDroid successfully!");
  } catch (e) {
    Logger.log("Error sending to MacroDroid: " + e);
  }
}
