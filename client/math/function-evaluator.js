/**
 * FunctionEvaluator - Evaluates mathematical functions at specific points
 *
 * Provides utilities for:
 * - Evaluating functions at specific points
 * - Multivariate function support
 *
 * Usage:
 *   const evaluator = new FunctionEvaluator(parsed);
 *   const value = evaluator.evaluateAt(5);
 */

import ExpressionParser from './expression-parser.js';

export default class FunctionEvaluator {
  constructor(parsedExpression = null) {
    this.parsedExpression = parsedExpression;
    this.parser = new ExpressionParser();
  }

  /**
   * Set the function expression to evaluate
   * @param {string|Object} expression - Expression string or parsed expression
   * @param {string[]} variables - Variables (optional, will auto-detect if not provided)
   */
  setExpression(expression, variables = null) {
    if (typeof expression === 'string') {
      // Auto-detect variables if not provided
      this.parsedExpression = this.parser.parse(expression, variables);
    } else if (expression && expression.evaluate) {
      this.parsedExpression = expression;
    } else {
      throw new Error('Invalid expression provided');
    }
  }

  /**
   * Evaluate function at a specific point
   * @param {number|Object} point - Single value or object with variable values
   * @returns {number} Function value
   */
  evaluateAt(point) {
    if (!this.parsedExpression) {
      throw new Error('No expression set');
    }

    let scope;

    if (typeof point === 'number') {
      // Assume single variable 'x'
      scope = { x: point };
    } else {
      scope = point;
    }

    try {
      const result = this.parsedExpression.evaluate(scope);

      // Check for invalid results
      if (!isFinite(result)) {
        return NaN;
      }

      return result;
    } catch (error) {
      console.error('[FunctionEvaluator] Evaluation error:', error);
      return NaN;
    }
  }
}
