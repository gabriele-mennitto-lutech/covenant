import { getHostColumnNames } from './db';

/** Equivalente lineare di /\s+(\S+)$/: restituisce il nome (prima degli spazi) e l'ultimo token. */
export function splitLastToken(value: string): { name: string; token: string } | null {
    const isSpace = (ch: string) => /\s/.test(ch);
    const end = value.length;
    if (end === 0 || isSpace(value[end - 1])) return null;
    let tokenStart = end;
    while (tokenStart > 0 && !isSpace(value[tokenStart - 1])) tokenStart--;
    if (tokenStart === 0) return null;
    let nameEnd = tokenStart;
    while (nameEnd > 0 && isSpace(value[nameEnd - 1])) nameEnd--;
    return { name: value.slice(0, nameEnd), token: value.slice(tokenStart, end) };
}

export function processOSUpdate(partialUpdate: any) {
    if (partialUpdate.os === undefined) return;

    const osStr = String(partialUpdate.os);
    // Split off the last whitespace-separated token with a linear scan (no regex backtracking on user input).
    const lastToken = splitLastToken(osStr);
    const versionMatch = lastToken ? /^(\d+)(?:\.(\d+))?$/.exec(lastToken.token) : null;

    if (!lastToken || !versionMatch) {
        partialUpdate.os_major = 0;
        partialUpdate.os_minor = '0';
        return;
    }

    const name = lastToken.name;
    partialUpdate.os = name.trim();
    partialUpdate.os_major = Number.parseInt(versionMatch[1], 10);
    partialUpdate.os_minor = versionMatch[2] || '0';
}

export function isConstraintError(err: unknown): boolean {
    return (err as { code?: string })?.code === 'SQLITE_CONSTRAINT';
}

export async function safeRollback(db: any): Promise<void> {
    try {
        await db.run('ROLLBACK');
    } catch {
        // Nessuna transazione attiva: niente da annullare.
    }
}

/**
 * Mantiene solo le colonne supportate della tabella hosts (whitelist),
 * escludendo l'id che non e' mai modificabile dal client.
 */
export function pickWritableHostFields(payload: any): Record<string, any> {
    const columns = getHostColumnNames();
    const result: Record<string, any> = {};
    if (!payload || typeof payload !== 'object') return result;
    for (const key of Object.keys(payload)) {
        if (key !== 'id' && columns.has(key)) {
            result[key] = payload[key];
        }
    }
    return result;
}

export function buildHostInsertColumns(newHost: any): { keys: string[]; placeholders: string[]; values: any[] } {
    const keys: string[] = [];
    const placeholders: string[] = [];
    const values: any[] = [];
    const currentOverrides: string[] = [];

    for (const key of Object.keys(newHost)) {
        keys.push(key);
        placeholders.push('?');

        if (key === 'os_major' || key === 'os_minor') {
            values.push(newHost[key]);
            continue;
        }

        let val = newHost[key];
        if (typeof val === 'boolean') val = val ? 1 : 0;
        values.push(val);

        if (!currentOverrides.includes(key)) {
            currentOverrides.push(key);
        }
    }

    if (!keys.includes('manual_overrides')) {
        keys.push('manual_overrides');
        placeholders.push('?');
        values.push(JSON.stringify(currentOverrides));
    }

    return { keys, placeholders, values };
}

export function mergeOverrides(existing: any, updatedKeys: string[]): string[] {
    let currentOverrides: string[] = [];
    if (existing?.manual_overrides) {
        try {
            const parsed = JSON.parse(existing.manual_overrides);
            currentOverrides = Array.isArray(parsed) ? parsed.filter(key => getHostColumnNames().has(key)) : [];
        } catch (e) {}
    }
    for (const key of updatedKeys) {
        if (!currentOverrides.includes(key)) currentOverrides.push(key);
    }
    return currentOverrides;
}
