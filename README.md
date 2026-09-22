# williamfirenze.github.io

Il mio sito personale. Sito statico: niente build, niente dipendenze, niente
backend. Si apre con un doppio clic su `index.html` e funziona identico.

```
.
├─ index.html              pagina unica, tutta in inglese
├─ assets/
│  ├─ css/style.css
│  ├─ js/main.js           scroll, animazioni, apertura del gioco
│  ├─ js/game.js           il gioco ROLLBACK
│  └─ img/william.jpg      foto profilo
├─ .nojekyll               dice a GitHub Pages di servire i file cosi' come sono
└─ .gitignore
```

---

## Pubblicare

Il repo si chiama `williamfirenze.github.io`, quindi GitHub Pages lo serve
all'indirizzo **https://williamfirenze.github.io**.

Impostazione (una volta sola): *Settings → Pages → Build and deployment →
Source: **Deploy from a branch***, branch `main`, cartella `/ (root)`.

Da lì in poi ogni commit su `main` aggiorna il sito nel giro di un minuto.

### Aggiornare i file dal browser

*Add file → Upload files*, poi trascinare **il contenuto** della cartella
(non la cartella): `index.html`, `assets`, `.nojekyll`, `.gitignore`.
I file con lo stesso nome vengono sovrascritti.

Due cose che fanno perdere tempo se ce le si dimentica:

- se si trascina la cartella invece del contenuto, finisce tutto in una
  sottocartella e Pages risponde 404
- il caricamento **aggiunge e sovrascrive, non cancella**: i file rimossi
  vanno eliminati a mano dal repo
- dopo l'aggiornamento serve `Ctrl+Shift+R`, altrimenti il browser riusa
  il CSS vecchio dalla cache

---

## ROLLBACK

Il gioco nella sezione 03. Un solo tasto — **SPAZIO / click / tap** — inverte
il senso di rotazione.

| Elemento | Cosa fa |
|---|---|
| ● nero | tu, in orbita perpetua sull'anello |
| ● verde `COMMIT` | +1 punto, moltiplicatore fino a ×5 incatenando le prese |
| ▬ rosso `LOCK` | arco letale: lampeggia tratteggiato per ~1s, poi uccide. Deriva lungo l'anello |
| ◎ oro `VACUUM` | ogni 12 commit: cancella **tutti** i lock e vale +5 |

La velocità sale ogni 8 punti, i lock arrivano fino a 6 e derivano più veloci.
La combo scade dopo 2,7 secondi: fermarsi costa.

### Non si muore schiacciati

Regola di progetto: **il punteggio non ha tetto**, il limite è solo l'abilità.
Un lock non si avvicina mai al giocatore di propria iniziativa oltre
`SAFE_GAP` (0,46 rad): quando la sua deriva sta per chiudere quella distanza,
rimbalza e si allontana. Si muore **solo** andandogli addosso.

A questo si aggiungono tre garanzie minori:

- un lock non finisce di armarsi se il giocatore è sopra di lui: resta a
  lampeggiare finché non si è allontanato
- se non esiste un punto valido dove generare un lock, non viene generato
  (niente ripieghi a caso addosso al giocatore)
- un commit rimasto irraggiungibile per più di 1,6 s si sposta in un punto
  che si può raggiungere
- rete di sicurezza finale: se il corridoio libero scende sotto 0,80 rad, un
  lock viene liberato (`LOCK RELEASED`)

La difficoltà cresce sulla **velocità** (da 1,75 a 4,2 rad/s) e sulla deriva,
non togliendo spazio: i lock restano al massimo 5 e occupano al più il 25%
dell'anello.

Verificato con una simulazione senza browser (`harness` + bot): un giocatore
perfetto sopravvive 20 minuti filati oltre i 3800 punti senza mai morire,
anche disattivando il VACUUM. Un bot con riflessi umani muore fra i 65 e i
335 punti.

Il record personale è nel browser di chi gioca (`localStorage`). La classifica
condivisa invece sta in `data/leaderboard.json`, in questo repo.

---

## La classifica

Il sito è statico e non può scrivere da solo su GitHub: servirebbe un token, e
un token nel JavaScript della pagina sarebbe pubblico. Il token vive quindi in
un **Cloudflare Worker** (`worker/leaderboard.js`), che è l'unica cosa che
parla con l'API di GitHub. Ogni punteggio che entra in classifica diventa un
commit su `data/leaderboard.json`.

### Come è fatta

- **un record per nome**: di ogni giocatore resta solo il migliore
- si scrive **solo se il punteggio migliora** o entra nella top 100 — un
  peggioramento non genera nessun commit
- letture in cache 20 s, così i caricamenti del sito non consumano API GitHub
- messaggi di commit `rollback: NOME → PUNTI [skip ci]`
- CORS ristretto all'origine del sito
- controllo di plausibilità: punteggio massimo 5000 e non più di
  `20 + 15 × secondi` per partita (un giocatore perfetto fa ~3 punti/secondo)

Il controllo è un dosso, non una serratura: l'endpoint è pubblico e chi sa
usare `curl` può comunque inventarsi un punteggio. Su un sito statico non c'è
modo di impedirlo davvero.

### Messa in funzione

1. **Token GitHub** — *Settings → Developer settings → Personal access tokens →
   Fine-grained tokens*. Repository access: *Only select repositories* →
   `williamfirenze.github.io`. Permissions → Repository permissions →
   **Contents: Read and write**. Nient'altro. Segnare la scadenza in agenda.
2. **Worker** — [dash.cloudflare.com](https://dash.cloudflare.com) →
   *Workers & Pages → Create → Worker*, nome `rollback-leaderboard`, poi
   *Edit code* e incollare `worker/leaderboard.js`. Deploy.
3. **Variabili** — nel Worker, *Settings → Variables and Secrets*:

   | Nome | Tipo | Valore |
   |---|---|---|
   | `GITHUB_TOKEN` | Secret | il token |
   | `GITHUB_OWNER` | Text | `Williamfirenze` |
   | `GITHUB_REPO` | Text | `williamfirenze.github.io` |
   | `GITHUB_BRANCH` | Text | `main` |
   | `ALLOWED_ORIGINS` | Text | `https://williamfirenze.github.io` |

4. **Collegare il sito** — in cima a `assets/js/main.js`, unica riga da toccare:

   ```js
   var API = 'https://rollback-leaderboard.<sottodominio>.workers.dev';
   ```

   Senza barra finale. Finché resta `''` il sito funziona lo stesso: la
   classifica viene letta dal file statico e il salvataggio è nascosto.

Da terminale, in alternativa: `cd worker && npx wrangler deploy` e
`npx wrangler secret put GITHUB_TOKEN` (le altre variabili sono in
`wrangler.toml`). Il token non va mai nel repo.

Extra: `M` disattiva l'audio, `ESC` chiude la finestra, digitare `sql` sulla
pagina apre il gioco.

---

## Ask William — l'assistente sulla knowledge base

`chat.html` è una pagina dedicata, protetta da codice. **Non è un modello
linguistico**: non c'è nessuna API, nessuna chiave, nessun costo, e niente di
quello che viene scritto esce dal browser. Legge `data/kb.json`, capisce la
domanda e restituisce il runbook giusto.

Cosa sa fare:

- riconosce i codici errore (`ORA-01555`, `TNS-12541`, …) — è il segnale più forte
- capisce la domanda in italiano e in inglese, anche descritta a parole
- riconosce l'intento e mostra la sezione giusta: comandi, verifica, rollback,
  causa, sintomi, prevenzione
- tiene il contesto: dopo una risposta, "mostrami i comandi" resta sull'articolo
  aperto, ma `TNS-12541 come lo risolvo` cambia argomento
- se la domanda esce dalla knowledge base **lo dice**, invece di rispondere a caso

### Admin

`admin.html`, utente `admin`. La password non è in chiaro nel codice (c'è il suo
SHA-256) ma resta **una porta chiusa, non una serratura**: su un sito statico
chiunque può leggere il JavaScript e i JSON. Va bene per tenere il pannello fuori
dai piedi, non per difendere segreti. Stesso discorso per i codici di accesso:
in `data/users.json` ci sono solo gli hash, quindi l'elenco dei codici validi non
è leggibile, ma chi modifica il JS in locale entra lo stesso.

Tre schede: **Knowledge base** (importa il JSON generato da Claude, modifica,
esporta `kb.json`), **Access codes** (genera un codice per collega, esporta
`users.json`), **How to create a KB** (il prompt e i passi, con pulsante copia).

Tutto resta nel browser: l'admin produce due file che poi carichi in `data/`.

### Il prompt per generare i KB

Sta in `KB_PROMPT.md` e dentro l'admin. Si incolla in qualsiasi chat di Claude,
sotto si racconta il caso, e restituisce il JSON pronto da importare. Se qualcosa
non gliel'hai detto, lo mette in `_missing` invece di inventarlo — e l'admin te lo
segnala nella lista.
