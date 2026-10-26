import express, { Router, Request, Response } from 'express';
import axios from 'axios';
import { CveImportFormatError, parseCveImportCsv } from '../services/cveImport';
import { buildCveExportCsv } from '../services/cveExport';
import { CveEnrichableField, enrichPayload, missingFieldsFrom, needsEnrichment } from '../services/cveEnrich';
import { CveNotFoundError, fetchCveDetails } from '../services/cveSearch';
import { logActivity } from '../utils/logger';
import { emitNotification } from '../services/notificationBroadcast';

const router = Router();
const DATASERVICE_URL = process.env.DATASERVICE_URL || 'http://localhost:9992';

/** Dimensione pagina e limite di righe per l'export CSV. */
const EXPORT_PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS = 50000;
/** Numero massimo di CVE completabili da cve-search in una singola richiesta. */
const MAX_ENRICH_IDS = 100;

const LIST_QUERY_PARAMS = [
    'stato', 'search', 'severita', 'impattato', 'motivo_attesa', 'esito', 'stato_ticket', 'flagged', 'date_field', 'from', 'to', 'sortBy', 'sortOrder', 'page', 'pageSize'
];

function actorOf(req: Request): string {
    return (req as any).user?.username || 'system';
}

/** Header con l'utente che effettua la modifica (usato dal dataservice per lo storico motivo attesa). */
function actorHeaders(req: Request): Record<string, string> {
    return { 'X-Actor': actorOf(req) };
}

function pickListParams(query: Request['query']): Record<string, string> {
    const params: Record<string, string> = {};
    for (const key of LIST_QUERY_PARAMS) {
        const value = query[key];
        if (typeof value === 'string' && value !== '') params[key] = value;
    }
    return params;
}

function parseId(raw: string): number | null {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
}

/** Inoltra al client gli errori applicativi (4xx) del dataservice, altrimenti 500. */
function forwardError(res: Response, err: any, fallback: string) {
    const status = err.response?.status;
    if (status && status >= 400 && status < 500) {
        return res.status(status).json(err.response.data || { error: fallback });
    }
    console.error(`${fallback}:`, err.response?.data || err.message);
    return res.status(500).json({ error: fallback });
}

/**
 * @openapi
 * /api/cves:
 *   get:
 *     tags: [CVE]
 *     summary: Elenco CVE tracciate dal SOC (filtrato e paginato lato server)
 *     description: Usare `stato=IN_ANALISI` per le CVE in carico e `stato=ARCHIVIATA` per lo storico.
 *     parameters:
 *       - { in: query, name: stato, schema: { type: string, enum: [IN_ANALISI, ARCHIVIATA] } }
 *       - { in: query, name: search, schema: { type: string }, description: 'Ricerca su problem ID, CVE, prodotto, riepilogo, note, motivo attesa, esito, errata' }
 *       - { in: query, name: severita, schema: { type: string }, description: 'CRITICAL,HIGH,MEDIUM,LOW,NONE derivate dallo score (separati da virgola)' }
 *       - { in: query, name: stato_ticket, schema: { type: string }, description: 'Stato del problem sul sito (separati da virgola)' }
 *       - { in: query, name: impattato, schema: { type: string }, description: 'SI,NO,DA_VERIFICARE (separati da virgola)' }
 *       - { in: query, name: motivo_attesa, schema: { type: string }, description: 'Separati da virgola' }
 *       - { in: query, name: esito, schema: { type: string }, description: 'Separati da virgola (VULN_CLIENT, APP_NON_PRESENTE, PROSSIMO_PATCHING, NON_IMPATTANTE, NON_IN_CARICO_SOC, ALTRO). ALTRO = tutte le motivazioni custom/non standard' }
 *       - { in: query, name: flagged, schema: { type: boolean }, description: 'true = solo problem flaggati da girare post-riunione' }
 *       - { in: query, name: date_field, schema: { type: string, enum: [data_inoltro, data_archiviazione, ultima_revisione] }, description: 'Colonna data filtrata da from/to (default data_inoltro)' }
 *       - { in: query, name: from, schema: { type: string, format: date }, description: 'date_field >= from' }
 *       - { in: query, name: to, schema: { type: string, format: date }, description: 'date_field <= to' }
 *       - { in: query, name: sortBy, schema: { type: string } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: pageSize, schema: { type: integer } }
 *     responses:
 *       '200':
 *         description: Pagina di CVE
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items: { type: array, items: { $ref: '#/components/schemas/Cve' } }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 pageSize: { type: integer }
 *                 totalPages: { type: integer }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/', async (req, res) => {
    try {
        const response = await axios.get(`${DATASERVICE_URL}/data/cves`, { params: pickListParams(req.query) });
        const { items, total, page, pageSize } = response.data;
        res.json({ items, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil((total || 0) / pageSize) : 0 });
    } catch (err: any) {
        forwardError(res, err, 'Failed to fetch CVEs');
    }
});

/**
 * @openapi
 * /api/cves/stats:
 *   get:
 *     tags: [CVE]
 *     summary: Conteggio CVE in analisi e archiviate
 *     responses:
 *       '200':
 *         description: Conteggi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inAnalisi: { type: integer, example: 12 }
 *                 archiviate: { type: integer, example: 340 }
 *                 total: { type: integer, example: 352 }
 */
router.get('/stats', async (req, res) => {
    try {
        const response = await axios.get(`${DATASERVICE_URL}/data/cves/stats`);
        res.json(response.data);
    } catch (err: any) {
        forwardError(res, err, 'Failed to fetch CVE stats');
    }
});

/**
 * @openapi
 * /api/cves/bulk/status:
 *   put:
 *     tags: [CVE]
 *     summary: Archivia / riporta in analisi / aggiorna motivo attesa / flagga piu CVE (es. durante e dopo la riunione)
 *     description: Almeno uno tra stato, esito, motivo_attesa, ultima_revisione e flagged e obbligatorio. I cambi di motivo attesa finiscono nello storico.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids: { type: array, items: { type: integer }, example: [1, 2, 3] }
 *               stato: { type: string, enum: [IN_ANALISI, ARCHIVIATA] }
 *               esito: { type: string, nullable: true, example: NON_IMPATTANTE, description: 'Codice standard o motivazione custom (Altro)' }
 *               motivo_attesa: { type: string, nullable: true, example: 'In attesa patch vendor' }
 *               ultima_revisione: { type: string, nullable: true, example: '2026-10-22' }
 *               flagged: { type: boolean, example: true }
 *     responses:
 *       '200':
 *         description: CVE aggiornate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 updated: { type: integer }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put('/bulk/status', async (req, res) => {
    try {
        const response = await axios.put(`${DATASERVICE_URL}/data/cves/bulk/status`, req.body, { headers: actorHeaders(req) });
        const actor = actorOf(req);
        const stato = req.body?.stato;
        let verb = 'aggiornate';
        if (stato === 'ARCHIVIATA') verb = 'archiviate';
        else if (stato === 'IN_ANALISI' && req.body?.esito === null) verb = 'riportate in analisi';
        logActivity(actor, 'BULK_UPDATE', 'CVE', `${response.data.updated} CVE`, req.body);
        emitNotification({
            type: 'info',
            message: `${response.data.updated} CVE ${verb}`,
            resource: 'cve',
            action: 'bulk_update',
            actor
        });
        res.json(response.data);
    } catch (err: any) {
        forwardError(res, err, 'Failed to update CVEs');
    }
});

/**
 * @openapi
 * /api/cves/import:
 *   post:
 *     tags: [CVE]
 *     summary: Importa i problem/CVE dall'export CSV di ITSM
 *     description: |
 *       Il corpo della richiesta e il contenuto del file CSV (separatore `;`, `,` o tab; campi tra virgolette ammessi, anche multilinea).
 *       Intestazioni: `ID problema*+`, `Data ultima modifica`, `Data inoltro`, `Riepilogo*`, `Stato*`, `Note`.
 *       Le date sono nel formato ITSM `gg/mm/aaaa hh.mm.ss`. Il Riepilogo deve contenere l'ID CVE
 *       (es. `Vulnerabilità - CVE-2026-69397 - Microsoft OpenSSH per Windows`).
 *       Upsert per ID problema: Stato `Pendente` -> problem attivo (de-archiviato se necessario), altrimenti archiviato.
 *     requestBody:
 *       required: true
 *       content:
 *         text/csv:
 *           schema:
 *             type: string
 *             example: "ID problema*+;Data ultima modifica;Data inoltro;Riepilogo*;Stato*;Note\nPBI00000002751;22/10/2026 13.43.04;22/10/2026 13.25.05;Vulnerabilità - CVE-2026-69397 - Microsoft OpenSSH per Windows;Pendente;\"Buongiorno, con la presente...\""
 *     responses:
 *       '200':
 *         description: Esito import (righe scartate in `errors`)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CveImportResult' }
 *       '400':
 *         description: File non valido (colonne obbligatorie mancanti, nessuna riga valida...)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error: { type: string }
 *                 errors: { type: array, items: { type: object } }
 */
router.post('/import', express.text({ type: ['text/csv', 'text/plain', 'application/csv'], limit: '10mb' }), async (req, res) => {
    if (typeof req.body !== 'string') {
        return res.status(400).json({ error: 'Il contenuto deve essere inviato come text/csv' });
    }
    let parsed;
    try {
        parsed = parseCveImportCsv(req.body);
    } catch (err: any) {
        if (err instanceof CveImportFormatError) return res.status(400).json({ error: err.message });
        console.error('Failed to parse CVE CSV:', err);
        return res.status(400).json({ error: 'File CSV non valido' });
    }
    if (parsed.rows.length === 0) {
        return res.status(400).json({ error: 'Nessuna riga valida da importare', errors: parsed.errors });
    }
    try {
        const response = await axios.post(`${DATASERVICE_URL}/data/cves/import`, { rows: parsed.rows }, { headers: actorHeaders(req) });
        const data = response.data;
        const errors = [...parsed.errors, ...(data.errors || [])].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
        const result = { ...data, skipped: errors.length, errors };
        const actor = actorOf(req);
        logActivity(actor, 'IMPORT', 'CVE', `${data.imported} problem`, {
            created: data.created, updated: data.updated, reopened: data.reopened, archived: data.archived, skipped: errors.length
        });
        emitNotification({
            type: 'success',
            message: `Import CVE: ${data.created} nuove, ${data.updated + data.reopened + data.archived} aggiornate${errors.length ? `, ${errors.length} scartate` : ''}`,
            resource: 'cve',
            action: 'bulk_update',
            actor
        });
        res.json(result);
    } catch (err: any) {
        forwardError(res, err, 'Failed to import CVEs');
    }
});

/**
 * @openapi
 * /api/cves/export:
 *   get:
 *     tags: [CVE]
 *     summary: Esporta in CSV i problem/CVE in analisi o archiviati
 *     description: |
 *       Accetta gli stessi filtri di `GET /api/cves` (paginazione esclusa) ed esporta tutte le righe corrispondenti
 *       (max 50000). Separatore `;`, codifica UTF-8 con BOM. Le prime colonne coincidono con il template di import
 *       (`ID problema*+`, `Data ultima modifica`, `Data inoltro`, `Riepilogo*`, `Stato*`, `Note`), seguono CVE, Vendor,
 *       Prodotto, Score, Impatto, Sezione, Motivo attesa, Ultima revisione, Esito, Data archiviazione, Flag.
 *     parameters:
 *       - { in: query, name: stato, schema: { type: string, enum: [IN_ANALISI, ARCHIVIATA] } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: severita, schema: { type: string } }
 *       - { in: query, name: impattato, schema: { type: string } }
 *       - { in: query, name: esito, schema: { type: string } }
 *       - { in: query, name: flagged, schema: { type: boolean } }
 *       - { in: query, name: date_field, schema: { type: string, enum: [data_inoltro, data_archiviazione, ultima_revisione] } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: sortBy, schema: { type: string } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       '200':
 *         description: File CSV
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *       '400':
 *         description: Troppe righe da esportare
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/export', async (req, res) => {
    const params: Record<string, string | number> = pickListParams(req.query);
    delete params.page;
    params.pageSize = EXPORT_PAGE_SIZE;
    try {
        const items: any[] = [];
        let total = 0;
        for (let page = 1; ; page++) {
            const response = await axios.get(`${DATASERVICE_URL}/data/cves`, { params: { ...params, page } });
            total = response.data.total || 0;
            if (total > MAX_EXPORT_ROWS) {
                return res.status(400).json({ error: `Troppe righe da esportare (${total}, massimo ${MAX_EXPORT_ROWS}): restringi i filtri` });
            }
            const pageItems: any[] = response.data.items || [];
            items.push(...pageItems);
            if (pageItems.length < EXPORT_PAGE_SIZE || items.length >= total) break;
        }
        const section = params.stato === 'ARCHIVIATA' ? 'archiviate' : params.stato === 'IN_ANALISI' ? 'in-analisi' : 'tutte';
        const date = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="cve-${section}-${date}.csv"`);
        res.send(buildCveExportCsv(items));
    } catch (err: any) {
        forwardError(res, err, 'Failed to export CVEs');
    }
});

/**
 * @openapi
 * /api/cves/enrich:
 *   post:
 *     tags: [CVE]
 *     summary: Completa i campi mancanti (vendor, prodotto, score) delle CVE indicate tramite cve-search
 *     description: |
 *       Per ogni CVE vengono valorizzati solo i campi vuoti; i valori gia presenti non vengono mai sovrascritti.
 *       Massimo 100 CVE per richiesta.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids: { type: array, items: { type: integer }, example: [1, 2] }
 *     responses:
 *       '200':
 *         description: Esito per CVE
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CveEnrichResult' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/enrich', async (req, res) => {
    const rawIds = req.body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) return res.status(400).json({ error: 'ids must be a non-empty array' });
    if (rawIds.length > MAX_ENRICH_IDS) return res.status(400).json({ error: `Massimo ${MAX_ENRICH_IDS} CVE per richiesta` });
    const ids = [...new Set(rawIds.map((v: unknown) => parseId(String(v))))];
    if (ids.some(id => id === null)) return res.status(400).json({ error: 'ids must contain positive integers' });

    const result = { updated: 0, unchanged: 0, notFound: 0, failed: 0, items: [] as any[] };
    const detailsCache = new Map<string, Promise<any>>();
    for (const id of ids as number[]) {
        let cve: any;
        try {
            cve = (await axios.get(`${DATASERVICE_URL}/data/cves/${id}`)).data;
        } catch (err: any) {
            if (err.response?.status === 404) {
                result.failed++;
                result.items.push({ id, cve_id: null, filled: [], error: 'CVE non trovata' });
                continue;
            }
            return forwardError(res, err, 'Failed to enrich CVEs');
        }
        if (!needsEnrichment(cve)) {
            result.unchanged++;
            result.items.push({ id, cve_id: cve.cve_id, filled: [] });
            continue;
        }
        try {
            if (!detailsCache.has(cve.cve_id)) detailsCache.set(cve.cve_id, fetchCveDetails(cve.cve_id));
            const changes = missingFieldsFrom(cve, await detailsCache.get(cve.cve_id));
            const filled = Object.keys(changes) as CveEnrichableField[];
            if (filled.length === 0) {
                result.unchanged++;
            } else {
                await axios.put(`${DATASERVICE_URL}/data/cves/${id}`, changes, { headers: actorHeaders(req) });
                result.updated++;
            }
            result.items.push({ id, cve_id: cve.cve_id, filled });
        } catch (err: any) {
            const notFound = err instanceof CveNotFoundError;
            if (notFound) result.notFound++;
            else result.failed++;
            if (!notFound) console.error(`cve-search enrichment failed for ${cve.cve_id}:`, err.response?.data || err.message);
            result.items.push({ id, cve_id: cve.cve_id, filled: [], error: notFound ? 'CVE non presente su cve-search' : 'Servizio cve-search non raggiungibile' });
        }
    }

    if (result.updated > 0) {
        const actor = actorOf(req);
        logActivity(actor, 'BULK_UPDATE', 'CVE', `${result.updated} CVE completate da cve-search`, { ids });
        emitNotification({
            type: 'info',
            message: `${result.updated} CVE completate con i dati di cve-search`,
            resource: 'cve',
            action: 'bulk_update',
            actor
        });
    }
    res.json(result);
});

/**
 * @openapi
 * /api/cves/{id}/history:
 *   get:
 *     tags: [CVE]
 *     summary: Storico dei motivi di attesa di una CVE (dal piu recente)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       '200':
 *         description: Storico
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/CveMotivoHistory' }
 *       '404':
 *         description: CVE non trovata
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id/history', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
        const response = await axios.get(`${DATASERVICE_URL}/data/cves/${id}/history`);
        res.json(response.data);
    } catch (err: any) {
        forwardError(res, err, 'Failed to fetch CVE history');
    }
});

/**
 * @openapi
 * /api/cves/{id}:
 *   get:
 *     tags: [CVE]
 *     summary: Dettaglio CVE tracciata
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       '200':
 *         description: CVE
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Cve' }
 *       '404':
 *         description: CVE non trovata
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
        const response = await axios.get(`${DATASERVICE_URL}/data/cves/${id}`);
        res.json(response.data);
    } catch (err: any) {
        forwardError(res, err, 'Failed to fetch CVE');
    }
});

/**
 * @openapi
 * /api/cves:
 *   post:
 *     tags: [CVE]
 *     summary: Aggiunge una CVE al tracciamento (stato iniziale IN_ANALISI)
 *     description: Vendor, prodotto e score non indicati vengono completati (best effort) con i dati di cve-search.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Cve' }
 *     responses:
 *       '201':
 *         description: CVE creata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 cve: { $ref: '#/components/schemas/Cve' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '409':
 *         description: Problem ID gia tracciato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/', async (req, res) => {
    try {
        // Completa (best effort) vendor/prodotto/score mancanti con i dati di cve-search
        const { payload } = await enrichPayload(req.body || {});
        const response = await axios.post(`${DATASERVICE_URL}/data/cves`, payload, { headers: actorHeaders(req) });
        const actor = actorOf(req);
        const cveId = response.data.cve?.problem_id || response.data.cve?.cve_id || req.body?.cve_id;
        logActivity(actor, 'CREATE', 'CVE', cveId, req.body);
        emitNotification({ type: 'success', message: `CVE ${cveId} aggiunta`, resource: 'cve', action: 'create', actor });
        res.status(201).json(response.data);
    } catch (err: any) {
        forwardError(res, err, 'Failed to create CVE');
    }
});

/**
 * @openapi
 * /api/cves/{id}:
 *   put:
 *     tags: [CVE]
 *     summary: Aggiorna una CVE (anche cambio stato IN_ANALISI / ARCHIVIATA)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Cve' }
 *     responses:
 *       '200':
 *         description: CVE aggiornata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 cve: { $ref: '#/components/schemas/Cve' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: CVE non trovata
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
        const response = await axios.put(`${DATASERVICE_URL}/data/cves/${id}`, req.body, { headers: actorHeaders(req) });
        const actor = actorOf(req);
        const cveId = response.data.cve?.problem_id || response.data.cve?.cve_id || String(id);
        logActivity(actor, 'UPDATE', 'CVE', cveId, req.body);
        emitNotification({ type: 'success', message: `CVE ${cveId} aggiornata`, resource: 'cve', action: 'update', actor });
        res.json(response.data);
    } catch (err: any) {
        forwardError(res, err, 'Failed to update CVE');
    }
});

/**
 * @openapi
 * /api/cves/{id}:
 *   delete:
 *     tags: [CVE]
 *     summary: Rimuove una CVE dal tracciamento
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       '200':
 *         description: CVE eliminata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *       '404':
 *         description: CVE non trovata
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
        const response = await axios.delete(`${DATASERVICE_URL}/data/cves/${id}`);
        const actor = actorOf(req);
        logActivity(actor, 'DELETE', 'CVE', String(id));
        emitNotification({ type: 'warning', message: `CVE ${id} eliminata`, resource: 'cve', action: 'delete', actor });
        res.json(response.data);
    } catch (err: any) {
        forwardError(res, err, 'Failed to delete CVE');
    }
});

export default router;
