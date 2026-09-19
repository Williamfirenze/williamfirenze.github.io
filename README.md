# william — portfolio di William Firenze

Sito statico (zero build, zero dipendenze) + una Netlify Function che usa
**un file JSON versionato su GitHub come database** della classifica del gioco.

```
william/
├─ index.html                        pagina unica, centrata, senza nav (IT / EN)
├─ assets/
│  ├─ css/style.css
│  ├─ js/main.js                     UI, lingua, classifica
│  ├─ js/game.js                     il gioco ROLLBACK
│  └─ img/william.jpg                foto profilo
├─ data/leaderboard.json             ← il "database" (viene committato dalla function)
├─ netlify/functions/leaderboard.mjs endpoint GET/POST
└─ netlify.toml
```

---

## 1 · Pubblicare su GitHub

Dentro la cartella `william/`:

```bash
git init
git add .
git commit -m "William Firenze — portfolio + ROLLBACK"
git branch -M main
git remote add origin https://github.com/TUO-USERNAME/william.git
git push -u origin main
```

## 2 · Collegare Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub** → repo `william`.
2. Build command: **vuoto**. Publish directory: **`.`** (sono già in `netlify.toml`).
3. Deploy.

## 3 · Accendere la classifica online

La function scrive i punteggi direttamente su `data/leaderboard.json` nel repo:
**ogni partita salvata diventa un commit**.

Serve un token GitHub:

1. GitHub → *Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token*.
2. **Repository access**: *Only select repositories* → `william`.
3. **Permissions → Repository permissions → Contents: Read and write**. Nient'altro.
4. Copia il token (`github_pat_…`).

Poi su Netlify → *Site configuration → Environment variables* aggiungi:

| Variabile       | Valore                    |
|-----------------|---------------------------|
| `GITHUB_TOKEN`  | il token appena creato    |
| `GITHUB_OWNER`  | il tuo username GitHub    |
| `GITHUB_REPO`   | `william`                 |
| `GITHUB_BRANCH` | `main`                    |

Poi **Deploys → Trigger deploy → Clear cache and deploy site**.

> Il token va **solo** nelle variabili d'ambiente di Netlify. Mai dentro il repo.

Senza token il sito funziona lo stesso: il gioco gira e la classifica
resta salvata nel browser di chi gioca (`solo locale` sotto la classifica).

### Nota sui deploy automatici
Ogni punteggio salvato crea un commit → Netlify fa un rebuild.
Se preferisci evitarlo, in *Site configuration → Build & deploy → Build hooks →
Stop builds* oppure aggiungi `[skip ci]` — il messaggio di commit è già
`rollback: NOME → PUNTI`, facile da filtrare.

---

## 4 · Il gioco: ROLLBACK

Un solo tasto — **SPAZIO / click / tap** — inverte il senso di rotazione.

| Elemento | Cosa fa |
|---|---|
| ● nero | tu, in orbita perpetua sull'anello |
| ● verde `COMMIT` | +1 punto, moltiplicatore fino a ×5 se incateni le prese |
| ▬ rosso `LOCK` | arco letale: lampeggia tratteggiato per ~1s, poi uccide. Deriva lungo l'anello |
| ◎ oro `VACUUM` | ogni 12 commit: cancella **tutti** i lock e vale +5 |

La velocità sale ogni 8 punti, i lock aumentano fino a 6 e derivano più veloci.
La combo scade dopo 2,7 secondi: fermarsi costa.

Extra: `M` disattiva l'audio, `ESC` chiude, digitare `sql` sulla pagina apre il gioco.

---

## 5 · API

`GET /api/leaderboard` → `{ "entries": [{ "name", "score", "date" }], "source": "github" }`

`POST /api/leaderboard` con `{ "name": "WILL", "score": 42 }` → `{ ok, entries, rank }`

Limiti lato server: nome 2–14 caratteri, punteggio intero 0–5000, top 100 conservati.

---

## 6 · E se invece lo metto su GitHub Pages?

Il **sito funziona**: è tutto statico. Quello che non funziona è **salvare** i punteggi.

GitHub Pages serve solo file: non esegue codice lato server, quindi
`netlify/functions/leaderboard.mjs` non gira e `netlify.toml` viene ignorato.
Scrivere su `data/leaderboard.json` richiede un token GitHub, e un token
nel JavaScript della pagina sarebbe pubblico (GitHub lo revoca da solo appena
lo vede in un repo). Quindi su Pages le variabili non è che non servano:
è che **non c'è dove metterle**.

Cosa succede davvero su Pages, senza toccare niente:

| | Netlify | GitHub Pages |
|---|---|---|
| Sito, gioco, CV, lingue | ✅ | ✅ |
| Classifica **letta** da `data/leaderboard.json` | ✅ | ✅ (etichetta `file statico`) |
| Classifica **scritta** dai giocatori | ✅ | ❌ → salva nel browser (`solo locale`) |

### Nome del sito
`williamfirenze.github` non esiste come dominio. GitHub Pages dà `*.github.io`:

- **User site** → il repo deve chiamarsi esattamente `<tuo-username>.github.io`
  → indirizzo `https://<tuo-username>.github.io`
- **Project site** → repo `william` → indirizzo `https://<tuo-username>.github.io/william/`

In entrambi i casi: *Settings → Pages → Source: Deploy from a branch → `main` / `root`*.
I percorsi del sito sono relativi, quindi funziona anche nella sottocartella.

### Volere tutto e due
Lo stesso repo può stare su Pages **e** su Netlify contemporaneamente.
La function espone già `Access-Control-Allow-Origin: *`, quindi dal sito su
Pages basta puntare l'API al dominio Netlify: in `assets/js/main.js` cambia

```js
var API = '/api/leaderboard';
```
in
```js
var API = 'https://TUO-SITO.netlify.app/api/leaderboard';
```

---

## 7 · Sviluppo locale

Sito statico:

```bash
npx serve .
```

Con le function attive (serve la Netlify CLI):

```bash
npx netlify-cli dev
```
