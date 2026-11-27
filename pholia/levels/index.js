// Loads every level file. Add new level files to this list.
(function () {
  const files = [];
  for (let i = 1; i <= 10; i++) files.push('levels/sewer_' + String(i).padStart(2, '0') + '.js');
  for (const f of files) document.write('<script src="' + f + '"><\/script>');
})();
