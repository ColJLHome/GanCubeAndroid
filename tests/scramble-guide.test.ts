import { expect, test } from 'vitest';
import { ScrambleGuide } from '../src/scramble-guide';
import { applyMove, SOLVED } from '../src/cube';
test('verifies the sequence and finishes at its exact target state', () => {
  const scramble = "R U2 F' L2 D B2";
  const guide = new ScrambleGuide(scramble);
  for (const move of scramble.split(' ')) guide.move(move);
  expect(guide.complete).toBe(true);
  expect(guide.index).toBe(6);
  expect(guide.state).toBe(scramble.split(' ').reduce(applyMove, SOLVED));
});
for (const quarter of ['R', "R'"]) {
  test(`a half turn accepts two ${quarter} turns`, () => {
    const guide = new ScrambleGuide('R2 U');
    guide.move(quarter);
    expect(guide.index).toBe(0);
    expect(guide.next).toBe(quarter);
    guide.move(quarter);
    expect(guide.index).toBe(1);
    expect(guide.next).toBe('U');
    expect(guide.state).toBe(applyMove(SOLVED, 'R2'));
  });
}
test('incorrect turns must be undone in reverse order before progress continues', () => {
  const guide = new ScrambleGuide('R U');
  guide.move('F'); guide.move('B');
  expect(guide.index).toBe(0);
  expect(guide.next).toBe("B'");
  guide.move("B'");
  expect(guide.next).toBe("F'");
  guide.move("F'");
  expect(guide.next).toBe('R');
  expect(guide.correcting).toBe(false);
  expect(guide.state).toBe(SOLVED);
  guide.move('R'); guide.move('U');
  expect(guide.complete).toBe(true);
});
test('wrong direction is corrected without advancing the scramble', () => {
  const guide = new ScrambleGuide('R U');
  guide.move("R'");
  expect(guide.next).toBe('R');
  guide.move('R');
  expect(guide.index).toBe(0);
  expect(guide.state).toBe(SOLVED);
  guide.move('R');
  expect(guide.index).toBe(1);
});
test('mistakes during a partial half turn preserve its progress', () => {
  const guide = new ScrambleGuide('R2 U');
  guide.move('R'); guide.move('F2');
  expect(guide.next).toBe('F2');
  guide.move("F'"); guide.move("F'");
  expect(guide.correcting).toBe(false);
  expect(guide.next).toBe('R');
  guide.move('R');
  expect(guide.index).toBe(1);
  expect(guide.state).toBe(applyMove(SOLVED, 'R2'));
});
test('opposite quarter turns undo a partial half turn', () => {
  const guide = new ScrambleGuide('R2 U');
  guide.move('R'); guide.move("R'");
  expect(guide.next).toBe('R2');
  expect(guide.state).toBe(SOLVED);
  expect(guide.index).toBe(0);
});
test('invalid scramble notation is rejected', () => {
  for (const scramble of ['', 'R x', '<script>', 'Rw U']) expect(() => new ScrambleGuide(scramble)).toThrow();
});
