import { Client } from 'ldapts';

type AppRole = 'admin' | 'readonly';

export interface LdapAuthenticatedUser {
    username: string;
    role: AppRole;
}

const env = ((globalThis as any).process?.env || {}) as Record<string, string | undefined>;

function ldapDebugEnabled(): boolean {
    return asBool(env.LDAP_DEBUG, false);
}

function ldapLog(message: string, details?: Record<string, unknown>): void {
    if (!ldapDebugEnabled()) return;
    if (details) {
        console.log(`[LDAP] ${message}`, details);
        return;
    }
    console.log(`[LDAP] ${message}`);
}

function parseIntEnv(key: string, fallback: number): number {
    const raw = Number(env[key] || '');
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function asBool(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    const v = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
    return fallback;
}

function normalizeUsername(username: string): string {
    return String(username || '').trim();
}

function stripDomainFromUsername(username: string): string {
    const trimmed = normalizeUsername(username);
    if (!trimmed) return '';

    if (trimmed.includes('\\')) {
        const parts = trimmed.split('\\');
        return parts.at(-1) || '';
    }

    if (trimmed.includes('@')) {
        return trimmed.split('@')[0] || '';
    }

    return trimmed;
}

function ldapUrl(): string {
    const explicit = normalizeUsername(env.LDAP_URL || '');
    if (explicit) return explicit;

    const server = normalizeUsername(env.LDAP_SERVER || '');
    if (!server) return '';
    const port = parseIntEnv('LDAP_PORT', 389);
    const scheme = asBool(env.LDAP_USE_TLS, false) ? 'ldaps' : 'ldap';
    return `${scheme}://${server}:${port}`;
}

function baseDn(): string {
    return normalizeUsername(env.LDAP_BASE_DN || '');
}

function ldapEnabled(): boolean {
    return !!ldapUrl() && !!baseDn();
}

function userPrincipalCandidates(inputUsername: string): string[] {
    const out = new Set<string>();
    const trimmed = normalizeUsername(inputUsername);
    if (!trimmed) return [];

    out.add(trimmed);

    const bare = stripDomainFromUsername(trimmed);
    if (bare) out.add(bare);

    const defaultDomain = normalizeUsername(env.LDAP_DEFAULT_DOMAIN || '');
    if (defaultDomain && bare && !trimmed.includes('@')) {
        out.add(`${bare}@${defaultDomain}`);
    }

    const netbiosDomain = normalizeUsername(env.LDAP_NETBIOS_DOMAIN || '');
    if (netbiosDomain && bare && !trimmed.includes('\\')) {
        out.add(`${netbiosDomain}\\${bare}`);
    }

    return Array.from(out);
}

function escapeFilterValue(value: string): string {
    return value
    .replaceAll('\\', String.raw`\5c`)
    .replaceAll('*', String.raw`\2a`)
    .replaceAll('(', String.raw`\28`)
    .replaceAll(')', String.raw`\29`)
    .replaceAll('\0', String.raw`\00`);
}

function toStringList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);

    switch (typeof value) {
        case 'undefined':
            return [];
        case 'object':
            return value === null ? [] : [JSON.stringify(value)];
        default:
            return [String(value)];
    }
}

function extractGroupsFromMemberOf(entry: Record<string, unknown>): string[] {
    const raw = toStringList((entry as any).memberOf);
    const groups = raw.map((dn) => {
        const first = dn.split(',')[0] || '';
        return first.replace(/^CN=/i, '').trim();
    }).filter(Boolean);
    return Array.from(new Set(groups));
}

function resolveRoleFromGroups(groups: string[]): AppRole | null {
    const upper = new Set(groups.map(g => g.toUpperCase()));
    const adminGroup = normalizeUsername(env.LDAP_GROUP_ADMIN || 'AM_WINDOWSSITE_ADM').toUpperCase();
    const readonlyGroup = normalizeUsername(env.LDAP_GROUP_READONLY || 'AM_WINDOWSSITE_READ').toUpperCase();

    if (adminGroup && upper.has(adminGroup)) return 'admin';
    if (readonlyGroup && upper.has(readonlyGroup)) return 'readonly';
    return null;
}

async function verifyUserCredentials(principals: string[], password: string): Promise<string | null> {
    const url = ldapUrl();
    if (!url) return null;

    const timeout = parseIntEnv('LDAP_CONNECT_TIMEOUT_MS', 5000);
    const tlsRejectUnauthorized = asBool(env.LDAP_TLS_REJECT_UNAUTHORIZED, false);

    ldapLog('Starting credential verification', {
        url,
        timeout,
        tlsRejectUnauthorized,
        candidateCount: principals.length,
        candidates: principals
    });

    for (const principal of principals) {
        const client = new Client({
            url,
            timeout,
            connectTimeout: timeout,
            tlsOptions: { rejectUnauthorized: tlsRejectUnauthorized }
        });

        try {
            ldapLog('Trying bind with candidate principal', { principal });
            await client.bind(principal, password);
            ldapLog('Bind succeeded', { principal });
            return principal;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            ldapLog('Bind failed for candidate principal', { principal, error: errMsg });
            // Try next principal candidate.
        } finally {
            try {
                await client.unbind();
            } catch {
                // Ignore unbind errors.
            }
        }
    }

    return null;
}

async function searchUserEntry(username: string, verifiedPrincipal: string, password: string): Promise<Record<string, unknown> | null> {
    const url = ldapUrl();
    if (!url) return null;

    const timeout = parseIntEnv('LDAP_SEARCH_TIMEOUT_MS', 5000);
    const tlsRejectUnauthorized = asBool(env.LDAP_TLS_REJECT_UNAUTHORIZED, false);

    const bindUser = normalizeUsername(env.LDAP_BIND_USER || '') || verifiedPrincipal;
    const bindPassword = bindUser === verifiedPrincipal
        ? password
        : normalizeUsername(env.LDAP_BIND_PASSWORD || '');

    ldapLog('Preparing user search', {
        username,
        verifiedPrincipal,
        bindUser,
        usingServiceAccount: bindUser !== verifiedPrincipal,
        baseDn: baseDn(),
        timeout,
        tlsRejectUnauthorized
    });

    const client = new Client({
        url,
        timeout,
        connectTimeout: timeout,
        tlsOptions: { rejectUnauthorized: tlsRejectUnauthorized }
    });

    const sam = escapeFilterValue(stripDomainFromUsername(username));
    const upn = escapeFilterValue(verifiedPrincipal.includes('@') ? verifiedPrincipal : `${sam}@${normalizeUsername(env.LDAP_DEFAULT_DOMAIN || '')}`);
    const filter = `(&(objectClass=user)(|(sAMAccountName=${sam})(userPrincipalName=${upn})))`;

    ldapLog('LDAP search filter generated', { filter });

    try {
        await client.bind(bindUser, bindPassword);
        ldapLog('Search bind succeeded', { bindUser });
        const result = await client.search(baseDn(), {
            scope: 'sub',
            filter,
            attributes: ['sAMAccountName', 'memberOf']
        });

        ldapLog('Search completed', {
            entriesFound: result.searchEntries?.length || 0
        });

        if (!result.searchEntries || result.searchEntries.length === 0) {
            ldapLog('No LDAP entries found for user', { username, verifiedPrincipal });
            return null;
        }

        return result.searchEntries[0];
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        ldapLog('Search failed', { error: errMsg, bindUser });
        throw err;
    } finally {
        try {
            await client.unbind();
        } catch {
            // Ignore unbind errors.
        }
    }
}

export async function authenticateLdapUser(username: string, password: string): Promise<LdapAuthenticatedUser | null> {
    const normalized = normalizeUsername(username);
    if (!normalized || !password) {
        ldapLog('Missing username or password in request');
        return null;
    }
    if (!ldapEnabled()) {
        ldapLog('LDAP is not enabled because URL or BASE_DN is missing', {
            ldapUrl: ldapUrl(),
            baseDn: baseDn()
        });
        return null;
    }

    const principals = userPrincipalCandidates(normalized);
    ldapLog('Principal candidates generated', { inputUsername: normalized, principals });
    if (principals.length === 0) return null;

    const verifiedPrincipal = await verifyUserCredentials(principals, password);
    if (!verifiedPrincipal) {
        ldapLog('No principal could bind successfully', { inputUsername: normalized });
        return null;
    }

    const userEntry = await searchUserEntry(normalized, verifiedPrincipal, password);
    if (!userEntry) {
        ldapLog('User entry search returned no data', { inputUsername: normalized, verifiedPrincipal });
        return null;
    }

    const groups = extractGroupsFromMemberOf(userEntry);
    ldapLog('Groups extracted from memberOf', { groups });
    const role = resolveRoleFromGroups(groups);
    if (!role) {
        ldapLog('No matching role group found for user', {
            expectedAdminGroup: normalizeUsername(env.LDAP_GROUP_ADMIN || 'AM_WINDOWSSITE_ADM'),
            expectedReadonlyGroup: normalizeUsername(env.LDAP_GROUP_READONLY || 'AM_WINDOWSSITE_READ')
        });
        return null;
    }

    const effectiveUsername = String((userEntry as any).sAMAccountName || stripDomainFromUsername(normalized)).toUpperCase();
    ldapLog('LDAP authentication succeeded', { effectiveUsername, role });
    return { username: effectiveUsername, role };
}

export function isLdapConfigured(): boolean {
    return ldapEnabled();
}
