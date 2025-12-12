/**
 * ConfigLoader - Loads and validates activity configuration
 *
 * Handles loading config.json from file or direct injection by platform.
 * Validates config structure and provides helpful error messages.
 *
 * Config structure:
 * {
 *   topic: "functions" | "limits" | "derivatives" | "integrals" | "multivariate" | "gradients",
 *   title: string,
 *   description: string,
 *   functions: [],
 *   controls: [],
 *   visualElements: []
 * }
 *
 * Usage:
 *   const config = await ConfigLoader.load('./config.json');
 *   const config = ConfigLoader.fromObject(configObj);
 */

import EventBus from './event-bus.js';
import ExpressionParser from '../math/expression-parser.js';

class ConfigLoaderClass {
  constructor() {
    this.config = null;
    this.debug = false;
    this.parser = new ExpressionParser();
  }

  /**
   * Load config from file
   * @param {string} path - Path to config.json
   * @returns {Promise<Object>} Validated config object
   */
  async load(path = './configs/config.json') {
    try {
      if (this.debug) {
        console.log(`[ConfigLoader] Loading config from '${path}'`);
      }

      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.statusText}`);
      }

      const config = await response.json();

      return this.fromObject(config);
    } catch (error) {
      console.error('[ConfigLoader] Error loading config:', error);
      throw error;
    }
  }

  /**
   * Load config from object (e.g., platform injection)
   * @param {Object} config - Config object
   * @returns {Object} Validated config object
   */
  fromObject(config) {
    try {
      if (this.debug) {
        console.log('[ConfigLoader] Loading config from object');
      }

      // Validate config
      this.validate(config);

      // Apply defaults
      const processedConfig = this._applyDefaults(config);

      // Store config
      this.config = processedConfig;

      if (this.debug) {
        console.log('[ConfigLoader] Config loaded successfully:', processedConfig);
      }

      EventBus.publish('config:loaded', processedConfig);

      return processedConfig;
    } catch (error) {
      console.error('[ConfigLoader] Error processing config:', error);
      throw error;
    }
  }

  /**
   * Validate config structure
   * @param {Object} config - Config to validate
   * @throws {Error} If validation fails
   */
  validate(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Config must be an object');
    }

    // Required fields
    if (!config.topic) {
      throw new Error('Config missing required field: topic');
    }

    const validTopics = ['functions', 'limits', 'derivatives', 'integrals'];

    if (!validTopics.includes(config.topic)) {
      throw new Error(`Invalid topic: ${config.topic}. Must be one of: ${validTopics.join(', ')}`);
    }

    // Validate functions array
    if (config.functions) {
      if (!Array.isArray(config.functions)) {
        throw new Error('Config.functions must be an array');
      }

      config.functions.forEach((func, index) => {
        if (!func.expression) {
          throw new Error(`Function at index ${index} missing required field: expression`);
        }
      });
    }

    // Validate controls array
    if (config.controls) {
      if (!Array.isArray(config.controls)) {
        throw new Error('Config.controls must be an array');
      }

      config.controls.forEach((control, index) => {
        this._validateControl(control, index);
      });
    }

    // Validate visual elements array
    if (config.visualElements) {
      if (!Array.isArray(config.visualElements)) {
        throw new Error('Config.visualElements must be an array');
      }

      config.visualElements.forEach((element, index) => {
        this._validateVisualElement(element, index);
      });
    }

    return true;
  }

  /**
   * Validate a control configuration
   * @private
   */
  _validateControl(control, index) {
    if (!control.type) {
      throw new Error(`Control at index ${index} missing required field: type`);
    }

    const validTypes = ['slider', 'input', 'toggle', 'dropdown', 'draggable-point', 'button'];

    if (!validTypes.includes(control.type)) {
      throw new Error(`Control at index ${index} has invalid type: ${control.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Type-specific validation
    switch (control.type) {
      case 'slider':
        if (control.min === undefined || control.max === undefined) {
          throw new Error(`Slider control at index ${index} missing required fields: min, max`);
        }
        if (control.min >= control.max) {
          throw new Error(`Slider control at index ${index} has invalid range: min must be less than max`);
        }
        break;

      case 'dropdown':
        if (!control.options || !Array.isArray(control.options)) {
          throw new Error(`Dropdown control at index ${index} missing required field: options (array)`);
        }
        break;
    }
  }

  /**
   * Validate a visual element configuration
   * @private
   */
  _validateVisualElement(element, index) {
    if (!element.type) {
      throw new Error(`Visual element at index ${index} missing required field: type`);
    }

    const validTypes = [
      'tangent-line',
      'secant-line',
      'riemann-sum',
      'point-marker',
      'vertical-line',
      'horizontal-line',
      'annotation',
      'approaching-point'
    ];

    if (!validTypes.includes(element.type)) {
      throw new Error(`Visual element at index ${index} has invalid type: ${element.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate references (array indices)
    if (element.linkedTo !== undefined && typeof element.linkedTo !== 'number') {
      throw new Error(`Visual element at index ${index} has invalid linkedTo: must be a number (array index)`);
    }

    if (element.pointControl !== undefined && typeof element.pointControl !== 'number') {
      throw new Error(`Visual element at index ${index} has invalid pointControl: must be a number (array index)`);
    }
  }

  /**
   * Apply default values to config
   * @private
   */
  _applyDefaults(config) {
    const defaults = {
      title: 'Calculus Activity',
      description: '',
      functions: [],
      controls: [],
      visualElements: [],
      viewWindow: {
        xMin: -10,
        xMax: 10,
        yMin: -10,
        yMax: 10
      },
      gridLines: true,
      axes: true,
      legend: true
    };

    const processedConfig = { ...defaults, ...config };

    // Apply defaults to controls
    if (processedConfig.controls) {
      processedConfig.controls = processedConfig.controls.map((control, index) => ({
        id: control.id || `control_${index}`,
        label: control.label || `Control ${index + 1}`,
        ...control
      }));
    }

    // Apply defaults to functions
    if (processedConfig.functions) {
      processedConfig.functions = processedConfig.functions.map((func, index) => {
        // Auto-detect variables from expression
        let variables;
        if (func.variables) {
          // If variables are explicitly provided, use them (for backwards compatibility)
          variables = func.variables;
        } else {
          // Auto-detect variables from expression
          try {
            variables = this.parser.detectVariables(func.expression);
          } catch (error) {
            throw new Error(`Function at index ${index} (${func.id || `f${index}`}): ${error.message}`);
          }
        }

        return {
          id: func.id || `f${index}`,
          variables,
          color: this._getDefaultColor(index),
          visible: func.visible !== false,
          editable: func.editable !== false,
          ...func
        };
      });
    }

    // Apply defaults to visual elements
    if (processedConfig.visualElements) {
      processedConfig.visualElements = processedConfig.visualElements.map(element => ({
        visible: element.visible !== false,
        ...element
      }));
    }

    return processedConfig;
  }

  /**
   * Get default color for function based on index
   * @private
   */
  _getDefaultColor(index) {
    const colors = [
      '#1062fb', // Blue - functions
      '#ff6b35', // Orange - derivatives
      '#10b981', // Green - integrals
      '#8b5cf6', // Purple - gradients
      '#f59e0b'  // Yellow - extras
    ];

    return colors[index % colors.length];
  }

  /**
   * Get current config
   * @returns {Object} Current config
   */
  getConfig() {
    return this.config;
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether debug mode should be enabled
   */
  setDebug(enabled) {
    this.debug = enabled;
  }

  /**
   * Create a sample config for testing
   * @param {string} topic - Topic name
   * @returns {Object} Sample config
   */
  createSample(topic = 'functions') {
    const samples = {
      functions: {
        topic: 'functions',
        title: 'Function Explorer',
        description: 'Explore how functions behave with different transformations',
        functions: [
          {
            expression: 'x^2'
          }
        ],
        controls: [
          {
            type: 'slider',
            id: 'a',
            label: 'Vertical Stretch (a)',
            min: -3,
            max: 3,
            step: 0.1,
            default: 1
          },
          {
            type: 'slider',
            id: 'h',
            label: 'Horizontal Shift (h)',
            min: -5,
            max: 5,
            step: 0.1,
            default: 0
          }
        ],
        visualElements: []
      },

      limits: {
        topic: 'limits',
        title: 'Limits Explorer',
        description: 'Explore how functions approach limit points',
        functions: [
          {
            expression: '(x^2 - 4)/(x - 2)'
          }
        ],
        controls: [
          {
            type: 'slider',
            id: 'approach-point',
            label: 'Approach x =',
            min: -5,
            max: 5,
            step: 0.1,
            default: 2
          },
          {
            type: 'slider',
            id: 'delta',
            label: 'Delta (δ)',
            min: 0.01,
            max: 2,
            step: 0.01,
            default: 0.5
          }
        ],
        visualElements: [
          {
            type: 'approaching-point',
            linkedTo: 0,
            pointControl: 0
          },
          {
            type: 'vertical-line',
            xControl: 0
          }
        ]
      }
    };

    return samples[topic] || samples.functions;
  }
}

// Create singleton instance
const ConfigLoader = new ConfigLoaderClass();

// Export for use in modules
export default ConfigLoader;

// Also make available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.ConfigLoader = ConfigLoader;
}
