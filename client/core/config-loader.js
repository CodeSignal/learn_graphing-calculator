/**
 * ConfigLoader - Loads and validates activity configuration
 *
 * Handles loading config.json from file or direct injection by platform.
 * Validates config structure and provides helpful error messages.
 *
 * Config structure:
 * {
 *   functions: [{id: string, expression: string, editable?: boolean, visible?: boolean}],
 *   graph: {xMin: number, xMax: number, yMin: number, yMax: number, showGrid: boolean}
 * }
 *
 * Usage:
 *   const config = await ConfigLoader.load('./config.json');
 *   const config = ConfigLoader.fromObject(configObj);
 */

import EventBus from './event-bus.js';
import { getColorForIndex } from '../utils/color-constants.js';

/**
 * Default viewport bounds used throughout the application
 * @constant {Object}
 */
export const DEFAULT_VIEWPORT_BOUNDS = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10
};

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

      const booleanGraphFields = ['showGrid'];
      for (const field of booleanGraphFields) {
        if (config.graph[field] !== undefined && typeof config.graph[field] !== 'boolean') {
          throw new Error(`Config.graph.${field} must be a boolean`);
        }
      }

      if (config.graph.annotations !== undefined) {
        if (!Array.isArray(config.graph.annotations)) {
          throw new Error('Config.graph.annotations must be an array');
        }

        config.graph.annotations.forEach((annotation, index) => {
          if (annotation.x === undefined && annotation.y === undefined) {
            throw new Error(`Annotation at index ${index} must have x or y`);
          }
          if (annotation.x !== undefined && typeof annotation.x !== 'number') {
            throw new Error(`Annotation at index ${index} x must be a number`);
          }
          if (annotation.y !== undefined && typeof annotation.y !== 'number') {
            throw new Error(`Annotation at index ${index} y must be a number`);
          }
          if (annotation.text !== undefined && typeof annotation.text !== 'string') {
            throw new Error(`Annotation at index ${index} text must be a string`);
          }
        });
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
        ...DEFAULT_VIEWPORT_BOUNDS,
        showGrid: true
      }
    };

    const processedConfig = { ...defaults, ...config };

    // Merge graph defaults
    if (processedConfig.graph) {
      processedConfig.graph = { ...defaults.graph, ...processedConfig.graph };
      // Ensure annotations is always an array
      if (!Array.isArray(processedConfig.graph.annotations)) {
        processedConfig.graph.annotations = [];
      }
    }

    // Apply defaults to functions
    if (processedConfig.functions) {
      processedConfig.functions = processedConfig.functions.map((func, index) => {
        const normalized = {
          id: func.id || `f${index}`,
          color: this._getDefaultColor(index),
          visible: func.visible !== false,
          editable: func.editable !== false,
          ...func
        };

        // Normalize derivative: must be an object; strip if invalid
        if (normalized.derivative !== undefined) {
          if (normalized.derivative !== null && typeof normalized.derivative === 'object') {
            normalized.derivative = { ...normalized.derivative };
          } else {
            delete normalized.derivative;
          }
        }

        // Normalize secants: must be an array of objects each with numeric x0
        if (normalized.secants !== undefined) {
          if (Array.isArray(normalized.secants)) {
            const validSecants = normalized.secants.filter(
              (s) => s !== null && typeof s === 'object' && typeof s.x0 === 'number'
            );
            normalized.secants = validSecants.length > 0 ? validSecants : undefined;
          } else {
            delete normalized.secants;
          }
        }

        return normalized;
      });
    }

    return processedConfig;
  }

  /**
   * Get default color for function based on index
   * @private
   */
  _getDefaultColor(index) {
    return getColorForIndex(index);
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
