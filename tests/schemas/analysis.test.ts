import { describe, expect, it } from 'vitest'
import {
  AnalysisResultSchema,
  ManualAnalyzeRequestSchema,
  normalizeSituationText,
} from '@/lib/schemas/analysis'

function validResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    case_code: 'IMPERSONATION_AUTHORITY',
    states: ['MONEY_SENT'],
    observed_facts: [],
    missing_info: [],
    confidence: 0.9,
    ...overrides,
  }
}

describe('AnalysisResultSchema', () => {
  it('정상 데이터를 통과시킨다', () => {
    expect(AnalysisResultSchema.safeParse(validResult()).success).toBe(true)
  })

  it('states에 NONE이 있으면 다른 값과 함께 올 수 없다(§6-1 검증 규칙)', () => {
    const res = AnalysisResultSchema.safeParse(validResult({ states: ['NONE', 'MONEY_SENT'] }))
    expect(res.success).toBe(false)
  })

  it('NONE 단독은 허용한다', () => {
    expect(AnalysisResultSchema.safeParse(validResult({ states: ['NONE'] })).success).toBe(true)
  })

  it('states 중복을 거부한다', () => {
    const res = AnalysisResultSchema.safeParse(
      validResult({ states: ['MONEY_SENT', 'MONEY_SENT'] })
    )
    expect(res.success).toBe(false)
  })

  it('states가 8개 이상이면 거부한다', () => {
    const res = AnalysisResultSchema.safeParse(
      validResult({
        states: [
          'LINK_CLICKED',
          'PII_DISCLOSED',
          'ACCOUNT_INFO_DISCLOSED',
          'CREDENTIAL_DISCLOSED',
          'APP_INSTALLED',
          'MONEY_SENT',
          'LINK_CLICKED',
          'PII_DISCLOSED',
        ],
      })
    )
    expect(res.success).toBe(false)
  })

  it('알 수 없는 case_code enum 값을 거부한다', () => {
    const res = AnalysisResultSchema.safeParse(validResult({ case_code: 'NOT_A_CASE' }))
    expect(res.success).toBe(false)
  })

  it('confidence 범위를 벗어나면 거부한다', () => {
    expect(AnalysisResultSchema.safeParse(validResult({ confidence: 1.2 })).success).toBe(false)
    expect(AnalysisResultSchema.safeParse(validResult({ confidence: -0.1 })).success).toBe(false)
  })

  it('quote 최대 길이(120)를 초과하면 거부한다', () => {
    const res = AnalysisResultSchema.safeParse(
      validResult({ observed_facts: [{ fact: 'f', quote: 'x'.repeat(121) }] })
    )
    expect(res.success).toBe(false)
  })
})

describe('ManualAnalyzeRequestSchema', () => {
  it('session_id가 UUID가 아니면 거부한다', () => {
    const res = ManualAnalyzeRequestSchema.safeParse({
      session_id: 'not-a-uuid',
      case_code: 'UNKNOWN',
      states: ['NONE'],
    })
    expect(res.success).toBe(false)
  })
})

describe('normalizeSituationText', () => {
  it('제어문자를 제거한다', () => {
    expect(normalizeSituationText('안녕\x00하세요\x07')).toBe('안녕하세요')
  })

  it('탭/줄바꿈은 보존한다', () => {
    expect(normalizeSituationText('첫줄\n둘째줄')).toBe('첫줄\n둘째줄')
  })

  it('연속 공백을 하나로 줄인다', () => {
    expect(normalizeSituationText('안녕    하세요')).toBe('안녕 하세요')
  })

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeSituationText('  안녕  ')).toBe('안녕')
  })
})
