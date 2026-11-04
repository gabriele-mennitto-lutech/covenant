---
trigger: always_on
---

Nel back-end, organizza il routing Express per macrocategoria: `/api/hosts` in `hosts.ts`, `/api/sites` in `sites.ts` e le integrazioni esterne supportate, come CIRCL per i dettagli CVE, in `external.ts`. Il backend accede ai dati persistenti soltanto tramite il dataservice.

Mantenere gli handler focalizzati sul contratto HTTP e delegare la logica applicativa a servizi riutilizzabili. Centralizzare autenticazione, autorizzazione, validazione ed errori nei middleware o negli helper condivisi pertinenti, senza duplicare i controlli tra rotte. Ogni nuova rotta deve applicare i controlli di sicurezza previsti e usare contratti coerenti con le API esistenti.
