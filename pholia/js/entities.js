// Pholia, enemies, pickups, platforms, hazards and particles.
(function () {
  const C = () => PM.CONFIG;
  const D = () => PM.Draw;
  const I = () => PM.Input;
  const A = () => PM.Audio;
  const TS = () => PM.CONFIG.TILE;

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ============================================================ PLAYER
  class Player {
    constructor(x, y) {
      this.w = 24; this.h = 36;
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.facing = 1;
      this.onGround = false; this.wasGround = false;
      this.coyote = 0; this.jumpBuf = 0;
      this.ducking = false;
      this.dashT = 0; this.dashCD = 0; this.airDash = true;
      this.atkT = 0; this.atkCD = 0; this.atkHit = new Set();
      this.invuln = 0;
      this.charge = -1;
      this.effect = null; this.effectT = 0;
      this.airJumps = 0;
      this.platform = null;
      this.lastSafe = { x, y };
      this.t = 0;
      this.dead = false;
      this.sneezeT = 0;
      this.hurtT = 0;
      this.frozen = false;
    }
    get cx() { return this.x + this.w / 2; }
    get bottom() { return this.y + this.h; }
    overlapsRect(x, y, w, h) { return overlap(this, { x, y, w, h }); }

    setDuck(d, level) {
      if (d === this.ducking) return;
      if (d) { this.y += 36 - 20; this.h = 20; this.ducking = true; }
      else {
        if (level.rectSolid(this.x + 1, this.y - 16, this.w - 2, 16)) return; // no room to stand
        this.y -= 16; this.h = 36; this.ducking = false;
      }
    }

    update(dt, game) {
      const cfg = C(), inp = I(), level = game.level;
      this.t += dt;
      if (this.dead) return;
      if (this.frozen) { this.vx = 0; this.applyGravity(dt, game); return; }
      const fast = this.effect === 'feather';
      const speed = cfg.RUN_SPEED * (fast ? cfg.FEATHER_SPEED_MULT : 1);

      // timers
      this.invuln = Math.max(0, this.invuln - dt);
      this.dashCD = Math.max(0, this.dashCD - dt);
      this.atkCD = Math.max(0, this.atkCD - dt);
      this.jumpBuf = Math.max(0, this.jumpBuf - dt);
      this.coyote = this.onGround ? cfg.COYOTE_TIME : Math.max(0, this.coyote - dt);
      this.hurtT = Math.max(0, this.hurtT - dt);
      if (this.effect) {
        this.effectT -= dt;
        if (this.effectT <= 0) { this.effect = null; game.floater('power-up over', this.cx, this.y - 10, '#ddd'); }
      }
      if (this.sneezeT > 0) this.sneezeT -= dt;

      // input
      let dir = (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
      if (this.hurtT > 0.25) dir = 0;
      this.inWater = level.rectTouches(this.x + 4, this.y + this.h * 0.45, this.w - 8, 2, 'w') !== null;
      let autoMul = 1;
      if (game.autoRun) { autoMul = inp.held('left') ? 0.5 : (inp.held('right') ? 1.12 : 1); if (this.hurtT <= 0.25) dir = 1; }
      const wantDuck = inp.held('down') && this.onGround && this.dashT <= 0;
      this.setDuck(wantDuck || (this.ducking && level.rectSolid(this.x + 1, this.y - 16, this.w - 2, 16)), level);

      if (inp.pressed('jump')) this.jumpBuf = cfg.JUMP_BUFFER;

      // dash
      if (inp.pressed('dash') && this.dashCD <= 0 && (this.onGround || this.airDash)) {
        this.dashT = cfg.DASH_TIME; this.dashCD = cfg.DASH_COOLDOWN;
        if (!this.onGround) this.airDash = false;
        if (dir) this.facing = dir;
        if (this.ducking) this.setDuck(false, level);
        A().sfx('dash');
        game.particles.burst(this.cx, this.y + this.h - 6, '#fff', 6, 60);
      }

      if (this.dashT > 0) {
        this.dashT -= dt;
        this.vx = this.facing * cfg.DASH_SPEED * (fast ? 1.25 : 1);
        this.vy = 0;
        if (Math.random() < 0.6) game.particles.add({ x: this.cx - this.facing * 10, y: this.y + 10 + Math.random() * 20, vx: -this.facing * 40, vy: 0, life: 0.25, color: 'rgba(255,255,255,0.7)', r: 3 });
      } else {
        const maxV = (this.ducking ? (game.autoRun ? speed * 0.9 : cfg.DUCK_SPEED) : speed) * autoMul * (this.inWater ? 0.7 : 1);
        const accel = this.onGround ? cfg.RUN_ACCEL : cfg.AIR_ACCEL;
        if (dir) {
          this.vx += dir * accel * dt * (Math.sign(this.vx) !== dir ? 1.6 : 1);
          if (Math.abs(this.vx) > maxV) this.vx = Math.sign(this.vx) * Math.max(maxV, Math.abs(this.vx) - cfg.FRICTION * dt);
          if (this.atkT <= 0 && this.charge < 0) this.facing = dir;
        } else if (this.onGround) {
          const f = cfg.FRICTION * dt;
          this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f;
        } else {
          this.vx *= Math.pow(0.4, dt);
        }

        // jump
        if (this.jumpBuf > 0) {
          const dropThrough = this.ducking && this.standingOnOneWay(level);
          if (dropThrough) {
            this.jumpBuf = 0; this.setDuck(false, level); this.y += 6; this.dropT = 0.2; this.onGround = false;
          } else if (this.inWater) {
            const surface = !level.rectTouches(this.x + 4, this.y - 6, this.w - 8, 4, 'w');
            this.vy = surface ? -cfg.JUMP_VELOCITY * 0.85 : -cfg.SWIM_STROKE; this.jumpBuf = 0;
            game.particles.add({ x: this.cx, y: this.y + 6, vx: 0, vy: -50, life: 0.5, color: 'rgba(230,250,255,0.8)', r: 3 });
            A().sfx(surface ? 'jump' : 'move');
          } else if (this.coyote > 0) {
            this.doJump(cfg.JUMP_VELOCITY); this.coyote = 0;
          } else if (this.effect === 'spring' && this.airJumps > 0) {
            this.airJumps--; this.doJump(cfg.JUMP_VELOCITY * 0.92);
            game.particles.burst(this.cx, this.bottom, '#c0392b', 6, 80);
          }
        }
        if (inp.released('jump') && this.vy < 0 && !this.inWater) this.vy *= cfg.JUMP_CUT;
        this.applyGravity(dt, game);
      }

      // physics
      const wasDucking = this.ducking;
      this.dropT = Math.max(0, (this.dropT || 0) - dt);
      const res = level.moveBody(this, dt, { dropThrough: this.dropT > 0 });
      this.wasGround = this.onGround;
      this.onGround = res.ground;
      // moving platforms
      if (!this.onGround && this.vy >= 0) {
        for (const p of game.platforms) {
          if (this.x + this.w > p.x && this.x < p.x + p.w && this.prevBottom <= p.y + 2 && this.bottom >= p.y) {
            this.y = p.y - this.h; this.vy = 0; this.onGround = true; this.platform = p; break;
          }
        }
      }
      if (this.platform && (!this.onGround || this.x + this.w < this.platform.x || this.x > this.platform.x + this.platform.w)) this.platform = null;
      this.prevBottom = this.bottom;

      if (res.groundTile) level.stepOn(res.groundTile[0], res.groundTile[1]);
      if (this.onGround) {
        this.airDash = true;
        this.airJumps = this.effect === 'spring' ? 1 : 0;
        if (!this.wasGround) { A().sfx('land'); game.particles.burst(this.cx, this.bottom, '#cfc6b0', 4, 40); }
        if (res.groundTile && !level.rectTouches(this.x, this.y, this.w, this.h + 4, '~')) this.lastSafe = { x: this.x, y: this.y };
      }
      if (this.effect === 'spring' && this.onGround) this.airJumps = 1;

      // attack
      if (inp.pressed('attack') && this.atkCD <= 0) {
        this.atkT = cfg.ATTACK_TIME; this.atkCD = cfg.ATTACK_COOLDOWN; this.atkHit.clear();
        A().sfx('swipe');
      }
      if (this.atkT > 0) { this.atkT -= dt; game.playerAttack(this.attackBox(), this); }

      // item (Y) & throw (I)
      if (inp.pressed('item')) game.useItem();
      const throwable = game.throwableKind();
      if (throwable) {
        if (inp.pressed('throw')) this.charge = 0;
        if (this.charge >= 0 && inp.held('throw')) this.charge = Math.min(1, this.charge + dt / cfg.THROW_CHARGE_TIME);
        if (this.charge >= 0 && inp.released('throw')) { game.throwObject(this.charge); this.charge = -1; }
      } else {
        if (inp.pressed('throw')) { game.floater('nothing to throw!', this.cx, this.y - 12, '#fff'); A().sfx('nope'); }
        this.charge = -1;
      }

      // hazards
      if (level.rectTouches(this.x + 4, this.y + this.h - 10, this.w - 8, 10, '^')) game.hurtPlayer(cfg.SPIKE_DAMAGE, this.cx - this.facing * 10, 'spikes');
      if (level.rectTouches(this.x + 3, this.y + 10, this.w - 6, this.h - 10, '~')) {
        if (this.invuln <= 0) {
          game.hurtPlayer(cfg.SLUDGE_DAMAGE, this.cx, 'sludge', true);
          if (!this.dead) { this.x = this.lastSafe.x; this.y = this.lastSafe.y; this.vx = this.vy = 0; }
        }
      }
      if (this.inWater && !game.state.scuba && this.invuln <= 0) {
        game.hurtPlayer(1, this.cx, 'water', true);
        if (!this.dead) { this.x = this.lastSafe.x; this.y = this.lastSafe.y; this.vx = this.vy = 0; }
      }
      if (this.y > level.pxH + 40) game.playerFell();
    }
    applyGravity(dt, game) {
      const cfg = C();
      if (this.inWater) { this.vy = Math.min(cfg.SWIM_MAX_FALL * (PM.Input.held('down') ? 2 : 1), this.vy + cfg.GRAVITY * 0.28 * dt); this.vy *= Math.pow(0.5, dt); }
      else this.vy = Math.min(cfg.MAX_FALL, this.vy + cfg.GRAVITY * dt);
      if (this.frozen) { const r = game.level.moveBody(this, dt); this.onGround = r.ground; }
    }
    doJump(v) {
      this.vy = -v; this.jumpBuf = 0; this.onGround = false; this.platform = null;
      if (this.ducking) { this.ducking = false; this.y -= 16; this.h = 36; }
      A().sfx('jump');
    }
    standingOnOneWay(level) {
      const t = TS(), ty = Math.floor((this.bottom + 2) / t);
      return level.isOneWay(Math.floor((this.x + 2) / t), ty) || level.isOneWay(Math.floor((this.x + this.w - 2) / t), ty);
    }
    attackBox() {
      const r = C().ATTACK_RANGE;
      return { x: this.facing > 0 ? this.x + this.w - 4 : this.x - r + 4, y: this.y - 2, w: r, h: this.h + 4 };
    }
    pounce() { this.vy = -C().POUNCE_BOUNCE * (I().held('jump') ? 1.25 : 1); this.airDash = true; }

    draw(ctx, game) {
      if (this.dead) return;
      if (this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0) return;
      let pose = 'stand';
      if (this.ducking) pose = Math.abs(this.vx) > 15 ? 'crawl' : 'duck';
      else if (this.dashT > 0) pose = 'dash';
      else if (!this.onGround) pose = this.vy < 0 ? 'jump' : 'fall';
      else if (Math.abs(this.vx) > 20) pose = 'run';
      const st = game.state;
      // effect glow
      if (this.effect) {
        ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(this.t * 10) * 0.1;
        D().blob(ctx, this.cx, this.y + this.h / 2, 28, 26, 5, this.effect === 'feather' ? '#bfe6ff' : '#ffc0b0', 0);
        ctx.restore();
      }
      D().cat(ctx, this.cx, this.bottom, 'pholia', {
        facing: this.facing, pose, t: this.t * (this.effect === 'feather' ? 1.6 : 1),
        scuba: st.scuba && game.level.biome === 3, hat: st.hat, eyes: this.hurtT > 0 ? 'closed' : (this.sneezeT > 0 ? 'closed' : null),
      });
      // paw swipe arc
      if (this.atkT > 0) {
        const p = 1 - this.atkT / C().ATTACK_TIME;
        const bx = this.cx + this.facing * 26, by = this.y + this.h * 0.45;
        ctx.save(); ctx.globalAlpha = 1 - p * 0.6;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          const a0 = -1.2 + p * 0.8, a1 = a0 + 1.6;
          ctx.arc(bx - this.facing * 10, by, 18 + i * 5, this.facing > 0 ? a0 : Math.PI - a1, this.facing > 0 ? a1 : Math.PI - a0);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (this.sneezeT > 0) D().text(ctx, 'ACHOO!', this.cx + this.facing * 30, this.y - 8, { size: 18, color: '#fff', outline: 4, align: 'center' });
      // throw charge meter
      if (this.charge >= 0) {
        const cfg = C();
        const v = cfg.THROW_MIN + (cfg.THROW_MAX - cfg.THROW_MIN) * this.charge;
        ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.8)';
        let x = this.cx, y = this.y + 6, vx = this.facing * v * 0.75, vy = -v * 0.65;
        for (let i = 0; i < 14; i++) { x += vx * 0.04; vy += cfg.GRAVITY * 0.04; y += vy * 0.04; ctx.globalAlpha = 0.8 - i * 0.05; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
        ctx.restore();
        D().item(ctx, game.throwableKind(), this.cx - this.facing * 4, this.y - 12, 0.9, this.t);
      }
      if (C().SHOW_HITBOXES) { ctx.strokeStyle = 'lime'; ctx.strokeRect(this.x, this.y, this.w, this.h); }
    }
  }

  // ============================================================ ENEMIES
  // Kinds: r = tiny boss-type, R = chunky, c = fast critter, e = eel (water).
  // What they look like / how they move depends on the biome.
  const ENEMY_TYPES = [
    { r: ['rat', 'walk', 55], R: ['bigrat', 'walk', 40], c: ['roach', 'walk', 120] },
    { r: ['flea', 'hop', 0], R: ['bigflea', 'hop', 0], c: ['beetle', 'walk', 125] },
    { r: ['bird', 'fly', 70], R: ['crow', 'fly', 60], c: ['squirrel', 'walk', 135] },
    { r: ['snake', 'walk', 60], R: ['bigsnake', 'walk', 45], c: ['frog', 'hop', 0], e: ['eel', 'swim', 80] },
    { r: ['mole', 'burrow', 60], R: ['guardmole', 'walk', 50], c: ['beetle', 'walk', 130] },
  ];
  // Each enemy look has its own attack. wind = warning time (they shake + "!"), cd = cooldown.
  // is there solid ground under the spot 'dist' pixels in front of the enemy?
  const groundAhead = (e, game, dist) => { const t = TS(), x = e.x + e.w / 2 + e.facing * dist, ty = Math.floor((e.y + e.h + 4) / t); const L = game.level; return L.isSolid(Math.floor(x / t), ty) || L.isOneWay(Math.floor(x / t), ty); };
  const near = (e, p, dx, dy = 60) => Math.abs(p.cx - (e.x + e.w / 2)) < dx && Math.abs((p.y + p.h) - (e.y + e.h)) < dy;
  const ATTACKS = {
    rat: { cd: 2.2, wind: 0.35, when: (e, p, game) => near(e, p, 120) && groundAhead(e, game, 70) && groundAhead(e, game, 120), go: (e) => { e.vx = e.facing * 280; e.vy = -260; e.act = 0.45; } },
    bigrat: { cd: 3, wind: 0.5, when: (e, p) => near(e, p, 240), go: (e) => { e.act = 0.9; e.charge = 300; } },
    roach: { cd: 2.5, wind: 0.25, when: (e, p) => near(e, p, 200), go: (e) => { e.act = 0.5; e.charge = 260; } },
    bigflea: { cd: 0, wind: 0, land: (e, game) => { for (const d of [-1, 1]) game.projectiles.push(new EnemyShot(e.x + e.w / 2, e.y + e.h - 10, d * 220, 0, 'wave', 0)); } },
    beetle: { cd: 3, wind: 0.4, when: (e, p) => near(e, p, 230), go: (e) => { e.act = 1.1; e.charge = 320; e.rolling = true; } },
    crow: { cd: 1.6, wind: 0.2, when: (e, p) => Math.abs(p.cx - e.x - e.w / 2) < 30 && p.y > e.y, go: (e, game) => game.projectiles.push(new EnemyShot(e.x + e.w / 2, e.y + e.h, 0, 50, 'pebble', 1)) },
    squirrel: { cd: 2.4, wind: 0.3, when: (e, p) => near(e, p, 180, 150), go: (e, game, p) => { const dx = (p.cx - e.x) * (0.55 + Math.random() * 0.9) + (Math.random() - 0.5) * 80; game.projectiles.push(new EnemyShot(e.x + e.w / 2, e.y, dx / 0.8, -C().GRAVITY * 0.4, 'acorn', 1)); } },
    snake: { cd: 2.6, wind: 0.4, when: (e, p) => near(e, p, 240, 40), go: (e, game) => game.projectiles.push(new EnemyShot(e.x + e.w / 2 + e.facing * 14, e.y + 4, e.facing * 260, 0, 'venom', 0)) },
    bigsnake: { cd: 2.2, wind: 0.45, when: (e, p) => near(e, p, 150), go: (e) => { e.vx = e.facing * 380; e.act = 0.35; e.charge = 380; } },
    frog: { cd: 1.8, wind: 0.3, when: (e, p) => near(e, p, 95, 40), go: (e) => { e.tongue = 0.35; } },
    eel: { cd: 2.2, wind: 0.3, when: (e, p) => p.inWater && near(e, p, 220, 90), go: (e, game, p) => { e.dart = 0.6; e.dartV = { x: Math.sign(p.cx - e.x) * 300, y: Math.sign(p.y - e.y) * 120 }; } },
    mole: { cd: 2.6, wind: 0.3, when: (e, p) => !e.under && near(e, p, 260, 120), go: (e, game, p) => { const dx = p.cx - e.x; game.projectiles.push(new EnemyShot(e.x + e.w / 2, e.y, dx / 0.8, -C().GRAVITY * 0.4, 'clod', 1)); } },
    guardmole: { cd: 3, wind: 0.5, when: (e, p) => near(e, p, 220), go: (e) => { e.act = 0.8; e.charge = 260; } },
  };

  class EnemyShot {
    constructor(x, y, vx, vy, kind, grav) { this.x = x - 7; this.y = y - 7; this.w = 14; this.h = 14; this.vx = vx; this.vy = vy; this.kind = kind; this.grav = grav; this.t = 0; this.dead = false; }
    update(dt, game) {
      this.t += dt;
      this.vy += C().GRAVITY * this.grav * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.kind === 'wave') { this.h = 12; if (this.t > 0.9) this.dead = true; }
      else if (game.level.rectSolid(this.x, this.y, this.w, this.h) || this.t > 3) { this.dead = true; game.particles.burst(this.x + 7, this.y + 7, '#8b6a42', 5, 90); }
      if (!this.dead && overlap(this, game.player)) { this.dead = true; game.hurtPlayer(game.enemyDamage(), this.x, 'shot'); }
    }
    draw(ctx) {
      const Dr = D(), cx = this.x + 7, cy = this.y + 7;
      if (this.kind === 'wave') { ctx.globalAlpha = 1 - this.t; Dr.blob(ctx, cx, this.y + 8, 12, 6, 3, '#d8b080', 2); ctx.globalAlpha = 1; }
      else if (this.kind === 'venom') Dr.blob(ctx, cx, cy, 7, 5, 4, '#8ad04a', 1.6);
      else Dr.blob(ctx, cx, cy, 6, 6, 5, { pebble: '#8a8580', acorn: '#a0703a', clod: '#7a5a40' }[this.kind] || '#888', 1.8);
    }
  }

  class Enemy {
    constructor(kind, x, y, biome = 0) {
      const def = (ENEMY_TYPES[biome] || ENEMY_TYPES[0])[kind] || ENEMY_TYPES[0][kind] || ['eel', 'swim', 80];
      [this.look, this.ai, this.speed] = def;
      this.kind = kind; this.biome = biome; this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.facing = -1; this.t = Math.random() * 10; this.dead = false; this.flash = 0;
      this.hp = 1; this.w = 28; this.h = 18; this.coins = 1; this.awake = false; this.timer = Math.random() * 1.5;
      this.tipKey = this.look;
      if (kind === 'R') { this.hp = biome === 4 ? 3 : 2; this.w = 40; this.h = 26; this.coins = 3; }
      if (kind === 'c') { this.w = 24; this.h = 14; }
      if (this.ai === 'fly') { this.h = 22; }
      if (this.ai === 'swim') { this.w = 36; this.h = 16; }
      this.y -= this.h - TS();
      this.x += (TS() - this.w) / 2;
      this.homeX = this.x; this.homeY = this.y;
    }
    get harmless() { return this.under; }
    update(dt, game) {
      this.t += dt; this.flash = Math.max(0, this.flash - dt);
      const p = game.player, L = game.level;
      if (!this.awake) {
        if (Math.abs(this.x - p.x) < C().WIDTH * 0.75) { this.awake = true; game.tip(this.tipKey); }
        else return;
      }
      if (this.ai !== 'swim' && this.ai !== 'fly' && (L.rectTouches(this.x + 2, this.y + this.h - 6, this.w - 4, 6, '~') || L.rectTouches(this.x + 2, this.y + this.h / 2, this.w - 4, 2, 'w'))) return this.dissolve(game);
      if (this.updateAttack(dt, game)) return;
      if (this.stun > 0) { this.stun -= dt; this.vx *= 0.9; if (this.ai !== 'fly' && this.ai !== 'swim') this.vy += C().GRAVITY * dt; game.level.moveBody(this, dt); return; }
      if (this.ai === 'fly') return this.updateFly(dt, game);
      if (this.ai === 'swim') return this.updateSwim(dt, game);
      if (this.ai === 'hop') {
        if (this.onGround) {
          this.vx = 0; this.timer -= dt;
          if (this.timer <= 0) {
            this.facing = p.cx < this.x + this.w / 2 ? -1 : 1;
            const big = this.kind === 'R';
            this.vx = this.facing * (big ? 120 : 150); this.vy = -(big ? 560 : 500) - Math.random() * 80;
            this.timer = 0.7 + Math.random() * 0.8; this.onGround = false;
          }
        }
      } else if (this.ai === 'burrow') {
        this.timer -= dt;
        if (this.timer <= 0) { this.under = !this.under; this.timer = this.under ? 1.2 : 2.5 + Math.random(); }
        this.vx = this.under ? 0 : this.facing * this.speed;
      } else this.vx = this.facing * this.speed;
      this.vy = Math.min(C().MAX_FALL, this.vy + C().GRAVITY * dt);
      const res = L.moveBody(this, dt);
      if (res.ground && !this.onGround && this.ai === 'hop' && ATTACKS[this.look] && ATTACKS[this.look].land && this.vy === 0 && this.t > 1) ATTACKS[this.look].land(this, game);
      this.onGround = res.ground;
      if (res.wallL) this.facing = 1;
      if (res.wallR) this.facing = -1;
      if (res.ground && this.ai !== 'hop') {
        const t = TS();
        const aheadX = this.facing > 0 ? this.x + this.w + 2 : this.x - 2;
        const ty = Math.floor((this.y + this.h + 4) / t), tx = Math.floor(aheadX / t);
        if (!L.isSolid(tx, ty) && !L.isOneWay(tx, ty)) this.facing *= -1;
        const hz = L.tile(tx, ty - 1); if (hz === '^' || hz === '~' || hz === 'w') this.facing *= -1;
      }
      if (this.y > L.pxH + 50) this.dead = true;
    }
    // returns true when the attack is controlling movement this frame
    updateAttack(dt, game) {
      const atk = ATTACKS[this.look], p = game.player;
      if (!atk || this.stun > 0 || p.dead) return false;
      this.atkCd = (this.atkCd == null ? 1 + Math.random() : this.atkCd) - dt;
      if (this.tongue > 0) { this.tongue -= dt; const tb = { x: this.facing > 0 ? this.x + this.w : this.x - 60, y: this.y, w: 60, h: 12 }; if (overlap(tb, p)) game.hurtPlayer(game.enemyDamage(), this.x, 'tongue'); return false; }
      if (this.dart > 0) {
        this.dart -= dt; this.x += this.dartV.x * dt; this.y += this.dartV.y * dt;
        if (game.level.tile(Math.floor((this.x + this.w / 2) / TS()), Math.floor((this.y + this.h / 2) / TS())) !== 'w') { this.x -= this.dartV.x * dt; this.y -= this.dartV.y * dt; this.dart = 0; }
        if (this.dart <= 0) { this.homeX = this.x; this.homeY = this.y; }
        return true;
      }
      if (this.act > 0) {
        this.act -= dt;
        if (this.charge) this.vx = this.facing * this.charge;
        this.vy = Math.min(C().MAX_FALL, this.vy + C().GRAVITY * dt);
        const res = game.level.moveBody(this, dt);
        this.onGround = res.ground;
        if (res.wallL || res.wallR || this.act <= 0) { this.act = 0; this.charge = 0; this.rolling = false; if (res.wallL || res.wallR) this.facing *= -1; }
        // don't charge off a ledge
        if (res.ground && this.charge) { const t = TS(), tx = Math.floor((this.facing > 0 ? this.x + this.w + 4 : this.x - 4) / t), ty = Math.floor((this.y + this.h + 4) / t); if (!game.level.isSolid(tx, ty) && !game.level.isOneWay(tx, ty)) { this.act = 0; this.charge = 0; this.rolling = false; } }
        return true;
      }
      if (this.windT > 0) {
        this.windT -= dt;
        if (this.windT <= 0) { atk.go(this, game, p); this.atkCd = atk.cd; if (this.ai === 'fly') return false; }
        return this.ai !== 'fly' && this.ai !== 'swim';
      }
      if (atk.when && this.atkCd <= 0 && atk.when(this, p, game)) {
        if (this.ai !== 'fly') this.facing = p.cx < this.x + this.w / 2 ? -1 : 1;
        this.windT = atk.wind; this.vx = 0;
        if (atk.wind === 0) { atk.go(this, game, p); this.atkCd = atk.cd; }
        return this.ai !== 'fly' && this.ai !== 'swim';
      }
      return false;
    }
    updateFly(dt, game) {
      const p = game.player;
      if (this.swoop > 0) {
        this.swoop -= dt;
        const dx = this.target.x - this.x, dy = this.target.y - this.y, d = Math.hypot(dx, dy) || 1;
        this.x += dx / d * 260 * dt; this.y += dy / d * 260 * dt;
        if (d < 10 || this.swoop <= 0) this.swoop = -1.5;
      } else {
        if (this.swoop < 0) this.swoop = Math.min(0, this.swoop + dt);
        this.y += (this.homeY - this.y) * Math.min(1, dt * 1.5) + Math.sin(this.t * 3) * 0.6;
        this.x += this.facing * this.speed * dt;
        if (Math.abs(this.x - this.homeX) > 110) this.facing = this.x > this.homeX ? -1 : 1;
        const dx = p.cx - this.x;
        if (this.swoop === 0 && Math.abs(dx) < 190 && p.y > this.y && !p.dead) {
          this.swoop = 1.2; this.target = { x: p.cx - this.w / 2, y: p.y }; this.facing = dx < 0 ? -1 : 1;
        }
      }
    }
    updateSwim(dt, game) {
      const L = game.level;
      this.x += this.facing * this.speed * dt;
      this.y = this.homeY + Math.sin(this.t * 2) * 10;
      const ahead = this.facing > 0 ? this.x + this.w + 2 : this.x - 2;
      if (L.tile(Math.floor(ahead / TS()), Math.floor((this.y + this.h / 2) / TS())) !== 'w' || Math.abs(this.x - this.homeX) > 200) this.facing *= -1;
    }
    // fell into sludge or deep water: gone with a splash (no coins)
    dissolve(game) {
      this.dead = true;
      const inWater = game.level.rectTouches(this.x, this.y, this.w, this.h, 'w');
      A().sfx('crumble');
      game.particles.burst(this.x + this.w / 2, this.y + this.h / 2, inWater ? '#bfe6ff' : '#8fce5a', 12, 160);
      game.particles.add({ kind: 'poof', x: this.x + this.w / 2, y: this.y + this.h / 2, life: 0.4, r: 16 });
    }
    hit(dmg, fromX, game, how) {
      if (this.dead || this.under) return;
      if (this.look === 'guardmole' && how === 'paw' && (fromX - (this.x + this.w / 2)) * this.facing > 0) { A().sfx('hit'); game.floater('clank! shield!', this.x + this.w / 2, this.y - 10, '#ffe9a0'); this.vx = -this.facing * 60; return; }
      this.hp -= dmg; this.flash = 0.15;
      this.stun = 0.25; this.vx = (this.x > fromX ? 1 : -1) * 160; this.vy = this.ai === 'fly' || this.ai === 'swim' ? 0 : -180;
      if (this.hp <= 0) this.kill(game);
      else A().sfx('hit');
    }
    kill(game) {
      this.dead = true;
      A().sfx('stomp');
      game.particles.burst(this.x + this.w / 2, this.y + this.h / 2, '#fff', 10, 120);
      game.particles.add({ kind: 'poof', x: this.x + this.w / 2, y: this.y + this.h / 2, life: 0.4, r: 18 });
      game.spawnCoins(this.x + this.w / 2, this.y, this.coins);
      game.maybeDrop(this.x + this.w / 2, this.y);
      game.stats.enemies++;
    }
    draw(ctx) {
      const Dr = D(), by = this.y + this.h, o = { facing: this.facing, t: this.t };
      const cx = this.x + this.w / 2 + (this.windT > 0 ? (Math.random() - 0.5) * 3 : 0);
      if (this.flash > 0) ctx.globalAlpha = 0.5;
      if (this.windT > 0) Dr.text(ctx, '!', cx, this.y - 8, { size: 18, color: '#ff5040', outline: 3, align: 'center' });
      if (this.tongue > 0) { Dr.line(ctx, [[cx + this.facing * 10, this.y + 8], [cx + this.facing * 70, this.y + 8]], 9, 4, '#e86a7a'); Dr.dot(ctx, cx + this.facing * 70, this.y + 8, 4, '#e86a7a'); }
      if (this.rolling) { ctx.save(); ctx.translate(cx, by - 10); ctx.rotate(this.t * 14 * this.facing); Dr.blob(ctx, 0, 0, 11, 11, 7, this.biome === 4 ? '#6a5a8a' : '#3a6a8a', 2); Dr.line(ctx, [[-9, 0], [9, 0]], 8, 1.4, '#1a2a3a'); ctx.restore(); ctx.globalAlpha = 1; return; }
      if (this.look === 'guardmole' && !this.under) Dr.rect(ctx, cx + this.facing * 16 - 4, by - 26, 8, 22, 10, '#9aa3ad', 2);
      if (this.under) {
        Dr.blob(ctx, cx, by - 4, 18, 6, 15, '#8a6a4a', 2);
        for (let i = 0; i < 2; i++) Dr.dot(ctx, cx - 10 + Math.random() * 20, by - 8 - Math.random() * 6, 2.5, '#a08060');
        ctx.globalAlpha = 1; return;
      }
      switch (this.look) {
        case 'rat': Dr.rat(ctx, cx, by, { ...o, seed: 11 }); break;
        case 'bigrat': Dr.rat(ctx, cx, by, { ...o, scale: 1.45, color: '#6f6970', seed: 12 }); break;
        case 'roach': Dr.roach(ctx, cx, by, o); break;
        case 'flea': Dr.flea(ctx, cx, by, { ...o, air: !this.onGround }); break;
        case 'bigflea': Dr.flea(ctx, cx, by, { ...o, air: !this.onGround, scale: 1.5, color: '#6a3418' }); break;
        case 'beetle': Dr.beetle(ctx, cx, by, { ...o, color: this.biome === 4 ? '#6a5a8a' : '#3a6a8a' }); break;
        case 'bird': Dr.bird(ctx, cx, by, o); break;
        case 'crow': Dr.bird(ctx, cx, by, { ...o, scale: 1.5, color: '#4a4458' }); break;
        case 'squirrel': Dr.squirrel(ctx, cx, by, o); break;
        case 'snake': Dr.snake(ctx, cx, by, o); break;
        case 'bigsnake': Dr.snake(ctx, cx, by, { ...o, scale: 1.4, color: '#4a7a3a' }); break;
        case 'frog': Dr.frog(ctx, cx, by, { ...o, air: !this.onGround }); break;
        case 'eel': Dr.eel(ctx, cx, by, o); break;
        case 'mole': Dr.mole(ctx, cx, by, { ...o, scale: 0.45, seed: 33 }); break;
        case 'guardmole': Dr.mole(ctx, cx, by, { ...o, scale: 0.62, hat: 'hardhat', seed: 34, color: '#5a3d4c' }); break;
      }
      ctx.globalAlpha = 1;
      if (C().SHOW_HITBOXES) { ctx.strokeStyle = 'red'; ctx.strokeRect(this.x, this.y, this.w, this.h); }
    }
  }

  // ============================================================ PICKUPS
  class Pickup {
    constructor(kind, x, y, vx = 0, vy = 0, physics = false) {
      this.kind = kind; this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.w = kind === 'coin' ? 18 : 26; this.h = this.w;
      this.physics = physics; this.t = Math.random() * 5; this.dead = false;
      this.life = physics && kind !== 'coin' ? 12 : (physics ? 8 : Infinity);
      this.grabDelay = physics ? 0.3 : 0;
    }
    update(dt, game) {
      this.t += dt; this.grabDelay -= dt;
      if (this.physics) {
        this.vy = Math.min(C().MAX_FALL, this.vy + C().GRAVITY * 0.8 * dt);
        const res = game.level.moveBody(this, dt);
        if (res.ground) { this.vx *= 0.8; if (Math.abs(this.vy) < 1) this.vy = 0; }
        if (res.wallL || res.wallR) this.vx *= -0.5;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
        if (this.y > game.level.pxH + 40) this.dead = true;
      }
      if (this.grabDelay <= 0 && overlap(this, game.player) && !game.player.dead) game.collect(this);
    }
    draw(ctx) {
      if (this.life < 2 && Math.floor(this.t * 10) % 2 === 0) return;
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2 + (this.physics ? 0 : Math.sin(this.t * 3) * 2);
      if (this.kind === 'coin') D().coin(ctx, cx, cy, this.t, (this.x * 3) | 0);
      else D().item(ctx, this.kind, cx, cy, 1.1, this.t);
    }
  }

  // ============================================================ PROJECTILES
  class PuffBomb {
    constructor(x, y, vx, vy) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.w = 18; this.h = 18; this.t = 0; this.dead = false; this.fuse = 1.6; }
    update(dt, game) {
      this.t += dt; this.fuse -= dt;
      this.vy = Math.min(C().MAX_FALL, this.vy + C().GRAVITY * dt);
      const res = game.level.moveBody(this, dt);
      if (res.ground) { this.vy = -Math.abs(this.vy) * 0; this.vx *= 0.85; }
      let boom = this.fuse <= 0 || res.wallL || res.wallR || res.ceil;
      for (const e of game.enemies) if (!e.dead && overlap(this, e)) boom = true;
      if (game.boss && game.boss.puffHit && game.boss.puffHit(this, game)) boom = true;
      if (boom) this.explode(game);
    }
    explode(game) {
      this.dead = true;
      const cx = this.x + 9, cy = this.y + 9, R = C().PUFF_BLAST_RADIUS;
      A().sfx('boom'); game.shake(8);
      game.particles.add({ kind: 'boom', x: cx, y: cy, life: 0.45, r: R });
      game.particles.burst(cx, cy, '#ff8fc2', 18, 260);
      for (const e of game.enemies) {
        const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
        if (!e.dead && Math.hypot(ex - cx, ey - cy) < R + 10) e.hit(3, cx, game);
      }
      if (game.boss && game.boss.blast) game.boss.blast(cx, cy, R, game);
      // break cracked bricks & crates nearby
      const t = TS();
      for (let ty = Math.floor((cy - R) / t); ty <= Math.floor((cy + R) / t); ty++)
        for (let tx = Math.floor((cx - R) / t); tx <= Math.floor((cx + R) / t); tx++)
          if (['B', 'C'].includes(game.level.tile(tx, ty)) && Math.hypot(tx * t + 16 - cx, ty * t + 16 - cy) < R + 8) game.breakTile(tx, ty);
    }
    draw(ctx) {
      D().item(ctx, 'puff', this.x + 9, this.y + 9, 1, this.t);
      if (this.fuse < 0.6 && Math.floor(this.t * 16) % 2) D().blob(ctx, this.x + 9, this.y + 9, 12, 12, 3, 'rgba(255,255,255,0.5)', 0);
    }
  }

  // Kitty wand / earthworm thrown by Pholia. Lands as a pickup again.
  class Thrown {
    constructor(kind, x, y, vx, vy) { this.kind = kind; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.w = 24; this.h = 24; this.t = 0; this.dead = false; }
    update(dt, game) {
      this.t += dt;
      this.vy = Math.min(C().MAX_FALL, this.vy + C().GRAVITY * (this.kind === 'worm' ? 0.9 : 0.45) * dt);
      if (game.boss && game.boss.thrownHit && game.boss.thrownHit(this, game)) { this.dead = true; return; }
      const res = game.level.moveBody(this, dt);
      if (res.ground || res.wallL || res.wallR || res.ceil || this.y > game.level.pxH) {
        this.dead = true;
        if (this.y < game.level.pxH) {
          const pk = new Pickup(this.kind, this.x, this.y - 4, 0, 0, true);
          pk.life = Infinity; pk.grabDelay = this.kind === 'worm' ? 1.2 : 0.4; pk.bait = this.kind === 'worm';
          game.pickups.push(pk);
        }
      }
    }
    draw(ctx) { ctx.save(); ctx.translate(this.x + 12, this.y + 12); ctx.rotate(this.t * 12); D().item(ctx, this.kind, 0, 0, 1.1, this.t); ctx.restore(); }
  }

  // ============================================================ PLATFORMS & HAZARDS
  class MovingPlatform {
    constructor(level, tx, ty, vertical) {
      const t = TS();
      this.w = t * 3; this.h = 14;
      this.x = tx * t - t; this.y = ty * t + 2;
      this.vertical = vertical; this.speed = 75; this.dir = 1; this.t = 0;
      // find bounds from | markers
      let a, b;
      if (!vertical) {
        a = tx; while (a > 0 && level.tile(a - 1, ty) !== '|' && tx - a < 30) a--;
        b = tx; while (b < level.w - 1 && level.tile(b + 1, ty) !== '|' && b - tx < 30) b++;
        if (level.tile(a - 1, ty) !== '|') a = tx - 3;
        if (level.tile(b + 1, ty) !== '|') b = tx + 3;
        this.min = (a) * t; this.max = (b + 1) * t - this.w;
      } else {
        a = ty; while (a > 0 && level.tile(tx, a - 1) !== '|' && ty - a < 20) a--;
        b = ty; while (b < level.h - 1 && level.tile(tx, b + 1) !== '|' && b - ty < 20) b++;
        if (level.tile(tx, a - 1) !== '|') a = ty - 3;
        if (level.tile(tx, b + 1) !== '|') b = ty + 3;
        this.min = a * t + 2; this.max = b * t + 2;
      }
    }
    update(dt, game) {
      this.t += dt;
      const p = game.player;
      const riding = p.platform === this;
      const dx0 = this.x, dy0 = this.y;
      if (!this.vertical) {
        this.x += this.dir * this.speed * dt;
        if (this.x < this.min) { this.x = this.min; this.dir = 1; }
        if (this.x > this.max) { this.x = this.max; this.dir = -1; }
      } else {
        this.y += this.dir * this.speed * dt;
        if (this.y < this.min) { this.y = this.min; this.dir = 1; }
        if (this.y > this.max) { this.y = this.max; this.dir = -1; }
      }
      if (riding) {
        p.x += this.x - dx0;
        if (game.level.rectSolid(p.x, p.y, p.w, p.h)) p.x -= this.x - dx0;
        p.y = this.y - p.h; p.prevBottom = p.y + p.h;
      }
    }
    draw(ctx) {
      const Dr = D();
      Dr.rect(ctx, this.x, this.y, this.w, this.h, 70, '#9aa3ad', 2.4, 0.6);
      for (let i = 1; i < 3; i++) Dr.line(ctx, [[this.x + i * 32, this.y + 2], [this.x + i * 32, this.y + this.h - 2]], 71 + i, 1.4, '#5a636d');
      Dr.dot(ctx, this.x + 6, this.y + 7, 2, '#5a636d'); Dr.dot(ctx, this.x + this.w - 6, this.y + 7, 2, '#5a636d');
    }
  }

  class DripPipe {
    constructor(tx, ty, idx) {
      const t = TS();
      this.x = tx * t + 16; this.y = ty * t; this.period = 1.7; this.timer = (idx * 0.55) % this.period;
      this.drops = [];
      this.tipShown = false;
    }
    update(dt, game) {
      this.timer += dt;
      if (Math.abs(game.player.x - this.x) < C().WIDTH) {
        if (!this.tipShown) { game.tip('drip'); this.tipShown = true; }
        if (this.timer >= this.period) { this.timer = 0; this.drops.push({ x: this.x - 5, y: this.y + 22, w: 10, h: 14, vy: 0, vx: 0 }); }
      }
      for (const d of this.drops) {
        d.vy += C().GRAVITY * 0.6 * dt;
        d.y += d.vy * dt;
        if (game.level.rectSolid(d.x, d.y, d.w, d.h) || game.level.rectTouches(d.x, d.y + d.h - 2, d.w, 2, '=') || d.y > game.level.pxH) {
          d.dead = true; game.particles.burst(d.x + 5, d.y + 8, '#8fce5a', 6, 90);
        } else if (overlap(d, game.player)) {
          d.dead = true; game.hurtPlayer(game.enemyDamage(), d.x, 'drip');
        }
      }
      this.drops = this.drops.filter((d) => !d.dead);
    }
    draw(ctx) {
      const Dr = D();
      Dr.rect(ctx, this.x - 12, this.y, 24, 16, 80, '#6f7d80', 2.2, 0.6);
      Dr.rect(ctx, this.x - 7, this.y + 14, 14, 9, 81, '#6f7d80', 2, 0.5);
      if (this.timer > this.period - 0.4) Dr.blob(ctx, this.x, this.y + 25, 3, 3 + (this.timer - this.period + 0.4) * 8, 82, '#8fce5a', 1.4);
      for (const d of this.drops) Dr.blob(ctx, d.x + 5, d.y + 8, 5, 7, 83, '#8fce5a', 1.6);
    }
  }

  class Sign {
    constructor(tx, ty, text) { this.x = tx * TS(); this.y = ty * TS(); this.text = text; this.near = false; }
    update(dt, game) { const p = game.player; this.near = Math.abs(p.cx - (this.x + 16)) < 70 && Math.abs(p.y - this.y) < 90; }
    draw(ctx) {
      const Dr = D(), x = this.x, y = this.y;
      Dr.rect(ctx, x + 14, y + 12, 5, 20, 90, '#8b6a42', 1.8);
      Dr.rect(ctx, x - 2, y - 2, 36, 18, 91, '#c59a64', 2.2);
      Dr.line(ctx, [[x + 4, y + 4], [x + 26, y + 4]], 92, 1.4, '#6b4a2a'); Dr.line(ctx, [[x + 4, y + 9], [x + 22, y + 9]], 93, 1.4, '#6b4a2a');
    }
    drawBubble(ctx) {
      if (!this.near || !this.text) return;
      const lines = D().wrap(ctx, this.text, 300, 17);
      const w = 330, h = 18 + lines.length * 22;
      const bx = this.x + 16 - w / 2, by = this.y - 20 - h;
      D().panel(ctx, bx, by, w, h, 95, '#fff8e8');
      lines.forEach((l, i) => D().text(ctx, l, bx + w / 2, by + 26 + i * 22, { size: 17, align: 'center' }));
    }
  }

  // A flag post before a major boss. Touch it to save your spot in the level.
  class Checkpoint {
    constructor(tx, ty) { this.x = tx * TS(); this.y = ty * TS(); this.w = TS(); this.h = TS() * 2; this.active = false; this.t = 0; this.raise = 0; }
    update(dt, game) {
      this.t += dt;
      if (this.active) this.raise = Math.min(1, this.raise + dt * 2.5);
      else if (game.player.overlapsRect(this.x, this.y - TS(), this.w, this.h)) game.activateCheckpoint(this);
    }
    draw(ctx) {
      const Dr = D(), x = this.x + 16, base = this.y + 32;
      Dr.rect(ctx, x - 10, base - 6, 20, 6, 120, '#8b6a42', 2);
      Dr.line(ctx, [[x, base - 4], [x, base - 70]], 121, 4, '#6b4a2a');
      const fy = base - 30 - this.raise * 36 + Math.sin(this.t * 4) * 1.5;
      Dr.poly(ctx, [[x + 2, fy - 12], [x + 34, fy - 6 + Math.sin(this.t * 6) * 3], [x + 2, fy + 2]], 122, this.active ? '#5ab8ff' : '#b8aea0', 2);
      Dr.dot(ctx, x + 14, fy - 5, 3, this.active ? '#fff' : '#8a8070');
      for (const [dx, dy] of [[-3, -4], [0, -5.5], [3, -4]]) Dr.dot(ctx, x + 14 + dx, fy - 5 + dy, 1.4, this.active ? '#fff' : '#8a8070');
      if (this.active) { ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(this.t * 3) * 0.1; Dr.blob(ctx, x + 14, fy - 5, 26, 22, 123, '#bfe6ff', 0); ctx.restore(); }
      else Dr.text(ctx, 'checkpoint', x, base - 78, { size: 12, align: 'center', color: '#d8ccb4', outline: 3 });
    }
  }

  // ============================================================ PARTICLES
  class Particles {
    constructor() { this.list = []; }
    add(p) { p.t = 0; p.maxLife = p.life; this.list.push(p); }
    burst(x, y, color, n, spd = 150) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = spd * (0.4 + Math.random() * 0.6);
        this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3, g: 600, life: 0.4 + Math.random() * 0.3, color, r: 2 + Math.random() * 2.5 });
      }
    }
    update(dt) {
      for (const p of this.list) {
        p.t += dt; p.life -= dt;
        if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; }
        if (p.vy != null && p.floatUp) p.vy = -40;
      }
      this.list = this.list.filter((p) => p.life > 0);
    }
    draw(ctx) {
      const Dr = D();
      for (const p of this.list) {
        const a = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = a;
        if (p.kind === 'poof') Dr.blob(ctx, p.x, p.y, p.r * (1.5 - a * 0.5), p.r * (1.2 - a * 0.3), 7, 'rgba(255,255,255,0.8)', 2);
        else if (p.kind === 'boom') { Dr.blob(ctx, p.x, p.y, p.r * (1.1 - a * 0.5), p.r * (1.1 - a * 0.5), 8, '#ffd27a', 3); Dr.blob(ctx, p.x, p.y, p.r * 0.6 * (1.1 - a * 0.5), p.r * 0.6 * (1.1 - a * 0.5), 9, '#ff8fc2', 0); }
        else if (p.kind === 'text') Dr.text(ctx, p.text, p.x, p.y - (p.maxLife - p.life) * 40, { size: p.size || 16, color: p.color || '#fff', outline: 4, align: 'center' });
        else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }
  }

  PM.Entities = { Player, Enemy, Pickup, PuffBomb, Thrown, MovingPlatform, DripPipe, Sign, Checkpoint, Particles, overlap };
})();
