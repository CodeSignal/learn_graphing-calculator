import { describe, expect, it } from 'vitest'
import * as math from 'mathjs'
import { classifyLine } from '../../../client/math/line-classifier.js'
import sharedParser from '../../../client/math/shared-parser.js'
import { resolveInequalityBoundary } from '../../../client/math/inequality-boundary.js'

const resolve = (expression, scope = {}) => {
  const classification = classifyLine(expression, sharedParser)
  expect(classification.graphMode).toBe('inequality')
  return resolveInequalityBoundary(classification.plotData, scope)
}

// Compare solved boundaries numerically so the test does not depend on simplify's formatting.
const evaluateFn = (fn, scope, x) => math.evaluate(fn, { PI: Math.PI, E: Math.E, ...scope, x })

describe('resolveInequalityBoundary', () => {
  it.each([
    ['y > 2x - 1', '2x - 1'],
    ['y <= x^2', 'x^2'],
    ['3 - x >= y', '3 - x'],
    ['y > m*x + b', 'm*x + b']
  ])('reuses the isolated side of %s verbatim', (expression, fn) => {
    expect(resolve(expression, { m: 1, b: 1 })).toEqual({ type: 'explicit', fn })
  })

  it('normalizes aliases on the isolated side for function-plot', () => {
    expect(resolve('y < ln(x) + pi')).toEqual({ type: 'explicit', fn: 'log(x) + PI' })
  })

  it.each([
    ['x + y <= 500', {}, (x) => 500 - x],
    ['2y - x > 4', {}, (x) => (x + 4) / 2],
    ['-y > x', {}, (x) => -x],
    ['y > x + y/2', {}, (x) => 2 * x],
    ['a*y >= x', { a: 4 }, (x) => x / 4]
  ])('solves %s for y', (expression, scope, expected) => {
    const boundary = resolve(expression, scope)

    expect(boundary.type).toBe('explicit')
    expect(boundary.fn).not.toMatch(/\by\b/)
    for (const x of [-3, 0, 2.5]) {
      expect(evaluateFn(boundary.fn, scope, x)).toBeCloseTo(expected(x))
    }
  })

  it.each([
    ['x < 3', {}, 3],
    ['2x + 1 >= 5', {}, 2],
    ['x > k + 1', { k: 4 }, 5],
    ['x + y > y + 2', {}, 2],
    ['3 < x', {}, 3]
  ])('resolves %s to a vertical line', (expression, scope, x) => {
    expect(resolve(expression, scope)).toEqual({ type: 'vertical', x })
  })

  it.each([
    'x^2 + y^2 < 9',
    'x*y > 1',
    'y^2 < 4',
    'x^2 <= 4',
    'sin(y) > x'
  ])('keeps genuinely implicit boundary %s implicit', (expression) => {
    expect(resolve(expression)).toBeNull()
  })

  it('returns null when parameters make the boundary degenerate', () => {
    expect(resolve('a*y > x', { a: 0 })).toBeNull()
    expect(resolve('c*x > 1', { c: 0 })).toBeNull()
    expect(resolve('x < k')).toBeNull()
  })

  it('re-evaluates parameter-dependent results per scope', () => {
    expect(resolve('x <= k', { k: 1 })).toEqual({ type: 'vertical', x: 1 })
    expect(resolve('x <= k', { k: -2.5 })).toEqual({ type: 'vertical', x: -2.5 })
    expect(resolve('b*y > x', { b: 2 })?.type).toBe('explicit')
    expect(resolve('b*y > x', { b: 0 })).toBeNull()
  })

  it('ignores non-inequality plot data', () => {
    expect(resolveInequalityBoundary(null)).toBeNull()
    expect(resolveInequalityBoundary({ type: 'points', points: [] })).toBeNull()
  })
})
