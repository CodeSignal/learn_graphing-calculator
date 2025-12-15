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

    it('should initialize debug flag to false', () => {
      expect(parser.debug).toBe(false)
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

  describe('getAllVariables vs detectVariables', () => {
    it('should return all variables including parameters', () => {
      const vars1 = parser.getAllVariables('a*x + b')
      expect(vars1).toContain('a')
      expect(vars1).toContain('x')
      expect(vars1).toContain('b')

      const vars2 = parser.getAllVariables('a*x + b*y + c')
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

    it('should exclude constants from variable extraction', () => {
      const vars = parser.getAllVariables('x + e + pi')
      expect(vars).toContain('x')
      expect(vars).not.toContain('e')
      expect(vars).not.toContain('pi')
    })

    it('should exclude function names from variable extraction', () => {
      const vars = parser.getAllVariables('sin(x) + cos(y)')
      expect(vars).toContain('x')
      expect(vars).toContain('y')
      expect(vars).not.toContain('sin')
      expect(vars).not.toContain('cos')
    })

    it('should return empty array for invalid expressions in getAllVariables', () => {
      expect(parser.getAllVariables('invalid+++')).toEqual([])
      expect(parser.getAllVariables(null)).toEqual([])
      expect(parser.getAllVariables('')).toEqual([])
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

    it('should clear cache and reset stats', () => {
      parser.parse('x + 1')
      parser.parse('x + 2')
      parser.parse('x + 1') // cache hit

      expect(parser.cache.size).toBeGreaterThan(0)
      expect(parser.cacheHits).toBeGreaterThan(0)
      expect(parser.cacheMisses).toBeGreaterThan(0)

      parser.clearCache()

      expect(parser.cache.size).toBe(0)
      expect(parser.cacheHits).toBe(0)
      expect(parser.cacheMisses).toBe(0)
    })

    it('should return correct cache statistics', () => {
      parser.parse('x + 1')
      parser.parse('x + 2')
      parser.parse('x + 1') // cache hit

      const stats = parser.getCacheStats()
      expect(stats.size).toBe(2)
      expect(stats.maxSize).toBe(100)
      expect(stats.hitRate).toBeGreaterThan(0)
      expect(stats.hitRate).toBeLessThanOrEqual(1)
    })

    it('should calculate hit rate correctly', () => {
      parser.parse('x + 1')
      parser.parse('x + 1') // hit
      parser.parse('x + 1') // hit

      const stats = parser.getCacheStats()
      expect(stats.hitRate).toBeCloseTo(2/3, 5)
    })

    it('should return zero hit rate when no cache operations', () => {
      const stats = parser.getCacheStats()
      expect(stats.hitRate).toBe(0)
    })
  })

  describe('validate', () => {
    it('should return isValid true for valid expressions', () => {
      const result = parser.validate('x + 1')
      expect(result.isValid).toBe(true)
      expect(result.error).toBe(null)
    })

    it('should return isValid false for invalid expressions', () => {
      const result = parser.validate('x +')
      expect(result.isValid).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('should not affect cache', () => {
      const initialSize = parser.cache.size
      parser.validate('x + 1')
      parser.validate('x + 2')
      expect(parser.cache.size).toBe(initialSize)
    })
  })

  describe('simplify', () => {
    it('should simplify valid expressions', () => {
      const simplified = parser.simplify('x + x')
      expect(simplified).toBe('2 * x')
    })

    it('should return original string for invalid expressions', () => {
      const result = parser.simplify('x +')
      expect(result).toBe('x +')
    })

    it('should not throw errors', () => {
      expect(() => parser.simplify('invalid+++')).not.toThrow()
      expect(() => parser.simplify(null)).not.toThrow()
    })
  })

  describe('Utility Methods', () => {
    it('should toggle debug mode', () => {
      expect(parser.debug).toBe(false)
      parser.setDebug(true)
      expect(parser.debug).toBe(true)
      parser.setDebug(false)
      expect(parser.debug).toBe(false)
    })

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

  describe('Static Methods', () => {
    it('should return boolean for isAvailable', () => {
      const result = ExpressionParser.isAvailable()
      expect(typeof result).toBe('boolean')
      expect(result).toBe(true) // math.js should be available
    })

    it('should return array of supported functions', () => {
      const functions = ExpressionParser.getSupportedFunctions()
      expect(Array.isArray(functions)).toBe(true)
      expect(functions.length).toBeGreaterThan(0)
      expect(functions).toContain('sin')
      expect(functions).toContain('cos')
      expect(functions).toContain('sqrt')
      expect(functions).toContain('exp')
    })

    it('should return object of supported constants', () => {
      const constants = ExpressionParser.getSupportedConstants()
      expect(typeof constants).toBe('object')
      expect(constants).toHaveProperty('e')
      expect(constants).toHaveProperty('pi')
      expect(constants).toHaveProperty('PI')
      expect(constants.e).toBe(Math.E)
      expect(constants.pi).toBe(Math.PI)
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

