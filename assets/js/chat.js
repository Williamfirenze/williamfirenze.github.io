/* =========================================================
   Ask William — assistente sulla knowledge base
   Tutto nel browser: nessuna API, nessun dato che esce.
   ========================================================= */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  var gate = $('#gate'), chat = $('#chat'), stream = $('#stream'), scroll = $('#scroll');
  var codeForm = $('#codeForm'), codeInput = $('#codeInput'), gateMsg = $('#gateMsg');
  var sendForm = $('#sendForm'), input = $('#input'), sendBtn = $('#sendBtn');
  var who = $('#who'), kbTag = $('#kbTag'), btnOut = $('#btnOut'), barSub = $('#barSub');

  var KBD = { articles: [], index: [], meta: {} };
  var profile = null;
  var ctx = { article: null, lastResults: [] };

  /* ---------- util ---------- */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  async function sha256(str) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function toBottom() { scroll.scrollTop = scroll.scrollHeight; }

  /* ---------- rendering messaggi ---------- */
  function bubble(html, mine) {
    var m = document.createElement('div');
    m.className = 'msg' + (mine ? ' msg--me' : '');
    var av = document.createElement('div');
    av.className = 'msg__av';
    if (mine) {
      av.textContent = (profile && profile.name ? profile.name : '?').slice(0, 2).toUpperCase();
    } else {
      var img = document.createElement('img');
      img.src = 'assets/img/william.jpg'; img.alt = 'William';
      av.appendChild(img);
    }
    var body = document.createElement('div');
    body.className = 'msg__body';
    var b = document.createElement('div');
    b.className = 'bubble';
    b.innerHTML = html;
    body.appendChild(b);
    m.appendChild(av); m.appendChild(body);
    stream.appendChild(m);
    toBottom();
    return b;
  }

  function typing() {
    var b = bubble('<span class="typing"><i></i><i></i><i></i></span>');
    return b.parentElement.parentElement;
  }

  function codeBlock(text) {
    return '<div class="code"><button class="code__copy" type="button" data-copy>COPY</button><pre>' +
      esc(text) + '</pre></div>';
  }

  function chips(items) {
    if (!items.length) return '';
    return '<div class="chips2">' + items.map(function (t) {
      return '<button class="chip2" type="button" data-ask="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('') + '</div>';
  }

  function list(arr, ordered) {
    if (!arr || !arr.length) return '';
    var tag = ordered ? 'ol' : 'ul';
    return '<' + tag + '>' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</' + tag + '>';
  }

  /* ---------- formattazione di un articolo ---------- */
  function stepsHtml(res) {
    if (!res || !res.length) return '';
    var out = '<ol>';
    res.forEach(function (s) {
      if (typeof s === 'string') { out += '<li>' + esc(s) + '</li>'; return; }
      out += '<li>' + esc(s.step || '');
      if (s.note) out += '<br><span style="opacity:.75">' + esc(s.note) + '</span>';
      out += '</li>';
      if (s.command) out += codeBlock(s.command);
    });
    return out + '</ol>';
  }

  function commandsOf(a) {
    var cmds = [];
    (a.resolution || []).forEach(function (s) { if (s && s.command) cmds.push(s.command); });
    (a.verification || []).forEach(function (s) { if (s && s.command) cmds.push(s.command); });
    return cmds;
  }

  function sourceLine(a) {
    var bits = [];
    if (a.id) bits.push('id: ' + a.id);
    if (a.updated) bits.push('updated: ' + a.updated);
    if (a.products && a.products.length) bits.push(a.products.join(', '));
    if (a.severity) bits.push('severity: ' + a.severity);
    return '<div class="src">' + bits.map(esc).join('<span>·</span>') + '</div>';
  }

  function followUps(a) {
    var out = [];
    if (commandsOf(a).length) out.push('Show me the commands');
    if (a.verification && a.verification.length) out.push('How do I verify it worked?');
    if (a.rollback) out.push('What if it goes wrong?');
    if (a.cause) out.push('What causes this?');
    if (a.prevention && a.prevention.length) out.push('How do I prevent it?');
    return out.slice(0, 4);
  }

  function fullAnswer(a) {
    var h = '<h4>' + esc(a.title || a.id) + '</h4>';
    if (a.summary) h += '<p>' + esc(a.summary) + '</p>';
    if (a.symptoms && a.symptoms.length) { h += '<h4>Symptoms</h4>' + list(a.symptoms); }
    if (a.cause) { h += '<h4>Cause</h4><p>' + esc(a.cause) + '</p>'; }
    if (a.resolution && a.resolution.length) { h += '<h4>Resolution</h4>' + stepsHtml(a.resolution); }
    h += sourceLine(a);
    h += chips(followUps(a));
    return h;
  }

  function sectionAnswer(a, intent) {
    var h = '', none = false;
    switch (intent) {
      case 'commands':
        var c = commandsOf(a);
        if (!c.length) { none = true; break; }
        h = '<h4>Commands · ' + esc(a.title || a.id) + '</h4>' + c.map(codeBlock).join('');
        break;
      case 'verification':
        if (!a.verification || !a.verification.length) { none = true; break; }
        h = '<h4>How to verify</h4>' + stepsHtml(a.verification);
        break;
      case 'rollback':
        if (!a.rollback) { none = true; break; }
        h = '<h4>If it goes wrong</h4><p>' + esc(a.rollback) + '</p>';
        break;
      case 'cause':
        if (!a.cause) { none = true; break; }
        h = '<h4>Cause</h4><p>' + esc(a.cause) + '</p>';
        break;
      case 'prevention':
        if (!a.prevention || !a.prevention.length) { none = true; break; }
        h = '<h4>Prevention</h4>' + list(a.prevention);
        break;
      case 'symptoms':
        if (!a.symptoms || !a.symptoms.length) { none = true; break; }
        h = '<h4>Symptoms</h4>' + list(a.symptoms);
        break;
      case 'references':
        if (!a.references || !a.references.length) { none = true; break; }
        h = '<h4>References</h4>' + list(a.references);
        break;
      case 'steps':
        if (!a.resolution || !a.resolution.length) { none = true; break; }
        h = '<h4>Resolution · ' + esc(a.title || a.id) + '</h4>' + stepsHtml(a.resolution);
        break;
      default:
        none = true;
    }
    if (none) {
      return '<p>That section isn\'t filled in for <strong>' + esc(a.title || a.id) +
        '</strong>. Here\'s everything I have on it.</p>' + fullAnswer(a);
    }
    return h + sourceLine(a) + chips(followUps(a));
  }

  /* ---------- risposta ---------- */
  function answer(text) {
    var intent = KB.intentOf(text);
    var only = KB.sectionOnly(text);

    // "mostrami i comandi": chiede una sezione e nient'altro -> resta sull'articolo aperto
    if (only && ctx.article) return sectionAnswer(ctx.article, only);

    var res = KB.search(KBD.index, text, 5);
    ctx.lastResults = res;

    var top = res[0];
    var strong = top && (KB.codesIn(text).length > 0 || top.hits >= 2 || top.coverage >= 0.5);

    if (!strong) {
      // parla di qualcosa che la knowledge base non copre affatto
      if (KB.vocabCoverage(KBD.index, text) < 0.5) return notFound(text);
      if (ctx.article && intent) return sectionAnswer(ctx.article, intent);
      if (!top) return notFound(text);
    }

    var second = res[1];
    var clear = !second || top.score > second.score * 1.45;

    // confidenza bassa: chiedi quale
    if (!clear && res.length > 1) {
      var opts = res.slice(0, 4).map(function (r) { return r.article.title || r.article.id; });
      return '<p>I have a few runbooks that could match. Which one?</p>' + chips(opts);
    }

    ctx.article = top.article;
    var h = intent && intent !== 'steps' ? sectionAnswer(top.article, intent) : fullAnswer(top.article);

    if (second && second.score > top.score * 0.55) {
      h += '<p style="margin-top:12px;font-size:13px;opacity:.75">Related: <strong>' +
        esc(second.article.title || second.article.id) + '</strong></p>' +
        chips([second.article.title || second.article.id]);
    }
    return h;
  }

  function notFound(text) {
    var codes = KB.codesIn(text);
    var h = '<p>I don\'t have anything on that yet.</p>';
    if (codes.length) {
      h += '<p>No runbook for <code>' + esc(codes[0].toUpperCase()) + '</code> in the knowledge base.</p>';
    }
    h += '<p>Write to William at <a href="mailto:williamfirenze@gmail.com" style="border-bottom:1px solid currentColor">williamfirenze@gmail.com</a> — when he solves it, it gets added here.</p>';
    var all = KBD.articles.slice(0, 4).map(function (a) { return a.title || a.id; });
    if (all.length) h += '<p style="margin-top:12px;font-size:13px;opacity:.75">What I do know about:</p>' + chips(all);
    return h;
  }

  /* ---------- invio ---------- */
  var busy = false;
  function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true;
    bubble(esc(text).replace(/\n/g, '<br>'), true);
    input.value = ''; input.style.height = 'auto';

    var t = typing();
    var delay = 260 + Math.min(text.length * 6, 500);
    setTimeout(function () {
      t.remove();
      bubble(answer(text));
      busy = false; sendBtn.disabled = false;
      input.focus();
    }, delay);
  }

  sendForm.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  });

  stream.addEventListener('click', function (e) {
    var ask = e.target.closest('[data-ask]');
    if (ask) { send(ask.getAttribute('data-ask')); return; }
    var cp = e.target.closest('[data-copy]');
    if (cp) {
      var pre = cp.parentElement.querySelector('pre');
      navigator.clipboard.writeText(pre.textContent).then(function () {
        cp.textContent = 'COPIED';
        setTimeout(function () { cp.textContent = 'COPY'; }, 1400);
      });
    }
  });

  /* ---------- dati ---------- */
  function loadJSON(path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' → HTTP ' + r.status);
      return r.json();
    });
  }

  var kbReady = loadJSON('data/kb.json')
    .then(function (d) {
      KBD.articles = Array.isArray(d) ? d : (d.articles || []);
      KBD.meta = Array.isArray(d) ? {} : d;
      KBD.index = KB.buildIndex(KBD.articles);
      kbTag.textContent = KBD.articles.length + ' runbook' + (KBD.articles.length === 1 ? '' : 's');
      kbTag.className = 'tag tag--ok';
    })
    .catch(function () {
      KBD.articles = []; KBD.index = [];
      kbTag.textContent = 'kb unavailable';
      kbTag.className = 'tag tag--warn';
    });

  /* ---------- accesso ---------- */
  function start(p) {
    profile = p;
    gate.hidden = true;
    chat.hidden = false;
    who.hidden = false;
    who.textContent = p.name;
    btnOut.hidden = false;
    barSub.textContent = p.role || 'knowledge base assistant';
    try { sessionStorage.setItem('wf_chat_profile', JSON.stringify(p)); } catch (e) {}

    var hello = '<p>Hi <strong>' + esc(p.name.split(' ')[0]) + '</strong>. I\'m William\'s knowledge base — ' +
      KBD.articles.length + ' runbook' + (KBD.articles.length === 1 ? '' : 's') + ' he has written up.</p>' +
      '<p>Paste an error code, describe what you\'re seeing, or ask how to do something. I answer only from what he has actually documented — if it isn\'t in there, I\'ll say so rather than invent it.</p>';
    var seeds = KBD.articles.slice(0, 4).map(function (a) { return a.title || a.id; });
    bubble(hello + chips(seeds));
    setTimeout(function () { input.focus(); }, 150);
  }

  codeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = (codeInput.value || '').trim().toUpperCase();
    if (!raw) return;
    gateMsg.className = 'note';
    gateMsg.textContent = 'checking…';

    Promise.all([kbReady, loadJSON('data/users.json').catch(function () { return { users: [] }; }), sha256(raw)])
      .then(function (r) {
        var users = (r[1] && r[1].users) || [];
        var hash = r[2];
        var found = users.filter(function (u) { return u.h === hash && u.active !== false; })[0];
        if (!found) {
          gateMsg.className = 'note err';
          gateMsg.textContent = 'code not recognised';
          codeInput.select();
          return;
        }
        gateMsg.className = 'note ok';
        gateMsg.textContent = 'welcome';
        setTimeout(function () { start(found); }, 260);
      })
      .catch(function () {
        gateMsg.className = 'note err';
        gateMsg.textContent = 'could not load the access list';
      });
  });

  btnOut.addEventListener('click', function () {
    try { sessionStorage.removeItem('wf_chat_profile'); } catch (e) {}
    location.reload();
  });

  /* sessione gia' aperta in questa scheda */
  (function resume() {
    var raw;
    try { raw = sessionStorage.getItem('wf_chat_profile'); } catch (e) { return; }
    if (!raw) return;
    try {
      var p = JSON.parse(raw);
      kbReady.then(function () { start(p); });
    } catch (e) {}
  })();

})();
