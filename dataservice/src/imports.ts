import { Router } from 'express';
import { getDb, runInTransaction, getHostColumnNames, ACTIVE_HOST_SQL, hostProjection } from './db';
import { processOSUpdate, isConstraintError, buildHostInsertColumns, mergeOverrides } from './hostHelpers';

/**
 * Import massivo di host e siti (payload JSON gia' normalizzato dal back-end).
 *
 * Politica di conservazione dati: il DB ha la priorita'.
 * - Se esiste gia' un record con la stessa chiave naturale, vengono valorizzati SOLO i campi
 *   vuoti (NULL / stringa vuota) sul DB con i valori presenti nel file; i dati gia' presenti non vengono mai modificati.
 * - Se il record non esiste viene inserito.
 * L'intero import avviene in un'unica transazione con rollback in caso di errore imprevisto.
 */
const router = Router();

export const MAX_IMPORT_ROWS = 20000;

/** Colonne host importabili (os_major/os_minor sono derivati da os). */
export const HOST_IMPORT_COLUMNS = [
    'hostname', 'ambiente', 'servizio', 'applicazione', 'riferimento', 'company', 'appliance', 'zona',
    'riferimentoEs', 'locazione', 'os', 'manutenzione', 'nodo', 'note', 'pianificazione',
    'verContView', 'rfc', 'status', 'fixed', 'fixable', 'divisione',
    'ipfe', 'ipmgt', 'ipfe2al', 'vlfe', 'vlmgt', 'vlfe2al'
] as const;

/** Colonne sito importabili. */
export const SITE_IMPORT_COLUMNS = [
    'url_aliases', 'ambiente', 'servizio', 'porta', 'ip_reali', 'host_reali', 'nome_vip', 'note', 'tls_config'
] as const;

type ImportValue = string | number | null;
type ImportRow = Record<string, ImportValue>;

interface ImportRowError {
    index: number;
    error: string;
}

interface ImportResult {
    total: number;
    inserted: number;
    merged: number;
    unchanged: number;
    skipped: number;
    errors: ImportRowError[];
}

class RowValidationError extends Error {}

function isBlank(value: unknown): boolean {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/** Normalizza una riga: whitelist colonne, trim stringhe, booleani -> 0/1, scarta valori vuoti. */
function normalizeRow(raw: unknown, allowedColumns: readonly string[]): ImportRow {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new RowValidationError('Invalid row format');
    }
    const row: ImportRow = {};
    for (const column of allowedColumns) {
        const value = (raw as Record<string, unknown>)[column];
        if (value === undefined || value === null) continue;
        if (typeof value === 'boolean') {
            row[column] = value ? 1 : 0;
        } else if (typeof value === 'number') {
            if (!Number.isFinite(value)) throw new RowValidationError(`Invalid numeric value for ${column}`);
            row[column] = value;
        } else if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed !== '') row[column] = trimmed;
        } else {
            throw new RowValidationError(`Invalid value type for ${column}`);
        }
    }
    return row;
}

/** Restituisce i soli campi della riga che sul record esistente sono vuoti (merge con priorita' al DB). */
function computeMissingFields(existing: Record<string, unknown>, row: ImportRow, skip: Set<string>): ImportRow {
    const fill: ImportRow = {};
    for (const [key, value] of Object.entries(row)) {
        if (skip.has(key) || isBlank(value)) continue;
        if (isBlank(existing[key])) fill[key] = value;
    }
    return fill;
}

// Le transazioni SQLite condividono un'unica connessione: gli import vengono serializzati.
let importQueue: Promise<unknown> = Promise.resolve();

function enqueueImport<T>(work: () => Promise<T>): Promise<T> {
    const result = importQueue.then(work, work);
    importQueue = result.catch(() => undefined);
    return result;
}

async function runImport(
    rows: unknown[],
    processRow: (raw: unknown) => Promise<'inserted' | 'merged' | 'unchanged'>,
    conflictMessage: string
): Promise<ImportResult> {
    const db = getDb();
    const result: ImportResult = { total: rows.length, inserted: 0, merged: 0, unchanged: 0, skipped: 0, errors: [] };

    await runInTransaction(async () => {
        for (let index = 0; index < rows.length; index++) {
            // Savepoint per riga: un errore di validazione/vincolo scarta solo la riga corrente.
            await db.run('SAVEPOINT import_row');
            try {
                const outcome = await processRow(rows[index]);
                result[outcome]++;
                await db.run('RELEASE SAVEPOINT import_row');
            } catch (err) {
                await db.run('ROLLBACK TO SAVEPOINT import_row');
                await db.run('RELEASE SAVEPOINT import_row');
                if (err instanceof RowValidationError) {
                    result.skipped++;
                    result.errors.push({ index, error: err.message });
                } else if (isConstraintError(err)) {
                    result.skipped++;
                    result.errors.push({ index, error: conflictMessage });
                } else {
                    throw err;
                }
            }
        }
    });
    return result;
}

async function importHostRow(raw: unknown): Promise<'inserted' | 'merged' | 'unchanged'> {
    const db = getDb();
    const hostColumns = getHostColumnNames();
    const row = normalizeRow(raw, HOST_IMPORT_COLUMNS.filter(c => hostColumns.has(c)));

    if (isBlank(row.hostname)) throw new RowValidationError('Hostname is required');
    if (isBlank(row.ambiente)) throw new RowValidationError('Ambiente is required');
    if (row.nodo !== undefined && !Number.isInteger(Number(row.nodo))) {
        throw new RowValidationError('Nodo must be an integer');
    }

    const existing = await db.get(
        `SELECT ${hostProjection()} FROM hosts
         WHERE trim(hostname) = ? COLLATE NOCASE
           AND trim(coalesce(ambiente, '')) = ? COLLATE NOCASE
           AND trim(coalesce(servizio, '')) = ? COLLATE NOCASE
         ORDER BY ${ACTIVE_HOST_SQL} DESC, id DESC
         LIMIT 1`,
        [row.hostname, row.ambiente, row.servizio ?? '']
    );

    if (!existing) {
        const newHost: Record<string, unknown> = { ...row };
        processOSUpdate(newHost);
        const { keys, placeholders, values } = buildHostInsertColumns(newHost);
        await db.run(`INSERT INTO hosts (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
        return 'inserted';
    }

    const fill: Record<string, unknown> = computeMissingFields(existing, row, new Set(['hostname', 'ambiente', 'servizio']));
    const filledKeys = Object.keys(fill);
    if (filledKeys.length === 0) return 'unchanged';

    // os e' salvato scomposto (os/os_major/os_minor): li deriviamo solo se l'os sul DB era vuoto,
    // senza sovrascrivere major/minor eventualmente gia' valorizzati.
    if (fill.os !== undefined) {
        processOSUpdate(fill);
        if (!isBlank(existing.os_major)) delete fill.os_major;
        if (!isBlank(existing.os_minor)) delete fill.os_minor;
    }

    const setClause = Object.keys(fill).map(key => `${key} = ?`).join(', ');
    const overrides = mergeOverrides(existing, filledKeys);
    await db.run(
        `UPDATE hosts SET ${setClause}, manual_overrides = ? WHERE id = ?`,
        [...Object.values(fill), JSON.stringify(overrides), existing.id]
    );
    return 'merged';
}

async function importSiteRow(raw: unknown): Promise<'inserted' | 'merged' | 'unchanged'> {
    const db = getDb();
    const row = normalizeRow(raw, SITE_IMPORT_COLUMNS);

    if (isBlank(row.url_aliases)) throw new RowValidationError('URL aliases is required');
    if (isBlank(row.ambiente)) throw new RowValidationError('Ambiente is required');
    if (row.porta !== undefined) {
        const porta = Number(row.porta);
        if (!Number.isInteger(porta) || porta < 0 || porta > 65535) {
            throw new RowValidationError('Porta must be an integer between 0 and 65535');
        }
        row.porta = porta;
    }

    const existing = await db.get(
        `SELECT * FROM sites
         WHERE trim(coalesce(url_aliases, '')) = ? COLLATE NOCASE
           AND trim(coalesce(ambiente, '')) = ? COLLATE NOCASE
           AND trim(coalesce(servizio, '')) = ? COLLATE NOCASE
         ORDER BY id DESC
         LIMIT 1`,
        [row.url_aliases, row.ambiente, row.servizio ?? '']
    );

    if (!existing) {
        const keys = Object.keys(row);
        await db.run(
            `INSERT INTO sites (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
            Object.values(row)
        );
        return 'inserted';
    }

    const fill = computeMissingFields(existing, row, new Set(['url_aliases', 'ambiente', 'servizio']));
    const keys = Object.keys(fill);
    if (keys.length === 0) return 'unchanged';

    await db.run(
        `UPDATE sites SET ${keys.map(key => `${key} = ?`).join(', ')} WHERE id = ?`,
        [...Object.values(fill), existing.id]
    );
    return 'merged';
}

function validateRowsPayload(body: any): { rows: unknown[] } | { error: string } {
    const rows = body?.rows;
    if (!Array.isArray(rows)) return { error: 'Invalid payload: rows must be an array' };
    if (rows.length === 0) return { error: 'No rows to import' };
    if (rows.length > MAX_IMPORT_ROWS) return { error: `Too many rows (max ${MAX_IMPORT_ROWS})` };
    return { rows };
}

/**
 * @openapi
 * /data/hosts/import:
 *   post:
 *     tags: [Hosts]
 *     summary: Import massivo host con merge (priorita' al DB)
 *     description: |-
 *       Chiave di confronto: hostname + ambiente + servizio (case-insensitive, servizio vuoto = NULL).
 *       Se l'host esiste vengono valorizzati solo i campi vuoti sul DB; altrimenti viene inserito.
 *       Le righe non valide (o in conflitto con un host attivo con stesso hostname+ambiente) vengono scartate
 *       e riportate in `errors`. L'import e' eseguito in un'unica transazione (rollback su errore imprevisto).
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
 *                 maxItems: 20000
 *                 items: { $ref: '#/components/schemas/HostRecord' }
 *           example:
 *             rows:
 *               - hostname: srv-app-001
 *                 ambiente: Produzione
 *                 servizio: PORTALE
 *                 os: Windows Server 2022
 *                 appliance: false
 *     responses:
 *       '200':
 *         description: Esito import
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ImportResult' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB (rollback completo)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/hosts/import', async (req, res) => {
    const payload = validateRowsPayload(req.body);
    if ('error' in payload) return res.status(400).json({ error: payload.error });
    try {
        const result = await enqueueImport(() => runImport(payload.rows, importHostRow, 'An active host with the same hostname and ambiente already exists (different servizio)'));
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to import hosts' });
    }
});

/**
 * @openapi
 * /data/sites/import:
 *   post:
 *     tags: [Sites]
 *     summary: Import massivo siti con merge (priorita' al DB)
 *     description: |-
 *       Chiave di confronto: url_aliases + ambiente + servizio (case-insensitive, servizio vuoto = NULL).
 *       Se il sito esiste vengono valorizzati solo i campi vuoti sul DB; altrimenti viene inserito.
 *       L'import e' eseguito in un'unica transazione (rollback su errore imprevisto).
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
 *                 maxItems: 20000
 *                 items: { $ref: '#/components/schemas/SiteRecord' }
 *     responses:
 *       '200':
 *         description: Esito import
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ImportResult' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB (rollback completo)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/sites/import', async (req, res) => {
    const payload = validateRowsPayload(req.body);
    if ('error' in payload) return res.status(400).json({ error: payload.error });
    try {
        const result = await enqueueImport(() => runImport(payload.rows, importSiteRow, 'The site conflicts with an existing record (constraint violation)'));
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to import sites' });
    }
});

export default router;
