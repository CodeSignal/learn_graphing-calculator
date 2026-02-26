import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = {
  functions: []
}

vi.mock('../../../client/core/state-manager.js', () => ({
  default: {
    get: vi.fn((path) => {
      if (!path) return mockState
      return mockState[path]
    }),
    set: vi.fn()
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

import ExpressionList from '../../../client/components/expression-list.js'
import EventBus from '../../../client/core/event-bus.js'

describe('ExpressionList', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="expression-list"></div>
      <button id="btn-add-expression"></button>
    `

    mockState.functions = []
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
})
