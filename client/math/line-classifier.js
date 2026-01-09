import * as math from 'mathjs';

const CACHE_LIMIT = 200;
const cache = new Map();

const ERROR_MESSAGES = {
  empty: 'Expression is empty',
  missingX: 'Expression must include x',
  invalidAssignment: 'Invalid assignment (must be a number)',
  syntax: 'Syntax error'
};

// Special marker for vertical lines (x = constant)
export const VERTICAL_LINE_MARKER = '__VERTICAL__';

const cloneResult = (result) => ({
  kind: result.kind,
  paramName: result.paramName ?? null,
  value: result.value ?? null,
  error: result.error ?? null,
  usedVariables: Array.isArray(result.usedVariables)
    ? [...result.usedVariables]
    : [],
  plotExpression: result.plotExpression ?? null,
  verticalLineX: result.verticalLineX ?? null
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
    // Use math.js directly to parse and evaluate without requiring variables
    // This allows us to evaluate constants like "5", "pi", "1 + 2" without needing x
    const node = math.parse(rhsExpression);
    const compiled = node.compile();

    // Try to evaluate without any variables
    const value = compiled.evaluate({});
    if (isFinite(value) && !isNaN(value)) {
      return { isValid: true, value };
    }

    return { isValid: false, value: null };
  } catch (error) {
    // Evaluation failed (e.g., contains variables like x, y)
    return { isValid: false, value: null };
  }
};

const classifyGraphExpression = (expression, parser) => {
  const usedVariables = parser.getAllSymbols(expression);

  if (usedVariables.includes('y')) {
    return {
      kind: 'invalid',
      error: 'y must be on the LHS',
      usedVariables,
      plotExpression: null
    };
  }

  const parsed = parser.parse(expression, buildVariableList(usedVariables));
  if (!parsed.isValid) {
    return {
      kind: 'invalid',
      error: mapParseError(parsed.error),
      usedVariables,
      plotExpression: null
    };
  }

  if (!usedVariables.includes('x')) {
    return {
      kind: 'invalid',
      error: ERROR_MESSAGES.missingX,
      usedVariables,
      plotExpression: null
    };
  }

  return {
    kind: 'graph',
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

  // Check for assignment syntax first (using pure syntax detection)
  const syntax = parser.parseAssignmentSyntax(trimmed);

  if (syntax.isAssignment) {
    const { lhs, rhs } = syntax;

    // Case 1: y = expression → graph (horizontal line, can include parameters)
    if (lhs === 'y') {
      // For y = ..., we allow parameters in RHS (e.g., y = b, y = a * x)
      // Just need to ensure it parses as a valid expression
      const usedVariables = parser.getAllSymbols(rhs);
      if (usedVariables.includes('y')) {
        // y cannot appear on RHS
        result = {
          kind: 'invalid',
          error: 'Unknown symbol: y',
          usedVariables,
          plotExpression: null,
          verticalLineX: null
        };
        cacheResult(cacheKey, result);
        return cloneResult(result);
      }

      // Try to parse the RHS to ensure it's valid
      const parsed = parser.parse(rhs, buildVariableList(usedVariables));
      if (!parsed.isValid) {
        result = {
          kind: 'invalid',
          error: mapParseError(parsed.error),
          usedVariables,
          plotExpression: null,
          verticalLineX: null
        };
        cacheResult(cacheKey, result);
        return cloneResult(result);
      }

      result = {
        kind: 'graph',
        error: null,
        usedVariables,
        plotExpression: rhs,
        verticalLineX: null
      };
      cacheResult(cacheKey, result);
      return cloneResult(result);
    }

    // Case 2: x = constant → graph (vertical line)
    // Requires numeric RHS
    if (lhs === 'x') {
      const rhsEval = evaluateRHS(rhs, parser);
      if (!rhsEval.isValid) {
        result = {
          kind: 'invalid',
          error: ERROR_MESSAGES.invalidAssignment,
          usedVariables: [],
          plotExpression: null,
          verticalLineX: null
        };
        cacheResult(cacheKey, result);
        return cloneResult(result);
      }

      result = {
        kind: 'graph',
        error: null,
        usedVariables: [],
        plotExpression: VERTICAL_LINE_MARKER,
        verticalLineX: rhsEval.value
      };
      cacheResult(cacheKey, result);
      return cloneResult(result);
    }

    // Case 3: parameter assignment (lhs is not x or y)
    // Requires numeric RHS
    const rhsEval = evaluateRHS(rhs, parser);
    if (!rhsEval.isValid) {
      result = {
        kind: 'invalid',
        error: ERROR_MESSAGES.invalidAssignment,
        usedVariables: [],
        plotExpression: null,
        verticalLineX: null
      };
      cacheResult(cacheKey, result);
      return cloneResult(result);
    }

    result = {
      kind: 'assignment',
      paramName: lhs,
      value: rhsEval.value,
      error: null,
      usedVariables: [],
      plotExpression: null,
      verticalLineX: null
    };
    cacheResult(cacheKey, result);
    return cloneResult(result);
  }

  // Not an assignment - classify as graph expression
  result = classifyGraphExpression(trimmed, parser);
  cacheResult(cacheKey, result);
  return cloneResult(result);
};
