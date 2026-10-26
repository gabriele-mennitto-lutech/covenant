/**
 * Utility per l'import massivo da file CSV/JSON (template scaricabile dal front-end).
 * Il parsing e la normalizzazione avvengono lato back-end; al dataservice arrivano solo righe JSON gia' tipizzate.
 */

export type ImportFieldType = 'string' | 'boolean' | 'integer' | 'list' | 'tls';

export interface ImportField {
    /** Intestazione usata nel template CSV / chiave negli oggetti JSON */
    key: string;
    /** Nome colonna sul DB (dataservice) */
    dbKey: string;
    /** Etichetta leggibile (accettata come intestazione alternativa, es. file esportati) */
    label: string;
    type: ImportFieldType;
    required?: boolean;
}

export type ImportFormat = 'csv' | 'json';

export interface ParsedImportRow {
    /** Riga del file (CSV: numero di riga, 1 = intestazione; JSON: posizione 1-based nell'array) */
    line: number;
    data: Record<string, string | number | null>;
}

export interface ParsedImport {
    rows: ParsedImportRow[];
    errors: { row: number; error: string }[];
    ignoredColumns: string[];
}

export class ImportFormatError extends Error {}

export const CSV_DELIMITER = ';';
export const MAX_IMPORT_ROWS = 20000;
export const MAX_IMPORT_BYTES = '10mb';

const TLS_VALUES = new Set(['PASSTHROUGH', 'EDGE', 'RE-ENCRYPT']);
const TRUE_VALUES = new Set(['true', '1', 'si', 'sì', 'yes', 'y', 's', 'ok', 'x', 'vero']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'ko', 'falso']);

function normalizeHeader(value: string): string {
    return value.normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

function escapeCsvValue(value: string): string {
    return /[";\r\n,]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Template CSV: BOM UTF-8 (per Excel) + riga di intestazione con separatore ';'. */
export function buildCsvTemplate(fields: ImportField[]): string {
    return '\uFEFF' + fields.map(f => escapeCsvValue(f.key)).join(CSV_DELIMITER) + '\r\n';
}

/** Rileva il separatore (';' o ',') contando le occorrenze fuori dalle virgolette nella prima riga. */
function detectDelimiter(text: string): string {
    let inQuotes = false;
    let semicolons = 0;
    let commas = 0;
    for (const ch of text) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
        else if (!inQuotes && ch === ';') semicolons++;
        else if (!inQuotes && ch === ',') commas++;
    }
    return commas > semicolons ? ',' : ';';
}

/**
 * Parser CSV conforme RFC 4180 (campi tra virgolette, "" come escape, a capo nei campi, CRLF/LF).
 * Restituisce le righe con il numero di riga del file in cui iniziano.
 */
export function parseCsv(text: string): { line: number; cells: string[] }[] {
    const input = text.startsWith('\uFEFF') ? text.slice(1) : text;
    const delimiter = detectDelimiter(input);
    const records: { line: number; cells: string[] }[] = [];
    let cells: string[] = [];
    let field = '';
    let inQuotes = false;
    let line = 1;
    let recordLine = 1;
    let i = 0;

    const pushRecord = () => {
        cells.push(field);
        records.push({ line: recordLine, cells });
        cells = [];
        field = '';
    };

    while (i < input.length) {
        const ch = input[i];
        if (inQuotes) {
            if (ch === '"') {
                if (input[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
            } else {
                if (ch === '\n') line++;
                field += ch;
            }
            i++;
            continue;
        }
        if (ch === '"' && field === '') {
            inQuotes = true;
        } else if (ch === delimiter) {
            cells.push(field);
            field = '';
        } else if (ch === '\r' || ch === '\n') {
            if (ch === '\r' && input[i + 1] === '\n') i++;
            pushRecord();
            line++;
            recordLine = line;
        } else {
            field += ch;
        }
        i++;
    }
    if (inQuotes) throw new ImportFormatError(`Unterminated quoted field starting at line ${recordLine}`);
    if (field !== '' || cells.length > 0) pushRecord();
    return records;
}

function convertValue(field: ImportField, raw: unknown): string | number | null {
    if (raw === null || raw === undefined) return null;
    if (Array.isArray(raw) && field.type === 'list') raw = raw.map(String).join(',');
    if (typeof raw === 'object') throw new Error(`Invalid value for "${field.key}"`);
    const str = String(raw).trim();
    if (str === '') return null;

    switch (field.type) {
        case 'boolean': {
            if (typeof raw === 'boolean') return raw ? 1 : 0;
            const lower = str.toLowerCase();
            if (TRUE_VALUES.has(lower)) return 1;
            if (FALSE_VALUES.has(lower)) return 0;
            throw new Error(`Invalid boolean value for "${field.key}": "${str}" (use true/false)`);
        }
        case 'integer': {
            if (!/^-?\d+$/.test(str)) throw new Error(`Invalid integer value for "${field.key}": "${str}"`);
            return Number.parseInt(str, 10);
        }
        case 'list': {
            const values = str.split(/[\s,;|]+/).filter(Boolean);
            return values.length > 0 ? values.join(',') : null;
        }
        case 'tls': {
            const upper = str.toUpperCase();
            if (!TLS_VALUES.has(upper)) throw new Error(`Invalid TLS value "${str}" (allowed: ${[...TLS_VALUES].join(', ')})`);
            return upper;
        }
        default:
            return str;
    }
}

function buildHeaderMap(fields: ImportField[]): Map<string, ImportField> {
    const map = new Map<string, ImportField>();
    for (const field of fields) {
        for (const alias of [field.key, field.dbKey, field.label]) {
            const normalized = normalizeHeader(alias);
            if (!map.has(normalized)) map.set(normalized, field);
        }
    }
    return map;
}

function convertRecord(
    fields: ImportField[],
    source: Record<string, unknown>,
    line: number,
    result: ParsedImport
): void {
    const values = Object.values(source);
    if (values.every(v => v === null || v === undefined || String(v).trim() === '')) return;

    const data: Record<string, string | number | null> = {};
    try {
        for (const field of fields) {
            if (!(field.key in source)) continue;
            const value = convertValue(field, source[field.key]);
            if (value !== null) data[field.dbKey] = value;
        }
        const missing = fields.filter(f => f.required && (data[f.dbKey] === undefined || data[f.dbKey] === null));
        if (missing.length > 0) {
            throw new Error(`Missing required field(s): ${missing.map(f => f.key).join(', ')}`);
        }
        result.rows.push({ line, data });
    } catch (err) {
        result.errors.push({ row: line, error: (err as Error).message });
    }
}

function parseCsvImport(fields: ImportField[], content: string): ParsedImport {
    const records = parseCsv(content);
    if (records.length === 0) throw new ImportFormatError('The file is empty');

    const headerMap = buildHeaderMap(fields);
    const [header, ...body] = records;
    const ignoredColumns: string[] = [];
    const columnFields: (ImportField | null)[] = header.cells.map(cell => {
        const field = headerMap.get(normalizeHeader(cell)) ?? null;
        if (!field && cell.trim() !== '') ignoredColumns.push(cell.trim());
        return field;
    });

    const missingRequired = fields.filter(f => f.required && !columnFields.includes(f));
    if (missingRequired.length > 0) {
        throw new ImportFormatError(`Missing required column(s): ${missingRequired.map(f => f.key).join(', ')}`);
    }
    if (body.length > MAX_IMPORT_ROWS) throw new ImportFormatError(`Too many rows (max ${MAX_IMPORT_ROWS})`);

    const result: ParsedImport = { rows: [], errors: [], ignoredColumns };
    for (const record of body) {
        const source: Record<string, unknown> = {};
        columnFields.forEach((field, idx) => {
            if (field && source[field.key] === undefined) source[field.key] = record.cells[idx] ?? '';
        });
        convertRecord(fields, source, record.line, result);
    }
    return result;
}

function parseJsonImport(fields: ImportField[], content: string): ParsedImport {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content.startsWith('\uFEFF') ? content.slice(1) : content);
    } catch {
        throw new ImportFormatError('Invalid JSON file');
    }
    const items = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown })?.rows;
    if (!Array.isArray(items)) throw new ImportFormatError('JSON must be an array of objects (or { "rows": [...] })');
    if (items.length > MAX_IMPORT_ROWS) throw new ImportFormatError(`Too many rows (max ${MAX_IMPORT_ROWS})`);

    const headerMap = buildHeaderMap(fields);
    const result: ParsedImport = { rows: [], errors: [], ignoredColumns: [] };
    const ignored = new Set<string>();

    items.forEach((item, idx) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            result.errors.push({ row: idx + 1, error: 'Invalid row format (expected an object)' });
            return;
        }
        const source: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
            const field = headerMap.get(normalizeHeader(key));
            if (!field) {
                ignored.add(key);
                continue;
            }
            if (source[field.key] === undefined) source[field.key] = value;
        }
        convertRecord(fields, source, idx + 1, result);
    });
    result.ignoredColumns = [...ignored];
    return result;
}

/** Converte il contenuto del file in righe JSON pronte per il dataservice (chiavi = colonne DB). */
export function parseImportFile(fields: ImportField[], content: string, format: ImportFormat): ParsedImport {
    if (typeof content !== 'string' || content.trim() === '') throw new ImportFormatError('The file is empty');
    return format === 'json' ? parseJsonImport(fields, content) : parseCsvImport(fields, content);
}

export function parseImportFormat(raw: unknown): ImportFormat | null {
    const value = typeof raw === 'string' ? raw.toLowerCase() : 'csv';
    return value === 'csv' || value === 'json' ? value : null;
}

/** Riporta gli errori del dataservice (indice nel payload) al numero di riga del file. */
export function mergeImportResult(
    parsed: ParsedImport,
    dsResult: { total: number; inserted: number; merged: number; unchanged: number; skipped: number; errors: { index: number; error: string }[] } | null
) {
    const dsErrors = (dsResult?.errors ?? []).map(e => ({ row: parsed.rows[e.index]?.line ?? e.index + 1, error: e.error }));
    const errors = [...parsed.errors, ...dsErrors].sort((a, b) => a.row - b.row);
    return {
        total: parsed.rows.length + parsed.errors.length,
        inserted: dsResult?.inserted ?? 0,
        merged: dsResult?.merged ?? 0,
        unchanged: dsResult?.unchanged ?? 0,
        skipped: parsed.errors.length + (dsResult?.skipped ?? 0),
        errors,
        ignoredColumns: parsed.ignoredColumns
    };
}
