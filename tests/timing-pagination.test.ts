// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { listTimings } from '../src/database';

afterEach(() => vi.unstubAllGlobals());
test('loads every timing batch until the final partial page', async () => {
  const records = Array.from({ length: 1005 }, (_, id) => ({ id: String(id) }));
  const fetchMock = vi.fn(async (url: string) => {
    const query = new URL(url, 'http://localhost').searchParams;
    const offset = Number(query.get('offset'));
    expect(query.get('limit')).toBe('500');
    return { ok: true, json: async () => records.slice(offset, offset + 500) };
  });
  vi.stubGlobal('fetch', fetchMock);
  expect(await listTimings()).toEqual(records);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
