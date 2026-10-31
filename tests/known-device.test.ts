// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';
// Exercise the package's CJS build in Node; Vite bundles its ESM build for browsers.
const { connectGanCube } = createRequire(import.meta.url)('gan-web-bluetooth');
test('patched connector bypasses chooser for a known device', async () => {
  const requestDevice = vi.fn();
  Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice }, configurable: true });
  const device = { id: 'known-device' } as BluetoothDevice;
  const sentinel = new Error('Stop before GATT setup');
  const provider = vi.fn(async () => { throw sentinel; });
  await expect(connectGanCube(provider, device)).rejects.toBe(sentinel);
  expect(provider).toHaveBeenCalledWith(device, false);
  expect(requestDevice).not.toHaveBeenCalled();
});
test('GATT writes are serialised and a failed write does not block the next request', async () => {
  let rejectFirst!: (reason: Error) => void;
  const firstWrite = new Promise<void>((_, reject) => { rejectFirst = reject; });
  const writeValue = vi.fn().mockReturnValueOnce(firstWrite).mockResolvedValue(undefined);
  const state = Object.assign(new EventTarget(), { startNotifications: vi.fn(async () => {}), stopNotifications: vi.fn(async () => {}) });
  const service = {
    uuid: '00000010-0000-fff7-fff6-fff5fff4fff0',
    getCharacteristic: vi.fn(async (uuid: string) => uuid === '0000fff5-0000-1000-8000-00805f9b34fb' ? { writeValue } : state),
  };
  const device = Object.assign(new EventTarget(), {
    id: 'known-device', name: 'GAN test',
    gatt: { connect: vi.fn(async () => ({ getPrimaryServices: async () => [service] })), connected: true, disconnect: vi.fn() },
  });
  const conn = await connectGanCube(async () => 'AA:BB:CC:DD:EE:FF', device);
  const first = conn.sendCubeCommand({ type: 'REQUEST_BATTERY' });
  const firstRejected = expect(first).rejects.toThrow('GATT busy');
  const second = conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  await vi.waitFor(() => expect(writeValue).toHaveBeenCalledTimes(1));
  rejectFirst(new Error('GATT busy'));
  await firstRejected;
  await second;
  expect(writeValue).toHaveBeenCalledTimes(2);
  await conn.disconnect();
});
test('transport diagnostics report short, ignored, and failed notifications', async () => {
  const state = Object.assign(new EventTarget(), { startNotifications: vi.fn(async () => {}), stopNotifications: vi.fn(async () => {}) });
  const service = {
    uuid: '00000010-0000-fff7-fff6-fff5fff4fff0',
    getCharacteristic: vi.fn(async (uuid: string) => uuid === '0000fff5-0000-1000-8000-00805f9b34fb' ? { writeValue: vi.fn(async () => {}) } : state),
  };
  const device = Object.assign(new EventTarget(), { id: 'test', gatt: { connect: async () => ({ getPrimaryServices: async () => [service] }), disconnect: vi.fn() } });
  const conn = await connectGanCube(async () => 'AA:BB:CC:DD:EE:FF', device);
  const diagnostics: any[] = [];
  const onDiagnostic = (event: Event) => diagnostics.push((event as CustomEvent).detail);
  window.addEventListener('gan-cube-diagnostic', onDiagnostic);
  try {
    await conn.onStateUpdate({ target: { value: new DataView(new ArrayBuffer(8)) } });
    expect(diagnostics.at(-1)).toEqual({ stage: 'short-packet', bytes: 8 });
    const backing = new Uint8Array(40).fill(0x11);
    backing.fill(0x22, 4, 24);
    conn.encrypter.decrypt = vi.fn((bytes: Uint8Array) => bytes);
    conn.driver.handleStateEvent = vi.fn(async () => []);
    await conn.onStateUpdate({ target: { value: new DataView(backing.buffer, 4, 20) } });
    expect(conn.encrypter.decrypt.mock.calls[0][0]).toEqual(new Uint8Array(20).fill(0x22));
    expect(diagnostics.at(-1)).toMatchObject({ stage: 'decoded', bytes: 20, opcode: 0x22, events: [] });
    conn.driver.handleStateEvent.mockRejectedValueOnce(new Error('bad move packet'));
    await expect(conn.onStateUpdate({ target: { value: new DataView(backing.buffer) } })).rejects.toThrow('bad move packet');
    expect(diagnostics.at(-1)).toMatchObject({ stage: 'decode-error', error: 'Error: bad move packet' });
  } finally {
    window.removeEventListener('gan-cube-diagnostic', onDiagnostic);
    await conn.disconnect();
  }
});
