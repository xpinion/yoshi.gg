// milestones.js - The Milestones page.

// --- MILESTONES PAGE: filters by type, year, and text ---
const MILESTONE_TYPES = [
  { id: 'record', label: 'World Records' }, { id: 'ranking', label: 'Rankings' }, { id: 'count', label: 'Counts' },
  { id: 'hours', label: 'Hour Totals' }, { id: 'first', label: 'Firsts' }, { id: 'anniversary', label: 'Anniversaries' }
];

function initMilestonesPage() {
  const container = document.getElementById('milestones-page-container');
  if (!container || !rawData || !rawData.metrics || !rawData.metrics.milestones) return;

  const milestones = rawData.metrics.milestones.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const typeOf = m => m.type || 'other';
  const counts = {};
  milestones.forEach(m => { counts[typeOf(m)] = (counts[typeOf(m)] || 0) + 1; });
  const types = MILESTONE_TYPES.filter(t => counts[t.id]);
  const years = [...new Set(milestones.map(m => new Date(m.date).getUTCFullYear()))].sort((a, b) => b - a);

  container.innerHTML = `
    <div class="milestone-filters">
      <div class="milestone-type-buttons">
        <button type="button" class="milestone-type active" data-type="all">All <span>${milestones.length}</span></button>
        ${types.map(t => `<button type="button" class="milestone-type" data-type="${t.id}">${t.label} <span>${counts[t.id]}</span></button>`).join('')}
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

  let activeType = 'all';
  const list = document.getElementById('milestones-filtered-list');
  const yearSelect = document.getElementById('milestone-year');
  const search = document.getElementById('milestone-search');
  const count = document.getElementById('milestone-count');

  const render = () => {
    const year = yearSelect.value;
    const query = search.value.trim().toLowerCase();
    const shown = milestones.filter(m =>
      (activeType === 'all' || typeOf(m) === activeType) &&
      (year === 'all' || String(new Date(m.date).getUTCFullYear()) === year) &&
      (!query || m.details.toLowerCase().includes(query)));
    count.textContent = `${shown.length} of ${milestones.length}`;
    list.innerHTML = shown.length ? shown.map(milestoneItemHtml).join('') : `<div class="loading-text">No milestones match.</div>`;
  };

  container.querySelectorAll('.milestone-type').forEach(button => {
    button.addEventListener('click', () => {
      activeType = button.dataset.type;
      container.querySelectorAll('.milestone-type').forEach(b => b.classList.toggle('active', b === button));
      render();
    });
  });
  yearSelect.addEventListener('change', render);
  search.addEventListener('input', render);
  render();
}
