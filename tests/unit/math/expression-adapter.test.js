import { describe, expect, it } from 'vitest'
import {
  computeDerivative,
  toDisplayLatex,
  toFunctionPlotSyntax
} from '../../../client/math/expression-adapter.js'

const compact = (value) => value.replace(/\s+/g, '')

describe('ExpressionAdapter', () => {
  describe('toFunctionPlotSyntax', () => {
    it('normalizes constants and ln function for function-plot compatibility', () => {
      expect(toFunctionPlotSyntax('pi')).toBe('PI')
      expect(toFunctionPlotSyntax('PI')).toBe('PI')
      expect(toFunctionPlotSyntax('e')).toBe('E')
      expect(toFunctionPlotSyntax('E')).toBe('E')
      expect(toFunctionPlotSyntax('ln(x)')).toBe('log(x)')
      expect(compact(toFunctionPlotSyntax('ln(x)+pi+e'))).toBe('log(x)+PI+E')
    })

    it('does not alter non-target expressions', () => {
      expect(toFunctionPlotSyntax('1e-3*x')).toBe('1e-3*x')
      expect(toFunctionPlotSyntax('exp(x)+beta')).toBe('exp(x)+beta')
      expect(toFunctionPlotSyntax('x^2 + y^2')).toBe('x^2 + y^2')
    })

    it('returns original expression when parsing fails', () => {
      expect(toFunctionPlotSyntax('x +')).toBe('x +')
    })
  })

  describe('computeDerivative', () => {
    it('returns a function-plot-ready derivative of a polynomial', () => {
      const result = computeDerivative('x^2')
      expect(result).toBeTruthy()
      expect(result).toMatch(/2.*x|x.*2/)
    })

    it('applies toFunctionPlotSyntax to the result (pi -> PI)', () => {
      const result = computeDerivative('pi * x')
      expect(result).toBeTruthy()
      expect(result).toContain('PI')
    })

    it('returns null for un-differentiable expressions', () => {
      expect(computeDerivative('x +')).toBeNull()
    })

    it('returns null for empty or non-string input', () => {
      expect(computeDerivative('')).toBeNull()
      expect(computeDerivative(null)).toBeNull()
      expect(computeDerivative(42)).toBeNull()
    })

    it('caches repeated calls for the same expression', () => {
      const first = computeDerivative('x^3')
      const second = computeDerivative('x^3')
      expect(first).toBe(second)
    })
  })

  describe('toDisplayLatex', () => {
    it('renders pi assignments using the pi token', () => {
      const latex = toDisplayLatex('x = pi')
      expect(latex).toContain('\\pi')
      expect(latex).toContain('=')
    })

    it('renders ln expressions as canonical ln in LaTeX', () => {
      const latex = toDisplayLatex('y = ln(x) + e')
      expect(latex).toContain('\\ln')
      expect(latex).toContain('=')
    })

    it('renders top-level relations by converting each side', () => {
      const latex = toDisplayLatex('x^2 + y^2 = 1')
      expect(latex).toContain('{ x}^{2}')
      expect(latex).toContain('=')
      expect(latex).toContain('{ y}^{2}')
    })

    it('renders inequality operators with LaTeX relation tokens', () => {
      const latex = toDisplayLatex('y <= x^2')
      expect(latex).toContain('\\leq')
    })

    it('renders tuple point shorthand as LaTeX instead of raw text', () => {
      const latex = toDisplayLatex('(1, 2)')
      expect(latex).toContain('\\left(')
      expect(latex).toContain(',')
      expect(latex).toContain('\\right)')
      expect(latex).not.toBe('(1, 2)')
    })

    it('ignores nested commas when rendering tuple point shorthand', () => {
      const latex = toDisplayLatex('(max(1, a), b)')
      expect(latex).toContain('\\max')
      expect(latex).toContain('b')
      expect(latex).not.toBe('(max(1, a), b)')
    })

    it('falls back for malformed tuple point shorthand', () => {
      expect(toDisplayLatex('(1, 2, 3)')).toBe('(1, 2, 3)')
      expect(toDisplayLatex('(1,)')).toBe('(1,)')
      expect(toDisplayLatex('((1, 2))')).toBe('((1, 2))')
    })

    it('falls back to original expression if relation side parse fails', () => {
      expect(toDisplayLatex('x = y +')).toBe('x = y +')
    })

    it('falls back to original expression if parse fails', () => {
      expect(toDisplayLatex('x +')).toBe('x +')
    })
  })
})
