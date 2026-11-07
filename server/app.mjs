import express from 'express';
import { snapshot } from '../scripts/database.mjs';
import { createScrambleService } from './scrambles.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';

export function createApp(databasePath, { scrambleService = createScrambleService() } = {}) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS timings (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),
      outcome TEXT NOT NULL CHECK(outcome IN ('solved', 'manual', 'reset', 'interrupted')),
      cube_id TEXT,
      cube_name TEXT,
      initial_facelets TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS timings_by_date ON timings(started_at DESC);
    PRAGMA user_version = 1;
  `);
  const app = express();
  app.post('/api/database/restore', (req, res, next) => {
    // A custom header prevents cross-origin HTML forms from replacing data.
    if (req.get('X-Gancube-Restore') !== 'true' || !req.is('application/octet-stream')) {
      return res.status(400).json({ error: 'A SQLite file upload is required' });
    }
    next();
  }, express.raw({ type: 'application/octet-stream', limit: '100mb' }), (req, res, next) => {
    const directory = mkdtempSync(join(tmpdir(), 'gancube-restore-'));
    let attached = false;
    try {
      const upload = join(directory, 'upload.sqlite');
      const validated = join(directory, 'validated.sqlite');
      writeFileSync(upload, req.body);
      try { snapshot(upload, validated); }
      catch { return res.status(400).json({ error: 'Invalid, corrupt, or unsupported GAN Cube backup. Your database was not changed.' }); }
      const filename = `gancube-before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
      const previous = join(databasePath === ':memory:' ? tmpdir() : dirname(resolve(databasePath)), filename);
      db.prepare('VACUUM INTO ?').run(previous);
      db.prepare('ATTACH DATABASE ? AS incoming').run(validated);
      attached = true;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(`DELETE FROM main.settings;
          INSERT INTO main.settings (key, value, updated_at) SELECT key, value, updated_at FROM incoming.settings;
          DELETE FROM main.timings;
          INSERT INTO main.timings (id, started_at, finished_at, duration_ms, outcome, cube_id, cube_name, initial_facelets)
            SELECT id, started_at, finished_at, duration_ms, outcome, cube_id, cube_name, initial_facelets FROM incoming.timings;
          COMMIT;`);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      res.set('Cache-Control', 'no-store').json({ restored: true, previousBackup: filename });
    } catch (error) { next(error); }
    finally {
      if (attached) db.exec('DETACH DATABASE incoming');
      rmSync(directory, { recursive: true, force: true });
    }
  });
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/scrambles/333', async (_req, res) => {
    try { res.set('Cache-Control', 'no-store').json(await scrambleService.generate()); }
    catch (error) { res.status(503).json({ error: error.message }); }
  });
  app.get('/api/database/backup', (_req, res, next) => {
    let directory;
    try {
      directory = mkdtempSync(join(tmpdir(), 'gancube-backup-'));
      const filename = `gancube-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
      const destination = join(directory, filename);
      // Include committed WAL data in a consistent, standalone SQLite snapshot.
      db.prepare('VACUUM INTO ?').run(destination);
      res.set('Cache-Control', 'no-store');
      res.type('application/vnd.sqlite3');
      res.download(destination, filename, error => {
        rmSync(directory, { recursive: true, force: true });
        if (error) next(error);
      });
    } catch (error) {
      if (directory) rmSync(directory, { recursive: true, force: true });
      next(error);
    }
  });
  app.get('/api/settings/debugging', (_req, res) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('debugging');
    res.json(row ? { enabled: JSON.parse(row.value) } : null);
  });
  app.put('/api/settings/debugging', (req, res) => {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'Debugging must be enabled or disabled' });
    db.prepare('INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run('debugging', JSON.stringify(enabled), new Date().toISOString());
    res.json({ enabled });
  });
  // Keep registry entries in settings so existing backup/restore includes them.
  const rememberCube = value => {
    db.prepare('INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
      .run(`cube:${value.mac}`, JSON.stringify(value), new Date().toISOString());
  };
  const legacyCube = db.prepare('SELECT value FROM settings WHERE key = ?').get('lastCube');
  if (legacyCube) {
    const value = JSON.parse(legacyCube.value);
    if (value?.mac && !db.prepare('SELECT 1 FROM settings WHERE key = ?').get(`cube:${value.mac.toUpperCase()}`)) rememberCube({ ...value, mac: value.mac.toUpperCase() });
  }
  app.get('/api/cubes', (_req, res) => {
    // Include lastCube as well: an older backup can be restored while running.
    const entries = db.prepare("SELECT value FROM settings WHERE key LIKE 'cube:%' ORDER BY updated_at DESC, key").all().map(row => JSON.parse(row.value));
    const last = db.prepare('SELECT value FROM settings WHERE key = ?').get('lastCube');
    if (last) {
      const value = JSON.parse(last.value);
      if (!entries.some(entry => entry.mac === value.mac)) entries.push(value);
    }
    res.set('Cache-Control', 'no-store').json(entries.map(({ name, mac }) => ({ name, mac })));
  });
  app.get('/api/settings/last-cube', (_req, res) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('lastCube');
    res.json(row ? JSON.parse(row.value) : null);
  });
  app.put('/api/settings/last-cube', (req, res) => {
    const { id, name, mac } = req.body ?? {};
    if (typeof id !== 'string' || !id.length || id.length > 512 || typeof name !== 'string' || !name.length || name.length > 256 || typeof mac !== 'string' || !/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(mac)) {
      return res.status(400).json({ error: 'Invalid cube settings' });
    }
    const value = { id, name, mac: mac.toUpperCase() };
    db.prepare('INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run('lastCube', JSON.stringify(value), new Date().toISOString());
    rememberCube(value);
    res.json(value);
  });
  app.get('/api/timings', (req, res) => {
    const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? '0'), 10) || 0);
    const rows = db.prepare(`SELECT id, started_at AS startedAt, finished_at AS finishedAt,
      duration_ms AS durationMs, outcome, cube_id AS cubeId, cube_name AS cubeName,
      initial_facelets AS initialFacelets FROM timings WHERE outcome = 'solved' ORDER BY started_at DESC, rowid DESC LIMIT ? OFFSET ?`).all(limit, offset);
    res.json(rows);
  });
  app.post('/api/timings', (req, res) => {
    const { id, startedAt, finishedAt, durationMs, outcome, cubeId = null, cubeName = null, initialFacelets } = req.body ?? {};
    const isoDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
    if (typeof id !== 'string' || !/^[\da-f-]{36}$/i.test(id) || !isoDate(startedAt) || !isoDate(finishedAt) || finishedAt < startedAt || !Number.isSafeInteger(durationMs) || durationMs < 0 || outcome !== 'solved' || typeof initialFacelets !== 'string' || !/^[URFDLB]{54}$/.test(initialFacelets) || (cubeId !== null && (typeof cubeId !== 'string' || cubeId.length > 512)) || (cubeName !== null && (typeof cubeName !== 'string' || cubeName.length > 256))) {
      return res.status(400).json({ error: 'Invalid timing record' });
    }
    // A client-generated ID makes retries safe if a response was lost.
    const result = db.prepare(`INSERT INTO timings(id, started_at, finished_at, duration_ms, outcome, cube_id, cube_name, initial_facelets)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`).run(id, startedAt, finishedAt, durationMs, outcome, cubeId, cubeName, initialFacelets);
    res.status(result.changes ? 201 : 200).json({ id });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));
  app.use(express.static(resolve('dist')));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    console.error(error);
    res.status(error.status ?? 500).json({ error: error.status === 413 ? 'Backup exceeds the 100 MB upload limit' : error.status === 400 ? 'Invalid JSON' : 'Database request failed' });
  });
  return { app, db, closeScrambler: () => scrambleService.close() };
}
