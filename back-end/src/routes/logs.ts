import { Router } from 'express';
import axios from 'axios';

const router = Router();
const DATASERVICE_URL = process.env.DATASERVICE_URL || 'http://localhost:9992';

/**
 * @openapi
 * /api/logs:
 *   get:
 *     tags: [Logs]
 *     summary: Recupera activity logs dal dataservice
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: 'integer' }
 *       - in: query
 *         name: pageSize
 *         schema: { type: 'integer' }
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
 *                   items: { $ref: '#/components/schemas/Log' }
 *                 total: { type: 'integer' }
 *       '500':
 *         description: Errore nel fetching dei log
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/', async (req, res) => {
    try {
        const page = Number(req.query.page) || 1;
        const pageSize = Number(req.query.pageSize) || 50;
        const response = await axios.get(`${DATASERVICE_URL}/data/logs?page=${page}&pageSize=${pageSize}`);
        return res.json(response.data);
    } catch (err) {
        console.error('Error fetching logs from dataservice:', err);
        return res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

export default router;
