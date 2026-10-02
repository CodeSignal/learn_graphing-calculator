/**
 * Marching squares: trace the zero set of a sampled function as joined polylines.
 *
 * Inequality boundaries that cannot be solved for y (circles, `x*y > 1`, `y^2 < 4`) used to be
 * drawn by function-plot's interval renderer, one sub-path per pixel cell, which cannot carry a
 * dash pattern. Tracing F = 0 on the shading grid instead yields a few continuous paths (one per
 * curve component) that SVG can dash.
 *
 * The grid is the lattice of sample points (xs[i], ys[j]); `values[j * cols + i]` is F there.
 * Crossing points are linearly interpolated along cell edges. A corner counts as "inside" when
 * F > 0; cells with a non-finite corner are skipped, so curves stop at domain gaps. Ambiguous
 * saddle cells are resolved with the mean of the four corners. Segments are chained through
 * shared edge points: every edge point belongs to at most two segments (one per adjacent cell),
 * so chains are simple open curves or closed loops. Closed loops repeat their first point at
 * the end.
 *
 * A sign change between two samples is either a root or a pole (`x/y` across y = 0, `tan`).
 * With `options.evaluate`, every crossing is checked once (see classifyCrossing): towards a
 * root |F| shrinks, towards a pole it grows. Pole crossings, and the segments using them, are
 * dropped, so poles are not drawn as boundaries. This costs one extra evaluation per crossing
 * edge (five near poles and tangent points), not per cell.
 */

// Cell edges, as offsets used by edgeId(): 0 bottom (j), 1 right (i+1), 2 top (j+1), 3 left (i).
const BOTTOM = 0;
const RIGHT = 1;
const TOP = 2;
const LEFT = 3;

// Segment table: case index (b00 | b10 << 1 | b11 << 2 | b01 << 3) -> pairs of edges.
// Cases 5 and 10 are saddles; the second entry is used when the cell centre is inside.
const SEGMENTS = [
  [],
  [[LEFT, BOTTOM]],
  [[BOTTOM, RIGHT]],
  [[LEFT, RIGHT]],
  [[RIGHT, TOP]],
  null,
  [[BOTTOM, TOP]],
  [[LEFT, TOP]],
  [[TOP, LEFT]],
  [[BOTTOM, TOP]],
  null,
  [[RIGHT, TOP]],
  [[LEFT, RIGHT]],
  [[BOTTOM, RIGHT]],
  [[LEFT, BOTTOM]],
  []
];
const SADDLE_SEGMENTS = {
  // b00 and b11 inside
  5: {
    centreOutside: [[LEFT, BOTTOM], [RIGHT, TOP]],
    centreInside: [[LEFT, TOP], [BOTTOM, RIGHT]]
  },
  // b10 and b01 inside
  10: {
    centreOutside: [[BOTTOM, RIGHT], [TOP, LEFT]],
    centreInside: [[LEFT, BOTTOM], [RIGHT, TOP]]
  }
};

/**
 * @param {ArrayLike<number>} values - F at the grid points, row-major (`values[j * cols + i]`).
 * @param {number} cols - Number of sample columns (xs.length).
 * @param {number} rows - Number of sample rows (ys.length).
 * @param {ArrayLike<number>} xs - x coordinate of each column.
 * @param {ArrayLike<number>} ys - y coordinate of each row.
 * @param {{ evaluate?: (x: number, y: number) => number }} [options] - `evaluate` (F at any
 *   point) enables the root/pole check described above.
 * @returns {Array<Array<[number, number]>>} Polylines in the coordinates of xs/ys.
 */
export const traceContours = (values, cols, rows, xs, ys, options = {}) => {
  if (!values || cols < 2 || rows < 2 || values.length < cols * rows) {
    return [];
  }
  const evaluate = typeof options.evaluate === 'function' ? options.evaluate : null;

  // Edge ids: horizontal edge (i, j)-(i+1, j) -> 2 * (j * cols + i);
  // vertical edge (i, j)-(i, j+1) -> 2 * (j * cols + i) + 1.
  const edgeId = (i, j, edge) => {
    switch (edge) {
      case BOTTOM: return 2 * (j * cols + i);
      case TOP: return 2 * ((j + 1) * cols + i);
      case LEFT: return 2 * (j * cols + i) + 1;
      default: return 2 * (j * cols + i + 1) + 1; // RIGHT
    }
  };

  const points = new Map();
  const pointOf = (id) => {
    let point = points.get(id);
    if (point) return point;

    const cell = id >> 1;
    const i = cell % cols;
    const j = (cell - i) / cols;
    const a = values[cell];
    if (id & 1) {
      const b = values[cell + cols];
      const t = a / (a - b);
      point = [xs[i], ys[j] + t * (ys[j + 1] - ys[j])];
    } else {
      const b = values[cell + 1];
      const t = a / (a - b);
      point = [xs[i] + t * (xs[i + 1] - xs[i]), ys[j]];
    }
    points.set(id, point);
    return point;
  };

  const evaluateSafely = (x, y) => {
    try {
      const value = evaluate(x, y);
      return typeof value === 'number' ? value : NaN;
    } catch (error) {
      return NaN;
    }
  };

  // Crossing check (see header), cached per edge. Fast path: F at the interpolated point is no
  // larger than the sample on its side of the sign change (always true for F monotone along
  // the edge, never true for a pole). Otherwise F may just have an extremum inside the edge
  // (near a tangent point), so bisect: around a root |F| at the bracket ends shrinks, around a
  // pole it grows with every step.
  const BISECTION_STEPS = 4;
  const crossingStatus = new Map();
  const classifyCrossing = (id) => {
    const cell = id >> 1;
    const i = cell % cols;
    const j = (cell - i) / cols;
    const vertical = (id & 1) === 1;
    const a = values[cell];
    const b = values[vertical ? cell + cols : cell + 1];
    const point = pointOf(id);

    const value = evaluateSafely(point[0], point[1]);
    if (!Number.isFinite(value)) return false;
    const replaced = (value > 0) === (a > 0) ? a : b;
    if (Math.abs(value) <= Math.abs(replaced)) return true;

    const x0 = xs[i];
    const y0 = ys[j];
    const dx = vertical ? 0 : xs[i + 1] - x0;
    const dy = vertical ? ys[j + 1] - y0 : 0;
    let lo = 0;
    let hi = 1;
    let fLo = a;
    let fHi = b;
    for (let step = 0; step < BISECTION_STEPS; step += 1) {
      const mid = (lo + hi) / 2;
      const fMid = evaluateSafely(x0 + (mid * dx), y0 + (mid * dy));
      if (!Number.isFinite(fMid)) return false;
      if ((fMid > 0) === (fLo > 0)) {
        lo = mid;
        fLo = fMid;
      } else {
        hi = mid;
        fHi = fMid;
      }
    }
    return Math.abs(fLo) + Math.abs(fHi) < Math.abs(a) + Math.abs(b);
  };
  const isRoot = (id) => {
    if (!evaluate) return true;
    let status = crossingStatus.get(id);
    if (status === undefined) {
      status = classifyCrossing(id);
      crossingStatus.set(id, status);
    }
    return status;
  };

  // Adjacency: edge id -> up to two neighbouring edge ids.
  const links = new Map();
  const link = (from, to) => {
    const list = links.get(from);
    if (list) list.push(to);
    else links.set(from, [to]);
  };

  for (let j = 0; j < rows - 1; j += 1) {
    const rowOffset = j * cols;
    for (let i = 0; i < cols - 1; i += 1) {
      const v00 = values[rowOffset + i];
      const v10 = values[rowOffset + i + 1];
      const v01 = values[rowOffset + cols + i];
      const v11 = values[rowOffset + cols + i + 1];
      if (!Number.isFinite(v00) || !Number.isFinite(v10) ||
        !Number.isFinite(v01) || !Number.isFinite(v11)) {
        continue;
      }

      const index = (v00 > 0 ? 1 : 0) | (v10 > 0 ? 2 : 0) | (v11 > 0 ? 4 : 0) | (v01 > 0 ? 8 : 0);
      if (index === 0 || index === 15) continue;

      let segments = SEGMENTS[index];
      if (segments === null) {
        const centreInside = (v00 + v10 + v01 + v11) / 4 > 0;
        segments = SADDLE_SEGMENTS[index][centreInside ? 'centreInside' : 'centreOutside'];
      }

      for (let s = 0; s < segments.length; s += 1) {
        const from = edgeId(i, j, segments[s][0]);
        const to = edgeId(i, j, segments[s][1]);
        if (!isRoot(from) || !isRoot(to)) continue;
        link(from, to);
        link(to, from);
      }
    }
  }

  const visited = new Set();
  const walk = (start) => {
    const chain = [start];
    visited.add(start);
    let previous = -1;
    let current = start;
    for (;;) {
      const next = (links.get(current) || []).find((id) => id !== previous && !visited.has(id));
      if (next === undefined) {
        // close loops: the last point links back to the start
        if (chain.length > 2 && (links.get(current) || []).includes(start)) {
          chain.push(start);
        }
        return chain;
      }
      visited.add(next);
      chain.push(next);
      previous = current;
      current = next;
    }
  };

  const chains = [];
  // Open curves start at an end point (an edge point with a single neighbour) ...
  links.forEach((neighbours, id) => {
    if (neighbours.length === 1 && !visited.has(id)) {
      chains.push(walk(id));
    }
  });
  // ... whatever is left forms closed loops.
  links.forEach((neighbours, id) => {
    if (!visited.has(id)) {
      chains.push(walk(id));
    }
  });

  return chains
    .filter((chain) => chain.length >= 2)
    .map((chain) => chain.map(pointOf));
};

export default traceContours;
