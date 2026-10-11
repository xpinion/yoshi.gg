// milestones.js - The Milestones page.

// --- MILESTONES PAGE: filters by type, year, and text ---
const MILESTONE_TYPES = [
  { id: 'record', label: 'World Records' }, { id: 'ranking', label: 'Rankings' }, { id: 'count', label: 'Counts' },
  { id: 'hours', label: 'Hour Totals' }, { id: 'first', label: 'Firsts' }, { id: 'anniversary', label: 'Anniversaries' }
];

// Kinds of ranking milestone, told apart by their wording. The first match wins.
const RANKING_KINDS = [
  { id: 'hub', label: 'Series, Genres, Developers, Publishers', test: d => /in Most Played (Series|Genres|Developers|Publishers)|Top \d+ Most Played (Series|Genres|Developers|Publishers)/.test(d) },
  { id: 'system', label: 'Systems', test: d => /Most Played Systems|most played system of/.test(d) },
  { id: 'session', label: 'Sessions', test: d => /^A session of /.test(d) },
  { id: 'year', label: 'Game of a Year', test: d => /became the most played game of/.test(d) },
  { id: 'days', label: 'Games: Days Played', test: d => /Most Days Played/.test(d) },
  { id: 'time', label: 'Games: Time Played', test: () => true }
];
const rankingKindOf = m => RANKING_KINDS.find(k => k.test(m.details)).id;

function initMilestonesPage() {
  const container = document.getElementById('milestones-page-container');
  if (!container || !rawData || !rawData.metrics || !rawData.metrics.milestones) return;

  const milestones = rawData.metrics.milestones.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const typeOf = m => m.type || 'other';
  const counts = {};
  milestones.forEach(m => { counts[typeOf(m)] = (counts[typeOf(m)] || 0) + 1; });
  const types = MILESTONE_TYPES.filter(t => counts[t.id]);
  const kindCounts = {};
  milestones.forEach(m => { if (typeOf(m) === 'ranking') kindCounts[rankingKindOf(m)] = (kindCounts[rankingKindOf(m)] || 0) + 1; });
  const years = [...new Set(milestones.map(m => new Date(m.date).getUTCFullYear()))].sort((a, b) => b - a);

  container.innerHTML = `
    <div class="milestone-filters">
      <div class="milestone-type-buttons">
        <button type="button" class="milestone-type active" data-type="all">All <span>${milestones.length}</span></button>
        ${types.map(t => `<button type="button" class="milestone-type" data-type="${t.id}">${t.label} <span>${counts[t.id]}</span></button>`).join('')}
      </div>
      <div class="milestone-type-buttons milestone-kind-buttons" id="milestone-kinds" hidden>
        <button type="button" class="milestone-type milestone-kind active" data-kind="all">All rankings <span>${counts.ranking || 0}</span></button>
        ${RANKING_KINDS.filter(k => kindCounts[k.id]).map(k => `<button type="button" class="milestone-type milestone-kind" data-kind="${k.id}">${k.label} <span>${kindCounts[k.id]}</span></button>`).join('')}
      </div>
      <div class="milestone-filter-row">
        <select id="milestone-year" class="milestone-year" aria-label="Year">
          <option value="all">All years</option>
          ${years.map(y => `<option value="${y}">${y}</option>`).join('')}
        </select>
        <input type="search" id="milestone-search" class="spotlight-filter" placeholder="Search milestones: try Zelda, 1000 hours, Top 25…" aria-label="Search milestones">
        <span id="milestone-count" class="spotlight-filter-count"></span>
      </div>
    </div>
    <div id="milestones-filtered-list"></div>
  `;

  let activeType = 'all', activeKind = 'all';
  const kinds = document.getElementById('milestone-kinds');
  const list = document.getElementById('milestones-filtered-list');
  const yearSelect = document.getElementById('milestone-year');
  const search = document.getElementById('milestone-search');
  const count = document.getElementById('milestone-count');

  const render = () => {
    const year = yearSelect.value;
    const query = search.value.trim().toLowerCase();
    const shown = milestones.filter(m =>
      (activeType === 'all' || typeOf(m) === activeType) &&
      (activeType !== 'ranking' || activeKind === 'all' || rankingKindOf(m) === activeKind) &&
      (year === 'all' || String(new Date(m.date).getUTCFullYear()) === year) &&
      (!query || m.details.toLowerCase().includes(query)));
    count.textContent = `${shown.length} of ${milestones.length}`;
    list.innerHTML = shown.length ? shown.map(milestoneItemHtml).join('') : `<div class="loading-text">No milestones match.</div>`;
  };

  // The kinds of ranking show as a second row of buttons while Rankings is picked
  const typeButtons = [...container.querySelectorAll('.milestone-type[data-type]')];
  const kindButtons = [...container.querySelectorAll('.milestone-kind')];
  typeButtons.forEach(button => {
    button.addEventListener('click', () => {
      activeType = button.dataset.type;
      typeButtons.forEach(b => b.classList.toggle('active', b === button));
      kinds.hidden = activeType !== 'ranking';
      render();
    });
  });
  kindButtons.forEach(button => {
    button.addEventListener('click', () => {
      activeKind = button.dataset.kind;
      kindButtons.forEach(b => b.classList.toggle('active', b === button));
      render();
    });
  });
  yearSelect.addEventListener('change', render);
  search.addEventListener('input', render);
  render();
}
