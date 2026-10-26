/**
 * Export CSV dei problem/CVE tracciati (sezione In analisi o Archiviate).
 *
 * Le prime colonne coincidono con il template di import (stesso formato dell'export ITSM),
 * quindi il file esportato puo essere reimportato; le colonne successive riportano i dati di workflow.
 */
import { CVE_IMPORT_HEADERS } from './cveImport';

/** Etichette leggibili degli esiti standard. */
export const CVE_ESITO_LABELS: Record<string, string> = {
    VULN_CLIENT: 'Vulnerabilità di tipo client',
    APP_NON_PRESENTE: 'Applicativo non presente',
    PROSSIMO_PATCHING: 'Prossimo giro di patching',
    NON_IMPATTANTE: 'Vulnerabilità non impattante',
    NON_IN_CARICO_SOC: 'Componente non in carico SOC'
};

const IMPATTO_LABELS: Record<string, string> = {
    SI: 'Impattante',
    NO: 'Non impattante',
    DA_VERIFICARE: 'Da verificare'
};

export const CVE_EXPORT_HEADERS = [
    ...CVE_IMPORT_HEADERS,
    'CVE',
    'Vendor',
    'Prodotto',
    'Score',
    'Impatto',
    'Sezione',
    'Motivo attesa',
    'Ultima revisione',
    'Esito',
    'Data archiviazione',
    'Flag'
];

/** "2026-10-22T13:43:04" -> "22/10/2026 13.43.04" (formato ITSM); "2026-10-22" -> "22/10/2026". */
export function formatItsmDate(value: string | null | undefined, withTime = true): string {
    if (!value) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value));
    if (!m) return String(value);
    const [, y, mo, d, hh, mm, ss] = m;
    const date = `${d}/${mo}/${y}`;
    if (!withTime || hh === undefined) return date;
    return `${date} ${hh}.${mm}.${ss ?? '00'}`;
}

/** Quoting RFC 4180 e neutralizzazione delle formule (CSV injection) per i fogli di calcolo. */
export function csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function riepilogoOf(cve: any): string {
    if (cve.cve_origin) return cve.cve_origin;
    return ['Vulnerabilità', cve.cve_id, cve.prodotto].filter(Boolean).join(' - ');
}

function statoItsmOf(cve: any): string {
    if (cve.stato === 'IN_ANALISI') return 'Pendente';
    return cve.stato_ticket && cve.stato_ticket !== 'Pendente' ? cve.stato_ticket : 'Archiviato';
}

function esitoOf(esito: string | null | undefined): string {
    if (!esito) return '';
    return CVE_ESITO_LABELS[esito] || esito;
}

function isFlagged(value: unknown): boolean {
    return value === true || Number(value) === 1;
}

/** Costruisce il CSV (separatore ";", BOM UTF-8 per l'apertura corretta in Excel). */
export function buildCveExportCsv(items: any[]): string {
    const lines = [CVE_EXPORT_HEADERS.map(csvCell).join(';')];
    for (const cve of items) {
        lines.push([
            cve.problem_id,
            formatItsmDate(cve.data_ultima_modifica),
            formatItsmDate(cve.data_inoltro),
            riepilogoOf(cve),
            statoItsmOf(cve),
            cve.note,
            cve.cve_id,
            cve.vendor,
            cve.prodotto,
            cve.score === null || cve.score === undefined ? '' : String(cve.score).replace('.', ','),
            IMPATTO_LABELS[cve.impattato] || cve.impattato,
            cve.stato === 'ARCHIVIATA' ? 'Archiviata' : 'In analisi',
            cve.motivo_attesa,
            formatItsmDate(cve.ultima_revisione, false),
            esitoOf(cve.esito),
            formatItsmDate(cve.data_archiviazione),
            isFlagged(cve.flagged) ? 'Sì' : ''
        ].map(csvCell).join(';'));
    }
    return `\uFEFF${lines.join('\r\n')}\r\n`;
}
