// Starts the game loop and scales the canvas to fit the window.
(function () {
  const canvas = document.getElementById('game');
  const cfg = PM.CONFIG;
  canvas.width = cfg.WIDTH; canvas.height = cfg.HEIGHT;

  function fit() {
    const s = Math.min(window.innerWidth / cfg.WIDTH, window.innerHeight / cfg.HEIGHT);
    canvas.style.width = Math.floor(cfg.WIDTH * s) + 'px';
    canvas.style.height = Math.floor(cfg.HEIGHT * s) + 'px';
  }
  window.addEventListener('resize', fit); fit();

  // The level editor only exists when running locally via tools/dev_server.py
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local) {
    const s = document.createElement('script');
    s.src = 'tools/editor.js?' + Date.now();
    s.onerror = () => {};
    document.body.appendChild(s);
  }

  function start() {
  const game = new PM.GameClass(canvas);
  const STEP = 1 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    while (acc >= STEP) { game.update(STEP); PM.Input.endFrame(); acc -= STEP; }
    game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  }
  // wait for the handwritten font so text doesn't flash in a plain font
  (document.fonts ? Promise.race([document.fonts.load('20px PatrickHand'), new Promise((r) => setTimeout(r, 2500))]) : Promise.resolve()).then(start, start);
  window.addEventListener('pointerdown', () => PM.Audio.unlock());
})();
