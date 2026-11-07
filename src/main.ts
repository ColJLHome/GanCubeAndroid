import { createCubeAnimation } from './cube-animation';
import { isAndroid } from './native';
import { connectGanCube, type GanCubeConnection } from 'gan-web-bluetooth';
import type { Subscription } from 'rxjs';
import './style.css';
import { SOLVED, applyMove, cubeSvg } from './cube';
import { createTimer, formatTime } from './timer';
import { setupDatabaseBackup, setupDatabaseRestore } from './database-backup';
import { setupScrambler } from './scrambler';
import { databaseRequest, listTimings, saveTiming, type TimingRecord } from './database';
import { createDebugLog, errorDetails } from './debug-log';
import { loadCube, saveCube, findSavedDevice, validMac, restoreCube, listCubes, type KnownCube } from './saved-cube';
import { bluetoothSupportIssue } from './bluetooth-support';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header><a href="#cube" class="brand">▦ <span id="cube-label">GAN i Carry 4</span></a><div class="header-controls"><button id="live-badge" class="badge" type="button" title="Connect to your last cube">Disconnected</button><button id="reset-cube" class="secondary" type="button" title="Solve your physical cube first, with white on top and green facing you, then reset to synchronise." disabled aria-describedby="reset-help">Reset to solved</button></div><nav aria-label="Main navigation"><a id="cube-nav" href="#cube">Cube</a><a id="timings-nav" href="#timings">Timings</a><a id="scramble-nav" href="#scramble">Guided scramble</a><a id="settings-nav" href="#settings">Settings</a><a id="log-nav" href="#log">Log</a></nav></header>
  <main><section id="cube-screen" aria-label="Live cube">
    <figure class="cube-figure"><div id="cube-image">${cubeSvg(SOLVED)}</div><figcaption id="cube-caption" role="status">Reference orientation · Connect your cube in Settings to see its state.</figcaption></figure>
    <div class="timer-controls"><button id="solve-timer" type="button" disabled aria-describedby="timer-message">Start timer · 0.00</button><p id="timer-message" role="status" aria-live="polite">Connect your cube to start timing. The timer stops automatically when solved.</p></div>
    <dl class="timing-summary" aria-label="Statistics for recent solves"><div><dt>Median</dt><dd id="cube-timing-median">—</dd></div><div><dt>Mean</dt><dd id="cube-timing-mean">—</dd></div></dl><p class="timing-summary-note">Based on the latest 20 solves, including pending saves. <a href="#timings">View saved timings</a>.</p>
    <div class="orientation-guide"><h2>Hold it this way</h2><p><span class="swatch white"></span> White centre on top <span class="swatch green"></span> Green centre facing you <span class="swatch red"></span> Red centre on your right</p><p class="hint">The front face is the one facing you. Keep this orientation while turning faces; the view uses a fixed reference and does not track whole-cube rotations.</p></div>
    <p id="live-move" aria-live="polite">Last move: —</p>
    <div class="reset-controls"><p id="reset-help">Solve your physical cube first, then reset here to synchronise. Keep white on top and green facing you.</p><p id="reset-message" role="status" aria-live="polite"></p></div>
  </section>
  <section id="timings-screen" aria-labelledby="timings-title" hidden><h1 id="timings-title">Saved timings.</h1>
    <section class="timing-history" aria-labelledby="history-title"><div class="history-header"><h2 id="history-title">Timing history</h2><button id="refresh-timings" type="button" class="secondary">Refresh / retry saves</button></div><p id="history-message" role="status">Loading timing history…</p><dl class="timing-summary" aria-label="Statistics for the displayed solves"><div><dt>Median</dt><dd id="timing-median">—</dd></div><div><dt>Mean</dt><dd id="timing-mean">—</dd></div></dl><p class="timing-summary-note">Based on the solves shown below, including pending saves.</p><div class="history-scroll"><table><thead><tr><th scope="col">Started</th><th scope="col">Time</th><th scope="col">Result</th><th scope="col">Cube</th></tr></thead><tbody id="timing-rows"></tbody></table></div><div class="timing-pagination"><label for="timings-page-size">Per page <select id="timings-page-size"><option value="10">10</option><option value="20" selected>20</option><option value="50">50</option><option value="100">100</option></select></label><button id="timings-back" type="button" class="secondary">Back</button><span id="timings-page-status" role="status"></span><button id="timings-next" type="button" class="secondary">Next</button></div></section>
  </section>
  <section id="scramble-screen" aria-labelledby="scramble-title" hidden><p class="eyebrow">PREPARE YOUR NEXT SOLVE</p><h1 id="scramble-title">Guided scramble.</h1><p class="intro">Connect your cube in Settings and solve it first. Keep white on top and green facing you while following the moves.</p>
    <section class="panel scrambler" aria-labelledby="scrambler-title"><div class="panel-top"><h2 id="scrambler-title">Guided scramble</h2><button id="generate-scramble" type="button" disabled>New scramble</button></div><p class="scramble-source">3×3 · Generated by <a href="https://github.com/thewca/tnoodle/" target="_blank" rel="noopener noreferrer">TNoodle</a></p><p id="scramble-sequence" aria-label="Scramble sequence"></p><div id="scramble-next" aria-label="Next move">—</div><p id="scramble-instruction"></p><p id="scramble-progress"></p><p id="scramble-message" role="status" aria-live="polite"></p><button id="cancel-scramble" type="button" class="secondary" hidden>Cancel scramble</button></section>
    <p>When your scramble is verified, <a href="#cube">return to Cube to start the timer</a>.</p>
  </section>
  <section id="settings-screen" aria-labelledby="settings-title" hidden><p class="eyebrow">YOUR CUBE, CONNECTED</p><h1 id="settings-title">Settings.</h1>
  <p class="intro">Manage your cube’s Bluetooth connection.</p>
  <section class="panel" aria-labelledby="connection-title">
    <div class="panel-top"><h2 id="connection-title">Bluetooth connection</h2><span id="badge" class="badge">Disconnected</span></div>
    <p id="status" role="status" aria-live="polite">Ready when you are. Wake your cube with a few turns.</p>
    <button id="connect">Choose cube <span aria-hidden="true">↗</span></button><p id="saved-cube" class="saved-cube"></p>
    <div id="known-cubes"><h3>Saved cubes on this ${isAndroid ? 'device' : 'server'}</h3><p id="known-cubes-status" class="saved-cube" role="status"></p><div id="known-cubes-list"></div></div>
    <button id="disconnect" class="secondary" hidden>Disconnect cube</button>
    <dl id="details" hidden><div><dt>Device</dt><dd id="device">—</dd></div><div><dt>Battery</dt><dd id="battery">Waiting for cube</dd></div><div><dt>Last move</dt><dd id="move">Waiting for a turn</dd></div><div><dt>Data</dt><dd id="data">Waiting for cube</dd></div></dl>
    <p id="message" role="alert"></p>
    <details class="advanced"><summary>Bluetooth address / advanced</summary><label for="mac">Cube MAC address (optional)</label><input id="mac" placeholder="AA:BB:CC:DD:EE:FF" spellcheck="false" autocomplete="off" aria-describedby="mac-help"><p id="mac-help">Used to decrypt cube data. Leave blank to try automatic detection. If prompted, find the Bluetooth MAC in CubeStation’s device information or a BLE scanner. This is not the browser’s device ID.</p></details>
  </section>
  <section class="panel debugging-panel" aria-labelledby="debugging-title"><div class="panel-top"><h2 id="debugging-title">Debugging</h2><button id="toggle-debugging" type="button" role="switch" aria-checked="true" aria-describedby="debugging-help">Disable debugging</button></div><p id="debugging-help">Disabling debugging clears the log and stops recording new entries.</p><p id="debugging-feedback" role="status"></p></section>
  <section class="panel backup-panel" aria-labelledby="backup-title"><div class="panel-top"><h2 id="backup-title">Database backup and restore</h2><button id="backup-database" type="button">Back up database</button></div><p>Choose a location to save a SQLite snapshot of your settings and saved timings.</p><label for="restore-file">Restore a SQLite backup (up to 100 MB)</label><input id="restore-file" type="file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3" hidden><button id="restore-database" type="button" class="secondary">Restore database…</button><p>Restore replaces all settings and timings. The current database is backed up automatically before replacement. Disconnect your cube and save pending timings first.</p><p id="backup-feedback" role="status" aria-live="polite"></p></section>
  <aside><h2>Before you connect</h2><ol><li>Enable Bluetooth on your device.</li><li>Turn a face to wake your cube and keep it nearby.</li><li>Disconnect CubeStation and other cube apps.</li><li>Select your GAN cube in the browser’s device chooser.</li></ol><p>Use Chrome or Edge with Web Bluetooth support on localhost or HTTPS. Browser and operating system support varies.</p></aside></section>
  <section id="log-screen" aria-labelledby="log-title" hidden><p class="eyebrow">CONNECTION DIAGNOSTICS</p><h1 id="log-title">Debug log.</h1><p class="intro">Connection attempts, cube events, and errors. The latest 500 entries stay in this tab across reloads.</p><p id="logging-state" role="status"></p><div class="log-actions"><button id="copy-log" type="button">Copy log</button><button id="clear-log" type="button" class="secondary">Clear log</button></div><p id="log-feedback" role="status"></p><label for="log-output">Timestamped debug log</label><textarea id="log-output" readonly spellcheck="false" wrap="off"></textarea></section>
  </main><footer>GAN CUBE <span>BLUETOOTH LE</span></footer>
  <dialog id="mac-dialog"><form id="mac-form"><h2>Enter your cube’s address</h2><p>Automatic detection wasn’t available. Enter the cube’s Bluetooth MAC address to finish connecting.</p><label for="fallback-mac">Bluetooth MAC address</label><input id="fallback-mac" placeholder="AA:BB:CC:DD:EE:FF" required pattern="([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}" autocomplete="off" spellcheck="false"><div class="dialog-actions"><button type="button" id="cancel" class="secondary">Cancel</button><button type="submit">Continue</button></div></form></dialog>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const connect = el<HTMLButtonElement>('connect');
const disconnect = el<HTMLButtonElement>('disconnect');
const reset = el<HTMLButtonElement>('reset-cube');
const mac = el<HTMLInputElement>('mac');
const dialog = el<HTMLDialogElement>('mac-dialog');
setupDatabaseBackup(el<HTMLButtonElement>('backup-database'), el('backup-feedback'));
const debugPreferenceKey = 'gancube.debugging.v1';
let debuggingEnabled = true;
let cachedDebugPreference: boolean | null = null;
try {
  const value = JSON.parse(localStorage.getItem(debugPreferenceKey) ?? 'null');
  if (typeof value === 'boolean') cachedDebugPreference = debuggingEnabled = value;
} catch { /* Default to the existing enabled behaviour. */ }
let debugPreferenceChanged = false;
let logRenderPending = false;
const debugLog = createDebugLog(() => {
  // Batch fast move bursts and avoid rendering the hidden log screen.
  if (location.hash !== '#log' || logRenderPending) return;
  logRenderPending = true;
  queueMicrotask(() => { logRenderPending = false; renderLog(); });
}, debuggingEnabled);
function renderLog() {
  const output = el<HTMLTextAreaElement>('log-output');
  const atBottom = output.scrollTop + output.clientHeight >= output.scrollHeight - 24;
  output.value = debugLog.text();
  if (atBottom) output.scrollTop = output.scrollHeight;
}
function updateDebuggingControls() {
  const toggle = el<HTMLButtonElement>('toggle-debugging');
  toggle.setAttribute('aria-checked', String(debuggingEnabled));
  toggle.textContent = debuggingEnabled ? 'Disable debugging' : 'Enable debugging';
  el('logging-state').textContent = debuggingEnabled ? 'Debugging enabled.' : 'Debugging disabled. Enable it in Settings to record new entries.';
}
updateDebuggingControls();
async function persistDebugging() {
  try {
    await databaseRequest('settings/debugging', { method: 'PUT', body: JSON.stringify({ enabled: debuggingEnabled }) });
    el('debugging-feedback').textContent = 'Setting saved.';
  } catch {
    el('debugging-feedback').textContent = 'Applied for this browser. Could not save to SQLite; check the API server.';
  }
}
el('toggle-debugging').addEventListener('click', async () => {
  debugPreferenceChanged = true;
  debuggingEnabled = !debuggingEnabled;
  try { localStorage.setItem(debugPreferenceKey, JSON.stringify(debuggingEnabled)); } catch { /* Apply in memory. */ }
  debugLog.setEnabled(debuggingEnabled);
  renderLog();
  el('log-feedback').textContent = '';
  updateDebuggingControls();
  if (debuggingEnabled) debugLog.add('INFO', 'Debugging enabled');
  const button = el<HTMLButtonElement>('toggle-debugging');
  button.disabled = true;
  await persistDebugging();
  button.disabled = false;
});
// Restore SQLite preferences for a fresh browser; cached choices also work offline.
void (async () => {
  if (cachedDebugPreference !== null) { await persistDebugging(); return; }
  try {
    const saved = await databaseRequest<{ enabled: boolean } | null>('settings/debugging');
    if (!debugPreferenceChanged && typeof saved?.enabled === 'boolean') {
      debuggingEnabled = saved.enabled;
      try { localStorage.setItem(debugPreferenceKey, JSON.stringify(debuggingEnabled)); } catch { /* Optional cache. */ }
      debugLog.setEnabled(debuggingEnabled);
      renderLog();
      updateDebuggingControls();
    }
  } catch { /* Keep the current choice when API access is unavailable. */ }
})();
el('clear-log').addEventListener('click', () => {
  debugLog.clear();
  renderLog();
  el('log-feedback').textContent = 'Log cleared.';
});
el('copy-log').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(debugLog.text());
    el('log-feedback').textContent = 'Log copied.';
  } catch {
    renderLog();
    el<HTMLTextAreaElement>('log-output').select();
    el('log-feedback').textContent = 'Copy unavailable. The log is selected; press Ctrl+C (or Cmd+C) to copy.';
  }
});
window.addEventListener('gan-cube-diagnostic', event => {
  const detail = (event as CustomEvent).detail;
  debugLog.add(detail?.stage === 'decode-error' ? 'ERROR' : ['short-packet', 'recovery-resync', 'protocol-disconnect'].includes(detail?.stage) ? 'WARN' : 'INFO', 'Bluetooth packet', detail);
});
window.addEventListener('error', event => debugLog.add('ERROR', 'Unhandled JavaScript error', errorDetails(event.error ?? event.message)));
window.addEventListener('unhandledrejection', event => debugLog.add('ERROR', 'Unhandled promise rejection', errorDetails(event.reason)));
function showScreen() {
  const current = ['cube', 'timings', 'scramble', 'settings', 'log'].find(name => location.hash === `#${name}`) ?? 'cube';
  for (const name of ['cube', 'timings', 'scramble', 'settings', 'log']) {
    el(`${name}-screen`).hidden = name !== current;
    if (name === current) el(`${name}-nav`).setAttribute('aria-current', 'page');
    else el(`${name}-nav`).removeAttribute('aria-current');
  }
  if (current === 'log') renderLog();
}
window.addEventListener('hashchange', showScreen);
showScreen();
let runCube: { cubeId?: string; cubeName?: string } = {};
const pendingKey = 'gancube.pendingTimings.v1';
let pendingTimings: TimingRecord[] = [];
try {
  const pending = JSON.parse(localStorage.getItem(pendingKey) ?? '[]');
  if (Array.isArray(pending)) pendingTimings = pending.filter(row => row && typeof row.id === 'string' && typeof row.durationMs === 'number' && row.outcome === 'solved');
} catch { /* Database remains available if browser storage is disabled. */ }
function cachePending() {
  try { localStorage.setItem(pendingKey, JSON.stringify(pendingTimings)); }
  catch { debugLog.add('WARN', 'Pending timings could not be cached in browser storage'); }
}
// Render locally completed solves immediately, independently of API latency.
const timingHistory = new Map(pendingTimings.map(record => [record.id, record]));
let timingsPage = 0;
let timingsPageSize = 20;
function renderTimings() {
  const rows = el('timing-rows');
  rows.replaceChildren();
  const records = [...timingHistory.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.finishedAt.localeCompare(a.finishedAt));
  timingsPage = Math.min(timingsPage, Math.max(0, Math.ceil(records.length / timingsPageSize) - 1));
  const pageRecords = records.slice(timingsPage * timingsPageSize, (timingsPage + 1) * timingsPageSize);
  el<HTMLButtonElement>('timings-back').disabled = timingsPage === 0;
  el<HTMLButtonElement>('timings-next').disabled = (timingsPage + 1) * timingsPageSize >= records.length;
  el('timings-page-status').textContent = `Page ${timingsPage + 1} of ${Math.max(1, Math.ceil(records.length / timingsPageSize))} · ${records.length} solves`;
  for (const [prefix, summaryRecords] of [['', pageRecords], ['cube-', records.slice(0, 20)]] as const) {
    const durations = summaryRecords.map(record => record.durationMs).sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    const median = durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2;
    const mean = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
    el(`${prefix}timing-median`).textContent = durations.length ? formatTime(median) : '—';
    el(`${prefix}timing-mean`).textContent = durations.length ? formatTime(mean) : '—';
  }
  const pendingIds = new Set(pendingTimings.map(record => record.id));
  for (const record of pageRecords) {
    const row = document.createElement('tr');
    for (const value of [new Date(record.startedAt).toLocaleString(), formatTime(record.durationMs), pendingIds.has(record.id) ? 'Solved · Pending save' : 'Solved', record.cubeName ?? '—']) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    rows.append(row);
  }
}
renderTimings();
el('timings-page-size').addEventListener('change', () => {
  timingsPageSize = Number(el<HTMLSelectElement>('timings-page-size').value);
  timingsPage = 0;
  renderTimings();
});
el('timings-back').addEventListener('click', () => { timingsPage--; renderTimings(); });
el('timings-next').addEventListener('click', () => { timingsPage++; renderTimings(); });
let historyBusy = false;
async function refreshTimings() {
  if (historyBusy) return;
  historyBusy = true;
  el<HTMLButtonElement>('refresh-timings').disabled = true;
  let completed = false;
  try {
    for (const record of [...pendingTimings]) {
      await saveTiming(record);
      pendingTimings = pendingTimings.filter(item => item.id !== record.id);
      cachePending();
      renderTimings();
      debugLog.add('INFO', 'Timing saved to SQLite', { id: record.id, durationMs: record.durationMs, outcome: record.outcome });
    }
    const records = await listTimings();
    for (const record of records) {
      if (record.outcome === 'solved') timingHistory.set(record.id, record);
    }
    renderTimings();
    completed = true;
    el('history-message').textContent = pendingTimings.length ? `${pendingTimings.length} solved timing(s) waiting to save.` : timingHistory.size ? 'All solves · Saved in SQLite' : 'No solves yet. Start the timer and solve the cube to record a time.';
  } catch (error) {
    debugLog.add('ERROR', 'Timing database unavailable', errorDetails(error));
    el('history-message').textContent = `Could not access SQLite. ${pendingTimings.length ? `${pendingTimings.length} solved timing(s) waiting to save. ` : ''}Start the API with npm run dev, then retry.`;
  } finally {
    historyBusy = false;
    el<HTMLButtonElement>('refresh-timings').disabled = false;
    if (completed && pendingTimings.length) void refreshTimings();
  }
}
el('refresh-timings').addEventListener('click', () => { void refreshTimings(); });
const timer = createTimer(el<HTMLButtonElement>('solve-timer'), el('timer-message'), record => {
  if (record.outcome !== 'solved') return;
  const timing = { ...record, ...runCube };
  pendingTimings.push(timing);
  timingHistory.set(timing.id, timing);
  cachePending();
  renderTimings();
  el('history-message').textContent = `${pendingTimings.length} solved timing(s) waiting to save.`;
  void refreshTimings();
}, () => { runCube = { cubeId: selectedDevice?.id, cubeName: connection?.deviceName }; scrambler.startSolve(); });
const scrambler = setupScrambler({ blockTimer: blocked => timer.setBlocked(blocked), timerRunning: () => timer.isRunning() });
el('solve-timer').addEventListener('click', () => scrambler.refresh());
let facelets: string | undefined;
const cubeAnimation = createCubeAnimation(el('cube-image'), SOLVED);
function drawCube(move?: string) {
  cubeAnimation.update(facelets ?? SOLVED, move);
  timer.update(connection ? facelets : undefined);
  scrambler.update(connection ? facelets : undefined);
}
let connection: GanCubeConnection | undefined;
let subscription: Subscription | undefined;
let selectedDevice: BluetoothDevice | undefined;
let busy = false;
let responseTimer: ReturnType<typeof setTimeout> | undefined;
let savedCube = loadCube();
try { savedCube = await restoreCube(); }
catch (error) { debugLog.add('ERROR', 'Settings database unavailable; using browser cache', errorDetails(error)); }
let knownCubes: KnownCube[] = [];
let explicitlySelectedMac: string | undefined;
async function refreshKnownCubes() {
  try {
    knownCubes = await listCubes();
    el('known-cubes-list').replaceChildren(...knownCubes.map(cube => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary known-cube';
      button.textContent = `${cube.name} · ${cube.mac}`;
      button.addEventListener('click', () => {
        explicitlySelectedMac = cube.mac;
        mac.value = cube.mac;
        void connectCube();
      });
      return button;
    }));
    el('known-cubes-status').textContent = knownCubes.length
      ? isAndroid ? 'Select a cube, then choose that same cube in the Bluetooth window. Saved addresses are included in database backups.' : 'Select a cube, then choose that same cube in the Bluetooth window. Addresses are shared across computers using this server.'
      : 'Cubes and their MAC addresses will appear here after connecting.';
  } catch {
    el('known-cubes-status').textContent = isAndroid ? 'Could not load saved cubes. Close and reopen the app to retry.' : 'Could not load saved cubes. Check that the API server is running.';
  }
}
await refreshKnownCubes();
let rememberedDevice: BluetoothDevice | undefined;
function showSavedCube() {
  el('cube-label').textContent = savedCube?.name || 'GAN i Carry 4';
  el('saved-cube').textContent = savedCube ? `Last cube: ${savedCube.name}. Click Disconnected on the Cube screen to reconnect.` : isAndroid ? 'Connected cubes are remembered on this device.' : 'Connected cubes are remembered on this server.';
}
showSavedCube();
if (savedCube) mac.value = savedCube.mac;
const supportIssue = bluetoothSupportIssue();
const supported = supportIssue === null;
debugLog.add('INFO', 'App started', { browser: navigator.userAgent, origin: location.origin, secureContext: window.isSecureContext, bluetooth: !!navigator.bluetooth, getDevices: typeof navigator.bluetooth?.getDevices === 'function', savedCube: savedCube?.name, supportIssue });
let lastStatus = '';
let moveCount = 0;
let lastMoveAt: number | undefined;
let removeDeviceListener: (() => void) | undefined;
async function sendCommand(active: GanCubeConnection, type: 'REQUEST_BATTERY' | 'REQUEST_FACELETS' | 'REQUEST_RESET') {
  debugLog.add('INFO', 'Sending cube command', { type });
  try {
    await active.sendCubeCommand({ type });
    debugLog.add('INFO', 'Cube command written', { type });
  } catch (error) {
    debugLog.add('ERROR', 'Cube command failed', { type, error: errorDetails(error) });
    throw error;
  }
}

function status(text: string, badge: string) {
  if (lastStatus !== text) debugLog.add('INFO', 'Connection status', { state: badge, message: text });
  lastStatus = text;
  el('status').textContent = text;
  el('badge').textContent = badge;
  el('badge').classList.toggle('connected', badge === 'Connected');
  el('live-badge').textContent = badge;
  el('live-badge').classList.toggle('connected', badge === 'Connected');
  el<HTMLButtonElement>('live-badge').disabled = badge !== 'Disconnected' || !supported;
}
function clearSession(text: string) {
  debugLog.add('INFO', 'Clearing connection session', { reason: text, moveCount, msSinceLastMove: lastMoveAt === undefined ? null : Math.round(performance.now() - lastMoveAt), gattConnected: selectedDevice?.gatt?.connected });
  debugLog.flush();
  removeDeviceListener?.();
  removeDeviceListener = undefined;
  clearTimeout(responseTimer);
  reset.disabled = true;
  reset.textContent = 'Reset to solved';
  el('reset-message').textContent = '';
  subscription?.unsubscribe();
  subscription = undefined;
  connection = undefined;
  selectedDevice?.gatt?.disconnect();
  selectedDevice = undefined;
  busy = false;
  connect.disabled = !supported;
  connect.hidden = false;
  disconnect.hidden = true;
  el('details').hidden = true;
  showSavedCube();
  facelets = undefined;
  drawCube();
  el('cube-caption').textContent = 'Reference orientation · Connect your cube in Settings to see its state.';
  el('live-move').textContent = 'Last move: —';
  status(text, 'Disconnected');
}
function requestMac(): Promise<string | null> {
  return new Promise(resolve => {
    const input = el<HTMLInputElement>('fallback-mac');
    input.value = mac.value;
    const form = el<HTMLFormElement>('mac-form');
    const submit = (event: SubmitEvent) => {
      event.preventDefault();
      if (validMac(input.value.trim())) {
        mac.value = input.value.trim().toUpperCase();
        dialog.close(mac.value);
      }
    };
    form.addEventListener('submit', submit);
    dialog.addEventListener('close', () => {
      form.removeEventListener('submit', submit);
      resolve(dialog.returnValue || null);
    }, { once: true });
    dialog.returnValue = '';
    dialog.showModal();
  });
}
el('cancel').addEventListener('click', () => dialog.close(''));

async function connectCube(reconnect = false, automatic = false) {
  if (busy || connection || !supported) return;
  debugLog.add('INFO', 'Connection requested', { reconnect, automatic, savedCube: savedCube?.name });
  moveCount = 0;
  lastMoveAt = undefined;
  el('message').textContent = '';
  const chosenMac = explicitlySelectedMac;
  explicitlySelectedMac = undefined;
  const suppliedMac = reconnect && savedCube ? savedCube.mac : mac.value.trim().toUpperCase();
  if (suppliedMac && !validMac(suppliedMac)) {
    el('message').textContent = 'Enter six pairs of hexadecimal digits separated by colons, e.g. AA:BB:CC:DD:EE:FF.';
    mac.closest('details')!.open = true;
    mac.focus();
    return;
  }
  busy = true;
  connect.disabled = true;
  status(reconnect && savedCube ? `Reconnecting to ${savedCube.name}… Wake your cube and keep it nearby.` : 'Choose your cube in the Bluetooth window.', 'Connecting');
  try {
    let knownDevice: BluetoothDevice | undefined;
    if (reconnect && savedCube) {
      knownDevice = rememberedDevice?.id === savedCube.id ? rememberedDevice : await findSavedDevice(savedCube);
      debugLog.add('INFO', 'Saved device lookup', { found: !!knownDevice });
      if (!knownDevice) {
        clearSession('Your saved cube needs browser permission. Click Choose cube in Settings to select it again.');
        el('cube-caption').textContent = 'Saved cube unavailable · Open Settings and choose your cube again.';
        if (!automatic) location.hash = '#settings';
        return;
      }
    }
    connection = await connectGanCube(async (device, fallback) => {
      if (selectedDevice !== device) {
        removeDeviceListener?.();
        const onDisconnected = () => {
          debugLog.add('WARN', 'Native gattserverdisconnected event', { device: device.name, gattConnected: device.gatt?.connected, moveCount });
          debugLog.flush();
        };
        device.addEventListener?.('gattserverdisconnected', onDisconnected);
        removeDeviceListener = () => device.removeEventListener?.('gattserverdisconnected', onDisconnected);
      }
      selectedDevice = device;
      debugLog.add('INFO', 'Cube selected / MAC resolution', { device: device.name, fallback: !!fallback, savedAddress: device.id === savedCube?.id, manualAddress: !!suppliedMac });
      status('Preparing the encrypted connection. Automatic address detection may take 10 seconds.', 'Connecting');
      if (chosenMac) return chosenMac;
      // A saved MAC belongs only to its exact device; never reuse it for another cube.
      if (savedCube && device.id === savedCube.id && (!suppliedMac || suppliedMac === savedCube.mac)) return savedCube.mac;
      if (suppliedMac && suppliedMac !== savedCube?.mac) return suppliedMac;
      if (isAndroid && validMac(device.id)) return device.id.toUpperCase();
      if (!fallback) return null;
      if (savedCube && device.id !== savedCube.id && mac.value.trim().toUpperCase() === savedCube.mac) mac.value = '';
      status('Enter your cube’s Bluetooth address to continue.', 'Address needed');
      return requestMac();
    }, knownDevice);
    const active = connection;
    debugLog.add('INFO', 'Cube connection established', { device: active.deviceName, gattConnected: selectedDevice?.gatt?.connected });
    el('cube-caption').textContent = 'Reference orientation · Waiting for the cube’s initial state…';
    connect.hidden = true;
    disconnect.hidden = false;
    el('details').hidden = false;
    el('device').textContent = connection.deviceName || 'GAN cube';
    el('cube-label').textContent = connection.deviceName || 'GAN cube';
    el('battery').textContent = 'Waiting for cube';
    el('move').textContent = 'Waiting for a turn';
    el('data').textContent = 'Waiting for cube';
    status('Bluetooth connected. Waiting for cube data to confirm communication.', 'Connected');
    responseTimer = setTimeout(() => {
      debugLog.add('WARN', 'No cube data received within 12 seconds');
      el('message').textContent = 'No cube data received yet. Check the MAC address, wake the cube, then disconnect and retry. This model or firmware may need additional protocol support.';
    }, 12000);
    subscription = active.events$.subscribe(event => {
      if (connection !== active) return;
      if (event.type === 'MOVE') { moveCount++; lastMoveAt = performance.now(); }
      if (event.type !== 'GYRO') debugLog.add(event.type === 'DISCONNECT' ? 'WARN' : 'INFO', `Cube event: ${event.type}`, event);
      if (event.type === 'DISCONNECT') {
        clearSession(selectedDevice?.gatt?.connected ? 'Connection ended by the cube protocol driver. Check Log for the reason, then reconnect.' : 'Connection lost: the browser reported a Bluetooth disconnect. Wake your cube and reconnect.');
        el('cube-caption').textContent = 'Bluetooth connection lost. Click Disconnected to reconnect.';
        return;
      }
      if (['BATTERY', 'MOVE', 'FACELETS', 'HARDWARE'].includes(event.type)) {
        clearTimeout(responseTimer);
        el('message').textContent = '';
        el('data').textContent = 'Receiving cube data';
        status('Your cube is connected and sending data.', 'Connected');
      }
      if (event.type === 'BATTERY') el('battery').textContent = `${event.batteryLevel}%`;
      if (event.type === 'FACELETS' && /^[URFDLB]{54}$/.test(event.facelets)) {
        facelets = event.facelets;
        drawCube();
        el('cube-caption').textContent = 'Live cube state · Green front / white top';
      }
      if (event.type === 'MOVE') {
        scrambler.move(event.move);
        el('move').textContent = event.move;
        el('live-move').textContent = `Last move: ${event.move}`;
        if (facelets) { facelets = applyMove(facelets, event.move); drawCube(event.move); }
      }
    });
    // A read-request failure must not close an otherwise usable Bluetooth link.
    const requestWarnings: string[] = [];
    for (const type of ['REQUEST_BATTERY', 'REQUEST_FACELETS'] as const) {
      if (connection !== active) return;
      try {
        await sendCommand(active, type);
      } catch (error) {
        if (connection !== active) return;
        requestWarnings.push(`${type}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (connection !== active) return;
    busy = false;
    reset.disabled = false;
    if (requestWarnings.length) {
      el('message').textContent = `Bluetooth is still connected, but an initial request failed. ${requestWarnings.join('; ')}`;
    }
    if (selectedDevice?.id && validMac(active.deviceMAC)) {
      rememberedDevice = selectedDevice;
      savedCube = { id: selectedDevice.id, name: active.deviceName || 'GAN cube', mac: active.deviceMAC.toUpperCase() };
      mac.value = savedCube.mac;
      const persisted = await saveCube(savedCube);
      if (persisted) await refreshKnownCubes();
      showSavedCube();
      if (!persisted) el('saved-cube').textContent = 'Could not save cube settings to SQLite. Check that the API server is running.';
    }
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === 'NotFoundError';
    debugLog.add(cancelled ? 'INFO' : 'ERROR', 'Connection attempt ended', errorDetails(error));
    const reason = error instanceof Error ? error.message : String(error);
    const active = connection;
    clearSession(cancelled ? 'No cube selected. You can try again whenever you’re ready.' : 'Couldn’t connect. Check your cube and try again.');
    if (active) await active.disconnect().catch(() => {});
    if (!cancelled) {
      el('message').textContent = reason;
      el('cube-caption').textContent = `Couldn’t connect: ${reason}. Wake your cube and click Disconnected to retry, or choose it in Settings.`;
    }
  }
}
connect.addEventListener('click', () => { void connectCube(); });
el('live-badge').addEventListener('click', () => { void connectCube(true); });
reset.addEventListener('click', async () => {
  const active = connection;
  if (!active || reset.disabled) return;
  reset.disabled = true;
  reset.textContent = 'Resetting…';
  debugLog.add('INFO', 'Reset to solved requested');
  timer.cancel();
  scrambler.cancel();
  el('reset-message').textContent = '';
  try {
    // Reset the device's internal state too, so later snapshots agree with the UI.
    await sendCommand(active, 'REQUEST_RESET');
    if (connection !== active) return;
    facelets = SOLVED;
    drawCube();
    el('move').textContent = 'Waiting for a turn';
    el('live-move').textContent = 'Last move: —';
    el('cube-caption').textContent = 'Live cube state · Green front / white top';
    el('reset-message').textContent = 'Reset to solved. Future turns will update from this state.';
  } catch (error) {
    if (connection === active) {
      el('reset-message').textContent = `Reset failed. Try again. ${error instanceof Error ? error.message : String(error)}`;
    }
  } finally {
    if (connection === active) {
      reset.disabled = false;
      reset.textContent = 'Reset to solved';
    }
  }
});
disconnect.addEventListener('click', async () => {
  debugLog.add('INFO', 'User requested disconnect');
  const active = connection;
  clearSession('Cube disconnected. Ready to connect again.');
  if (active) await active.disconnect().catch(() => {});
});
window.addEventListener('pagehide', () => {
  scrambler.dispose();
  timer.interrupt();
  debugLog.add('INFO', 'Page hidden; closing Bluetooth connection');
  debugLog.flush();
  timer.dispose();
  selectedDevice?.gatt?.disconnect();
});
if (isAndroid) document.addEventListener('visibilitychange', () => {
  if (document.hidden && connection) {
    timer.interrupt();
    clearSession('App moved to background. Tap Disconnected to reconnect.');
  }
});
if (!supported) {
  connect.disabled = true;
  status(supportIssue!, 'Unavailable');
}

void refreshTimings();

if (savedCube && supported) void connectCube(true, true);

setupDatabaseRestore(el<HTMLButtonElement>('restore-database'), el<HTMLInputElement>('restore-file'), el('backup-feedback'), {
  canRestore: () => connection ? 'Disconnect your cube before restoring.'
    : pendingTimings.length || historyBusy ? 'Wait for pending timings to save (use Refresh / retry saves), then restore.' : undefined,
  onSuccess: () => {
    // Do not migrate old browser settings into an empty restored database.
    for (const key of ['gancube.lastCube.v1', debugPreferenceKey]) {
      try { localStorage.removeItem(key); } catch { /* Optional browser cache. */ }
    }
    window.location.reload();
  },
});
