import { isIP } from 'node:net';
import { windowsFamily } from '../utils/windows';

export type SourceType = 'hosts' | 'services' | 'sites' | 'cves';
type Text = string | null;

export interface SourceHost {
    id: number;
    hostname: string;
    ambiente: Text;
    servizio: Text;
    applicazione: Text;
    note: Text;
    os: Text;
    os_major: number | null;
    os_minor: Text;
    ipfe: Text;
    ipmgt: Text;
    ipfe2al: Text;
}

export interface SourceService { id: number; servizio: Text }
export interface SourceSite {
    id: number;
    url_aliases: Text;
    host_reali: Text;
    ip_reali: Text;
    servizio: Text;
    ambiente: Text;
}
export interface SourceCve {
    id: number;
    cve_id: string;
    problem_id: Text;
    prodotto: Text;
    cve_origin: Text;
    note: Text;
    asset_impattati: Text;
    stato: Text;
}
export interface SourceData {
    hosts: SourceHost[];
    services: SourceService[];
    sites: SourceSite[];
    cves: SourceCve[];
}
export interface CrossReference {
    type: SourceType;
    id: number;
    label: string;
    context: string;
    confidence: 'direct' | 'potential';
    reasons: string[];
}
type Evidence = Pick<CrossReference, 'confidence' | 'reasons'>;

const normalize = (value: Text | undefined): string => (value || '').trim().toLowerCase();
const meaningful = (value: Text | undefined): boolean =>
    !!normalize(value) && !['n/a', 'na', 'none', 'null', '-', 'no', 'unknown', 'non definito'].includes(normalize(value));
const tokens = (value: Text): string[] => normalize(value).split(/[\s,;|]+/).filter(Boolean);
const words = (value: Text): string => normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
const containsPhrase = (text: Text, phrase: Text): boolean => {
    const needle = words(phrase);
    return meaningful(phrase) && needle.length >= 3 && ` ${words(text)} `.includes(` ${needle} `);
};
const direct = (reason: string): Evidence => ({ confidence: 'direct', reasons: [reason] });
const potential = (reason: string): Evidence => ({ confidence: 'potential', reasons: [reason] });

function sameName(a: Text, b: Text): boolean {
    const left = normalize(a).replace(/\.$/, '');
    const right = normalize(b).replace(/\.$/, '');
    if (!meaningful(left) || !meaningful(right)) return false;
    if (left === right) return true;
    if (isIP(left) || isIP(right)) return false;
    // Due FQDN di domini diversi non identificano necessariamente la stessa macchina.
    return (!left.includes('.') || !right.includes('.')) && left.split('.')[0] === right.split('.')[0];
}

function serviceEvidence(value: Text, service: Text): Evidence | null {
    if (!meaningful(service)) return null;
    if (normalize(value).split(/[,;|\n]+/).some(part => part.trim() === normalize(service))) {
        return direct(`Servizio dichiarato: ${service}`);
    }
    if (GENERIC_PRODUCTS.has(words(service))) return null;
    return containsPhrase(value, service) ? potential(`Nome servizio nel testo: ${service}`) : null;
}

function hostService(host: SourceHost, service: SourceService): Evidence | null {
    return serviceEvidence(host.servizio, service.servizio)
        || (containsPhrase(host.applicazione, service.servizio) ? potential(`Servizio nell'applicazione: ${service.servizio}`) : null);
}

function siteHost(site: SourceSite, host: SourceHost): Evidence | null {
    const hostTokens = tokens(site.host_reali);
    const ips = [host.ipfe, host.ipmgt, host.ipfe2al].flatMap(tokens).filter(ip => isIP(ip));
    let evidence: Evidence | null = null;
    if (hostTokens.some(name => sameName(name, host.hostname))) {
        evidence = direct('Hostname presente negli host reali del sito');
    } else if (hostTokens.some(ip => ips.includes(ip))) {
        evidence = direct('IP di un host reale presente nelle interfacce salvate');
    } else if (tokens(site.ip_reali).some(ip => ips.includes(ip))) {
        evidence = potential('IP/VIP del sito presente nelle interfacce salvate (verificare il bilanciamento)');
    } else if (tokens(site.url_aliases).some(alias => {
        const value = alias.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
        return sameName(value, host.hostname);
    })) {
        evidence = potential('Nome nell’URL corrispondente all’hostname (nessuna risoluzione DNS)');
    }
    if (!evidence) return null;
    if (meaningful(site.ambiente) && normalize(site.ambiente) !== normalize(host.ambiente)) {
        return potential(`${evidence.reasons[0]}; ambiente differente: ${host.ambiente || 'non indicato'}`);
    }
    return evidence;
}

const PRODUCT_ALIASES = [
    ['microsoft internet information services', 'internet information services', 'iis'],
    ['microsoft sql server', 'sql server', 'mssql'],
    ['microsoft .net', '.net framework', '.net runtime', '.net', 'dotnet', 'asp.net'],
    ['apache tomcat', 'tomcat'],
    ['postgresql', 'postgres'],
    ['oracle weblogic', 'weblogic'],
    ['oracle java', 'openjdk', 'java'],
    ['mozilla firefox', 'firefox'],
    ['openssh'], ['openssl'], ['mysql'], ['mariadb'], ['mongodb'],
    ['apache log4j', 'log4j', 'log4j2']
];
const GENERIC_PRODUCTS = new Set([
    'windows', 'windows server', 'microsoft windows', 'microsoft windows server', 'microsoft',
    'oracle', 'apache', 'server', 'kernel', 'software', 'vulnerability', 'vulnerabilita'
]);

function productEvidence(cve: SourceCve, inventoryText: Text): Evidence | null {
    const text = [cve.prodotto, cve.cve_origin, cve.note].filter(Boolean).join(' ');
    const product = words(cve.prodotto).replace(/\s+\d.*$/, '').trim();
    if (product.length >= 4 && !GENERIC_PRODUCTS.has(product) && containsPhrase(inventoryText, product)) {
        return potential(`Prodotto "${cve.prodotto}" presente nel testo inventariato; versione da verificare`);
    }
    const aliases = PRODUCT_ALIASES.find(group =>
        group.some(alias => containsPhrase(text, alias)) && group.some(alias => containsPhrase(inventoryText, alias)));
    if (aliases) {
        return potential(`Prodotto ${aliases[0]} citato nella CVE e nel testo inventariato; versione da verificare`);
    }
    const service = normalize(inventoryText);
    if (service.length >= 4 && !GENERIC_PRODUCTS.has(service) && containsPhrase(text, service)) {
        return potential(`Testo "${inventoryText}" citato nel prodotto/descrizione della CVE; versione da verificare`);
    }
    return null;
}

interface WindowsTarget {
    family: 'Windows' | 'Windows Server';
    versions: string[];
}

function windowsTargets(text: Text): WindowsTarget[] {
    const result: WindowsTarget[] = [];
    const regex = /\bwindows(\s+server)?(?:\s+(?:versions?|releases?))?(?:\s+(\d+(?:\.\d+)?(?:\s*(?:,|\/|and|e|&|or)\s*\d+(?:\.\d+)?)*))?/gi;
    for (const match of (text || '').replace(/[()]/g, ' ').matchAll(regex)) {
        result.push({
            family: match[1] ? 'Windows Server' : 'Windows',
            versions: match[2]?.match(/\d+(?:\.\d+)?/g) || []
        });
    }
    return result;
}

function cveHost(cve: SourceCve, host: SourceHost): Evidence | null {
    if (tokens(cve.asset_impattati).some(name => sameName(name, host.hostname))) {
        return potential('Hostname dichiarato negli asset impattati della CVE (da verificare)');
    }
    const primaryText = cve.prodotto || cve.cve_origin || cve.note || '';
    // Solo un prodotto OS esplicito abilita l'euristica OS: SQL Server e prodotti
    // "per Windows" non implicano una vulnerabilita' del sistema operativo.
    if (/^(?:microsoft\s+)?windows(?:\s+server)?(?:\s+(?:\d|versions?\b|releases?\b)|\s*$)/i.test(primaryText.trim())) {
        const family = windowsFamily(host.os);
        if (family === 'Other') return null;
        const targets = windowsTargets([cve.prodotto, cve.cve_origin, cve.note].filter(Boolean).join(' '));
        const explicitTargets = targets.filter(target => target.versions.length);
        const familyTargets = (explicitTargets.length ? explicitTargets : targets).filter(target => target.family === family);
        if (!familyTargets.length) return null;
        const osVersion = String(host.os_major || /\b(\d+)\b/.exec(host.os || '')?.[1] || '');
        const supported = family === 'Windows Server' ? ['2016', '2019', '2022', '2025'] : ['10', '11'];
        const versions = familyTargets.flatMap(target => target.versions);
        if (versions.length) {
            if (!supported.includes(osVersion) || !versions.includes(osVersion)) return null;
            return potential(`${family} ${osVersion} citato nella CVE e presente nell’OS; build, edizione e patch da verificare`);
        }
        return potential(`${family} citato nella CVE e presente nell’OS; versione impattata non determinabile`);
    }
    for (const [field, value] of [['servizio', host.servizio], ['applicazione', host.applicazione], ['note', host.note]]) {
        const evidence = productEvidence(cve, value);
        if (evidence) return potential(`${field}: ${evidence.reasons[0]}`);
    }
    return null;
}

/** Correlazioni in sola lettura: le euristiche non modificano mai il workflow CVE. */
export class CrossSourceService {
    private readonly references = new Map<string, CrossReference>();
    private readonly hostsById: Map<number, SourceHost>;
    private readonly servicesById: Map<number, SourceService>;
    private readonly sitesById: Map<number, SourceSite>;
    private readonly cvesById: Map<number, SourceCve>;

    constructor(private readonly data: SourceData) {
        this.hostsById = new Map(data.hosts.map(row => [row.id, row]));
        this.servicesById = new Map(data.services.map(row => [row.id, row]));
        this.sitesById = new Map(data.sites.map(row => [row.id, row]));
        this.cvesById = new Map(data.cves.map(row => [row.id, row]));
        for (const type of ['hosts', 'services', 'sites', 'cves'] as const) {
            for (const row of data[type]) {
                this.references.set(`${type}:${row.id}`, this.describe(type, row.id));
            }
        }
    }

    find(type: SourceType, id: number): CrossReference | undefined {
        return this.references.get(`${type}:${id}`);
    }

    private describe(type: SourceType, id: number): CrossReference {
        let label = '';
        let context = '';
        if (type === 'hosts') {
            const row = this.hostsById.get(id)!;
            label = row.hostname;
            const os = row.os_major ? `${row.os || ''} ${row.os_major}${row.os_minor ? `.${row.os_minor}` : ''}` : row.os;
            context = [row.ambiente, os].filter(Boolean).join(' · ');
        } else if (type === 'services') {
            label = this.servicesById.get(id)!.servizio || `Servizio ${id}`;
        } else if (type === 'sites') {
            const row = this.sitesById.get(id)!;
            label = row.url_aliases || `Sito ${id}`;
            context = row.ambiente || '';
        } else {
            const row = this.cvesById.get(id)!;
            label = row.cve_id;
            context = [row.problem_id, row.prodotto, row.stato].filter(Boolean).join(' · ');
        }
        return { type, id, label, context, ...direct('Sorgente selezionata') };
    }

    related(type: SourceType, id: number): CrossReference[] {
        const found = new Map<string, CrossReference>();
        const add = (target: SourceType, targetId: number, evidence: Evidence | null) => {
            if (!evidence || (target === type && targetId === id)) return;
            const key = `${target}:${targetId}`;
            const existing = found.get(key);
            if (existing) {
                existing.reasons = [...new Set([...existing.reasons, ...evidence.reasons])];
                if (evidence.confidence === 'direct') existing.confidence = 'direct';
            } else {
                found.set(key, { ...this.references.get(key)!, ...evidence });
            }
        };
        let linkedHosts: SourceHost[] = [];
        if (type === 'hosts') {
            linkedHosts = this.data.hosts.filter(host => host.id === id);
            const source = linkedHosts[0];
            if (!source) return [];
        } else if (type === 'services') {
            const service = this.data.services.find(item => item.id === id);
            if (!service) return [];
            linkedHosts = this.data.hosts.filter(host => {
                const evidence = hostService(host, service);
                add('hosts', host.id, evidence);
                return !!evidence;
            });
            for (const site of this.data.sites) add('sites', site.id, serviceEvidence(site.servizio, service.servizio));
            for (const cve of this.data.cves) add('cves', cve.id, productEvidence(cve, service.servizio));
        } else if (type === 'sites') {
            const site = this.data.sites.find(item => item.id === id);
            if (!site) return [];
            linkedHosts = this.data.hosts.filter(host => {
                const evidence = siteHost(site, host);
                add('hosts', host.id, evidence);
                return !!evidence;
            });
            for (const service of this.data.services) add('services', service.id, serviceEvidence(site.servizio, service.servizio));
            for (const cve of this.data.cves) add('cves', cve.id, productEvidence(cve, site.servizio));
        } else {
            const cve = this.data.cves.find(item => item.id === id);
            if (!cve) return [];
            linkedHosts = this.data.hosts.filter(host => {
                const evidence = cveHost(cve, host);
                add('hosts', host.id, evidence);
                return !!evidence;
            });
            for (const service of this.data.services) add('services', service.id, productEvidence(cve, service.servizio));
            for (const site of this.data.sites) add('sites', site.id, productEvidence(cve, site.servizio));
        }
        for (const service of this.data.services) {
            const host = linkedHosts.find(item => hostService(item, service));
            if (host) add('services', service.id, type === 'hosts' ? hostService(host, service)
                : potential(`Tramite host ${host.hostname} (${host.ambiente || 'ambiente non indicato'})`));
        }
        for (const site of this.data.sites) {
            const host = linkedHosts.find(item => siteHost(site, item));
            if (host) add('sites', site.id, type === 'hosts' ? siteHost(site, host)
                : potential(`Tramite host ${host.hostname} (${host.ambiente || 'ambiente non indicato'})`));
        }
        if (type !== 'cves') {
            for (const cve of this.data.cves) {
                const host = linkedHosts.find(item => cveHost(cve, item));
                if (host) add('cves', cve.id, potential(`${host.hostname}: ${cveHost(cve, host)!.reasons.join('; ')}`));
            }
        }
        return [...found.values()].sort((a, b) =>
            Number(a.confidence === 'potential') - Number(b.confidence === 'potential')
            || a.type.localeCompare(b.type) || a.label.localeCompare(b.label) || a.id - b.id);
    }
}
