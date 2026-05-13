export const roundToStep = (value, step) => {
  if (!Number.isFinite(step) || step <= 0) {
    return value;
  }

  const scaled = value / step;
  return Math.round(scaled) * step;
};

export const getStepDecimals = (step) => {
  if (!Number.isFinite(step)) return 0;

  const stepString = step.toString();
  if (stepString.includes('e-')) {
    const parts = stepString.split('e-');
    return Number(parts[1]) || 0;
  }

  if (stepString.includes('.')) {
    return stepString.split('.')[1].length;
  }

  return 0;
};

export const formatParameterValue = (value, step) => {
  const decimals = getStepDecimals(step);
  const rounded = roundToStep(value, step);

  if (decimals === 0) {
    return `${Math.round(rounded)}`;
  }

  return rounded.toFixed(decimals);
};
