import { describe, expect, it } from 'vitest'
import { MockAnalyzeProvider } from '@/lib/ai/providers/mock'
import { AnalysisResultSchema } from '@/lib/schemas/analysis'

const provider = new MockAnalyzeProvider()

describe('MockAnalyzeProvider', () => {
  it('providerKind를 mock으로 표시한다 (실제 AI로 위장하지 않는다)', async () => {
    const out = await provider.analyze({ text: '아무 내용', entryPath: 'SELF_SUSPICION' })
    expect(out.providerKind).toBe('mock')
  })

  it('기관사칭 + 송금 완료 키워드를 인식한다', async () => {
    const out = await provider.analyze({
      text: '검찰청이라면서 계좌가 연루됐다고 해서 500만원을 송금했습니다.',
      entryPath: 'SELF_SUSPICION',
    })
    expect(out.result.case_code).toBe('IMPERSONATION_AUTHORITY')
    expect(out.result.states).toContain('MONEY_SENT')
    expect(AnalysisResultSchema.safeParse(out.result).success).toBe(true)
  })

  it('observed_facts의 quote는 항상 입력 원문의 부분 문자열이다', async () => {
    const text = '아들이라면서 문자로 연락이 와서 앱을 설치했어요.'
    const out = await provider.analyze({ text, entryPath: 'SELF_SUSPICION' })
    for (const fact of out.result.observed_facts) {
      expect(text).toContain(fact.quote)
    }
  })

  it('아무 키워드도 없으면 states는 [NONE]이다', async () => {
    const out = await provider.analyze({ text: '그냥 일상적인 하루였어요.', entryPath: 'SELF_SUSPICION' })
    expect(out.result.states).toEqual(['NONE'])
  })

  it('금융과 무관한 입력은 is_out_of_scope=true (공격 테스트 #10)', async () => {
    const out = await provider.analyze({ text: '오늘 점심 뭐 먹을지 고민이에요.', entryPath: 'SELF_SUSPICION' })
    expect(out.result.is_out_of_scope).toBe(true)
  })

  it('빈 입력/공백만 있어도 스키마를 만족하는 결과를 낸다 (공격 테스트 #9)', async () => {
    const out = await provider.analyze({ text: '   ', entryPath: 'SELF_SUSPICION' })
    expect(AnalysisResultSchema.safeParse(out.result).success).toBe(true)
  })

  it('아무것도 못 찾으면 confidence가 0.4 미만이다 (S4b 강제 이동 조건)', async () => {
    const out = await provider.analyze({ text: '음, 글쎄요.', entryPath: 'SELF_SUSPICION' })
    expect(out.result.confidence).toBeLessThan(0.4)
  })
})
