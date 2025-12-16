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
      try {
        variables = this.detectVariables(expression);
      } catch (error) {
        // If variable detection fails, return error object
        return {
          expression,
          node: null,
          compiled: null,
          variables: [],
          usedVariables: [],
          isValid: false,
          error: error.message,
          evaluate: () => NaN,
          toLatex: () => expression,
          toString: () => expression
        };
      }
    }

    // Check cache
    const cacheKey = `${expression}:${variables.join(',')}`;

    if (this.cache.has(cacheKey)) {
      this.cacheHits++;
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
   * Check if an expression is just a single variable name (not x or y)
   * @param {string} expression - Expression string to check
   * @returns {{isVariable: boolean, varName: string|null}} Result object
   */
  isSingleVariable(expression) {
    if (!expression || typeof expression !== 'string') {
      return { isVariable: false, varName: null };
    }

    const trimmed = expression.trim();
    if (!trimmed) {
      return { isVariable: false, varName: null };
    }

    try {
      const node = math.parse(trimmed);

      // Check if it's just a SymbolNode (single variable)
      if (node.type === 'SymbolNode') {
        const varName = node.name;

        // Reject reserved variables x and y
        if (varName === 'x' || varName === 'y') {
          return { isVariable: false, varName: null };
        }

        // Check if it's a valid variable name (not a constant or function)
        const constants = this._getConstants();
        if (constants.includes(varName)) {
          return { isVariable: false, varName: null };
        }

        return { isVariable: true, varName };
      }

      return { isVariable: false, varName: null };
    } catch (error) {
      // Parsing failed - not a single variable
      return { isVariable: false, varName: null };
    }
  }

  /**
   * Check if an expression is a variable assignment using AST parsing
   * @param {string} expression - Expression string to check
   * @param {boolean} debug - Whether to log debug warnings
   * @returns {{isAssignment: boolean, varName: string|null, value: number|null}} Result object
   */
  isAssignmentExpression(expression, debug = false) {
    if (!expression || typeof expression !== 'string') {
      return { isAssignment: false, varName: null, value: null };
    }

    try {
      const node = math.parse(expression.trim());

      // Check if root node is an AssignmentNode
      if (node.type !== 'AssignmentNode') {
        return { isAssignment: false, varName: null, value: null };
      }

      // Extract variable name from left-hand side (should be a SymbolNode)
      let varName = null;
      if (node.object && node.object.type === 'SymbolNode') {
        varName = node.object.name;
      } else {
        // Not a simple variable assignment (e.g., array[index] = value)
        return { isAssignment: false, varName: null, value: null };
      }

      // Reject reserved variables x and y
      if (varName === 'x' || varName === 'y') {
        return { isAssignment: false, varName: null, value: null };
      }

      // Extract value from right-hand side
      let value = null;
      if (node.value) {
        if (node.value.type === 'ConstantNode') {
          // Direct constant (e.g., 5, -3.14)
          value = node.value.value;
        } else {
          // Try to evaluate the expression (e.g., 1 + 2, pi, sin(1))
          try {
            const compiled = node.value.compile();
            value = compiled.evaluate();
            // Ensure it's a finite number
            if (!isFinite(value) || isNaN(value)) {
              value = null;
            }
          } catch (e) {
            // Evaluation failed (e.g., contains variables)
            if (debug) {
              console.warn(`[ExpressionParser] Could not evaluate assignment value: ${expression}`, e);
            }
            return { isAssignment: false, varName: null, value: null };
          }
        }
      }

      // Only return success if we have both variable name and numeric value
      if (varName && value !== null && isFinite(value)) {
        return { isAssignment: true, varName, value };
      }

      return { isAssignment: false, varName: null, value: null };
    } catch (error) {
      // Parsing failed - not an assignment or invalid expression
      return { isAssignment: false, varName: null, value: null };
    }
  }

  /**
   * Get list of constant names that should be excluded from variable detection
   * @private
   * @returns {string[]} Array of constant names
   */
  _getConstants() {
    return ['e', 'pi', 'PI', 'E', 'i', 'Infinity', 'NaN', 'true', 'false'];
  }

  /**
   * Get list of function names that should be excluded from variable detection
   * @private
   * @returns {string[]} Array of function names
   */
  _getFunctions() {
    return [
      'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
      'sinh', 'cosh', 'tanh',
      'sqrt', 'abs', 'exp', 'log', 'log10', 'ln',
      'floor', 'ceil', 'round', 'sign',
      'min', 'max', 'pow'
    ];
  }

  /**
   * Extract variables from parsed expression
   * @private
   */
  _extractVariables(node) {
    const variables = new Set();
    const constants = this._getConstants();
    const functions = this._getFunctions();

    node.traverse((node, path, parent) => {
      if (node.type === 'SymbolNode') {
        // Exclude constants and function names
        if (!constants.includes(node.name) && !functions.includes(node.name)) {
          // Add the variable (function names are already excluded above)
          variables.add(node.name);
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

}
