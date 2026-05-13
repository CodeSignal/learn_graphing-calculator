export const generateParameterAssignmentId = (paramName, existingFunctions = []) => {
  const baseId = `param_${paramName}`;
  const ids = new Set((existingFunctions || []).map((func) => func.id));

  if (!ids.has(baseId)) {
    return baseId;
  }

  let counter = 2;
  let candidateId = `${baseId}_${counter}`;

  while (ids.has(candidateId)) {
    counter += 1;
    candidateId = `${baseId}_${counter}`;
  }

  return candidateId;
};
