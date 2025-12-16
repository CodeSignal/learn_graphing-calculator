/**
 * StateManager - Centralized reactive state management
 *
 * Manages all application state with reactive updates through EventBus.
 * Components can subscribe to specific state keys and get notified of changes.
 *
 * State structure:
 * {
 *   config: {},           // Activity configuration (functions, graph)
 *   controls: {},         // Runtime control values (dynamically created from expression variables)
 *   functions: [],        // Function expressions
 *   graph: {},           // Graph viewport and display settings
 *   status: 'ready'       // Application status
 * }
 *
 * Usage:
 *   StateManager.set('controls.m', 5);
 *   StateManager.subscribe('controls.m', (value) => console.log(value));
 *   const value = StateManager.get('controls.m');
 */

import EventBus from './event-bus.js';

class StateManagerClass {
  constructor() {
    this.state = {
      config: null,
      controls: {},
      functions: [],
      status: 'initializing',
      errors: []
    };

    this.subscribers = new Map();
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

    // Note: controls are runtime state, dynamically created by GraphEngine
    // from expression variables (e.g., 'm', 'b' in 'm*x + b')

    if (this.debug) {
      console.log('[StateManager] Initialized with config:', config);
    }

    EventBus.publish('state:initialized', this.state);
  }

  /**
   * Get state value at path
   * @param {string} path - Dot-separated path (e.g., 'controls.x-point')
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

      // Notify path subscribers
      this._notifySubscribers(path, value, oldValue);
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
   * Subscribe to changes at a specific path
   * @param {string} path - Dot-separated path
   * @param {Function} callback - Function to call on change
   * @param {Object} options - Optional configuration
   * @param {boolean} options.immediate - Call immediately with current value
   * @returns {Function} Unsubscribe function
   */
  subscribe(path, callback, options = {}) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, []);
    }

    const subscriber = {
      callback,
      id: this._generateId()
    };

    this.subscribers.get(path).push(subscriber);

    if (this.debug) {
      console.log(`[StateManager] Subscribed to '${path}'`, subscriber.id);
    }

    // Call immediately with current value if requested
    if (options.immediate) {
      const currentValue = this.get(path);
      callback(currentValue, undefined, path);
    }

    // Return unsubscribe function
    return () => this._unsubscribe(path, subscriber.id);
  }

  /**
   * Unsubscribe from path
   * @private
   */
  _unsubscribe(path, subscriberId) {
    if (!this.subscribers.has(path)) {
      return;
    }

    const subscribers = this.subscribers.get(path);
    const index = subscribers.findIndex(sub => sub.id === subscriberId);

    if (index !== -1) {
      subscribers.splice(index, 1);

      if (this.debug) {
        console.log(`[StateManager] Unsubscribed from '${path}'`, subscriberId);
      }
    }

    if (subscribers.length === 0) {
      this.subscribers.delete(path);
    }
  }

  /**
   * Notify subscribers of a path change
   * @private
   */
  _notifySubscribers(path, value, oldValue) {
    // Notify exact path subscribers
    if (this.subscribers.has(path)) {
      const subscribers = [...this.subscribers.get(path)];

      subscribers.forEach(subscriber => {
        try {
          subscriber.callback(value, oldValue, path);
        } catch (error) {
          console.error(`[StateManager] Error in subscriber for '${path}':`, error);
        }
      });
    }

    // Notify parent path subscribers (e.g., 'controls' for 'controls.x-point')
    const pathParts = path.split('.');

    for (let i = pathParts.length - 1; i > 0; i--) {
      const parentPath = pathParts.slice(0, i).join('.');

      if (this.subscribers.has(parentPath)) {
        const parentValue = this.get(parentPath);
        const subscribers = [...this.subscribers.get(parentPath)];

        subscribers.forEach(subscriber => {
          try {
            subscriber.callback(parentValue, undefined, parentPath);
          } catch (error) {
            console.error(`[StateManager] Error in subscriber for '${parentPath}':`, error);
          }
        });
      }
    }
  }

  /**
   * Reset state to initial values
   */
  reset() {
    const config = this.state.config;

    this.state = {
      config: null,
      controls: {},
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
   * Clear all subscribers
   */
  clearSubscribers() {
    this.subscribers.clear();

    if (this.debug) {
      console.log('[StateManager] Cleared all subscribers');
    }
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
   * Generate unique subscriber ID
   * @private
   */
  _generateId() {
    return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Validate state value (extensible)
   * @param {string} path - State path
   * @param {*} value - Value to validate
   * @returns {boolean} Whether value is valid
   */
  validate(path, value) {
    // Add validation logic as needed
    // Controls are runtime state (dynamically created from expression variables)
    // Basic validation: ensure controls are numbers
    if (path.startsWith('controls.')) {
      if (typeof value !== 'number') {
        return false;
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
