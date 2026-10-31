import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function createApp(databasePath) {
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
  app.use(express.json({ limit: '16kb' }));
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
    res.json(value);
  });
  app.get('/api/timings', (req, res) => {
    const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const rows = db.prepare(`SELECT id, started_at AS startedAt, finished_at AS finishedAt,
      duration_ms AS durationMs, outcome, cube_id AS cubeId, cube_name AS cubeName,
      initial_facelets AS initialFacelets FROM timings ORDER BY started_at DESC, rowid DESC LIMIT ?`).all(limit);
    res.json(rows);
  });
  app.post('/api/timings', (req, res) => {
    const { id, startedAt, finishedAt, durationMs, outcome, cubeId = null, cubeName = null, initialFacelets } = req.body ?? {};
    const isoDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
    if (typeof id !== 'string' || !/^[\da-f-]{36}$/i.test(id) || !isoDate(startedAt) || !isoDate(finishedAt) || finishedAt < startedAt || !Number.isSafeInteger(durationMs) || durationMs < 0 || !['solved','manual','reset','interrupted'].includes(outcome) || typeof initialFacelets !== 'string' || !/^[URFDLB]{54}$/.test(initialFacelets) || (cubeId !== null && (typeof cubeId !== 'string' || cubeId.length > 512)) || (cubeName !== null && (typeof cubeName !== 'string' || cubeName.length > 256))) {
      return res.status(400).json({ error: 'Invalid timing record' });
    }
    // A client-generated ID makes retries safe if a response was lost.
    const result = db.prepare(`INSERT INTO timings(id, started_at, finished_at, duration_ms, outcome, cube_id, cube_name, initial_facelets)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`).run(id, startedAt, finishedAt, durationMs, outcome, cubeId, cubeName, initialFacelets);
    res.status(result.changes ? 201 : 200).json({ id });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));
  app.use(express.static(resolve('dist')));
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(error.status ?? 500).json({ error: error.status === 400 ? 'Invalid JSON' : 'Database request failed' });
  });
  return { app, db };
}
