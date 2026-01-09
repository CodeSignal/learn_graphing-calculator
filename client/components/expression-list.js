/**
 * Expression List Component
 * Handles the list of mathematical expressions in the sidebar.
 */

import StateManager from '../core/state-manager.js';
import EventBus from '../core/event-bus.js';
import NumericSlider from '../design-system/components/numeric-slider/numeric-slider.js';
import sharedParser from '../math/shared-parser.js';
import { classifyLine } from '../math/line-classifier.js';
import { DEFAULT_PARAMETER } from '../math/parameter-defaults.js';
import { toLatex, renderLatex } from '../utils/math-formatter.js';
import Logger from '../utils/logger.js';
import { COLORS } from '../utils/color-constants.js';

export default class ExpressionList {
    constructor(containerId, addButtonId) {
        this.container = document.getElementById(containerId);
        this.addButton = document.getElementById(addButtonId);
        this.boundRender = this.render.bind(this);
        this.boundHandleFunctions = this.handleFunctionsUpdate.bind(this);
        // id -> { element, slider, inputEl, latexEl, colorEl, errorEl, sliderContainer, ... }
        this.renderedItems = new Map();
        this.unsubscribers = [];
        this.debug = false;
        this.parser = sharedParser;
    }

    init() {
        if (!this.container || !this.addButton) {
            console.error('[ExpressionList] Container or Add Button not found');
            return;
        }

        // Subscribe to functions changes
        this.unsubscribers.push(
            StateManager.subscribe('functions', this.boundHandleFunctions)
        );

        // Initial render
        this.handleFunctionsUpdate(StateManager.get('functions'));

        // Bind Add Button
        this.addButton.addEventListener('click', () => {
            this.addExpression();
        });

        // Subscribe to parameter changes to update slider values if changed externally
        this.unsubscribers.push(
            StateManager.subscribe('parameters', () => {
                this.updateSlidersFromState();
            })
        );
    }

    /**
     * Render the list of expressions using keyed reconciliation
     * @param {Array} functions - List of function objects
     */
    render(functions) {
        if (this.debug) {
            console.log(
                '[ExpressionList] Rendering',
                functions,
                functions ? functions.length : 0
            );
        }
        if (!functions) return;

        const currentIds = new Set(functions.map(f => f.id));

        // 1. Remove orphaned items
        for (const [id] of this.renderedItems) {
            if (!currentIds.has(id)) {
                this.removeItem(id);
            }
        }

        // 2. Handle empty state
        if (functions.length === 0) {
            if (this.renderedItems.size === 0) {
                this.container.innerHTML =
                    '<div style="padding: 1rem; color: var(--color-text-weak);">' +
                    'No expressions added</div>';
                // Ensure button is still visible after clearing innerHTML
                this.ensureButtonPosition();
            }
            return;
        }

        // Remove empty state message if present
        const emptyMsg = this.container.querySelector('div:not(.expression-item)');
        if (emptyMsg?.textContent.includes('No expressions')) {
            emptyMsg.remove();
        }

        // 3. Update or create items
        functions.forEach((func, index) => {
            if (this.renderedItems.has(func.id)) {
                this.updateItem(func);
            } else {
                this.createItem(func, index);
            }
        });

        // 4. Reorder items to match function order
        this.reorderItems(functions);

        // 5. Ensure add button is always at the end
        this.ensureButtonPosition();
    }

    handleFunctionsUpdate(functions) {
        if (!functions) return;

        const updated = functions.map(func => {
            const expression = func.expression || '';
            const classification = classifyLine(expression, this.parser);

            return {
                ...func,
                error: classification.error,
                kind: classification.kind,
                paramName: classification.paramName ?? null,
                value: classification.value ?? null,
                usedVariables: classification.usedVariables ?? [],
                plotExpression: classification.plotExpression ?? null
            };
        });

        const needsUpdate = updated.some((nextFunc, idx) => {
            const prev = functions[idx];
            if (!prev) return true;

            const prevVars = prev.usedVariables || [];
            const nextVars = nextFunc.usedVariables || [];
            const varsMatch = prevVars.length === nextVars.length &&
                prevVars.every((val, i) => val === nextVars[i]);

            return prev.error !== nextFunc.error ||
                prev.kind !== nextFunc.kind ||
                prev.paramName !== nextFunc.paramName ||
                prev.value !== nextFunc.value ||
                prev.plotExpression !== nextFunc.plotExpression ||
                !varsMatch;
        });

        if (needsUpdate) {
            StateManager.set('functions', updated);
            return;
        }

        this.render(functions);
    }

    /**
     * Update error state for an expression item
     * @param {Object} item - Item data from renderedItems Map
     * @param {string|null} error - Error message or null
     */
    updateErrorState(item, error) {
        const hasError = !!error;
        item.element.classList.toggle('has-error', hasError);
        item.errorEl.textContent = error || '';
    }

    /**
     * Update visibility state for an expression item
     * @param {Object} item - Item data from renderedItems Map
     * @param {boolean} visible - Whether expression is visible
     */
    updateVisibilityState(item, visible) {
        item.element.style.opacity = visible === false ? '0.5' : '1';
    }

    /**
     * Update color swatch for an expression item
     * @param {Object} item - Item data from renderedItems Map
     * @param {string} color - Color value
     */
    updateColorState(item, color) {
        if (item.lastColor !== color) {
            item.colorEl.style.backgroundColor = color;
            item.lastColor = color;
        }
    }

    /**
     * Update input value if not focused
     * @param {Object} item - Item data from renderedItems Map
     * @param {string} expression - Expression string
     */
    updateInputValue(item, expression) {
        if (document.activeElement !== item.inputEl && item.inputEl.value !== expression) {
            item.inputEl.value = expression;
        }
    }

    /**
     * Switch to input editing mode
     * @param {string} id - Function ID
     */
    switchToInputMode(id) {
        const item = this.renderedItems.get(id);
        if (!item || item.isEditing) return;

        item.isEditing = true;
        item.latexEl.style.display = 'none';
        item.inputEl.style.display = 'block';
        item.inputEl.focus();
        // Select all text for easy replacement
        item.inputEl.select();

        // Capture starting expression for commit-boundary logging
        if (item.editStartExpression === undefined) {
            item.editStartExpression = item.lastExpression || item.inputEl.value || '';
        }
    }

    /**
     * Switch to LaTeX display mode
     * @param {string} id - Function ID
     */
    switchToLatexDisplay(id) {
        const item = this.renderedItems.get(id);
        if (!item || !item.isEditing) return;

        item.isEditing = false;
        item.inputEl.style.display = 'none';
        item.latexEl.style.display = 'block';

        // Update LaTeX display with current expression
        const expression = item.inputEl.value;
        item.lastExpression = expression;
        this.updateLatexDisplay(item, expression);
    }

    /**
     * Update LaTeX display for an expression
     * @param {Object} item - Item data from renderedItems Map
     * @param {string} expression - Expression string
     */
    updateLatexDisplay(item, expression) {
        if (!item.latexEl) return;

        // Clear previous content
        item.latexEl.innerHTML = '';

        if (!expression || expression.trim() === '') {
            // Show placeholder for empty expressions
            item.latexEl.textContent = 'Enter expression...';
            item.latexEl.classList.add('expression-latex-empty');
            return;
        }

        item.latexEl.classList.remove('expression-latex-empty');

        try {
            // Convert expression to LaTeX
            const latex = toLatex(expression);

            // Render LaTeX
            if (latex) {
                renderLatex(latex, item.latexEl);
            } else {
                // Fallback to plain text if LaTeX conversion fails
                item.latexEl.textContent = expression;
            }
        } catch (error) {
            // Fallback to plain text on error
            console.warn('[ExpressionList] LaTeX rendering failed, using plain text:', error);
            item.latexEl.textContent = expression;
        }
    }

    /**
     * Create a new expression item
     * @param {Object} func - Function object
     * @param {number} index - Index in the list
     */
    createItem(func, index) {
        const item = document.createElement('div');
        item.className = 'expression-item';
        if (func.error) item.classList.add('has-error');

        item.innerHTML = `
        <div class="expression-color"
            style="background-color: ${func.color};"
            title="Toggle Visibility"></div>
        <div class="expression-main" style="flex: 1;">
            <div class="expression-input-container">
                <div class="expression-latex" data-id="${func.id}"></div>
                <input type="text"
                    class="expression-input input"
                    value="${this.escapeHtml(func.expression)}"
                    placeholder="Enter expression..."
                    data-id="${func.id}"
                    style="display: none;">
                <div class="expression-error">${this.escapeHtml(func.error || '')}</div>
            </div>
            <div class="expression-slider-container"
                id="slider-container-${func.id}">
                <div class="expression-slider-row">
                    <div class="expression-slider" data-id="${func.id}"></div>
                    <button class="button button-text button-small expression-slider-toggle"
                        type="button"
                        data-id="${func.id}"
                        title="Slider settings"
                        aria-label="Toggle slider settings">Range</button>
                </div>
                <div class="expression-slider-settings"
                    data-id="${func.id}"
                    hidden>
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
                        type="button"
                        data-id="${func.id}">Reset</button>
                </div>
            </div>
        </div>
        <button class="button button-text button-medium"
            data-id="${func.id}"
            title="Delete"
            aria-label="Delete expression">
            <span class="icon icon-trash icon-medium"></span>
        </button>
      `;

        // Get references to DOM elements
        const input = item.querySelector('.expression-input');
        const latexEl = item.querySelector('.expression-latex');
        const colorBtn = item.querySelector('.expression-color');
        const deleteBtn = item.querySelector('button[aria-label="Delete expression"]');
        const errorEl = item.querySelector('.expression-error');
        const sliderContainer = item.querySelector(`#slider-container-${func.id}`);
        const sliderHost = item.querySelector('.expression-slider');
        const settingsToggle = item.querySelector('.expression-slider-toggle');
        const settingsPanel = item.querySelector('.expression-slider-settings');
        const settingsInputs = settingsPanel
            ? Array.from(settingsPanel.querySelectorAll('.expression-slider-setting-input'))
            : [];
        const settingsReset = item.querySelector('.expression-slider-reset');

        // Event Listeners
        input.addEventListener('input', (e) => {
            const item = this.renderedItems.get(func.id);
            if (item) {
                item.lastExpression = e.target.value;
            }
            this.updateExpression(func.id, e.target.value);
        });

        input.addEventListener('blur', () => {
            this.handleExpressionCommit(func.id);
            this.switchToLatexDisplay(func.id);
            // Check for auto-conversion after blur (input no longer focused)
            const functions = StateManager.get('functions') || [];
            const currentFunc = functions.find(f => f.id === func.id);
            const item = this.renderedItems.get(func.id);
            if (currentFunc && item) {
                this.reconcileSlider(currentFunc, item);
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur(); // Trigger blur handler which will log and switch to LaTeX
            }
        });

        latexEl.addEventListener('click', () => {
            this.switchToInputMode(func.id);
        });

        colorBtn.addEventListener('click', () => {
            this.toggleVisibility(func.id);
        });

        deleteBtn.addEventListener('click', () => {
            this.deleteExpression(func.id);
        });

        if (settingsToggle) {
            settingsToggle.addEventListener('click', () => {
                this.toggleSliderSettings(func.id);
            });
        }

        if (settingsReset) {
            settingsReset.addEventListener('click', () => {
                this.resetSliderSettings(func.id);
            });
        }

        if (settingsInputs.length > 0) {
            const commitSettings = () => this.commitSliderSettings(func.id);
            settingsInputs.forEach(inputEl => {
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

        // Store item data
        const itemData = {
            element: item,
            inputEl: input,
            latexEl: latexEl,
            colorEl: colorBtn,
            errorEl: errorEl,
            sliderContainer: sliderContainer,
            sliderHost: sliderHost,
            settingsToggle: settingsToggle,
            settingsPanel: settingsPanel,
            settingsInputs: settingsInputs,
            settingsReset: settingsReset,
            settingsOpen: false,
            slider: null,
            lastColor: func.color,
            paramName: null,
            isEditing: !func.expression || func.expression.trim() === '',
            lastExpression: func.expression,
            // Track expression at edit start for commit-boundary logging
            editStartExpression: undefined
        };

        // Capture starting expression for new empty expressions that start in edit mode
        if (itemData.isEditing) {
            itemData.editStartExpression = func.expression || '';
        }

        this.renderedItems.set(func.id, itemData);

        // Apply initial state
        this.updateVisibilityState(itemData, func.visible);
        this.updateErrorState(itemData, func.error);

        // Set initial display mode
        if (itemData.isEditing) {
            // Start in input mode for empty expressions
            latexEl.style.display = 'none';
            input.style.display = 'block';
            input.focus();
        } else {
            // Start in LaTeX display mode for existing expressions
            latexEl.style.display = 'block';
            input.style.display = 'none';
            this.updateLatexDisplay(itemData, func.expression);
        }

        // Check for parameter definition and create slider if needed
        this.reconcileSlider(func, itemData);

        // Append to container
        this.container.appendChild(item);

        // Ensure button stays at the end
        this.ensureButtonPosition();
    }

    /**
     * Update an existing expression item
     * @param {Object} func - Function object with updated data
     */
    updateItem(func) {
        const item = this.renderedItems.get(func.id);
        if (!item) return;

        // Update all state properties
        this.updateColorState(item, func.color);
        this.updateInputValue(item, func.expression);
        this.updateErrorState(item, func.error);
        this.updateVisibilityState(item, func.visible);

        // Update LaTeX display if expression changed and not currently editing
        if (!item.isEditing && item.lastExpression !== func.expression) {
            item.lastExpression = func.expression;
            this.updateLatexDisplay(item, func.expression);
        }

        // Handle slider lifecycle
        this.reconcileSlider(func, item);
    }


    /**
     * Handle auto-conversion of parameter to assignment
     * @param {Object} func - Function object
     * @param {Object} item - Item data from renderedItems Map
     * @param {Object} param - Result from parser.isParameter()
     * @returns {boolean} True if conversion happened (should return early)
     */
    handleAutoConversion(func, item, param) {
        if (!param.isParameter || item.slider) return false;

        const isInputFocused = item.inputEl && document.activeElement === item.inputEl;
        if (isInputFocused) return false;

        const paramName = param.paramName;
        const defaultVal = DEFAULT_PARAMETER.value;
        const formatted = this.formatValue(defaultVal, DEFAULT_PARAMETER.step);
        const newExpr = `${paramName} = ${formatted}`;

        this.updateExpression(func.id, newExpr);
        return true; // Conversion happened, should return early
    }

    /**
     * Create slider for an assignment expression
     * @param {Object} func - Function object
     * @param {Object} item - Item data from renderedItems Map
     * @param {string} paramName - Parameter name
     * @param {number} value - Initial value
     */
    createSliderForAssignment(func, item, paramName, value) {
        // Initialize slider interaction tracking
        item.sliderInteractionActive = false;
        item.sliderEditStartExpr = null;

        const paramConfig = this.setParameterConfig(
            paramName,
            { value },
            { silent: true, expandRange: true }
        );

        const sliderTarget = item.sliderHost || item.sliderContainer;
        if (!sliderTarget) return;

        const slider = new NumericSlider(sliderTarget, {
            type: 'single',
            min: paramConfig.min,
            max: paramConfig.max,
            step: paramConfig.step,
            value: paramConfig.value,
            showInputs: false,
            continuousUpdates: true,
            onChange: (newValue) => {
                const currentConfig = this.getParameterConfig(paramName);
                const roundedValue = this.roundToStep(newValue, currentConfig.step);
                const nextConfig = this.setParameterConfig(
                    paramName,
                    { value: roundedValue },
                    { silent: true }
                );
                const formattedValue = this.formatValue(
                    nextConfig.value,
                    nextConfig.step
                );

                // Update Expression Text to match
                const newExpr = `${paramName} = ${formattedValue}`;

                // Track slider interaction for commit-boundary logging
                const isDragging = slider.isDragging;

                // Capture old expression BEFORE state update (for discrete changes)
                let oldExprForDiscrete = null;
                if (!isDragging && !item.sliderInteractionActive) {
                    // Discrete change - capture old expression before update
                    const functions = StateManager.get('functions') || [];
                    const currentFunc = functions.find(f => f.id === func.id);
                    oldExprForDiscrete = currentFunc
                        ? currentFunc.expression
                        : func.expression;
                }

                // Capture start expression when drag begins
                if (isDragging && !item.sliderInteractionActive) {
                    item.sliderInteractionActive = true;
                    // Get current expression from state before update
                    const functions = StateManager.get('functions') || [];
                    const currentFunc = functions.find(f => f.id === func.id);
                    item.sliderEditStartExpr = currentFunc
                        ? currentFunc.expression
                        : func.expression;
                }

                // Update local input value immediately for responsiveness
                if (item.inputEl) item.inputEl.value = newExpr;

                // Update State
                this.updateExpression(func.id, newExpr);

                // Publish event for graph
                EventBus.publish('parameters:updated', {
                    [paramName]: nextConfig.value
                });

                // Log user action on interaction end (drag end) or discrete change (non-drag)
                if (!isDragging) {
                    if (item.sliderInteractionActive) {
                        // Drag ended - log once with start -> end
                        const oldExpr = item.sliderEditStartExpr || func.expression;
                        this.logModified(func.id, oldExpr, newExpr, { paramName });
                        item.sliderInteractionActive = false;
                        item.sliderEditStartExpr = null;
                    } else if (oldExprForDiscrete !== null && oldExprForDiscrete !== newExpr) {
                        // Discrete change (track click, keyboard) - log immediately
                        this.logModified(func.id, oldExprForDiscrete, newExpr, { paramName });
                    }
                }
                // While dragging (isDragging === true), do not log - wait for drag end
            }
        });

        item.slider = slider;
        item.paramName = paramName;

        this.syncSliderSettingsInputs(item, paramConfig);
    }

    /**
     * Destroy slider for an expression item
     * @param {Object} item - Item data from renderedItems Map
     */
    destroySlider(item) {
        if (item.slider) {
            item.slider.destroy();
            item.slider = null;
            item.paramName = null;
            if (item.sliderHost) {
                item.sliderHost.innerHTML = '';
            }
        }

        if (item.settingsPanel) {
            item.settingsPanel.hidden = true;
        }

        item.settingsOpen = false;
    }

    /**
     * Reconcile slider for an expression item
     * @param {Object} func - Function object
     * @param {Object} item - Item data from renderedItems Map
     */
    reconcileSlider(func, item) {
        const classification = classifyLine(func.expression, this.parser);
        const param = this.parser.isParameter(func.expression);

        // Handle auto-conversion of parameter to assignment
        if (this.handleAutoConversion(func, item, param)) {
            return; // Conversion happened, will trigger re-render
        }

        const isAssignment = classification.kind === 'assignment' &&
            classification.paramName;

        if (!isAssignment) {
            if (item.slider) {
                this.destroySlider(item);
            }
            if (item.sliderContainer) {
                item.sliderContainer.style.display = 'none';
            }
            return;
        }

        const paramName = classification.paramName;
        const value = classification.value;

        if (!item.slider || item.paramName !== paramName) {
            if (item.slider) {
                this.destroySlider(item);
            }
            this.createSliderForAssignment(func, item, paramName, value);
        }

        if (item.sliderContainer) {
            item.sliderContainer.style.display = 'block';
        }

        const paramConfig = this.getParameterConfig(paramName, value);

        if (item.slider && !item.slider.isDragging) {
            const needsRangeUpdate = item.slider.config.min !== paramConfig.min ||
                item.slider.config.max !== paramConfig.max ||
                item.slider.config.step !== paramConfig.step;

            if (needsRangeUpdate) {
                this.applySliderConfig(item, paramConfig);
            } else if (item.slider.getValue() !== paramConfig.value) {
                item.slider.setValue(paramConfig.value, null, false);
            }
        }

        this.syncSliderSettingsInputs(item, paramConfig);
    }

    /**
     * Remove an expression item
     * @param {string} id - Function ID
     */
    removeItem(id) {
        const item = this.renderedItems.get(id);
        if (!item) return;

        // Clean up slider
        if (item.slider) {
            item.slider.destroy();
            item.slider = null;
        }

        // Remove from DOM
        item.element.remove();

        // Remove from map
        this.renderedItems.delete(id);

        // Ensure button stays at the end
        this.ensureButtonPosition();
    }

    /**
     * Reorder items to match the function order
     * @param {Array} functions - List of function objects in desired order
     */
    reorderItems(functions) {
        // Build array of elements in current DOM order
        const currentOrder = Array.from(this.container.children).filter(
            el => el.classList.contains('expression-item')
        );

        // Build array of elements in desired order
        const desiredOrder = functions.map(func => {
            const item = this.renderedItems.get(func.id);
            return item ? item.element : null;
        }).filter(el => el !== null);

        // Only reorder if order actually changed
        const needsReorder = currentOrder.length !== desiredOrder.length ||
            !currentOrder.every((el, i) => el === desiredOrder[i]);

        if (needsReorder) {
            // AppendChild moves existing nodes, so we can just append in order
            desiredOrder.forEach(el => {
                this.container.appendChild(el);
            });
        }
    }

    /**
     * Ensure the add button is always positioned at the end of the container
     */
    ensureButtonPosition() {
        if (!this.addButton || !this.container) return;

        // If button is not the last child, move it to the end
        const lastChild = this.container.lastElementChild;
        if (lastChild !== this.addButton) {
            this.container.appendChild(this.addButton);
        }
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    roundToStep(value, step) {
        if (!Number.isFinite(step) || step <= 0) {
            return value;
        }
        const scaled = value / step;
        return Math.round(scaled) * step;
    }

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

    formatValue(value, step) {
        const decimals = this.getStepDecimals(step);
        const rounded = this.roundToStep(value, step);
        if (decimals === 0) {
            return `${Math.round(rounded)}`;
        }
        return rounded.toFixed(decimals);
    }

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

    hasParameterChanged(current, next) {
        if (!current) return true;
        return current.value !== next.value ||
            current.min !== next.min ||
            current.max !== next.max ||
            current.step !== next.step;
    }

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

    applySliderConfig(item, config) {
        if (!item.slider) return;

        item.slider.config.min = config.min;
        item.slider.config.max = config.max;
        item.slider.config.step = config.step;

        if (item.slider.wrapper) {
            item.slider.wrapper.setAttribute('aria-valuemin', config.min);
            item.slider.wrapper.setAttribute('aria-valuemax', config.max);
        }

        item.slider.setValue(config.value, null, false);
    }

    syncSliderSettingsInputs(item, config) {
        if (!item.settingsInputs || item.settingsInputs.length === 0) return;
        item.settingsInputs.forEach(inputEl => {
            const key = inputEl.dataset.setting;
            if (key && config[key] !== undefined) {
                inputEl.value = config[key];
            }
        });
    }

    toggleSliderSettings(id) {
        const item = this.renderedItems.get(id);
        if (!item || !item.settingsPanel) return;

        item.settingsOpen = !item.settingsOpen;
        item.settingsPanel.hidden = !item.settingsOpen;
        if (item.settingsToggle) {
            item.settingsToggle.classList.toggle('is-open', item.settingsOpen);
        }
    }

    commitSliderSettings(id) {
        const item = this.renderedItems.get(id);
        if (!item || !item.paramName) return;

        const current = this.getParameterConfig(item.paramName);
        const updates = {};

        item.settingsInputs.forEach(inputEl => {
            const key = inputEl.dataset.setting;
            const value = Number.parseFloat(inputEl.value);
            if (key && Number.isFinite(value)) {
                updates[key] = value;
            }
        });

        const next = this.setParameterConfig(item.paramName, updates);

        if (item.slider && !item.slider.isDragging) {
            this.applySliderConfig(item, next);
        }

        this.syncSliderSettingsInputs(item, next);

        if (next.value !== current.value) {
            const formatted = this.formatValue(next.value, next.step);
            this.updateExpression(id, `${item.paramName} = ${formatted}`);
            EventBus.publish('parameters:updated', {
                [item.paramName]: next.value
            });
        }
    }

    resetSliderSettings(id) {
        const item = this.renderedItems.get(id);
        if (!item || !item.paramName) return;

        const current = this.getParameterConfig(item.paramName);
        const updates = {
            min: DEFAULT_PARAMETER.min,
            max: DEFAULT_PARAMETER.max,
            step: DEFAULT_PARAMETER.step
        };

        const next = this.setParameterConfig(item.paramName, updates);

        if (item.slider && !item.slider.isDragging) {
            this.applySliderConfig(item, next);
        }

        this.syncSliderSettingsInputs(item, next);

        if (next.value !== current.value) {
            const formatted = this.formatValue(next.value, next.step);
            this.updateExpression(id, `${item.paramName} = ${formatted}`);
            EventBus.publish('parameters:updated', {
                [item.paramName]: next.value
            });
        }
    }

    updateSlidersFromState() {
        // Update sliders if parameters changed externally (e.g. assignment edits)
        const parameters = StateManager.get('parameters') || {};
        this.renderedItems.forEach(item => {
            if (!item.slider || !item.paramName) return;
            const paramConfig = parameters[item.paramName];
            if (!paramConfig) return;

            const normalized = this.normalizeParameterConfig(paramConfig);

            if (!item.slider.isDragging) {
                const needsRangeUpdate = item.slider.config.min !== normalized.min ||
                    item.slider.config.max !== normalized.max ||
                    item.slider.config.step !== normalized.step;

                if (needsRangeUpdate) {
                    this.applySliderConfig(item, normalized);
                } else {
                    const currentValue = item.slider.getValue();
                    if (currentValue !== normalized.value) {
                        item.slider.setValue(normalized.value, null, false);
                    }
                }
            }

            this.syncSliderSettingsInputs(item, normalized);
        });
    }

    /**
     * Handle expression commit (blur/Enter) - log  activity if expression changed
     * @param {string} id - Expression ID
     */
    handleExpressionCommit(id) {
        const item = this.renderedItems.get(id);
        if (!item || item.editStartExpression === undefined) return;

        const oldExpression = item.editStartExpression || '';
        const functions = StateManager.get('functions') || [];
        const currentFunc = functions.find(func => func.id === id);
        const newExpression = currentFunc ? currentFunc.expression : item.inputEl.value || '';
        const error = currentFunc ? currentFunc.error : null;

        // Only log if expression actually changed
        if (oldExpression.trim() !== newExpression.trim()) {
            this.logModified(id, oldExpression, newExpression, { error });
        }

        // Clear edit start expression after logging
        item.editStartExpression = undefined;
    }

    /**
     * Generate a simple sequential ID for regular expressions
     * @param {Array} existingFunctions - Current functions array
     * @returns {string} Next available expression ID (e.g., expr_1, expr_2)
     * @private
     */
    _generateExpressionId(existingFunctions) {
        const ids = existingFunctions.map(f => f.id);
        const exprNumbers = ids
            .filter(id => /^expr_\d+$/.test(id))
            .map(id => parseInt(id.replace('expr_', '')))
            .filter(n => !isNaN(n));
        const nextNum = exprNumbers.length > 0 ? Math.max(...exprNumbers) + 1 : 1;
        return `expr_${nextNum}`;
    }

    addExpression() {
        const currentFunctions = StateManager.get('functions') || [];
        const newId = this._generateExpressionId(currentFunctions);
        // Simple color cycle
        const nextColor = COLORS[currentFunctions.length % COLORS.length];

        const newFunc = {
            id: newId,
            expression: '',
            color: nextColor,
            visible: true
        };

        // Log activity before state update
        this.logCreated(newId);

        StateManager.set('functions', [...currentFunctions, newFunc]);
    }

    updateExpression(id, newExpression) {
        const functions = [...StateManager.get('functions')];
        const index = functions.findIndex(f => f.id === id);

        if (index !== -1) {
            const classification = classifyLine(newExpression, this.parser);
            const nextFunc = {
                ...functions[index],
                expression: newExpression,
                error: classification.error,
                kind: classification.kind,
                paramName: classification.paramName ?? null,
                value: classification.value ?? null,
                usedVariables: classification.usedVariables ?? [],
                plotExpression: classification.plotExpression ?? null
            };

            functions[index] = nextFunc;
            StateManager.set('functions', functions);
            EventBus.publish('expression:updated', functions);

            if (classification.kind === 'assignment' && classification.paramName) {
                const nextConfig = this.setParameterConfig(
                    classification.paramName,
                    { value: classification.value },
                    { merge: true, expandRange: true }
                );
                EventBus.publish('parameters:updated', {
                    [classification.paramName]: nextConfig.value
                });
            }
        }
    }

    toggleVisibility(id) {
        const functions = [...StateManager.get('functions')];
        const index = functions.findIndex(f => f.id === id);
        if (index !== -1) {
            functions[index] = { ...functions[index], visible: !functions[index].visible };
            StateManager.set('functions', functions);
        }
    }

    deleteExpression(id) {
        const functions = StateManager.get('functions') || [];
        const deleted = functions.find(f => f.id === id);

        // Log activity before state update
        const expressionText = deleted ? deleted.expression : null;
        this.logDeleted(id, expressionText);

        const filteredFunctions = functions.filter(f => f.id !== id);
        StateManager.set('functions', filteredFunctions);
    }

    /**
     * Enable or disable debug mode
     * @param {boolean} enabled - Whether debug mode should be enabled
     */
    setDebug(enabled) {
        this.debug = enabled;
    }

    logCreated(id) {
        Logger.logActivity(`Created expression ${id}`);
    }

    logModified(id, oldExpr, newExpr, options = {}) {
        const paramName = options.paramName;
        const error = options.error;
        let messageBase = `Modified expression ${id}: ${oldExpr} -> ${newExpr}`;
        if (paramName) {
            messageBase = `Modified expression ${id} (parameter: ${paramName}): ` +
                `${oldExpr} -> ${newExpr}`;
        }
        const message = error ? `${messageBase} (invalid: ${error})` : messageBase;
        Logger.logActivity(message);
    }

    logDeleted(id, expression) {
        const expressionText = expression || id;
        Logger.logActivity(`Deleted expression: ${expressionText}`);
    }

    /**
     * Clean up resources and event listeners
     */
    destroy() {
        // Clean up StateManager subscriptions
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];

        // Clean up rendered items (sliders, DOM elements)
        this.renderedItems.forEach(item => {
            if (item.slider) {
                item.slider.destroy();
            }
        });
        this.renderedItems.clear();

        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
