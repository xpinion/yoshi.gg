// Bosses and mini-bosses.
(function () {
  const C = () => PM.CONFIG;
  const D = () => PM.Draw;
  const A = () => PM.Audio;
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  class BossBase {
    constructor(game, arena) {
      this.arena = arena; // {x0, x1, floorY} in pixels
      this.t = 0; this.state = 'intro'; this.stateT = 0;
      this.defeated = false; this.done = false;
      this.say = null; this.sayT = 0;
      this.flash = 0;
    }
    setState(s) { this.state = s; this.stateT = 0; }
    speak(text, time = 2.2) { this.say = text; this.sayT = time; }
    drawSpeech(ctx, x, y) {
      if (!this.say || this.sayT <= 0) return;
      const lines = D().wrap(ctx, this.say, 260, 17);
      const w = 280, h = 16 + lines.length * 21;
      const bx = Math.max(this.arena.x0 + 10, Math.min(this.arena.x1 - w - 10, x - w / 2)), by = y - h;
      D().panel(ctx, bx, by, w, h, 33, '#fff');
      lines.forEach((l, i) => D().text(ctx, l, bx + w / 2, by + 24 + i * 21, { size: 17, align: 'center' }));
    }
    drawBar(ctx, name, hp, max) {
      const W = C().WIDTH, Dr = D();
      Dr.panel(ctx, W / 2 - 190, 14, 380, 44, 501, '#2c2226');
      Dr.text(ctx, name, W / 2, 34, { align: 'center', size: 17, color: '#ffe9a0' });
      for (let i = 0; i < max; i++) {
        const x = W / 2 - (max * 34) / 2 + i * 34 + 6;
        Dr.rect(ctx, x, 40, 26, 10, 510 + i, i < hp ? '#e2475b' : '#4a3a3e', 1.6, 0.5);
      }
    }
  }

  // ============================================================ FOREMAN DIGBY (sewer mini-boss)
  class Digby extends BossBase {
    constructor(game, arena) {
      super(game, arena);
      this.name = 'Foreman Digby';
      this.maxHp = 6; this.hp = 6;
      this.w = 60; this.h = 58;
      this.x = arena.x1 - 140; this.y = arena.floorY - this.h;
      this.facing = -1; this.vx = 0; this.vy = 0;
      this.speak("Oi! Nobody gets past Foreman Digby! The Queen's orders!", 3);
      this.charges = 0;
    }
    get cx() { return this.x + this.w / 2; }
    update(dt, game) {
      this.t += dt; this.stateT += dt; this.sayT -= dt; this.flash -= dt;
      const p = game.player, cfg = C();
      const angry = this.hp <= this.maxHp / 2;
      if (this.defeated) {
        this.vy += cfg.GRAVITY * dt; this.y += this.vy * dt; this.x += this.vx * dt;
        if (this.stateT > 2.5) this.done = true;
        return;
      }
      switch (this.state) {
        case 'intro': if (this.stateT > 2.2) this.setState('walk'); break;
        case 'walk':
          this.facing = p.cx < this.cx ? -1 : 1;
          this.vx = this.facing * (angry ? 85 : 60);
          if (this.stateT > (angry ? 1.4 : 2.2)) { this.setState('windup'); A().sfx('drill'); }
          break;
        case 'windup':
          this.vx = 0;
          if (this.stateT > (angry ? 0.55 : 0.8)) { this.setState('charge'); this.facing = p.cx < this.cx ? -1 : 1; }
          break;
        case 'charge':
          this.vx = this.facing * (angry ? 470 : 380);
          if (Math.random() < 0.5) game.particles.add({ x: this.cx - this.facing * 20, y: this.y + this.h, vx: -this.facing * 60, vy: -40, life: 0.3, color: '#8b6a42', r: 3 });
          break;
        case 'stuck':
          this.vx = 0;
          if (this.stateT > (angry ? 1.6 : 2.2)) {
            this.facing *= -1; this.x += this.facing * 12;
            this.charges++;
            if (angry && this.charges % (this.burrowEvery || 2) === 0) { this.setState('burrow'); A().sfx('rumble'); }
            else this.setState('walk');
          }
          break;
        case 'burrow':
          this.vx = 0;
          if (this.stateT > 0.6) { this.setState('under'); this.targetX = p.cx; }
          break;
        case 'under':
          this.targetX += (p.cx - this.targetX) * Math.min(1, dt * 1.5);
          this.x = this.targetX - this.w / 2;
          if (this.stateT > 1.6) { this.setState('popup'); this.vy = -620; A().sfx('boom'); game.shake(6); game.particles.burst(this.cx, this.arena.floorY, '#8b6a42', 16, 240); }
          break;
        case 'popup':
          if (this.vy === 0 && this.stateT > 0.3) this.setState('walk');
          break;
      }
      // physics
      if (this.state !== 'under' && this.state !== 'burrow') {
        this.vy = Math.min(cfg.MAX_FALL, this.vy + cfg.GRAVITY * dt);
        const res = game.level.moveBody(this, dt);
        if ((res.wallL || res.wallR) && this.state === 'charge') {
          this.setState('stuck'); A().sfx('bosshit'); game.shake(10);
          const sl = this.stuckLines || ['Ack! Stuck again!', 'Who put that wall there?!', 'My drill! My beautiful drill!']; this.speak(sl[this.charges % sl.length], 1.6);
        }
      }
      this.x = Math.max(this.arena.x0 + 2, Math.min(this.arena.x1 - this.w - 2, this.x));
      // contact damage
      if (!['under', 'burrow', 'stuck'].includes(this.state) && overlap(this, p) && !p.dead) {
        const stomp = p.vy > 0 && p.prevBottom <= this.y + 12;
        if (stomp && this.state !== 'charge') { p.pounce(); this.damage(1, game); }
        else if (stomp) p.pounce();
        else game.hurtPlayer(this.state === 'charge' ? game.bossDamage() : game.enemyDamage() * 2, this.cx, 'boss');
      }
    }
    hitByAttack(box, player, game) {
      if (this.defeated || ['under', 'burrow'].includes(this.state)) return false;
      if (!overlap(box, this)) return false;
      if (this.state === 'stuck') { this.damage(1, game); return true; }
      A().sfx('hit'); game.floater('clank!', this.cx, this.y - 10, '#ffe9a0');
      return true;
    }
    puffHit(bomb) { return !this.defeated && this.state !== 'under' && overlap(bomb, this); }
    blast(cx, cy, R, game) { if (Math.hypot(this.cx - cx, this.y + this.h / 2 - cy) < R + 20 && !['under', 'burrow'].includes(this.state)) this.damage(2, game); }
    damage(n, game) {
      if (this.flash > 0 || this.defeated) return;
      this.hp -= n; this.flash = 0.35; A().sfx('bosshit'); game.shake(6);
      game.particles.burst(this.cx, this.y + 10, '#fff', 10, 200);
      if (this.hp <= 0) {
        this.defeated = true; this.setState('defeat'); this.vy = -500; this.vx = -this.facing * 120;
        this.speak(this.defeatLine || "Nooo! The Queen is gonna dock my pay!", 2.5);
        game.spawnCoins(this.cx, this.y, 15);
      } else if (this.hp === Math.floor(this.maxHp / 2)) this.speak(this.angryLine || "Alright, no more Mr. Nice Mole!", 2);
    }
    draw(ctx) {
      if (this.state === 'under') {
        const cx = this.cx, fy = this.arena.floorY;
        D().blob(ctx, cx, fy - 4, 30 + Math.sin(this.t * 20) * 3, 8, 610, '#8b6a42', 2);
        for (let i = 0; i < 3; i++) D().dot(ctx, cx - 20 + Math.random() * 40, fy - 6 - Math.random() * 10, 3, '#a07a50');
        return;
      }
      if (this.state === 'burrow') { ctx.save(); ctx.beginPath(); ctx.rect(this.x - 40, this.y - 60 + this.stateT * 100, 140, 200); ctx.clip(); }
      if (this.flash > 0 && Math.floor(this.t * 20) % 2) ctx.globalAlpha = 0.5;
      let shake = this.state === 'windup' ? (Math.random() - 0.5) * 4 : 0;
      D().mole(ctx, this.cx + shake, this.y + this.h, { facing: this.facing, t: this.t, drill: this.drill !== false, hat: this.hat || 'hardhat', color: this.color, dizzy: this.state === 'stuck' || this.defeated, scale: 1.4 });
      ctx.globalAlpha = 1;
      if (this.state === 'burrow') ctx.restore();
      if (this.state === 'windup') D().text(ctx, '!', this.cx, this.y - 65, { size: 34, color: '#ff5040', outline: 5, align: 'center' });
      this.drawSpeech(ctx, this.cx, this.y - 75);
    }
    drawUI(ctx) { if (!this.defeated) this.drawBar(ctx, this.name, this.hp, this.maxHp); }
  }

  // ============================================================ THE RAT KING
  // Pick up a rat trap and THROW it at him (hold I) while he's dizzy from ramming the wall.
  class RatKing extends BossBase {
    constructor(game, arena) {
      super(game, arena);
      this.name = 'The Rat King';
      this.hp = 3; this.phase = 1;
      this.w = 120; this.h = 78;
      this.x = arena.x1 - 220; this.y = arena.floorY - this.h;
      this.facing = -1; this.vx = 0; this.vy = 0;
      this.rams = 0; this.trapT = 0;
      this.setupPhase(game);
      this.speak("Squeak squeak! I'm the KING! The Mole Queen says you gotta go bye-bye!", 3.2);
    }
    get cx() { return this.x + this.w / 2; }
    trapSpot() {
      const a = this.arena;
      if (this.phase === 1) return { x: a.x0 + (a.x1 - a.x0) * 0.3, y: a.floorY - 30 };
      if (this.phase === 2) return { x: a.x0 + 5 * 32, y: a.floorY - 4 * 32 };       // left ledge
      return { x: a.x1 - 6 * 32, y: a.floorY - 4 * 32 };                              // right ledge
    }
    setupPhase(game) {
      const a = this.arena;
      this.dropTrap(game);
      if (this.phase === 2) { game.spawnEnemy('r', a.x0 + 80, a.floorY - 40); game.spawnEnemy('r', a.x1 - 100, a.floorY - 40); }
      if (this.phase === 3) game.spawnEnemy('c', (a.x0 + a.x1) / 2, a.floorY - 40);
    }
    dropTrap(game) {
      game.pickups = game.pickups.filter((k) => k.kind !== 'trap');
      const sp = this.trapSpot();
      const pk = new PM.Entities.Pickup('trap', sp.x - 13, sp.y - 6); pk.life = Infinity;
      game.pickups.push(pk);
      game.particles.burst(sp.x, sp.y, '#f6d55c', 8, 120);
    }
    keepTrap(dt, game) {
      const have = game.state.item === 'trap' || game.pickups.some((k) => k.kind === 'trap') || game.projectiles.some((k) => k.kind === 'trap');
      if (have || this.defeated || this.state === 'trapped') { this.trapT = 0; return; }
      if ((this.trapT += dt) > 1) this.dropTrap(game);
    }
    update(dt, game) {
      this.t += dt; this.stateT += dt; this.sayT -= dt; this.flash -= dt;
      const p = game.player, cfg = C(), a = this.arena;
      const spd = [0, 165, 200, 235][this.phase];
      this.keepTrap(dt, game);
      if (this.defeated) { if (this.stateT > 2.8) this.done = true; return; }
      switch (this.state) {
        case 'intro': if (this.stateT > 3) this.setState('chase'); break;
        case 'chase': {
          const want = p.cx < this.cx ? -1 : 1;
          // turns slowly so he overshoots and "chases you in circles"
          if (want !== this.facing && (this.turnT = (this.turnT || 0) + dt) > 0.35) { this.facing = want; this.turnT = 0; }
          this.vx += (this.facing * spd - this.vx) * Math.min(1, dt * 3);
          if (this.stateT > [0, 4.5, 3.8, 3.2][this.phase]) { this.setState('telegraph'); this.facing = p.cx < this.cx ? -1 : 1; this.speak(['Here I come!', 'Wiggle wiggle... CHARGE!', 'Royal RAM!'][this.rams % 3], 1); }
          break;
        }
        case 'telegraph':
          this.vx *= Math.pow(0.01, dt);
          if (this.stateT > [0, 1.1, 0.9, 0.75][this.phase]) { this.setState('ram'); A().sfx('dash'); }
          break;
        case 'ram':
          this.vx = this.facing * [0, 560, 620, 680][this.phase];
          if (Math.random() < 0.7) game.particles.add({ x: this.cx - this.facing * 50, y: a.floorY - 4, vx: -this.facing * 80, vy: -60, life: 0.35, color: '#cfc6b0', r: 4 });
          break;
        case 'dizzy':
          this.vx *= Math.pow(0.02, dt);
          if (this.stateT > [0, 3.2, 2.6, 2.0][this.phase]) {
            if (this.phase === 3 && this.secondRam) { this.secondRam = false; this.setState('telegraph'); this.facing = p.cx < this.cx ? -1 : 1; }
            else { this.setState('chase'); this.speak('Huh? Where am I? Oh yeah. CHASING!', 1.2); }
          }
          break;
        case 'trapped':
          this.vx = 0;
          if (this.stateT > 2.6) { this.phase++; this.setupPhase(game); game.bossPhaseRadio(this.phase); this.setState('chase'); }
          break;
      }
      this.vy = Math.min(cfg.MAX_FALL, this.vy + cfg.GRAVITY * dt);
      const res = game.level.moveBody(this, dt);
      if (this.x < a.x0 + 2) { this.x = a.x0 + 2; res.wallL = true; }
      if (this.x + this.w > a.x1 - 2) { this.x = a.x1 - this.w - 2; res.wallR = true; }
      if (this.state === 'ram' && ((res.wallL && this.facing < 0) || (res.wallR && this.facing > 0))) {
        this.setState('dizzy'); A().sfx('bosshit'); game.shake(12);
        this.rams++;
        this.speak(['Ow! Who moved the wall?', 'Seeing stars... pretty stars...', 'My crown is crooked...'][this.rams % 3], 1.4);
        if (this.phase === 3 && !this.didSecond) { this.secondRam = true; this.didSecond = true; } else this.didSecond = false;
        this.vx = -this.facing * 120;
        game.tip('ratdizzy');
      }
      if (res.wallL && this.state === 'chase') this.facing = 1;
      if (res.wallR && this.state === 'chase') this.facing = -1;
      // contact damage
      if (!['trapped', 'intro', 'dizzy'].includes(this.state) && !p.dead && overlap(this.bodyBox(), p)) {
        game.hurtPlayer(this.state === 'ram' ? game.bossDamage() : Math.max(0.5, game.bossDamage() / 2), this.cx, 'boss');
      }
    }
    bodyBox() { return { x: this.x + 10, y: this.y + 14, w: this.w - 20, h: this.h - 14 }; }
    thrownHit(proj, game) {
      if (proj.kind !== 'trap' || this.defeated || !overlap(proj, this.bodyBox())) return false;
      if (this.state !== 'dizzy') {
        // he swats it away; it lands nearby so you can grab it again
        game.floater('he swatted it away! wait till he\'s dizzy', this.cx, this.y - 10, '#ffe9a0');
        const pk = new PM.Entities.Pickup('trap', proj.x, proj.y, -proj.vx * 0.3, -300, true); pk.life = Infinity; game.pickups.push(pk);
        return true;
      }
      this.hp--;
      A().sfx('snap'); A().sfx('bosshit'); game.shake(14);
      this.setState('trapped'); this.flash = 1;
      game.particles.burst(this.cx + this.facing * 50, this.y + 30, '#f6d55c', 14, 220);
      if (this.hp <= 0) {
        this.defeated = true; this.setState('defeat');
        this.speak("WAAAH! I'm telling the Mole Queen!!", 3);
        game.spawnCoins(this.cx, this.y, 25);
      } else this.speak(['OWWW! My nose! That cheese was a TRICK!', 'NOT THE TRAP AGAIN!'][2 - this.hp], 2.4);
      return true;
    }
    hitByAttack(box, player, game) {
      if (this.defeated || !overlap(box, this.bodyBox())) return false;
      A().sfx('hit'); game.floater(this.state === 'dizzy' ? 'throw a trap at him! (hold I)' : 'too big! grab a trap!', this.cx, this.y - 20, '#ffe9a0');
      return true;
    }
    puffHit(bomb) { return !this.defeated && overlap(bomb, this.bodyBox()); }
    blast(cx, cy, R, game) {
      if (!this.defeated && Math.abs(this.cx - cx) < R + 60 && !['trapped', 'dizzy'].includes(this.state)) { this.setState('dizzy'); this.speak('Achoo! That tickles!', 1.2); }
    }
    draw(ctx) {
      if (this.flash > 0 && Math.floor(this.t * 16) % 2) ctx.globalAlpha = 0.6;
      const shake = this.state === 'telegraph' ? Math.sin(this.t * 50) * 4 : 0;
      ctx.save();
      if (this.defeated) { ctx.translate(this.cx, this.y + this.h); ctx.rotate(-this.facing * Math.min(1.5, this.stateT * 2)); ctx.translate(-this.cx, -(this.y + this.h)); }
      D().ratKing(ctx, this.cx - this.facing * 12 + shake, this.y + this.h, { facing: this.facing, t: this.t, running: ['chase', 'ram'].includes(this.state), crouch: this.state === 'telegraph', dizzy: ['dizzy', 'trapped', 'defeat'].includes(this.state), angry: this.state === 'ram' || this.state === 'telegraph' });
      if (this.state === 'trapped' || this.defeated) D().trap(ctx, this.cx + this.facing * 62, this.y + 48, { snapped: true });
      ctx.restore();
      ctx.globalAlpha = 1;
      if (this.state === 'telegraph') D().text(ctx, '!!', this.cx, this.y - 30, { size: 40, color: '#ff5040', outline: 6, align: 'center' });
      if (this.state === 'dizzy') D().text(ctx, 'NOW! throw the trap!', this.cx, this.y - 34, { size: 16, color: '#fff', outline: 4, align: 'center' });
      this.drawSpeech(ctx, this.cx, this.y - 50);
    }
    drawUI(ctx) { if (!this.defeated) this.drawBar(ctx, this.name + (this.phase > 1 ? `  — phase ${this.phase}` : ''), this.hp, 3); }
  }

  PM.Bosses = { digby: Digby, ratking: RatKing };
  PM.BossBase = BossBase;
})();
