// Art for biomes 2-5: fleas, birds, snakes, frogs, beetles, squirrels, eels,
// the big bosses, and new items. Extends PM.Draw.
(function () {
  const D = PM.Draw, INK = D.INK;
  const { blob, poly, line, curve, rect, dot } = D;

  function flea(ctx, x, y, o = {}) {
    const f = o.facing || 1, s = o.scale || 1, t = o.t || 0, sd = o.seed || 21;
    ctx.save(); ctx.translate(x, y); ctx.scale(f * s, s);
    const kick = o.air ? 6 : Math.sin(t * 14) * 2;
    // big back legs
    line(ctx, [[-4, -10], [-14, -18], [-18 - kick, 0]], sd, 3, INK);
    line(ctx, [[2, -8], [-4, -2], [-6 + kick, 0]], sd + 1, 2.4, INK);
    line(ctx, [[8, -8], [12, -2], [14, 0]], sd + 2, 2.4, INK);
    blob(ctx, 0, -12, 13, 9, sd + 3, o.color || '#8a4b2a', 2.2);
    curve(ctx, -6, -19, -2, -12, -6, -5, sd + 4, 1.4, '#5a2a14');
    curve(ctx, 2, -20, 6, -12, 2, -4, sd + 5, 1.4, '#5a2a14');
    blob(ctx, 13, -14, 6, 5, sd + 6, o.color || '#8a4b2a', 2);
    dot(ctx, 15, -16, 2.2, '#fff'); dot(ctx, 15.6, -16, 1.2, '#111');
    line(ctx, [[18, -12], [25, -8]], sd + 7, 1.6); // little proboscis
    line(ctx, [[14, -19], [20, -27]], sd + 8, 1.2); line(ctx, [[12, -19], [14, -28]], sd + 9, 1.2);
    ctx.restore();
  }

  function giantFlea(ctx, x, y, o = {}) {
    const f = o.facing || 1, t = o.t || 0, sd = 600;
    ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
    const squash = o.squash || 0;
    ctx.scale(1 + squash * 0.15, 1 - squash * 0.2);
    const kick = o.air ? 18 : Math.sin(t * 6) * 3;
    line(ctx, [[-20, -40], [-60, -70], [-75 - kick, 0]], sd, 9, INK); line(ctx, [[-20, -40], [-60, -70], [-75 - kick, 0]], sd, 5, '#6a3418');
    line(ctx, [[10, -30], [-5, -12], [-12 + kick, 0]], sd + 1, 8, INK); line(ctx, [[10, -30], [-5, -12], [-12 + kick, 0]], sd + 1, 4.5, '#6a3418');
    line(ctx, [[35, -30], [50, -12], [56, 0]], sd + 2, 8, INK); line(ctx, [[35, -30], [50, -12], [56, 0]], sd + 2, 4.5, '#6a3418');
    blob(ctx, 0, -55, 58, 42, sd + 3, '#8a4b2a', 3.5);
    for (let i = -2; i <= 2; i++) curve(ctx, i * 18 - 4, -95, i * 18 + 6, -55, i * 18 - 4, -15, sd + 10 + i, 2.2, '#5a2a14');
    blob(ctx, -10, -75, 22, 9, sd + 4, 'rgba(255,255,255,0.18)', 0);
    blob(ctx, 62, -62, 24, 20, sd + 5, '#8a4b2a', 3);
    const tired = o.tired;
    if (tired) { curve(ctx, 62, -70, 68, -64, 74, -70, sd + 6, 2.5); }
    else { blob(ctx, 68, -70, 8, 9, sd + 6, '#fff', 2); dot(ctx, 70, -69, 4, o.angry ? '#c0202a' : '#111'); }
    line(ctx, [[82, -56], [104, -44]], sd + 7, 3);
    line(ctx, [[70, -80], [86, -108]], sd + 8, 2); line(ctx, [[62, -82], [66, -112]], sd + 9, 2);
    if (tired) { D.text(ctx, 'huff', 96, -96, { size: 18, color: '#fff', outline: 4 }); for (let i = 0; i < 3; i++) dot(ctx, 100 + i * 8, -60 - ((t * 30 + i * 9) % 30), 3, 'rgba(255,255,255,0.7)'); }
    if (o.dizzy) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; dot(ctx, 62 + Math.cos(a) * 26, -100 + Math.sin(a) * 6, 4, '#f5d75c'); }
    ctx.restore();
  }

  function bird(ctx, x, y, o = {}) {
    const f = o.facing || 1, s = o.scale || 1, t = o.t || 0, sd = o.seed || 31;
    ctx.save(); ctx.translate(x, y); ctx.scale(f * s, s);
    const flap = Math.sin(t * 16) * 9;
    const col = o.color || '#6fa8dc';
    poly(ctx, [[-12, -12], [-22, -16], [-20, -8]], sd, col, 1.8);
    blob(ctx, 0, -12, 12, 8, sd + 1, col, 2);
    blob(ctx, 2, -9, 7, 4, sd + 2, '#f3e7cf', 0);
    blob(ctx, 10, -17, 6.5, 6, sd + 3, col, 2);
    poly(ctx, [[15, -18], [22, -16], [15, -14]], sd + 4, '#f2b630', 1.5);
    dot(ctx, 12, -19, 1.8, '#111');
    poly(ctx, [[-4, -14], [6, -14], [0, -24 - flap]], sd + 5, D.shade(col.length === 7 ? col : '#6fa8dc', -25), 1.8);
    if (o.crown) poly(ctx, [[6, -22], [6, -30], [9, -26], [11, -32], [13, -26], [16, -30], [16, -22]], sd + 6, '#f5c542', 1.6);
    ctx.restore();
  }

  function birdQueen(ctx, x, y, o = {}) {
    const f = o.facing || 1, t = o.t || 0, sd = 700;
    ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
    const flap = o.pinned ? -10 : Math.sin(t * (o.tired ? 5 : 9)) * 30;
    poly(ctx, [[-50, -40], [-90, -60], [-95, -30], [-80, -20]], sd, '#8e5bc8', 3);
    poly(ctx, [[-10, -60], [30, -60], [-5, -110 - flap]], sd + 1, '#6d3fa8', 3);
    blob(ctx, 0, -45, 52, 34, sd + 2, '#8e5bc8', 3.5);
    blob(ctx, 8, -36, 32, 18, sd + 3, '#f0d8ff', 0);
    blob(ctx, 50, -70, 24, 22, sd + 4, '#8e5bc8', 3);
    poly(ctx, [[70, -74], [98, -66], [70, -60]], sd + 5, '#f2b630', 2.5);
    if (o.pinned || o.tired) curve(ctx, 52, -76, 58, -70, 64, -76, sd + 6, 2.5);
    else { blob(ctx, 58, -76, 6, 7, sd + 6, '#fff', 2); dot(ctx, 60, -75, 3.2, o.angry ? '#c0202a' : '#111'); }
    poly(ctx, [[34, -90], [34, -108], [42, -98], [50, -114], [58, -98], [66, -108], [66, -90]], sd + 7, '#f5c542', 2.5);
    poly(ctx, [[0, -60], [40, -60], [10, -95 + flap]], sd + 8, '#a77ad8', 3);
    line(ctx, [[-8, -12], [-12, 0]], sd + 9, 3, '#f2b630'); line(ctx, [[12, -12], [14, 0]], sd + 10, 3, '#f2b630');
    if (o.tired && !o.pinned) for (let i = 0; i < 3; i++) dot(ctx, 90 + i * 8, -80 - ((t * 30 + i * 9) % 30), 3, 'rgba(255,255,255,0.7)');
    if (o.pinned) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; dot(ctx, 50 + Math.cos(a) * 24, -125 + Math.sin(a) * 6, 4, '#f5d75c'); }
    ctx.restore();
  }

  function snake(ctx, x, y, o = {}) {
    const f = o.facing || 1, s = o.scale || 1, t = o.t || 0, sd = o.seed || 41;
    ctx.save(); ctx.translate(x, y); ctx.scale(f * s, s);
    const col = o.color || '#6aa84f';
    ctx.beginPath(); ctx.moveTo(-20, -4);
    for (let i = -20; i <= 8; i += 4) ctx.lineTo(i, -4 - Math.sin(t * 10 + i * 0.4) * 3);
    ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 6; ctx.strokeStyle = col; ctx.stroke();
    blob(ctx, 12, -7, 8, 6, sd, col, 2);
    dot(ctx, 15, -9, 1.8, '#111');
    line(ctx, [[19, -5], [24, -4 + Math.sin(t * 20) * 2]], sd + 1, 1.4, '#d0304a');
    ctx.restore();
  }

  function frog(ctx, x, y, o = {}) {
    const f = o.facing || 1, sd = o.seed || 51;
    ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
    const air = o.air ? 5 : 0;
    blob(ctx, -8, -4 + air, 7, 4, sd, '#4f9a3a', 1.8);
    blob(ctx, 0, -10, 13, 9, sd + 1, '#6cc04a', 2);
    blob(ctx, 4, -7, 7, 4, sd + 2, '#e8f0c0', 0);
    blob(ctx, 6, -19, 4.5, 4.5, sd + 3, '#6cc04a', 1.8); dot(ctx, 7, -19, 2, '#111');
    curve(ctx, 6, -10, 10, -7, 13, -10, sd + 4, 1.5);
    ctx.restore();
  }

  function beetle(ctx, x, y, o = {}) {
    const f = o.facing || 1, t = o.t || 0, sd = o.seed || 61;
    ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
    for (let i = -1; i <= 1; i++) line(ctx, [[i * 5, -4], [i * 6 + Math.sin(t * 25 + i) * 2, 0]], sd + i, 1.8);
    blob(ctx, 0, -7, 11, 7, sd + 3, o.color || '#3a6a8a', 2);
    line(ctx, [[0, -14], [0, -1]], sd + 4, 1.2, '#1a2a3a');
    blob(ctx, 10, -6, 4, 3.5, sd + 5, '#222', 1.6);
    line(ctx, [[12, -8], [17, -13]], sd + 6, 1.2);
    ctx.restore();
  }

  function squirrel(ctx, x, y, o = {}) {
    const f = o.facing || 1, t = o.t || 0, sd = o.seed || 71;
    ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
    curve(ctx, -8, -8, -22, -20, -12, -30, sd, 9, INK); curve(ctx, -8, -8, -22, -20, -12, -30, sd, 6, '#c8763a');
    const run = Math.sin(t * 20) * 3;
    line(ctx, [[-4, -4], [-4 + run, 0]], sd + 1, 2.2); line(ctx, [[5, -4], [5 - run, 0]], sd + 2, 2.2);
    blob(ctx, 0, -9, 10, 7, sd + 3, '#b8662a', 2);
    blob(ctx, 9, -14, 6, 5, sd + 4, '#b8662a', 1.8);
    poly(ctx, [[6, -18], [7, -23], [10, -18]], sd + 5, '#b8662a', 1.4);
    dot(ctx, 12, -15, 1.6, '#111');
    ctx.restore();
  }

  function eel(ctx, x, y, o = {}) {
    const f = o.facing || 1, t = o.t || 0, sd = o.seed || 81;
    ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
    ctx.beginPath(); ctx.moveTo(-22, -8);
    for (let i = -22; i <= 8; i += 3) ctx.lineTo(i, -8 - Math.sin(t * 8 + i * 0.3) * 4);
    ctx.lineWidth = 11; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 8; ctx.strokeStyle = '#4a7a9a'; ctx.stroke();
    blob(ctx, 12, -8, 8, 6, sd, '#4a7a9a', 2);
    dot(ctx, 15, -10, 2, '#ffe14a'); dot(ctx, 15.5, -10, 1, '#111');
    ctx.restore();
  }

  // Serpent: head position + body trail of points [{x,y}]
  function serpent(ctx, head, trail, o = {}) {
    const t = o.t || 0, sd = 800;
    for (let i = trail.length - 1; i >= 0; i -= 2) {
      const p = trail[i], r = 18 - (i / trail.length) * 8;
      blob(ctx, p.x, p.y, r, r, sd + (i % 7), i % 4 < 2 ? '#4f8a3a' : '#6aa84f', 2.4);
    }
    const f = o.facing || 1;
    ctx.save(); ctx.translate(head.x, head.y); ctx.scale(f, 1);
    blob(ctx, 0, 0, 30, 22, sd + 20, '#5a9a44', 3);
    blob(ctx, 8, 8, 18, 9, sd + 21, '#d8e8a0', 0);
    if (o.dizzy) { line(ctx, [[8, -12], [16, -4]], sd + 22, 2.5); line(ctx, [[16, -12], [8, -4]], sd + 23, 2.5); }
    else { blob(ctx, 12, -8, 6, 7, sd + 22, '#ffe14a', 2); line(ctx, [[12, -13], [12, -3]], sd + 23, 2.5, '#111'); }
    if (o.mouth) { poly(ctx, [[18, 4], [34, -2], [34, 14]], sd + 24, '#8a1a2a', 2); line(ctx, [[22, 2], [22, 8]], sd + 25, 2, '#fff'); }
    else line(ctx, [[28, 4], [40, 6 + Math.sin(t * 20) * 3]], sd + 26, 2, '#d0304a');
    poly(ctx, [[-14, -18], [-14, -30], [-8, -24], [-2, -34], [4, -24], [10, -30], [10, -18]], sd + 27, '#f5c542', 2);
    ctx.restore();
  }

  function rock(ctx, x, y, s = 1, face = true) {
    // Gerald the rock
    blob(ctx, x, y - 14 * s, 22 * s, 15 * s, 950, '#9a9590', 2.5);
    if (face) { dot(ctx, x - 6 * s, y - 17 * s, 2 * s, '#333'); dot(ctx, x + 6 * s, y - 17 * s, 2 * s, '#333'); curve(ctx, x - 5 * s, y - 10 * s, x, y - 7 * s, x + 5 * s, y - 10 * s, 951, 1.6); }
  }

  function pot(ctx, x, y, o = {}) {
    const sd = 960 + (o.seed || 0);
    blob(ctx, x, y - 13, 14, 13, sd, '#c06a3a', 2.4);
    rect(ctx, x - 9, y - 30, 18, 6, sd + 1, '#a85a2a', 2);
    line(ctx, [[x - 10, y - 12], [x + 10, y - 12]], sd + 2, 1.5, '#7a3a1a');
    if (o.worm) curve(ctx, x - 2, y - 28, x + 4, y - 40, x + 8, y - 34, sd + 3, 4, '#e88a9a');
  }

  function bomb(ctx, x, y, t) {
    blob(ctx, x, y, 10, 10, 970, '#3a3036', 2);
    line(ctx, [[x + 4, y - 8], [x + 8, y - 14]], 971, 2);
    if (Math.floor(t * 12) % 2) dot(ctx, x + 8, y - 15, 3, '#ffb347');
  }

  // extra items for D.item
  const baseItem = D.item;
  D.item = function (ctx, kind, x, y, s = 1, t = 0) {
    if (kind === 'wand') {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.7);
      line(ctx, [[0, 14], [0, -12]], 980, 3, '#c59a64');
      for (let i = 0; i < 5; i++) curve(ctx, 0, -12, -6 + i * 3, -18 - Math.sin(t * 6 + i) * 3, -9 + i * 4.5, -24, 981 + i, 2.2, ['#ff6fae', '#ffd84a', '#6fd0ff', '#b086e8', '#8ae06a'][i]);
      ctx.restore();
    } else if (kind === 'worm') {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.beginPath(); for (let i = -10; i <= 10; i += 2) ctx[i === -10 ? 'moveTo' : 'lineTo'](i, Math.sin(t * 8 + i * 0.5) * 3);
      ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = 4.5; ctx.strokeStyle = '#e88a9a'; ctx.stroke();
      dot(ctx, 9, Math.sin(t * 8 + 4.5) * 3 - 1, 1.2, '#111');
      ctx.restore();
    } else if (kind === 'trap') {
      ctx.save(); ctx.translate(x, y); ctx.scale(s * 0.6, s * 0.6); D.trap(ctx, 0, 12, {}); ctx.restore();
    } else if (kind === 'scuba') {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      blob(ctx, 0, 0, 13, 11, 990, 'rgba(160,220,255,0.6)', 2.4);
      rect(ctx, -14, -3, 28, 5, 991, '#f2a33a', 1.8);
      line(ctx, [[10, -8], [14, -18]], 992, 3, '#5a6270');
      ctx.restore();
    } else baseItem(ctx, kind, x, y, s, t);
  };

  Object.assign(D, { flea, giantFlea, bird, birdQueen, snake, frog, beetle, squirrel, eel, serpent, rock, pot, bomb });
})();
