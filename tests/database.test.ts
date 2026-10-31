// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createApp } from '../server/app.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
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
test('timing retries are idempotent and interrupted runs retain their outcome', async () => {
  const record = { ...timing(), outcome: 'interrupted' };
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
