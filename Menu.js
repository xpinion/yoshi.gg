//================================================================//
//                                                                //
//                       CUSTOM UI MENU                           //
//                                                                //
//================================================================//

/**
 * Builds the custom menu when the Google Sheet is opened.
 */
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

//================================================================//
//                                                                //
//                       CACHE CONTROLS                           //
//                                                                //
//================================================================//

/**
 * Forces a full data aggregation and saves it to the Drive cache.
 */
function warmUpCache() {
  SpreadsheetApp.getActiveSpreadsheet().toast('Warming up the cache... This may take several minutes.', 'In Progress', -1);
  getAggregatedData(); 
  SpreadsheetApp.getActiveSpreadsheet().toast('Cache is ready! Reports will now load quickly.', 'Complete', 10);
}

/**
 * Deletes the cache file from Google Drive and clears active memory.
 */
function clearAggregatedDataCache(showAlert = true) {
  let files = DriveApp.getFilesByName(DRIVE_CACHE_FILENAME);
  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
  
  _MEMORY_CACHE = null; // Clear local execution memory too
  
  Logger.log('Aggregated data cache has been deleted from Drive.');
  if (showAlert) {
    try {
      SpreadsheetApp.getUi().alert('Cache Cleared', 'The Drive cache has been deleted. The next report will run a full data refresh.', SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) { /* Ignore UI errors */ }
  }
}
