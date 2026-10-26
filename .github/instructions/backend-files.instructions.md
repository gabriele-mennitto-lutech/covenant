---
description: Organizzazione file e routing Express per macro-categorie API
applyTo: "back-end/src/**"
---

Evita di concentrare tutte le rotte in `index.ts`.

Organizza le API Express per macro-categorie in file separati.

Struttura consigliata:
- Le chiamate `/api/*` passano dal bootstrap in `index.ts`.
- Le chiamate `/api/hosts` devono stare in `hosts.ts`.
- Le chiamate `/api/sites` devono stare in `sites.ts`.
- Le chiamate `/api/external` devono stare in `external.ts`.

Il file `external.ts` deve contenere solo integrazioni verso API esterne supportate (ad esempio CIRCL per i dettagli CVE).
