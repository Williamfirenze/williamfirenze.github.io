/* =========================================================
   ROLLBACK — classifica
   Cloudflare Worker. Unico posto dove vive il token GitHub.

   Il "database" e' data/leaderboard.json nel repo del sito:
   ogni punteggio che entra in classifica diventa un commit.

   Variabili (dashboard Cloudflare → Settings → Variables):
     GITHUB_TOKEN     [Secret]  fine-grained PAT, Contents: Read and write
     GITHUB_OWNER     [Text]    Williamfirenze
     GITHUB_REPO      [Text]    williamfirenze.github.io
     GITHUB_BRANCH    [Text]    main
     ALLOWED_ORIGINS  [Text]    https://williamfirenze.github.io

   Efficienza: un record per nome (solo il migliore). Si scrive sul repo
   SOLO quando il punteggio migliora davvero; letture in cache 20s.
   ========================================================= */

const FILE = 'data/leaderboard.json';
const MAX_ENTRIES = 100;
const MAX_SCORE = 5000;
const MAX_NAME = 14;
const CACHE_MS = 20000;

/* cache per isolate: evita di interrogare GitHub a ogni caricamento */
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

/* ---------- CORS ---------- */
function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || 'https://williamfirenze.github.io')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const ok = allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'Content-Type',
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
      'User-Agent': 'rollback-leaderboard',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      ...(init.headers || {})
    }
  });
}
const contentsUrl = (env) =>
  `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${FILE}`;

/* un record per nome: tiene solo il migliore, ordina, taglia a 100 */
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
  const res = await gh(`${contentsUrl(env)}?ref=${encodeURIComponent(env.GITHUB_BRANCH || 'main')}`, env);
  if (res.status === 404) {
    cache = { at: Date.now(), entries: [], sha: null };
    return { entries: [], sha: null };
  }
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  const json = await res.json();
  let parsed = [];
  try { parsed = JSON.parse(b64decode(json.content || '')); } catch { parsed = []; }
  const entries = normalise(Array.isArray(parsed) ? parsed : parsed.entries || []);
  cache = { at: Date.now(), entries, sha: json.sha };
  return { entries, sha: json.sha };
}

async function writeBoard(env, entries, sha, message) {
  const body = {
    message,
    branch: env.GITHUB_BRANCH || 'main',
    content: b64encode(JSON.stringify(entries, null, 2) + '\n')
  };
  if (sha) body.sha = sha;
  const res = await gh(contentsUrl(env), env, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`GitHub write failed (${res.status}) ${txt.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  cache = { at: Date.now(), entries, sha: json.content ? json.content.sha : null };
  return true;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return reply(503, { error: 'Worker not configured: missing GITHUB_TOKEN / OWNER / REPO' }, request, env);
    }

    /* ------------- GET ------------- */
    if (request.method === 'GET') {
      try {
        const { entries } = await readBoard(env, false);
        return reply(200, { entries, source: 'github' }, request, env);
      } catch (e) {
        return reply(200, { entries: [], source: 'error', error: String(e.message || e) }, request, env);
      }
    }

    if (request.method !== 'POST') {
      return reply(405, { error: 'Method not allowed' }, request, env);
    }

    /* ------------- POST ------------- */
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

    /* dosso anti-furbi: un punteggio deve stare in piedi rispetto
       alla durata della partita. Un bot perfetto fa ~3 punti/secondo. */
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

        /* niente commit inutili: si scrive solo se cambia qualcosa */
        const mine = entries.find((e) => e.name.toUpperCase() === name);
        const lowest = entries.length >= MAX_ENTRIES ? entries[entries.length - 1].score : -1;

        if (mine && mine.score >= score) {
          return reply(200, {
            ok: true, written: false, reason: 'not-a-personal-best',
            entries, rank: entries.indexOf(mine) + 1, best: mine.score, source: 'github'
          }, request, env);
        }
        if (!mine && score <= lowest) {
          return reply(200, {
            ok: true, written: false, reason: 'below-the-board',
            entries, rank: null, source: 'github'
          }, request, env);
        }

        const list = normalise([...entries, entry]);
        await writeBoard(env, list, sha, `rollback: ${name} → ${score} [skip ci]`);
        const rank = list.findIndex((e) => e.name.toUpperCase() === name) + 1;
        return reply(200, {
          ok: true, written: true, entries: list, rank: rank || null, source: 'github'
        }, request, env);

      } catch (e) {
        const retryable = e.status === 409 || e.status === 422;
        if (attempt === 2 || !retryable) {
          return reply(502, { error: String(e.message || e) }, request, env);
        }
        cache.entries = null;
        await new Promise((r) => setTimeout(r, 250 + attempt * 350));
      }
    }
    return reply(502, { error: 'Persistent conflict on the leaderboard' }, request, env);
  }
};
