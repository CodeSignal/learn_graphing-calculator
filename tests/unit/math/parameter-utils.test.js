import { describe, it, expect, beforeEach } from 'vitest'
import ExpressionParser from '../../../client/math/expression-parser.js'
import { analyzeParameters } from '../../../client/math/parameter-utils.js'

describe('analyzeParameters', () => {
  let parser

  beforeEach(() => {
    parser = new ExpressionParser()
  })

  it('detects defined and used parameters', () => {
    const functions = [
      { expression: 'a = 1' },
      { expression: 'a * x + b' },
      { expression: 'x^2' }
    ]

    const result = analyzeParameters(functions, parser)

    expect(result.definedParams.has('a')).toBe(true)
    expect(result.usedParams.has('a')).toBe(true)
    expect(result.usedParams.has('b')).toBe(true)
    expect(result.missingAssignments).toEqual(['b'])
  })

  it('treats y = ... lines as graph expressions', () => {
    const functions = [
      { expression: 'y = b' },
      { expression: 'x^2' }
    ]

    const result = analyzeParameters(functions, parser)

    expect(result.usedParams.has('b')).toBe(true)
    expect(result.missingAssignments).toEqual(['b'])
  })

  it('ignores invalid assignments as definitions', () => {
    const functions = [
      { expression: 'a = x + 1' },
      { expression: 'a * x' }
    ]

    const result = analyzeParameters(functions, parser)

    expect(result.definedParams.has('a')).toBe(false)
    expect(result.usedParams.has('a')).toBe(true)
    expect(result.missingAssignments).toEqual(['a'])
  })

  it('infers parameters used in points and vector coordinates', () => {
    const functions = [
      { expression: 'points([[a, 1], [b + 2, 3]])' },
      { expression: 'vector([u, v], [0, c])' }
    ]

    const result = analyzeParameters(functions, parser)

    expect(result.usedParams.has('a')).toBe(true)
    expect(result.usedParams.has('b')).toBe(true)
    expect(result.usedParams.has('u')).toBe(true)
    expect(result.usedParams.has('v')).toBe(true)
    expect(result.usedParams.has('c')).toBe(true)
  })

  it('does not infer points/vector function names as parameters', () => {
    const functions = [
      { expression: 'points([[1, 2]])' },
      { expression: 'vector([3, 4])' }
    ]

    const result = analyzeParameters(functions, parser)

    expect(result.usedParams.has('points')).toBe(false)
    expect(result.usedParams.has('vector')).toBe(false)
    expect(result.missingAssignments).toEqual([])
  })
})
