import functionPlot from 'function-plot';

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

  }

  isReady() {
    return !!this.chart;
  }

  init({
    width,
    height,
    viewport,
    showGrid,
    onZoom
  }) {
    if (!this.container) return;

    this.callbacks = {
      onZoom: typeof onZoom === 'function' ? onZoom : null
    };

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
      tip: {
        xLine: true,
        yLine: true
      },
      data: []
    };

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
      }
    };

    this.chart.on('zoom', this.boundHandlers.zoom);
  }

  updateData(data) {
    if (!this.chart || !this.options) return;

    this.options.data = Array.isArray(data) ? data : [];
    this.chart.options.data = this.options.data;
    try {
      this.chart.draw();
    } catch (err) {
      console.warn('[FunctionPlotRenderer] draw error:', err.message);
    }
  }

  rebuild({ width, height, viewport, showGrid }) {
    if (!this.chart || !this.options) return;

    this.options.width = width;
    this.options.height = height;
    this.options.grid = showGrid;

    this.options.xAxis = this.options.xAxis || { type: 'linear' };
    this.options.yAxis = this.options.yAxis || { type: 'linear' };

    this.options.xAxis.domain = [viewport.xMin, viewport.xMax];
    this.options.yAxis.domain = [viewport.yMin, viewport.yMax];

    this.chart.build();
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

    this.options = null;
    this.callbacks = { onZoom: null };
    this.boundHandlers = null;
  }
}
