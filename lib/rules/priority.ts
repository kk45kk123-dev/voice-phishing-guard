import type { State } from '@/lib/schemas/analysis'

// DEV_SPEC.md §4-4 그대로. 되돌릴 수 없는 것 우선.
export const STATE_PRIORITY: Record<State, number> = {
  MONEY_SENT: 1,
  APP_INSTALLED: 2,
  CREDENTIAL_DISCLOSED: 3,
  ACCOUNT_INFO_DISCLOSED: 4,
  PII_DISCLOSED: 5,
  LINK_CLICKED: 6,
  NONE: 7,
}

// STATE_PRIORITY는 State의 모든 값을 다루는 완전한 매핑이므로 조회 결과는
// 항상 number다. noUncheckedIndexedAccess가 Record 인덱싱에도 undefined를
// 붙이므로, 그 사실을 아는 지점에서만 non-null assertion으로 명시한다.
function priorityOf(state: State): number {
  return STATE_PRIORITY[state]!
}

export function orderStates(states: State[]): State[] {
  return [...states].sort((a, b) => priorityOf(a) - priorityOf(b))
}

// DEV_SPEC.md §4-5: 복합 피해 안내 문구. Rule Engine이 만들며 AI가 쓰지 않는다.
export function buildCompoundNotice(states: State[]): string | null {
  if (states.length < 2) return null
  return `${states.length}가지 피해가 동시에 확인됩니다. 순서가 중요합니다.`
}
