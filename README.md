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

Il record personale è salvato nel browser di chi gioca (`localStorage`), non
esiste nessuna classifica condivisa: un sito statico non può scriverla da
nessuna parte.

Extra: `M` disattiva l'audio, `ESC` chiude la finestra, digitare `sql` sulla
pagina apre il gioco.
