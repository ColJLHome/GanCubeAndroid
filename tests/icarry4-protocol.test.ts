// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';
const { connectGanCube } = createRequire(import.meta.url)('gan-web-bluetooth');
const packet = (hex: string) => Uint8Array.from(hex.split(' ').map(byte => Number.parseInt(byte, 16)));
const solved = 'ed 0e 00 00 05 39 70 00 00 09 1a 2b 3c 4d 00 00 00 00 70 90';
const firstMove = '01 07 79 80 14 00 74 00 42 00 00 00 00 00 00 00 00 00 17 dd';
const secondMove = '01 07 77 85 14 00 75 00 08 00 00 00 00 00 00 00 00 00 c9 dc';
const changed = 'ed 0e 00 00 29 89 70 00 00 91 82 2b 3c 4d 00 00 00 00 51 8e';
const histories = [
  'd1 0d 73 32 01 48 a7 9b 13 70 25 13 60 28 a6 00 00 00 22 3a',
  'd1 0d 7f 9b 50 4a 5b 11 59 48 05 51 59 48 03 00 00 00 1f 91',
  'd1 0d 8b 42 48 49 56 85 97 50 41 53 42 5a 4b 00 00 00 67 0d',
  'd1 0d 97 55 71 40 6a 2b 47 86 b7 19 b5 b3 7b 00 00 00 2f dd',
  'd1 0b a3 13 53 97 3b 95 91 57 91 7b 93 00 00 00 00 00 7a 17',
];
async function setup(name = 'GANic4_913E') {
  const writeValue = vi.fn(async () => {});
  const state = Object.assign(new EventTarget(), { startNotifications: vi.fn(async () => {}), stopNotifications: vi.fn(async () => {}) });
  const service = { uuid: '00000010-0000-fff7-fff6-fff5fff4fff0', getCharacteristic: async (uuid: string) => uuid === '0000fff5-0000-1000-8000-00805f9b34fb' ? { writeValue } : state };
  const device = Object.assign(new EventTarget(), { id: 'cube', name, gatt: { connected: true, connect: async () => ({ getPrimaryServices: async () => [service] }), disconnect: vi.fn() } });
  const conn = await connectGanCube(async () => 'AA:BB:CC:DD:EE:FF', device);
  // Replay already-decrypted bytes from the user's trace through the real driver.
  conn.encrypter.decrypt = (bytes: Uint8Array) => bytes;
  conn.encrypter.encrypt = (bytes: Uint8Array) => bytes;
  const events: any[] = [];
  const subscription = conn.events$.subscribe((event: any) => events.push(event));
  return { conn, events, writeValue, feed: (hex: string) => conn.onStateUpdate({ target: { value: new DataView(packet(hex).buffer) } }), cleanup: async () => { subscription.unsubscribe(); if (!events.some(event => event.type === 'DISCONNECT')) await conn.disconnect(); } };
}
test('i Carry 4 zero snapshot counters do not trigger recovery or disconnect on the first turns', async () => {
  const { conn, events, writeValue, feed, cleanup } = await setup();
  try {
    await feed(solved);
    await feed(firstMove);
    for (const history of histories) await feed(history);
    await feed(changed);
    await feed(secondMove);
    expect(events.some(event => event.type === 'DISCONNECT')).toBe(false);
    expect(events.filter(event => event.type === 'MOVE').map(event => [event.serial, event.move])).toEqual([[116, "U'"], [117, 'F']]);
    expect(writeValue).not.toHaveBeenCalled();
  } finally { await cleanup(); }
});
function moveWithSerial(serial: number, faceHot = 8) {
  const bytes = packet(secondMove);
  bytes[6] = serial & 255;
  bytes[7] = serial >> 8;
  bytes[8] = faceHot;
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(' ');
}
test('real gaps between live turns still recover normally after a zero-counter snapshot', async () => {
  const { events, writeValue, feed, cleanup } = await setup();
  try {
    await feed(solved);
    await feed(firstMove);
    await feed(changed);
    await feed(moveWithSerial(118, 32)); // R; F at counter 117 was missed
    expect(writeValue).toHaveBeenCalledTimes(1);
    await feed('d1 02 75 63 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00');
    expect(events.filter(event => event.type === 'MOVE').map(event => [event.serial, event.move])).toEqual([[116, "U'"], [117, 'F'], [118, 'R']]);
    expect(events.some(event => event.type === 'DISCONNECT')).toBe(false);
  } finally { await cleanup(); }
});
test('reset allows the next live turn to establish a new counter baseline', async () => {
  const { conn, events, writeValue, feed, cleanup } = await setup();
  try {
    await feed(solved);
    await feed(firstMove);
    await conn.sendCubeCommand({ type: 'REQUEST_RESET' });
    await feed(solved);
    await feed(moveWithSerial(5));
    expect(events.filter(event => event.type === 'MOVE').map(event => event.serial)).toEqual([116, 5]);
    expect(writeValue).toHaveBeenCalledTimes(1); // reset only, no old history
  } finally { await cleanup(); }
});
test('live move counters continue across the 8-bit boundary', async () => {
  const { events, writeValue, feed, cleanup } = await setup();
  try {
    await feed(solved);
    for (const serial of [255, 256, 257]) await feed(moveWithSerial(serial));
    expect(events.filter(event => event.type === 'MOVE').map(event => event.serial)).toEqual([255, 256, 257]);
    expect(writeValue).not.toHaveBeenCalled();
  } finally { await cleanup(); }
});
test('a stalled recovery resynchronises the i Carry 4 without disconnecting', async () => {
  const { events, writeValue, feed, cleanup } = await setup();
  try {
    await feed(solved);
    await feed(firstMove);
    // No history response arrives for missing serial 117.
    for (let serial = 118; serial <= 134; serial++) await feed(moveWithSerial(serial));
    expect([...writeValue.mock.calls.at(-1)![0]]).toEqual([0xdd, 4, 0, 0xed, ...new Array(16).fill(0)]);
    await feed(changed);
    await feed(moveWithSerial(135));
    expect(events.filter(event => event.type === 'MOVE').at(-1).serial).toBe(135);
    expect(events.some(event => event.type === 'DISCONNECT')).toBe(false);
  } finally { await cleanup(); }
});
test('other Gen4 models keep their existing snapshot counter recovery', async () => {
  const { events, writeValue, feed, cleanup } = await setup('GAN14-test');
  try {
    await feed(solved);
    await feed(firstMove);
    expect(events.filter(event => event.type === 'MOVE')).toHaveLength(0);
    expect(writeValue).toHaveBeenCalledTimes(1);
  } finally { await cleanup(); }
});
