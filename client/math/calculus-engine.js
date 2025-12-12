/**
 * CalculusEngine - Symbolic and numerical calculus operations
 *
 * Provides:
 * - Symbolic differentiation using math.js
 * - Numerical differentiation (fallback)
 * - Limit approximation
 * - Taylor series
 * - Critical points
 *
 * Usage:
 *   const engine = new CalculusEngine();
 *   const derivative = engine.derivative('x^2', 'x');
 *   const limit = engine.limit('sin(x)/x', 'x', 0);
 */

import * as math from 'mathjs';
import ExpressionParser from './expression-parser.js';
import FunctionEvaluator from './function-evaluator.js';

export default class CalculusEngine {
  constructor() {
    this.parser = new ExpressionParser();
    this.debug = false;
  }

  /**
   * Compute symbolic derivative
   * @param {string|Object} expression - Expression or parsed expression
   * @param {string} variable - Variable to differentiate with respect to
   * @returns {Object} Parsed derivative expression
   */
  derivative(expression, variable = 'x') {
    try {
      // Parse if needed
      let parsed;
      if (typeof expression === 'string') {
        parsed = this.parser.parse(expression, [variable]);
      } else {
        parsed = expression;
      }

      if (!parsed.isValid) {
        throw new Error('Invalid expression');
      }

      // Use math.js symbolic differentiation
      const derivative = math.derivative(parsed.node, variable);

      // Parse the result
      const derivativeStr = derivative.toString();
      const derivativeParsed = this.parser.parse(derivativeStr, [variable]);

      if (this.debug) {
        console.log(`[CalculusEngine] Derivative of ${parsed.expression}: ${derivativeStr}`);
      }

      return derivativeParsed;
    } catch (error) {
      console.error('[CalculusEngine] Derivative error:', error);

      // Fallback to numerical derivative
      return this._numericalDerivative(expression, variable);
    }
  }

  /**
   * Compute numerical derivative (fallback)
   * @private
   */
  _numericalDerivative(expression, variable = 'x') {
    const h = 0.0001;

    return {
      expression: `(f(${variable} + h) - f(${variable})) / h`,
      isValid: true,
      isNumerical: true,
      evaluate: (scope) => {
        const evaluator = new FunctionEvaluator(
          typeof expression === 'string' ? this.parser.parse(expression) : expression
        );

        const x = scope[variable];
        const fx = evaluator.evaluateAt({ [variable]: x });
        const fxh = evaluator.evaluateAt({ [variable]: x + h });

        return (fxh - fx) / h;
      },
      toString: () => `${variable}'`
    };
  }

  /**
   * Evaluate derivative at a point
   * @param {string|Object} expression - Expression
   * @param {string} variable - Variable
   * @param {number} point - Point to evaluate at
   * @returns {number} Derivative value
   */
  derivativeAt(expression, variable, point) {
    const deriv = this.derivative(expression, variable);
    return deriv.evaluate({ [variable]: point });
  }

  /**
   * Compute second derivative
   * @param {string|Object} expression - Expression
   * @param {string} variable - Variable
   * @returns {Object} Second derivative
   */
  secondDerivative(expression, variable = 'x') {
    const firstDeriv = this.derivative(expression, variable);
    return this.derivative(firstDeriv, variable);
  }

  /**
   * Approximate limit as x approaches a point
   * @param {string|Object} expression - Expression
   * @param {string} variable - Variable
   * @param {number} point - Point to approach
   * @param {string} direction - 'both', 'left', or 'right'
   * @returns {Object} Limit result {value, exists, leftLimit, rightLimit}
   */
  limit(expression, variable = 'x', point = 0, direction = 'both') {
    const evaluator = new FunctionEvaluator(
      typeof expression === 'string' ? this.parser.parse(expression) : expression
    );

    const epsilon = 0.0001;
    const steps = 10;

    // Approach from left
    let leftLimit = null;
    if (direction === 'both' || direction === 'left') {
      const leftValues = [];
      for (let i = 1; i <= steps; i++) {
        const x = point - epsilon / i;
        const y = evaluator.evaluateAt({ [variable]: x });
        if (isFinite(y)) {
          leftValues.push(y);
        }
      }

      if (leftValues.length > 0) {
        leftLimit = leftValues[leftValues.length - 1];
      }
    }

    // Approach from right
    let rightLimit = null;
    if (direction === 'both' || direction === 'right') {
      const rightValues = [];
      for (let i = 1; i <= steps; i++) {
        const x = point + epsilon / i;
        const y = evaluator.evaluateAt({ [variable]: x });
        if (isFinite(y)) {
          rightValues.push(y);
        }
      }

      if (rightValues.length > 0) {
        rightLimit = rightValues[rightValues.length - 1];
      }
    }

    // Check if limit exists
    let value = null;
    let exists = false;

    if (leftLimit !== null && rightLimit !== null) {
      const tolerance = 0.01;
      exists = Math.abs(leftLimit - rightLimit) < tolerance;
      value = exists ? (leftLimit + rightLimit) / 2 : null;
    } else if (leftLimit !== null && direction === 'left') {
      value = leftLimit;
      exists = true;
    } else if (rightLimit !== null && direction === 'right') {
      value = rightLimit;
      exists = true;
    }

    if (this.debug) {
      console.log(`[CalculusEngine] Limit at ${point}: ${value} (exists: ${exists})`);
    }

    return {
      value,
      exists,
      leftLimit,
      rightLimit,
      point,
      type: exists ? 'exists' : 'does-not-exist'
    };
  }

  /**
   * Find critical points (where derivative = 0)
   * @param {string|Object} expression - Expression
   * @param {string} variable - Variable
   * @param {number} min - Search range minimum
   * @param {number} max - Search range maximum
   * @returns {Array} Array of critical points
   */
  findCriticalPoints(expression, variable = 'x', min = -10, max = 10) {
    const deriv = this.derivative(expression, variable);
    const evaluator = new FunctionEvaluator(deriv);

    return evaluator.findZeros(min, max);
  }

  /**
   * Classify critical point
   * @param {string|Object} expression - Expression
   * @param {string} variable - Variable
   * @param {number} point - Critical point
   * @returns {string} 'maximum', 'minimum', or 'saddle'
   */
  classifyCriticalPoint(expression, variable, point) {
    const secondDeriv = this.secondDerivative(expression, variable);
    const value = secondDeriv.evaluate({ [variable]: point });

    if (value > 0) {
      return 'minimum';
    } else if (value < 0) {
      return 'maximum';
    } else {
      return 'saddle';
    }
  }

  /**
   * Compute Taylor series approximation
   * @param {string|Object} expression - Expression
   * @param {string} variable - Variable
   * @param {number} center - Center point (a)
   * @param {number} degree - Degree of polynomial
   * @returns {string} Taylor series expression
   */
  taylorSeries(expression, variable = 'x', center = 0, degree = 3) {
    const evaluator = new FunctionEvaluator(
      typeof expression === 'string' ? this.parser.parse(expression) : expression
    );

    let terms = [];
    let currentExpr = expression;

    for (let n = 0; n <= degree; n++) {
      // Evaluate nth derivative at center
      let derivValue;
      if (n === 0) {
        derivValue = evaluator.evaluateAt({ [variable]: center });
      } else {
        const deriv = this._nthDerivative(currentExpr, variable, n);
        derivValue = deriv.evaluate({ [variable]: center });
      }

      // Factorial
      const factorial = this._factorial(n);

      // Term coefficient
      const coeff = derivValue / factorial;

      if (Math.abs(coeff) > 0.0001) {
        if (n === 0) {
          terms.push(coeff.toFixed(4));
        } else if (n === 1) {
          terms.push(`${coeff.toFixed(4)} * (${variable} - ${center})`);
        } else {
          terms.push(`${coeff.toFixed(4)} * (${variable} - ${center})^${n}`);
        }
      }
    }

    return terms.join(' + ');
  }

  /**
   * Compute nth derivative
   * @private
   */
  _nthDerivative(expression, variable, n) {
    let deriv = expression;
    for (let i = 0; i < n; i++) {
      deriv = this.derivative(deriv, variable);
    }
    return deriv;
  }

  /**
   * Factorial helper
   * @private
   */
  _factorial(n) {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }

  /**
   * Compute tangent line at point
   * @param {string|Object} expression - Expression
   * @param {string} variable - Variable
   * @param {number} point - Point for tangent
   * @returns {Object} Tangent line info {slope, point, equation}
   */
  tangentLine(expression, variable = 'x', point) {
    const evaluator = new FunctionEvaluator(
      typeof expression === 'string' ? this.parser.parse(expression) : expression
    );

    const y = evaluator.evaluateAt({ [variable]: point });
    const slope = this.derivativeAt(expression, variable, point);

    // y - y0 = m(x - x0) => y = mx - mx0 + y0
    const intercept = y - slope * point;

    return {
      slope,
      point: { x: point, y },
      intercept,
      equation: `${slope.toFixed(4)} * ${variable} + ${intercept.toFixed(4)}`,
      evaluate: (x) => slope * x + intercept
    };
  }

  /**
   * Compute secant line between two points
   * @param {string|Object} expression - Expression
   * @param {string} variable - Variable
   * @param {number} x1 - First point
   * @param {number} x2 - Second point
   * @returns {Object} Secant line info
   */
  secantLine(expression, variable = 'x', x1, x2) {
    const evaluator = new FunctionEvaluator(
      typeof expression === 'string' ? this.parser.parse(expression) : expression
    );

    const y1 = evaluator.evaluateAt({ [variable]: x1 });
    const y2 = evaluator.evaluateAt({ [variable]: x2 });

    const slope = (y2 - y1) / (x2 - x1);
    const intercept = y1 - slope * x1;

    return {
      slope,
      points: [
        { x: x1, y: y1 },
        { x: x2, y: y2 }
      ],
      intercept,
      equation: `${slope.toFixed(4)} * ${variable} + ${intercept.toFixed(4)}`,
      evaluate: (x) => slope * x + intercept
    };
  }

  /**
   * Approximate integral using numerical methods
   * @param {string|Object} expression - Expression
   * @param {string} variable - Variable
   * @param {number} a - Lower bound
   * @param {number} b - Upper bound
   * @param {string} method - 'riemann-left', 'riemann-right', 'riemann-mid', 'trapezoidal', 'simpson'
   * @param {number} n - Number of subintervals
   * @returns {Object} Integral approximation
   */
  integrate(expression, variable = 'x', a, b, method = 'riemann-mid', n = 100) {
    const evaluator = new FunctionEvaluator(
      typeof expression === 'string' ? this.parser.parse(expression) : expression
    );

    const dx = (b - a) / n;
    let sum = 0;

    switch (method) {
      case 'riemann-left':
        for (let i = 0; i < n; i++) {
          const x = a + i * dx;
          sum += evaluator.evaluateAt({ [variable]: x }) * dx;
        }
        break;

      case 'riemann-right':
        for (let i = 1; i <= n; i++) {
          const x = a + i * dx;
          sum += evaluator.evaluateAt({ [variable]: x }) * dx;
        }
        break;

      case 'riemann-mid':
        for (let i = 0; i < n; i++) {
          const x = a + (i + 0.5) * dx;
          sum += evaluator.evaluateAt({ [variable]: x }) * dx;
        }
        break;

      case 'trapezoidal':
        sum = evaluator.evaluateAt({ [variable]: a }) + evaluator.evaluateAt({ [variable]: b });
        for (let i = 1; i < n; i++) {
          const x = a + i * dx;
          sum += 2 * evaluator.evaluateAt({ [variable]: x });
        }
        sum *= dx / 2;
        break;

      case 'simpson':
        if (n % 2 !== 0) n++; // Simpson's rule requires even n
        sum = evaluator.evaluateAt({ [variable]: a }) + evaluator.evaluateAt({ [variable]: b });
        for (let i = 1; i < n; i++) {
          const x = a + i * dx;
          const mult = i % 2 === 0 ? 2 : 4;
          sum += mult * evaluator.evaluateAt({ [variable]: x });
        }
        sum *= dx / 3;
        break;
    }

    return {
      value: sum,
      method,
      bounds: [a, b],
      subdivisions: n
    };
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether debug mode should be enabled
   */
  setDebug(enabled) {
    this.debug = enabled;
    this.parser.setDebug(enabled);
  }
}
