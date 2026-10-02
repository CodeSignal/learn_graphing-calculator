import * as math from 'mathjs';

/**
 * Grid evaluator for an inequality boundary function F(x, y) = (lhs) - (rhs).
 *
 * Region shading and implicit boundary tracing need F on every cell of a sampling grid
 * (~100k cells for a typical plot), and evaluating the whole math.js expression per cell costs
 * ~150 ns, i.e. ~15 ms per inequality per frame. Two things keep this cheap:
 *
 * 1. Separation. F is split at top-level `+`/`-` into terms that depend on x only, y only, or
 *    are products of such factors (`x*y`), so most work runs once per column/row:
 *
 *      F(x_i, y_j) = X[i] + Y[j] + sum_k PX_k[i] * PY_k[j] + sum_m G_m(x_i, y_j)
 *
 *    Only terms that genuinely mix x and y (`sin(x*y)`, `(x^2 + y^2)^2`) run per cell.
 * 2. A numeric fast path. Each term whose nodes are plain real arithmetic (`+ - * / ^`, unary
 *    minus, numbers, x, y, parameters, pi, e) and functions whose math.js number implementation
 *    is the same `Math.*` call (sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, exp, log with
 *    one argument, sqrt, abs) is also composed into plain closures over the AST (no code
 *    generation). When a closure returns a finite number it is the number math.js returns;
 *    otherwise (NaN from `sqrt(-1)`, which math.js turns into a Complex, an infinity, an
 *    unsupported node) the term is evaluated by math.js, so semantics stay exact.
 *
 * A non-number term value (e.g. a Complex) becomes NaN, and math.js never turns a Complex back
 * into a plain number under `+ - * /`, so the combined value is non-finite exactly when F's
 * would be. Only floating-point association can differ (~1e-16 relative), far below the 1e-9
 * inequality tolerance.
 *
 * The term analysis is cached per boundary expression; binding a parameter scope per render is
 * cheap.
 */

const CACHE_LIMIT = 200;
const analysisCache = new Map();

const FAST_FUNCTIONS = new Map([
  ['sin', Math.sin], ['cos', Math.cos], ['tan', Math.tan],
  ['asin', Math.asin], ['acos', Math.acos], ['atan', Math.atan],
  ['sinh', Math.sinh], ['cosh', Math.cosh], ['tanh', Math.tanh],
  ['exp', Math.exp], ['log', Math.log], ['sqrt', Math.sqrt], ['abs', Math.abs]
]);
const FAST_CONSTANTS = new Map([['pi', Math.PI], ['PI', Math.PI], ['e', Math.E], ['E', Math.E]]);

const hasOwn = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);

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

const unwrap = (node) => {
  let current = node;
  while (current && current.type === 'ParenthesisNode') {
    current = current.content;
  }
  return current;
};

const isOperator = (node, fn, arity) => node?.type === 'OperatorNode' &&
  node.fn === fn && node.args.length === arity;

/** Split a node at top-level `+`, `-`, unary `-` and unary `+` into signed terms. */
const collectTerms = (node, sign, out) => {
  const current = unwrap(node);
  if (isOperator(current, 'add', 2)) {
    collectTerms(current.args[0], sign, out);
    collectTerms(current.args[1], sign, out);
    return;
  }
  if (isOperator(current, 'subtract', 2)) {
    collectTerms(current.args[0], sign, out);
    collectTerms(current.args[1], -sign, out);
    return;
  }
  if (isOperator(current, 'unaryMinus', 1)) {
    collectTerms(current.args[0], -sign, out);
    return;
  }
  if (isOperator(current, 'unaryPlus', 1)) {
    collectTerms(current.args[0], sign, out);
    return;
  }
  out.push({ node: current, sign });
};

/**
 * Split a product/quotient chain into factors (`{ node, inverse }`, `inverse` marks
 * denominators) and fold unary minus signs into `out.sign`.
 */
const collectFactors = (node, inverse, out) => {
  const current = unwrap(node);
  if (isOperator(current, 'multiply', 2)) {
    collectFactors(current.args[0], inverse, out);
    collectFactors(current.args[1], inverse, out);
    return;
  }
  if (isOperator(current, 'divide', 2)) {
    collectFactors(current.args[0], inverse, out);
    collectFactors(current.args[1], !inverse, out);
    return;
  }
  if (isOperator(current, 'unaryMinus', 1)) {
    out.sign = -out.sign;
    collectFactors(current.args[0], inverse, out);
    return;
  }
  out.factors.push({ node: current, inverse });
};

const axesOf = (node) => {
  const symbols = collectSymbols(node);
  return { x: symbols.has('x'), y: symbols.has('y') };
};

const termOf = (node, extra = {}) => ({ node, compiled: node.compile(), ...extra });

/**
 * Classify the terms of F: `constant`, `x` and `y` terms depend on one axis (or none),
 * `products` hold per-axis factor lists, and `mixed` terms are evaluated per cell.
 */
const analyze = (boundaryExpression) => {
  const root = math.parse(boundaryExpression);
  const symbols = collectSymbols(root);
  symbols.delete('x');
  symbols.delete('y');

  const terms = [];
  collectTerms(root, 1, terms);

  const analysis = {
    parameters: Array.from(symbols).sort(),
    constant: [],
    x: [],
    y: [],
    products: [],
    mixed: []
  };

  terms.forEach(({ node, sign }) => {
    const axes = axesOf(node);
    if (!axes.x && !axes.y) {
      analysis.constant.push(termOf(node, { sign }));
      return;
    }
    if (axes.x !== axes.y) {
      analysis[axes.x ? 'x' : 'y'].push(termOf(node, { sign }));
      return;
    }

    const product = { sign: 1, factors: [] };
    collectFactors(node, false, product);
    const split = { x: [], y: [], constant: [] };
    const separable = product.factors.every((factor) => {
      const factorAxes = axesOf(factor.node);
      if (factorAxes.x && factorAxes.y) return false;
      const entry = termOf(factor.node, { inverse: factor.inverse });
      if (factorAxes.x) split.x.push(entry);
      else if (factorAxes.y) split.y.push(entry);
      else split.constant.push(entry);
      return true;
    });

    if (separable && split.x.length > 0 && split.y.length > 0) {
      analysis.products.push({ sign: sign * product.sign, ...split });
    } else {
      analysis.mixed.push(termOf(node, { sign }));
    }
  });

  return analysis;
};

const getAnalysis = (boundaryExpression) => {
  if (analysisCache.has(boundaryExpression)) {
    const cached = analysisCache.get(boundaryExpression);
    analysisCache.delete(boundaryExpression);
    analysisCache.set(boundaryExpression, cached);
    return cached;
  }

  let analysis;
  try {
    analysis = analyze(boundaryExpression);
  } catch (error) {
    analysis = null;
  }

  analysisCache.set(boundaryExpression, analysis);
  if (analysisCache.size > CACHE_LIMIT) {
    analysisCache.delete(analysisCache.keys().next().value);
  }
  return analysis;
};

/**
 * Compose a node into a `(x, y) => number` closure for plain real arithmetic, or return null
 * when any part of it is not supported (see the module comment). Parameter values are bound
 * at compile time.
 */
const compileFast = (node, scopeValues) => {
  const current = unwrap(node);
  switch (current?.type) {
    case 'ConstantNode': {
      const { value } = current;
      return typeof value === 'number' ? () => value : null;
    }
    case 'SymbolNode': {
      const { name } = current;
      if (name === 'x') return (x) => x;
      if (name === 'y') return (x, y) => y;
      if (hasOwn(scopeValues, name)) {
        const value = scopeValues[name];
        return typeof value === 'number' ? () => value : null;
      }
      if (FAST_CONSTANTS.has(name)) {
        const value = FAST_CONSTANTS.get(name);
        return () => value;
      }
      return null;
    }
    case 'OperatorNode': {
      const args = current.args.map((arg) => compileFast(arg, scopeValues));
      if (args.some((arg) => !arg)) return null;
      const [a, b] = args;
      switch (`${current.fn}/${args.length}`) {
        case 'add/2': return (x, y) => a(x, y) + b(x, y);
        case 'subtract/2': return (x, y) => a(x, y) - b(x, y);
        case 'multiply/2': return (x, y) => a(x, y) * b(x, y);
        case 'divide/2': return (x, y) => a(x, y) / b(x, y);
        case 'unaryMinus/1': return (x, y) => -a(x, y);
        case 'unaryPlus/1': return a;
        case 'pow/2':
          // Math.pow(NaN, 0) is 1; keep NaN so the math.js fallback decides.
          return (x, y) => {
            const base = a(x, y);
            const exponent = b(x, y);
            return Number.isNaN(base) || Number.isNaN(exponent) ? NaN : Math.pow(base, exponent);
          };
        default: return null;
      }
    }
    case 'FunctionNode': {
      const name = current.fn?.name;
      if (current.args.length !== 1 || !FAST_FUNCTIONS.has(name) || hasOwn(scopeValues, name)) {
        return null;
      }
      const fn = FAST_FUNCTIONS.get(name);
      const arg = compileFast(current.args[0], scopeValues);
      return arg ? (x, y) => fn(arg(x, y)) : null;
    }
    default:
      return null;
  }
};

const toNumber = (value) => (typeof value === 'number' ? value : NaN);

const createScope = (parameters, scopeValues) => {
  const scope = new Map();
  parameters.forEach((name) => {
    if (hasOwn(scopeValues, name)) {
      scope.set(name, scopeValues[name]);
    }
  });
  scope.set('x', 0);
  scope.set('y', 0);
  return scope;
};

/**
 * Compile the boundary function of an inequality for grid evaluation.
 *
 * @param {string} boundaryExpression - `(lhs) - (rhs)` from LineClassifier `plotData`.
 * @param {Object} scopeValues - Current parameter values (e.g. `{ r: 2 }`).
 * @returns {{
 *   key: string,
 *   evaluateGrid: (xs: ArrayLike<number>, ys: ArrayLike<number>) => Float64Array,
 *   evaluateAt: (x: number, y: number) => number
 * } | null}
 *   `evaluateGrid` returns F at every (xs[i], ys[j]) in row-major order
 *   (`values[j * xs.length + i]`); non-finite where F is undefined. `evaluateAt` returns the
 *   same values for single points. `key` identifies the expression together with the parameter
 *   values it uses (a cache key for callers). `null` when the expression cannot be parsed.
 */
export const compileInequalityField = (boundaryExpression, scopeValues = {}) => {
  if (typeof boundaryExpression !== 'string' || !boundaryExpression.trim()) {
    return null;
  }

  const analysis = getAnalysis(boundaryExpression);
  if (!analysis) {
    return null;
  }

  const scope = createScope(analysis.parameters, scopeValues);
  const key = `${boundaryExpression}|${analysis.parameters
    .map((name) => `${name}=${scope.has(name) ? scope.get(name) : ''}`)
    .join(',')}`;

  const bind = (term) => ({ ...term, fast: compileFast(term.node, scopeValues) });
  const constantTerms = analysis.constant.map(bind);
  const xTerms = analysis.x.map(bind);
  const yTerms = analysis.y.map(bind);
  const mixedTerms = analysis.mixed.map(bind);
  const products = analysis.products.map((product) => ({
    sign: product.sign,
    constant: product.constant.map(bind),
    x: product.x.map(bind),
    y: product.y.map(bind)
  }));

  // Value of one term at (x, y): the fast closure when it yields a finite number, else math.js.
  const termValue = (term, x, y) => {
    if (term.fast) {
      const value = term.fast(x, y);
      if (Number.isFinite(value)) return value;
    }
    scope.set('x', x);
    scope.set('y', y);
    try {
      return toNumber(term.compiled.evaluate(scope));
    } catch (error) {
      return NaN;
    }
  };
  const sumTerms = (terms, x, y) => {
    let total = 0;
    for (let i = 0; i < terms.length; i += 1) {
      total += terms[i].sign * termValue(terms[i], x, y);
    }
    return total;
  };
  const multiplyFactors = (factors, x, y, initial = 1) => {
    let value = initial;
    for (let i = 0; i < factors.length; i += 1) {
      const factor = termValue(factors[i], x, y);
      value = factors[i].inverse ? value / factor : value * factor;
    }
    return value;
  };
  const columnFactor = (product, x) => multiplyFactors(
    product.x,
    x,
    0,
    multiplyFactors(product.constant, 0, 0, product.sign)
  );
  const rowFactor = (product, y) => multiplyFactors(product.y, 0, y);

  // Same summation order as evaluateGrid, so both return identical values.
  const evaluateAt = (x, y) => {
    let value = (sumTerms(constantTerms, 0, 0) + sumTerms(xTerms, x, 0)) + sumTerms(yTerms, 0, y);
    for (let k = 0; k < products.length; k += 1) {
      value += columnFactor(products[k], x) * rowFactor(products[k], y);
    }
    if (mixedTerms.length > 0) {
      value += sumTerms(mixedTerms, x, y);
    }
    return value;
  };

  const evaluateGrid = (xs, ys) => {
    const cols = xs.length;
    const rows = ys.length;
    const values = new Float64Array(cols * rows);
    if (cols === 0 || rows === 0) {
      return values;
    }

    const constant = sumTerms(constantTerms, 0, 0);
    const columnValues = new Float64Array(cols);
    const columnFactors = products.map(() => new Float64Array(cols));
    for (let i = 0; i < cols; i += 1) {
      columnValues[i] = constant + sumTerms(xTerms, xs[i], 0);
      for (let k = 0; k < products.length; k += 1) {
        columnFactors[k][i] = columnFactor(products[k], xs[i]);
      }
    }

    const rowValues = new Float64Array(rows);
    const rowFactors = products.map(() => new Float64Array(rows));
    for (let j = 0; j < rows; j += 1) {
      rowValues[j] = sumTerms(yTerms, 0, ys[j]);
      for (let k = 0; k < products.length; k += 1) {
        rowFactors[k][j] = rowFactor(products[k], ys[j]);
      }
    }

    const hasMixed = mixedTerms.length > 0;
    const productCount = products.length;
    for (let j = 0; j < rows; j += 1) {
      const rowValue = rowValues[j];
      const y = ys[j];
      const offset = j * cols;
      for (let i = 0; i < cols; i += 1) {
        let value = columnValues[i] + rowValue;
        for (let k = 0; k < productCount; k += 1) {
          value += columnFactors[k][i] * rowFactors[k][j];
        }
        if (hasMixed) {
          value += sumTerms(mixedTerms, xs[i], y);
        }
        values[offset + i] = value;
      }
    }

    return values;
  };

  return { key, evaluateGrid, evaluateAt };
};

export default compileInequalityField;
