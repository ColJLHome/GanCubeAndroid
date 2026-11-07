import { applyMove, cubeSvg } from './cube';

/** Keeps visual turns in order without delaying the live application state. */
export function createCubeAnimation(element: HTMLElement, initial: string) {
  let state = initial;
  let target = initial;
  let frame: number | undefined;
  const queue: string[] = [];
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: true };
  const render = () => { element.innerHTML = cubeSvg(state); };
  const snap = (next: string) => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    queue.length = 0;
    state = target = next;
    render();
  };
  function start() {
    const move = queue.shift();
    if (!move) { frame = undefined; return; }
    let started: number | undefined;
    const duration = queue.length > 2 ? 65 : 150;
    const tick = (now: number) => {
      if (reduced.matches || document.hidden) { snap(target); return; }
      started ??= now;
      const progress = Math.min(1, (now-started)/duration);
      const eased = progress*progress*(3-2*progress);
      element.innerHTML = cubeSvg(state, move, eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else { state = applyMove(state, move); render(); start(); }
    };
    frame = requestAnimationFrame(tick);
  }
  return {
    update(next: string, move?: string) {
      if (next === target) return;
      if (!move || applyMove(target, move) !== next || reduced.matches || document.hidden) { snap(next); return; }
      target = next;
      queue.push(move);
      if (frame === undefined) start();
    },
  };
}
