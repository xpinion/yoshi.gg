// halloffame.js - The Hall of Fame page (halloffame.html): games inducted once they've earned two of the marks below,
// grouped by the year they got in, plus the games one mark away. Uses eraList() from eras.js for the Most Played of the
// Era mark. Most Played marks come from hours; Game of the Year is the score pick, as on the GotY page.

const HOF_MARKS_NEEDED = 2;
const HOF_HOURS = 100;
const HOF_YEARS = 5;
const HOF_MARKS = {
  hours: { label: `${HOF_HOURS} Hours`, note: `${HOF_HOURS} hours played` },
  years: { label: `${HOF_YEARS} Years`, note: `played in ${HOF_YEARS} different years` },
  decades: { label: 'Two Decades', note: 'completed in two different decades' },
  played: { label: 'Most Played of the Year', note: 'the game with the most hours in a finished calendar year' },
  era: { label: 'Most Played of the Era', note: 'the game with the most hours in a finished era' },
  goty: { label: '🏆 Game of the Year', note: 'the highest-scored game of its release year, as on the GotY page', score: true }
};

function initHallOfFamePage() {
  const container = document.getElementById('halloffame-page-container');
  if (!container || !rawData || !rawData.allEntries) return;
  const games = hallOfFameMarks();
  const inducted = games.filter(g => g.marks.length >= HOF_MARKS_NEEDED);
  const ballot = games.filter(g => g.marks.length === HOF_MARKS_NEEDED - 1).sort((a, b) => b.seconds - a.seconds);
  const classes = new Map();
  inducted.sort((a, b) => b.inducted.localeCompare(a.inducted)).forEach(g => {
    const year = g.inducted.slice(0, 4);
    if (!classes.has(year)) classes.set(year, []);
    classes.get(year).push(g);
  });
  const markChip = m => {
    const mark = HOF_MARKS[m.id], inner = `${mark.label}${m.detail ? ` <em>${escapeHTML(m.detail)}</em>` : ''}`;
    return mark.score
      ? `<a class="hof-mark hof-goty" href="goty.html#year-${encodeURIComponent(m.year)}" title="${escapeHTML(mark.note)}">${inner}</a>`
      : `<span class="hof-mark" title="${escapeHTML(mark.note)}">${inner}</span>`;
  };
  const markList = ids => ids.map(id => `<b>${HOF_MARKS[id].label}</b> (${HOF_MARKS[id].note})`).join(', ');
  const card = g => `<div class="hof-card">
      <h3><a href="${gameProfileUrl(g.game)}" class="hover-trigger" data-game="${escapeHTML(g.game)}">${escapeHTML(g.game)}</a></h3>
      <div class="hub-sub">Inducted ${formatFullDate(g.inducted)} · ${formatTime(g.seconds)} · ${g.yearsPlayed} ${g.yearsPlayed === 1 ? 'year' : 'years'} played</div>
      <div class="hof-marks">${g.marks.map(markChip).join('')}</div>
    </div>`;

  container.innerHTML = `
    <div class="card-row grid-1"><h2 class="page-title">Hall of Fame</h2></div>
    <div class="page-stack">
      <section class="card-row grid-1"><div class="card" style="max-height: none;">
        <div class="card-header"><h2>${inducted.length} Inductees</h2></div>
        <div class="card-content">
          <p class="viz-note">A game gets in on the day it earns ${HOF_MARKS_NEEDED} of these ${Object.keys(HOF_MARKS).length} marks.
            Playtime marks: ${markList(Object.keys(HOF_MARKS).filter(id => !HOF_MARKS[id].score))}.
            Score mark: ${markList(Object.keys(HOF_MARKS).filter(id => HOF_MARKS[id].score))}, dated the day it was first played, or the end of its release year if that came later.</p>
          ${[...classes.entries()].map(([year, list]) => `
            <h3 class="hof-class">Class of ${year} <span class="goty-gap-count">${list.length}</span></h3>
            <div class="hof-grid">${list.map(card).join('')}</div>`).join('')}
        </div>
      </div></section>
      <section class="card-row grid-1"><div class="card" style="max-height: none;">
        <div class="card-header"><h2>On the Ballot <span class="goty-gap-count">${ballot.length}</span></h2></div>
        <div class="card-content">
          <p class="viz-note">Games with one mark so far, most played first.</p>
          <div class="hof-ballot">${ballot.map(g => `<div><span class="hover-trigger" data-game="${escapeHTML(g.game)}">${escapeHTML(g.game)}</span> ${markChip(g.marks[0])}</div>`).join('')}</div>
        </div>
      </div></section>
    </div>`;
}

// Every game with at least one mark: { game, seconds, yearsPlayed, marks: [{ id, date, detail }], inducted }
function hallOfFameMarks() {
  const games = new Map();
  const gameOf = name => {
    if (!games.has(name)) games.set(name, { game: name, seconds: 0, years: new Set(), marks: [] });
    return games.get(name);
  };
  const byYear = new Map();
  rawData.allEntries.forEach(e => {
    const g = gameOf(e.game), sec = timeStringToSeconds(e.time), day = e.date.slice(0, 10), year = day.slice(0, 4);
    const before = g.seconds;
    g.seconds += sec;
    if (before < HOF_HOURS * 3600 && g.seconds >= HOF_HOURS * 3600) g.marks.push({ id: 'hours', date: day, detail: year });
    if (!g.years.has(year)) {
      g.years.add(year);
      if (g.years.size === HOF_YEARS) g.marks.push({ id: 'years', date: day, detail: year });
    }
    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year).set(e.game, (byYear.get(year).get(e.game) || 0) + sec);
  });
  // Completions of the main game in two different decades, dated by the first one in the second decade
  const decades = new Map();
  getSortedCompletions('All-Time').forEach(pt => {
    const date = pt.displayDate.toISOString().slice(0, 10), decade = date.slice(0, 3);
    if (!decades.has(pt.gameName)) decades.set(pt.gameName, new Set());
    const seen = decades.get(pt.gameName);
    if (seen.has(decade)) return;
    seen.add(decade);
    if (seen.size === 2) gameOf(pt.gameName).marks.push({ id: 'decades', date, detail: `${[...seen][0]}0s & ${decade}0s` });
  });
  // The most played game of each finished year and era, dated by its last day
  const latestYear = dataDateKey().slice(0, 4), yearDone = year => year < latestYear || dataDateKey().slice(5) === '12-31';
  byYear.forEach((totals, year) => {
    if (yearDone(year)) gameOf(topOfMap(totals, 1)[0][0]).marks.push({ id: 'played', date: `${year}-12-31`, detail: year });
  });
  eraList().filter(era => !era.inProgress).forEach(era => {
    gameOf(topOfMap(era.sum.games, 1)[0][0]).marks.push({ id: 'era', date: `${era.end}-12-31`, detail: era.label });
  });
  // Game of the Year by score: the top-scored game of each finished release year (ties go A-Z, like the GotY page),
  // if it's in the log. Dated the day it was first played, or the end of its release year if that came later.
  const firstPlayed = new Map();
  rawData.allEntries.forEach(e => { if (!firstPlayed.has(e.game)) firstPlayed.set(e.game, e.date.slice(0, 10)); });
  const winners = new Map();
  metaGames.filter(m => m.score !== null && /^\d{4}$/.test(m.releaseYear) && yearDone(m.releaseYear)).forEach(m => {
    const best = winners.get(m.releaseYear);
    if (!best || m.score > best.score || (m.score === best.score && m.name.localeCompare(best.name) < 0)) winners.set(m.releaseYear, m);
  });
  winners.forEach((m, year) => {
    if (!firstPlayed.has(m.name)) return;
    const yearEnd = `${year}-12-31`, date = firstPlayed.get(m.name) > yearEnd ? firstPlayed.get(m.name) : yearEnd;
    gameOf(m.name).marks.push({ id: 'goty', date, year, detail: `${year} · ${formatScore(m.score)}` });
  });
  return [...games.values()].filter(g => g.marks.length > 0).map(g => {
    g.marks.sort((a, b) => a.date.localeCompare(b.date));
    // Several Most Played of the Year marks still count once toward getting in
    const distinct = [];
    g.marks.forEach(m => { if (!distinct.some(d => d.id === m.id)) distinct.push(m); });
    const yearMarks = g.marks.filter(m => m.id === 'played');
    if (yearMarks.length > 1) distinct.find(m => m.id === 'played').detail = yearMarks.map(m => m.detail).join(', ');
    g.marks = distinct;
    g.yearsPlayed = g.years.size;
    g.inducted = g.marks.length >= HOF_MARKS_NEEDED ? g.marks[HOF_MARKS_NEEDED - 1].date : null;
    return g;
  });
}
