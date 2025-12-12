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
 */

class EventBusClass {
  constructor() {
    this.subscribers = new Map();
    this.eventHistory = [];
    this.maxHistory = 100;
    this.debug = false;
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - Name of the event to subscribe to
   * @param {Function} callback - Function to call when event is published
   * @param {Object} options - Optional configuration
   * @param {boolean} options.once - Only trigger once, then unsubscribe
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

    // Store in history
    this._addToHistory(eventName, data);

    if (this.debug) {
      console.log(`[EventBus] Publishing '${eventName}'`, data);
    }

    // Get subscribers for this specific event
    const subscribers = this.subscribers.get(eventName);

    if (!subscribers || subscribers.length === 0) {
      if (this.debug) {
        console.log(`[EventBus] No subscribers for '${eventName}'`);
      }
      return;
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
   * Get event history
   * @param {number} count - Number of recent events to return
   * @returns {Array} Array of recent events
   */
  getHistory(count = 10) {
    return this.eventHistory.slice(-count);
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
   * Add event to history
   * @private
   */
  _addToHistory(eventName, data) {
    this.eventHistory.push({
      eventName,
      data,
      timestamp: Date.now()
    });

    // Keep history size limited
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }
  }

  /**
   * Generate unique subscriber ID
   * @private
   */
  _generateId() {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
