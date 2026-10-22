// master.js - The All Games page: every game ever played, one row per playthrough grouped under its game, like the Yearly tables.

const MASTER_SORTS = {
  name: { label: 'A–Z', cmp: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) },
  updated: { label: 'Last updated', cmp: (a, b) => b.lastDate.localeCompare(a.lastDate) },
  time: { label: 'Lifetime time', cmp: (a, b) => b.seconds - a.seconds },
  days: { label: 'Lifetime days', cmp: (a, b) => b.days - a.days },
  started: { label: 'First played', cmp: (a, b) => b.startDate.localeCompare(a.startDate) },
  runs: { label: 'Most playthroughs', cmp: (a, b) => b.pts.length - a.pts.length }
};
// Status buttons match a game by the status of its latest playthrough
const MASTER_STATUSES = [
  { id: 'all', label: 'All', has: () => true },
  { id: 'completed', label: 'Completed', has: s => ['Completed', 'Postgame'].includes(s) },
  { id: 'multiplayer', label: 'Multiplayer & M-Completed', has: s => ['Multiplayer', 'M-Completed'].includes(s) },
  { id: 'active', label: 'Active', has: s => s === 'Active' },
  { id: 'abandoned', label: 'Abandoned', has: s => s === 'Abandoned' },
  { id: 'noncompletable', label: 'Non-Completable', has: s => s === 'Non-Completable' }
];

function initMasterPage() {
  const container = document.getElementById('master-page-container');
  if (!container || !rawData || !rawData.playthroughHistory) return;
  const games = buildMasterGames();
  const options = (values, label) => `<option value="all">All ${label}</option>` +
    [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
      .map(v => `<option value="${escapeHTML(String(v))}">${escapeHTML(String(v))}</option>`).join('');
  const counts = Object.fromEntries(MASTER_STATUSES.map(s => [s.id, games.filter(g => s.has(g.latest.finalStatus)).length]));

  container.innerHTML = `
    <section class="master-page">
      <h1 class="master-title">All Games</h1>
      <div class="milestone-type-buttons master-status-buttons">
        ${MASTER_STATUSES.map(s => `<button type="button" class="milestone-type${s.id === 'all' ? ' active' : ''}" data-status="${s.id}">${s.label} <span>${counts[s.id]}</span></button>`).join('')}
      </div>
      <div class="master-filters">
        <input type="search" id="master-search" class="spotlight-filter" placeholder="Filter by name…" aria-label="Filter by name">
        <select id="master-sort" class="milestone-year" aria-label="Sort by">
          ${Object.entries(MASTER_SORTS).map(([id, s]) => `<option value="${id}">Sort: ${s.label}</option>`).join('')}
        </select>
        <button type="button" id="master-reverse" class="spotlight-toggle-all" aria-pressed="false" title="Reverse the order">⇅ Reverse</button>
        <button type="button" id="master-expand" class="spotlight-toggle-all" aria-pressed="false">▶ Expand all playthroughs</button>
        <select id="master-system" class="milestone-year" aria-label="System">${options(games.flatMap(g => g.systems), 'systems')}</select>
        <select id="master-genre" class="milestone-year" aria-label="Genre">${options(games.map(g => g.latest.genre), 'genres')}</select>
        <select id="master-decade" class="milestone-year" aria-label="Release decade">${options(games.map(g => masterDecade(g.latest.releaseYear)), 'release decades')}</select>
        <button type="button" id="master-reset" class="spotlight-toggle-all">Reset</button>
      </div>
      <div id="master-letters" class="master-letters"></div>
      <div id="master-table"></div>
    </section>`;
  setupMasterControls(games);
}

// One record per game: its playthroughs (latest first), lifetime totals and the dates it spans
function buildMasterGames() {
  const byGame = {};
  Object.values(rawData.playthroughHistory).forEach(pt => { (byGame[pt.gameName] = byGame[pt.gameName] || []).push(pt); });
  return Object.entries(byGame).map(([name, pts]) => {
    pts.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.startDate.localeCompare(a.startDate));
    // A playthrough's finalGameLifetime is the game's total on its last day, so the latest one holds the game's lifetime
    const seconds = Math.max(...pts.map(pt => timeStringToSeconds(pt.finalGameLifetime)));
    const days = Math.max(...pts.map(pt => Number(pt.finalGameLifetimeDays) || 0));
    const systems = [...new Set(pts.flatMap(pt => pt.systems instanceof Set ? [...pt.systems] : [pt.system]))];
    return { name, pts, latest: pts[0], seconds, days, systems, lastDate: pts[0].lastDate,
      startDate: pts.reduce((m, pt) => pt.startDate < m ? pt.startDate : m, pts[0].startDate) };
  });
}
function masterDecade(year) { const y = parseInt(year, 10); return y ? `${Math.floor(y / 10) * 10}s` : ''; }
function masterLetter(name) { const c = name.charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; }

// Filters, sort and the URL (master.html?sort=time&status=completed links straight to a view)
function setupMasterControls(games) {
  const $ = id => document.getElementById(id);
  const state = { status: 'all', sort: 'name', reverse: false, q: '', system: 'all', genre: 'all', decade: 'all', expand: false };
  const params = new URLSearchParams(window.location.search);
  Object.keys(state).forEach(k => {
    if (!params.has(k)) return;
    state[k] = typeof state[k] === 'boolean' ? params.get(k) === '1' : params.get(k);
  });
  if (!MASTER_SORTS[state.sort]) state.sort = 'name';
  if (!MASTER_STATUSES.some(s => s.id === state.status)) state.status = 'all';

  const sync = () => {
    $('master-search').value = state.q; $('master-sort').value = state.sort; $('master-system').value = state.system;
    $('master-genre').value = state.genre; $('master-decade').value = state.decade;
    $('master-expand').setAttribute('aria-pressed', String(state.expand));
    $('master-expand').classList.toggle('active', state.expand);
    $('master-expand').textContent = state.expand ? '▼ Collapse all playthroughs' : '▶ Expand all playthroughs';
    $('master-reverse').setAttribute('aria-pressed', String(state.reverse));
    $('master-reverse').classList.toggle('active', state.reverse);
    document.querySelectorAll('.master-status-buttons .milestone-type').forEach(b => b.classList.toggle('active', b.dataset.status === state.status));
    ['system', 'genre', 'decade'].forEach(k => { if ($(`master-${k}`).value !== state[k]) state[k] = $(`master-${k}`).value = 'all'; });
  };
  const render = () => {
    const url = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => { if (v !== ({ status: 'all', sort: 'name', system: 'all', genre: 'all', decade: 'all' }[k] ?? (typeof v === 'boolean' ? false : ''))) url.set(k, v === true ? '1' : v); });
    history.replaceState(null, '', url.toString() ? `?${url}` : window.location.pathname);
    renderMasterTable(games, state);
  };
  const set = (k, v) => { state[k] = v; sync(); render(); };

  document.querySelectorAll('.master-status-buttons .milestone-type').forEach(b => b.addEventListener('click', () => set('status', b.dataset.status)));
  $('master-search').addEventListener('input', e => { state.q = e.target.value; render(); });
  $('master-sort').addEventListener('change', e => set('sort', e.target.value));
  $('master-reverse').addEventListener('click', () => set('reverse', !state.reverse));
  ['system', 'genre', 'decade'].forEach(k => $(`master-${k}`).addEventListener('change', e => set(k, e.target.value)));
  $('master-expand').addEventListener('click', () => set('expand', !state.expand));
  $('master-reset').addEventListener('click', () => {
    Object.assign(state, { status: 'all', sort: 'name', reverse: false, q: '', system: 'all', genre: 'all', decade: 'all', expand: false });
    sync(); render();
  });
  sync(); render();
}

function renderMasterTable(games, state) {
  const status = MASTER_STATUSES.find(s => s.id === state.status);
  const words = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = games.filter(g => status.has(g.latest.finalStatus) &&
    words.every(w => g.name.toLowerCase().includes(w)) &&
    (state.system === 'all' || g.systems.includes(state.system)) &&
    (state.genre === 'all' || g.latest.genre === state.genre) &&
    (state.decade === 'all' || masterDecade(g.latest.releaseYear) === state.decade));
  const byName = MASTER_SORTS.name.cmp;
  shown.sort((a, b) => MASTER_SORTS[state.sort].cmp(a, b) || byName(a, b));
  if (state.reverse) shown.reverse();

  const total = shown.reduce((s, g) => s + g.seconds, 0);
  const runs = shown.reduce((s, g) => s + g.pts.length, 0);
  const pct = n => { const v = n / games.length * 100; return ` (${v > 0 && v < 1 ? '<1' : Math.round(v)}%)`; };

  // A–Z jump links only make sense while the list is alphabetical
  const lettersEl = document.getElementById('master-letters');
  const firstOf = {};
  if (state.sort === 'name') shown.forEach((g, i) => { const l = masterLetter(g.name); if (!(l in firstOf)) firstOf[l] = i; });
  lettersEl.innerHTML = Object.keys(firstOf).map(l => `<a href="#master-letter-${l === '#' ? 'num' : l}">${l}</a>`).join('');
  lettersEl.hidden = state.sort !== 'name' || shown.length === 0;

  if (!shown.length) {
    document.getElementById('master-table').innerHTML = `<div class="loading-text">No games match.</div>`;
    return;
  }

  const ptCells = (g, pt, anchor) => `
    <td class="text-left"${anchor}><span class="hover-trigger" data-game="${escapeHTML(g.name)}">${escapeHTML(g.name)}</span></td>
    <td class="text-center">${escapeHTML(pt.systemDisplay || pt.system)}</td>
    <td class="text-center">${pt.finalPtLifetime}</td>
    <td class="text-center">${pt.finalPtLifetimeDays}</td>
    <td class="text-center">${formatHHMM(g.seconds)}</td>
    <td class="text-center">${g.days}</td>
    <td class="text-center">${formatFullDate(pt.startDate)}</td>
    <td class="text-center">${formatFullDate(pt.lastDate)}</td>
    <td class="text-center status-cell" style="background-color: ${getStatusColor(pt.finalStatus)};">${pt.finalStatus}</td>
    <td class="text-left"><button type="button" class="master-entries-btn" data-pt="${escapeHTML(pt.ptTag)}" aria-expanded="false">▸ Entries</button>${escapeHTML(pt.finalNote)}</td>`;

  let html = `<div class="monthly-table-wrapper"><table class="monthly-table master-table"><thead>
  <tr><th rowspan="2">Videogame</th><th rowspan="2">System</th><th colspan="2">Playthrough Lifetime</th><th colspan="2">Game Lifetime</th><th rowspan="2">Date Started</th><th rowspan="2">Last Updated</th><th rowspan="2">Game Status</th><th rowspan="2">Playthrough Details</th></tr>
  <tr><th>Time</th><th>Days</th><th>Time</th><th>Days</th></tr>
  </thead><tbody>
  <tr class="grand-total-row"><td colspan="2" class="text-left">${shown.length.toLocaleString()} game${shown.length !== 1 ? 's' : ''}${pct(shown.length)}</td><td colspan="2" class="text-center">${runs.toLocaleString()} playthroughs</td><td class="text-center">${formatHHMM(total)}</td><td colspan="5"></td></tr>`;

  shown.forEach((g, i) => {
    const letter = state.sort === 'name' && firstOf[masterLetter(g.name)] === i ? ` id="master-letter-${masterLetter(g.name) === '#' ? 'num' : masterLetter(g.name)}"` : '';
    html += `<tr class="active-row">${ptCells(g, g.latest, letter)}</tr>`;
    const past = g.pts.slice(1);
    if (!past.length) return;
    const groupId = `master-past-${i}`;
    const style = state.expand ? 'opacity: 0.65;' : 'display: none; opacity: 0.65;';
    html += `
      <tr class="accordion-toggle-row" onclick="toggleMasterPast('${groupId}', this)" style="cursor: pointer; background-color: rgba(0,0,0,0.03);">
      <td colspan="10" class="text-left" style="padding: 6px 12px; font-size: 0.85rem; color: #666;">
      <span class="toggle-icon">${state.expand ? '▼' : '▶'}</span> <span class="master-past-label" data-count="${past.length}">${masterPastLabel(past.length, state.expand)}</span>
      </td></tr>`;
    past.forEach(pt => { html += `<tr class="inactive-row ${groupId}" style="${style}">${ptCells(g, pt, '')}</tr>`; });
  });
  html += `</tbody></table></div>`;
  const table = document.getElementById('master-table');
  table.innerHTML = html;
  if (!table.dataset.wired) { table.dataset.wired = '1'; table.addEventListener('click', toggleMasterEntries); }
}

function masterPastLabel(n, open) { return `${open ? 'Hide' : 'Show'} ${n} Past Playthrough${n !== 1 ? 's' : ''}`; }
// Past playthroughs open and close like Yearly's; closing them also closes any entry lists they had open
function toggleMasterPast(groupId, toggleRow) {
  const rows = [...document.querySelectorAll(`tr.${groupId}`)];
  const opening = rows.some(r => r.style.display === 'none');
  rows.forEach(r => { r.style.display = opening ? 'table-row' : 'none'; });
  if (!opening) document.querySelectorAll(`tr.master-entries-row.${groupId}`).forEach(closeMasterEntries);
  toggleRow.querySelector('.toggle-icon').textContent = opening ? '▼' : '▶';
  const label = toggleRow.querySelector('.master-past-label');
  label.textContent = masterPastLabel(Number(label.dataset.count), opening);
}

// Every entry of one playthrough, newest first, in a row under it. The log loads on the first click.
let _masterEntriesByPt = null;
function closeMasterEntries(row) {
  const btn = row.previousElementSibling && row.previousElementSibling.querySelector('.master-entries-btn');
  if (btn) { btn.textContent = '▸ Entries'; btn.setAttribute('aria-expanded', 'false'); }
  row.remove();
}
function toggleMasterEntries(e) {
  const btn = e.target.closest('.master-entries-btn');
  if (!btn) return;
  const ptRow = btn.closest('tr');
  const open = ptRow.nextElementSibling;
  if (open && open.classList.contains('master-entries-row')) { closeMasterEntries(open); return; }
  btn.textContent = '… Loading'; btn.disabled = true;
  loadData(['entries']).then(() => {
    if (!_masterEntriesByPt) {
      _masterEntriesByPt = {};
      rawData.allEntries.forEach(en => { (_masterEntriesByPt[en.ptTag] = _masterEntriesByPt[en.ptTag] || []).push(en); });
      Object.values(_masterEntriesByPt).forEach(list => list.sort((a, b) => b.date.localeCompare(a.date) || Number(b.entryNum) - Number(a.entryNum)));
    }
    const list = _masterEntriesByPt[btn.dataset.pt] || [];
    const row = document.createElement('tr');
    row.className = 'master-entries-row ' + [...ptRow.classList].filter(c => c.startsWith('master-past-')).join(' ');
    row.innerHTML = `<td colspan="10"><table class="monthly-table master-entries-table"><thead><tr><th>Date</th><th>System</th><th>Time</th><th>Playthrough Time</th><th>Playthrough Days</th><th>Status</th><th>Play Note</th></tr></thead><tbody>
      ${list.map(en => `<tr><td class="text-center">${formatFullDate(en.date)}</td><td class="text-center">${escapeHTML(en.system)}</td><td class="text-center">${escapeHTML(en.time)}</td><td class="text-center">${escapeHTML(en.ptLifetime)}</td><td class="text-center">${en.ptLifetimeDays}</td><td class="text-center status-cell" style="background-color: ${getStatusColor(en.status)};">${escapeHTML(en.status)}</td><td class="text-left">${escapeHTML(en.note || '')}</td></tr>`).join('') || '<tr><td colspan="7">No entries found.</td></tr>'}
    </tbody></table></td>`;
    ptRow.after(row);
    btn.textContent = `▾ ${list.length} ${list.length === 1 ? 'entry' : 'entries'}`; btn.setAttribute('aria-expanded', 'true');
  }).catch(() => { btn.textContent = '▸ Entries'; }).finally(() => { btn.disabled = false; });
}
