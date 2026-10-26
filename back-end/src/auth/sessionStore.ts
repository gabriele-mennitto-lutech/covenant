import { randomBytes } from 'node:crypto';
import { authenticateLdapUser, isLdapConfigured } from './ldapAuth';

export type AppRole = 'admin' | 'readonly';

export interface AppUser {
    username: string;
    role: AppRole;
}

interface SessionRecord {
    token: string;
    user: AppUser;
    expiresAt: number;
}

const sessions = new Map<string, SessionRecord>();

const env = ((globalThis as any).process?.env || {}) as Record<string, string | undefined>;

function normalizeUsername(username: string): string {
    return String(username || '').trim().toUpperCase();
}

function tokenTtlMs(): number {
    const fromEnv = Number(env.AUTH_TOKEN_TTL_MS || '28800000');
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
        return fromEnv;
    }
    return 28800000;
}

export function authenticateLocalUser(username: string, password: string): AppUser | null {
    const inputUser = normalizeUsername(username);

    const adminUser = normalizeUsername(env.LOCAL_ADMIN_USER || 'SOCINFRAADM');
    const adminPass = String(env.LOCAL_ADMIN_PASSWORD || '');

    const readUser = normalizeUsername(env.LOCAL_READONLY_USER || 'SOCINFRAREAD');
    const readPass = String(env.LOCAL_READONLY_PASSWORD || '');

    if (adminPass.trim().length > 0 && inputUser === adminUser && password === adminPass) {
        return { username: adminUser, role: 'admin' };
    }

    if (readPass.trim().length > 0 && inputUser === readUser && password === readPass) {
        return { username: readUser, role: 'readonly' };
    }

    return null;
}

function authMode(): 'local' | 'ldap' | 'hybrid' {
    const raw = String(env.AUTH_MODE || 'hybrid').trim().toLowerCase();
    if (raw === 'local' || raw === 'ldap' || raw === 'hybrid') {
        return raw;
    }
    return 'hybrid';
}

export async function authenticateUser(username: string, password: string): Promise<AppUser | null> {
    const mode = authMode();
    console.log(`[AUTH] Login attempt for user=${String(username || '').trim()} mode=${mode}`);

    if (mode === 'local') {
        return authenticateLocalUser(username, password);
    }

    if (isLdapConfigured()) {
        try {
            const ldapUser = await authenticateLdapUser(username, password);
            if (ldapUser) {
                console.log(`[AUTH] LDAP success user=${ldapUser.username} role=${ldapUser.role}`);
                return { username: ldapUser.username, role: ldapUser.role };
            }
            console.log('[AUTH] LDAP auth returned no user');
        } catch (err) {
            console.error('LDAP authentication error:', err);
        }
    } else {
        console.log('[AUTH] LDAP not configured, skipping LDAP authentication');
    }

    if (mode === 'ldap') {
        console.log('[AUTH] AUTH_MODE=ldap and LDAP failed: denying access');
        return null;
    }

    console.log('[AUTH] Falling back to local authentication');
    return authenticateLocalUser(username, password);
}

export function createSession(user: AppUser): SessionRecord {
    const token = `${Date.now().toString(36)}-${randomBytes(16).toString('hex')}`;
    const expiresAt = Date.now() + tokenTtlMs();
    const record: SessionRecord = { token, user, expiresAt };
    sessions.set(token, record);
    return record;
}

export function getSession(token: string): SessionRecord | null {
    const existing = sessions.get(token);
    if (!existing) {
        return null;
    }

    if (existing.expiresAt <= Date.now()) {
        sessions.delete(token);
        return null;
    }

    return existing;
}

export function revokeSession(token: string): void {
    sessions.delete(token);
}
