/**
 * Default configuration for the Graphing Calculator
 */
export default {
  // Plotting graph configuration
  graph: {
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    showGrid: true,
    showAxes: true,
    showLegend: true
  },

  // Initial expressions
  functions: [
    {
      id: 'expr_1',
      expression: 'sin(x)',
      visible: true
    },
    {
      id: 'expr_2',
      expression: 'x^2 / 4',
      visible: true
    }
  ],
};
