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
/** Fixed front/top/right projection, including the hidden stickers during turns. */
export function cubeSvg(state: string, move?: string, progress = 0): string {
  const match = /^([URFDLB])([2']?)$/.exec(move ?? '');
  const axis = match ? normals[faces.indexOf(match[1] as typeof faces[number])] : undefined;
  const angle = match ? -Math.PI / 2 * (match[2] === "'" ? -1 : match[2] === '2' ? 2 : 1) * progress : 0;
  const turn = (v: Vector): Vector => {
    if (!axis) return v;
    const cross = [axis[1]*v[2]-axis[2]*v[1], axis[2]*v[0]-axis[0]*v[2], axis[0]*v[1]-axis[1]*v[0]];
    return v.map((x, i) => x*Math.cos(angle) + cross[i]*Math.sin(angle) + axis[i]*dot(axis,v)*(1-Math.cos(angle))) as Vector;
  };
  const horizontal: Vector[] = [[1,0,0],[0,0,-1],[1,0,0],[1,0,0],[0,0,1],[-1,0,0]];
  const vertical: Vector[] = [[0,0,1],[0,-1,0],[0,-1,0],[0,0,-1],[0,-1,0],[0,-1,0]];
  const view: Vector = [1/3, 20/84, 1];
  const polygons = geometry.map(({ position, normal }, index) => {
    const moving = axis && dot(position, axis) === 1;
    const centre = position.map((x,i) => x + normal[i]*.5) as Vector;
    const n = moving ? turn(normal) : normal;
    if (dot(n,view) <= .00001) return undefined;
    const f = Math.floor(index/9);
    const corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v]) => {
      const point = centre.map((x,i) => x + .465*(u*horizontal[f][i]+v*vertical[f][i])) as Vector;
      const [x,y,z] = moving ? turn(point) : point;
      return `${196+84*x+28*(1.5-z)},${202-84*y-20*(1.5-z)}`;
    });
    return { depth: dot(moving ? turn(centre) : centre, view), svg: `<polygon points="${corners.join(' ')}" fill="${colors[state[index]] ?? '#52616d'}" stroke="#101820" stroke-width="3" stroke-linejoin="round"/>` };
  }).filter(p => p !== undefined).sort((a,b) => a.depth-b.depth).map(p => p.svg).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 390" role="img" aria-label="Cube state, white centre on top, green centre facing you, red centre on the right"><title>Cube viewed from the green front face</title>${polygons}</svg>`;
}
