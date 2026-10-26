/** Motivo attesa di default per i problem/CVE in analisi. */
export const DEFAULT_MOTIVO_ATTESA = 'In analisi';

/** Esiti di archiviazione standard. Qualsiasi altro valore e una motivazione custom ("Altro"). */
export const CVE_ESITI_STANDARD = [
    'VULN_CLIENT',
    'APP_NON_PRESENTE',
    'PROSSIMO_PATCHING',
    'NON_IMPATTANTE',
    'NON_IN_CARICO_SOC'
] as const;

/** Valore filtro che raggruppa tutte le motivazioni non standard. */
export const CVE_ESITO_ALTRO = 'ALTRO';

/** Codici legacy del motivo attesa (prima che diventasse testo libero). */
export const LEGACY_MOTIVO_LABELS: Record<string, string> = {
    DA_ANALIZZARE: DEFAULT_MOTIVO_ATTESA,
    PATCH_IN_CORSO: 'Patch in corso',
    CONSULTAZIONE: 'Consultazione con altri',
    ATTESA_INFO: 'Attesa informazioni',
    ALTRO: 'Altro'
};

const CVE_IN_TEXT_REGEX = /CVE-\d{4}-\d{4,}/i;

/** Estrae l'ID CVE da un testo tipo "Vulnerabilità - CVE-2026-69397 - Prodotto". */
export function extractCveId(text: string | null | undefined): string | null {
    const match = CVE_IN_TEXT_REGEX.exec(text || '');
    return match ? match[0].toUpperCase() : null;
}

/** Estrae il prodotto impattato da un Riepilogo/CVE Origin tipo "Vulnerabilità - CVE-... - Prodotto". */
export function extractProduct(text: string | null | undefined): string | null {
    if (!text) return null;
    const parts = String(text)
        .split(/\s+-\s+/)
        .map(p => p.trim())
        .filter(p => p && !/^vulnerabilit/i.test(p) && !/^CVE-\d{4}-\d{4,}$/i.test(p));
    const product = parts.join(' - ').trim();
    return product || null;
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

/** Data/ora locale corrente in formato YYYY-MM-DDTHH:MM:SS. */
export function nowLocalIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Data locale corrente in formato YYYY-MM-DD. */
export function todayLocal(): string {
    return nowLocalIso().slice(0, 10);
}
