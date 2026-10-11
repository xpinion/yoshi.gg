// partner.js - The Partners page (partner.html?name=...): everything played with one multiplayer partner.

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function initPartnerPage() {
  const container = document.getElementById('partner-page-container');
  if (!container || !rawData || !rawData.allEntries) return;

  // Each partner, plus everyone together when there's more than one
  const partners = getPartners().map(p => ({ name: p.name, entries: partnerEntries(p) }));
  if (partners.length > 1) {
    const all = getPartners();
    partners.push({
      name: 'Family',
      entries: rawData.allEntries.filter(e => isMultiplayerEntry(e) && all.every(p => p.noteNames.some(n => (e.note || '').toUpperCase().includes(n))))
    });
  }
  if (partners.length === 0) {
    container.innerHTML = '<div class="loading-text">The partner list arrives with the next data sync.</div>';
    return;
  }

  const requested = new URLSearchParams(window.location.search).get('name');
  const initial = partners.find(p => p.name === requested) || partners[0];
  container.innerHTML = `
    <div class="card-row grid-1">
      <h2 class="page-title">Played with
        <select id="partner-select" class="header-dropdown card-title-lg">${partners.map(p => `<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`).join('')}</select>
      </h2>
    </div>
    <div id="partner-body" class="page-stack"></div>
  `;
  const select = document.getElementById('partner-select');
  select.value = initial.name;
  const allMultiplayerSeconds = rawData.allEntries.filter(isMultiplayerEntry).reduce((sum, e) => sum + timeStringToSeconds(e.time), 0);
  const render = partner => {
    document.title = `${partner.name} | yoshi xcx's Videogame Dashboard`;
    document.getElementById('partner-body').innerHTML = partnerBodyHtml(partner, allMultiplayerSeconds);
  };
  select.addEventListener('change', () => {
    const partner = partners.find(p => p.name === select.value);
    history.replaceState(null, '', `?name=${encodeURIComponent(partner.name)}`);
    render(partner);
  });
  render(initial);
}

function partnerBodyHtml(partner, allMultiplayerSeconds) {
  const sum = summarizeEntries(partner.entries);
  if (sum.sessions === 0) return `<div class="loading-text">No multiplayer sessions mention ${escapeHTML(partner.name)}.</div>`;

  const streak = longestDayStreak(sum.days);
  const stat = (label, value, sub = '') => `<div class="card hub-stat-card"><div class="sys-widget-title">${label}</div><div class="sys-widget-value hub-value-md">${value}</div><div class="sys-widget-sub">${sub}</div></div>`;
  const firstYear = Number(rawData.allEntries[0].date.slice(0, 4)), lastYear = getDataDate().getFullYear();
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => String(firstYear + i));
  const bars = (items, max) => `<div class="tf-strip tf-strip-months partner-bars">${items.map(i => `<div class="tf-month" title="${escapeHTML(i.tip)}"><div class="tf-month-fill" style="height: ${(i.value / Math.max(1, max)) * 100}%;"></div><span>${escapeHTML(i.label)}</span></div>`).join('')}</div>`;
  const yearItems = years.map(y => ({ label: y, value: sum.byYear[y] || 0, tip: `${y}: ${formatTime(sum.byYear[y] || 0)}` }));
  const weekdayItems = WEEKDAY_NAMES.map((name, d) => ({ label: name.slice(0, 3), value: sum.byWeekday[d], tip: `${name}: ${formatTime(sum.byWeekday[d])}` }));

  // Per game: time, days and the systems it was played on together
  const gameInfo = {};
  partner.entries.forEach(e => {
    const info = gameInfo[e.game] = gameInfo[e.game] || { days: new Set(), systems: new Set(), completed: null };
    info.days.add(e.date.slice(0, 10));
    info.systems.add(e.system);
    if (e.status === 'M-Completed') info.completed = e.date;
  });
  const gameRows = topOfMap(sum.games, 25).map(([game, sec]) => ({
    title: game, game, badge: formatTime(sec),
    sub: `${[...gameInfo[game].systems].join(', ')} · ${gameInfo[game].days.size} day${gameInfo[game].days.size === 1 ? '' : 's'}`
  }));
  const mapRows = map => topOfMap(map, 10).map(([name, sec]) => ({ title: name, badge: formatTime(sec), sub: `${((sec / sum.seconds) * 100).toFixed(1)}% of the time together` }));
  const longest = [...partner.entries].sort((a, b) => timeStringToSeconds(b.time) - timeStringToSeconds(a.time)).slice(0, 10)
    .map(e => ({ title: e.game, game: e.game, sub: `${e.system} · ${formatFullDate(e.date)}`, badge: formatTime(timeStringToSeconds(e.time)) }));
  const completed = Object.entries(gameInfo).filter(([, info]) => info.completed).sort((a, b) => new Date(b[1].completed) - new Date(a[1].completed))
    .map(([game, info]) => ({ title: game, game, rank: formatFullDate(info.completed).slice(0, 4), sub: `${[...info.systems].join(', ')} · completed ${formatFullDate(info.completed)}`, badge: formatTime(sum.games.get(game)) }));
  const recent = partner.entries.slice(-25).reverse();

  return `
    <section class="card-row grid-4">
      ${stat('Time Together', formatTime(sum.seconds), `${((sum.seconds / Math.max(1, allMultiplayerSeconds)) * 100).toFixed(1)}% of all multiplayer time`)}
      ${stat('Days', sum.days.size, `${sum.sessions} sessions`)}
      ${stat('Games', sum.games.size, `${completed.length} completed together`)}
      ${stat('Longest Session', formatTime(sum.longest.sec), `${escapeHTML(sum.longest.entry.game)} · ${formatFullDate(sum.longest.entry.date)}`)}
      ${stat('Longest Day Streak', `${streak.length} day${streak.length === 1 ? '' : 's'}`, `${formatFullDate(streak.start)} to ${formatFullDate(streak.end)}`)}
      ${stat('First Session', formatFullDate(sum.first.date), escapeHTML(sum.first.game))}
      ${stat('Latest Session', formatFullDate(sum.last.date), escapeHTML(sum.last.game))}
      ${stat('Average Session', formatTime(sum.seconds / sum.sessions), `${formatTime(sum.seconds / sum.days.size)} per day played`)}
    </section>

    <section class="card-row grid-2">
      <div class="card">
        <div class="card-header"><h2>Time by Year</h2></div>
        <div class="card-content">${bars(yearItems, Math.max(...yearItems.map(i => i.value)))}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Time by Weekday</h2></div>
        <div class="card-content">${bars(weekdayItems, Math.max(...weekdayItems.map(i => i.value)))}</div>
      </div>
    </section>

    <section class="card-row grid-3">
      <div class="card">
        <div class="card-header"><h2>Most Played Together</h2></div>
        <div class="card-content">${rankedListHtml(gameRows)}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Longest Sessions</h2></div>
        <div class="card-content">${rankedListHtml(longest)}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Completed Together <span class="goty-gap-count">${completed.length}</span></h2></div>
        <div class="card-content">${rankedListHtml(completed, 'No games completed together yet.')}</div>
      </div>
    </section>

    <section class="card-row grid-3">
      <div class="card">
        <div class="card-header"><h2>Systems</h2></div>
        <div class="card-content">${rankedListHtml(mapRows(sum.systems))}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Genres</h2></div>
        <div class="card-content">${rankedListHtml(mapRows(sum.genres))}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Franchises</h2></div>
        <div class="card-content">${rankedListHtml(mapRows(sum.series), 'No franchise games.')}</div>
      </div>
    </section>

    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>Latest Sessions</h2></div>
        <div class="card-content hub-flush">
          <div class="monthly-table-wrapper hub-pad">
            <table class="monthly-table" style="min-width: 800px;">
              <thead><tr><th>Date</th><th>Videogame</th><th>System</th><th>Time</th><th>Details</th></tr></thead>
              <tbody>${recent.map(e => `
                <tr>
                  <td class="text-center hub-bold">${formatFullDate(e.date)}</td>
                  <td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(e.game)}">${escapeHTML(e.game)}</span></td>
                  <td class="text-center">${escapeHTML(e.system)}</td>
                  <td class="text-center">${e.time}</td>
                  <td class="text-left">${escapeHTML(e.note)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  `;
}
