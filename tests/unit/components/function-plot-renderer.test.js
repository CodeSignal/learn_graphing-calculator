import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FunctionPlotRenderer from '../../../client/renderers/function-plot-renderer.js'

const functionPlotMock = vi.fn()
const chartCache = {}
let chartCounter = 0

function createMockChart(options) {
  const listeners = new Map()
  const xDomain = [...(options.xAxis?.domain || [-10, 10])]
  const yDomain = [...(options.yAxis?.domain || [-10, 10])]

  const id = options.id || `chart-${++chartCounter}`
  options.id = id

  const chart = {
    options,
    meta: {
      xScale: {
        domain: vi.fn(() => xDomain)
      },
      yScale: {
        domain: vi.fn(() => yDomain)
      }
    },
    on: vi.fn((eventName, handler) => {
      listeners.set(eventName, handler)
      return chart
    }),
    removeListener: vi.fn((eventName, handler) => {
      if (listeners.get(eventName) === handler) {
        listeners.delete(eventName)
      }
      return chart
    }),
    removeAllListeners: vi.fn(),
    draw: vi.fn(),
    build: vi.fn(() => chart),
    emitForTest: (eventName, payload) => {
      const handler = listeners.get(eventName)
      if (handler) {
        handler(payload)
      }
    },
    setDomainsForTest: (x, y) => {
      xDomain[0] = x[0]
      xDomain[1] = x[1]
      yDomain[0] = y[0]
      yDomain[1] = y[1]
    },
    constructor: {
      cache: chartCache
    }
  }

  chartCache[id] = chart
  return chart
}

vi.mock('function-plot', () => ({
  default: (...args) => functionPlotMock(...args)
}))

describe('FunctionPlotRenderer', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
    container.id = 'graph-canvas'
    document.body.appendChild(container)

    chartCounter = 0
    Object.keys(chartCache).forEach((key) => {
      delete chartCache[key]
    })

    functionPlotMock.mockReset()
    functionPlotMock.mockImplementation((options) => createMockChart(options))
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('initializes function-plot with expected options and wires zoom event', () => {
    const onZoom = vi.fn()

    const renderer = new FunctionPlotRenderer(container)

    renderer.init({
      width: 640,
      height: 360,
      viewport: { xMin: -5, xMax: 5, yMin: -3, yMax: 3 },
      showGrid: true,
      onZoom
    })

    expect(functionPlotMock).toHaveBeenCalledTimes(1)

    const initOptions = functionPlotMock.mock.calls[0][0]
    expect(initOptions.target).toBe(container)
    expect(initOptions.width).toBe(640)
    expect(initOptions.height).toBe(360)
    expect(initOptions.grid).toBe(true)
    expect(initOptions.xAxis.domain).toEqual([-5, 5])
    expect(initOptions.yAxis.domain).toEqual([-3, 3])
    expect(initOptions.tip).toEqual({ xLine: true, yLine: true })

    const chart = renderer.chart
    chart.setDomainsForTest([-4, 4], [-2, 2])
    chart.emitForTest('zoom')

    expect(onZoom).toHaveBeenCalledWith({ xMin: -4, xMax: 4, yMin: -2, yMax: 2 })
  })

  it('wires custom tipRenderer into tip options when provided', () => {
    const renderer = new FunctionPlotRenderer(container)
    const tipRenderer = vi.fn((x, y) => `(${x}, ${y})`)

    renderer.init({
      width: 640,
      height: 360,
      viewport: { xMin: -5, xMax: 5, yMin: -3, yMax: 3 },
      showGrid: true,
      onZoom: vi.fn(),
      tipRenderer
    })

    const initOptions = functionPlotMock.mock.calls[0][0]
    expect(initOptions.tip.renderer).toBe(tipRenderer)
    expect(initOptions.tip.xLine).toBe(true)
    expect(initOptions.tip.yLine).toBe(true)
  })

  it('omits tip.renderer when tipRenderer is not a function', () => {
    const renderer = new FunctionPlotRenderer(container)

    renderer.init({
      width: 640,
      height: 360,
      viewport: { xMin: -5, xMax: 5, yMin: -3, yMax: 3 },
      showGrid: true,
      onZoom: vi.fn()
    })

    const initOptions = functionPlotMock.mock.calls[0][0]
    expect(initOptions.tip).not.toHaveProperty('renderer')
  })

  it('sets annotations from init options', () => {
    const renderer = new FunctionPlotRenderer(container)
    const annotations = [{ x: 0, text: 'y-axis' }, { y: 0, text: 'x-axis' }]

    renderer.init({
      width: 640,
      height: 360,
      viewport: { xMin: -5, xMax: 5, yMin: -3, yMax: 3 },
      showGrid: true,
      onZoom: vi.fn(),
      annotations
    })

    const initOptions = functionPlotMock.mock.calls[0][0]
    expect(initOptions.annotations).toEqual(annotations)
  })

  it('defaults annotations to empty array when not provided', () => {
    const renderer = new FunctionPlotRenderer(container)

    renderer.init({
      width: 640,
      height: 360,
      viewport: { xMin: -5, xMax: 5, yMin: -3, yMax: 3 },
      showGrid: true,
      onZoom: vi.fn()
    })

    const initOptions = functionPlotMock.mock.calls[0][0]
    expect(initOptions.annotations).toEqual([])
  })

  it('updates annotations on rebuild', () => {
    const renderer = new FunctionPlotRenderer(container)

    renderer.init({
      width: 400,
      height: 300,
      viewport: { xMin: -8, xMax: 8, yMin: -6, yMax: 6 },
      showGrid: true,
      onZoom: vi.fn()
    })

    const newAnnotations = [{ x: 2, text: 'x=2' }]
    renderer.rebuild({
      width: 400,
      height: 300,
      viewport: { xMin: -8, xMax: 8, yMin: -6, yMax: 6 },
      showGrid: true,
      annotations: newAnnotations
    })

    expect(renderer.options.annotations).toEqual(newAnnotations)
  })

  it('preserves existing annotations on rebuild when none provided', () => {
    const renderer = new FunctionPlotRenderer(container)
    const annotations = [{ y: 1, text: 'y=1' }]

    renderer.init({
      width: 400,
      height: 300,
      viewport: { xMin: -8, xMax: 8, yMin: -6, yMax: 6 },
      showGrid: true,
      onZoom: vi.fn(),
      annotations
    })

    renderer.rebuild({
      width: 400,
      height: 300,
      viewport: { xMin: -4, xMax: 4, yMin: -3, yMax: 3 },
      showGrid: true
    })

    expect(renderer.options.annotations).toEqual(annotations)
  })

  it('updates data through draw without rebuilding', () => {
    const renderer = new FunctionPlotRenderer(container)

    renderer.init({
      width: 500,
      height: 400,
      viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
      showGrid: true,
      onZoom: vi.fn()
    })

    const chart = renderer.chart
    chart.draw.mockClear()
    chart.build.mockClear()

    const nextData = [{ fnType: 'linear', fn: 'x^2' }]
    renderer.updateData(nextData)

    expect(chart.options.data).toEqual(nextData)
    expect(chart.draw).toHaveBeenCalledTimes(1)
    expect(chart.build).not.toHaveBeenCalled()
  })

  it('rebuilds chart when bounds/size/grid change', () => {
    const renderer = new FunctionPlotRenderer(container)

    renderer.init({
      width: 400,
      height: 300,
      viewport: { xMin: -8, xMax: 8, yMin: -6, yMax: 6 },
      showGrid: true,
      onZoom: vi.fn()
    })

    const chart = renderer.chart
    chart.build.mockClear()

    renderer.rebuild({
      width: 900,
      height: 500,
      viewport: { xMin: -3, xMax: 3, yMin: -2, yMax: 2 },
      showGrid: false
    })

    expect(chart.build).toHaveBeenCalledTimes(1)
    expect(chart.options.width).toBe(900)
    expect(chart.options.height).toBe(500)
    expect(chart.options.xAxis.domain).toEqual([-3, 3])
    expect(chart.options.yAxis.domain).toEqual([-2, 2])
    expect(chart.options.grid).toBe(false)
  })

  it('destroys listeners and clears cache/container state', () => {
    const renderer = new FunctionPlotRenderer(container)

    renderer.init({
      width: 400,
      height: 300,
      viewport: { xMin: -8, xMax: 8, yMin: -6, yMax: 6 },
      showGrid: true,
      onZoom: vi.fn()
    })

    const chart = renderer.chart
    const chartId = chart.options.id

    container.innerHTML = '<svg></svg>'

    renderer.destroy()

    expect(chart.removeListener).toHaveBeenCalledTimes(1)
    expect(chart.removeAllListeners).toHaveBeenCalledTimes(1)
    expect(chartCache[chartId]).toBeUndefined()
    expect(container.innerHTML).toBe('')
  })
})
