// Keyboard input. Both WASD and arrow keys work.
(function () {
  const BINDINGS = {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    jump: ['KeyW', 'ArrowUp', 'Space'],
    attack: ['KeyU'],
    throw: ['KeyI'],
    item: ['KeyY'],
    dash: ['KeyK', 'ShiftLeft', 'ShiftRight'],
    radio: ['KeyQ', 'Tab'],
    pause: ['Escape'],
    confirm: ['Enter', 'Space', 'KeyU'],
    back: ['Escape', 'Backspace'],
  };

  const down = new Set();
  const pressed = new Set();   // pressed this frame
  const released = new Set();

  const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  window.addEventListener('keydown', (e) => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    pressed.add(e.code);
    PM.Audio && PM.Audio.unlock();
  });
  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
    released.add(e.code);
  });
  window.addEventListener('blur', () => down.clear());

  const any = (set, action) => BINDINGS[action].some((c) => set.has(c));

  PM.Input = {
    BINDINGS,
    held: (a) => any(down, a),
    pressed: (a) => any(pressed, a),
    released: (a) => any(released, a),
    keyPressed: (code) => pressed.has(code),
    keyHeld: (code) => down.has(code),
    anyPressed: () => pressed.size > 0,
    endFrame() { pressed.clear(); released.clear(); },
    clear() { pressed.clear(); released.clear(); },
  };
})();
