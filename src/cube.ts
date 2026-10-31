// Kociemba face order; each face is read from outside, left to right, top to bottom.
export const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
type Vector = [number, number, number];
const faces = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
const normals: Vector[] = [[0,1,0],[1,0,0],[0,0,1],[0,-1,0],[-1,0,0],[0,0,-1]];
const geometry = faces.flatMap((face, f) => Array.from({ length: 9 }, (_, i) => {
  const c = i % 3 - 1, r = Math.floor(i / 3) - 1;
  const positions: Record<string, Vector> = {
    U: [c, 1, r], R: [1, -r, -c], F: [c, -r, 1],
    D: [c, -1, -r], L: [-1, -r, c], B: [-c, -r, -1],
  };
  return { position: positions[face], normal: normals[f] };
}));
const dot = (a: Vector, b: Vector) => a.reduce((s, x, i) => s + x * b[i], 0);
const equal = (a: Vector, b: Vector) => a.every((x, i) => x === b[i]);
// Clockwise quarter turn as viewed from outside the selected face (minus 90°).
function rotate(v: Vector, axis: Vector): Vector {
  const cross: Vector = [axis[1]*v[2]-axis[2]*v[1], axis[2]*v[0]-axis[0]*v[2], axis[0]*v[1]-axis[1]*v[0]];
  return v.map((_, i) => axis[i] * dot(axis, v) - cross[i]) as Vector;
}
export function applyMove(state: string, move: string): string {
  const match = /^([URFDLB])([2']?)$/.exec(move);
  if (!match || state.length !== 54) return state;
  const axis = normals[faces.indexOf(match[1] as typeof faces[number])];
  const turns = match[2] === "'" ? 3 : match[2] === '2' ? 2 : 1;
  const next = [...state];
  geometry.forEach(({ position, normal }, source) => {
    if (dot(position, axis) !== 1) return;
    let p = position, n = normal;
    for (let i = 0; i < turns; i++) { p = rotate(p, axis); n = rotate(n, axis); }
    const target = geometry.findIndex(g => equal(g.position, p) && equal(g.normal, n));
    next[target] = state[source];
  });
  return next.join('');
}
const colors: Record<string, string> = { U: '#f3f3ed', R: '#ee5755', F: '#51c990', D: '#f3d45c', L: '#f29b48', B: '#5296e0' };
/** Front is facing the viewer, with a small top/right perspective for depth. */
export function cubeSvg(state: string): string {
  const project = (face: string, u: number, v: number) => {
    if (face === 'U') return [70 + u*84 + v*28, 76 + v*-20];
    if (face === 'R') return [322 + u*28, 76 - u*20 + v*84];
    return [70 + u*84, 76 + v*84];
  };
  const polygons = (['U', 'R', 'F'] as const).map(face => {
    const offset = faces.indexOf(face)*9;
    return Array.from({ length: 9 }, (_, i) => {
      const c = i%3, r = Math.floor(i/3), gap = .035;
      // Up face row zero is at the back; front edge is row two.
      const corners = [[c+gap,r+gap],[c+1-gap,r+gap],[c+1-gap,r+1-gap],[c+gap,r+1-gap]];
      const points = corners.map(([x,y]) => project(face, x, face === 'U' ? 3-y : y).join(',')).join(' ');
      return `<polygon points="${points}" fill="${colors[state[offset+i]] ?? '#52616d'}" stroke="#101820" stroke-width="3" stroke-linejoin="round"/>`;
    }).join('');
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 390" role="img" aria-label="Cube state, white centre on top, green centre facing you, red centre on the right"><title>Cube viewed from the green front face</title>${polygons}</svg>`;
}
