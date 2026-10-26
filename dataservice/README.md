# Covenant — Dataservice (Database Abstraction Layer)

Questo modulo agisce come _Database Abstraction Layer_. Sviluppato in **Node.js/Express** con **TypeScript**, il suo unico compito è dialogare in modo sicuro ed efficiente con il database interno (in questo caso **SQLite**) ed esporre ai servizi superiori (es. Back-end) un'interfaccia puramente REST in JSON.

## Architettura e Scelte Implementative

- **Microservizio dedicato**: Solo il dataservice legge e scrive SQLite; backend
  e frontend usano esclusivamente API REST.
- **SQLite persistente**: `DB_PATH` configura un file dedicato, ad esempio
  `C:\Covenant\data\inv.db`, con ACL di lettura/scrittura per l'account del servizio.
- **Transazioni di Rollback**: Le chiamate di modifica critica (ad esempio i "bulk updates" o i "bulk deletes") sono scritte all'interno di un blocco `BEGIN TRANSACTION`. Qualora ci fosse un errore in corso di query, l'intera operazione andrebbe in `ROLLBACK`, garantendo l'integrità del dato.

## Esecuzione nativa Windows e affidabilità

### 1. WAL Mode (Write-Ahead Logging) per SQLite

Per migliorare la concorrenza tra letture e scritture, l'inizializzazione (`db.ts`)
imposta:
`PRAGMA journal_mode=WAL;`
Il WAL (_Write-Ahead Logging_) permette letture durante una scrittura; non
elimina ogni possibile contesa e mantiene un solo writer alla volta.

### 2. Sicurezza (Rate Limiting e CORS stretto)

Pur non essendo esposto ad internet, in ottica _Zero Trust Network_, il dataservice:

- Ha policy **CORS ristrettissime**: accetta richieste SOLO ed ESCLUSIVAMENTE dall'indirizzo del back-end (iniettato tramite `BACKEND_URL`).
- Previene script injection e XSS (che potrebbero corrompere il db in JSON) nascondendosi dietro i middleware **Helmet**.
- Ha un rate limiter (2000 richieste per 15 minuti).

Il dataservice non ha autenticazione applicativa: CORS e Helmet non sostituiscono
l'isolamento di rete. Non pubblicare la porta `9992` agli utenti.

### 3. Osservabilità (Winston Logs JSON)

Al pari del backend usa `winston`. Con `NODE_ENV=production` i log sono JSON,
utilizzabili dagli strumenti di osservabilità aziendali.

### 4. Global Error Handle

Il processo di Node.js non crasherà di fronte a query malformate o eccezioni del filesystem: il Global Error Handler (nel fondo di `index.ts`) catturerà le promesse non risolte e notificherà le API superiori restituendo uno status `500`.

## Comandi Utili

Da PowerShell nella directory `dataservice`:

```powershell
$env:DB_PATH = "C:\Covenant\data\inv.db"
npm ci
npm run dev
```

La porta predefinita è `9992`. Per produzione:

```powershell
npm run build
$env:NODE_ENV = "production"
npm run start
```

`npm run start` esegue `node dist/index.js`. Avviare questo servizio prima del backend.

## API, schema e configurazione

Le API sono montate sotto `/data`, sono limitate a 2000 richieste ogni 15
minuti e accettano richieste dall'origine `BACKEND_URL`. Swagger è disponibile
su `/docs/` e l'OpenAPI JSON su `/docs.json`. L'elenco aggiornato di rotte e
payload è in [`../docs/API.md`](../docs/API.md).

Il servizio espone host, siti, servizi, mailing template, settings, log e CVE.
Gli import host/siti accettano `{ rows: [...] }`; l'import CVE accetta lo stesso
payload normalizzato dal backend. `DB_PATH` permette di spostare il file
SQLite; il percorso predefinito è `data/inv.db`.

Nei database nuovi il tema predefinito è `light`, coerente con la UI Azure.
Le impostazioni già presenti nei database esistenti non vengono sovrascritte.

Covenant/SOC INFRA usa un database e backup separati: **non condividere il DB
del progetto originale**. Lo schema viene creato/migrato, ma non converte
automaticamente gli OS; importare esclusivamente inventario Windows 10/11 e
Windows Server 2016/2019/2022/2025. I dati di rete sono solo inventariati, senza
raccolta remota. Effettuare backup SQLite consistenti prima di importazioni o
migrazioni; per copie a freddo fermare i processi e non copiare il solo file DB
mentre è aperto in WAL. La directory deve consentire anche la scrittura dei
file WAL/SHM. Vedere il [README generale](../README.md#database-e-backup-separati).

## Aggiornamenti Recenti

- **Cross source**: `GET /data/cross-source` (router `crossSource.ts`) restituisce
  proiezioni degli array `hosts`, `services`, `sites`, `cves` per il calcolo
  delle relazioni nel gateway. Legge soltanto dati gia presenti in SQLite,
  senza nuove tabelle, migrazioni o scritture. Sono esclusi settings,
  credenziali e stati operativi delle macchine. Il gateway restituisce al
  browser soltanto i riferimenti filtrati e paginati, non gli inventari interi.

- **Nessun seed di dati di test**: se il DB non esiste (o non contiene le tabelle) viene creato un file SQLite vuoto con il solo schema e le impostazioni di default (la directory del file viene creata se mancante). Rimosso il caricamento automatico da `data/inv.json` / `data/site.json`.
- Nuovo router `imports.ts` con `POST /data/hosts/import` e `POST /data/sites/import` (payload `{ rows: [...] }`, chiavi = colonne DB, max 20000 righe / 20MB). Merge con **priorita' al DB**: chiave hostname+ambiente+servizio per gli host e url_aliases+ambiente+servizio per i siti (case-insensitive, servizio vuoto = NULL); sui record esistenti vengono valorizzati solo i campi vuoti (per gli host i campi completati vengono aggiunti a `manual_overrides`), gli altri vengono inseriti. Unica transazione con savepoint per riga: righe non valide o in conflitto (host attivo con stesso hostname+ambiente) vengono scartate e riportate in `errors`, mentre un errore imprevisto causa il rollback completo. Risposta: `ImportResult` (`total`, `inserted`, `merged`, `unchanged`, `skipped`, `errors[{ index, error }]`).
- Helper host condivisi (parsing OS, whitelist colonne, manual overrides, rollback) estratti in `hostHelpers.ts`.

- Nuova tabella `cves` (creata automaticamente all'avvio anche su DB esistenti) e router `cves.ts` (`/data/cves`) con filtri/paginazione server-side e scritture in transazione con rollback. I campi ricalcano le colonne del file Excel di tracciamento SOC (ID problem, Data ultima modifica, Data inoltro, Riepilogo/CVE, Stato, Note, Riferimenti, Errata, Score, CVE Origin) piu i campi di workflow (`stato` IN_ANALISI/ARCHIVIATA, motivo attesa, esito, impatto, ultima revisione).
- CVE: nuove colonne `prodotto`, `vendor` e `flagged`, tabella `cve_motivo_history` (storico motivi di attesa, utente da header `X-Actor`) e migrazione automatica idempotente dei dati legacy (prodotto da CVE origin, codici motivo → etichette, riferimenti → motivo attesa). Nuovi endpoint `POST /data/cves/import` (upsert per `problem_id` in un'unica transazione: `Pendente` → IN_ANALISI con de-archiviazione, altri stati → ARCHIVIATA) e `GET /data/cves/:id/history`; filtri `flagged`, `date_field` ed `esito=ALTRO` (motivazioni non standard).
- Rifattorizzazione di inizializzazione DB in `db.ts` con helper per migrazioni colonne e riduzione complessita.
- Allineamento import Node (`node:fs`, `node:path`) e normalizzazione path OpenAPI.
- Mantenute garanzie di transazione e rollback per operazioni di scrittura bulk.
- Tabella `hosts` con chiave primaria surrogata `id` (al posto di `PRIMARY KEY (hostname, ambiente)`): migrazione automatica e transazionale dei DB esistenti in `db.ts`, indice di lookup case-insensitive su (`hostname`, `ambiente`) e indice univoco parziale valido solo per gli host attivi (gli host dismessi possono condividere l'hostname).
- API host indirizzate per `id` (`GET/PUT/DELETE /data/hosts/:id`, bulk con `{ ids[] }`) e nuovo endpoint `GET /data/hosts/resolve` per la conversione hostname (+ ambiente) → `id`. I conflitti di unicita' restituiscono `409` (con rollback per le operazioni bulk).
