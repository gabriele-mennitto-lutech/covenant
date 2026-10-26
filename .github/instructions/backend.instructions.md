---
description: Architettura e responsabilita del back-end
applyTo: "back-end/**"
---

Il back-end deve essere sviluppato in TypeScript. Python e opzionale solo se realmente necessario.

Le operazioni computazionali o ad alto carico devono essere gestite dal back-end, mentre il front-end resta focalizzato su rendering e interazioni leggere.

Il back-end deve gestire richieste asincrone concorrenti in modo efficiente.

Il back-end non deve chiamare direttamente la datasource/DB, ma usare i servizi dedicati.

Per API esterne, le chiamate devono essere effettuate dal back-end, non dal front-end.

La comunicazione tra servizi deve essere REST, preferibilmente con payload JSON.

Le rotte back-end devono restituire JSON che il front-end possa adattare alla vista.

Filtri su dataset grandi, paginazione e riduzione del payload devono essere applicati lato back-end.

Le chiamate tra front-end e back-end devono essere gestite con AJAX/AXIOS.
