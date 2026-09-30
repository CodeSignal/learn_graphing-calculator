import * as math from 'mathjs';
import { toFunctionPlotSyntax } from './expression-adapter.js';

/**
 * Inequality boundary solver.
 *
 * An inequality boundary is the zero set of F(x, y) = (lhs) - (rhs). function-plot can only
 * draw an implicit zero set with its interval renderer, which emits one tiny sub-path per
 * pixel cell, so SVG `stroke-dasharray` restarts on every cell and a strict (dashed) boundary
 * looks solid. This module rewrites boundaries that are linear in y as an explicit curve
 * `y = f(x)`, and boundaries that are free of y and linear in x as a vertical line `x = c`,
 * both of which render as continuous (dashable) polylines. Anything else stays implicit.
 *
 * The symbolic work (parse, derivative, simplify) runs once per boundary and is cached; only
 * the scope-dependent checks run per render, so slider updates stay cheap.
 */

const CACHE_LIMIT = 200;
const COEFFICIENT_EPSILON = 1e-12;
const analysisCache = new Map();

const isFunctionName = (path, parent) => parent?.type === 'FunctionNode' && path === 'fn';

const collectSymbols = (node) => {
  const symbols = new Set();
  node.traverse((current, path, parent) => {
    if (current.type === 'SymbolNode' && !isFunctionName(path, parent)) {
      symbols.add(current.name);
    }
  });
  return symbols;
};

const substitute = (node, name, value) => node.transform((current, path, parent) => {
  if (current.type === 'SymbolNode' && current.name === name && !isFunctionName(path, parent)) {
    return new math.ConstantNode(value);
  }
  return current;
});

const dependsOnAxes = (node) => {
  const symbols = collectSymbols(node);
  return symbols.has('x') || symbols.has('y');
};

const isConstantZero = (node) => {
  if (collectSymbols(node).size > 0) {
    return false;
  }
  try {
    return node.evaluate() === 0;
  } catch (error) {
    return false;
  }
};

const simplifySafely = (node) => {
  try {
    return math.simplify(node);
  } catch (error) {
    return node;
  }
};

const compileNumeric = (node) => {
  const compiled = node.compile();
  return (scope) => {
    try {
      const value = compiled.evaluate({ ...(scope || {}) });
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    } catch (error) {
      return null;
    }
  };
};

// Plot text keeps explicit `*` so function-plot's evaluator never sees implicit products.
const toPlotText = (node) => toFunctionPlotSyntax(node.toString({ implicit: 'show' }));

const isUsableCoefficient = (value) => value !== null && Math.abs(value) > COEFFICIENT_EPSILON;

/**
 * `y <op> f(x)` or `f(x) <op> y`: reuse the other side verbatim, exactly as `y = f(x)` does.
 */
const analyzeIsolatedY = (plotData) => {
  const lhs = plotData.lhs.trim();
  const rhs = plotData.rhs.trim();
  const other = lhs === 'y' ? rhs : (rhs === 'y' ? lhs : null);
  if (other === null || collectSymbols(math.parse(other)).has('y')) {
    return null;
  }

  const fn = toFunctionPlotSyntax(other);
  return fn ? { type: 'explicit', fn, coefficient: () => 1 } : null;
};

/**
 * F = a*y + b(x) with a free of x and y  =>  y = -b(x) / a.
 * A y-coefficient that depends on x (e.g. x*y > 1) is rejected on purpose: where a(x) = 0 the
 * zero set can contain vertical components that an explicit curve would silently drop.
 */
const analyzeLinearInY = (boundary, coefficient) => {
  if (dependsOnAxes(coefficient)) {
    return null;
  }

  const intercept = substitute(boundary, 'y', 0);
  const solved = simplifySafely(new math.OperatorNode('/', 'divide', [
    new math.OperatorNode('-', 'unaryMinus', [new math.ParenthesisNode(intercept)]),
    new math.ParenthesisNode(coefficient)
  ]));

  return {
    type: 'explicit',
    fn: toPlotText(solved),
    coefficient: compileNumeric(coefficient)
  };
};

/**
 * G = a*x + b with a, b free of x and y  =>  x = -b / a (a vertical line).
 */
const analyzeLinearInX = (boundary) => {
  const coefficient = math.derivative(boundary, 'x');
  if (dependsOnAxes(coefficient)) {
    return null;
  }

  const offset = substitute(boundary, 'x', 0);
  if (dependsOnAxes(offset)) {
    return null;
  }

  return {
    type: 'vertical',
    coefficient: compileNumeric(coefficient),
    offset: compileNumeric(offset)
  };
};

const analyze = (plotData) => {
  const isolated = analyzeIsolatedY(plotData);
  if (isolated) {
    return isolated;
  }

  const boundary = math.parse(toFunctionPlotSyntax(plotData.boundaryExpression));
  if (!collectSymbols(boundary).has('y')) {
    return analyzeLinearInX(boundary);
  }

  const coefficient = math.derivative(boundary, 'y');
  if (isConstantZero(coefficient)) {
    // y cancels out (e.g. `x + y > y + 2`), so the boundary can only be vertical.
    return analyzeLinearInX(substitute(boundary, 'y', 0));
  }

  return analyzeLinearInY(boundary, coefficient);
};

const getAnalysis = (plotData) => {
  const key = plotData.boundaryExpression;
  if (analysisCache.has(key)) {
    const cached = analysisCache.get(key);
    analysisCache.delete(key);
    analysisCache.set(key, cached);
    return cached;
  }

  let analysis;
  try {
    analysis = analyze(plotData);
  } catch (error) {
    // Unparseable or non-differentiable boundaries keep the implicit rendering path.
    analysis = null;
  }

  analysisCache.set(key, analysis);
  if (analysisCache.size > CACHE_LIMIT) {
    analysisCache.delete(analysisCache.keys().next().value);
  }
  return analysis;
};

/**
 * Resolve how an inequality boundary can be drawn for the current parameter scope.
 *
 * @param {Object} plotData - Inequality `plotData` from LineClassifier
 *   (`{ type: 'inequality', lhs, rhs, boundaryExpression, ... }`).
 * @param {Object} scope - Current parameter values (e.g. `{ m: 2, b: 1 }`).
 * @returns {{ type: 'explicit', fn: string } | { type: 'vertical', x: number } | null}
 *   `explicit`: boundary is `y = fn(x)`; `fn` is function-plot syntax and may reference
 *   parameters (pass `scope` to the datum). `vertical`: boundary is the line `x = x`.
 *   `null`: the boundary is genuinely implicit (e.g. `x^2 + y^2 < 9`) or degenerate for this
 *   scope (e.g. a slider set the y-coefficient to 0); callers keep the implicit datum.
 */
export const resolveInequalityBoundary = (plotData, scope = {}) => {
  if (
    !plotData ||
    plotData.type !== 'inequality' ||
    typeof plotData.boundaryExpression !== 'string' ||
    typeof plotData.lhs !== 'string' ||
    typeof plotData.rhs !== 'string'
  ) {
    return null;
  }

  const analysis = getAnalysis(plotData);
  if (!analysis) {
    return null;
  }

  if (analysis.type === 'explicit') {
    return isUsableCoefficient(analysis.coefficient(scope))
      ? { type: 'explicit', fn: analysis.fn }
      : null;
  }

  const coefficient = analysis.coefficient(scope);
  const offset = analysis.offset(scope);
  if (!isUsableCoefficient(coefficient) || offset === null) {
    return null;
  }

  const x = -offset / coefficient;
  return Number.isFinite(x) ? { type: 'vertical', x } : null;
};
