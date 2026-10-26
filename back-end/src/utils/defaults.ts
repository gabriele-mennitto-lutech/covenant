function isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

const AMBIENTE_BY_PREFIX: [string, string][] = [
    ['u', 'Sviluppo'],
    ['r', 'Collaudo'],
    ['l', 'Produzione'],
];

const LOCAZIONE_BY_KEYWORDS: [string[], string][] = [
    [['tocav', 'tocerv'], 'Torino'],
    [['rmteul', 'rmteiv'], 'Teulada'],
    [['rmsaxa'], 'Saxa'],
];

function detectAmbiente(hostnameLower: string): string | undefined {
    return AMBIENTE_BY_PREFIX.find(([prefix]) => hostnameLower.startsWith(prefix))?.[1];
}

function detectLocazione(hostnameLower: string): string | undefined {
    return LOCAZIONE_BY_KEYWORDS.find(([keywords]) => keywords.some(k => hostnameLower.includes(k)))?.[1];
}

export function applyDefaultsToHost(host: any) {
    const hostnameLower = (host.hostname || '').toLowerCase();

    // Boolean defaults
    if (isEmpty(host.fixed)) host.fixed = true;
    if (isEmpty(host.fixable)) host.fixable = true;
    if (isEmpty(host.status)) host.status = true;

    // Ambiente (forzato da lettera iniziale hostname)
    const ambiente = detectAmbiente(hostnameLower);
    if (ambiente) host.ambiente = ambiente;

    // Nodo (0 = standalone)
    if (isEmpty(host.nodo)) host.nodo = 0;

    // Locazione
    if (!host.locazione) {
        const locazione = detectLocazione(hostnameLower);
        if (locazione) host.locazione = locazione;
    }

    // Zona
    if (!host.zona) host.zona = 'Intranet';

    return host;
}
