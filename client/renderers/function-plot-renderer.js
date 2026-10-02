import functionPlot from 'function-plot';
import { traceContours } from '../math/marching-squares.js';

const INEQUALITY_SAMPLE_STEP = 3;
const INEQUALITY_SHADE_ALPHA = 0.18;
// Vertical-line datums extend this fraction of the visible height past each edge.
const VERTICAL_LINE_OVERSCAN = 0.05;
// A jump between consecutive samples larger than this many typical steps is a domain gap.
const POLYLINE_GAP_FACTOR = 3;
// Polyline samples are clamped to the visible y-domain plus this many heights on each side.
const POLYLINE_CLAMP_HEIGHTS = 1;

/**
 * Thin adapter around function-plot so GraphEngine stays focused on
 * state/event orchestration.
 */
export default class FunctionPlotRenderer {
  constructor(container) {
    this.container = container;
    this.chart = null;
    this.options = null;
    this.callbacks = { onZoom: null };
    this.boundHandlers = null;
    this.currentInequalities = [];
    this.pendingInequalityFrame = null;
    this.inequalityCanvas = null;
    this.inequalityContext = null;
    this.inequalityCanvasWidth = 0;
    this.inequalityCanvasHeight = 0;
    this.inequalityPixelRatio = 1;
    // Shared sampling grid for the current viewport, per-inequality F values on it (keyed by
    // the descriptor's `key`), and the signature of the last shading pass.
    this.samplingGrid = null;
    this.fieldCache = new Map();
    this.lastShadingSignature = null;
  }

  isReady() {
    return !!this.chart;
  }

  init({
    width,
    height,
    viewport,
    showGrid,
    onZoom,
    tipRenderer,
    annotations
  }) {
    if (!this.container) return;

    this.callbacks = {
      onZoom: typeof onZoom === 'function' ? onZoom : null
    };

    const tip = { xLine: true, yLine: true };
    if (typeof tipRenderer === 'function') {
      tip.renderer = tipRenderer;
    }

    this.options = {
      target: this.container,
      width,
      height,
      grid: showGrid,
      disableZoom: false,
      xAxis: {
        type: 'linear',
        domain: [viewport.xMin, viewport.xMax]
      },
      yAxis: {
        type: 'linear',
        domain: [viewport.yMin, viewport.yMax]
      },
      tip,
      annotations: Array.isArray(annotations) ? annotations : [],
      data: []
    };

    this.ensureInequalityCanvas();
    this.syncInequalityCanvasSize(width, height);

    this.chart = functionPlot(this.options);
    this.attachEventListeners();
  }

  attachEventListeners() {
    if (!this.chart) return;

    this.boundHandlers = {
      zoom: () => {
        const viewport = this.getViewport();
        if (viewport && this.callbacks.onZoom) {
          this.callbacks.onZoom(viewport);
        }
        this.scheduleInequalityRender();
      },
      // Fired at the start of every chart.draw() (data updates, rebuilds, zoom/pan frames).
      'before:draw': () => {
        this.syncVerticalLines();
      },
      // Fired by function-plot after sampling a datum and before its graph type draws the
      // samples, so the sample groups can still be adjusted in place.
      eval: (groups, index, isHelper) => {
        if (isHelper) return;
        const datum = this.options?.data?.[index];
        if (datum && datum.contourOf !== undefined && datum.contourOf !== null) {
          this.replaceWithBoundaryContours(groups, datum);
        } else if (datum?.graphType === 'polyline' && datum.fnType === 'linear') {
          this.normalizePolylineSamples(groups);
        }
      }
    };

    Object.entries(this.boundHandlers).forEach(([eventName, handler]) => {
      this.chart.on(eventName, handler);
    });
  }

  getVisibleYRange() {
    const domain = this.chart?.meta?.yScale?.domain?.();
    if (!Array.isArray(domain) || !Number.isFinite(domain[0]) || !Number.isFinite(domain[1])) {
      return null;
    }

    const lo = Math.min(domain[0], domain[1]);
    const hi = Math.max(domain[0], domain[1]);
    return hi > lo ? { lo, hi } : null;
  }

  /**
   * Re-fit datums flagged with `verticalLineX` (vertical inequality boundaries) to the visible
   * y-domain. A two-point polyline stays dashable at any zoom, while a fixed "very long" line
   * would either end on screen after zooming out or exceed browser dash limits when zoomed in.
   */
  syncVerticalLines() {
    const data = this.options?.data;
    if (!Array.isArray(data)) return;

    const range = this.getVisibleYRange();
    if (!range) return;

    const overscan = (range.hi - range.lo) * VERTICAL_LINE_OVERSCAN;
    data.forEach((datum) => {
      if (!Number.isFinite(datum?.verticalLineX)) return;
      datum.points = [
        [datum.verticalLineX, range.lo - overscan],
        [datum.verticalLineX, range.hi + overscan]
      ];
    });
  }

  /**
   * Adjust builtIn polyline samples (`[[x, y], ...]` groups) for explicit boundary curves:
   * - split groups where samples are missing (NaN outside the domain, e.g. sqrt(x^2 - 4) on
   *   -2 < x < 2); function-plot would otherwise draw a straight segment across the gap;
   * - clamp y to a band around the visible domain. The on-screen shape is unchanged, but
   *   steep curves (e.g. y > e^x) no longer produce paths millions of pixels long, which
   *   browsers stop dashing (Skia gives up at about a million dashes).
   */
  normalizePolylineSamples(groups) {
    if (!Array.isArray(groups)) return;

    for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex -= 1) {
      const pieces = this.splitAtSampleGaps(groups[groupIndex]);
      if (pieces) {
        groups.splice(groupIndex, 1, ...pieces);
      }
    }

    const range = this.getVisibleYRange();
    if (!range) return;

    const band = (range.hi - range.lo) * POLYLINE_CLAMP_HEIGHTS;
    const yLo = range.lo - band;
    const yHi = range.hi + band;
    groups.forEach((group) => {
      if (!Array.isArray(group)) return;
      group.forEach((point) => {
        if (Array.isArray(point) && Number.isFinite(point[1])) {
          point[1] = Math.min(Math.max(point[1], yLo), yHi);
        }
      });
    });
  }

  splitAtSampleGaps(group) {
    if (!Array.isArray(group) || group.length < 3) return null;

    const steps = [];
    for (let i = 1; i < group.length; i += 1) {
      steps.push(group[i][0] - group[i - 1][0]);
    }

    // Samples are evenly spaced, so the median step is the sampling step. Asymptote handling
    // can move a group's end points by up to one step, which stays below the gap factor.
    const typicalStep = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)];
    if (!(typicalStep > 0)) return null;

    const pieces = [];
    let start = 0;
    steps.forEach((step, i) => {
      if (step > typicalStep * POLYLINE_GAP_FACTOR) {
        pieces.push(group.slice(start, i + 1));
        start = i + 1;
      }
    });

    if (pieces.length === 0) return null;
    pieces.push(group.slice(start));
    return pieces;
  }

  updateData(data, inequalities = []) {
    if (!this.chart || !this.options) return;

    this.currentInequalities = Array.isArray(inequalities) ? inequalities : [];
    this.pruneFieldCache();
    this.options.data = Array.isArray(data) ? data : [];
    this.chart.options.data = this.options.data;
    try {
      this.chart.draw();
    } catch (err) {
      console.warn('[FunctionPlotRenderer] draw error:', err.message);
    }

    this.renderInequalities(this.currentInequalities);
  }

  rebuild({ width, height, viewport, showGrid, annotations }) {
    if (!this.chart || !this.options) return;

    this.options.width = width;
    this.options.height = height;
    this.options.grid = showGrid;
    this.options.annotations = Array.isArray(annotations) ? annotations : (this.options.annotations || []);

    this.options.xAxis = this.options.xAxis || { type: 'linear' };
    this.options.yAxis = this.options.yAxis || { type: 'linear' };

    this.options.xAxis.domain = [viewport.xMin, viewport.xMax];
    this.options.yAxis.domain = [viewport.yMin, viewport.yMax];

    this.ensureInequalityCanvas();
    this.syncInequalityCanvasSize(width, height);

    this.chart.build();
  }

  ensureInequalityCanvas() {
    if (!this.container) {
      return;
    }

    if (this.inequalityCanvas && this.inequalityCanvas.isConnected) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'inequality-overlay-canvas';

    const svg = this.container.querySelector('.function-plot');
    if (svg) {
      this.container.insertBefore(canvas, svg);
    } else {
      this.container.prepend(canvas);
    }

    this.inequalityCanvas = canvas;
    this.inequalityContext = canvas.getContext('2d');
    this.lastShadingSignature = null;
  }

  syncInequalityCanvasSize(width, height) {
    if (!this.inequalityCanvas) {
      return;
    }

    const cssWidth = Number.isFinite(width) ? Math.max(1, Math.round(width)) : 1;
    const cssHeight = Number.isFinite(height) ? Math.max(1, Math.round(height)) : 1;
    const pixelRatio = typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
      ? Math.max(1, window.devicePixelRatio)
      : 1;

    this.inequalityCanvasWidth = cssWidth;
    this.inequalityCanvasHeight = cssHeight;
    this.inequalityPixelRatio = pixelRatio;
    // resizing clears the canvas
    this.lastShadingSignature = null;

    const canvasWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
    const canvasHeight = Math.max(1, Math.round(cssHeight * pixelRatio));

    if (
      this.inequalityCanvas.width !== canvasWidth ||
      this.inequalityCanvas.height !== canvasHeight
    ) {
      this.inequalityCanvas.width = canvasWidth;
      this.inequalityCanvas.height = canvasHeight;
    }

    this.inequalityCanvas.style.width = `${cssWidth}px`;
    this.inequalityCanvas.style.height = `${cssHeight}px`;

    if (this.inequalityContext) {
      this.inequalityContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      this.inequalityContext.imageSmoothingEnabled = false;
    }
  }

  clearInequalityCanvas() {
    if (!this.inequalityContext) {
      return;
    }

    this.inequalityContext.clearRect(
      0,
      0,
      this.inequalityCanvasWidth,
      this.inequalityCanvasHeight
    );
  }

  scheduleInequalityRender() {
    if (this.pendingInequalityFrame !== null) {
      return;
    }

    if (typeof requestAnimationFrame !== 'function') {
      this.renderInequalities(this.currentInequalities);
      return;
    }

    this.pendingInequalityFrame = requestAnimationFrame(() => {
      this.pendingInequalityFrame = null;
      this.renderInequalities(this.currentInequalities);
    });
  }

  cancelScheduledInequalityRender() {
    if (this.pendingInequalityFrame === null) {
      return;
    }

    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.pendingInequalityFrame);
    }
    this.pendingInequalityFrame = null;
  }

  /**
   * Sampling grid for the current chart scales: the centres of the INEQUALITY_SAMPLE_STEP px
   * shading cells plus one ring of cells outside the plot, so boundaries traced on the grid
   * reach the plot edges (function-plot clips them). `xs[col + 1]` / `ys[row + 1]` is the
   * centre of shading cell (col, row). The grid is rebuilt only when the domains or the plot
   * size change, so every inequality, the shading pass and the boundary tracing share it.
   */
  getSamplingGrid() {
    const meta = this.chart?.meta;
    const xScale = meta?.xScale;
    const yScale = meta?.yScale;
    const plotWidth = meta?.width;
    const plotHeight = meta?.height;
    if (!xScale || !yScale || typeof xScale.domain !== 'function' ||
      typeof yScale.domain !== 'function') {
      return null;
    }
    if (!Number.isFinite(plotWidth) || !Number.isFinite(plotHeight) ||
      plotWidth <= 0 || plotHeight <= 0) {
      return null;
    }

    const cols = Math.ceil(plotWidth / INEQUALITY_SAMPLE_STEP);
    const rows = Math.ceil(plotHeight / INEQUALITY_SAMPLE_STEP);
    if (cols <= 0 || rows <= 0) {
      return null;
    }

    const xDomain = xScale.domain();
    const yDomain = yScale.domain();
    const key = `${xDomain[0]},${xDomain[1]}|${yDomain[0]},${yDomain[1]}|` +
      `${plotWidth}x${plotHeight}`;
    if (this.samplingGrid?.key === key) {
      return this.samplingGrid;
    }

    const step = INEQUALITY_SAMPLE_STEP;
    const centre = (index, size) => Math.min((index * step) + (step / 2), size);
    const xs = new Float64Array(cols + 2);
    const ys = new Float64Array(rows + 2);
    xs[0] = xScale.invert(-step / 2);
    ys[0] = yScale.invert(-step / 2);
    for (let col = 0; col < cols; col += 1) {
      xs[col + 1] = xScale.invert(centre(col, plotWidth));
    }
    for (let row = 0; row < rows; row += 1) {
      ys[row + 1] = yScale.invert(centre(row, plotHeight));
    }
    xs[cols + 1] = xScale.invert((cols * step) + (step / 2));
    ys[rows + 1] = yScale.invert((rows * step) + (step / 2));

    this.samplingGrid = { key, cols, rows, xs, ys };
    return this.samplingGrid;
  }

  /**
   * F values of an inequality on the sampling grid ((cols + 2) x (rows + 2), row-major), or
   * null when the descriptor has no grid evaluator. Cached per inequality `key` and grid, so a
   * redraw that changes neither the viewport nor the expression/parameters (typing in another
   * row, the shading pass right after a zoom draw) does not re-evaluate anything.
   */
  getInequalityField(inequality, grid) {
    if (!grid || typeof inequality?.evaluateGrid !== 'function') {
      return null;
    }

    const cacheKey = typeof inequality.key === 'string' ? inequality.key : null;
    const cached = cacheKey !== null ? this.fieldCache.get(cacheKey) : null;
    if (cached && cached.gridKey === grid.key) {
      return cached;
    }

    let values = null;
    try {
      values = inequality.evaluateGrid(grid.xs, grid.ys);
    } catch (error) {
      console.warn('[FunctionPlotRenderer] inequality evaluation error:', error.message);
    }
    if (!values || values.length !== grid.xs.length * grid.ys.length) {
      return null;
    }

    const field = { gridKey: grid.key, values, contours: null };
    if (cacheKey !== null) {
      this.fieldCache.set(cacheKey, field);
    }
    return field;
  }

  /** Drop cached fields of inequalities that are no longer plotted. */
  pruneFieldCache() {
    const live = new Set(this.currentInequalities.map((inequality) => inequality?.key));
    Array.from(this.fieldCache.keys()).forEach((key) => {
      if (!live.has(key)) this.fieldCache.delete(key);
    });
  }

  /**
   * Boundary paths of an inequality for the current viewport: F = 0 traced with marching
   * squares on the shading grid, as `[[x, y], ...]` polylines (closed loops repeat the first
   * point). Empty when the inequality is unknown or has no grid evaluator.
   */
  getBoundaryContours(inequalityId) {
    const inequality = this.currentInequalities.find((entry) => entry?.id === inequalityId);
    const grid = this.getSamplingGrid();
    const field = this.getInequalityField(inequality, grid);
    if (!field) {
      return [];
    }

    if (!field.contours) {
      field.contours = traceContours(
        field.values,
        grid.cols + 2,
        grid.rows + 2,
        grid.xs,
        grid.ys,
        { evaluate: typeof inequality.evaluateAt === 'function' ? inequality.evaluateAt : null }
      );
    }
    return field.contours;
  }

  /** Replace a `contourOf` datum's (placeholder) sample groups with its traced boundary. */
  replaceWithBoundaryContours(groups, datum) {
    if (!Array.isArray(groups)) return;
    const contours = this.getBoundaryContours(datum.contourOf);
    groups.length = 0;
    contours.forEach((contour) => groups.push(contour));
  }

  /**
   * Paint signature of a shading pass: when it matches the last pass the canvas already shows
   * the right pixels. Null (always repaint) unless every inequality carries a cache `key`.
   */
  getShadingSignature(inequalities, grid) {
    if (!grid || !inequalities.every((inequality) => typeof inequality?.key === 'string')) {
      return null;
    }

    return [
      grid.key,
      `${this.inequalityCanvasWidth}x${this.inequalityCanvasHeight}@${this.inequalityPixelRatio}`,
      ...inequalities.map((inequality) => [
        inequality.key,
        inequality.color,
        inequality.operator,
        inequality.strict,
        inequality.satisfiesPositive
      ].join('|'))
    ].join('\n');
  }

  renderInequalities(inequalities) {
    this.ensureInequalityCanvas();

    const list = Array.isArray(inequalities) ? inequalities : [];
    const grid = list.length > 0 ? this.getSamplingGrid() : null;
    const signature = this.getShadingSignature(list, grid);
    if (signature !== null && signature === this.lastShadingSignature) {
      return;
    }
    this.lastShadingSignature = null;

    this.clearInequalityCanvas();

    if (list.length === 0) {
      return;
    }

    const margin = this.chart?.meta?.margin || {};
    if (!grid || !this.inequalityContext) {
      return;
    }

    const { cols, rows, xs, ys } = grid;
    const offsetX = Number.isFinite(margin.left) ? margin.left : 0;
    const offsetY = Number.isFinite(margin.top) ? margin.top : 0;
    const step = INEQUALITY_SAMPLE_STEP;
    const context = this.inequalityContext;
    context.save();
    context.beginPath();
    context.rect(offsetX, offsetY, this.chart.meta.width, this.chart.meta.height);
    context.clip();

    list.forEach((inequality) => {
      const field = typeof inequality?.satisfies === 'function'
        ? this.getInequalityField(inequality, grid)
        : null;
      let isInside;
      if (field) {
        const { values } = field;
        const stride = cols + 2;
        isInside = (col, row) => inequality.satisfies(values[((row + 1) * stride) + col + 1]);
      } else if (typeof inequality?.evaluate === 'function') {
        isInside = (col, row) => inequality.evaluate(xs[col + 1], ys[row + 1]);
      } else {
        return;
      }

      context.fillStyle = typeof inequality.color === 'string' && inequality.color
        ? inequality.color
        : '#666666';
      context.globalAlpha = INEQUALITY_SHADE_ALPHA;

      // One rect per horizontal run of satisfied cells: the same pixels as one rect per cell
      // (cells are integer-aligned and never overlap), with far fewer canvas calls.
      for (let row = 0; row < rows; row += 1) {
        const drawY = offsetY + (row * step);
        let runStart = -1;
        for (let col = 0; col <= cols; col += 1) {
          if (col < cols && isInside(col, row)) {
            if (runStart < 0) runStart = col;
          } else if (runStart >= 0) {
            context.fillRect(offsetX + (runStart * step), drawY, (col - runStart) * step, step);
            runStart = -1;
          }
        }
      }
    });

    context.restore();
    context.globalAlpha = 1;
    this.lastShadingSignature = signature;
  }

  getViewport() {
    if (!this.chart?.meta?.xScale || !this.chart?.meta?.yScale) {
      return null;
    }

    const xDomain = this.chart.meta.xScale.domain();
    const yDomain = this.chart.meta.yScale.domain();

    if (!Array.isArray(xDomain) || !Array.isArray(yDomain)) {
      return null;
    }

    return {
      xMin: xDomain[0],
      xMax: xDomain[1],
      yMin: yDomain[0],
      yMax: yDomain[1]
    };
  }

  destroy() {
    this.cancelScheduledInequalityRender();

    if (this.chart && this.boundHandlers) {
      Object.entries(this.boundHandlers).forEach(([eventName, handler]) => {
        this.chart.removeListener(eventName, handler);
      });
    }

    if (this.chart) {
      const cache = this.chart.constructor?.cache;
      const chartId = this.chart.options?.id;
      if (cache && chartId) {
        delete cache[chartId];
      }

      this.chart.removeAllListeners();
      this.chart = null;
    }

    if (this.container) {
      this.container.innerHTML = '';
    }

    this.inequalityCanvas = null;
    this.inequalityContext = null;
    this.currentInequalities = [];
    this.pendingInequalityFrame = null;
    this.inequalityCanvasWidth = 0;
    this.inequalityCanvasHeight = 0;
    this.inequalityPixelRatio = 1;
    this.samplingGrid = null;
    this.fieldCache = new Map();
    this.lastShadingSignature = null;
    this.options = null;
    this.callbacks = { onZoom: null };
    this.boundHandlers = null;
  }
}
