// @vitest-environment node
import { expect, test, vi } from 'vitest';
import { createApp } from '../server/app.mjs';
for (const fail of [false, true]) {
  test(fail ? 'TNoodle errors are returned as actionable failures' : 'scramble API returns TNoodle output without modification', async () => {
    const result = { scramble: "R U2 F'", source: 'TNoodle', version: '1.2.3' };
    const generate = vi.fn(async () => { if (fail) throw new Error('Run npm run setup:tnoodle'); return result; });
    const { app, db } = createApp(':memory:', { scrambleService: { generate, close() {} } });
    const server = await new Promise<any>(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/scrambles/333`);
      expect(response.status).toBe(fail ? 503 : 200);
      expect(await response.json()).toEqual(fail ? { error: 'Run npm run setup:tnoodle' } : result);
      expect(generate).toHaveBeenCalledTimes(1);
    } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
  });
}
