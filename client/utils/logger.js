/**
 * Logger - Client-side logging module
 *
 * Provides logging functionality for activity and debug messages.
 * Activity logs are always enabled; debug logs are toggleable via URL parameter.
 *
 * Usage:
 *   Logger.logActivity('Created expression y = a * x');
 *   Logger.debug('State updated');
 */

class LoggerClass {
  constructor() {
    this.debugEnabled = false;
    this.logEndpoint = '/api/logs';
    this.initialized = false;
  }

  /**
   * Initialize logger
   * Checks URL parameters for debug mode and sets up logging
   */
  init() {
    if (this.initialized) {
      return;
    }

    // Check URL parameters for debug mode
    const urlParams = new URLSearchParams(window.location.search);
    this.debugEnabled = urlParams.get('debug') === 'true';

    this.initialized = true;
  }

  /**
   * Log activity (always enabled)
   * @param {string} message - Log message
   */
  logActivity(message) {
    if (!this.initialized) {
      this.init();
    }

    if (typeof message !== 'string') {
      console.warn('[Logger] Invalid activity log message:', message);
      return;
    }

    this._sendLog('activity', message);
  }

  /**
   * Log a debug message (only if debug mode is enabled)
   * @param {string} message - Log message
   */
  debug(message) {
    if (!this.initialized) {
      this.init();
    }

    if (!this.debugEnabled) {
      return;
    }

    if (!message || typeof message !== 'string') {
      console.warn('[Logger] Invalid debug log message:', message);
      return;
    }

    this._sendLog('debug', message);
  }

  /**
   * Send log to server
   * @private
   * @param {string} type - Log type ('activity' or 'debug')
   * @param {string} message - Log message
   */
  async _sendLog(type, message) {
    try {
      const response = await fetch(this.logEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type,
          message
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }
    } catch (error) {
      // Graceful degradation: log to console if server unavailable
      console.warn(`[Logger] Failed to send ${type} log to server:`, error.message);
      console.log(`[Logger] ${type}:`, message);
    }
  }

  /**
   * Check if debug mode is enabled
   * @returns {boolean} Whether debug mode is enabled
   */
  isDebugEnabled() {
    if (!this.initialized) {
      this.init();
    }
    return this.debugEnabled;
  }
}

// Create singleton instance
const Logger = new LoggerClass();

// Export for use in modules
export default Logger;

// Also make available globally for debugging access
if (typeof window !== 'undefined') {
  window.Logger = Logger;
}

