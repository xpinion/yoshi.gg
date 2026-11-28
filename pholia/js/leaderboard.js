// Online leaderboards (a Google Apps Script web app writing to the "Pholia Leaderboard" sheet).
// Source for the server side is in tools/leaderboard/Code.gs.
(function () {
  const URL = 'https://script.google.com/macros/s/AKfycbynZ54LPag1sy5rGyoq9xzWVc3TctCMzneW0N_Ekb7VrS4YW_CYVDnFoI2zAwCxrSQk/exec';
  const NAME_KEY = 'pholias-mission-name';
  const PENALTY = 60;   // seconds added per game over on the Time + Penalty board (matches the server)

  const get = (q) => fetch(URL + '?' + q).then((r) => r.json());
  // text/plain keeps the browser from sending a CORS preflight, which Apps Script can't answer
  const post = (body) => fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then((r) => r.json());

  function fmt(t) {
    t = Math.max(0, t || 0);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
  // a level-clear time, with tenths (level runs are short)
  function fmtShort(t) { return fmt(t) + '.' + Math.floor(((t || 0) % 1) * 10); }

  function newRunId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  // furthest level reached by this save (51 = beat the game)
  function reached(s) { return Math.min(51, Math.max(s.replayReturn || s.level, ...(s.beaten || []).map((b) => b + 1))); }

  PM.LB = {
    PENALTY, fmt, fmtShort, newRunId,
    lastName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } },
    rememberName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ignore */ } },
    cleanName(n) { return String(n || '').replace(/[^A-Za-z0-9 _\-.!']/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); },
    board(kind) { return get('board=' + kind).then((d) => d.rows || []); },
    level(n) { return get('level=' + n).then((d) => d.rows || []); },
    submitLevel(s, level, time) {
      if (!s.name) return Promise.reject(new Error('no name'));
      return post({ type: 'level', name: s.name, level, time, hard: !!s.hard, runId: s.runId });
    },
    submitRun(s, finished) {
      if (!s || !s.name) return Promise.resolve();
      return post({ type: 'run', runId: s.runId, name: s.name, level: finished ? 51 : reached(s), time: s.playTime, gameOvers: s.gameOvers || 0, finished: !!finished, hard: !!s.hard })
        .catch(() => { /* offline: the next update sends the latest numbers anyway */ });
    },
  };
})();
