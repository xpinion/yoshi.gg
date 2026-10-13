// checks.js - The Data Checks page: things in the log or the Metadata sheet that look off and may need fixing.

// How many rows a check shows before it says how many more there are
const CHECK_MAX_ROWS = 100;
const CHECK_STALE_ACTIVE_DAYS = 365;

function initChecksPage() {
  const container = document.getElementById('checks-page-container');
  if (!container || !rawData || !rawData.allEntries) return;

  // Entries in the order they were logged
  const entries = rawData.allEntries.slice().sort((a, b) => a.date.localeCompare(b.date) || Number(a.entryNum) - Number(b.entryNum));
  const playthroughs = Object.values(rawData.playthroughHistory);
  const metaByName = new Map(metaGames.map(g => [g.name, g]));
  const played = [...new Set(entries.map(e => e.game))].sort((a, b) => a.localeCompare(b));
  const lastPlayed = {};
  entries.forEach(e => { lastPlayed[e.game] = e.date; });
  const today = Date.parse(dataDateKey());
  const game = name => `<span class="hover-trigger" data-game="${escapeHTML(name)}">${escapeHTML(name)}</span>`;
  const entryCells = e => [e.entryNum, formatFullDate(e.date), game(e.game), escapeHTML(e.system), e.time];
  const ENTRY_HEADERS = ['Entry #', 'Date', 'Videogame', 'System', 'Time'];

  // level: 'fix' for likely mistakes, 'info' for things worth a look that may be fine
  const checks = [];
  const add = (level, title, why, headers, rows) => checks.push({ level, title, why, headers, rows });

  // --- Metadata ---
  add('fix', 'Played games with no Metadata row', 'These are in the log but not on the Metadata sheet, so they have no genre, series, developer or score anywhere on the site. Check the spelling matches.',
    ['Videogame', 'Last Played'], played.filter(g => !metaByName.has(g)).map(g => [game(g), formatFullDate(lastPlayed[g])]));
  const missingFields = g => [['Release Year', g.releaseYear], ['Genre', g.genre], ['Developer', g.developer], ['Publisher', g.publisher]].filter(([, v]) => !v || v === 'Unknown' || v === 'N/A').map(([label]) => label);
  add('fix', 'Played games missing a release year, genre, developer or publisher', 'These games are left out of the lists and pages built on the missing field.',
    ['Videogame', 'Missing'], played.filter(g => metaByName.has(g) && missingFields(metaByName.get(g)).length).map(g => [game(g), missingFields(metaByName.get(g)).join(', ')]));
  add('fix', 'Played games with no score', 'They are skipped on the Ratings and GotY pages.',
    ['Videogame', 'Last Played', 'Time'], played.filter(g => metaByName.has(g) && metaByName.get(g).score === null)
      .map(g => [game(g), formatFullDate(lastPlayed[g]), formatTime(entries.filter(e => e.game === g).reduce((sum, e) => sum + timeStringToSeconds(e.time), 0))]));
  const byLooseName = {};
  [...new Set([...played, ...metaGames.map(g => g.name)])].forEach(name => {
    const key = name.toLowerCase().replace(/[^a-z0-9+]/g, ''); // plus signs count: N+ and N++ are different games
    (byLooseName[key] = byLooseName[key] || []).push(name);
  });
  add('fix', 'Names that differ only by spacing, case or punctuation', 'Probably the same game typed two ways, which splits its time in two.',
    ['Names'], Object.values(byLooseName).filter(names => names.length > 1).map(names => [names.map(escapeHTML).join(' &nbsp;/&nbsp; ')]));

  // --- Totals kept in the sheet ---
  const ptRunning = {}, gameRunning = {};
  const ptMismatch = [], gameMismatch = [];
  entries.forEach(e => {
    const sec = timeStringToSeconds(e.time);
    ptRunning[e.ptTag] = (ptRunning[e.ptTag] || 0) + sec;
    gameRunning[e.game] = (gameRunning[e.game] || 0) + sec;
    if (timeStringToSeconds(e.ptLifetime) !== ptRunning[e.ptTag]) ptMismatch.push([...entryCells(e), escapeHTML(e.ptTag), e.ptLifetime, formatHHMM(ptRunning[e.ptTag])]);
    if (timeStringToSeconds(e.gameLifetime) !== gameRunning[e.game]) gameMismatch.push([...entryCells(e), e.gameLifetime, formatHHMM(gameRunning[e.game])]);
  });
  add('fix', 'Playthrough totals that don\'t add up', 'The PT Total typed on the entry differs from the sum of that playthrough\'s sessions up to then. One early slip repeats on every later entry, so start with the oldest.',
    [...ENTRY_HEADERS, 'Tag', 'Sheet Says', 'Sessions Add Up To'], ptMismatch);
  add('fix', 'Game totals that don\'t add up', 'The Game Total typed on the entry differs from the sum of all that game\'s sessions up to then.',
    [...ENTRY_HEADERS, 'Sheet Says', 'Sessions Add Up To'], gameMismatch);

  // --- Entries ---
  const numbers = entries.map(e => Number(e.entryNum));
  const seen = new Set(), repeated = new Set();
  numbers.forEach(n => { if (seen.has(n)) repeated.add(n); seen.add(n); });
  const missing = [];
  for (let n = 1; n <= Math.max(...numbers); n++) if (!seen.has(n)) missing.push(n);
  add('fix', 'Entry numbers missing or repeated', 'Entry numbers should run from 1 with no gaps.',
    ['Entry #', 'Problem'], [...missing.map(n => [n, 'Missing']), ...[...repeated].map(n => [n, 'Used more than once'])]);
  add('fix', 'Notes that don\'t start with "Game N - "', 'Nearly every note starts that way; these may be typos.',
    [...ENTRY_HEADERS, 'Note'], entries.filter(e => !/^Game \d+ - /.test(e.note || '')).map(e => [...entryCells(e), escapeHTML(e.note)]));
  add('fix', 'Sessions with no time, or a time that isn\'t a multiple of 5 minutes', 'Every session is logged in 5-minute steps.',
    ENTRY_HEADERS, entries.filter(e => timeStringToSeconds(e.time) === 0 || timeStringToSeconds(e.time) % 300 !== 0).map(entryCells));
  const tagGames = {};
  entries.forEach(e => { (tagGames[e.ptTag] = tagGames[e.ptTag] || new Set()).add(e.game); });
  add('fix', 'Playthrough tags used for more than one game', 'A tag should belong to a single game.',
    ['Tag', 'Games'], Object.entries(tagGames).filter(([, games]) => games.size > 1).map(([tag, games]) => [escapeHTML(tag), [...games].map(game).join(', ')]));
  const lastStatus = {}, afterEnd = [];
  entries.forEach(e => {
    const before = lastStatus[e.ptTag];
    if ((before === 'Abandoned' && e.status !== 'Abandoned') || (['Completed', 'M-Completed'].includes(before) && ['Active', 'Multiplayer'].includes(e.status))) afterEnd.push([...entryCells(e), escapeHTML(e.ptTag), `${before} → ${e.status}`]);
    lastStatus[e.ptTag] = e.status;
  });
  add('fix', 'Play logged after a playthrough ended', 'An entry went back to Active or Multiplayer after its playthrough was Completed or Abandoned. It may belong to a new playthrough or be Postgame.',
    [...ENTRY_HEADERS, 'Tag', 'Status Change'], afterEnd);

  // --- Worth a look ---
  const sameDay = {};
  entries.forEach(e => { (sameDay[`${e.date.slice(0, 10)}|${e.ptTag}`] = sameDay[`${e.date.slice(0, 10)}|${e.ptTag}`] || []).push(e); });
  add('info', 'The same playthrough logged twice on one day', 'Fine if it really was two sittings, but it can also be a pasted row.',
    [...ENTRY_HEADERS, 'Tag'], Object.values(sameDay).filter(list => list.length > 1).flat().map(e => [...entryCells(e), escapeHTML(e.ptTag)]).reverse());
  add('info', `Active playthroughs untouched for over ${CHECK_STALE_ACTIVE_DAYS} days`, 'They still count as being played. Mark them Abandoned if they\'re done with.',
    ['Videogame', 'Tag', 'Last Played', 'Days Ago', 'Time'], playthroughs.filter(pt => pt.finalStatus === 'Active' && (today - Date.parse(String(pt.lastDate).slice(0, 10))) / 86400000 > CHECK_STALE_ACTIVE_DAYS)
      .sort((a, b) => String(a.lastDate).localeCompare(String(b.lastDate)))
      .map(pt => [game(pt.gameName), escapeHTML(pt.ptTag || ''), formatFullDate(pt.lastDate), Math.round((today - Date.parse(String(pt.lastDate).slice(0, 10))) / 86400000), pt.finalPtLifetime]));

  const problems = checks.filter(c => c.level === 'fix' && c.rows.length);
  const checkHtml = c => `
    <details class="check${c.rows.length ? '' : ' check-clear'}"${c.rows.length && c.level === 'fix' ? ' open' : ''}>
      <summary>
        <span class="check-count ${c.rows.length ? (c.level === 'fix' ? 'check-fix' : 'check-info') : 'check-ok'}">${c.rows.length ? c.rows.length.toLocaleString() : '✓'}</span>
        <span class="check-title">${escapeHTML(c.title)}</span>
      </summary>
      <div class="check-why">${escapeHTML(c.why)}</div>
      ${c.rows.length ? `
        <div class="monthly-table-wrapper">
          <table class="monthly-table check-table">
            <thead><tr>${c.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${c.rows.slice(0, CHECK_MAX_ROWS).map(row => `<tr>${row.map(cell => `<td class="text-left">${cell}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
        ${c.rows.length > CHECK_MAX_ROWS ? `<div class="loading-text">Showing the first ${CHECK_MAX_ROWS} of ${c.rows.length.toLocaleString()}.</div>` : ''}` : ''}
    </details>`;
  const section = (title, note, list) => `
    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>${title}</h2></div>
        <div class="card-content"><div class="goty-gap-subtitle">${note}</div>${list.map(checkHtml).join('')}</div>
      </div>
    </section>`;

  container.innerHTML = `
    <div class="card-row grid-1">
      <h2 class="page-title">Data Checks</h2>
      <div class="reach-intro">${entries.length.toLocaleString()} entries, ${played.length.toLocaleString()} games and ${playthroughs.length.toLocaleString()} playthroughs checked as of ${formatFullDate(dataDateKey())}. ${problems.length ? `${problems.length} check${problems.length === 1 ? '' : 's'} found something to fix.` : 'Nothing needs fixing.'}</div>
    </div>
    ${section('Likely Mistakes', 'Each of these should normally be empty.', checks.filter(c => c.level === 'fix'))}
    ${section('Worth a Look', 'Unusual but often correct.', checks.filter(c => c.level === 'info'))}
  `;
}
