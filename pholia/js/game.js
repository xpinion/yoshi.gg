// The main game: screens, level flow, lives, saving, camera, rendering.
(function () {
  const C = () => PM.CONFIG;
  const D = () => PM.Draw;
  const I = () => PM.Input;
  const A = () => PM.Audio;
  const E = () => PM.Entities;

  const LEVELS_PER_BIOME = 10;
  const biomeOf = (n) => Math.floor((n - 1) / LEVELS_PER_BIOME);

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.time = 0;
      this.screen = null;   // a full-screen object with update/draw (title, cutscene, shop...)
      this.overlay = null;  // drawn over gameplay (pause, radio, complete card)
      this.mode = 'menu';   // 'menu' | 'play'
      this.particles = new (E().Particles)();
      this.radio = { queue: [], log: [] };
      this.slot = 0;
      this.state = null;
      this.cam = { x: 0, y: 0 };
      this.shakeT = 0; this.shakeAmt = 0;
      PM.Game = this;
      this.toTitle();
    }

    // ============================================================ flow
    toTitle() { this.mode = 'menu'; this.overlay = null; this.screen = new PM.UI.Title(this); }

    startSlot(slot, opts = {}) {
      this.slot = slot;
      const existing = PM.Save.load(slot);
      this.state = existing || PM.Save.fresh();
      if (!existing) this.state.hard = !!opts.hard;
      if (!this.state.runId) this.state.runId = PM.LB.newRunId();
      if (!this.state.name) {
        // every save needs a leaderboard name (older saves are asked the first time they're loaded)
        this.mode = 'menu';
        this.screen = new PM.UI.NameEntry(this, (name) => { this.state.name = name; PM.LB.rememberName(name); this.persist(); this.continueSlot(); }, () => this.toTitle());
        return;
      }
      this.continueSlot();
    }

    continueSlot() {
      if (!this.state.beaten.length && this.state.level > 1) for (let i = 1; i < this.state.level; i++) this.state.beaten.push(i);
      if (this.state.replayReturn) { this.state.level = this.state.replayReturn; this.state.replayReturn = null; }
      if (this.state.level > 50) { this.mode = 'menu'; this.screen = new PM.UI.LevelSelect(this, () => this.toTitle()); return; }
      this.radio = { queue: [], log: [] };
      if (!this.state.introSeen) {
        this.playCutscene('intro', () => { this.state.introSeen = true; this.persist(); this.beginLevel(this.state.level); });
      } else this.beginLevel(this.state.level);
    }

    playCutscene(name, done) {
      this.mode = 'menu'; this.overlay = null;
      A().play(name === 'intro' ? 'cutscene-dark' : 'cutscene-' + name);
      this.screen = new PM.Cutscene(PM.STORY.cutscenes[name], done);
    }

    persist() {
      if (!this.state) return;
      if (this.mode === 'play' && this.level && this.levelStats) this.state.levelClock = { level: this.level.num, t: this.levelStats.clock };
      PM.Save.write(this.slot, this.state);
    }

    beginLevel(n, isRetry = false) {
      if (n > 50) return this.finishGame();
      const data = PM.LEVELS[n];
      if (!data) return this.showNotBuilt(n);
      const s = this.state;
      s.level = n;
      const biome = biomeOf(n);
      // snapshot at the start of a biome (used if all lives are lost)
      if ((n - 1) % LEVELS_PER_BIOME === 0 && !isRetry && !s.replayReturn) {
        const snap = JSON.parse(JSON.stringify(s)); delete snap.biomeStart;
        snap.lives = C().START_LIVES; snap.hearts = C().START_HEARTS;
        s.biomeStart = snap;
      }
      s.armor = s.maxArmor;
      this.persist();
      this.loadLevel(n, data);
      const cpHere = s.checkpoint && s.checkpoint.level === n;
      if (cpHere) this.resumeAtCheckpoint(s.checkpoint);
      this.levelStartSnapshot = cpHere ? { coins: s.checkpoint.coins, item: s.checkpoint.item } : { coins: s.coins, item: s.item };
      // clock = leaderboard time for this level: keeps running through deaths, and resumes at a checkpoint after quitting
      if (!isRetry) this.levelStats = { time: 0, hits: 0, coinsGot: 0, restarts: 0, enemies: 0, clock: cpHere && s.levelClock && s.levelClock.level === n ? s.levelClock.t : 0 };
      else { this.levelStats.time = 0; this.levelStats.coinsGot = 0; this.levelStats.enemies = 0; this.levelStats.restarts++; }
      this.stats = this.levelStats;
      // radio messages at the start of a level
      const starts = PM.STORY.levelStart[n];
      if (starts && !s.seen['start' + n]) { s.seen['start' + n] = true; starts.forEach((m) => this.radioPush(m.from, m.text)); }
      this.tommyAt = 25 + Math.random() * 35;
      this.tommySaid = !!s.seen['tommy' + n];
      this.mode = 'play'; this.screen = null; this.overlay = null;
      A().play('level-' + n);
      this.bannerT = 3;
    }

    loadLevel(n, data) {
      const L = new PM.Level(n, data);
      this.level = L;
      const t = C().TILE;
      this.enemies = []; this.pickups = []; this.projectiles = []; this.platforms = []; this.hazards = []; this.signs = []; this.checkpoints = [];
      this.particles = new (E().Particles)();
      this.boss = null; this.bossArena = null; this.bossDone = false;
      let signIdx = 0, dripIdx = 0;
      const signTexts = data.signs || PM.STORY.signs;
      let coinTotal = 0;
      for (const sp of L.spawns) {
        const px = sp.tx * t, py = sp.ty * t;
        switch (sp.ch) {
          case 'o': this.pickups.push(new (E().Pickup)('coin', px + 7, py + 7)); coinTotal++; break;
          case 'L': if (!this.state.secretsFound.includes(L.biome)) this.pickups.push(new (E().Pickup)('life', px + 3, py + 3)); break;
          case 'r': case 'R': case 'c': case 'e': this.enemies.push(new (E().Enemy)(sp.ch, px, py, L.biome)); break;
          case 'U': if (!this.state.scuba) this.pickups.push(new (E().Pickup)('scuba', px + 3, py + 3)); break;
          case 'W': this.pickups.push(new (E().Pickup)('wand', px + 3, py + 3)); break;
          case 'd': this.hazards.push(new (E().DripPipe)(sp.tx, sp.ty, dripIdx++)); break;
          case 'M': this.platforms.push(new (E().MovingPlatform)(L, sp.tx, sp.ty, false)); break;
          case 'V': this.platforms.push(new (E().MovingPlatform)(L, sp.tx, sp.ty, true)); break;
          case 'S': this.signs.push(new (E().Sign)(sp.tx, sp.ty, signTexts[signIdx++] || '')); break;
          case 'K': if (!this.state.hard) this.checkpoints.push(new (E().Checkpoint)(sp.tx, sp.ty)); break;
        }
      }
      this.coinTotal = coinTotal;
      const st = L.start;
      this.player = new (E().Player)(st.tx * t + 4, (st.ty + 1) * t - 36);
      this.player.effect = null;
      if (data.boss) {
        const b = data.boss;
        const mid = Math.floor((b.x0 + b.x1) / 2);
        let fy = 0; while (fy < L.h && L.isSolid(mid, fy)) fy++; // skip the ceiling
        while (fy < L.h && !L.isSolid(mid, fy)) fy++;
        this.bossArena = { x0: (b.x0 + 1) * t, x1: b.x1 * t, floorY: fy * t, tx0: b.x0, tx1: b.x1, type: b.type, triggered: false };
      }
      this.cam.x = Math.max(0, this.player.x - 300); this.cam.y = Math.max(0, L.pxH - C().HEIGHT);
      this.radioTriggers = (data.radio || []).map((r) => ({ ...r, done: false }));
      // auto-run levels: the Giant Flea chases from behind
      this.autoRun = !!data.autorun;
      this.chaser = data.autorun ? { x: this.player.x - 380, y: this.player.bottom, t: 0, caught: false } : null;
    }

    // Called after the last level. (The real ending + village celebration will go here.)
    finishGame() {
      const wasHard = this.state.hard;
      PM.Save.unlock('hardMode');
      if (wasHard) PM.Save.unlock('hardModeBeaten');
      this.persist();
      PM.LB.submitRun(this.state, true);
      this.mode = 'menu';
      A().play('title');
      this.screen = new PM.UI.MessageScreen('You did it!', wasHard
        ? 'You beat Hard Mode with no checkpoints. Bobby is speechless. (That has never happened before.)'
        : "Pholia made it home! HARD MODE is now unlocked — start a new game in an empty slot to try it. No checkpoints. Good luck, kitty.",
        () => this.toTitle(), { cat: 'sit', bg: '#2a1f28' });
    }

    showNotBuilt(n) {
      this.mode = 'menu';
      const b = PM.BIOMES[biomeOf(n)];
      A().play('cutscene-tbc');
      this.screen = new PM.UI.MessageScreen('To be continued...', `${b ? b.name : 'The next area'} is still being built! Your progress is saved — come back after the next update to keep going.`, () => this.toTitle(), { cat: 'sit', bg: '#2a1f28' });
    }

    completeLevel() {
      if (this.overlay || this.mode !== 'play') return;
      const s = this.state;
      this.levelStats.coinTotal = this.coinTotal;
      this.player.frozen = true;
      const board = PM.LB.submitLevel(s, this.level.num, this.levelStats.clock);
      this.overlay = new PM.UI.CompleteCard(this, this.levelStats, board, () => {
        this.overlay = null;
        s.hearts = Math.max(s.hearts, 0.5);
        if (this.player.effect) { /* power-ups end with the level */ }
        const n = this.level.num;
        if (!s.beaten.includes(n)) s.beaten.push(n);
        if (s.checkpoint && s.checkpoint.level === n) s.checkpoint = null;
        if (s.replayReturn) {
          // replaying an old level: go back to real progress, no cutscenes or shop
          const back = s.replayReturn; s.replayReturn = null; s.level = back; this.persist();
          if (back > 50) { this.mode = 'menu'; this.screen = new PM.UI.LevelSelect(this, () => this.toTitle()); }
          else this.beginLevel(back);
          return;
        }
        const next = n + 1;
        s.level = next;
        this.persist();
        PM.LB.submitRun(s);
        const afterShop = () => {
          if (n % 10 === 0) {
            // biome finished: boss cutscene, then next biome
            const cs = this.level.data.after || null;
            if (cs) this.playCutscene(cs, () => { this.persist(); this.beginLevel(next); });
            else this.beginLevel(next);
          } else this.beginLevel(next);
        };
        if (this.level.data.shop && !s.shopVisited.includes(this.level.biome)) {
          s.shopVisited.push(this.level.biome); this.persist();
          this.mode = 'menu';
          this.screen = new PM.UI.Shop(this, () => { this.persist(); afterShop(); });
        } else afterShop();
      });
    }

    updateChaser(dt) {
      const ch = this.chaser, p = this.player;
      ch.t += dt;
      if (p.dead || p.frozen || this.overlay) return;
      const gap = p.x - ch.x;
      ch.x += (C().AUTORUN_FLEA_SPEED + Math.max(0, gap - 400) * 2.5) * dt;
      ch.y += (p.bottom - ch.y) * Math.min(1, dt * 2);
      if (gap < 120 && !ch.caught) {
        ch.caught = true;
        this.floater('CHOMP!', p.cx, p.y - 20, '#ff5040'); this.shake(10);
        this.loseLife();
      }
    }
    drawChaser(ctx) {
      const ch = this.chaser, hop = Math.abs(Math.sin(ch.t * 5)) * 40;
      D().giantFlea(ctx, ch.x, Math.min(ch.y, this.cam.y + C().HEIGHT - 10) - hop, { facing: 1, t: ch.t, air: hop > 10, angry: true });
      if (this.player.x - ch.x < 300) D().text(ctx, '!!', ch.x + 60, ch.y - 150, { size: 30, color: '#ff5040', outline: 5, align: 'center' });
    }

    activateCheckpoint(cp) {
      const s = this.state, p = this.player;
      cp.active = true;
      s.checkpoint = { level: this.level.num, x: cp.x + 4, y: cp.y + C().TILE - 36, coins: s.coins, item: s.item };
      this.levelStartSnapshot = { coins: s.coins, item: s.item };
      this.persist();
      A().sfx('oneup');
      this.particles.burst(cp.x + 30, cp.y - 30, '#5ab8ff', 14, 200);
      this.particles.add({ kind: 'text', text: 'Checkpoint!', x: p.cx, y: p.y - 14, life: 1.6, color: '#bfe6ff', size: 22 });
    }
    resumeAtCheckpoint(cp) {
      const p = this.player;
      p.x = cp.x; p.y = cp.y; p.lastSafe = { x: cp.x, y: cp.y };
      for (const c of this.checkpoints) if (Math.abs(c.x + 4 - cp.x) < 40) { c.active = true; c.raise = 1; }
      // everything behind the flag is already done
      const behind = (o) => o.x < cp.x - 64;
      this.pickups = this.pickups.filter((o) => !behind(o));
      this.enemies = this.enemies.filter((o) => !behind(o));
      for (const r of this.radioTriggers) if (r.at * C().TILE < cp.x) r.done = true;
      this.cam.x = Math.max(0, p.x - 300);
    }

    // Start a level from the level select
    playLevel(n) {
      const s = this.state;
      const progress = s.replayReturn || s.level;
      if (n === progress) { s.replayReturn = null; s.level = n; }
      else { s.replayReturn = progress; }
      this.overlay = null;
      this.beginLevel(n);
    }

    saveAndQuit() {
      if (this.state.replayReturn) { this.state.level = this.state.replayReturn; this.state.replayReturn = null; }
      // the level restarts when you come back, so undo coins/items picked up in it
      if (this.levelStartSnapshot) { this.state.coins = this.levelStartSnapshot.coins; this.state.item = this.levelStartSnapshot.item; }
      this.persist(); this.toTitle();
    }

    // ============================================================ damage & lives
    enemyDamage() { return C().ENEMY_DAMAGE[this.level.biome] || 1; }
    bossDamage() { return C().BOSS_DAMAGE[this.level.biome] || 1; }

    hurtPlayer(dmg, srcX, cause, noKnock) {
      const p = this.player, s = this.state;
      if (p.invuln > 0 || p.dead || p.frozen) return;
      let rem = dmg;
      if (s.armor > 0) { const a = Math.min(s.armor, rem); s.armor -= a; rem -= a; }
      s.hearts = Math.max(0, s.hearts - rem);
      this.levelStats.hits++;
      p.invuln = C().HURT_INVULN; p.hurtT = 0.35;
      if (!noKnock) { p.vx = (p.cx < srcX ? -1 : 1) * 260; p.vy = -380; p.dashT = 0; }
      A().sfx('hurt'); this.shake(5);
      this.particles.burst(p.cx, p.y + 10, '#e2475b', 8, 160);
      if (cause === 'sludge') this.tip('sludge');
      if (cause === 'spikes') this.tip('spikes');
      if (s.hearts <= 0) this.loseLife();
    }

    playerFell() { if (!this.player.dead) this.loseLife(); }

    loseLife() {
      const p = this.player, s = this.state;
      if (p.dead) return;
      p.dead = true;
      s.lives--; s.deathsTotal++;
      A().sfx('die');
      this.particles.add({ kind: 'text', text: '-1 life', x: p.cx, y: p.y, life: 1.5, color: '#fff', size: 22 });
      this.deathTimer = 1.6;
    }

    afterDeath() {
      const s = this.state;
      if (s.lives > 0) {
        s.hearts = C().START_HEARTS;
        s.coins = this.levelStartSnapshot.coins;
        s.item = this.levelStartSnapshot.item;
        this.mode = 'menu';
        this.screen = new PM.UI.MessageScreen(`${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left`, (s.checkpoint ? 'Back to the checkpoint flag! ' : '') + (s.lives <= 2 ? "Careful, Pholia! A cat only gets nine." : 'Shake it off and try again!'), () => this.beginLevel(this.level.num, true), { cat: 'sit', bg: '#2a1f28' });
        this.persist();
      } else {
        const b = s.biomeStart;
        const restore = b ? JSON.parse(JSON.stringify(b)) : PM.Save.fresh();
        restore.biomeStart = b; restore.introSeen = true;
        restore.deathsTotal = s.deathsTotal;
        restore.playTime = s.playTime;            // the timer never rolls back
        restore.gameOvers = (s.gameOvers || 0) + 1;
        restore.name = s.name; restore.runId = s.runId;
        restore.seen = s.seen;
        restore.checkpoint = null;
        restore.hard = s.hard;
        restore.beaten = s.beaten;
        restore.scuba = restore.scuba || (s.scuba && restore.level > 30);
        this.state = restore;
        this.persist();
        PM.LB.submitRun(restore);
        this.mode = 'menu';
        A().play('cutscene-dark');
        this.screen = new PM.UI.MessageScreen('Out of lives!', `All nine lives are used up... Pholia shakes off the dust and starts ${PM.BIOMES[biomeOf(restore.level)].name} again from the beginning, with nine fresh lives.`, () => this.beginLevel(restore.level, false), { cat: 'duck', eyes: 'closed', bg: '#1d1418', color: '#e2475b' });
      }
    }

    // ============================================================ items & pickups
    spawnCoins(x, y, n) {
      for (let i = 0; i < n; i++) this.pickups.push(new (E().Pickup)('coin', x - 9, y - 10, (Math.random() - 0.5) * 220, -250 - Math.random() * 200, true));
    }
    maybeDrop(x, y) {
      if (this.boss) return; // no random drops during boss fights
      const cfg = C();
      if (Math.random() >= cfg.DROP_CHANCE) return;
      const r = Math.random(); let acc = 0, kind = 'puff';
      for (const [k, w] of Object.entries(cfg.DROP_TABLE)) { acc += w; if (r < acc) { kind = k; break; } }
      this.pickups.push(new (E().Pickup)(kind, x - 13, y - 20, (Math.random() - 0.5) * 100, -380, true));
    }
    spawnEnemy(kind, x, y) { const e = new (E().Enemy)(kind, x, y, this.level.biome); e.awake = true; this.enemies.push(e); }
    collect(pk) {
      const s = this.state, p = this.player;
      if (pk.kind === 'coin') {
        pk.dead = true; s.coins++; if (!pk.physics) this.levelStats.coinsGot++;
        A().sfx('coin'); this.tip('coin');
        this.particles.add({ x: pk.x + 9, y: pk.y + 9, vx: 0, vy: -60, life: 0.3, color: '#f6c945', r: 4 });
      } else if (pk.kind === 'scuba') {
        pk.dead = true; s.scuba = true; A().sfx('oneup'); this.tip('scuba');
        this.particles.add({ kind: 'text', text: 'SCUBA SUIT!', x: p.cx, y: p.y - 10, life: 2, color: '#bfe6ff', size: 24 });
        this.persist();
      } else if (pk.kind === 'life') {
        pk.dead = true;
        s.secretsFound.push(this.level.biome);
        s.lives = Math.min(C().MAX_LIVES, s.lives + 1);
        A().sfx('oneup'); this.tip('life');
        this.particles.add({ kind: 'text', text: '+1 LIFE!', x: p.cx, y: p.y - 10, life: 2, color: '#f5c542', size: 26 });
        this.persist();
      } else {
        // power-up: one at a time, swap if holding another
        if (s.item === pk.kind) { pk.grabDelay = 1; return; }
        const old = s.item;
        s.item = pk.kind; pk.dead = true;
        A().sfx('powerup'); this.tip(pk.kind);
        this.floater(pk.kind.toUpperCase() + '!  (Y to use)', p.cx, p.y - 14, '#fff');
        if (old) this.pickups.push(new (E().Pickup)(old, p.cx - 13, p.y - 20, -p.facing * 160, -300, true));
      }
    }
    useItem() {
      const s = this.state, p = this.player;
      if (!s.item) { this.floater('no item!', p.cx, p.y - 12, '#fff'); A().sfx('nope'); return; }
      if (this.throwableKind()) { this.throwObject(0.35); return; }
      p.effect = s.item; p.effectT = C().POWERUP_DURATION;
      if (s.item === 'spring') p.airJumps = 1;
      if (s.item === 'feather') { p.sneezeT = 0.8; A().sfx('sneeze'); this.particles.burst(p.cx + p.facing * 20, p.y + 10, '#ffffff', 12, 200); }
      else A().sfx('powerup');
      s.item = null;
    }
    throwableKind() { return ['puff', 'wand', 'worm', 'trap'].includes(this.state.item) ? this.state.item : null; }
    throwObject(charge) {
      const s = this.state, p = this.player, cfg = C();
      const kind = this.throwableKind();
      if (!kind) return;
      s.item = null;
      const v = cfg.THROW_MIN + (cfg.THROW_MAX - cfg.THROW_MIN) * charge;
      if (kind === 'puff') this.projectiles.push(new (E().PuffBomb)(p.cx - 9, p.y, p.facing * v * 0.75 + p.vx * 0.3, -v * 0.65));
      else this.projectiles.push(new (E().Thrown)(kind, p.cx - 12, p.y, p.facing * v * (kind === 'wand' || kind === 'trap' ? 1 : 0.75) + p.vx * 0.3, -v * (kind === 'wand' || kind === 'trap' ? 0.4 : 0.65)));
      A().sfx('throw');
    }
    breakTile(tx, ty) {
      const ch = this.level.tile(tx, ty), t = C().TILE;
      this.level.setTile(tx, ty, '.');
      A().sfx('crumble');
      this.particles.burst(tx * t + 16, ty * t + 16, ch === 'C' ? '#c4965a' : '#6a7a7b', 14, 200);
      if (ch === 'C' && this.level.data.wormPots) this.pickups.push(new (E().Pickup)('worm', tx * t + 3, ty * t, 0, -250, true));
      else if (ch === 'C') this.spawnCoins(tx * t + 16, ty * t + 8, 3);
    }

    playerAttack(box, p) {
      for (const e of this.enemies) {
        if (!e.dead && !p.atkHit.has(e) && E().overlap(box, e)) { p.atkHit.add(e); e.hit(1, p.cx, this, 'paw'); }
      }
      if (this.boss && !p.atkHit.has(this.boss) && this.boss.hitByAttack(box, p, this)) p.atkHit.add(this.boss);
      // break bricks/crates
      const t = C().TILE;
      for (let ty = Math.floor(box.y / t); ty <= Math.floor((box.y + box.h) / t); ty++)
        for (let tx = Math.floor(box.x / t); tx <= Math.floor((box.x + box.w) / t); tx++) {
          const ch = this.level.tile(tx, ty);
          if ((ch === 'B' || ch === 'C') && !p.atkHit.has(tx + ',' + ty)) { p.atkHit.add(tx + ',' + ty); this.breakTile(tx, ty); }
        }
    }

    // ============================================================ radio
    radioPush(from, text, important) {
      this.radio.queue.push({ from, text });
      A().sfx('radio');
      if (important && !this.overlay && this.mode === 'play') this.overlay = new PM.UI.RadioPanel(this);
    }
    tip(key) {
      const s = this.state;
      if (!s || s.seen['tip_' + key] || !PM.STORY.bandit[key]) return;
      s.seen['tip_' + key] = true;
      this.radioPush('bandit', PM.STORY.bandit[key]);
    }
    bossPhaseRadio(phase) {
      const key = (this.bossArena.type) + '_p' + phase;
      if (PM.STORY.clyde[key]) this.radioPush('clyde', PM.STORY.clyde[key], true);
    }

    floater(text, x, y, color) { this.particles.add({ kind: 'text', text, x, y, life: 1.1, color, size: 15 }); }
    shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); this.shakeT = 0.3; }

    // ============================================================ update
    update(dt) {
      this.time += dt;
      D().tick(this.time);
      if (PM.Editor && PM.Editor.active) { PM.Editor.update(dt, this); return; }
      if (this.mode === 'menu' && this.screen) { this.screen.update(dt); return; }
      if (this.mode !== 'play') return;
      if (this.overlay) { this.overlay.update(dt); return; }
      const inp = I();
      if (inp.pressed('pause')) { this.overlay = new PM.UI.PauseMenu(this); A().sfx('select'); return; }
      if (inp.pressed('radio')) { this.overlay = new PM.UI.RadioPanel(this); return; }
      if (PM.Editor && inp.keyPressed('F2')) { PM.Editor.open(this); return; }

      const p = this.player, L = this.level, t = C().TILE;
      this.levelStats.time += dt; this.levelStats.clock += dt;
      this.bannerT = Math.max(0, (this.bannerT || 0) - dt);
      L.update(dt);
      for (const pl of this.platforms) pl.update(dt, this);
      p.update(dt, this);
      for (const e of this.enemies) e.update(dt, this);
      // enemy contact: pounce or get hurt
      // Decide stomps BEFORE bouncing, so landing on a pile of enemies squishes all of them.
      const falling = p.vy > 0, touching = this.enemies.filter((e) => !e.dead && !p.dead && !e.harmless && E().overlap(p, e));
      const stomped = touching.filter((e) => falling && (p.prevBottom - p.vy * dt <= e.y + 8 || p.y + p.h - e.y < 14));
      // if Pholia is coming down on any of them, the others in the pile get squished too
      if (stomped.length) {
        // the pile = anything under or right beside Pholia's paws, standing on the same ground
        const paws = { x: p.x - 10, y: p.y + p.h - 8, w: p.w + 20, h: 30 };
        const pile = this.enemies.filter((e) => !e.dead && !e.harmless && (stomped.includes(e) || (E().overlap(paws, e) && Math.abs((e.y + e.h) - (stomped[0].y + stomped[0].h)) < 24)));
        for (const e of pile) e.hit(e.hp, p.cx, this, 'stomp');
        p.pounce(); p.invuln = Math.max(p.invuln, 0.12);
      }
      for (const e of touching) {
        if (e.dead || p.dead) continue;
        if (p.dashT > 0) e.hit(1, p.cx, this);
        else this.hurtPlayer(this.enemyDamage(), e.x + e.w / 2);
      }
      this.enemies = this.enemies.filter((e) => !e.dead);
      for (const pk of this.pickups) pk.update(dt, this);
      this.pickups = this.pickups.filter((x) => !x.dead);
      for (const pr of this.projectiles) pr.update(dt, this);
      if (this.chaser) this.updateChaser(dt);
      this.projectiles = this.projectiles.filter((x) => !x.dead);
      for (const h of this.hazards) h.update(dt, this);
      for (const s of this.signs) s.update(dt, this);
      for (const c of this.checkpoints) c.update(dt, this);
      this.particles.update(dt);

      // radio triggers by position
      for (const r of this.radioTriggers) if (!r.done && p.x > r.at * t) { r.done = true; if (!this.state.seen['r' + L.num + '_' + r.at]) { this.state.seen['r' + L.num + '_' + r.at] = true; this.radioPush(r.from, r.text); } }
      if (!this.tommySaid && this.levelStats.time > this.tommyAt) {
        this.tommySaid = true; this.state.seen['tommy' + L.num] = true;
        const lines = PM.STORY.tommy; this.radioPush('tommy', lines[(L.num - 1) % lines.length]);
      }

      // first-sight tips for tiles
      if (!this.tipScanT || this.time > this.tipScanT) {
        this.tipScanT = this.time + 0.5;
        const x0 = Math.floor(p.x / t), y0 = Math.floor(p.y / t);
        for (let dy = -4; dy <= 4; dy++) for (let dx = 0; dx <= 12; dx++) {
          const ch = L.tile(x0 + dx, y0 + dy);
          if (ch === 'x') this.tip('crumble'); else if (ch === 'B') this.tip('breakable'); else if (ch === '~') this.tip('sludge'); else if (ch === '^') this.tip('spikes');
        }
        if (this.platforms.some((pl) => Math.abs(pl.x - p.x) < 500)) this.tip('moving');
      }

      // boss arena
      const ar = this.bossArena;
      if (ar && !ar.triggered && p.x > ar.x0 + 3 * t) {
        ar.triggered = true;
        for (let ty = 0; ty < Math.floor(ar.floorY / t); ty++) L.setTile(ar.tx0, ty, '#');
        this.boss = new PM.Bosses[ar.type](this, ar);
        A().play((this.level.data.boss.final ? 'boss-' : 'mini-') + ar.type);
        this.autoRun = false; this.chaser = null;
        const pre = PM.STORY.clyde[ar.type + '_pre'];
        if (pre) this.radioPush('clyde', pre, true);
      }
      if (this.boss) {
        this.boss.update(dt, this);
        if (this.boss.done && !this.bossDone) {
          this.bossDone = true;
          if (this.level.data.boss.final) {
            // biome boss: straight to the ending cutscene
            this.boss = null;
            const s = this.state;
            if (!s.rescued.includes(this.level.data.boss.rescue)) s.rescued.push(this.level.data.boss.rescue);
            this.completeLevel();
          } else {
            // mini-boss: open the far wall
            for (let ty = 0; ty < Math.floor(ar.floorY / t); ty++) L.setTile(ar.tx1, ty, '.');
            this.boss = null;
            A().play('level-' + L.num);
          }
        }
      }

      // exit
      if (L.exitTile && !p.dead) {
        const ex = L.exitTile.tx * t, ey = L.exitTile.ty * t;
        if (p.overlapsRect(ex - 8, ey - 40, t + 16, t + 40)) { A().sfx('meow'); this.completeLevel(); }
      }

      // death timer
      if (p.dead) { this.deathTimer -= dt; if (this.deathTimer <= 0) this.afterDeath(); }

      this.updateCamera(dt);
      this.state.playTime += dt;
    }

    updateCamera(dt) {
      const p = this.player, L = this.level, W = C().WIDTH, H = C().HEIGHT;
      this.lookX = (this.lookX || 0) + ((p.facing * 90) - (this.lookX || 0)) * Math.min(1, dt * 2);
      let tx = p.cx - W / 2 + this.lookX, ty = p.y - H * 0.55;
      let minX = 0, maxX = L.pxW - W;
      if (this.boss && this.bossArena) { minX = this.bossArena.x0 - C().TILE; maxX = this.bossArena.x1 + C().TILE - W; if (maxX < minX) maxX = minX; tx = minX + (maxX - minX) / 2; }
      tx = Math.max(minX, Math.min(maxX, tx));
      ty = Math.max(0, Math.min(L.pxH - H, ty));
      this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 6);
      this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 5);
      this.cam.x = Math.max(0, Math.min(L.pxW - W, this.cam.x));
    }

    // ============================================================ draw
    draw() {
      const ctx = this.ctx, W = C().WIDTH, H = C().HEIGHT;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (PM.Editor && PM.Editor.active) { PM.Editor.draw(ctx, this); return; }
      if (this.mode === 'menu' && this.screen) { this.screen.draw(ctx); this.paper(ctx); return; }
      if (!this.level) return;
      const L = this.level;
      let sx = 0, sy = 0;
      if (this.shakeT > 0) { this.shakeT -= 1 / 60; sx = (Math.random() - 0.5) * this.shakeAmt * 2; sy = (Math.random() - 0.5) * this.shakeAmt * 2; } else this.shakeAmt = 0;
      L.drawBackground(ctx, this.cam, this.time);
      ctx.save();
      ctx.translate(Math.round(-this.cam.x + sx), Math.round(-this.cam.y + sy));
      // entry pipe above the start
      this.drawEntryPipe(ctx);
      for (const s of this.signs) s.draw(ctx);
      for (const c of this.checkpoints) c.draw(ctx);
      L.drawTiles(ctx, this.cam, this.time);
      for (const pl of this.platforms) pl.draw(ctx);
      for (const h of this.hazards) h.draw(ctx);
      for (const pk of this.pickups) pk.draw(ctx);
      for (const e of this.enemies) e.draw(ctx);
      if (this.boss) this.boss.draw(ctx);
      if (this.chaser) this.drawChaser(ctx);
      this.player.draw(ctx, this);
      for (const pr of this.projectiles) pr.draw(ctx);
      this.particles.draw(ctx);
      for (const s of this.signs) s.drawBubble(ctx);
      ctx.restore();
      // vignette
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      this.paper(ctx);
      PM.UI.drawHUD(ctx, this);
      if (this.boss) this.boss.drawUI(ctx);
      if (this.player.dead) { ctx.fillStyle = `rgba(0,0,0,${Math.min(0.6, (1.6 - this.deathTimer) * 0.5)})`; ctx.fillRect(0, 0, W, H); }
      if (this.overlay) this.overlay.draw(ctx);
    }
    drawEntryPipe(ctx) {
      const st = this.level.start, t = C().TILE;
      const x = st.tx * t + 16;
      let top = st.ty; while (top > 0 && !this.level.isSolid(st.tx, top - 1)) top--;
      if (st.ty - top < 3) return;
      const y = (top) * t;
      D().rect(ctx, x - 22, y - 4, 44, 50, 990, '#6f7d80', 2.5, 0.8);
      D().rect(ctx, x - 27, y + 40, 54, 14, 991, '#7f8d90', 2.5, 0.8);
    }
    paper(ctx) {
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = D().paperPattern(ctx); ctx.fillRect(0, 0, C().WIDTH, C().HEIGHT); ctx.restore();
    }
  }

  PM.GameClass = Game;
})();
