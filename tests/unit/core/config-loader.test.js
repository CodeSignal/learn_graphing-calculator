import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../client/core/event-bus.js', () => ({
  default: {
    publish: vi.fn()
  }
}))

import ConfigLoader from '../../../client/core/config-loader.js'
import EventBus from '../../../client/core/event-bus.js'

const baseGraph = () => ({
  xMin: 60,
  xMax: 80,
  yMin: 110,
  yMax: 210
})

describe('ConfigLoader graph axis labels', () => {
  let consoleErrorSpy

  beforeEach(() => {
    EventBus.publish.mockClear()
    // fromObject logs before rethrowing validation errors; keep test output clean
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('accepts string xAxisLabel and yAxisLabel', () => {
    const config = {
      functions: [],
      graph: {
        ...baseGraph(),
        xAxisLabel: 'Third-exam score',
        yAxisLabel: 'Final-exam score'
      }
    }

    expect(ConfigLoader.validate(config)).toBe(true)
  })

  it('accepts empty-string labels (meaning no label)', () => {
    const config = {
      graph: { ...baseGraph(), xAxisLabel: '', yAxisLabel: '' }
    }

    expect(ConfigLoader.validate(config)).toBe(true)
  })

  it.each([
    ['xAxisLabel', 42],
    ['xAxisLabel', true],
    ['xAxisLabel', null],
    ['yAxisLabel', ['Final-exam score']],
    ['yAxisLabel', { text: 'Final-exam score' }]
  ])('rejects non-string %s (%j)', (field, value) => {
    const config = {
      graph: { ...baseGraph(), [field]: value }
    }

    expect(() => ConfigLoader.validate(config)).toThrow(
      `Config.graph.${field} must be a string`
    )
    expect(() => ConfigLoader.fromObject(config)).toThrow(
      `Config.graph.${field} must be a string`
    )
    expect(EventBus.publish).not.toHaveBeenCalled()
  })

  it('keeps labels through normalization alongside graph defaults', () => {
    const config = ConfigLoader.fromObject({
      functions: [{ id: 'scores', expression: 'points([[62,130],[75,180]])' }],
      graph: {
        ...baseGraph(),
        xAxisLabel: 'Third-exam score',
        yAxisLabel: 'Final-exam score'
      }
    })

    expect(config.graph).toEqual({
      ...baseGraph(),
      showGrid: true,
      annotations: [],
      xAxisLabel: 'Third-exam score',
      yAxisLabel: 'Final-exam score'
    })
    expect(EventBus.publish).toHaveBeenCalledWith('config:loaded', config)
  })

  it('leaves graph defaults unchanged when labels are absent', () => {
    const config = ConfigLoader.fromObject({
      functions: [],
      graph: { ...baseGraph(), showGrid: false }
    })

    expect(config.graph).toEqual({
      ...baseGraph(),
      showGrid: false,
      annotations: []
    })
    expect(config.graph).not.toHaveProperty('xAxisLabel')
    expect(config.graph).not.toHaveProperty('yAxisLabel')
  })

  it('does not add label fields to the default graph when graph is omitted', () => {
    const config = ConfigLoader.fromObject({ functions: [] })

    expect(config.graph).toEqual({
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10,
      showGrid: true,
      annotations: []
    })
  })
})
