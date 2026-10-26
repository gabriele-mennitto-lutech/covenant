import { Router } from 'express';
import { registerSseClient, unregisterSseClient, getRecentNotifications } from '../services/notificationBroadcast';

const router = Router();

/**
 * @openapi
 * /api/notifications/stream:
 *   get:
 *     tags: [Notifications]
 *     summary: SSE stream notifiche in tempo reale
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: Token di autenticazione (usato da EventSource che non supporta header custom)
 *     responses:
 *       '200':
 *         description: Stream SSE aperto
 */
router.get('/stream', (req, res) => {
    const token = (req as any).authToken as string;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write('event: connected\ndata: {}\n\n');
    registerSseClient(token, res);

    const ping = setInterval(() => {
        try { res.write(': ping\n\n'); } catch { clearInterval(ping); }
    }, 25000);

    req.on('close', () => {
        clearInterval(ping);
        unregisterSseClient(token);
    });
});

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Recupera notifiche recenti (opzionalmente filtrate per data)
 *     parameters:
 *       - in: query
 *         name: since
 *         schema: { type: string, format: date-time }
 *         description: Restituisce solo le notifiche successive a questo timestamp ISO
 *     responses:
 *       '200':
 *         description: Lista notifiche
 */
router.get('/', (req, res) => {
    const since = req.query.since as string | undefined;
    res.json(getRecentNotifications(since));
});

export default router;
