// Sound effects + generated placeholder music.
// Each song id ("level-1" ... "level-50", "boss-ratking", etc.) produces a different
// lofi tune. To use a real music file instead, list it in music/tracks.js.
(function () {
  const C = () => PM.CONFIG;
  let ctx = null, master, musicBus, sfxBus, musicFilter, noiseBuf;
  let song = null, songId = null, timer = null, fileAudio = null;
  let muted = false;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = C().MUSIC_VOLUME * 0.55;
    musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 2400;
    musicBus.connect(musicFilter); musicFilter.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = C().SFX_VOLUME * 0.6; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (songId) { const id = songId; songId = null; play(id); }
  }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ------------------------------------------------------------ synth helpers
  function tone(bus, t, freq, dur, o = {}) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const v = o.vol == null ? 0.3 : o.vol, a = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter; osc.connect(f); node = f; }
    node.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(bus, t, dur, o = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = o.ftype || 'highpass'; f.frequency.value = o.freq || 6000;
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    const g = ctx.createGain(); const v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ music
  const PROGS_MAJOR = [
    [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]],
    [[0, 4, 7, 11], [9, 12, 16, 19], [2, 5, 9, 12], [7, 11, 14, 17]],
    [[5, 9, 12, 16], [4, 7, 11, 14], [2, 5, 9, 12], [0, 4, 7, 11]],
    [[9, 12, 16, 19], [5, 9, 12, 16], [0, 4, 7, 11], [7, 11, 14, 17]],
    [[5, 9, 12, 16], [7, 11, 14, 17], [4, 7, 11, 14], [9, 12, 16, 19]],
  ];
  const PROGS_MINOR = [
    [[0, 3, 7, 10], [5, 8, 12, 15], [8, 12, 15, 19], [7, 10, 14, 17]],
    [[0, 3, 7, 10], [8, 12, 15, 19], [3, 7, 10, 14], [10, 14, 17, 21]],
    [[5, 8, 12, 15], [0, 3, 7, 10], [8, 12, 15, 19], [7, 11, 14, 17]],
  ];
  const PENTA_MAJ = [0, 2, 4, 7, 9, 12, 14, 16];
  const PENTA_MIN = [0, 3, 5, 7, 10, 12, 15, 17];

  function makeSong(id) {
    const r = PM.Draw.rng(PM.Draw.hash(...[...id].map((ch) => ch.charCodeAt(0))));
    const boss = id.startsWith('boss') || id.startsWith('mini');
    const minor = boss || id === 'cutscene-dark' || r() < 0.35;
    const progs = minor ? PROGS_MINOR : PROGS_MAJOR;
    const s = {
      id, boss,
      root: 45 + Math.floor(r() * 10),
      bpm: boss ? 140 + Math.floor(r() * 25) : 66 + Math.floor(r() * 22),
      prog: progs[Math.floor(r() * progs.length)],
      scale: minor ? PENTA_MIN : PENTA_MAJ,
      swing: boss ? 0 : 0.12 + r() * 0.1,
      melodyDensity: boss ? 0.55 : 0.18 + r() * 0.25,
      chordRhythm: Math.floor(r() * 3),
      bassPattern: Math.floor(r() * 3),
      leadType: ['triangle', 'sine', 'square'][Math.floor(r() * 3)],
      r, step: 0, nextTime: 0, melodyNote: 4,
      calm: id === 'title' || id === 'shop' || id.startsWith('cutscene'),
    };
    if (id === 'title') { s.bpm = 74; }
    if (id === 'shop') { s.bpm = 92; s.prog = PROGS_MAJOR[1]; s.leadType = 'triangle'; s.melodyDensity = 0.4; }
    return s;
  }

  function scheduleStep(s, t) {
    const spb = 60 / s.bpm, sixteenth = spb / 4;
    const step = s.step % 64, bar = Math.floor(step / 16), beat16 = step % 16;
    const chord = s.prog[bar];
    const M = musicBus;
    if (!s.boss) {
      // drums (lofi): kick on 1 and the "and" of 3, snare on 2 & 4, hats on 8ths
      if (!s.calm || s.id === 'shop') {
        if (beat16 === 0 || beat16 === 10 || (s.bassPattern === 2 && beat16 === 7)) tone(M, t, 110, 0.32, { slide: 40, vol: 0.55 });
        if (beat16 === 4 || beat16 === 12) { noise(M, t, 0.16, { freq: 1800, ftype: 'bandpass', vol: 0.22 }); tone(M, t, 190, 0.08, { vol: 0.08, type: 'triangle' }); }
        if (beat16 % 2 === 0) noise(M, t, 0.04, { freq: 7000, vol: beat16 % 4 === 2 ? 0.06 : 0.035 });
      }
      // chords (electric piano)
      const hits = [[0], [0, 6], [0, 7, 10]][s.chordRhythm];
      if (hits.includes(beat16)) {
        const len = beat16 === 0 ? spb * 2.2 : spb * 1.1;
        chord.forEach((n, i) => {
          tone(M, t + i * 0.012, mtof(s.root + 12 + n), len, { type: 'triangle', vol: 0.045, attack: 0.02, detune: Math.sin(t) * 8 });
          tone(M, t + i * 0.012, mtof(s.root + 12 + n), len * 0.7, { type: 'sine', vol: 0.035, attack: 0.01, detune: 6 });
        });
      }
      // bass
      const bp = [[0, 8], [0, 6, 10], [0, 3, 8, 14]][s.bassPattern];
      if (bp.includes(beat16)) tone(M, t, mtof(s.root - 12 + chord[0]), spb * 0.9, { type: 'sine', vol: 0.28, attack: 0.01 });
      // melody
      if (beat16 % 2 === 0 && s.r() < s.melodyDensity) {
        s.melodyNote = Math.max(0, Math.min(s.scale.length - 1, s.melodyNote + Math.floor(s.r() * 5) - 2));
        tone(M, t, mtof(s.root + 24 + s.scale[s.melodyNote]), spb * (s.r() < 0.5 ? 0.5 : 1), { type: s.leadType, vol: s.leadType === 'square' ? 0.025 : 0.06, attack: 0.02, filter: 2000 });
      }
      // vinyl crackle
      if (s.r() < 0.3) noise(M, t + s.r() * sixteenth, 0.01, { freq: 3000, vol: 0.05 + s.r() * 0.05 });
    } else {
      // boss: driving drums, pulsing bass, stabs and arpeggios
      if (beat16 % 4 === 0) tone(M, t, 130, 0.25, { slide: 40, vol: 0.6 });
      if (beat16 === 4 || beat16 === 12) noise(M, t, 0.18, { freq: 2200, ftype: 'bandpass', vol: 0.32 });
      if (beat16 % 2 === 1) noise(M, t, 0.04, { freq: 8000, vol: 0.05 });
      if (beat16 % 2 === 0) tone(M, t, mtof(s.root - 12 + chord[0]), sixteenth * 1.8, { type: 'sawtooth', vol: 0.12, filter: 600 });
      if (beat16 === 0 || beat16 === 6 || beat16 === 12) chord.slice(0, 3).forEach((n) => tone(M, t, mtof(s.root + 12 + n), spb * 0.6, { type: 'sawtooth', vol: 0.03, filter: 1600 }));
      const arp = chord[(beat16) % 4];
      tone(M, t, mtof(s.root + 24 + arp), sixteenth * 0.9, { type: 'square', vol: 0.025, filter: 2600 });
    }
    s.step++;
  }

  function scheduler() {
    if (!ctx || !song) return;
    while (song.nextTime < ctx.currentTime + 0.15) {
      const spb = 60 / song.bpm, sixteenth = spb / 4;
      const odd = song.step % 2 === 1;
      const t = song.nextTime + (odd ? song.swing * sixteenth : 0);
      scheduleStep(song, t);
      song.nextTime += sixteenth;
    }
  }

  function play(id) {
    if (songId === id) return;
    stop();
    songId = id;
    if (!ctx || muted) return;
    const file = PM.MUSIC_TRACKS && PM.MUSIC_TRACKS[id];
    if (file) {
      fileAudio = new Audio(file);
      fileAudio.loop = true; fileAudio.volume = C().MUSIC_VOLUME;
      fileAudio.play().catch(() => {});
      return;
    }
    song = makeSong(id);
    song.nextTime = ctx.currentTime + 0.05;
    musicFilter.frequency.value = song.boss ? 3500 : 2200;
    timer = setInterval(scheduler, 25);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null; song = null; songId = null;
    if (fileAudio) { fileAudio.pause(); fileAudio = null; }
  }

  // ------------------------------------------------------------ SFX
  const SFX = {
    jump: (t) => tone(sfxBus, t, 380, 0.15, { slide: 720, type: 'triangle', vol: 0.18 }),
    land: (t) => noise(sfxBus, t, 0.06, { freq: 400, ftype: 'lowpass', vol: 0.15 }),
    swipe: (t) => noise(sfxBus, t, 0.12, { freq: 1200, sweep: 5000, ftype: 'bandpass', vol: 0.3 }),
    hit: (t) => { tone(sfxBus, t, 300, 0.1, { slide: 120, type: 'square', vol: 0.12 }); noise(sfxBus, t, 0.08, { freq: 900, ftype: 'lowpass', vol: 0.25 }); },
    stomp: (t) => tone(sfxBus, t, 520, 0.12, { slide: 160, type: 'square', vol: 0.12 }),
    hurt: (t) => { tone(sfxBus, t, 700, 0.25, { slide: 250, type: 'sawtooth', vol: 0.12, filter: 2000 }); tone(sfxBus, t + 0.08, 500, 0.2, { slide: 200, type: 'sawtooth', vol: 0.1, filter: 2000 }); },
    coin: (t) => { tone(sfxBus, t, 1320, 0.07, { type: 'square', vol: 0.07 }); tone(sfxBus, t + 0.06, 1760, 0.14, { type: 'square', vol: 0.07 }); },
    powerup: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(sfxBus, t + i * 0.06, f, 0.12, { type: 'triangle', vol: 0.15 })),
    dash: (t) => noise(sfxBus, t, 0.2, { freq: 600, sweep: 3000, ftype: 'bandpass', vol: 0.25 }),
    sneeze: (t) => { tone(sfxBus, t, 300, 0.25, { slide: 700, type: 'triangle', vol: 0.1 }); noise(sfxBus, t + 0.3, 0.25, { freq: 2500, ftype: 'bandpass', vol: 0.45 }); },
    throw: (t) => noise(sfxBus, t, 0.15, { freq: 800, sweep: 2500, ftype: 'bandpass', vol: 0.2 }),
    boom: (t) => { noise(sfxBus, t, 0.6, { freq: 900, sweep: 80, ftype: 'lowpass', vol: 0.6 }); tone(sfxBus, t, 90, 0.5, { slide: 30, vol: 0.5 }); },
    snap: (t) => { noise(sfxBus, t, 0.05, { freq: 3000, vol: 0.5 }); tone(sfxBus, t, 180, 0.15, { slide: 60, type: 'square', vol: 0.2 }); },
    radio: (t) => { tone(sfxBus, t, 1200, 0.08, { type: 'square', vol: 0.06 }); tone(sfxBus, t + 0.1, 1500, 0.08, { type: 'square', vol: 0.06 }); },
    static: (t) => noise(sfxBus, t, 0.25, { freq: 2500, ftype: 'bandpass', vol: 0.12 }),
    move: (t) => tone(sfxBus, t, 660, 0.05, { type: 'triangle', vol: 0.1 }),
    select: (t) => { tone(sfxBus, t, 660, 0.06, { type: 'triangle', vol: 0.12 }); tone(sfxBus, t + 0.06, 990, 0.1, { type: 'triangle', vol: 0.12 }); },
    nope: (t) => tone(sfxBus, t, 200, 0.18, { type: 'square', vol: 0.08, filter: 900 }),
    die: (t) => [660, 520, 400, 260].forEach((f, i) => tone(sfxBus, t + i * 0.14, f, 0.2, { type: 'triangle', vol: 0.18 })),
    win: (t) => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(sfxBus, t + i * 0.1, f, 0.2, { type: 'triangle', vol: 0.16 })),
    oneup: (t) => [784, 988, 1175, 1568, 1319, 1568].forEach((f, i) => tone(sfxBus, t + i * 0.08, f, 0.14, { type: 'square', vol: 0.07 })),
    bosshit: (t) => { tone(sfxBus, t, 150, 0.4, { slide: 50, type: 'sawtooth', vol: 0.25, filter: 1200 }); noise(sfxBus, t, 0.3, { freq: 1500, ftype: 'lowpass', vol: 0.4 }); },
    squeak: (t) => tone(sfxBus, t, 1400, 0.12, { slide: 2000, type: 'sine', vol: 0.1 }),
    crumble: (t) => noise(sfxBus, t, 0.3, { freq: 500, ftype: 'lowpass', vol: 0.3 }),
    meow: (t) => { tone(sfxBus, t, 600, 0.35, { slide: 900, type: 'triangle', vol: 0.08, attack: 0.05 }); },
    rumble: (t) => { noise(sfxBus, t, 1.5, { freq: 200, ftype: 'lowpass', vol: 0.6 }); tone(sfxBus, t, 50, 1.4, { slide: 30, vol: 0.4 }); },
    drill: (t) => tone(sfxBus, t, 220, 0.3, { type: 'sawtooth', vol: 0.06, filter: 1200, slide: 260 }),
  };

  function sfx(name) {
    if (!ctx || muted || !SFX[name]) return;
    SFX[name](ctx.currentTime + 0.005);
  }

  PM.Audio = {
    unlock, play, stop, sfx,
    get current() { return songId; },
    toggleMute() { muted = !muted; if (muted) { const id = songId; stop(); songId = id; } else if (songId) { const id = songId; songId = null; play(id); } return muted; },
    get muted() { return muted; },
  };
})();
