---
trigger: always_on
---

Nel back-end, organizza il routing Express per macrocategoria: `/api/hosts` in `hosts.ts`, `/api/sites` in `sites.ts` e le integrazioni esterne supportate, come CIRCL per i dettagli CVE, in `external.ts`. Il backend accede ai dati persistenti soltanto tramite il dataservice.
