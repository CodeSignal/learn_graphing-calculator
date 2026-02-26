import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = {
  config: {
    graph: {
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10,
      showGrid: true
    }
  },
  graph: {
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    showGrid: true
  },
  functions: [],
  parameters: {}
}

const listeners = new Map()
const rendererInstances = []
const compact = (value) => value.replace(/\s+/g, '')

function getByPath(root, path) {
  if (!path) return root

  const keys = path.split('.')
  let current = root

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined
    }

    current = current[key]
  }

  return current
}

function setByPath(root, path, value) {
  const keys = path.split('.')
  let current = root

  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i]
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key]
  }

  current[keys[keys.length - 1]] = value
}

vi.mock('../../../client/core/state-manager.js', () => ({
  default: {
    get: vi.fn((path) => getByPath(mockState, path)),
    set: vi.fn((path, value) => setByPath(mockState, path, value)),
    getControlValues: vi.fn(() => {
      const params = mockState.parameters || {}
      return Object.fromEntries(
        Object.entries(params)
          .filter(([, param]) => typeof param?.value === 'number')
          .map(([name, param]) => [name, param.value])
      )
    })
  }
}))

vi.mock('../../../client/core/event-bus.js', () => ({
  default: {
    subscribe: vi.fn((eventName, callback) => {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, [])
      }

      listeners.get(eventName).push(callback)

      return () => {
        const handlers = listeners.get(eventName) || []
        const index = handlers.indexOf(callback)
        if (index >= 0) {
          handlers.splice(index, 1)
        }
      }
    }),
    publish: vi.fn((eventName, payload) => {
      const handlers = listeners.get(eventName) || []
      handlers.forEach((handler) => handler(payload))
    })
  }
}))

vi.mock('../../../client/renderers/function-plot-renderer.js', () => ({
  default: class MockFunctionPlotRenderer {
    constructor(container) {
      this.container = container
      this.ready = false
      this.initCalls = []
      this.rebuildCalls = []
      this.dataCalls = []
      this.destroyCalls = 0
      this.lastInitArgs = null
      rendererInstances.push(this)
    }

    isReady() {
      return this.ready
    }

    init(args) {
      this.ready = true
      this.lastInitArgs = args
      this.initCalls.push(args)
    }

    rebuild(args) {
      this.rebuildCalls.push(args)
    }

    updateData(data) {
      this.dataCalls.push(data)
    }

    destroy() {
      this.destroyCalls += 1
    }
  }
}))

import GraphEngine from '../../../client/graph-engine.js'
import EventBus from '../../../client/core/event-bus.js'
import StateManager from '../../../client/core/state-manager.js'

describe('GraphEngine (function-plot migration)', () => {
  beforeEach(() => {
    vi.useFakeTimers()

    listeners.clear()
    rendererInstances.length = 0

    mockState.graph = {
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10,
      showGrid: true
    }
    mockState.functions = []
    mockState.parameters = {}

    StateManager.get.mockClear()
    StateManager.set.mockClear()
    StateManager.getControlValues.mockClear()
    EventBus.subscribe.mockClear()
    EventBus.publish.mockClear()

    vi.stubGlobal('requestAnimationFrame', (callback) => {
      return setTimeout(() => callback(), 0)
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id) => clearTimeout(id)))

    document.body.innerHTML = `
      <div class="content-area" id="plot-parent">
        <div id="graph-canvas"></div>
      </div>
    `

    const parent = document.getElementById('plot-parent')
    Object.defineProperty(parent, 'clientWidth', {
      value: 900,
      configurable: true
    })
    Object.defineProperty(parent, 'clientHeight', {
      value: 500,
      configurable: true
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('maps only graph expressions and skips assignments/invalid lines', () => {
    const engine = new GraphEngine('graph-canvas')

    const data = engine.mapFunctionsToPlotData([
      { id: 'g1', expression: 'x^2', color: '#111', visible: true },
      { id: 'a1', expression: 'a = 2', color: '#222', visible: true },
      { id: 'i1', expression: '5', color: '#333', visible: true },
      { id: 'h1', expression: 'y = 4', color: '#444', visible: true }
    ], { a: 2 })

    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({
      fnType: 'linear',
      fn: 'x^2',
      color: '#111'
    })
    expect(data[1]).toMatchObject({
      fnType: 'linear',
      fn: '4',
      color: '#444'
    })
  })

  it('normalizes explicit constants before passing expressions to function-plot', () => {
    const engine = new GraphEngine('graph-canvas')

    const data = engine.mapFunctionsToPlotData([
      { id: 'p1', expression: 'y = pi', color: '#f80', visible: true }
    ], {})

    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      fnType: 'linear',
      fn: 'PI',
      color: '#f80'
    })
  })

  it('normalizes ln and e aliases for explicit function plotting', () => {
    const engine = new GraphEngine('graph-canvas')

    const data = engine.mapFunctionsToPlotData([
      { id: 'l1', expression: 'y = ln(x) + e', color: '#0af', visible: true }
    ], {})

    expect(data).toHaveLength(1)
    expect(data[0].fnType).toBe('linear')
    expect(compact(data[0].fn)).toBe('log(x)+E')
  })

  it('maps vertical lines to implicit datums', () => {
    const engine = new GraphEngine('graph-canvas')

    const data = engine.mapFunctionsToPlotData([
      { id: 'v1', expression: 'x = 3', color: '#abc', visible: true }
    ], {})

    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      fnType: 'implicit',
      fn: 'x - (3)',
      scope: {},
      color: '#abc'
    })
    expect(data[0]).not.toHaveProperty('attr')
  })

  it('normalizes implicit vertical lines before plotting', () => {
    const engine = new GraphEngine('graph-canvas')

    const data = engine.mapFunctionsToPlotData([
      { id: 'v2', expression: 'x = pi', color: '#0c3', visible: true }
    ], {})

    expect(data).toHaveLength(1)
    expect(data[0].fnType).toBe('implicit')
    expect(compact(data[0].fn)).toBe('x-(PI)')
  })

  it('maps implicit equations to implicit datums', () => {
    const engine = new GraphEngine('graph-canvas')

    const data = engine.mapFunctionsToPlotData([
      { id: 'c1', expression: 'x^2 + y^2 = 1', color: '#f00', visible: true }
    ], {})

    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      fnType: 'implicit',
      fn: '(x^2 + y^2) - (1)',
      scope: {},
      color: '#f00'
    })
  })

  it('maps implicit equations with parameters to implicit datums with scope', () => {
    const engine = new GraphEngine('graph-canvas')

    const data = engine.mapFunctionsToPlotData(
      [
        {
          id: 'c1',
          expression: 'x^2 + y^2 = r',
          color: '#f00',
          visible: true
        }
      ],
      { r: 2 }
    )

    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      fnType: 'implicit',
      fn: '(x^2 + y^2) - (r)',
      scope: { r: 2 },
      color: '#f00'
    })
  })

  it('skips inequality expressions (rendering deferred)', () => {
    const engine = new GraphEngine('graph-canvas')

    const data = engine.mapFunctionsToPlotData([
      { id: 'i1', expression: 'y > x^2', color: '#00f', visible: true }
    ], {})

    expect(data).toHaveLength(0)
  })

  it('applies aspect lock at render time without mutating canonical viewport', () => {
    const engine = new GraphEngine('graph-canvas')
    engine.init()
    vi.runOnlyPendingTimers()

    const renderer = rendererInstances[0]
    expect(renderer).toBeTruthy()

    expect(renderer.lastInitArgs.viewport.xMin).toBeCloseTo(-18)
    expect(renderer.lastInitArgs.viewport.xMax).toBeCloseTo(18)
    expect(renderer.lastInitArgs.viewport.yMin).toBeCloseTo(-10)
    expect(renderer.lastInitArgs.viewport.yMax).toBeCloseTo(10)

    expect(engine.viewport).toEqual({
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10
    })
  })

  it('persists viewport bounds with debounced save after renderer zoom', () => {
    const engine = new GraphEngine('graph-canvas')
    engine.init()
    vi.runOnlyPendingTimers()

    const renderer = rendererInstances[0]
    expect(renderer).toBeTruthy()

    StateManager.set.mockClear()

    renderer.lastInitArgs.onZoom({
      xMin: -5,
      xMax: 5,
      yMin: -4,
      yMax: 4
    })

    vi.advanceTimersByTime(499)
    expect(StateManager.set).not.toHaveBeenCalledWith('graph', expect.anything())

    vi.advanceTimersByTime(1)

    const graphCalls = StateManager.set.mock.calls.filter(([path]) => path === 'graph')
    expect(graphCalls).toHaveLength(1)
    expect(graphCalls[0][1]).toMatchObject({
      xMin: -5,
      xMax: 5,
      yMin: -4,
      yMax: 4,
      showGrid: true
    })
  })

  it('rebuilds renderer when external graph reset event is published', () => {
    const engine = new GraphEngine('graph-canvas')
    engine.init()
    vi.runOnlyPendingTimers()

    const renderer = rendererInstances[0]
    renderer.rebuildCalls = []

    const nextGraph = {
      xMin: -2,
      xMax: 2,
      yMin: -1,
      yMax: 1,
      showGrid: false
    }

    StateManager.set('graph', nextGraph)
    EventBus.publish('state:changed', { path: 'graph', value: nextGraph })
    vi.runOnlyPendingTimers()

    expect(renderer.rebuildCalls.length).toBeGreaterThan(0)

    const latestRebuild = renderer.rebuildCalls[renderer.rebuildCalls.length - 1]
    expect(latestRebuild.viewport.xMin).toBeCloseTo(-2)
    expect(latestRebuild.viewport.xMax).toBeCloseTo(2)
    expect(latestRebuild.viewport.yMin).toBeCloseTo(-1.1111111111)
    expect(latestRebuild.viewport.yMax).toBeCloseTo(1.1111111111)
    expect(latestRebuild.showGrid).toBe(false)
  })

  it('keeps aspect-lock stable across resizes without cumulative drift', () => {
    const engine = new GraphEngine('graph-canvas')
    engine.init()
    vi.runOnlyPendingTimers()

    const renderer = rendererInstances[0]
    expect(renderer).toBeTruthy()

    const parent = document.getElementById('plot-parent')

    expect(renderer.lastInitArgs.viewport.xMin).toBeCloseTo(-18)
    expect(renderer.lastInitArgs.viewport.xMax).toBeCloseTo(18)

    Object.defineProperty(parent, 'clientWidth', {
      value: 500,
      configurable: true
    })
    Object.defineProperty(parent, 'clientHeight', {
      value: 500,
      configurable: true
    })

    engine.onResize()
    vi.runOnlyPendingTimers()

    let latestRebuild = renderer.rebuildCalls[renderer.rebuildCalls.length - 1]
    expect(latestRebuild.viewport.xMin).toBeCloseTo(-10)
    expect(latestRebuild.viewport.xMax).toBeCloseTo(10)
    expect(latestRebuild.viewport.yMin).toBeCloseTo(-10)
    expect(latestRebuild.viewport.yMax).toBeCloseTo(10)

    Object.defineProperty(parent, 'clientWidth', {
      value: 900,
      configurable: true
    })
    Object.defineProperty(parent, 'clientHeight', {
      value: 500,
      configurable: true
    })

    engine.onResize()
    vi.runOnlyPendingTimers()

    latestRebuild = renderer.rebuildCalls[renderer.rebuildCalls.length - 1]
    expect(latestRebuild.viewport.xMin).toBeCloseTo(-18)
    expect(latestRebuild.viewport.xMax).toBeCloseTo(18)
    expect(latestRebuild.viewport.yMin).toBeCloseTo(-10)
    expect(latestRebuild.viewport.yMax).toBeCloseTo(10)

    expect(engine.viewport).toEqual({
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10
    })
  })

  it('defers parameter detection while an expression input is focused', () => {
    const engine = new GraphEngine('graph-canvas')
    engine.init()
    vi.runOnlyPendingTimers()

    mockState.functions = [
      { id: 'expr_1', expression: 'y = s', color: '#f80', visible: true }
    ]

    const input = document.createElement('input')
    input.className = 'expression-input'
    document.body.appendChild(input)
    input.focus()

    StateManager.set.mockClear()

    EventBus.publish('state:changed:functions', {
      path: 'functions',
      value: mockState.functions
    })
    vi.advanceTimersByTime(350)

    const changedPaths = StateManager.set.mock.calls.map(([path]) => path)
    expect(changedPaths).not.toContain('parameters')
    expect(changedPaths).not.toContain('functions')
    expect(mockState.functions).toHaveLength(1)
  })

  it('runs deferred parameter detection after expressions commit', () => {
    const engine = new GraphEngine('graph-canvas')
    engine.init()
    vi.runOnlyPendingTimers()

    mockState.functions = [
      { id: 'expr_1', expression: 'y = s', color: '#f80', visible: true }
    ]

    const input = document.createElement('input')
    input.className = 'expression-input'
    document.body.appendChild(input)
    input.focus()

    StateManager.set.mockClear()

    EventBus.publish('state:changed:functions', {
      path: 'functions',
      value: mockState.functions
    })
    vi.advanceTimersByTime(350)

    expect(mockState.functions).toHaveLength(1)

    EventBus.publish('expressions:committed', { id: 'expr_1' })
    vi.advanceTimersByTime(350)

    expect(mockState.parameters.s).toBeTruthy()
    expect(mockState.parameters.s.value).toBe(1)
    expect(mockState.functions.some((func) => func.expression === 's = 1')).toBe(true)
  })

  it('still detects parameters for non-typing function changes', () => {
    const engine = new GraphEngine('graph-canvas')
    engine.init()
    vi.runOnlyPendingTimers()

    mockState.functions = [
      { id: 'expr_1', expression: 'y = m*x + b', color: '#f80', visible: true }
    ]

    StateManager.set.mockClear()

    EventBus.publish('state:changed:functions', {
      path: 'functions',
      value: mockState.functions
    })
    vi.advanceTimersByTime(350)

    expect(mockState.parameters.m).toBeTruthy()
    expect(mockState.parameters.b).toBeTruthy()
    expect(mockState.functions.some((func) => func.expression === 'm = 1')).toBe(true)
    expect(mockState.functions.some((func) => func.expression === 'b = 1')).toBe(true)
  })
})
