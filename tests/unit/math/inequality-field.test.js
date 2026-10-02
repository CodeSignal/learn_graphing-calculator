import { describe, expect, it } from 'vitest'
import * as math from 'mathjs'
import { compileInequalityField } from '../../../client/math/inequality-field.js'

// Reference: evaluate the whole boundary expression with math.js, as shading did per cell.
const reference = (expression, scope) => {
  const compiled = math.parse(expression).compile()
  return (x, y) => {
    try {
      const value = compiled.evaluate({ ...scope, x, y })
      return typeof value === 'number' ? value : NaN
    } catch (error) {
      return NaN
    }
  }
}

const XS = [-3.7, -2, -0.5, 0, 0.25, 1, 2.5, 4]
const YS = [-4.2, -1, -0.3, 0, 0.6, 2, 3.3]

describe('compileInequalityField', () => {
  it.each([
    ['(y) - (2x - 1)', {}],
    ['(x + y) - (5)', {}],
    ['(x) - (-3)', {}],
    ['(y) - (-4)', {}],
    ['(x^2 + y^2) - (4)', {}],
    ['(x*y) - (1)', {}],
    ['(x^2/16 + y^2/4) - (1)', {}],
    ['(-x - y) - (-2*x*y)', {}],
    ['(x/y) - (1)', {}],
    ['(2 * x * y / 3) - (x)', {}],
    ['(sin(x*y)) - (0.3)', {}],
    ['((x^2 + y^2)^2) - (50*x*y)', {}],
    ['(sqrt(x) + y) - (1)', {}],
    ['(log(x) + log(y)) - (1)', {}],
    ['(abs(x) + abs(y)) - (3)', {}],
    ['(x^2 + y^2) - (r^2)', { r: 2 }],
    ['(a*x*y) - (4)', { a: -1.5 }],
    ['(y) - (m*x + k)', { m: 0.5, k: -2 }],
    // math.js turns these into Complex (or back into numbers) where plain Math gives NaN
    ['(abs(sqrt(x*y))) - (1)', {}],
    ['(sqrt(x*y)^0) - (0.5)', {}],
    ['(x^0.5 * y) - (1)', {}],
    ['(asin(x*y/4) + acos(y/3)) - (1)', {}],
    ['(e^(x*y/10) - pi*cos(x - y)) - (2)', {}],
    ['(cbrt(x*y) + tanh(y)) - (0)', {}],
    ['(1/(x*y)) - (2)', {}]
  ])('matches whole-expression evaluation for %s', (expression, scope) => {
    const field = compileInequalityField(expression, scope)
    const expected = reference(expression, scope)

    const values = field.evaluateGrid(XS, YS)
    expect(values).toHaveLength(XS.length * YS.length)
    YS.forEach((y, j) => {
      XS.forEach((x, i) => {
        const value = values[(j * XS.length) + i]
        const want = expected(x, y)
        if (Number.isFinite(want)) {
          expect(value).toBeCloseTo(want, 9)
        } else {
          // undefined (NaN / complex) or infinite: never finite in the grid either
          expect(Number.isFinite(value)).toBe(false)
        }
        expect(Object.is(field.evaluateAt(x, y), value)).toBe(true)
      })
    })
  })

  describe('evaluation count', () => {
    const xs = Array.from({ length: 30 }, (_, i) => i / 10)
    const ys = Array.from({ length: 20 }, (_, j) => j / 10)

    // math.js reads a symbol from a Map scope with one get() per evaluation of that symbol
    const countReads = (run) => {
      const reads = { x: 0, y: 0 }
      const originalGet = Map.prototype.get
      Map.prototype.get = function get (key) {
        if (key === 'x' || key === 'y') reads[key] += 1
        return originalGet.call(this, key)
      }
      try {
        run()
      } finally {
        Map.prototype.get = originalGet
      }
      return reads
    }

    // cbrt is not on the numeric fast path, so these terms always go through math.js
    it.each([
      ['(cbrt(x)^2 + cbrt(y)^2) - (4)', { x: 30, y: 20 }],
      ['(cbrt(x) * cbrt(y) / 2) - (1)', { x: 30, y: 20 }],
      ['(y) - (2 * cbrt(x) - 1)', { x: 30, y: 0 }],
      ['(sin(cbrt(x) * y)) - (0.3)', { x: 600, y: 600 }]
    ])('%s reads x and y %o times through math.js for a 30 x 20 grid', (expression, expected) => {
      const field = compileInequalityField(expression, {})
      let values
      const reads = countReads(() => { values = field.evaluateGrid(xs, ys) })

      expect(reads).toEqual(expected)
      expect(values[(5 * xs.length) + 7]).toBeCloseTo(reference(expression, {})(xs[7], ys[5]), 12)
    })

    it('skips math.js for plain arithmetic and falls back only where it yields NaN', () => {
      const signedXs = xs.map((x) => x - 1.45)
      const fast = compileInequalityField('(sin(x * y) + x^2 / 3) - (0.3)', {})
      expect(countReads(() => fast.evaluateGrid(signedXs, ys))).toEqual({ x: 0, y: 0 })

      // sqrt(x*y) is NaN in Math (Complex in math.js) wherever x*y < 0
      const partial = compileInequalityField('(sqrt(x * y)) - (1)', {})
      let values
      const reads = countReads(() => { values = partial.evaluateGrid(signedXs, ys) })
      const negativeCells = ys.reduce((count, y) => (
        count + signedXs.filter((x) => x * y < 0).length
      ), 0)
      expect(negativeCells).toBeGreaterThan(0)
      expect(reads).toEqual({ x: negativeCells, y: negativeCells })
      expect(Array.from(values).filter(Number.isNaN)).toHaveLength(negativeCells)
    })
  })

  it('keys the field by expression and the parameter values it uses', () => {
    const a = compileInequalityField('(x^2 + y^2) - (r^2)', { r: 2, unrelated: 1 })
    const b = compileInequalityField('(x^2 + y^2) - (r^2)', { r: 2, unrelated: 5 })
    const c = compileInequalityField('(x^2 + y^2) - (r^2)', { r: 3 })

    expect(a.key).toBe(b.key)
    expect(a.key).not.toBe(c.key)
    expect(compileInequalityField('(y) - (pi)', {}).evaluateAt(0, 0)).toBeCloseTo(-Math.PI, 12)
  })

  it('returns NaN everywhere for undefined symbols instead of throwing', () => {
    const field = compileInequalityField('(y) - (q*x)', {})
    expect(Array.from(field.evaluateGrid([0, 1], [0])).every(Number.isNaN)).toBe(true)
  })

  it('returns null for unparseable or empty expressions', () => {
    expect(compileInequalityField('(x +', {})).toBeNull()
    expect(compileInequalityField('', {})).toBeNull()
    expect(compileInequalityField(null, {})).toBeNull()
  })
})
