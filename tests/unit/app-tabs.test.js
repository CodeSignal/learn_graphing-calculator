import { beforeEach, describe, expect, it, vi } from 'vitest'

const expressionListInstances = []

const graphConfig = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10
}

const mockState = {
  functions: [],
  config: { graph: graphConfig }
}

vi.mock('../../client/core/state-manager.js', () => ({
  default: {
    initialize: vi.fn(),
    get: vi.fn((path) => {
      if (!path) return mockState
      return mockState[path]
    }),
    set: vi.fn()
  }
}))

vi.mock('../../client/core/event-bus.js', () => ({
  default: {
    setStateManager: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    publish: vi.fn()
  }
}))

vi.mock('../../client/core/config-loader.js', () => ({
  default: {
    load: vi.fn(async () => ({
      functions: [],
      graph: graphConfig
    })),
    fromObject: vi.fn((config) => config)
  }
}))

vi.mock('../../client/graph-engine.js', () => ({
  default: class MockGraphEngine {
    constructor() {
      this.init = vi.fn()
      this.zoom = vi.fn()
    }
  }
}))

vi.mock('../../client/components/sidebar-manager.js', () => ({
  default: class MockSidebarManager {
    constructor() {
      this.init = vi.fn()
    }
  }
}))

vi.mock('../../client/components/expression-list.js', () => ({
  default: class MockExpressionList {
    constructor() {
      this.init = vi.fn()
      this.setActiveSection = vi.fn()
      expressionListInstances.push(this)
    }
  }
}))

vi.mock('../../client/design-system/components/modal/modal.js', () => ({
  default: {
    createHelpModal: vi.fn(() => ({
      open: vi.fn()
    }))
  }
}))

vi.mock('../../client/utils/logger.js', () => ({
  default: {
    init: vi.fn(),
    logActivity: vi.fn()
  }
}))

vi.mock('../../client/utils/math-formatter.js', () => ({
  renderLatex: vi.fn()
}))

import { renderLatex } from '../../client/utils/math-formatter.js'

const flushInit = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('App sidebar tabs', () => {
  beforeEach(() => {
    vi.resetModules()
    expressionListInstances.length = 0
    document.body.innerHTML = `
      <button id="btn-help"></button>
      <template id="help-content-template"><div>Help</div></template>
      <aside id="sidebar"></aside>
      <div id="sidebar-resizer"></div>
      <button id="btn-toggle-sidebar"></button>
      <button id="btn-floating-toggle-sidebar"></button>
      <button id="tab-expressions" class="button button-secondary sidebar-tab">
        <span class="sidebar-tab-label">f(x)</span>
      </button>
      <button id="tab-parameters" class="button button-tertiary sidebar-tab">
        <span class="sidebar-tab-label">θ</span>
      </button>
      <div id="expression-list"></div>
      <button id="btn-add-expression"></button>
      <button id="btn-home"></button>
      <button id="btn-zoom-in"></button>
      <button id="btn-zoom-out"></button>
      <div id="graph-canvas"></div>
    `
  })

  it('defaults to expressions and switches sections when tabs are clicked', async () => {
    await import('../../client/app.js')
    await flushInit()

    const expressionList = expressionListInstances[0]
    expect(expressionList).toBeTruthy()
    expect(expressionList.setActiveSection).toHaveBeenCalledWith('expressions')

    const expressionsTab = document.getElementById('tab-expressions')
    const parametersTab = document.getElementById('tab-parameters')
    const expressionsLabel = expressionsTab.querySelector('.sidebar-tab-label')
    const parametersLabel = parametersTab.querySelector('.sidebar-tab-label')

    expect(renderLatex).toHaveBeenCalledWith('f(x)', expressionsLabel)
    expect(renderLatex).toHaveBeenCalledWith('\\theta', parametersLabel)

    parametersTab.click()
    expect(expressionList.setActiveSection).toHaveBeenLastCalledWith('parameters')
    expect(parametersTab.classList.contains('is-active')).toBe(true)
    expect(parametersTab.classList.contains('button-secondary')).toBe(true)
    expect(parametersTab.classList.contains('button-tertiary')).toBe(false)
    expect(parametersTab.getAttribute('aria-selected')).toBe('true')
    expect(expressionsTab.classList.contains('is-active')).toBe(false)
    expect(expressionsTab.classList.contains('button-secondary')).toBe(false)
    expect(expressionsTab.classList.contains('button-tertiary')).toBe(true)
    expect(expressionsTab.getAttribute('aria-selected')).toBe('false')

    expressionsTab.click()
    expect(expressionList.setActiveSection).toHaveBeenLastCalledWith('expressions')
    expect(expressionsTab.classList.contains('is-active')).toBe(true)
    expect(expressionsTab.classList.contains('button-secondary')).toBe(true)
    expect(expressionsTab.classList.contains('button-tertiary')).toBe(false)
    expect(expressionsTab.getAttribute('aria-selected')).toBe('true')
    expect(parametersTab.classList.contains('is-active')).toBe(false)
    expect(parametersTab.classList.contains('button-secondary')).toBe(false)
    expect(parametersTab.classList.contains('button-tertiary')).toBe(true)
    expect(parametersTab.getAttribute('aria-selected')).toBe('false')
  })
})
