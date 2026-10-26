import { Router } from 'express';
import { getDb } from './db';
import { logger } from './utils/syslogger';

const router = Router();

/**
 * @openapi
 * /data/cross-source:
 *   get:
 *     tags: [Cross source]
 *     summary: Proiezioni dei dati persistiti per le correlazioni del gateway
 *     description: Solo lettura; esclude settings, credenziali e stati operativi. Non effettua chiamate esterne.
 *     responses:
 *       '200':
 *         description: Oggetto con array hosts, services, sites e cves
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [hosts, services, sites, cves]
 *               properties:
 *                 hosts: { type: array, items: { type: object }, description: 'id, hostname, ambiente, servizio, applicazione, note, os, os_major, os_minor, ipfe, ipmgt, ipfe2al' }
 *                 services: { type: array, items: { type: object }, description: 'id, servizio' }
 *                 sites: { type: array, items: { type: object }, description: 'id, url_aliases, host_reali, ip_reali, servizio, ambiente' }
 *                 cves: { type: array, items: { type: object }, description: 'id, cve_id, problem_id, prodotto, cve_origin, note, asset_impattati, stato' }
 *       '500':
 *         description: Lettura delle sorgenti non riuscita
 */
router.get('/', async (_req, res) => {
    try {
        const db = getDb();
        const [hosts, services, sites, cves] = await Promise.all([
            db.all(`SELECT id, hostname, ambiente, servizio, applicazione, note, os, os_major, os_minor,
                    ipfe, ipmgt, ipfe2al FROM hosts ORDER BY id`),
            db.all('SELECT id, servizio FROM services ORDER BY id'),
            db.all(`SELECT id, url_aliases, host_reali, ip_reali, servizio, ambiente FROM sites ORDER BY id`),
            db.all(`SELECT id, cve_id, problem_id, prodotto, cve_origin, note, asset_impattati, stato FROM cves ORDER BY id`)
        ]);
        res.json({ hosts, services, sites, cves });
    } catch (error) {
        logger.error('Failed to read cross-source data', error);
        res.status(500).json({ error: 'Failed to read cross-source data' });
    }
});

export default router;
