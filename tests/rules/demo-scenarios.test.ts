import { describe, expect, it } from 'vitest'
import { computeRisk } from '@/lib/rules/risk'
import { orderStates } from '@/lib/rules/priority'
import { MockAnalyzeProvider } from '@/lib/ai/providers/mock'

// Phase 2 STEP 11: 공모전 데모로 지정된 두 대표 시나리오(A/B)에 대한
// Rule Engine 정확성. 이 두 테스트는 KB/Supabase 없이도 "위험도·우선순위
// 계산"이 맞는지 확인한다 — 실제 데이터가 아직 없어도 검증 가능한 부분.

describe('시나리오 A: 기관사칭 + 송금 완료', () => {
  it('CRITICAL이고, 우선순위 정렬 결과가 MONEY_SENT 그대로다', () => {
    const risk = computeRisk(['MONEY_SENT'], 'IMPERSONATION_AUTHORITY')
    expect(risk).toBe('CRITICAL')
    expect(orderStates(['MONEY_SENT'])).toEqual(['MONEY_SENT'])
  })
})

describe('시나리오 B: 악성앱 설치 + 개인정보/인증정보 제공 (복합)', () => {
  it('CRITICAL이고, APP_INSTALLED가 CREDENTIAL_DISCLOSED보다 먼저 온다', () => {
    const states = ['CREDENTIAL_DISCLOSED', 'APP_INSTALLED'] as const
    const risk = computeRisk([...states], 'MALICIOUS_APP_LINK')
    expect(risk).toBe('CRITICAL')
    expect(orderStates([...states])).toEqual(['APP_INSTALLED', 'CREDENTIAL_DISCLOSED'])
  })
})

describe('STEP 13 데모 문장 — mock 프로바이더의 실제(현재) 동작 확인', () => {
  // "은행 직원을 사칭하는 전화를 받았고, 앱 설치와 인증번호를 요구한 뒤
  // 500만원을 송금했습니다." — 사용자가 제시한 데모 원문 그대로.
  it('현재 mock은 이 문장에서 MONEY_SENT만 확실히 인식한다 — 결과를 있는 그대로 기록한다', async () => {
    const provider = new MockAnalyzeProvider()
    const text = '은행 직원을 사칭하는 전화를 받았고, 앱 설치와 인증번호를 요구한 뒤 500만원을 송금했습니다.'
    const out = await provider.analyze({ text, entryPath: 'ALREADY_SENT' })

    // "요구한"(스캐머가 요구)이지 "설치했다/알려줬다"(피해자가 실행)가
    // 아니라서, 지금의 키워드 기반 mock은 APP_INSTALLED/CREDENTIAL_DISCLOSED를
    // 확정 상태로 못 잡는다 — 이건 버그가 아니라 키워드 매칭의 한계다.
    // 이 사실을 테스트로 고정해 둔다(데모 문장을 임의로 손보지 않는다).
    expect(out.result.states).toContain('MONEY_SENT')
    expect(out.result.case_code).toBe('MALICIOUS_APP_LINK')

    const risk = computeRisk(out.result.states, out.result.case_code)
    expect(risk).toBe('CRITICAL') // MONEY_SENT 하나만으로도 이미 CRITICAL
  })
})
