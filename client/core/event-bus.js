/**
 * EventBus - Pub/Sub system for decoupled component communication
 *
 * Allows components to communicate without tight coupling by publishing
 * and subscribing to named events.
 *
 * Usage:
 *   EventBus.subscribe('state:changed', (data) => console.log(data));
 *   EventBus.publish('state:changed', { key: 'value', newValue: 10 });
 *
 * Event naming convention:
 *   - Use colon-separated namespaces: 'module:action'
 *   - Examples: 'state:changed', 'control:updated', 'render:complete'
 *
 * State change events:
 *   - Callback signature: callback(data, eventName) where data = {path, value, oldValue}
 *   - Parent path bubbling: Subscribing to 'state:changed:parameters' also receives
 *     notifications for 'state:changed:parameters.m.value'
 *   - Immediate option: Use { immediate: true } to receive current value on subscription.
 *     Requires StateManager injection via setStateManager() (also used for parent bubbling).
 */

class EventBusClass {
  constructor() {
    this.subscribers = new Map();
    this.debug = false;
    this.stateManager = null;
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - Name of the event to subscribe to
   * @param {Function} callback - Function to call when event is published
   * @param {Object} options - Optional configuration
   * @param {boolean} options.once - Only trigger once, then unsubscribe
   * @param {boolean} options.immediate - For state:changed:* events, call immediately with current value
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventName, callback, options = {}) {
    if (typeof eventName !== 'string') {
      throw new Error('Event name must be a string');
    }

    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    // Initialize subscriber list for this event if it doesn't exist
    if (!this.subscribers.has(eventName)) {
      this.subscribers.set(eventName, []);
    }

    const subscriber = {
      callback,
      once: options.once || false,
      id: this._generateId()
    };

    this.subscribers.get(eventName).push(subscriber);

    if (this.debug) {
      console.log(`[EventBus] Subscribed to '${eventName}'`, subscriber.id);
    }

    // Call immediately with current value if requested (for state:changed:* events)
    if (options.immediate && eventName.startsWith('state:changed:') && eventName !== 'state:changed') {
      if (this.stateManager) {
        try {
          const path = eventName.replace('state:changed:', '');
          const currentValue = this.stateManager.get(path);
          const immediateData = {
            path,
            value: currentValue,
            oldValue: undefined
          };
          callback(immediateData, eventName);
        } catch (error) {
          console.warn(`[EventBus] Error in immediate callback for '${eventName}':`, error);
        }
      } else {
        // StateManager not injected yet - this is OK, will be called on next state change
        if (this.debug) {
          console.warn(`[EventBus] StateManager not available for immediate callback of '${eventName}'`);
        }
      }
    }

    // Return unsubscribe function
    return () => this.unsubscribe(eventName, subscriber.id);
  }

  /**
   * Subscribe to an event, but only trigger once
   * @param {string} eventName - Name of the event to subscribe to
   * @param {Function} callback - Function to call when event is published
   * @returns {Function} Unsubscribe function
   */
  once(eventName, callback) {
    return this.subscribe(eventName, callback, { once: true });
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventName - Name of the event
   * @param {string} subscriberId - ID of the subscriber to remove
   */
  unsubscribe(eventName, subscriberId) {
    if (!this.subscribers.has(eventName)) {
      return;
    }

    const subscribers = this.subscribers.get(eventName);
    const index = subscribers.findIndex(sub => sub.id === subscriberId);

    if (index !== -1) {
      subscribers.splice(index, 1);

      if (this.debug) {
        console.log(`[EventBus] Unsubscribed from '${eventName}'`, subscriberId);
      }
    }

    // Clean up empty subscriber lists
    if (subscribers.length === 0) {
      this.subscribers.delete(eventName);
    }
  }

  /**
   * Unsubscribe all subscribers from an event
   * @param {string} eventName - Name of the event
   */
  unsubscribeAll(eventName) {
    if (this.subscribers.has(eventName)) {
      this.subscribers.delete(eventName);

      if (this.debug) {
        console.log(`[EventBus] Unsubscribed all from '${eventName}'`);
      }
    }
  }

  /**
   * Publish an event to all subscribers
   * @param {string} eventName - Name of the event to publish
   * @param {*} data - Data to pass to subscribers
   */
  publish(eventName, data) {
    if (typeof eventName !== 'string') {
      throw new Error('Event name must be a string');
    }

    if (this.debug) {
      console.log(`[EventBus] Publishing '${eventName}'`, data);
    }

    // Bubble parent paths for state:changed:* events
    if (eventName.startsWith('state:changed:') && eventName !== 'state:changed') {
      this._bubbleParentPaths(eventName, data);
    }

    // Notify subscribers
    this._notifySubscribers(eventName, data);
  }

  /**
   * Get list of all event names currently subscribed to
   * @returns {string[]} Array of event names
   */
  getEventNames() {
    return Array.from(this.subscribers.keys());
  }

  /**
   * Get subscriber count for an event
   * @param {string} eventName - Name of the event
   * @returns {number} Number of subscribers
   */
  getSubscriberCount(eventName) {
    const subscribers = this.subscribers.get(eventName);
    return subscribers ? subscribers.length : 0;
  }

  /**
   * Clear all subscribers
   */
  clear() {
    this.subscribers.clear();

    if (this.debug) {
      console.log('[EventBus] Cleared all subscribers');
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
   * Set StateManager instance for immediate callbacks
   * Must be called during app initialization before components subscribe with immediate: true
   * @param {Object} stateManager - StateManager instance
   */
  setStateManager(stateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Generate unique subscriber ID
   * @private
   */
  _generateId() {
    return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Bubble parent paths for state:changed:* events
   * For example, state:changed:parameters.m.value also fires:
   * - state:changed:parameters.m
   * - state:changed:parameters
   * @private
   * @param {string} eventName - Full event name (e.g., 'state:changed:parameters.m.value')
   * @param {*} data - Event data
   */
  _bubbleParentPaths(eventName, data) {
    // Extract path from event name: 'state:changed:parameters.m.value' -> 'parameters.m.value'
    const path = eventName.replace('state:changed:', '');
    if (!path) return;

    // Parent bubbling needs StateManager to provide correct parent values.
    if (!this.stateManager) {
      if (this.debug) {
        console.warn('[EventBus] StateManager not available for parent bubbling');
      }
      return;
    }

    // Split path by dots
    const pathParts = path.split('.');
    if (pathParts.length <= 1) return; // No parent paths for single-segment paths

    // Generate parent paths and notify subscribers
    // For 'parameters.m.value', generate: 'parameters.m', 'parameters'
    for (let i = pathParts.length - 1; i > 0; i--) {
      const parentPath = pathParts.slice(0, i).join('.');
      const parentEventName = `state:changed:${parentPath}`;

      // Parent subscribers should receive the current parent value, not the child value.
      let parentValue;
      try {
        parentValue = this.stateManager.get(parentPath);
      } catch (error) {
        parentValue = undefined;
        if (this.debug) {
          console.warn(`[EventBus] Failed to read StateManager at '${parentPath}'`, error);
        }
      }

      // Update payload for parent event
      const parentData = {
        ...data,
        path: parentPath,
        value: parentValue,
        oldValue: undefined
      };

      // Notify subscribers for parent event (without adding to history or bubbling)
      this._notifySubscribers(parentEventName, parentData);
    }
  }

  /**
   * Notify subscribers for an event without adding to history or bubbling
   * Used internally by _bubbleParentPaths
   * @private
   * @param {string} eventName - Name of the event
   * @param {*} data - Data to pass to subscribers
   */
  _notifySubscribers(eventName, data) {
    const subscribers = this.subscribers.get(eventName);

    if (!subscribers || subscribers.length === 0) {
      if (this.debug) {
        console.log(`[EventBus] No subscribers for '${eventName}'`);
      }
      return;
    }

    if (this.debug) {
      console.log(`[EventBus] Notifying subscribers for '${eventName}'`, data);
    }

    // Create a copy of subscribers array to avoid issues if subscribers modify the list
    const subscribersCopy = [...subscribers];

    // Call each subscriber
    subscribersCopy.forEach(subscriber => {
      try {
        subscriber.callback(data, eventName);

        // Remove if it's a one-time subscription
        if (subscriber.once) {
          this.unsubscribe(eventName, subscriber.id);
        }
      } catch (error) {
        console.error(`[EventBus] Error in subscriber for '${eventName}':`, error);
      }
    });
  }
}

// Create singleton instance
const EventBus = new EventBusClass();

// Export for use in modules
export default EventBus;

// Also make available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.EventBus = EventBus;
}
