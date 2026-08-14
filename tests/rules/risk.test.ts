import { describe, expect, it } from 'vitest'
import { computeRisk } from '@/lib/rules/risk'
import type { CaseCode, State } from '@/lib/schemas/analysis'

describe('computeRisk', () => {
  const CASE: CaseCode = 'IMPERSONATION_AUTHORITY'

  it('MONEY_SENT은 항상 CRITICAL', () => {
    expect(computeRisk(['MONEY_SENT'], CASE)).toBe('CRITICAL')
    expect(computeRisk(['MONEY_SENT', 'LINK_CLICKED'], CASE)).toBe('CRITICAL')
  })

  it('APP_INSTALLED은 CRITICAL', () => {
    expect(computeRisk(['APP_INSTALLED'], CASE)).toBe('CRITICAL')
  })

  it('CREDENTIAL_DISCLOSED은 CRITICAL', () => {
    expect(computeRisk(['CREDENTIAL_DISCLOSED'], CASE)).toBe('CRITICAL')
  })

  it('ACCOUNT_INFO_DISCLOSED은 DANGER (CRITICAL 상태 없을 때)', () => {
    expect(computeRisk(['ACCOUNT_INFO_DISCLOSED'], CASE)).toBe('DANGER')
  })

  it('PII_DISCLOSED은 DANGER', () => {
    expect(computeRisk(['PII_DISCLOSED'], CASE)).toBe('DANGER')
  })

  it('LINK_CLICKED은 DANGER', () => {
    expect(computeRisk(['LINK_CLICKED'], CASE)).toBe('DANGER')
  })

  it('case_code가 있고 states가 NONE뿐이면 CAUTION', () => {
    expect(computeRisk(['NONE'], CASE)).toBe('CAUTION')
  })

  it('case_code가 UNKNOWN이고 NONE뿐이면 SAFE', () => {
    expect(computeRisk(['NONE'], 'UNKNOWN')).toBe('SAFE')
  })

  it('우선순위: MONEY_SENT > APP_INSTALLED > CREDENTIAL_DISCLOSED > ACCOUNT_INFO/PII/LINK', () => {
    const combos: Array<[State[], string]> = [
      [['LINK_CLICKED', 'MONEY_SENT'], 'CRITICAL'],
      [['ACCOUNT_INFO_DISCLOSED', 'APP_INSTALLED'], 'CRITICAL'],
      [['PII_DISCLOSED', 'CREDENTIAL_DISCLOSED'], 'CRITICAL'],
      [['PII_DISCLOSED', 'ACCOUNT_INFO_DISCLOSED'], 'DANGER'],
    ]
    for (const [states, expected] of combos) {
      expect(computeRisk(states, CASE)).toBe(expected)
    }
  })
})
