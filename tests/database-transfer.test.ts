// @vitest-environment node
import { expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';
import { transferDatabase } from '../scripts/database.mjs';

test('live WAL backup transfers settings and timings to another server and preserves replaced data', () => {
  const folder = mkdtempSync(join(tmpdir(), 'gancube-transfer-test-'));
  const source = join(folder, 'source.sqlite');
  const target = join(folder, 'other-server', 'target.sqlite');
  const backup = join(folder, 'backup.sqlite');
  const { db } = createApp(source);
  try {
    db.prepare('INSERT INTO settings VALUES (?, ?, ?)').run('debugging', 'false', 'today');
    db.prepare('INSERT INTO timings VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('solve', 'start', 'finish', 123, 'solved', null, null, 'facelets');
    transferDatabase('backup', backup, { databasePath: source });
    transferDatabase('restore', backup, { databasePath: target });
    const restored = new DatabaseSync(target);
    expect(restored.prepare('SELECT value FROM settings').get()?.value).toBe('false');
    expect(restored.prepare('SELECT duration_ms FROM timings').get()?.duration_ms).toBe(123);
    restored.prepare('UPDATE settings SET value = ?').run('true');
    restored.close();
    expect(() => transferDatabase('restore', backup, { databasePath: target })).toThrow('already exists');
    const { previous } = transferDatabase('restore', backup, { databasePath: target, replace: true });
    const old = new DatabaseSync(previous, { readOnly: true });
    expect(old.prepare('SELECT value FROM settings').get()?.value).toBe('true');
    old.close();
    writeFileSync(join(folder, 'invalid.sqlite'), 'invalid');
    expect(() => transferDatabase('restore', join(folder, 'invalid.sqlite'), { databasePath: target, replace: true })).toThrow();
    const unchanged = new DatabaseSync(target, { readOnly: true });
    expect(unchanged.prepare('SELECT value FROM settings').get()?.value).toBe('false');
    unchanged.close();
    expect(() => transferDatabase('backup', backup, { databasePath: source })).toThrow('already exists');
    expect(() => transferDatabase('restore', backup, { databasePath: source, replace: true })).toThrow('Stop the destination API');
    const foreign = join(folder, 'foreign.sqlite');
    const foreignDb = new DatabaseSync(foreign);
    foreignDb.close();
    expect(() => transferDatabase('restore', foreign, { databasePath: join(folder, 'new.sqlite') })).toThrow('schema version');
    expect(existsSync(join(folder, 'new.sqlite'))).toBe(false);
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }); }
});
