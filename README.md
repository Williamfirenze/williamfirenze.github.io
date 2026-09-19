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

Il gioco non è mai ingiusto per costruzione: se due lock in deriva stanno per
chiudere il giocatore in uno spicchio troppo stretto, uno viene rilasciato
(`LOCK RELEASED`); e un commit finito sotto un lock si sposta da solo in un
punto raggiungibile.

Il record personale è salvato nel browser di chi gioca (`localStorage`), non
esiste nessuna classifica condivisa: un sito statico non può scriverla da
nessuna parte.

Extra: `M` disattiva l'audio, `ESC` chiude la finestra, digitare `sql` sulla
pagina apre il gioco.
