import { spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
export function createScrambleService() {
  let child;
  let ready;
  let origin = process.env.TNOODLE_URL?.replace(/\/$/, '');
  async function start() {
    if (origin) return origin;
    const root = resolve('.runtime/tnoodle');
    const jar = join(root, 'TNoodle-WCA-1.2.3.jar');
    let java;
    try { await access(jar); java = process.env.JAVA || (await readFile(join(root, 'java-path'), 'utf8')).trim(); }
    catch { throw new Error('TNoodle is not installed. Run npm run setup:tnoodle, then retry.'); }
    const port = await new Promise((resolve, reject) => {
      const socket = createServer();
      socket.once('error', reject);
      socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
    });
    const base = `http://127.0.0.1:${port}`;
    let failure;
    let output = '';
    child = spawn(java, ['-Xmx512m', '-Djava.awt.headless=true', '-jar', jar, '--noReexec', '-n', '-b', '-u', '-p', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', error => { failure = error; });
    child.on('exit', code => { failure = new Error(`TNoodle exited (${code}). ${output.slice(-500)}`); ready = undefined; origin = undefined; });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + data).slice(-4000); });
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) { origin = base; return base; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    child.kill();
    throw new Error('TNoodle startup timed out. Check the Java installation.');
  }
  return {
    async generate() {
      if (!ready) ready = start().catch(error => { ready = undefined; throw error; });
      const base = await ready;
      const response = await fetch(`${base}/api/v0/scramble/333?numScrambles=1`, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`TNoodle request failed (${response.status})`);
      const data = await response.json();
      const scramble = data?.[0]?.trim();
      if (typeof scramble !== 'string' || !/^[URFDLB][2']?( [URFDLB][2']?){1,39}$/.test(scramble)) throw new Error('TNoodle returned an invalid 3×3 scramble');
      return { scramble, source: 'TNoodle', ...(process.env.TNOODLE_URL ? {} : { version: '1.2.3' }) };
    },
    close() { child?.kill(); },
  };
}
