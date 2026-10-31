// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createDebugLog, errorDetails } from '../src/debug-log';
beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
test('timestamps events and includes error names, messages, and stack', () => {
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  const log = createDebugLog(vi.fn());
  log.add('ERROR', 'Command failed', errorDetails(new DOMException('GATT unavailable', 'NetworkError')));
  expect(log.text()).toContain('2026-10-31T12:00:00.000Z [ERROR] Command failed');
  expect(log.text()).toContain('NetworkError');
  expect(log.text()).toContain('GATT unavailable');
  log.flush();
});
test('retains only the latest 500 entries and restores them after reload', () => {
  const log = createDebugLog(vi.fn());
  for (let i = 0; i < 600; i++) log.add('INFO', `Move ${i}`);
  expect(log.text().split('\n')).toHaveLength(500);
  expect(log.text()).not.toContain('Move 99\n');
  log.flush();
  const restored = createDebugLog(vi.fn());
  expect(restored.text()).toBe(log.text());
  restored.clear();
  expect(createDebugLog(vi.fn()).text()).toBe('');
});
test('batches persistence and works with storage disabled', () => {
  const persist = vi.spyOn(Storage.prototype, 'setItem');
  const log = createDebugLog(vi.fn());
  for (let i = 0; i < 20; i++) log.add('INFO', 'Move');
  expect(persist).not.toHaveBeenCalled();
  vi.advanceTimersByTime(250);
  expect(persist).toHaveBeenCalledTimes(1);
  persist.mockImplementation(() => { throw new Error('Storage denied'); });
  log.add('WARN', 'Connection lost');
  expect(() => log.flush()).not.toThrow();
  expect(log.text()).toContain('Connection lost');
});
