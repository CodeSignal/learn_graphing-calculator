import { describe, expect, it } from 'vitest'
import {
  formatParameterValue,
  getStepDecimals,
  roundToStep
} from '../../../client/utils/parameter-number-format.js'

describe('parameter number formatting utilities', () => {
  it('rounds values to the nearest valid step', () => {
    expect(roundToStep(5.3, 0.5)).toBe(5.5)
    expect(roundToStep(5.3, 0)).toBe(5.3)
  })

  it('derives decimal precision from normal and scientific notation steps', () => {
    expect(getStepDecimals(1)).toBe(0)
    expect(getStepDecimals(0.01)).toBe(2)
    expect(getStepDecimals(1e-4)).toBe(4)
  })

  it('formats rounded parameter values using step precision', () => {
    expect(formatParameterValue(5, 1)).toBe('5')
    expect(formatParameterValue(1.234, 0.01)).toBe('1.23')
    expect(formatParameterValue(0.001, 0.0001)).toBe('0.0010')
  })
})
