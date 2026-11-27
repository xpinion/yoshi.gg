// Looks for biomes 2-5: tile patterns, backgrounds, water and tree trunks.
(function () {
  const D = PM.Draw;
  const W = () => PM.CONFIG.WIDTH, H = () => PM.CONFIG.HEIGHT;

  PM.drawTilePattern = function (g, theme, px, py, r, x, y) {
    const t = 32;
    g.strokeStyle = theme.mortar; g.lineWidth = 1.5;
    if (theme.pattern === 'strata') {
      for (let i = 0; i < 3; i++) { const yy = py + 8 + i * 10 + (r() - 0.5) * 3; g.beginPath(); g.moveTo(px, yy); g.quadraticCurveTo(px + 16, yy + (r() - 0.5) * 4, px + t, yy); g.stroke(); }
      if (r() < 0.2) { g.fillStyle = '#a8562a'; g.fillRect(px + r() * 22 + 3, py + r() * 22 + 3, 6, 3); }
    } else if (theme.pattern === 'bark') {
      for (let i = 0; i < 3; i++) { const xx = px + 6 + i * 10 + (r() - 0.5) * 3; g.beginPath(); g.moveTo(xx, py); g.lineTo(xx + (r() - 0.5) * 4, py + t); g.stroke(); }
    } else if (theme.pattern === 'mud') {
      for (let i = 0; i < 3; i++) { g.fillStyle = theme.brickSpot; g.beginPath(); g.ellipse(px + r() * t, py + r() * t, 3 + r() * 4, 2 + r() * 3, 0, 0, 7); g.fill(); }
    } else if (theme.pattern === 'dirt') {
      for (let i = 0; i < 4; i++) { g.fillStyle = r() < 0.5 ? theme.brickSpot : '#8a6a50'; g.beginPath(); g.arc(px + r() * t, py + r() * t, 1.5 + r() * 2.5, 0, 7); g.fill(); }
      if (r() < 0.12) { g.strokeStyle = '#c8a070'; g.lineWidth = 2; g.beginPath(); g.moveTo(px + 4, py + r() * t); g.quadraticCurveTo(px + 16, py + r() * t, px + 28, py + r() * t); g.stroke(); }
    }
  };

  PM.drawWater = function (ctx, px, py, surface, time, x) {
    ctx.fillStyle = 'rgba(60,140,150,0.55)';
    if (surface) {
      const a = py + 4 + Math.sin(time * 2 + x * 0.8) * 2, b = py + 4 + Math.sin(time * 2 + x * 0.8 + 0.8) * 2;
      ctx.beginPath(); ctx.moveTo(px, a); ctx.lineTo(px + 32, b); ctx.lineTo(px + 32, py + 32); ctx.lineTo(px, py + 32); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(220,250,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, a); ctx.lineTo(px + 32, b); ctx.stroke();
    } else ctx.fillRect(px, py, 32, 32);
    if ((x * 13 + Math.floor(time * 1.5)) % 23 === 0) D.blob(ctx, px + 16, py + 32 - ((time * 40) % 32), 2.5, 2.5, x, 'rgba(230,250,255,0.6)', 1);
  };

  PM.drawTrunk = function (g, px, py, sd, leftIsTrunk, rightIsTrunk) {
    g.fillStyle = '#7a5236'; g.fillRect(px, py, 32, 32);
    const r = D.rng(sd);
    g.strokeStyle = '#5a3a22'; g.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) { const xx = px + 8 + i * 14 + (r() - 0.5) * 4; g.beginPath(); g.moveTo(xx, py); g.lineTo(xx + (r() - 0.5) * 3, py + 32); g.stroke(); }
    g.strokeStyle = D.INK; g.lineWidth = 2.5;
    if (!leftIsTrunk) { g.beginPath(); g.moveTo(px, py); g.lineTo(px + (r() - 0.5), py + 32); g.stroke(); }
    if (!rightIsTrunk) { g.beginPath(); g.moveTo(px + 32, py); g.lineTo(px + 32 + (r() - 0.5), py + 32); g.stroke(); }
  };

  function grad(ctx, a, b) { const g = ctx.createLinearGradient(0, 0, 0, H()); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, W(), H()); }
  function tiled(cam, factor, period, fn) {
    const off = cam.x * factor;
    for (let i = Math.floor(off / period) - 1; i < Math.floor(off / period) + Math.ceil(W() / period) + 2; i++) fn(i * period - off, i);
  }

  function wastelandBg(ctx, cam, time) {
    grad(ctx, '#f0a868', '#f8e2b4');
    D.blob(ctx, W() * 0.78, 110, 46, 46, 3, '#ffe58a', 0);
    tiled(cam, 0.12, 520, (x, i) => {
      const r = D.rng(i * 11 + 5);
      ctx.fillStyle = '#d99a6a';
      ctx.beginPath(); ctx.moveTo(x, H()); ctx.lineTo(x + 40, 260 - r() * 60); ctx.lineTo(x + 200 + r() * 80, 250 - r() * 60); ctx.lineTo(x + 260 + r() * 60, H()); ctx.fill();
    });
    tiled(cam, 0.4, 420, (x, i) => {
      const r = D.rng(i * 7 + 1);
      ctx.fillStyle = '#b87a50';
      ctx.beginPath(); ctx.moveTo(x, H()); ctx.quadraticCurveTo(x + 90, 330 - r() * 50, x + 200, H()); ctx.fill();
      // junk on the piles
      ctx.strokeStyle = '#7a4a30'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(x + 70, 380 - r() * 30, 18, 0, 7); ctx.stroke();
      ctx.fillStyle = '#8a5a3a'; ctx.fillRect(x + 110, 370 - r() * 30, 40, 22);
    });
    ctx.fillStyle = 'rgba(255,240,210,0.5)';
    for (let i = 0; i < 18; i++) { const x = ((i * 137 + time * (40 + i * 3)) % (W() + 40)) - 20, y = (i * 53) % H(); ctx.fillRect(x, y, 3, 2); }
  }

  function treesBg(ctx, cam, time) {
    grad(ctx, '#9fd8ef', '#dff3d2');
    tiled(cam, 0.08, 300, (x, i) => { const r = D.rng(i * 3 + 2); D.blob(ctx, x + 80, 60 + r() * 60, 60, 18, i, 'rgba(255,255,255,0.9)', 1.5); });
    tiled(cam, 0.2, 180, (x, i) => {
      const r = D.rng(i * 17 + 9);
      ctx.fillStyle = '#a9cfa0'; ctx.fillRect(x + 70, 120, 26, H());
      ctx.beginPath(); ctx.ellipse(x + 83, 110 + r() * 40, 70, 50, 0, 0, 7); ctx.fill();
    });
    tiled(cam, 0.45, 260, (x, i) => {
      const r = D.rng(i * 23 + 4);
      ctx.fillStyle = '#7fae76'; ctx.fillRect(x + 100, 60, 40, H());
      ctx.beginPath(); ctx.ellipse(x + 120, 40 + r() * 50, 100, 60, 0, 0, 7); ctx.fill();
    });
    ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = '#fffbe0';
    for (let i = 0; i < 3; i++) { const x = ((i * 380 - cam.x * 0.3) % 1140 + 1140) % 1140 - 100; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 60, 0); ctx.lineTo(x + 220, H()); ctx.lineTo(x + 120, H()); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(120,180,80,0.7)';
    for (let i = 0; i < 10; i++) { const x = ((i * 211 + time * 25) % (W() + 40)) - 20, y = ((i * 97 + time * 30) % (H() + 40)) - 20; ctx.beginPath(); ctx.ellipse(x, y, 5, 3, time + i, 0, 7); ctx.fill(); }
  }

  function swampBg(ctx, cam, time) {
    grad(ctx, '#41604c', '#7a8a5a');
    tiled(cam, 0.15, 340, (x, i) => {
      const r = D.rng(i * 5 + 3);
      ctx.strokeStyle = '#34503e'; ctx.lineWidth = 14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 100, H()); ctx.lineTo(x + 110, 160 + r() * 60); ctx.lineTo(x + 70, 110); ctx.moveTo(x + 110, 200); ctx.lineTo(x + 160, 150); ctx.stroke();
    });
    tiled(cam, 0.4, 300, (x, i) => {
      const r = D.rng(i * 9 + 7);
      ctx.fillStyle = '#4e6a48'; ctx.beginPath(); ctx.moveTo(x, H()); ctx.quadraticCurveTo(x + 150, 380 - r() * 40, x + 300, H()); ctx.fill();
      ctx.strokeStyle = '#3a5236'; ctx.lineWidth = 3;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + 40 + k * 18, 420); ctx.lineTo(x + 36 + k * 18, 380 - r() * 20); ctx.stroke(); }
    });
    ctx.fillStyle = 'rgba(230,240,220,0.08)';
    for (let i = 0; i < 3; i++) ctx.fillRect(0, 300 + i * 60 + Math.sin(time * 0.5 + i) * 10, W(), 30);
    for (let i = 0; i < 14; i++) {
      const x = (i * 173 + Math.sin(time * 0.7 + i) * 40) % W(), y = 120 + (i * 61) % 300 + Math.cos(time + i) * 12;
      ctx.globalAlpha = 0.4 + Math.sin(time * 3 + i) * 0.4; D.dot(ctx, x, y, 2.5, '#f3ff9a'); ctx.globalAlpha = 1;
    }
  }

  function tunnelsBg(ctx, cam, time) {
    grad(ctx, '#2a1c16', '#3c2a20');
    tiled(cam, 0.2, 360, (x, i) => {
      ctx.fillStyle = '#33231b';
      ctx.beginPath(); ctx.moveTo(x, H()); ctx.lineTo(x, 200); ctx.quadraticCurveTo(x + 180, 40, x + 360, 200); ctx.lineTo(x + 360, H()); ctx.lineTo(x + 320, H()); ctx.lineTo(x + 320, 230); ctx.quadraticCurveTo(x + 180, 110, x + 40, 230); ctx.lineTo(x + 40, H()); ctx.fill();
    });
    tiled(cam, 0.45, 240, (x, i) => {
      const r = D.rng(i * 29 + 6);
      ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + 30 + k * 40, 0); ctx.quadraticCurveTo(x + 40 + k * 40, 60, x + 20 + k * 40, 90 + r() * 60); ctx.stroke(); }
      // lantern
      const lx = x + 180, ly = 150 + r() * 80;
      ctx.save(); ctx.globalAlpha = 0.18 + Math.sin(time * 4 + i) * 0.04; D.dot(ctx, lx, ly, 60, '#ffb347'); ctx.restore();
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, ly - 10); ctx.stroke();
      D.dot(ctx, lx, ly, 7, '#ffd27a');
    });
  }

  function branch(g, px, py, sd, Dr) {
    Dr.rect(g, px, py + 2, 32, 10, sd, '#8a5a36', 2, 0.6);
    if (sd % 3 === 0) Dr.blob(g, px + 16, py + 1, 10, 5, sd + 1, '#6fb05a', 1.5);
  }
  function lily(g, px, py, sd, Dr) {
    Dr.blob(g, px + 16, py + 6, 17, 6, sd, '#5a9a44', 2);
    g.strokeStyle = '#3a6a2a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px + 16, py + 6); g.lineTo(px + 26, py + 3); g.stroke();
  }
  function plank(g, px, py, sd, Dr) {
    Dr.rect(g, px, py + 2, 32, 9, sd, '#9a7048', 2, 0.6);
    Dr.dot(g, px + 5, py + 6, 1.5, '#444'); Dr.dot(g, px + 27, py + 6, 1.5, '#444');
  }

  PM.BIOME_THEMES.push(
    { name: 'Wasteland', brick: '#c98a56', mortar: '#a86a3c', brickSpot: '#b0703e', top: '#e8c07a', ledge: '#8a8f96', pattern: 'strata', hazard: '#2a2226', drawBg: wastelandBg },
    { name: 'Tall Trees', brick: '#7a5236', mortar: '#5a3a22', brickSpot: '#6a4630', top: '#6fb05a', ledge: '#8a5a36', pattern: 'bark', hazard: '#8a3a6a', drawBg: treesBg, drawLedge: branch },
    { name: 'Swamp', brick: '#5a5238', mortar: '#44402a', brickSpot: '#4a4630', top: '#6a8a3a', ledge: '#5a9a44', pattern: 'mud', hazard: '#7a8a2a', drawBg: swampBg, drawLedge: lily },
    { name: 'Dirt Tunnels', brick: '#6a4a36', mortar: '#4a3224', brickSpot: '#543a2a', top: '#8a6a4a', ledge: '#9a7048', pattern: 'dirt', hazard: '#a0402a', drawBg: tunnelsBg, drawLedge: plank },
  );
})();
