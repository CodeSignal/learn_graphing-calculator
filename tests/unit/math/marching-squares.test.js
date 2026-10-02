import { describe, expect, it } from 'vitest'
import { traceContours } from '../../../client/math/marching-squares.js'

const linspace = (lo, hi, n) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1))

const sample = (fn, xs, ys) => {
  const values = new Float64Array(xs.length * ys.length)
  ys.forEach((y, j) => {
    xs.forEach((x, i) => {
      values[(j * xs.length) + i] = fn(x, y)
    })
  })
  return values
}

const trace = (fn, xs, ys, options) => traceContours(
  sample(fn, xs, ys),
  xs.length,
  ys.length,
  xs,
  ys,
  options
)

const isClosed = (path) => {
  const [first, last] = [path[0], path[path.length - 1]]
  return first[0] === last[0] && first[1] === last[1]
}

describe('traceContours', () => {
  const xs = linspace(-5, 5, 101)
  const ys = linspace(-5, 5, 101)

  it('traces a circle into one closed path on the curve', () => {
    const paths = trace((x, y) => (x * x) + (y * y) - 9, xs, ys)

    expect(paths).toHaveLength(1)
    const [circle] = paths
    expect(isClosed(circle)).toBe(true)
    expect(circle.length).toBeGreaterThan(100)
    circle.forEach(([x, y]) => {
      expect(Math.abs(Math.hypot(x, y) - 3)).toBeLessThan(0.01)
    })
    // consecutive points are neighbours on the curve (no jumps across the grid)
    for (let i = 1; i < circle.length; i += 1) {
      const step = Math.hypot(circle[i][0] - circle[i - 1][0], circle[i][1] - circle[i - 1][1])
      expect(step).toBeLessThan(0.15)
    }
  })

  it('traces separate closed paths for separate components', () => {
    const paths = trace(
      (x, y) => Math.min(Math.hypot(x + 2.5, y) - 1, Math.hypot(x - 2.5, y) - 1),
      xs,
      ys
    )

    expect(paths).toHaveLength(2)
    paths.forEach((path) => expect(isClosed(path)).toBe(true))
    const centres = paths.map((path) => path.reduce((sum, [x]) => sum + x, 0) / path.length)
    expect(centres.map(Math.sign).sort()).toEqual([-1, 1])
  })

  it('traces curves that leave the grid as open paths ending on the border', () => {
    const paths = trace((x, y) => (x * y) - 1, xs, ys)

    expect(paths).toHaveLength(2)
    paths.forEach((path) => {
      expect(isClosed(path)).toBe(false)
      ;[path[0], path[path.length - 1]].forEach(([x, y]) => {
        expect(Math.max(Math.abs(x), Math.abs(y))).toBeCloseTo(5, 6)
      })
      path.forEach(([x, y]) => expect(Math.abs((x * y) - 1)).toBeLessThan(0.05))
    })
  })

  it('stops at domain gaps (non-finite samples)', () => {
    // sqrt(x) + y - 1 is undefined for x < 0
    const paths = trace((x, y) => (x >= 0 ? Math.sqrt(x) + y - 1 : NaN), xs, ys)

    expect(paths).toHaveLength(1)
    paths[0].forEach(([x]) => expect(x).toBeGreaterThanOrEqual(0))
  })

  it('returns no paths when the function does not change sign', () => {
    expect(trace((x, y) => (x * x) + (y * y) + 1, xs, ys)).toEqual([])
    expect(traceContours(new Float64Array(0), 0, 0, [], [])).toEqual([])
  })

  it('resolves saddle cells with the cell centre', () => {
    // (x*y) on a single cell with corners -1, 1, -1, 1 (b10 and b01 inside)
    const values = [-1, 1, 1, -1]
    const unitXs = [-1, 1]
    const unitYs = [-1, 1]

    // centre value 0 counts as outside: the two inside corners are cut off separately
    const paths = traceContours(values, 2, 2, unitXs, unitYs)
    expect(paths).toHaveLength(2)

    const centreInside = traceContours([-1, 1, 1, -0.5], 2, 2, unitXs, unitYs)
    expect(centreInside).toHaveLength(2)
    const touchesCorner = (path, [cx, cy]) => path.every(([x, y]) => (
      Math.abs(x - cx) + Math.abs(y - cy) <= 2
    ))
    // with the centre inside, the outside corners (-1,-1) and (1,1) are the ones cut off
    expect(centreInside.some((path) => touchesCorner(path, [-1, -1]))).toBe(true)
    expect(centreInside.some((path) => touchesCorner(path, [1, 1]))).toBe(true)
  })

  it('drops sign changes through a pole when an evaluator is given', () => {
    const fn = (x, y) => (x / y) - 1
    // grid rows straddle y = 0 so x/y jumps from -inf to +inf between samples
    const gridYs = linspace(-5.05, 4.95, 101)

    const unchecked = trace(fn, xs, gridYs)
    const checked = trace(fn, xs, gridYs, { evaluate: fn })

    // points on y = 0 away from the origin can only come from the pole
    const onPole = (paths) => paths.flat().some(([x, y]) => (
      Math.abs(y) < 0.02 && Math.abs(x) > 1
    ))
    expect(onPole(unchecked)).toBe(true)
    expect(onPole(checked)).toBe(false)
    checked.forEach((path) => {
      path.forEach(([x, y]) => expect(Math.abs(x - y)).toBeLessThan(0.2))
    })
  })

  it.each([
    ['on grid vertices', 0],
    ['between grid vertices', 0.037]
  ])('keeps every genuine root, including tangent points %s, with an evaluator', (_, shift) => {
    const fn = (x, y) => (x * x) + (y * y) - 9
    const shiftedXs = xs.map((x) => x + shift)
    const shiftedYs = ys.map((y) => y - shift)

    const checked = trace(fn, shiftedXs, shiftedYs, { evaluate: fn })
    expect(checked).toHaveLength(1)
    expect(isClosed(checked[0])).toBe(true)
    expect(checked[0].length).toBe(trace(fn, shiftedXs, shiftedYs)[0].length)
  })

  it('drops poles of 1/F-style boundaries but keeps their roots', () => {
    // 1/(x^2 + y^2 - 4) - 0.5: root on r = sqrt(6), pole on r = 2
    const fn = (x, y) => (1 / ((x * x) + (y * y) - 4)) - 0.5
    const offsetXs = xs.map((x) => x + 0.013)

    const paths = trace(fn, offsetXs, ys, { evaluate: fn })
    expect(paths).toHaveLength(1)
    expect(isClosed(paths[0])).toBe(true)
    paths[0].forEach(([x, y]) => {
      expect(Math.abs(Math.hypot(x, y) - Math.sqrt(6))).toBeLessThan(0.02)
    })
  })
})
