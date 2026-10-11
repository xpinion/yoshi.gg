// history.js - The History page and On This Day, which the Index shares.

// --- NEW: HISTORY PAGE ROUTING ---
function initHistoryPage() {
  const select = document.getElementById('history-day-select');
  if (!select) return;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Allow Feb 29

  let optionsHtml = '';
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= daysInMonth[m]; d++) {
      const val = `${m}-${d}`;
      const text = `${monthNames[m]} ${d.toString().padStart(2, '0')}`;
      optionsHtml += `<option value="${val}">${text}</option>`;
    }
  }
  select.innerHTML = optionsHtml;

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();
  const todayVal = `${currentMonth}-${currentDay}`;
  
  select.value = todayVal;
  select.addEventListener('change', (e) => {
    const [m, d] = e.target.value.split('-').map(Number);
    renderOnThisDay(m, d, 'history-page-container');
  });

  renderOnThisDay(currentMonth, currentDay, 'history-page-container');
  setupLogSearch();
}

// --- SEARCH THE LOG: every entry whose note, game or system contains all the words typed ---
const LOG_SEARCH_MAX_ROWS = 300;
function setupLogSearch() {
  const container = document.getElementById('log-search-container');
  if (!container) return;
  container.innerHTML = `
    <div class="milestone-filter-row">
      <input type="search" id="log-search" class="spotlight-filter" placeholder="Search play notes, games and systems: try boss, 100%, Mallory…" aria-label="Search the log">
      <span id="log-search-count" class="spotlight-filter-count"></span>
    </div>
    <div id="log-search-results"></div>
  `;
  const input = document.getElementById('log-search');
  const count = document.getElementById('log-search-count');
  const results = document.getElementById('log-search-results');
  const newestFirst = rawData.allEntries.slice().reverse();
  const haystacks = newestFirst.map(e => `${e.note || ''} ${e.game} ${e.system} ${e.status}`.toLowerCase());

  const render = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.join('').length < 2) {
      count.textContent = '';
      results.innerHTML = `<div class="loading-text">Type at least two letters to search all ${newestFirst.length.toLocaleString()} entries.</div>`;
      return;
    }
    const found = newestFirst.filter((e, i) => words.every(w => haystacks[i].includes(w)));
    const seconds = found.reduce((sum, e) => sum + timeStringToSeconds(e.time), 0);
    count.textContent = `${found.length.toLocaleString()} entr${found.length === 1 ? 'y' : 'ies'} · ${formatTime(seconds)}`;
    if (found.length === 0) { results.innerHTML = `<div class="loading-text">No entries match.</div>`; return; }
    results.innerHTML = `
      <div class="monthly-table-wrapper log-search-table">
        <table class="monthly-table" style="min-width: 900px;">
          <thead><tr><th>Date</th><th>Videogame</th><th>System</th><th>Time</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>${found.slice(0, LOG_SEARCH_MAX_ROWS).map(e => `
            <tr>
              <td class="text-center" style="font-weight: bold;">${formatFullDate(e.date)}</td>
              <td class="text-left"><span class="hover-trigger" data-game="${escapeHTML(e.game)}">${escapeHTML(e.game)}</span></td>
              <td class="text-center">${escapeHTML(e.system)}</td>
              <td class="text-center">${e.time}</td>
              <td class="text-center status-cell" style="background-color: ${getStatusColor(e.status)}; font-weight: bold;">${e.status}</td>
              <td class="text-left">${escapeHTML(e.note)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${found.length > LOG_SEARCH_MAX_ROWS ? `<div class="loading-text">Showing the newest ${LOG_SEARCH_MAX_ROWS} of ${found.length.toLocaleString()}. Add a word to narrow it down.</div>` : ''}
    `;
  };
  input.addEventListener('input', render);
  render();
}

// --- UPDATE: RENDER ON THIS DAY (Generalize to accept month, day, container) ---
function renderOnThisDay(monthIndex = new Date().getMonth(), dayIndex = new Date().getDate(), targetContainerId = 'on-this-day-list') {
  const container = document.getElementById(targetContainerId);
  const dateSpan = document.getElementById('today-date'); // Optional, exists on Index but not History page
  
  if (!container || !rawData || !rawData.allEntries) return;

  if (dateSpan) {
    dateSpan.innerText = `${String(monthIndex + 1).padStart(2, '0')}/${String(dayIndex).padStart(2, '0')}`;
  }

  const historyEntries = rawData.allEntries.filter(e => {
    const d = new Date(e.date);
    return d.getUTCMonth() === monthIndex && d.getUTCDate() === dayIndex;
  });

  if (historyEntries.length === 0) {
    container.innerHTML = `<div class="loading-text" style="padding: 20px;">No gaming history on this day.</div>`;
    return;
  }

  historyEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = historyEntries.map(e => {
    const year = new Date(e.date).getUTCFullYear();
    const bgColor = getStatusColor(e.status);
    return `
    <div class="list-item" style="border-left-color: ${bgColor};">
      <div class="item-info">
        <span class="item-rank" style="color: #444;">${year}</span>
        <div class="item-text">
          <span class="item-title hover-trigger" data-game="${escapeHTML(e.game)}">${escapeHTML(e.game)} (${escapeHTML(e.system)})</span>
          <span class="item-sub" style="color: #666;">${escapeHTML(e.note)}</span>
        </div>
      </div>
      <div class="item-badge" style="background-color: ${bgColor}; color: #000; text-shadow: 0 0 2px rgba(255,255,255,0.5);">${formatTime(timeStringToSeconds(e.time))}</div>
    </div>
    `;
  }).join('');
}
