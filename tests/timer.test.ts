// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createTimer, formatTime } from '../src/timer';
import { applyMove, SOLVED } from '../src/cube';
let button: HTMLButtonElement;
let message: HTMLElement;
let timer: ReturnType<typeof createTimer>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  button = document.createElement('button');
  message = document.createElement('p');
  timer = createTimer(button, message);
});
afterEach(() => { timer.dispose(); vi.useRealTimers(); });
test('requires live cube state and counts from the start button click', () => {
  expect(button.disabled).toBe(true);
  timer.update(applyMove(SOLVED, 'R'));
  button.click();
  vi.advanceTimersByTime(1234);
  expect(button.textContent).toContain('1.22'); // last 33ms display refresh
  timer.update(SOLVED);
  expect(message.textContent).toBe('Solved · 1.23');
  vi.advanceTimersByTime(5000);
  expect(message.textContent).toBe('Solved · 1.23');
});
test('ignores repeated solved snapshots until cube has been scrambled', () => {
  timer.update(SOLVED);
  button.click();
  vi.advanceTimersByTime(1000);
  timer.update(SOLVED);
  expect(button.textContent).toContain('Stop timer');
  timer.update(applyMove(SOLVED, 'F'));
  vi.advanceTimersByTime(500);
  timer.update(SOLVED);
  expect(message.textContent).toBe('Solved · 1.50');
});
test('a new run clears the previous elapsed time', () => {
  timer.update(applyMove(SOLVED, 'R'));
  button.click();
  vi.advanceTimersByTime(3000);
  button.click();
  expect(message.textContent).toBe('Stopped manually · 3.00');
  button.click();
  vi.advanceTimersByTime(500);
  timer.update(SOLVED);
  expect(message.textContent).toBe('Solved · 0.50');
});
test('disconnect interrupts a run without marking it solved', () => {
  timer.update(applyMove(SOLVED, 'R'));
  button.click();
  vi.advanceTimersByTime(2000);
  timer.update(undefined);
  expect(message.textContent).toBe('Interrupted: cube disconnected · 2.00');
  expect(button.disabled).toBe(true);
});
test('reset cancels a run before the solved state is applied', () => {
  timer.update(applyMove(SOLVED, 'R'));
  button.click();
  vi.advanceTimersByTime(1500);
  timer.cancel();
  timer.update(SOLVED);
  expect(message.textContent).toBe('Cancelled: cube state reset · 1.50');
});
test('formats minutes and hundredths', () => {
  expect(formatTime(61234)).toBe('1:01.23');
  expect(formatTime(100)).toBe('0.10');
});
test('records exactly one timing with its start state, duration, and finish outcome', () => {
  timer.dispose();
  const record = vi.fn();
  timer = createTimer(button = document.createElement('button'), message, record);
  const scrambled = applyMove(SOLVED, 'R');
  timer.update(scrambled);
  button.click();
  vi.advanceTimersByTime(1234);
  timer.update(SOLVED);
  timer.update(SOLVED);
  expect(record).toHaveBeenCalledTimes(1);
  expect(record.mock.calls[0][0]).toMatchObject({ durationMs: 1234, outcome: 'solved', initialFacelets: scrambled });
  expect(record.mock.calls[0][0].id).toMatch(/^[\da-f-]{36}$/);
});
