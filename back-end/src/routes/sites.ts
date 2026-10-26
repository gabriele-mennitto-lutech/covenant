import { Router } from 'express';
import axios from 'axios';
import { logActivity } from '../utils/logger';
import { emitNotification } from '../services/notificationBroadcast';
import express from 'express';
import {
    ImportField,
    ImportFormatError,
    MAX_IMPORT_BYTES,
    buildCsvTemplate,
    mergeImportResult,
    parseImportFile,
    parseImportFormat
} from '../utils/csvImport';

const router = Router();
const DATASERVICE_URL = process.env.DATASERVICE_URL || 'http://localhost:9992';

// Cache the parsed sites so we don't read from dataservice on every request unnecessarily
let sitesCache: any[] = [];

function parseHostReali(value: string | null | undefined): string[] {
    if (!value) return [];
    return value.split(/[\s,]+/).filter(Boolean);
}

function toCacheSiteModel(site: any): any {
    return {
        id: site.id,
        urlAliases: site.url_aliases || '',
        ipVip: site.ip_reali || '',
        nomeBilanciatore: site.nome_vip || '',
        servizio: site.servizio || '',
        tls: site.tls_config || (site.porta === 443 ? 'EDGE' : 'PASSTHROUGH'),
        hostReali: parseHostReali(site.host_reali),
        porta: site.porta || null,
        note: site.note || '',
        ambiente: site.ambiente || ''
    };
}

function mapFrontendSitePayload(siteData: any): any {
    const mapped: any = {};
    const fieldMap: Record<string, string> = {
        urlAliases: 'url_aliases',
        ipVip: 'ip_reali',
        nomeBilanciatore: 'nome_vip',
        servizio: 'servizio',
        porta: 'porta',
        note: 'note',
        ambiente: 'ambiente',
        tls: 'tls_config'
    };

    Object.entries(fieldMap).forEach(([source, target]) => {
        if (siteData[source] !== undefined) {
            mapped[target] = siteData[source];
        }
    });

    if (siteData.hostReali !== undefined) {
        mapped.host_reali = Array.isArray(siteData.hostReali) ? siteData.hostReali.join(',') : siteData.hostReali;
    }

    return mapped;
}

async function loadSitesData() {
    try {
        const response = await axios.get(DATASERVICE_URL + '/data/sites');
        sitesCache = response.data.map((site: any) => toCacheSiteModel(site));
        console.log(`Loaded ${sitesCache.length} sites from dataservice`);
    } catch (err) {
        const error = err as { code?: string; message?: string };
        console.error(
            `Error loading sites data from dataservice (${error.code || 'UNKNOWN'}): ${error.message || 'Unexpected error'}`
        );
    }
}

// Load data immediately
loadSitesData();

/**
 * @openapi
 * /api/sites:
 *   get:
 *     tags: [Sites]
 *     summary: Elenco siti applicativi
 *     responses:
 *       '200':
 *         description: Lista siti in cache backend
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Site'
 *                 totalCount:
 *                   type: integer
 *             example:
 *               items:
 *                 - id: 10
 *                   urlAliases: app.example.it
 *                   ipVip: 172.20.10.15
 *                   nomeBilanciatore: vip-app-prd-01
 *                   servizio: PORTALE
 *                   tls: EDGE
 *                   hostReali: [srv-app-001]
 *                   porta: 443
 *                   note: Bilanciato F5
 *                   ambiente: PRODUZIONE
 *               totalCount: 1
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
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /api/sites
router.get('/', async (req, res) => {
    // Optionally reload data if cache is empty
    if (sitesCache.length === 0) {
        await loadSitesData();
    }
    res.json({ items: sitesCache, totalCount: sitesCache.length });
});

/**
 * @openapi
 * /api/sites/refresh:
 *   post:
 *     tags: [Sites]
 *     summary: Ricarica la cache siti dal dataservice
 *     responses:
 *       '200':
 *         description: Cache aggiornata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *             example: { success: true, message: "Sites cache refreshed" }
 *       '400':
 *         description: Richiesta non valida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: Risorsa non trovata
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// POST /api/sites/refresh
router.post('/refresh', async (req, res) => {
    await loadSitesData();
    res.json({ success: true, message: 'Sites cache refreshed' });
});

/** Colonne del template di import siti (chiave di merge: urlAliases + ambiente + servizio). */
export const SITE_IMPORT_FIELDS: ImportField[] = [
    { key: 'urlAliases', dbKey: 'url_aliases', label: 'URL Aliases', type: 'string', required: true },
    { key: 'ambiente', dbKey: 'ambiente', label: 'Ambiente', type: 'string', required: true },
    { key: 'servizio', dbKey: 'servizio', label: 'Protocol', type: 'string' },
    { key: 'porta', dbKey: 'porta', label: 'Port', type: 'integer' },
    { key: 'ipVip', dbKey: 'ip_reali', label: 'IP VIP', type: 'string' },
    { key: 'hostReali', dbKey: 'host_reali', label: 'Real Hosts', type: 'list' },
    { key: 'nomeBilanciatore', dbKey: 'nome_vip', label: 'Balancer Name', type: 'string' },
    { key: 'tls', dbKey: 'tls_config', label: 'TLS Configuration', type: 'tls' },
    { key: 'note', dbKey: 'note', label: 'Notes', type: 'string' }
];

/**
 * @openapi
 * /api/sites/import/template:
 *   get:
 *     tags: [Sites]
 *     summary: Scarica il template CSV per l'import siti
 *     description: CSV UTF-8 (con BOM) separato da `;` contenente la sola riga di intestazione.
 *     responses:
 *       '200':
 *         description: Template CSV
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *             example: "urlAliases;ambiente;servizio;porta;ipVip;hostReali;nomeBilanciatore;tls;note"
 */
router.get('/import/template', (req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="template_import_sites.csv"');
    res.send(buildCsvTemplate(SITE_IMPORT_FIELDS));
});

/**
 * @openapi
 * /api/sites/import:
 *   post:
 *     tags: [Sites]
 *     summary: Importa siti da file CSV/JSON (merge con priorita' al DB)
 *     description: |-
 *       Il corpo della richiesta e' il contenuto testuale del file (`Content-Type: text/plain`, max 10MB, max 20000 righe).
 *       CSV: separatore `;` o `,` (rilevato automaticamente), prima riga = intestazioni del template.
 *       JSON: array di oggetti con le stesse chiavi del template.
 *       Chiave di merge: urlAliases + ambiente + servizio (case-insensitive). Se il sito esiste gia' vengono valorizzati
 *       solo i campi vuoti sul DB, senza modificare i dati presenti; altrimenti il sito viene creato.
 *       `hostReali` accetta piu' host separati da spazio, virgola, `|` o `;` (se tra virgolette). `tls`: PASSTHROUGH, EDGE, RE-ENCRYPT.
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [csv, json], default: csv }
 *     requestBody:
 *       required: true
 *       content:
 *         text/plain:
 *           schema: { type: string }
 *           example: "urlAliases;ambiente;porta;hostReali;tls\napp.example.it;Produzione;443;srv-app-001 srv-app-002;EDGE"
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
        parsed = parseImportFile(SITE_IMPORT_FIELDS, req.body, format);
    } catch (err) {
        if (err instanceof ImportFormatError) return res.status(400).json({ error: err.message });
        console.error('Unexpected error parsing import file:', err);
        return res.status(500).json({ error: 'Failed to parse import file' });
    }

    try {
        let dsResult = null;
        if (parsed.rows.length > 0) {
            const response = await axios.post(`${DATASERVICE_URL}/data/sites/import`, { rows: parsed.rows.map(r => r.data) }, { maxBodyLength: Infinity });
            dsResult = response.data;
            await loadSitesData();
        }
        const result = mergeImportResult(parsed, dsResult);
        const username = (req as any).user?.username;

        if (username) {
            logActivity(username, 'IMPORT', 'SITE', `${result.inserted + result.merged} sites`, {
                format, inserted: result.inserted, merged: result.merged, unchanged: result.unchanged, skipped: result.skipped
            }).catch(console.error);
        }
        emitNotification({
            type: result.skipped > 0 ? 'warning' : 'success',
            message: `Import siti: ${result.inserted} creati, ${result.merged} completati, ${result.skipped} scartati`,
            resource: 'site',
            action: 'import',
            actor: username || 'system'
        });
        res.json(result);
    } catch (err: any) {
        console.error('Error importing sites in dataservice:', err?.message || err);
        res.status(500).json({ error: 'Error communicating with dataservice during import' });
    }
});

/**
 * @openapi
 * /api/sites/{id}:
 *   put:
 *     tags: [Sites]
 *     summary: Aggiorna un sito
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID sito.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Site'
 *           example:
 *             servizio: PORTALE
 *             tls: EDGE
 *             porta: 443
 *     responses:
 *       '200':
 *         description: Sito aggiornato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 site: { $ref: '#/components/schemas/Site' }
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
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// PUT /api/sites/:id
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const updateData = mapFrontendSitePayload(req.body);

    try {
        const response = await axios.put(`${DATASERVICE_URL}/data/sites/${id}`, updateData);
        if (response.data.success) {
            // Update cache
            const updatedSite = response.data.site;
            const cacheIndex = sitesCache.findIndex(s => s.id == id);
            if (cacheIndex !== -1) {
                sitesCache[cacheIndex] = {
                    ...toCacheSiteModel(updatedSite)
                };
                const reqAny = req as any;
                if (reqAny.user?.username) {
                    const targetName = sitesCache[cacheIndex].urlAliases || String(id);
                    logActivity(reqAny.user.username, 'UPDATE', 'SITE', targetName, sitesCache[cacheIndex]).catch(console.error);
                }

                emitNotification({
                    type: 'success',
                    message: `Sito ${sitesCache[cacheIndex].urlAliases || id} aggiornato`,
                    resource: 'site',
                    action: 'update',
                    actor: (req as any).user?.username || 'system'
                });

                res.json({ success: true, site: sitesCache[cacheIndex] });
            } else {
                res.json({ success: true });
            }
        } else {
            res.status(400).json({ error: 'Failed to update site in dataservice' });
        }
    } catch (err) {
        console.error("Error updating site in dataservice:", err);
        res.status(500).json({ error: 'Internal server error during site update' });
    }
});

/**
 * @openapi
 * /api/sites:
 *   post:
 *     tags: [Sites]
 *     summary: Crea un nuovo sito
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Site'
 *           example:
 *             urlAliases: app.example.it
 *             ipVip: 172.20.10.15
 *             nomeBilanciatore: vip-app-prd-01
 *             servizio: PORTALE
 *             tls: EDGE
 *             hostReali: [srv-app-001]
 *             porta: 443
 *             note: Nuovo inserimento
 *             ambiente: PRODUZIONE
 *     responses:
 *       '200':
 *         description: Sito creato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 site: { $ref: '#/components/schemas/Site' }
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
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// POST /api/sites
router.post('/', async (req, res) => {
    const createData = mapFrontendSitePayload(req.body);

    try {
        const response = await axios.post(`${DATASERVICE_URL}/data/sites`, createData);
        if (response.data.success) {
            const newSite = response.data.site;
            const formattedSite = toCacheSiteModel(newSite);
            sitesCache.unshift(formattedSite);
            
            const reqAny = req as any;
            if (reqAny.user?.username) {
                const targetName = formattedSite.urlAliases || String(formattedSite.id);
                logActivity(reqAny.user.username, 'CREATE', 'SITE', targetName, formattedSite).catch(console.error);
            }

            emitNotification({
                type: 'success',
                message: `Sito ${formattedSite.urlAliases || formattedSite.id} creato`,
                resource: 'site',
                action: 'create',
                actor: (req as any).user?.username || 'system'
            });

            res.json({ success: true, site: formattedSite });
        } else {
            res.status(400).json({ error: 'Failed to create site in dataservice' });
        }
    } catch (err) {
        console.error("Error creating site in dataservice:", err);
        res.status(500).json({ error: 'Internal server error during site creation' });
    }
});

/**
 * @openapi
 * /api/sites/{id}:
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
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// DELETE /api/sites/:id
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const siteName = sitesCache.find(s => s.id == id)?.urlAliases || String(id);
        const response = await axios.delete(`${DATASERVICE_URL}/data/sites/${id}`);
        if (response.data.success) {
            sitesCache = sitesCache.filter(s => s.id != (id as any));
            
            const reqAny = req as any;
            if (reqAny.user?.username) {
                logActivity(reqAny.user.username, 'DELETE', 'SITE', siteName).catch(console.error);
            }

            emitNotification({
                type: 'warning',
                message: `Sito ${id} eliminato`,
                resource: 'site',
                action: 'delete',
                actor: (req as any).user?.username || 'system'
            });

            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Failed to delete site in dataservice' });
        }
    } catch (err) {
        console.error("Error deleting site in dataservice:", err);
        res.status(500).json({ error: 'Internal server error during site deletion' });
    }
});

export default router;
