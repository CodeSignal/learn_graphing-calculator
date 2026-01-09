import { classifyLine } from './line-classifier.js';

export const analyzeParameters = (functions, parser) => {
  const definedParams = new Set();
  const usedParams = new Set();
  const assignmentValues = new Map();

  (functions || []).forEach(func => {
    const expression = func?.expression || '';
    const result = classifyLine(expression, parser);

    if (result.kind === 'assignment' && result.paramName) {
      definedParams.add(result.paramName);
      assignmentValues.set(result.paramName, result.value);
    }

    if (result.kind === 'graph' && Array.isArray(result.usedVariables)) {
      result.usedVariables.forEach(symbol => {
        if (symbol !== 'x' && symbol !== 'y') {
          usedParams.add(symbol);
        }
      });
    }
  });

  const missingAssignments = Array.from(usedParams).filter(
    paramName => !definedParams.has(paramName)
  );

  return {
    definedParams,
    usedParams,
    missingAssignments,
    assignmentValues
  };
};
