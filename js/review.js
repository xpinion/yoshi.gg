// review.js - The Year in Review page (review.html?year=...): one year of the log on a single page.

function initReviewPage() {
  const container = document.getElementById('review-page-container');
  if (!container || !rawData || !rawData.allEntries) return;

  const years = [...new Set(rawData.allEntries.map(e => e.date.slice(0, 4)))].sort().reverse();
  const requested = new URLSearchParams(window.location.search).get('year');
  container.innerHTML = `
    <div class="card-row grid-1">
      <h2 class="page-title">
        <select id="review-year" class="header-dropdown card-title-lg">${years.map(y => `<option value="${y}">${y}</option>`).join('')}</select>
        in Review
      </h2>
      ${typeof openShareCard === 'function' ? `<div class="share-row">${shareButtonHtml('id="review-share"')}</div>` : ''}
    </div>
    <div id="review-body" class="page-stack"></div>
  `;
  const select = document.getElementById('review-year');
  select.value = years.includes(requested) ? requested : years[0];
  const render = () => {
    document.title = `${select.value} in Review | yoshi xcx's Videogame Dashboard`;
    document.getElementById('review-body').innerHTML = reviewBodyHtml(select.value);
  };
  select.addEventListener('change', () => { history.replaceState(null, '', `?year=${select.value}`); render(); });
  render();

  const shareButton = document.getElementById('review-share');
  if (shareButton) shareButton.addEventListener('click', () => openShareCard(buildGroupCard('year', select.value)));
}

function reviewBodyHtml(year) {
  const entries = rawData.allEntries.filter(e => e.date.startsWith(year));
  const sum = summarizeEntries(entries);
  const today = dataDateKey();
  const inProgress = today.startsWith(year);
  // The year before, cut off at the same day of the year when this one is still in progress
  const prevYear = String(Number(year) - 1);
  const prevEntries = rawData.allEntries.filter(e => e.date.startsWith(prevYear) && (!inProgress || e.date.slice(5, 10) <= today.slice(5)));
  const prev = prevEntries.length ? summarizeEntries(prevEntries) : null;
  const completionsOf = y => getSortedCompletions(y);
  const completions = completionsOf(year);
  const prevCompletions = prev ? completionsOf(prevYear).filter(pt => !inProgress || pt.displayDate.toISOString().slice(5, 10) <= today.slice(5)).length : 0;

  // Games first played this year
  const firstPlayed = {};
  rawData.allEntries.forEach(e => { if (!firstPlayed[e.game]) firstPlayed[e.game] = e.date.slice(0, 4); });
  const newGames = [...sum.games.keys()].filter(g => firstPlayed[g] === year);

  const dayTotals = {}, gameDays = {};
  entries.forEach(e => {
    const day = e.date.slice(0, 10);
    dayTotals[day] = (dayTotals[day] || 0) + timeStringToSeconds(e.time);
    (gameDays[e.game] = gameDays[e.game] || new Set()).add(day);
  });
  const bestDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
  const bestMonth = Object.entries(sum.byMonth).sort((a, b) => b[1] - a[1])[0];
  const streak = longestDayStreak(sum.days);
  const daysSoFar = inProgress ? Math.round((Date.parse(today) - Date.parse(`${year}-01-01`)) / 86400000) + 1 : (Number(year) % 4 === 0 ? 366 : 365);

  const versus = (now, before, show = formatTime) => {
    if (!prev) return '';
    const diff = now - before;
    return `<span class="tf-compare ${diff >= 0 ? 'tf-up' : 'tf-down'}">${diff >= 0 ? '▲' : '▼'} ${show(Math.abs(diff))} vs ${prevYear}${inProgress ? ' at this point' : ''}</span>`;
  };
  const plain = v => String(Math.round(v));
  const ranks = yearRankings(year), rank = key => yearRankHtml(ranks[key], ranks.partial);
  const stat = (label, value, extra = '') => `<div class="tf-stat"><span class="sys-widget-title">${label}</span><strong>${value}</strong>${extra}</div>`;
  const sub = text => `<span class="tf-sub">${text}</span>`;

  const months = MONTH_NAMES.map((name, m) => ({ name: name.slice(0, 3), sec: sum.byMonth[`${year}-${String(m + 1).padStart(2, '0')}`] || 0 }));
  const maxMonth = Math.max(1, ...months.map(m => m.sec));

  const gameRows = topOfMap(sum.games, 15).map(([game, sec]) => ({
    title: game, game, badge: formatTime(sec),
    sub: `${gameDays[game].size} day${gameDays[game].size === 1 ? '' : 's'} · ${((sec / sum.seconds) * 100).toFixed(1)}% of the year${firstPlayed[game] === year ? ' · new this year' : ''}`
  }));
  const mapRows = map => topOfMap(map, 8).map(([name, sec]) => ({ title: name, badge: formatTime(sec), sub: `${((sec / sum.seconds) * 100).toFixed(1)}% of the year` }));
  const completionRows = [...completions].reverse().map(pt => {
    const score = getGameScore(pt.gameName);
    return { title: pt.gameName, game: pt.gameName, rank: formatShortDate(pt.displayDate), sub: `${toList(pt.systems).join(', ')}${score !== null ? ` · score ${formatScore(score)}` : ''}`, badge: pt.finalPtLifetime };
  });
  const scoredCompletions = completions.map(pt => ({ pt, score: getGameScore(pt.gameName) })).filter(c => c.score !== null).sort((a, b) => b.score - a.score);
  const releases = metaGames.filter(g => g.releaseYear === year && g.score !== null && sum.games.has(g.name)).sort((a, b) => b.score - a.score);

  const partnerStats = getPartners().map(p => ({ name: p.name, sum: summarizeEntries(partnerEntries(p).filter(e => e.date.startsWith(year))) })).filter(p => p.sum.sessions > 0);

  const milestones = (rawData.metrics.milestones || []).filter(m => String(m.date).startsWith(year));
  const records = milestones.filter(m => m.type === 'record');
  const highlights = milestones.filter(m => m.type === 'first' || m.type === 'hours' || m.type === 'anniversary' || /unique game:|th entry:/.test(m.details));

  return `
    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>${year} at a Glance${inProgress ? ` <span class="goty-gap-count">through ${formatFullDate(today)}</span>` : ''}</h2></div>
        <div class="card-content">
          <div class="tf-stats">
            ${stat('Time Played', formatTime(sum.seconds), versus(sum.seconds, prev ? prev.seconds : 0) + rank('seconds'))}
            ${stat('Days Played', sum.days.size, sub(`of ${daysSoFar} · ${formatTime(sum.seconds / Math.max(1, sum.days.size))} per day played`) + rank('days'))}
            ${stat('Games', sum.games.size, versus(sum.games.size, prev ? prev.games.size : 0, plain) + rank('games'))}
            ${stat('New Games', newGames.length, sub(`${sum.games.size - newGames.length} returning`) + rank('newGames'))}
            ${stat('Completions', completions.length, versus(completions.length, prevCompletions, plain) + rank('completions'))}
            ${stat('Longest Streak', `${streak.length} days`, sub(`${formatFullDate(streak.start)} to ${formatFullDate(streak.end)}`))}
            ${stat('Longest Session', formatTime(sum.longest.sec), sub(`${escapeHTML(sum.longest.entry.game)} · ${formatFullDate(sum.longest.entry.date)}`))}
            ${stat('Busiest Day', formatTime(bestDay[1]), sub(formatFullDate(bestDay[0])))}
            ${stat('Busiest Month', formatTime(bestMonth[1]), sub(MONTH_NAMES[Number(bestMonth[0].slice(5)) - 1]))}
            ${stat('Multiplayer', formatTime(sum.multiplayerSeconds), sub(`${((sum.multiplayerSeconds / sum.seconds) * 100).toFixed(1)}% of the year`))}
          </div>
          <div class="tf-strip tf-strip-months">${months.map(m => `<div class="tf-month" title="${m.name} ${year}: ${formatTime(m.sec)}"><div class="tf-month-fill" style="height: ${(m.sec / maxMonth) * 100}%;"></div><span>${m.name}</span></div>`).join('')}</div>
        </div>
      </div>
    </section>

    ${similarYearsHtml(year)}

    <section class="card-row grid-2">
      <div class="card">
        <div class="card-header"><h2>Most Played Games</h2></div>
        <div class="card-content">${rankedListHtml(gameRows)}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Completions <span class="goty-gap-count">${completions.length}</span></h2></div>
        <div class="card-content">${rankedListHtml(completionRows, 'No completions this year.')}</div>
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

    <section class="card-row grid-3">
      <div class="card">
        <div class="card-header"><h2>Best Completions by Score</h2></div>
        <div class="card-content">${rankedListHtml(scoredCompletions.slice(0, 10).map(c => ({ title: c.pt.gameName, game: c.pt.gameName, sub: `${toList(c.pt.systems).join(', ')} · completed ${formatFullDate(c.pt.displayDate)}`, badge: formatScore(c.score) })), 'No scored completions.')}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Best ${year} Releases Played</h2></div>
        <div class="card-content">${rankedListHtml(releases.slice(0, 10).map(g => ({ title: g.name, game: g.name, sub: `${g.genre} · ${formatTime(sum.games.get(g.name))} this year`, badge: formatScore(g.score) })), `No scored ${year} releases played.`)}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Played With</h2></div>
        <div class="card-content">${rankedListHtml(partnerStats.map(p => {
          const [game, sec] = topOfMap(p.sum.games, 1)[0];
          return { title: p.name, rank: '', sub: `${p.sum.days.size} days · ${p.sum.games.size} games · most played ${game} (${formatTime(sec)})`, badge: formatTime(p.sum.seconds) };
        }), getPartners().length ? 'No partner sessions this year.' : 'The partner list arrives with the next data sync.')}</div>
      </div>
    </section>

    <section class="card-row grid-2">
      <div class="card">
        <div class="card-header"><h2>Records Set <span class="goty-gap-count">${records.length}</span></h2></div>
        <div class="card-content">${records.length ? records.slice(0, 40).map(milestoneItemHtml).join('') + (records.length > 40 ? `<a class="toc-link review-more" href="milestones.html">All ${records.length} on the Milestones page</a>` : '') : '<div class="loading-text">No Spotlight records changed hands.</div>'}</div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Firsts and Round Numbers <span class="goty-gap-count">${highlights.length}</span></h2></div>
        <div class="card-content">${highlights.length ? highlights.map(milestoneItemHtml).join('') : '<div class="loading-text">Nothing this year.</div>'}</div>
      </div>
    </section>

    ${spotlightMedalsHtml(year, inProgress)}
  `;
}

// --- SPOTLIGHT MEDALS ---
// Gold, silver and bronze for every Spotlight list the year placed on, from rawData.metrics.spotlightPodiums (one per
// list, in Spotlight's order; built by buildListPodium in DataAggregator.gs). Rows are
// [place, name, context, value, start, end, detail, tied, who].
// Sections that start open; the long per-genre, per-system and other metadata sections start closed
const MEDAL_OPEN_CATEGORIES = ['Playtime & Activity', 'Co-Op & Multiplayer', 'Streaks & Habits', 'Completions & Abandons', 'Holidays', 'Best of Each Month', 'Best of Each Season'];
const MEDAL_NAMES = ['', 'gold', 'silver', 'bronze'];
const MEDAL_TABLE_SHOWN = 15;
const ALLTIME_PODIUMS_SHOWN = 12;

function medalHtml(place, big = false) {
  return place >= 1 && place <= 3
    ? `<span class="medal medal-${MEDAL_NAMES[place]}${big ? ' medal-big' : ''}" title="${['', '1st', '2nd', '3rd'][place]} place">${place}</span>`
    : `<span class="medal medal-none" title="${ordinalText(place)} place">${place || '-'}</span>`;
}
function ordinalText(n) {
  return n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
}

function spotlightMedalsHtml(year, inProgress) {
  const medals = spotlightMedals(year);
  if (!medals) return '';
  const soFar = inProgress ? ' so far' : '';
  const { podiums, lists, tables, counts, slugs } = medals;
  if (!lists.length) return '';
  const kinds = MEDAL_KIND_ORDER.filter(k => tables[k] && tables[k].size);
  const medalTableHtml = kind => {
    const rows = sortedMedalRows(tables[kind]);
    let place = 0;
    const html = rows.map((t, i) => {
      const prev = rows[i - 1];
      if (!prev || prev.medals.join() !== t.medals.join()) place = i + 1;
      const total = t.medals[1] + t.medals[2] + t.medals[3];
      return `<tr class="${i >= MEDAL_TABLE_SHOWN ? 'medal-extra' : ''}" data-tip="${escapeHTML(t.lists.slice(0, 12).join('\n') + (t.lists.length > 12 ? `\n+ ${t.lists.length - 12} more` : ''))}">
        <td class="medal-table-rank">${place}</td>
        <td class="medal-table-name">${kind === 'Games' ? `<span class="hover-trigger" data-game="${escapeHTML(t.who)}">${escapeHTML(t.who)}</span>` : escapeHTML(t.who)}</td>
        <td class="medal-count">${t.medals[1] || ''}</td><td class="medal-count">${t.medals[2] || ''}</td><td class="medal-count">${t.medals[3] || ''}</td>
        <td class="medal-total">${total}</td></tr>`;
    }).join('');
    return `<div class="medal-table-panel" data-kind="${kind}"${kind === kinds[0] ? '' : ' hidden'}>
      <table class="medal-table"><thead><tr><th></th><th>${kind === 'Games' ? 'Game' : kind.replace(/s$/, '').replace(/Serie$/, 'Series')}</th>
        <th>${medalHtml(1)}</th><th>${medalHtml(2)}</th><th>${medalHtml(3)}</th><th>Total</th></tr></thead><tbody>${html}</tbody></table>
      ${rows.length > MEDAL_TABLE_SHOWN ? `<button type="button" class="medal-more" data-more="${rows.length - MEDAL_TABLE_SHOWN}">Show all ${rows.length}</button>` : ''}
    </div>`;
  };

  // All-time podiums: entries from this year in the top three of a list's all-time side. An entry counts when it ended
  // this year and either started this year or lasted at most 120 days (a winter, a streak over New Year), so lifetime
  // totals that merely include this year don't
  const dayOf = text => /^\d{4}\/\d{2}\/\d{2}$/.test(text) ? Date.parse(text.replace(/\//g, '-')) : NaN;
  const allTime = [];
  podiums.forEach((p, i) => (p.a || []).forEach(r => {
    const start = dayOf(String(r[4])), end = dayOf(String(r[5]));
    if (!String(r[5]).startsWith(year) || !(r[0] >= 1 && r[0] <= 3)) return;
    if (String(r[4]).startsWith(year) || (end - start) / 86400000 <= 120) allTime.push({ p, slug: slugs[i], row: r });
  }));
  allTime.sort((a, b) => a.row[0] - b.row[0] || a.p.t.localeCompare(b.p.t));

  const isRecord = (p, r) => r[0] === 1 && p.a && p.a.some(a => a[0] === 1 && a[1] === r[1] && String(a[3]) === String(r[3]));
  const nameHtml = (p, r) => {
    const name = r[8] && p.k === 'Games' ? `<span class="hover-trigger" data-game="${escapeHTML(r[8])}">${escapeHTML(r[1])}</span>` : escapeHTML(r[1]);
    return `${name}${r[7] > 3 ? ` <span class="podium-tied">and ${r[7] - 1} more tied</span>` : r[7] ? ' <span class="podium-tied">tied</span>' : ''}`;
  };
  const podiumCard = p => {
    if (p.annual) {
      const r = p.rows[0];
      return `<div class="podium-card podium-annual${r[0] <= 3 ? ` podium-place-${r[0]}` : ''}">
        <a class="podium-title toc-link" href="spotlight.html#${p.slug}">${escapeHTML(p.t)}</a>
        <div class="podium-row">${medalHtml(r[0])}<div class="podium-text"><span class="podium-name">${r[7] ? 'Tied ' : ''}${ordinalText(r[0])} of ${p.n} years${soFar}</span>
          ${r[6] || r[1] ? `<span class="podium-sub">${escapeHTML(r[6] || r[1])}</span>` : ''}</div>
          <span class="podium-value">${escapeHTML(String(r[3]))}${isRecord(p, r) ? ' <span class="podium-star" title="Also the all-time record">★</span>' : ''}</span></div>
      </div>`;
    }
    return `<div class="podium-card">
      <a class="podium-title toc-link" href="spotlight.html#${p.slug}">${escapeHTML(p.t)}</a>
      ${p.rows.map(r => `<div class="podium-row">${medalHtml(r[0])}<div class="podium-text"><span class="podium-name">${nameHtml(p, r)}${r[2] && !/^\d+ Games?$/.test(r[2]) && r[2] !== '-' ? ` <span class="podium-context">${escapeHTML(r[2])}</span>` : ''}</span>
          ${r[6] ? `<span class="podium-sub">${escapeHTML(r[6])}</span>` : r[4] && r[4] !== '-' && !p.k ? `<span class="podium-sub">${escapeHTML(r[4] === r[5] ? r[4] : `${r[4]} – ${r[5]}`)}</span>` : ''}</div>
        <span class="podium-value">${escapeHTML(String(r[3]))}${isRecord(p, r) ? ' <span class="podium-star" title="Also the all-time record">★</span>' : ''}</span></div>`).join('')}
    </div>`;
  };

  const categories = [];
  lists.forEach(p => {
    let c = categories.find(c => c.name === p.c);
    if (!c) categories.push(c = { name: p.c, lists: [] });
    c.lists.push(p);
  });

  return `
    <section class="card-row grid-1">
      <div class="card" style="max-height: none;" id="spotlight-medals">
        <div class="card-header"><h2>Spotlight Medals${soFar ? ` <span class="goty-gap-count">so far</span>` : ''}</h2></div>
        <div class="card-content">
          <div class="medal-summary">
            <div class="medal-summary-item">${medalHtml(1, true)}<strong>${counts[1]}</strong><span>gold</span></div>
            <div class="medal-summary-item">${medalHtml(2, true)}<strong>${counts[2]}</strong><span>silver</span></div>
            <div class="medal-summary-item">${medalHtml(3, true)}<strong>${counts[3]}</strong><span>bronze</span></div>
            <div class="medal-summary-note">across ${lists.length} of ${podiums.length} Spotlight lists with a ${year} entry</div>
          </div>
          ${allTime.length ? `
          <h3 class="medal-heading">All-Time Podiums <span>${allTime.length}</span></h3>
          <p class="medal-note">Entries from ${year} that rank in the top three of a list's all-time side.</p>
          <div class="alltime-podiums">${allTime.map(({ p, slug, row }, i) => `
            <a class="alltime-podium alltime-place-${row[0]}${i >= ALLTIME_PODIUMS_SHOWN ? ' alltime-extra' : ''}" href="spotlight.html#${slug}">
              ${medalHtml(row[0], true)}
              <span class="alltime-text">
                <span class="alltime-list">${escapeHTML(p.t)}</span>
                <strong title="${escapeHTML(row[1])}">${escapeHTML(row[1])}</strong>
                <span class="alltime-value">${escapeHTML(String(row[3]))} <span>#${row[0]} all-time</span></span>
              </span>
            </a>`).join('')}</div>
          ${allTime.length > ALLTIME_PODIUMS_SHOWN ? `<button type="button" class="medal-more alltime-more" data-count="${allTime.length}">Show all ${allTime.length}</button>` : ''}` : ''}
          ${kinds.length ? `
          <h3 class="medal-heading">Medal Table</h3>
          <p class="medal-note">Each counted once per list, at its best place. Hover a row for its lists.</p>
          <div class="medal-tabs" role="tablist">${kinds.map((k, i) => `<button type="button" class="medal-tab${i ? '' : ' active'}" data-kind="${k}">${k} <span>${tables[k].size}</span></button>`).join('')}</div>
          ${kinds.map(medalTableHtml).join('')}` : ''}
        </div>
      </div>
    </section>

    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="card-header"><h2>Every Spotlight Podium <span class="goty-gap-count">${lists.length} lists</span></h2></div>
        <div class="card-content">
          ${categories.map(c => `
          <details class="toc-category-wrapper medal-category"${MEDAL_OPEN_CATEGORIES.includes(c.name) ? ' open' : ''}>
            <summary><h3 class="toc-category-title">${escapeHTML(c.name)} <span class="toc-category-count">${c.lists.length}</span></h3></summary>
            <div class="podium-grid">${c.lists.map(podiumCard).join('')}</div>
          </details>`).join('')}
        </div>
      </div>
    </section>`;
}

// Medal table tabs and "show all", wired once for the page
document.addEventListener('click', e => {
  const tab = e.target.closest('.medal-tab');
  if (tab) {
    const card = tab.closest('.card');
    card.querySelectorAll('.medal-tab').forEach(t => t.classList.toggle('active', t === tab));
    card.querySelectorAll('.medal-table-panel').forEach(panel => { panel.hidden = panel.dataset.kind !== tab.dataset.kind; });
    return;
  }
  const allTimeMore = e.target.closest('.alltime-more');
  if (allTimeMore) {
    const grid = allTimeMore.previousElementSibling;
    const open = grid.classList.toggle('alltime-show-all');
    allTimeMore.textContent = open ? 'Show fewer' : `Show all ${allTimeMore.dataset.count}`;
    return;
  }
  const more = e.target.closest('.medal-more');
  if (more) {
    const panel = more.closest('.medal-table-panel');
    const open = panel.classList.toggle('medal-show-all');
    more.textContent = open ? 'Show fewer' : `Show all ${panel.querySelectorAll('tbody tr').length}`;
  }
});

// The years whose mix of genres and systems looks most like this one: each year as its share of hours by genre and
// by system, compared by cosine similarity (100% would be an identical mix)
const SIMILAR_YEARS_SHOWN = 3;
function similarYearsHtml(year) {
  const mixes = new Map();
  rawData.allEntries.forEach(e => {
    const y = e.date.slice(0, 4), sec = timeStringToSeconds(e.time);
    if (!mixes.has(y)) mixes.set(y, { genre: new Map(), system: new Map(), games: new Map() });
    const m = mixes.get(y);
    [['genre', e.genre], ['system', e.system], ['games', e.game]].forEach(([k, v]) => { if (v && v !== 'N/A' && v !== 'Unknown') m[k].set(v, (m[k].get(v) || 0) + sec); });
  });
  const mine = mixes.get(year);
  if (!mine || mixes.size < 2) return '';
  const shares = map => { const t = [...map.values()].reduce((a, b) => a + b, 0) || 1; return new Map([...map].map(([k, v]) => [k, v / t])); };
  const cosine = (a, b) => {
    let dot = 0, na = 0, nb = 0;
    a.forEach((v, k) => { dot += v * (b.get(k) || 0); na += v * v; });
    b.forEach(v => { nb += v * v; });
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  };
  const likeness = (a, b) => (cosine(shares(a.genre), shares(b.genre)) + cosine(shares(a.system), shares(b.system))) / 2;
  const others = [...mixes.entries()].filter(([y]) => y !== year).map(([y, m]) => {
    // What the two years have most in common: the genres and systems with the largest shared share
    const common = kind => { const a = shares(mine[kind]), b = shares(m[kind]); return [...a.keys()].filter(k => b.has(k)).sort((x, z) => Math.min(b.get(z), a.get(z)) - Math.min(b.get(x), a.get(x))).slice(0, 2); };
    return { year: y, score: likeness(mine, m), genres: common('genre'), systems: common('system'), top: topOfMap(m.games, 1)[0] };
  }).sort((a, b) => b.score - a.score);
  const rows = others.slice(0, SIMILAR_YEARS_SHOWN).map(o => ({
    title: o.year, rank: '', badge: `${Math.round(o.score * 100)}%`,
    sub: `Both heavy on ${[...o.genres, ...o.systems].join(', ')} · its top game was ${o.top[0]}`
  }));
  const least = others[others.length - 1];
  return `
    <section class="card-row grid-1">
      <div class="card">
        <div class="card-header"><h2>Years Most Like ${year}</h2></div>
        <div class="card-content">
          <div class="goty-gap-subtitle">By the mix of genres and systems played. The least alike: ${least.year} (${Math.round(least.score * 100)}%).</div>
          ${rankedListHtml(rows)}
        </div>
      </div>
    </section>`;
}
