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
      playTime: 0,
      biomeStart: null,     // snapshot used when all 9 lives are lost
      shopVisited: [],
      introSeen: false,
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
    summary(slot) {
      const s = this.load(slot);
      if (!s) return null;
      return s;
    },
  };
})();
