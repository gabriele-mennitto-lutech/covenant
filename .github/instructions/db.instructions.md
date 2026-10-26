---
description: Vincoli di persistenza e accesso dati tramite dataservice
applyTo: "{back-end,dataservice}/**"
---

Il database persistente e il file `data/inv.db`.

Le operazioni di modifica dati devono essere eseguite in transazione e prevedere rollback affidabile in caso di errore.

Il back-end non deve interrogare direttamente il DB: le chiamate dati passano sempre dal dataservice.

Il dataservice trasforma le richieste applicative in query SQLite e restituisce JSON al back-end.

Il back-end adatta poi il JSON al formato richiesto dal front-end.
