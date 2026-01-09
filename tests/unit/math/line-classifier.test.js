import { describe, it, expect, beforeEach } from 'vitest'
import ExpressionParser from '../../../client/math/expression-parser.js'
import { classifyLine, VERTICAL_LINE_MARKER } from '../../../client/math/line-classifier.js'

describe('LineClassifier', () => {
  let parser

  beforeEach(() => {
    parser = new ExpressionParser()
  })

  it('classifies empty expressions', () => {
    const result = classifyLine('', parser)
    expect(result.kind).toBe('empty')
    expect(result.error).toBe('Expression is empty')
  })

  it('classifies assignment expressions', () => {
    const result = classifyLine('a = 1', parser)
    expect(result.kind).toBe('assignment')
    expect(result.paramName).toBe('a')
    expect(result.value).toBe(1)
    expect(result.error).toBe(null)
  })

  it('rejects invalid assignments', () => {
    const result = classifyLine('a = x + 1', parser)
    expect(result.kind).toBe('invalid')
    expect(result.error).toBe('Invalid assignment (must be a number)')
  })

  it('classifies graph expressions with x', () => {
    const result = classifyLine('x^2 + a', parser)
    expect(result.kind).toBe('graph')
    expect(result.plotExpression).toBe('x^2 + a')
    expect(result.usedVariables).toContain('x')
    expect(result.usedVariables).toContain('a')
  })

  it('accepts y = ... graph expressions without x', () => {
    const result = classifyLine('y = 5', parser)
    expect(result.kind).toBe('graph')
    expect(result.plotExpression).toBe('5')
  })

  it('rejects expressions missing x', () => {
    const result = classifyLine('5', parser)
    expect(result.kind).toBe('invalid')
    expect(result.error).toBe('Expression must include x')
  })

  it('rejects y usage outside of y = ...', () => {
    const result = classifyLine('x + y', parser)
    expect(result.kind).toBe('invalid')
    // Error message changed to be more specific about y placement
    expect(result.error).toBe('y must be on the LHS')
  })

  it('returns syntax error for invalid expressions', () => {
    const result = classifyLine('x +', parser)
    expect(result.kind).toBe('invalid')
    expect(result.error).toBe('Syntax error')
  })

  describe('x = constant (vertical lines)', () => {
    it('classifies x = 1 as graph line', () => {
      const result = classifyLine('x = 1', parser)
      expect(result.kind).toBe('graph')
      expect(result.plotExpression).toBe(VERTICAL_LINE_MARKER)
      expect(result.verticalLineX).toBe(1)
      expect(result.error).toBe(null)
    })

    it('classifies x = -5.5 as graph line', () => {
      const result = classifyLine('x = -5.5', parser)
      expect(result.kind).toBe('graph')
      expect(result.plotExpression).toBe(VERTICAL_LINE_MARKER)
      expect(result.verticalLineX).toBeCloseTo(-5.5, 5)
    })

    it('classifies x = pi as graph line', () => {
      const result = classifyLine('x = pi', parser)
      expect(result.kind).toBe('graph')
      expect(result.plotExpression).toBe(VERTICAL_LINE_MARKER)
      expect(result.verticalLineX).toBeCloseTo(Math.PI, 5)
    })

    it('classifies x = 1 + 2 as graph line', () => {
      const result = classifyLine('x = 1 + 2', parser)
      expect(result.kind).toBe('graph')
      expect(result.plotExpression).toBe(VERTICAL_LINE_MARKER)
      expect(result.verticalLineX).toBe(3)
    })

    it('rejects x = y as invalid (non-numeric RHS)', () => {
      const result = classifyLine('x = y', parser)
      expect(result.kind).toBe('invalid')
      expect(result.error).toBe('Invalid assignment (must be a number)')
    })

    it('rejects x = x as invalid (non-numeric RHS)', () => {
      const result = classifyLine('x = x', parser)
      expect(result.kind).toBe('invalid')
      expect(result.error).toBe('Invalid assignment (must be a number)')
    })
  })
})
