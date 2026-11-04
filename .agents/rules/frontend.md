---
trigger: always_on
---

Il front-end Covenant usa Angular e componenti PrimeNG riutilizzabili. Le chiamate al backend sono asincrone, concorrenti e gestite tramite AJAX/AXIOS. Lo stile coerente si ispira a Microsoft Azure e Fluent: font locali Segoe UI, sfondo #F5F7FA, superfici #FFFFFF, testo #242424 e accento #0078D4, con dettagli viola. Usare controlli accessibili e mantenere leggibilità e contrasto nelle tabelle, nei menu e nei dialoghi.

L'interfaccia deve ricordare un prodotto Microsoft standard, prendendo il portale Azure come riferimento per navigazione, gerarchia visiva, densita' informativa e interazioni. Adattare i componenti PrimeNG esistenti senza introdurre un secondo framework UI solo per replicarne l'aspetto.

Centralizzare colori, tipografia, spaziature e stati interattivi in token e stili condivisi. Riutilizzare componenti e pattern per tabelle, filtri, schede, form, dialoghi e notifiche; mantenere coerenti etichette, icone, azioni, validazione e stati di caricamento, vuoto ed errore tra le pagine. Evitare stili locali duplicati e varianti non motivate.

Progettare le viste per l'inventario dei server Windows del SOC Infrastruttura, mantenendo informazioni e azioni operative leggibili anche con molti dati. Garantire navigazione da tastiera, focus visibile, nomi accessibili e contrasto adeguato secondo WCAG 2.2 livello AA; non affidare il significato al solo colore.
