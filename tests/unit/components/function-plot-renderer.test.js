import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FunctionPlotRenderer from '../../../client/renderers/function-plot-renderer.js'

const functionPlotMock = vi.fn()
const chartCache = {}
let chartCounter = 0
let canvasContext
let getContextSpy

function createMockChart(options) {
  const listeners = new Map()
  const xDomain = [...(options.xAxis?.domain || [-10, 10])]
  const yDomain = [...(options.yAxis?.domain || [-10, 10])]
  const margin = { left: 40, right: 20, top: 20, bottom: 20 }
  const width = (options.width || 800) - margin.left - margin.right
  const height = (options.height || 600) - margin.top - margin.bottom

  const id = options.id || `chart-${++chartCounter}`
  options.id = id

  const chart = {
    options,
    meta: {
      width,
      height,
      margin,
      xScale: {
        domain: vi.fn(() => xDomain),
        invert: vi.fn((pixel) => {
          const ratio = width > 0 ? pixel / width : 0
          return xDomain[0] + (ratio * (xDomain[1] - xDomain[0]))
        })
      },
      yScale: {
        domain: vi.fn(() => yDomain),
        invert: vi.fn((pixel) => {
          const ratio = height > 0 ? (height - pixel) / height : 0
          return yDomain[0] + (ratio * (yDomain[1] - yDomain[0]))
        })
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
    emitForTest: (eventName, ...args) => {
      const handler = listeners.get(eventName)
      if (handler) {
        handler(...args)
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
    canvasContext = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      restore: vi.fn(),
      fillStyle: '#000000',
      globalAlpha: 1,
      imageSmoothingEnabled: true
    }
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => canvasContext)

    chartCounter = 0
    Object.keys(chartCache).forEach((key) => {
      delete chartCache[key]
    })

    functionPlotMock.mockReset()
    functionPlotMock.mockImplementation((options) => createMockChart(options))
  })

  afterEach(() => {
    document.body.innerHTML = ''
    getContextSpy.mockRestore()
    vi.unstubAllGlobals()
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
    canvasContext.clearRect.mockClear()
    canvasContext.fillRect.mockClear()

    const nextData = [{ fnType: 'linear', fn: 'x^2' }]
    renderer.updateData(nextData, [
      { color: '#f00', evaluate: () => true }
    ])

    expect(chart.options.data).toEqual(nextData)
    expect(chart.draw).toHaveBeenCalledTimes(1)
    expect(chart.build).not.toHaveBeenCalled()
    expect(canvasContext.clearRect).toHaveBeenCalledTimes(1)
    expect(canvasContext.fillRect).toHaveBeenCalled()
  })

  it('re-renders inequality overlay on zoom using cached inequalities', () => {
    const onZoom = vi.fn()
    const rafSpy = vi.fn((callback) => {
      callback()
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', rafSpy)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const renderer = new FunctionPlotRenderer(container)
    renderer.init({
      width: 500,
      height: 400,
      viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
      showGrid: true,
      onZoom
    })

    renderer.updateData([{ fnType: 'linear', fn: 'x' }], [{ evaluate: () => true }])

    canvasContext.clearRect.mockClear()
    canvasContext.fillRect.mockClear()

    const chart = renderer.chart
    chart.setDomainsForTest([-4, 4], [-3, 3])
    chart.emitForTest('zoom')

    expect(onZoom).toHaveBeenCalledWith({ xMin: -4, xMax: 4, yMin: -3, yMax: 3 })
    expect(rafSpy).toHaveBeenCalledTimes(1)
    expect(canvasContext.clearRect).toHaveBeenCalledTimes(1)
    expect(canvasContext.fillRect).toHaveBeenCalled()
  })

  it('coalesces zoom-triggered inequality redraws to one per animation frame', () => {
    let scheduledCallback = null
    const rafSpy = vi.fn((callback) => {
      scheduledCallback = callback
      return 7
    })
    vi.stubGlobal('requestAnimationFrame', rafSpy)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const renderer = new FunctionPlotRenderer(container)
    renderer.init({
      width: 500,
      height: 400,
      viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
      showGrid: true,
      onZoom: vi.fn()
    })

    renderer.updateData([{ fnType: 'linear', fn: 'x' }], [{ evaluate: () => true }])
    canvasContext.clearRect.mockClear()
    canvasContext.fillRect.mockClear()

    const chart = renderer.chart
    chart.emitForTest('zoom')
    chart.emitForTest('zoom')
    chart.emitForTest('zoom')

    expect(rafSpy).toHaveBeenCalledTimes(1)
    expect(canvasContext.fillRect).not.toHaveBeenCalled()

    expect(typeof scheduledCallback).toBe('function')
    scheduledCallback()

    expect(canvasContext.clearRect).toHaveBeenCalledTimes(1)
    expect(canvasContext.fillRect).toHaveBeenCalled()

    chart.emitForTest('zoom')
    expect(rafSpy).toHaveBeenCalledTimes(2)
  })

  it('creates and resizes inequality overlay canvas on init and rebuild', () => {
    const renderer = new FunctionPlotRenderer(container)

    renderer.init({
      width: 400,
      height: 300,
      viewport: { xMin: -8, xMax: 8, yMin: -6, yMax: 6 },
      showGrid: true,
      onZoom: vi.fn()
    })

    const canvas = container.querySelector('.inequality-overlay-canvas')
    expect(canvas).toBeTruthy()
    expect(canvas.style.width).toBe('400px')
    expect(canvas.style.height).toBe('300px')

    renderer.rebuild({
      width: 600,
      height: 420,
      viewport: { xMin: -4, xMax: 4, yMin: -3, yMax: 3 },
      showGrid: false
    })

    expect(canvas.style.width).toBe('600px')
    expect(canvas.style.height).toBe('420px')
  })

  it('handles missing canvas context without crashing', () => {
    getContextSpy.mockImplementationOnce(() => null)
    const renderer = new FunctionPlotRenderer(container)

    expect(() => {
      renderer.init({
        width: 500,
        height: 400,
        viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
        showGrid: true,
        onZoom: vi.fn()
      })
    }).not.toThrow()

    expect(() => {
      renderer.updateData([{ fnType: 'linear', fn: 'x' }], [{ evaluate: () => true }])
    }).not.toThrow()
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

  describe('boundary polylines', () => {
    const initRenderer = () => {
      const renderer = new FunctionPlotRenderer(container)
      renderer.init({
        width: 500,
        height: 400,
        viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
        showGrid: true,
        onZoom: vi.fn()
      })
      return renderer
    }

    it('re-fits vertical-line datums to the visible y-domain before each draw', () => {
      const renderer = initRenderer()
      const vertical = {
        fnType: 'points',
        graphType: 'polyline',
        verticalLineX: 2,
        points: [[2, 0], [2, 1]]
      }
      const other = { fnType: 'points', graphType: 'polyline', points: [[0, 0], [1, 1]] }
      renderer.updateData([vertical, other])

      const chart = renderer.chart
      chart.emitForTest('before:draw')
      expect(vertical.points).toEqual([[2, -11], [2, 11]])

      chart.setDomainsForTest([-4, 4], [-2, 6])
      chart.emitForTest('before:draw')
      expect(vertical.points[0][0]).toBe(2)
      expect(vertical.points[0][1]).toBeCloseTo(-2.4)
      expect(vertical.points[1][1]).toBeCloseTo(6.4)
      expect(other.points).toEqual([[0, 0], [1, 1]])
    })

    it('splits explicit polyline samples at domain gaps and clamps far-off values', () => {
      const renderer = initRenderer()
      renderer.updateData([
        { fnType: 'linear', graphType: 'polyline', fn: 'sqrt(x^2 - 4)' }
      ])

      const groups = [[
        [-4, 3.46], [-3, 2.24], [-2, 0],
        [2, 0], [3, 2.24], [4, 1e9]
      ]]
      renderer.chart.emitForTest('eval', groups, 0, false)

      expect(groups).toEqual([
        [[-4, 3.46], [-3, 2.24], [-2, 0]],
        [[2, 0], [3, 2.24], [4, 30]]
      ])
    })

    it('does not split evenly spaced samples or touch non-polyline and helper samples', () => {
      const renderer = initRenderer()
      renderer.updateData([
        { fnType: 'linear', graphType: 'polyline', fn: 'x' },
        { fnType: 'linear', fn: 'x^9' }
      ])

      const even = [[[-1, -1], [0, 0], [1, 1], [2, 2]]]
      renderer.chart.emitForTest('eval', even, 0, false)
      expect(even).toEqual([[[-1, -1], [0, 0], [1, 1], [2, 2]]])

      const interval = [[[-1, 1e9], [5, 1e9]]]
      renderer.chart.emitForTest('eval', interval, 1, false)
      expect(interval).toEqual([[[-1, 1e9], [5, 1e9]]])

      const helper = [[[-1, 1e9], [5, 1e9]]]
      renderer.chart.emitForTest('eval', helper, 0, true)
      expect(helper).toEqual([[[-1, 1e9], [5, 1e9]]])
    })
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

    const removedEvents = chart.removeListener.mock.calls.map(([eventName]) => eventName)
    expect(removedEvents.sort()).toEqual(['before:draw', 'eval', 'zoom'])
    expect(chart.removeAllListeners).toHaveBeenCalledTimes(1)
    expect(chartCache[chartId]).toBeUndefined()
    expect(container.innerHTML).toBe('')
  })
})
