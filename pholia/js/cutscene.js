// Comic-book cutscenes: pages of 1-3 panels with captions and speech bubbles.
(function () {
  const D = () => PM.Draw;
  const W = () => PM.CONFIG.WIDTH, H = () => PM.CONFIG.HEIGHT;

  const NAMES = { molequeen: 'The Mole Queen', ratking: 'The Rat King' };
  const CAT_IDS = ['pholia', 'clyde', 'bobby', 'bandit', 'tommy', 'chalice'];

  // ------------------------------------------------------------ scene painters
  function sky(ctx, w, h, top, bot) { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bot); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  function ground(ctx, w, h, y, color, sd) { D().poly(ctx, [[-10, y], [w * 0.3, y - 6], [w * 0.7, y + 4], [w + 10, y - 2], [w + 10, h + 10], [-10, h + 10]], sd, color, 2.5, 2); }
  function house(ctx, x, y, s, color, sd) {
    const Dr = D();
    Dr.rect(ctx, x - 40 * s, y - 60 * s, 80 * s, 60 * s, sd, color, 2.5);
    Dr.poly(ctx, [[x - 52 * s, y - 58 * s], [x, y - 100 * s], [x + 52 * s, y - 58 * s]], sd + 1, '#c0583e', 2.5);
    Dr.blob(ctx, x, y - 18 * s, 13 * s, 18 * s, sd + 2, '#6b4a2a', 2);
    // little ears on the roof
    Dr.poly(ctx, [[x - 22 * s, y - 80 * s], [x - 16 * s, y - 98 * s], [x - 8 * s, y - 86 * s]], sd + 3, '#c0583e', 2);
    Dr.poly(ctx, [[x + 8 * s, y - 86 * s], [x + 16 * s, y - 98 * s], [x + 22 * s, y - 80 * s]], sd + 4, '#c0583e', 2);
  }
  function sun(ctx, x, y, r) { D().blob(ctx, x, y, r, r, 5, '#ffe58a', 2.5); }
  function sewerBack(ctx, w, h) {
    sky(ctx, w, h, '#1d2b33', '#2d3d38');
    ctx.fillStyle = '#26363d';
    for (let i = 0; i < 4; i++) { const x = i * 160 - 20; ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x, h * 0.4); ctx.quadraticCurveTo(x + 80, h * 0.05, x + 160, h * 0.4); ctx.lineTo(x + 160, h); ctx.lineTo(x + 140, h); ctx.lineTo(x + 140, h * 0.48); ctx.quadraticCurveTo(x + 80, h * 0.2, x + 20, h * 0.48); ctx.lineTo(x + 20, h); ctx.fill(); }
    ground(ctx, w, h, h * 0.82, '#566a6b', 7);
  }
  function caveBack(ctx, w, h) {
    sky(ctx, w, h, '#2a1d22', '#3d2a26');
    for (let i = 0; i < 9; i++) D().poly(ctx, [[i * w / 8 - 20, -5], [i * w / 8 + 20, -5], [i * w / 8 + 4, 30 + (i % 3) * 20]], 40 + i, '#4a342c', 2);
  }

  const SCENES = {
    village(ctx, w, h, t) {
      sky(ctx, w, h, '#9fd4f0', '#e8f4d8'); sun(ctx, w - 70, 60, 32);
      D().blob(ctx, 120, 70, 50, 18, 3, '#fff', 2); D().blob(ctx, 300, 50, 40, 14, 4, '#fff', 2);
      ground(ctx, w, h, h * 0.75, '#8fc66a', 1);
      house(ctx, 80, h * 0.76, 0.9, '#f1d8a8', 10); house(ctx, w - 90, h * 0.76, 1, '#d8c4e8', 20);
      const y = h * 0.86;
      D().cat(ctx, w * 0.28, y, 'tommy', { pose: 'duck', eyes: 'closed', t, scale: 1.1 });
      D().cat(ctx, w * 0.44, y, 'bobby', { pose: 'sit', t, facing: -1, scale: 1.1 });
      D().cat(ctx, w * 0.58, y, 'clyde', { pose: 'sit', t, scale: 1.1 });
      D().cat(ctx, w * 0.72, y, 'bandit', { pose: 'sit', t, facing: -1, scale: 1.1 });
      D().cat(ctx, w * 0.16, y + 8, 'chalice', { pose: 'sit', t, scale: 1.05 });
      if (Math.sin(t * 2) > 0) D().text(ctx, 'z', w * 0.28 + 30, y - 40 - (t * 10 % 20), { size: 22, color: '#555' });
    },
    village2(ctx, w, h, t) {
      sky(ctx, w, h, '#9fd4f0', '#e8f4d8');
      ground(ctx, w, h, h * 0.7, '#8fc66a', 2);
      const dx = Math.sin(t * 3) * 60;
      D().dot(ctx, w * 0.7 + dx, h * 0.78, 6, '#ff2a2a');
      ctx.globalAlpha = 0.3; D().dot(ctx, w * 0.7 + dx, h * 0.78, 12, '#ff2a2a'); ctx.globalAlpha = 1;
      D().cat(ctx, w * 0.45 + dx * 0.5, h * 0.88, 'pholia', { pose: 'run', t, scale: 1.8 });
      D().cat(ctx, w * 0.16, h * 0.88, 'bobby', { pose: 'sit', t, scale: 1.5, eyes: 'closed' });
    },
    quake(ctx, w, h, t) {
      ctx.save(); ctx.translate(Math.sin(t * 40) * 4, Math.cos(t * 37) * 3); ctx.rotate(Math.sin(t * 8) * 0.03);
      SCENES.village(ctx, w, h, t);
      ctx.restore();
      D().line(ctx, [[w * 0.2, h], [w * 0.3, h * 0.85], [w * 0.4, h * 0.9], [w * 0.5, h * 0.8], [w * 0.62, h * 0.88], [w * 0.8, h * 0.78]], 9, 5, '#2a1d14', 3);
      D().text(ctx, 'RUMBLE', w / 2, h * 0.38, { size: 54, color: '#f5c542', outline: 7, align: 'center' });
    },
    fall(ctx, w, h, t) {
      sky(ctx, w, h, '#3a2a22', '#120c0a');
      D().poly(ctx, [[0, 0], [w, 0], [w * 0.8, 40], [w * 0.2, 40]], 3, '#8fc66a', 2.5);
      const cats = ['pholia', 'clyde', 'bobby', 'bandit', 'tommy'];
      cats.forEach((c, i) => {
        ctx.save(); ctx.translate(w * (0.15 + i * 0.18), h * (0.3 + (i % 2) * 0.3) + Math.sin(t * 2 + i) * 6); ctx.rotate(t * (i % 2 ? 2 : -2) + i);
        D().cat(ctx, 0, 20, c, { pose: 'jump', t, scale: 1.1 });
        ctx.restore();
      });
      for (let i = 0; i < 12; i++) D().line(ctx, [[i * w / 11, h * 0.2 + (i % 3) * 30], [i * w / 11, h * 0.2 + (i % 3) * 30 - 30]], 20 + i, 1.5, 'rgba(255,255,255,0.4)');
    },
    moleScreen(ctx, w, h, t) {
      caveBack(ctx, w, h);
      D().rect(ctx, w * 0.08, h * 0.55, w * 0.3, h * 0.45, 30, '#7d3b5c', 2.5);
      D().moleQueen(ctx, w * 0.24, h * 0.75, { t, facing: 1, scale: 1.4 });
      D().rect(ctx, w * 0.52, h * 0.15, w * 0.42, h * 0.5, 31, '#1b2a2a', 3);
      D().rect(ctx, w * 0.55, h * 0.2, w * 0.36, h * 0.4, 32, '#2f6b55', 2);
      ctx.save(); ctx.beginPath(); ctx.rect(w * 0.55, h * 0.2, w * 0.36, h * 0.4); ctx.clip();
      D().ratKing(ctx, w * 0.66, h * 0.62, { t, facing: 1 });
      ctx.globalAlpha = 0.15; for (let y = 0; y < h; y += 6) { ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.55, h * 0.2 + y + (t * 30 % 6), w * 0.36, 2); }
      ctx.restore();
      D().line(ctx, [[w * 0.73, h * 0.65], [w * 0.73, h * 0.8]], 34, 4);
    },
    sewerWake(ctx, w, h, t) {
      sewerBack(ctx, w, h);
      D().cat(ctx, w * 0.45, h * 0.83, 'pholia', { pose: 'duck', eyes: 'closed', t, scale: 2 });
      for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1; D().text(ctx, '★', w * 0.5 + Math.cos(a) * 40, h * 0.5 + Math.sin(a) * 10, { size: 20, color: '#f5d75c', outline: 3 }); }
    },
    walkie(ctx, w, h, t) {
      sewerBack(ctx, w, h);
      D().catFace(ctx, w * 0.35, h * 0.5, 80, 'pholia');
      ctx.save(); ctx.globalAlpha = 0.4 + Math.sin(t * 8) * 0.3; D().blob(ctx, w * 0.72, h * 0.5, 60, 70, 9, '#5ab8ff', 0); ctx.restore();
      D().item(ctx, 'walkie', w * 0.72, h * 0.55, 4.5, t);
    },
    ratKingDown(ctx, w, h, t) {
      sewerBack(ctx, w, h);
      ctx.save(); ctx.translate(w * 0.5, h * 0.82); ctx.rotate(-0.25);
      D().ratKing(ctx, 0, 0, { t, facing: 1, dizzy: true });
      ctx.restore();
      D().trap(ctx, w * 0.75, h * 0.83, { snapped: true });
    },
    clydeCage(ctx, w, h, t) {
      sewerBack(ctx, w, h);
      D().cat(ctx, w * 0.5, h * 0.8, 'clyde', { pose: 'sit', t, scale: 1.9, facing: -1 });
      for (let i = 0; i < 7; i++) D().line(ctx, [[w * 0.3 + i * w * 0.067, h * 0.2], [w * 0.3 + i * w * 0.067, h * 0.82]], 60 + i, 4, '#9aa3ad');
      D().rect(ctx, w * 0.28, h * 0.17, w * 0.44, 12, 70, '#9aa3ad', 2.5);
      D().rect(ctx, w * 0.28, h * 0.8, w * 0.44, 12, 71, '#9aa3ad', 2.5);
      D().blob(ctx, w * 0.2, h * 0.8, 20, 12, 72, '#f6d55c', 2);
    },
    clydeFree(ctx, w, h, t) {
      sewerBack(ctx, w, h);
      D().cat(ctx, w * 0.38, h * 0.85, 'pholia', { pose: 'stand', t, scale: 1.9, eyes: 'happy' });
      D().cat(ctx, w * 0.66, h * 0.85, 'clyde', { pose: 'stand', t, scale: 1.9, facing: -1, eyes: 'happy' });
      D().text(ctx, '♥', w * 0.52, h * 0.35 - Math.sin(t * 3) * 6, { size: 40, color: '#e2475b', outline: 4, align: 'center' });
    },
    toWasteland(ctx, w, h, t) {
      sky(ctx, w, h, '#f3c27a', '#f7e3b5'); sun(ctx, w * 0.8, h * 0.25, 40);
      ground(ctx, w, h, h * 0.7, '#d39a5a', 3);
      for (let i = 0; i < 4; i++) D().poly(ctx, [[i * w / 4 + 40, h * 0.7], [i * w / 4 + 70, h * 0.48], [i * w / 4 + 100, h * 0.7]], 50 + i, '#b97a44', 2);
      D().rect(ctx, w * 0.12, h * 0.62, 70, 60, 77, '#6f7d80', 2.5);
      D().blob(ctx, w * 0.12 + 35, h * 0.62, 35, 10, 78, '#2b2522', 2);
      D().cat(ctx, w * 0.32, h * 0.75, 'pholia', { pose: 'stand', t, scale: 1.4 });
      D().cat(ctx, w * 0.22, h * 0.75, 'clyde', { pose: 'stand', t, scale: 1.4 });
    },
  };

  // ------------------------------------------------------------ player
  class Cutscene {
    constructor(pages, onDone) {
      this.pages = pages; this.onDone = onDone;
      this.page = 0; this.shown = 1; this.chars = 0; this.t = 0; this.pageT = 0;
      this.finished = false;
    }
    panelText(p) { return (p.caption || '') + (p.speech || []).map((s) => s.text).join(''); }
    update(dt) {
      const inp = PM.Input;
      this.t += dt; this.pageT += dt;
      this.chars += dt * 55;
      if (inp.pressed('pause')) return this.finish();
      if (inp.pressed('confirm')) {
        const pg = this.pages[this.page];
        const curLen = this.panelText(pg[this.shown - 1]).length;
        if (this.chars < curLen) { this.chars = 9999; return; }
        PM.Audio.sfx('move');
        if (this.shown < pg.length) { this.shown++; this.chars = 0; }
        else if (this.page < this.pages.length - 1) { this.page++; this.shown = 1; this.chars = 0; this.pageT = 0; }
        else this.finish();
      }
    }
    finish() { if (this.finished) return; this.finished = true; this.onDone && this.onDone(); }
    draw(ctx) {
      const Dr = D(), w = W(), h = H();
      ctx.fillStyle = '#f3e7cf'; ctx.fillRect(0, 0, w, h);
      const pg = this.pages[this.page];
      const n = pg.length, m = 18, gap = 16;
      const pw = (w - m * 2 - gap * (n - 1)) / n, ph = h - m * 2 - 22;
      pg.forEach((p, i) => {
        const x = m + i * (pw + gap), y = m;
        if (i >= this.shown) { Dr.rect(ctx, x, y, pw, ph, 210 + i, 'rgba(255,255,255,0.35)', 2.5, 1.2); Dr.text(ctx, '...', x + pw / 2, y + ph / 2, { size: 40, align: 'center', color: '#c8b8a0' }); return; }
        Dr.rect(ctx, x + 5, y + 6, pw, ph, 200 + i, 'rgba(0,0,0,0.25)', 0);
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, pw, ph); ctx.clip();
        ctx.translate(x, y);
        (SCENES[p.scene] || (() => {}))(ctx, pw, ph, this.t);
        ctx.restore();
        Dr.rect(ctx, x, y, pw, ph, 210 + i, null, 4, 1.2);
        // text
        const isCur = i === this.shown - 1;
        let budget = isCur ? this.chars : 9999;
        if (p.caption) {
          const txt = p.caption.slice(0, Math.max(0, budget)); budget -= p.caption.length;
          const lines = Dr.wrap(ctx, p.caption, pw - 40, 17);
          Dr.rect(ctx, x + 10, y + 10, pw - 20, 14 + lines.length * 21, 220 + i, '#ffe58a', 2.5, 0.8);
          let shownTxt = txt;
          lines.forEach((l, li) => { const part = shownTxt.slice(0, l.length); shownTxt = shownTxt.slice(l.length + 1); Dr.text(ctx, part, x + 20, y + 31 + li * 21, { size: 17 }); });
        }
        let by = y + ph - 10;
        const speech = (p.speech || []).map((s) => {
          const t = s.text.slice(0, Math.max(0, budget)); budget -= s.text.length; return { ...s, shownText: t };
        });
        for (let si = speech.length - 1; si >= 0; si--) {
          const s = speech[si];
          if (!s.shownText.length) { by -= 0; continue; }
          const lines = Dr.wrap(ctx, s.text, pw - 110, 17);
          const bh = 32 + lines.length * 21;
          by -= bh + 8;
          const bx = x + 12, bw = pw - 24;
          Dr.panel(ctx, bx, by, bw, bh, 230 + si, '#ffffff');
          if (CAT_IDS.includes(s.who)) Dr.catFace(ctx, bx + 34, by + bh / 2 + 4, 21, s.who, { mood: s.who === 'bobby' ? 'sassy' : 'normal' });
          else { Dr.blob(ctx, bx + 34, by + bh / 2 + 2, 22, 22, 240, s.who === 'molequeen' ? '#5a3d5c' : '#7d7378', 2); Dr.text(ctx, s.who === 'molequeen' ? '♛' : '♚', bx + 34, by + bh / 2 + 10, { size: 22, color: '#f5c542', align: 'center' }); }
          const name = (PM.STORY.friends[s.who] || {}).name || NAMES[s.who] || s.who;
          Dr.text(ctx, name, bx + 66, by + 20, { size: 14, color: (PM.STORY.friends[s.who] || {}).color || '#7d3b5c' });
          let rest = s.shownText;
          lines.forEach((l, li) => { const part = rest.slice(0, l.length); rest = rest.slice(l.length + 1); Dr.text(ctx, part, bx + 66, by + 41 + li * 21, { size: 17 }); });
        }
      });
      Dr.text(ctx, 'ENTER / SPACE: continue     ESC: skip', w - 20, h - 10, { size: 14, align: 'right', color: '#7a6a5a' });
    }
  }

  PM.Cutscene = Cutscene;
  PM.SCENES = SCENES;
})();
