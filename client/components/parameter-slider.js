/**
 * Parameter Slider Component
 * Manages parameter slider UI with settings panel for assignment expressions.
 * Handles parameter config normalization, value formatting, and interaction tracking.
 */

import NumericSlider from '../design-system/components/numeric-slider/numeric-slider.js';
import StateManager from '../core/state-manager.js';
import EventBus from '../core/event-bus.js';
import { DEFAULT_PARAMETER } from '../math/parameter-defaults.js';

export default class ParameterSlider {
    /**
     * @param {HTMLElement} container - Container element to mount slider
     * @param {string} paramName - Parameter name (e.g., 'a')
     * @param {Object} initialConfig - Initial config {value, min, max, step}
     * @param {Object} callbacks - Callbacks {onChange: ({oldValue, newValue, isDiscrete, paramName}) => void}
     */
    constructor(container, paramName, initialConfig, callbacks = {}) {
        this.container = container;
        this.paramName = paramName;
        this.callbacks = callbacks;
        this.slider = null;
        this.sliderInteractionActive = false;
        this.sliderEditStartValue = null;

        // Create DOM structure
        this.createDOM();

        // Initialize config
        const config = this.getParameterConfig(paramName, initialConfig.value);
        this.setParameterConfig(paramName, { value: config.value }, { silent: true, expandRange: true });

        // Create NumericSlider
        this.createSlider(config);

        // Bind settings panel events
        this.bindSettingsEvents();
    }

    /**
     * Create DOM structure for slider and settings panel
     */
    createDOM() {
        this.container.innerHTML = '';
        this.container.className = 'expression-slider-container';
        this.container.style.display = 'block';

        this.container.innerHTML = `
            <div class="expression-slider-row">
                <div class="expression-slider"></div>
                <button class="button button-text button-small expression-slider-toggle"
                    type="button"
                    title="Slider settings"
                    aria-label="Toggle slider settings">Range</button>
            </div>
            <div class="expression-slider-settings" hidden>
                <div class="expression-slider-settings-fields">
                    <label class="expression-slider-setting">
                        <span class="expression-slider-setting-label">Min</span>
                        <input type="number"
                            class="input expression-slider-setting-input"
                            data-setting="min">
                    </label>
                    <label class="expression-slider-setting">
                        <span class="expression-slider-setting-label">Max</span>
                        <input type="number"
                            class="input expression-slider-setting-input"
                            data-setting="max">
                    </label>
                    <label class="expression-slider-setting">
                        <span class="expression-slider-setting-label">Step</span>
                        <input type="number"
                            class="input expression-slider-setting-input"
                            data-setting="step">
                    </label>
                </div>
                <button class="button button-secondary button-small expression-slider-reset"
                    type="button">Reset</button>
            </div>
        `;

        // Get references to DOM elements
        this.sliderHost = this.container.querySelector('.expression-slider');
        this.settingsToggle = this.container.querySelector('.expression-slider-toggle');
        this.settingsPanel = this.container.querySelector('.expression-slider-settings');
        this.settingsInputs = Array.from(this.container.querySelectorAll('.expression-slider-setting-input'));
        this.settingsReset = this.container.querySelector('.expression-slider-reset');
        this.settingsOpen = false;
    }

    /**
     * Create NumericSlider instance
     * @param {Object} config - Parameter config
     */
    createSlider(config) {
        if (!this.sliderHost) return;

        this.slider = new NumericSlider(this.sliderHost, {
            type: 'single',
            min: config.min,
            max: config.max,
            step: config.step,
            value: config.value,
            showInputs: false,
            continuousUpdates: true,
            onChange: (newValue) => {
                this.handleSliderChange(newValue);
            }
        });
    }

    /**
     * Handle slider value change
     * @param {number} newValue - New slider value
     */
    handleSliderChange(newValue) {
        const currentConfig = this.getParameterConfig(this.paramName);
        const roundedValue = this.roundToStep(newValue, currentConfig.step);
        const nextConfig = this.setParameterConfig(
            this.paramName,
            { value: roundedValue },
            { silent: true }
        );

        // Track slider interaction for commit-boundary logging
        const isDragging = this.slider.isDragging;

        // Capture old value BEFORE state update (for discrete changes)
        let oldValueForDiscrete = null;
        if (!isDragging && !this.sliderInteractionActive) {
            // Discrete change - capture old value before update
            oldValueForDiscrete = currentConfig.value;
        }

        // Capture start value when drag begins
        if (isDragging && !this.sliderInteractionActive) {
            this.sliderInteractionActive = true;
            this.sliderEditStartValue = currentConfig.value;
        }

        // Publish event for graph
        EventBus.publish('parameters:updated', {
            [this.paramName]: nextConfig.value
        });

        // Emit onChange callback on interaction end (drag end) or discrete change (non-drag)
        if (!isDragging) {
            if (this.sliderInteractionActive) {
                // Drag ended - emit once with start -> end
                const oldValue = this.sliderEditStartValue !== null ? this.sliderEditStartValue : currentConfig.value;
                if (this.callbacks.onChange) {
                    this.callbacks.onChange({
                        oldValue,
                        newValue: nextConfig.value,
                        isDiscrete: false,
                        paramName: this.paramName
                    });
                }
                this.sliderInteractionActive = false;
                this.sliderEditStartValue = null;
            } else if (oldValueForDiscrete !== null && oldValueForDiscrete !== nextConfig.value) {
                // Discrete change (track click, keyboard) - emit immediately
                if (this.callbacks.onChange) {
                    this.callbacks.onChange({
                        oldValue: oldValueForDiscrete,
                        newValue: nextConfig.value,
                        isDiscrete: true,
                        paramName: this.paramName
                    });
                }
            }
        }
        // While dragging (isDragging === true), do not emit - wait for drag end
    }

    /**
     * Bind settings panel event listeners
     */
    bindSettingsEvents() {
        if (this.settingsToggle) {
            this.settingsToggle.addEventListener('click', () => {
                this.toggleSliderSettings();
            });
        }

        if (this.settingsReset) {
            this.settingsReset.addEventListener('click', () => {
                this.resetSliderSettings();
            });
        }

        if (this.settingsInputs.length > 0) {
            const commitSettings = () => this.commitSliderSettings();
            this.settingsInputs.forEach(inputEl => {
                inputEl.addEventListener('change', commitSettings);
                inputEl.addEventListener('blur', commitSettings);
                inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        inputEl.blur();
                    }
                });
            });
        }
    }

    /**
     * Round value to nearest step
     * @param {number} value - Value to round
     * @param {number} step - Step size
     * @returns {number} Rounded value
     */
    roundToStep(value, step) {
        if (!Number.isFinite(step) || step <= 0) {
            return value;
        }
        const scaled = value / step;
        return Math.round(scaled) * step;
    }

    /**
     * Get number of decimal places for step
     * @param {number} step - Step size
     * @returns {number} Number of decimal places
     */
    getStepDecimals(step) {
        if (!Number.isFinite(step)) return 0;
        const stepString = step.toString();
        if (stepString.includes('e-')) {
            const parts = stepString.split('e-');
            return Number(parts[1]) || 0;
        }
        if (stepString.includes('.')) {
            return stepString.split('.')[1].length;
        }
        return 0;
    }

    /**
     * Format value for display in expression
     * @param {number} value - Value to format
     * @param {number} step - Step size
     * @returns {string} Formatted value string
     */
    formatValue(value, step) {
        const decimals = this.getStepDecimals(step);
        const rounded = this.roundToStep(value, step);
        if (decimals === 0) {
            return `${Math.round(rounded)}`;
        }
        return rounded.toFixed(decimals);
    }

    /**
     * Normalize parameter config with defaults
     * @param {Object} config - Config to normalize
     * @returns {Object} Normalized config
     */
    normalizeParameterConfig(config) {
        const toNumber = (val, fallback) => (
            Number.isFinite(val) ? Number(val) : fallback
        );

        const normalized = {
            ...DEFAULT_PARAMETER,
            ...config
        };

        normalized.min = toNumber(normalized.min, DEFAULT_PARAMETER.min);
        normalized.max = toNumber(normalized.max, DEFAULT_PARAMETER.max);
        normalized.step = toNumber(normalized.step, DEFAULT_PARAMETER.step);

        if (normalized.step <= 0) {
            normalized.step = DEFAULT_PARAMETER.step;
        }

        if (normalized.min > normalized.max) {
            const swap = normalized.min;
            normalized.min = normalized.max;
            normalized.max = swap;
        }

        const rawValue = toNumber(normalized.value, DEFAULT_PARAMETER.value);
        const clamped = Math.min(Math.max(rawValue, normalized.min), normalized.max);
        normalized.value = this.roundToStep(clamped, normalized.step);

        return normalized;
    }

    /**
     * Get parameter config from state
     * @param {string} paramName - Parameter name
     * @param {number|null} fallbackValue - Fallback value if not in state
     * @returns {Object} Parameter config
     */
    getParameterConfig(paramName, fallbackValue = null) {
        const parameters = StateManager.get('parameters') || {};
        const existing = parameters[paramName] || {};
        const base = {
            ...existing
        };

        if (Number.isFinite(fallbackValue)) {
            base.value = fallbackValue;
        }

        return this.normalizeParameterConfig(base);
    }

    /**
     * Check if parameter config changed
     * @param {Object} current - Current config
     * @param {Object} next - Next config
     * @returns {boolean} True if changed
     */
    hasParameterChanged(current, next) {
        if (!current) return true;
        return current.value !== next.value ||
            current.min !== next.min ||
            current.max !== next.max ||
            current.step !== next.step;
    }

    /**
     * Set parameter config in state
     * @param {string} paramName - Parameter name
     * @param {Object} updates - Config updates
     * @param {Object} options - Options {silent, expandRange}
     * @returns {Object} Normalized config
     */
    setParameterConfig(paramName, updates, options = {}) {
        const parameters = StateManager.get('parameters') || {};
        const existing = parameters[paramName] || {};
        const expandRange = options.expandRange === true;
        const draft = { ...existing, ...updates };

        if (expandRange && Number.isFinite(draft.value)) {
            if (!('min' in updates) && Number.isFinite(draft.min) && draft.value < draft.min) {
                draft.min = draft.value;
            }
            if (!('max' in updates) && Number.isFinite(draft.max) && draft.value > draft.max) {
                draft.max = draft.value;
            }
        }

        const next = this.normalizeParameterConfig(draft);

        if (this.hasParameterChanged(existing, next)) {
            StateManager.set(`parameters.${paramName}`, next, options);
        }

        return next;
    }

    /**
     * Apply config to NumericSlider
     * @param {Object} config - Parameter config
     */
    applySliderConfig(config) {
        if (!this.slider) return;

        this.slider.config.min = config.min;
        this.slider.config.max = config.max;
        this.slider.config.step = config.step;

        if (this.slider.wrapper) {
            this.slider.wrapper.setAttribute('aria-valuemin', config.min);
            this.slider.wrapper.setAttribute('aria-valuemax', config.max);
        }

        this.slider.setValue(config.value, null, false);
    }

    /**
     * Sync settings panel inputs with config
     * @param {Object} config - Parameter config
     */
    syncSliderSettingsInputs(config) {
        if (!this.settingsInputs || this.settingsInputs.length === 0) return;
        this.settingsInputs.forEach(inputEl => {
            const key = inputEl.dataset.setting;
            if (key && config[key] !== undefined) {
                inputEl.value = config[key];
            }
        });
    }

    /**
     * Toggle settings panel visibility
     */
    toggleSliderSettings() {
        if (!this.settingsPanel) return;

        this.settingsOpen = !this.settingsOpen;
        this.settingsPanel.hidden = !this.settingsOpen;
        if (this.settingsToggle) {
            this.settingsToggle.classList.toggle('is-open', this.settingsOpen);
        }
    }

    /**
     * Commit settings panel changes
     * @returns {Object|null} Updated config if value changed, null otherwise
     */
    commitSliderSettings() {
        if (!this.paramName) return null;

        const current = this.getParameterConfig(this.paramName);
        const updates = {};

        this.settingsInputs.forEach(inputEl => {
            const key = inputEl.dataset.setting;
            const value = Number.parseFloat(inputEl.value);
            if (key && Number.isFinite(value)) {
                updates[key] = value;
            }
        });

        const next = this.setParameterConfig(this.paramName, updates);

        if (this.slider && !this.slider.isDragging) {
            this.applySliderConfig(next);
        }

        this.syncSliderSettingsInputs(next);

        // If value changed, trigger onChange callback for expression update
        if (next.value !== current.value && this.callbacks.onChange) {
            this.callbacks.onChange({
                oldValue: current.value,
                newValue: next.value,
                isDiscrete: true,
                paramName: this.paramName
            });
        }

        // Publish event for graph
        EventBus.publish('parameters:updated', {
            [this.paramName]: next.value
        });

        return next.value !== current.value ? next : null;
    }

    /**
     * Reset settings to defaults
     * @returns {Object|null} Updated config if value changed, null otherwise
     */
    resetSliderSettings() {
        if (!this.paramName) return null;

        const current = this.getParameterConfig(this.paramName);
        const updates = {
            min: DEFAULT_PARAMETER.min,
            max: DEFAULT_PARAMETER.max,
            step: DEFAULT_PARAMETER.step
        };

        const next = this.setParameterConfig(this.paramName, updates);

        if (this.slider && !this.slider.isDragging) {
            this.applySliderConfig(next);
        }

        this.syncSliderSettingsInputs(next);

        // If value changed, trigger onChange callback for expression update
        if (next.value !== current.value && this.callbacks.onChange) {
            this.callbacks.onChange({
                oldValue: current.value,
                newValue: next.value,
                isDiscrete: true,
                paramName: this.paramName
            });
        }

        // Publish event for graph
        EventBus.publish('parameters:updated', {
            [this.paramName]: next.value
        });

        return next.value !== current.value ? next : null;
    }

    /**
     * Set slider value programmatically
     * @param {number} value - Value to set
     */
    setValue(value) {
        if (!this.slider) return;
        const config = this.getParameterConfig(this.paramName);
        const roundedValue = this.roundToStep(value, config.step);
        if (!this.slider.isDragging) {
            this.slider.setValue(roundedValue, null, false);
        }
    }

    /**
     * Update slider config (min/max/step) from external source
     * @param {Object} config - Parameter config
     */
    updateConfig(config) {
        if (!this.slider) return;

        const normalized = this.normalizeParameterConfig(config);

        if (!this.slider.isDragging) {
            const needsRangeUpdate = this.slider.config.min !== normalized.min ||
                this.slider.config.max !== normalized.max ||
                this.slider.config.step !== normalized.step;

            if (needsRangeUpdate) {
                this.applySliderConfig(normalized);
            } else {
                const currentValue = this.slider.getValue();
                if (currentValue !== normalized.value) {
                    this.slider.setValue(normalized.value, null, false);
                }
            }
        }

        this.syncSliderSettingsInputs(normalized);
    }

    /**
     * Destroy slider and clean up DOM
     */
    destroy() {
        if (this.slider) {
            this.slider.destroy();
            this.slider = null;
        }

        if (this.container) {
            this.container.innerHTML = '';
            this.container.className = '';
        }

        // Clear references
        this.sliderHost = null;
        this.settingsToggle = null;
        this.settingsPanel = null;
        this.settingsInputs = [];
        this.settingsReset = null;
    }
}
