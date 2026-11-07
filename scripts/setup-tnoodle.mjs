import { mkdir, writeFile, readFile, rename, readdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
const root = resolve('.runtime/tnoodle');
await mkdir(root, { recursive: true });
async function download(url, destination, checksum) {
  try { if (createHash('sha256').update(await readFile(destination)).digest('hex') === checksum) return; } catch {}
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== checksum) throw new Error('Download checksum mismatch');
  await writeFile(destination + '.part', data);
  await rename(destination + '.part', destination);
}
await download('https://github.com/thewca/tnoodle/releases/download/v1.2.3/TNoodle-WCA-1.2.3.jar', join(root, 'TNoodle-WCA-1.2.3.jar'), 'e9ff6a164effee8a7ecdcc5c18111d4aa09d1de471b71de224889a1282d98cd5');
let java = process.env.JAVA || 'java';
const installed = spawnSync(java, ['-version'], { encoding: 'utf8' });
const major = /version "(\d+)/.exec(installed.stderr ?? '')?.[1];
if (installed.status !== 0 || Number(major ?? 0) < 21) {
  const os = { linux: 'linux', darwin: 'mac' }[process.platform];
  const architecture = { x64: 'x64', arm64: 'aarch64' }[process.arch];
  if (!os || !architecture) throw new Error('Install Java 21 or newer, then rerun npm run setup:tnoodle.');
  const response = await fetch(`https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=${architecture}&image_type=jre&os=${os}&vendor=eclipse`);
  if (!response.ok) throw new Error('Could not find a Java runtime');
  const assets = await response.json();
  const pkg = assets[0]?.binary?.package;
  if (!pkg) throw new Error('No supported Java runtime found');
  const archive = join(root, 'jre.tar.gz');
  await download(pkg.link, archive, pkg.checksum);
  execFileSync('tar', ['-xzf', archive, '-C', root]);
  for (const entry of await readdir(root)) {
    const candidate = join(root, entry, ...(os === 'mac' ? ['Contents', 'Home'] : []), 'bin', 'java');
    try { await access(candidate); java = candidate; break; } catch {}
  }
  if (java === 'java') throw new Error('Could not locate the downloaded Java runtime');
}
await writeFile(join(root, 'java-path'), java);
console.log('TNoodle 1.2.3 ready. The API will start it on demand.');
