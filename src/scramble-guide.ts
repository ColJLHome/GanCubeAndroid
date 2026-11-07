import { applyMove, SOLVED } from './cube';
const amount = (move: string) => move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1;
const notation = (face: string, turns: number) => face + (turns === 2 ? '2' : turns === 3 ? "'" : '');
export class ScrambleGuide {
  readonly moves: string[];
  index = 0;
  state = SOLVED;
  private partial = 0;
  private corrections: string[] = [];
  constructor(scramble: string) {
    if (!/^[URFDLB][2']?( [URFDLB][2']?)*$/.test(scramble)) throw new Error('Invalid scramble notation');
    this.moves = scramble.split(' ');
  }
  get complete() { return this.index === this.moves.length; }
  get correcting() { return this.corrections.length > 0; }
  get next(): string | undefined {
    if (this.correcting) {
      const wrong = this.corrections.at(-1)!;
      return notation(wrong[0], (4 - amount(wrong)) % 4);
    }
    if (this.complete) return;
    const target = this.moves[this.index];
    return this.partial ? notation(target[0], (amount(target) - this.partial + 4) % 4) : target;
  }
  private addCorrection(move: string) {
    const last = this.corrections.at(-1);
    if (last?.[0] === move[0]) {
      this.corrections.pop();
      const combined = (amount(last) + amount(move)) % 4;
      if (combined) this.corrections.push(notation(move[0], combined));
    } else this.corrections.push(move);
  }
  move(move: string) {
    if (this.complete || !/^[URFDLB][2']?$/.test(move)) return;
    this.state = applyMove(this.state, move);
    if (this.correcting) { this.addCorrection(move); return; }
    const target = this.moves[this.index];
    const total = (this.partial + amount(move)) % 4;
    if (move[0] === target[0] && (amount(target) === 2 || total === amount(target))) {
      if (total === amount(target)) { this.index++; this.partial = 0; }
      else this.partial = total; // A half turn may arrive as two quarter turns, in either direction.
    } else this.addCorrection(move);
  }
}
