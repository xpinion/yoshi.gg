// Level loading, tiles, collision and background drawing.
//
// TILE LEGEND (used in levels/*.js and the level editor)
//   .  empty            #  brick (solid)         =  ledge (jump up through it)
//   ^  spikes           ~  sludge (hurts)        x  crumbling boards
//   B  cracked brick (swipe to break)            C  crate (swipe for coins)
//   o  coin             L  secret golden bell (extra life)
//   P  Pholia start     E  exit                  S  sign
//   r  tiny rat         R  chunky rat            c  roach
//   d  dripping pipe    M  moving platform (sideways)   V  moving platform (up/down)
//   |  invisible stop marker for moving platforms
window.PM = window.PM || {};
PM.LEVELS = PM.LEVELS || {};

(function () {
  const T = () => PM.CONFIG.TILE;
  const D = () => PM.Draw;
  const SOLID = new Set(['#', 'x', 'B', 'C']);
  const ENTITY_CHARS = new Set(['o', 'L', 'P', 'E', 'S', 'r', 'R', 'c', 'd', 'M', 'V']);

  class Level {
    constructor(num, data) {
      this.num = num;
      this.data = data;
      this.biome = data.biome || 0;
      this.rows = data.map.map((r) => r.split(''));
      this.h = this.rows.length;
      this.w = Math.max(...this.rows.map((r) => r.length));
      this.rows.forEach((r) => { while (r.length < this.w) r.push('.'); });
      this.spawns = [];
      this.crumble = new Map(); // key -> {timer, gone}
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const ch = this.rows[y][x];
        if (ENTITY_CHARS.has(ch)) { this.spawns.push({ ch, tx: x, ty: y }); if (ch !== 'E') this.rows[y][x] = '.'; }
        if (ch === '|') this.rows[y][x] = '|';
      }
      this.pxW = this.w * T(); this.pxH = this.h * T();
      this.start = this.spawns.find((s) => s.ch === 'P') || { tx: 2, ty: this.h - 4 };
      this.exitTile = this.spawns.find((s) => s.ch === 'E');
      this.tileCanvas = null;
    }

    tile(tx, ty) {
      if (tx < 0 || tx >= this.w) return '#';
      if (ty < 0) return '.';
      if (ty >= this.h) return '.';
      return this.rows[ty][tx];
    }
    setTile(tx, ty, ch) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
      this.rows[ty][tx] = ch;
      this.tileCanvas = null;
    }
    isSolid(tx, ty) {
      const ch = this.tile(tx, ty);
      if (ch === 'x') { const c = this.crumble.get(tx + ',' + ty); return !(c && c.gone); }
      return SOLID.has(ch);
    }
    isOneWay(tx, ty) { return this.tile(tx, ty) === '='; }

    // ---------------------------------------------------- physics
    // body: {x, y, w, h, vx, vy}. x,y = top-left. Returns collision flags.
    moveBody(b, dt, opts = {}) {
      const t = T();
      const res = { ground: false, wallL: false, wallR: false, ceil: false };
      // X axis
      b.x += b.vx * dt;
      if (b.vx !== 0 || true) {
        const top = Math.floor(b.y / t), bot = Math.floor((b.y + b.h - 0.01) / t);
        if (b.vx > 0 || opts.pushOut) {
          const tx = Math.floor((b.x + b.w) / t);
          for (let ty = top; ty <= bot; ty++) if (this.isSolid(tx, ty)) { b.x = tx * t - b.w; b.vx = Math.min(0, b.vx); res.wallR = true; break; }
        }
        if (b.vx < 0 || opts.pushOut) {
          const tx = Math.floor(b.x / t);
          for (let ty = top; ty <= bot; ty++) if (this.isSolid(tx, ty)) { b.x = (tx + 1) * t; b.vx = Math.max(0, b.vx); res.wallL = true; break; }
        }
      }
      // Y axis
      const prevBottom = b.y + b.h;
      b.y += b.vy * dt;
      const left = Math.floor(b.x / t), right = Math.floor((b.x + b.w - 0.01) / t);
      if (b.vy >= 0) {
        const ty = Math.floor((b.y + b.h) / t);
        for (let tx = left; tx <= right; tx++) {
          const solid = this.isSolid(tx, ty);
          const oneway = !opts.dropThrough && this.isOneWay(tx, ty) && prevBottom <= ty * t + 0.5;
          if (solid || oneway) {
            b.y = ty * t - b.h; b.vy = 0; res.ground = true;
            res.groundTile = [tx, ty];
            break;
          }
        }
      } else {
        const ty = Math.floor(b.y / t);
        for (let tx = left; tx <= right; tx++) if (this.isSolid(tx, ty)) { b.y = (ty + 1) * t; b.vy = 0; res.ceil = true; break; }
      }
      return res;
    }
    // Any solid tile overlapping a rectangle?
    rectSolid(x, y, w, h) {
      const t = T();
      for (let ty = Math.floor(y / t); ty <= Math.floor((y + h - 0.01) / t); ty++)
        for (let tx = Math.floor(x / t); tx <= Math.floor((x + w - 0.01) / t); tx++)
          if (this.isSolid(tx, ty)) return true;
      return false;
    }
    rectTouches(x, y, w, h, ch) {
      const t = T();
      for (let ty = Math.floor(y / t); ty <= Math.floor((y + h - 0.01) / t); ty++)
        for (let tx = Math.floor(x / t); tx <= Math.floor((x + w - 0.01) / t); tx++)
          if (this.tile(tx, ty) === ch) return [tx, ty];
      return null;
    }

    update(dt) {
      for (const [k, c] of this.crumble) {
        c.timer -= dt;
        if (!c.gone && c.timer <= 0) { c.gone = true; c.timer = 3.5; PM.Audio.sfx('crumble'); PM.Game && PM.Game.particles.burst(+k.split(',')[0] * T() + 16, +k.split(',')[1] * T() + 8, '#a0764a', 8); }
        else if (c.gone && c.timer <= 0) {
          const [tx, ty] = k.split(',').map(Number);
          const p = PM.Game && PM.Game.player;
          if (p && p.overlapsRect(tx * T(), ty * T(), T(), T())) { c.timer = 0.3; continue; }
          this.crumble.delete(k);
        }
      }
    }
    stepOn(tx, ty) {
      if (this.tile(tx, ty) !== 'x') return;
      const k = tx + ',' + ty;
      if (!this.crumble.has(k)) this.crumble.set(k, { timer: 0.45, gone: false });
    }

    // ---------------------------------------------------- drawing
    prerender() {
      const t = T(), Dr = D();
      const c = document.createElement('canvas');
      c.width = this.pxW; c.height = this.pxH;
      const g = c.getContext('2d');
      const theme = BIOME_THEMES[this.biome];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const ch = this.rows[y][x];
        const px = x * t, py = y * t, sd = x * 131 + y * 17;
        if (ch === '#') {
          g.fillStyle = theme.brick; g.fillRect(px, py, t, t);
          const r = Dr.rng(sd);
          g.strokeStyle = theme.mortar; g.lineWidth = 1.5;
          for (let row = 0; row < 2; row++) {
            g.beginPath(); g.moveTo(px, py + row * 16 + 16 + (r() - 0.5)); g.lineTo(px + t, py + row * 16 + 16 + (r() - 0.5)); g.stroke();
            const off = (row + y) % 2 ? 0 : 16;
            g.beginPath(); g.moveTo(px + off + (r() - 0.5) * 2, py + row * 16); g.lineTo(px + off + (r() - 0.5) * 2, py + row * 16 + 16); g.stroke();
          }
          if (r() < 0.25) { g.fillStyle = theme.brickSpot; g.fillRect(px + r() * 20 + 4, py + r() * 20 + 4, 5, 4); }
          const above = this.tile(x, y - 1), below = this.tile(x, y + 1), lft = this.tile(x - 1, y), rgt = this.tile(x + 1, y);
          g.strokeStyle = Dr.INK; g.lineWidth = 2.5; g.lineCap = 'round';
          const edge = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0 + (r() - 0.5) * 1.5, y0 + (r() - 0.5) * 1.5); g.lineTo(x1 + (r() - 0.5) * 1.5, y1 + (r() - 0.5) * 1.5); g.stroke(); };
          if (above !== '#') {
            edge(px, py, px + t, py);
            g.fillStyle = theme.top;
            g.beginPath(); g.moveTo(px, py - 1);
            for (let i = 0; i <= 4; i++) g.lineTo(px + i * 8, py + 4 + r() * 5);
            g.lineTo(px + t, py - 1); g.closePath(); g.fill();
            if (r() < 0.3) { g.fillStyle = theme.top; g.beginPath(); g.ellipse(px + r() * t, py + 8, 2, 4 + r() * 4, 0, 0, Math.PI * 2); g.fill(); }
          }
          if (below !== '#' && y < this.h - 1) edge(px, py + t, px + t, py + t);
          if (lft !== '#' && x > 0) edge(px, py, px, py + t);
          if (rgt !== '#' && x < this.w - 1) edge(px + t, py, px + t, py + t);
        } else if (ch === '=') {
          Dr.rect(g, px + 1, py + 2, t - 2, 9, sd, theme.ledge, 2, 0.5);
          g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1;
          for (let i = 6; i < t; i += 7) { g.beginPath(); g.moveTo(px + i, py + 3); g.lineTo(px + i, py + 10); g.stroke(); }
        } else if (ch === '^') {
          for (let i = 0; i < 3; i++) Dr.poly(g, [[px + 2 + i * 10, py + t], [px + 7 + i * 10, py + 12], [px + 12 + i * 10, py + t]], sd + i, '#a9a39b', 1.8, 0.6);
          g.fillStyle = 'rgba(150,70,30,0.5)'; g.fillRect(px + 4, py + t - 6, t - 8, 3);
        }
      }
      this.tileCanvas = c;
    }

    drawBackground(ctx, cam, time) {
      const theme = BIOME_THEMES[this.biome];
      theme.drawBg(ctx, cam, time, this);
    }

    drawTiles(ctx, cam, time) {
      if (!this.tileCanvas) this.prerender();
      const W = PM.CONFIG.WIDTH, H = PM.CONFIG.HEIGHT;
      const sx = Math.max(0, Math.floor(cam.x)), sy = Math.max(0, Math.floor(cam.y));
      const sw = Math.min(W + 1, this.pxW - sx), sh = Math.min(H + 1, this.pxH - sy);
      if (sw > 0 && sh > 0) ctx.drawImage(this.tileCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
      // dynamic tiles
      const t = T(), Dr = D();
      const x0 = Math.floor(cam.x / t) - 1, x1 = Math.ceil((cam.x + W) / t) + 1;
      const y0 = Math.max(0, Math.floor(cam.y / t) - 1), y1 = Math.min(this.h - 1, Math.ceil((cam.y + H) / t) + 1);
      for (let y = y0; y <= y1; y++) for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        const ch = this.rows[y][x], px = x * t, py = y * t, sd = x * 7 + y * 13;
        if (ch === '~') {
          const surf = this.tile(x, y - 1) !== '~';
          ctx.fillStyle = '#5f9a3a';
          ctx.beginPath();
          const top = surf ? py + 6 + Math.sin(time * 3 + x) * 2 : py;
          ctx.moveTo(px, top); ctx.quadraticCurveTo(px + 16, top + (surf ? Math.sin(time * 4 + x * 2) * 3 : 0), px + t, surf ? py + 6 + Math.sin(time * 3 + x + 1) * 2 : py);
          ctx.lineTo(px + t, py + t); ctx.lineTo(px, py + t); ctx.closePath(); ctx.fill();
          if (surf) {
            ctx.strokeStyle = '#2f5a1c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, top); ctx.quadraticCurveTo(px + 16, top + Math.sin(time * 4 + x * 2) * 3, px + t, py + 6 + Math.sin(time * 3 + x + 1) * 2); ctx.stroke();
            if ((x * 7 + Math.floor(time * 2)) % 9 === 0) Dr.blob(ctx, px + 16, py + 6 - ((time * 20) % 10), 3, 3, sd, '#8fce5a', 1.2);
          }
        } else if (ch === 'x') {
          const c = this.crumble.get(x + ',' + y);
          if (c && c.gone) continue;
          const shake = c ? (Math.random() - 0.5) * 3 : 0;
          Dr.rect(ctx, px + 1 + shake, py + 1, t - 2, 12, sd, '#b5864f', 2, 0.6);
          ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px + 6 + shake, py + 7); ctx.lineTo(px + 26 + shake, py + 6); ctx.stroke();
          Dr.dot(ctx, px + 5 + shake, py + 6, 1.5, '#555'); Dr.dot(ctx, px + 27 + shake, py + 6, 1.5, '#555');
        } else if (ch === 'B') {
          const theme = BIOME_THEMES[this.biome];
          Dr.rect(ctx, px + 1, py + 1, t - 2, t - 2, sd, theme.brick, 2.2, 0.8);
          Dr.line(ctx, [[px + 8, py + 4], [px + 14, py + 14], [px + 10, py + 20], [px + 18, py + 28]], sd + 1, 1.6, '#2a2a2a', 0.5);
          Dr.line(ctx, [[px + 14, py + 14], [px + 24, py + 12]], sd + 2, 1.4, '#2a2a2a', 0.5);
        } else if (ch === 'C') {
          Dr.rect(ctx, px + 2, py + 2, t - 4, t - 4, sd, '#c4965a', 2.4, 0.8);
          Dr.line(ctx, [[px + 4, py + 4], [px + 28, py + 28]], sd + 1, 2, '#7a5530'); Dr.line(ctx, [[px + 28, py + 4], [px + 4, py + 28]], sd + 2, 2, '#7a5530');
        } else if (ch === 'E') {
          drawExit(ctx, px, py, time, this.biome);
        }
      }
    }
  }

  function drawExit(ctx, px, py, time, biome) {
    const Dr = D();
    // a big round pipe opening with daylight-ish glow, 2 tiles tall
    const cx = px + 16, cy = py - 16;
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(time * 3) * 0.15;
    Dr.blob(ctx, cx, cy, 38, 38, 901, '#fff6b0', 0);
    ctx.restore();
    Dr.blob(ctx, cx, cy, 28, 30, 902, '#8a949a', 3);
    Dr.blob(ctx, cx, cy, 20, 22, 903, '#ffe9a0', 2);
    Dr.poly(ctx, [[cx - 8, cy + 6], [cx, cy - 8], [cx + 8, cy + 6]], 904, '#e8893a', 2);
    Dr.text(ctx, 'EXIT', cx, cy - 36, { align: 'center', size: 14, color: '#fff6b0', outline: 4 });
  }

  // ---------------------------------------------------- biome themes
  function sewerBg(ctx, cam, time, level) {
    const W = PM.CONFIG.WIDTH, H = PM.CONFIG.HEIGHT, Dr = D();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d2b33'); g.addColorStop(1, '#2d3d38');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // far arches
    const far = cam.x * 0.25;
    ctx.fillStyle = '#26363d';
    for (let i = Math.floor(far / 240) - 1; i < Math.floor(far / 240) + 6; i++) {
      const x = i * 240 - far;
      ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x, 160); ctx.quadraticCurveTo(x + 120, 30, x + 240, 160); ctx.lineTo(x + 240, H);
      ctx.lineTo(x + 210, H); ctx.lineTo(x + 210, 190); ctx.quadraticCurveTo(x + 120, 90, x + 30, 190); ctx.lineTo(x + 30, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // mid pipes
    const mid = cam.x * 0.5;
    for (let i = Math.floor(mid / 380) - 1; i < Math.floor(mid / 380) + 4; i++) {
      const x = i * 380 - mid, r = Dr.rng(i * 77 + 3);
      const py = 90 + r() * 140;
      ctx.fillStyle = '#3a4a4e'; ctx.fillRect(x, py, 300, 26);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(x, py, 300, 26);
      ctx.fillStyle = '#33433f'; ctx.fillRect(x + 260, py - 4, 16, 34);
      if (r() < 0.6) { ctx.fillStyle = '#3a4a4e'; ctx.fillRect(x + 40, py + 26, 22, H); ctx.strokeRect(x + 40, py + 26, 22, H); }
      // drip from pipe
      const dy = ((time * 90 + i * 50) % 220);
      ctx.fillStyle = 'rgba(120,180,90,0.5)';
      ctx.beginPath(); ctx.ellipse(x + 150, py + 30 + dy, 2.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    // light shafts
    ctx.save(); ctx.globalAlpha = 0.06;
    for (let i = 0; i < 3; i++) {
      const x = ((i * 420 - cam.x * 0.35) % 1260 + 1260) % 1260 - 150;
      ctx.fillStyle = '#e6f2c0';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 70, 0); ctx.lineTo(x + 200, H); ctx.lineTo(x + 90, H); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  const BIOME_THEMES = [
    { name: 'Sewer', brick: '#566a6b', mortar: '#3e4e4f', brickSpot: '#4a5c56', top: '#6f8f4a', ledge: '#7d8a93', drawBg: sewerBg },
  ];
  PM.BIOMES = [
    { name: 'The Sewer', boss: 'The Rat King' },
    { name: 'The Wasteland', boss: 'The Giant Flea' },
    { name: 'The Tall Trees', boss: 'The Bird Queen' },
    { name: 'The Swamp', boss: 'The Serpent' },
    { name: 'The Dirt Tunnels', boss: 'The Mole Queen' },
  ];

  PM.Level = Level;
  PM.drawExit = drawExit;
})();
