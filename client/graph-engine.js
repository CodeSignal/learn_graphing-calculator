/**
 * Graph Rendering Engine
 * Coordinates app state/events with the rendering adapter.
 */

import StateManager from './core/state-manager.js';
import EventBus from './core/event-bus.js';
import sharedParser from './math/shared-parser.js';
import { classifyLine } from './math/line-classifier.js';
import { analyzeParameters } from './math/parameter-utils.js';
import { DEFAULT_PARAMETER } from './math/parameter-defaults.js';
import { toFunctionPlotSyntax, computeDerivative } from './math/expression-adapter.js';
import { getColorForIndex } from './utils/color-constants.js';
import { DEFAULT_VIEWPORT_BOUNDS } from './core/config-loader.js';
import FunctionPlotRenderer from './renderers/function-plot-renderer.js';

const VIEWPORT_EPSILON = 1e-9;

export default class GraphEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);

    // Initialize viewport with defaults (will be synced from state.graph in init)
    this.viewport = { ...DEFAULT_VIEWPORT_BOUNDS };
    this.width = 0;
    this.height = 0;

    // Performance: Throttle/Debounce
    this.frameId = null;
    this.parameterDetectionTimeout = null;
    this.saveTimeout = null;
    this.hasDeferredParameterDetection = false;

    // Render lifecycle flags
    this.needsRebuild = true;

    // Metadata parallel to the renderer's data array (one entry per plotted datum)
    this.datumMeta = [];

    // Cleanup tracking
    this.unsubscribers = [];

    this.renderer = new FunctionPlotRenderer(this.container);

    // Bind methods
    this.boundRender = this.render.bind(this);
    this.boundOnResize = this.onResize.bind(this);
    this.boundOnRendererZoom = this.onRendererZoom.bind(this);
  }

  init() {
    if (!this.container) {
      console.error('[GraphEngine] Plot container not found');
      return;
    }

    this.onResize();
    window.addEventListener('resize', this.boundOnResize);

    this.unsubscribers.push(
      EventBus.subscribe('state:changed', (data) => {
        if (data.path === 'graph') {
          const viewportChanged = this.syncViewportFromGraph(data.value);
          const displayChanged = this.syncDisplayConfigFromGraph(data.value);

          if (viewportChanged || displayChanged) {
            this.needsRebuild = true;
            this.requestRender();
          }
        }
      })
    );

    this.unsubscribers.push(
      EventBus.subscribe('parameters:updated', () => {
        this.requestRender();
      })
    );

    this.unsubscribers.push(
      EventBus.subscribe('state:changed:functions', () => {
        this.requestRender();
        if (this.isExpressionInputFocused()) {
          this.hasDeferredParameterDetection = true;
          if (this.parameterDetectionTimeout) {
            clearTimeout(this.parameterDetectionTimeout);
            this.parameterDetectionTimeout = null;
          }
          return;
        }

        this.hasDeferredParameterDetection = false;
        this.scheduleParameterDetection();
      })
    );

    this.unsubscribers.push(
      EventBus.subscribe('expressions:committed', () => {
        this.hasDeferredParameterDetection = false;
        this.scheduleParameterDetection();
      })
    );

    const storedGraph = StateManager.get('graph');
    if (storedGraph) {
      const viewportChanged = this.syncViewportFromGraph(storedGraph);
      const displayChanged = this.syncDisplayConfigFromGraph(storedGraph);
      if (viewportChanged || displayChanged) {
        this.needsRebuild = true;
      }
    }

    this.detectAndUpdateParameters();
    this.requestRender();
  }

  onResize() {
    if (!this.container) return;

    const parent = this.container.parentElement;
    if (!parent) return;

    const nextWidth = parent.clientWidth;
    const nextHeight = parent.clientHeight;

    if (nextWidth <= 0 || nextHeight <= 0) return;
    if (nextWidth === this.width && nextHeight === this.height) return;

    this.width = nextWidth;
    this.height = nextHeight;
    this.needsRebuild = true;
    this.requestRender();
  }

  zoom(factor) {
    if (typeof factor !== 'number' || factor <= 0) return;

    const rangeX = this.viewport.xMax - this.viewport.xMin;
    const rangeY = this.viewport.yMax - this.viewport.yMin;

    const newRangeX = rangeX / factor;
    const newRangeY = rangeY / factor;

    const centerX = (this.viewport.xMin + this.viewport.xMax) / 2;
    const centerY = (this.viewport.yMin + this.viewport.yMax) / 2;

    this.viewport = {
      xMin: centerX - newRangeX / 2,
      xMax: centerX + newRangeX / 2,
      yMin: centerY - newRangeY / 2,
      yMax: centerY + newRangeY / 2
    };

    this.needsRebuild = true;
    this.requestRender();
    this.debounceSaveViewport();
  }

  onRendererZoom(viewport) {
    if (!this.isValidViewport(viewport)) return;
    if (this.isSameViewport(this.viewport, viewport)) return;

    this.viewport = {
      xMin: viewport.xMin,
      xMax: viewport.xMax,
      yMin: viewport.yMin,
      yMax: viewport.yMax
    };

    this.debounceSaveViewport();
  }

  saveViewportState() {
    const currentGraph = StateManager.get('graph') || {};

    const nextGraph = {
      ...currentGraph,
      xMin: this.viewport.xMin,
      xMax: this.viewport.xMax,
      yMin: this.viewport.yMin,
      yMax: this.viewport.yMax
    };

    if (this.isSameViewport(currentGraph, nextGraph)) {
      return;
    }

    StateManager.set('graph', nextGraph);
  }

  syncViewportFromGraph(graph) {
    if (!this.isValidViewport(graph)) {
      return false;
    }

    const nextViewport = {
      xMin: graph.xMin,
      xMax: graph.xMax,
      yMin: graph.yMin,
      yMax: graph.yMax
    };

    if (this.isSameViewport(this.viewport, nextViewport)) {
      return false;
    }

    this.viewport = nextViewport;
    return true;
  }

  syncDisplayConfigFromGraph(graph) {
    if (!graph || typeof graph !== 'object') {
      return false;
    }

    const nextShowGrid = graph.showGrid === true;

    if (this.showGrid !== nextShowGrid) {
      this.showGrid = nextShowGrid;
      return true;
    }

    return false;
  }

  debounceSaveViewport() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => this.saveViewportState(), 500);
  }

  requestRender() {
    if (!this.frameId) {
      this.frameId = requestAnimationFrame(this.boundRender);
    }
  }

  isExpressionInputFocused() {
    if (typeof document === 'undefined') {
      return false;
    }

    const active = document.activeElement;
    if (!active || typeof active.matches !== 'function') {
      return false;
    }

    return active.matches('.expression-input');
  }

  /**
   * Custom tooltip renderer for function-plot tip.
   * Shows the expression id and coordinates: "f: (1.234, 5.678)"
   */
  tipRenderer(x, y, index) {
    const meta = this.datumMeta[index];
    const id = meta ? meta.id : String(index + 1);
    return `${id}: (${x.toFixed(3)}, ${y.toFixed(3)})`;
  }

  render() {
    this.frameId = null;

    if (!this.container || this.width <= 0 || this.height <= 0) {
      return;
    }

    const functions = StateManager.get('functions') || [];
    const scope = StateManager.getControlValues();
    const graph = StateManager.get('graph') || {};

    const showGrid = graph.showGrid === true;
    const annotations = Array.isArray(graph.annotations) ? graph.annotations : [];
    const { data, meta } = this.mapFunctionsToPlotData(functions, scope);
    this.datumMeta = meta;
    const viewportForRender = this.getAspectLockedViewport(this.viewport);

    if (!this.renderer.isReady()) {
      this.renderer.init({
        width: this.width,
        height: this.height,
        viewport: viewportForRender,
        showGrid,
        annotations,
        onZoom: this.boundOnRendererZoom,
        tipRenderer: this.tipRenderer.bind(this)
      });
      this.needsRebuild = false;
    } else if (this.needsRebuild) {
      this.renderer.rebuild({
        width: this.width,
        height: this.height,
        viewport: viewportForRender,
        showGrid,
        annotations
      });
      this.needsRebuild = false;
    }

    this.renderer.updateData(data);
  }

  mapFunctionsToPlotData(functions, scopeValues) {
    const data = [];
    const meta = [];
    const scope = { ...scopeValues };

    (functions || []).forEach((func) => {
      if (!func.visible || !func.expression) return;

      const classification = classifyLine(func.expression, sharedParser);
      if (classification.kind !== 'graph' || classification.error) return;

      switch (classification.graphMode) {
        case 'explicit': {
          const plotExpression = classification.plotExpression;
          if (!plotExpression) break;
          const adaptedExpression = toFunctionPlotSyntax(plotExpression);
          if (!adaptedExpression) break;

          const datum = {
            fnType: 'linear',
            fn: adaptedExpression,
            scope: { ...scope },
            color: func.color
          };

          if (func.derivative && typeof func.derivative === 'object') {
            const derivFn = typeof func.derivative.fn === 'string'
              ? toFunctionPlotSyntax(func.derivative.fn)
              : computeDerivative(plotExpression);

            if (derivFn) {
              datum.derivative = { fn: derivFn, scope: { ...scope } };
              if (typeof func.derivative.x0 === 'number') {
                datum.derivative.x0 = func.derivative.x0;
              }
              if (func.derivative.updateOnMouseMove === true) {
                datum.derivative.updateOnMouseMove = true;
              }
            }
          }

          if (Array.isArray(func.secants) && func.secants.length > 0) {
            datum.secants = func.secants
              .filter((s) => typeof s?.x0 === 'number')
              .map((s) => {
                const secant = { x0: s.x0, scope: { ...scope } };
                if (typeof s.x1 === 'number') secant.x1 = s.x1;
                if (s.updateOnMouseMove === true) secant.updateOnMouseMove = true;
                return secant;
              });
            if (datum.secants.length === 0) delete datum.secants;
          }

          data.push(datum);
          meta.push({ id: func.id });
          break;
        }
        case 'implicit': {
          const plotExpression = classification.plotExpression;
          if (!plotExpression) break;
          const adaptedExpression = toFunctionPlotSyntax(plotExpression);
          if (!adaptedExpression) break;

          data.push({
            fnType: 'implicit',
            fn: adaptedExpression,
            scope: { ...scope },
            color: func.color
          });
          meta.push({ id: func.id });
          break;
        }
        case 'points': {
          const points = this.evaluatePointPairs(classification.plotData?.points, scope);
          if (!points) break;

          data.push({
            fnType: 'points',
            graphType: 'scatter',
            sampler: 'builtIn',
            points,
            color: func.color
          });
          meta.push({ id: func.id });
          break;
        }
        case 'vector': {
          const vectorValues = this.evaluateCoordinatePair(
            classification.plotData?.vector,
            scope
          );
          if (!vectorValues) break;

          const offsetValues = this.evaluateCoordinatePair(
            classification.plotData?.offset || ['0', '0'],
            scope
          );
          if (!offsetValues) break;

          data.push({
            fnType: 'vector',
            graphType: 'polyline',
            sampler: 'builtIn',
            vector: vectorValues,
            offset: offsetValues,
            color: func.color
          });
          meta.push({ id: func.id });
          break;
        }
        case 'inequality':
          break;
        default:
          break;
      }
    });

    return { data, meta };
  }

  evaluateCoordinateExpression(expression, scopeValues) {
    if (typeof expression !== 'string' || !expression.trim()) {
      return null;
    }

    const variables = sharedParser.getAllSymbols(expression);
    const parsed = sharedParser.parse(expression, variables);
    if (!parsed.isValid) {
      return null;
    }

    const value = parsed.evaluate(scopeValues || {});
    return Number.isFinite(value) ? value : null;
  }

  evaluateCoordinatePair(pair, scopeValues) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      return null;
    }

    const x = this.evaluateCoordinateExpression(pair[0], scopeValues);
    const y = this.evaluateCoordinateExpression(pair[1], scopeValues);

    if (x === null || y === null) {
      return null;
    }

    return [x, y];
  }

  evaluatePointPairs(pairs, scopeValues) {
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return null;
    }

    const evaluatedPoints = [];
    for (const pair of pairs) {
      const evaluated = this.evaluateCoordinatePair(pair, scopeValues);
      if (!evaluated) {
        return null;
      }
      evaluatedPoints.push(evaluated);
    }

    return evaluatedPoints;
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

    analysis.definedParams.forEach((paramName) => {
      ensureParameter(paramName, analysis.assignmentValues.get(paramName));
    });

    analysis.usedParams.forEach((paramName) => {
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
    const ids = new Set(existingFunctions.map((f) => f.id));

    if (!ids.has(baseId)) {
      return baseId;
    }

    let counter = 2;
    let candidateId = `${baseId}_${counter}`;

    while (ids.has(candidateId)) {
      counter += 1;
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

    paramNames.forEach((paramName) => {
      const hasAssignment = existingFunctions.some((func) => {
        if (!func.expression) return false;
        const assignment = classifyLine(func.expression, sharedParser);
        return assignment.kind === 'assignment' && assignment.paramName === paramName;
      });

      if (!hasAssignment) {
        const allFunctions = [...existingFunctions, ...functionsToAdd];
        const newId = this._generateAssignmentId(paramName, allFunctions);
        const currentFunctionCount = existingFunctions.length + functionsToAdd.length;
        const nextColor = getColorForIndex(currentFunctionCount);
        const currentValue = parameters?.[paramName]?.value ?? DEFAULT_PARAMETER.value;

        functionsToAdd.push({
          id: newId,
          expression: `${paramName} = ${currentValue}`,
          color: nextColor,
          visible: true
        });
      }
    });

    if (functionsToAdd.length > 0) {
      const currentFunctions = StateManager.get('functions') || [];
      StateManager.set('functions', [...currentFunctions, ...functionsToAdd]);
    }
  }

  getAspectLockedViewport(viewport) {
    if (!this.isValidViewport(viewport)) {
      return viewport;
    }

    if (!Number.isFinite(this.width) || !Number.isFinite(this.height) ||
      this.width <= 0 || this.height <= 0) {
      return viewport;
    }

    const xRange = viewport.xMax - viewport.xMin;
    const yRange = viewport.yMax - viewport.yMin;
    if (xRange <= 0 || yRange <= 0) {
      return viewport;
    }

    const targetAspect = this.width / this.height;
    if (!Number.isFinite(targetAspect) || targetAspect <= 0) {
      return viewport;
    }

    const currentAspect = xRange / yRange;
    const centerX = (viewport.xMin + viewport.xMax) / 2;
    const centerY = (viewport.yMin + viewport.yMax) / 2;

    if (this.isSameNumber(currentAspect, targetAspect)) {
      return viewport;
    }

    if (currentAspect < targetAspect) {
      const nextRangeX = yRange * targetAspect;
      return {
        xMin: centerX - nextRangeX / 2,
        xMax: centerX + nextRangeX / 2,
        yMin: viewport.yMin,
        yMax: viewport.yMax
      };
    }

    const nextRangeY = xRange / targetAspect;
    return {
      xMin: viewport.xMin,
      xMax: viewport.xMax,
      yMin: centerY - nextRangeY / 2,
      yMax: centerY + nextRangeY / 2
    };
  }

  isValidViewport(viewport) {
    return !!viewport &&
      typeof viewport.xMin === 'number' &&
      typeof viewport.xMax === 'number' &&
      typeof viewport.yMin === 'number' &&
      typeof viewport.yMax === 'number';
  }

  isSameViewport(a, b) {
    if (!this.isValidViewport(a) || !this.isValidViewport(b)) {
      return false;
    }

    return this.isSameNumber(a.xMin, b.xMin) &&
      this.isSameNumber(a.xMax, b.xMax) &&
      this.isSameNumber(a.yMin, b.yMin) &&
      this.isSameNumber(a.yMax, b.yMax);
  }

  isSameNumber(a, b) {
    return Math.abs(a - b) <= VIEWPORT_EPSILON;
  }

  /**
   * Clean up resources and event listeners
   */
  destroy() {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    window.removeEventListener('resize', this.boundOnResize);

    if (this.parameterDetectionTimeout) {
      clearTimeout(this.parameterDetectionTimeout);
      this.parameterDetectionTimeout = null;
    }

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    this.renderer.destroy();
  }
}
