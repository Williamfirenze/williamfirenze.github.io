/* =========================================================
   William Firenze — UI, lingua, classifica
   ========================================================= */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var LS = { best: 'rb_best', name: 'rb_name', lang: 'wf_lang', local: 'rb_local_board' };
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* =======================================================
     1 · lingua
     ======================================================= */
  var lang = get(LS.lang, 'it') === 'en' ? 'en' : 'it';

  function applyLang() {
    document.documentElement.lang = lang;
    $$('[data-it]').forEach(function (el) {
      var v = el.getAttribute('data-' + lang);
      if (v !== null) el.innerHTML = v;
    });
    var input = $('#playerName');
    if (input) input.placeholder = lang === 'it' ? 'IL TUO NOME' : 'YOUR NAME';
  }
  var langBtn = $('#langBtn');
  if (langBtn) langBtn.addEventListener('click', function () {
    lang = lang === 'it' ? 'en' : 'it';
    set(LS.lang, lang);
    applyLang();
    loadTeaser();
  });
  applyLang();

  /* =======================================================
     2 · scroll
     ======================================================= */
  var progress = $('#scrollProgress');
  window.addEventListener('scroll', function () {
    var y = window.scrollY || document.documentElement.scrollTop;
    var doc = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (doc > 0 ? (y / doc) * 100 : 0) + '%';
  }, { passive: true });

  var topBtn = $('[data-scroll-top]');
  if (topBtn) topBtn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* =======================================================
     3 · reveal
     ======================================================= */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en, i) {
        if (!en.isIntersecting) return;
        setTimeout(function () { en.target.classList.add('is-in'); }, i * 55);
        obs.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { ro.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* =======================================================
     4 · classifica
     ======================================================= */
  var API = '/api/leaderboard';
  var API_FALLBACK = '/.netlify/functions/leaderboard';

  function readLocal() {
    try { return JSON.parse(get(LS.local, '[]')) || []; } catch (e) { return []; }
  }
  function writeLocal(entries) { set(LS.local, JSON.stringify(entries.slice(0, 50))); }
  function pushLocal(name, score) {
    var list = readLocal();
    list.push({ name: name, score: score, date: new Date().toISOString() });
    list.sort(function (a, b) { return b.score - a.score; });
    writeLocal(list);
    return list;
  }

  function request(method, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API, opts).then(function (r) {
      if (r.status === 404) return fetch(API_FALLBACK, opts);
      return r;
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
        throw new Error(j.error || ('HTTP ' + r.status));
      });
      return r.json();
    });
  }

  // Ultima spiaggia: il file JSON statico del sito. Percorso relativo,
  // cosi funziona anche su GitHub Pages in sottocartella.
  function fetchStatic() {
    return fetch('data/leaderboard.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        var entries = Array.isArray(list) ? list : (list.entries || []);
        return { entries: entries, source: 'static' };
      });
  }

  function withLocal(data) {
    var mine = readLocal();
    if (!mine.length) return data;
    var all = (data.entries || []).concat(mine);
    all.sort(function (a, b) { return b.score - a.score; });
    return { entries: all, source: data.source };
  }

  function fetchBoard() {
    return request('GET')
      .catch(function () { return fetchStatic(); })
      .then(function (d) { return d.source === 'github' ? d : withLocal(d); })
      .catch(function () { return withLocal({ entries: [], source: 'local' }); });
  }

  function submitScore(name, score) { return request('POST', { name: name, score: score }); }

  function srcLabel(source) {
    if (source === 'github') return 'github · live';
    if (source === 'static') return lang === 'it' ? 'file statico' : 'static file';
    if (source === 'local')  return lang === 'it' ? 'solo locale' : 'local only';
    return 'live';
  }

  function renderBoard(el, entries, highlightName, limit) {
    if (!el) return;
    el.innerHTML = '';
    if (!entries || !entries.length) {
      var li = document.createElement('li');
      li.className = 'lb__empty mono';
      li.textContent = lang === 'it' ? 'nessun punteggio. sii il primo.' : 'no scores yet. be the first.';
      el.appendChild(li);
      return;
    }
    entries.slice(0, limit || 10).forEach(function (e, i) {
      var li = document.createElement('li');
      if (i < 3) li.className = 'top';
      if (highlightName && String(e.name).toUpperCase() === String(highlightName).toUpperCase()) {
        li.className += ' me';
      }
      var r = document.createElement('span'); r.className = 'r'; r.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);
      var n = document.createElement('span'); n.className = 'n'; n.textContent = e.name;
      var s = document.createElement('span'); s.className = 's'; s.textContent = e.score;
      li.appendChild(r); li.appendChild(n); li.appendChild(s);
      el.appendChild(li);
    });
  }

  var teaserBoard = $('#teaserBoard');
  function loadTeaser() {
    fetchBoard()
      .then(function (d) { renderBoard(teaserBoard, d.entries, get(LS.name, ''), 5); })
      .catch(function () { renderBoard(teaserBoard, readLocal(), null, 5); });
  }
  loadTeaser();

  /* =======================================================
     5 · gioco
     ======================================================= */
  var modal    = $('#gameModal'),
      canvas   = $('#gameCanvas'),
      scrStart = $('#scrStart'),
      scrOver  = $('#scrOver'),
      gTip     = $('#gTip'),
      hudScore = $('#hudScore'),
      hudCombo = $('#hudCombo'),
      hudBest  = $('#hudBest'),
      overScore = $('#overScore'),
      overBest  = $('#overBest'),
      saveForm  = $('#saveForm'),
      nameInput = $('#playerName'),
      saveBtn   = $('#saveBtn'),
      saveMsg   = $('#saveMsg'),
      gameBoard = $('#gameBoard'),
      boardSrc  = $('#boardSrc'),
      teaserBest = $('#teaserBest');

  var best = parseInt(get(LS.best, '0'), 10) || 0;
  var game = null, lastScore = 0, savedThisRound = false;

  function paintBest() {
    if (hudBest) hudBest.textContent = best;
    if (overBest) overBest.textContent = best;
    if (teaserBest) teaserBest.textContent = best > 0 ? best : '—';
  }
  paintBest();

  function ensureGame() {
    if (game) return game;
    game = window.Rollback.create(canvas, {
      onHud: function (score, mult) {
        hudScore.textContent = score;
        hudCombo.textContent = '×' + mult;
      },
      onOver: function (score) { gameOver(score); }
    });
    return game;
  }

  function openGame() {
    modal.hidden = false;
    document.body.classList.add('is-locked');
    scrStart.hidden = false;
    scrOver.hidden = true;
    hudScore.textContent = '0';
    hudCombo.textContent = '×1';
    paintBest();
    requestAnimationFrame(function () { ensureGame().resize(); ensureGame().drawIdle(); });
  }

  function closeGame() {
    if (game) game.stop();
    modal.hidden = true;
    document.body.classList.remove('is-locked');
    loadTeaser();
  }

  function play() {
    scrStart.hidden = true;
    scrOver.hidden = true;
    savedThisRound = false;
    saveMsg.textContent = '';
    saveMsg.className = 'g-msg mono';
    if (saveBtn) saveBtn.disabled = false;
    gTip.hidden = false;
    gTip.style.animation = 'none';
    void gTip.offsetWidth;
    gTip.style.animation = '';
    var g = ensureGame();
    g.resize();
    g.start();
    hudScore.textContent = '0';
    hudCombo.textContent = '×1';
  }

  function gameOver(score) {
    lastScore = score;
    gTip.hidden = true;
    if (score > best) { best = score; set(LS.best, String(best)); }
    paintBest();
    overScore.textContent = score;
    scrOver.hidden = false;
    nameInput.value = get(LS.name, '');
    if (!nameInput.value) setTimeout(function () { nameInput.focus(); }, 180);

    if (boardSrc) boardSrc.textContent = '';
    renderBoard(gameBoard, null);
    fetchBoard()
      .then(function (d) {
        renderBoard(gameBoard, d.entries, get(LS.name, ''), 12);
        if (boardSrc) boardSrc.textContent = srcLabel(d.source);
      })
      .catch(function () {
        renderBoard(gameBoard, readLocal(), get(LS.name, ''), 12);
        if (boardSrc) boardSrc.textContent = srcLabel('local');
      });
  }

  $$('[data-open-game]').forEach(function (b) { b.addEventListener('click', openGame); });
  $$('[data-close-game]').forEach(function (b) { b.addEventListener('click', closeGame); });
  $('#btnStart').addEventListener('click', play);
  $('#btnRetry').addEventListener('click', play);

  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') { closeGame(); return; }
    var typing = document.activeElement === nameInput;
    if (e.code === 'Space' && !typing && (!scrStart.hidden || !scrOver.hidden)) {
      e.preventDefault();
      play();
    }
  });

  saveForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (savedThisRound) return;

    var raw = (nameInput.value || '').trim().replace(/\s+/g, ' ').slice(0, 14);
    if (raw.length < 2) {
      saveMsg.className = 'g-msg mono err';
      saveMsg.textContent = lang === 'it' ? 'almeno 2 caratteri' : 'at least 2 characters';
      return;
    }
    var name = raw.toUpperCase();
    set(LS.name, name);
    savedThisRound = true;
    saveBtn.disabled = true;
    saveMsg.className = 'g-msg mono';
    saveMsg.textContent = lang === 'it' ? 'salvataggio…' : 'saving…';

    submitScore(name, lastScore)
      .then(function (d) {
        saveMsg.className = 'g-msg mono ok';
        var pos = d.rank ? ' · #' + d.rank : '';
        saveMsg.textContent = (lang === 'it' ? 'salvato in classifica' : 'saved to the leaderboard') + pos;
        renderBoard(gameBoard, d.entries, name, 12);
        if (boardSrc) boardSrc.textContent = srcLabel(d.source);
        loadTeaser();
      })
      .catch(function () {
        pushLocal(name, lastScore);
        saveMsg.className = 'g-msg mono err';
        saveMsg.textContent = (lang === 'it'
          ? 'classifica online non disponibile — salvato in locale'
          : 'online leaderboard unavailable — saved locally');
        fetchBoard().then(function (d) {
          renderBoard(gameBoard, d.entries, name, 12);
          if (boardSrc) boardSrc.textContent = srcLabel(d.source);
        });
      });
  });

  /* piccolo vezzo: digitare "sql" apre il gioco */
  var buf = '';
  document.addEventListener('keydown', function (e) {
    if (!modal.hidden) return;
    if (document.activeElement && /input|textarea/i.test(document.activeElement.tagName)) return;
    if (e.key && e.key.length === 1) {
      buf = (buf + e.key.toLowerCase()).slice(-3);
      if (buf === 'sql') { buf = ''; openGame(); }
    }
  });

})();
