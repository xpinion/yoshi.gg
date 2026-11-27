// Bosses for biomes 2-5 and the Mole Queen's servant mini-bosses.
(function () {
  const C = () => PM.CONFIG;
  const D = () => PM.Draw;
  const A = () => PM.Audio;
  const E = () => PM.Entities;
  const Base = PM.BossBase, Digby = PM.Bosses.digby;
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---------------------------------------------------------- shared: lobbed shots
  class Shots {
    constructor() { this.list = []; }
    lob(x, y, tx, kind, speed = 1) {
      const dx = tx - x, t = 0.9 / speed;
      this.list.push({ x, y, vx: dx / t, vy: -C().GRAVITY * 0.5 * t, kind, t: 0, w: 14, h: 14 });
    }
    shoot(x, y, vx, vy, kind) { this.list.push({ x, y, vx, vy, kind, t: 0, w: 14, h: 14, noGrav: true }); }
    update(dt, game, dmg) {
      for (const s of this.list) {
        s.t += dt;
        if (!s.noGrav) s.vy += C().GRAVITY * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (game.level.rectSolid(s.x, s.y, s.w, s.h) || s.t > 4) { s.dead = true; game.particles.burst(s.x + 7, s.y + 7, '#8b6a42', 6, 100); }
        else if (overlap(s, game.player)) { s.dead = true; game.hurtPlayer(dmg, s.x, 'boss'); }
      }
      this.list = this.list.filter((s) => !s.dead);
    }
    draw(ctx) {
      for (const s of this.list) {
        const c = { bolt: '#9aa3ad', mud: '#6a5030', acorn: '#a0703a', clod: '#7a5a40', venom: '#8ad04a', feather: '#e8e0f8', rock: '#8a8580' }[s.kind] || '#888';
        if (s.kind === 'feather') { ctx.save(); ctx.translate(s.x + 7, s.y + 7); ctx.rotate(Math.atan2(s.vy, s.vx)); D().blob(ctx, 0, 0, 10, 3.5, 5, c, 1.6); ctx.restore(); }
        else D().blob(ctx, s.x + 7, s.y + 7, s.kind === 'rock' ? 12 : 7, s.kind === 'rock' ? 11 : 7, 3, c, 2);
      }
    }
  }

  // ---------------------------------------------------------- MINI-BOSSES (Digby's coworkers)
  const MINIS = {
    dusty: { name: 'Dusty the Scrapper', hat: 'beanie', color: '#7a5a3a', hp: 7, shot: 'bolt', every: 1.6,
      intro: "Dusty here! The Queen pays me in shiny junk. And YOU look like junk!", stuck: ['My goggles are fogged!', 'Ow, rusty!', 'That wall was NOT there yesterday!'], angry: "Time for the BIG scrap!", defeat: "My beautiful junk pile... I'm going home." },
    gus: { name: 'Gus the Glider', hat: 'tophat', color: '#6a5a3a', hp: 7, shot: 'acorn', every: 1.3, drill: false,
      intro: "Gus! Of the Royal Air Moles! Prepare to be... bonked by acorns!", stuck: ['Who parked a tree there?', 'Turbulence!', 'Gus is down! Gus is down!'], angry: "Acorn storm, engage!", defeat: "Tell the Queen... I tried my best... wheee..." },
    sally: { name: 'Snorkel Sally', hat: 'bow', color: '#5a5a4a', hp: 8, shot: 'mud', every: 1.1,
      intro: "Blub blub! Sally of the swamp patrol! You're getting MUDDY, kitty!", stuck: ['Glub! Stuck in the muck!', 'My snorkel!', 'Ew, a wall!'], angry: "Double mud! Triple mud!", defeat: "I need a bath. A long one. Goodbye!" },
    brutus: { name: 'Brutus, Royal Guard', hat: 'crown', color: '#4a3a44', hp: 10, shot: 'clod', every: 1.2, burrowEvery: 1,
      intro: "HALT! Brutus of the Queen's Guard! None shall pass! Especially cats!", stuck: ['Guard down! Guard down!', 'Oof. Solid wall.', 'The Queen must never see this.'], angry: "You'll never reach the Queen!", defeat: "Forgive me, my Queen... the cat is... too fluffy..." },
  };
  function makeMini(key) {
    const cfg = MINIS[key];
    return class extends Digby {
      constructor(game, arena) {
        super(game, arena);
        this.name = cfg.name; this.maxHp = this.hp = cfg.hp; this.hat = cfg.hat; this.color = cfg.color;
        this.stuckLines = cfg.stuck; this.angryLine = cfg.angry; this.defeatLine = cfg.defeat;
        this.drill = cfg.drill; this.burrowEvery = cfg.burrowEvery;
        this.shots = new Shots(); this.shotT = cfg.every;
        this.speak(cfg.intro, 3);
      }
      update(dt, game) {
        super.update(dt, game);
        if (!this.defeated && (this.state === 'walk' || this.state === 'stuck' && key === 'sally')) {
          this.shotT -= dt * (this.hp <= this.maxHp / 2 ? 1.5 : 1);
          if (this.shotT <= 0) { this.shotT = cfg.every; this.shots.lob(this.cx, this.y + 10, game.player.cx + (Math.random() - 0.5) * 60, cfg.shot); A().sfx('throw'); }
        }
        this.shots.update(dt, game, game.enemyDamage());
      }
      draw(ctx) { super.draw(ctx); this.shots.draw(ctx); }
    };
  }

  // ============================================================ THE GIANT FLEA
  class GiantFlea extends Base {
    constructor(game, arena) {
      super(game, arena);
      this.name = 'The Giant Flea'; this.hp = 3; this.phase = 1;
      this.w = 130; this.h = 96;
      this.x = arena.x0 + 20; this.y = arena.floorY - this.h - 200; this.vx = 0; this.vy = 0;
      this.facing = 1; this.hops = 0; this.bombs = []; this.dropped = false;
      this.puffSpots = [arena.x0 + 60, arena.x0 + (arena.x1 - arena.x0) / 2 - 12, arena.x1 - 90];
      this.puffT = 0;
      this.setState('hop'); this.airborne = true;
      this.speak("BOING BOING! No more running, kitty! You're cornered!", 3);
    }
    get cx() { return this.x + this.w / 2; }
    faceBox() { return { x: this.facing > 0 ? this.x + this.w - 30 : this.x - 30, y: this.y + 10, w: 60, h: 60 }; }
    body() { return { x: this.x + 15, y: this.y + 20, w: this.w - 30, h: this.h - 20 }; }
    update(dt, game) {
      this.t += dt; this.stateT += dt; this.sayT -= dt; this.flash -= dt;
      const p = game.player, a = this.arena, cfg = C();
      this.updateBombs(dt, game);
      this.keepPuffs(dt, game);
      if (this.defeated) { this.vy += cfg.GRAVITY * dt; this.y += this.vy * dt; if (this.stateT > 2.5) this.done = true; return; }
      const need = [0, 4, 5, 6][this.phase];
      switch (this.state) {
        case 'hop':
          if (!this.airborne && this.stateT > [0, 0.5, 0.4, 0.3][this.phase]) {
            this.facing = p.cx < this.cx ? -1 : 1;
            const high = this.phase === 3 && this.hops % 3 === 2;
            this.vy = high ? -1150 : -820; this.vx = high ? 0 : (p.cx - this.cx) * 1.1;
            if (high) { this.slamX = p.cx; this.speak('INCOMING!', 1); }
            this.airborne = true; this.dropped = false; this.stateT = 0; A().sfx('jump');
          }
          if (this.airborne && !this.dropped && this.vy > -200) {
            this.dropped = true;
            const n = this.phase === 1 ? 1 : 2;
            for (let i = 0; i < n; i++) this.bombs.push({ x: this.cx + (i - (n - 1) / 2) * 70, y: this.y + this.h, vy: 0, fuse: 1.1, w: 20, h: 20 });
          }
          if (this.airborne && this.slamX != null && this.vy > 0) { this.x += (this.slamX - this.cx) * Math.min(1, dt * 6); }
          break;
        case 'tired':
          this.vx = 0;
          if (this.stateT > [0, 4, 3.4, 2.8][this.phase]) { this.setState('hop'); this.hops = 0; this.speak('Okay! Second wind! BOING!', 1.2); }
          break;
        case 'hurt':
          this.vx = 0;
          if (this.stateT > 2.2) { this.phase++; this.hops = 0; this.setState('hop'); game.bossPhaseRadio(this.phase); }
          break;
      }
      this.vy = Math.min(cfg.MAX_FALL * 1.4, this.vy + cfg.GRAVITY * 1.1 * dt);
      const res = game.level.moveBody(this, dt);
      if (this.x < a.x0 + 2) { this.x = a.x0 + 2; this.vx = Math.abs(this.vx); }
      if (this.x + this.w > a.x1 - 2) { this.x = a.x1 - this.w - 2; this.vx = -Math.abs(this.vx); }
      if (res.ground && this.airborne) {
        this.airborne = false; this.vx = 0; game.shake(this.slamX != null ? 14 : 6); A().sfx('land');
        game.particles.burst(this.cx, this.y + this.h, '#d8b080', 10, 200);
        this.slamX = null;
        if (this.state === 'hop') { this.hops++; this.stateT = 0; if (this.hops >= need) { this.setState('tired'); this.speak(['*huff huff* ...need... a... break...', 'So... sleepy...', 'Legs... are... noodles...'][this.phase - 1], 2); } }
      }
      if (this.state !== 'tired' && this.state !== 'hurt' && !p.dead && overlap(this.body(), p)) game.hurtPlayer(game.bossDamage(), this.cx, 'boss');
    }
    keepPuffs(dt, game) {
      const have = game.state.item === 'puff' || game.pickups.some((k) => k.kind === 'puff') || game.projectiles.some((k) => k instanceof E().PuffBomb);
      if (have || this.defeated) { this.puffT = 0; return; }
      this.puffT += dt;
      if (this.puffT > 1.2) {
        this.puffT = 0;
        const x = this.puffSpots[Math.floor(Math.random() * this.puffSpots.length)];
        const pk = new (E().Pickup)('puff', x, this.arena.floorY - 40); pk.life = Infinity;
        game.pickups.push(pk); game.particles.burst(x + 13, this.arena.floorY - 30, '#ff8fc2', 8, 120);
      }
    }
    updateBombs(dt, game) {
      for (const b of this.bombs) {
        if (!b.landed) { b.vy += C().GRAVITY * dt; b.y += b.vy * dt; if (game.level.rectSolid(b.x - 10, b.y, 20, 12)) { b.landed = true; b.y = this.arena.floorY - 10; } }
        else { b.fuse -= dt; if (b.fuse <= 0) { b.dead = true; A().sfx('boom'); game.shake(5); game.particles.add({ kind: 'boom', x: b.x, y: b.y, life: 0.4, r: 60 }); const p = game.player; if (Math.hypot(p.cx - b.x, p.y + p.h / 2 - b.y) < 65) game.hurtPlayer(1, b.x, 'boss'); } }
      }
      this.bombs = this.bombs.filter((b) => !b.dead);
    }
    puffHit(bomb) { return !this.defeated && overlap(bomb, this.body()); }
    blast(cx, cy, R, game) {
      if (this.defeated || this.state === 'hurt') return;
      if (this.state === 'tired' && Math.hypot(cx - (this.faceBox().x + 30), cy - (this.faceBox().y + 30)) < R + 50) {
        this.hp--; this.flash = 1; A().sfx('bosshit'); game.shake(12);
        if (this.hp <= 0) { this.defeated = true; this.setState('defeat'); this.vy = -400; this.speak('BOING... b-boing... *flop*', 3); game.spawnCoins(this.cx, this.y, 25); }
        else { this.setState('hurt'); this.speak(['ACHOO! Right in the face!', 'My antennae are all frizzy!'][2 - this.hp], 2); }
      } else if (Math.hypot(cx - this.cx, cy - (this.y + this.h / 2)) < R + 70) game.floater('boing! wait till he\'s tired!', this.cx, this.y - 20, '#ffe9a0');
    }
    hitByAttack(box, player, game) {
      if (this.defeated || !overlap(box, this.body())) return false;
      A().sfx('hit'); game.floater(this.state === 'tired' ? 'throw a puff ball at his face!' : 'too bouncy!', this.cx, this.y - 20, '#ffe9a0');
      return true;
    }
    draw(ctx) {
      for (const b of this.bombs) D().bomb(ctx, b.x, b.y, b.fuse);
      if (this.slamX != null && this.vy > 0) { ctx.globalAlpha = 0.3; D().blob(ctx, this.slamX, this.arena.floorY - 3, 60, 8, 1, '#000', 0); ctx.globalAlpha = 1; }
      if (this.flash > 0 && Math.floor(this.t * 16) % 2) ctx.globalAlpha = 0.6;
      D().giantFlea(ctx, this.cx - this.facing * 10, this.y + this.h, { facing: this.facing, t: this.t, air: this.airborne, tired: this.state === 'tired', dizzy: this.state === 'hurt' || this.defeated, angry: this.phase === 3, squash: this.state === 'tired' ? 0.6 : 0 });
      ctx.globalAlpha = 1;
      this.drawSpeech(ctx, this.cx, this.y - 50);
    }
    drawUI(ctx) { if (!this.defeated) this.drawBar(ctx, this.name + (this.phase > 1 ? `  — phase ${this.phase}` : ''), this.hp, 3); }
  }

  // ============================================================ THE BIRD QUEEN
  class BirdQueen extends Base {
    constructor(game, arena) {
      super(game, arena);
      this.name = 'The Bird Queen'; this.phase = 1; this.hits = 0;
      this.w = 150; this.h = 96;
      this.x = (arena.x0 + arena.x1) / 2 - 75; this.y = arena.floorY - 360; this.facing = -1;
      this.swoops = 0; this.shots = new Shots(); this.wandT = 0;
      this.setState('fly'); this.speak("Tweet tweet, kitty! These are MY trees. Nobody climbs my trees!", 3);
    }
    get cx() { return this.x + this.w / 2; }
    body() { return { x: this.x + 20, y: this.y + 10, w: this.w - 40, h: this.h - 10 }; }
    hoverY() { return this.arena.floorY - 330; }
    update(dt, game) {
      this.t += dt; this.stateT += dt; this.sayT -= dt; this.flash -= dt;
      const p = game.player, a = this.arena;
      this.shots.update(dt, game, game.enemyDamage() * 1.5);
      this.ensureWand(dt, game);
      if (this.defeated) { this.y += 200 * dt; if (this.stateT > 2.5) this.done = true; return; }
      const span = a.x1 - a.x0 - this.w;
      switch (this.state) {
        case 'fly': {
          const tx = a.x0 + span / 2 + Math.sin(this.t * 0.9) * span * 0.45;
          this.x += (tx - this.x) * Math.min(1, dt * 2); this.y += (this.hoverY() + Math.sin(this.t * 3) * 15 - this.y) * Math.min(1, dt * 3);
          this.facing = p.cx < this.cx ? -1 : 1;
          if (this.phase === 3 && Math.floor(this.stateT * 1.2) !== Math.floor((this.stateT - dt) * 1.2)) {
            for (let i = -1; i <= 1; i++) { const ang = Math.atan2(p.y - this.y - 40, p.cx - this.cx) + i * 0.25; this.shots.shoot(this.cx, this.y + 50, Math.cos(ang) * 320, Math.sin(ang) * 320, 'feather'); }
          }
          if (this.stateT > [0, 2.2, 1.8, 1.6][this.phase]) { this.setState('screech'); A().sfx('squeak'); this.target = { x: p.cx, y: a.floorY - 30 }; }
          break;
        }
        case 'screech':
          if (this.stateT > 0.6) { this.setState('swoop'); this.from = { x: this.cx, y: this.y }; if (this.phase >= 2) { game.spawnEnemy('r', a.x0 + 40, this.hoverY() + 120); game.spawnEnemy('r', a.x1 - 70, this.hoverY() + 120); } }
          break;
        case 'swoop': {
          const T = [0, 1.3, 1.1, 0.95][this.phase], k = Math.min(1, this.stateT / T);
          const dir = this.target.x > this.from.x ? 1 : -1; this.facing = dir;
          const ex = this.target.x + dir * 260;
          const x = (1 - k) * (1 - k) * this.from.x + 2 * k * (1 - k) * this.target.x + k * k * ex;
          const y = (1 - k) * (1 - k) * this.from.y + 2 * k * (1 - k) * (this.arena.floorY + 140) + k * k * this.hoverY();
          this.x = Math.max(a.x0, Math.min(a.x1 - this.w, x - this.w / 2)); this.y = y;
          if (k >= 1) {
            this.swoops++;
            if (this.swoops >= [0, 3, 3, 4][this.phase]) { this.swoops = 0; this.setState('tired'); this.speak(['*pant* My wings... so tired...', 'Need... a... perch...', 'Wing... cramp...'][this.phase - 1], 2); }
            else this.setState('fly');
          }
          break;
        }
        case 'tired':
          this.y += (a.floorY - this.h - 70 + Math.sin(this.t * 2) * 8 - this.y) * Math.min(1, dt * 2);
          if (this.stateT > [0, 5, 4.2, 3.6][this.phase]) { this.setState('fly'); this.speak('Ha! Rested! Too slow, kitty!', 1.4); }
          break;
        case 'pinned':
          this.y += (a.floorY - this.h - this.y) * Math.min(1, dt * 8);
          if (this.stateT > 5) this.unpin(game, 'Free! My feathers are all messy!');
          break;
        case 'hurt':
          this.y += (this.hoverY() - this.y) * Math.min(1, dt * 2);
          if (this.stateT > 2) { this.phase++; this.setState('fly'); game.bossPhaseRadio(this.phase); }
          break;
      }
      if (['swoop', 'fly', 'screech'].includes(this.state) && !p.dead && overlap(this.body(), p)) game.hurtPlayer(game.bossDamage(), this.cx, 'boss');
    }
    unpin(game, line) {
      this.setState('fly'); this.speak(line, 1.6);
      const pk = new (E().Pickup)('wand', this.cx - 13, this.arena.floorY - 60, 0, -300, true); pk.life = Infinity; game.pickups.push(pk);
    }
    ensureWand(dt, game) {
      if (this.defeated || this.state === 'pinned') return;
      const inArena = (k) => k.x > this.arena.x0 - 40 && k.x < this.arena.x1 + 40;
      const have = game.state.item === 'wand' || game.pickups.some((k) => k.kind === 'wand' && inArena(k)) || game.projectiles.some((k) => k.kind === 'wand');
      if (have) { this.wandT = 0; return; }
      if ((this.wandT += dt) > 1) { this.wandT = 0; const pk = new (E().Pickup)('wand', (this.arena.x0 + this.arena.x1) / 2 - 13, this.arena.floorY - 40); pk.life = Infinity; game.pickups.push(pk); }
    }
    thrownHit(proj, game) {
      if (proj.kind !== 'wand' || this.defeated || !overlap(proj, this.body())) return false;
      if (this.state === 'tired') {
        this.setState('pinned'); A().sfx('snap'); game.shake(10);
        this.speak('SQUAWK! The wand! I can\'t fly!', 2); game.tip('pinned');
        return true;
      }
      game.floater('too fast! wait till she\'s tired', this.cx, this.y, '#ffe9a0');
      const pk = new (E().Pickup)('wand', proj.x, proj.y, -proj.vx * 0.2, -200, true); pk.life = Infinity; game.pickups.push(pk);
      return true;
    }
    hitByAttack(box, player, game) {
      if (this.defeated || !overlap(box, this.body())) return false;
      if (this.state !== 'pinned') { game.floater('pin her with the wand first!', this.cx, this.y, '#ffe9a0'); return true; }
      this.hits++; this.flash = 0.3; A().sfx('bosshit'); game.particles.burst(this.cx, this.y + 30, '#b086e8', 10, 200);
      if (this.hits >= 3) {
        this.hits = 0;
        if (this.phase >= 3) {
          this.defeated = true; this.setState('defeat'); this.speak('My crown... my trees... *tweet*...', 3); game.spawnCoins(this.cx, this.y, 25);
          // the kitty wand breaks after the fight
          if (game.state.item === 'wand') game.state.item = null;
          game.pickups = game.pickups.filter((k) => k.kind !== 'wand');
          game.floater('the kitty wand broke!', player.cx, player.y - 30, '#fff');
        } else { this.setState('hurt'); this.speak(['OW! Not the tail feathers!', 'Stop scratching! I am ROYALTY!'][this.phase - 1], 2); const pk = new (E().Pickup)('wand', this.cx - 13, this.arena.floorY - 60, 0, -300, true); pk.life = Infinity; game.pickups.push(pk); }
      }
      return true;
    }
    draw(ctx) {
      this.shots.draw(ctx);
      if (this.flash > 0 && Math.floor(this.t * 16) % 2) ctx.globalAlpha = 0.6;
      D().birdQueen(ctx, this.cx - this.facing * 10, this.y + this.h, { facing: this.facing, t: this.t, tired: this.state === 'tired', pinned: this.state === 'pinned' || this.defeated, angry: this.state === 'screech' || this.state === 'swoop' });
      ctx.globalAlpha = 1;
      if (this.state === 'pinned') { D().item(ctx, 'wand', this.cx, this.y + this.h - 10, 1.6, this.t); D().text(ctx, `${3 - this.hits} more!`, this.cx, this.y - 20, { size: 18, color: '#fff', outline: 4, align: 'center' }); }
      if (this.state === 'screech') D().text(ctx, 'SCREE!', this.cx, this.y - 10, { size: 26, color: '#ff5040', outline: 5, align: 'center' });
      this.drawSpeech(ctx, this.cx, this.y - 30);
    }
    drawUI(ctx) { if (!this.defeated) this.drawBar(ctx, this.name + (this.phase > 1 ? `  — phase ${this.phase}` : ''), 4 - this.phase, 3); }
  }

  // ============================================================ THE SERPENT
  class Serpent extends Base {
    constructor(game, arena) {
      super(game, arena);
      this.name = 'The Serpent'; this.phase = 1; this.scratches = 0;
      this.hx = arena.x1 - 150; this.hy = arena.floorY + 20; this.facing = -1;
      this.trail = []; this.shots = new Shots(); this.lunges = 0;
      this.setState('under'); this.speak("Ssssso. The little cat comes to my ssswamp. How deliciousss.", 3);
    }
    head() { return { x: this.hx - 30, y: this.hy - 22, w: 60, h: 44 }; }
    update(dt, game) {
      this.t += dt; this.stateT += dt; this.sayT -= dt; this.flash -= dt;
      const p = game.player, a = this.arena, fy = a.floorY;
      this.shots.update(dt, game, game.enemyDamage() * 1.5);
      if (this.defeated) { this.hy += 120 * dt; if (this.stateT > 2.5) this.done = true; return; }
      const spd = [0, 150, 200, 250][this.phase];
      switch (this.state) {
        case 'under': {
          this.hy = fy + 20;
          const want = this.phase === 3 && this.lunges % 2 === 1 ? this.altX : p.cx;
          const d = want - this.hx; this.facing = d < 0 ? -1 : 1;
          this.hx += Math.sign(d) * Math.min(Math.abs(d), spd * dt);
          this.hx = Math.max(a.x0 + 40, Math.min(a.x1 - 40, this.hx));
          if (Math.random() < 0.5) this.trail.push({ x: this.hx, life: 2.5 });
          if (Math.abs(d) < 30 && this.stateT > 0.8) { this.setState('rumble'); A().sfx('rumble'); }
          break;
        }
        case 'rumble':
          if (Math.random() < 0.6) game.particles.add({ x: this.hx + (Math.random() - 0.5) * 50, y: fy - 2, vx: 0, vy: -150, g: 600, life: 0.5, color: '#7a6040', r: 3 });
          if (this.stateT > [0, 0.75, 0.6, 0.5][this.phase]) { this.setState('lunge'); this.holeX = this.hx; game.shake(10); A().sfx('boom'); }
          break;
        case 'lunge': {
          const k = Math.min(1, this.stateT / 0.35);
          this.hy = fy + 20 - Math.sin(k * Math.PI / 2) * 170;
          if (k >= 1) this.setState('arc');
          break;
        }
        case 'arc': {
          const k = Math.min(1, this.stateT / 0.5);
          this.hx = this.holeX + this.facing * k * 70; this.hy = fy - 150 + k * 128;
          if (k >= 1) {
            this.setState('exposed'); game.shake(6); this.lunges++;
            if (this.phase >= 2) for (let i = 0; i < 3; i++) this.shots.lob(this.hx, this.hy - 20, game.player.cx + (i - 1) * 80, 'venom', 1.2);
          }
          break;
        }
        case 'exposed':
          if (this.stateT > [0, 1.8, 1.4, 1.1][this.phase]) this.dive(game);
          break;
        case 'dive':
          this.hy += 300 * dt;
          if (this.hy > fy + 20) {
            this.setState('under'); this.altX = a.x0 + 80 + Math.random() * (a.x1 - a.x0 - 160);
            if (this.scratches >= 3) { this.scratches = 0; this.phase++; game.bossPhaseRadio(this.phase); this.speak(['Ssstop that!', "Enough! Now I'm ANGRY!"][this.phase - 2], 2); }
          }
          break;
      }
      for (const tr of this.trail) tr.life -= dt;
      this.trail = this.trail.filter((tr) => tr.life > 0);
      // damage
      if (['lunge', 'arc'].includes(this.state) && !p.dead && overlap(this.head(), p)) game.hurtPlayer(game.bossDamage(), this.hx, 'boss');
      if (this.state === 'exposed' && !p.dead && overlap(this.head(), p) && p.vy > 0 && p.prevBottom <= this.hy - 10) { p.pounce(); this.scratch(game); }
      if (['lunge', 'arc', 'exposed'].includes(this.state) && !p.dead && overlap({ x: this.holeX - 22, y: fy - 120, w: 44, h: 120 }, p) && this.state !== 'exposed') game.hurtPlayer(game.bossDamage(), this.holeX, 'boss');
    }
    dive(game) { this.setState('dive'); }
    scratch(game) {
      if (this.state !== 'exposed') return;
      this.scratches++; this.flash = 0.4; A().sfx('bosshit'); game.shake(6);
      game.particles.burst(this.hx, this.hy - 10, '#d8e8a0', 10, 200);
      this.speak(['Hisss!', 'Ow ow ow!', 'My ssscales!'][this.scratches - 1] || 'Hiss!', 1);
      if (this.phase === 3 && this.scratches >= 3) {
        this.defeated = true; this.setState('defeat'); this.speak('Ssssso... sleepy... sssssss...', 3); game.spawnCoins(this.hx, this.hy - 40, 25);
      } else this.dive(game);
    }
    hitByAttack(box, player, game) {
      if (this.defeated) return false;
      if (this.state === 'exposed' && overlap(box, this.head())) { this.scratch(game); return true; }
      return false;
    }
    draw(ctx) {
      const fy = this.arena.floorY;
      for (const tr of this.trail) { ctx.globalAlpha = Math.min(1, tr.life); D().blob(ctx, tr.x, fy - 2, 16, 5, Math.floor(tr.x), '#7a6040', 1.5); }
      ctx.globalAlpha = 1;
      if (this.state === 'under' || this.state === 'rumble') {
        const sh = this.state === 'rumble' ? (Math.random() - 0.5) * 6 : 0;
        D().blob(ctx, this.hx + sh, fy - 6, 34, 12, 7, '#8a6a4a', 2.4);
        if (this.state === 'rumble') D().text(ctx, '!', this.hx, fy - 40, { size: 36, color: '#ff5040', outline: 5, align: 'center' });
        this.shots.draw(ctx); this.drawSpeech(ctx, this.hx, fy - 70); return;
      }
      // body rising out of the hole
      const trail = [], hx = this.holeX != null ? this.holeX : this.hx;
      for (let i = 0; i <= 16; i++) { const k = i / 16; trail.push({ x: hx + (this.hx - hx) * k * k, y: fy + 10 + (this.hy - fy - 10) * Math.sin(k * Math.PI / 2) - Math.sin(k * Math.PI) * 30 }); }
      trail.reverse();
      D().blob(ctx, hx, fy - 2, 40, 10, 9, '#5a4030', 2.4);
      if (this.flash > 0 && Math.floor(this.t * 16) % 2) ctx.globalAlpha = 0.6;
      D().serpent(ctx, { x: this.hx, y: this.hy }, trail, { t: this.t, facing: this.facing, dizzy: this.state === 'exposed' || this.defeated, mouth: this.state === 'lunge' || this.state === 'arc' });
      ctx.globalAlpha = 1;
      if (this.state === 'exposed') D().text(ctx, 'bonk!', this.hx, this.hy - 50, { size: 18, color: '#fff', outline: 4, align: 'center' });
      this.shots.draw(ctx);
      this.drawSpeech(ctx, this.hx, this.hy - 80);
    }
    drawUI(ctx) { if (!this.defeated) this.drawBar(ctx, this.name + `  — phase ${this.phase}  (scratches ${this.scratches}/3)`, 4 - this.phase, 3); }
  }

  // ============================================================ THE MOLE QUEEN
  class MoleQueen extends Base {
    constructor(game, arena) {
      super(game, arena);
      this.name = 'The Mole Queen'; this.phase = 1; this.backHits = 0;
      this.w = 110; this.h = 100; this.x = arena.x1 - 220; this.y = arena.floorY - this.h; this.vx = 0; this.vy = 0; this.facing = -1;
      this.shots = new Shots(); this.rocks = [];
      const span = arena.x1 - arena.x0;
      this.pots = [0.12, 0.38, 0.62, 0.88].map((f) => ({ x: arena.x0 + span * f, alive: true, respawn: 0 }));
      this.charges = 0;
      this.setState('intro'); this.speak("So YOU'RE the calico who beat all my servants. I'll handle you MYSELF.", 3.5);
    }
    get cx() { return this.x + this.w / 2; }
    body() { return { x: this.x + 10, y: this.y + 10, w: this.w - 20, h: this.h - 10 }; }
    backBox() { return this.facing > 0 ? { x: this.x - 10, y: this.y + 20, w: 50, h: this.h - 20 } : { x: this.x + this.w - 40, y: this.y + 20, w: 50, h: this.h - 20 }; }
    needHits() { return this.phase === 4 ? 3 : 1; }
    update(dt, game) {
      this.t += dt; this.stateT += dt; this.sayT -= dt; this.flash -= dt;
      const p = game.player, a = this.arena, cfg = C();
      this.shots.update(dt, game, game.enemyDamage() * 2);
      this.updatePots(dt, game);
      this.updateRocks(dt, game);
      if (this.defeated) { this.y += (this.stateT > 1.5 ? 140 : 0) * dt; if (this.stateT > 3.5) this.done = true; return; }
      const bait = game.pickups.find((k) => k.kind === 'worm' && k.bait);
      if (bait && ['stalk', 'windup', 'stunned'].includes(this.state)) { this.setState('seek'); this.bait = bait; this.speak(['Ooh! A worm!', 'Mine! MINE!', 'Snack time!', 'WORM!!'][this.phase - 1], 1); }
      const spd = [0, 70, 90, 110, 150][this.phase];
      switch (this.state) {
        case 'intro': if (this.stateT > 3) this.setState('stalk'); break;
        case 'stalk':
          this.facing = p.cx < this.cx ? -1 : 1; this.vx = this.facing * spd;
          if (this.stateT > [0, 2.6, 2.2, 1.8, 1.3][this.phase]) { this.setState('windup'); A().sfx('drill'); }
          if (this.phase >= 3 && Math.floor(this.stateT) !== Math.floor(this.stateT - dt)) { this.shots.lob(this.cx, this.y + 20, p.cx, 'clod'); A().sfx('throw'); }
          break;
        case 'windup':
          this.vx = 0;
          if (this.stateT > (this.phase === 4 ? 0.45 : 0.7)) { this.setState('charge'); this.facing = p.cx < this.cx ? -1 : 1; }
          break;
        case 'charge':
          this.vx = this.facing * [0, 380, 420, 460, 560][this.phase];
          break;
        case 'stunned':
          this.vx = 0;
          if (this.stateT > 1) {
            this.charges++;
            if (this.phase >= 2 && this.charges % 2 === 0) { this.setState('burrow'); A().sfx('rumble'); }
            else this.setState('stalk');
          }
          break;
        case 'burrow': this.vx = 0; if (this.stateT > 0.6) { this.setState('under'); this.tx = p.cx; } break;
        case 'under':
          this.tx += (p.cx - this.tx) * Math.min(1, dt * 1.5); this.x = this.tx - this.w / 2;
          if (this.stateT > 1.4) { this.setState('popup'); this.vy = -700; game.shake(8); A().sfx('boom'); game.particles.burst(this.cx, a.floorY, '#8b6a42', 18, 260); }
          break;
        case 'popup': if (this.vy === 0 && this.stateT > 0.3) this.setState('stalk'); break;
        case 'seek': {
          if (!this.bait || this.bait.dead) { this.setState('stalk'); break; }
          const d = this.bait.x - this.cx; this.facing = d < 0 ? -1 : 1;
          this.vx = this.facing * (spd * 2.6);
          if (Math.abs(d) < 30) { this.bait.dead = true; this.bait = null; this.setState('eat'); this.vx = 0; A().sfx('squeak'); }
          break;
        }
        case 'eat':
          this.vx = 0;
          if (this.stateT > [0, 2.6, 2.2, 1.8, 1.3][this.phase]) { this.setState('stalk'); this.speak('Mmm. Now... where was I? Oh right. YOU.', 1.4); }
          break;
        case 'hurt':
          this.vx = 0;
          if (this.stateT > 2.6) {
            this.phase++; this.backHits = 0; this.setState('stalk'); game.bossPhaseRadio(this.phase);
            if (this.phase === 3) { game.spawnEnemy('r', a.x0 + 60, a.floorY - 40); game.spawnEnemy('r', a.x1 - 90, a.floorY - 40); }
            if (this.phase === 4) { this.speak("ENOUGH! You think I only had THREE tricks?! Behold my FINAL FORM!", 3.2); game.shake(20); A().play('boss-molequeen-final'); }
          }
          break;
      }
      if (this.phase === 4 && !this.defeated && Math.random() < dt * 1.4) this.rocks.push({ x: a.x0 + 40 + Math.random() * (a.x1 - a.x0 - 80), y: this.arena.floorY - 520, vy: 0, warn: 0.8 });
      if (!['under', 'burrow'].includes(this.state)) {
        this.vy = Math.min(cfg.MAX_FALL, this.vy + cfg.GRAVITY * dt);
        const res = game.level.moveBody(this, dt);
        if (this.x < a.x0 + 2) { this.x = a.x0 + 2; res.wallL = true; }
        if (this.x + this.w > a.x1 - 2) { this.x = a.x1 - this.w - 2; res.wallR = true; }
        if (this.state === 'charge' && (res.wallL || res.wallR)) { this.setState('stunned'); game.shake(12); A().sfx('bosshit'); }
      }
      const harmful = !['under', 'burrow', 'eat', 'hurt', 'intro', 'stunned'].includes(this.state);
      if (harmful && !p.dead && overlap(this.body(), p)) game.hurtPlayer(game.bossDamage() * (this.state === 'charge' ? 1 : 0.5), this.cx, 'boss');
    }
    updatePots(dt, game) {
      for (const pt of this.pots) {
        if (!pt.alive) { pt.respawn -= dt; if (pt.respawn <= 0) { pt.alive = true; game.particles.burst(pt.x, this.arena.floorY - 15, '#c06a3a', 6, 100); } }
      }
    }
    updateRocks(dt, game) {
      for (const r of this.rocks) {
        if (r.warn > 0) { r.warn -= dt; continue; }
        r.vy += C().GRAVITY * dt; r.y += r.vy * dt;
        const p = game.player;
        if (Math.abs(p.cx - r.x) < 22 && r.y > p.y - 10 && r.y < p.y + p.h) { r.dead = true; game.hurtPlayer(1, r.x, 'boss'); }
        if (r.y > this.arena.floorY - 12) { r.dead = true; game.particles.burst(r.x, this.arena.floorY - 8, '#8a8580', 8, 150); A().sfx('crumble'); }
      }
      this.rocks = this.rocks.filter((r) => !r.dead);
    }
    hitByAttack(box, player, game) {
      // break worm pots
      for (const pt of this.pots) {
        if (pt.alive && overlap(box, { x: pt.x - 16, y: this.arena.floorY - 32, w: 32, h: 32 })) {
          pt.alive = false; pt.respawn = [0, 4, 5, 6, 8][this.phase]; A().sfx('crumble');
          game.particles.burst(pt.x, this.arena.floorY - 16, '#c06a3a', 12, 180);
          const pk = new (E().Pickup)('worm', pt.x - 13, this.arena.floorY - 50, 0, -300, true); pk.life = Infinity; game.pickups.push(pk);
          game.tip('worm');
          return true;
        }
      }
      if (this.defeated || !overlap(box, this.body())) return false;
      const fromBehind = this.facing > 0 ? player.cx < this.cx : player.cx > this.cx;
      if (this.state === 'eat' && fromBehind && overlap(box, this.backBox())) {
        this.backHits++; this.flash = 0.4; A().sfx('bosshit'); game.shake(10);
        game.particles.burst(this.cx - this.facing * 40, this.y + 40, '#ff8fc2', 14, 220);
        if (this.backHits >= this.needHits()) {
          if (this.phase >= 4) {
            this.defeated = true; this.setState('defeat');
            this.speak("NO! This isn't over, calico! I'll be BACK! *dig dig dig*", 3.5);
            game.spawnCoins(this.cx, this.y, 40);
          } else { this.setState('hurt'); this.speak(['OUCH! My royal back!', 'You little furball!', 'That... was my weak spot... HOW DID YOU KNOW?!'][this.phase - 1], 2.4); }
        } else this.speak('OW! Stop that!', 0.8);
        return true;
      }
      A().sfx('hit'); game.floater(this.state === 'eat' ? 'hit her from behind!' : 'throw a worm to distract her!', this.cx, this.y - 20, '#ffe9a0');
      return true;
    }
    draw(ctx) {
      const fy = this.arena.floorY;
      for (const pt of this.pots) if (pt.alive) D().pot(ctx, pt.x, fy, { worm: true, seed: Math.round(pt.x) });
      for (const r of this.rocks) {
        if (r.warn > 0) { ctx.globalAlpha = 0.4; D().blob(ctx, r.x, fy - 3, 20, 5, 3, '#000', 0); ctx.globalAlpha = 1; D().text(ctx, '!', r.x, fy - 50, { size: 22, color: '#ff5040', outline: 4, align: 'center' }); }
        else D().blob(ctx, r.x, r.y, 14, 13, 4, '#8a8580', 2);
      }
      if (this.state === 'under') { D().blob(ctx, this.cx, fy - 6, 50 + Math.sin(this.t * 20) * 4, 12, 11, '#8b6a42', 2.4); this.shots.draw(ctx); return; }
      ctx.save();
      if (this.state === 'burrow' || (this.defeated && this.stateT > 1.5)) { ctx.beginPath(); ctx.rect(this.x - 100, this.y - 200, this.w + 200, fy - this.y + 200); ctx.clip(); }
      if (this.flash > 0 && Math.floor(this.t * 16) % 2) ctx.globalAlpha = 0.6;
      const shake = this.state === 'windup' ? (Math.random() - 0.5) * 5 : 0;
      D().mole(ctx, this.cx + shake, this.y + this.h, { facing: this.facing, t: this.t, scale: 2.3, color: this.phase === 4 ? '#6a2d4c' : '#5a3d5c', crown: true, seed: 999, dizzy: this.state === 'stunned' || this.state === 'hurt' });
      if (this.state === 'eat') {
        const bx = this.cx - this.facing * 38, by = this.y + 45;
        ctx.globalAlpha = 0.6 + Math.sin(this.t * 10) * 0.3; D().blob(ctx, bx, by, 13, 13, 12, '#ff8fc2', 2); ctx.globalAlpha = 1;
        D().item(ctx, 'worm', this.cx + this.facing * 45, this.y + 70, 1, this.t);
        D().text(ctx, 'nom nom', this.cx + this.facing * 40, this.y + 20, { size: 15, color: '#fff', outline: 3, align: 'center' });
      }
      ctx.restore(); ctx.globalAlpha = 1;
      if (this.phase === 4 && !this.defeated) { ctx.globalAlpha = 0.15 + Math.sin(this.t * 6) * 0.1; D().blob(ctx, this.cx, this.y + 40, 80, 70, 13, '#ff4060', 0); ctx.globalAlpha = 1; }
      if (this.state === 'windup') D().text(ctx, '!', this.cx, this.y - 30, { size: 38, color: '#ff5040', outline: 5, align: 'center' });
      this.shots.draw(ctx);
      this.drawSpeech(ctx, this.cx, this.y - 40);
    }
    drawUI(ctx) { if (!this.defeated) this.drawBar(ctx, this.name + `  — phase ${this.phase}${this.phase === 4 ? '?!' : ''}`, Math.max(0, 5 - this.phase), this.phase === 4 ? 4 : 3); }
  }

  Object.assign(PM.Bosses, {
    dusty: makeMini('dusty'), gus: makeMini('gus'), sally: makeMini('sally'), brutus: makeMini('brutus'),
    giantflea: GiantFlea, birdqueen: BirdQueen, serpent: Serpent, molequeen: MoleQueen,
  });
})();
