/**
 * StateManager - Centralized state management
 *
 * Manages all application state. EventBus handles all notifications for state changes.
 * Components should subscribe to EventBus events (e.g., 'state:changed:functions') rather
 * than using StateManager subscriptions.
 *
 * State structure:
 * {
 *   config: {},           // Activity configuration (functions, graph)
 *   parameters: {},       // Runtime parameter values + slider metadata
 *   functions: [],        // Function expressions
 *   graph: {},           // Graph viewport and display settings
 *   status: 'ready'       // Application status
 * }
 *
 * Usage:
 *   StateManager.set('parameters.m.value', 5);
 *   const value = StateManager.get('parameters.m.value');
 *   // Subscribe to changes via EventBus:
 *   // EventBus.subscribe('state:changed:parameters.m', (data) => console.log(data.value));
 */

import EventBus from './event-bus.js';

class StateManagerClass {
  constructor() {
    this.state = {
      config: null,
      parameters: {},
      functions: [],
      status: 'initializing',
      errors: []
    };

    this.history = [];
    this.maxHistory = 50;
    this.debug = false;
  }

  /**
   * Initialize state with config
   * @param {Object} config - Activity configuration
   */
  initialize(config) {
    this.state.config = config;
    this.state.status = 'ready';

    // Store graph config at top level for easy access
    if (config.graph) {
      this.state.graph = { ...config.graph };
    }

    // Initialize functions
    if (config.functions) {
      this.state.functions = config.functions.map(f => ({
        ...f,
        parsed: null,
        error: null
      }));
    }

    // Note: parameters are runtime state, dynamically created by GraphEngine
    // from expression variables (e.g., 'm', 'b' in 'm*x + b')

    if (this.debug) {
      console.log('[StateManager] Initialized with config:', config);
    }

    EventBus.publish('state:initialized', this.state);
  }

  /**
   * Get state value at path
   * @param {string} path - Dot-separated path (e.g., 'parameters.m.value')
   * @returns {*} Value at path
   */
  get(path) {
    if (!path) {
      return this.state;
    }

    const keys = path.split('.');
    let value = this.state;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  /**
   * Get parameter values as a plain scope object for evaluation
   * @returns {Object} Map of parameter names to numeric values
   */
  getControlValues() {
    const parameters = this.get('parameters') || {};
    return Object.fromEntries(
      Object.entries(parameters)
        .filter(([, value]) => typeof value?.value === 'number')
        .map(([key, value]) => [key, value.value])
    );
  }

  /**
   * Set state value at path
   * @param {string} path - Dot-separated path
   * @param {*} value - New value
   * @param {Object} options - Optional configuration
   * @param {boolean} options.silent - Don't emit events
   * @param {boolean} options.merge - Merge objects instead of replace
   */
  set(path, value, options = {}) {
    const oldValue = this.get(path);

    // Don't update if value hasn't changed (unless it's an object)
    if (oldValue === value && typeof value !== 'object') {
      return;
    }

    // Update state
    const keys = path.split('.');
    let current = this.state;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];

      if (!(key in current)) {
        current[key] = {};
      }

      current = current[key];
    }

    const finalKey = keys[keys.length - 1];

    // Merge objects if requested
    if (options.merge && typeof value === 'object' && !Array.isArray(value)) {
      current[finalKey] = { ...current[finalKey], ...value };
    } else {
      current[finalKey] = value;
    }

    // Add to history
    this._addToHistory(path, oldValue, value);

    if (this.debug) {
      console.log(`[StateManager] Set '${path}':`, value);
    }

    // Emit events unless silent
    if (!options.silent) {
      // Emit specific path change
      EventBus.publish(`state:changed:${path}`, {
        path,
        value,
        oldValue
      });

      // Emit general state change
      EventBus.publish('state:changed', {
        path,
        value,
        oldValue
      });
    }
  }

  /**
   * Update multiple state values at once
   * @param {Object} updates - Object with paths as keys and new values
   * @param {Object} options - Optional configuration
   */
  update(updates, options = {}) {
    Object.entries(updates).forEach(([path, value]) => {
      this.set(path, value, { ...options, silent: true });
    });

    // Emit single update event
    if (!options.silent) {
      EventBus.publish('state:updated', updates);
    }
  }

  /**
   * Reset state to initial values
   */
  reset() {
    const config = this.state.config;

    this.state = {
      config: null,
      parameters: {},
      functions: [],
      status: 'ready',
      errors: []
    };

    if (config) {
      this.initialize(config);
    }

    EventBus.publish('state:reset', this.state);
  }

  /**
   * Get state history
   * @param {number} count - Number of recent changes
   * @returns {Array} Recent state changes
   */
  getHistory(count = 10) {
    return this.history.slice(-count);
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether debug mode should be enabled
   */
  setDebug(enabled) {
    this.debug = enabled;
  }

  /**
   * Add change to history
   * @private
   */
  _addToHistory(path, oldValue, newValue) {
    this.history.push({
      path,
      oldValue,
      newValue,
      timestamp: Date.now()
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Validate state value (extensible)
   * @param {string} path - State path
   * @param {*} value - Value to validate
   * @returns {boolean} Whether value is valid
   */
  validate(path, value) {
    // Add validation logic as needed
    // Parameters are runtime state with numeric values + metadata.
    if (path.startsWith('parameters.')) {
      if (typeof value === 'number') {
        return true;
      }

      if (value && typeof value === 'object') {
        if ('value' in value && typeof value.value !== 'number') return false;
        if ('min' in value && typeof value.min !== 'number') return false;
        if ('max' in value && typeof value.max !== 'number') return false;
        if ('step' in value && typeof value.step !== 'number') return false;
      }
    }

    return true;
  }
}

// Create singleton instance
const StateManager = new StateManagerClass();

// Export for use in modules
export default StateManager;

// Also make available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.StateManager = StateManager;
}
