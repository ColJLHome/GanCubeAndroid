// @vitest-environment jsdom
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { Subject } from 'rxjs';
const { connectGanCube } = vi.hoisted(() => ({ connectGanCube: vi.fn() }));
vi.mock('gan-web-bluetooth', () => ({ connectGanCube }));
const click = (id: string) => document.getElementById(id)!.click();
const text = (id: string) => document.getElementById(id)!.textContent;
let appListeners: Array<[string, EventListenerOrEventListenerObject]> = [];
function unloadApp() {
  window.dispatchEvent(new Event('pagehide'));
  for (const [type, listener] of appListeners) window.removeEventListener(type, listener);
  appListeners = [];
}
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.resetAllMocks();
  appListeners = [];
  const addListener = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (listener) appListeners.push([type, listener]);
    addListener(type, listener, options);
  });
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => ({
    ok: true,
    json: async () => options?.method === 'PUT' ? JSON.parse(String(options.body)) : String(_url).includes('timings') ? [] : null,
  })));
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'bluetooth', { value: {}, configurable: true });
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/main');
});
afterEach(() => { click('disconnect'); unloadApp(); vi.restoreAllMocks(); });
test('cancellation allows another connection attempt', async () => {
  connectGanCube.mockRejectedValue(new DOMException('Cancelled', 'NotFoundError'));
  click('connect');
  await vi.waitFor(() => expect(text('status')).toContain('No cube selected'));
  expect((document.getElementById('connect') as HTMLButtonElement).disabled).toBe(false);
  expect(text('message')).toBe('');
});
test('rejects malformed MAC before opening the chooser', () => {
  (document.getElementById('mac') as HTMLInputElement).value = 'invalid';
  click('connect');
  expect(connectGanCube).not.toHaveBeenCalled();
  expect(text('message')).toContain('hexadecimal');
});
test('subscribes before requesting data and recovers from a dropped connection', async () => {
  const events$ = new Subject<any>();
  const sendCubeCommand = vi.fn(async () => {});
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand, disconnect: vi.fn(async () => {}) });
  click('connect');
  click('connect');
  await vi.waitFor(() => expect(sendCubeCommand).toHaveBeenCalledTimes(2));
  expect(connectGanCube).toHaveBeenCalledTimes(1);
  expect(text('status')).toContain('Waiting for cube data');
  events$.next({ type: 'BATTERY', batteryLevel: 85 });
  expect(text('battery')).toBe('85%');
  expect(text('data')).toBe('Receiving cube data');
  events$.next({ type: 'MOVE', move: "R'" });
  expect(text('move')).toBe("R'");
  events$.next({ type: 'DISCONNECT' });
  expect(text('status')).toContain('Connection lost');
  expect(events$.observed).toBe(false);
});
test('cleans up selected GATT device after setup failure', async () => {
  const disconnect = vi.fn();
  connectGanCube.mockImplementation(async (provider) => {
    await provider({ name: 'GAN test', gatt: { disconnect } }, false);
    throw new Error('Unsupported service');
  });
  click('connect');
  await vi.waitFor(() => expect(text('message')).toBe('Unsupported service'));
  expect(disconnect).toHaveBeenCalled();
});
test('settings navigation retains the connection and facelet events update the main cube', async () => {
  const events$ = new Subject<any>();
  const disconnect = vi.fn(async () => {});
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand: vi.fn(async () => {}), disconnect });
  click('connect');
  await vi.waitFor(() => expect(events$.observed).toBe(true));
  location.hash = '#settings';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(document.getElementById('cube-screen')!.hidden).toBe(true);
  expect(document.getElementById('settings-screen')!.hidden).toBe(false);
  location.hash = '#cube';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(disconnect).not.toHaveBeenCalled();
  expect(events$.observed).toBe(true);
  events$.next({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
  expect(text('cube-caption')).toContain('Live cube state');
  const before = document.getElementById('cube-image')!.innerHTML;
  events$.next({ type: 'MOVE', move: 'R' });
  expect(document.getElementById('cube-image')!.innerHTML).not.toBe(before);
  expect(text('live-move')).toBe('Last move: R');
});
test('reset synchronises device and display, then applies subsequent turns', async () => {
  const events$ = new Subject<any>();
  const sendCubeCommand = vi.fn(async () => {});
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand, disconnect: vi.fn(async () => {}) });
  expect((document.getElementById('reset-cube') as HTMLButtonElement).disabled).toBe(true);
  click('connect');
  await vi.waitFor(() => expect((document.getElementById('reset-cube') as HTMLButtonElement).disabled).toBe(false));
  events$.next({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
  const solvedDrawing = document.getElementById('cube-image')!.innerHTML;
  events$.next({ type: 'MOVE', move: 'R' });
  expect(document.getElementById('cube-image')!.innerHTML).not.toBe(solvedDrawing);
  click('reset-cube');
  click('reset-cube');
  await vi.waitFor(() => expect(text('reset-message')).toContain('Reset to solved'));
  expect(sendCubeCommand.mock.calls.filter(call => (call as any)[0].type === 'REQUEST_RESET')).toHaveLength(1);
  expect(document.getElementById('cube-image')!.innerHTML).toBe(solvedDrawing);
  expect(text('live-move')).toBe('Last move: —');
  events$.next({ type: 'MOVE', move: 'R' });
  expect(document.getElementById('cube-image')!.innerHTML).not.toBe(solvedDrawing);
  click('disconnect');
  expect((document.getElementById('reset-cube') as HTMLButtonElement).disabled).toBe(true);
});
test('failed reset retains the existing drawing and allows retry', async () => {
  const events$ = new Subject<any>();
  const sendCubeCommand = vi.fn(async (command: { type: string }) => {
    if (command.type === 'REQUEST_RESET') throw new Error('Write failed');
  });
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand, disconnect: vi.fn(async () => {}) });
  click('connect');
  await vi.waitFor(() => expect((document.getElementById('reset-cube') as HTMLButtonElement).disabled).toBe(false));
  events$.next({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
  events$.next({ type: 'MOVE', move: 'F' });
  const before = document.getElementById('cube-image')!.innerHTML;
  click('reset-cube');
  await vi.waitFor(() => expect(text('reset-message')).toContain('Reset failed'));
  expect(document.getElementById('cube-image')!.innerHTML).toBe(before);
  expect((document.getElementById('reset-cube') as HTMLButtonElement).disabled).toBe(false);
});
const saved = { id: 'cube-1', name: 'GAN remembered', mac: 'AA:BB:CC:DD:EE:FF' };
async function reloadApp() {
  unloadApp();
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  await import('../src/main');
}
test('saves a selected cube and reconnects to that device in the same tab', async () => {
  const device = { id: saved.id, name: saved.name, gatt: { disconnect: vi.fn() } };
  const sendCubeCommand = vi.fn(async () => {});
  connectGanCube.mockImplementation(async (provider, knownDevice) => {
    if (knownDevice) expect(knownDevice).toBe(device);
    await provider(device, false);
    return { deviceName: saved.name, deviceMAC: saved.mac, events$: new Subject(), sendCubeCommand, disconnect: vi.fn(async () => {}) };
  });
  click('connect');
  await vi.waitFor(() => expect(localStorage.getItem('gancube.lastCube.v1')).not.toBeNull());
  expect(JSON.parse(localStorage.getItem('gancube.lastCube.v1')!)).toEqual(saved);
  click('disconnect');
  expect(text('cube-label')).toBe(saved.name);
  click('live-badge');
  await vi.waitFor(() => expect(connectGanCube).toHaveBeenCalledTimes(2));
  expect(connectGanCube.mock.calls[1][1]).toBe(device);
});
test('startup restores saved settings and automatically reconnects to the exact permitted device', async () => {
  localStorage.setItem('gancube.lastCube.v1', JSON.stringify(saved));
  const device = { id: saved.id, gatt: { disconnect: vi.fn() } };
  const getDevices = vi.fn(async () => [{ id: 'other', name: saved.name }, device]);
  Object.defineProperty(navigator, 'bluetooth', { value: { getDevices }, configurable: true });
  connectGanCube.mockImplementation(async (provider, knownDevice) => {
    expect(knownDevice).toBe(device);
    expect(await provider(device, false)).toBe(saved.mac);
    return { deviceName: saved.name, deviceMAC: saved.mac, events$: new Subject(), sendCubeCommand: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) };
  });
  await reloadApp();
  await vi.waitFor(() => expect(text('live-badge')).toBe('Connected'));
  expect(text('cube-label')).toBe(saved.name);
  expect((document.getElementById('mac') as HTMLInputElement).value).toBe(saved.mac);
  expect(connectGanCube).toHaveBeenCalledTimes(1);
  expect(getDevices).toHaveBeenCalledTimes(1);
});
test('lost permission offers a chooser in Settings without replacing saved settings', async () => {
  localStorage.setItem('gancube.lastCube.v1', JSON.stringify(saved));
  Object.defineProperty(navigator, 'bluetooth', { value: { getDevices: vi.fn(async () => []) }, configurable: true });
  await reloadApp();
  click('live-badge');
  await vi.waitFor(() => expect(text('status')).toContain('needs browser permission'));
  expect(location.hash).toBe('#settings');
  expect(connectGanCube).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem('gancube.lastCube.v1')!)).toEqual(saved);
});
test('choosing a different cube does not reuse the saved MAC address', async () => {
  localStorage.setItem('gancube.lastCube.v1', JSON.stringify(saved));
  await reloadApp();
  connectGanCube.mockImplementation(async provider => {
    expect(await provider({ id: 'cube-2' }, false)).toBeNull();
    throw new Error('Test finished');
  });
  click('connect');
  await vi.waitFor(() => expect(text('message')).toBe('Test finished'));
  expect(JSON.parse(localStorage.getItem('gancube.lastCube.v1')!)).toEqual(saved);
});
test('timer stops when incoming turns solve the live cube', async () => {
  const events$ = new Subject<any>();
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) });
  click('connect');
  await vi.waitFor(() => expect(events$.observed).toBe(true));
  events$.next({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
  events$.next({ type: 'MOVE', move: 'R' });
  click('solve-timer');
  expect(text('solve-timer')).toContain('Stop timer');
  events$.next({ type: 'MOVE', move: "R'" });
  expect(text('timer-message')).toContain('Solved ·');
  expect(text('solve-timer')).toContain('Start timer');
});
test('a startup request failure keeps the connection alive and processes shuffle turns', async () => {
  const events$ = new Subject<any>();
  const disconnect = vi.fn(async () => {});
  const sendCubeCommand = vi.fn(async (command: { type: string }) => {
    if (command.type === 'REQUEST_BATTERY') throw new Error('GATT operation already in progress');
  });
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand, disconnect });
  click('connect');
  await vi.waitFor(() => expect(sendCubeCommand).toHaveBeenCalledTimes(2));
  expect(text('live-badge')).toBe('Connected');
  expect(disconnect).not.toHaveBeenCalled();
  expect(text('message')).toContain('initial request failed');
  events$.next({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
  for (const move of ['R', 'U', 'F', "L'", 'D', 'B']) events$.next({ type: 'MOVE', move });
  expect(text('live-badge')).toBe('Connected');
  expect(text('live-move')).toBe('Last move: B');
  expect(disconnect).not.toHaveBeenCalled();
});
test('an old setup request cannot disconnect a newer session', async () => {
  const oldEvents = new Subject<any>();
  let rejectOld!: (reason: Error) => void;
  const pending = new Promise<void>((_, reject) => { rejectOld = reject; });
  connectGanCube.mockResolvedValueOnce({ deviceName: 'old', events$: oldEvents, sendCubeCommand: vi.fn(() => pending), disconnect: vi.fn(async () => {}) });
  click('connect');
  await vi.waitFor(() => expect(oldEvents.observed).toBe(true));
  oldEvents.next({ type: 'DISCONNECT' });
  const disconnect = vi.fn(async () => {});
  connectGanCube.mockResolvedValueOnce({ deviceName: 'new', events$: new Subject(), sendCubeCommand: vi.fn(async () => {}), disconnect });
  click('connect');
  await vi.waitFor(() => expect(text('device')).toBe('new'));
  rejectOld(new Error('Old GATT request failed'));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(text('live-badge')).toBe('Connected');
  expect(text('device')).toBe('new');
  expect(disconnect).not.toHaveBeenCalled();
});
test('log screen keeps turn and disconnect history without closing the connection on navigation', async () => {
  const events$ = new Subject<any>();
  const disconnect = vi.fn(async () => {});
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand: vi.fn(async () => {}), disconnect });
  click('connect');
  await vi.waitFor(() => expect(events$.observed).toBe(true));
  location.hash = '#log';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(document.getElementById('log-screen')!.hidden).toBe(false);
  expect(document.getElementById('cube-screen')!.hidden).toBe(true);
  expect(document.getElementById('log-nav')!.getAttribute('aria-current')).toBe('page');
  expect(disconnect).not.toHaveBeenCalled();
  events$.next({ type: 'MOVE', move: 'R', serial: 1 });
  events$.next({ type: 'DISCONNECT' });
  await vi.waitFor(() => {
    const output = (document.getElementById('log-output') as HTMLTextAreaElement).value;
    expect(output).toContain('Cube event: MOVE');
    expect(output).toContain('Cube event: DISCONNECT');
    expect(output).toContain('browser reported a Bluetooth disconnect');
  });
  const copy = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: copy }, configurable: true });
  click('copy-log');
  await vi.waitFor(() => expect(text('log-feedback')).toBe('Log copied.'));
  expect(copy.mock.calls[0][0]).toContain('Cube event: DISCONNECT');
  click('clear-log');
  expect((document.getElementById('log-output') as HTMLTextAreaElement).value).toBe('');
});
test('completed solves are saved to SQLite API and displayed in recent timings', async () => {
  const records: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/timings' && options?.method === 'POST') records.push(JSON.parse(String(options.body)));
    return { ok: true, json: async () => url.includes('timings?') ? records : null };
  }));
  const events$ = new Subject<any>();
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) });
  click('connect');
  await vi.waitFor(() => expect(events$.observed).toBe(true));
  events$.next({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
  events$.next({ type: 'MOVE', move: 'R' });
  click('solve-timer');
  events$.next({ type: 'MOVE', move: "R'" });
  await vi.waitFor(() => expect(text('timing-rows')).toContain('Solved'));
  await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('gancube.pendingTimings.v1')!)).toEqual([]));
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ cubeName: 'GAN test', outcome: 'solved' });
  expect(records[0].durationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.parse(localStorage.getItem('gancube.pendingTimings.v1')!)).toEqual([]);
});
test('offline timings are retained for retry and saved once the API returns', async () => {
  const events$ = new Subject<any>();
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) });
  click('connect');
  await vi.waitFor(() => expect(events$.observed).toBe(true));
  events$.next({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('API offline'); }));
  events$.next({ type: 'MOVE', move: 'R' });
  click('solve-timer');
  events$.next({ type: 'MOVE', move: "R'" });
  expect(text('timing-rows')).toContain('Solved · Pending save');
  await vi.waitFor(() => expect(text('history-message')).toContain('Could not access SQLite'));
  const pending = JSON.parse(localStorage.getItem('gancube.pendingTimings.v1')!);
  expect(pending).toHaveLength(1);
  expect(pending[0].outcome).toBe('solved');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('timings?') ? pending : {} })));
  click('refresh-timings');
  await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('gancube.pendingTimings.v1')!)).toEqual([]));
  expect(text('timing-rows')).toContain('Solved');
  expect(text('timing-rows')).not.toContain('Pending save');
});
test('a solved timing appears before the database responds and survives a stale history response', async () => {
  const events$ = new Subject<any>();
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) });
  click('connect');
  await vi.waitFor(() => expect(events$.observed).toBe(true));
  let finishSave!: () => void;
  const pendingSave = new Promise<void>(resolve => { finishSave = resolve; });
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') await pendingSave;
    return { ok: true, json: async () => [] };
  }));
  events$.next({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
  events$.next({ type: 'MOVE', move: 'R' });
  click('solve-timer');
  events$.next({ type: 'MOVE', move: "R'" });
  expect(text('timing-rows')).toContain('Solved · Pending save');
  finishSave();
  await vi.waitFor(() => expect(text('history-message')).toContain('Saved in SQLite'));
  expect(text('timing-rows')).toContain('Solved');
  expect(text('timing-rows')).not.toContain('Pending save');
});
test('debugging toggle clears the log immediately and suppresses packets until re-enabled', async () => {
  location.hash = '#log';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.dispatchEvent(new CustomEvent('gan-cube-diagnostic', { detail: { stage: 'notification', bytes: 20 } }));
  await vi.waitFor(() => expect((document.getElementById('log-output') as HTMLTextAreaElement).value).toContain('Bluetooth packet'));
  click('toggle-debugging');
  expect(document.getElementById('toggle-debugging')!.getAttribute('aria-checked')).toBe('false');
  expect((document.getElementById('log-output') as HTMLTextAreaElement).value).toBe('');
  window.dispatchEvent(new CustomEvent('gan-cube-diagnostic', { detail: { stage: 'decode-error', error: 'ignored while disabled' } }));
  await vi.waitFor(() => expect((document.getElementById('toggle-debugging') as HTMLButtonElement).disabled).toBe(false));
  expect((document.getElementById('log-output') as HTMLTextAreaElement).value).toBe('');
  expect(JSON.parse(sessionStorage.getItem('gancube.debugLog.v1')!)).toEqual([]);
  expect(fetch).toHaveBeenCalledWith('/api/settings/debugging', expect.objectContaining({ method: 'PUT', body: '{"enabled":false}' }));
  await reloadApp();
  expect(document.getElementById('toggle-debugging')!.getAttribute('aria-checked')).toBe('false');
  expect((document.getElementById('log-output') as HTMLTextAreaElement).value).toBe('');
  await vi.waitFor(() => expect((document.getElementById('toggle-debugging') as HTMLButtonElement).disabled).toBe(false));
  click('toggle-debugging');
  await vi.waitFor(() => expect((document.getElementById('log-output') as HTMLTextAreaElement).value).toContain('Debugging enabled'));
});
test('TNoodle guided scramble verifies Bluetooth moves, corrections, and split half turns', async () => {
  const events$ = new Subject<any>();
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) });
  click('connect');
  await vi.waitFor(() => expect(events$.observed).toBe(true));
  events$.next({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('scrambles') ? { scramble: "R U2 F'", source: 'TNoodle' } : [] })));
  click('generate-scramble');
  await vi.waitFor(() => expect(text('scramble-next')).toBe('R'));
  expect((document.getElementById('solve-timer') as HTMLButtonElement).disabled).toBe(true);
  events$.next({ type: 'MOVE', move: 'F' });
  expect(text('scramble-instruction')).toContain('Undo the incorrect turn');
  expect(text('scramble-next')).toBe("F'");
  events$.next({ type: 'MOVE', move: "F'" });
  expect(text('scramble-next')).toBe('R');
  events$.next({ type: 'MOVE', move: 'R' });
  events$.next({ type: 'MOVE', move: "U'" });
  expect(text('scramble-next')).toBe("U'");
  events$.next({ type: 'MOVE', move: "U'" });
  events$.next({ type: 'MOVE', move: "F'" });
  expect(text('scramble-progress')).toBe('3 / 3 moves verified');
  expect(text('scramble-message')).toContain('Scramble complete');
  expect((document.getElementById('solve-timer') as HTMLButtonElement).disabled).toBe(false);
});
test('disconnect cancels guided scrambling and disables timing', async () => {
  const events$ = new Subject<any>();
  connectGanCube.mockResolvedValue({ deviceName: 'GAN test', events$, sendCubeCommand: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) });
  click('connect');
  await vi.waitFor(() => expect(events$.observed).toBe(true));
  events$.next({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ scramble: 'R U2' }) })));
  click('generate-scramble');
  await vi.waitFor(() => expect(text('scramble-next')).toBe('R'));
  events$.next({ type: 'DISCONNECT' });
  expect(text('scramble-message')).toContain('Connection lost');
  expect(text('scramble-next')).toBe('—');
  expect((document.getElementById('solve-timer') as HTMLButtonElement).disabled).toBe(true);
});
