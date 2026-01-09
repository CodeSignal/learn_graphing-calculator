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
})
