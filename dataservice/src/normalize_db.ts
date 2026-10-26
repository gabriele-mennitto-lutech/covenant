import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import * as path from 'node:path';

const dbPath = path.join(__dirname, '../../data/inv.db');

async function normalizeDb() {
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log("Connected to DB. Starting normalization...");

    try {
        await db.run('BEGIN TRANSACTION');

        // Check if manual_overrides exists
        const tableInfo = await db.all(`PRAGMA table_info(hosts)`);
        const hasManualOverrides = tableInfo.some(col => col.name === 'manual_overrides');
        if (!hasManualOverrides) {
            console.log("Adding manual_overrides column...");
            await db.run(`ALTER TABLE hosts ADD COLUMN manual_overrides TEXT DEFAULT '[]'`);
        }

        // Fetch all hosts that have a dot in their name
        const hostsWithDot = await db.all(`SELECT hostname FROM hosts WHERE instr(hostname, '.') > 0`);
        console.log(`Found ${hostsWithDot.length} hosts to normalize.`);

        for (const host of hostsWithDot) {
            const oldName = host.hostname;
            const newName = oldName.substring(0, oldName.indexOf('.'));

            // Check if newName already exists (might happen if 'host' and 'host.domain' both exist somehow)
            const existing = await db.get(`SELECT hostname FROM hosts WHERE hostname = ?`, [newName]);
            
            if (existing) {
                console.log(`Warning: Cannot rename ${oldName} to ${newName} because it already exists. Deleting ${oldName}...`);
                await db.run(`DELETE FROM hosts WHERE hostname = ?`, [oldName]);
            } else {
                console.log(`Renaming ${oldName} to ${newName}...`);
                await db.run(`UPDATE hosts SET hostname = ? WHERE hostname = ?`, [newName, oldName]);
            }
        }

        await db.run('COMMIT');
        console.log("Normalization completed successfully.");

    } catch (err) {
        console.error("Error during normalization:", err);
        await db.run('ROLLBACK');
    } finally {
        await db.close();
    }
}

normalizeDb();
