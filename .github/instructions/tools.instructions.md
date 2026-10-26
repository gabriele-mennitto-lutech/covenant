---
description: Regole operative su strumenti locali e script temporanei del repository
applyTo: "**"
---

In questo repository, i binari locali di Node e Git sono sotto `node/` e `bin/git/`.

Quando esegui comandi Node o npm in ambiente locale, preferisci i binari nel percorso `node/` del progetto.

Quando esegui comandi Git in ambiente locale, assicurati di usare il binario corretto disponibile in `bin/git/` se richiesto dal setup.

Se devi creare script di test, script one-shot o script temporanei (ad esempio verifica componenti, diagnostica dati, utility di bootstrap), crea i file sotto `local_utils/`.
