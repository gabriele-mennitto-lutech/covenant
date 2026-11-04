---
trigger: always_on
---

# Sicurezza per la produzione

- Applicare secure-by-design, difesa in profondita', minimo privilegio e impostazioni sicure per default a frontend, backend, dataservice, dipendenze e configurazione di deployment. Non assumere che la rete interna renda attendibili utenti, input o servizi.
- Usare OWASP ASVS e OWASP Top 10 come riferimenti tecnici. Individuare e documentare le norme, le policy aziendali e gli obblighi di protezione dei dati effettivamente applicabili; non dichiarare conformita' o assenza di vulnerabilita' senza evidenze.
- Verificare autenticazione e autorizzazione lato server per ogni operazione e risorsa protetta, incluse importazioni, esportazioni, configurazione e amministrazione. Negare l'accesso per default; i controlli dell'interfaccia non sostituiscono quelli delle API.
- Proteggere sessioni e credenziali con meccanismi consolidati: cookie Secure, HttpOnly e SameSite appropriati quando usati, scadenza e invalidazione delle sessioni, protezione CSRF per autenticazione basata su cookie e limitazione dei tentativi di autenticazione.
- Validare tipo, formato, dimensione e valori ammessi degli input a ogni confine di fiducia, inclusi file importati e risposte esterne. Usare query parametrizzate e allowlist per gli identificatori dinamici; evitare concatenazioni SQL, esecuzione di comandi con input non attendibile, HTML non sanificato e bypass della sanitizzazione Angular.
- Limitare upload, payload, paginazione, concorrenza e tempi di esecuzione. Applicare rate limiting alle API esposte e proteggere le integrazioni da SSRF tramite destinazioni e protocolli consentiti, timeout e verifica dei certificati.
- Richiedere TLS per il traffico di produzione e verificare i certificati, anche nelle integrazioni di autenticazione. Configurare CORS con origini esplicite e header di sicurezza, inclusa una Content Security Policy compatibile con le risorse realmente necessarie.
- Non esporre direttamente database o dataservice al pubblico. Proteggere anche le comunicazioni tra servizi con autenticazione e privilegi minimi; limitare account, permessi filesystem e superficie di rete dei processi.
- Gestire segreti tramite configurazione protetta o secret manager, mai nel codice, nei bundle frontend o nei log. Non introdurre credenziali predefinite, bypass di autenticazione o fallback insicuri per semplificare sviluppo e test.
- Trattare inventario server, dettagli infrastrutturali ed esportazioni come dati riservati. Minimizzare raccolta e conservazione, limitare l'accesso e proteggere backup e ripristino secondo le policy applicabili.
- Registrare gli eventi di sicurezza e le modifiche rilevanti con identita', esito e contesto utili all'audit, senza credenziali, token o payload sensibili. Restituire errori controllati senza stack trace o dettagli interni e non nascondere fallimenti dei controlli di sicurezza.

# Dipendenze, CVE e verifica

- Ridurre al minimo le dipendenze e preferire librerie mantenute e runtime supportati. Aggiornare manifest e lockfile insieme, verificando compatibilita' e provenienza dei pacchetti.
- Quando si modificano dipendenze o superfici esposte, usare gli strumenti disponibili di audit delle dipendenze, analisi statica e rilevamento dei segreti. Valutare severita', sfruttabilita' e impatto delle CVE, dando priorita' alle vulnerabilita' critiche, alte o attivamente sfruttate.
- Non introdurre vulnerabilita' note sfruttabili e non sopprimere avvisi o forzare aggiornamenti incompatibili per ottenere un report pulito. Se una correzione non e' disponibile, documentare rischio residuo, mitigazioni e attivita' necessarie prima del rilascio; non promettere zero CVE.
- Per modifiche rilevanti, aggiungere o aggiornare verifiche su accessi non autorizzati, input malevoli, isolamento dei dati ed errori, oltre ai casi funzionali. Segnalare esplicitamente controlli non eseguiti e rischi non risolti.
