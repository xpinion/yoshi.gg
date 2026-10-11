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
