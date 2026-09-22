/* =========================================================
   ROLLBACK — a game by William Firenze
   One button: reverse direction.
   Grab the green COMMITs, dodge the red LOCKs, sweep with the VACUUM.

   Regola di progetto: non si puo' morire schiacciati.
   Un lock non si avvicina MAI al giocatore di sua iniziativa oltre
   SAFE_GAP: rimbalza. Si muore solo andandogli addosso.
   Cosi' il punteggio non ha tetto: il limite e' l'abilita'.
   ========================================================= */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;

  /* cuscinetto invalicabile dalla deriva dei lock (radianti) */
  var SAFE_GAP = 0.46;
  /* rete di sicurezza finale: sotto questo corridoio un lock viene liberato */
  var MIN_ARC  = 0.80;

  var COL = {
    ink:   '#0b0b0c',
    track: '#e6e7ea',
    grid:  '#f2f3f5',
    ok:    '#16a34a',
    okSoft:'#bbf0cf',
    bad:   '#e0402b',
    badSoft:'#f7c6bf',
    gold:  '#e9a80c',
    mute:  '#9aa0a8'
  };

  /* ---------- helpers ---------- */
  function norm(a){ a %= TAU; return a < 0 ? a + TAU : a; }
  function angDist(a, b){ var d = Math.abs(norm(a) - norm(b)); return d > Math.PI ? TAU - d : d; }
  function rand(a, b){ return a + Math.random() * (b - a); }
  function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }

  /* ---------- audio ---------- */
  var Audio2 = {
    ctx: null, on: true,
    boot: function(){
      if (this.ctx) return;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (AC) { try { this.ctx = new AC(); } catch (e) { this.ctx = null; } }
    },
    beep: function(freq, dur, type, vol){
      if (!this.on || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + (dur || 0.12) + 0.03);
    },
    slide: function(f1, f2, dur){
      if (!this.on || !this.ctx) return;
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    }
  };

  /* ---------- engine ---------- */
  function Rollback(canvas, opts){
    this.cv = canvas;
    this.cx = canvas.getContext('2d');
    this.opts = opts || {};
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.raf = null;
    this.last = 0;
    this.alive = false;
    this.paused = false;
    this.s = null;
    this._bind();
    this.resize();
    this.drawIdle();
  }

  Rollback.prototype._bind = function(){
    var self = this;
    this._onResize = function(){ self.resize(); if (!self.alive) self.drawIdle(); };
    global.addEventListener('resize', this._onResize);

    this._onKey = function(e){
      if (!self.alive) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Enter') {
        e.preventDefault();
        self.flip();
      } else if (e.key === 'm' || e.key === 'M') {
        Audio2.on = !Audio2.on;
      }
    };
    global.addEventListener('keydown', this._onKey, { passive: false });

    this._onPointer = function(e){
      if (!self.alive) return;
      e.preventDefault();
      self.flip();
    };
    this.cv.addEventListener('pointerdown', this._onPointer);

    this._onVis = function(){ self.paused = document.hidden; self.last = 0; };
    document.addEventListener('visibilitychange', this._onVis);
  };

  Rollback.prototype.destroy = function(){
    global.removeEventListener('resize', this._onResize);
    global.removeEventListener('keydown', this._onKey);
    document.removeEventListener('visibilitychange', this._onVis);
    this.cv.removeEventListener('pointerdown', this._onPointer);
    if (this.raf) cancelAnimationFrame(this.raf);
  };

  Rollback.prototype.resize = function(){
    var r = this.cv.getBoundingClientRect();
    var w = Math.max(240, r.width), h = Math.max(240, r.height);
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.cv.width  = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.w = w; this.h = h;
    this.cx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.geo();
  };

  Rollback.prototype.geo = function(){
    this.ox = this.w / 2;
    this.oy = this.h / 2;
    this.R  = Math.min(this.w, this.h) * 0.335;
    this.pr = clamp(this.R * 0.055, 6, 11);
    this.cr = clamp(this.R * 0.048, 5, 9.5);
    this.lw = clamp(this.R * 0.085, 8, 16);
  };

  /* ---------- state ---------- */
  Rollback.prototype.reset = function(){
    this.s = {
      t: 0, score: 0, picked: 0,
      a: -Math.PI / 2, dir: 1, spd: 1.75,
      trail: [],
      commits: [],
      locks: [],
      vac: null,
      parts: [],
      combo: 0, comboT: 0, mult: 1,
      shake: 0, flash: 0, pulse: 0, ringPulse: 0,
      spawnCd: 0, reliefCd: 0,
      dying: 0, dead: false,
      popups: []
    };
    this.spawnCommit();
  };

  Rollback.prototype.start = function(){
    Audio2.boot();
    this.reset();
    this.alive = true;
    this.paused = false;
    this.last = 0;
    var self = this;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(function (t) { self.loop(t); });
    Audio2.beep(520, .09, 'square', .05);
    setTimeout(function(){ Audio2.beep(780, .12, 'square', .05); }, 90);
  };

  Rollback.prototype.stop = function(){
    this.alive = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  };

  Rollback.prototype.level = function(){ return Math.floor(this.s.score / 8); };

  /* ---------- geometria del giocatore ---------- */
  Rollback.prototype.forward = function(a){
    var s = this.s;
    return norm((norm(a) - norm(s.a)) * s.dir);
  };
  /* arco raggiungibile dal giocatore, nei due versi */
  Rollback.prototype.freeArc = function(){
    var s = this.s, cw = Math.PI, ccw = Math.PI;
    for (var i = 0; i < s.locks.length; i++) {
      var L = s.locks[i];
      if (L.arm < 1) continue;
      var a = norm(L.ang - L.half - s.a);
      var b = norm(s.a - (L.ang + L.half));
      if (a < cw) cw = a;
      if (b < ccw) ccw = b;
    }
    return { cw: cw, ccw: ccw, span: cw + ccw };
  };

  /* ---------- spawning ---------- */
  /* restituisce null se non esiste un punto valido: meglio non generare
     nulla che piazzare un lock addosso al giocatore */
  Rollback.prototype.freeAngle = function(minFromPlayer, minAhead){
    var s = this.s, tries = 0, a;
    minFromPlayer = minFromPlayer || 0.9;
    while (tries++ < 200) {
      a = rand(0, TAU);
      if (angDist(a, s.a) < minFromPlayer) continue;
      if (minAhead && this.forward(a) < minAhead) continue;
      var bad = false, i;
      for (i = 0; i < s.locks.length; i++) {
        if (angDist(a, s.locks[i].ang) < s.locks[i].half + 0.42) { bad = true; break; }
      }
      if (bad) continue;
      for (i = 0; i < s.commits.length; i++) {
        if (angDist(a, s.commits[i].ang) < 0.5) { bad = true; break; }
      }
      if (bad) continue;
      if (s.vac && angDist(a, s.vac.ang) < 0.5) continue;
      return a;
    }
    return null;
  };

  Rollback.prototype.spawnCommit = function(){
    var a = this.freeAngle(0.85);
    var C = { ang: a === null ? norm(this.s.a + this.s.dir * 1.1) : a, born: this.s.t, stuck: 0 };
    this.s.commits.push(C);
    this.place(C, this.freeArc());
  };

  Rollback.prototype.lockTarget = function(){
    if (this.s.t < 1.5) return 0;
    return Math.min(1 + Math.floor(this.s.score / 9), 5);
  };

  Rollback.prototype.spawnLock = function(){
    var s = this.s, lv = this.level();
    var half = clamp(0.13 + lv * 0.004, 0.13, 0.155);

    /* tetto alla porzione di anello occupabile: ~25% */
    var used = 0;
    for (var i = 0; i < s.locks.length; i++) used += s.locks[i].half * 2;
    if (used + half * 2 > 1.6) return false;

    /* mai davanti al naso: almeno ~1.15s di volo prima di arrivarci */
    var a = this.freeAngle(1.2, clamp(s.spd * 1.15 + half, 1.4, 2.7));
    if (a === null) return false;

    var mag = Math.min(rand(0.12, 0.28) * (1 + lv * 0.07), 1.0);
    s.locks.push({
      ang: a,
      half: half,
      arm: 0,
      drift: (Math.random() < 0.5 ? -1 : 1) * mag,
      wob: rand(0, TAU),
      flee: 0
    });
    return true;
  };

  Rollback.prototype.spawnVac = function(){
    var a = this.freeAngle(1.2);
    if (a === null) return;
    this.s.vac = { ang: a, life: 7.5, age: 0 };
  };

  /* ---------- input ---------- */
  Rollback.prototype.flip = function(){
    var s = this.s;
    if (!s || s.dead) return;
    s.dir *= -1;
    s.ringPulse = 1;
    this.burst(this.px(), this.py(), 7, COL.ink, 1.1);
    Audio2.beep(s.dir > 0 ? 330 : 262, .05, 'triangle', .035);
  };

  Rollback.prototype.px = function(){ return this.ox + Math.cos(this.s.a) * this.R; };
  Rollback.prototype.py = function(){ return this.oy + Math.sin(this.s.a) * this.R; };

  /* ---------- particles ---------- */
  Rollback.prototype.burst = function(x, y, n, color, power){
    var s = this.s;
    for (var i = 0; i < n; i++) {
      var an = rand(0, TAU), sp = rand(40, 190) * (power || 1);
      s.parts.push({
        x: x, y: y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp,
        life: rand(.32, .72), max: .72, c: color, r: rand(1.4, 3.4)
      });
    }
    if (s.parts.length > 340) s.parts.splice(0, s.parts.length - 340);
  };

  Rollback.prototype.popup = function(x, y, text, color){
    this.s.popups.push({ x: x, y: y, t: 0, text: text, c: color });
  };

  /* ---------- loop ---------- */
  Rollback.prototype.loop = function(ts){
    var self = this;
    this.raf = requestAnimationFrame(function (t) { self.loop(t); });
    if (!this.last) { this.last = ts; return; }
    var dt = (ts - this.last) / 1000;
    this.last = ts;
    if (this.paused) return;
    dt = Math.min(dt, 1 / 30);
    this.update(dt);
    this.draw();
  };

  Rollback.prototype.update = function(dt){
    var s = this.s, i, lv = this.level();
    s.t += dt;
    s.pulse += dt;
    s.ringPulse = Math.max(0, s.ringPulse - dt * 3.2);
    s.shake = Math.max(0, s.shake - dt * 3.4);
    s.flash = Math.max(0, s.flash - dt * 2.6);

    if (s.dead) {
      s.dying += dt;
      this.stepParts(dt);
      if (s.dying > 0.85 && !s.reported) {
        s.reported = true;
        this.stop();
        if (this.opts.onOver) this.opts.onOver(s.score, s.t);
      }
      return;
    }

    /* la difficolta' sale sulla velocita', non sullo spazio tolto */
    s.spd = Math.min(1.75 + lv * 0.095, 4.2);

    s.a = norm(s.a + s.dir * s.spd * dt);
    s.trail.unshift({ a: s.a, d: s.dir });
    if (s.trail.length > 16) s.trail.pop();

    if (s.combo > 0) {
      s.comboT -= dt;
      if (s.comboT <= 0) { s.combo = 0; s.mult = 1; this.hud(); }
    }

    var killGap = this.pr / this.R * 0.85;

    /* ---- lock: innesco e deriva, con cuscinetto invalicabile ---- */
    for (i = 0; i < s.locks.length; i++) {
      var L = s.locks[i];

      /* un lock non si arma mai sotto ai piedi del giocatore:
         resta a lampeggiare finche' non si e' allontanato */
      if (L.arm < 1) {
        var next = L.arm + dt / 0.95;
        if (next >= 1 && angDist(s.a, L.ang) - L.half < killGap + 0.14) L.arm = 0.92;
        else L.arm = Math.min(1, next);
      }

      L.wob += dt;
      if (L.flee > 0) L.flee -= dt;

      var speed = L.drift * (L.flee > 0 ? 1.7 : 1) * (1 + Math.sin(L.wob * 0.7) * 0.25);
      var cand    = norm(L.ang + speed * dt);
      var gapNow  = angDist(s.a, L.ang) - L.half;
      var gapNext = angDist(s.a, cand)  - L.half;

      if (gapNext < gapNow && gapNext < SAFE_GAP) {
        /* si sta chiudendo addosso: rimbalza e si allontana per un po' */
        L.drift = -L.drift;
        L.flee = 0.55;
      } else {
        L.ang = cand;
      }
    }

    /* ---- nuovi lock, uno per volta ---- */
    s.spawnCd -= dt;
    if (s.spawnCd <= 0 && s.locks.length < this.lockTarget()) {
      s.spawnCd = this.spawnLock() ? 0.9 : 0.45;
    }

    /* ---- rete di sicurezza finale ---- */
    if (s.reliefCd > 0) s.reliefCd -= dt;
    var arc = this.freeArc();
    if (arc.span < MIN_ARC && s.reliefCd <= 0) {
      this.relief();
      s.reliefCd = 1.4;
      arc = this.freeArc();
    }

    /* ---- commit ---- */
    for (i = s.commits.length - 1; i >= 0; i--) {
      var C = s.commits[i];
      if (angDist(s.a, C.ang) < (this.pr + this.cr) / this.R + 0.012) {
        s.commits.splice(i, 1);
        this.pick(C.ang);
        continue;
      }
      if (this.unreachable(C, arc)) {
        C.stuck += dt;
        if (C.stuck > 1.6) { this.place(C, arc); C.stuck = 0; }
      } else {
        C.stuck = 0;
      }
    }
    if (s.commits.length === 0) this.spawnCommit();

    /* ---- vacuum ---- */
    if (s.vac) {
      s.vac.age += dt;
      s.vac.life -= dt;
      if (angDist(s.a, s.vac.ang) < (this.pr + this.cr * 1.25) / this.R + 0.015) this.vacuum();
      else if (s.vac.life <= 0) s.vac = null;
    }

    /* ---- collisione: si muore solo andandoci addosso ---- */
    for (i = 0; i < s.locks.length; i++) {
      var K = s.locks[i];
      if (K.arm < 1) continue;
      if (angDist(s.a, K.ang) < K.half + killGap) { this.die(K.ang); return; }
    }

    this.stepParts(dt);
  };

  /* un commit e' irraggiungibile se sta oltre un lock armato, in entrambi i versi */
  Rollback.prototype.unreachable = function(C, arc){
    var s = this.s;
    var cush = (this.pr + this.cr) / this.R + 0.06;
    var fwd = norm(C.ang - s.a), bwd = norm(s.a - C.ang);
    return !(fwd <= Math.max(0, arc.cw - cush) || bwd <= Math.max(0, arc.ccw - cush));
  };

  /* lo sposta dentro l'arco raggiungibile */
  Rollback.prototype.place = function(C, arc){
    var s = this.s;
    var cush = (this.pr + this.cr) / this.R + 0.06;
    if (!this.unreachable(C, arc)) return;
    var room = Math.max(arc.cw, arc.ccw) - cush;
    if (room <= 0.1) return;
    var sign = arc.cw >= arc.ccw ? 1 : -1;
    this.burst(this.ox + Math.cos(C.ang) * this.R, this.oy + Math.sin(C.ang) * this.R, 5, COL.okSoft, .6);
    C.ang = norm(s.a + sign * rand(room * 0.45, room * 0.92));
  };

  /* libera il lock piu' vicino: non si muore mai in gabbia */
  Rollback.prototype.relief = function(){
    var s = this.s, best = -1, bestd = Infinity, i;
    for (i = 0; i < s.locks.length; i++) {
      var L = s.locks[i];
      if (L.arm < 1) continue;
      var d = Math.min(norm(L.ang - L.half - s.a), norm(s.a - (L.ang + L.half)));
      if (d < bestd) { bestd = d; best = i; }
    }
    if (best < 0) return;
    var K = s.locks[best];
    var x = this.ox + Math.cos(K.ang) * this.R, y = this.oy + Math.sin(K.ang) * this.R;
    s.locks.splice(best, 1);
    this.burst(x, y, 16, COL.badSoft, 1.3);
    this.popup(x, y, 'LOCK RELEASED', COL.bad);
    Audio2.beep(190, .14, 'triangle', .05);
  };

  Rollback.prototype.stepParts = function(dt){
    var s = this.s, i;
    for (i = s.parts.length - 1; i >= 0; i--) {
      var p = s.parts[i];
      p.life -= dt;
      if (p.life <= 0) { s.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
    }
    for (i = s.popups.length - 1; i >= 0; i--) {
      s.popups[i].t += dt;
      if (s.popups[i].t > 0.85) s.popups.splice(i, 1);
    }
  };

  Rollback.prototype.pick = function(ang){
    var s = this.s;
    s.combo++;
    s.comboT = 2.7;
    s.mult = Math.min(5, 1 + Math.floor(s.combo / 4));
    s.score += s.mult;
    s.picked++;
    s.pulse = 0;

    var x = this.ox + Math.cos(ang) * this.R, y = this.oy + Math.sin(ang) * this.R;
    this.burst(x, y, 12, COL.ok, 1);
    if (s.mult > 1) this.popup(x, y, '+' + s.mult, COL.ok);
    Audio2.beep(420 + Math.min(s.combo, 16) * 26, .07, 'square', .045);

    if (s.picked % 12 === 0 && !s.vac) this.spawnVac();
    this.hud();
  };

  Rollback.prototype.vacuum = function(){
    var s = this.s;
    var x = this.ox + Math.cos(s.vac.ang) * this.R, y = this.oy + Math.sin(s.vac.ang) * this.R;
    s.vac = null;
    s.score += 5;
    s.locks.length = 0;
    s.shake = 0.7;
    s.spawnCd = 1.6;            // un attimo di respiro vero
    this.burst(x, y, 34, COL.gold, 1.8);
    this.burst(this.ox, this.oy, 26, COL.gold, 2.4);
    this.popup(x, y, 'VACUUM +5', COL.gold);
    Audio2.slide(240, 1400, .3);
    this.hud();
  };

  Rollback.prototype.die = function(ang){
    var s = this.s;
    s.dead = true; s.dying = 0; s.shake = 1; s.flash = 1;
    var x = this.ox + Math.cos(ang) * this.R, y = this.oy + Math.sin(ang) * this.R;
    this.burst(this.px(), this.py(), 30, COL.ink, 1.7);
    this.burst(x, y, 22, COL.bad, 1.4);
    Audio2.slide(340, 48, .45);
  };

  Rollback.prototype.hud = function(){
    if (this.opts.onHud) this.opts.onHud(this.s.score, this.s.mult);
  };

  /* ---------- drawing ---------- */
  Rollback.prototype.drawIdle = function(){
    var c = this.cx;
    c.clearRect(0, 0, this.w, this.h);
    this.bg(c);
    c.save();
    c.globalAlpha = 0.55;
    c.strokeStyle = COL.track; c.lineWidth = 2;
    c.beginPath(); c.arc(this.ox, this.oy, this.R, 0, TAU); c.stroke();
    c.restore();
  };

  Rollback.prototype.bg = function(c){
    var step = 26, ox = this.ox % step, oy = this.oy % step;
    c.save();
    c.fillStyle = COL.grid;
    for (var x = ox; x < this.w; x += step) {
      for (var y = oy; y < this.h; y += step) c.fillRect(x, y, 1.4, 1.4);
    }
    c.restore();
  };

  Rollback.prototype.draw = function(){
    var c = this.cx, s = this.s, i;
    c.clearRect(0, 0, this.w, this.h);

    c.save();
    if (s.shake > 0) {
      var m = s.shake * 9;
      c.translate(rand(-m, m), rand(-m, m));
    }

    this.bg(c);

    var R = this.R, ox = this.ox, oy = this.oy;

    c.strokeStyle = COL.track;
    c.lineWidth = 2 + s.ringPulse * 3;
    c.globalAlpha = 1;
    c.beginPath(); c.arc(ox, oy, R, 0, TAU); c.stroke();

    if (s.ringPulse > 0) {
      c.save();
      c.globalAlpha = s.ringPulse * 0.28;
      c.strokeStyle = COL.ink; c.lineWidth = 1.5;
      c.beginPath(); c.arc(ox, oy, R + (1 - s.ringPulse) * 26, 0, TAU); c.stroke();
      c.restore();
    }

    c.lineCap = 'butt';
    for (i = 0; i < s.locks.length; i++) {
      var L = s.locks[i];
      if (L.arm < 1) {
        c.save();
        c.globalAlpha = 0.28 + L.arm * 0.5;
        c.setLineDash([5, 6]);
        c.strokeStyle = COL.badSoft;
        c.lineWidth = this.lw * (0.55 + L.arm * 0.45);
        c.beginPath(); c.arc(ox, oy, R, L.ang - L.half, L.ang + L.half); c.stroke();
        c.restore();
      } else {
        c.save();
        c.strokeStyle = COL.bad;
        c.lineWidth = this.lw;
        c.beginPath(); c.arc(ox, oy, R, L.ang - L.half, L.ang + L.half); c.stroke();
        c.globalAlpha = .35; c.strokeStyle = '#fff'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(ox, oy, R, L.ang - L.half * 0.45, L.ang + L.half * 0.45); c.stroke();
        c.restore();
      }
    }
    c.lineCap = 'round';

    for (i = 0; i < s.commits.length; i++) {
      var C = s.commits[i];
      var cxp = ox + Math.cos(C.ang) * R, cyp = oy + Math.sin(C.ang) * R;
      var puls = 1 + Math.sin(s.t * 6 + i) * 0.12;
      c.save();
      c.globalAlpha = .22;
      c.fillStyle = COL.ok;
      c.beginPath(); c.arc(cxp, cyp, this.cr * 2.3 * puls, 0, TAU); c.fill();
      c.restore();
      c.fillStyle = COL.ok;
      c.beginPath(); c.arc(cxp, cyp, this.cr * puls, 0, TAU); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(cxp, cyp, this.cr * 0.34, 0, TAU); c.fill();
    }

    if (s.vac) {
      var vx = ox + Math.cos(s.vac.ang) * R, vy = oy + Math.sin(s.vac.ang) * R;
      var fade = s.vac.life < 2 ? (0.4 + 0.6 * Math.abs(Math.sin(s.t * 9))) : 1;
      c.save();
      c.globalAlpha = fade;
      c.translate(vx, vy); c.rotate(s.t * 2.4);
      c.strokeStyle = COL.gold; c.lineWidth = 2.6;
      c.setLineDash([4, 5]);
      c.beginPath(); c.arc(0, 0, this.cr * 2.1, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.fillStyle = COL.gold;
      c.beginPath(); c.arc(0, 0, this.cr * 0.95, 0, TAU); c.fill();
      c.restore();
    }

    for (i = s.trail.length - 1; i >= 1; i--) {
      var a0 = s.trail[i].a, a1 = s.trail[i - 1].a;
      if (angDist(a0, a1) > 0.6) continue;
      c.save();
      c.globalAlpha = (1 - i / s.trail.length) * 0.33;
      c.strokeStyle = COL.ink;
      c.lineWidth = this.pr * 1.5 * (1 - i / s.trail.length);
      c.beginPath();
      c.arc(ox, oy, R, Math.min(a0, a1), Math.max(a0, a1));
      c.stroke();
      c.restore();
    }

    if (!s.dead) {
      var pxv = this.px(), pyv = this.py();
      c.save();
      c.shadowColor = 'rgba(11,11,12,.3)'; c.shadowBlur = 12; c.shadowOffsetY = 2;
      c.fillStyle = COL.ink;
      c.beginPath(); c.arc(pxv, pyv, this.pr, 0, TAU); c.fill();
      c.restore();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(pxv, pyv, this.pr * 0.3, 0, TAU); c.fill();
    }

    for (i = 0; i < s.parts.length; i++) {
      var p = s.parts[i];
      c.save();
      c.globalAlpha = clamp(p.life / p.max, 0, 1);
      c.fillStyle = p.c;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
      c.restore();
    }

    var big = Math.max(30, Math.min(this.R * 0.7, 76));
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = COL.ink;
    c.font = '700 ' + big + 'px "JetBrains Mono", ui-monospace, monospace';
    c.fillText(String(s.score), ox, oy - big * 0.06);
    c.fillStyle = COL.mute;
    c.font = '500 ' + Math.max(9, big * 0.16) + 'px "JetBrains Mono", ui-monospace, monospace';
    c.fillText('LV ' + (this.level() + 1) + (s.mult > 1 ? '   ×' + s.mult : ''), ox, oy + big * 0.52);
    c.restore();

    for (i = 0; i < s.popups.length; i++) {
      var q = s.popups[i];
      c.save();
      c.globalAlpha = 1 - q.t / 0.85;
      c.fillStyle = q.c;
      c.textAlign = 'center';
      c.font = '700 13px "JetBrains Mono", ui-monospace, monospace';
      c.fillText(q.text, q.x, q.y - 16 - q.t * 26);
      c.restore();
    }

    c.restore();

    if (s.flash > 0) {
      c.save();
      c.globalAlpha = s.flash * 0.22;
      c.fillStyle = COL.bad;
      c.fillRect(0, 0, this.w, this.h);
      c.restore();
    }
  };

  global.Rollback = {
    create: function(canvas, opts){ return new Rollback(canvas, opts); },
    audio: Audio2
  };

})(window);
