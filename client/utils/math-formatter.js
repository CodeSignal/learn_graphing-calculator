/**
 * Math Formatter
 * Converts math.js expressions to LaTeX for beautiful rendering with KaTeX
 */

import katex from 'katex';
import ExpressionParser from '../math/expression-parser.js';

/**
 * Converts a math.js expression to LaTeX syntax
 * @param {string} expression - The math.js expression (e.g., "x^2 + 3*x - 1")
 * @returns {string} LaTeX formatted expression
 */
export function toLatex(expression) {
  if (!expression || typeof expression !== 'string') {
    return '';
  }

  let latex = expression;

  // Replace common functions
  latex = latex.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');
  latex = latex.replace(/abs\(([^)]+)\)/g, '|$1|');
  latex = latex.replace(/log\(([^)]+)\)/g, '\\log($1)');
  latex = latex.replace(/ln\(([^)]+)\)/g, '\\ln($1)');

  // Trigonometric functions
  latex = latex.replace(/sin\(([^)]+)\)/g, '\\sin($1)');
  latex = latex.replace(/cos\(([^)]+)\)/g, '\\cos($1)');
  latex = latex.replace(/tan\(([^)]+)\)/g, '\\tan($1)');
  latex = latex.replace(/sec\(([^)]+)\)/g, '\\sec($1)');
  latex = latex.replace(/csc\(([^)]+)\)/g, '\\csc($1)');
  latex = latex.replace(/cot\(([^)]+)\)/g, '\\cot($1)');

  // Inverse trigonometric functions
  latex = latex.replace(/asin\(([^)]+)\)/g, '\\arcsin($1)');
  latex = latex.replace(/acos\(([^)]+)\)/g, '\\arccos($1)');
  latex = latex.replace(/atan\(([^)]+)\)/g, '\\arctan($1)');

  // Replace multiplication (be careful to preserve function calls)
  // Only replace * when it's between variables/numbers, not in function names
  latex = latex.replace(/(\w+|\))(\s*)\*(\s*)(\w+|\()/g, '$1$2 \\cdot $3$4');

  // Replace division with fractions for simple cases
  // For now, keep division as-is to avoid complexity with nested operations
  latex = latex.replace(/\//g, ' / ');

  // Clean up any double spaces
  latex = latex.replace(/\s+/g, ' ').trim();

  return latex;
}

/**
 * Formats a complete function expression with signature
 * @param {string} id - Function identifier (e.g., "f", "g")
 * @param {string} expression - The math.js expression
 * @param {Array<string>|null} variables - Array of variable names (e.g., ["x"], ["x", "y"]). If null, will auto-detect.
 * @returns {string} Complete LaTeX expression (e.g., "f(x) = x^2 + 1")
 */
export function formatFunctionExpression(id, expression, variables = null) {
  // Auto-detect variables if not provided
  if (variables === null) {
    const parser = new ExpressionParser();
    try {
      variables = parser.detectVariables(expression);
    } catch (error) {
      // If detection fails, fall back to ['x'] for display purposes
      // (though this shouldn't happen if expressions are validated)
      console.warn(`[MathFormatter] Failed to detect variables, using ['x']: ${error.message}`);
      variables = ['x'];
    }
  }

  // Build the function signature
  const signature = `${id}(${variables.join(', ')})`;

  // Convert expression to LaTeX
  const latexExpression = toLatex(expression);

  // Return complete formatted expression
  return `${signature} = ${latexExpression}`;
}

/**
 * Renders a LaTeX expression to HTML using KaTeX
 * @param {string} latex - LaTeX expression
 * @param {HTMLElement} element - Target element to render into
 * @param {object} options - KaTeX rendering options
 */
export function renderLatex(latex, element, options = {}) {
  if (!katex || typeof katex.render !== 'function') {
    console.warn('KaTeX not loaded, falling back to plain text');
    element.textContent = latex;
    return;
  }

  try {
    katex.render(latex, element, {
      throwOnError: false,
      displayMode: false,
      ...options
    });
  } catch (error) {
    console.error('KaTeX rendering error:', error);
    element.textContent = latex;
  }
}

/**
 * Converts a LaTeX expression back to plain text for editing
 * Note: This is a simplified version - for complex expressions,
 * the user edits the original math.js syntax, not LaTeX
 * @param {string} latex - LaTeX expression
 * @returns {string} Plain text expression
 */
export function fromLatex(latex) {
  let plain = latex;

  // Remove LaTeX commands
  plain = plain.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
  plain = plain.replace(/\\log\(([^)]+)\)/g, 'log($1)');
  plain = plain.replace(/\\ln\(([^)]+)\)/g, 'ln($1)');

  // Trigonometric functions
  plain = plain.replace(/\\sin\(([^)]+)\)/g, 'sin($1)');
  plain = plain.replace(/\\cos\(([^)]+)\)/g, 'cos($1)');
  plain = plain.replace(/\\tan\(([^)]+)\)/g, 'tan($1)');
  plain = plain.replace(/\\arcsin\(([^)]+)\)/g, 'asin($1)');
  plain = plain.replace(/\\arccos\(([^)]+)\)/g, 'acos($1)');
  plain = plain.replace(/\\arctan\(([^)]+)\)/g, 'atan($1)');

  // Replace cdot with *
  plain = plain.replace(/\\cdot/g, '*');

  // Clean up spaces
  plain = plain.replace(/\s+/g, '');

  return plain;
}
