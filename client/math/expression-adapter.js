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
