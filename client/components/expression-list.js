/**
 * Expression List Component
 * Handles the list of mathematical expressions in the sidebar.
 */

import StateManager from '../core/state-manager.js';
import EventBus from '../core/event-bus.js';
import ParameterSlider from './parameter-slider.js';
import sharedParser from '../math/shared-parser.js';
import { classifyLine } from '../math/line-classifier.js';
import { DEFAULT_PARAMETER } from '../math/parameter-defaults.js';
import { toLatex, renderLatex } from '../utils/math-formatter.js';
import Logger from '../utils/logger.js';
import { getColorForIndex } from '../utils/color-constants.js';

export default class ExpressionList {
    constructor(containerId, addButtonId) {
        this.container = document.getElementById(containerId);
        this.addButton = document.getElementById(addButtonId);
        this.boundRender = this.render.bind(this);
        // id -> { element, parameterSlider, inputEl, latexEl, colorEl, errorEl, sliderContainer, ... }
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

        // Subscribe to functions changes via EventBus
        this.unsubscribers.push(
            EventBus.subscribe('state:changed:functions', (data) => {
                this.handleFunctionsUpdate(data.value);
            }, { immediate: true })
        );

        // Bind Add Button
        this.addButton.addEventListener('click', () => {
            this.addExpression();
        });

        // Subscribe to parameter changes to update slider values if changed externally
        this.unsubscribers.push(
            EventBus.subscribe('state:changed:parameters', () => {
                this.updateSlidersFromState();
            }, { immediate: true })
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

    getClassificationMetadata(expression, classificationOverride = null) {
        const classification = classificationOverride ??
            classifyLine(expression || '', this.parser);

        return {
            error: classification.error ?? null,
            kind: classification.kind,
            paramName: classification.paramName ?? null,
            value: classification.value ?? null,
            usedVariables: Array.isArray(classification.usedVariables)
                ? classification.usedVariables
                : [],
            plotExpression: classification.plotExpression ?? null
        };
    }

    handleFunctionsUpdate(functions) {
        if (!functions) return;

        const updated = functions.map(func => {
            const meta = this.getClassificationMetadata(func.expression);
            const item = this.renderedItems.get(func.id);
            if (item?.isEditing && meta.error === 'Syntax error') {
                meta.error = null;
            }
            return { ...func, ...meta };
        });

        const needsUpdate = updated.some((nextFunc, idx) => {
            const prev = functions[idx];
            if (!prev) return true;

            const prevVars = prev.usedVariables || [];
            const nextVars = nextFunc.usedVariables || [];
            const prevVarsSet = new Set(prevVars);
            const nextVarsSet = new Set(nextVars);
            const varsMatch = prevVars.length === nextVars.length &&
                prevVars.every(val => nextVarsSet.has(val)) &&
                nextVars.every(val => prevVarsSet.has(val));

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
            // Re-classify with isEditing=false to surface suppressed errors
            this.handleFunctionsUpdate(StateManager.get('functions'));
            // Check for auto-conversion after blur
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

        // Store item data
        const itemData = {
            element: item,
            inputEl: input,
            latexEl: latexEl,
            colorEl: colorBtn,
            errorEl: errorEl,
            sliderContainer: sliderContainer,
            parameterSlider: null,
            lastColor: func.color,
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
        if (!param.isParameter || item.parameterSlider) return false;

        const isInputFocused = item.inputEl && document.activeElement === item.inputEl;
        if (isInputFocused) return false;

        const paramName = param.paramName;
        const defaultVal = DEFAULT_PARAMETER.value;
        const formatted = this._formatValueForDisplay(defaultVal, DEFAULT_PARAMETER.step);
        const newExpr = `${paramName} = ${formatted}`;

        this.updateExpression(func.id, newExpr);
        return true; // Conversion happened, should return early
    }

    /**
     * Format value for display in expression (helper for auto-conversion)
     * @param {number} value - Value to format
     * @param {number} step - Step size
     * @returns {string} Formatted value string
     * @private
     */
    _formatValueForDisplay(value, step) {
        const decimals = this._getStepDecimals(step);
        const rounded = this._roundToStep(value, step);
        if (decimals === 0) {
            return `${Math.round(rounded)}`;
        }
        return rounded.toFixed(decimals);
    }

    /**
     * Round value to nearest step (helper for auto-conversion)
     * @param {number} value - Value to round
     * @param {number} step - Step size
     * @returns {number} Rounded value
     * @private
     */
    _roundToStep(value, step) {
        if (!Number.isFinite(step) || step <= 0) {
            return value;
        }
        const scaled = value / step;
        return Math.round(scaled) * step;
    }

    /**
     * Get number of decimal places for step (helper for auto-conversion)
     * @param {number} step - Step size
     * @returns {number} Number of decimal places
     * @private
     */
    _getStepDecimals(step) {
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
            if (item.parameterSlider) {
                item.parameterSlider.destroy();
                item.parameterSlider = null;
            }
            if (item.sliderContainer) {
                item.sliderContainer.style.display = 'none';
            }
            return;
        }

        const paramName = classification.paramName;
        const value = classification.value;

        // Create or update ParameterSlider
        if (!item.parameterSlider) {
            // Create new ParameterSlider instance
            item.parameterSlider = new ParameterSlider(
                item.sliderContainer,
                paramName,
                { value },
                {
                    onChange: ({ oldValue, newValue, isDiscrete, paramName: pName }) => {
                        // Format values for expression display
                        const paramConfig = StateManager.get(`parameters.${pName}`) || {};
                        const step = paramConfig.step || DEFAULT_PARAMETER.step;
                        const formatValue = (val) => {
                            const decimals = this._getStepDecimals(step);
                            const rounded = this._roundToStep(val, step);
                            return decimals === 0 ? `${Math.round(rounded)}` : rounded.toFixed(decimals);
                        };
                        const oldExpr = `${pName} = ${formatValue(oldValue)}`;
                        const newExpr = `${pName} = ${formatValue(newValue)}`;

                        // Update expression in state
                        this.updateExpression(func.id, newExpr);

                        // Update local input value immediately for responsiveness
                        if (item.inputEl) {
                            item.inputEl.value = newExpr;
                        }

                        // Log user action
                        this.logModified(func.id, oldExpr, newExpr, { paramName: pName });
                    }
                }
            );
        } else if (item.parameterSlider.paramName !== paramName) {
            // Parameter name changed - destroy old and create new
            item.parameterSlider.destroy();
            item.parameterSlider = new ParameterSlider(
                item.sliderContainer,
                paramName,
                { value },
                {
                    onChange: ({ oldValue, newValue, isDiscrete, paramName: pName }) => {
                        // Format values for expression display
                        const paramConfig = StateManager.get(`parameters.${pName}`) || {};
                        const step = paramConfig.step || DEFAULT_PARAMETER.step;
                        const formatValue = (val) => {
                            const decimals = this._getStepDecimals(step);
                            const rounded = this._roundToStep(val, step);
                            return decimals === 0 ? `${Math.round(rounded)}` : rounded.toFixed(decimals);
                        };
                        const oldExpr = `${pName} = ${formatValue(oldValue)}`;
                        const newExpr = `${pName} = ${formatValue(newValue)}`;

                        // Update expression in state
                        this.updateExpression(func.id, newExpr);

                        // Update local input value immediately for responsiveness
                        if (item.inputEl) {
                            item.inputEl.value = newExpr;
                        }

                        // Log user action
                        this.logModified(func.id, oldExpr, newExpr, { paramName: pName });
                    }
                }
            );
        }

        if (item.sliderContainer) {
            item.sliderContainer.style.display = 'block';
        }

        // Update slider if config changed externally
        const paramConfig = StateManager.get(`parameters.${paramName}`) || {};
        if (paramConfig.value === undefined) {
            paramConfig.value = value;
        }
        item.parameterSlider.updateConfig(paramConfig);
    }

    /**
     * Remove an expression item
     * @param {string} id - Function ID
     */
    removeItem(id) {
        const item = this.renderedItems.get(id);
        if (!item) return;

        // Clean up ParameterSlider
        if (item.parameterSlider) {
            item.parameterSlider.destroy();
            item.parameterSlider = null;
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

    updateSlidersFromState() {
        // Update sliders if parameters changed externally (e.g. assignment edits)
        const parameters = StateManager.get('parameters') || {};
        this.renderedItems.forEach(item => {
            if (!item.parameterSlider) return;
            const paramName = item.parameterSlider.paramName;
            const paramConfig = parameters[paramName];
            if (!paramConfig) return;

            item.parameterSlider.updateConfig(paramConfig);
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
        const newExpression = currentFunc
            ? currentFunc.expression
            : item.inputEl.value || '';

        const meta = this.getClassificationMetadata(newExpression);

        if (oldExpression.trim() !== newExpression.trim()) {
            this.logModified(id, oldExpression, newExpression, { error: meta.error });
        }

        EventBus.publish('expressions:committed', { id });
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
        const nextColor = getColorForIndex(currentFunctions.length);

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
            functions[index] = {
                ...functions[index],
                expression: newExpression,
                ...this.getClassificationMetadata(newExpression)
            };
            StateManager.set('functions', functions);
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

        // Clean up rendered items (ParameterSliders, DOM elements)
        this.renderedItems.forEach(item => {
            if (item.parameterSlider) {
                item.parameterSlider.destroy();
            }
        });
        this.renderedItems.clear();

        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
