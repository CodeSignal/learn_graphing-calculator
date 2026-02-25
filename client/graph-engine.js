/**
 * Graph Rendering Engine
 * Handles Canvas rendering, coordinate transformations, and user interaction.
 */

import StateManager from './core/state-manager.js';
import EventBus from './core/event-bus.js';
import FunctionEvaluator from './math/function-evaluator.js';
import sharedParser from './math/shared-parser.js';
import { classifyLine, VERTICAL_LINE_MARKER } from './math/line-classifier.js';
import { analyzeParameters } from './math/parameter-utils.js';
import { DEFAULT_PARAMETER } from './math/parameter-defaults.js';
import { COLORS } from './utils/color-constants.js';
import { DEFAULT_VIEWPORT_BOUNDS } from './core/config-loader.js';

export default class GraphEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Initialize viewport with defaults (will be synced from state.graph in init)
        this.viewport = { ...DEFAULT_VIEWPORT_BOUNDS };
        this.width = 0;
        this.height = 0;

        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };

        // Performance: Throttle/Debounce
        this.frameId = null;
        this.parameterDetectionTimeout = null;
        this.saveTimeout = null;

        this.evaluator = new FunctionEvaluator(null, sharedParser);

        // Cleanup tracking
        this.unsubscribers = [];

        // Bind methods
        this.boundRender = this.render.bind(this);
        this.boundOnResize = this.onResize.bind(this);
    }

    init() {
        this.onResize();
        window.addEventListener('resize', this.boundOnResize);

        // Event Listeners for Interaction
        this.setupInteractions();

        // Subscribe to State
        this.unsubscribers.push(
            EventBus.subscribe('state:changed', (data) => {
                // If graph changed externally (e.g. reset button)
                if (data.path === 'graph') {
                    this.syncViewportFromGraph(data.value);
                    this.requestRender();
                }
            })
        );

        // Listen for parameter updates (sliders)
        this.unsubscribers.push(
            EventBus.subscribe('parameters:updated', () => {
                this.requestRender();
            })
        );

        // Listen for functions updates from StateManager (e.g. add/remove)
        this.unsubscribers.push(
            EventBus.subscribe('state:changed:functions', () => {
                this.requestRender();
                this.scheduleParameterDetection();
            })
        );

        // Initial load of graph from state if exists
        const storedGraph = StateManager.get('graph');
        if (storedGraph) {
            this.syncViewportFromGraph(storedGraph);
        }

        // Detect parameters from initial expressions
        this.detectAndUpdateParameters();

        this.requestRender();
    }

    setupInteractions() {
        // Mouse Down (Start Pan)
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
        });

        // Mouse Move (Pan & Trace)
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;
                this.pan(dx, dy);
                this.lastMouse = { x: e.clientX, y: e.clientY };
            } else {
                // Trace coordinates
                this.updateCursorInfo(e.offsetX, e.offsetY);
            }
        });

        // Mouse Up (End Pan)
        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'crosshair';
            this.saveViewportState();
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'crosshair';
        });

        // Wheel (Zoom)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

            // Zoom towards mouse pointer
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            this.zoomAtPoint(zoomFactor, x, y);
        }, { passive: false });
    }

    onResize() {
        const parent = this.canvas.parentElement;
        if (parent) {
            this.canvas.width = parent.clientWidth;
            this.canvas.height = parent.clientHeight;
            this.width = this.canvas.width;
            this.height = this.canvas.height;
            this.requestRender();
        }
    }

    // Coordinate Transformations
    xToPixel(x) {
        return ((x - this.viewport.xMin) /
            (this.viewport.xMax - this.viewport.xMin)) * this.width;
    }

    yToPixel(y) {
        // Invert Y because canvas Y grows downwards
        return this.height - ((y - this.viewport.yMin) /
            (this.viewport.yMax - this.viewport.yMin)) * this.height;
    }

    pixelToX(px) {
        return this.viewport.xMin +
            (px / this.width) * (this.viewport.xMax - this.viewport.xMin);
    }

    pixelToY(py) {
        return this.viewport.yMin +
            ((this.height - py) / this.height) *
            (this.viewport.yMax - this.viewport.yMin);
    }

    // Navigation
    pan(dxPixels, dyPixels) {
        const dxUnits = dxPixels * (this.viewport.xMax - this.viewport.xMin) / this.width;
        const dyUnits = dyPixels * (this.viewport.yMax - this.viewport.yMin) / this.height;

        this.viewport.xMin -= dxUnits;
        this.viewport.xMax -= dxUnits;
        // Canvas Y grows downward, so dragging down (dy>0) shows higher y values
        this.viewport.yMin += dyUnits;
        this.viewport.yMax += dyUnits;

        this.requestRender();
    }

    zoomAtPoint(factor, px, py) {
        const xBefore = this.pixelToX(px);
        const yBefore = this.pixelToY(py);

        const rangeX = this.viewport.xMax - this.viewport.xMin;
        const rangeY = this.viewport.yMax - this.viewport.yMin;

        const newRangeX = rangeX / factor;
        const newRangeY = rangeY / factor;

        // We want pixelToX(px) to remain xBefore.
        // xBefore = newMin + (px/width) * newRange
        // newMin = xBefore - (px/width) * newRange

        this.viewport.xMin = xBefore - (px / this.width) * newRangeX;
        this.viewport.xMax = this.viewport.xMin + newRangeX;

        this.viewport.yMin = yBefore - ((this.height - py) / this.height) * newRangeY;
        this.viewport.yMax = this.viewport.yMin + newRangeY;

        this.requestRender();
        this.debounceSaveViewport();
    }

    zoom(factor) {
        // Center zoom
        this.zoomAtPoint(factor, this.width / 2, this.height / 2);
    }

    saveViewportState() {
        // Get current graph config and update bounds
        const currentGraph = StateManager.get('graph') || {};
        StateManager.set('graph', {
            ...currentGraph,
            xMin: this.viewport.xMin,
            xMax: this.viewport.xMax,
            yMin: this.viewport.yMin,
            yMax: this.viewport.yMax
        });
    }

    /**
     * Sync internal viewport from graph config
     * @private
     */
    syncViewportFromGraph(graph) {
        if (graph && typeof graph.xMin === 'number' && typeof graph.xMax === 'number' &&
            typeof graph.yMin === 'number' && typeof graph.yMax === 'number') {
            this.viewport = {
                xMin: graph.xMin,
                xMax: graph.xMax,
                yMin: graph.yMin,
                yMax: graph.yMax
            };
        }
    }

    debounceSaveViewport() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveViewportState(), 500);
    }

    updateCursorInfo(px, py) {
        const x = this.pixelToX(px);
        const y = this.pixelToY(py);

        const info = document.getElementById('cursor-info');
        if (info) {
            info.textContent = `x: ${x.toFixed(2)}, y: ${y.toFixed(2)}`;
        }
    }

    // Rendering
    requestRender() {
        if (!this.frameId) {
            this.frameId = requestAnimationFrame(this.boundRender);
        }
    }

    render() {
        this.frameId = null;

        // Clear
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw Grid
        this.drawGrid();

        // Draw Axes
        this.drawAxes();

        // Draw Functions
        const functions = StateManager.get('functions') || [];
        const scope = StateManager.getControlValues();

        functions.forEach(func => {
            if (!func.visible || !func.expression) return;
            const classification = classifyLine(func.expression, sharedParser);
            if (classification.kind !== 'graph' || classification.error) return;

            // Handle vertical lines (x = constant)
            if (classification.plotExpression === VERTICAL_LINE_MARKER && classification.verticalLineX !== null) {
                this.drawVerticalLine(classification.verticalLineX, func.color, 2);
                return;
            }

            // Handle regular graph expressions
            if (!classification.plotExpression) return;
            this.drawFunction(func, classification.plotExpression, scope);
        });
    }

    /**
     * Schedule parameter detection with debouncing
     * Prevents rapid-fire updates during typing
     */
    scheduleParameterDetection() {
        if (this.parameterDetectionTimeout) {
            clearTimeout(this.parameterDetectionTimeout);
        }
        this.parameterDetectionTimeout = setTimeout(() => {
            this.detectAndUpdateParameters();
        }, 300);
    }

    /**
     * Detect new parameters from expressions and update parameters state
     * Called outside render cycle to prevent state mutations during rendering
     * Also auto-creates assignment expressions for newly detected parameters
     */
    detectAndUpdateParameters() {
        const functions = StateManager.get('functions') || [];
        const parameters = { ...(StateManager.get('parameters') || {}) };
        const analysis = analyzeParameters(functions, sharedParser);

        let parametersChanged = false;

        const ensureParameter = (paramName, nextValue = null) => {
            const existing = parameters[paramName];
            const value = typeof nextValue === 'number'
                ? nextValue
                : existing?.value ?? DEFAULT_PARAMETER.value;

            const next = {
                ...DEFAULT_PARAMETER,
                ...(existing || {}),
                value
            };

            const hasChange = !existing ||
                existing.value !== next.value ||
                existing.min !== next.min ||
                existing.max !== next.max ||
                existing.step !== next.step;

            if (hasChange) {
                parameters[paramName] = next;
                parametersChanged = true;
            }
        };

        analysis.definedParams.forEach(paramName => {
            ensureParameter(paramName, analysis.assignmentValues.get(paramName));
        });

        analysis.usedParams.forEach(paramName => {
            ensureParameter(paramName, parameters[paramName]?.value);
        });

        if (parametersChanged) {
            StateManager.set('parameters', parameters);
        }

        if (analysis.missingAssignments.length > 0) {
            this.createAssignmentExpressionsForParameters(
                analysis.missingAssignments,
                functions,
                parameters
            );
        }
    }

    /**
     * Generate a semantic ID for assignment expressions based on parameter name
     * @param {string} paramName - Parameter name (e.g., 'a', 'b', 'm')
     * @param {Array} existingFunctions - Current functions array
     * @returns {string} Available assignment ID (e.g., param_a, param_a_2)
     * @private
     */
    _generateAssignmentId(paramName, existingFunctions) {
        const baseId = `param_${paramName}`;
        const ids = new Set(existingFunctions.map(f => f.id));

        if (!ids.has(baseId)) {
            return baseId;
        }

        // Try numbered variants
        let counter = 2;
        let candidateId = `${baseId}_${counter}`;
        while (ids.has(candidateId)) {
            counter++;
            candidateId = `${baseId}_${counter}`;
        }
        return candidateId;
    }

    /**
     * Create assignment expressions for parameters that don't already have assignments
     * @param {string[]} paramNames - Array of parameter names to create assignments for
     * @param {Array} existingFunctions - Current functions array
     * @private
     */
    createAssignmentExpressionsForParameters(paramNames, existingFunctions, parameters) {
        const functionsToAdd = [];

        paramNames.forEach(paramName => {
            // Check if assignment expression already exists for this parameter
            const hasAssignment = existingFunctions.some(func => {
                if (!func.expression) return false;
                const assignment = classifyLine(func.expression, sharedParser);
                return assignment.kind === 'assignment' && assignment.paramName === paramName;
            });

            // Only create if no assignment exists
            if (!hasAssignment) {
                // Check against both existing functions and functions being added in this batch
                const allFunctions = [...existingFunctions, ...functionsToAdd];
                const newId = this._generateAssignmentId(paramName, allFunctions);
                const currentFunctionCount = existingFunctions.length + functionsToAdd.length;
                const nextColor = COLORS[currentFunctionCount % COLORS.length];
                const currentValue = parameters?.[paramName]?.value ?? DEFAULT_PARAMETER.value;

                functionsToAdd.push({
                    id: newId,
                    expression: `${paramName} = ${currentValue}`,
                    color: nextColor,
                    visible: true
                });
            }
        });

        // Add new functions if any were created
        if (functionsToAdd.length > 0) {
            const currentFunctions = StateManager.get('functions') || [];
            StateManager.set('functions', [...currentFunctions, ...functionsToAdd]);
        }
    }

    drawGrid() {
        const graph = StateManager.get('graph');
        if (!graph || graph.showGrid !== true) return;

        this.ctx.beginPath();
        this.ctx.strokeStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--grid-color')
            .trim() || '#e0e0e0';
        this.ctx.lineWidth = 1;

        // Calculate nice step size
        const rangeX = this.viewport.xMax - this.viewport.xMin;
        const stepX = this.calculateStep(rangeX, this.width);

        const startX = Math.floor(this.viewport.xMin / stepX) * stepX;

        for (let x = startX; x <= this.viewport.xMax; x += stepX) {
            const px = this.xToPixel(x);
            this.ctx.moveTo(px, 0);
            this.ctx.lineTo(px, this.height);
        }

        const rangeY = this.viewport.yMax - this.viewport.yMin;
        const stepY = this.calculateStep(rangeY, this.height);

        const startY = Math.floor(this.viewport.yMin / stepY) * stepY;

        for (let y = startY; y <= this.viewport.yMax; y += stepY) {
            const py = this.yToPixel(y);
            this.ctx.moveTo(0, py);
            this.ctx.lineTo(this.width, py);
        }

        this.ctx.stroke();
    }

    calculateStep(range, pixels) {
        const minPixelsPerStep = 50;
        const steps = pixels / minPixelsPerStep;
        const rawStep = range / steps;
        const power = Math.floor(Math.log10(rawStep));
        const base = rawStep / Math.pow(10, power);

        let niceBase;
        if (base < 2) niceBase = 1;
        else if (base < 5) niceBase = 2;
        else niceBase = 5;

        return niceBase * Math.pow(10, power);
    }

    drawAxes() {
        const graph = StateManager.get('graph');
        if (!graph || graph.showAxes !== true) return;

        this.ctx.beginPath();
        this.ctx.strokeStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--axis-color')
            .trim() || '#666666';
        this.ctx.lineWidth = 2;

        // X Axis (y = 0)
        const py0 = this.yToPixel(0);
        if (py0 >= 0 && py0 <= this.height) {
            this.ctx.moveTo(0, py0);
            this.ctx.lineTo(this.width, py0);
        }

        // Y Axis (x = 0)
        const px0 = this.xToPixel(0);
        if (px0 >= 0 && px0 <= this.width) {
            this.ctx.moveTo(px0, 0);
            this.ctx.lineTo(px0, this.height);
        }

        this.ctx.stroke();
    }

    drawFunction(func, expression, scopeValues) {
        const scope = { ...scopeValues }; // Base scope

        // Update evaluator's expression
        try {
            const variables = ['x', ...Object.keys(scopeValues).sort()];
            this.evaluator.setExpression(expression, variables);

            this.ctx.beginPath();
            this.ctx.strokeStyle = func.color;
            this.ctx.lineWidth = 2;

            // Optimization: Evaluate per pixel column?
            // Or 200 samples?
            // For high quality, we map pixels to X.

            let first = true;

            // Screen-space iteration
            // Iterating every 2 pixels for performance
            for (let px = 0; px <= this.width; px++) {
                const x = this.pixelToX(px);

                // Scope needs to update X
                scope.x = x;
                const y = this.evaluator.evaluateAt(scope);

                if (isNaN(y) || !isFinite(y)) {
                    first = true;
                    continue;
                }

                const py = this.yToPixel(y);

                // Discontinuity check / Clipping (simple)
                if (py < -this.height || py > this.height * 2) {
                    first = true;
                    continue;
                }

                if (first) {
                    this.ctx.moveTo(px, py);
                    first = false;
                } else {
                    this.ctx.lineTo(px, py);
                }
            }

            this.ctx.stroke();
        } catch (e) {
            // If evaluation fails during render, silently skip
            // Error should have been caught during validation in ExpressionList
            console.warn(`[GraphEngine] Evaluation error for "${func.expression}":`, e.message);
        }
    }

    /**
     * Draw a vertical line at a specific x-coordinate
     * @param {number} xValue - The x-coordinate where the line should be drawn
     * @param {string} color - Line color (e.g., '#000000')
     * @param {number} lineWidth - Line width in pixels
     */
    drawVerticalLine(xValue, color, lineWidth) {
        // Check if x-value is within viewport bounds
        if (xValue < this.viewport.xMin || xValue > this.viewport.xMax) {
            return; // Line is outside viewport
        }

        try {
            const px = this.xToPixel(xValue);

            // Clip to canvas bounds
            if (px < 0 || px > this.width) {
                return;
            }

            this.ctx.beginPath();
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = lineWidth;
            this.ctx.moveTo(px, 0);
            this.ctx.lineTo(px, this.height);
            this.ctx.stroke();
        } catch (e) {
            console.warn(`[GraphEngine] Error drawing vertical line at x=${xValue}:`, e.message);
        }
    }


    /**
     * Clean up resources and event listeners
     */
    destroy() {
        // Clean up EventBus subscriptions
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];

        // Clean up window listeners
        window.removeEventListener('resize', this.boundOnResize);

        // Clear timeouts
        if (this.parameterDetectionTimeout) {
            clearTimeout(this.parameterDetectionTimeout);
            this.parameterDetectionTimeout = null;
        }
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }

        // Cancel pending render
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }
}
