/* =========================================================
   Worker di williamfirenze.github.io
   Unico posto dove vive il token GitHub.

   Tre cose, tre percorsi:
     /            classifica del gioco   — PUBBLICA in scrittura (e' un gioco)
     /kb          knowledge base         — richiede ADMIN_TOKEN
     /users       codici di accesso      — richiede ADMIN_TOKEN

   Variabili (Cloudflare → Settings → Variables and Secrets):
     GITHUB_TOKEN     [Secret]  fine-grained PAT, Contents: Read and write
     ADMIN_TOKEN      [Secret]  chiave di pubblicazione, la generi dall'admin
     GITHUB_OWNER     [Text]    Williamfirenze
     GITHUB_REPO      [Text]    williamfirenze.github.io
     GITHUB_BRANCH    [Text]    main
     ALLOWED_ORIGINS  [Text]    https://williamfirenze.github.io

   Senza ADMIN_TOKEN gli endpoint /kb e /users restano chiusi:
   l'admin ricade sul download dei file, come prima.
   ========================================================= */

const F_BOARD = 'data/leaderboard.json';
const F_KB    = 'data/kb.json';
const F_USERS = 'data/users.json';

const MAX_ENTRIES = 100;
const MAX_SCORE = 5000;
const MAX_NAME = 14;
const CACHE_MS = 20000;
const MAX_BODY = 900 * 1024;      // ~900 KB, oltre e' un abuso

let cache = { at: 0, entries: null, sha: null };

/* ---------- base64 con UTF-8 corretto ---------- */
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* confronto a tempo costante: non fa trapelare quanti caratteri erano giusti */
function sameSecret(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- CORS ---------- */
function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || 'https://williamfirenze.github.io')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const ok = allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function reply(status, body, request, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env)
    }
  });
}

/* ---------- GitHub ---------- */
function gh(url, env, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'wf-site-worker',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      ...(init.headers || {})
    }
  });
}
const contentsUrl = (env, file) =>
  `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${file}`;

async function readFile(env, file) {
  const res = await gh(`${contentsUrl(env, file)}?ref=${encodeURIComponent(env.GITHUB_BRANCH || 'main')}`, env);
  if (res.status === 404) return { text: null, sha: null };
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}) on ${file}`);
  const json = await res.json();
  return { text: b64decode(json.content || ''), sha: json.sha };
}

async function writeFile(env, file, text, message, sha) {
  const body = { message, branch: env.GITHUB_BRANCH || 'main', content: b64encode(text) };
  if (sha) body.sha = sha;
  const res = await gh(contentsUrl(env, file), env, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`GitHub write failed (${res.status}) ${txt.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return res.json().catch(() => ({}));
}

/* =========================================================
   CLASSIFICA
   ========================================================= */
function normalise(list) {
  if (!Array.isArray(list)) return [];
  const best = new Map();
  for (const e of list) {
    if (!e || typeof e.name !== 'string') continue;
    const score = Number(e.score);
    if (!Number.isFinite(score)) continue;
    const name = e.name.slice(0, MAX_NAME);
    const rec = {
      name,
      score: Math.max(0, Math.min(MAX_SCORE, Math.floor(score))),
      date: typeof e.date === 'string' ? e.date : new Date().toISOString()
    };
    const prev = best.get(name.toUpperCase());
    if (!prev || rec.score > prev.score) best.set(name.toUpperCase(), rec);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || new Date(a.date) - new Date(b.date))
    .slice(0, MAX_ENTRIES);
}

async function readBoard(env, fresh) {
  if (!fresh && cache.entries && Date.now() - cache.at < CACHE_MS) {
    return { entries: cache.entries, sha: cache.sha };
  }
  const { text, sha } = await readFile(env, F_BOARD);
  let parsed = [];
  try { parsed = text ? JSON.parse(text) : []; } catch { parsed = []; }
  const entries = normalise(Array.isArray(parsed) ? parsed : parsed.entries || []);
  cache = { at: Date.now(), entries, sha };
  return { entries, sha };
}

async function handleBoard(request, env) {
  if (request.method === 'GET') {
    try {
      const { entries } = await readBoard(env, false);
      return reply(200, { entries, source: 'github' }, request, env);
    } catch (e) {
      return reply(200, { entries: [], source: 'error', error: String(e.message || e) }, request, env);
    }
  }
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' }, request, env);

  let payload;
  try { payload = await request.json(); }
  catch { return reply(400, { error: 'Invalid JSON' }, request, env); }

  const name = String(payload?.name ?? '')
    .split('')
    .filter((ch) => ch.charCodeAt(0) > 31 && ch !== '<' && ch !== '>')
    .join('')
    .trim()
    .slice(0, MAX_NAME)
    .toUpperCase();

  const score = Math.floor(Number(payload?.score));
  const seconds = Number(payload?.seconds);

  if (name.length < 2) return reply(400, { error: 'Name too short' }, request, env);
  if (!Number.isFinite(score)) return reply(400, { error: 'Invalid score' }, request, env);
  if (score < 1) return reply(400, { error: 'No score to save' }, request, env);
  if (score > MAX_SCORE) return reply(400, { error: 'Score not plausible' }, request, env);
  if (!Number.isFinite(seconds) || seconds < 1.5) {
    return reply(400, { error: 'Run too short for that score' }, request, env);
  }
  if (score > 20 + seconds * 15) {
    return reply(400, { error: 'Score not plausible for the run length' }, request, env);
  }

  const entry = { name, score, date: new Date().toISOString() };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { entries, sha } = await readBoard(env, attempt > 0);
      const mine = entries.find((e) => e.name.toUpperCase() === name);
      const lowest = entries.length >= MAX_ENTRIES ? entries[entries.length - 1].score : -1;

      if (mine && mine.score >= score) {
        return reply(200, {
          ok: true, written: false, reason: 'not-a-personal-best',
          entries, rank: entries.indexOf(mine) + 1, best: mine.score, source: 'github'
        }, request, env);
      }
      if (!mine && score <= lowest) {
        return reply(200, { ok: true, written: false, reason: 'below-the-board', entries, rank: null, source: 'github' }, request, env);
      }

      const list = normalise([...entries, entry]);
      // [skip ci]: il sito legge la classifica da qui, non serve ricostruire Pages
      const out = await writeFile(env, F_BOARD, JSON.stringify(list, null, 2) + '\n',
        `rollback: ${name} → ${score} [skip ci]`, sha);
      cache = { at: Date.now(), entries: list, sha: out.content ? out.content.sha : null };
      const rank = list.findIndex((e) => e.name.toUpperCase() === name) + 1;
      return reply(200, { ok: true, written: true, entries: list, rank: rank || null, source: 'github' }, request, env);

    } catch (e) {
      const retryable = e.status === 409 || e.status === 422;
      if (attempt === 2 || !retryable) return reply(502, { error: String(e.message || e) }, request, env);
      cache.entries = null;
      await new Promise((r) => setTimeout(r, 250 + attempt * 350));
    }
  }
  return reply(502, { error: 'Persistent conflict on the leaderboard' }, request, env);
}

/* =========================================================
   AREA ADMIN — knowledge base e codici
   ========================================================= */
function adminOk(request, env) {
  if (!env.ADMIN_TOKEN) return 'not-configured';
  return sameSecret(request.headers.get('X-Admin-Token'), env.ADMIN_TOKEN) ? 'ok' : 'denied';
}

/* validazione: meglio rifiutare che committare spazzatura nel repo */
function checkKB(d) {
  if (!d || typeof d !== 'object') return 'payload must be an object';
  if (!Array.isArray(d.articles)) return 'articles must be an array';
  if (d.articles.length > 2000) return 'too many articles';
  for (const a of d.articles) {
    if (!a || typeof a !== 'object') return 'every article must be an object';
    if (typeof a.id !== 'string' || !a.id.trim()) return 'every article needs an id';
    if (typeof a.title !== 'string' || !a.title.trim()) return `article "${a.id}" needs a title`;
  }
  const ids = d.articles.map((a) => a.id);
  if (new Set(ids).size !== ids.length) return 'duplicate article ids';
  return null;
}

function checkUsers(d) {
  if (!d || typeof d !== 'object') return 'payload must be an object';
  if (!Array.isArray(d.users)) return 'users must be an array';
  if (d.users.length > 500) return 'too many users';
  for (const u of d.users) {
    if (!u || typeof u !== 'object') return 'every user must be an object';
    if (typeof u.h !== 'string' || !/^[a-f0-9]{64}$/.test(u.h)) return 'every user needs a sha-256 hash in "h"';
    if (typeof u.name !== 'string' || !u.name.trim()) return 'every user needs a name';
    // se qualcuno prova a mettere il codice in chiaro, lo blocco qui
    if ('code' in u) return 'plain codes must never be published — only hashes';
  }
  return null;
}

async function handleAdminFile(request, env, file, validate, label) {
  const auth = adminOk(request, env);
  if (auth === 'not-configured') {
    return reply(503, { error: 'Publishing is off: ADMIN_TOKEN is not set on the Worker' }, request, env);
  }
  if (auth === 'denied') return reply(401, { error: 'Wrong publish key' }, request, env);

  if (request.method === 'GET') {
    try {
      const { text } = await readFile(env, file);
      return reply(200, { ok: true, data: text ? JSON.parse(text) : null, source: 'github' }, request, env);
    } catch (e) {
      return reply(502, { error: String(e.message || e) }, request, env);
    }
  }
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' }, request, env);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return reply(413, { error: 'Payload too large' }, request, env);

  let data;
  try { data = JSON.parse(raw); }
  catch { return reply(400, { error: 'Invalid JSON' }, request, env); }

  const bad = validate(data);
  if (bad) return reply(400, { error: bad }, request, env);

  data.updated = new Date().toISOString().slice(0, 10);
  const text = JSON.stringify(data, null, 2) + '\n';
  const count = (data.articles || data.users).length;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { sha } = await readFile(env, file);
      // niente [skip ci] qui: il sito legge questi file da Pages,
      // quindi il deploy deve ripartire
      await writeFile(env, file, text, `${label}: ${count} ${count === 1 ? 'entry' : 'entries'}`, sha);
      return reply(200, { ok: true, count, file }, request, env);
    } catch (e) {
      const retryable = e.status === 409 || e.status === 422;
      if (attempt === 2 || !retryable) return reply(502, { error: String(e.message || e) }, request, env);
      await new Promise((r) => setTimeout(r, 250 + attempt * 350));
    }
  }
  return reply(502, { error: 'Persistent conflict while publishing' }, request, env);
}

/* =========================================================
   ROUTING
   ========================================================= */
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return reply(503, { error: 'Worker not configured: missing GITHUB_TOKEN / OWNER / REPO' }, request, env);
    }

    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (path === '/kb')    return handleAdminFile(request, env, F_KB,    checkKB,    'kb');
    if (path === '/users') return handleAdminFile(request, env, F_USERS, checkUsers, 'access');
    if (path === '/ping')  return reply(200, { ok: true, publishing: !!env.ADMIN_TOKEN }, request, env);

    return handleBoard(request, env);
  }
};
