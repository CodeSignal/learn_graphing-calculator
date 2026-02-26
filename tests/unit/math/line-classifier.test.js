import { describe, it, expect, beforeEach } from 'vitest'
import ExpressionParser from '../../../client/math/expression-parser.js'
import { classifyLine } from '../../../client/math/line-classifier.js'

describe('LineClassifier', () => {
  let parser

  beforeEach(() => {
    parser = new ExpressionParser()
  })

  it('classifies empty expressions', () => {
    const result = classifyLine('', parser)
    expect(result.kind).toBe('empty')
    expect(result.graphMode).toBe(null)
    expect(result.error).toBe('Expression is empty')
  })

  it('classifies assignment expressions', () => {
    const result = classifyLine('a = 1', parser)
    expect(result.kind).toBe('assignment')
    expect(result.graphMode).toBe(null)
    expect(result.paramName).toBe('a')
    expect(result.value).toBe(1)
    expect(result.error).toBe(null)
  })

  it('rejects invalid assignments', () => {
    const result = classifyLine('a = x + 1', parser)
    expect(result.kind).toBe('invalid')
    expect(result.graphMode).toBe(null)
    expect(result.error).toBe('Invalid assignment (must be a number)')
  })

  it('classifies graph expressions with x', () => {
    const result = classifyLine('x^2 + a', parser)
    expect(result.kind).toBe('graph')
    expect(result.graphMode).toBe('explicit')
    expect(result.plotExpression).toBe('x^2 + a')
    expect(result.usedVariables).toContain('x')
    expect(result.usedVariables).toContain('a')
  })

  it('accepts y = ... graph expressions without x', () => {
    const result = classifyLine('y = 5', parser)
    expect(result.kind).toBe('graph')
    expect(result.graphMode).toBe('explicit')
    expect(result.plotExpression).toBe('5')
  })

  it('rejects expressions missing x', () => {
    const result = classifyLine('5', parser)
    expect(result.kind).toBe('invalid')
    expect(result.graphMode).toBe(null)
    expect(result.error).toBe('Expression must include x')
  })

  it('classifies expressions with both x and y as implicit', () => {
    const result = classifyLine('x + y', parser)
    expect(result.kind).toBe('graph')
    expect(result.graphMode).toBe('implicit')
    expect(result.plotExpression).toBe('x + y')
    expect(result.usedVariables).toContain('x')
    expect(result.usedVariables).toContain('y')
  })

  it('returns syntax error for invalid expressions', () => {
    const result = classifyLine('x +', parser)
    expect(result.kind).toBe('invalid')
    expect(result.graphMode).toBe(null)
    expect(result.error).toBe('Syntax error')
  })

  describe('x = constant (vertical lines)', () => {
    it('classifies x = 1 as implicit graph line', () => {
      const result = classifyLine('x = 1', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('implicit')
      expect(result.plotExpression).toBe('x - (1)')
      expect(result.error).toBe(null)
    })

    it('classifies x = -5.5 as implicit graph line', () => {
      const result = classifyLine('x = -5.5', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('implicit')
      expect(result.plotExpression).toBe('x - (-5.5)')
    })

    it('classifies x = pi as implicit graph line', () => {
      const result = classifyLine('x = pi', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('implicit')
      expect(result.plotExpression).toBe('x - (pi)')
    })

    it('classifies x = 1 + 2 as implicit graph line', () => {
      const result = classifyLine('x = 1 + 2', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('implicit')
      expect(result.plotExpression).toBe('x - (1 + 2)')
    })

    it('classifies x = a (parameter) as implicit graph line', () => {
      const result = classifyLine('x = a', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('implicit')
      expect(result.plotExpression).toBe('x - (a)')
      expect(result.usedVariables).toContain('a')
      expect(result.error).toBe(null)
    })

    it('classifies x = 2 * a + 1 (parameter expression) as implicit graph line', () => {
      const result = classifyLine('x = 2 * a + 1', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('implicit')
      expect(result.plotExpression).toBe('x - (2 * a + 1)')
      expect(result.usedVariables).toContain('a')
      expect(result.error).toBe(null)
    })

    it('classifies x = y as implicit graph line', () => {
      const result = classifyLine('x = y', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('implicit')
      expect(result.plotExpression).toBe('x - (y)')
      expect(result.error).toBe(null)
    })

    it('rejects x = x as invalid (non-numeric RHS)', () => {
      const result = classifyLine('x = x', parser)
      expect(result.kind).toBe('invalid')
      expect(result.error).toBe('Invalid assignment (must be a number)')
    })
  })

  describe('implicit equations', () => {
    it('classifies x^2 + y^2 = 1 as implicit', () => {
      const result = classifyLine('x^2 + y^2 = 1', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('implicit')
      expect(result.plotExpression).toBe('(x^2 + y^2) - (1)')
    })

    it('classifies x * y = 4 as implicit', () => {
      const result = classifyLine('x * y = 4', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('implicit')
      expect(result.plotExpression).toBe('(x * y) - (4)')
    })

    it('classifies bare x^2 + y^2 - 1 as implicit', () => {
      const result = classifyLine('x^2 + y^2 - 1', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('implicit')
      expect(result.plotExpression).toBe('x^2 + y^2 - 1')
    })
  })

  describe('inequalities', () => {
    it('classifies y > x^2 as inequality (deferred)', () => {
      const result = classifyLine('y > x^2', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('inequality')
    })

    it('classifies x < 3 as inequality', () => {
      const result = classifyLine('x < 3', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('inequality')
    })

    it('classifies x^2 + y^2 <= 9 as inequality', () => {
      const result = classifyLine('x^2 + y^2 <= 9', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('inequality')
    })
  })
})
