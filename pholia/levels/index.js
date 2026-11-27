// Loads every level file (levels 1-50).
(function () {
  const biomes = ['sewer', 'wasteland', 'trees', 'swamp', 'tunnels'];
  for (let i = 1; i <= 50; i++) {
    const f = 'levels/' + biomes[Math.floor((i - 1) / 10)] + '_' + String(i).padStart(2, '0') + '.js';
    document.write('<script src="' + f + '"><\/script>');
  }
})();
