import type { CaseCode, RiskLevel, State } from '@/lib/schemas/analysis'

// DEV_SPEC.md §4-3 그대로. LLM 미개입, 순수 함수.
export function computeRisk(states: State[], caseCode: CaseCode): RiskLevel {
  if (states.includes('MONEY_SENT')) return 'CRITICAL'
  if (states.includes('APP_INSTALLED')) return 'CRITICAL'
  if (states.includes('CREDENTIAL_DISCLOSED')) return 'CRITICAL'
  if (states.includes('ACCOUNT_INFO_DISCLOSED')) return 'DANGER'
  if (states.includes('PII_DISCLOSED')) return 'DANGER'
  if (states.includes('LINK_CLICKED')) return 'DANGER'
  if (caseCode !== 'UNKNOWN') return 'CAUTION'
  return 'SAFE'
}
