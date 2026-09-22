/* =========================================================
   KB ENGINE — ricerca e comprensione sulla knowledge base
   Gira tutta nel browser: nessuna API, nessun costo.
   Usata sia da chat.js sia dall'anteprima in admin.js
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------- normalizzazione ---------- */
  function deaccent(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function norm(s) {
    return deaccent(String(s || '')).toLowerCase();
  }

  /* codici errore: ORA-00060, TNS-12541, PRVF-4007, RMAN-06059... */
  var CODE_RE = /\b(ora|tns|rman|crs|prvf|prcr|prcc|kup|imp|exp|lrm|pls|dbt|oui|cls|ohas|nid|pga|sga)[\s-]?(\d{3,5})\b/gi;

  function codesIn(text) {
    var out = [], m;
    CODE_RE.lastIndex = 0;
    while ((m = CODE_RE.exec(String(text || ''))) !== null) {
      out.push((m[1] + '-' + m[2]).toLowerCase());
    }
    return out;
  }

  var STOP = ('il lo la i gli le un uno una di a da in con su per tra fra e o ma se che chi cui non ne ci vi si ' +
    'come cosa quando dove perche qual quale quali quanto come mi ti gli le ci vi loro e\' sono sei siamo siete ' +
    'ho hai ha abbiamo avete hanno essere avere fare fa fai devo deve dobbiamo posso puo possiamo vorrei ' +
    'the a an of to in on for with and or but if that which who what when where why how is are was were be been ' +
    'do does did can could should would i you he she it we they my your his her its our their me him them ' +
    'ciao salve buongiorno grazie prego scusa per favore please thanks hi hello hey ok okay').split(/\s+/);
  var STOPSET = {};
  STOP.forEach(function (w) { STOPSET[w] = 1; });

  /* radice grossolana: taglia le desinenze piu' comuni it/en */
  function stem(w) {
    if (w.length <= 4) return w;
    return w
      .replace(/(azioni|azione|amento|amenti|zione|zioni)$/, 'az')
      .replace(/(ing|edly|ed|es|s)$/, '')
      .replace(/(are|ere|ire|ato|ata|ati|ate|uto|uta|iti|ite|ivo|iva)$/, '')
      .replace(/(i|e|o|a)$/, '');
  }

  function tokens(text) {
    var t = norm(text);
    var codes = codesIn(t);
    var words = t
      .replace(CODE_RE, ' ')
      .split(/[^a-z0-9_$.]+/)
      .filter(function (w) { return w.length > 1 && !STOPSET[w]; })
      .map(stem)
      .filter(Boolean);
    return { words: words, codes: codes, raw: t };
  }

  /* ---------- indicizzazione ---------- */
  var FIELDS = [
    { key: 'title',      weight: 6 },
    { key: 'tags',       weight: 5 },
    { key: 'keywords',   weight: 4 },
    { key: 'products',   weight: 3 },
    { key: 'symptoms',   weight: 3 },
    { key: 'summary',    weight: 2 },
    { key: 'cause',      weight: 2 },
    { key: 'resolution', weight: 1.5 },
    { key: 'verification', weight: 1 },
    { key: 'prevention', weight: 1 }
  ];

  function flatten(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (Array.isArray(v)) return v.map(flatten).join(' \n ');
    if (typeof v === 'object') {
      return Object.keys(v).map(function (k) { return flatten(v[k]); }).join(' \n ');
    }
    return '';
  }

  function indexArticle(a) {
    var bag = {};        // token -> peso accumulato
    var codeSet = {};
    FIELDS.forEach(function (f) {
      var txt = flatten(a[f.key]);
      if (!txt) return;
      var tk = tokens(txt);
      tk.words.forEach(function (w) { bag[w] = (bag[w] || 0) + f.weight; });
      tk.codes.forEach(function (c) {
        codeSet[c] = Math.max(codeSet[c] || 0, f.weight);
        bag[c] = (bag[c] || 0) + f.weight;
      });
    });
    // i codici dichiarati esplicitamente valgono di piu'
    (a.codes || []).forEach(function (c) {
      var k = norm(c).replace(/\s/g, '-');
      codeSet[k] = 20; bag[k] = (bag[k] || 0) + 20;
    });
    var len = 0;
    Object.keys(bag).forEach(function (k) { len += bag[k]; });
    return { bag: bag, codes: codeSet, len: Math.sqrt(Math.max(len, 1)) };
  }

  function buildIndex(articles) {
    return (articles || []).map(function (a, i) {
      return { i: i, a: a, idx: indexArticle(a) };
    });
  }

  /* ---------- ricerca ---------- */
  function search(index, query, limit) {
    var q = tokens(query);
    if (!q.words.length && !q.codes.length) return [];
    var results = [];

    index.forEach(function (doc) {
      var score = 0, hits = 0;
      q.codes.forEach(function (c) {
        if (doc.idx.codes[c]) { score += 60; hits++; }
        else if (doc.idx.bag[c]) { score += 25; hits++; }
      });
      q.words.forEach(function (w) {
        var v = doc.idx.bag[w];
        if (v) { score += v; hits++; return; }
        // match parziale: prefisso di almeno 4 lettere
        if (w.length >= 4) {
          for (var k in doc.idx.bag) {
            if (k.indexOf(w) === 0 || w.indexOf(k) === 0) { score += doc.idx.bag[k] * 0.45; hits++; break; }
          }
        }
      });
      if (!score) return;
      var need = q.words.length + q.codes.length;
      var coverage = hits / Math.max(need, 1);
      score = (score / doc.idx.len) * (0.45 + coverage);   // premia chi copre piu' termini
      results.push({ article: doc.a, score: score, coverage: coverage, hits: hits });
    });

    results.sort(function (x, y) { return y.score - x.score; });
    return results.slice(0, limit || 5);
  }

  /* ---------- intento della domanda ---------- */
  /* nota: "undo" NON sta in rollback — in un contesto Oracle e' la tablespace */
  var INTENTS = [
    { id: 'commands',     re: /(comand|command|script|sql|query|lanci|esegu)/ },
    { id: 'verification', re: /(verific|verify|controll|check|conferm|funzion)/ },
    { id: 'rollback',     re: /(rollback|annull|torn|indietr|ripristin|revert|male|peggior)/ },
    { id: 'cause',        re: /(caus|perche|why|motiv|origin|dipend)/ },
    { id: 'prevention',   re: /(preven|evit|ricapit|futur|precauz)/ },
    { id: 'symptoms',     re: /(sintom|symptom|manifest)/ },
    { id: 'steps',        re: /(risolv|solve|fix|procedur|passi|step|sistemar|riparar)/ },
    { id: 'references',   re: /(document|metalink|riferiment|reference|link)/ }
  ];

  function intentOf(query) {
    var q = norm(query);
    for (var i = 0; i < INTENTS.length; i++) {
      if (INTENTS[i].re.test(q)) return INTENTS[i].id;
    }
    return null;
  }

  /* parole che chiedono soltanto, senza aggiungere argomento */
  var META = ('mostra mostrami dimmi dammi fammi vedere spiega spiegami elenca lista list show tell ' +
    'give explain quale quali altro ancora poi ok adesso ora subito grazie ' +
    'va vado andare fare succede capita ' +
    'questo quello stesso esattamente esatto').split(' ').map(stem);
  var METASET = {};
  META.forEach(function (w) { METASET[w] = 1; });

  /* true solo se la frase chiede una SEZIONE e nient'altro:
     "mostrami i comandi" si', "come risolvo un problema kubernetes" no */
  function sectionOnly(query) {
    var intent = intentOf(query);
    if (!intent) return null;
    if (codesIn(query).length) return null;          // c'e' un codice: e' una domanda nuova
    var rest = tokens(query).words.filter(function (w) {
      if (METASET[w]) return false;
      for (var i = 0; i < INTENTS.length; i++) if (INTENTS[i].re.test(w)) return false;
      return true;
    });
    return rest.length === 0 ? intent : null;
  }

  /* quanta parte della domanda usa parole che la knowledge base conosce */
  function vocabCoverage(index, query) {
    var q = tokens(query);
    var all = q.words.concat(q.codes);
    if (!all.length) return 1;
    var seen = 0;
    all.forEach(function (w) {
      for (var i = 0; i < index.length; i++) {
        if (index[i].idx.bag[w]) { seen++; return; }
      }
      if (w.length >= 5) {
        for (var j = 0; j < index.length; j++) {
          for (var k in index[j].idx.bag) {
            if (k.indexOf(w) === 0 || w.indexOf(k) === 0) { seen++; return; }
          }
        }
      }
    });
    return seen / all.length;
  }

  global.KB = {
    tokens: tokens,
    codesIn: codesIn,
    buildIndex: buildIndex,
    search: search,
    intentOf: intentOf,
    sectionOnly: sectionOnly,
    vocabCoverage: vocabCoverage,
    flatten: flatten,
    norm: norm
  };

})(window);
