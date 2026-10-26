import { NextFunction, Request, Response } from 'express';
import { getSession } from '../auth/sessionStore';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function extractBearerToken(headerValue?: string): string | null {
    if (!headerValue) return null;
    const [scheme, token] = headerValue.split(' ');
    if (!scheme || !token) return null;
    if (scheme.toLowerCase() !== 'bearer') return null;
    return token;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const reqAny = req as any;

    if (req.method === 'OPTIONS') {
        return next();
    }

    if (req.path === '/auth/login') {
        return next();
    }

    // EventSource (SSE) cannot set custom headers, so accept token as query param for GET requests
    const token = extractBearerToken(req.header('authorization'))
        || (req.method === 'GET' ? (req.query.token as string | undefined) ?? null : null);
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const session = getSession(token);
    if (!session) {
        return res.status(401).json({ error: 'Invalid or expired session' });
    }

    reqAny.user = session.user;
    reqAny.authToken = token;

    const isMutatingCall = MUTATING_METHODS.has(req.method);
    const isAuthLogout = req.path === '/auth/logout';

    if (isMutatingCall && !isAuthLogout && session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Write operations are allowed only for admin users' });
    }

    return next();
}
