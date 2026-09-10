import { describe, expect, it } from 'vitest'
import { parseResourcePathId } from './ids'

describe('resource IDs in URLs', () => {
  it('accepts numeric IDs and the supported product display codes', () => {
    expect(parseResourcePathId('001')).toBe(1)
    for (const value of ['1', 'PRD-001', 'prd001']) {
      expect(parseResourcePathId(value, 'PRD')).toBe(1)
    }
  })

  it('rejects invalid IDs instead of coercing them to another resource', () => {
    for (const value of [undefined, '', 'text', 'true', 'null', 'NaN', 'Infinity', '0', '-1', '1.0', '1.5', '1e2', '0x10', 'text1', '+1', ' 1', '1 ', 'CAT-001', 'PRD-0', '9007199254740992', '9'.repeat(5000)]) {
      expect(parseResourcePathId(value, 'PRD'), String(value)).toBeNull()
    }
    expect(parseResourcePathId('PRD-001')).toBeNull()
  })
})
