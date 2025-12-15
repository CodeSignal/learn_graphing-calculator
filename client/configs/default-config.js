/**
 * Default configuration for the Graphing Calculator
 */
export default {
  // Activity configuration
  activity: {
    title: 'Graphing Calculator',
    version: '1.0.0'
  },

  // Viewport configuration
  viewport: {
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    gridEnabled: true,
    axesEnabled: true
  },

  // Initial expressions
  functions: [
    {
      id: 'expr_1',
      expression: 'sin(x)',
      color: '#4A90E2', // Blue
      visible: true
    },
    {
      id: 'expr_2',
      expression: 'x^2 / 4',
      color: '#50E3C2', // Teal
      visible: true
    }
  ],

  // Control definitions (sliders will be dynamically added here based on parsing)
  controls: []
};
