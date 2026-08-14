import type { AnalyzeProvider } from '@/lib/ai/types'
import { MockAnalyzeProvider } from '@/lib/ai/providers/mock'

// 프로바이더 선택 지점. DEV_SPEC.md §8-1: "LLM_PROVIDER 환경변수로 교체
// 가능하게 추상화". Phase 1 범위에서는 실제 LLM 프로바이더를 연결하지
// 않는다(§13) — LLM_PROVIDER가 설정되어도 아직 실제 구현이 없으므로 항상
// mock을 반환한다. 실제 프로바이더 추가 시 이 함수 안에서만 분기를
// 넓히면 되고, route/화면 코드는 바뀌지 않는다.
export function getAnalyzeProvider(): AnalyzeProvider {
  return new MockAnalyzeProvider()
}
