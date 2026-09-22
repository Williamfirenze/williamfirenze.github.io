# Prompt per generare un KB

Incolla tutto quello che c'è nel blocco qui sotto in **qualsiasi chat di Claude**,
poi sotto racconta il caso come viene — appunti, sfogo, copia-incolla dal ticket.
Ti restituisce un blocco JSON pronto da incollare nella pagina admin.

Lo stesso testo è dentro `admin.html`, scheda *How to create a KB*, con il pulsante copia.

---

```
Fai da redattore tecnico per la knowledge base di William Firenze, database
administrator. Io ti racconto un problema che ho risolto sul lavoro; tu lo
trasformi in un runbook riutilizzabile in formato JSON.

REGOLE
1. Rispondi SOLO con un blocco di codice JSON. Nessun testo prima o dopo.
2. Non inventare nulla. Se un campo non lo so, lascialo vuoto ("" o []) e
   aggiungi la domanda in "_missing". Non riempire i buchi con plausibilita'.
3. Scrivi in inglese, in forma piana, come un collega che spiega a un altro.
   Niente marketing, niente "semplicemente", niente passivi inutili.
4. I comandi vanno copiati ESATTAMENTE come li ho scritti io. Se li ho scritti
   a memoria e possono essere imprecisi, dillo in "note" di quello step.
5. Ogni step di "resolution" e' UNA azione. Se serve un comando, sta in
   "command"; l'avvertenza sta in "note". Non mettere piu' comandi in uno step
   se possono essere eseguiti separatamente.
6. "codes" deve contenere ogni codice errore citato, in MAIUSCOLO, nella forma
   ORA-01555 / TNS-12541 / RMAN-06059. Sono la chiave di ricerca piu' forte:
   non dimenticarne nessuno.
7. "keywords" serve a farmi trovare l'articolo con le parole che userei sotto
   pressione alle 3 di notte, anche sbagliate o in italiano. Mettine 5-12.
8. "id" in minuscolo, parole separate da trattini, senza spazi.
9. "updated" nel formato YYYY-MM-DD, la data di oggi.
10. "severity" solo uno tra: low, medium, high, critical.
11. "type" solo uno tra: troubleshooting, procedure, reference, checklist.

SCHEMA (rispetta i nomi dei campi alla lettera)
{
  "id": "stringa-con-trattini",
  "title": "Titolo breve, con il codice errore se c'e'",
  "type": "troubleshooting",
  "codes": ["ORA-01555"],
  "products": ["Oracle Database 19c"],
  "severity": "medium",
  "updated": "2026-09-22",
  "tags": ["parole", "di", "categoria"],
  "keywords": ["come", "lo", "cercherei"],
  "summary": "Due o tre frasi: cos'e' e quando si presenta.",
  "symptoms": ["Cosa vede chi lo subisce, una voce per sintomo"],
  "cause": "Perche' succede, in una o due frasi.",
  "resolution": [
    { "step": "Una azione.", "command": "il comando esatto", "note": "avvertenza, se serve" }
  ],
  "verification": [
    { "step": "Come si controlla che sia davvero risolto.", "command": "comando" }
  ],
  "rollback": "Come si torna indietro se peggiora. Se non si puo', scrivilo chiaro.",
  "prevention": ["Cosa fare perche' non ricapiti"],
  "references": ["Doc ID 1234.1", "titolo del manuale"],
  "_missing": ["Domande a cui non ho risposto e che servirebbero"]
}

Se quello che ti ho raccontato copre piu' problemi distinti, restituisci un
array JSON con un oggetto per problema.

Ecco il caso:
```

---

## Cosa succede dopo

1. Copi il JSON che ti restituisce.
2. Apri `admin.html` → scheda **Knowledge base** → **Paste JSON** → incolli → **Import**.
3. Se ci sono `_missing`, l'admin te li mostra: rispondi e rigenera, oppure completa a mano.
4. **Export kb.json** e carichi il file nel repo, in `data/`.

## Perché lo schema conta

L'assistente nella chat non è un modello linguistico: non indovina. Trova
l'articolo giusto pesando titolo, codici errore, tag e keyword, poi mostra la
sezione che gli è stata chiesta — comandi, verifica, rollback, causa.

Vuol dire che **la qualità delle risposte è la qualità dei campi**. Un articolo
con `codes` e `keywords` pieni si trova sempre; uno con solo il titolo si trova
solo se indovini le parole esatte.
