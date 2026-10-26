# Angular App (Front-end)

Questo modulo è il frontend **Angular** di Covenant per il team SOC INFRA,
dedicato all'inventario Windows e alla correlazione CVE. Usa un tema chiaro
Microsoft/Azure con componenti PrimeNG: schede bianche `#ffffff`, sfondo
`#f5f7fb`, azioni blu Azure `#0078d4` e accenti viola `#744da9`.

## Architettura e Scelte Implementative

L'architettura del frontend è focalizzata sull'usabilità, sull'aspetto visivo e sull'asincronicità delle chiamate verso le API sottostanti, delegando qualsiasi computazione pesante o complessa al `back-end`.

### 1. Design System & UI/UX

- **Niente CSS Frameworks pesanti**: Le scelte stilistiche (palette colori, bordi arrotondati, bottoni sleek) sono implementate prevalentemente con puro Vanilla CSS / CSS Modules. Questo assicura totale controllo sul design, un'interfaccia molto reattiva (micro-animazioni su hover) e zero "bloatware".
- **PrimeNG**: Laddove vi sono concetti complessi di visualizzazione dati (es. DataTables con paginazione nativa e filtri), è stata scelta la libreria _PrimeNG_ che fornisce componenti enterprise out-of-the-box e garantisce coerenza stilistica e stabilità su grosse moli di dati.
- **Accessibilità del tema**: focus da tastiera visibile, supporto a
  `prefers-reduced-motion` e colori forzati; font Segoe UI/system-ui locali.

#### Ricerca e filtri

- **Ricerca condivisa**: Mailing Templates, Sites Inventory e Services utilizzano `SearchFieldComponent`, con lo stesso stile arrotondato, etichetta accessibile e spazio fisso per la lente anche su schermi stretti. Il componente espone `inputId`, `label`, `placeholder` e il binding bidirezionale `value`; le pagine mantengono la propria logica di ricerca.
- **Filtri delle colonne (Hosts e Fixes)**: Shift+click sull'intestazione mostra o nasconde solo il campo testuale della colonna, senza cambiare l'ordinamento o cancellare il testo inserito. Funziona sia con i filtri globali aperti sia chiusi; il click normale continua a ordinare. Il pulsante dei filtri globali ripristina la visibilità comune dei campi.

#### Dettaglio host

La pagina `/machine/:id` usa una scheda tecnica unica:
sistema, collocazione e manutenzione sono affiancati, seguiti da
rete, opzioni avanzate e note, senza tab o sezioni da aprire. Su schermi stretti
le sezioni si dispongono in verticale. La pagina Hosts non cambia.
Le matite mantengono la modifica rapida (salvataggio con Invio o uscita dal campo;
le note si salvano all'uscita). Restano i preset per ambiente, nodo, locazione,
zona e divisione, gli interruttori booleani e il selettore OS con preset
Windows 10/11 e Windows Server 2016/2019/2022/2025.
La rete mostra IP e VLAN affiancati per interfaccia, esclusivamente da dati
inseriti o importati nell'inventario: non esegue recuperi remoti.
Gli utenti readonly non possono modificare.

### 2. Gestione Asincrona e Chiamate REST

Tutte le interazioni HTTP tra il Frontend ed il Backend avvengono tramite chiamate REST.

- Viene utilizzato il framework per richieste asincrone integrato di Angular o `Axios`, a seconda dei moduli.
- Tutte le chiamate gestiscono intrinsecamente le Promise. Non ci sono polling bloccanti: l'UI rimane sempre responsiva durante il caricamento grazie agli spinner e all'architettura asincrona.
- Le chiamate sono dirette all'`API Gateway` (il modulo back-end), tipicamente sulla rotta `/api/*`. Il frontend non conosce, né può contattare direttamente il database.

### 3. Proxy di Sviluppo

Durante lo sviluppo, `proxy.conf.json` inoltra le chiamate `/api` al backend
sulla porta `9991`; il server Angular usa la porta `4200`.

## Pubblicazione Windows

Compilare con `npm run build` e pubblicare i file statici di
`dist/angular-app/browser`, ad esempio con IIS. Configurare fallback SPA a
`index.html` per route come `/hosts` e proxy `/api` verso il backend,
preservando path, autenticazione e upload da 10 MB. Per SSE verificare timeout,
riconnessioni e assenza di buffering/compressione che ritardano gli eventi.
Non registrare token SSE nelle query dei log. IIS è un'opzione di deployment,
non una nuova integrazione applicativa; il progetto non ne installa i moduli.
Nessuna credenziale del backend deve essere incorporata nei bundle.

## Pagine e permessi

Le route protette sono `dashboard`, `services`, `sites`, `hosts`, `fixes`,
`mailing`, `settings`, `cve-analysis` e `machine/:id`; `/login` è
pubblica. Il guard di autenticazione reindirizza al login quando la sessione
non è valida. Le pagine di inventario e CVE mostrano le azioni di modifica
solo agli utenti `admin`; gli utenti `readonly` possono consultare e filtrare.

`BackendService` concentra le chiamate all'API Gateway `/api`; il proxy di
sviluppo è configurato in `proxy.conf.json` e non viene usato dopo la build.
L'ottimizzazione production mantiene la minificazione di script e stili.
Il tema usa font di sistema locali, con Segoe UI e fallback CSS, senza
download di font remoti durante la build o dal browser.

## Comandi Utili

Da PowerShell nella directory `angular-app`:

```powershell
npm ci
npm run start
```

`npm run start` avvia Angular su `http://localhost:4200` con proxy verso il
backend. Per la produzione usare `npm run build`, non il dev server.

## Aggiornamenti Recenti

- **Cross source**: `CrossSourceComponent` e' integrato nella scheda macchina
  e nei popup di Servizi, Sites e CVE tracciate; non aggiunge route principali.
  Gli input `sourceType`, `sourceId`, `revision` identificano la sorgente e
  consentono di aggiornare i riferimenti dopo una modifica. Mostra categoria,
  contatori, ambiente/OS Windows già salvati e motivo del collegamento,
  distinguendo riferimenti diretti da potenziali. **Esplora collegamenti**
  cambia sorgente nel pannello; **Torna alla sorgente** ripristina quella
  iniziale; **Apri scheda** apre la pagina/popup esistente. Sono supportati
  `/services?serviceId=42`, `/sites?siteId=42`, `/cve-analysis?cveId=42`.
  Ricerca (debounce 300 ms), filtri e paging sono delegati al gateway tramite
  Axios; le richieste superate vengono annullate. **Aggiorna** rilegge i dati;
  errori e risultati vuoti sono espliciti. Disponibile anche agli utenti readonly.
  Il pannello è minimizzabile cliccando sul titolo "Riferimenti cross source".
  Le CVE potenziali non sono una prova di vulnerabilita' e non modificano il
  workflow; nessun recupero remoto o DNS viene avviato dal pannello.

- Nuovo componente riutilizzabile **`ImportDialogComponent`** (`components/import-dialog`): popup PrimeNG con download del template CSV, upload del file compilato (`.csv` o `.json`, max 10MB) e riepilogo dell'esito (creati, completati, invariati, scartati con numero di riga). Usato dal pulsante **Importa CSV** nelle pagine Hosts e Sites (solo utenti con permessi di scrittura); al termine le tabelle/card vengono ricaricate. Nuovi metodi `BackendService.downloadImportTemplate()` e `BackendService.importFile()`.

- Nuova pagina **CVE Analysis** (`/cve-analysis`): tab "In analisi" e "Archiviate" con filtri (ricerca, severita da score, motivo attesa/esito, impatto, intervallo date di inoltro), azioni massive per la riunione settimanale (segna riviste, archivia, riporta in analisi), dialog di dettaglio/modifica e tab "Ricerca CVE" con dettagli da cve-search e aggiunta rapida al tracciamento.
- CVE Analysis: pulsante **Importa CSV** (popup che scarica il template e consente l'upload del CSV esportato da ITSM, con riepilogo creati/aggiornati/riaperti/archiviati ed errori), motivo attesa a testo libero con storico visibile nel dettaglio, flag con bandierina rossa (Shift+click sulla riga o colonna dedicata, filtro "Solo flaggate"), nuovi esiti di archiviazione con "Altro" personalizzabile, filtro data "Archiviate" nella tab archiviate, pulsante **Esporta CSV** (vista e filtri correnti), campo Vendor e recupero dei dati mancanti da cve-search (pulsante nel dialog e azione massiva "Completa da cve-search") e rimozione dei campi ridondanti (Riferimenti, CVE origin, Stato sito, host impattati). La data di archiviazione viene registrata e mostrata con precisione al minuto.
- Miglioramenti accessibilita su componenti principali (associazione `label`/`id`, uso `aria-label`, supporto tastiera Enter/Space su controlli interattivi).
- Riduzione complessita in componenti ad alto carico (fixes, hosts, machine, shared-table) con estrazione helper e logica piu lineare.
- Aggiornamenti di qualita TypeScript (readonly su dipendenze, optional chaining, parsing numerico esplicito) e correzioni regex.
- Dettaglio macchina indirizzato per `id` (`/machine/:id`); i link che conoscono solo il nome (es. host reali dei siti) usano `/machine/by-name?hostname=...&ambiente=...`, che risolve l'`id` tramite il back-end e reindirizza. Selezioni e operazioni massive della tabella host usano gli `id`, cosi' macchine omonime (es. piu' dismesse con lo stesso hostname) restano distinte.

## Documentazione componenti

Generare Compodoc dal root del frontend con `npm run docs:build`; l'output è
pubblicato in `back-end/public/frontend-docs` e servito dal backend su
`http://localhost:9991/fe-docs/`.
