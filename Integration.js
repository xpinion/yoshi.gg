//================================================================//
//                                                                //
//               SHEET DATA EXTRACTION (For Web)                  //
//                                                                //
//================================================================//

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
//                        GITHUB CONFIGURATION                    //
//================================================================//

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

//================================================================//
//                        DRIVE CACHE UTILITY                     //
//================================================================//

function saveToCache(data) {
  const folderName = "Videogame Log Backups"; 
  let folders = DriveApp.getFoldersByName(folderName);
  let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  
  const jsonString = JSON.stringify(data, dataReplacer);
  let files = folder.getFilesByName(DRIVE_CACHE_FILENAME);
  
  if (files.hasNext()) {
    files.next().setContent(jsonString);
  } else {
    folder.createFile(DRIVE_CACHE_FILENAME, jsonString, MimeType.PLAIN_TEXT);
  }
}

function loadFromCache() {
  let files = DriveApp.getFilesByName(DRIVE_CACHE_FILENAME);
  if (files.hasNext()) {
    try {
      const file = files.next();
      // FIX: Extract the blob data first!
      const content = file.getBlob().getDataAsString();
      return JSON.parse(content, dataReviver);
    } catch (e) {
      Logger.log("Failed to parse Drive Cache: " + e.message);
      return null;
    }
  }
  return null;
}

//================================================================//
//                        SHEET UTILITIES                         //
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

//================================================================//
//                        BACKUP UTILITY                          //
//================================================================//

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
//           APPLE BETTER THAN YOU GAMING PROJECT                 //
//================================================================//

function sendDailySignalGames() {
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
  const unratedGames = rows.filter(row => row[7] === ""); 
  
  if (unratedGames.length === 0) {
    Logger.log("No unrated games left!");
    return;
  }
  
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
    
    message += `• *${title}* (${releaseYear}) / ${genre} / ${developer} / ${publisher}\n`;
    
    if (yoshiRating && yoshiRating !== "N") {
      message += `Yoshi's Rating: ${yoshiRating}\n`;
    }
    
    if (series) {
      const appleSeriesText = getAppleSeriesRatings(series);
      if (appleSeriesText) {
        message += `${appleSeriesText}\n`;
      }
    }
    message += "\n"; 
  });

  if (reviewGames.length > 0) {
    message += "----------\n\n";
    message += "⚖️ *RATING REVIEW* ⚖️\n";
    message += "BETTER THAN YOU DISCUSSION: Do these past ratings still hold up?\n\n";
    
    reviewGames.forEach(game => {
      const appleRating = game[7];
      const yoshiRating = game[6] === "" ? "Unrated" : game[6];
      const series = game[5];
      
      message += `• *${game[0]}*\n   Apple: ${appleRating}  |  Yoshi: ${yoshiRating}\n`;
      
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

  const macroUrl = `https://trigger.macrodroid.com/${MACRODROID_ID}/signalgames`; 
  
  const options = {
    'method': 'post',
    'payload': message,
    'contentType': 'text/plain; charset=utf-8' 
  };
  
  try {
    UrlFetchApp.fetch(macroUrl, options);
    Logger.log("Message sent to MacroDroid successfully!");
  } catch (e) {
    Logger.log("Error sending to MacroDroid: " + e);
  }
}
