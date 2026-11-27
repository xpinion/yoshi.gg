// HUD, menus and overlay screens.
(function () {
  const D = () => PM.Draw;
  const C = () => PM.CONFIG;
  const I = () => PM.Input;
  const A = () => PM.Audio;
  const W = () => PM.CONFIG.WIDTH, H = () => PM.CONFIG.HEIGHT;

  function dim(ctx, a = 0.55) { ctx.fillStyle = `rgba(20,14,12,${a})`; ctx.fillRect(0, 0, W(), H()); }

  // ------------------------------------------------------------ HUD
  function drawHUD(ctx, g) {
    const Dr = D(), s = g.state, p = g.player;
    Dr.panel(ctx, 10, 8, 300, 62, 700, 'rgba(255,248,232,0.92)');
    // hearts
    const total = C().START_HEARTS;
    for (let i = 0; i < total; i++) {
      const fill = Math.max(0, Math.min(1, s.hearts - i));
      Dr.heart(ctx, 30 + i * 27, 28, 1.25, fill, 'normal');
    }
    for (let i = 0; i < s.maxArmor; i++) Dr.heart(ctx, 30 + (total + i) * 27, 28, 1.25, Math.max(0, Math.min(1, s.armor - i)), 'armor');
    // lives
    Dr.catFace(ctx, 30, 54, 9, 'pholia');
    Dr.text(ctx, '× ' + s.lives, 44, 60, { size: 16 });
    // coins
    Dr.coin(ctx, 112, 54, 0, 3);
    Dr.text(ctx, '' + s.coins, 126, 60, { size: 16 });
    // item slot
    Dr.rect(ctx, 250, 18, 46, 46, 702, '#efe2c6', 2.2, 0.8);
    if (s.item) Dr.item(ctx, s.item, 273, 41, 1.15, g.time);
    Dr.text(ctx, 'Y', 291, 62, { size: 12, color: '#7a6a5a', align: 'right' });
    if (p && p.effect) {
      const frac = p.effectT / C().POWERUP_DURATION;
      Dr.panel(ctx, 320, 8, 150, 40, 703, 'rgba(255,248,232,0.92)');
      Dr.item(ctx, p.effect, 342, 28, 0.9, g.time);
      ctx.fillStyle = '#d8ccb4'; ctx.fillRect(362, 22, 96, 12);
      ctx.fillStyle = p.effect === 'feather' ? '#5ab8ff' : '#e2475b'; ctx.fillRect(362, 22, 96 * frac, 12);
      ctx.strokeStyle = Dr.INK; ctx.lineWidth = 1.5; ctx.strokeRect(362, 22, 96, 12);
    }
    // walkie-talkie
    const unread = g.radio.queue.length > 0;
    const wx = W() - 50, wy = 42;
    if (unread) {
      ctx.save(); ctx.globalAlpha = 0.45 + Math.sin(g.time * 9) * 0.35;
      Dr.blob(ctx, wx, wy, 30, 30, 704, '#3fa8ff', 0); ctx.restore();
    }
    Dr.item(ctx, 'walkie', wx, wy, 1.5, g.time);
    if (unread) {
      Dr.dot(ctx, wx + 16, wy - 22, 9, '#3fa8ff');
      Dr.text(ctx, '' + g.radio.queue.length, wx + 16, wy - 17, { size: 13, color: '#fff', align: 'center' });
      Dr.text(ctx, 'Q', wx, wy + 40, { size: 14, color: '#bfe2ff', align: 'center', outline: 3 });
    }
    // level name banner
    if (g.bannerT > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, g.bannerT);
      const name = g.level.data.name || '';
      Dr.panel(ctx, W() / 2 - 200, 80, 400, 66, 705, '#fff8e8');
      Dr.text(ctx, `Level ${g.level.num}`, W() / 2, 106, { size: 16, align: 'center', color: '#7a6a5a' });
      Dr.text(ctx, name, W() / 2, 134, { size: 24, align: 'center' });
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ RADIO
  class RadioPanel {
    constructor(g) { this.g = g; this.idx = 0; this.t = 0; this.chars = 0; A().sfx('static'); }
    update(dt) {
      this.t += dt; this.chars += dt * 60;
      const q = this.g.radio.queue;
      if (I().pressed('confirm') || I().pressed('radio')) {
        if (q.length && this.chars < q[0].text.length) { this.chars = 9999; return; }
        if (q.length) { this.g.radio.log.unshift(q.shift()); this.g.radio.log.length = Math.min(this.g.radio.log.length, 20); this.chars = 0; A().sfx('radio'); if (q.length) return; }
        if (!q.length) return this.close();
      }
      if (I().pressed('back')) this.close();
    }
    close() { this.g.overlay = null; I().clear(); }
    draw(ctx) {
      const Dr = D(), q = this.g.radio.queue;
      dim(ctx, 0.5);
      const x = 120, y = 110, w = W() - 240, h = 320;
      // walkie-talkie body
      Dr.rect(ctx, x, y, w, h, 800, '#5a6270', 4, 1.5);
      Dr.line(ctx, [[x + w - 70, y], [x + w - 70, y - 70]], 801, 8);
      Dr.rect(ctx, x + 24, y + 24, w - 48, h - 90, 802, '#bde3c2', 3);
      for (let i = 0; i < 5; i++) Dr.line(ctx, [[x + 40 + i * 14, y + h - 46], [x + 40 + i * 14, y + h - 22]], 803 + i, 3, '#3a404a');
      ctx.save(); ctx.globalAlpha = 0.07; for (let yy = y + 24; yy < y + h - 66; yy += 4) { ctx.fillStyle = '#000'; ctx.fillRect(x + 24, yy, w - 48, 2); } ctx.restore();
      if (q.length) {
        const m = q[0];
        const fr = PM.STORY.friends[m.from] || { name: m.from, color: '#333' };
        Dr.catFace(ctx, x + 90, y + 100, 40, m.from, { mood: m.from === 'bobby' ? 'sassy' : (m.from === 'tommy' ? 'normal' : 'normal') });
        Dr.text(ctx, fr.name, x + 90, y + 170, { size: 18, align: 'center', color: '#24402a' });
        Dr.text(ctx, fr.role, x + 90, y + 190, { size: 12, align: 'center', color: '#4a6a50', bold: false });
        const lines = Dr.wrap(ctx, m.text, w - 230, 19);
        let budget = this.chars;
        lines.forEach((l, i) => { Dr.text(ctx, l.slice(0, Math.max(0, budget)), x + 160, y + 64 + i * 26, { size: 19, color: '#1d3322' }); budget -= l.length + 1; });
        Dr.text(ctx, q.length > 1 ? `${q.length - 1} more message${q.length > 2 ? 's' : ''}... (ENTER)` : 'ENTER to close', x + w - 40, y + h - 30, { size: 14, align: 'right', color: '#dfe6ee' });
      } else {
        Dr.text(ctx, 'No new messages. Recent:', x + 44, y + 58, { size: 17, color: '#24402a' });
        this.g.radio.log.slice(0, 4).forEach((m, i) => {
          const fr = PM.STORY.friends[m.from] || { name: m.from };
          const line = Dr.wrap(ctx, `${fr.name}: ${m.text}`, w - 110, 15)[0];
          Dr.text(ctx, line + (line.length < m.text.length ? '…' : ''), x + 44, y + 90 + i * 34, { size: 15, color: '#2f4a35', bold: false });
        });
        Dr.text(ctx, 'ENTER to close', x + w - 40, y + h - 30, { size: 14, align: 'right', color: '#dfe6ee' });
      }
    }
  }

  // ------------------------------------------------------------ PAUSE
  class PauseMenu {
    constructor(g) { this.g = g; this.sel = 0; this.opts = ['Resume', 'Level select', 'Sound: ON', 'Restart level (costs a life)', 'Save & quit to title']; }
    update() {
      const inp = I();
      this.opts[2] = 'Sound: ' + (A().muted ? 'OFF' : 'ON');
      if (inp.pressed('up') || inp.keyPressed('KeyW')) { this.sel = (this.sel + this.opts.length - 1) % this.opts.length; A().sfx('move'); }
      if (inp.pressed('down')) { this.sel = (this.sel + 1) % this.opts.length; A().sfx('move'); }
      if (inp.pressed('pause')) return this.close();
      if (inp.keyPressed('Enter') || inp.keyPressed('KeyU')) {
        A().sfx('select');
        if (this.sel === 0) this.close();
        else if (this.sel === 1) this.g.overlay = new LevelSelect(this.g, () => { this.g.overlay = this; });
        else if (this.sel === 2) A().toggleMute();
        else if (this.sel === 3) { this.close(); this.g.loseLife(); }
        else if (this.sel === 4) { this.close(); this.g.saveAndQuit(); }
      }
    }
    close() { this.g.overlay = null; I().clear(); }
    draw(ctx) {
      const Dr = D();
      dim(ctx, 0.6);
      Dr.panel(ctx, 60, 50, 380, 440, 820, '#fff8e8');
      Dr.text(ctx, 'Paused', 250, 100, { size: 34, align: 'center' });
      this.opts.forEach((o, i) => {
        const y = 150 + i * 48;
        if (i === this.sel) Dr.rect(ctx, 85, y - 28, 330, 40, 821 + i, '#ffe58a', 2, 0.8);
        Dr.text(ctx, o, 250, y, { size: 19, align: 'center' });
      });
      Dr.text(ctx, `Level ${this.g.level.num} — ${PM.BIOMES[this.g.level.biome].name}`, 250, 400, { size: 15, align: 'center', color: '#7a6a5a' });
      if (this.g.state.hard) Dr.text(ctx, 'HARD MODE — no checkpoints', 250, 450, { size: 15, align: 'center', color: '#c0392b' });
      Dr.text(ctx, `Secret bell: ${this.g.state.secretsFound.includes(this.g.level.biome) ? 'found! ✓' : 'not found yet'}`, 250, 425, { size: 15, align: 'center', color: '#7a6a5a' });
      // controls
      Dr.panel(ctx, 470, 50, 430, 440, 830, '#fff8e8');
      Dr.text(ctx, 'Controls', 685, 100, { size: 28, align: 'center' });
      const rows = [
        ['Move', 'A / D   or   ← / →'], ['Jump', 'W, ↑ or SPACE (hold = higher)'], ['Duck', 'S or ↓'],
        ['Drop through ledge', 'Duck + Jump'], ['Paw attack', 'U'], ['Pounce', 'Land on an enemy'],
        ['Dash', 'K or SHIFT'], ['Use item', 'Y'], ['Throw', 'Hold I, release'],
        ['Walkie-talkie', 'Q or TAB'], ['Pause', 'ESC'],
      ];
      rows.forEach(([a, b], i) => {
        Dr.text(ctx, a, 495, 140 + i * 31, { size: 15, color: '#7a4a2a' });
        Dr.text(ctx, b, 670, 140 + i * 31, { size: 15, bold: false });
      });
    }
  }

  // ------------------------------------------------------------ LEVEL SELECT
  class LevelSelect {
    constructor(g, onBack) {
      this.g = g; this.onBack = onBack; this.t = 0;
      const s = g.state, cur = Math.min(50, s.replayReturn || s.level);
      this.sel = (g.level && g.mode === 'play') ? g.level.num : cur;
      this.msg = '';
    }
    status(n) {
      const s = this.g.state, progress = s.replayReturn || s.level;
      if (n === progress) return 'current';
      if (s.beaten.includes(n)) return 'beaten';
      return 'locked';
    }
    update(dt) {
      this.t += dt;
      const inp = I();
      const move = (d) => { this.sel = Math.max(1, Math.min(50, this.sel + d)); this.msg = ''; A().sfx('move'); };
      if (inp.pressed('left')) move(-1);
      if (inp.pressed('right')) move(1);
      if (inp.pressed('up')) move(-10);
      if (inp.pressed('down')) move(10);
      if (inp.pressed('back')) { A().sfx('select'); I().clear(); return this.onBack(); }
      if (inp.keyPressed('Enter') || inp.keyPressed('Space') || inp.keyPressed('KeyU')) {
        const st = this.status(this.sel);
        if (st === 'locked') { this.msg = 'Locked! Beat the levels before it first.'; A().sfx('nope'); return; }
        A().sfx('select'); I().clear();
        this.g.playLevel(this.sel);
      }
    }
    draw(ctx) {
      const Dr = D();
      if (this.g.mode === 'play') dim(ctx, 0.7); else { ctx.fillStyle = '#2a1f28'; ctx.fillRect(0, 0, W(), H()); }
      Dr.panel(ctx, 30, 20, 900, 500, 870, '#fff8e8');
      Dr.text(ctx, 'Level Select', 480, 62, { size: 32, align: 'center' });
      for (let b = 0; b < 5; b++) {
        const y = 92 + b * 72;
        Dr.text(ctx, PM.BIOMES[b].name.replace('The ', ''), 50, y + 36, { size: 15, color: '#7a4a2a' });
        for (let i = 0; i < 10; i++) {
          const n = b * 10 + i + 1, x = 170 + i * 72, st = this.status(n);
          const fill = st === 'locked' ? '#cfc4b0' : st === 'current' ? '#9fd0f0' : '#ffffff';
          if (n === this.sel) Dr.rect(ctx, x - 4, y - 4, 64, 62, 880 + n, '#ffe58a', 2.5, 0.8);
          Dr.rect(ctx, x, y, 56, 54, 900 + n, fill, 2, 0.8);
          if (st === 'locked') {
            // padlock
            Dr.rect(ctx, x + 18, y + 24, 20, 16, 960 + n, '#8a8070', 1.8, 0.5);
            ctx.strokeStyle = '#5a5248'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 28, y + 24, 7, Math.PI, 0); ctx.stroke();
            Dr.text(ctx, '' + n, x + 6, y + 16, { size: 12, color: '#7a7060' });
          } else {
            Dr.text(ctx, '' + n, x + 28, y + 36, { size: 22, align: 'center' });
            if (st === 'beaten') Dr.text(ctx, '✓', x + 47, y + 16, { size: 15, color: '#3a8a3a', align: 'center' });
            if (st === 'current') Dr.text(ctx, '▶', x + 47, y + 16, { size: 13, color: '#2a6a9a', align: 'center' });
            if (n % 10 === 0 || n % 10 === 5) Dr.text(ctx, '★', x + 9, y + 16, { size: 13, color: '#c0392b', align: 'center' });
          }
        }
      }
      const data = PM.LEVELS[this.sel];
      const st = this.status(this.sel);
      Dr.text(ctx, this.msg || `Level ${this.sel}: ${st === 'locked' ? '???' : (data && data.name) || ''}${st === 'beaten' ? '  (replay — you\'ll come back here after)' : ''}`, 480, 480, { size: 17, align: 'center', color: this.msg ? '#c0392b' : '#3a2a22' });
      Dr.text(ctx, 'arrows: choose   ENTER: play   ESC: back      ★ = boss', 480, 506, { size: 13, align: 'center', color: '#7a6a5a' });
    }
  }

  // ------------------------------------------------------------ LEVEL COMPLETE (Bobby's rating)
  class CompleteCard {
    constructor(g, stats, onDone) {
      this.g = g; this.onDone = onDone; this.t = 0;
      const par = g.level.data.par || 90;
      let score = 100;
      score -= stats.hits * 8;
      score -= Math.max(0, stats.time - par) * 0.6;
      score -= stats.coinTotal ? (1 - stats.coinsGot / stats.coinTotal) * 25 : 0;
      score -= stats.restarts * 6;
      this.grade = score >= 92 ? 'S' : score >= 75 ? 'A' : score >= 55 ? 'B' : 'C';
      const lines = PM.STORY.bobby[this.grade];
      this.line = lines[Math.floor(Math.random() * lines.length)];
      this.stats = stats;
      A().sfx('win');
    }
    update(dt) {
      this.t += dt;
      if (this.t > 0.8 && (I().keyPressed('Enter') || I().keyPressed('Space') || I().keyPressed('KeyU'))) { A().sfx('select'); this.onDone(); }
    }
    draw(ctx) {
      const Dr = D(), s = this.stats;
      dim(ctx, 0.55);
      Dr.panel(ctx, 180, 50, 600, 440, 850, '#fff8e8');
      Dr.text(ctx, 'Level Complete!', 480, 100, { size: 34, align: 'center', color: '#c0583e' });
      Dr.text(ctx, this.g.level.data.name || '', 480, 130, { size: 17, align: 'center', color: '#7a6a5a' });
      const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
      const rows = [['Time', `${m}:${String(sec).padStart(2, '0')}  (par ${this.g.level.data.par || 90}s)`], ['Coins found', `${s.coinsGot} / ${s.coinTotal}`], ['Times hit', '' + s.hits], ['Enemies bonked', '' + s.enemies]];
      rows.forEach(([a, b], i) => { if (this.t > 0.2 + i * 0.15) { Dr.text(ctx, a, 230, 180 + i * 32, { size: 18, color: '#7a4a2a' }); Dr.text(ctx, b, 420, 180 + i * 32, { size: 18, bold: false }); } });
      if (this.t > 0.9) {
        const sc = 1 + Math.max(0, 1.2 - this.t) * 2;
        ctx.save(); ctx.translate(680, 220); ctx.scale(sc, sc); ctx.rotate(-0.15);
        Dr.blob(ctx, 0, 0, 44, 44, 851, { S: '#ffd84a', A: '#9fe08a', B: '#9fd0f0', C: '#f0a8a8' }[this.grade], 3);
        Dr.text(ctx, this.grade, 0, 18, { size: 54, align: 'center' });
        ctx.restore();
      }
      if (this.t > 1.2) {
        Dr.panel(ctx, 210, 330, 540, 100, 852, '#ffffff');
        Dr.catFace(ctx, 262, 380, 32, 'bobby', { mood: 'sassy' });
        Dr.text(ctx, 'Bobby says:', 310, 357, { size: 14, color: '#7a6a5a' });
        Dr.wrap(ctx, this.line, 420, 17).forEach((l, i) => Dr.text(ctx, l, 310, 382 + i * 21, { size: 17 }));
      }
      if (this.t > 1.4) Dr.text(ctx, 'ENTER to continue', 480, 465, { size: 15, align: 'center', color: '#7a6a5a' });
    }
  }

  // ------------------------------------------------------------ SHOP
  class Shop {
    constructor(g, onDone) {
      this.g = g; this.onDone = onDone; this.sel = 0; this.t = 0;
      this.msg = PM.STORY.shop.greet;
      const pr = C().PRICES;
      const biomeHat = ['hardhat', 'beanie', 'tophat', 'bow', 'crown'][g.level.biome] || 'hardhat';
      this.items = [
        { id: 'fish', name: 'Fish Treat', desc: 'Heals 1 heart', price: pr.fish },
        { id: 'bigfish', name: 'Big Fish Dinner', desc: 'Heals 3 hearts', price: pr.bigfish },
        { id: 'feather', name: 'Feather', desc: 'Sneeze-speed for 20s (goes in item slot)', price: pr.feather },
        { id: 'spring', name: 'Spring', desc: 'Double jump for 20s (goes in item slot)', price: pr.spring },
        { id: 'puff', name: 'Puff Ball', desc: 'A throwable bomb (goes in item slot)', price: pr.puff },
        { id: biomeHat, name: D().HATS[biomeHat].name, desc: '+1 armor heart, refills each level', price: pr.hat, hat: true },
        { id: 'leave', name: 'Leave shop', desc: '', price: 0 },
      ];
      A().play('shop');
    }
    update(dt) {
      this.t += dt;
      const inp = I(), n = this.items.length;
      if (inp.pressed('up')) { this.sel = (this.sel + n - 1) % n; A().sfx('move'); }
      if (inp.pressed('down')) { this.sel = (this.sel + 1) % n; A().sfx('move'); }
      if (inp.pressed('pause')) return this.leave();
      if (inp.keyPressed('Enter') || inp.keyPressed('KeyU') || inp.keyPressed('Space')) this.buy(this.items[this.sel]);
    }
    leave() { this.msg = PM.STORY.shop.bye; A().sfx('select'); this.onDone(); }
    buy(it) {
      const s = this.g.state, S = PM.STORY.shop;
      if (it.id === 'leave') return this.leave();
      if (it.hat && s.hats.includes(it.id)) { this.msg = S.hatOwned; return A().sfx('nope'); }
      if (s.coins < it.price) { this.msg = S.poor; return A().sfx('nope'); }
      if (['feather', 'spring', 'puff'].includes(it.id) && s.item) { this.msg = S.full; return A().sfx('nope'); }
      if ((it.id === 'fish' || it.id === 'bigfish') && s.hearts >= C().START_HEARTS) { this.msg = S.healed; return A().sfx('nope'); }
      s.coins -= it.price;
      if (it.id === 'fish') s.hearts = Math.min(C().START_HEARTS, s.hearts + 1);
      else if (it.id === 'bigfish') s.hearts = Math.min(C().START_HEARTS, s.hearts + 3);
      else if (it.hat) { s.hats.push(it.id); s.hat = it.id; s.maxArmor += 1; s.armor = s.maxArmor; this.g.tip('hat'); }
      else s.item = it.id;
      this.msg = S.buy[Math.floor(Math.random() * S.buy.length)];
      A().sfx('coin'); A().sfx('powerup');
    }
    draw(ctx) {
      const Dr = D(), s = this.g.state;
      // shop backdrop
      const g = ctx.createLinearGradient(0, 0, 0, H()); g.addColorStop(0, '#3b2c3a'); g.addColorStop(1, '#2a1f28');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W(), H());
      for (let i = 0; i < 9; i++) { ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(this.t * 2 + i) * 0.2; Dr.dot(ctx, 60 + i * 110, 40 + (i % 2) * 14, 7, '#ffd77a'); ctx.restore(); Dr.line(ctx, [[i * 110 + 5, 30], [60 + i * 110, 40 + (i % 2) * 14], [i * 110 + 115, 30]], 900 + i, 1.5, '#8a7a6a'); }
      // counter + Chalice
      Dr.cat(ctx, 190, 330, 'chalice', { pose: 'sit', t: this.t, scale: 3.2, facing: 1 });
      Dr.rect(ctx, 30, 320, 360, 200, 901, '#7a4f35', 3);
      Dr.text(ctx, "CHALICE'S", 210, 380, { size: 30, align: 'center', color: '#ffd77a', outline: 5 });
      Dr.text(ctx, 'GOODS & HATS', 210, 412, { size: 20, align: 'center', color: '#ffd77a', outline: 4 });
      Dr.text(ctx, 'no refunds', 210, 440, { size: 13, align: 'center', color: '#e8c8a8', bold: false });
      // speech
      Dr.panel(ctx, 30, 40 + 40, 360, 100, 902, '#fff');
      Dr.wrap(ctx, this.msg, 330, 16).forEach((l, i) => Dr.text(ctx, l, 45, 106 + i * 20, { size: 16 }));
      // list
      Dr.panel(ctx, 420, 40, 510, 470, 903, '#fff8e8');
      Dr.text(ctx, 'For sale', 450, 78, { size: 24 });
      Dr.coin(ctx, 800, 70, 0, 4); Dr.text(ctx, '' + s.coins, 816, 77, { size: 20 });
      this.items.forEach((it, i) => {
        const y = 110 + i * 54;
        if (i === this.sel) Dr.rect(ctx, 436, y - 4, 478, 50, 910 + i, '#ffe58a', 2, 0.8);
        if (it.id !== 'leave') Dr.item(ctx, it.id, 466, y + 20, 1.2, this.t);
        Dr.text(ctx, it.name, 496, y + 18, { size: 18 });
        if (it.desc) Dr.text(ctx, it.desc, 496, y + 38, { size: 13, color: '#7a6a5a', bold: false });
        if (it.price) { Dr.coin(ctx, 860, y + 16, 0, 5); Dr.text(ctx, '' + it.price, 875, y + 22, { size: 17, color: s.coins >= it.price ? '#3a2a22' : '#c0392b' }); }
        if (it.hat && s.hats.includes(it.id)) Dr.text(ctx, 'owned', 880, y + 40, { size: 12, color: '#3a8a3a', align: 'center' });
      });
      Dr.text(ctx, '↑/↓ choose   ENTER buy   ESC leave', 675, 530, { size: 13, align: 'center', color: '#d8c8b8' });
      // player status
      for (let i = 0; i < C().START_HEARTS; i++) Dr.heart(ctx, 50 + i * 26, 30, 1.2, Math.max(0, Math.min(1, s.hearts - i)), 'normal');
      for (let i = 0; i < s.maxArmor; i++) Dr.heart(ctx, 50 + (C().START_HEARTS + i) * 26, 30, 1.2, 1, 'armor');
      if (s.item) { Dr.text(ctx, 'Holding:', 280, 36, { size: 14, color: '#fff' }); Dr.item(ctx, s.item, 360, 30, 1, this.t); }
    }
  }

  // ------------------------------------------------------------ TITLE & SLOTS
  class Title {
    constructor(g) { this.g = g; this.t = 0; this.mode = 'title'; this.sel = 0; this.confirmErase = -1; A().play('title'); }
    update(dt) {
      this.t += dt;
      const inp = I();
      if (this.mode === 'difficulty') {
        if (inp.pressed('up') || inp.pressed('down')) { this.diff = 1 - this.diff; A().sfx('move'); }
        if (inp.pressed('back')) { this.mode = 'slots'; return; }
        if (inp.keyPressed('Enter') || inp.keyPressed('Space') || inp.keyPressed('KeyU')) { A().sfx('select'); this.g.startSlot(this.sel, { hard: this.diff === 1 }); }
        return;
      }
      if (this.mode === 'title') {
        if (this.t > 0.4 && (inp.keyPressed('Enter') || inp.keyPressed('Space') || inp.keyPressed('KeyU'))) { this.mode = 'slots'; A().sfx('select'); }
        return;
      }
      if (inp.pressed('up')) { this.sel = (this.sel + 2) % 3; this.confirmErase = -1; A().sfx('move'); }
      if (inp.pressed('down')) { this.sel = (this.sel + 1) % 3; this.confirmErase = -1; A().sfx('move'); }
      if (inp.pressed('back') && this.confirmErase < 0) { this.mode = 'title'; return; }
      if (inp.keyPressed('Delete') || inp.keyPressed('KeyX')) {
        if (PM.Save.load(this.sel)) {
          if (this.confirmErase === this.sel) { PM.Save.erase(this.sel); this.confirmErase = -1; A().sfx('crumble'); }
          else { this.confirmErase = this.sel; A().sfx('nope'); }
        }
      }
      if (inp.keyPressed('Enter') || inp.keyPressed('Space') || inp.keyPressed('KeyU')) {
        A().sfx('select');
        if (!PM.Save.load(this.sel) && PM.Save.unlocked('hardMode')) { this.mode = 'difficulty'; this.diff = 0; }
        else this.g.startSlot(this.sel);
      }
    }
    draw(ctx) {
      const Dr = D(), w = W(), h = H(), t = this.t;
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9fd4f0'); g.addColorStop(1, '#f5e6c8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      Dr.blob(ctx, 140 + Math.sin(t * 0.3) * 20, 90, 70, 22, 1, '#fff', 2); Dr.blob(ctx, 760 + Math.sin(t * 0.25) * 20, 70, 60, 20, 2, '#fff', 2);
      Dr.poly(ctx, [[-10, 440], [300, 425], [600, 445], [970, 430], [970, 550], [-10, 550]], 3, '#8fc66a', 2.5, 2);
      if (this.mode === 'title') {
        ctx.save(); ctx.translate(w / 2, 170); ctx.rotate(Math.sin(t * 1.5) * 0.02);
        Dr.text(ctx, "Pholia's Mission", 0, 0, { size: 78, align: 'center', color: '#f6a14b', outline: 10 });
        ctx.restore();
        Dr.text(ctx, 'a cat, a walkie-talkie, and a very long way home', w / 2, 225, { size: 19, align: 'center', color: '#5a4a3a' });
        Dr.text(ctx, 'A Game by Enzo Miller', w / 2, 260, { size: 20, align: 'center', color: '#fff8e8', outline: 5, outlineColor: '#7a4a2a' });
        const px = ((t * 120) % (w + 200)) - 100;
        Dr.cat(ctx, px, 440, 'pholia', { pose: 'run', t, scale: 1.8 });
        Dr.cat(ctx, w * 0.5, 440, 'tommy', { pose: 'sit', t, scale: 1.5, facing: -1 });
        Dr.text(ctx, 'still waiting...', w * 0.5 + 20, 350, { size: 14, color: '#5a4a3a', align: 'center' });
        if (Math.floor(t * 2) % 2 === 0) Dr.text(ctx, 'Press ENTER to start', w / 2, 318, { size: 26, align: 'center', color: '#fff', outline: 6 });
        return;
      }
      if (this.mode === 'difficulty') {
        Dr.text(ctx, 'Choose a mode', w / 2, 90, { size: 36, align: 'center', color: '#fff', outline: 7 });
        const opts = [['Normal', 'Checkpoint flags before each big boss.'], ['Hard Mode', 'No checkpoints. Lose a life, start the level over. Good luck, kitty.']];
        opts.forEach(([name, desc], i) => {
          const y = 150 + i * 140;
          Dr.panel(ctx, w / 2 - 280, y, 560, 110, 640 + i, i === this.diff ? (i ? '#f0a8a8' : '#ffe58a') : '#fff8e8');
          Dr.text(ctx, name, w / 2 - 250, y + 44, { size: 28, color: i ? '#a02a2a' : '#3a2a22' });
          Dr.text(ctx, desc, w / 2 - 250, y + 80, { size: 16, bold: false });
        });
        Dr.text(ctx, '↑/↓ choose   ENTER start   ESC back', w / 2, 515, { size: 15, align: 'center', color: '#5a4a3a' });
        return;
      }
      Dr.text(ctx, 'Choose a save slot', w / 2, 70, { size: 36, align: 'center', color: '#fff', outline: 7 });
      for (let i = 0; i < 3; i++) {
        const s = PM.Save.load(i), y = 110 + i * 120;
        Dr.panel(ctx, w / 2 - 280, y, 560, 100, 600 + i, i === this.sel ? '#ffe58a' : '#fff8e8');
        Dr.text(ctx, `Slot ${i + 1}`, w / 2 - 250, y + 34, { size: 22 });
        if (s) {
          const b = PM.BIOMES[Math.min(4, Math.floor((s.level - 1) / 10))];
          Dr.text(ctx, `Level ${s.level} — ${b ? b.name : ''}`, w / 2 - 250, y + 66, { size: 17, bold: false });
          Dr.catFace(ctx, w / 2 + 110, y + 50, 14, 'pholia'); Dr.text(ctx, '× ' + s.lives, w / 2 + 130, y + 56, { size: 18 });
          Dr.coin(ctx, w / 2 + 200, y + 50, 0, 1); Dr.text(ctx, '' + s.coins, w / 2 + 216, y + 56, { size: 18 });
          if (s.hard) Dr.text(ctx, 'HARD MODE', w / 2 - 150, y + 34, { size: 16, color: '#c0392b' });
          if (this.confirmErase === i) Dr.text(ctx, 'Press DELETE/X again to erase!', w / 2 + 260, y + 88, { size: 13, color: '#c0392b', align: 'right' });
        } else Dr.text(ctx, 'New game', w / 2 - 250, y + 66, { size: 17, color: '#7a6a5a', bold: false });
      }
      Dr.text(ctx, '↑/↓ choose   ENTER play   DELETE or X erase   ESC back', w / 2, 515, { size: 15, align: 'center', color: '#5a4a3a' });
    }
  }

  // ------------------------------------------------------------ simple message screen
  class MessageScreen {
    constructor(title, body, onDone, opts = {}) { this.title = title; this.body = body; this.onDone = onDone; this.t = 0; this.opts = opts; }
    update(dt) { this.t += dt; if (this.t > 1 && (I().keyPressed('Enter') || I().keyPressed('Space') || I().keyPressed('KeyU'))) { A().sfx('select'); this.onDone(); } }
    draw(ctx) {
      const Dr = D();
      ctx.fillStyle = this.opts.bg || '#2a1f28'; ctx.fillRect(0, 0, W(), H());
      Dr.text(ctx, this.title, W() / 2, 170, { size: 48, align: 'center', color: this.opts.color || '#ffd77a', outline: 8 });
      Dr.wrap(ctx, this.body, 700, 20).forEach((l, i) => Dr.text(ctx, l, W() / 2, 250 + i * 30, { size: 20, align: 'center', color: '#f3e7cf' }));
      if (this.opts.cat) Dr.cat(ctx, W() / 2, 470, 'pholia', { pose: this.opts.cat, t: this.t, scale: 1.6, eyes: this.opts.eyes });
      if (this.t > 1) Dr.text(ctx, 'ENTER to continue', W() / 2, 520, { size: 15, align: 'center', color: '#a89a86' });
    }
  }

  PM.UI = { drawHUD, RadioPanel, PauseMenu, LevelSelect, CompleteCard, Shop, Title, MessageScreen, dim };
})();
