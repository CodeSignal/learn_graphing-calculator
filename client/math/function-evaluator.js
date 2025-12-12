/**
 * FunctionEvaluator - Evaluates mathematical functions over ranges and points
 *
 * Provides utilities for:
 * - Evaluating functions at specific points
 * - Generating data points for plotting
 * - Detecting discontinuities
 * - Calculating domain and range
 * - Multivariate function support
 *
 * Usage:
 *   const evaluator = new FunctionEvaluator(parsed);
 *   const value = evaluator.evaluateAt(5);
 *   const data = evaluator.evaluateRange(-10, 10, 100);
 */

import ExpressionParser from './expression-parser.js';

export default class FunctionEvaluator {
  constructor(parsedExpression = null) {
    this.parsedExpression = parsedExpression;
    this.parser = new ExpressionParser();
    this.debug = false;
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
      if (this.debug) {
        console.error('[FunctionEvaluator] Evaluation error:', error);
      }
      return NaN;
    }
  }

  /**
   * Evaluate function over a range
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {number} steps - Number of data points (default: 200)
   * @param {string} variable - Variable name (default: 'x')
   * @returns {Array} Array of {x, y} points
   */
  evaluateRange(min, max, steps = 200, variable = 'x') {
    if (!this.parsedExpression) {
      throw new Error('No expression set');
    }

    const data = [];
    const stepSize = (max - min) / (steps - 1);

    for (let i = 0; i < steps; i++) {
      const value = min + i * stepSize;
      const scope = { [variable]: value };

      try {
        const result = this.parsedExpression.evaluate(scope);

        // Only add finite values
        if (isFinite(result)) {
          data.push({
            [variable]: value,
            y: result
          });
        } else {
          // Add null for discontinuities (helps plotting libraries)
          data.push({
            [variable]: value,
            y: null
          });
        }
      } catch (error) {
        data.push({
          [variable]: value,
          y: null
        });
      }
    }

    return data;
  }

  /**
   * Evaluate function over a 2D grid (for 3D plotting)
   * @param {number} xMin - Minimum x value
   * @param {number} xMax - Maximum x value
   * @param {number} yMin - Minimum y value
   * @param {number} yMax - Maximum y value
   * @param {number} xSteps - Number of x steps
   * @param {number} ySteps - Number of y steps
   * @returns {Array} Array of {x, y, z} points
   */
  evaluate2DGrid(xMin, xMax, yMin, yMax, xSteps = 50, ySteps = 50) {
    if (!this.parsedExpression) {
      throw new Error('No expression set');
    }

    const data = [];
    const xStepSize = (xMax - xMin) / (xSteps - 1);
    const yStepSize = (yMax - yMin) / (ySteps - 1);

    for (let i = 0; i < xSteps; i++) {
      const row = [];
      const x = xMin + i * xStepSize;

      for (let j = 0; j < ySteps; j++) {
        const y = yMin + j * yStepSize;

        try {
          const z = this.parsedExpression.evaluate({ x, y });

          row.push({
            x,
            y,
            z: isFinite(z) ? z : null
          });
        } catch (error) {
          row.push({ x, y, z: null });
        }
      }

      data.push(row);
    }

    return data;
  }

  /**
   * Detect discontinuities in a range
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {number} steps - Number of sample points
   * @param {number} threshold - Jump threshold to detect discontinuity
   * @returns {Array} Array of x-values where discontinuities occur
   */
  detectDiscontinuities(min, max, steps = 1000, threshold = 10) {
    const data = this.evaluateRange(min, max, steps);
    const discontinuities = [];

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      if (prev.y !== null && curr.y !== null) {
        const jump = Math.abs(curr.y - prev.y);
        const distance = Math.abs(curr.x - prev.x);

        // Check for sudden jump (derivative estimate)
        if (distance > 0 && jump / distance > threshold) {
          // Estimate discontinuity location
          const discontinuityX = (prev.x + curr.x) / 2;
          discontinuities.push({
            x: discontinuityX,
            leftValue: prev.y,
            rightValue: curr.y,
            type: this._classifyDiscontinuity(prev.y, curr.y)
          });
        }
      } else if (prev.y === null || curr.y === null) {
        // Infinite discontinuity
        const x = prev.y === null ? prev.x : curr.x;
        discontinuities.push({
          x,
          leftValue: prev.y,
          rightValue: curr.y,
          type: 'infinite'
        });
      }
    }

    return discontinuities;
  }

  /**
   * Classify type of discontinuity
   * @private
   */
  _classifyDiscontinuity(leftValue, rightValue) {
    if (leftValue === null || rightValue === null) {
      return 'infinite';
    }

    if (!isFinite(leftValue) || !isFinite(rightValue)) {
      return 'infinite';
    }

    // If values are close, might be removable
    if (Math.abs(leftValue - rightValue) < 0.01) {
      return 'removable';
    }

    return 'jump';
  }

  /**
   * Calculate approximate range of function over domain
   * @param {number} min - Minimum x value
   * @param {number} max - Maximum x value
   * @param {number} steps - Number of sample points
   * @returns {Object} {min, max} range values
   */
  calculateRange(min, max, steps = 500) {
    const data = this.evaluateRange(min, max, steps);

    let rangeMin = Infinity;
    let rangeMax = -Infinity;

    data.forEach(point => {
      if (point.y !== null && isFinite(point.y)) {
        rangeMin = Math.min(rangeMin, point.y);
        rangeMax = Math.max(rangeMax, point.y);
      }
    });

    return {
      min: rangeMin === Infinity ? -10 : rangeMin,
      max: rangeMax === -Infinity ? 10 : rangeMax
    };
  }

  /**
   * Find zeros of function in range (simple bracketing method)
   * @param {number} min - Minimum x value
   * @param {number} max - Maximum x value
   * @param {number} steps - Number of intervals to check
   * @returns {Array} Array of approximate zero locations
   */
  findZeros(min, max, steps = 100) {
    const zeros = [];
    const stepSize = (max - min) / steps;

    for (let i = 0; i < steps; i++) {
      const x1 = min + i * stepSize;
      const x2 = min + (i + 1) * stepSize;

      const y1 = this.evaluateAt(x1);
      const y2 = this.evaluateAt(x2);

      // Check for sign change
      if (isFinite(y1) && isFinite(y2) && y1 * y2 < 0) {
        // Use bisection to refine
        const zero = this._bisection(x1, x2, 0.0001, 50);

        if (zero !== null) {
          zeros.push(zero);
        }
      }
    }

    return zeros;
  }

  /**
   * Bisection method to find zero
   * @private
   */
  _bisection(a, b, tolerance = 0.0001, maxIterations = 50) {
    let left = a;
    let right = b;

    for (let i = 0; i < maxIterations; i++) {
      const mid = (left + right) / 2;
      const fMid = this.evaluateAt(mid);

      if (Math.abs(fMid) < tolerance) {
        return mid;
      }

      const fLeft = this.evaluateAt(left);

      if (fLeft * fMid < 0) {
        right = mid;
      } else {
        left = mid;
      }

      if (Math.abs(right - left) < tolerance) {
        return (left + right) / 2;
      }
    }

    return (left + right) / 2;
  }

  /**
   * Sample function adaptively (more samples where function changes rapidly)
   * @param {number} min - Minimum x value
   * @param {number} max - Maximum x value
   * @param {number} minSteps - Minimum number of steps
   * @param {number} maxSteps - Maximum number of steps
   * @param {number} threshold - Curvature threshold for refinement
   * @returns {Array} Array of {x, y} points
   */
  adaptiveSample(min, max, minSteps = 50, maxSteps = 500, threshold = 0.1) {
    // Start with coarse sampling
    let points = this.evaluateRange(min, max, minSteps);

    // Refine regions with high curvature
    let refined = true;
    let iterations = 0;
    const maxIterations = 10;

    while (refined && iterations < maxIterations && points.length < maxSteps) {
      refined = false;
      const newPoints = [points[0]];

      for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];

        // Check if we need more points here
        if (prev.y !== null && curr.y !== null && next.y !== null) {
          const curvature = Math.abs(
            (next.y - curr.y) / (next.x - curr.x) -
            (curr.y - prev.y) / (curr.x - prev.x)
          );

          if (curvature > threshold && newPoints.length < maxSteps) {
            // Add intermediate point
            const midX = (prev.x + curr.x) / 2;
            const midY = this.evaluateAt(midX);

            newPoints.push({ x: midX, y: midY });
            refined = true;
          }
        }

        newPoints.push(curr);
      }

      newPoints.push(points[points.length - 1]);
      points = newPoints;
      iterations++;
    }

    return points;
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether debug mode should be enabled
   */
  setDebug(enabled) {
    this.debug = enabled;
    this.parser.setDebug(enabled);
  }

  /**
   * Static method to quickly evaluate an expression at a point
   * @param {string} expression - Expression string
   * @param {number|Object} point - Point to evaluate at
   * @returns {number} Function value
   */
  static evaluate(expression, point) {
    const parser = new ExpressionParser();
    const parsed = parser.parse(expression);
    const evaluator = new FunctionEvaluator(parsed);
    return evaluator.evaluateAt(point);
  }
}
