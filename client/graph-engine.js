/**
 * Graph Rendering Engine
 * Handles Canvas rendering, coordinate transformations, and user interaction.
 */

import StateManager from './core/state-manager.js';
import EventBus from './core/event-bus.js';
import FunctionEvaluator from './math/function-evaluator.js';
import defaultConfig from './configs/default-config.js';

export default class GraphEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.viewport = { ...defaultConfig.viewport };
        this.width = 0;
        this.height = 0;

        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };

        // Performance: Throttle/Debounce
        this.frameId = null;
        this.parameterDetectionTimeout = null;
        this.saveTimeout = null;
        this.pendingErrorUpdates = new Map(); // Track error updates to apply after render

        this.evaluator = new FunctionEvaluator();

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
                // If viewport changed externally (e.g. reset button)
                if (data.path === 'viewport') {
                    this.viewport = data.value;
                    this.requestRender();
                }
            })
        );

        // Listen for expression updates
        this.unsubscribers.push(
            EventBus.subscribe('expression:updated', () => {
                this.requestRender();
                // Trigger parameter detection (debounced)
                this.scheduleParameterDetection();
            })
        );

        // Listen for control updates (sliders)
        this.unsubscribers.push(
            EventBus.subscribe('controls:updated', () => {
                this.requestRender();
            })
        );

        // Listen for functions updates from StateManager (e.g. add/remove)
        this.unsubscribers.push(
            EventBus.subscribe('state:changed:functions', () => {
                this.requestRender();
            })
        );

        // Initial load of viewport from state if exists
        const storedViewport = StateManager.get('viewport');
        if (storedViewport) {
            this.viewport = { ...storedViewport };
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
        return ((x - this.viewport.xMin) / (this.viewport.xMax - this.viewport.xMin)) * this.width;
    }

    yToPixel(y) {
        // Invert Y because canvas Y grows downwards
        return this.height - ((y - this.viewport.yMin) / (this.viewport.yMax - this.viewport.yMin)) * this.height;
    }

    pixelToX(px) {
        return this.viewport.xMin + (px / this.width) * (this.viewport.xMax - this.viewport.xMin);
    }

    pixelToY(py) {
        return this.viewport.yMin + ((this.height - py) / this.height) * (this.viewport.yMax - this.viewport.yMin);
    }

    // Navigation
    pan(dxPixels, dyPixels) {
        const dxUnits = dxPixels * (this.viewport.xMax - this.viewport.xMin) / this.width;
        const dyUnits = dyPixels * (this.viewport.yMax - this.viewport.yMin) / this.height;

        this.viewport.xMin -= dxUnits;
        this.viewport.xMax -= dxUnits;
        this.viewport.yMin += dyUnits; // Canvas Y grows downward, so dragging down (dy>0) shows higher y values
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
        StateManager.set('viewport', { ...this.viewport });
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
        const controls = StateManager.get('controls') || {};

        functions.forEach(func => {
            if (func.visible && func.expression) {
                this.drawFunction(func, controls);
            }
        });

        // Apply any error updates collected during render
        this.applyPendingErrorUpdates();
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
     * Detect new parameters from expressions and update controls state
     * Called outside render cycle to prevent state mutations during rendering
     */
    detectAndUpdateParameters() {
        const functions = StateManager.get('functions') || [];
        const controls = { ...StateManager.get('controls') || {} };
        const allVars = new Set();

        // Extract all variables from all expressions
        functions.forEach(func => {
            if (!func.expression) return;
            try {
                // Use public API to get all variables
                const vars = this.evaluator.parser.getAllVariables(func.expression);
                vars.forEach(v => {
                    // Filter out x and y (these are not parameters)
                    if (v !== 'x' && v !== 'y') {
                        allVars.add(v);
                    }
                });
            } catch (e) {
                // Ignore parsing errors - expression might be incomplete
            }
        });

        // Add new parameters to controls if they don't exist
        let changed = false;
        allVars.forEach(v => {
            if (typeof controls[v] === 'undefined') {
                controls[v] = 1.0; // Default value
                changed = true;
            }
        });

        // Update state only if new parameters were found
        // This triggers 'controls:updated' which will request a render
        if (changed) {
            StateManager.set('controls', controls);
        }
    }

    drawGrid() {
        if (!defaultConfig.viewport.gridEnabled) return;

        this.ctx.beginPath();
        this.ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim() || '#e0e0e0';
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
        if (!defaultConfig.viewport.axesEnabled) return;

        this.ctx.beginPath();
        this.ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--axis-color').trim() || '#666666';
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

    drawFunction(func, controls) {
        const scope = { ...controls }; // Base scope

        // Update evaluator's expression
        try {
            this.evaluator.setExpression(func.expression, ['x', ...Object.keys(controls)]);

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

            // Collect error clear (if function previously had error)
            if (func.error) {
                this.pendingErrorUpdates.set(func.id, null);
            }

        } catch (e) {
            // Collect error update (don't mutate state during render)
            this.pendingErrorUpdates.set(func.id, e.message);
        }
    }

    /**
     * Apply error updates collected during render
     * Called after render completes to avoid state mutations during rendering
     */
    applyPendingErrorUpdates() {
        if (this.pendingErrorUpdates.size === 0) {
            return;
        }

        const functions = [...StateManager.get('functions')];
        let changed = false;

        this.pendingErrorUpdates.forEach((error, id) => {
            const index = functions.findIndex(f => f.id === id);
            if (index !== -1 && functions[index].error !== error) {
                functions[index] = { ...functions[index], error };
                changed = true;
            }
        });

        // Clear pending updates
        this.pendingErrorUpdates.clear();

        // Apply state update only if something changed
        // This happens after render completes, so no render loop risk
        if (changed) {
            StateManager.set('functions', functions);
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

        // Clear pending error updates
        this.pendingErrorUpdates.clear();
    }
}
