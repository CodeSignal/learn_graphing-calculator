/**
 * ConfigLoader - Loads and validates activity configuration
 *
 * Handles loading config.json from file or direct injection by platform.
 * Validates config structure and provides helpful error messages.
 *
 * Config structure:
 * {
 *   functions: [{id: string, expression: string, editable?: boolean, visible?: boolean}],
 *   graph: {xMin: number, xMax: number, yMin: number, yMax: number, showGrid: boolean, showAxes: boolean, showLegend: boolean}
 * }
 *
 * Usage:
 *   const config = await ConfigLoader.load('./config.json');
 *   const config = ConfigLoader.fromObject(configObj);
 */

import EventBus from './event-bus.js';

class ConfigLoaderClass {
  constructor() {
    this.config = null;
    this.debug = false;
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

    // Validate functions array
    if (config.functions) {
      if (!Array.isArray(config.functions)) {
        throw new Error('Config.functions must be an array');
      }

      config.functions.forEach((func, index) => {
        if (!func.id) {
          throw new Error(`Function at index ${index} missing required field: id`);
        }
        if (!func.expression) {
          throw new Error(`Function at index ${index} missing required field: expression`);
        }
      });
    }

    // Validate graph object
    if (config.graph) {
      if (typeof config.graph !== 'object') {
        throw new Error('Config.graph must be an object');
      }

      const requiredGraphFields = ['xMin', 'xMax', 'yMin', 'yMax'];
      for (const field of requiredGraphFields) {
        if (typeof config.graph[field] !== 'number') {
          throw new Error(`Config.graph missing required numeric field: ${field}`);
        }
      }

      const booleanGraphFields = ['showGrid', 'showAxes', 'showLegend'];
      for (const field of booleanGraphFields) {
        if (config.graph[field] !== undefined && typeof config.graph[field] !== 'boolean') {
          throw new Error(`Config.graph.${field} must be a boolean`);
        }
      }
    }

    return true;
  }

  /**
   * Apply default values to config
   * @private
   */
  _applyDefaults(config) {
    const defaults = {
      functions: [],
      graph: {
        xMin: -10,
        xMax: 10,
        yMin: -10,
        yMax: 10,
        showGrid: true,
        showAxes: true,
        showLegend: true
      }
    };

    const processedConfig = { ...defaults, ...config };

    // Merge graph defaults
    if (processedConfig.graph) {
      processedConfig.graph = { ...defaults.graph, ...processedConfig.graph };
    }

    // Apply defaults to functions
    if (processedConfig.functions) {
      processedConfig.functions = processedConfig.functions.map((func, index) => {
        return {
          id: func.id || `f${index}`,
          color: this._getDefaultColor(index),
          visible: func.visible !== false,
          editable: func.editable !== false,
          ...func
        };
      });
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
}

// Create singleton instance
const ConfigLoader = new ConfigLoaderClass();

// Export for use in modules
export default ConfigLoader;

// Also make available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.ConfigLoader = ConfigLoader;
}
