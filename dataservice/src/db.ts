import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_MOTIVO_ATTESA, LEGACY_MOTIVO_LABELS, extractProduct, todayLocal } from './cveUtils';

import * as dotenv from 'dotenv';
dotenv.config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/inv.db');

let db: Database<sqlite3.Database, sqlite3.Statement>;

export function getDb(): Database<sqlite3.Database, sqlite3.Statement> {
    return db;
}

let txQueue: Promise<unknown> = Promise.resolve();

/**
 * Esegue `work` in una transazione. Tutte le transazioni condividono un'unica connessione SQLite:
 * vengono serializzate per evitare transazioni annidate e scritture che finiscono nella transazione sbagliata.
 */
export async function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    const run = async () => {
        await db.run('BEGIN IMMEDIATE TRANSACTION');
        try {
            const result = await work();
            await db.run('COMMIT');
            return result;
        } catch (err) {
            try {
                await db.run('ROLLBACK');
            } catch (rollbackErr) {
                console.error('Transaction rollback failed:', rollbackErr);
            }
            throw err;
        }
    };
    const next = txQueue.then(run, run);
    txQueue = next.catch(() => undefined);
    return next;
}

/** Scrive il WAL nel file principale: necessario se inv.db viene copiato senza inv.db-wal. */
export async function checkpointDb(): Promise<void> {
    if (!db) return;
    await db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
}

let checkpointTimer: NodeJS.Timeout | undefined;

/** Checkpoint periodico del WAL (default 5 minuti, WAL_CHECKPOINT_INTERVAL_MS=0 per disattivarlo). */
function startPeriodicCheckpoint(): void {
    const intervalMs = Number(process.env.WAL_CHECKPOINT_INTERVAL_MS ?? 300000);
    if (checkpointTimer || !Number.isFinite(intervalMs) || intervalMs <= 0) return;
    checkpointTimer = setInterval(() => {
        checkpointDb().catch(err => console.error('Periodic WAL checkpoint failed:', err));
    }, intervalMs);
    checkpointTimer.unref();
}

export async function closeDb(): Promise<void> {
    if (!db) return;
    if (checkpointTimer) {
        clearInterval(checkpointTimer);
        checkpointTimer = undefined;
    }
    await checkpointDb().catch(err => console.error('WAL checkpoint failed:', err));
    await db.close();
}

type ColumnMigration = {
    table: string;
    definition: string;
};

/**
 * Schema canonico della tabella hosts.
 * La chiave primaria e' un id numerico surrogato: hostname e ambiente sono dati di business
 * (mutabili e riutilizzabili, ad es. piu' macchine dismesse con lo stesso hostname).
 */
const HOST_COLUMNS: [string, string][] = [
    ['hostname', 'TEXT'],
    ['applicazione', 'TEXT'],
    ['riferimento', 'TEXT'],
    ['ambiente', 'TEXT'],
    ['company', 'TEXT'],
    ['servizio', 'TEXT'],
    ['appliance', 'INTEGER'],
    ['zona', 'TEXT'],
    ['riferimentoEs', 'TEXT'],
    ['locazione', 'TEXT'],
    ['os', 'TEXT'],
    ['os_major', 'INTEGER'],
    ['os_minor', 'TEXT'],
    ['manutenzione', 'TEXT'],
    ['nodo', 'INTEGER'],
    ['note', 'TEXT'],
    ['pianificazione', 'TEXT'],
    ['verContView', 'TEXT'],
    ['rfc', 'TEXT'],
    ['status', 'INTEGER'],
    ['fixed', 'INTEGER'],
    ['fixable', 'INTEGER'],
    ['divisione', 'TEXT'],
    ['manual_overrides', `TEXT DEFAULT '[]'`],
    ['ipfe', 'TEXT'],
    ['ipmgt', 'TEXT'],
    ['ipfe2al', 'TEXT'],
    ['vlfe', 'TEXT'],
    ['vlmgt', 'TEXT'],
    ['vlfe2al', 'TEXT']
];

/**
 * Condizione SQL che identifica un host "attivo" (non dismesso / spento).
 * Solo gli host attivi devono essere univoci per (hostname, ambiente).
 */
export const ACTIVE_HOST_SQL = `(instr(lower(coalesce(ambiente, '')), 'dismess') = 0 AND instr(lower(coalesce(ambiente, '')), 'spent') = 0)`;

let hostColumnNames: Set<string> = new Set(['id', ...HOST_COLUMNS.map(([name]) => name)]);

/** Colonne supportate presenti nella tabella hosts (whitelist per lettura e scrittura). */
export function getHostColumnNames(): Set<string> {
    return hostColumnNames;
}

function quoteIdentifier(name: string): string {
    return `"${name.replaceAll('"', '""')}"`;
}

function buildHostsTableSql(tableName: string, extraColumnDefinitions: string[] = []): string {
    const columns = [
        'id INTEGER PRIMARY KEY AUTOINCREMENT',
        ...HOST_COLUMNS.map(([name, type]) => `${name} ${type}`),
        ...extraColumnDefinitions
    ];
    return `CREATE TABLE ${tableName} (\n            ${columns.join(',\n            ')}\n        );`;
}

/**
 * Migra le tabelle hosts legacy (PRIMARY KEY (hostname, ambiente)) al nuovo schema con id surrogato.
 * SQLite non permette di modificare la PK: la tabella viene ricostruita in transazione,
 * preservando l'ordine di inserimento originale e le eventuali colonne extra.
 */
async function migrateHostsToSurrogateId(): Promise<void> {
    const tableInfo: { name: string; type: string; dflt_value: string | null }[] = await db.all(`PRAGMA table_info(hosts)`);
    if (tableInfo.length === 0 || tableInfo.some(col => col.name === 'id')) return;

    console.log('Migrating hosts table to surrogate numeric id primary key...');
    const knownColumns = new Set(HOST_COLUMNS.map(([name]) => name));
    const extraColumnDefinitions = tableInfo
        .filter(col => !knownColumns.has(col.name))
        .map(col => [quoteIdentifier(col.name), col.type, col.dflt_value === null ? '' : `DEFAULT ${col.dflt_value}`].filter(Boolean).join(' '));
    const copiedColumns = tableInfo.map(col => quoteIdentifier(col.name)).join(', ');

    await db.run('BEGIN TRANSACTION');
    try {
        await db.exec('DROP TABLE IF EXISTS hosts_migration_tmp');
        await db.exec(buildHostsTableSql('hosts_migration_tmp', extraColumnDefinitions));
        await db.run(`INSERT INTO hosts_migration_tmp (${copiedColumns}) SELECT ${copiedColumns} FROM hosts ORDER BY rowid`);
        await db.exec('DROP TABLE hosts');
        await db.exec('ALTER TABLE hosts_migration_tmp RENAME TO hosts');
        await db.run('COMMIT');
        console.log('Hosts table migration completed.');
    } catch (err) {
        await db.run('ROLLBACK');
        throw err;
    }
}

async function ensureHostIndexes(): Promise<void> {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_hosts_hostname_ambiente ON hosts (hostname COLLATE NOCASE, ambiente COLLATE NOCASE)`);
    await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_hosts_active_hostname_ambiente ON hosts (hostname, ambiente) WHERE ${ACTIVE_HOST_SQL}`);
}

async function refreshHostColumnNames(): Promise<void> {
    const tableInfo = await db.all(`PRAGMA table_info(hosts)`);
    const supportedColumns = new Set(['id', ...HOST_COLUMNS.map(([name]) => name)]);
    hostColumnNames = new Set(tableInfo.map(col => col.name).filter(name => supportedColumns.has(name)));
}

export function hostProjection(): string {
    return [...hostColumnNames].map(quoteIdentifier).join(', ');
}

export const SETTING_KEYS = ['items_per_page', 'theme'] as const;

export async function readSettings(): Promise<Record<string, string>> {
    const rows = await db.all(
        `SELECT key, value FROM settings WHERE key IN (${SETTING_KEYS.map(() => '?').join(', ')})`,
        [...SETTING_KEYS]
    );
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

async function ensureColumnExists(tableName: string, columnName: string, definition: string): Promise<void> {
    const tableInfo = await db.all(`PRAGMA table_info(${tableName})`);
    const hasColumn = tableInfo.some(col => col.name === columnName);
    if (!hasColumn) {
        await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
    }
}

async function applyColumnMigrations(migrations: ColumnMigration[]): Promise<void> {
    for (const migration of migrations) {
        const columnName = migration.definition.split(' ')[0];
        await ensureColumnExists(migration.table, columnName, migration.definition);
    }
}

export const CVE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS cves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        problem_id TEXT UNIQUE,
        cve_id TEXT NOT NULL,
        data_inoltro TEXT,
        data_ultima_modifica TEXT,
        stato_ticket TEXT,
        note TEXT,
        riferimenti TEXT,
        errata TEXT,
        score REAL,
        cve_origin TEXT,
        prodotto TEXT,
        vendor TEXT,
        stato TEXT NOT NULL DEFAULT 'IN_ANALISI',
        motivo_attesa TEXT,
        esito TEXT,
        impattato TEXT DEFAULT 'DA_VERIFICARE',
        asset_impattati TEXT,
        ultima_revisione TEXT,
        data_archiviazione TEXT,
        flagged INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cves_cve_id ON cves (cve_id);
    CREATE INDEX IF NOT EXISTS idx_cves_stato ON cves (stato);
`;

/** Storico dei motivi di attesa di ogni problem/CVE (uno per ogni cambio). */
export const CVE_MOTIVO_HISTORY_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS cve_motivo_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cve_ref INTEGER NOT NULL REFERENCES cves(id) ON DELETE CASCADE,
        motivo_attesa TEXT NOT NULL,
        data_cambio TEXT NOT NULL,
        utente TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cve_motivo_history_ref ON cve_motivo_history (cve_ref);
`;

/**
 * Migrazioni idempotenti dei dati CVE legacy:
 * - "CVE Origin" -> prodotto impattato;
 * - codici motivo attesa -> testo libero ("Riferimenti" era il motivo attesa dell'Excel);
 * - storico motivo attesa iniziale per le righe che ne sono prive.
 */
async function migrateCveData(): Promise<void> {
    await db.run('BEGIN TRANSACTION');
    try {
        const missingProduct = await db.all(
            `SELECT id, cve_origin FROM cves WHERE prodotto IS NULL AND IFNULL(cve_origin, '') <> ''`
        );
        for (const row of missingProduct) {
            const prodotto = extractProduct(row.cve_origin);
            if (prodotto) await db.run('UPDATE cves SET prodotto = ? WHERE id = ?', [prodotto, row.id]);
        }

        for (const [code, label] of Object.entries(LEGACY_MOTIVO_LABELS)) {
            await db.run('UPDATE cves SET motivo_attesa = ? WHERE motivo_attesa = ?', [label, code]);
        }
        await db.run(
            `UPDATE cves SET motivo_attesa = TRIM(riferimenti), riferimenti = NULL
             WHERE stato = 'IN_ANALISI' AND IFNULL(TRIM(riferimenti), '') <> ''
               AND (motivo_attesa IS NULL OR motivo_attesa = ?)`,
            [DEFAULT_MOTIVO_ATTESA]
        );
        await db.run(
            `UPDATE cves SET motivo_attesa = ? WHERE stato = 'IN_ANALISI' AND IFNULL(TRIM(motivo_attesa), '') = ''`,
            [DEFAULT_MOTIVO_ATTESA]
        );
        await db.run(
            `INSERT INTO cve_motivo_history (cve_ref, motivo_attesa, data_cambio, utente)
             SELECT id, motivo_attesa, COALESCE(ultima_revisione, substr(created_at, 1, 10), ?), 'migrazione'
             FROM cves c
             WHERE IFNULL(TRIM(motivo_attesa), '') <> ''
               AND NOT EXISTS (SELECT 1 FROM cve_motivo_history h WHERE h.cve_ref = c.id)`,
            [todayLocal()]
        );
        await db.run('COMMIT');
    } catch (err) {
        await db.run('ROLLBACK').catch(() => undefined);
        throw err;
    }
}

async function ensureCveTable(): Promise<void> {
    await db.exec(CVE_TABLE_SQL);
    await applyColumnMigrations([
        { table: 'cves', definition: 'prodotto TEXT' },
        { table: 'cves', definition: 'vendor TEXT' },
        { table: 'cves', definition: 'flagged INTEGER NOT NULL DEFAULT 0' }
    ]);
    await db.exec(CVE_MOTIVO_HISTORY_TABLE_SQL);
    await migrateCveData();
}

async function ensureBaseTables(): Promise<void> {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS sites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            porta INTEGER,
            url_aliases TEXT,
            ip_reali TEXT,
            host_reali TEXT,
            servizio TEXT,
            nome_vip TEXT,
            note TEXT,
            ambiente TEXT,
            tls_config TEXT
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS mail_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            subject TEXT,
            recipients TEXT,
            content TEXT
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servizio TEXT,
            knowledge TEXT,
            stato TEXT
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            action TEXT,
            target_type TEXT,
            target_id TEXT,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

export async function initDb() {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Enable WAL mode for better concurrency in production
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA busy_timeout = 5000;');

    // Check if hosts table exists
    const tableExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='hosts'`);

    if (!tableExists) {
        // DB nuovo o vuoto: viene creato solo lo schema (nessun seed di dati di test).
        // Il caricamento dati avviene esplicitamente tramite le API di import (/data/hosts/import, /data/sites/import).
        console.log("Database tables not found. Creating empty schema...");
        await createTables();
        await ensureHostIndexes();
        await ensureCveTable();
        await seedDefaultSettings();
        console.log("Empty database initialized successfully.");
    } else {
        console.log("Database connected.");
        await ensureBaseTables();
        await ensureCveTable();
        await applyColumnMigrations([
            { table: 'hosts', definition: `manual_overrides TEXT DEFAULT '[]'` },
            { table: 'hosts', definition: 'status INTEGER' },
            { table: 'hosts', definition: 'fixed INTEGER' },
            { table: 'hosts', definition: 'fixable INTEGER' },
            { table: 'hosts', definition: 'ipfe TEXT' },
            { table: 'hosts', definition: 'ipmgt TEXT' },
            { table: 'hosts', definition: 'ipfe2al TEXT' },
            { table: 'hosts', definition: 'vlfe TEXT' },
            { table: 'hosts', definition: 'vlmgt TEXT' },
            { table: 'hosts', definition: 'vlfe2al TEXT' },
            { table: 'sites', definition: 'tls_config TEXT' }
        ]);
        await migrateHostsToSurrogateId();
        await ensureHostIndexes();

        await seedDefaultSettings();
    }

    await refreshHostColumnNames();
    await checkpointDb();
    startPeriodicCheckpoint();
}

async function createTables() {
    await db.exec(buildHostsTableSql('hosts'));

    await db.exec(`
        CREATE TABLE sites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            porta INTEGER,
            url_aliases TEXT,
            ip_reali TEXT,
            host_reali TEXT,
            servizio TEXT,
            nome_vip TEXT,
            note TEXT,
            ambiente TEXT,
            tls_config TEXT
        );
    `);

    await db.exec(`
        CREATE TABLE mail_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            subject TEXT,
            recipients TEXT,
            content TEXT
        );
    `);

    await db.exec(`
        CREATE TABLE services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servizio TEXT,
            knowledge TEXT,
            stato TEXT
        );
    `);


    await db.exec(`
        CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    await db.exec(`
        CREATE TABLE activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            action TEXT,
            target_type TEXT,
            target_id TEXT,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

async function seedDefaultSettings(): Promise<void> {
    const defaultSettings: Record<string, string> = {
        items_per_page: '50',
        theme: 'light'
    };
    const stmt = await db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
    try {
        await runInTransaction(async () => {
            for (const [k, v] of Object.entries(defaultSettings)) {
                await stmt.run([k, v]);
            }
        });
    } finally {
        await stmt.finalize();
    }
}
