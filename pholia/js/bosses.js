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
      const angry = this.hp <= 3;
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
            if (angry && this.charges % 2 === 0) { this.setState('burrow'); A().sfx('rumble'); }
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
          this.speak(['Ack! Stuck again!', 'Who put that wall there?!', 'My drill! My beautiful drill!'][this.charges % 3], 1.6);
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
        this.speak("Nooo! The Queen is gonna dock my pay!", 2.5);
        game.spawnCoins(this.cx, this.y, 15);
      } else if (this.hp === 3) this.speak("Alright, no more Mr. Nice Mole!", 2);
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
      D().mole(ctx, this.cx + shake, this.y + this.h, { facing: this.facing, t: this.t, drill: true, hat: 'hardhat', dizzy: this.state === 'stuck' || this.defeated, scale: 1.4 });
      ctx.globalAlpha = 1;
      if (this.state === 'burrow') ctx.restore();
      if (this.state === 'windup') D().text(ctx, '!', this.cx, this.y - 65, { size: 34, color: '#ff5040', outline: 5, align: 'center' });
      this.drawSpeech(ctx, this.cx, this.y - 75);
    }
    drawUI(ctx) { if (!this.defeated) this.drawBar(ctx, this.name, this.hp, this.maxHp); }
  }

  // ============================================================ THE RAT KING
  class RatKing extends BossBase {
    constructor(game, arena) {
      super(game, arena);
      this.name = 'The Rat King';
      this.hp = 3; this.phase = 1;
      this.w = 120; this.h = 78;
      this.x = arena.x1 - 220; this.y = arena.floorY - this.h;
      this.facing = -1; this.vx = 0; this.vy = 0;
      this.traps = [];
      this.rams = 0;
      this.setupPhase(game);
      this.speak("Squeak squeak! I'm the KING! The Mole Queen says you gotta go bye-bye!", 3.2);
    }
    get cx() { return this.x + this.w / 2; }
    noseBox() { return { x: this.facing > 0 ? this.x + this.w - 30 : this.x, y: this.y + 20, w: 30, h: this.h - 20 }; }
    setupPhase(game) {
      const a = this.arena, span = a.x1 - a.x0;
      this.traps = [];
      if (this.phase === 1) {
        this.traps.push(newTrap(a.x0 + span * 0.3, a.floorY), newTrap(a.x0 + span * 0.7, a.floorY));
      } else if (this.phase === 2) {
        const t1 = newTrap(a.x0 + span * 0.25, a.floorY), t2 = newTrap(a.x0 + span * 0.75, a.floorY);
        t1.vx = 90; t2.vx = -90; t1.belt = t2.belt = true;
        this.traps.push(t1, t2);
        game.spawnEnemy('r', a.x0 + 80, a.floorY - 40); game.spawnEnemy('r', a.x1 - 100, a.floorY - 40);
      } else {
        this.traps.push(newTrap(a.x0 + 70, a.floorY));
        this.traps[0].pushable = true;
        game.spawnEnemy('c', a.x0 + span / 2, a.floorY - 40);
      }
    }
    update(dt, game) {
      this.t += dt; this.stateT += dt; this.sayT -= dt; this.flash -= dt;
      const p = game.player, cfg = C(), a = this.arena;
      const spd = [0, 165, 200, 235][this.phase];
      // traps
      for (const tr of this.traps) {
        if (tr.belt && !tr.snapped) { tr.x += tr.vx * dt; if (tr.x < a.x0 + 60 || tr.x > a.x1 - 60) tr.vx *= -1; }
        if (tr.pushable && !tr.snapped) { tr.x += tr.vx * dt; tr.vx *= Math.pow(0.15, dt); tr.x = Math.max(a.x0 + 40, Math.min(a.x1 - 40, tr.x)); }
      }
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
        case 'ram': {
          this.vx = this.facing * [0, 560, 620, 680][this.phase];
          if (Math.random() < 0.7) game.particles.add({ x: this.cx - this.facing * 50, y: a.floorY - 4, vx: -this.facing * 80, vy: -60, life: 0.35, color: '#cfc6b0', r: 4 });
          const nose = this.noseBox();
          for (const tr of this.traps) {
            if (!tr.snapped && overlap(nose, { x: tr.x - 26, y: tr.y - 30, w: 52, h: 30 })) { this.trapped(tr, game); break; }
          }
          break;
        }
        case 'dizzy':
          this.vx *= Math.pow(0.02, dt);
          if (this.stateT > 1.3) {
            if (this.phase === 3 && this.secondRam) { this.secondRam = false; this.setState('telegraph'); this.facing = p.cx < this.cx ? -1 : 1; }
            else this.setState('chase');
          }
          break;
        case 'trapped':
          this.vx = 0;
          if (this.stateT > 2.6) {
            this.phase++;
            this.setupPhase(game);
            game.bossPhaseRadio(this.phase);
            this.setState('chase');
          }
          break;
      }
      this.vy = Math.min(cfg.MAX_FALL, this.vy + cfg.GRAVITY * dt);
      const res = game.level.moveBody(this, dt);
      if (this.x < a.x0 + 2) { this.x = a.x0 + 2; res.wallL = true; }
      if (this.x + this.w > a.x1 - 2) { this.x = a.x1 - this.w - 2; res.wallR = true; }
      if (this.state === 'ram' && ((res.wallL && this.facing < 0) || (res.wallR && this.facing > 0))) {
        this.setState('dizzy'); A().sfx('bosshit'); game.shake(12);
        this.rams++;
        this.speak(['Ow! Who moved the wall?', 'Missed! On purpose!', 'My crown is crooked...'][this.rams % 3], 1.4);
        if (this.phase === 3 && !this.didSecond) { this.secondRam = true; this.didSecond = true; } else this.didSecond = false;
        this.vx = -this.facing * 120;
      }
      if (res.wallL && this.state === 'chase') this.facing = 1;
      if (res.wallR && this.state === 'chase') this.facing = -1;
      // contact damage
      if (this.state !== 'trapped' && this.state !== 'intro' && !p.dead && overlap(this.bodyBox(), p)) {
        if (this.state === 'dizzy' && p.vy > 0 && p.prevBottom <= this.y + 20) { p.pounce(); this.speak('Hey! No standing on the king!', 1.2); }
        else game.hurtPlayer(this.state === 'ram' ? game.bossDamage() : Math.max(0.5, game.bossDamage() / 2), this.cx, 'boss');
      }
    }
    bodyBox() { return { x: this.x + 10, y: this.y + 14, w: this.w - 20, h: this.h - 14 }; }
    trapped(tr, game) {
      tr.snapped = true; this.hp--;
      A().sfx('snap'); A().sfx('bosshit'); game.shake(14);
      this.setState('trapped'); this.flash = 1;
      game.particles.burst(tr.x, tr.y - 20, '#f6d55c', 14, 220);
      if (this.hp <= 0) {
        this.defeated = true; this.setState('defeat');
        this.speak("WAAAH! I'm telling the Mole Queen!!", 3);
        game.spawnCoins(this.cx, this.y, 25);
      } else this.speak(['OWWW! My nose! That cheese was a TRICK!', 'NOT THE TRAP AGAIN!'][3 - this.hp - 1], 2.4);
    }
    hitByAttack(box, player, game) {
      for (const tr of this.traps) {
        if (tr.pushable && !tr.snapped && overlap(box, { x: tr.x - 26, y: tr.y - 30, w: 52, h: 30 })) {
          tr.vx = player.facing * 420; A().sfx('hit'); return true;
        }
      }
      if (this.defeated || !overlap(box, this.bodyBox())) return false;
      A().sfx('hit'); game.floater(this.state === 'dizzy' ? 'he just giggles!' : 'too big! use the traps!', this.cx, this.y - 20, '#ffe9a0');
      return true;
    }
    puffHit(bomb) { return !this.defeated && overlap(bomb, this.bodyBox()); }
    blast(cx, cy, R, game) {
      if (!this.defeated && Math.abs(this.cx - cx) < R + 60 && this.state !== 'trapped') {
        this.setState('dizzy'); this.speak('Achoo! That tickles!', 1.2);
      }
    }
    draw(ctx) {
      const a = this.arena;
      if (this.phase === 2 && !this.defeated) {
        // conveyor belt on the floor
        ctx.fillStyle = '#3c3f44'; ctx.fillRect(a.x0 + 40, a.floorY - 6, a.x1 - a.x0 - 80, 6);
        ctx.strokeStyle = '#8d939b'; ctx.lineWidth = 2;
        for (let x = a.x0 + 40 + ((this.t * 60) % 24); x < a.x1 - 40; x += 24) { ctx.beginPath(); ctx.moveTo(x, a.floorY - 6); ctx.lineTo(x + 8, a.floorY); ctx.stroke(); }
      }
      for (const tr of this.traps) D().trap(ctx, tr.x, tr.y, { snapped: tr.snapped, seed: Math.round(tr.x0) });
      if (this.flash > 0 && Math.floor(this.t * 16) % 2) ctx.globalAlpha = 0.6;
      const shake = this.state === 'telegraph' ? Math.sin(this.t * 50) * 4 : 0;
      ctx.save();
      if (this.defeated) { ctx.translate(this.cx, this.y + this.h); ctx.rotate(-this.facing * Math.min(1.5, this.stateT * 2)); ctx.translate(-this.cx, -(this.y + this.h)); }
      const drawX = this.cx - this.facing * 12 + shake;
      D().ratKing(ctx, drawX, this.y + this.h, { facing: this.facing, t: this.t, running: ['chase', 'ram'].includes(this.state), crouch: this.state === 'telegraph', dizzy: ['dizzy', 'trapped', 'defeat'].includes(this.state), angry: this.state === 'ram' || this.state === 'telegraph' });
      ctx.restore();
      ctx.globalAlpha = 1;
      if (this.state === 'telegraph') D().text(ctx, '!!', this.cx, this.y - 30, { size: 40, color: '#ff5040', outline: 6, align: 'center' });
      this.drawSpeech(ctx, this.cx, this.y - 40);
    }
    drawUI(ctx) { if (!this.defeated) this.drawBar(ctx, this.name + (this.phase > 1 ? `  — phase ${this.phase}` : ''), this.hp, 3); }
  }
  function newTrap(x, floorY) { return { x, x0: x, y: floorY, vx: 0, snapped: false }; }

  PM.Bosses = { digby: Digby, ratking: RatKing };
})();
