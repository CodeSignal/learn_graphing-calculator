import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = {
  functions: [],
  parameters: {}
}

const getByPath = (obj, path) => {
  if (!path) return obj
  return path.split('.').reduce((acc, part) => {
    if (acc === undefined || acc === null) return undefined
    return acc[part]
  }, obj)
}

const setByPath = (obj, path, value) => {
  const parts = path.split('.')
  const last = parts.pop()
  let current = obj

  parts.forEach((part) => {
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {}
    }
    current = current[part]
  })

  current[last] = value
}

vi.mock('../../../client/core/state-manager.js', () => ({
  default: {
    get: vi.fn((path) => getByPath(mockState, path)),
    set: vi.fn((path, value) => setByPath(mockState, path, value))
  }
}))

vi.mock('../../../client/core/event-bus.js', () => ({
  default: {
    publish: vi.fn(),
    subscribe: vi.fn(() => () => {})
  }
}))

vi.mock('../../../client/utils/logger.js', () => ({
  default: {
    init: vi.fn(),
    logActivity: vi.fn()
  }
}))

vi.mock('../../../client/components/parameter-slider.js', () => ({
  default: class MockParameterSlider {
    constructor(container, paramName) {
      this.container = container
      this.paramName = paramName
      this.updateConfig = vi.fn()
      this.destroy = vi.fn()
    }
  }
}))

import ExpressionList from '../../../client/components/expression-list.js'
import EventBus from '../../../client/core/event-bus.js'

describe('ExpressionList', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="expression-list"></div>
      <button id="btn-add-expression"></button>
    `

    mockState.functions = []
    mockState.parameters = {}
    vi.clearAllMocks()
  })

  it('publishes expressions:committed once at commit boundary', () => {
    const expressionList = new ExpressionList('expression-list', 'btn-add-expression')
    const input = document.createElement('input')

    expressionList.renderedItems.set('expr_1', {
      editStartExpression: 'y = sin(x)',
      inputEl: input
    })

    mockState.functions = [{ id: 'expr_1', expression: 'y = sin(x)' }]

    expressionList.handleExpressionCommit('expr_1')

    expect(EventBus.publish).toHaveBeenCalledTimes(1)
    expect(EventBus.publish).toHaveBeenCalledWith('expressions:committed', {
      id: 'expr_1'
    })
    expect(expressionList.renderedItems.get('expr_1').editStartExpression).toBeUndefined()

    expressionList.handleExpressionCommit('expr_1')
    expect(EventBus.publish).toHaveBeenCalledTimes(1)
  })

  it('uses Add Expression CTA in expressions tab and creates a new expression', () => {
    const expressionList = new ExpressionList('expression-list', 'btn-add-expression')
    expressionList.init()
    mockState.functions = [{ id: 'expr_1', expression: 'x^2', color: '#000', visible: true }]
    expressionList.render(mockState.functions)

    expect(expressionList.addButton.textContent).toBe('+ Add Expression')

    expressionList.addButton.click()

    expect(mockState.functions).toHaveLength(2)
    expect(mockState.functions[1].id).toBe('expr_2')
    expect(mockState.functions[1].expression).toBe('')
  })

  it('uses Add Parameter CTA in parameters tab and opens inline composer', () => {
    const expressionList = new ExpressionList('expression-list', 'btn-add-expression')
    expressionList.init()
    expressionList.render([
      { id: 'expr_1', expression: 'x^2', color: '#000', visible: true },
      { id: 'param_a', expression: 'a = 1', color: '#111', visible: true }
    ])

    expressionList.setActiveSection('parameters')
    expect(expressionList.addButton.textContent).toBe('+ Add Parameter')

    expressionList.addButton.click()

    const composer = document.querySelector('.expression-parameter-composer')
    expect(composer).toBeTruthy()
    expect(composer.hidden).toBe(false)
    expect(mockState.functions).toHaveLength(0)
  })

  it('validates parameter composer input for empty/invalid/reserved/duplicate names', () => {
    const expressionList = new ExpressionList('expression-list', 'btn-add-expression')
    expressionList.init()
    mockState.functions = [{ id: 'param_a', expression: 'a = 1', color: '#111', visible: true }]
    expressionList.render(mockState.functions)
    expressionList.setActiveSection('parameters')
    expressionList.openParameterComposer()

    const input = document.querySelector('.expression-parameter-input')
    const error = document.querySelector('.expression-parameter-error')

    input.value = ''
    expressionList.createParameterFromComposer()
    expect(error.textContent).toContain('required')

    input.value = '1bad'
    expressionList.createParameterFromComposer()
    expect(error.textContent).toContain('Use letters')

    input.value = 'x'
    expressionList.createParameterFromComposer()
    expect(error.textContent).toContain('reserved')

    input.value = 'a'
    expressionList.createParameterFromComposer()
    expect(error.textContent).toContain('already exists')
  })

  it('creates a parameter assignment row from composer and closes it', () => {
    const expressionList = new ExpressionList('expression-list', 'btn-add-expression')
    expressionList.init()
    expressionList.render([])
    expressionList.setActiveSection('parameters')
    expressionList.openParameterComposer()

    const input = document.querySelector('.expression-parameter-input')
    const composer = document.querySelector('.expression-parameter-composer')
    input.value = 'rate'
    expressionList.createParameterFromComposer()

    expect(mockState.functions).toHaveLength(1)
    expect(mockState.functions[0].id).toBe('param_rate')
    expect(mockState.functions[0].expression).toBe('rate = 1.0')
    expect(composer.hidden).toBe(true)
  })

  it('closes composer on cancel and escape without creating state changes', () => {
    const expressionList = new ExpressionList('expression-list', 'btn-add-expression')
    expressionList.init()
    expressionList.render([])
    expressionList.setActiveSection('parameters')
    expressionList.openParameterComposer()

    const composer = document.querySelector('.expression-parameter-composer')
    const input = document.querySelector('.expression-parameter-input')
    const cancel = composer.querySelector('.button-secondary')

    cancel.click()
    expect(composer.hidden).toBe(true)
    expect(mockState.functions).toHaveLength(0)

    expressionList.openParameterComposer()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(composer.hidden).toBe(true)
    expect(mockState.functions).toHaveLength(0)
  })

  it('keeps section stable while editing and re-groups on commit', () => {
    const expressionList = new ExpressionList('expression-list', 'btn-add-expression')
    const func = { id: 'param_a', expression: 'a = 1', color: '#111', visible: true, error: null }

    expressionList.render([func])
    expressionList.setActiveSection('parameters')
    expressionList.switchToInputMode('param_a')

    const item = expressionList.renderedItems.get('param_a')
    item.inputEl.value = 'x^2'

    expressionList.updateItem({ ...func, expression: 'x^2' })

    expect(item.section).toBe('parameters')
    expect(item.element.hidden).toBe(false)

    expressionList.switchToLatexDisplay('param_a')

    expect(item.section).toBe('expressions')
    expect(item.element.hidden).toBe(true)
  })

  it('keeps points/vector rows in expressions tab', () => {
    const expressionList = new ExpressionList('expression-list', 'btn-add-expression')
    expressionList.init()
    expressionList.render([
      { id: 'p1', expression: 'points([[0,0],[1,1]])', color: '#111', visible: true },
      { id: 'v1', expression: 'vector([3,2])', color: '#222', visible: true }
    ])

    const pointsItem = expressionList.renderedItems.get('p1')
    const vectorItem = expressionList.renderedItems.get('v1')

    expect(pointsItem.section).toBe('expressions')
    expect(vectorItem.section).toBe('expressions')

    expressionList.setActiveSection('parameters')
    expect(pointsItem.element.hidden).toBe(true)
    expect(vectorItem.element.hidden).toBe(true)

    expressionList.setActiveSection('expressions')
    expect(pointsItem.element.hidden).toBe(false)
    expect(vectorItem.element.hidden).toBe(false)
  })

  it('routes assignment rows to parameters tab while points stay in expressions', () => {
    const expressionList = new ExpressionList('expression-list', 'btn-add-expression')
    expressionList.init()
    expressionList.render([
      { id: 'p2', expression: 'points([[a,1]])', color: '#111', visible: true },
      { id: 'param_a', expression: 'a = 1', color: '#222', visible: true }
    ])

    const pointsItem = expressionList.renderedItems.get('p2')
    const assignmentItem = expressionList.renderedItems.get('param_a')

    expressionList.setActiveSection('expressions')
    expect(pointsItem.section).toBe('expressions')
    expect(pointsItem.element.hidden).toBe(false)
    expect(assignmentItem.section).toBe('parameters')
    expect(assignmentItem.element.hidden).toBe(true)

    expressionList.setActiveSection('parameters')
    expect(pointsItem.element.hidden).toBe(true)
    expect(assignmentItem.element.hidden).toBe(false)
  })
})
