/**
 * Expression List Component
 * Handles the list of mathematical expressions in the sidebar.
 */

import StateManager from '../core/state-manager.js';
import EventBus from '../core/event-bus.js';
import NumericSlider from '../design-system/components/numeric-slider/numeric-slider.js';
import ExpressionParser from '../math/expression-parser.js';

export default class ExpressionList {
    constructor(containerId, addButtonId) {
        this.container = document.getElementById(containerId);
        this.addButton = document.getElementById(addButtonId);
        this.boundRender = this.render.bind(this);
        this.renderedItems = new Map(); // id -> { element, slider, inputEl, colorEl, errorEl, sliderContainer, lastColor, varName }
        this.unsubscribers = [];
        this.debug = false;
        this.parser = new ExpressionParser();
    }

    init() {
        if (!this.container || !this.addButton) {
            console.error('[ExpressionList] Container or Add Button not found');
            return;
        }

        // Subscribe to functions changes
        this.unsubscribers.push(
            StateManager.subscribe('functions', this.boundRender)
        );

        // Initial render
        this.render(StateManager.get('functions'));

        // Bind Add Button
        this.addButton.addEventListener('click', () => {
            this.addExpression();
        });

        // Subscribe to controls changes to update slider values if changed externally (e.g. by another expression)
        this.unsubscribers.push(
            StateManager.subscribe('controls', () => {
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
            console.log('[ExpressionList] Rendering', functions, functions ? functions.length : 0);
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
                this.container.innerHTML = '<div style="padding: 1rem; color: var(--color-text-weak);">No expressions added</div>';
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
     * Create a new expression item
     * @param {Object} func - Function object
     * @param {number} index - Index in the list
     */
    createItem(func, index) {
        const item = document.createElement('div');
        item.className = 'expression-item';
        if (func.error) item.classList.add('has-error');

        item.innerHTML = `
        <div class="expression-color" style="background-color: ${func.color};" title="Toggle Visibility"></div>
        <div class="expression-main" style="flex: 1;">
            <div class="expression-input-container">
                <input type="text" class="expression-input input" value="${this.escapeHtml(func.expression)}" placeholder="Enter expression..." data-id="${func.id}">
                <div class="expression-error">${this.escapeHtml(func.error || '')}</div>
            </div>
            <div class="expression-slider-container" id="slider-container-${func.id}"></div>
        </div>
        <button class="button button-text button-medium" data-id="${func.id}" title="Delete" aria-label="Delete expression"><span class="icon icon-trash icon-medium"></span></button>
      `;

        // Get references to DOM elements
        const input = item.querySelector('.expression-input');
        const colorBtn = item.querySelector('.expression-color');
        const deleteBtn = item.querySelector('button[data-id]');
        const errorEl = item.querySelector('.expression-error');
        const sliderContainer = item.querySelector(`#slider-container-${func.id}`);

        // Event Listeners
        input.addEventListener('input', (e) => {
            this.updateExpression(func.id, e.target.value);
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
            colorEl: colorBtn,
            errorEl: errorEl,
            sliderContainer: sliderContainer,
            slider: null,
            lastColor: func.color,
            varName: null
        };

        this.renderedItems.set(func.id, itemData);

        // Apply initial state
        this.updateVisibilityState(itemData, func.visible);
        this.updateErrorState(itemData, func.error);

        // Check for parameter definition and create slider if needed
        this.reconcileSlider(func, itemData);

        // Append to container
        this.container.appendChild(item);
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

        // Handle slider lifecycle
        this.reconcileSlider(func, item);
    }


    /**
     * Handle auto-conversion of single variable to assignment
     * @param {Object} func - Function object
     * @param {Object} item - Item data from renderedItems Map
     * @param {Object} singleVar - Result from parser.isSingleVariable()
     * @returns {boolean} True if conversion happened (should return early)
     */
    handleAutoConversion(func, item, singleVar) {
        if (!singleVar.isVariable || item.slider) return false;

        const isInputFocused = item.inputEl && document.activeElement === item.inputEl;
        if (isInputFocused) return false;

        const varName = singleVar.varName;
        const defaultVal = 1.0; // Default value for new parameters (matches GraphEngine)
        const newExpr = `${varName} = ${defaultVal}`;

        this.updateExpression(func.id, newExpr);
        return true; // Conversion happened, should return early
    }

    /**
     * Create slider for an assignment expression
     * @param {Object} func - Function object
     * @param {Object} item - Item data from renderedItems Map
     * @param {string} varName - Variable name
     * @param {number} value - Initial value
     */
    createSliderForAssignment(func, item, varName, value) {
        const slider = new NumericSlider(item.sliderContainer, {
            type: 'single',
            min: -10,
            max: 10,
            step: 0.1,
            value: value,
            showInputs: false,
            onChange: (newValue) => {
                // Update Control State
                StateManager.set(`controls.${varName}`, newValue, { silent: true });

                // Update Expression Text to match
                const newExpr = `${varName} = ${newValue}`;

                // Update local input value immediately for responsiveness
                if (item.inputEl) item.inputEl.value = newExpr;

                // Update State
                this.updateExpression(func.id, newExpr);

                // Publish event for graph
                EventBus.publish('controls:updated', { [varName]: newValue });
            }
        });

        item.slider = slider;
        item.varName = varName;

        // Ensure the control exists in StateManager
        const currentControl = StateManager.get(`controls.${varName}`);
        if (currentControl === undefined || currentControl !== value) {
            StateManager.set(`controls.${varName}`, value, { silent: true });
        }
    }

    /**
     * Destroy slider for an expression item
     * @param {Object} item - Item data from renderedItems Map
     */
    destroySlider(item) {
        if (item.slider) {
            item.slider.destroy();
            item.slider = null;
            item.varName = null;
            item.sliderContainer.innerHTML = '';
        }
    }

    /**
     * Reconcile slider for an expression item
     * @param {Object} func - Function object
     * @param {Object} item - Item data from renderedItems Map
     */
    reconcileSlider(func, item) {
        const assignment = this.parser.isAssignmentExpression(func.expression, this.debug);
        const singleVar = this.parser.isSingleVariable(func.expression);

        // Handle auto-conversion of single variable to assignment
        if (this.handleAutoConversion(func, item, singleVar)) {
            return; // Conversion happened, will trigger re-render
        }

        // Create slider for assignment expressions
        if (assignment.isAssignment && !item.slider) {
            this.createSliderForAssignment(func, item, assignment.varName, assignment.value);
            return;
        }

        // Destroy slider if expression is no longer a parameter
        if (!assignment.isAssignment && !singleVar.isVariable && item.slider) {
            this.destroySlider(item);
            return;
        }

        // Update slider value if assignment value changed externally
        if (assignment.isAssignment && item.slider) {
            const val = assignment.value;
            const currentValue = item.slider.getValue();
            if (currentValue !== val && !item.slider.isDragging) {
                item.slider.setValue(val, null, false);
            }
        }
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
        // Update sliders if controls changed externally (optional bi-directional sync)
        const controls = StateManager.get('controls') || {};
        this.renderedItems.forEach((item, id) => {
            if (item.slider && item.varName) {
                const controlValue = controls[item.varName];
                if (controlValue !== undefined && !item.slider.isDragging) {
                    const currentValue = item.slider.getValue();
                    if (currentValue !== controlValue) {
                        item.slider.setValue(controlValue, null, false);
                    }
                }
            }
        });
    }

    addExpression() {
        const currentFunctions = StateManager.get('functions') || [];
        const newId = `expr_${Date.now()}`;
        // Simple color cycle
        const colors = ['#4A90E2', '#50E3C2', '#F5A623', '#D0021B', '#BD10E0', '#B8E986'];
        const nextColor = colors[currentFunctions.length % colors.length];

        const newFunc = {
            id: newId,
            expression: '',
            color: nextColor,
            visible: true
        };

        StateManager.set('functions', [...currentFunctions, newFunc]);
    }

    updateExpression(id, newExpression) {
        const functions = [...StateManager.get('functions')];
        const index = functions.findIndex(f => f.id === id);

        if (index !== -1) {
            // Validate expression and extract error
            let error = null;
            if (newExpression && newExpression.trim() !== '') {
                const parser = new ExpressionParser();
                try {
                    // Get all variables that might be in scope (x + any controls)
                    const controls = StateManager.get('controls') || {};
                    const variables = ['x', ...Object.keys(controls)];
                    const parsed = parser.parse(newExpression, variables);
                    if (!parsed.isValid) {
                        error = parsed.error;
                    }
                } catch (e) {
                    // If parsing throws, use the error message
                    error = e.message || 'Invalid expression';
                }
            }
            // Empty expressions are allowed (no error)

            functions[index] = { ...functions[index], expression: newExpression, error };
            StateManager.set('functions', functions);
            EventBus.publish('expression:updated', functions);
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
        const functions = StateManager.get('functions').filter(f => f.id !== id);
        StateManager.set('functions', functions);
    }

    /**
     * Enable or disable debug mode
     * @param {boolean} enabled - Whether debug mode should be enabled
     */
    setDebug(enabled) {
        this.debug = enabled;
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
