import { Router } from 'express';
import axios from 'axios';
import { hosts, refreshHostsCacheFromDataservice } from '../data/hostsStore';
import { applyDefaultsToHost } from '../utils/defaults';
import { logActivity } from '../utils/logger';
import { emitNotification } from '../services/notificationBroadcast';
import express from 'express';
import { windowsFamily } from '../utils/windows';
import {
    ImportField,
    ImportFormatError,
    MAX_IMPORT_BYTES,
    buildCsvTemplate,
    mergeImportResult,
    parseImportFile,
    parseImportFormat
} from '../utils/csvImport';

const DATASERVICE_URL = process.env.DATASERVICE_URL || 'http://localhost:9992';

const router = Router();

const FILTER_KEYS = ['hostname', 'applicazione', 'riferimento', 'ambiente', 'company', 'servizio', 'appliance', 'zona', 'riferimentoEs', 'locazione', 'os', 'manutenzione', 'status', 'nodo', 'note', 'pianificazione', 'rfc', 'fixed', 'fixable', 'divisione'] as const;

function toLower(value: unknown): string {
    switch (typeof value) {
        case 'undefined':
            return '';
        case 'object':
            return value === null ? '' : JSON.stringify(value).toLowerCase();
        default:
            return String(value).toLowerCase();
    }
}

function parseQueryValues(queryVal: unknown): string[] {
    const raw = Array.isArray(queryVal) ? queryVal : String(queryVal).split(',');
    return raw.map(v => String(v).trim().toLowerCase()).filter(Boolean) as string[];
}

function applyGlobalSearch(list: typeof hosts, rawSearch: unknown): typeof hosts {
    const globalSearch = toLower(rawSearch);
    if (!globalSearch) return list;
    return list.filter(h => Object.values(h).some(val => String(val).toLowerCase().includes(globalSearch)));
}

function applyColumnFilters(list: typeof hosts, query: Record<string, unknown>): typeof hosts {
    return FILTER_KEYS.reduce((acc, key) => {
        const queryVal = query[key];
        if (queryVal === undefined) return acc;

        const vals = parseQueryValues(queryVal);
        if (vals.length === 0) return acc;

        return acc.filter(h => {
            const hValStr = toLower((h as any)[key]);
            return vals.some(v => hValStr.includes(v) || hValStr === v);
        });
    }, list);
}

function applyCustomFilters(list: typeof hosts, query: Record<string, unknown>): typeof hosts {
    let filtered = list;

    if (query.excludeManutenzione) {
        const ex = toLower(query.excludeManutenzione);
        filtered = filtered.filter(h => !toLower(h.manutenzione).includes(ex));
    }

    if (query.osFamily) {
        const families = parseQueryValues(query.osFamily);
        filtered = filtered.filter(h => families.includes(windowsFamily(h.os).toLowerCase()));
    }

    return filtered;
}

function applyPresetFilters(list: typeof hosts, rawPreset: unknown): typeof hosts {
    const preset = typeof rawPreset === 'string' ? rawPreset : '';
    if (!preset) return list;

    const predicates: Record<string, (h: (typeof hosts)[number]) => boolean> = {
        no_app: h => !h.applicazione,
        no_serv: h => !h.servizio,
        no_maint: h => !h.manutenzione,
        no_loc: h => !h.locazione,
        test_env: h => toLower(h.ambiente).includes('test'),
        prod_env: h => toLower(h.ambiente).includes('produzione'),
        windows: h => windowsFamily(h.os) === 'Windows',
        windows_server: h => windowsFamily(h.os) === 'Windows Server'
    };

    const predicate = predicates[preset];
    return predicate ? list.filter(predicate) : list;
}

function parseHostId(raw: unknown): number | null {
    if (typeof raw === 'number') {
        return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
    }
    if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) return null;
    const id = Number(raw.trim());
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseHostIdList(raw: unknown): number[] | null {
    if (!Array.isArray(raw)) return null;
    const ids: number[] = [];
    for (const item of raw) {
        const id = parseHostId(item);
        if (id === null) return null;
        if (!ids.includes(id)) ids.push(id);
    }
    return ids;
}

function findHostIndexById(id: number): number {
    return hosts.findIndex(h => h.id === id);
}

function describeHosts(ids: number[]): string[] {
    return ids.map(id => hosts.find(h => h.id === id)?.hostname ?? `#${id}`);
}

// Manual cache reload endpoint.
router.post('/cache/reload', async (req, res) => {
    try {
        await refreshHostsCacheFromDataservice();
        res.json({ success: true, loadedHosts: hosts.length });
    } catch (err: any) {
        console.error('Failed to reload hosts cache manually:', err?.message || err);
        res.status(500).json({ error: 'Failed to reload hosts cache' });
    }
});

/** Colonne del template di import host (chiave di merge: hostname + ambiente + servizio). */
export const HOST_IMPORT_FIELDS: ImportField[] = [
    { key: 'hostname', dbKey: 'hostname', label: 'Hostname', type: 'string', required: true },
    { key: 'ambiente', dbKey: 'ambiente', label: 'Ambiente', type: 'string', required: true },
    { key: 'servizio', dbKey: 'servizio', label: 'Servizio', type: 'string' },
    { key: 'applicazione', dbKey: 'applicazione', label: 'Applicazione', type: 'string' },
    { key: 'riferimento', dbKey: 'riferimento', label: 'Riferimento', type: 'string' },
    { key: 'company', dbKey: 'company', label: 'Company', type: 'string' },
    { key: 'appliance', dbKey: 'appliance', label: 'Appliance', type: 'boolean' },
    { key: 'zona', dbKey: 'zona', label: 'Zona', type: 'string' },
    { key: 'riferimentoEs', dbKey: 'riferimentoEs', label: 'Riferimento ES', type: 'string' },
    { key: 'locazione', dbKey: 'locazione', label: 'Locazione', type: 'string' },
    { key: 'os', dbKey: 'os', label: 'OS', type: 'string' },
    { key: 'manutenzione', dbKey: 'manutenzione', label: 'Manutenzione', type: 'string' },
    { key: 'status', dbKey: 'status', label: 'Status', type: 'boolean' },
    { key: 'nodo', dbKey: 'nodo', label: 'Nodo', type: 'integer' },
    { key: 'note', dbKey: 'note', label: 'Note', type: 'string' },
    { key: 'pianificazione', dbKey: 'pianificazione', label: 'Pianificazione', type: 'string' },
    { key: 'verContView', dbKey: 'verContView', label: 'Ver Cont View', type: 'string' },
    { key: 'rfc', dbKey: 'rfc', label: 'RFC', type: 'string' },
    { key: 'fixed', dbKey: 'fixed', label: 'Fixed', type: 'boolean' },
    { key: 'fixable', dbKey: 'fixable', label: 'Fixable', type: 'boolean' },
    { key: 'divisione', dbKey: 'divisione', label: 'Divisione', type: 'string' },
    { key: 'ipfe', dbKey: 'ipfe', label: 'IP Frontend', type: 'string' },
    { key: 'ipmgt', dbKey: 'ipmgt', label: 'IP Management', type: 'string' },
    { key: 'ipfe2al', dbKey: 'ipfe2al', label: 'IP FE2AL', type: 'string' },
    { key: 'vlfe', dbKey: 'vlfe', label: 'VLAN Frontend', type: 'string' },
    { key: 'vlmgt', dbKey: 'vlmgt', label: 'VLAN Management', type: 'string' },
    { key: 'vlfe2al', dbKey: 'vlfe2al', label: 'VLAN FE2AL', type: 'string' }
];

const HOST_WRITE_KEYS = new Set(HOST_IMPORT_FIELDS.map(field => field.dbKey));
function pickHostFields(payload: unknown): Record<string, any> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
    return Object.fromEntries(Object.entries(payload).filter(([key]) => HOST_WRITE_KEYS.has(key)));
}

/**
 * @openapi
 * /api/hosts/import/template:
 *   get:
 *     tags: [Hosts]
 *     summary: Scarica il template CSV per l'import host
 *     description: CSV UTF-8 (con BOM) separato da `;` contenente la sola riga di intestazione.
 *     responses:
 *       '200':
 *         description: Template CSV
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *             example: "hostname;ambiente;servizio;applicazione;..."
 */
router.get('/import/template', (req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="template_import_hosts.csv"');
    res.send(buildCsvTemplate(HOST_IMPORT_FIELDS));
});

/**
 * @openapi
 * /api/hosts/import:
 *   post:
 *     tags: [Hosts]
 *     summary: Importa host da file CSV/JSON (merge con priorita' al DB)
 *     description: |-
 *       Il corpo della richiesta e' il contenuto testuale del file (`Content-Type: text/plain`, max 10MB, max 20000 righe).
 *       CSV: separatore `;` o `,` (rilevato automaticamente), prima riga = intestazioni del template
 *       (sono accettate anche le etichette dell'export CSV). JSON: array di oggetti con le stesse chiavi del template.
 *       Chiave di merge: hostname + ambiente + servizio (case-insensitive). Se l'host esiste gia' vengono valorizzati
 *       solo i campi vuoti sul DB, senza modificare i dati presenti; altrimenti l'host viene creato.
 *       Booleani accettati (case-insensitive): true/1/si/sì/yes/y/s/ok/x/vero e false/0/no/n/ko/falso.
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [csv, json], default: csv }
 *     requestBody:
 *       required: true
 *       content:
 *         text/plain:
 *           schema: { type: string }
 *           example: "hostname;ambiente;servizio;os\nsrv-app-001;Produzione;PORTALE;Windows Server 2022"
 *     responses:
 *       '200':
 *         description: Esito import
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ImportResult' }
 *       '400':
 *         description: File non valido (formato, intestazioni obbligatorie mancanti, troppe righe)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore di comunicazione col dataservice (nessuna modifica applicata)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/import', express.text({ type: 'text/plain', limit: MAX_IMPORT_BYTES }), async (req, res) => {
    const format = parseImportFormat(req.query.format);
    if (!format) return res.status(400).json({ error: 'Invalid format (allowed: csv, json)' });

    let parsed;
    try {
        parsed = parseImportFile(HOST_IMPORT_FIELDS, req.body, format);
    } catch (err) {
        if (err instanceof ImportFormatError) return res.status(400).json({ error: err.message });
        console.error('Unexpected error parsing import file:', err);
        return res.status(500).json({ error: 'Failed to parse import file' });
    }

    try {
        let dsResult = null;
        if (parsed.rows.length > 0) {
            const response = await axios.post(`${DATASERVICE_URL}/data/hosts/import`, { rows: parsed.rows.map(r => r.data) }, { maxBodyLength: Infinity });
            dsResult = response.data;
            await refreshHostsCacheFromDataservice();
        }
        const result = mergeImportResult(parsed, dsResult);
        const username = (req as any).user?.username;

        if (username) {
            logActivity(username, 'IMPORT', 'HOST', `${result.inserted + result.merged} hosts`, {
                format, inserted: result.inserted, merged: result.merged, unchanged: result.unchanged, skipped: result.skipped
            }).catch(console.error);
        }
        emitNotification({
            type: result.skipped > 0 ? 'warning' : 'success',
            message: `Import host: ${result.inserted} creati, ${result.merged} completati, ${result.skipped} scartati`,
            resource: 'host',
            action: 'import',
            actor: username || 'system'
        });
        res.json(result);
    } catch (err: any) {
        console.error('Error importing hosts in dataservice:', err?.message || err);
        res.status(500).json({ error: 'Error communicating with dataservice during import' });
    }
});

/**
 * @openapi
 * /api/hosts:
 *   get:
 *     tags: [Hosts]
 *     summary: Elenco host con filtri, ordinamento e paginazione
 *     description: Restituisce la lista host dalla cache backend applicando globalSearch e filtri per colonna.
 *     parameters:
 *       - in: query
 *         name: globalSearch
 *         schema: { type: string }
 *         description: Ricerca full-text su tutti i campi host.
 *       - in: query
 *         name: hostname
 *         schema: { type: string }
 *       - in: query
 *         name: applicazione
 *         schema: { type: string }
 *       - in: query
 *         name: riferimento
 *         schema: { type: string }
 *       - in: query
 *         name: ambiente
 *         schema: { type: string }
 *       - in: query
 *         name: company
 *         schema: { type: string }
 *       - in: query
 *         name: servizio
 *         schema: { type: string }
 *       - in: query
 *         name: appliance
 *         schema: { type: string }
 *       - in: query
 *         name: zona
 *         schema: { type: string }
 *       - in: query
 *         name: riferimentoEs
 *         schema: { type: string }
 *       - in: query
 *         name: locazione
 *         schema: { type: string }
 *       - in: query
 *         name: os
 *         schema: { type: string }
 *       - in: query
 *         name: manutenzione
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: nodo
 *         schema: { type: string }
 *       - in: query
 *         name: note
 *         schema: { type: string }
 *       - in: query
 *         name: pianificazione
 *         schema: { type: string }
 *       - in: query
 *         name: rfc
 *         schema: { type: string }
 *       - in: query
 *         name: fixed
 *         schema: { type: string }
 *       - in: query
 *         name: fixable
 *         schema: { type: string }
 *       - in: query
 *         name: divisione
 *         schema: { type: string }
 *       - in: query
 *         name: excludeManutenzione
 *         schema: { type: string }
 *       - in: query
 *         name: osFamily
 *         schema: { type: string, example: "Windows,Windows Server,other" }
 *       - in: query
 *         name: preset
 *         schema: { type: string, enum: [no_app, no_serv, no_maint, no_loc, test_env, prod_env, windows, windows_server] }
 *       - in: query
 *         name: sortCol
 *         schema: { type: string }
 *       - in: query
 *         name: sortDir
 *         schema: { type: integer, enum: [1, -1] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       '200':
 *         description: Lista host filtrata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Host'
 *                 totalCount:
 *                   type: integer
 *             example:
 *               items:
 *                 - id: 42
 *                   hostname: srv-app-001
 *                   ambiente: PRODUZIONE
 *                   company: RAI
 *                   appliance: false
 *                   zona: DMZ
 *                   os: Windows Server 2022
 *                   status: true
 *                   nodo: 1
 *                   fixed: false
 *                   fixable: true
 *               totalCount: 1
 *       '400':
 *         description: Parametri non validi
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: "Invalid query parameters" }
 *       '404':
 *         description: Nessun host trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: "No hosts found" }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: "Internal server error" }
 */
// GET /api/hosts - returns filtered hosts
router.get('/', async (req, res) => {
    if (req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache' || hosts.length === 0) {
        console.log("Cache vuota o hard refresh rilevato! Ricarico la cache dal dataservice...");
        try {
            await refreshHostsCacheFromDataservice();
        } catch (e) {
            console.error("Errore durante il reload della cache:", e);
        }
    }

    let result = [...hosts];
    result = applyGlobalSearch(result, req.query.globalSearch);
    result = applyColumnFilters(result, req.query as Record<string, unknown>);
    result = applyCustomFilters(result, req.query as Record<string, unknown>);
    result = applyPresetFilters(result, req.query.preset);

    // Sorting
    const sortCol = req.query.sortCol as string;
    const sortDir = Number.parseInt(req.query.sortDir as string, 10) || 1;
    if (sortCol) {
        result.sort((a: any, b: any) => {
            const valA = String(a[sortCol] || '').toLowerCase();
            const valB = String(b[sortCol] || '').toLowerCase();
            if (valA < valB) return -1 * sortDir;
            if (valA > valB) return 1 * sortDir;
            return 0;
        });
    }

    // Pagination
    const totalCount = result.length;
    const page = Number.parseInt(req.query.page as string, 10) || 1;
    const pageSize = Number.parseInt(req.query.pageSize as string, 10) || 50;
    
    // If pageSize is -1 or very large, it means "All"
    if (pageSize > 0) {
        const start = (page - 1) * pageSize;
        result = result.slice(start, start + pageSize);
    }

    res.json({
        items: result,
        totalCount
    });
});

/**
 * @openapi
 * /api/hosts:
 *   post:
 *     tags: [Hosts]
 *     summary: Crea un nuovo host
 *     description: |-
 *       L'id viene assegnato dal dataservice e restituito nella risposta.
 *       Piu' host con stesso hostname e ambiente sono ammessi solo se dismessi/spenti.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Host'
 *           example:
 *             hostname: srv-new-001
 *             ambiente: PRODUZIONE
 *             company: RAI
 *             appliance: false
 *             zona: DMZ
 *             os: Windows 11
 *             status: true
 *             nodo: 1
 *             fixed: false
 *             fixable: true
 *     responses:
 *       '201':
 *         description: Host creato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 host: { $ref: '#/components/schemas/Host' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: "Hostname and Ambiente are required" }
 *       '404':
 *         description: Risorsa correlata non trovata
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: "Referenced resource not found" }
 *       '409':
 *         description: Esiste gia' un host attivo con lo stesso hostname e ambiente
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore di comunicazione col dataservice
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// POST /api/hosts - create a new host
router.post('/', async (req, res) => {
    let newHost = pickHostFields(req.body);
    if (!newHost.hostname || !newHost.ambiente) {
        return res.status(400).json({ error: 'Hostname and Ambiente are required' });
    }

    newHost = applyDefaultsToHost(newHost);
    
    try {
        const response = await axios.post(`${DATASERVICE_URL}/data/hosts`, newHost);
        if (response.data.success) {
            hosts.push(response.data.host);
            
            const reqAny = req as any;
            if (reqAny.user?.username) {
                logActivity(reqAny.user.username, 'CREATE', 'HOST', newHost.hostname, { id: response.data.host?.id, ...newHost }).catch(console.error);
            }

            emitNotification({
                type: 'success',
                message: `Host ${newHost.hostname} creato`,
                resource: 'host',
                action: 'create',
                actor: (req as any).user?.username || 'system'
            });

            return res.status(201).json({ success: true, host: response.data.host });
        } else {
             res.status(500).json({ error: 'Failed to create host in dataservice' });
        }
    } catch (err: any) {
        if (err.response?.status === 409) {
            return res.status(409).json({ error: err.response.data?.error || 'Host already exists' });
        }
        console.error("Error creating host in dataservice:", err);
        res.status(500).json({ error: 'Error communicating with dataservice' });
    }
});

/**
 * @openapi
 * /api/hosts/stats:
 *   get:
 *     tags: [Hosts]
 *     summary: Statistiche dashboard host/fix
 *     responses:
 *       '200':
 *         description: Statistiche aggregate
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardStats'
 *       '400':
 *         description: Richiesta non valida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Dati non trovati
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /api/hosts/stats - returns dashboard statistics
router.get('/stats', async (req, res) => {
    if (req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache') {
        try {
            await refreshHostsCacheFromDataservice();
        } catch (e) {}
    }

    const totalHosts = hosts.length;
    
    const dismesseSpente = hosts.filter(h => {
        const amb = (h.ambiente || '').toLowerCase();
        return amb.includes('dismessa') || amb.includes('spenta');
    });
    const dismesseHosts = dismesseSpente.length;

    const countZones = (hostsList: any[]) => {
        let t = 0, teu = 0, s = 0;
        hostsList.forEach(h => {
            const loc = (h.locazione || '').toLowerCase();
            if (loc.includes('torino')) t++;
            else if (loc.includes('teulada')) teu++;
            else if (loc.includes('saxa')) s++;
        });
        return { torino: t, teulada: teu, saxa: s };
    };

    const prodH = hosts.filter(h => (h.ambiente || '').toLowerCase().includes('produzion'));
    const collH = hosts.filter(h => (h.ambiente || '').toLowerCase().includes('collaudo'));
    const devH = hosts.filter(h => (h.ambiente || '').toLowerCase().includes('sviluppo'));

    const prodHosts = prodH.length;
    const collHosts = collH.length;
    const devHosts = devH.length;

    const prodZones = countZones(prodH);
    const collZones = countZones(collH);
    const devZones = countZones(devH);
    
    const fixableHostsList = hosts.filter(h => h.fixable === true);
    const fixesTotal = fixableHostsList.length;
    const fixesDone = fixableHostsList.filter(h => h.fixed === true).length;
    const fixPercent = fixesTotal > 0 ? Math.round((fixesDone / fixesTotal) * 100) : 0;

    // Services Stats
    let servicesStats = { total: 0, full: 0, limited: 0, absent: 0 };
    try {
        const DATASERVICE_URL = process.env.DATASERVICE_URL || 'http://localhost:9992';
        const resServices = await axios.get(DATASERVICE_URL + '/data/services');
        const sList = resServices.data || [];
        servicesStats.total = sList.length;
        sList.forEach((s: any) => {
            const k = (s.knowledge || '').toLowerCase();
            if (k === 'full') servicesStats.full++;
            else if (k === 'limited') servicesStats.limited++;
            else if (k === 'absent') servicesStats.absent++;
        });
    } catch (e) {
        console.error("Error fetching services for dashboard stats", e);
    }

    // Sites Stats
    let sitesStats = { total: 0, prod: 0, coll: 0, dev: 0 };
    try {
        const DATASERVICE_URL = process.env.DATASERVICE_URL || 'http://localhost:9992';
        const resSites = await axios.get(DATASERVICE_URL + '/data/sites');
        const sList = resSites.data || [];
        sitesStats.total = sList.length;
        sList.forEach((s: any) => {
            const a = (s.ambiente || '').toLowerCase();
            if (a.includes('produzion')) sitesStats.prod++;
            else if (a.includes('collaudo')) sitesStats.coll++;
            else if (a.includes('sviluppo')) sitesStats.dev++;
        });
    } catch (e) {
        console.error("Error fetching sites for dashboard stats", e);
    }

    res.json({
        totalHosts,
        dismesseHosts,
        activeHosts: totalHosts - dismesseHosts,
        prodHosts,
        collHosts,
        devHosts,
        prodZones,
        collZones,
        devZones,
        fixesTotal,
        fixesDone,
        fixPercent,
        servicesStats,
        sitesStats,
        osCounts: hosts.reduce<Record<string, number>>((counts, host) => {
            const family = windowsFamily(host.os);
            counts[family] = (counts[family] || 0) + 1;
            return counts;
        }, {})
    });
});

/**
 * @openapi
 * /api/hosts/all-hostnames:
 *   get:
 *     tags: [Hosts]
 *     summary: Riferimenti host (id, hostname, ambiente) per selezione bulk
 *     description: Restituisce gli identificativi degli host rispettando gli stessi filtri di GET /api/hosts.
 *     parameters:
 *       - in: query
 *         name: globalSearch
 *         schema: { type: string }
 *       - in: query
 *         name: hostname
 *         schema: { type: string }
 *       - in: query
 *         name: applicazione
 *         schema: { type: string }
 *       - in: query
 *         name: riferimento
 *         schema: { type: string }
 *       - in: query
 *         name: ambiente
 *         schema: { type: string }
 *       - in: query
 *         name: company
 *         schema: { type: string }
 *       - in: query
 *         name: servizio
 *         schema: { type: string }
 *       - in: query
 *         name: appliance
 *         schema: { type: string }
 *       - in: query
 *         name: zona
 *         schema: { type: string }
 *       - in: query
 *         name: riferimentoEs
 *         schema: { type: string }
 *       - in: query
 *         name: locazione
 *         schema: { type: string }
 *       - in: query
 *         name: os
 *         schema: { type: string }
 *       - in: query
 *         name: manutenzione
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: nodo
 *         schema: { type: string }
 *       - in: query
 *         name: note
 *         schema: { type: string }
 *       - in: query
 *         name: pianificazione
 *         schema: { type: string }
 *       - in: query
 *         name: rfc
 *         schema: { type: string }
 *       - in: query
 *         name: fixed
 *         schema: { type: string }
 *       - in: query
 *         name: fixable
 *         schema: { type: string }
 *       - in: query
 *         name: divisione
 *         schema: { type: string }
 *       - in: query
 *         name: excludeManutenzione
 *         schema: { type: string }
 *       - in: query
 *         name: osFamily
 *         schema: { type: string }
 *       - in: query
 *         name: preset
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Array di riferimenti host
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/HostRef' }
 *             example:
 *               - { id: 12, hostname: "srv-app-001", ambiente: "Produzione" }
 *               - { id: 57, hostname: "srv-app-001", ambiente: "Dismessa" }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /api/hosts/all-hostnames - returns host references matching current filters for "Select All"
router.get('/all-hostnames', (req, res) => {
    let result = [...hosts];
    result = applyGlobalSearch(result, req.query.globalSearch);
    result = applyColumnFilters(result, req.query as Record<string, unknown>);
    result = applyCustomFilters(result, req.query as Record<string, unknown>);
    result = applyPresetFilters(result, req.query.preset);
    res.json(result.map(h => ({ id: h.id, hostname: h.hostname, ambiente: h.ambiente })));
});

/**
 * @openapi
 * /api/hosts/resolve:
 *   get:
 *     tags: [Hosts]
 *     summary: Converte hostname (+ ambiente) nell'id dell'host
 *     description: |-
 *       La conversione e' delegata al dataservice. Utile quando si dispone solo del nome macchina
 *       (es. host reali dei siti). Se piu' host corrispondono viene preferito quello attivo, altrimenti il piu' recente.
 *     parameters:
 *       - in: query
 *         name: hostname
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: ambiente
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Host risolto
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/HostResolveResult' }
 *       '400':
 *         description: Hostname mancante
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Host non trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore di comunicazione col dataservice
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /api/hosts/resolve - hostname(+ambiente) -> id (delegated to dataservice)
router.get('/resolve', async (req, res) => {
    const hostname = typeof req.query.hostname === 'string' ? req.query.hostname.trim() : '';
    const ambiente = typeof req.query.ambiente === 'string' ? req.query.ambiente.trim() : '';
    if (!hostname) {
        return res.status(400).json({ error: 'Hostname is required' });
    }

    try {
        const params: Record<string, string> = { hostname };
        if (ambiente) params.ambiente = ambiente;
        const response = await axios.get(`${DATASERVICE_URL}/data/hosts/resolve`, { params });
        res.json(response.data);
    } catch (err: any) {
        if (err.response?.status === 404) {
            return res.status(404).json({ error: 'Host not found' });
        }
        console.error('Error resolving host in dataservice:', err?.message || err);
        res.status(500).json({ error: 'Error communicating with dataservice' });
    }
});

/**
 * @openapi
 * /api/hosts/bulk:
 *   put:
 *     tags: [Hosts]
 *     summary: Aggiornamento massivo host (per id)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, partialUpdate]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: integer, minimum: 1 }
 *               partialUpdate:
 *                 type: object
 *                 additionalProperties: true
 *           example:
 *             ids: [12, 57]
 *             partialUpdate:
 *               fixed: true
 *               note: "Aggiornato in bulk"
 *     responses:
 *       '200':
 *         description: Aggiornamento completato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 updatedCount: { type: integer }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: "Invalid payload" }
 *       '409':
 *         description: L'aggiornamento creerebbe host attivi duplicati (nessuna modifica applicata)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// PUT /api/hosts/bulk - updates multiple hosts
router.put('/bulk', async (req, res) => {
    const ids = parseHostIdList(req.body?.ids);
    const rawUpdate = req.body?.partialUpdate;
    if (!ids || !rawUpdate || typeof rawUpdate !== 'object' || Array.isArray(rawUpdate)) {
        return res.status(400).json({ error: 'Invalid payload' });
    }
    const partialUpdate = pickHostFields(rawUpdate);

    try {
        const response = await axios.put(`${DATASERVICE_URL}/data/hosts/bulk/update`, { ids, partialUpdate });
        if (response.data.success) {
            for (const id of ids) {
                const idx = findHostIndexById(id);
                if (idx > -1) {
                    hosts[idx] = { ...hosts[idx], ...partialUpdate };
                }
            }

            const updatedCount = response.data.updatedCount ?? ids.length;
            const reqAny = req as any;
            if (reqAny.user?.username) {
                logActivity(reqAny.user.username, 'UPDATE_BULK', 'HOST', 'bulk', { ids, hostnames: describeHosts(ids), partialUpdate }).catch(console.error);
            }

            emitNotification({
                type: 'info',
                message: `${updatedCount} host aggiornati in blocco`,
                resource: 'host',
                action: 'bulk_update',
                actor: (req as any).user?.username || 'system'
            });

            res.json({ success: true, updatedCount });
        } else {
            res.status(500).json({ error: 'Failed to update hosts in dataservice' });
        }
    } catch (err: any) {
        if (err.response?.status === 409) {
            return res.status(409).json({ error: err.response.data?.error || 'Host conflict' });
        }
        console.error("Error updating hosts in dataservice:", err?.message || err);
        res.status(500).json({ error: 'Error communicating with dataservice' });
    }
});

/**
 * @openapi
 * /api/hosts/bulk:
 *   delete:
 *     tags: [Hosts]
 *     summary: Eliminazione massiva host (per id)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: integer, minimum: 1 }
 *           example:
 *             ids: [12, 57]
 *     responses:
 *       '200':
 *         description: Cancellazione completata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 deletedCount: { type: integer }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// DELETE /api/hosts/bulk - deletes multiple hosts
router.delete('/bulk', async (req, res) => {
    const ids = parseHostIdList(req.body?.ids);
    if (!ids) {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    try {
        const hostnames = describeHosts(ids);
        const response = await axios.delete(`${DATASERVICE_URL}/data/hosts/bulk/delete`, { data: { ids } });
        if (response.data.success) {
            for (const id of ids) {
                const idx = findHostIndexById(id);
                if (idx > -1) {
                    hosts.splice(idx, 1);
                }
            }

            const deletedCount = response.data.deletedCount ?? ids.length;
            const reqAny = req as any;
            if (reqAny.user?.username) {
                logActivity(reqAny.user.username, 'DELETE_BULK', 'HOST', 'bulk', { ids, hostnames }).catch(console.error);
            }

            emitNotification({
                type: 'warning',
                message: `${deletedCount} host eliminati`,
                resource: 'host',
                action: 'bulk_delete',
                actor: (req as any).user?.username || 'system'
            });

            res.json({ success: true, deletedCount });
        } else {
            res.status(500).json({ error: 'Failed to delete hosts in dataservice' });
        }
    } catch (err: any) {
        console.error("Error deleting hosts in dataservice:", err?.message || err);
        res.status(500).json({ error: 'Error communicating with dataservice' });
    }
});

/**
 * @openapi
 * /api/hosts/{id}:
 *   get:
 *     tags: [Hosts]
 *     summary: Recupera un host per id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       '200':
 *         description: Host trovato
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Host'
 *       '400':
 *         description: Id non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Host non trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   put:
 *     tags: [Hosts]
 *     summary: Aggiorna un host per id
 *     description: L'id non e' modificabile; hostname e ambiente possono essere aggiornati liberamente (es. dismissione).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *           example:
 *             ambiente: Dismessa
 *     responses:
 *       '200':
 *         description: Host aggiornato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 host: { $ref: '#/components/schemas/Host' }
 *       '400':
 *         description: Id non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Host non trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '409':
 *         description: L'aggiornamento creerebbe un host attivo duplicato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /api/hosts/:id - exact match by id
router.get('/:id', async (req, res) => {
    const id = parseHostId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Invalid host id' });
    }

    const cached = hosts.find(h => h.id === id);
    if (cached) {
        return res.json(cached);
    }

    // Cache miss (es. host creato da un altro processo): verifica direttamente sul dataservice
    try {
        const response = await axios.get(`${DATASERVICE_URL}/data/hosts/${id}`);
        hosts.push(response.data);
        return res.json(response.data);
    } catch (err: any) {
        if (err.response?.status === 404) {
            return res.status(404).json({ error: 'Host not found' });
        }
        console.error('Error fetching host from dataservice:', err?.message || err);
        return res.status(500).json({ error: 'Error communicating with dataservice' });
    }
});

// PUT /api/hosts/:id - updates a single host
router.put('/:id', async (req, res) => {
    const id = parseHostId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Invalid host id' });
    }
    const partialUpdate = pickHostFields(req.body);

    try {
        const response = await axios.put(`${DATASERVICE_URL}/data/hosts/${id}`, partialUpdate);
        if (!response.data.success) {
            return res.status(500).json({ error: 'Failed to update host in dataservice' });
        }

        const updatedHost = response.data.host;
        const idx = findHostIndexById(id);
        if (idx > -1) {
            hosts[idx] = updatedHost;
        } else {
            hosts.push(updatedHost);
        }

        const reqAny = req as any;
        if (reqAny.user?.username) {
            logActivity(reqAny.user.username, 'UPDATE', 'HOST', updatedHost.hostname, { id, ...partialUpdate }).catch(console.error);
        }

        emitNotification({
            type: 'success',
            message: `Host ${updatedHost.hostname} aggiornato`,
            resource: 'host',
            action: 'update',
            actor: (req as any).user?.username || 'system'
        });

        return res.json({ success: true, host: updatedHost });
    } catch (err: any) {
        const status = err.response?.status;
        if (status === 404) {
            return res.status(404).json({ error: 'Host not found' });
        }
        if (status === 409) {
            return res.status(409).json({ error: err.response.data?.error || 'Host conflict' });
        }
        console.error("Error updating host in dataservice:", err?.message || err);
        res.status(500).json({ error: 'Error communicating with dataservice' });
    }
});

export default router;
