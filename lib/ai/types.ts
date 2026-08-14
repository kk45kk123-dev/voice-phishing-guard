import type { AnalysisResult } from '@/lib/schemas/analysis'
import type { EntryPath } from '@/lib/schemas/session'

export interface AnalyzeInput {
  text: string
  entryPath: EntryPath
}

export interface AnalyzeOutput {
  result: AnalysisResult
  /** 'mock'이면 실제 LLM이 아니라 규칙 기반 데모 응답이라는 뜻이다. */
  providerKind: 'mock' | 'llm'
  providerId: string
}

// AI-A(상황 분석)의 유일한 계약. 실제 LLM 프로바이더로 교체하더라도 이
// 인터페이스만 만족하면 route/화면 코드를 고칠 필요가 없다.
export interface AnalyzeProvider {
  analyze(input: AnalyzeInput): Promise<AnalyzeOutput>
}
