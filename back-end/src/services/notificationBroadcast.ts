import { Response } from 'express';
import { randomUUID } from 'node:crypto';

export interface AppNotification {
    id: string;
    type: 'success' | 'info' | 'warning' | 'error';
    message: string;
    resource: string;
    action: 'create' | 'update' | 'delete' | 'bulk_update' | 'bulk_delete' | 'import';
    timestamp: string;
    actor: string;
}

const MAX_STORED = 200;
const stored: AppNotification[] = [];

// SSE client registry: authToken -> Response
const clients = new Map<string, Response>();

export function registerSseClient(token: string, res: Response): void {
    clients.set(token, res);
}

export function unregisterSseClient(token: string): void {
    clients.delete(token);
}

export function getRecentNotifications(since?: string): AppNotification[] {
    if (!since) return [...stored];
    const t = new Date(since).getTime();
    if (Number.isNaN(t)) return [...stored];
    return stored.filter(n => new Date(n.timestamp).getTime() > t);
}

export function emitNotification(partial: Omit<AppNotification, 'id' | 'timestamp'>): void {
    const n: AppNotification = {
        ...partial,
        id: randomUUID(),
        timestamp: new Date().toISOString()
    };

    stored.push(n);
    if (stored.length > MAX_STORED) stored.shift();

    const data = `data: ${JSON.stringify(n)}\n\n`;
    for (const [token, res] of clients.entries()) {
        try {
            res.write(data);
        } catch {
            clients.delete(token);
        }
    }
}
