import { Router } from 'express';
import { getDb, runInTransaction } from './db';
import { CVE_ESITI_STANDARD, CVE_ESITO_ALTRO, DEFAULT_MOTIVO_ATTESA, extractCveId, extractProduct, nowLocalIso, todayLocal } from './cveUtils';

const router = Router();

export const CVE_STATI = ['IN_ANALISI', 'ARCHIVIATA'] as const;

/** Colonne modificabili dal client (whitelist anti SQL-injection). */
const CVE_WRITABLE_COLUMNS = [
    'problem_id',
    'cve_id',
    'data_inoltro',
    'data_ultima_modifica',
    'stato_ticket',
    'note',
    'riferimenti',
    'errata',
    'score',
    'cve_origin',
    'prodotto',
    'vendor',
    'stato',
    'motivo_attesa',
    'esito',
    'impattato',
    'asset_impattati',
    'ultima_revisione',
    'data_archiviazione',
    'flagged'
] as const;

const CVE_SORTABLE_COLUMNS = new Set([
    'problem_id', 'cve_id', 'score', 'data_inoltro', 'data_ultima_modifica', 'stato_ticket',
    'ultima_revisione', 'data_archiviazione', 'updated_at', 'created_at', 'flagged', 'motivo_attesa', 'prodotto', 'vendor'
]);

/** Colonne data filtrabili con from/to. */
const CVE_DATE_FILTER_COLUMNS = new Set(['data_inoltro', 'data_archiviazione', 'ultima_revisione']);

/** Lunghezza massima dei campi testuali liberi del workflow (motivo attesa / esito). */
const MAX_REASON_LENGTH = 1000;

/** Fasce CVSS v3 usate per derivare la severita dallo score. */
const SEVERITY_SCORE_RANGES: Record<string, [number, number]> = {
    CRITICAL: [9, 10.01],
    HIGH: [7, 9],
    MEDIUM: [4, 7],
    LOW: [0, 4]
};

/** Accetta numeri o stringhe tipo "Base Score: 7.8" (formato Excel). */
function parseScore(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value;
    const match = /(\d+(?:[.,]\d+)?)/.exec(String(value));
    return match ? Number(match[1].replace(',', '.')) : Number.NaN;
}

const CVE_ID_REGEX = /^CVE-\d{4}-\d{4,}$/;

class ValidationError extends Error { }

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function hasOwn(obj: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeCvePayload(body: any, partial: boolean): Record<string, any> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ValidationError('Invalid payload');
    }
    const data: Record<string, any> = {};
    for (const col of CVE_WRITABLE_COLUMNS) {
        if (hasOwn(body, col)) {
            const value = body[col];
            data[col] = value === '' || value === undefined ? null : value;
        }
    }

    if (data.cve_id !== undefined && data.cve_id !== null) {
        data.cve_id = String(data.cve_id).trim().toUpperCase();
    }
    if (typeof data.problem_id === 'string') {
        data.problem_id = data.problem_id.trim() || null;
    }
    if (!partial && !data.cve_id) {
        throw new ValidationError('cve_id is required');
    }
    if (hasOwn(data, 'cve_id') && !CVE_ID_REGEX.test(data.cve_id ?? '')) {
        throw new ValidationError('cve_id must match CVE-YYYY-NNNN');
    }
    if (hasOwn(data, 'stato')) {
        if (!CVE_STATI.includes(data.stato)) {
            throw new ValidationError(`stato must be one of ${CVE_STATI.join(', ')}`);
        }
    } else if (!partial) {
        data.stato = 'IN_ANALISI';
    }
    for (const key of ['motivo_attesa', 'esito', 'prodotto', 'vendor'] as const) {
        if (typeof data[key] === 'string') {
            data[key] = data[key].trim() || null;
            if (data[key] && data[key].length > MAX_REASON_LENGTH) {
                throw new ValidationError(`${key} must be at most ${MAX_REASON_LENGTH} characters`);
            }
        }
    }
    if (hasOwn(data, 'flagged')) {
        data.flagged = [true, 1, '1', 'true'].includes(data.flagged) ? 1 : 0;
    }
    if (!partial && !hasOwn(data, 'motivo_attesa') && data.stato === 'IN_ANALISI') {
        data.motivo_attesa = DEFAULT_MOTIVO_ATTESA;
    }
    if (hasOwn(data, 'score')) {
        const n = parseScore(data.score);
        if (n !== null && (Number.isNaN(n) || n < 0 || n > 10)) {
            throw new ValidationError('score must be a number between 0 and 10');
        }
        data.score = n;
    }
    for (const key of Object.keys(data)) {
        if (data[key] !== null && typeof data[key] === 'object') {
            throw new ValidationError(`Invalid value for ${key}`);
        }
    }
    return data;
}

function applyStatusSideEffects(data: Record<string, any>, previousStato?: string): void {
    if (data.stato === 'ARCHIVIATA' && previousStato !== 'ARCHIVIATA') {
        if (!data.data_archiviazione) data.data_archiviazione = nowLocalIso();
        // Il flag segnala i problem da girare post-riunione: una volta archiviati non serve piu
        data.flagged = 0;
    }
    if (data.stato === 'IN_ANALISI' && previousStato === 'ARCHIVIATA') {
        data.data_archiviazione = null;
    }
}

/**
 * Se il motivo attesa cambia rispetto al valore precedente aggiorna la data di revisione
 * e restituisce il nuovo motivo da registrare nello storico (altrimenti null).
 */
function prepareMotivoChange(data: Record<string, any>, previous?: { motivo_attesa?: string | null, ultima_revisione?: string | null } | null): string | null {
    if (!hasOwn(data, 'motivo_attesa') || !data.motivo_attesa) return null;
    if (data.motivo_attesa === (previous?.motivo_attesa ?? null)) return null;
    // La revisione si aggiorna a oggi salvo data esplicitamente diversa da quella gia salvata
    if (!data.ultima_revisione || data.ultima_revisione === (previous?.ultima_revisione ?? null)) {
        data.ultima_revisione = todayLocal();
    }
    return data.motivo_attesa;
}

async function insertMotivoHistory(cveRef: number, motivo: string, actor: string | null): Promise<void> {
    await getDb().run(
        'INSERT INTO cve_motivo_history (cve_ref, motivo_attesa, data_cambio, utente) VALUES (?, ?, ?, ?)',
        [cveRef, motivo, nowLocalIso(), actor]
    );
}

/** Utente che ha richiesto la modifica (inoltrato dal back-end). */
function actorOf(req: any): string | null {
    const actor = req.get?.('x-actor');
    return typeof actor === 'string' && actor.trim() ? actor.trim().slice(0, 200) : null;
}

function handleError(res: any, err: any, fallback: string) {
    if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
    }
    if (typeof err?.message === 'string' && err.message.includes('UNIQUE constraint failed: cves.problem_id')) {
        return res.status(409).json({ error: 'Problem ID already tracked' });
    }
    console.error(err);
    return res.status(500).json({ error: fallback });
}

function buildListQuery(query: Record<string, any>): { where: string; params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];

    const stato = typeof query.stato === 'string' ? query.stato.toUpperCase() : '';
    if (stato) {
        if (!(CVE_STATI as readonly string[]).includes(stato)) {
            throw new ValidationError(`stato must be one of ${CVE_STATI.join(', ')}`);
        }
        clauses.push('stato = ?');
        params.push(stato);
    }

    const search = typeof query.search === 'string' ? query.search.trim() : '';
    if (search) {
        const like = `%${search.toLowerCase()}%`;
        const searchable = ['problem_id', 'cve_id', 'prodotto', 'vendor', 'cve_origin', 'note', 'motivo_attesa', 'esito', 'errata'];
        clauses.push(`(${searchable.map(c => `LOWER(IFNULL(${c}, '')) LIKE ?`).join(' OR ')})`);
        params.push(...searchable.map(() => like));
    }

    if (typeof query.severita === 'string' && query.severita.trim()) {
        const ranges: string[] = [];
        for (const sev of query.severita.split(',').map((v: string) => v.trim().toUpperCase())) {
            if (sev === 'NONE') {
                ranges.push('(score IS NULL OR score <= 0)');
            } else if (sev === 'LOW') {
                ranges.push('(score > 0 AND score < ?)');
                params.push(SEVERITY_SCORE_RANGES.MEDIUM[0]);
            } else if (SEVERITY_SCORE_RANGES[sev]) {
                ranges.push('(score >= ? AND score < ?)');
                params.push(...SEVERITY_SCORE_RANGES[sev]);
            }
        }
        if (ranges.length) clauses.push(`(${ranges.join(' OR ')})`);
    }

    if (typeof query.esito === 'string' && query.esito.trim()) {
        const values = query.esito.split(',').map((v: string) => v.trim()).filter(Boolean);
        const standard = values.filter((v: string) => v !== CVE_ESITO_ALTRO);
        const parts: string[] = [];
        if (standard.length) {
            parts.push(`IFNULL(esito, '') IN (${standard.map(() => '?').join(', ')})`);
            params.push(...standard);
        }
        if (values.includes(CVE_ESITO_ALTRO)) {
            // "Altro" = tutte le motivazioni che non rientrano negli esiti standard
            parts.push(`IFNULL(esito, '') NOT IN (${CVE_ESITI_STANDARD.map(() => '?').join(', ')})`);
            params.push(...CVE_ESITI_STANDARD);
        }
        if (parts.length) clauses.push(`(${parts.join(' OR ')})`);
    }

    const flagged = typeof query.flagged === 'string' ? query.flagged.toLowerCase() : '';
    if (flagged === 'true' || flagged === '1') clauses.push('flagged = 1');
    else if (flagged === 'false' || flagged === '0') clauses.push('IFNULL(flagged, 0) = 0');

    for (const field of ['impattato', 'motivo_attesa', 'stato_ticket'] as const) {
        const raw = query[field];
        if (typeof raw !== 'string' || !raw.trim()) continue;
        const values = raw.split(',').map(v => v.trim()).filter(Boolean);
        if (values.length === 0) continue;
        clauses.push(`IFNULL(${field}, '') IN (${values.map(() => '?').join(', ')})`);
        params.push(...values);
    }

    const dateField = typeof query.date_field === 'string' && query.date_field ? query.date_field : 'data_inoltro';
    if (!CVE_DATE_FILTER_COLUMNS.has(dateField)) {
        throw new ValidationError(`date_field must be one of ${[...CVE_DATE_FILTER_COLUMNS].join(', ')}`);
    }
    for (const [key, op] of [['from', '>='], ['to', '<=']] as const) {
        const value = query[key];
        if (typeof value !== 'string' || !value) continue;
        if (!ISO_DATE_REGEX.test(value)) {
            throw new ValidationError(`${key} must be a date in YYYY-MM-DD format`);
        }
        clauses.push(`substr(${dateField}, 1, 10) ${op} ?`);
        params.push(value);
    }

    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/**
 * @openapi
 * /data/cves:
 *   get:
 *     tags: [CVE]
 *     summary: Elenco CVE tracciate (filtrato e paginato)
 *     parameters:
 *       - { in: query, name: stato, schema: { type: string, enum: [IN_ANALISI, ARCHIVIATA] } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: severita, schema: { type: string }, description: 'CRITICAL,HIGH,MEDIUM,LOW,NONE derivate dallo score (separati da virgola)' }
 *       - { in: query, name: stato_ticket, schema: { type: string }, description: 'Stato sul sito (es. Pendente, In analisi), separati da virgola' }
 *       - { in: query, name: impattato, schema: { type: string }, description: 'Valori separati da virgola' }
 *       - { in: query, name: motivo_attesa, schema: { type: string }, description: 'Valori separati da virgola' }
 *       - { in: query, name: esito, schema: { type: string }, description: 'Valori separati da virgola. ALTRO = tutte le motivazioni non standard' }
 *       - { in: query, name: flagged, schema: { type: boolean }, description: 'true = solo problem flaggati, false = solo non flaggati' }
 *       - { in: query, name: date_field, schema: { type: string, enum: [data_inoltro, data_archiviazione, ultima_revisione] }, description: 'Colonna data usata da from/to (default data_inoltro)' }
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
 *                 items: { type: array, items: { $ref: '#/components/schemas/CveRecord' } }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 pageSize: { type: integer }
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/', async (req, res) => {
    const db = getDb();
    try {
        const { where, params } = buildListQuery(req.query as Record<string, any>);
        const page = Math.max(1, Number.parseInt(req.query.page as string, 10) || 1);
        const pageSize = Math.min(1000, Math.max(1, Number.parseInt(req.query.pageSize as string, 10) || 50));
        const sortBy = [...CVE_SORTABLE_COLUMNS].find(col => col === req.query.sortBy) ?? 'data_inoltro';
        const sortOrder = String(req.query.sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const countRow = await db.get(`SELECT COUNT(*) as total FROM cves ${where}`, params);
        const rows = await db.all(
            `SELECT * FROM cves ${where} ORDER BY ${sortBy} IS NULL, ${sortBy} ${sortOrder}, cve_id DESC LIMIT ? OFFSET ?`,
            [...params, pageSize, (page - 1) * pageSize]
        );
        res.json({ items: rows, total: countRow?.total ?? 0, page, pageSize });
    } catch (err) {
        handleError(res, err, 'Failed to fetch CVEs');
    }
});

/**
 * @openapi
 * /data/cves/stats:
 *   get:
 *     tags: [CVE]
 *     summary: Conteggi CVE per stato
 *     responses:
 *       '200':
 *         description: Conteggi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inAnalisi: { type: integer }
 *                 archiviate: { type: integer }
 *                 total: { type: integer }
 */
router.get('/stats', async (req, res) => {
    const db = getDb();
    try {
        const rows = await db.all(`SELECT stato, COUNT(*) as count FROM cves GROUP BY stato`);
        const byStato = Object.fromEntries(rows.map((r: any) => [r.stato, r.count]));
        const inAnalisi = byStato['IN_ANALISI'] || 0;
        const archiviate = byStato['ARCHIVIATA'] || 0;
        res.json({ inAnalisi, archiviate, total: inAnalisi + archiviate });
    } catch (err) {
        handleError(res, err, 'Failed to fetch CVE stats');
    }
});

/**
 * @openapi
 * /data/cves/bulk/status:
 *   put:
 *     tags: [CVE]
 *     summary: Aggiorna stato / esito / motivo attesa / flag di piu CVE in un'unica transazione
 *     description: Ogni cambio di motivo attesa viene registrato nello storico. L'archiviazione rimuove il flag.
 *     parameters:
 *       - { in: header, name: X-Actor, schema: { type: string }, description: Utente che effettua la modifica (per lo storico) }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids: { type: array, items: { type: integer } }
 *               stato: { type: string, enum: [IN_ANALISI, ARCHIVIATA] }
 *               esito: { type: string, nullable: true }
 *               motivo_attesa: { type: string, nullable: true }
 *               ultima_revisione: { type: string, nullable: true }
 *               flagged: { type: boolean }
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
        const { ids, ...rest } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id: any) => Number.isInteger(id))) {
            throw new ValidationError('ids must be a non-empty array of integers');
        }
        const allowed: Record<string, any> = {};
        for (const key of ['stato', 'esito', 'motivo_attesa', 'ultima_revisione', 'flagged']) {
            if (hasOwn(rest, key)) allowed[key] = rest[key];
        }
        const data = normalizeCvePayload(allowed, true);
        if (Object.keys(data).length === 0) throw new ValidationError('No fields to update');
        if (hasOwn(data, 'stato') && !data.stato) throw new ValidationError('stato cannot be null');
        const actor = actorOf(req);

        const updated = await runInTransaction(async () => {
            const db = getDb();
            let count = 0;
            for (const id of ids) {
                const existing = await db.get('SELECT stato, motivo_attesa, ultima_revisione FROM cves WHERE id = ?', [id]);
                if (!existing) continue;
                const rowData = { ...data };
                applyStatusSideEffects(rowData, existing.stato);
                const newMotivo = prepareMotivoChange(rowData, existing);
                const keys = Object.keys(rowData);
                await db.run(
                    `UPDATE cves SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [...keys.map(k => rowData[k]), id]
                );
                if (newMotivo) await insertMotivoHistory(id, newMotivo, actor);
                count++;
            }
            return count;
        });
        res.json({ success: true, updated });
    } catch (err) {
        handleError(res, err, 'Failed to update CVEs');
    }
});

/** Riga normalizzata proveniente dall'export ITSM (CSV). */
interface CveImportRow {
    line?: number;
    problem_id?: unknown;
    riepilogo?: unknown;
    data_inoltro?: unknown;
    data_ultima_modifica?: unknown;
    stato_ticket?: unknown;
    note?: unknown;
}

/** Numero massimo di righe accettate per singolo import. */
const MAX_IMPORT_ROWS = 5000;

function optionalText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' && typeof value !== 'number') throw new ValidationError('Invalid value type');
    const text = String(value).trim();
    return text || null;
}

function isPendente(statoTicket: string): boolean {
    return statoTicket.trim().toLowerCase() === 'pendente';
}

/**
 * @openapi
 * /data/cves/import:
 *   post:
 *     tags: [CVE]
 *     summary: Importa (upsert per problem ID) i problem esportati da ITSM
 *     description: |
 *       Ogni riga viene inserita o aggiornata in base al `problem_id`.
 *       Stato "Pendente" -> problem attivo (IN_ANALISI, eventualmente de-archiviato);
 *       qualsiasi altro stato -> problem archiviato. L'intero import avviene in un'unica transazione.
 *     parameters:
 *       - { in: header, name: X-Actor, schema: { type: string }, description: Utente che effettua l'import (per lo storico) }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rows]
 *             properties:
 *               rows:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/CveImportRow' }
 *     responses:
 *       '200':
 *         description: Esito import
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CveImportResult' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/import', async (req, res) => {
    try {
        const rows: CveImportRow[] = req.body?.rows;
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new ValidationError('rows must be a non-empty array');
        }
        if (rows.length > MAX_IMPORT_ROWS) {
            throw new ValidationError(`Too many rows (max ${MAX_IMPORT_ROWS})`);
        }
        const actor = actorOf(req);
        const today = todayLocal();
        const archivedAt = nowLocalIso();
        const errors: { line: number | null; problem_id: string | null; error: string }[] = [];
        const result = { created: 0, updated: 0, reopened: 0, archived: 0 };

        // Validazione preliminare: le righe non valide vengono scartate e riportate
        const valid = new Map<string, Record<string, any>>();
        rows.forEach((raw, index) => {
            const line = Number.isInteger(raw?.line) ? Number(raw.line) : index + 1;
            let problemId: string | null = null;
            try {
                if (!raw || typeof raw !== 'object') throw new ValidationError('Riga non valida');
                problemId = optionalText(raw.problem_id);
                const riepilogo = optionalText(raw.riepilogo);
                const statoTicket = optionalText(raw.stato_ticket);
                if (!problemId) throw new ValidationError('ID problema mancante');
                if (!riepilogo) throw new ValidationError('Riepilogo mancante');
                if (!statoTicket) throw new ValidationError('Stato mancante');
                const cveId = extractCveId(riepilogo);
                if (!cveId) throw new ValidationError('Nessun ID CVE (CVE-YYYY-NNNN) nel Riepilogo');
                // In caso di problem duplicati nel file vince l'ultima riga
                valid.set(problemId, {
                    problem_id: problemId,
                    cve_id: cveId,
                    cve_origin: riepilogo,
                    prodotto: extractProduct(riepilogo),
                    data_inoltro: optionalText(raw.data_inoltro),
                    data_ultima_modifica: optionalText(raw.data_ultima_modifica),
                    stato_ticket: statoTicket,
                    note: optionalText(raw.note)
                });
            } catch (err: any) {
                if (!(err instanceof ValidationError)) throw err;
                errors.push({ line, problem_id: problemId, error: err.message });
            }
        });

        await runInTransaction(async () => {
            const db = getDb();
            for (const row of valid.values()) {
                const active = isPendente(row.stato_ticket);
                const existing = await db.get('SELECT * FROM cves WHERE problem_id = ?', [row.problem_id]);
                const data: Record<string, any> = {};
                for (const key of Object.keys(row)) {
                    // I campi vuoti nel CSV non cancellano i dati gia presenti
                    if (row[key] !== null || !existing) data[key] = row[key];
                }
                let newMotivo: string | null = null;

                if (!existing) {
                    data.stato = active ? 'IN_ANALISI' : 'ARCHIVIATA';
                    if (active) {
                        data.motivo_attesa = DEFAULT_MOTIVO_ATTESA;
                        data.ultima_revisione = today;
                        newMotivo = DEFAULT_MOTIVO_ATTESA;
                    } else {
                        data.esito = `Stato ITSM: ${row.stato_ticket}`;
                        data.data_archiviazione = archivedAt;
                    }
                    const keys = Object.keys(data);
                    const inserted = await db.run(
                        `INSERT INTO cves (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
                        keys.map(k => data[k])
                    );
                    if (newMotivo && inserted.lastID) await insertMotivoHistory(inserted.lastID, newMotivo, actor);
                    result.created++;
                    continue;
                }

                if (active && existing.stato === 'ARCHIVIATA') {
                    // Problem archiviato tornato pendente su ITSM: de-archiviazione
                    data.stato = 'IN_ANALISI';
                    data.esito = null;
                    data.motivo_attesa = DEFAULT_MOTIVO_ATTESA;
                    data.flagged = 0;
                    data.ultima_revisione = today;
                    // La riapertura viene sempre tracciata nello storico, anche se il motivo era gia quello di default
                    newMotivo = DEFAULT_MOTIVO_ATTESA;
                    result.reopened++;
                } else if (!active && existing.stato !== 'ARCHIVIATA') {
                    data.stato = 'ARCHIVIATA';
                    data.esito = existing.esito || `Stato ITSM: ${row.stato_ticket}`;
                    result.archived++;
                } else {
                    result.updated++;
                }
                applyStatusSideEffects(data, existing.stato);
                const keys = Object.keys(data);
                await db.run(
                    `UPDATE cves SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [...keys.map(k => data[k]), existing.id]
                );
                if (newMotivo) await insertMotivoHistory(existing.id, newMotivo, actor);
            }
        });

        res.json({ success: true, ...result, imported: valid.size, skipped: errors.length, errors });
    } catch (err) {
        handleError(res, err, 'Failed to import CVEs');
    }
});

/**
 * @openapi
 * /data/cves/{id}/history:
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
    const db = getDb();
    try {
        const exists = await db.get('SELECT id FROM cves WHERE id = ?', [req.params.id]);
        if (!exists) return res.status(404).json({ error: 'CVE not found' });
        const rows = await db.all(
            'SELECT id, cve_ref, motivo_attesa, data_cambio, utente FROM cve_motivo_history WHERE cve_ref = ? ORDER BY data_cambio DESC, id DESC',
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        handleError(res, err, 'Failed to fetch CVE history');
    }
});

/**
 * @openapi
 * /data/cves/{id}:
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
 *             schema: { $ref: '#/components/schemas/CveRecord' }
 *       '404':
 *         description: CVE non trovata
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id', async (req, res) => {
    const db = getDb();
    try {
        const row = await db.get('SELECT * FROM cves WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'CVE not found' });
        res.json(row);
    } catch (err) {
        handleError(res, err, 'Failed to fetch CVE');
    }
});

/**
 * @openapi
 * /data/cves:
 *   post:
 *     tags: [CVE]
 *     summary: Inserisce una CVE da tracciare
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CveRecord' }
 *     responses:
 *       '201':
 *         description: CVE creata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 cve: { $ref: '#/components/schemas/CveRecord' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '409':
 *         description: Problem ID gia presente
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/', async (req, res) => {
    try {
        const data = normalizeCvePayload(req.body, false);
        applyStatusSideEffects(data);
        const newMotivo = prepareMotivoChange(data, null);
        const actor = actorOf(req);
        const cve = await runInTransaction(async () => {
            const db = getDb();
            const keys = Object.keys(data);
            const result = await db.run(
                `INSERT INTO cves (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
                keys.map(k => data[k])
            );
            if (newMotivo && result.lastID) await insertMotivoHistory(result.lastID, newMotivo, actor);
            return db.get('SELECT * FROM cves WHERE id = ?', [result.lastID]);
        });
        res.status(201).json({ success: true, cve });
    } catch (err) {
        handleError(res, err, 'Failed to create CVE');
    }
});

/**
 * @openapi
 * /data/cves/{id}:
 *   put:
 *     tags: [CVE]
 *     summary: Aggiorna una CVE tracciata (aggiornamento parziale)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CveRecord' }
 *     responses:
 *       '200':
 *         description: CVE aggiornata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 cve: { $ref: '#/components/schemas/CveRecord' }
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
    try {
        const data = normalizeCvePayload(req.body, true);
        const actor = actorOf(req);
        const cve = await runInTransaction(async () => {
            const db = getDb();
            const existing = await db.get('SELECT * FROM cves WHERE id = ?', [req.params.id]);
            if (!existing) return null;
            applyStatusSideEffects(data, existing.stato);
            const newMotivo = prepareMotivoChange(data, existing);
            const keys = Object.keys(data);
            if (keys.length > 0) {
                await db.run(
                    `UPDATE cves SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [...keys.map(k => data[k]), req.params.id]
                );
            }
            if (newMotivo) await insertMotivoHistory(existing.id, newMotivo, actor);
            return db.get('SELECT * FROM cves WHERE id = ?', [req.params.id]);
        });
        if (!cve) return res.status(404).json({ error: 'CVE not found' });
        res.json({ success: true, cve });
    } catch (err) {
        handleError(res, err, 'Failed to update CVE');
    }
});

/**
 * @openapi
 * /data/cves/{id}:
 *   delete:
 *     tags: [CVE]
 *     summary: Elimina una CVE tracciata
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
    try {
        const changes = await runInTransaction(async () => {
            await getDb().run('DELETE FROM cve_motivo_history WHERE cve_ref = ?', [req.params.id]);
            const result = await getDb().run('DELETE FROM cves WHERE id = ?', [req.params.id]);
            return result.changes ?? 0;
        });
        if (!changes) return res.status(404).json({ error: 'CVE not found' });
        res.json({ success: true });
    } catch (err) {
        handleError(res, err, 'Failed to delete CVE');
    }
});

export default router;
