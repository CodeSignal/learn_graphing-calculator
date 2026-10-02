import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FunctionPlotRenderer from '../../../client/renderers/function-plot-renderer.js'

/**
 * Renders through the real function-plot 1.24.4 (no mock) in jsdom to confirm
 * that axis titles land in the SVG and survive redraws/rebuilds.
 */
describe('FunctionPlotRenderer axis labels (real function-plot)', () => {
  let container
  let renderer
  let getContextSpy

  const scatter = [{
    fnType: 'points',
    graphType: 'scatter',
    sampler: 'builtIn',
    points: [[62, 130], [70, 160], [78, 200]],
    color: '#08f',
    attr: { r: 6, 'stroke-width': 2 }
  }]

  const xLabel = () => container.querySelector('svg.function-plot text.x.axis-label')
  const yLabel = () => container.querySelector('svg.function-plot text.y.axis-label')

  beforeEach(() => {
    container = document.createElement('div')
    container.id = 'graph-canvas'
    document.body.appendChild(container)
    // jsdom has no 2D canvas; the inequality overlay tolerates a null context
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => null)
    renderer = new FunctionPlotRenderer(container)
  })

  afterEach(() => {
    renderer.destroy()
    getContextSpy.mockRestore()
    document.body.innerHTML = ''
  })

  it('renders x and y axis label text into the SVG', () => {
    renderer.init({
      width: 800,
      height: 500,
      viewport: { xMin: 60, xMax: 80, yMin: 110, yMax: 210 },
      showGrid: true,
      onZoom: vi.fn(),
      xAxisLabel: 'Third-exam score',
      yAxisLabel: 'Final-exam score'
    })
    renderer.updateData(scatter)

    expect(xLabel()?.textContent).toBe('Third-exam score')
    expect(yLabel()?.textContent).toBe('Final-exam score')

    // function-plot places x at the bottom-right of the plot area (above the
    // tick numbers) and rotates y at the top-left (beside the tick numbers)
    const { width, height } = renderer.chart.meta
    expect(Number(xLabel().getAttribute('x'))).toBe(width)
    expect(Number(xLabel().getAttribute('y'))).toBe(height - 6)
    expect(xLabel().getAttribute('text-anchor')).toBe('end')
    expect(yLabel().getAttribute('transform')).toBe('rotate(-90)')
    expect(yLabel().getAttribute('text-anchor')).toBe('end')
  })

  it('renders no axis label elements when labels are absent', () => {
    renderer.init({
      width: 800,
      height: 500,
      viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
      showGrid: true,
      onZoom: vi.fn()
    })
    renderer.updateData(scatter)

    expect(container.querySelector('svg.function-plot')).toBeTruthy()
    expect(container.querySelectorAll('text.axis-label')).toHaveLength(0)
  })

  it('keeps labels through zoom/pan draws, data updates, and rebuilds', () => {
    const onZoom = vi.fn()
    renderer.init({
      width: 800,
      height: 500,
      viewport: { xMin: 60, xMax: 80, yMin: 110, yMax: 210 },
      showGrid: true,
      onZoom,
      xAxisLabel: 'Third-exam score',
      yAxisLabel: 'Final-exam score'
    })
    renderer.updateData(scatter)

    // Wheel/drag zoom: function-plot rescales and redraws via its zoom event
    const chart = renderer.chart
    const transform = {
      rescaleX: (scale) => scale.copy().domain([65, 75]),
      rescaleY: (scale) => scale.copy().domain([140, 190])
    }
    chart.emit('all:zoom', { transform })

    expect(onZoom).toHaveBeenCalledWith({ xMin: 65, xMax: 75, yMin: 140, yMax: 190 })
    expect(xLabel()?.textContent).toBe('Third-exam score')
    expect(yLabel()?.textContent).toBe('Final-exam score')

    // Expression/parameter change: data-only redraw
    renderer.updateData([{ ...scatter[0], points: [[64, 150]] }])
    expect(xLabel()?.textContent).toBe('Third-exam score')
    expect(yLabel()?.textContent).toBe('Final-exam score')

    // Resize / reset-view / zoom buttons: full rebuild, x label follows the new width
    renderer.rebuild({
      width: 600,
      height: 400,
      viewport: { xMin: 60, xMax: 80, yMin: 110, yMax: 210 },
      showGrid: true,
      xAxisLabel: 'Third-exam score',
      yAxisLabel: 'Final-exam score'
    })
    expect(container.querySelectorAll('text.x.axis-label')).toHaveLength(1)
    expect(container.querySelectorAll('text.y.axis-label')).toHaveLength(1)
    expect(Number(xLabel().getAttribute('x'))).toBe(renderer.chart.meta.width)
    expect(Number(xLabel().getAttribute('y'))).toBe(renderer.chart.meta.height - 6)
  })

  it('updates and removes label text on rebuild', () => {
    renderer.init({
      width: 800,
      height: 500,
      viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
      showGrid: false,
      onZoom: vi.fn(),
      xAxisLabel: 'x',
      yAxisLabel: 'y'
    })

    renderer.rebuild({
      width: 800,
      height: 500,
      viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
      showGrid: false,
      xAxisLabel: 'Time (s)',
      yAxisLabel: ''
    })

    expect(xLabel()?.textContent).toBe('Time (s)')
    expect(yLabel()).toBeNull()
  })
})
