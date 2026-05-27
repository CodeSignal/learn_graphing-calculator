import * as math from 'mathjs';

const CACHE_LIMIT = 200;
const functionPlotCache = new Map();
const displayLatexCache = new Map();

const RELATIONAL_OPERATORS = ['<=', '>=', '<', '>', '='];

const RELATIONAL_LATEX = {
  '<=': '\\leq',
  '>=': '\\geq',
  '<': '<',
  '>': '>',
  '=': '='
};

const DELIMITER_OPENERS = {
  '(': 'paren',
  '[': 'bracket',
  '{': 'brace'
};

const DELIMITER_CLOSERS = {
  ')': 'paren',
  ']': 'bracket',
  '}': 'brace'
};

const readCache = (cache, key) => {
  if (!cache.has(key)) {
    return null;
  }

  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
};

const writeCache = (cache, key, value) => {
  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, value);

  if (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
};

const findTopLevelRelation = (expression) => {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];

    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth -= 1;
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth -= 1;
    if (char === '{') braceDepth += 1;
    if (char === '}') braceDepth -= 1;

    if (parenDepth > 0 || bracketDepth > 0 || braceDepth > 0) {
      continue;
    }

    const twoCharOperator = expression.slice(index, index + 2);
    if (twoCharOperator === '<=' || twoCharOperator === '>=') {
      return {
        operator: twoCharOperator,
        index,
        length: 2
      };
    }

    if (!RELATIONAL_OPERATORS.includes(char)) {
      continue;
    }

    if (char === '=') {
      const prev = expression[index - 1];
      const next = expression[index + 1];
      if (prev === '=' || next === '=') {
        continue;
      }
    }

    return {
      operator: char,
      index,
      length: 1
    };
  }

  return null;
};

const isTopLevel = (depth) => {
  return depth.paren === 0 && depth.bracket === 0 && depth.brace === 0;
};

const updateDelimiterDepth = (depth, char) => {
  const opened = DELIMITER_OPENERS[char];
  if (opened) {
    depth[opened] += 1;
    return true;
  }

  const closed = DELIMITER_CLOSERS[char];
  if (!closed) {
    return null;
  }

  if (depth[closed] === 0) {
    return false;
  }

  depth[closed] -= 1;
  return true;
};

const splitTuplePointParts = (expression) => {
  if (!expression.startsWith('(') || !expression.endsWith(')')) {
    return null;
  }

  const depth = { paren: 0, bracket: 0, brace: 0 };
  let commaIndex = -1;

  for (let index = 1; index < expression.length - 1; index += 1) {
    const char = expression[index];
    const delimiterUpdate = updateDelimiterDepth(depth, char);

    if (delimiterUpdate === false) {
      return null;
    }

    if (delimiterUpdate === true) {
      continue;
    }

    if (char !== ',' || !isTopLevel(depth)) {
      continue;
    }

    if (commaIndex !== -1) {
      return null;
    }

    commaIndex = index;
  }

  if (commaIndex === -1 || !isTopLevel(depth)) {
    return null;
  }

  const lhs = expression.slice(1, commaIndex).trim();
  const rhs = expression.slice(commaIndex + 1, -1).trim();

  if (!lhs || !rhs) {
    return null;
  }

  return { lhs, rhs };
};

const transformForFunctionPlot = (node) => {
  let changed = false;

  const transformed = node.transform((current) => {
    if (current.type === 'SymbolNode') {
      if (current.name === 'pi' || current.name === 'PI') {
        changed = true;
        return new math.SymbolNode('PI');
      }

      if (current.name === 'e' || current.name === 'E') {
        changed = true;
        return new math.SymbolNode('E');
      }
    }

    if (current.type === 'FunctionNode' &&
      current.fn?.type === 'SymbolNode' &&
      current.fn.name === 'ln') {
      changed = true;
      return new math.FunctionNode(new math.SymbolNode('log'), current.args);
    }

    return current;
  });

  return { transformed, changed };
};

const transformForDisplay = (node) => {
  return node.transform((current) => {
    if (current.type === 'SymbolNode' &&
      (current.name === 'pi' || current.name === 'PI')) {
      return new math.SymbolNode('pi');
    }

    if (current.type === 'FunctionNode' &&
      current.fn?.type === 'SymbolNode' &&
      current.fn.name === 'ln') {
      return new math.FunctionNode(new math.SymbolNode('log'), current.args);
    }

    return current;
  });
};

const convertSideToLatex = (sideExpression) => {
  const side = sideExpression.trim();
  if (!side) {
    return null;
  }

  try {
    const parsed = math.parse(side);
    const transformed = transformForDisplay(parsed);
    return transformed.toTex({ parenthesis: 'keep' });
  } catch (error) {
    return null;
  }
};

export const toFunctionPlotSyntax = (expression) => {
  if (typeof expression !== 'string') {
    return '';
  }

  const cached = readCache(functionPlotCache, expression);
  if (cached !== null) {
    return cached;
  }

  if (!expression.trim()) {
    writeCache(functionPlotCache, expression, expression);
    return expression;
  }

  try {
    const parsed = math.parse(expression);
    const { transformed, changed } = transformForFunctionPlot(parsed);
    const normalized = changed ? transformed.toString() : expression;
    writeCache(functionPlotCache, expression, normalized);
    return normalized;
  } catch (error) {
    writeCache(functionPlotCache, expression, expression);
    return expression;
  }
};

const derivativeCache = new Map();

/**
 * Symbolically differentiate a math expression with respect to x and return
 * the result normalized for function-plot syntax.
 * Returns null if the expression cannot be differentiated.
 *
 * @param {string} expression - Raw math expression (RHS only, e.g. "x^2 + a")
 * @returns {string|null} Derivative expression ready for function-plot, or null
 */
export const computeDerivative = (expression) => {
  if (typeof expression !== 'string' || !expression.trim()) {
    return null;
  }

  const cached = readCache(derivativeCache, expression);
  if (cached !== null) {
    return cached === '__null__' ? null : cached;
  }

  try {
    const parsed = math.parse(expression);
    const derivativeNode = math.derivative(parsed, 'x');
    const result = toFunctionPlotSyntax(derivativeNode.toString());
    writeCache(derivativeCache, expression, result);
    return result;
  } catch (error) {
    writeCache(derivativeCache, expression, '__null__');
    return null;
  }
};

export const toDisplayLatex = (expression) => {
  if (typeof expression !== 'string') {
    return '';
  }

  const cached = readCache(displayLatexCache, expression);
  if (cached !== null) {
    return cached;
  }

  const trimmed = expression.trim();
  if (!trimmed) {
    writeCache(displayLatexCache, expression, '');
    return '';
  }

  const tupleParts = splitTuplePointParts(trimmed);
  if (tupleParts) {
    const lhsLatex = convertSideToLatex(tupleParts.lhs);
    const rhsLatex = convertSideToLatex(tupleParts.rhs);

    if (lhsLatex && rhsLatex) {
      const tupleLatex = `\\left( ${lhsLatex}, ${rhsLatex} \\right)`;
      writeCache(displayLatexCache, expression, tupleLatex);
      return tupleLatex;
    }
  }

  const relation = findTopLevelRelation(trimmed);

  if (relation) {
    const lhs = trimmed.slice(0, relation.index);
    const rhs = trimmed.slice(relation.index + relation.length);
    const lhsLatex = convertSideToLatex(lhs);
    const rhsLatex = convertSideToLatex(rhs);

    if (!lhsLatex || !rhsLatex) {
      writeCache(displayLatexCache, expression, expression);
      return expression;
    }

    const relationLatex = RELATIONAL_LATEX[relation.operator] || relation.operator;
    const combined = `${lhsLatex} ${relationLatex} ${rhsLatex}`;
    writeCache(displayLatexCache, expression, combined);
    return combined;
  }

  const expressionLatex = convertSideToLatex(trimmed);
  if (!expressionLatex) {
    writeCache(displayLatexCache, expression, expression);
    return expression;
  }

  writeCache(displayLatexCache, expression, expressionLatex);
  return expressionLatex;
};
