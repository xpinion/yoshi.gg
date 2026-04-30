//================================================================//
//                                                                //
//                     GLOBAL CONFIGURATION                       //
//                                                                //
//================================================================//

// --- SPREADSHEET SETTINGS ---
const SPREADSHEET_ID = "1k79wwChpG4AXUDb1o8CZaKWr0vSQ5FplCsRDkHKXftk";

// Global constants for Master Sheet column indices
const COLS = {
  ENTRY_NUM: 0, DATE: 1, VIDEOGAME: 2, SYSTEM: 3, TIME: 4, 
  PT_TOTAL: 5, GAME_TOTAL: 6, PT_TAG: 7, STATUS: 8, DETAILS: 9 
};

// --- STYLING (For Top 25 Visual Parse) ---
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

// --- CACHE SETTINGS ---
const DRIVE_CACHE_FILENAME = "YoshiGG_Aggregated_Cache.json";

// Global memory variables to prevent redundant loading during a single execution
let _MEMORY_CACHE = null;
let _SS_CACHE = null;

// --- GITHUB CONFIGURATION ---
const GITHUB_USER = "xpinion";
const GITHUB_REPO = "yoshi.gg";

// --- MACRODROID / APPLE CONFIGURATION ---
const MACRODROID_ID = "3be027d7-8061-4794-aa80-4e4677ce7555";
const SHEET_NAME = "metadata";
