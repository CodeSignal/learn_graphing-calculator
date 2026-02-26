/**
 * Math Formatter
 * Converts math.js expressions to LaTeX for beautiful rendering with KaTeX
 */

import katex from 'katex';
import sharedParser from '../math/shared-parser.js';
import { toDisplayLatex } from '../math/expression-adapter.js';

/**
 * Converts a math.js expression to LaTeX syntax
 * @param {string} expression - The math.js expression (e.g., "x^2 + 3*x - 1")
 * @returns {string} LaTeX formatted expression
 */
export function toLatex(expression) {
  if (!expression || typeof expression !== 'string') {
    return '';
  }

  return toDisplayLatex(expression);
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
    try {
      variables = sharedParser.detectVariables(expression);
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
