---
trigger: always_on
---

Il DB è un file inv.db posto in data/ che contiene i dati persistenti. Le chiamate in modifica devono essere transactions e devono garantire una certa soglia di rollback in caso di errori (ad esempio se modifico un campo erroneamente devo poter tornare indietro e recuperare il dato che avevo modificato). Le chiamate al DB devono passare sempre per il dataservice, che si occuperà di trasformare le richieste semplici del back-end in query SQLite. Una volta fatto, il DB restituisce un JSON compatibile al back-end, che si occuperà dia dattarloa sua volta per il Front-End.
