/* =========================================================
   William Firenze — UI, game wiring and leaderboard
   ========================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------------
     INDIRIZZO DELLA CLASSIFICA
     ---------------------------------------------------------------
     Il sito e' statico: a scrivere i punteggi in data/leaderboard.json
     ci pensa il Cloudflare Worker in worker/leaderboard.js, che e'
     l'unico posto dove vive il token GitHub.

     Incolla qui l'indirizzo del Worker, senza barra finale, es.:
       var API = 'https://rollback-leaderboard.williamfirenze.workers.dev';

     Finche' resta vuoto il sito funziona lo stesso: la classifica viene
     letta dal file statico del repo e il salvataggio e' disattivato.
     --------------------------------------------------------------- */
  var API = 'https://rollback-leaderboard.overeyeinfo.workers.dev';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var LS = { best: 'rb_best', name: 'rb_name' };
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* =======================================================
     1 · scroll
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
     2 · reveal on scroll
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
     3 · leaderboard
     ======================================================= */
  var live = !!API;

  function fetchBoard() {
    if (live) {
      return fetch(API + '/', { headers: { 'Content-Type': 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function () { return fetchStatic(); });
    }
    return fetchStatic();
  }

  // il file versionato nel repo: percorso relativo, va bene anche in sottocartella
  function fetchStatic() {
    return fetch('data/leaderboard.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        return { entries: Array.isArray(list) ? list : (list.entries || []), source: 'static' };
      })
      .catch(function () { return { entries: [], source: 'static' }; });
  }

  function submitScore(name, score, seconds) {
    return fetch(API + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, score: score, seconds: seconds })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  function srcLabel(source) {
    return source === 'github' ? 'live' : 'read-only';
  }

  function renderBoard(el, entries, mine, limit) {
    if (!el) return;
    el.innerHTML = '';
    if (!entries || !entries.length) {
      var li = document.createElement('li');
      li.className = 'lb__empty mono';
      li.textContent = 'no scores yet. be the first.';
      el.appendChild(li);
      return;
    }
    entries.slice(0, limit || 10).forEach(function (e, i) {
      var li = document.createElement('li');
      if (i < 3) li.className = 'top';
      if (mine && String(e.name).toUpperCase() === String(mine).toUpperCase()) li.className += ' me';
      var r = document.createElement('span'); r.className = 'r'; r.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);
      var n = document.createElement('span'); n.className = 'n'; n.textContent = e.name;
      var s = document.createElement('span'); s.className = 's'; s.textContent = e.score;
      li.appendChild(r); li.appendChild(n); li.appendChild(s);
      el.appendChild(li);
    });
  }

  var teaserBoard = $('#teaserBoard');
  function loadTeaser() {
    fetchBoard().then(function (d) { renderBoard(teaserBoard, d.entries, get(LS.name, ''), 5); });
  }
  loadTeaser();

  /* =======================================================
     4 · ROLLBACK
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
      newBest   = $('#newBest'),
      saveForm  = $('#saveForm'),
      nameInput = $('#playerName'),
      saveBtn   = $('#saveBtn'),
      saveMsg   = $('#saveMsg'),
      gameBoard = $('#gameBoard'),
      boardSrc  = $('#boardSrc'),
      teaserBest = $('#teaserBest');

  var best = parseInt(get(LS.best, '0'), 10) || 0;
  var game = null, lastScore = 0, lastSeconds = 0, savedThisRound = false;

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
      onOver: function (score, seconds) { gameOver(score, seconds); }
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
    newBest.hidden = true;
    saveMsg.textContent = '';
    saveMsg.className = 'g-msg mono';
    savedThisRound = false;
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

  function gameOver(score, seconds) {
    lastScore = score;
    lastSeconds = seconds || 0;
    gTip.hidden = true;
    var beaten = score > best && score > 0;
    if (beaten) { best = score; set(LS.best, String(best)); }
    paintBest();
    overScore.textContent = score;
    newBest.hidden = !beaten;
    scrOver.hidden = false;

    // si salva solo se c'e' qualcosa da salvare e se il Worker e' configurato
    saveForm.hidden = !(live && score > 0);
    if (!saveForm.hidden) {
      nameInput.value = get(LS.name, '');
      if (!nameInput.value) setTimeout(function () { nameInput.focus(); }, 180);
    }

    if (boardSrc) boardSrc.textContent = '';
    renderBoard(gameBoard, null);
    fetchBoard().then(function (d) {
      renderBoard(gameBoard, d.entries, get(LS.name, ''), 12);
      if (boardSrc) boardSrc.textContent = srcLabel(d.source);
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
      saveMsg.textContent = 'at least 2 characters';
      return;
    }
    var name = raw.toUpperCase();
    set(LS.name, name);
    savedThisRound = true;
    saveBtn.disabled = true;
    saveMsg.className = 'g-msg mono';
    saveMsg.textContent = 'saving…';

    submitScore(name, lastScore, lastSeconds)
      .then(function (d) {
        saveMsg.className = 'g-msg mono ok';
        if (d.written === false && d.reason === 'not-a-personal-best') {
          saveMsg.textContent = 'your best is still ' + d.best + ' · #' + d.rank;
        } else if (d.written === false) {
          saveMsg.textContent = 'not in the top 100 yet — keep trying';
        } else {
          saveMsg.textContent = 'saved' + (d.rank ? ' · #' + d.rank : '');
        }
        renderBoard(gameBoard, d.entries, name, 12);
        if (boardSrc) boardSrc.textContent = srcLabel(d.source);
        loadTeaser();
      })
      .catch(function (err) {
        savedThisRound = false;
        saveBtn.disabled = false;
        saveMsg.className = 'g-msg mono err';
        saveMsg.textContent = String(err.message || err).slice(0, 60);
      });
  });

  /* small easter egg: typing "sql" opens the game */
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
