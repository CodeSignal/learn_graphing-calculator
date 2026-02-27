import * as math from 'mathjs';

const CACHE_LIMIT = 200;
const cache = new Map();

const ERROR_MESSAGES = {
  empty: 'Expression is empty',
  missingX: 'Expression must include x',
  invalidAssignment: 'Invalid assignment (must be a number)',
  syntax: 'Syntax error'
};

const INEQUALITY_OPERATORS = ['>=', '<=', '>', '<'];

const cloneResult = (result) => ({
  kind: result.kind,
  graphMode: result.graphMode ?? null,
  paramName: result.paramName ?? null,
  value: result.value ?? null,
  error: result.error ?? null,
  usedVariables: Array.isArray(result.usedVariables)
    ? [...result.usedVariables]
    : [],
  plotExpression: result.plotExpression ?? null
});

const cacheResult = (key, result) => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
};

const buildVariableList = (usedSymbols) => {
  const variables = new Set(['x']);
  usedSymbols.forEach(symbol => {
    if (symbol !== 'y') {
      variables.add(symbol);
    }
  });
  return Array.from(variables);
};

const buildImplicitVariableList = (usedSymbols) => {
  const variables = new Set(['x', 'y']);
  usedSymbols.forEach(symbol => {
    if (symbol !== 'x' && symbol !== 'y') {
      variables.add(symbol);
    }
  });
  return Array.from(variables);
};

const mapParseError = (errorMessage) => {
  if (!errorMessage) return ERROR_MESSAGES.syntax;
  const normalized = errorMessage.toLowerCase();
  if (normalized.includes('must contain variable')) {
    return ERROR_MESSAGES.missingX;
  }
  return ERROR_MESSAGES.syntax;
};

const evaluateRHS = (rhsExpression, parser) => {
  if (!rhsExpression) {
    return { isValid: false, value: null };
  }

  try {
    const node = math.parse(rhsExpression);
    const compiled = node.compile();
    const value = compiled.evaluate({});
    if (isFinite(value) && !isNaN(value)) {
      return { isValid: true, value };
    }
    return { isValid: false, value: null };
  } catch (error) {
    return { isValid: false, value: null };
  }
};

const detectInequalityOperator = (str) => {
  const trimmed = str.trim();
  for (const op of INEQUALITY_OPERATORS) {
    const idx = trimmed.indexOf(op);
    if (idx >= 0) {
      return { op, idx };
    }
  }
  return null;
};

const tryParseImplicitEquation = (trimmed, parser) => {
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx <= 0 || eqIdx >= trimmed.length - 1) return null;

  const lhs = trimmed.slice(0, eqIdx).trim();
  const rhs = trimmed.slice(eqIdx + 1).trim();
  if (!lhs || !rhs) return null;

  const lhsVars = parser.getAllSymbols(lhs);
  const rhsVars = parser.getAllSymbols(rhs);
  const vars = [...new Set([...lhsVars, ...rhsVars])];

  const parsedLhs = parser.parse(lhs, buildImplicitVariableList(vars));
  const parsedRhs = parser.parse(rhs, buildImplicitVariableList(vars));
  if (!parsedLhs.isValid || !parsedRhs.isValid) return null;

  const hasX = vars.includes('x');
  const hasY = vars.includes('y');
  if (!hasX && !hasY) return null;

  return {
    plotExpression: `(${lhs}) - (${rhs})`,
    usedVariables: vars
  };
};

const classifyGraphExpression = (expression, parser) => {
  const usedVariables = parser.getAllSymbols(expression);

  if (usedVariables.includes('x') && usedVariables.includes('y')) {
    const parsed = parser.parse(expression, buildImplicitVariableList(usedVariables));
    if (!parsed.isValid) {
      return {
        kind: 'invalid',
        graphMode: null,
        error: mapParseError(parsed.error),
        usedVariables,
        plotExpression: null
      };
    }
    return {
      kind: 'graph',
      graphMode: 'implicit',
      error: null,
      usedVariables,
      plotExpression: expression
    };
  }

  if (usedVariables.includes('y') && !usedVariables.includes('x')) {
    return {
      kind: 'invalid',
      graphMode: null,
      error: 'y must be on the LHS',
      usedVariables,
      plotExpression: null
    };
  }

  const parsed = parser.parse(expression, buildVariableList(usedVariables));
  if (!parsed.isValid) {
    return {
      kind: 'invalid',
      graphMode: null,
      error: mapParseError(parsed.error),
      usedVariables,
      plotExpression: null
    };
  }

  if (!usedVariables.includes('x')) {
    return {
      kind: 'invalid',
      graphMode: null,
      error: ERROR_MESSAGES.missingX,
      usedVariables,
      plotExpression: null
    };
  }

  return {
    kind: 'graph',
    graphMode: 'explicit',
    error: null,
    usedVariables,
    plotExpression: expression
  };
};

export const classifyLine = (expression, parser) => {
  const raw = typeof expression === 'string' ? expression : '';
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      kind: 'empty',
      graphMode: null,
      error: ERROR_MESSAGES.empty,
      usedVariables: [],
      plotExpression: null
    };
  }

  const cacheKey = trimmed;
  if (cache.has(cacheKey)) {
    return cloneResult(cache.get(cacheKey));
  }

  let result;

  const inequalityOp = detectInequalityOperator(trimmed);
  if (inequalityOp) {
    result = {
      kind: 'graph',
      graphMode: 'inequality',
      error: null,
      usedVariables: [],
      plotExpression: null
    };
    cacheResult(cacheKey, result);
    return cloneResult(result);
  }

  const syntax = parser.parseAssignmentSyntax(trimmed);

  if (syntax.isAssignment) {
    const { lhs, rhs } = syntax;

    if (lhs === 'y') {
      const usedVariables = parser.getAllSymbols(rhs);
      if (usedVariables.includes('y')) {
        result = {
          kind: 'invalid',
          graphMode: null,
          error: 'Unknown symbol: y',
          usedVariables,
          plotExpression: null
        };
        cacheResult(cacheKey, result);
        return cloneResult(result);
      }

      const parsed = parser.parse(rhs, buildVariableList(usedVariables));
      if (!parsed.isValid) {
        result = {
          kind: 'invalid',
          graphMode: null,
          error: mapParseError(parsed.error),
          usedVariables,
          plotExpression: null
        };
        cacheResult(cacheKey, result);
        return cloneResult(result);
      }

      result = {
        kind: 'graph',
        graphMode: 'explicit',
        error: null,
        usedVariables,
        plotExpression: rhs
      };
      cacheResult(cacheKey, result);
      return cloneResult(result);
    }

    if (lhs === 'x') {
      const usedVariables = parser.getAllSymbols(rhs);
      if (usedVariables.includes('x')) {
        result = {
          kind: 'invalid',
          graphMode: null,
          error: ERROR_MESSAGES.invalidAssignment,
          usedVariables,
          plotExpression: null
        };
        cacheResult(cacheKey, result);
        return cloneResult(result);
      }

      const variables = usedVariables.includes('y')
        ? buildImplicitVariableList(usedVariables)
        : buildVariableList(usedVariables);
      const parsed = parser.parse(rhs, variables);
      if (!parsed.isValid) {
        result = {
          kind: 'invalid',
          graphMode: null,
          error: mapParseError(parsed.error),
          usedVariables,
          plotExpression: null
        };
        cacheResult(cacheKey, result);
        return cloneResult(result);
      }

      result = {
        kind: 'graph',
        graphMode: 'implicit',
        error: null,
        usedVariables,
        plotExpression: `x - (${rhs})`
      };
      cacheResult(cacheKey, result);
      return cloneResult(result);
    }

    const rhsEval = evaluateRHS(rhs, parser);
    if (!rhsEval.isValid) {
      result = {
        kind: 'invalid',
        graphMode: null,
        error: ERROR_MESSAGES.invalidAssignment,
        usedVariables: [],
        plotExpression: null
      };
      cacheResult(cacheKey, result);
      return cloneResult(result);
    }

    result = {
      kind: 'assignment',
      graphMode: null,
      paramName: lhs,
      value: rhsEval.value,
      error: null,
      usedVariables: [],
      plotExpression: null
    };
    cacheResult(cacheKey, result);
    return cloneResult(result);
  }

  const funcDef = parser.parseFunctionDefinitionSyntax(trimmed);
  if (funcDef.isFunctionDef) {
    // f(x) = expr with exactly 'x' as the sole parameter -> explicit graph
    if (funcDef.params.length === 1 && funcDef.params[0] === 'x' && funcDef.body !== null) {
      const bodyVars = parser.getAllSymbols(funcDef.body);

      if (bodyVars.includes('y')) {
        result = {
          kind: 'invalid',
          graphMode: null,
          error: 'Unknown symbol: y',
          usedVariables: bodyVars,
          plotExpression: null
        };
        cacheResult(cacheKey, result);
        return cloneResult(result);
      }

      const parsed = parser.parse(funcDef.body, buildVariableList(bodyVars));
      if (!parsed.isValid) {
        result = {
          kind: 'invalid',
          graphMode: null,
          error: mapParseError(parsed.error),
          usedVariables: bodyVars,
          plotExpression: null
        };
        cacheResult(cacheKey, result);
        return cloneResult(result);
      }

      result = {
        kind: 'graph',
        graphMode: 'explicit',
        error: null,
        usedVariables: bodyVars,
        plotExpression: funcDef.body
      };
      cacheResult(cacheKey, result);
      return cloneResult(result);
    }

    // Non-x parameter or multi-param defs: fall through to invalid
    result = {
      kind: 'invalid',
      graphMode: null,
      error: ERROR_MESSAGES.missingX,
      usedVariables: [],
      plotExpression: null
    };
    cacheResult(cacheKey, result);
    return cloneResult(result);
  }

  const implicitEq = tryParseImplicitEquation(trimmed, parser);
  if (implicitEq) {
    result = {
      kind: 'graph',
      graphMode: 'implicit',
      error: null,
      usedVariables: implicitEq.usedVariables,
      plotExpression: implicitEq.plotExpression
    };
    cacheResult(cacheKey, result);
    return cloneResult(result);
  }

  result = classifyGraphExpression(trimmed, parser);
  cacheResult(cacheKey, result);
  return cloneResult(result);
};
