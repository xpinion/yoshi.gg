// 3 save slots per browser, stored in localStorage.
(function () {
  const KEY = 'pholias-mission-slot-';

  function fresh() {
    return {
      level: 1,
      lives: PM.CONFIG.START_LIVES,
      hearts: PM.CONFIG.START_HEARTS,
      armor: 0, maxArmor: 0,
      coins: 0,
      item: null,
      hats: [], hat: null,
      secretsFound: [],     // biome indexes where the secret life was found
      seen: {},             // bandit/clyde tips already shown
      rescued: [],
      deathsTotal: 0,
      playTime: 0,          // total time actually playing (paused / menus / cutscenes don't count)
      gameOvers: 0,         // times all lives were lost (the "Restarts" counter)
      name: null,           // leaderboard username, asked for at the start
      runId: PM.LB.newRunId(),
      levelClock: null,     // {level, t}: leaderboard time for the level in progress (kept across checkpoints)
      biomeStart: null,     // snapshot used when all 9 lives are lost
      shopVisited: [],
      introSeen: false,
      checkpoint: null,
      hard: false,
      scuba: false,
      beaten: [],           // level numbers completed (for the level select)
      replayReturn: null,   // when replaying an old level: the level to go back to          // Hard Mode: no checkpoints     // {level, x, y, coins, item} once a checkpoint flag is touched
      updated: Date.now(),
    };
  }

  PM.Save = {
    fresh,
    load(slot) {
      try { const s = JSON.parse(localStorage.getItem(KEY + slot)); return s ? { ...fresh(), ...s } : null; }
      catch (e) { return null; }
    },
    write(slot, data) {
      data.updated = Date.now();
      try { localStorage.setItem(KEY + slot, JSON.stringify(data)); } catch (e) { /* storage full / private mode */ }
    },
    erase(slot) { localStorage.removeItem(KEY + slot); },
    // Unlocks are shared by every slot in this browser (e.g. Hard Mode after beating the game)
    unlocked(name) { try { return !!(JSON.parse(localStorage.getItem('pholias-mission-unlocks')) || {})[name]; } catch (e) { return false; } },
    unlock(name) {
      let u = {}; try { u = JSON.parse(localStorage.getItem('pholias-mission-unlocks')) || {}; } catch (e) { /* ignore */ }
      u[name] = true; try { localStorage.setItem('pholias-mission-unlocks', JSON.stringify(u)); } catch (e) { /* ignore */ }
    },
    summary(slot) {
      const s = this.load(slot);
      if (!s) return null;
      return s;
    },
  };
})();
