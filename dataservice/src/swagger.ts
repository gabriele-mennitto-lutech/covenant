import path from 'node:path';
import swaggerJsdoc, { Options } from 'swagger-jsdoc';

const options: Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Covenant SOC INFRA Dataservice API',
            version: '1.0.0',
            description: 'Servizio dati SQLite di Covenant SOC INFRA per inventario Windows.\n\nLe API sono protette da CORS e Rate Limiting (max 2000 richieste/15min) per garantire sicurezza in produzione.'
        },
        servers: [
            {
                url: 'http://localhost:9992',
                description: 'Dataservice locale'
            }
        ],
        components: {
            schemas: {
                HostRecord: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', readOnly: true, example: 42, description: 'Chiave primaria surrogata generata dal DB' },
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
                        os_major: { type: 'integer', example: 2022 },
                        os_minor: { type: 'string', example: '0' },
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
                        vlfe2al: { type: 'string', nullable: true, example: '320' },
                        manual_overrides: { type: 'string', nullable: true, example: '["ambiente","note"]' }
                    }
                },
                HostResolveResult: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 42, description: 'Id dell\'host selezionato (attivo se presente, altrimenti il piu\' recente)' },
                        host: { $ref: '#/components/schemas/HostRecord' },
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
                SiteRecord: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 10 },
                        url_aliases: { type: 'string', example: 'app.example.it,www.app.example.it' },
                        ip_reali: { type: 'string', example: '203.0.113.15' },
                        nome_vip: { type: 'string', example: 'vip-app-prd-01' },
                        servizio: { type: 'string', example: 'PORTALE' },
                        tls_config: { type: 'string', example: 'EDGE' },
                        host_reali: { type: 'string', example: 'srv-app-001,srv-app-002' },
                        porta: { type: 'integer', nullable: true, example: 443 },
                        note: { type: 'string', example: 'Bilanciato F5' },
                        ambiente: { type: 'string', example: 'PRODUZIONE' }
                    }
                },
                Counters: {
                    type: 'object',
                    additionalProperties: { oneOf: [{ type: 'integer' }, { type: 'string' }, { type: 'number' }] },
                    example: { id: 1, total_hosts: 1300 }
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
                Error: {
                    type: 'object',
                    required: ['error'],
                    properties: {
                        error: { type: 'string', example: 'Failed to fetch hosts' }
                    }
                },
                ServiceRecord: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        servizio: { type: 'string', example: 'WEB SERVER' },
                        knowledge: { type: 'string', example: 'https://wiki.example.com/web' },
                        stato: { type: 'string', example: 'ATTIVO' },
                        hosts: {
                            type: 'array',
                            readOnly: true,
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
                LogRecord: {
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
                CveRecord: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        problem_id: { type: 'string', nullable: true, example: 'PBI000000027474', description: 'ID problem (Excel: "ID problem")' },
                        cve_id: { type: 'string', example: 'CVE-2026-83154', description: 'Excel: "Riepilogo"' },
                        data_inoltro: { type: 'string', nullable: true, example: '2026-10-21T14:58:14' },
                        data_ultima_modifica: { type: 'string', nullable: true, example: '2026-10-21T14:58:19' },
                        stato_ticket: { type: 'string', nullable: true, example: 'Pendente', description: 'Stato del problem sul sito (Excel: "Stato")' },
                        note: { type: 'string', nullable: true, example: 'Buonasera, a seguito di una segnalazione arrivata da parte del Garr...' },
                        riferimenti: { type: 'string', nullable: true, example: 'In analisi' },
                        errata: { type: 'string', nullable: true, example: 'Bassa' },
                        score: { type: 'number', nullable: true, minimum: 0, maximum: 10, example: 9.1, description: 'Base score CVSS (unifica BASE SCORE / CVSS SCORE). Accetta anche "Base Score: 9.1"' },
                        cve_origin: { type: 'string', nullable: true, example: 'Vulnerabilità - CVE-2026-83154 - Oracle Siebel CRM End User', description: 'Riepilogo originale ITSM (ridondante, non mostrato in UI)' },
                        prodotto: { type: 'string', nullable: true, example: 'Oracle Siebel CRM End User', description: 'Prodotto impattato estratto dal Riepilogo' },
                        vendor: { type: 'string', nullable: true, example: 'Oracle', description: 'Vendor impattato (recuperato da cve-search)' },
                        stato: { type: 'string', enum: ['IN_ANALISI', 'ARCHIVIATA'], example: 'IN_ANALISI' },
                        motivo_attesa: { type: 'string', nullable: true, example: 'In analisi', description: 'Testo libero; ogni cambio e registrato in cve_motivo_history' },
                        esito: { type: 'string', nullable: true, example: 'NON_IMPATTANTE', description: 'VULN_CLIENT, APP_NON_PRESENTE, PROSSIMO_PATCHING, NON_IMPATTANTE, NON_IN_CARICO_SOC oppure testo custom ("Altro")' },
                        flagged: { type: 'integer', enum: [0, 1], example: 0, description: 'Problem flaggato da girare post-riunione' },
                        impattato: { type: 'string', nullable: true, example: 'DA_VERIFICARE' },
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
                        motivo_attesa: { type: 'string', example: 'In analisi' },
                        data_cambio: { type: 'string', example: '2026-10-22T13:43:04' },
                        utente: { type: 'string', nullable: true, example: 'admin' }
                    }
                },
                CveImportRow: {
                    type: 'object',
                    properties: {
                        line: { type: 'integer', example: 2, description: 'Riga del file sorgente (per gli errori)' },
                        problem_id: { type: 'string', example: 'PBI00000002751' },
                        riepilogo: { type: 'string', example: 'Vulnerabilità - CVE-2026-69397 - Microsoft OpenSSH per Windows' },
                        data_inoltro: { type: 'string', nullable: true, example: '2026-10-22T13:25:05' },
                        data_ultima_modifica: { type: 'string', nullable: true, example: '2026-10-22T13:43:04' },
                        stato_ticket: { type: 'string', example: 'Pendente' },
                        note: { type: 'string', nullable: true }
                    }
                },
                CveImportResult: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        created: { type: 'integer', example: 3 },
                        updated: { type: 'integer', example: 10 },
                        reopened: { type: 'integer', example: 1 },
                        archived: { type: 'integer', example: 2 },
                        imported: { type: 'integer', example: 16 },
                        skipped: { type: 'integer', example: 1 },
                        errors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    line: { type: 'integer', nullable: true },
                                    problem_id: { type: 'string', nullable: true },
                                    error: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                ImportResult: {
                    type: 'object',
                    description: "Esito di un import massivo (merge con priorita' al DB: vengono valorizzati solo i campi vuoti dei record esistenti)",
                    properties: {
                        total: { type: 'integer', example: 120 },
                        inserted: { type: 'integer', example: 80, description: 'Nuovi record inseriti' },
                        merged: { type: 'integer', example: 25, description: 'Record esistenti in cui sono stati valorizzati campi vuoti' },
                        unchanged: { type: 'integer', example: 13, description: 'Record esistenti senza campi da completare' },
                        skipped: { type: 'integer', example: 2, description: 'Righe scartate (non valide o in conflitto)' },
                        errors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    index: { type: 'integer', example: 4, description: 'Indice (0-based) della riga nel payload' },
                                    error: { type: 'string', example: 'Hostname is required' }
                                }
                            }
                        }
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
    apis: [path.join(__dirname, '*.{ts,js}').replaceAll('\\', '/')]
};

export const dataserviceOpenApiSpec = swaggerJsdoc(options);
