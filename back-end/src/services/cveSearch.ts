import axios from 'axios';

/** Base URL dell'istanza cve-search (pubblica CIRCL o interna). */
export const CVE_SEARCH_URL = (process.env.CVE_SEARCH_URL || 'https://cve.circl.lu').replace(/\/+$/, '');
const CVE_SEARCH_TIMEOUT_MS = Number(process.env.CVE_SEARCH_TIMEOUT_MS) || 10000;

export const CVE_ID_REGEX = /^CVE-\d{4}-\d{4,}$/;

export interface CveAffectedProduct {
    vendor: string;
    product: string;
    versions: string[];
}

export interface CveCvssInfo {
    version: string | null;
    score: number | null;
    severity: string | null;
    vector: string | null;
}

export interface CveDetails {
    id: string;
    state: string | null;
    title: string | null;
    summary: string | null;
    published: string | null;
    modified: string | null;
    assigner: string | null;
    cvss: CveCvssInfo[];
    cwe: string[];
    capec: { id: string; name: string }[];
    affected: CveAffectedProduct[];
    references: string[];
    source: string;
    sourceUrl: string;
}

export class CveNotFoundError extends Error { }
export class InvalidCveIdError extends Error { }

function severityFromScore(score: number | null): string | null {
    if (score === null || Number.isNaN(score)) return null;
    if (score >= 9) return 'CRITICAL';
    if (score >= 7) return 'HIGH';
    if (score >= 4) return 'MEDIUM';
    if (score > 0) return 'LOW';
    return 'NONE';
}

function toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
}

/** cpe:2.3:a:vendor:product:version:... -> {vendor, product, version} */
function parseCpe(cpe: string): { vendor: string; product: string; version: string } | null {
    const parts = cpe.split(':');
    if (parts.length < 5 || parts[0] !== 'cpe') return null;
    const offset = parts[1] === '2.3' ? 2 : 1;
    const vendor = parts[offset + 1] || '';
    const product = parts[offset + 2] || '';
    const version = parts[offset + 3] || '';
    if (!vendor || !product) return null;
    return { vendor, product, version: version === '*' || version === '-' ? '' : version };
}

function addAffected(map: Map<string, CveAffectedProduct>, vendor: string, product: string, version?: string) {
    const key = `${vendor.toLowerCase()}|${product.toLowerCase()}`;
    let entry = map.get(key);
    if (!entry) {
        entry = { vendor, product, versions: [] };
        map.set(key, entry);
    }
    if (version && !entry.versions.includes(version) && entry.versions.length < 50) {
        entry.versions.push(version);
    }
}

function describeVersion(v: any): string | null {
    if (!v || typeof v !== 'object') return null;
    if (v.status && v.status !== 'affected') return null;
    const base = v.version && v.version !== '0' && v.version !== '*' ? String(v.version) : '';
    if (v.lessThan) return base ? `${base} < ${v.lessThan}` : `< ${v.lessThan}`;
    if (v.lessThanOrEqual) return base ? `${base} <= ${v.lessThanOrEqual}` : `<= ${v.lessThanOrEqual}`;
    return base || null;
}

function collectCvss5Metrics(metrics: any[], out: CveCvssInfo[]) {
    if (!Array.isArray(metrics)) return;
    for (const m of metrics) {
        for (const [key, version] of [['cvssV4_0', '4.0'], ['cvssV3_1', '3.1'], ['cvssV3_0', '3.0'], ['cvssV2_0', '2.0']] as const) {
            const c = m?.[key];
            if (!c) continue;
            const score = toNumber(c.baseScore);
            if (out.some(x => x.version === version && x.score === score)) continue;
            out.push({
                version,
                score,
                severity: c.baseSeverity ? String(c.baseSeverity).toUpperCase() : severityFromScore(score),
                vector: c.vectorString || null
            });
        }
    }
}

function collectCwe5(problemTypes: any[], out: Set<string>) {
    if (!Array.isArray(problemTypes)) return;
    for (const pt of problemTypes) {
        for (const d of pt?.descriptions || []) {
            if (d?.cweId) out.add(d.cweId);
            else if (typeof d?.description === 'string' && /^CWE-\d+/.test(d.description)) out.add(d.description.split(' ')[0]);
        }
    }
}

/** Normalizza un record in formato CVE JSON 5 (vulnerability-lookup / cve.circl.lu attuale). */
function normalizeCve5(data: any, id: string): CveDetails {
    const meta = data.cveMetadata || {};
    const cna = data.containers?.cna || {};
    const adp: any[] = Array.isArray(data.containers?.adp) ? data.containers.adp : [];

    const descriptions: any[] = cna.descriptions || [];
    const description = descriptions.find(d => d?.lang?.toLowerCase().startsWith('en')) || descriptions[0];

    const cvss: CveCvssInfo[] = [];
    collectCvss5Metrics(cna.metrics, cvss);
    for (const a of adp) collectCvss5Metrics(a?.metrics, cvss);

    const cwe = new Set<string>();
    collectCwe5(cna.problemTypes, cwe);
    for (const a of adp) collectCwe5(a?.problemTypes, cwe);

    const affected = new Map<string, CveAffectedProduct>();
    for (const a of [...(cna.affected || []), ...adp.flatMap(x => x?.affected || [])]) {
        const vendor = a?.vendor && a.vendor !== 'n/a' ? String(a.vendor) : '';
        const product = a?.product && a.product !== 'n/a' ? String(a.product) : '';
        if (!vendor && !product) continue;
        const versions: string[] = (a.versions || []).map(describeVersion).filter(Boolean);
        if (versions.length === 0) addAffected(affected, vendor, product);
        for (const v of versions) addAffected(affected, vendor, product, v);
    }

    const references = new Set<string>();
    for (const r of [...(cna.references || []), ...adp.flatMap(x => x?.references || [])]) {
        if (r?.url) references.add(r.url);
    }

    return {
        id: meta.cveId || id,
        state: meta.state || null,
        title: cna.title || null,
        summary: description?.value || null,
        published: meta.datePublished || cna.datePublic || null,
        modified: meta.dateUpdated || null,
        assigner: meta.assignerShortName || null,
        cvss,
        cwe: [...cwe],
        capec: [],
        affected: [...affected.values()],
        references: [...references],
        source: 'cve-search',
        sourceUrl: `${CVE_SEARCH_URL}/vuln/${encodeURIComponent(id)}`
    };
}

/** Normalizza un record nel formato storico cve-search (id, summary, cvss, vulnerable_configuration...). */
function normalizeLegacy(data: any, id: string): CveDetails {
    const cvss: CveCvssInfo[] = [];
    const cvss3 = toNumber(data.cvss3);
    if (cvss3 !== null) {
        cvss.push({ version: '3.x', score: cvss3, severity: severityFromScore(cvss3), vector: data['cvss3-vector'] || null });
    }
    const cvss2 = toNumber(data.cvss);
    if (cvss2 !== null) {
        cvss.push({ version: '2.0', score: cvss2, severity: severityFromScore(cvss2), vector: data['cvss-vector'] || null });
    }

    const affected = new Map<string, CveAffectedProduct>();
    const cpes: any[] = [...(data.vulnerable_product || []), ...(data.vulnerable_configuration || [])];
    for (const entry of cpes) {
        const cpe = typeof entry === 'string' ? entry : entry?.id;
        if (typeof cpe !== 'string') continue;
        const parsed = parseCpe(cpe);
        if (parsed) addAffected(affected, parsed.vendor, parsed.product, parsed.version);
    }

    const cwe = typeof data.cwe === 'string' && data.cwe && data.cwe !== 'Unknown' ? [data.cwe] : [];
    const capec = Array.isArray(data.capec)
        ? data.capec.filter((c: any) => c?.id).map((c: any) => ({ id: String(c.id), name: c.name || '' }))
        : [];

    return {
        id: data.id || id,
        state: null,
        title: null,
        summary: data.summary || null,
        published: data.Published || null,
        modified: data.Modified || data['last-modified'] || null,
        assigner: data.assigner || null,
        cvss,
        cwe,
        capec,
        affected: [...affected.values()],
        references: Array.isArray(data.references) ? data.references.filter((r: any) => typeof r === 'string') : [],
        source: 'cve-search',
        sourceUrl: `${CVE_SEARCH_URL}/cve/${encodeURIComponent(id)}`
    };
}

export function normalizeCveSearchResponse(data: any, id: string): CveDetails {
    if (data?.cveMetadata || data?.containers) return normalizeCve5(data, id);
    return normalizeLegacy(data, id);
}

/**
 * Recupera i dettagli di una CVE dall'API cve-search (GET {CVE_SEARCH_URL}/api/cve/{id}).
 * L'id deve essere gia validato con CVE_ID_REGEX.
 */
export async function fetchCveDetails(cveId: string): Promise<CveDetails> {
    const id = cveId.toUpperCase();
    if (!CVE_ID_REGEX.test(id)) {
        throw new InvalidCveIdError('Invalid CVE id');
    }
    try {
        const response = await axios.get(`${CVE_SEARCH_URL}/api/cve/${encodeURIComponent(id)}`, {
            timeout: CVE_SEARCH_TIMEOUT_MS,
            headers: { Accept: 'application/json' }
        });
        const data = response.data;
        if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            throw new CveNotFoundError(`${id} not found`);
        }
        return normalizeCveSearchResponse(data, id);
    } catch (err: any) {
        if (err.response?.status === 404) {
            throw new CveNotFoundError(`${id} not found`);
        }
        throw err;
    }
}
