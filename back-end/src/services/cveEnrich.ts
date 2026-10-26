/**
 * Completamento dei campi mancanti di una CVE tracciata (vendor, prodotto, score)
 * con i dati restituiti da cve-search, la stessa API usata dalla tab "Ricerca CVE".
 */
import { CVE_ID_REGEX, CveDetails, fetchCveDetails } from './cveSearch';

/** Campi che possono essere completati da cve-search. */
export type CveEnrichableField = 'vendor' | 'prodotto' | 'score';

/** Numero massimo di vendor/prodotti riportati nei campi testuali. */
const MAX_AFFECTED = 3;

function uniqueValues(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        const value = v.trim();
        const key = value.toLowerCase();
        if (!value || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}

function isMissing(value: unknown): boolean {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/** Valori ricavabili da cve-search per i campi della CVE tracciata. */
export function enrichableValues(details: CveDetails): Record<CveEnrichableField, string | number | null> {
    const vendors = uniqueValues(details.affected.map(a => a.vendor)).slice(0, MAX_AFFECTED);
    const products = uniqueValues(details.affected.map(a => a.product)).slice(0, MAX_AFFECTED);
    const score = details.cvss.find(c => c.score !== null)?.score ?? null;
    return {
        vendor: vendors.join(', ') || null,
        prodotto: products.join(', ') || null,
        score
    };
}

/** Restituisce solo i campi mancanti nella CVE che cve-search e in grado di valorizzare. */
export function missingFieldsFrom(cve: Record<string, any>, details: CveDetails): Partial<Record<CveEnrichableField, string | number>> {
    const values = enrichableValues(details);
    const changes: Partial<Record<CveEnrichableField, string | number>> = {};
    for (const field of Object.keys(values) as CveEnrichableField[]) {
        const value = values[field];
        if (value !== null && isMissing(cve[field])) changes[field] = value;
    }
    return changes;
}

/** Indica se la CVE ha campi che cve-search potrebbe completare. */
export function needsEnrichment(cve: Record<string, any>): boolean {
    return isMissing(cve.vendor) || isMissing(cve.prodotto) || isMissing(cve.score);
}

/**
 * Completa (best effort) i campi mancanti di un payload di creazione: in caso di errore di cve-search
 * il payload viene restituito invariato, la creazione non deve fallire per un servizio esterno.
 */
export async function enrichPayload<T extends Record<string, any>>(payload: T): Promise<{ payload: T; filled: CveEnrichableField[] }> {
    const cveId = typeof payload?.cve_id === 'string' ? payload.cve_id.trim().toUpperCase() : '';
    if (!CVE_ID_REGEX.test(cveId) || !needsEnrichment(payload)) return { payload, filled: [] };
    try {
        const changes = missingFieldsFrom(payload, await fetchCveDetails(cveId));
        return { payload: { ...payload, ...changes }, filled: Object.keys(changes) as CveEnrichableField[] };
    } catch (err: any) {
        console.warn(`cve-search enrichment skipped for ${cveId}:`, err.message);
        return { payload, filled: [] };
    }
}
