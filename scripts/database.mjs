import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, linkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function snapshot(source, destination) {
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    if (db.prepare('PRAGMA integrity_check').all().some(row => row.integrity_check !== 'ok')) {
      throw new Error('Database integrity check failed');
    }
    if (db.prepare('PRAGMA user_version').get().user_version !== 1) {
      throw new Error('Unsupported GAN Cube schema version (expected 1)');
    }
    db.prepare('SELECT key, value, updated_at FROM settings LIMIT 0').all();
    db.prepare('SELECT id, started_at, finished_at, duration_ms, outcome, cube_id, cube_name, initial_facelets FROM timings LIMIT 0').all();
    db.prepare('VACUUM INTO ?').run(destination);
  } finally { db.close(); }
}

export function transferDatabase(command, filename, { databasePath = process.env.GANCUBE_DB_PATH || 'data/gancube.sqlite', replace = false } = {}) {
  if (!['backup', 'restore'].includes(command) || !filename) {
    throw new Error('Usage: npm run db:backup -- <backup.sqlite> OR npm run db:restore -- <backup.sqlite> [--replace]');
  }
  const database = resolve(databasePath);
  const file = resolve(filename);
  if (database === file) throw new Error('Backup and database paths must be different');
  const destination = command === 'backup' ? file : database;
  const source = command === 'backup' ? database : file;
  if (!existsSync(source)) throw new Error(`Source database does not exist: ${source}`);
  if (existsSync(destination) && (command === 'backup' || !replace)) {
    throw new Error(`Destination already exists: ${destination}. Restore requires --replace to overwrite it.`);
  }
  const assertStopped = () => {
    for (const suffix of ['-wal', '-shm', '-journal']) {
      if (existsSync(database + suffix)) throw new Error('Stop the destination API cleanly before restoring. SQLite sidecar files remain; do not delete them while the API is running.');
    }
  };
  if (command === 'restore') assertStopped();
  mkdirSync(dirname(destination), { recursive: true });
  const staging = mkdtempSync(join(dirname(destination), '.gancube-transfer-'));
  let previous;
  try {
    const staged = join(staging, 'database.sqlite');
    snapshot(source, staged);
    if (command === 'restore') {
      assertStopped();
      if (existsSync(destination)) {
        previous = `${destination}.before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
        snapshot(destination, previous);
        renameSync(staged, destination);
      } else {
        // Exclusive publication prevents accidentally overwriting a newly created file.
        linkSync(staged, destination);
      }
    } else {
      linkSync(staged, destination);
    }
    return { destination, previous };
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, filename, ...flags] = process.argv.slice(2);
    if (flags.some(flag => flag !== '--replace')) throw new Error('Unknown argument');
    const result = transferDatabase(command, filename, { replace: flags.includes('--replace') });
    console.log(`${command === 'backup' ? 'Backup saved' : 'Database restored'}: ${result.destination}`);
    if (result.previous) console.log(`Previous database saved: ${result.previous}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
