//================================================================//
//                                                                //
//                DATA AGGREGATION & PROCESSING                   //
//                                                                //
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

function getAggregatedData() {
  if (_MEMORY_CACHE) {
    return _MEMORY_CACHE;
  }

  // 1. Try loading from the new Drive cache first
  const cachedData = loadFromCache();
  if (cachedData && cachedData.allEntries && cachedData.playthroughHistory && cachedData.metrics) {
    Logger.log('Retrieved all data parts from Drive cache.');
    _MEMORY_CACHE = cachedData;
    return _MEMORY_CACHE;
  }

  // 2. If no cache exists, perform full aggregation from the sheet
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

  // 3. Save the newly built data to the Drive cache
  try {
    saveToCache({ allEntries, playthroughHistory, metrics });
    Logger.log('Successfully stored data in Drive cache.');
  } catch (e) {
    Logger.log(`Error caching data to Drive: ${e.message}`);
  }

  _MEMORY_CACHE = { allEntries, playthroughHistory, metrics };
  return _MEMORY_CACHE;
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

//================================================================//
//                        UPDATE HELPERS                          //
//================================================================//
// - updateBasicTimeStats()
// - updateMultiplayerStats()
// - updateMetadataStats()
// - updateRankingSnapshots()
// - checkMilestones()
// - finalizeDerivedMetrics()
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

//================================================================//
//                     METRIC AGGREGATORS                         //
//================================================================//

// 8. Paste EVERY function that starts with "aggregateMetrics_" here:
// - aggregateMetrics_TopGamesByGenre()
// - aggregateMetrics_StreakStats()
// - aggregateMetrics_YearlyGamingStreaks()
// - aggregateMetrics_BingePeriods()
// - aggregateMetrics_SystemStreaks()
// - aggregateMetrics_VarietyPeriods()
// - aggregateMetrics_AbandonStats()
// - aggregateMetrics_PlaythroughAnalysis()
// - aggregateMetrics_CalendarStats()
// - aggregateMetrics_GenreAnalysis()
// - aggregateMetrics_ReleaseYearAnalysis()
// - aggregateMetrics_DeveloperAnalysis()
// - aggregateMetrics_PublisherAnalysis()
// - aggregateMetrics_CompletionStreakStats()
// - aggregateMetrics_GameOverlap()
// - aggregateMetrics_CompletionPeriods()
// - aggregateMetrics_Concentration()
// - aggregateMetrics_BestMonthsByName()

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
//                       DATA UTILITIES                           //
//================================================================//

// 9. Paste these 3 specific array/streak helpers here:
// - getYearlyBestStreaks()
// - getYearlyBestCompletionStreaks()
// - findTopNonOverlappingWeeks()

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
