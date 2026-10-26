---
trigger: always_on
---

I comandi "node" e "git" sono sotto bin/ nelle rispettive directory. Prima di usare git e node/npm, assicurati di referenziare il path corretto. Se bisogna creare degli script di test, oneshot o temporanei (e.g per creare tabelle sul DB per la prima volta, controllare componenti o fare test) creali sotto /local_utils.
