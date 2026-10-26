import express from 'express';
import axios from 'axios';
import { emitNotification } from '../services/notificationBroadcast';

const router = express.Router();
const DATASERVICE_URL = process.env.DATASERVICE_URL || 'http://localhost:9992';

/**
 * @openapi
 * /api/mailing/templates:
 *   get:
 *     tags: [Mailing]
 *     summary: Recupera tutti i template mail
 *     responses:
 *       '200':
 *         description: Lista template
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MailTemplate'
 */
router.get('/templates', async (req, res) => {
    try {
        const response = await axios.get(`${DATASERVICE_URL}/data/mail_templates`);
        res.json(response.data);
    } catch (error: any) {
        console.error('Error fetching mail templates:', error.message);
        res.status(500).json({ error: 'Failed to fetch mail templates' });
    }
});

/**
 * @openapi
 * /api/mailing/templates:
 *   post:
 *     tags: [Mailing]
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
 *               $ref: '#/components/schemas/MailTemplate'
 */
router.post('/templates', async (req, res) => {
    try {
        const response = await axios.post(`${DATASERVICE_URL}/data/mail_templates`, req.body);
        emitNotification({
            type: 'success',
            message: `Template mail "${req.body.title || 'nuovo'}" creato`,
            resource: 'template',
            action: 'create',
            actor: (req as any).user?.username || 'system'
        });
        res.status(201).json(response.data);
    } catch (error: any) {
        console.error('Error creating mail template:', error.message);
        res.status(500).json({ error: 'Failed to create mail template' });
    }
});

/**
 * @openapi
 * /api/mailing/templates/{id}:
 *   put:
 *     tags: [Mailing]
 *     summary: Aggiorna un template mail esistente
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
 *               $ref: '#/components/schemas/MailTemplate'
 */
router.put('/templates/:id', async (req, res) => {
    try {
        const response = await axios.put(`${DATASERVICE_URL}/data/mail_templates/${req.params.id}`, req.body);
        emitNotification({
            type: 'success',
            message: `Template mail "${req.body.title || req.params.id}" aggiornato`,
            resource: 'template',
            action: 'update',
            actor: (req as any).user?.username || 'system'
        });
        res.status(200).json(response.data);
    } catch (error: any) {
        console.error('Error updating mail template:', error.message);
        res.status(500).json({ error: 'Failed to update mail template' });
    }
});

/**
 * @openapi
 * /api/mailing/templates/{id}:
 *   delete:
 *     tags: [Mailing]
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
 */
router.delete('/templates/:id', async (req, res) => {
    try {
        const response = await axios.delete(`${DATASERVICE_URL}/data/mail_templates/${req.params.id}`);
        emitNotification({
            type: 'warning',
            message: `Template mail ${req.params.id} eliminato`,
            resource: 'template',
            action: 'delete',
            actor: (req as any).user?.username || 'system'
        });
        res.status(200).json(response.data);
    } catch (error: any) {
        console.error('Error deleting mail template:', error.message);
        res.status(500).json({ error: 'Failed to delete mail template' });
    }
});

export default router;
