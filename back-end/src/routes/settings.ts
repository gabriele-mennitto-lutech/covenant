import { Router } from 'express';
import axios from 'axios';

const router = Router();
const SETTING_KEYS = ['items_per_page', 'theme'];
const supportedSettings = (settings: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(settings || {}).filter(([key]) => SETTING_KEYS.includes(key)));

/**
 * @openapi
 * /api/settings:
 *   get:
 *     tags: [Settings]
 *     summary: Recupera configurazioni applicative
 *     responses:
 *       '200':
 *         description: Mappa chiave-valore settings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Settings'
 *             example:
 *               items_per_page: "50"
 *               theme: light
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
 *         description: Errore durante il recupero
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/', async (req, res) => {
    try {
        const dataserviceUrl = process.env.DATASERVICE_URL || 'http://localhost:9992';
        const response = await axios.get(`${dataserviceUrl}/data/settings`);
        res.json(supportedSettings(response.data));
    } catch (err: any) {
        console.error('Error fetching settings from dataservice:', err.message);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

/**
 * @openapi
 * /api/settings:
 *   put:
 *     tags: [Settings]
 *     summary: Aggiorna configurazioni applicative
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
 *               additionalProperties: true
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
 *         description: Errore durante aggiornamento
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put('/', async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).some(key => !SETTING_KEYS.includes(key))) {
        return res.status(400).json({ error: 'Invalid settings payload' });
    }
    try {
        const dataserviceUrl = process.env.DATASERVICE_URL || 'http://localhost:9992';
        const response = await axios.put(`${dataserviceUrl}/data/settings`, req.body);
        res.json({ success: response.data.success, settings: supportedSettings(response.data.settings) });
    } catch (err: any) {
        console.error('Error updating settings in dataservice:', err.message);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
