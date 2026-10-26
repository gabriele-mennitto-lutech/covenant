# Back-end (API Gateway & Logica di Business)

Questo modulo è l'API Gateway di Covenant per SOC INFRA. È sviluppato in
**Node.js**, **Express** e **TypeScript**, con esecuzione nativa Windows.

Intercetta le richieste del frontend, applica filtri e correlazioni CVE Windows,
consulta cve-search/CIRCL e interroga il dataservice per ogni dato persistente.
IP e VLAN provengono esclusivamente dall'inventario, senza recuperi remoti.

## Architettura e Scelte Implementative

- **Single Responsibility (Separazione delle logiche)**:
  Il routing Express è suddiviso per categoria: `/api/hosts` in `hosts.ts`,
  `/api/sites` in `sites.ts` e cve-search in `external.ts`.
- **Microservizio puro**: Il backend non tocca mai direttamente SQLite; usa
  REST verso il dataservice, unico proprietario del file DB.
- **Asincronicità e Paging**: Per gestire grandi moli di dati (come l'elenco degli host), tutte le chiamate tra Frontend e Backend sono asincrone e restituiscono JSON strutturati. Il backend si occupa di applicare i filtri massivi e restituire risultati impaginati (se necessario) per non affogare il Frontend.

## Sicurezza e osservabilità

### 1. Protezione API (Helmet & CORS)

- **Helmet**: Nasconde gli header di Express (es. `X-Powered-By`), aggiunge policy per `Strict-Transport-Security`, mitigazione XSS e previene sniffing di MIME types.
- **CORS dinamico**: Accetta connessioni solo dall'origine esplicita del front-end (definita dalla variabile `.env` `FRONTEND_URL`), bloccando chiamate provenienti da script malevoli lanciati da domini terzi.

### 2. Prevenzione Abusi (Rate Limiting)

- È stato introdotto un middleware `express-rate-limit` impostato a 1500 chiamate ogni 15 minuti per IP. In caso di abusi o bug sul frontend che triggerano loop infiniti, il backend restituisce `429 Too Many Requests` invece di esaurire le risorse computazionali o causare disservizi.

### 3. Log Strutturati (Winston)

- È stato inserito un logger customizzato basato su **Winston**. In ambiente locale stampa log colorati leggibili. Se la variabile di ambiente `NODE_ENV=production` viene impostata, l'output si trasforma automaticamente in un **puro JSON**, ideale per aggregazioni e alert in Kibana senza bisogno di parse custom complessi (`syslogger.ts`).

### 4. Global Error Handling

- Un middleware finale gestisce gli errori delle richieste, registra il
  problema e restituisce `500 Internal Server Error` senza esporre stack trace.

## Comandi Utili

Da PowerShell nella directory `back-end`, configurare `.env` dal modello:

```powershell
npm ci
npm run dev
```

La porta predefinita è `9991`. Per produzione:

```powershell
npm run build
$env:NODE_ENV = "production"
npm run start
```

`npm run start` esegue `node dist/index.js`; il dataservice deve essere già attivo.

Per verificare le euristiche cross source, dal root del repository eseguire
`npm run build --prefix back-end`, poi
`node --test local_utils/cross-source.test.cjs`.
I casi coprono associazioni bidirezionali, FQDN/IP/ambienti, versioni Windows,
alias di prodotto, falsi positivi generici, propagazione CVE,
deduplicazione e assenza di modifiche ai dati in ingresso.

## API e configurazione

Le rotte sono montate sotto `/api` e richiedono un token di sessione, eccetto
`POST /api/auth/login`. Il middleware applica Helmet, CORS configurabile,
limite di 1500 richieste ogni 15 minuti e gestione uniforme degli errori.
L'elenco completo, inclusi servizi, mailing, log, notifiche SSE, import/export
CVE e ricerca cve-search, è in [`../docs/API.md`](../docs/API.md).

Le variabili principali sono `PORT`, `DATASERVICE_URL`, `FRONTEND_URL`,
`AUTH_MODE`, `AUTH_TOKEN_TTL_MS`, le variabili LDAP e `CVE_SEARCH_*`; il modello
completo è in [`.env.example`](.env.example).

LDAP/AD e credenziali locali sono gestiti solo dal backend; non includere `.env`
nei file statici. L'autenticazione locale richiede `LOCAL_ADMIN_PASSWORD` o
`LOCAL_READONLY_PASSWORD` non vuota né composta solo da spazi per il rispettivo account, anche in modalità
`hybrid`: non ci sono password di fallback. I nomi utente possono mantenere
i default `SOCINFRAADM`/`SOCINFRAREAD`. Nei test usare password impostate
esplicitamente nell'ambiente del processo, mai segreti commessi.
Per pubblicazione Windows tramite IIS, proxy `/api`, fallback
SPA e precauzioni SSE vedere il [README generale](../README.md).

## Aggiornamenti Recenti

- **Cross source**: `GET /api/cross-source/:type/:id`, con `type` tra `hosts`,
  `services`, `sites`, `cves`. Il router `routes/crossSource.ts` legge proiezioni
  fresche dal dataservice e delega a `CrossSourceService` le correlazioni.
  `target`, `search`, `page` e `pageSize` filtrano/paginano lato server (25
  risultati di default, massimo 100). Ogni riferimento include `type`, `id`,
  `label`, `context`, `confidence` (`direct`/`potential`) e `reasons`.
  Host/servizi/siti sono collegati tramite servizi dichiarati, host reali,
  hostname e IP salvati. Le CVE usano asset dichiarati, versione Windows
  (10/11 o Server 2016/2019/2022/2025) e prodotti citati nei testi inventariati.
  Nessun accesso diretto al DB, DNS o chiamata esterna, nessuna modifica agli
  esiti CVE. `GET /api/services/:id` apre un dettaglio anche fuori dai filtri
  correnti. Vedere [API](../docs/API.md) per esempi e limiti delle euristiche.

- **Import CSV/JSON di host e siti**: `GET /api/hosts/import/template` e `GET /api/sites/import/template` restituiscono il template CSV (BOM UTF-8, separatore `;`); `POST /api/hosts/import` e `POST /api/sites/import` ricevono il contenuto del file come `text/plain` (query `format=csv|json`, max 10MB). Il parsing (CSV RFC 4180 con separatore `;`/`,` auto-rilevato, intestazioni case-insensitive, conversione booleani/interi/liste) e la validazione avvengono in `utils/csvImport.ts`; le righe valide vengono inviate al dataservice (`/data/*/import`) che esegue il merge con priorita' al DB. Al termine la cache host/siti viene ricaricata, l'operazione viene registrata nell'activity log (`IMPORT`) e notificata via SSE. Esempio:
  ```powershell
  # AUTH_HEADER = header Authorization con il token di sessione restituito da POST /api/auth/login
  curl.exe -X POST "http://localhost:9991/api/hosts/import?format=csv" `
       -H "$AUTH_HEADER" -H "Content-Type: text/plain" `
       --data-binary @template_import_hosts.csv
  # => { "total": 2, "inserted": 1, "merged": 1, "unchanged": 0, "skipped": 0, "errors": [], "ignoredColumns": [] }
  ```

- Nuova feature **CVE Analysis**: router `routes/cves.ts` (`/api/cves`, proxy verso `/data/cves` con activity log e notifiche) e ricerca dettagli CVE via cve-search in `routes/external.ts` (`GET /api/external/cve-search/:cveId`, client/normalizzatore in `services/cveSearch.ts`). Variabili d'ambiente: `CVE_SEARCH_URL` (default `https://cve.circl.lu`, sostituibile con un'istanza cve-search interna) e `CVE_SEARCH_TIMEOUT_MS` (default 10000).
- Import CSV CVE: `POST /api/cves/import` (body `text/csv`, max 10 MB / 5000 righe) analizzato da `services/cveImport.ts` (delimitatore `;`/`,`/tab rilevato automaticamente, campi tra virgolette multilinea, date ITSM `gg/mm/aaaa hh.mm.ss`); le righe valide sono inoltrate a `/data/cves/import`, gli errori per riga sono restituiti nella risposta. Export CSV `GET /api/cves/export` (stessi filtri dell'elenco, `services/cveExport.ts`, celle protette dalle formule) e completamento da cve-search `POST /api/cves/enrich` + best effort in `POST /api/cves` (`services/cveEnrich.ts`, solo campi vuoti: vendor, prodotto, score). Nuovo `GET /api/cves/:id/history` (storico motivi di attesa); le scritture CVE propagano l'utente al dataservice tramite header `X-Actor`.
- Migliorata la sicurezza sessioni con token generati tramite sorgente crittograficamente sicura.
- Riduzione complessita in rotte ad alto carico (hosts, external, sites) attraverso helper dedicati e riuso logico.
- Allineamento a API Node moderne (`node:*`) e igiene TypeScript (optional chaining e parsing numerico esplicito).
- Host identificati da `id` numerico: `GET/PUT /api/hosts/:id`, bulk con `{ ids[] }`, `/api/hosts/all-hostnames` restituisce `{ id, hostname, ambiente }` e `GET /api/hosts/resolve` delega al dataservice la conversione hostname (+ ambiente) → `id`. Gli errori `409` del dataservice (host attivo duplicato) vengono propagati al client.

## Documentazione frontend

La documentazione HTML generata da Compodoc è servita dal backend su
`/fe-docs/`. Rigenerarla dopo modifiche ai componenti con:

```powershell
npm run docs:build --prefix ../angular-app
```
