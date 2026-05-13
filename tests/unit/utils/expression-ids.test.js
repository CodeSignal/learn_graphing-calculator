import { describe, expect, it } from 'vitest'
import { generateParameterAssignmentId } from '../../../client/utils/expression-ids.js'

describe('expression id utilities', () => {
  it('generates a semantic parameter assignment id with numeric suffixes on collision', () => {
    const existingFunctions = [
      { id: 'expr_1' },
      { id: 'param_rate' },
      { id: 'param_rate_2' }
    ]

    expect(generateParameterAssignmentId('rate', existingFunctions)).toBe('param_rate_3')
  })

  it('uses the base parameter assignment id when it is available', () => {
    expect(generateParameterAssignmentId('theta', [{ id: 'expr_1' }])).toBe('param_theta')
  })
})
