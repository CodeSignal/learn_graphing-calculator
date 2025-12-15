import * as math from 'mathjs';

/**
 * ExpressionParser - Wraps math.js for expression parsing and validation
 *
 * Parses mathematical expressions into syntax trees that can be evaluated.
 * Handles validation, error checking, and caching for performance.
 *
 * Supported functions:
 * - Algebraic: x^2, sqrt(x), abs(x)
 * - Trigonometric: sin(x), cos(x), tan(x)
 * - Exponential: exp(x), log(x), ln(x)
 * - Special: floor(x), ceil(x), round(x)
 *
 * Usage:
 *   const parser = new ExpressionParser();
 *   const parsed = parser.parse('x^2 + 3*x - 5');
 *   const value = parsed.evaluate({ x: 2 });
 */

export default class ExpressionParser {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 100;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.debug = false;
  }

  /**
   * Detect variables from an expression (only x and y)
   * @param {string} expression - Mathematical expression to analyze
   * @returns {string[]} Array of detected variables ['x'] or ['x', 'y']
   * @throws {Error} If expression doesn't contain 'x'
   */
  detectVariables(expression) {
    if (!expression || typeof expression !== 'string') {
      throw new Error('Expression must be a non-empty string');
    }

    try {
      const node = math.parse(expression);
      const allSymbols = this._extractVariables(node);

      // Filter to only x and y
      const variables = allSymbols.filter(v => v === 'x' || v === 'y');

      // Require x to always be present
      if (!variables.includes('x')) {
        throw new Error(`Expression "${expression}" must contain variable 'x'`);
      }

      // Return sorted: ['x'] or ['x', 'y']
      return variables.includes('y') ? ['x', 'y'] : ['x'];
    } catch (error) {
      if (error.message.includes('must contain variable')) {
        throw error;
      }
      throw new Error(`Failed to detect variables in expression "${expression}": ${error.message}`);
    }
  }

  /**
   * Parse an expression string
   * @param {string} expression - Mathematical expression to parse
   * @param {string[]} variables - Expected variables (optional, will auto-detect if not provided)
   * @returns {Object} Parsed expression object
   */
  parse(expression, variables = null) {
    if (!expression || typeof expression !== 'string') {
      throw new Error('Expression must be a non-empty string');
    }

    // Auto-detect variables if not provided
    if (variables === null) {
      variables = this.detectVariables(expression);
    }

    // Check cache
    const cacheKey = `${expression}:${variables.join(',')}`;

    if (this.cache.has(cacheKey)) {
      this.cacheHits++;
      if (this.debug) {
        console.log(`[ExpressionParser] Cache hit for: ${expression}`);
      }
      return this.cache.get(cacheKey);
    }

    this.cacheMisses++;

    try {
      // Parse expression using math.js
      const node = math.parse(expression);

      // Validate variables
      const usedVariables = this._extractVariables(node);
      const unknownVars = usedVariables.filter(v => !variables.includes(v));

      if (unknownVars.length > 0) {
        console.warn(`[ExpressionParser] Unknown variables in expression: ${unknownVars.join(', ')}`);
      }

      // Compile for faster evaluation
      const compiled = node.compile();

      const parsed = {
        expression,
        node,
        compiled,
        variables,
        usedVariables,
        isValid: true,
        error: null,

        /**
         * Evaluate the expression with given variable values
         * @param {Object} scope - Variable values (e.g., { x: 5, y: 3 })
         * @returns {number} Result
         */
        evaluate: (scope = {}) => {
          try {
            return compiled.evaluate(scope);
          } catch (error) {
            console.error(`[ExpressionParser] Evaluation error for "${expression}":`, error);
            return NaN;
          }
        },

        /**
         * Get LaTeX representation (if available)
         * @returns {string} LaTeX string
         */
        toLatex: () => {
          try {
            return node.toTex ? node.toTex() : expression;
          } catch (error) {
            return expression;
          }
        },

        /**
         * Get string representation
         * @returns {string} String representation
         */
        toString: () => {
          return node.toString();
        }
      };

      // Add to cache
      this._addToCache(cacheKey, parsed);

      if (this.debug) {
        console.log(`[ExpressionParser] Parsed successfully: ${expression}`);
      }

      return parsed;
    } catch (error) {
      console.error(`[ExpressionParser] Parse error for "${expression}":`, error);

      return {
        expression,
        node: null,
        compiled: null,
        variables,
        usedVariables: [],
        isValid: false,
        error: error.message,
        evaluate: () => NaN,
        toLatex: () => expression,
        toString: () => expression
      };
    }
  }

  /**
   * Validate an expression without parsing
   * @param {string} expression - Expression to validate
   * @returns {Object} Validation result { isValid, error }
   */
  validate(expression) {
    try {
      math.parse(expression);
      return { isValid: true, error: null };
    } catch (error) {
      return { isValid: false, error: error.message };
    }
  }

  /**
   * Simplify an expression
   * @param {string} expression - Expression to simplify
   * @returns {string} Simplified expression
   */
  simplify(expression) {
    try {
      const node = math.parse(expression);
      const simplified = math.simplify(node);
      return simplified.toString();
    } catch (error) {
      console.error(`[ExpressionParser] Simplify error for "${expression}":`, error);
      return expression;
    }
  }

  /**
   * Get all variables from an expression (including parameters like a, b, etc.)
   * Excludes constants and function names, but includes all variable symbols.
   * @param {string} expression - Mathematical expression to analyze
   * @returns {string[]} Array of all variable names found in expression
   */
  getAllVariables(expression) {
    if (!expression || typeof expression !== 'string') {
      return [];
    }

    try {
      const node = math.parse(expression);
      return this._extractVariables(node);
    } catch (error) {
      // If parsing fails, return empty array
      return [];
    }
  }

  /**
   * Extract variables from parsed expression
   * @private
   */
  _extractVariables(node) {
    const variables = new Set();

    node.traverse((node, path, parent) => {
      if (node.type === 'SymbolNode') {
        // Exclude constants and function names
        const constants = ['e', 'pi', 'PI', 'E', 'i', 'Infinity', 'NaN', 'true', 'false'];
        const functions = [
          'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
          'sinh', 'cosh', 'tanh',
          'sqrt', 'abs', 'exp', 'log', 'log10', 'ln',
          'floor', 'ceil', 'round', 'sign',
          'min', 'max', 'pow'
        ];

        if (!constants.includes(node.name) && !functions.includes(node.name)) {
          // Check if it's not a function call
          if (!parent || parent.type !== 'FunctionNode') {
            variables.add(node.name);
          }
        }
      }
    });

    return Array.from(variables);
  }

  /**
   * Add parsed expression to cache
   * @private
   */
  _addToCache(key, parsed) {
    // Implement LRU cache
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, parsed);
  }

  /**
   * Clear expression cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;

    if (this.debug) {
      console.log('[ExpressionParser] Cache cleared');
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0
    };
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether debug mode should be enabled
   */
  setDebug(enabled) {
    this.debug = enabled;
  }

  /**
   * Check if math.js is available and working
   * @returns {boolean} Whether math.js is available
   */
  static isAvailable() {
    try {
      return typeof math !== 'undefined' && typeof math.parse === 'function';
    } catch {
      return false;
    }
  }

  /**
   * Get list of supported functions
   * @returns {string[]} Array of function names
   */
  static getSupportedFunctions() {
    return [
      // Trigonometric
      'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
      'asin', 'acos', 'atan', 'atan2',
      'sinh', 'cosh', 'tanh',

      // Exponential and logarithmic
      'exp', 'log', 'log10', 'log2', 'ln',

      // Powers and roots
      'sqrt', 'cbrt', 'pow', 'square', 'cube',

      // Rounding
      'floor', 'ceil', 'round', 'fix',

      // Absolute and sign
      'abs', 'sign',

      // Min/max
      'min', 'max',

      // Special
      'factorial', 'gamma'
    ];
  }

  /**
   * Get list of supported constants
   * @returns {Object} Object with constant names and values
   */
  static getSupportedConstants() {
    return {
      e: Math.E,
      pi: Math.PI,
      PI: Math.PI,
      tau: 2 * Math.PI,
      phi: (1 + Math.sqrt(5)) / 2, // Golden ratio
      E: Math.E,
      LN2: Math.LN2,
      LN10: Math.LN10,
      LOG2E: Math.LOG2E,
      LOG10E: Math.LOG10E,
      SQRT1_2: Math.SQRT1_2,
      SQRT2: Math.SQRT2
    };
  }
}
