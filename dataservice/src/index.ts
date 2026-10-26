import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import swaggerUi from 'swagger-ui-express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/syslogger';
import { initDb, getDb, closeDb, runInTransaction, ACTIVE_HOST_SQL, hostProjection, getHostColumnNames, SETTING_KEYS, readSettings } from './db';
import { dataserviceOpenApiSpec } from './swagger';
import cvesRouter from './cves';
import importsRouter from './imports';
import crossSourceRouter from './crossSource';
import {
    processOSUpdate,
    isConstraintError,
    pickWritableHostFields,
    buildHostInsertColumns,
    mergeOverrides
} from './hostHelpers';

const app = express();
const PORT = process.env.PORT || 9992;

app.use(helmet());
app.use(cors({
    origin: process.env.BACKEND_URL || 'http://localhost:9991',
    credentials: true
}));
// L'import CSV delle CVE puo superare il limite di default (note lunghe): limite dedicato
app.use('/data/cves/import', bodyParser.json({ limit: '10mb' }));
// Gli import massivi possono superare il limite di default (100kb): parser dedicato con limite piu' ampio.
app.use(['/data/hosts/import', '/data/sites/import'], bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.json());

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/data', apiLimiter);
app.use('/data/cross-source', crossSourceRouter);
app.get('/docs.json', (req, res) => {
    res.json(dataserviceOpenApiSpec);
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(dataserviceOpenApiSpec));

// Initialize SQLite DB (creates an empty schema if missing, no data seeding)
const dbReady = initDb().then(() => {
    logger.info("DB initialized successfully.");
});

function sanitizeOS(os: string, osMajor: string | number, osMinor: string | number): string {
    if (!os || os === 'N/A') return 'N/A';
    const major = String(osMajor);
    const minor = String(osMinor);
    if (major === '0' && minor === '0') return os;
    if (major === 'N/A' || major === 'null' || major === 'undefined' || !major || major === '') return os;
    if (/^(?:microsoft\s+)?windows\b/i.test(os) && minor === '0') return `${os} ${major}`;
    if (minor === 'N/A' || minor === 'null' || minor === 'undefined' || !minor || minor === '') return `${os} ${major}`;
    return `${os} ${major}.${minor}`;
}

function mapHostRow(row: any) {
    const supportedRow = Object.fromEntries(Object.entries(row).filter(([key]) => getHostColumnNames().has(key)));
    if (typeof supportedRow.manual_overrides === 'string') {
        try {
            const overrides = JSON.parse(supportedRow.manual_overrides);
            supportedRow.manual_overrides = JSON.stringify(
                Array.isArray(overrides) ? overrides.filter(key => getHostColumnNames().has(key)) : []
            );
        } catch {
            supportedRow.manual_overrides = '[]';
        }
    }
    return {
        ...supportedRow,
        os: sanitizeOS(row.os, row.os_major, row.os_minor),
        appliance: row.appliance === 1,
        status: row.status === 1,
        fixed: row.fixed === 1,
        fixable: row.fixable === 1
    };
}

const ACTIVE_HOST_CONFLICT_ERROR = 'An active host with the same hostname and ambiente already exists';

/** Converte un id host (path/body) in intero positivo, oppure null se non valido. */
function parseHostId(raw: unknown): number | null {
    if (typeof raw === 'number') {
        return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
    }
    if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) return null;
    const id = Number(raw.trim());
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Valida una lista di id host. Restituisce null se il payload non e' valido. */
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

function buildUpdateColumns(partialUpdate: any): { updates: string[]; values: any[] } {
    const updates: string[] = [];
    const values: any[] = [];
    for (const key of Object.keys(partialUpdate)) {
        updates.push(`${key} = ?`);
        let val = partialUpdate[key];
        if (typeof val === 'boolean') val = val ? 1 : 0;
        values.push(val);
    }
    return { updates, values };
}

async function applyBulkHostUpdates(db: any, ids: number[], updatedKeys: string[], updates: string[], values: any[]): Promise<number> {
    if (updates.length === 0) return 0;

    let updatedCount = 0;
    await runInTransaction(async () => {
        const selectStmt = await db.prepare('SELECT manual_overrides FROM hosts WHERE id = ?');
        const updateStmt = await db.prepare(`UPDATE hosts SET ${updates.join(', ')}, manual_overrides = ? WHERE id = ?`);
        try {
            for (const id of ids) {
                const existing = await selectStmt.get([id]);
                if (!existing) continue;
                const currentOverrides = mergeOverrides(existing, updatedKeys);
                const result = await updateStmt.run([...values, JSON.stringify(currentOverrides), id]);
                updatedCount += result.changes ?? 0;
            }
        } finally {
            await selectStmt.finalize();
            await updateStmt.finalize();
        }
    });
    return updatedCount;
}

// --- ENDPOINTS ---

/**
 * @openapi
 * /data/logs:
 *   get:
 *     tags: [Logs]
 *     summary: Recupera activity logs
 *     responses:
 *       '200':
 *         description: Lista logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LogRecord'
 *                 total: { type: 'integer' }
 *       '500':
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   post:
 *     tags: [Logs]
 *     summary: Inserisce activity log
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LogRecord'
 *     responses:
 *       '200':
 *         description: Log inserito
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 *       '500':
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.post('/data/logs', async (req, res) => {
    const db = getDb();
    const { username, action, target_type, target_id, details } = req.body;
    try {
        await db.run(
            `INSERT INTO activity_logs (username, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`,
            [username, action, target_type, target_id, details ? JSON.stringify(details) : null]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create log' });
    }
});

app.get('/data/logs', async (req, res) => {
    const db = getDb();
    const page = Number.parseInt(req.query.page as string, 10) || 1;
    const pageSize = Number.parseInt(req.query.pageSize as string, 10) || 50;
    const offset = (page - 1) * pageSize;
    
    try {
        const rows = await db.all(`SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?`, [pageSize, offset]);
        const countRow = await db.get(`SELECT COUNT(*) as total FROM activity_logs`);
        res.json({ items: rows, total: countRow ? countRow.total : 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});


/**
 * @openapi
 * /data/hosts:
 *   get:
 *     tags: [Hosts]
 *     summary: Restituisce tutti gli host dal DB
 *     description: Ogni host e' identificato dal campo numerico `id` (chiave primaria surrogata).
 *     responses:
 *       '200':
 *         description: Lista host
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/HostRecord'
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.get('/data/hosts', async (req, res) => {
    const db = getDb();
    try {
        const rows = await db.all(`SELECT ${hostProjection()} FROM hosts ORDER BY id`);
        // Map boolean-like integers back to booleans if needed by frontend
        const mappedRows = rows.map(mapHostRow);
        res.json(mappedRows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch hosts' });
    }
});

/**
 * @openapi
 * /data/hosts/resolve:
 *   get:
 *     tags: [Hosts]
 *     summary: Converte hostname (+ ambiente) nell'id numerico dell'host
 *     description: |-
 *       Il confronto e' case-insensitive. Se piu' host corrispondono (ad es. piu' macchine dismesse
 *       con lo stesso hostname) viene restituito come `id` quello attivo, altrimenti il piu' recente;
 *       l'elenco completo dei candidati e' in `matches`.
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
 *         description: Nessun host trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.get('/data/hosts/resolve', async (req, res) => {
    const db = getDb();
    const hostname = typeof req.query.hostname === 'string' ? req.query.hostname.trim() : '';
    const ambiente = typeof req.query.ambiente === 'string' ? req.query.ambiente.trim() : '';
    if (!hostname) {
        return res.status(400).json({ error: 'Hostname is required' });
    }

    try {
        const params: string[] = [hostname];
        let sql = `SELECT ${hostProjection()} FROM hosts WHERE hostname = ? COLLATE NOCASE`;
        if (ambiente) {
            sql += ' AND ambiente = ? COLLATE NOCASE';
            params.push(ambiente);
        }
        sql += ` ORDER BY ${ACTIVE_HOST_SQL} DESC, id DESC`;

        const rows = await db.all(sql, params);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Host not found' });
        }
        res.json({
            id: rows[0].id,
            host: mapHostRow(rows[0]),
            matches: rows.map(r => ({ id: r.id, hostname: r.hostname, ambiente: r.ambiente }))
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to resolve host' });
    }
});

/**
 * @openapi
 * /data/hosts/{id}:
 *   get:
 *     tags: [Hosts]
 *     summary: Restituisce un host per id
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
 *             schema: { $ref: '#/components/schemas/HostRecord' }
 *       '404':
 *         description: Host non trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.get('/data/hosts/:id(\\d+)', async (req, res) => {
    const db = getDb();
    const id = parseHostId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Invalid host id' });
    }
    try {
        const row = await db.get(`SELECT ${hostProjection()} FROM hosts WHERE id = ?`, [id]);
        if (!row) {
            return res.status(404).json({ error: 'Host not found' });
        }
        res.json(mapHostRow(row));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch host' });
    }
});

/**
 * @openapi
 * /data/hosts:
 *   post:
 *     tags: [Hosts]
 *     summary: Crea un nuovo host in DB
 *     description: |-
 *       L'id viene generato dal DB (eventuale `id` nel body viene ignorato).
 *       Possono coesistere piu' host con lo stesso hostname e ambiente solo se dismessi/spenti;
 *       per gli host attivi la coppia (hostname, ambiente) deve essere univoca.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/HostRecord'
 *           example:
 *             hostname: srv-new-001
 *             ambiente: PRODUZIONE
 *             company: RAI
 *             appliance: false
 *             zona: DMZ
 *             os: Windows Server 2022
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
 *                 host: { $ref: '#/components/schemas/HostRecord' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: "Hostname is required" }
 *       '409':
 *         description: Esiste gia' un host attivo con lo stesso hostname e ambiente
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.post('/data/hosts', async (req, res) => {
    const db = getDb();
    const newHost = pickWritableHostFields(req.body);

    if (!newHost.hostname) {
        return res.status(400).json({ error: 'Hostname is required' });
    }
    if (!newHost.ambiente) {
        return res.status(400).json({ error: 'Ambiente is required' });
    }

    processOSUpdate(newHost);

    try {
        const { keys, placeholders, values } = buildHostInsertColumns(newHost);

        const result = await db.run(`INSERT INTO hosts (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`, values);

        const created = await db.get(`SELECT ${hostProjection()} FROM hosts WHERE id = ?`, [result.lastID]);
        res.status(201).json({ success: true, host: mapHostRow(created) });
    } catch (err) {
        if (isConstraintError(err)) {
            return res.status(409).json({ error: ACTIVE_HOST_CONFLICT_ERROR });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to create host' });
    }
});

/**
 * @openapi
 * /data/hosts/bulk/update:
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
 *               ambiente: Dismessa
 *     responses:
 *       '200':
 *         description: Bulk update completato (transazione unica)
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
 *         description: L'aggiornamento creerebbe host attivi duplicati (rollback completo)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore transazione
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.put('/data/hosts/bulk/update', async (req, res) => {
    const db = getDb();
    const ids = parseHostIdList(req.body?.ids);
    const rawUpdate = req.body?.partialUpdate;
    if (!ids || !rawUpdate || typeof rawUpdate !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    const partialUpdate = pickWritableHostFields(rawUpdate);
    processOSUpdate(partialUpdate);

    try {
        const { updates, values } = buildUpdateColumns(partialUpdate);
        const updatedKeys = Object.keys(partialUpdate);

        const updatedCount = await applyBulkHostUpdates(db, ids, updatedKeys, updates, values);

        res.json({ success: true, updatedCount });
    } catch (err) {
        if (isConstraintError(err)) {
            return res.status(409).json({ error: ACTIVE_HOST_CONFLICT_ERROR });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to bulk update hosts' });
    }
});

/**
 * @openapi
 * /data/hosts/{id}:
 *   put:
 *     tags: [Hosts]
 *     summary: Aggiorna host esistente per id
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
 *     responses:
 *       '200':
 *         description: Host aggiornato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 host: { $ref: '#/components/schemas/HostRecord' }
 *       '404':
 *         description: Host non trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *             example: { error: "Host not found" }
 *       '409':
 *         description: L'aggiornamento creerebbe un host attivo duplicato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.put('/data/hosts/:id(\\d+)', async (req, res) => {
    const db = getDb();
    const id = parseHostId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Invalid host id' });
    }
    const partialUpdate = pickWritableHostFields(req.body);

    processOSUpdate(partialUpdate);

    try {
        const existing = await db.get(`SELECT ${hostProjection()} FROM hosts WHERE id = ?`, [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Host not found' });
        }

        const { updates, values } = buildUpdateColumns(partialUpdate);
        const currentOverrides = mergeOverrides(existing, Object.keys(partialUpdate));

        if (updates.length > 0) {
            await db.run(`UPDATE hosts SET ${updates.join(', ')}, manual_overrides = ? WHERE id = ?`, [...values, JSON.stringify(currentOverrides), id]);
        }

        const updated = await db.get(`SELECT ${hostProjection()} FROM hosts WHERE id = ?`, [id]);
        res.json({ success: true, host: mapHostRow(updated) });
    } catch (err) {
        if (isConstraintError(err)) {
            return res.status(409).json({ error: ACTIVE_HOST_CONFLICT_ERROR });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to update host' });
    }
});

/**
 * @openapi
 * /data/hosts/bulk/delete:
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
 *         description: Bulk delete completato (transazione unica)
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
 *         description: Errore transazione
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.delete('/data/hosts/bulk/delete', async (req, res) => {
    const db = getDb();
    const ids = parseHostIdList(req.body?.ids);
    if (!ids) {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    try {
        let deletedCount = 0;
        await runInTransaction(async () => {
            const stmt = await db.prepare('DELETE FROM hosts WHERE id = ?');
            try {
                for (const id of ids) {
                    const result = await stmt.run([id]);
                    deletedCount += result.changes ?? 0;
                }
            } finally {
                await stmt.finalize();
            }
        });

        res.json({ success: true, deletedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete hosts' });
    }
});

/**
 * @openapi
 * /data/hosts/{id}:
 *   delete:
 *     tags: [Hosts]
 *     summary: Elimina host esistente per id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       '200':
 *         description: Host eliminato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *       '404':
 *         description: Host non trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.delete('/data/hosts/:id(\\d+)', async (req, res) => {
    const db = getDb();
    const id = parseHostId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Invalid host id' });
    }

    try {
        const result = await db.run('DELETE FROM hosts WHERE id = ?', [id]);
        if (!result.changes) {
            return res.status(404).json({ error: 'Host not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete host' });
    }
});

/**
 * @openapi
 * /data/sites:
 *   get:
 *     tags: [Sites]
 *     summary: Restituisce i siti dal DB
 *     responses:
 *       '200':
 *         description: Lista siti
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SiteRecord'
 *       '400':
 *         description: Richiesta non valida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Nessun sito trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.get('/data/sites', async (req, res) => {
    const db = getDb();
    try {
        const rows = await db.all('SELECT * FROM sites');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch sites' });
    }
});

/**
 * @openapi
 * /data/sites/{id}:
 *   put:
 *     tags: [Sites]
 *     summary: Aggiorna un sito
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       '200':
 *         description: Sito aggiornato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 site: { $ref: '#/components/schemas/SiteRecord' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Sito non trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.put('/data/sites/:id', async (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const updateData = req.body;
    
    try {
        const existing = await db.get('SELECT * FROM sites WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Site not found' });
        }
        
        const updates: string[] = [];
        const values: any[] = [];
        
        for (const key of Object.keys(updateData)) {
            updates.push(`${key} = ?`);
            values.push(updateData[key]);
        }
        
        if (updates.length > 0) {
            values.push(id);
            await db.run(`UPDATE sites SET ${updates.join(', ')} WHERE id = ?`, values);
        }
        
        const updated = await db.get('SELECT * FROM sites WHERE id = ?', [id]);
        res.json({ success: true, site: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update site' });
    }
});

/**
 * @openapi
 * /data/sites:
 *   post:
 *     tags: [Sites]
 *     summary: Crea un sito
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SiteRecord'
 *     responses:
 *       '200':
 *         description: Sito creato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 site: { $ref: '#/components/schemas/SiteRecord' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Risorsa non trovata
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.post('/data/sites', async (req, res) => {
    const db = getDb();
    const siteData = req.body;
    try {
        const keys = [];
        const values = [];
        const placeholders = [];
        for (const key of Object.keys(siteData)) {
            keys.push(key);
            values.push(siteData[key]);
            placeholders.push('?');
        }
        
        await db.run(`INSERT INTO sites (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
        
        const result = await db.get('SELECT * FROM sites ORDER BY id DESC LIMIT 1');
        res.json({ success: true, site: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create site' });
    }
});

/**
 * @openapi
 * /data/sites/{id}:
 *   delete:
 *     tags: [Sites]
 *     summary: Elimina un sito
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       '200':
 *         description: Sito eliminato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *             example: { success: true }
 *       '400':
 *         description: Richiesta non valida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Sito non trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.delete('/data/sites/:id', async (req, res) => {
    const db = getDb();
    const { id } = req.params;
    try {
        await db.run('DELETE FROM sites WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete site' });
    }
});



/**
 * @openapi
 * /data/hosts/count/appliance0:
 *   get:
 *     tags: [Hosts]
 *     summary: Conta host con appliance=0
 *     responses:
 *       '200':
 *         description: Numero host appliance0
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *             example: { count: 35 }
 *       '400':
 *         description: Richiesta non valida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Nessun dato trovato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.get('/data/hosts/count/appliance0', async (req, res) => {
    const db = getDb();
    try {
        const row = await db.get('SELECT count(*) as count FROM hosts WHERE appliance = 0');
        res.json({ count: row.count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed' });
    }
});

/**
 * @openapi
 * /data/settings:
 *   get:
 *     tags: [Settings]
 *     summary: Restituisce settings dal DB
 *     responses:
 *       '200':
 *         description: Mappa key/value settings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Settings'
 *       '400':
 *         description: Richiesta non valida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Settings non trovati
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore DB
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.get('/data/settings', async (req, res) => {
    const db = getDb();
    try {
        res.json(await readSettings());
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

/**
 * @openapi
 * /data/settings:
 *   put:
 *     tags: [Settings]
 *     summary: Aggiorna settings nel DB
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Settings'
 *           example:
 *             items_per_page: "50"
 *             theme: light
 *     responses:
 *       '200':
 *         description: Settings aggiornati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 settings: { $ref: '#/components/schemas/Settings' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Risorsa non trovata
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore transazione
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.put('/data/settings', async (req, res) => {
    const db = getDb();
    const newSettings = req.body;
    if (!newSettings || typeof newSettings !== 'object' || Array.isArray(newSettings)
        || Object.keys(newSettings).some(key => !(SETTING_KEYS as readonly string[]).includes(key))) {
        return res.status(400).json({ error: 'Invalid settings payload' });
    }

    try {
        await runInTransaction(async () => {
            const stmt = await db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
            try {
                for (const [key, value] of Object.entries(newSettings)) {
                    await stmt.run([key, String(value)]);
                }
            } finally {
                await stmt.finalize();
            }
        });
        
        // Fetch and return the updated settings
        res.json({ success: true, settings: await readSettings() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
/**
 * @openapi
 * /data/services:
 *   get:
 *     tags: [Services]
 *     summary: Restituisce tutti i servizi con i relativi hosts
 *     responses:
 *       '200':
 *         description: Lista dei servizi
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ServiceRecord'
 *       '500':
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.get('/data/services', async (req, res) => {
    const db = getDb();
    try {
        const rows = await db.all(`
            SELECT s.*, 
                   (SELECT json_group_array(json_object('id', hosts.id, 'hostname', hosts.hostname, 'ambiente', hosts.ambiente)) FROM hosts WHERE hosts.servizio = s.servizio AND hostname IS NOT NULL) as hosts
            FROM services s
        `);
        const parsedRows = rows.map(r => ({
            ...r,
            hosts: JSON.parse(r.hosts || '[]')
        }));
        res.json(parsedRows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

/**
 * @openapi
 * /data/services:
 *   post:
 *     tags: [Services]
 *     summary: Crea un nuovo servizio
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ServiceRecord'
 *     responses:
 *       '201':
 *         description: Servizio creato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: 'integer' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.post('/data/services', async (req, res) => {
    const db = getDb();
    try {
        const { servizio, knowledge, stato } = req.body;
        if (!servizio || !knowledge) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const result = await db.run(
            `INSERT INTO services (servizio, knowledge, stato) VALUES (?, ?, ?)`,
            [servizio, knowledge, stato || '']
        );
        res.status(201).json({ id: result.lastID });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create service' });
    }
});

/**
 * @openapi
 * /data/services/{id}:
 *   put:
 *     tags: [Services]
 *     summary: Aggiorna un servizio esistente
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: 'integer' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ServiceRecord'
 *     responses:
 *       '200':
 *         description: Servizio aggiornato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 *       '400':
 *         description: Payload non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.put('/data/services/:id', async (req, res) => {
    const db = getDb();
    try {
        const { id } = req.params;
        const { servizio, knowledge, stato } = req.body;
        if (!servizio || !knowledge) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        await db.run(
            `UPDATE services SET servizio = ?, knowledge = ?, stato = ? WHERE id = ?`,
            [servizio, knowledge, stato || '', id]
        );
        res.status(200).json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update service' });
    }
});

/**
 * @openapi
 * /data/mail_templates:
 *   get:
 *     tags: [MailTemplates]
 *     summary: Restituisce tutti i template mail
 *     responses:
 *       '200':
 *         description: Lista dei template
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MailTemplate'
 *       '500':
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.get('/data/mail_templates', async (req, res) => {
    const db = getDb();
    try {
        const rows = await db.all('SELECT * FROM mail_templates');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
});

/**
 * @openapi
 * /data/mail_templates:
 *   post:
 *     tags: [MailTemplates]
 *     summary: Crea un nuovo template mail
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MailTemplate'
 *     responses:
 *       '201':
 *         description: Template creato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: 'integer' }
 *       '500':
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.post('/data/mail_templates', async (req, res) => {
    const db = getDb();
    try {
        const { title, description, subject, recipients, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const result = await db.run(
            `INSERT INTO mail_templates (title, description, subject, recipients, content) VALUES (?, ?, ?, ?, ?)`,
            [title, description || '', subject || '', recipients || '', content]
        );
        res.status(201).json({ id: result.lastID });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

/**
 * @openapi
 * /data/mail_templates/{id}:
 *   put:
 *     tags: [MailTemplates]
 *     summary: Aggiorna un template mail
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MailTemplate'
 *     responses:
 *       '200':
 *         description: Template aggiornato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 *       '500':
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.put('/data/mail_templates/:id', async (req, res) => {
    const db = getDb();
    try {
        const { id } = req.params;
        const { title, description, subject, recipients, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        await db.run(
            `UPDATE mail_templates SET title = ?, description = ?, subject = ?, recipients = ?, content = ? WHERE id = ?`,
            [title, description || '', subject || '', recipients || '', content, id]
        );
        res.status(200).json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update template' });
    }
});

/**
 * @openapi
 * /data/mail_templates/{id}:
 *   delete:
 *     tags: [MailTemplates]
 *     summary: Elimina un template mail
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Template eliminato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 *       '500':
 *         description: Errore del server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
app.delete('/data/mail_templates/:id', async (req, res) => {
    const db = getDb();
    try {
        const { id } = req.params;
        await db.run(`DELETE FROM mail_templates WHERE id = ?`, [id]);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

app.use('/data/cves', cvesRouter);
app.use('/data', importsRouter);

app.get('/', (req, res) => {
    res.send('Dataservice is running with SQLite.');
});

dbReady.then(() => {
    const server = app.listen(PORT, () => {
        logger.info(`Dataservice is running on port ${PORT}`);
    });
    const shutdown = () => {
        server.close(() => {
            closeDb().finally(() => process.exit(0));
        });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}).catch(err => {
    logger.error("Failed to initialize DB:", err);
    process.exit(1);
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled Server Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});
