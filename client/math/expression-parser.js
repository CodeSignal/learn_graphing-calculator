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
   * Get all symbols from an expression (including variables x/y and parameters like a, b, etc.)
   * Excludes constants and function names, but includes all variable/parameter symbols.
   * @param {string} expression - Mathematical expression to analyze
   * @returns {string[]} Array of all symbol names found in expression
   */
  getAllSymbols(expression) {
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
   * Check if an expression is a parameter name (not x or y)
   * @param {string} expression - Expression string to check
   * @returns {{isParameter: boolean, paramName: string|null}} Result object
   */
  isParameter(expression) {
    if (!expression || typeof expression !== 'string') {
      return { isParameter: false, paramName: null };
    }

    const trimmed = expression.trim();
    if (!trimmed) {
      return { isParameter: false, paramName: null };
    }

    try {
      const node = math.parse(trimmed);

      // Check if it's just a SymbolNode (parameter)
      if (node.type === 'SymbolNode') {
        const paramName = node.name;

        // Reject reserved variables x and y
        if (paramName === 'x' || paramName === 'y') {
          return { isParameter: false, paramName: null };
        }

        // Check if it's a valid parameter name (not a constant or function)
        const constants = this._getConstants();
        if (constants.includes(paramName)) {
          return { isParameter: false, paramName: null };
        }

        return { isParameter: true, paramName };
      }

      return { isParameter: false, paramName: null };
    } catch (error) {
      // Parsing failed - not a parameter
      return { isParameter: false, paramName: null };
    }
  }

  /**
   * Parse assignment syntax - pure syntax detection without semantic filtering
   * Identifies assignment structure (lhs = rhs) regardless of symbol names
   * @param {string} expression - Expression string to check
   * @returns {{isAssignment: boolean, lhs: string|null, rhs: string|null}} Result object
   */
  parseAssignmentSyntax(expression) {
    if (!expression || typeof expression !== 'string') {
      return { isAssignment: false, lhs: null, rhs: null };
    }

    try {
      const trimmed = expression.trim();
      const node = math.parse(trimmed);

      // Check if root node is an AssignmentNode
      if (node.type !== 'AssignmentNode') {
        return { isAssignment: false, lhs: null, rhs: null };
      }

      // Extract left-hand side symbol name (should be a SymbolNode)
      let lhs = null;
      if (node.object && node.object.type === 'SymbolNode') {
        lhs = node.object.name;
      } else {
        // Not a simple assignment (e.g., array[index] = value)
        return { isAssignment: false, lhs: null, rhs: null };
      }

      // Extract right-hand side expression string
      let rhs = null;
      if (node.value) {
        // Get the string representation of the RHS
        rhs = node.value.toString();
      }

      return { isAssignment: true, lhs, rhs };
    } catch (error) {
      // Parsing failed - not an assignment or invalid expression
      return { isAssignment: false, lhs: null, rhs: null };
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

    return Array.from(variables).sort();
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
