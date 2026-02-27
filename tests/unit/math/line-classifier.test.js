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

  describe('function definition syntax (f(x) = expr)', () => {
    it('classifies f(x) = x^2 as explicit graph', () => {
      const result = classifyLine('f(x) = x^2', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('explicit')
      expect(result.error).toBe(null)
      expect(result.plotExpression).toBeTruthy()
    })

    it('classifies g(x) = sin(x) as explicit graph', () => {
      const result = classifyLine('g(x) = sin(x)', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('explicit')
      expect(result.error).toBe(null)
    })

    it('classifies h(x) = a * x + b as explicit graph with params in usedVariables', () => {
      const result = classifyLine('h(x) = a * x + b', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('explicit')
      expect(result.error).toBe(null)
      expect(result.usedVariables).toContain('a')
      expect(result.usedVariables).toContain('b')
      expect(result.usedVariables).toContain('x')
    })

    it('classifies f(x) = 5 as explicit graph (constant body)', () => {
      const result = classifyLine('f(x) = 5', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('explicit')
      expect(result.error).toBe(null)
    })

    it('rejects f(x) = y as invalid (y in RHS)', () => {
      const result = classifyLine('f(x) = y', parser)
      expect(result.kind).toBe('invalid')
      expect(result.error).toBe('Unknown symbol: y')
    })

    it('rejects f(t) = t^2 as invalid (non-x parameter)', () => {
      const result = classifyLine('f(t) = t^2', parser)
      expect(result.kind).toBe('invalid')
      expect(result.error).toBe('Expression must include x')
    })

    it('rejects f(x, y) = x + y as invalid (multi-param)', () => {
      const result = classifyLine('f(x, y) = x + y', parser)
      expect(result.kind).toBe('invalid')
      expect(result.error).toBe('Expression must include x')
    })
  })

  describe('points syntax', () => {
    it('classifies points([[x,y], ...]) as points graph mode', () => {
      const result = classifyLine('points([[1, 2], [a + 1, b]])', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('points')
      expect(result.error).toBe(null)
      expect(result.plotExpression).toBe(null)
      expect(result.plotData).toEqual({
        type: 'points',
        points: [['1', '2'], ['a + 1', 'b']]
      })
      expect(result.usedVariables).toContain('a')
      expect(result.usedVariables).toContain('b')
    })

    it('rejects malformed points syntax', () => {
      const result = classifyLine('points([1, 2])', parser)
      expect(result.kind).toBe('invalid')
      expect(result.graphMode).toBe(null)
      expect(result.error).toBeTruthy()
    })

    it('rejects points coordinates that include x or y', () => {
      const result = classifyLine('points([[x, 1], [2, 3]])', parser)
      expect(result.kind).toBe('invalid')
      expect(result.error).toBe('Coordinates cannot include x or y')
    })
  })

  describe('vector syntax', () => {
    it('classifies vector([vx,vy],[ox,oy]) as vector graph mode', () => {
      const result = classifyLine('vector([u, v], [1, b])', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('vector')
      expect(result.error).toBe(null)
      expect(result.plotExpression).toBe(null)
      expect(result.plotData).toEqual({
        type: 'vector',
        vector: ['u', 'v'],
        offset: ['1', 'b']
      })
      expect(result.usedVariables).toContain('u')
      expect(result.usedVariables).toContain('v')
      expect(result.usedVariables).toContain('b')
    })

    it('defaults missing vector offset to origin', () => {
      const result = classifyLine('vector([3, 4])', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('vector')
      expect(result.plotData).toEqual({
        type: 'vector',
        vector: ['3', '4'],
        offset: ['0', '0']
      })
    })

    it('rejects vector coordinates that include x or y', () => {
      const result = classifyLine('vector([y, 2])', parser)
      expect(result.kind).toBe('invalid')
      expect(result.error).toBe('Coordinates cannot include x or y')
    })
  })

  describe('inequalities', () => {
    it('classifies y > x^2 with rich inequality metadata', () => {
      const result = classifyLine('y > x^2', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('inequality')
      expect(result.plotExpression).toBe('(y) - (x^2)')
      expect(result.usedVariables).toEqual(['x', 'y'])
      expect(result.plotData).toEqual({
        type: 'inequality',
        operator: '>',
        lhs: 'y',
        rhs: 'x^2',
        boundaryExpression: '(y) - (x^2)',
        strict: true,
        satisfiesPositive: true
      })
    })

    it('classifies x < 3 as strict negative-side inequality', () => {
      const result = classifyLine('x < 3', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('inequality')
      expect(result.plotData?.strict).toBe(true)
      expect(result.plotData?.satisfiesPositive).toBe(false)
      expect(result.plotExpression).toBe('(x) - (3)')
    })

    it('classifies x^2 + y^2 <= 9 as inclusive inequality', () => {
      const result = classifyLine('x^2 + y^2 <= 9', parser)
      expect(result.kind).toBe('graph')
      expect(result.graphMode).toBe('inequality')
      expect(result.plotData?.strict).toBe(false)
      expect(result.plotData?.satisfiesPositive).toBe(false)
      expect(result.usedVariables).toEqual(['x', 'y'])
    })

    it('rejects chained inequalities', () => {
      const result = classifyLine('-1 < x < 1', parser)
      expect(result.kind).toBe('invalid')
      expect(result.graphMode).toBe(null)
      expect(result.error).toBe('Chained inequalities are not supported')
    })

    it('rejects non-graph inequalities that do not include x or y', () => {
      const result = classifyLine('a < b', parser)
      expect(result.kind).toBe('invalid')
      expect(result.graphMode).toBe(null)
      expect(result.error).toBe('Inequality must include x or y')
    })
  })
})
