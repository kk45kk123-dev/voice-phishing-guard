import type { AnalyzeProvider } from '@/lib/ai/types'
import { MockAnalyzeProvider } from '@/lib/ai/providers/mock'
import { ClaudeAnalyzeProvider } from '@/lib/ai/providers/claude'

// 프로바이더 선택 지점. DEV_SPEC.md §8-1: "LLM_PROVIDER 환경변수로 교체
// 가능하게 추상화". LLM_PROVIDER=claude일 때만 실제 Claude Haiku 4.5
// provider를 쓰고, 그 외(미설정·mock·오타 등)에는 항상 mock으로 안전하게
// 폴백한다 — route/화면 코드는 이 분기를 몰라도 된다.
export function getAnalyzeProvider(): AnalyzeProvider {
  if (process.env.LLM_PROVIDER === 'claude') {
    return new ClaudeAnalyzeProvider()
  }
  return new MockAnalyzeProvider()
}
