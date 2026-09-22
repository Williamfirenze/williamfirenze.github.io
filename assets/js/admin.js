/* =========================================================
   Admin — knowledge base e codici di accesso
   Tutto in locale. Produce due file da caricare nel repo.
   ========================================================= */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* SHA-256 della password. Non e' sicurezza: e' una porta chiusa,
     non una serratura. Su un sito statico non esiste di meglio. */
  var PWD_H = 'ef299d274a8b2dff395ec8104d842f4ac3bd9f4927ba9a5348a13c0069b5b673';
  var USER = 'admin';

  var LS = { kb: 'wf_admin_kb', us: 'wf_admin_users', codes: 'wf_admin_codes' };
  function lget(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var kb = lget(LS.kb, []);
  var users = lget(LS.us, []);
  var plainCodes = lget(LS.codes, {});   // hash -> codice in chiaro, solo qui

  async function sha256(s) {
    var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function download(name, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2) + '\n'], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  function msg(el, text, kind) {
    el.className = 'note' + (kind ? ' ' + kind : '');
    el.textContent = text;
  }

  /* =======================================================
     login
     ======================================================= */
  $('#loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var u = $('#u').value.trim().toLowerCase();
    var h = await sha256($('#p').value);
    if (u === USER && h === PWD_H) {
      $('#login').hidden = true;
      $('#panel').hidden = false;
      $('#logout').hidden = false;
      try { sessionStorage.setItem('wf_admin', '1'); } catch (err) {}
      renderKB(); renderUsers();
    } else {
      msg($('#loginMsg'), 'wrong user or password', 'err');
      $('#p').value = ''; $('#p').focus();
    }
  });
  $('#logout').addEventListener('click', function () {
    try { sessionStorage.removeItem('wf_admin'); } catch (e) {}
    location.reload();
  });
  try {
    if (sessionStorage.getItem('wf_admin') === '1') {
      $('#login').hidden = true; $('#panel').hidden = false; $('#logout').hidden = false;
    }
  } catch (e) {}

  /* =======================================================
     tabs
     ======================================================= */
  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      $$('.tab').forEach(function (x) { x.classList.toggle('on', x === t); });
      $$('.panel').forEach(function (p) { p.hidden = p.id !== 'tab-' + t.getAttribute('data-tab'); });
    });
  });

  /* =======================================================
     KNOWLEDGE BASE
     ======================================================= */
  var VALID_TYPE = ['troubleshooting', 'procedure', 'reference', 'checklist'];
  var VALID_SEV = ['low', 'medium', 'high', 'critical'];

  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function clean(raw) {
    var a = raw && typeof raw === 'object' ? raw : {};
    var arr = function (v) { return Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []); };
    var steps = function (v) {
      return arr(v).map(function (s) {
        if (typeof s === 'string') return { step: s };
        return { step: s.step || '', command: s.command || '', note: s.note || '' };
      }).filter(function (s) { return s.step || s.command; });
    };
    var out = {
      id: slug(a.id || a.title) || ('kb-' + Date.now()),
      title: String(a.title || a.id || 'Untitled').trim(),
      type: VALID_TYPE.indexOf(a.type) >= 0 ? a.type : 'troubleshooting',
      codes: arr(a.codes).map(function (c) { return String(c).toUpperCase().trim(); }),
      products: arr(a.products),
      severity: VALID_SEV.indexOf(a.severity) >= 0 ? a.severity : 'medium',
      updated: /^\d{4}-\d{2}-\d{2}$/.test(a.updated) ? a.updated : today(),
      tags: arr(a.tags),
      keywords: arr(a.keywords),
      summary: String(a.summary || '').trim(),
      symptoms: arr(a.symptoms),
      cause: String(a.cause || '').trim(),
      resolution: steps(a.resolution),
      verification: steps(a.verification),
      rollback: String(a.rollback || '').trim(),
      prevention: arr(a.prevention),
      references: arr(a.references)
    };
    out._missing = arr(a._missing);
    return out;
  }

  function quality(a) {
    var have = 0, total = 6;
    if (a.summary) have++;
    if (a.codes.length || a.keywords.length >= 3) have++;
    if (a.symptoms.length) have++;
    if (a.resolution.length) have++;
    if (a.verification.length) have++;
    if (a.cause) have++;
    return Math.round((have / total) * 100);
  }

  function renderKB() {
    var el = $('#kbList');
    if (!kb.length) {
      el.innerHTML = '<div class="empty">No runbooks yet. Load the ones already online, or paste a JSON from Claude.</div>';
      return;
    }
    el.innerHTML = kb.map(function (a, i) {
      var q = quality(a);
      var warn = a._missing && a._missing.length
        ? ' · <span style="color:var(--accent)">' + a._missing.length + ' open question' + (a._missing.length === 1 ? '' : 's') + '</span>'
        : '';
      return '<div class="item">' +
        '<div class="item__m"><b>' + esc(a.title) + '</b>' +
        '<span>' + esc(a.id) + ' · ' + esc(a.type) + ' · ' + q + '% complete' +
        (a.codes.length ? ' · ' + esc(a.codes.join(' ')) : '') + warn + '</span></div>' +
        '<div class="item__a">' +
        '<button class="mini" data-edit="' + i + '">EDIT</button>' +
        '<button class="mini mini--danger" data-del="' + i + '">DEL</button>' +
        '</div></div>';
    }).join('');
  }

  $('#kbList').addEventListener('click', function (e) {
    var d = e.target.closest('[data-del]'), ed = e.target.closest('[data-edit]');
    if (d) {
      var i = +d.getAttribute('data-del');
      if (!confirm('Delete "' + kb[i].title + '"?')) return;
      kb.splice(i, 1); lset(LS.kb, kb); renderKB();
      msg($('#kbMsg'), 'deleted — remember to export and upload', 'err');
    }
    if (ed) openForm(+ed.getAttribute('data-edit'));
  });

  $('#kbLoad').addEventListener('click', function () {
    fetch('../data/kb.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var arts = Array.isArray(d) ? d : (d.articles || []);
        kb = arts.map(clean); lset(LS.kb, kb); renderKB();
        msg($('#kbMsg'), 'loaded ' + kb.length + ' runbook(s) from the site', 'ok');
      })
      .catch(function () { msg($('#kbMsg'), 'could not read data/kb.json', 'err'); });
  });

  $('#kbPasteOpen').addEventListener('click', function () {
    $('#kbPaste').hidden = false; $('#kbForm').hidden = true; $('#kbJson').focus();
  });
  $('#kbPasteCancel').addEventListener('click', function () {
    $('#kbPaste').hidden = true; $('#kbJson').value = ''; msg($('#kbPasteMsg'), '');
  });

  $('#kbImport').addEventListener('click', function () {
    var txt = $('#kbJson').value.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    if (!txt) return;
    var parsed;
    try { parsed = JSON.parse(txt); }
    catch (err) { msg($('#kbPasteMsg'), 'not valid JSON — ' + err.message, 'err'); return; }

    var incoming = Array.isArray(parsed) ? parsed : (parsed.articles || [parsed]);
    var added = 0, replaced = 0, open = 0;
    incoming.forEach(function (raw) {
      var a = clean(raw);
      open += a._missing.length;
      var at = kb.findIndex(function (x) { return x.id === a.id; });
      if (at >= 0) { kb[at] = a; replaced++; } else { kb.push(a); added++; }
    });
    lset(LS.kb, kb); renderKB();
    $('#kbJson').value = '';
    $('#kbPaste').hidden = true;
    msg($('#kbMsg'), added + ' added, ' + replaced + ' replaced' +
      (open ? ' — ' + open + ' open question(s), check the list' : ''), open ? 'err' : 'ok');
  });

  $('#kbNew').addEventListener('click', function () { openForm(-1); });

  function field(l, id, val, ph, ta) {
    return '<div class="f"><label class="lbl" for="' + id + '">' + l + '</label>' +
      (ta ? '<textarea id="' + id + '" rows="' + ta + '" placeholder="' + esc(ph || '') + '">' + esc(val) + '</textarea>'
          : '<input class="inp" id="' + id + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '">') +
      '</div>';
  }

  function openForm(i) {
    var a = i >= 0 ? kb[i] : clean({});
    $('#kbPaste').hidden = true;
    var f = $('#kbForm');
    f.hidden = false;
    var steps = (a.resolution || []).map(function (s) {
      return s.step + (s.command ? '\n$ ' + s.command : '') + (s.note ? '\n# ' + s.note : '');
    }).join('\n---\n');
    var checks = (a.verification || []).map(function (s) {
      return s.step + (s.command ? '\n$ ' + s.command : '');
    }).join('\n---\n');

    f.innerHTML =
      '<div class="callout"><p><b>' + (i >= 0 ? 'Editing' : 'New runbook') + '.</b> ' +
      'In the two step boxes: one step per block, blocks separated by <code>---</code>. ' +
      'A line starting with <code>$</code> is a command, one starting with <code>#</code> is a note.</p></div>' +
      field('Title', 'fTitle', a.title, 'ORA-01555: snapshot too old') +
      '<div class="f2">' + field('Id', 'fId', a.id, 'ora-01555-snapshot-too-old') +
      field('Error codes, space separated', 'fCodes', a.codes.join(' '), 'ORA-01555') + '</div>' +
      '<div class="f2">' + field('Products, comma separated', 'fProd', a.products.join(', '), 'Oracle Database 19c') +
      field('Updated', 'fUpd', a.updated, today()) + '</div>' +
      '<div class="f2">' +
      '<div class="f"><label class="lbl" for="fType">Type</label><select id="fType">' +
      VALID_TYPE.map(function (t) { return '<option' + (t === a.type ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="f"><label class="lbl" for="fSev">Severity</label><select id="fSev">' +
      VALID_SEV.map(function (t) { return '<option' + (t === a.severity ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
      '</select></div></div>' +
      '<div class="f2">' + field('Tags, comma separated', 'fTags', a.tags.join(', '), 'undo, batch') +
      field('Keywords, comma separated', 'fKeys', a.keywords.join(', '), 'how I would search for it') + '</div>' +
      field('Summary', 'fSum', a.summary, 'Two or three sentences', 3) +
      field('Symptoms, one per line', 'fSym', a.symptoms.join('\n'), '', 3) +
      field('Cause', 'fCause', a.cause, '', 2) +
      field('Resolution steps', 'fRes', steps, 'Step one\n$ command\n# note\n---\nStep two', 8) +
      field('Verification steps', 'fVer', checks, '', 4) +
      field('Rollback', 'fRb', a.rollback, '', 2) +
      field('Prevention, one per line', 'fPrev', a.prevention.join('\n'), '', 3) +
      field('References, one per line', 'fRef', a.references.join('\n'), '', 2) +
      (a._missing && a._missing.length
        ? '<div class="callout"><p><b>Open questions from Claude:</b></p><ul>' +
          a._missing.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="row row--end"><button class="btn2" id="fCancel">Cancel</button>' +
      '<button class="btn2 btn2--solid" id="fSave">Save</button></div>';

    f.scrollIntoView({ behavior: 'smooth', block: 'start' });

    $('#fCancel').addEventListener('click', function () { f.hidden = true; f.innerHTML = ''; });
    $('#fSave').addEventListener('click', function () {
      var parseSteps = function (txt) {
        return txt.split(/\n---+\n/).map(function (blk) {
          var o = { step: '', command: '', note: '' };
          blk.split('\n').forEach(function (ln) {
            if (/^\s*\$\s?/.test(ln)) o.command += (o.command ? '\n' : '') + ln.replace(/^\s*\$\s?/, '');
            else if (/^\s*#\s?/.test(ln)) o.note += (o.note ? ' ' : '') + ln.replace(/^\s*#\s?/, '');
            else if (ln.trim()) o.step += (o.step ? ' ' : '') + ln.trim();
          });
          return o;
        }).filter(function (o) { return o.step || o.command; });
      };
      var lines = function (id) { return $(id).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
      var csv = function (id) { return $(id).value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); };

      var next = clean({
        id: $('#fId').value || $('#fTitle').value,
        title: $('#fTitle').value,
        type: $('#fType').value,
        severity: $('#fSev').value,
        updated: $('#fUpd').value,
        codes: $('#fCodes').value.split(/\s+/).filter(Boolean),
        products: csv('#fProd'),
        tags: csv('#fTags'),
        keywords: csv('#fKeys'),
        summary: $('#fSum').value,
        symptoms: lines('#fSym'),
        cause: $('#fCause').value,
        resolution: parseSteps($('#fRes').value),
        verification: parseSteps($('#fVer').value),
        rollback: $('#fRb').value,
        prevention: lines('#fPrev'),
        references: lines('#fRef')
      });
      if (!next.title.trim()) { alert('The title is required.'); return; }

      var at = kb.findIndex(function (x) { return x.id === next.id; });
      if (i >= 0 && kb[i].id !== next.id) kb.splice(i, 1);
      if (at >= 0 && at !== i) kb[at] = next;
      else if (i >= 0 && kb[i] && kb[i].id === next.id) kb[i] = next;
      else kb.push(next);

      lset(LS.kb, kb); renderKB();
      f.hidden = true; f.innerHTML = '';
      msg($('#kbMsg'), 'saved locally — export kb.json and upload it to publish', 'ok');
    });
  }

  $('#kbExport').addEventListener('click', function () {
    if (!kb.length) { msg($('#kbMsg'), 'nothing to export', 'err'); return; }
    var out = kb.map(function (a) {
      var c = JSON.parse(JSON.stringify(a));
      delete c._missing;
      ['verification', 'resolution'].forEach(function (k) {
        c[k] = (c[k] || []).map(function (s) {
          var o = { step: s.step };
          if (s.command) o.command = s.command;
          if (s.note) o.note = s.note;
          return o;
        });
      });
      return c;
    });
    download('kb.json', { version: 1, updated: today(), articles: out });
    msg($('#kbMsg'), 'kb.json downloaded — upload it into data/ in the repo', 'ok');
  });

  /* =======================================================
     CODICI DI ACCESSO
     ======================================================= */
  function newCode() {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // niente 0/O/1/I
    var b = new Uint32Array(8);
    crypto.getRandomValues(b);
    var s = '';
    for (var i = 0; i < 8; i++) s += A[b[i] % A.length];
    return s.slice(0, 4) + '-' + s.slice(4);
  }

  function renderUsers() {
    var el = $('#usList');
    if (!users.length) {
      el.innerHTML = '<div class="empty">No codes yet.</div>';
      return;
    }
    el.innerHTML = users.map(function (u, i) {
      var known = plainCodes[u.h];
      return '<div class="item"><div class="item__m"><b>' + esc(u.name) + '</b><span>' +
        esc(u.role || '—') + (u.team ? ' · ' + esc(u.team) : '') +
        ' · ' + (known ? 'code ' + esc(known) : 'code known only to them') +
        (u.active === false ? ' · <span style="color:var(--accent)">disabled</span>' : '') +
        '</span></div><div class="item__a">' +
        '<button class="mini" data-toggle="' + i + '">' + (u.active === false ? 'ENABLE' : 'DISABLE') + '</button>' +
        '<button class="mini mini--danger" data-rm="' + i + '">DEL</button>' +
        '</div></div>';
    }).join('');
  }

  $('#usList').addEventListener('click', function (e) {
    var rm = e.target.closest('[data-rm]'), tg = e.target.closest('[data-toggle]');
    if (rm) {
      var i = +rm.getAttribute('data-rm');
      if (!confirm('Remove access for ' + users[i].name + '?')) return;
      delete plainCodes[users[i].h];
      users.splice(i, 1);
      lset(LS.us, users); lset(LS.codes, plainCodes); renderUsers();
      msg($('#usMsg'), 'removed — export and upload to actually revoke it', 'err');
    }
    if (tg) {
      var j = +tg.getAttribute('data-toggle');
      users[j].active = users[j].active === false;
      lset(LS.us, users); renderUsers();
      msg($('#usMsg'), 'changed — export and upload to apply', 'err');
    }
  });

  $('#usLoad').addEventListener('click', function () {
    fetch('../data/users.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        users = (d.users || []).map(function (u) {
          return { h: u.h, name: u.name || '?', role: u.role || '', team: u.team || '', active: u.active !== false };
        });
        lset(LS.us, users); renderUsers();
        msg($('#usMsg'), 'loaded ' + users.length + ' code(s)', 'ok');
      })
      .catch(function () { msg($('#usMsg'), 'could not read data/users.json', 'err'); });
  });

  $('#usAdd').addEventListener('click', async function () {
    var name = $('#uName').value.trim();
    if (!name) { msg($('#usMsg'), 'the name is required', 'err'); return; }
    var code = newCode();
    var h = await sha256(code);
    users.push({ h: h, name: name, role: $('#uRole').value.trim(), team: $('#uTeam').value.trim(), active: true });
    plainCodes[h] = code;
    lset(LS.us, users); lset(LS.codes, plainCodes);
    $('#uName').value = ''; $('#uRole').value = ''; $('#uTeam').value = '';
    renderUsers();
    var box = $('#usNew');
    box.hidden = false;
    box.innerHTML = '<div class="callout"><p><b>Code for ' + esc(name) + '</b> — send it to them now.</p>' +
      '<div class="codebox">' + esc(code) + '</div>' +
      '<p>It goes live once you export <code>users.json</code> and upload it to the repo.</p></div>';
    msg($('#usMsg'), '');
  });

  $('#usExport').addEventListener('click', function () {
    download('users.json', {
      version: 1,
      updated: today(),
      note: 'Only SHA-256 hashes of the access codes are stored here. The codes themselves exist nowhere in this repo.',
      users: users.map(function (u) {
        return { h: u.h, name: u.name, role: u.role || '', team: u.team || '', active: u.active !== false };
      })
    });
    msg($('#usMsg'), 'users.json downloaded — upload it into data/ in the repo', 'ok');
  });

  /* =======================================================
     prompt del tutorial
     ======================================================= */
  var PROMPT = [
    'Fai da redattore tecnico per la knowledge base di William Firenze, database',
    'administrator. Io ti racconto un problema che ho risolto sul lavoro; tu lo',
    'trasformi in un runbook riutilizzabile in formato JSON.',
    '',
    'REGOLE',
    '1. Rispondi SOLO con un blocco di codice JSON. Nessun testo prima o dopo.',
    '2. Non inventare nulla. Se un campo non lo so, lascialo vuoto ("" o []) e',
    '   aggiungi la domanda in "_missing". Non riempire i buchi con plausibilita\'.',
    '3. Scrivi in inglese, in forma piana, come un collega che spiega a un altro.',
    '   Niente marketing, niente "semplicemente", niente passivi inutili.',
    '4. I comandi vanno copiati ESATTAMENTE come li ho scritti io. Se li ho scritti',
    '   a memoria e possono essere imprecisi, dillo in "note" di quello step.',
    '5. Ogni step di "resolution" e\' UNA azione. Se serve un comando, sta in',
    '   "command"; l\'avvertenza sta in "note". Non mettere piu\' comandi in uno step',
    '   se possono essere eseguiti separatamente.',
    '6. "codes" deve contenere ogni codice errore citato, in MAIUSCOLO, nella forma',
    '   ORA-01555 / TNS-12541 / RMAN-06059. Sono la chiave di ricerca piu\' forte:',
    '   non dimenticarne nessuno.',
    '7. "keywords" serve a farmi trovare l\'articolo con le parole che userei sotto',
    '   pressione alle 3 di notte, anche sbagliate o in italiano. Mettine 5-12.',
    '8. "id" in minuscolo, parole separate da trattini, senza spazi.',
    '9. "updated" nel formato YYYY-MM-DD, la data di oggi.',
    '10. "severity" solo uno tra: low, medium, high, critical.',
    '11. "type" solo uno tra: troubleshooting, procedure, reference, checklist.',
    '',
    'SCHEMA (rispetta i nomi dei campi alla lettera)',
    '{',
    '  "id": "stringa-con-trattini",',
    '  "title": "Titolo breve, con il codice errore se c\'e\'",',
    '  "type": "troubleshooting",',
    '  "codes": ["ORA-01555"],',
    '  "products": ["Oracle Database 19c"],',
    '  "severity": "medium",',
    '  "updated": "' + today() + '",',
    '  "tags": ["parole", "di", "categoria"],',
    '  "keywords": ["come", "lo", "cercherei"],',
    '  "summary": "Due o tre frasi: cos\'e\' e quando si presenta.",',
    '  "symptoms": ["Cosa vede chi lo subisce, una voce per sintomo"],',
    '  "cause": "Perche\' succede, in una o due frasi.",',
    '  "resolution": [',
    '    { "step": "Una azione.", "command": "il comando esatto", "note": "avvertenza, se serve" }',
    '  ],',
    '  "verification": [',
    '    { "step": "Come si controlla che sia davvero risolto.", "command": "comando" }',
    '  ],',
    '  "rollback": "Come si torna indietro se peggiora. Se non si puo\', scrivilo chiaro.",',
    '  "prevention": ["Cosa fare perche\' non ricapiti"],',
    '  "references": ["Doc ID 1234.1", "titolo del manuale"],',
    '  "_missing": ["Domande a cui non ho risposto e che servirebbero"]',
    '}',
    '',
    'Se quello che ti ho raccontato copre piu\' problemi distinti, restituisci un',
    'array JSON con un oggetto per problema.',
    '',
    'Ecco il caso:'
  ].join('\n');

  $('#promptText').textContent = PROMPT;
  $('#copyPrompt').addEventListener('click', function () {
    var b = this;
    navigator.clipboard.writeText(PROMPT).then(function () {
      b.textContent = 'COPIED';
      setTimeout(function () { b.textContent = 'COPY'; }, 1600);
    });
  });

  renderKB(); renderUsers();

})();
