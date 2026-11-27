// Hand-drawn style art. Everything is drawn with slightly wobbly lines that
// "boil" (re-jitter) a few times per second, like a hand-animated cartoon.
(function () {
  const INK = '#3a2a22';
  const FONT_SCALE = 1.12; // the handwritten font runs small
  let boilFrame = 0;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(...n) {
    let h = 2166136261;
    for (const v of n) { h ^= (v * 1000) | 0; h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const J = (r, amp) => (r() - 0.5) * 2 * amp;

  // Closed wobbly blob shaped like an ellipse
  function blobPath(ctx, cx, cy, rx, ry, seed, amp = 1.2, n = 12) {
    const r = rng(hash(seed, boilFrame));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx + J(r, amp), cy + Math.sin(a) * ry + J(r, amp)]);
    }
    smoothClosed(ctx, pts);
  }
  function smoothClosed(ctx, pts) {
    ctx.beginPath();
    const n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(pts[n - 1], pts[0]);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], m = mid(p, pts[(i + 1) % n]);
      ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    ctx.closePath();
  }
  function polyPath(ctx, pts, seed, amp = 1, closed = true) {
    const r = rng(hash(seed, boilFrame));
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = p[0] + J(r, amp), y = p[1] + J(r, amp);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    if (closed) ctx.closePath();
  }
  function fillStroke(ctx, fill, lw = 2.2, stroke = INK) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  function blob(ctx, cx, cy, rx, ry, seed, fill, lw, amp) {
    blobPath(ctx, cx, cy, rx, ry, seed, amp);
    fillStroke(ctx, fill, lw);
  }
  function poly(ctx, pts, seed, fill, lw, amp) {
    polyPath(ctx, pts, seed, amp);
    fillStroke(ctx, fill, lw);
  }
  function line(ctx, pts, seed, lw = 2.2, color = INK, amp = 0.8) {
    polyPath(ctx, pts, seed, amp, false);
    ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
  }
  function curve(ctx, x0, y0, cx, cy, x1, y1, seed, lw = 2.2, color = INK) {
    const r = rng(hash(seed, boilFrame));
    ctx.beginPath();
    ctx.moveTo(x0 + J(r, 0.7), y0 + J(r, 0.7));
    ctx.quadraticCurveTo(cx + J(r, 1.2), cy + J(r, 1.2), x1 + J(r, 0.7), y1 + J(r, 0.7));
    ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.stroke();
  }
  function rect(ctx, x, y, w, h, seed, fill, lw = 2.2, amp = 1) {
    poly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], seed, fill, lw, amp);
  }
  function dot(ctx, x, y, r, color) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }

  // ---------------------------------------------------------------- CATS
  const CATS = {
    pholia: { base: '#fbf6ec', patches: [['#e8893a', -8, -22, 9, 7], ['#2b2522', 6, -14, 7, 6], ['#2b2522', 18, -36, 6, 5], ['#e8893a', 12, -28, 6, 5], ['#e8893a', -20, -30, 5, 6]], tail: '#e8893a', eye: '#6fae3f', ear: '#f4b3b0' },
    clyde: { base: '#f0a04b', stripes: '#d0742a', tail: '#f0a04b', eye: '#4a8a3f', ear: '#f4b3b0' },
    bobby: { base: '#a89a86', stripes: '#5e5245', tail: '#a89a86', eye: '#d8a530', ear: '#e9a7a3' },
    bandit: { base: '#25211f', chest: '#fbf6ec', tail: '#25211f', eye: '#e6c84a', ear: '#c98e8b', whitePaws: true },
    tommy: { base: '#2f2622', patches: [['#c8702e', -10, -20, 8, 6], ['#9a4f24', 8, -16, 7, 5], ['#c8702e', 16, -32, 6, 5], ['#c8702e', -2, -12, 6, 4]], tail: '#2f2622', eye: '#d8a530', ear: '#c98e8b' },
    chalice: { base: '#1d1a1c', tail: '#1d1a1c', eye: '#f1d23a', ear: '#7d5a63', shine: true },
  };

  // Side-view cat. (x, y) = point between the feet. Faces right when facing = 1.
  function cat(ctx, x, y, who, o = {}) {
    const c = CATS[who] || CATS.pholia;
    const facing = o.facing || 1, s = o.scale || 1, t = o.t || 0, pose = o.pose || 'stand';
    const sd = (o.seed || who.length * 31) * 7;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing * s, s);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;

    let bodyY = -18, bodyRx = 18, bodyRy = 11, headX = 17, headY = -31;
    let legSwing = 0, tailWave = Math.sin(t * 3) * 4;
    if (pose === 'run') { legSwing = Math.sin(t * 18) * 7; bodyY += Math.abs(Math.sin(t * 18)) * -2; }
    if (pose === 'duck') { bodyY = -10; bodyRy = 8; bodyRx = 20; headY = -17; headX = 19; }
    if (pose === 'jump') { legSwing = 5; }
    if (pose === 'fall') { legSwing = -4; }
    if (pose === 'dash') { bodyRx = 22; bodyRy = 9; headX = 21; legSwing = 9; tailWave = -6; }
    if (pose === 'sit') { bodyY = -16; bodyRx = 13; bodyRy = 14; headX = 9; headY = -34; }

    // tail
    const tailPts = pose === 'sit'
      ? [-10, -6, -28, -4, -26, -18]
      : [-bodyRx + 2, bodyY - 2, -bodyRx - 14, bodyY - 6 + tailWave, -bodyRx - 10, bodyY - 24 + tailWave];
    curve(ctx, tailPts[0], tailPts[1], tailPts[2], tailPts[3], tailPts[4], tailPts[5], sd + 1, 7.5, INK);
    curve(ctx, tailPts[0], tailPts[1], tailPts[2], tailPts[3], tailPts[4], tailPts[5], sd + 1, 4.5, c.tail);
    if (c.stripes) {
      dot(ctx, tailPts[4], tailPts[5], 2.4, c.stripes);
    }

    // legs (back pair darker behind body)
    const legColor = c.whitePaws ? c.base : c.base;
    const pawColor = c.whitePaws ? '#fbf6ec' : c.base;
    if (pose !== 'sit') {
      const legs = [[-11, -legSwing], [11, legSwing], [-7, legSwing], [14, -legSwing]];
      const ly = pose === 'duck' ? -4 : -10;
      legs.forEach(([lx, sw], i) => {
        const back = i < 2;
        const fx = lx + sw * (pose === 'jump' ? 0.5 : 1), fy = pose === 'jump' ? -4 : 0;
        line(ctx, [[lx, bodyY + 4], [fx, fy + ly + 8]], sd + 10 + i, 7.5, INK);
        line(ctx, [[lx, bodyY + 4], [fx, fy + ly + 8]], sd + 10 + i, 4.5, back ? shade(legColor, -18) : legColor);
        dot(ctx, fx, fy + ly + 8, 2.6, pawColor);
      });
    } else {
      blob(ctx, 6, -3, 5, 3.5, sd + 14, c.whitePaws ? '#fbf6ec' : c.base, 1.8);
      blob(ctx, 13, -3, 5, 3.5, sd + 15, c.whitePaws ? '#fbf6ec' : c.base, 1.8);
    }

    // body
    ctx.save();
    blobPath(ctx, 0, bodyY, bodyRx, bodyRy, sd + 2);
    ctx.fillStyle = c.base; ctx.fill();
    ctx.clip();
    if (c.chest) blob(ctx, 12, bodyY + 4, 9, 9, sd + 3, c.chest, 0);
    (c.patches || []).filter((p) => p[2] > -26).forEach((p, i) => {
      if (p[2] < -26) return;
      blob(ctx, p[1], p[2] - (-18 - bodyY), p[3], p[4], sd + 20 + i, p[0], 0, 1.5);
    });
    if (c.stripes) for (let i = -2; i <= 2; i++) curve(ctx, i * 6, bodyY - bodyRy, i * 6 + 3, bodyY - 3, i * 6, bodyY + 2, sd + 30 + i, 2.6, c.stripes);
    if (c.shine) curve(ctx, -8, bodyY - 7, 0, bodyY - 10, 8, bodyY - 8, sd + 4, 2, '#4b4450');
    ctx.restore();
    blobPath(ctx, 0, bodyY, bodyRx, bodyRy, sd + 2);
    fillStroke(ctx, null, 2.4);

    // head
    const ear = (dx) => poly(ctx, [[headX + dx - 6, headY - 6], [headX + dx - 2, headY - 17], [headX + dx + 4, headY - 7]], sd + 40 + dx, c.base, 2.2, 0.6);
    ear(-4); ear(6);
    poly(ctx, [[headX + 4, headY - 7.5], [headX + 4.8, headY - 13], [headX + 7.5, headY - 8]], sd + 44, c.ear, 0, 0.3);
    ctx.save();
    blobPath(ctx, headX, headY, 11, 10, sd + 5);
    ctx.fillStyle = c.base; ctx.fill(); ctx.clip();
    (c.patches || []).filter((p) => p[2] <= -26).forEach((p, i) => blob(ctx, p[1], p[2], p[3], p[4], sd + 50 + i, p[0], 0, 1.5));
    if (c.chest) blob(ctx, headX + 7, headY + 7, 6, 5, sd + 6, c.chest, 0);
    if (c.stripes) { curve(ctx, headX - 4, headY - 10, headX - 3, headY - 5, headX - 4, headY - 1, sd + 7, 2.2, c.stripes); curve(ctx, headX + 1, headY - 10, headX + 2, headY - 6, headX + 1, headY - 2, sd + 8, 2.2, c.stripes); }
    ctx.restore();
    blobPath(ctx, headX, headY, 11, 10, sd + 5);
    fillStroke(ctx, null, 2.4);

    // face
    const ex = headX + 5, ey = headY - 1;
    if (o.eyes === 'closed' || o.eyes === 'happy' || pose === 'hurt') {
      curve(ctx, ex - 3, ey + (o.eyes === 'happy' ? 1 : 0), ex, ey + (o.eyes === 'happy' ? -2 : 2), ex + 3, ey + (o.eyes === 'happy' ? 1 : 0), sd + 60, 1.8);
    } else if (o.eyes === 'x') {
      line(ctx, [[ex - 2.5, ey - 2.5], [ex + 2.5, ey + 2.5]], sd + 61, 1.8); line(ctx, [[ex + 2.5, ey - 2.5], [ex - 2.5, ey + 2.5]], sd + 62, 1.8);
    } else {
      blob(ctx, ex, ey, 3.2, 3.8, sd + 63, c.eye, 1.4, 0.3);
      dot(ctx, ex + 0.8, ey, 1.6, '#111');
      dot(ctx, ex + 1.4, ey - 1.4, 0.8, '#fff');
    }
    dot(ctx, headX + 10.5, headY + 3, 1.8, '#e58a8a');
    curve(ctx, headX + 7, headY + 6, headX + 9, headY + 8, headX + 10.5, headY + 5.5, sd + 64, 1.4);
    line(ctx, [[headX + 9, headY + 4], [headX + 18, headY + 2]], sd + 65, 1, INK, 0.4);
    line(ctx, [[headX + 9, headY + 5.5], [headX + 18, headY + 7]], sd + 66, 1, INK, 0.4);

    if (o.hat) hat(ctx, headX - 1, headY - 9, o.hat, sd);
    if (o.scuba) blob(ctx, headX + 2, headY, 14, 13, sd + 70, 'rgba(160,220,255,0.35)', 2);
    ctx.restore();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const cl = (v) => Math.max(0, Math.min(255, v + amt));
    return `rgb(${cl(n >> 16)},${cl((n >> 8) & 255)},${cl(n & 255)})`;
  }

  // Front-facing cat head, used for walkie-talkie portraits & shop
  function catFace(ctx, x, y, r, who, o = {}) {
    const c = CATS[who] || CATS.pholia;
    const sd = who.length * 53;
    ctx.save(); ctx.translate(x, y); ctx.scale(r / 20, r / 20);
    poly(ctx, [[-19, -6], [-15, -26], [-4, -16]], sd + 1, c.base, 2.4, 0.6);
    poly(ctx, [[19, -6], [15, -26], [4, -16]], sd + 2, c.base, 2.4, 0.6);
    poly(ctx, [[-16, -10], [-14.5, -21], [-8, -15]], sd + 3, c.ear, 0, 0.4);
    poly(ctx, [[16, -10], [14.5, -21], [8, -15]], sd + 4, c.ear, 0, 0.4);
    ctx.save();
    blobPath(ctx, 0, 0, 20, 17, sd + 5);
    ctx.fillStyle = c.base; ctx.fill(); ctx.clip();
    if (who === 'pholia') { blob(ctx, -11, -8, 10, 9, sd + 6, '#e8893a', 0); blob(ctx, 12, -10, 8, 7, sd + 7, '#2b2522', 0); }
    if (who === 'tommy') { blob(ctx, -10, -6, 9, 8, sd + 6, '#c8702e', 0); blob(ctx, 9, 4, 7, 6, sd + 7, '#9a4f24', 0); }
    if (c.chest) { poly(ctx, [[0, -6], [-11, 18], [11, 18]], sd + 8, c.chest, 0, 1); }
    if (c.stripes) for (const dx of [-6, 0, 6]) curve(ctx, dx, -17, dx + 1, -12, dx, -7, sd + 9 + dx, 2.6, c.stripes);
    ctx.restore();
    blobPath(ctx, 0, 0, 20, 17, sd + 5); fillStroke(ctx, null, 2.6);
    const mood = o.mood || 'normal';
    for (const s of [-1, 1]) {
      const ex = s * 7.5, ey = -1;
      if (mood === 'happy') curve(ctx, ex - 3.5, ey + 1, ex, ey - 3, ex + 3.5, ey + 1, sd + 10 + s, 2);
      else if (mood === 'sassy') { blob(ctx, ex, ey, 3.8, 3, sd + 11 + s, c.eye, 1.5, 0.3); dot(ctx, ex, ey + 0.5, 1.5, '#111'); line(ctx, [[ex - 4.5, ey - 3.2], [ex + 4.5, ey - 3.2]], sd + 12 + s, 2); }
      else { blob(ctx, ex, ey, 3.8, 4.5, sd + 11 + s, c.eye, 1.5, 0.3); dot(ctx, ex, ey + 0.5, 1.9, '#111'); dot(ctx, ex + 1, ey - 1.5, 0.9, '#fff'); }
    }
    poly(ctx, [[-2.2, 5], [2.2, 5], [0, 7.5]], sd + 13, '#e58a8a', 1.2, 0.2);
    curve(ctx, -4, 9.5, -2, 11.5, 0, 8, sd + 14, 1.5); curve(ctx, 0, 8, 2, 11.5, 4, 9.5, sd + 15, 1.5);
    for (const s of [-1, 1]) {
      line(ctx, [[s * 8, 7], [s * 22, 4]], sd + 16 + s, 1.1, INK, 0.5);
      line(ctx, [[s * 8, 9], [s * 22, 10]], sd + 18 + s, 1.1, INK, 0.5);
    }
    if (o.hat) hat(ctx, 0, -16, o.hat, sd, true);
    ctx.restore();
  }

  // ---------------------------------------------------------------- HATS
  const HATS = {
    hardhat: { name: 'Hard Hat', color: '#f2c230' },
    beanie: { name: 'Cozy Beanie', color: '#6d8fd6' },
    tophat: { name: 'Fancy Top Hat', color: '#2c2830' },
    crown: { name: 'Paper Crown', color: '#f5d75c' },
    bow: { name: 'Big Bow', color: '#e46a8d' },
  };
  function hat(ctx, x, y, kind, sd, front) {
    const h = HATS[kind]; if (!h) return;
    const w = front ? 1.4 : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(w, w);
    if (kind === 'hardhat') { blob(ctx, 0, -2, 11, 7, sd + 80, h.color, 2); rect(ctx, -14, 1, 28, 3, sd + 81, h.color, 2); }
    else if (kind === 'beanie') { blob(ctx, 0, -2, 11, 8, sd + 80, h.color, 2); dot(ctx, 0, -11, 3.5, '#fff'); }
    else if (kind === 'tophat') { rect(ctx, -7, -16, 14, 16, sd + 80, h.color, 2); rect(ctx, -12, -1, 24, 3, sd + 81, h.color, 2); rect(ctx, -7, -5, 14, 3, sd + 82, '#c0392b', 0); }
    else if (kind === 'crown') { poly(ctx, [[-10, 2], [-10, -8], [-5, -3], [0, -11], [5, -3], [10, -8], [10, 2]], sd + 80, h.color, 2); }
    else if (kind === 'bow') { poly(ctx, [[0, 0], [-10, -6], [-10, 6]], sd + 80, h.color, 2); poly(ctx, [[0, 0], [10, -6], [10, 6]], sd + 81, h.color, 2); dot(ctx, 0, 0, 3, h.color); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- CRITTERS
  function rat(ctx, x, y, o = {}) {
    const f = o.facing || 1, s = o.scale || 1, t = o.t || 0, sd = o.seed || 5;
    ctx.save(); ctx.translate(x, y); ctx.scale(f * s, s);
    const run = Math.sin(t * 20) * 3;
    curve(ctx, -12, -7, -24, -4 + Math.sin(t * 6) * 3, -30, -12, sd + 1, 2.4, '#d98a95');
    line(ctx, [[-6, -4], [-6 + run, 0]], sd + 2, 2.4); line(ctx, [[6, -4], [6 - run, 0]], sd + 3, 2.4);
    blob(ctx, 0, -9, 13, 7.5, sd + 4, o.color || '#8f8a8f', 2.2);
    blob(ctx, 12, -11, 7, 5.5, sd + 5, o.color || '#8f8a8f', 2.2);
    blob(ctx, 8, -18, 4, 4, sd + 6, '#d9a3ac', 2);
    dot(ctx, 19, -11, 1.8, '#d36a7a');
    dot(ctx, 13.5, -13, 1.5, '#111');
    if (o.crown) poly(ctx, [[5, -16], [5, -24], [8, -20], [11, -26], [14, -20], [17, -24], [17, -16]], sd + 7, '#f5c542', 2);
    ctx.restore();
  }

  function roach(ctx, x, y, o = {}) {
    const f = o.facing || 1, t = o.t || 0, sd = o.seed || 9;
    ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
    for (let i = -1; i <= 1; i++) line(ctx, [[i * 5, -4], [i * 6 + Math.sin(t * 25 + i) * 2, 0]], sd + i, 1.8);
    blob(ctx, 0, -6, 11, 5, sd + 3, '#7a4a2a', 2);
    curve(ctx, 0, -11, 0, -6, 0, -2, sd + 4, 1.2, '#4a2a1a');
    blob(ctx, 10, -6, 4, 3.5, sd + 5, '#5a3520', 1.8);
    curve(ctx, 12, -8, 18, -16, 22, -14, sd + 6, 1.2); curve(ctx, 12, -7, 19, -12, 23, -9, sd + 7, 1.2);
    ctx.restore();
  }

  function mole(ctx, x, y, o = {}) {
    // Foreman Digby & the Mole Queen family
    const f = o.facing || 1, s = o.scale || 1, t = o.t || 0, sd = o.seed || 77;
    ctx.save(); ctx.translate(x, y); ctx.scale(f * s, s);
    const bob = Math.sin(t * 8) * 1.5;
    blob(ctx, -9, -4, 7, 4, sd + 1, '#6b4a3a', 2);
    blob(ctx, 9, -4, 7, 4, sd + 2, '#6b4a3a', 2);
    blob(ctx, 0, -22 + bob, 20, 19, sd + 3, o.color || '#6b4a3a', 2.6);
    blob(ctx, 4, -16 + bob, 11, 9, sd + 4, '#a07a60', 0);
    blob(ctx, 17, -22 + bob, 6, 4.5, sd + 5, '#f19aa8', 2);
    for (const dx of [6, 11]) { line(ctx, [[dx - 2, -29 + bob], [dx + 2, -29 + bob]], sd + dx, 2); }
    if (o.dizzy) { for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; dot(ctx, Math.cos(a) * 14, -48 + Math.sin(a) * 4, 3, '#f5d75c'); } }
    // claw / drill arm
    if (o.drill) {
      ctx.save(); ctx.translate(18, -14 + bob); ctx.rotate(Math.sin(t * 40) * 0.05);
      poly(ctx, [[0, -6], [24, 0], [0, 6]], sd + 9, '#b9bcc4', 2);
      for (let i = 0; i < 3; i++) line(ctx, [[4 + i * 6, -4 + i * 1.2], [8 + i * 6, 3 - i * 1.2]], sd + 10 + i, 1.4);
      ctx.restore();
    } else {
      blob(ctx, 16, -10 + bob, 6, 4, sd + 9, '#f0b6a0', 2);
    }
    if (o.hat) hat(ctx, -1, -38 + bob, o.hat, sd);
    if (o.crown) poly(ctx, [[-11, -38], [-11, -50], [-5, -43], [0, -54], [5, -43], [11, -50], [11, -38]], sd + 12, '#b086e8', 2.2);
    ctx.restore();
  }

  function ratKing(ctx, x, y, o = {}) {
    const f = o.facing || 1, t = o.t || 0, sd = 300;
    ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
    const run = o.running ? Math.sin(t * 16) * 8 : 0;
    const crouch = o.crouch ? 6 : 0;
    // cape
    poly(ctx, [[-40, -62 + crouch], [-70, -10], [-20, -8]], sd, '#9b2d3f', 2.4);
    // tail
    curve(ctx, -40, -30, -80, -10 + Math.sin(t * 4) * 8, -95, -40, sd + 1, 7, INK);
    curve(ctx, -40, -30, -80, -10 + Math.sin(t * 4) * 8, -95, -40, sd + 1, 4, '#d98a95');
    // legs
    for (const [lx, sw] of [[-25, run], [20, -run], [-12, -run], [30, run]]) {
      line(ctx, [[lx, -20], [lx + sw, 0]], sd + lx, 9, INK);
      line(ctx, [[lx, -20], [lx + sw, 0]], sd + lx, 5.5, '#7d7378');
    }
    blob(ctx, 0, -38 + crouch, 46, 28, sd + 2, '#7d7378', 3);
    blob(ctx, 4, -32 + crouch, 26, 16, sd + 3, '#a79ea3', 0);
    // head
    blob(ctx, 46, -48 + crouch, 26, 20, sd + 4, '#7d7378', 3);
    blob(ctx, 34, -70 + crouch, 11, 11, sd + 5, '#d9a3ac', 2.4);
    blob(ctx, 72, -46 + crouch, 5, 4, sd + 6, '#d36a7a', 2);
    if (o.dizzy) { line(ctx, [[48, -58], [56, -50]], sd + 7, 2.4); line(ctx, [[56, -58], [48, -50]], sd + 8, 2.4); }
    else if (o.angry) { blob(ctx, 52, -54 + crouch, 4, 4, sd + 9, '#ff5040', 1.6); line(ctx, [[45, -62 + crouch], [58, -58 + crouch]], sd + 10, 2.6); }
    else { blob(ctx, 52, -54 + crouch, 4, 4, sd + 9, '#fff', 1.6); dot(ctx, 53, -54 + crouch, 2, '#111'); }
    // teeth + whiskers
    rect(ctx, 64, -38 + crouch, 4, 5, sd + 11, '#fffbe6', 1.4); rect(ctx, 68, -38 + crouch, 4, 5, sd + 12, '#fffbe6', 1.4);
    line(ctx, [[66, -44 + crouch], [88, -50 + crouch]], sd + 13, 1.2); line(ctx, [[66, -42 + crouch], [88, -40 + crouch]], sd + 14, 1.2);
    // crown (wobbly, a bit too small)
    ctx.save(); ctx.translate(42, -68 + crouch); ctx.rotate(-0.2 + (o.dizzy ? Math.sin(t * 10) * 0.3 : 0));
    poly(ctx, [[-14, 0], [-14, -14], [-7, -6], [0, -18], [7, -6], [14, -14], [14, 0]], sd + 15, '#f5c542', 2.4);
    dot(ctx, 0, -5, 2.5, '#d6304a');
    ctx.restore();
    if (o.dizzy) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; dot(ctx, 42 + Math.cos(a) * 22, -95 + Math.sin(a) * 5, 3.5, '#f5d75c'); }
    ctx.restore();
  }

  function moleQueen(ctx, x, y, o = {}) {
    mole(ctx, x, y, { ...o, scale: (o.scale || 1) * 1.6, color: '#5a3d5c', crown: true, seed: 999 });
  }

  // ---------------------------------------------------------------- ITEMS
  function coin(ctx, x, y, t = 0, sd = 1) {
    const w = Math.abs(Math.cos(t * 4)) * 8 + 2;
    blob(ctx, x, y, w, 9, sd, '#f6c945', 2, 0.5);
    if (w > 6) { dot(ctx, x, y + 2, 2.4, '#c98f1e'); for (const [dx, dy] of [[-2.6, -2], [0, -3.4], [2.6, -2]]) dot(ctx, x + dx * w / 10, y + dy, 1.1, '#c98f1e'); }
  }
  function heart(ctx, x, y, s, fill, kind) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const path = () => {
      ctx.beginPath(); ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-10, -1, -7, -10, 0, -5);
      ctx.bezierCurveTo(7, -10, 10, -1, 0, 6); ctx.closePath();
    };
    const col = kind === 'armor' ? '#9fb3c8' : '#e2475b';
    path(); ctx.fillStyle = '#5c4038'; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
    if (fill > 0) {
      ctx.save(); path(); ctx.clip();
      ctx.fillStyle = col; ctx.fillRect(-10, -10, fill >= 1 ? 20 : 10, 20);
      if (kind === 'armor') { ctx.strokeStyle = '#5e7891'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(6, 4); ctx.moveTo(6, -4); ctx.lineTo(-6, 4); ctx.stroke(); }
      ctx.restore();
    }
    path(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
    if (kind === 'armor') { ctx.lineWidth = 2.2; ctx.strokeStyle = '#d9e3ee'; ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-2, -6); ctx.stroke(); }
    ctx.restore();
  }
  function item(ctx, kind, x, y, s = 1, t = 0) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const sd = kind.length * 17;
    if (kind === 'feather') {
      ctx.rotate(-0.6 + Math.sin(t * 3) * 0.15);
      blob(ctx, 0, 0, 5, 13, sd, '#f2f6fb', 2);
      line(ctx, [[0, 14], [0, -12]], sd + 1, 1.6, '#8aa0b8');
      for (let i = -2; i <= 2; i++) line(ctx, [[0, i * 4], [3.5, i * 4 - 2]], sd + 2 + i, 1, '#b8c6d6');
    } else if (kind === 'spring') {
      rect(ctx, -9, 8, 18, 4, sd, '#c0392b', 1.8);
      for (let i = 0; i < 4; i++) curve(ctx, -7, 6 - i * 4, 0, 2 - i * 4 + (i % 2 ? 4 : -4), 7, 6 - i * 4, sd + i, 2.2, '#8e9aa6');
      rect(ctx, -9, -12, 18, 4, sd + 9, '#c0392b', 1.8);
    } else if (kind === 'puff') {
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; line(ctx, [[Math.cos(a) * 6, Math.sin(a) * 6], [Math.cos(a) * 11, Math.sin(a) * 11]], sd + i, 3, '#ff8fc2', 0.8); }
      blob(ctx, 0, 0, 8, 8, sd, '#ff6fae', 1.8);
      line(ctx, [[0, -8], [3, -14]], sd + 20, 1.6); dot(ctx, 3, -14, 2, '#ffb347');
    } else if (kind === 'fish' || kind === 'bigfish') {
      const k = kind === 'bigfish' ? 1.35 : 1;
      ctx.scale(k, k);
      blob(ctx, 0, 0, 11, 6, sd, kind === 'bigfish' ? '#f0a05a' : '#8fc3e8', 2);
      poly(ctx, [[-10, 0], [-17, -6], [-17, 6]], sd + 1, kind === 'bigfish' ? '#f0a05a' : '#8fc3e8', 2);
      dot(ctx, 6, -1.5, 1.6, '#111');
    } else if (kind === 'life') {
      // secret extra life: golden cat bell
      blob(ctx, 0, 0, 11, 11, sd, '#f5c542', 2.2);
      line(ctx, [[-10, -2], [10, -2]], sd + 1, 1.8); dot(ctx, 0, 4, 2.6, INK); line(ctx, [[0, 5], [0, 10]], sd + 2, 1.6);
      ctx.globalAlpha = 0.5 + Math.sin(t * 5) * 0.3; blob(ctx, 0, 0, 17, 17, sd + 3, null, 1.5); ctx.globalAlpha = 1;
    } else if (kind === 'walkie') {
      rect(ctx, -8, -10, 16, 22, sd, '#5a6270', 2);
      line(ctx, [[5, -10], [5, -20]], sd + 1, 2.4);
      rect(ctx, -5, -6, 10, 7, sd + 2, '#bde3c2', 1.4);
      for (let i = 0; i < 3; i++) line(ctx, [[-5, 4 + i * 2.6], [5, 4 + i * 2.6]], sd + 3 + i, 1.1);
    } else if (HATS[kind]) {
      hat(ctx, 0, 4, kind, sd, true);
    }
    ctx.restore();
  }

  function trap(ctx, x, y, o = {}) {
    const sd = 400 + (o.seed || 0);
    rect(ctx, x - 26, y - 8, 52, 8, sd, '#c59a64', 2.2);
    line(ctx, [[x - 20, y - 8], [x + 20, y - 8]], sd + 1, 1.2, '#8b6a42');
    if (o.snapped) {
      line(ctx, [[x - 18, y - 9], [x + 18, y - 9]], sd + 2, 3.2, '#9aa3ad');
      line(ctx, [[x - 18, y - 9], [x - 18, y - 4]], sd + 3, 3, '#9aa3ad');
    } else {
      line(ctx, [[x - 18, y - 9], [x - 18, y - 32], [x + 2, y - 32], [x + 2, y - 9]], sd + 2, 3, '#9aa3ad');
      blob(ctx, x + 10, y - 12, 6, 4, sd + 4, '#f6d55c', 1.6); // cheese
    }
  }

  // Paper texture overlay (static)
  let paper = null;
  function paperPattern(ctx) {
    if (paper) return paper;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const r = rng(42);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,240,0.05)';
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = 'rgba(80,60,40,0.035)'; g.lineWidth = 1;
      g.beginPath(); const x = r() * 256, y = r() * 256; g.moveTo(x, y); g.lineTo(x + r() * 30 - 15, y + r() * 30 - 15); g.stroke();
    }
    paper = ctx.createPattern(c, 'repeat');
    return paper;
  }

  function text(ctx, str, x, y, o = {}) {
    ctx.font = `${Math.round((o.size || 18) * FONT_SCALE)}px ${o.font || 'PatrickHand, "Comic Sans MS", cursive'}`;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    if (o.outline) { ctx.lineWidth = o.outline; ctx.strokeStyle = o.outlineColor || INK; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = o.color || INK;
    ctx.fillText(str, x, y);
    if (o.bold !== false) { ctx.lineWidth = Math.max(0.6, (o.size || 18) * 0.045); ctx.strokeStyle = o.color || INK; ctx.strokeText(str, x, y); }
  }
  function wrap(ctx, str, maxW, size = 18) {
    ctx.font = `${Math.round(size * FONT_SCALE)}px PatrickHand, "Comic Sans MS", cursive`;
    const out = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const w of para.split(' ')) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
      }
      out.push(line);
    }
    return out;
  }
  function panel(ctx, x, y, w, h, sd, fill = '#fff8e8') {
    rect(ctx, x + 4, y + 5, w, h, sd + 1, 'rgba(0,0,0,0.25)', 0);
    rect(ctx, x, y, w, h, sd, fill, 3, 1.5);
  }

  PM.Draw = {
    INK, rng, hash, shade, CATS, HATS,
    tick(time) { boilFrame = Math.floor(time / 0.14) % 3; },
    blob, blobPath, poly, polyPath, line, curve, rect, dot, fillStroke, smoothClosed,
    cat, catFace, hat, rat, roach, mole, ratKing, moleQueen,
    coin, heart, item, trap, paperPattern, text, wrap, panel,
  };
})();
