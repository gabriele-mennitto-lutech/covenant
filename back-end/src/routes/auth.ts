import { Router } from 'express';
import { authenticateUser, createSession, revokeSession } from '../auth/sessionStore';
import { logActivity } from '../utils/logger';

const router = Router();

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Autenticazione utente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: 'string' }
 *               password: { type: 'string' }
 *     responses:
 *       '200':
 *         description: Login effettuato con successo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       '400':
 *         description: Username o password mancanti
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       '401':
 *         description: Credenziali non valide
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await authenticateUser(String(username), String(password));
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const session = createSession(user);
    
    // Log the activity
    await logActivity(user.username, 'LOGIN', 'SYSTEM', 'session');

    return res.json({
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
            username: user.username,
            role: user.role,
            canWrite: user.role === 'admin'
        }
    });
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Recupera info sessione utente corrente
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       '200':
 *         description: Informazioni utente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/User' }
 *       '401':
 *         description: Non autenticato
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/me', (req, res) => {
    const reqAny = req as any;

    if (!reqAny.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    return res.json({
        user: {
            username: reqAny.user.username,
            role: reqAny.user.role,
            canWrite: reqAny.user.role === 'admin'
        }
    });
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Termina sessione utente corrente
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       '200':
 *         description: Logout effettuato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: 'boolean' }
 */
router.post('/logout', async (req, res) => {
    const reqAny = req as any;

    if (reqAny.authToken) {
        if (reqAny.user?.username) {
            await logActivity(reqAny.user.username, 'LOGOUT', 'SYSTEM', 'session');
        }
        revokeSession(reqAny.authToken);
    }
    return res.json({ success: true });
});

export default router;
