/* =========================================================
   William Firenze — UI and game wiring
   ========================================================= */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var LS = { best: 'rb_best' };
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
     3 · ROLLBACK
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
      teaserBest = $('#teaserBest');

  var best = parseInt(get(LS.best, '0'), 10) || 0;
  var game = null;

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
  }

  function play() {
    scrStart.hidden = true;
    scrOver.hidden = true;
    newBest.hidden = true;
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
    gTip.hidden = true;
    var beaten = score > best && score > 0;
    if (beaten) { best = score; set(LS.best, String(best)); }
    paintBest();
    overScore.textContent = score;
    newBest.hidden = !beaten;
    scrOver.hidden = false;
  }

  $$('[data-open-game]').forEach(function (b) { b.addEventListener('click', openGame); });
  $$('[data-close-game]').forEach(function (b) { b.addEventListener('click', closeGame); });
  $('#btnStart').addEventListener('click', play);
  $('#btnRetry').addEventListener('click', play);

  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') { closeGame(); return; }
    if (e.code === 'Space' && (!scrStart.hidden || !scrOver.hidden)) {
      e.preventDefault();
      play();
    }
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
