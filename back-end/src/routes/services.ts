import { Router } from 'express';
import axios from 'axios';
import { logActivity } from '../utils/logger';
import { emitNotification } from '../services/notificationBroadcast';

const router = Router();
const DATASERVICE_URL = process.env.DATASERVICE_URL || 'http://localhost:9992';

let servicesCache: any[] = [];

async function loadServicesData() {
    try {
        const response = await axios.get(DATASERVICE_URL + '/data/services');
        servicesCache = response.data.map((service: any) => ({
            id: service.id,
            servizio: service.servizio || '',
            knowledge: service.knowledge || '',
            stato: service.stato || '',
            hosts: service.hosts || []
        }));
        console.log(`Loaded ${servicesCache.length} services from dataservice`);
    } catch (err) {
        const error = err as { code?: string; message?: string };
        console.error(
            `Error loading services data from dataservice (${error.code || 'UNKNOWN'}): ${error.message || 'Unexpected error'}`
        );
    }
}

// Load data immediately
loadServicesData();

/**
 * @openapi
 * /api/services:
 *   get:
 *     tags: [Services]
 *     summary: Elenco servizi
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: 'string' }
 *       - in: query
 *         name: knowledge
 *         schema: { type: 'string' }
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
 *     responses:
 *       '200':
 *         description: Elenco filtrato e paginato dei servizi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Service' }
 *                 total: { type: 'integer' }
 *                 page: { type: 'integer' }
 *                 pageSize: { type: 'integer' }
 *                 totalPages: { type: 'integer' }
 */
router.get('/', async (req, res) => {
    try {
        // ... (rest of GET logic)
        if (servicesCache.length === 0) {
            await loadServicesData();
        }

        let filtered = [...servicesCache];

        const { search, knowledge, page, pageSize } = req.query;

        if (search) {
            const lowerSearch = (search as string).toLowerCase();
            filtered = filtered.filter(s => 
                s.servizio.toLowerCase().includes(lowerSearch) ||
                s.stato.toLowerCase().includes(lowerSearch)
            );
        }

        if (knowledge && knowledge !== 'All') {
            const k = (knowledge as string).toLowerCase();
            filtered = filtered.filter(s => s.knowledge.toLowerCase() === k);
        }

        const pageNum = Number.parseInt(page as string, 10) || 1;
        const sizeNum = Number.parseInt(pageSize as string, 10) || 50;
        const startIndex = (pageNum - 1) * sizeNum;
        const endIndex = startIndex + sizeNum;

        const paginated = filtered.slice(startIndex, endIndex);

        res.json({
            items: paginated,
            total: filtered.length,
            page: pageNum,
            pageSize: sizeNum,
            totalPages: Math.ceil(filtered.length / sizeNum)
        });
    } catch (err) {
        console.error("Error serving services list", err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @openapi
 * /api/services/{id}:
 *   get:
 *     tags: [Services]
 *     summary: Dettaglio servizio aggiornato per apertura da riferimenti
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       '200':
 *         description: Servizio
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Service' }
 *       '400':
 *         description: Id non valido
 *       '404':
 *         description: Servizio non trovato
 *       '502':
 *         description: Dataservice non disponibile
 */
router.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid service id' });
    try {
        const response = await axios.get(`${DATASERVICE_URL}/data/services`, { timeout: 15000 });
        const service = response.data.find((item: { id: number }) => item.id === id);
        if (!service) return res.status(404).json({ error: 'Service not found' });
        res.json({ ...service, hosts: service.hosts || [] });
    } catch (error) {
        console.error('Failed to load service detail', error);
        res.status(502).json({ error: 'Service unavailable' });
    }
});

/**
 * @openapi
 * /api/services/reload:
 *   post:
 *     tags: [Services]
 *     summary: Ricarica la cache dei servizi dal dataservice
 *     responses:
 *       '200':
 *         description: Cache ricaricata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 *                 count: { type: 'integer' }
 */
router.post('/reload', async (req, res) => {
    await loadServicesData();
    res.json({ success: true, count: servicesCache.length });
});

/**
 * @openapi
 * /api/services:
 *   post:
 *     tags: [Services]
 *     summary: Crea un nuovo servizio
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               servizio: { type: 'string' }
 *               knowledge: { type: 'string' }
 *               stato: { type: 'string' }
 *     responses:
 *       '201':
 *         description: Servizio creato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: 'integer' }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/', async (req, res) => {
    try {
        const response = await axios.post(DATASERVICE_URL + '/data/services', req.body);
        await loadServicesData();
        const reqAny = req as any;
        logActivity(reqAny.user?.username || 'system', 'CREATE', 'SERVICE', req.body.servizio || response.data.id, req.body);
        emitNotification({
            type: 'success',
            message: `Servizio ${req.body.servizio || response.data.id} creato`,
            resource: 'service',
            action: 'create',
            actor: reqAny.user?.username || 'system'
        });
        res.status(201).json(response.data);
    } catch (err: any) {
        console.error("Error creating service:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to create service' });
    }
});

/**
 * @openapi
 * /api/services/{id}:
 *   put:
 *     tags: [Services]
 *     summary: Aggiorna un servizio
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
 *             type: object
 *             properties:
 *               servizio: { type: 'string' }
 *               knowledge: { type: 'string' }
 *               stato: { type: 'string' }
 *     responses:
 *       '200':
 *         description: Servizio aggiornato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 *       '500':
 *         description: Errore interno
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await axios.put(DATASERVICE_URL + '/data/services/' + id, req.body);
        await loadServicesData();
        const reqAny = req as any;
        logActivity(reqAny.user?.username || 'system', 'UPDATE', 'SERVICE', req.body.servizio || id, req.body);
        emitNotification({
            type: 'success',
            message: `Servizio ${req.body.servizio || id} aggiornato`,
            resource: 'service',
            action: 'update',
            actor: reqAny.user?.username || 'system'
        });
        res.status(200).json(response.data);
    } catch (err: any) {
        console.error("Error updating service:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to update service' });
    }
});

export default router;
// Force restart
