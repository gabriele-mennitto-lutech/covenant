import { Router } from 'express';
import { CVE_ID_REGEX, CveNotFoundError, InvalidCveIdError, fetchCveDetails } from '../services/cveSearch';

const router = Router();

/**
 * @openapi
 * /api/external/cve-search/{cveId}:
 *   get:
 *     tags: [External]
 *     summary: Dettagli di una CVE tramite API cve-search (CIRCL)
 *     description: |
 *       Interroga `{CVE_SEARCH_URL}/api/cve/{cveId}` (default `https://cve.circl.lu`) e restituisce
 *       un JSON normalizzato, indipendente dal formato (storico cve-search o CVE JSON 5).
 *     parameters:
 *       - in: path
 *         name: cveId
 *         required: true
 *         schema: { type: string, example: CVE-2021-44228 }
 *     responses:
 *       '200':
 *         description: Dettagli CVE
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CveDetails' }
 *       '400':
 *         description: ID CVE non valido
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '404':
 *         description: CVE non trovata su cve-search
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '502':
 *         description: Servizio cve-search non raggiungibile o risposta non valida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/cve-search/:cveId', async (req, res) => {
    const cveId = String(req.params.cveId || '').trim().toUpperCase();
    if (!CVE_ID_REGEX.test(cveId)) {
        return res.status(400).json({ error: 'Invalid CVE id. Expected format CVE-YYYY-NNNN' });
    }
    try {
        res.json(await fetchCveDetails(cveId));
    } catch (err: any) {
        if (err instanceof CveNotFoundError) {
            return res.status(404).json({ error: `${cveId} not found on cve-search` });
        }
        if (err instanceof InvalidCveIdError) {
            return res.status(400).json({ error: 'Invalid CVE id. Expected format CVE-YYYY-NNNN' });
        }
        console.error('Error fetching CVE from cve-search:', err.message);
        res.status(502).json({ error: 'cve-search service unavailable' });
    }
});

export default router;
