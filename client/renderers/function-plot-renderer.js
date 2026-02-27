import functionPlot from 'function-plot';

const INEQUALITY_SAMPLE_STEP = 3;
const INEQUALITY_SHADE_ALPHA = 0.18;

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
      }
    };

    this.chart.on('zoom', this.boundHandlers.zoom);
  }

  updateData(data, inequalities = []) {
    if (!this.chart || !this.options) return;

    this.currentInequalities = Array.isArray(inequalities) ? inequalities : [];
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

  renderInequalities(inequalities) {
    this.ensureInequalityCanvas();
    this.clearInequalityCanvas();

    if (!Array.isArray(inequalities) || inequalities.length === 0) {
      return;
    }

    const xScale = this.chart?.meta?.xScale;
    const yScale = this.chart?.meta?.yScale;
    const plotWidth = this.chart?.meta?.width;
    const plotHeight = this.chart?.meta?.height;
    const margin = this.chart?.meta?.margin || {};

    if (!xScale || !yScale || !this.inequalityContext) {
      return;
    }
    if (!Number.isFinite(plotWidth) || !Number.isFinite(plotHeight)) {
      return;
    }
    if (plotWidth <= 0 || plotHeight <= 0) {
      return;
    }

    const offsetX = Number.isFinite(margin.left) ? margin.left : 0;
    const offsetY = Number.isFinite(margin.top) ? margin.top : 0;
    const cols = Math.ceil(plotWidth / INEQUALITY_SAMPLE_STEP);
    const rows = Math.ceil(plotHeight / INEQUALITY_SAMPLE_STEP);

    if (cols <= 0 || rows <= 0) {
      return;
    }

    const xValues = Array.from({ length: cols }, (_, col) => {
      const centerX = Math.min(
        (col * INEQUALITY_SAMPLE_STEP) + (INEQUALITY_SAMPLE_STEP / 2),
        plotWidth
      );
      return xScale.invert(centerX);
    });
    const yValues = Array.from({ length: rows }, (_, row) => {
      const centerY = Math.min(
        (row * INEQUALITY_SAMPLE_STEP) + (INEQUALITY_SAMPLE_STEP / 2),
        plotHeight
      );
      return yScale.invert(centerY);
    });

    const context = this.inequalityContext;
    context.save();
    context.beginPath();
    context.rect(offsetX, offsetY, plotWidth, plotHeight);
    context.clip();

    inequalities.forEach((inequality) => {
      if (typeof inequality?.evaluate !== 'function') {
        return;
      }

      context.fillStyle = typeof inequality.color === 'string' && inequality.color
        ? inequality.color
        : '#666666';
      context.globalAlpha = INEQUALITY_SHADE_ALPHA;

      for (let row = 0; row < rows; row += 1) {
        const y = yValues[row];
        const drawY = offsetY + (row * INEQUALITY_SAMPLE_STEP);

        for (let col = 0; col < cols; col += 1) {
          const x = xValues[col];
          if (!inequality.evaluate(x, y)) {
            continue;
          }

          const drawX = offsetX + (col * INEQUALITY_SAMPLE_STEP);
          context.fillRect(drawX, drawY, INEQUALITY_SAMPLE_STEP, INEQUALITY_SAMPLE_STEP);
        }
      }
    });

    context.restore();
    context.globalAlpha = 1;
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
      this.chart.removeListener('zoom', this.boundHandlers.zoom);
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
    this.options = null;
    this.callbacks = { onZoom: null };
    this.boundHandlers = null;
  }
}
