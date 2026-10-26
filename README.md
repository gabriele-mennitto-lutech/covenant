# Covenant — SOC INFRA

Covenant è una piattaforma web interna dedicata all'inventario Windows,
alle vulnerabilità e alle attività operative del team SOC INFRA.
Non sostituisce ITSM: aggrega i dati e semplifica le operazioni che
richiedono una vista trasversale. Gli OS previsti sono Windows 10/11 e
Windows Server 2016/2019/2022/2025.

## Funzionalità disponibili

- **Dashboard** con contatori e accesso alle viste operative.
- **Hosts Inventory**: ricerca globale, filtri per colonna, preset, paging,
  modifica singola o massiva e dettaglio macchina.
- **Fixes**: vista degli host correggibili e stato delle SecFix.
- **Sites Inventory**: siti esposti, TLS, VIP e host reali.
- **Services**: servizi applicativi, stato, knowledge e host associati.
- **CVE Analysis**: import da ITSM, ricerca cve-search/CIRCL, arricchimento,
  filtri, storico dei motivi di attesa, flag, archiviazione ed export CSV.
- **Mailing**: gestione dei template di posta.
- **Settings**: configurazione applicativa esposta dal backend.
- **Notifiche** in tempo reale tramite Server-Sent Events (SSE) e activity log.
- **Riferimenti cross source** nei dettagli macchina e nei popup Servizi, Sites
  e CVE: navigazione tra sorgenti, motivazioni delle corrispondenze, ricerca
  e paginazione, esclusivamente sui dati inventariati. Le correlazioni CVE
  Windows suggeriscono candidati, non impatti accertati.
- **Rete inventory-only**: IP e VLAN sono inseriti o importati nell'inventario;
  il dettaglio macchina non recupera dati da sistemi remoti.

Le operazioni di scrittura e le funzioni amministrative richiedono il ruolo
`admin`; gli utenti `readonly` possono consultare i dati.

## Architettura

```text
Browser (Angular) -> Backend/API Gateway (Express :9991)
                         -> Dataservice (Express/SQLite :9992)
                         -> cve-search/CIRCL; LDAP/AD per autenticazione
```

- `angular-app/`: frontend Angular 19 e componenti PrimeNG.
- `back-end/`: API Gateway, autenticazione, cache, business logic, integrazioni
  esterne e notifiche.
- `dataservice/`: accesso esclusivo a SQLite, schema, migrazioni e transazioni.
- `docs/`: riferimento API e specifiche OpenAPI.
- `data/`: directory persistente contenente `inv.db` (creato al primo avvio).
- `back-end/public/frontend-docs/`: documentazione Compodoc generata.

Il backend non accede direttamente al database. Le modifiche del dataservice
sono transazionali e le operazioni bulk eseguono rollback in caso di errore.
Il database usa WAL per favorire letture e scritture concorrenti.

## Prerequisiti

- Windows con PowerShell, Node.js compatibile con le versioni indicate nei
  `package.json` (Node 20+ consigliato) e npm.
- Accesso LDAP/LDAPS (anche Active Directory) e/o credenziali locali e cve-search quando si
  usano le integrazioni corrispondenti.

## Avvio locale

Da tre terminali PowerShell distinti, partendo dalla root del progetto:

```powershell
# Terminale 1
Set-Location dataservice
npm ci
npm run dev
```

```powershell
# Terminale 2
Set-Location back-end
npm ci
npm run dev
```

```powershell
# Terminale 3
Set-Location angular-app
npm ci
npm run start
```

Porte e URL:

| Servizio | Porta | Documentazione |
|---|---:|---|
| Dataservice | `9992` | `http://localhost:9992/docs/` |
| Backend | `9991` | `http://localhost:9991/api-docs/` |
| Frontend Angular | `4200` | `http://localhost:4200/` |
| Compodoc frontend | - | `http://localhost:9991/fe-docs/` |

Il proxy Angular (`proxy.conf.json`) inoltra `/api` a `http://localhost:9991`.
Il server Angular non usa la porta 80 in sviluppo, salvo override esplicito.
Per il database locale impostare, se necessario, `DB_PATH`; in assenza del
parametro viene usato il percorso predefinito del dataservice.

## Configurazione

Copiare `back-end/.env.example` in `back-end/.env`. Le variabili principali
sono:

| Variabile | Default | Scopo |
|---|---|---|
| `PORT` | `9991` / `9992` | Porta del servizio |
| `DATASERVICE_URL` | `http://localhost:9992` | URL backend -> dataservice |
| `BACKEND_URL` | `http://localhost:9991` | Origine autorizzata dal dataservice |
| `FRONTEND_URL` | `http://localhost:4200` | Origine autorizzata dal backend |
| `AUTH_MODE` | `hybrid` nel codice | `local`, `ldap` o `hybrid` |
| `AUTH_TOKEN_TTL_MS` | `28800000` | Durata sessione |
| `CVE_SEARCH_URL` | `https://cve.circl.lu` | Endpoint cve-search |
| `CVE_SEARCH_TIMEOUT_MS` | `10000` | Timeout chiamate CVE |
| `DB_PATH` | `data/inv.db` | File SQLite |

Per LDAP sono necessari almeno `LDAP_SERVER`/`LDAP_URL`, `LDAP_BASE_DN`,
`LDAP_GROUP_ADMIN` e `LDAP_GROUP_READONLY`; sono disponibili anche le
variabili per TLS, dominio, service account e timeout descritte nel file
`.env.example`. In modalità `local` (o per il fallback locale `hybrid`),
configurare `LOCAL_ADMIN_PASSWORD` e/o `LOCAL_READONLY_PASSWORD` con valori
non vuoti né composti solo da spazi: ciascun account locale senza password
configurata non può autenticarsi.
Non esistono password predefinite. `LOCAL_ADMIN_USER` e `LOCAL_READONLY_USER`
possono essere personalizzati e hanno default `SOCINFRAADM` e `SOCINFRAREAD`.
Non commettere credenziali; nei test impostare password esplicite solo
nell'ambiente del processo.

## Esecuzione nativa Windows e pubblicazione

Per ogni servizio Node, nella rispettiva directory PowerShell:

```powershell
npm ci
npm run build
$env:NODE_ENV = "production"
npm run start
```

Avviare prima il dataservice, quindi il backend. Nel terminale del dataservice
impostare `DB_PATH` a un percorso assoluto dedicato, ad esempio
`$env:DB_PATH = "C:\Covenant\data\inv.db"`. Configurare separatamente le variabili
dei due processi; le credenziali LDAP/AD e cve-search appartengono solo al backend.
`FRONTEND_URL` deve corrispondere all'origine del browser. Non pubblicare il
dataservice: CORS non sostituisce autenticazione o isolamento di rete.

Per Angular eseguire `npm ci` e `npm run build` nella directory `angular-app`.
Si suggerisce IIS per servire i file statici di `dist/angular-app/browser`,
con fallback SPA verso `index.html` per le route non-file e proxy `/api`
verso `http://localhost:9991`, preservando path e header `Authorization`.
È un'indicazione di pubblicazione, non un'integrazione IIS fornita dal progetto.
Il proxy di sviluppo Angular non viene usato in produzione. Configurare TLS,
limiti upload (almeno 10 MB) e timeout del proxy; per SSE disabilitare buffering
e compressione che ritardano gli eventi e verificare riconnessioni e connessioni
persistenti. Non registrare nei log URL/query contenenti token SSE.

Proteggere `.env` e le directory dati con ACL dell'account che esegue i processi.
Per LDAP/LDAPS verificare DNS, VPN, porte e CA aziendali senza disabilitare TLS.

## Database e backup separati

Covenant è un progetto separato: **non condividere il database del progetto
originale**, né puntare `DB_PATH` ai suoi file. Usare un database nuovo dedicato
e backup distinti. Non è prevista alcuna conversione automatica degli OS:
la creazione dello schema non trasforma dati preesistenti in inventario Windows.
Prima di importazioni o modifiche dello schema creare un backup SQLite
consistente. Fermare i processi che usano il DB prima di una copia a freddo;
non copiare soltanto `inv.db` mentre è aperto in modalità WAL.

## Build, test e documentazione

```powershell
npm run build --prefix dataservice
npm run build --prefix back-end
npm run build --prefix angular-app
npm test --prefix angular-app -- --watch=false --browsers=ChromeHeadless
npm run docs:build --prefix angular-app
```

I package `back-end` e `dataservice` non definiscono una suite `npm test`
funzionante; i file `test*.js` presenti sono script/manual checks. Le specifiche
OpenAPI statiche sono in `docs/openapi-*.yaml`; le specifiche runtime sono
disponibili negli endpoint Swagger indicati sopra.

## Import massivo

Dalle pagine Hosts e Sites, un amministratore può scaricare il template e
caricare CSV o JSON (massimo 10 MB e 20.000 righe). Il separatore CSV `;` o
`,` viene rilevato automaticamente. L'import crea nuovi record e completa solo
i campi vuoti dei record esistenti: i valori già presenti nel database hanno
priorità. L'operazione è transazionale e restituisce il dettaglio degli errori
per riga.

La pagina CVE importa il CSV ITSM (massimo 10 MB e 5.000 righe), effettua
upsert per `problem_id` e permette di esportare la vista corrente. Consultare
[`docs/API.md`](docs/API.md) per formati, endpoint e payload.

## Riferimenti

- [API e autenticazione](docs/API.md)
- [Backend](back-end/README.md)
- [Dataservice](dataservice/README.md)
- [Frontend](angular-app/README.md)
- [OpenAPI backend](docs/openapi-backend.yaml)
- [OpenAPI dataservice](docs/openapi-dataservice.yaml)
