import { SOLVED } from './cube';
import { ScrambleGuide } from './scramble-guide';
const descriptions: Record<string, string> = { U: 'top (white centre)', R: 'right (red centre)', F: 'front (green centre)', D: 'bottom (yellow centre)', L: 'left (orange centre)', B: 'back (blue centre)' };
export function setupScrambler(options: { blockTimer(blocked: boolean): void; timerRunning(): boolean }) {
  const el = (id: string) => document.getElementById(id)!;
  const generate = el('generate-scramble') as HTMLButtonElement;
  const cancel = el('cancel-scramble') as HTMLButtonElement;
  let state: string | undefined;
  let guide: ScrambleGuide | undefined;
  let loading = false;
  let request: AbortController | undefined;
  let notice = '';
  function render() {
    generate.disabled = loading || !!guide && !guide.complete || state !== SOLVED || options.timerRunning();
    cancel.hidden = !loading && (!guide || guide.complete);
    options.blockTimer(loading || !!guide && !guide.complete);
    const tokens = el('scramble-sequence');
    tokens.replaceChildren();
    for (const [index, move] of (guide?.moves ?? []).entries()) {
      const token = document.createElement('span');
      token.textContent = move;
      token.className = index < guide!.index ? 'scramble-done' : index === guide!.index ? 'scramble-current' : '';
      if (index === guide!.index) token.setAttribute('aria-current', 'step');
      tokens.append(token);
    }
    el('scramble-next').textContent = guide?.next ?? (guide?.complete ? 'Ready' : '—');
    el('scramble-progress').textContent = guide ? `${guide.index} / ${guide.moves.length} moves verified` : '';
    const next = guide?.next;
    el('scramble-instruction').textContent = next ? `${guide?.correcting ? 'Undo the incorrect turn: ' : ''}Turn the ${descriptions[next[0]]} face ${next.endsWith('2') ? '180° (two quarter turns)' : next.endsWith("'") ? '90° anticlockwise' : '90° clockwise'}, looking directly at that face.` : '';
    el('scramble-message').textContent = loading ? 'Generating a 3×3 scramble with TNoodle…' : notice || (guide?.complete ? 'Scramble complete. Start the timer when ready.' : guide ? guide.correcting ? 'Correct the extra turn before continuing.' : 'Follow the highlighted move. Keep white on top and green facing you.' : !state ? 'Connect your cube to begin.' : options.timerRunning() ? 'Stop the timer before generating a scramble.' : state !== SOLVED ? 'Solve your physical cube before generating a scramble.' : 'Ready to generate a TNoodle 3×3 scramble.');
  }
  function stop(message: string) {
    request?.abort(); request = undefined; loading = false; guide = undefined; notice = message; render();
  }
  generate.addEventListener('click', async () => {
    if (generate.disabled) return;
    const active = new AbortController(); request = active; loading = true; notice = ''; render();
    try {
      const response = await fetch('/api/scrambles/333', { cache: 'no-store', signal: AbortSignal.any([active.signal, AbortSignal.timeout(90000)]) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Scramble generation failed');
      if (request !== active) return;
      if (state !== SOLVED || options.timerRunning()) throw new Error('Cube moved while generating. Solve it and generate again.');
      guide = new ScrambleGuide(data.scramble);
    } catch (error) {
      if (request === active) notice = error instanceof Error ? error.message : String(error);
    } finally {
      if (request === active) { request = undefined; loading = false; render(); }
    }
  });
  cancel.addEventListener('click', () => stop('Scramble cancelled. Solve your cube before generating another.'));
  render();
  return {
    update(nextState: string | undefined) {
      state = nextState;
      if (!state && (guide || loading)) { stop('Connection lost. Solve your cube and generate again after reconnecting.'); return; }
      if (guide && state !== guide.state) { stop(guide.complete ? 'Cube moved after scrambling.' : 'Cube state is out of sync with the guide. Solve it and generate again.'); return; }
      render();
    },
    move(move: string) { guide?.move(move); },
    cancel: () => stop('Scramble cancelled by cube reset.'),
    startSolve() { if (guide?.complete) { guide = undefined; notice = ''; } render(); },
    refresh: render,
    dispose() { request?.abort(); },
  };
}
