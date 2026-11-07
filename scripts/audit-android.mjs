import { readFile, writeFile, mkdir } from 'node:fs/promises';

// No scanner package: query OSV using Node's built-in HTTP client. Fail on
// incomplete results as well as findings, rather than treating an outage as clean.
const dependencies = JSON.parse(await readFile('android/app/build/reports/runtime-dependencies.json', 'utf8'));
if (!dependencies.length) throw new Error('Native dependency report is empty');
const response = await fetch('https://api.osv.dev/v1/querybatch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ queries: dependencies.map(({ name, version }) => ({ package: { ecosystem: 'Maven', name }, version })) }),
  signal: AbortSignal.timeout(60000),
});
if (!response.ok) throw new Error(`OSV request failed (${response.status})`);
const { results } = await response.json();
if (!Array.isArray(results) || results.length !== dependencies.length || results.some(result =>
  !result || result.error || result.next_page_token || (result.vulns !== undefined && !Array.isArray(result.vulns)))) {
  throw new Error('OSV returned an incomplete dependency scan');
}
const findings = results.flatMap((result, index) => (result.vulns ?? []).map(({ id }) => ({ ...dependencies[index], id })));
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/dependency-audit.json', JSON.stringify({
  checkedAt: new Date().toISOString(), source: 'https://api.osv.dev/v1/querybatch', dependencies, findings,
}, null, 2) + '\n');
for (const finding of findings) console.error(`${finding.name}@${finding.version}: https://osv.dev/vulnerability/${finding.id}`);
console.log(`OSV: ${dependencies.length} native dependency versions checked; ${findings.length} known advisory matches.`);
process.exitCode = findings.length ? 1 : 0;
