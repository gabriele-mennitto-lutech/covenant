const xlsx = require('xlsx');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function importServices() {
    const excelPath = path.join(__dirname, '../../Excel/services.xlsx');
    const dbPath = path.join(__dirname, '../../data/inv.db');

    console.log(`Reading Excel file: ${excelPath}`);
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    console.log(`Opening database: ${dbPath}`);
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servizio TEXT,
            knowledge TEXT,
            stato TEXT
        );
    `);

    console.log(`Inserting ${data.length} records into services table...`);
    const stmt = await db.prepare(`INSERT INTO services (servizio, knowledge, stato) VALUES (?, ?, ?)`);
    await db.run('BEGIN TRANSACTION');

    for (const row of data) {
        const servizio = row['SERVIZIO'] || '';
        const knowledge = row['KNOWLEDGE'] || '';
        const stato = row['STATO'] || '';
        
        if (servizio) {
            await stmt.run([servizio, knowledge, stato]);
        }
    }

    await db.run('COMMIT');
    await stmt.finalize();
    await db.close();

    console.log('Import completed successfully.');
}

importServices().catch(console.error);
