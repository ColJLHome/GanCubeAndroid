// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { loadCube, saveCube, restoreCube } from '../src/saved-cube';
beforeEach(() => {
  localStorage.clear(); vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => null })));
});
test('ignores malformed or invalid stored data', () => {
  for (const value of ['{broken', 'null', '{"id":4}', '{"id":"abc","name":"GAN","mac":"invalid"}']) {
    localStorage.setItem('gancube.lastCube.v1', value);
    expect(loadCube()).toBeNull();
  }
});
test('database denial is nonfatal', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('API offline'); }));
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  expect(loadCube()).toBeNull();
  expect(await saveCube({ id: 'cube', name: 'GAN', mac: 'AA:BB:CC:DD:EE:FF' })).toBe(false);
});

test('migrates legacy settings into SQLite when database is empty', async () => {
  const cube = { id: 'legacy', name: 'GAN legacy', mac: 'AA:BB:CC:DD:EE:FF' };
  localStorage.setItem('gancube.lastCube.v1', JSON.stringify(cube));
  expect(await restoreCube()).toEqual(cube);
  expect(fetch).toHaveBeenCalledWith('/api/settings/last-cube', expect.objectContaining({ method: 'PUT', body: JSON.stringify(cube) }));
});
test('SQLite settings take precedence over the old browser cache', async () => {
  const cube = { id: 'sqlite', name: 'GAN sqlite', mac: 'AA:BB:CC:DD:EE:FF' };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => cube })));
  expect(await restoreCube()).toEqual(cube);
  expect(fetch).toHaveBeenCalledTimes(1);
});
