import path from 'node:path';
import swaggerJsdoc, { Options } from 'swagger-jsdoc';

const options: Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Covenant SOC INFRA Backend API',
            version: '1.0.0',
            description: 'API Gateway di Covenant SOC INFRA per inventario Windows.\n\nLe API sono protette da meccanismi CORS restrittivi e Rate Limiting (max 1500 richieste/15min) per garantire sicurezza e stabilità in produzione.'
        },
        servers: [
            {
                url: 'http://localhost:9991',
                description: 'Backend locale'
            }
        ],
        components: {
            schemas: {
                CrossReference: {
                    type: 'object',
                    required: ['type', 'id', 'label', 'context', 'confidence', 'reasons'],
                    properties: {
                        type: { type: 'string', enum: ['hosts', 'services', 'sites', 'cves'] },
                        id: { type: 'integer', minimum: 1 },
                        label: { type: 'string' },
                        context: { type: 'string', description: 'Ambiente, OS salvato o stato CVE' },
                        confidence: { type: 'string', enum: ['direct', 'potential'], description: 'Le relazioni CVE sono sempre potential, mai un impatto confermato' },
                        reasons: { type: 'array', items: { type: 'string' } }
                    }
                },
                CrossSourceResult: {
                    type: 'object',
                    required: ['source', 'items', 'counts', 'total', 'page', 'pageSize', 'totalPages'],
                    properties: {
                        source: { $ref: '#/components/schemas/CrossReference' },
                        items: { type: 'array', items: { $ref: '#/components/schemas/CrossReference' } },
                        counts: {
                            type: 'object', description: 'Conteggi prima dei filtri',
                            properties: Object.fromEntries(['hosts', 'services', 'sites', 'cves'].map(type => [type, { type: 'integer', minimum: 0 }]))
                        },
                        total: { type: 'integer', minimum: 0, description: 'Totale dopo i filtri' },
                        page: { type: 'integer', minimum: 1 },
                        pageSize: { type: 'integer', minimum: 1, maximum: 100 },
                        totalPages: { type: 'integer', minimum: 0 }
                    }
                },
                Host: {
                    type: 'object',
                    required: ['hostname', 'ambiente', 'company', 'appliance', 'zona', 'os', 'status', 'nodo', 'fixed', 'fixable'],
                    properties: {
                        id: { type: 'integer', readOnly: true, example: 42, description: 'Identificativo univoco dell\'host (chiave primaria surrogata). Hostname e ambiente possono ripetersi per host dismessi.' },
                        hostname: { type: 'string', example: 'srv-app-001' },
                        applicazione: { type: 'string', nullable: true, example: 'SAP' },
                        riferimento: { type: 'string', nullable: true, example: 'RFC-2026-001' },
                        ambiente: { type: 'string', example: 'PRODUZIONE' },
                        company: { type: 'string', example: 'RAI' },
                        servizio: { type: 'string', nullable: true, example: 'BILLING' },
                        appliance: { type: 'boolean', example: false },
                        zona: { type: 'string', example: 'DMZ' },
                        riferimentoEs: { type: 'string', nullable: true, example: 'ES-12345' },
                        locazione: { type: 'string', nullable: true, example: 'Torino' },
                        os: { type: 'string', example: 'Windows Server 2022' },
                        manutenzione: { type: 'string', nullable: true, example: 'Patch trimestrale' },
                        status: { type: 'boolean', example: true },
                        nodo: { type: 'integer', example: 1 },
                        note: { type: 'string', nullable: true, example: 'Host critico' },
                        pianificazione: { type: 'string', nullable: true, example: '2026-08-01' },
                        rfc: { type: 'string', nullable: true, example: 'RFC123456' },
                        fixed: { type: 'boolean', example: false },
                        fixable: { type: 'boolean', example: true },
                        divisione: { type: 'string', nullable: true, example: 'News' },
                        ipfe: { type: 'string', nullable: true, example: '203.0.113.10' },
                        ipmgt: { type: 'string', nullable: true, example: '203.0.113.20' },
                        ipfe2al: { type: 'string', nullable: true, example: '203.0.113.30' },
                        vlfe: { type: 'string', nullable: true, example: '120' },
                        vlmgt: { type: 'string', nullable: true, example: '220' },
                        vlfe2al: { type: 'string', nullable: true, example: '320' }
                    }
                },
                HostRef: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 42 },
                        hostname: { type: 'string', example: 'srv-app-001' },
                        ambiente: { type: 'string', example: 'Produzione' }
                    }
                },
                HostResolveResult: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 42, description: 'Id dell\'host selezionato (attivo se presente, altrimenti il piu\' recente)' },
                        host: { $ref: '#/components/schemas/Host' },
                        matches: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'integer', example: 42 },
                                    hostname: { type: 'string', example: 'srv-app-001' },
                                    ambiente: { type: 'string', example: 'Dismessa' }
                                }
                            }
                        }
                    }
                },
                Site: {
                    type: 'object',
                    required: ['id', 'urlAliases', 'ipVip', 'nomeBilanciatore', 'servizio', 'tls', 'hostReali', 'porta', 'note', 'ambiente'],
                    properties: {
                        id: { type: 'integer', example: 10 },
                        urlAliases: { type: 'string', example: 'app.example.it,www.app.example.it' },
                        ipVip: { type: 'string', example: '203.0.113.15' },
                        nomeBilanciatore: { type: 'string', example: 'vip-app-prd-01' },
                        servizio: { type: 'string', example: 'PORTALE' },
                        tls: { type: 'string', example: 'EDGE' },
                        hostReali: { type: 'array', items: { type: 'string' }, example: ['srv-app-001', 'srv-app-002'] },
                        porta: { type: 'integer', nullable: true, example: 443 },
                        note: { type: 'string', example: 'Bilanciato F5' },
                        ambiente: { type: 'string', example: 'PRODUZIONE' }
                    }
                },
                Settings: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        items_per_page: { type: 'string', example: '50' },
                        theme: { type: 'string', example: 'light' }
                    },
                    example: {
                        items_per_page: '50',
                        theme: 'light'
                    }
                },
                DashboardStats: {
                    type: 'object',
                    properties: {
                        totalHosts: { type: 'integer', example: 1000 },
                        dismesseHosts: { type: 'integer', example: 140 },
                        activeHosts: { type: 'integer', example: 860 },
                        prodHosts: { type: 'integer', example: 620 },
                        collHosts: { type: 'integer', example: 160 },
                        devHosts: { type: 'integer', example: 80 },
                        prodZones: {
                            type: 'object',
                            properties: {
                                torino: { type: 'integer', example: 300 },
                                teulada: { type: 'integer', example: 200 },
                                saxa: { type: 'integer', example: 120 }
                            }
                        },
                        collZones: {
                            type: 'object',
                            properties: {
                                torino: { type: 'integer', example: 80 },
                                teulada: { type: 'integer', example: 60 },
                                saxa: { type: 'integer', example: 20 }
                            }
                        },
                        devZones: {
                            type: 'object',
                            properties: {
                                torino: { type: 'integer', example: 30 },
                                teulada: { type: 'integer', example: 30 },
                                saxa: { type: 'integer', example: 20 }
                            }
                        },
                        fixesTotal: { type: 'integer', example: 400 },
                        fixesDone: { type: 'integer', example: 180 },
                        fixPercent: { type: 'integer', example: 45 },
                        osCounts: {
                            type: 'object',
                            properties: Object.fromEntries(['Windows', 'Windows Server', 'Other'].map(family => [family, { type: 'integer', minimum: 0 }]))
                        }
                    }
                },
                ImportResult: {
                    type: 'object',
                    description: "Esito dell'import CSV/JSON. Merge con priorita' al DB: sui record esistenti vengono valorizzati solo i campi vuoti.",
                    properties: {
                        total: { type: 'integer', example: 120, description: 'Righe dati lette dal file (righe completamente vuote escluse)' },
                        inserted: { type: 'integer', example: 80, description: 'Nuovi record creati' },
                        merged: { type: 'integer', example: 25, description: 'Record esistenti completati con i campi mancanti' },
                        unchanged: { type: 'integer', example: 13, description: 'Record esistenti senza campi da completare' },
                        skipped: { type: 'integer', example: 2, description: 'Righe scartate (vedi errors)' },
                        errors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    row: { type: 'integer', example: 5, description: 'Riga del file (CSV: 1 = intestazione; JSON: posizione 1-based)' },
                                    error: { type: 'string', example: 'Missing required field(s): ambiente' }
                                }
                            }
                        },
                        ignoredColumns: { type: 'array', items: { type: 'string' }, example: ['colonna sconosciuta'] }
                    }
                },
                Error: {
                    type: 'object',
                    required: ['error'],
                    properties: {
                        error: { type: 'string', example: 'Internal server error' }
                    }
                },
                Service: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        servizio: { type: 'string', example: 'WEB SERVER' },
                        knowledge: { type: 'string', example: 'https://wiki.example.com/web' },
                        stato: { type: 'string', example: 'ATTIVO' },
                        hosts: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'integer', example: 42 },
                                    hostname: { type: 'string', example: 'srv-web-01' },
                                    ambiente: { type: 'string', example: 'PRODUZIONE' }
                                }
                            }
                        }
                    }
                },
                Log: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        username: { type: 'string', example: 'elut235' },
                        action: { type: 'string', example: 'CREATE' },
                        target_type: { type: 'string', example: 'HOST' },
                        target_id: { type: 'string', example: 'srv-web-01' },
                        details: { type: 'string', nullable: true, example: '{"os": "Windows 11"}' },
                        timestamp: { type: 'string', example: '2026-08-12T10:00:00Z' }
                    }
                },
                User: {
                    type: 'object',
                    properties: {
                        username: { type: 'string', example: 'elut235' },
                        role: { type: 'string', example: 'admin' },
                        canWrite: { type: 'boolean', example: true }
                    }
                },
                AuthResponse: {
                    type: 'object',
                    properties: {
                        token: { type: 'string', example: '1234567890abcdef' },
                        expiresAt: { type: 'string', example: '2026-08-13T10:00:00Z' },
                        user: { $ref: '#/components/schemas/User' }
                    }
                },
                Cve: {
                    type: 'object',
                    required: ['cve_id'],
                    description: 'CVE tracciata dal SOC. I campi problem_id..cve_origin ricalcano le colonne del file Excel.',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        problem_id: { type: 'string', nullable: true, example: 'PBI000000027474', description: 'Excel: "ID problem" (univoco)' },
                        cve_id: { type: 'string', example: 'CVE-2026-83154', description: 'Excel: "Riepilogo"' },
                        data_inoltro: { type: 'string', nullable: true, example: '2026-10-21T14:58:14' },
                        data_ultima_modifica: { type: 'string', nullable: true, example: '2026-10-21T14:58:19' },
                        stato_ticket: { type: 'string', nullable: true, example: 'Pendente', description: 'Excel: "Stato" (stato del problem sul sito)' },
                        note: { type: 'string', nullable: true },
                        riferimenti: { type: 'string', nullable: true, example: 'In analisi' },
                        errata: { type: 'string', nullable: true, example: 'Bassa' },
                        score: { type: 'number', nullable: true, minimum: 0, maximum: 10, example: 9.1, description: 'Base score CVSS (unico campo al posto di BASE SCORE / CVSS SCORE). La severita e derivata dallo score.' },
                        cve_origin: { type: 'string', nullable: true, example: 'Vulnerabilità - CVE-2026-83154 - Oracle Siebel CRM End User', description: 'Riepilogo originale ITSM (ridondante con CVE + prodotto, non mostrato in UI)' },
                        prodotto: { type: 'string', nullable: true, example: 'Oracle Siebel CRM End User', description: 'Prodotto impattato (estratto dal Riepilogo in fase di import o recuperato da cve-search)' },
                        vendor: { type: 'string', nullable: true, example: 'Oracle', description: 'Vendor impattato (recuperato da cve-search)' },
                        stato: { type: 'string', enum: ['IN_ANALISI', 'ARCHIVIATA'], example: 'IN_ANALISI', description: 'Stato del workflow interno (attivi = Pendenti su ITSM)' },
                        motivo_attesa: { type: 'string', nullable: true, example: 'In analisi', description: 'Testo libero (default "In analisi"); ogni cambio aggiorna ultima_revisione ed e salvato nello storico' },
                        esito: { type: 'string', nullable: true, example: 'NON_IMPATTANTE', description: 'VULN_CLIENT, APP_NON_PRESENTE, PROSSIMO_PATCHING, NON_IMPATTANTE, NON_IN_CARICO_SOC oppure motivazione custom ("Altro")' },
                        flagged: { type: 'integer', enum: [0, 1], example: 0, description: 'Flag (bandierina rossa) per i problem da girare post-riunione' },
                        impattato: { type: 'string', nullable: true, enum: ['SI', 'NO', 'DA_VERIFICARE', null], example: 'DA_VERIFICARE' },
                        asset_impattati: { type: 'string', nullable: true, example: 'srv-app-001, srv-app-002' },
                        ultima_revisione: { type: 'string', nullable: true, example: '2026-10-22' },
                        data_archiviazione: { type: 'string', format: 'date-time', nullable: true, example: '2026-10-22T14:50:00', description: 'Data e ora locale di archiviazione, conservata fino al minuto' },
                        created_at: { type: 'string', example: '2026-10-21 09:00:00' },
                        updated_at: { type: 'string', example: '2026-10-22 11:00:00' }
                    }
                },
                CveMotivoHistory: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        cve_ref: { type: 'integer', example: 1 },
                        motivo_attesa: { type: 'string', example: 'In attesa patch vendor' },
                        data_cambio: { type: 'string', example: '2026-10-22T13:43:04' },
                        utente: { type: 'string', nullable: true, example: 'admin' }
                    }
                },
                CveImportResult: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        created: { type: 'integer', example: 3, description: 'Nuovi problem inseriti' },
                        updated: { type: 'integer', example: 10, description: 'Problem esistenti aggiornati senza cambio di stato' },
                        reopened: { type: 'integer', example: 1, description: 'Problem archiviati tornati Pendenti (de-archiviati)' },
                        archived: { type: 'integer', example: 2, description: 'Problem attivi non piu Pendenti (archiviati)' },
                        imported: { type: 'integer', example: 16 },
                        skipped: { type: 'integer', example: 1 },
                        errors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    line: { type: 'integer', nullable: true, example: 5 },
                                    problem_id: { type: 'string', nullable: true },
                                    error: { type: 'string', example: 'Nessun ID CVE (CVE-YYYY-NNNN) nel Riepilogo' }
                                }
                            }
                        }
                    }
                },
                CveEnrichResult: {
                    type: 'object',
                    properties: {
                        updated: { type: 'integer', example: 3, description: 'CVE con almeno un campo completato' },
                        unchanged: { type: 'integer', example: 1, description: 'CVE gia complete o senza dati utili su cve-search' },
                        notFound: { type: 'integer', example: 0, description: 'CVE non presenti su cve-search' },
                        failed: { type: 'integer', example: 0, description: 'Errori (CVE inesistente o cve-search non raggiungibile)' },
                        items: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'integer', example: 1 },
                                    cve_id: { type: 'string', nullable: true, example: 'CVE-2026-69397' },
                                    filled: { type: 'array', items: { type: 'string', enum: ['vendor', 'prodotto', 'score'] } },
                                    error: { type: 'string', nullable: true }
                                }
                            }
                        }
                    }
                },
                CveDetails: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: 'CVE-2021-44228' },
                        state: { type: 'string', nullable: true, example: 'PUBLISHED' },
                        title: { type: 'string', nullable: true, example: 'Apache Log4j2 JNDI features do not protect against attacker controlled LDAP' },
                        summary: { type: 'string', nullable: true },
                        published: { type: 'string', nullable: true, example: '2021-12-10T00:00:00' },
                        modified: { type: 'string', nullable: true },
                        assigner: { type: 'string', nullable: true, example: 'apache' },
                        cvss: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    version: { type: 'string', nullable: true, example: '3.1' },
                                    score: { type: 'number', nullable: true, example: 10 },
                                    severity: { type: 'string', nullable: true, example: 'CRITICAL' },
                                    vector: { type: 'string', nullable: true, example: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H' }
                                }
                            }
                        },
                        cwe: { type: 'array', items: { type: 'string' }, example: ['CWE-502'] },
                        capec: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } },
                        affected: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    vendor: { type: 'string', example: 'Apache Software Foundation' },
                                    product: { type: 'string', example: 'Apache Log4j2' },
                                    versions: { type: 'array', items: { type: 'string' }, example: ['2.0-beta9 < 2.15.0'] }
                                }
                            }
                        },
                        references: { type: 'array', items: { type: 'string' } },
                        source: { type: 'string', example: 'cve-search' },
                        sourceUrl: { type: 'string', example: 'https://cve.circl.lu/vuln/CVE-2021-44228' }
                    }
                },
                MailTemplate: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        title: { type: 'string', example: 'Mail di Benvenuto' },
                        description: { type: 'string', nullable: true, example: 'Template usato per dare il benvenuto' },
                        subject: { type: 'string', nullable: true, example: 'Benvenuto in Covenant SOC INFRA' },
                        recipients: { type: 'string', nullable: true, example: 'user@example.com' },
                        content: { type: 'string', example: 'Ciao ${NOME}!' }
                    }
                }
            }
        }
    },
    apis: [path.join(__dirname, 'routes/*.{ts,js}').replaceAll('\\', '/')]
};

export const backendOpenApiSpec = swaggerJsdoc(options);
