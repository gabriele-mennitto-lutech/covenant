# API Covenant — SOC INFRA

Questo documento riassume le API dei due servizi Express:
- **Back-end Gateway**: `http://localhost:9991`
- **Dataservice SQLite**: `http://localhost:9992`

Inventario esclusivamente Windows: Windows 10/11 e Windows Server
2016/2019/2022/2025. IP e VLAN sono dati inseriti/importati nell'inventario:
nessuna API recupera la rete da sistemi remoti. cve-search/CIRCL e LDAP/AD
restano disponibili rispettivamente per CVE e autenticazione.

Le specifiche complete sono in:
- `docs/openapi-backend.yaml`
- `docs/openapi-dataservice.yaml`

## Back-end (`/api/*`)

| Metodo | Path | Descrizione | Parametri principali |
|---|---|---|---|
| POST | `/api/auth/login` | Login applicativo (LDAP con fallback locale, in base ad `AUTH_MODE`) | body `{ username, password }` |
| GET | `/api/auth/me` | Utente autenticato corrente | header `Authorization: Bearer <token>` |
| POST | `/api/auth/logout` | Invalida sessione corrente | header `Authorization: Bearer <token>` |
| GET | `/api/hosts` | Lista host con filtri/paginazione/sort | `globalSearch`, filtri colonna (`hostname`, `ambiente`, `os`, `fixed`, ...), `page`, `pageSize`, `sortCol`, `sortDir`, `preset`, `osFamily` |
| GET | `/api/hosts/import/template` | Scarica template CSV host | - |
| POST | `/api/hosts/import` | Import CSV/JSON host (admin) | query `format=csv|json`, body `text/plain`, max 10 MB / 20.000 righe |
| POST | `/api/hosts` | Crea host | body `Host` |
| POST | `/api/hosts/cache/reload` | Ricarica la cache host dal dataservice | - |
| GET | `/api/hosts/stats` | Statistiche dashboard/fix | - |
| GET | `/api/hosts/all-hostnames` | Riferimenti host filtrati (`{ id, hostname, ambiente }[]`) per "Seleziona tutto" | stessi filtri di `/api/hosts` |
| GET | `/api/hosts/resolve` | Converte hostname (+ ambiente) nell'`id` dell'host (delegato al dataservice) | query `hostname` (obbligatorio), `ambiente` (opzionale) |
| PUT | `/api/hosts/bulk` | Aggiornamento massivo host | body `{ ids[], partialUpdate }` |
| DELETE | `/api/hosts/bulk` | Cancellazione massiva host | body `{ ids[] }` |
| GET | `/api/hosts/:id` | Dettaglio host | path `id` numerico |
| PUT | `/api/hosts/:id` | Aggiorna host singolo | path `id` numerico, body parziale |
| GET | `/api/sites` | Lista siti da cache backend | - |
| POST | `/api/sites/refresh` | Refresh cache siti | - |
| GET | `/api/sites/import/template` | Scarica template CSV siti | - |
| POST | `/api/sites/import` | Import CSV/JSON siti (admin) | query `format=csv|json`, body `text/plain`, max 10 MB |
| POST | `/api/sites` | Crea sito | body `Site` |
| PUT | `/api/sites/:id` | Aggiorna sito | path `id`, body parziale |
| DELETE | `/api/sites/:id` | Elimina sito | path `id` |
| GET | `/api/settings` | Legge settings dal dataservice | - |
| PUT | `/api/settings` | Aggiorna settings | body key/value |
| GET | `/api/services` | Lista servizi filtrata e paginata | `search`, `knowledge`, `page`, `pageSize` |
| GET | `/api/services/:id` | Dettaglio servizio per riferimento cross source | `id` numerico positivo |
| GET | `/api/cross-source/:type/:id` | Correlazioni motivate tra dati persistiti (anche readonly) | `type=hosts|services|sites|cves`, `id`, `target`, `search` (max 200 caratteri), `page`, `pageSize` (1-100, default 25) |
| POST | `/api/services` | Crea servizio | body `{ servizio, knowledge, stato }` |
| PUT | `/api/services/:id` | Aggiorna servizio | path `id`, body parziale |
| POST | `/api/services/reload` | Ricarica cache servizi | - |
| GET | `/api/mailing/templates` | Lista template mailing | - |
| POST | `/api/mailing/templates` | Crea template mailing | body template |
| PUT | `/api/mailing/templates/:id` | Aggiorna template mailing | path `id`, body parziale |
| DELETE | `/api/mailing/templates/:id` | Elimina template mailing | path `id` |
| GET | `/api/logs` | Activity log | filtri definiti dal router |
| GET | `/api/notifications` | Notifiche recenti | query `since` ISO opzionale |
| GET | `/api/notifications/stream` | Stream SSE notifiche | query `token` per EventSource |
| GET | `/api/cves` | Lista CVE tracciate (filtri/paginazione/sort server-side) | `stato` (`IN_ANALISI`/`ARCHIVIATA`), `search`, `severita`, `impattato`, `motivo_attesa`, `esito` (`ALTRO` = tutte le motivazioni non standard), `stato_ticket`, `flagged` (`true`/`false`), `from`, `to`, `date_field` (`data_inoltro` default, `data_archiviazione`, `ultima_revisione`), `sortBy`, `sortOrder`, `page`, `pageSize`; `data_archiviazione` è locale `YYYY-MM-DDTHH:MM:SS` |
| GET | `/api/cves/stats` | Conteggi CVE in analisi / archiviate | - |
| POST | `/api/cves` | Crea CVE tracciata (admin); vendor/prodotto/score mancanti completati best effort da cve-search | body `Cve` (`cve_id` obbligatorio) |
| POST | `/api/cves/import` | Import CSV dei problem esportati da ITSM (admin): upsert per `problem_id`, `Pendente` → in analisi (de-archivia se archiviato), altri stati → archiviate | body `text/csv` (max 10 MB, 5000 righe) con intestazioni `ID problema*+;Data ultima modifica;Data inoltro;Riepilogo*;Stato*;Note` |
| GET | `/api/cves/export` | Export CSV (`;`, UTF-8 con BOM) delle CVE in analisi/archiviate: colonne del template di import (reimportabile) + CVE, Vendor, Prodotto, Score, Impatto, Sezione, Motivo attesa, Ultima revisione, Esito, Data archiviazione (data e ora fino al minuto), Flag | stessi filtri di `GET /api/cves` (senza paginazione), max 50000 righe |
| POST | `/api/cves/enrich` | Completa vendor/prodotto/score mancanti tramite cve-search, senza sovrascrivere valori presenti (admin) | body `{ ids[] }` (max 100) |
| PUT | `/api/cves/bulk/status` | Cambio stato/flag/motivo massivo (admin) | body `{ ids[], stato?, esito?, motivo_attesa?, ultima_revisione?, flagged? }` (almeno un campo) |
| GET | `/api/cves/:id` | Dettaglio CVE tracciata | path `id` |
| GET | `/api/cves/:id/history` | Storico dei motivi di attesa (piu recente prima) | path `id` |
| PUT | `/api/cves/:id` | Aggiorna CVE tracciata (admin) | path `id`, body parziale |
| DELETE | `/api/cves/:id` | Elimina CVE tracciata (admin) | path `id` |
| GET | `/api/external/cve-search/:cveId` | Dettagli CVE da cve-search (CIRCL), normalizzati | path `cveId` (`CVE-AAAA-NNNN`) |
| GET | `/api-docs` | Swagger UI backend | - |
| GET | `/api-docs.json` | OpenAPI JSON backend | - |

### Autenticazione backend

- Modalita consigliata: `AUTH_MODE=hybrid` (LDAP + fallback locale).
- Gruppi LDAP/AD: configurare `LDAP_GROUP_ADMIN` e `LDAP_GROUP_READONLY`
  con i gruppi autorizzati per SOC INFRA (default `AM_WINDOWSSITE_ADM` e
  `AM_WINDOWSSITE_READ`).
- Gli utenti locali predefiniti sono `SOCINFRAADM` e `SOCINFRAREAD`:
  i nomi possono essere modificati tramite `LOCAL_ADMIN_USER` e
  `LOCAL_READONLY_USER`. Le password non hanno default: il rispettivo account
  richiede `LOCAL_ADMIN_PASSWORD` o `LOCAL_READONLY_PASSWORD` configurata e
  non vuota né composta solo da spazi per autenticarsi.
- Se LDAP non è configurato o non disponibile, in `hybrid` il fallback locale
  funziona solo per gli account con password esplicitamente configurata.
  Nei test impostare tali valori nell'ambiente del processo senza commettere segreti.

Per l'inventario, `osFamily` accetta le famiglie `Windows`, `Windows Server`
(anche più valori separati da virgola) e `other` per dati non classificati.
I preset OS sono `windows` (client 10/11) e `windows_server` (Server
2016/2019/2022/2025); restano `no_app`, `no_serv`, `no_maint`, `no_loc`,
`test_env` e `prod_env`. Un dato non classificato non viene convertito in Windows.
Le famiglie non distinguono maiuscole/minuscole; `osCounts` restituisce le chiavi
`Windows`, `Windows Server` e `Other`.

### Riferimenti cross source

Esempio: `GET /api/cross-source/services/12?target=hosts&pageSize=25`.
La risposta contiene `source`, `counts` (totali per categoria prima dei filtri),
`items`, `total` (dopo i filtri), `page`, `pageSize`, `totalPages`.

```json
{
  "source": { "type": "services", "id": 12, "label": "PORTALE", "context": "", "confidence": "direct", "reasons": ["Sorgente selezionata"] },
  "counts": { "hosts": 1, "services": 0, "sites": 1, "cves": 0 },
  "items": [{
    "type": "hosts", "id": 42, "label": "srv-app-001",
    "context": "Produzione · Windows Server 2022",
    "confidence": "direct", "reasons": ["Servizio dichiarato: PORTALE"]
  }],
  "total": 1, "page": 1, "pageSize": 25, "totalPages": 1
}
```

Le correlazioni sono calcolate da letture fresche, senza scritture, DNS
o arricchimenti esterni:

- Servizi dichiarati (anche liste delimitate da virgola, punto e virgola o pipe),
  nomi nelle applicazioni, host reali dei siti, hostname brevi/FQDN e IP salvati.
  Due FQDN con domini diversi non vengono confusi. Ambienti differenti rendono
  potenziale il collegamento sito-host; un IP/VIP o un hostname nell'URL
  restano indizi, non prove della destinazione DNS o del bilanciamento.
- CVE tracciate, incluse quelle archiviate (stato visibile): hostname negli
  asset dichiarati, Windows citato nel prodotto/riepilogo con confronto della
  versione salvata (10/11 o Server 2016/2019/2022/2025), oppure prodotti citati
  in servizio/applicazione/note. Si usano frasi intere e alias noti (es.
  PostgreSQL, Log4j); i soli vendor e termini generici non bastano.
  Build, KB installate e intervalli di patch non sono verificati.
  Se manca la versione Windows, l'associazione resta indicativa. Le associazioni
  tramite host propagano candidati a servizi e siti, non impatti accertati.

Tutte le relazioni CVE sono `potential`: non verificano pacchetti installati,
patch/KB o effettiva esposizione e non cambiano `impattato`, asset o
workflow. Nessun risultato **non** significa assenza di vulnerabilita'.
Risposte: `400` per parametri non validi, `404` per sorgente assente,
`502` per errore del dataservice, oltre alle normali risposte di autenticazione.

L'endpoint interno `GET /data/cross-source` restituisce al solo gateway gli
array `hosts`, `services`, `sites`, `cves` con le colonne necessarie. Non
include settings, credenziali o stati operativi delle macchine.

### Esempio richiesta/risposta backend

`GET /api/hosts?globalSearch=Windows&page=1&pageSize=20`

```json
{
  "items": [
    {
      "id": 12,
      "hostname": "srv-app-001",
      "ambiente": "PRODUZIONE",
      "company": "RAI",
      "appliance": false,
      "zona": "DMZ",
      "os": "Windows Server 2022",
      "status": true,
      "nodo": 1,
      "fixed": false,
      "fixable": true
    }
  ],
  "totalCount": 1
}
```

### Esempio: host omonimi, risoluzione per nome e operazioni per id

Due macchine con lo stesso hostname (una attiva e una dismessa) hanno `id` distinti:

`GET /api/hosts/resolve?hostname=srv-app-001`

```json
{
  "id": 57,
  "host": { "id": 57, "hostname": "srv-app-001", "ambiente": "PRODUZIONE", "...": "..." },
  "matches": [
    { "id": 57, "hostname": "srv-app-001", "ambiente": "PRODUZIONE" },
    { "id": 12, "hostname": "srv-app-001", "ambiente": "Dismessa" }
  ]
}
```

Le modifiche successive usano l'`id`:

- `PUT /api/hosts/57` con body `{ "note": "Sostituisce la macchina 12" }` → `{ "success": true, "host": { "id": 57, ... } }`
- `PUT /api/hosts/bulk` con body `{ "ids": [12, 57], "partialUpdate": { "riferimento": "RIF-01" } }` → `{ "success": true, "updatedCount": 2 }`
- `DELETE /api/hosts/bulk` con body `{ "ids": [12] }` → `{ "success": true, "deletedCount": 1 }`

Creare o riattivare un host con la stessa coppia (`hostname`, `ambiente`) di un host gia' **attivo** restituisce `409`:

```json
{ "error": "An active host with the same hostname and ambiente already exists" }
```

## Dataservice (`/data/*`)

| Metodo | Path | Descrizione | Parametri principali |
|---|---|---|---|
| GET | `/data/hosts` | Lista host DB | - |
| POST | `/data/hosts/import` | Import host già normalizzati | body `{ rows[] }`, max 20 MB / 20.000 righe |
| POST | `/data/hosts` | Crea host DB | body host (campi DB + business) |
| GET | `/data/hosts/resolve` | Conversione hostname (+ ambiente) → `id` (case-insensitive; preferisce l'host attivo, poi il piu' recente) | query `hostname`, `ambiente` (opzionale) |
| GET | `/data/hosts/:id` | Dettaglio host DB | path `id` numerico |
| PUT | `/data/hosts/:id` | Aggiorna host DB | path `id` numerico, body parziale |
| DELETE | `/data/hosts/:id` | Elimina host DB | path `id` numerico |
| PUT | `/data/hosts/bulk/update` | Bulk update host (transazione con rollback) | body `{ ids[], partialUpdate }` |
| DELETE | `/data/hosts/bulk/delete` | Bulk delete host | body `{ ids[] }` |
| GET | `/data/hosts/count/appliance0` | Conteggio host con `appliance = 0` | - |
| GET | `/data/sites` | Lista siti DB | - |
| POST | `/data/sites/import` | Import siti già normalizzati | body `{ rows[] }`, max 20 MB / 20.000 righe |
| POST | `/data/sites` | Crea sito DB | body con campi snake_case |
| PUT | `/data/sites/:id` | Aggiorna sito DB | path `id`, body parziale |
| DELETE | `/data/sites/:id` | Elimina sito DB | path `id` |
| GET | `/data/cves` | Lista CVE DB con filtri/paginazione | stessi filtri di `/api/cves` |
| GET | `/data/cves/stats` | Conteggi per stato | - |
| POST | `/data/cves` | Crea CVE DB | body snake_case |
| POST | `/data/cves/import` | Upsert massivo righe import (transazione) | body `{ rows[] }` (righe gia normalizzate dal back-end), header `X-Actor` |
| PUT | `/data/cves/bulk/status` | Cambio stato/flag/motivo massivo (transazione) | body `{ ids[], stato?, esito?, motivo_attesa?, ultima_revisione?, flagged? }` |
| GET | `/data/cves/:id` | Dettaglio CVE DB | path `id` |
| GET | `/data/cves/:id/history` | Storico motivi di attesa | path `id` |
| PUT | `/data/cves/:id` | Aggiorna CVE DB | path `id`, body parziale |
| DELETE | `/data/cves/:id` | Elimina CVE DB | path `id` |
| GET | `/data/settings` | Legge settings | - |
| PUT | `/data/settings` | Aggiorna settings | body key/value |
| POST | `/data/logs` | Registra activity log | body log |
| GET | `/data/logs` | Legge activity log | - |
| GET | `/data/services` | Lista servizi e host associati | - |
| POST | `/data/services` | Crea servizio | body servizio |
| PUT | `/data/services/:id` | Aggiorna servizio | path `id`, body parziale |
| GET | `/data/mail_templates` | Lista template mailing | - |
| POST | `/data/mail_templates` | Crea template mailing | body template |
| PUT | `/data/mail_templates/:id` | Aggiorna template mailing | path `id`, body parziale |
| DELETE | `/data/mail_templates/:id` | Elimina template mailing | path `id` |
| GET | `/docs` | Swagger UI dataservice | - |
| GET | `/docs.json` | OpenAPI JSON dataservice | - |

### Schema DB principali (snake_case)

- **hosts**: chiave primaria surrogata `id INTEGER PRIMARY KEY AUTOINCREMENT`; include campi come `hostname`, `ambiente`, `appliance`, `os`, `os_major`, `os_minor`, `manual_overrides`, `ipfe`, `ipmgt`, `vlfe`, ecc.
  - Nel solo SQLite la famiglia `Windows` o `Windows Server` è memorizzata in
    `os`, la versione client/server in `os_major` e normalmente `"0"` in
    `os_minor`. Sia le API del dataservice sia il gateway restituiscono il nome
    completo, ad esempio `Windows 11` o `Windows Server 2022`, senza suffisso
    `.0`; il dataservice espone anche `os_major` e `os_minor`.
    Testi OS non normalizzati possono restare integrali con
    versione `0`; non vengono convertiti automaticamente.
  - Lo stesso `hostname` puo' comparire piu' volte (es. piu' macchine dismesse che hanno riutilizzato lo stesso nome).
  - L'unicita' di (`hostname`, `ambiente`) e' garantita solo per gli host **attivi** (ambiente che non contiene `dismess`/`spent`) tramite l'indice parziale `ux_hosts_active_hostname_ambiente`; le violazioni restituiscono `409`.
  - Le migrazioni dello schema sono transazionali; non convertono automaticamente
    gli OS. Covenant deve usare un DB dedicato e backup distinti, mai il DB
    condiviso del progetto originale.
- **sites**: include `url_aliases`, `ip_reali`, `nome_vip`, `host_reali`, `tls_config`, `porta`, `ambiente`, `note`.
- **cves**: tracciamento CVE SOC. Colonne Excel: `problem_id` (ID problem, univoco), `data_ultima_modifica`, `data_inoltro`, `cve_id` e `prodotto` (estratti dal Riepilogo), `vendor` (da cve-search), `stato_ticket` (Stato sul sito), `note`, `errata`, `score` (BASE/CVSS SCORE unificati); le colonne legacy `riferimenti`, `cve_origin`, `asset_impattati` restano per compatibilita ma non sono piu usate dalla UI (i riferimenti sono migrati in `motivo_attesa`). Campi di workflow: `stato` (`IN_ANALISI`/`ARCHIVIATA`), `motivo_attesa` (testo libero, default `In analisi`), `esito` (`VULN_CLIENT`, `APP_NON_PRESENTE`, `PROSSIMO_PATCHING`, `NON_IMPATTANTE`, `NON_IN_CARICO_SOC` oppure testo libero per "Altro"), `impattato`, `flagged` (0/1, promemoria post-riunione), `ultima_revisione`, `data_archiviazione`, `created_at`, `updated_at`.
- **cve_motivo_history**: storico dei motivi di attesa (`cve_ref`, `motivo_attesa`, `data_cambio`, `utente`, `created_at`); una riga per ogni cambio di motivo, eliminata insieme alla CVE.
- **settings**: tabella key/value (`key`, `value`); le API supportano solo
  `items_per_page` e `theme`.


### Esempio richiesta/risposta dataservice

`PUT /data/settings`

Request:
```json
{
  "items_per_page": "50",
  "theme": "light"
}
```

Response:
```json
{
  "success": true,
  "settings": {
    "items_per_page": "50",
    "theme": "light"
  }
}
```
