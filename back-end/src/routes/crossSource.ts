import { Router } from 'express';
import axios from 'axios';
import { CrossSourceService, SourceData, SourceType } from '../services/crossSource';
import { logger } from '../utils/syslogger';

const router = Router();
const TYPES: SourceType[] = ['hosts', 'services', 'sites', 'cves'];

/**
 * @openapi
 * /api/cross-source/{type}/{id}:
 *   get:
 *     tags: [Cross source]
 *     summary: Riferimenti incrociati da dati gia persistiti
 *     description: Relazioni dirette e potenziali con motivazione. Non certifica impatti CVE e non interroga sistemi esterni o DNS.
 *     parameters:
 *       - { in: path, name: type, required: true, schema: { type: string, enum: [hosts, services, sites, cves] } }
 *       - { in: path, name: id, required: true, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: target, schema: { type: string, enum: [hosts, services, sites, cves] } }
 *       - { in: query, name: search, schema: { type: string, maxLength: 200 } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: pageSize, schema: { type: integer, minimum: 1, maximum: 100, default: 25 } }
 *     responses:
 *       '200':
 *         description: source, items (type/id/label/context/confidence/reasons), counts per categoria, total, page, pageSize, totalPages
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrossSourceResult' }
 *       '400':
 *         description: Parametri non validi
 *       '401':
 *         description: Autenticazione richiesta
 *       '404':
 *         description: Sorgente non trovata
 *       '502':
 *         description: Dataservice non disponibile
 */
router.get('/:type/:id', async (req, res) => {
    const type = TYPES.find(value => value === req.params.type);
    const id = Number(req.params.id);
    const target = req.query.target;
    const search = req.query.search ?? '';
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 25);
    if (!type || !/^\d+$/.test(String(req.params.id)) || !Number.isSafeInteger(id) || id <= 0
        || (target !== undefined && !TYPES.some(value => value === target))
        || typeof search !== 'string' || search.length > 200
        || !Number.isSafeInteger(page) || page <= 0 || !Number.isSafeInteger(pageSize) || pageSize <= 0 || pageSize > 100) {
        return res.status(400).json({ error: 'Invalid cross-source parameters' });
    }
    try {
        const response = await axios.get<SourceData>(
            `${process.env.DATASERVICE_URL || 'http://localhost:9992'}/data/cross-source`, { timeout: 15000 });
        const service = new CrossSourceService(response.data);
        const source = service.find(type, id);
        if (!source) return res.status(404).json({ error: 'Cross-source entity not found' });
        const related = service.related(type, id);
        const counts = Object.fromEntries(TYPES.map(value => [value, related.filter(item => item.type === value).length]));
        const query = search.trim().toLowerCase();
        const filtered = related.filter(item => (!target || item.type === target)
            && (!query || [item.label, item.context, ...item.reasons].join(' ').toLowerCase().includes(query)));
        res.json({
            source, counts, items: filtered.slice((page - 1) * pageSize, page * pageSize),
            total: filtered.length, page, pageSize, totalPages: Math.ceil(filtered.length / pageSize)
        });
    } catch (error) {
        logger.error('Failed to resolve cross-source references', error);
        res.status(502).json({ error: 'Cross-source data unavailable' });
    }
});

export default router;
