/**
 * NumericalMethods - Additional numerical computation utilities
 *
 * Provides helper methods for:
 * - Numerical integration (Riemann sums, trapezoidal, Simpson's)
 * - Root finding (Newton's method, bisection)
 * - Optimization (gradient descent)
 * - Interpolation
 *
 * Usage:
 *   const integral = NumericalMethods.riemannSum(f, 0, 10, 100, 'midpoint');
 *   const root = NumericalMethods.newtonMethod(f, df, 1);
 */

export default class NumericalMethods {
  /**
   * Compute Riemann sum
   * @param {Function} f - Function to integrate
   * @param {number} a - Lower bound
   * @param {number} b - Upper bound
   * @param {number} n - Number of rectangles
   * @param {string} method - 'left', 'right', 'midpoint'
   * @returns {Object} Result with value and rectangles data
   */
  static riemannSum(f, a, b, n, method = 'midpoint') {
    const dx = (b - a) / n;
    let sum = 0;
    const rectangles = [];

    for (let i = 0; i < n; i++) {
      let x;
      switch (method) {
        case 'left':
          x = a + i * dx;
          break;
        case 'right':
          x = a + (i + 1) * dx;
          break;
        case 'midpoint':
        default:
          x = a + (i + 0.5) * dx;
      }

      const height = f(x);
      if (isFinite(height)) {
        sum += height * dx;
        rectangles.push({
          x: a + i * dx,
          width: dx,
          height: height
        });
      }
    }

    return {
      value: sum,
      rectangles,
      method,
      n
    };
  }

  /**
   * Newton's method for root finding
   * @param {Function} f - Function
   * @param {Function} df - Derivative
   * @param {number} x0 - Initial guess
   * @param {number} tolerance - Tolerance
   * @param {number} maxIter - Maximum iterations
   * @returns {Object} Root and iteration info
   */
  static newtonMethod(f, df, x0, tolerance = 0.0001, maxIter = 50) {
    let x = x0;
    const history = [x];

    for (let i = 0; i < maxIter; i++) {
      const fx = f(x);
      const dfx = df(x);

      if (Math.abs(fx) < tolerance) {
        return {
          root: x,
          iterations: i + 1,
          converged: true,
          history
        };
      }

      if (Math.abs(dfx) < 1e-10) {
        return {
          root: x,
          iterations: i + 1,
          converged: false,
          reason: 'derivative-zero',
          history
        };
      }

      x = x - fx / dfx;
      history.push(x);

      if (history.length > 1 && Math.abs(history[history.length - 1] - history[history.length - 2]) < tolerance) {
        return {
          root: x,
          iterations: i + 1,
          converged: true,
          history
        };
      }
    }

    return {
      root: x,
      iterations: maxIter,
      converged: false,
      reason: 'max-iterations',
      history
    };
  }

  /**
   * Bisection method for root finding
   * @param {Function} f - Function
   * @param {number} a - Lower bound
   * @param {number} b - Upper bound
   * @param {number} tolerance - Tolerance
   * @param {number} maxIter - Maximum iterations
   * @returns {Object} Root and iteration info
   */
  static bisection(f, a, b, tolerance = 0.0001, maxIter = 50) {
    let left = a;
    let right = b;
    const history = [];

    for (let i = 0; i < maxIter; i++) {
      const mid = (left + right) / 2;
      const fMid = f(mid);

      history.push(mid);

      if (Math.abs(fMid) < tolerance || Math.abs(right - left) < tolerance) {
        return {
          root: mid,
          iterations: i + 1,
          converged: true,
          history
        };
      }

      const fLeft = f(left);

      if (fLeft * fMid < 0) {
        right = mid;
      } else {
        left = mid;
      }
    }

    return {
      root: (left + right) / 2,
      iterations: maxIter,
      converged: false,
      reason: 'max-iterations',
      history
    };
  }

  /**
   * Numerical differentiation
   * @param {Function} f - Function
   * @param {number} x - Point
   * @param {number} h - Step size
   * @param {string} method - 'forward', 'backward', 'central'
   * @returns {number} Approximate derivative
   */
  static numericalDerivative(f, x, h = 0.0001, method = 'central') {
    switch (method) {
      case 'forward':
        return (f(x + h) - f(x)) / h;

      case 'backward':
        return (f(x) - f(x - h)) / h;

      case 'central':
      default:
        return (f(x + h) - f(x - h)) / (2 * h);
    }
  }

  /**
   * Trapezoidal rule for integration
   * @param {Function} f - Function
   * @param {number} a - Lower bound
   * @param {number} b - Upper bound
   * @param {number} n - Number of trapezoids
   * @returns {number} Integral approximation
   */
  static trapezoidal(f, a, b, n) {
    const h = (b - a) / n;
    let sum = (f(a) + f(b)) / 2;

    for (let i = 1; i < n; i++) {
      sum += f(a + i * h);
    }

    return h * sum;
  }

  /**
   * Simpson's rule for integration
   * @param {Function} f - Function
   * @param {number} a - Lower bound
   * @param {number} b - Upper bound
   * @param {number} n - Number of intervals (must be even)
   * @returns {number} Integral approximation
   */
  static simpsons(f, a, b, n) {
    if (n % 2 !== 0) n++; // Ensure even

    const h = (b - a) / n;
    let sum = f(a) + f(b);

    for (let i = 1; i < n; i++) {
      const x = a + i * h;
      const multiplier = i % 2 === 0 ? 2 : 4;
      sum += multiplier * f(x);
    }

    return (h / 3) * sum;
  }

  /**
   * Linear interpolation
   * @param {Array} points - Array of {x, y} points
   * @param {number} x - X value to interpolate
   * @returns {number} Interpolated y value
   */
  static linearInterpolation(points, x) {
    // Find surrounding points
    let i = 0;
    while (i < points.length - 1 && points[i + 1].x < x) {
      i++;
    }

    if (i === points.length - 1) {
      return points[i].y;
    }

    const x0 = points[i].x;
    const x1 = points[i + 1].x;
    const y0 = points[i].y;
    const y1 = points[i + 1].y;

    const t = (x - x0) / (x1 - x0);
    return y0 + t * (y1 - y0);
  }

  /**
   * Compute gradient at a point (for 2D functions)
   * @param {Function} f - Function of (x, y)
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} h - Step size
   * @returns {Object} Gradient vector {x, y}
   */
  static gradient(f, x, y, h = 0.0001) {
    const dfx = (f(x + h, y) - f(x - h, y)) / (2 * h);
    const dfy = (f(x, y + h) - f(x, y - h)) / (2 * h);

    return {
      x: dfx,
      y: dfy,
      magnitude: Math.sqrt(dfx * dfx + dfy * dfy),
      angle: Math.atan2(dfy, dfx)
    };
  }
}
