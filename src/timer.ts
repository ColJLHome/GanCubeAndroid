import { SOLVED } from './cube';
import type { TimingOutcome, TimingRecord } from './database';

export function formatTime(milliseconds: number): string {
  const hundredths = Math.floor(Math.max(0, milliseconds) / 10);
  const seconds = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, '0');
  return seconds < 60 ? `${seconds}.${fraction}` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${fraction}`;
}

/** Uses the monotonic clock; display refreshes never determine elapsed time. */
export function createTimer(button: HTMLButtonElement, message: HTMLElement, onFinish?: (record: TimingRecord) => void, onStart?: () => void) {
  let state: string | undefined;
  let startedAt: number | undefined;
  let elapsed = 0;
  let run: Pick<TimingRecord, 'id' | 'startedAt' | 'initialFacelets'> | undefined;
  let hasBeenUnsolved = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  function render() {
    button.disabled = !state;
    const time = formatTime(startedAt === undefined ? elapsed : performance.now() - startedAt);
    button.textContent = startedAt === undefined ? `Start timer · ${time}` : `Stop timer · ${time}`;
  }
  function stop(text: string, outcome: TimingOutcome) {
    if (startedAt === undefined) return;
    elapsed = performance.now() - startedAt;
    startedAt = undefined;
    clearInterval(interval);
    interval = undefined;
    message.textContent = `${text} · ${formatTime(elapsed)}`;
    render();
    if (run) {
      const result = { ...run, finishedAt: new Date().toISOString(), durationMs: Math.round(elapsed), outcome };
      run = undefined;
      if (outcome === 'solved') onFinish?.(result);
    }
  }
  button.addEventListener('click', () => {
    if (!state) return;
    if (startedAt !== undefined) { stop('Stopped manually', 'manual'); return; }
    elapsed = 0;
    run = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), initialFacelets: state };
    onStart?.();
    hasBeenUnsolved = state !== SOLVED;
    startedAt = performance.now();
    message.textContent = hasBeenUnsolved ? 'Timing… Solving the cube stops the timer automatically.' : 'Timing… Turn the cube; the timer stops when you return to solved.';
    interval = setInterval(render, 33);
    render();
  });
  render();
  return {
    update(nextState: string | undefined) {
      state = nextState;
      if (!state) stop('Interrupted: cube disconnected', 'interrupted');
      else if (startedAt !== undefined) {
        if (state !== SOLVED) hasBeenUnsolved = true;
        else if (hasBeenUnsolved) stop('Solved', 'solved');
      }
      render();
    },
    cancel() { stop('Cancelled: cube state reset', 'reset'); },
    interrupt() { stop('Interrupted: page closed', 'interrupted'); },
    dispose() { clearInterval(interval); },
  };
}
