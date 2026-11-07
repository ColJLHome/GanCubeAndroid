import { expect, test } from 'vitest';
import { SOLVED, applyMove, cubeSvg } from '../src/cube';
for (const face of 'URFDLB') {
  test(`${face} turn has a valid inverse and order four`, () => {
    // Unique stickers expose permutation errors hidden by solved face colours.
    const state = Array.from({ length: 54 }, (_, i) => String.fromCharCode(33+i)).join('');
    let rotated = state;
    for (let i = 0; i < 4; i++) rotated = applyMove(rotated, face);
    expect(rotated).toBe(state);
    expect(applyMove(applyMove(state, face), `${face}'`)).toBe(state);
    expect(applyMove(state, `${face}2`)).toBe(applyMove(applyMove(state, face), face));
    expect([...applyMove(state, face)].sort()).toEqual([...state].sort());
  });
}
test('clockwise front turn moves top stickers onto the right face left column', () => {
  const result = applyMove(SOLVED, 'F');
  expect([result[9],result[12],result[15]]).toEqual(['U','U','U']);
  expect(result.slice(6,9)).toBe('LLL');
  expect([result[38],result[41],result[44]]).toEqual(['D','D','D']);
  expect(result.slice(27,30)).toBe('RRR');
});
test('reference drawing shows nine stickers on each visible face', () => {
  expect(cubeSvg(SOLVED).match(/<polygon/g)).toHaveLength(27);
  for (const color of ['#f3f3ed','#ee5755','#51c990']) {
    expect(cubeSvg(SOLVED).split(`fill="${color}"`)).toHaveLength(10);
  }
});
for (const face of 'URFDLB') {
  for (const suffix of ['', "'", '2']) {
    test(`animated ${face}${suffix} ends at the correct sticker geometry`, () => {
      const move = face + suffix;
      // Compare polygons independent of their painter ordering and corner order.
      const polygons = (svg: string) => [...svg.matchAll(/<polygon points="([^"]+)" fill="([^"]+)"/g)].map(([, points, color]) =>
        color + ':' + points.split(' ').map(p => p.split(',').map(n => Math.round(Number(n)*1000)/1000).join(',')).sort().join(' ')
      ).sort();
      const state = applyMove(applyMove(SOLVED, 'R'), 'U');
      expect(polygons(cubeSvg(state, move, 1))).toEqual(polygons(cubeSvg(applyMove(state, move))));
      expect(cubeSvg(state, move, .5)).not.toBe(cubeSvg(state));
    });
  }
}
