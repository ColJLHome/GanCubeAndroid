// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
let server: any;
let db: any;
let url: string;
let folder: string;
let file: string;
async function start() {
  const instance = createApp(file);
  db = instance.db;
  server = await new Promise<any>(resolve => {
    const running = instance.app.listen(0, '127.0.0.1', () => resolve(running));
  });
  url = `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  await new Promise<void>((resolve, reject) => server.close((err: Error | undefined) => err ? reject(err) : resolve()));
  db.close();
}
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'gancube-test-'));
  file = join(folder, 'cube.sqlite');
  await start();
});
afterEach(async () => { await stop(); rmSync(folder, { recursive: true, force: true }); });
const cube = { id: 'test-device', name: 'GAN test', mac: 'AA:BB:CC:DD:EE:FF' };
const timing = () => ({ id: randomUUID(), startedAt: '2026-10-31T12:00:00.000Z', finishedAt: '2026-10-31T12:00:12.345Z', durationMs: 12345, outcome: 'solved', cubeId: cube.id, cubeName: cube.name, initialFacelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
async function write(path: string, method: string, value: unknown) {
  return fetch(url + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
}
test('cube settings and timing records persist after closing and reopening SQLite', async () => {
  expect(await (await fetch(url + '/api/settings/last-cube')).json()).toBeNull();
  expect((await write('/api/settings/last-cube', 'PUT', cube)).status).toBe(200);
  const record = timing();
  expect((await write('/api/timings', 'POST', record)).status).toBe(201);
  await stop();
  await start();
  expect(await (await fetch(url + '/api/settings/last-cube')).json()).toEqual(cube);
  expect(await (await fetch(url + '/api/timings')).json()).toEqual([record]);
});
test('timing retries are idempotent', async () => {
  const record = timing();
  expect((await write('/api/timings', 'POST', record)).status).toBe(201);
  expect((await write('/api/timings', 'POST', record)).status).toBe(200);
  expect(await (await fetch(url + '/api/timings')).json()).toEqual([record]);
});
test('invalid settings and timings are rejected without changing the database', async () => {
  expect((await write('/api/settings/last-cube', 'PUT', { ...cube, mac: 'wrong' })).status).toBe(400);
  for (const changes of [{ durationMs: -1 }, { outcome: 'bad' }, { initialFacelets: '<script>' }, { startedAt: 'yesterday' }]) {
    expect((await write('/api/timings', 'POST', { ...timing(), ...changes })).status).toBe(400);
  }
  expect(await (await fetch(url + '/api/timings')).json()).toEqual([]);
});
test('timings are listed newest first with a bounded result count', async () => {
  const older = timing();
  const newer = { ...timing(), startedAt: '2026-10-31T12:00:01.000Z' };
  await write('/api/timings', 'POST', older);
  await write('/api/timings', 'POST', newer);
  expect(await (await fetch(url + '/api/timings?limit=1')).json()).toEqual([newer]);
});

test('unfinished timings cannot be added and old unfinished runs are hidden', async () => {
  for (const outcome of ['manual', 'reset', 'interrupted']) {
    expect((await write('/api/timings', 'POST', { ...timing(), outcome })).status).toBe(400);
  }
  const legacy = timing();
  db.prepare('INSERT INTO timings(id, started_at, finished_at, duration_ms, outcome, initial_facelets) VALUES (?, ?, ?, ?, ?, ?)').run(legacy.id, legacy.startedAt, legacy.finishedAt, legacy.durationMs, 'manual', legacy.initialFacelets);
  const solved = timing();
  await write('/api/timings', 'POST', solved);
  expect(await (await fetch(url + '/api/timings?limit=1')).json()).toEqual([solved]);
});
test('debugging preference persists and accepts only a boolean', async () => {
  expect(await (await fetch(url + '/api/settings/debugging')).json()).toBeNull();
  expect((await write('/api/settings/debugging', 'PUT', { enabled: false })).status).toBe(200);
  await stop();
  await start();
  expect(await (await fetch(url + '/api/settings/debugging')).json()).toEqual({ enabled: false });
  expect((await write('/api/settings/debugging', 'PUT', { enabled: 'false' })).status).toBe(400);
  expect(await (await fetch(url + '/api/settings/debugging')).json()).toEqual({ enabled: false });
});

test('backup is a standalone consistent SQLite database including committed WAL writes', async () => {
  await write('/api/settings/last-cube', 'PUT', cube);
  await write('/api/settings/debugging', 'PUT', { enabled: false });
  const record = timing();
  await write('/api/timings', 'POST', record);
  const response = await fetch(url + '/api/database/backup');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-type')).toContain('application/vnd.sqlite3');
  expect(response.headers.get('content-disposition')).toMatch(/attachment; filename="?gancube-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite"?/);
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(bytes.subarray(0, 16).toString()).toBe('SQLite format 3\0');
  const destination = join(folder, 'saved-copy.sqlite');
  writeFileSync(destination, bytes);
  const copy = new DatabaseSync(destination, { readOnly: true });
  try {
    expect(copy.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok');
    expect(JSON.parse(copy.prepare("SELECT value FROM settings WHERE key='lastCube'").get().value)).toEqual(cube);
    expect(JSON.parse(copy.prepare("SELECT value FROM settings WHERE key='debugging'").get().value)).toBe(false);
    expect(copy.prepare('SELECT id, duration_ms FROM timings').all()).toEqual([{ id: record.id, duration_ms: 12345 }]);
    await write('/api/timings', 'POST', timing());
    expect(copy.prepare('SELECT count(*) AS count FROM timings').get().count).toBe(1);
    expect(db.prepare('SELECT count(*) AS count FROM timings').get().count).toBe(2);
  } finally { copy.close(); }
});

test('UI restore replaces settings and timings, keeps a recovery backup, and rejects invalid uploads', async () => {
  await write('/api/settings/last-cube', 'PUT', cube);
  const original = timing();
  await write('/api/timings', 'POST', original);
  const backup = Buffer.from(await (await fetch(url + '/api/database/backup')).arrayBuffer());
  await write('/api/settings/last-cube', 'PUT', { ...cube, name: 'Replacement' });
  const extra = timing();
  await write('/api/timings', 'POST', extra);
  const restore = (body: Buffer, confirmed = true) => fetch(url + '/api/database/restore', {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(confirmed ? { 'X-Gancube-Restore': 'true' } : {}) }, body,
  });
  expect((await restore(backup, false)).status).toBe(400);
  expect((await restore(Buffer.from('not sqlite'))).status).toBe(400);
  expect(await (await fetch(url + '/api/settings/last-cube')).json()).toMatchObject({ name: 'Replacement' });
  const response = await restore(backup);
  expect(response.status).toBe(200);
  const result = await response.json();
  const previous = new DatabaseSync(join(folder, result.previousBackup), { readOnly: true });
  expect(JSON.parse(previous.prepare('SELECT value FROM settings WHERE key = ?').get('lastCube')!.value as string).name).toBe('Replacement');
  expect(previous.prepare('SELECT COUNT(*) AS count FROM timings').get()?.count).toBe(2);
  previous.close();
  expect(await (await fetch(url + '/api/settings/last-cube')).json()).toEqual(cube);
  expect(await (await fetch(url + '/api/timings')).json()).toEqual([original]);
  // The same connection remains writable after the transaction.
  expect((await write('/api/timings', 'POST', extra)).status).toBe(201);
  await stop();
  await start();
  expect(await (await fetch(url + '/api/settings/last-cube')).json()).toEqual(cube);
});
