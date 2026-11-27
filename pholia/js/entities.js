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
        const maxV = this.ducking ? cfg.DUCK_SPEED : speed;
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
          } else if (this.coyote > 0) {
            this.doJump(cfg.JUMP_VELOCITY); this.coyote = 0;
          } else if (this.effect === 'spring' && this.airJumps > 0) {
            this.airJumps--; this.doJump(cfg.JUMP_VELOCITY * 0.92);
            game.particles.burst(this.cx, this.bottom, '#c0392b', 6, 80);
          }
        }
        if (inp.released('jump') && this.vy < 0) this.vy *= cfg.JUMP_CUT;
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
      if (this.y > level.pxH + 40) game.playerFell();
    }
    applyGravity(dt, game) {
      const cfg = C();
      this.vy = Math.min(cfg.MAX_FALL, this.vy + cfg.GRAVITY * dt);
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
      if (this.ducking) pose = 'duck';
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
        hat: st.hat, eyes: this.hurtT > 0 ? 'closed' : (this.sneezeT > 0 ? 'closed' : null),
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
  class Enemy {
    constructor(kind, x, y) {
      this.kind = kind; this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.facing = -1; this.t = Math.random() * 10; this.dead = false; this.flash = 0;
      this.stompable = true; this.hp = 1; this.speed = 50; this.w = 28; this.h = 18; this.coins = 1;
      this.awake = false;
      if (kind === 'r') { this.speed = 55; this.tipKey = 'rat'; }
      if (kind === 'R') { this.hp = 2; this.w = 40; this.h = 26; this.speed = 40; this.coins = 3; this.tipKey = 'bigrat'; }
      if (kind === 'c') { this.w = 24; this.h = 12; this.speed = 120; this.tipKey = 'roach'; this.coins = 1; }
      this.y -= this.h - TS();
      this.x += (TS() - this.w) / 2;
    }
    update(dt, game) {
      this.t += dt; this.flash = Math.max(0, this.flash - dt);
      if (!this.awake) {
        if (Math.abs(this.x - game.player.x) < C().WIDTH * 0.75) { this.awake = true; if (this.tipKey) game.tip(this.tipKey); }
        else return;
      }
      if (this.stun > 0) { this.stun -= dt; this.vx *= 0.9; }
      else this.vx = this.facing * this.speed;
      this.vy = Math.min(C().MAX_FALL, this.vy + C().GRAVITY * dt);
      const res = game.level.moveBody(this, dt);
      if (res.wallL) this.facing = 1;
      if (res.wallR) this.facing = -1;
      // turn at ledges
      if (res.ground) {
        const t = TS();
        const aheadX = this.facing > 0 ? this.x + this.w + 2 : this.x - 2;
        const ty = Math.floor((this.y + this.h + 4) / t), tx = Math.floor(aheadX / t);
        if (!game.level.isSolid(tx, ty) && !game.level.isOneWay(tx, ty)) this.facing *= -1;
        const hz = game.level.tile(tx, ty - 0); if (hz === '^' || hz === '~') this.facing *= -1;
      }
      if (this.y > game.level.pxH + 50) this.dead = true;
    }
    hit(dmg, fromX, game) {
      if (this.dead) return;
      this.hp -= dmg; this.flash = 0.15;
      this.stun = 0.25; this.vx = (this.x > fromX ? 1 : -1) * 160; this.vy = -180;
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
      const D_ = D(), cx = this.x + this.w / 2, by = this.y + this.h;
      if (this.flash > 0) ctx.globalAlpha = 0.5;
      if (this.kind === 'r') D_.rat(ctx, cx, by, { facing: this.facing, t: this.t, seed: 11 });
      else if (this.kind === 'R') D_.rat(ctx, cx, by, { facing: this.facing, t: this.t, scale: 1.45, color: '#6f6970', seed: 12 });
      else if (this.kind === 'c') D_.roach(ctx, cx, by, { facing: this.facing, t: this.t });
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

  PM.Entities = { Player, Enemy, Pickup, PuffBomb, MovingPlatform, DripPipe, Sign, Particles, overlap };
})();
