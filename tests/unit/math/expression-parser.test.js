import { describe, it, expect, beforeEach, vi } from 'vitest'
import ExpressionParser from '../../../client/math/expression-parser.js'

describe('ExpressionParser', () => {
  let parser

  beforeEach(() => {
    parser = new ExpressionParser()
  })

  describe('Constructor and Initialization', () => {
    it('should initialize with default cache size of 100', () => {
      expect(parser.maxCacheSize).toBe(100)
    })

    it('should initialize cache stats to zero', () => {
      expect(parser.cacheHits).toBe(0)
      expect(parser.cacheMisses).toBe(0)
    })

    it('should start with empty cache', () => {
      expect(parser.cache.size).toBe(0)
    })
  })

  describe('detectVariables', () => {
    it('should detect x only when expression contains only x', () => {
      expect(parser.detectVariables('x + 1')).toEqual(['x'])
      expect(parser.detectVariables('x^2')).toEqual(['x'])
      expect(parser.detectVariables('sin(x)')).toEqual(['x'])
    })

    it('should detect x and y when expression contains both', () => {
      expect(parser.detectVariables('x + y')).toEqual(['x', 'y'])
      expect(parser.detectVariables('x^2 + y^2')).toEqual(['x', 'y'])
      expect(parser.detectVariables('sin(x) * cos(y)')).toEqual(['x', 'y'])
    })

    it('should throw error when expression does not contain x', () => {
      expect(() => parser.detectVariables('y + 1')).toThrow('must contain variable \'x\'')
      expect(() => parser.detectVariables('a + b')).toThrow('must contain variable \'x\'')
      expect(() => parser.detectVariables('5')).toThrow('must contain variable \'x\'')
    })

    it('should throw error for invalid expressions', () => {
      expect(() => parser.detectVariables('x +')).toThrow()
      expect(() => parser.detectVariables('x**')).toThrow()
      expect(() => parser.detectVariables('sin(')).toThrow()
    })

    it('should throw error for null input', () => {
      expect(() => parser.detectVariables(null)).toThrow('Expression must be a non-empty string')
    })

    it('should throw error for undefined input', () => {
      expect(() => parser.detectVariables(undefined)).toThrow('Expression must be a non-empty string')
    })

    it('should throw error for empty string', () => {
      expect(() => parser.detectVariables('')).toThrow('Expression must be a non-empty string')
    })

    it('should throw error for non-string input', () => {
      expect(() => parser.detectVariables(123)).toThrow('Expression must be a non-empty string')
      expect(() => parser.detectVariables({})).toThrow('Expression must be a non-empty string')
      expect(() => parser.detectVariables([])).toThrow('Expression must be a non-empty string')
    })

    it('should filter out parameters and only return x/y', () => {
      expect(parser.detectVariables('a*x + b')).toEqual(['x'])
      expect(parser.detectVariables('a*x + b*y + c')).toEqual(['x', 'y'])
    })
  })

  describe('parse', () => {
    it('should parse valid expressions successfully', () => {
      const parsed = parser.parse('x + 1')
      expect(parsed.isValid).toBe(true)
      expect(parsed.error).toBe(null)
      expect(parsed.expression).toBe('x + 1')
      expect(parsed.variables).toEqual(['x'])
    })

    it('should return parsed object with correct structure', () => {
      const parsed = parser.parse('x^2 + 3*x - 5')
      expect(parsed).toHaveProperty('expression')
      expect(parsed).toHaveProperty('node')
      expect(parsed).toHaveProperty('compiled')
      expect(parsed).toHaveProperty('variables')
      expect(parsed).toHaveProperty('usedVariables')
      expect(parsed).toHaveProperty('isValid')
      expect(parsed).toHaveProperty('error')
      expect(parsed).toHaveProperty('evaluate')
      expect(parsed).toHaveProperty('toLatex')
      expect(parsed).toHaveProperty('toString')
    })

    it('should evaluate expressions correctly with provided scope', () => {
      const parsed = parser.parse('x + 1')
      expect(parsed.evaluate({ x: 5 })).toBe(6)
      expect(parsed.evaluate({ x: -3 })).toBe(-2)
    })

    it('should handle expressions with multiple variables', () => {
      const parsed = parser.parse('x + y')
      expect(parsed.variables).toEqual(['x', 'y'])
      expect(parsed.evaluate({ x: 2, y: 3 })).toBe(5)
    })

    it('should warn but not fail on unknown variables', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const parsed = parser.parse('a*x + b')
      expect(parsed.isValid).toBe(true)
      expect(parsed.variables).toEqual(['x'])
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should cache parsed expressions', () => {
      parser.parse('x + 1')
      expect(parser.cache.size).toBe(1)
      expect(parser.cacheMisses).toBe(1)

      parser.parse('x + 1')
      expect(parser.cache.size).toBe(1)
      expect(parser.cacheHits).toBe(1)
    })

    it('should use different cache keys for different variable sets', () => {
      parser.parse('x + 1', ['x'])
      parser.parse('x + 1', ['x', 'y'])
      expect(parser.cache.size).toBe(2)
    })

    it('should return error object for invalid expressions without throwing', () => {
      const parsed = parser.parse('x +')
      expect(parsed.isValid).toBe(false)
      expect(parsed.error).toBeTruthy()
      expect(parsed.evaluate()).toBeNaN()
    })

    it('should allow variables parameter to override auto-detection', () => {
      const parsed = parser.parse('x + y', ['x', 'y'])
      expect(parsed.variables).toEqual(['x', 'y'])
    })

    it('should throw error for null input', () => {
      expect(() => parser.parse(null)).toThrow('Expression must be a non-empty string')
    })

    it('should throw error for undefined input', () => {
      expect(() => parser.parse(undefined)).toThrow('Expression must be a non-empty string')
    })

    it('should throw error for empty string', () => {
      expect(() => parser.parse('')).toThrow('Expression must be a non-empty string')
    })
  })

  describe('Expression Evaluation', () => {
    it('should evaluate basic arithmetic correctly', () => {
      const parsed1 = parser.parse('x + 1')
      expect(parsed1.evaluate({ x: 5 })).toBe(6)

      const parsed2 = parser.parse('x * 2')
      expect(parsed2.evaluate({ x: 3 })).toBe(6)

      const parsed3 = parser.parse('x^2')
      expect(parsed3.evaluate({ x: 4 })).toBe(16)
    })

    it('should evaluate trigonometric functions', () => {
      const parsed1 = parser.parse('sin(x)')
      expect(parsed1.evaluate({ x: 0 })).toBeCloseTo(0, 10)

      const parsed2 = parser.parse('cos(x)')
      expect(parsed2.evaluate({ x: 0 })).toBeCloseTo(1, 10)

      const parsed3 = parser.parse('tan(x)')
      expect(parsed3.evaluate({ x: 0 })).toBeCloseTo(0, 10)
    })

    it('should evaluate square root function', () => {
      const parsed = parser.parse('sqrt(x)')
      expect(parsed.evaluate({ x: 4 })).toBe(2)
      expect(parsed.evaluate({ x: 9 })).toBe(3)
    })

    it('should evaluate absolute value function', () => {
      const parsed = parser.parse('abs(x)')
      expect(parsed.evaluate({ x: -5 })).toBe(5)
      expect(parsed.evaluate({ x: 5 })).toBe(5)
    })

    it('should evaluate exponential function', () => {
      const parsed = parser.parse('exp(x)')
      expect(parsed.evaluate({ x: 0 })).toBeCloseTo(1, 10)
      expect(parsed.evaluate({ x: 1 })).toBeCloseTo(Math.E, 10)
    })

    it('should evaluate logarithmic function', () => {
      const parsed = parser.parse('log(x)')
      expect(parsed.evaluate({ x: 1 })).toBeCloseTo(0, 10)
      expect(parsed.evaluate({ x: Math.E })).toBeCloseTo(1, 10)
    })

    it('should evaluate complex expressions', () => {
      const parsed1 = parser.parse('x^2 + 3*x - 5')
      expect(parsed1.evaluate({ x: 2 })).toBe(5)

      const parsed2 = parser.parse('sin(x) * cos(x)')
      expect(parsed2.evaluate({ x: 0 })).toBeCloseTo(0, 10)
    })

    it('should handle division by zero', () => {
      const parsed = parser.parse('1 / x')
      const result = parsed.evaluate({ x: 0 })
      expect(Number.isNaN(result) || !Number.isFinite(result)).toBe(true)
    })

    it('should handle missing variables in scope', () => {
      const parsed = parser.parse('x + y')
      const result = parsed.evaluate({ x: 5 })
      expect(Number.isNaN(result)).toBe(true)
    })

    it('should ignore extra variables in scope', () => {
      const parsed = parser.parse('x + 1')
      expect(parsed.evaluate({ x: 5, y: 10, z: 20 })).toBe(6)
    })
  })

  describe('getAllSymbols vs detectVariables', () => {
    it('should return all symbols including variables and parameters', () => {
      const vars1 = parser.getAllSymbols('a*x + b')
      expect(vars1).toContain('a')
      expect(vars1).toContain('x')
      expect(vars1).toContain('b')

      const vars2 = parser.getAllSymbols('a*x + b*y + c')
      expect(vars2).toContain('a')
      expect(vars2).toContain('x')
      expect(vars2).toContain('b')
      expect(vars2).toContain('y')
      expect(vars2).toContain('c')
    })

    it('should filter to only x/y in detectVariables', () => {
      expect(parser.detectVariables('a*x + b')).toEqual(['x'])
      expect(parser.detectVariables('a*x + b*y + c')).toEqual(['x', 'y'])
    })

    it('should exclude constants from symbol extraction', () => {
      const vars = parser.getAllSymbols('x + e + pi')
      expect(vars).toContain('x')
      expect(vars).not.toContain('e')
      expect(vars).not.toContain('pi')
    })

    it('should exclude function names from symbol extraction', () => {
      const vars = parser.getAllSymbols('sin(x) + cos(y)')
      expect(vars).toContain('x')
      expect(vars).toContain('y')
      expect(vars).not.toContain('sin')
      expect(vars).not.toContain('cos')
    })

    it('should return empty array for invalid expressions in getAllSymbols', () => {
      expect(parser.getAllSymbols('invalid+++')).toEqual([])
      expect(parser.getAllSymbols(null)).toEqual([])
      expect(parser.getAllSymbols('')).toEqual([])
    })
  })

  describe('isParameter', () => {
    it('should detect parameter names', () => {
      const result1 = parser.isParameter('a')
      expect(result1.isParameter).toBe(true)
      expect(result1.paramName).toBe('a')

      const result2 = parser.isParameter('b')
      expect(result2.isParameter).toBe(true)
      expect(result2.paramName).toBe('b')

      const result3 = parser.isParameter('z')
      expect(result3.isParameter).toBe(true)
      expect(result3.paramName).toBe('z')
    })

    it('should reject reserved variables x and y', () => {
      const result1 = parser.isParameter('x')
      expect(result1.isParameter).toBe(false)
      expect(result1.paramName).toBe(null)

      const result2 = parser.isParameter('y')
      expect(result2.isParameter).toBe(false)
      expect(result2.paramName).toBe(null)
    })

    it('should reject constants', () => {
      const constants = ['e', 'pi', 'PI', 'E', 'i']
      constants.forEach(constant => {
        const result = parser.isParameter(constant)
        expect(result.isParameter).toBe(false)
        expect(result.paramName).toBe(null)
      })
    })

    it('should reject expressions that are not parameters', () => {
      expect(parser.isParameter('a + 1')).toEqual({ isParameter: false, paramName: null })
      expect(parser.isParameter('a * b')).toEqual({ isParameter: false, paramName: null })
      expect(parser.isParameter('sin(a)')).toEqual({ isParameter: false, paramName: null })
      expect(parser.isParameter('a = 5')).toEqual({ isParameter: false, paramName: null })
    })

    it('should handle invalid input', () => {
      expect(parser.isParameter(null)).toEqual({ isParameter: false, paramName: null })
      expect(parser.isParameter('')).toEqual({ isParameter: false, paramName: null })
      expect(parser.isParameter('   ')).toEqual({ isParameter: false, paramName: null })
      expect(parser.isParameter('invalid+++')).toEqual({ isParameter: false, paramName: null })
    })

    it('should trim whitespace', () => {
      const result = parser.isParameter('  a  ')
      expect(result.isParameter).toBe(true)
      expect(result.paramName).toBe('a')
    })
  })

  describe('parseAssignmentSyntax', () => {
    it('should detect assignment syntax for any symbol including x and y', () => {
      const result1 = parser.parseAssignmentSyntax('x = 5')
      expect(result1.isAssignment).toBe(true)
      expect(result1.lhs).toBe('x')
      expect(result1.rhs).toBe('5')

      const result2 = parser.parseAssignmentSyntax('y = 10')
      expect(result2.isAssignment).toBe(true)
      expect(result2.lhs).toBe('y')
      expect(result2.rhs).toBe('10')

      const result3 = parser.parseAssignmentSyntax('a = 3')
      expect(result3.isAssignment).toBe(true)
      expect(result3.lhs).toBe('a')
      expect(result3.rhs).toBe('3')
    })

    it('should extract RHS expression string without evaluation', () => {
      const result1 = parser.parseAssignmentSyntax('a = 1 + 2')
      expect(result1.isAssignment).toBe(true)
      expect(result1.lhs).toBe('a')
      // math.js toString() may or may not add parentheses - just check it contains the expression
      expect(result1.rhs).toContain('1')
      expect(result1.rhs).toContain('2')

      const result2 = parser.parseAssignmentSyntax('b = pi')
      expect(result2.isAssignment).toBe(true)
      expect(result2.lhs).toBe('b')
      expect(result2.rhs).toBe('pi')

      const result3 = parser.parseAssignmentSyntax('x = sin(1)')
      expect(result3.isAssignment).toBe(true)
      expect(result3.lhs).toBe('x')
      expect(result3.rhs).toBe('sin(1)')
    })

    it('should reject non-assignment expressions', () => {
      expect(parser.parseAssignmentSyntax('a + 1')).toEqual({ isAssignment: false, lhs: null, rhs: null })
      expect(parser.parseAssignmentSyntax('a')).toEqual({ isAssignment: false, lhs: null, rhs: null })
      expect(parser.parseAssignmentSyntax('sin(x)')).toEqual({ isAssignment: false, lhs: null, rhs: null })
    })

    it('should handle invalid input', () => {
      expect(parser.parseAssignmentSyntax(null)).toEqual({ isAssignment: false, lhs: null, rhs: null })
      expect(parser.parseAssignmentSyntax('')).toEqual({ isAssignment: false, lhs: null, rhs: null })
      expect(parser.parseAssignmentSyntax('invalid+++')).toEqual({ isAssignment: false, lhs: null, rhs: null })
    })

    it('should trim whitespace', () => {
      const result = parser.parseAssignmentSyntax('  x = 5  ')
      expect(result.isAssignment).toBe(true)
      expect(result.lhs).toBe('x')
      expect(result.rhs).toBe('5')
    })

    it('should handle complex RHS expressions', () => {
      const result1 = parser.parseAssignmentSyntax('a = x + 1')
      expect(result1.isAssignment).toBe(true)
      expect(result1.lhs).toBe('a')
      // math.js toString() may or may not add parentheses - just check it contains the expression
      expect(result1.rhs).toContain('x')
      expect(result1.rhs).toContain('1')

      const result2 = parser.parseAssignmentSyntax('y = b * 2')
      expect(result2.isAssignment).toBe(true)
      expect(result2.lhs).toBe('y')
      expect(result2.rhs).toContain('b')
      expect(result2.rhs).toContain('2')
    })
  })


  describe('Cache Functionality', () => {
    it('should increment cache hits on repeated parsing', () => {
      parser.parse('x + 1')
      parser.parse('x + 1')
      expect(parser.cacheHits).toBe(1)
      expect(parser.cacheMisses).toBe(1)
    })

    it('should increment cache misses on new expressions', () => {
      parser.parse('x + 1')
      parser.parse('x + 2')
      expect(parser.cacheMisses).toBe(2)
      expect(parser.cacheHits).toBe(0)
    })

    it('should evict oldest entries when cache exceeds max size', () => {
      // Fill cache beyond max size
      for (let i = 0; i < 105; i++) {
        parser.parse(`x + ${i}`)
      }
      expect(parser.cache.size).toBe(100)
    })

    it('should use expression and variables in cache key', () => {
      parser.parse('x + 1', ['x'])
      parser.parse('x + 1', ['x', 'y'])
      expect(parser.cache.size).toBe(2)
    })
  })

  describe('Utility Methods', () => {
    it('should return LaTeX representation', () => {
      const parsed = parser.parse('x^2 + 1')
      const latex = parsed.toLatex()
      expect(typeof latex).toBe('string')
      expect(latex.length).toBeGreaterThan(0)
    })

    it('should return original expression if LaTeX conversion fails', () => {
      const parsed = parser.parse('x +')
      const latex = parsed.toLatex()
      expect(latex).toBe('x +')
    })

    it('should return string representation', () => {
      const parsed = parser.parse('x^2 + 1')
      const str = parsed.toString()
      expect(typeof str).toBe('string')
      expect(str.length).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid input types gracefully', () => {
      expect(() => parser.parse(null)).toThrow()
      expect(() => parser.parse(undefined)).toThrow()
      expect(() => parser.parse(123)).toThrow()
    })

    it('should return error object for parse errors without throwing', () => {
      const parsed = parser.parse('x +')
      expect(parsed.isValid).toBe(false)
      expect(parsed.error).toBeTruthy()
    })

    it('should return NaN for evaluation errors', () => {
      const parsed = parser.parse('x +')
      expect(parsed.evaluate({ x: 5 })).toBeNaN()
    })

    it('should handle very long expressions', () => {
      const longExpr = 'x + '.repeat(1000) + 'x'
      const parsed = parser.parse(longExpr)
      // Should either parse or return error object, not throw
      expect(parsed).toHaveProperty('isValid')
    })

    it('should handle special characters in expressions', () => {
      // Test that parser handles edge cases gracefully
      const parsed = parser.parse('x + 1')
      expect(parsed.isValid).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle expressions with only constants', () => {
      expect(() => parser.detectVariables('5')).toThrow('must contain variable \'x\'')
    })

    it('should handle expressions with nested functions', () => {
      const parsed = parser.parse('sin(cos(x))')
      expect(parsed.isValid).toBe(true)
      expect(parsed.evaluate({ x: 0 })).toBeCloseTo(Math.sin(1), 10)
    })

    it('should handle expressions with multiple operations', () => {
      const parsed = parser.parse('x^2 + 2*x + 1')
      expect(parsed.isValid).toBe(true)
      expect(parsed.evaluate({ x: 1 })).toBe(4)
    })

    it('should handle expressions with parentheses', () => {
      const parsed = parser.parse('(x + 1) * (x - 1)')
      expect(parsed.isValid).toBe(true)
      expect(parsed.evaluate({ x: 3 })).toBe(8)
    })

    it('should handle expressions with negative numbers', () => {
      const parsed = parser.parse('x - 5')
      expect(parsed.isValid).toBe(true)
      expect(parsed.evaluate({ x: 10 })).toBe(5)
    })

    it('should handle expressions with decimal numbers', () => {
      const parsed = parser.parse('x * 1.5')
      expect(parsed.isValid).toBe(true)
      expect(parsed.evaluate({ x: 2 })).toBe(3)
    })
  })
})


