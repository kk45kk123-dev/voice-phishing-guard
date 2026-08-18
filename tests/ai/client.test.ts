import { afterEach, describe, expect, it } from 'vitest'
import { getAnalyzeProvider } from '@/lib/ai/client'
import { MockAnalyzeProvider } from '@/lib/ai/providers/mock'
import { ClaudeAnalyzeProvider } from '@/lib/ai/providers/claude'

// getAnalyzeProvider()의 분기 자체는 네트워크가 필요 없다 — LLM_PROVIDER
// 값만 보고 어떤 클래스를 반환하는지 확인한다(실제 API 호출은 여기 없음).
const ORIGINAL_LLM_PROVIDER = process.env.LLM_PROVIDER

describe('getAnalyzeProvider', () => {
  afterEach(() => {
    if (ORIGINAL_LLM_PROVIDER === undefined) delete process.env.LLM_PROVIDER
    else process.env.LLM_PROVIDER = ORIGINAL_LLM_PROVIDER
  })

  it('LLM_PROVIDER=claude이면 ClaudeAnalyzeProvider를 반환한다', () => {
    process.env.LLM_PROVIDER = 'claude'
    expect(getAnalyzeProvider()).toBeInstanceOf(ClaudeAnalyzeProvider)
  })

  it('LLM_PROVIDER가 없으면 MockAnalyzeProvider로 폴백한다', () => {
    delete process.env.LLM_PROVIDER
    expect(getAnalyzeProvider()).toBeInstanceOf(MockAnalyzeProvider)
  })

  it('LLM_PROVIDER=mock이면 MockAnalyzeProvider를 반환한다', () => {
    process.env.LLM_PROVIDER = 'mock'
    expect(getAnalyzeProvider()).toBeInstanceOf(MockAnalyzeProvider)
  })

  it('LLM_PROVIDER에 알 수 없는 값이 와도 안전하게 MockAnalyzeProvider로 폴백한다', () => {
    process.env.LLM_PROVIDER = 'no-such-provider'
    expect(getAnalyzeProvider()).toBeInstanceOf(MockAnalyzeProvider)
  })
})
