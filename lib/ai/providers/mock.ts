import type { AnalysisResult, CaseCode, State } from '@/lib/schemas/analysis'
import type { AnalyzeInput, AnalyzeOutput, AnalyzeProvider } from '@/lib/ai/types'

// ⚠️ 실제 LLM이 아니다. 키워드 매칭 기반 결정론적 목(mock) 구현.
// 목적: LLM 연동 전에도 F3~F5 사용자 흐름을 처음부터 끝까지 테스트하기 위함.
// DEV_SPEC.md §3 "AI가 하지 않는 것: 위험도·순서·절차"는 이 mock에도 그대로
// 적용된다 — 여기서는 case_code/states/observed_facts/confidence만 추출하고
// 위험도·우선순위는 절대 계산하지 않는다(lib/rules/의 몫).

const CASE_KEYWORDS: Array<[CaseCode, string[]]> = [
  ['IMPERSONATION_AUTHORITY', ['검찰', '경찰', '금감원', '수사', '계좌가 연루', '금융감독원']],
  ['LOAN_PRETEXT', ['대출', '저금리', '한도 상향', '신용등급', '대환']],
  ['IMPERSONATION_ACQUAINTANCE', ['아들', '딸', '자녀', '번호가 바뀌', '기기 고장', '엄마', '아빠']],
  ['MALICIOUS_APP_LINK', ['앱을 설치', '앱 설치', '링크', '택배', '고지서', '단축 url', '단축url']],
  ['CREDENTIAL_THEFT', ['인증번호', '신분증', '계좌 비밀번호', 'otp', '주민번호']],
]

const STATE_KEYWORDS: Array<[State, string[]]> = [
  ['MONEY_SENT', ['송금했', '이체했', '보냈어요', '보냈습니다', '입금했']],
  ['APP_INSTALLED', ['앱을 설치했', '앱 설치했', '설치했어요']],
  ['CREDENTIAL_DISCLOSED', ['인증번호를 알려', '인증번호 알려', 'otp를 알려', '인증번호를 불러']],
  ['ACCOUNT_INFO_DISCLOSED', ['계좌번호를 알려', '계좌 비밀번호를 알려', '계좌번호 알려']],
  ['PII_DISCLOSED', ['신분증을 보내', '주민번호를 알려', '신분증 사진']],
  ['LINK_CLICKED', ['링크를 눌렀', '링크 클릭', '링크를 클릭']],
]

const FINANCIAL_CONTEXT_KEYWORDS = [
  '계좌',
  '송금',
  '전화',
  '문자',
  '사기',
  '은행',
  '카드',
  '앱',
  '링크',
  '인증',
  '금융',
  '대출',
]

function findQuote(text: string, keywords: string[]): { keyword: string; quote: string } | null {
  const lower = text.toLowerCase()
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase())
    if (idx !== -1) {
      const start = Math.max(0, idx - 10)
      const end = Math.min(text.length, idx + kw.length + 10)
      return { keyword: kw, quote: text.slice(start, end).trim().slice(0, 120) }
    }
  }
  return null
}

export class MockAnalyzeProvider implements AnalyzeProvider {
  async analyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
    const { text } = input
    const observedFacts: AnalysisResult['observed_facts'] = []

    let caseCode: CaseCode = 'UNKNOWN'
    for (const [code, keywords] of CASE_KEYWORDS) {
      const hit = findQuote(text, keywords)
      if (hit) {
        caseCode = code
        observedFacts.push({ fact: `'${hit.keyword}' 관련 진술이 확인됨`, quote: hit.quote })
        break
      }
    }

    const states: State[] = []
    for (const [state, keywords] of STATE_KEYWORDS) {
      const hit = findQuote(text, keywords)
      if (hit) {
        states.push(state)
        observedFacts.push({ fact: `'${hit.keyword}' 관련 진술이 확인됨`, quote: hit.quote })
      }
    }
    if (states.length === 0) states.push('NONE')

    const hasFinancialContext = FINANCIAL_CONTEXT_KEYWORDS.some((kw) =>
      text.toLowerCase().includes(kw.toLowerCase())
    )
    const isOutOfScope = caseCode === 'UNKNOWN' && states[0] === 'NONE' && !hasFinancialContext

    const matchedSomething = caseCode !== 'UNKNOWN' || states[0] !== 'NONE'
    const confidence = isOutOfScope ? 0.1 : matchedSomething ? 0.85 : 0.3

    const result: AnalysisResult = {
      case_code: caseCode,
      states,
      observed_facts: observedFacts.slice(0, 6),
      missing_info: matchedSomething ? [] : ['구체적인 상황 설명이 더 필요합니다'],
      confidence,
      is_out_of_scope: isOutOfScope,
    }

    return { result, providerKind: 'mock', providerId: 'mock-keyword-v1' }
  }
}
