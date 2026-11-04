---
trigger: always_on
---

# Contesto e obiettivi

- Covenant e' sviluppata per il reparto SOC Infrastruttura e serve a catalogare tutti i server Windows che il reparto ha in carico. Modelli dati, terminologia, filtri, importazioni e integrazioni devono rispettare questo dominio.
- Covenant e' la versione "mirror" di Mothership, orientata ai server Windows. Mantenere coerenza funzionale e architetturale con Mothership quando pertinente, adattando esplicitamente le parti specifiche del sistema operativo. Non presumere funzionalita' o dettagli di Mothership non verificati e non introdurre dipendenze operative dall'altra repository.
- Trattare ogni modifica come destinata a un'applicazione esposta in produzione: sicurezza, affidabilita' e protezione dei dati dell'inventario sono requisiti di base, non attivita' opzionali successive.

# Modularita' e coerenza

- Prima di aggiungere codice, cercare componenti, servizi, modelli, validatori e utilita' esistenti da riutilizzare o estendere.
- Separare presentazione, logica applicativa, integrazioni esterne e persistenza. Mantenere moduli con responsabilita' chiare e contratti tipizzati; preferire convenzioni orientate agli oggetti quando appropriate, senza introdurre astrazioni inutili.
- Condividere comportamenti e design tra funzionalita' analoghe, evitando duplicazioni e implementazioni locali divergenti. Estrarre elementi riutilizzabili quando esiste un uso concreto, senza generalizzazioni speculative.
- Preservare i confini esistenti: Angular per la presentazione, backend per la logica applicativa e le API esterne, dataservice per l'accesso al database.
- Aggiornare la documentazione e verificare i comportamenti interessati quando si modificano contratti, componenti condivisi o flussi operativi.
