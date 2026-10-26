/**
 * Parsing dell'export CSV dei problem ITSM per l'import nella sezione CVE Analysis.
 *
 * Intestazioni attese (ordine libero, maiuscole/asterischi ignorati):
 *   ID problema*+ | Data ultima modifica | Data inoltro | Riepilogo* | Stato* | Note
 */

/** Riga normalizzata inviata al dataservice. */
export interface CveImportRow {
    line: number;
    problem_id: string;
    riepilogo: string;
    data_inoltro: string | null;
    data_ultima_modifica: string | null;
    stato_ticket: string;
    note: string | null;
}

/** Errore di una singola riga del file. */
export interface CveImportRowError {
    line: number | null;
    problem_id: string | null;
    error: string;
}

/** Risultato del parsing. */
export interface CveImportParseResult {
    rows: CveImportRow[];
    errors: CveImportRowError[];
}

/** Errore bloccante sul formato del file. */
export class CveImportFormatError extends Error { }

/** Intestazioni del template (stesso ordine dell'export ITSM). */
export const CVE_IMPORT_HEADERS = ['ID problema*+', 'Data ultima modifica', 'Data inoltro', 'Riepilogo*', 'Stato*', 'Note'];

type ImportField = 'problem_id' | 'data_ultima_modifica' | 'data_inoltro' | 'riepilogo' | 'stato_ticket' | 'note';

const HEADER_ALIASES: Record<string, ImportField> = {
    'id problema': 'problem_id',
    'id problem': 'problem_id',
    'problem id': 'problem_id',
    'data ultima modifica': 'data_ultima_modifica',
    'data inoltro': 'data_inoltro',
    'riepilogo': 'riepilogo',
    'stato': 'stato_ticket',
    'note': 'note'
};

const REQUIRED_FIELDS: ImportField[] = ['problem_id', 'riepilogo', 'stato_ticket'];

/** Numero massimo di righe dati accettate. */
export const MAX_IMPORT_ROWS = 5000;

function normalizeHeader(value: string): string {
    return value
        .normalize('NFD')
        .replaceAll(/[\u0300-\u036f]/g, '')
        .replaceAll(/[*+]/g, '')
        .replaceAll(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/** Individua il separatore (";" per Excel in italiano, "," o tab) contando sulla riga di intestazione. */
function detectDelimiter(text: string): string {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const candidates = [';', ',', '\t'];
    let best = ';';
    let bestCount = 0;
    for (const c of candidates) {
        const count = firstLine.split(c).length - 1;
        if (count > bestCount) {
            best = c;
            bestCount = count;
        }
    }
    return best;
}

/** Parser CSV (RFC 4180): campi tra virgolette, virgolette raddoppiate e a capo nei campi. */
export function parseCsv(text: string, delimiter: string): { cells: string[]; line: number }[] {
    const records: { cells: string[]; line: number }[] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let line = 1;
    let rowStartLine = 1;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                if (ch === '\n') line++;
                field += ch;
            }
            continue;
        }
        if (ch === '"' && field === '') {
            inQuotes = true;
        } else if (ch === delimiter) {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            records.push({ cells: row, line: rowStartLine });
            row = [];
            field = '';
            line++;
            rowStartLine = line;
        } else {
            field += ch;
        }
    }
    if (inQuotes) {
        throw new CveImportFormatError(`Virgolette non chiuse a partire dalla riga ${rowStartLine}`);
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        records.push({ cells: row, line: rowStartLine });
    }
    return records;
}

/**
 * Converte le date ITSM ("22/10/2026 13.43.04", "22/10/2026 13:43", "22/10/2026") o ISO
 * nel formato YYYY-MM-DDTHH:MM:SS usato dal DB. Restituisce undefined se il formato non e riconosciuto.
 */
export function parseItsmDate(value: string): string | null | undefined {
    const v = value.trim();
    if (!v) return null;
    const it = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T,]+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?)?$/.exec(v);
    if (it) {
        const [, d, m, y, hh, mm, ss] = it;
        const day = Number(d);
        const month = Number(m);
        const daysInMonth = new Date(Date.UTC(Number(y), month, 0)).getUTCDate();
        if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return undefined;
        const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        if (hh === undefined) return date;
        if (Number(hh) > 23 || Number(mm) > 59 || Number(ss ?? 0) > 59) return undefined;
        return `${date}T${hh.padStart(2, '0')}:${mm}:${ss ?? '00'}`;
    }
    const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?/.exec(v);
    if (iso) return iso[2] ? `${iso[1]}T${iso[2]}:${iso[3] ?? '00'}` : iso[1];
    return undefined;
}

/** Analizza il contenuto del CSV e restituisce le righe normalizzate e gli errori per riga. */
export function parseCveImportCsv(content: string): CveImportParseResult {
    const text = content.replace(/^\uFEFF/, '');
    if (!text.trim()) throw new CveImportFormatError('Il file e vuoto');

    const records = parseCsv(text, detectDelimiter(text))
        .filter(r => r.cells.some(c => c.trim() !== ''));
    if (records.length === 0) throw new CveImportFormatError('Il file e vuoto');

    const [header, ...dataRecords] = records;
    const columnIndex = new Map<ImportField, number>();
    header.cells.forEach((cell, idx) => {
        const field = HEADER_ALIASES[normalizeHeader(cell)];
        if (field && !columnIndex.has(field)) columnIndex.set(field, idx);
    });
    const missing = REQUIRED_FIELDS.filter(f => !columnIndex.has(f));
    if (missing.length) {
        const labels: Record<string, string> = { problem_id: 'ID problema', riepilogo: 'Riepilogo', stato_ticket: 'Stato' };
        throw new CveImportFormatError(`Colonne obbligatorie mancanti: ${missing.map(m => labels[m]).join(', ')}`);
    }
    if (dataRecords.length === 0) throw new CveImportFormatError('Il file non contiene righe da importare');
    if (dataRecords.length > MAX_IMPORT_ROWS) {
        throw new CveImportFormatError(`Troppe righe nel file (massimo ${MAX_IMPORT_ROWS})`);
    }

    const rows: CveImportRow[] = [];
    const errors: CveImportRowError[] = [];
    const cell = (cells: string[], field: ImportField) => {
        const idx = columnIndex.get(field);
        const value = idx === undefined ? '' : (cells[idx] ?? '').trim();
        // Rimuove l'apice di protezione dalle formule aggiunto dall'export CSV (es. "'=..." -> "=...")
        return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
    };

    for (const record of dataRecords) {
        const problemId = cell(record.cells, 'problem_id');
        const riepilogo = cell(record.cells, 'riepilogo');
        const stato = cell(record.cells, 'stato_ticket');
        const fail = (error: string) => errors.push({ line: record.line, problem_id: problemId || null, error });

        if (!problemId) { fail('ID problema mancante'); continue; }
        if (!riepilogo) { fail('Riepilogo mancante'); continue; }
        if (!stato) { fail('Stato mancante'); continue; }

        const dataInoltro = parseItsmDate(cell(record.cells, 'data_inoltro'));
        const dataModifica = parseItsmDate(cell(record.cells, 'data_ultima_modifica'));
        if (dataInoltro === undefined) { fail('Data inoltro non valida (atteso gg/mm/aaaa hh.mm.ss)'); continue; }
        if (dataModifica === undefined) { fail('Data ultima modifica non valida (atteso gg/mm/aaaa hh.mm.ss)'); continue; }

        rows.push({
            line: record.line,
            problem_id: problemId,
            riepilogo,
            data_inoltro: dataInoltro,
            data_ultima_modifica: dataModifica,
            stato_ticket: stato,
            note: cell(record.cells, 'note') || null
        });
    }
    return { rows, errors };
}
