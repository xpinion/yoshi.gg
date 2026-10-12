// card.js - The Share Cards page (card.html?game=... or ?series=...): pick a game or series and get its
// profile card as a picture to download, copy or share. The cards are built in profilecard.js.

function initCardPage() {
  const container = document.getElementById('card-page-container');
  if (!container || !rawData || !rawData.allEntries) return;
  const names = {
    game: [...new Set(rawData.allEntries.map(e => e.game))].sort((a, b) => a.localeCompare(b)),
    series: profileSeriesNames()
  };
  const params = new URLSearchParams(window.location.search);
  let type = params.get('series') ? 'series' : 'game';
  // With nothing asked for, start on the game played most recently
  let name = params.get(type) || rawData.allEntries[rawData.allEntries.length - 1].game;

  container.innerHTML = `
    <div class="card-row grid-1"><h2 class="page-title">Share Cards</h2></div>
    <section class="card-row grid-1">
      <div class="card" style="max-height: none;">
        <div class="compare-controls">
          <select id="card-type" class="milestone-year" aria-label="Card for a game or a series">
            <option value="game">Game</option><option value="series">Series</option>
          </select>
          <input type="search" id="card-name" class="spotlight-filter" list="card-list" aria-label="Game or series">
          <datalist id="card-list"></datalist>
        </div>
        <div id="card-actions" class="share-actions card-page-actions"></div>
        <div id="card-preview" class="card-preview"></div>
      </div>
    </section>`;
  const typeSelect = document.getElementById('card-type'), input = document.getElementById('card-name');
  const preview = document.getElementById('card-preview'), actions = document.getElementById('card-actions');
  const fillList = () => {
    document.getElementById('card-list').innerHTML = names[type].map(n => `<option value="${escapeHTML(n)}">`).join('');
    input.placeholder = type === 'game' ? 'Pick a game…' : 'Pick a series…';
  };

  let image = null, drawing = 0;
  const draw = async () => {
    const turn = ++drawing;
    typeSelect.value = type; input.value = name;
    const card = type === 'game' ? buildGameCard(name) : buildSeriesCard(name);
    actions.innerHTML = '';
    if (!card) { preview.innerHTML = `<div class="loading-text">No log entries for "${escapeHTML(name)}".</div>`; return; }
    if (typeof CanvasRenderingContext2D === 'undefined') { preview.innerHTML = `<div class="loading-text">This browser can't draw the card.</div>`; return; }
    preview.innerHTML = `<div class="loading-text">Drawing the card...</div>`;
    const made = await makeShareImage(card);
    if (turn !== drawing) { URL.revokeObjectURL(made.url); return; } // another card was picked meanwhile
    if (image) URL.revokeObjectURL(image.url);
    image = made;
    history.replaceState(null, '', `card.html?${type}=${encodeURIComponent(name)}`);
    document.title = `${name} Share Card | yoshi xcx's Videogame Dashboard`;
    actions.innerHTML = `${shareActionButtonsHtml(image)}<a class="share-btn" href="${type === 'game' ? gameProfileUrl(name) : `franchise.html?item=${encodeURIComponent(name)}`}">Open its page</a>`;
    preview.innerHTML = `<img src="${image.url}" alt="${escapeHTML(name)} share card" width="${image.canvas.width}" height="${image.canvas.height}">`;
  };

  typeSelect.addEventListener('change', () => { type = typeSelect.value; input.value = ''; fillList(); input.focus(); });
  input.addEventListener('change', () => { if (names[type].includes(input.value)) { name = input.value; draw(); } });
  actions.addEventListener('click', e => { if (e.target.dataset.shareAction && image) runShareAction(e.target, image, name); });
  fillList();
  draw();
}
