import { describe, expect, it } from 'vitest'
import { orderStates, buildCompoundNotice, STATE_PRIORITY } from '@/lib/rules/priority'
import type { State } from '@/lib/schemas/analysis'

describe('orderStates', () => {
  it('되돌리기 어려운 순서(MONEY_SENT 먼저)로 정렬한다', () => {
    const input: State[] = ['LINK_CLICKED', 'MONEY_SENT', 'PII_DISCLOSED']
    expect(orderStates(input)).toEqual(['MONEY_SENT', 'PII_DISCLOSED', 'LINK_CLICKED'])
  })

  it('전체 7종 우선순위가 명세(§4-4)와 일치한다', () => {
    const all: State[] = ['NONE', 'LINK_CLICKED', 'PII_DISCLOSED', 'ACCOUNT_INFO_DISCLOSED', 'CREDENTIAL_DISCLOSED', 'APP_INSTALLED', 'MONEY_SENT']
    expect(orderStates(all)).toEqual([
      'MONEY_SENT',
      'APP_INSTALLED',
      'CREDENTIAL_DISCLOSED',
      'ACCOUNT_INFO_DISCLOSED',
      'PII_DISCLOSED',
      'LINK_CLICKED',
      'NONE',
    ])
  })

  it('원본 배열을 변경하지 않는다', () => {
    const input: State[] = ['LINK_CLICKED', 'MONEY_SENT']
    const copy = [...input]
    orderStates(input)
    expect(input).toEqual(copy)
  })

  it('STATE_PRIORITY는 State 7종을 모두 다룬다', () => {
    expect(Object.keys(STATE_PRIORITY).sort()).toEqual(
      ['NONE', 'LINK_CLICKED', 'PII_DISCLOSED', 'ACCOUNT_INFO_DISCLOSED', 'CREDENTIAL_DISCLOSED', 'APP_INSTALLED', 'MONEY_SENT'].sort()
    )
  })
})

describe('buildCompoundNotice', () => {
  it('states가 1개 이하면 null', () => {
    expect(buildCompoundNotice(['MONEY_SENT'])).toBeNull()
    expect(buildCompoundNotice([])).toBeNull()
  })

  it('states가 2개 이상이면 개수를 포함한 안내 문구를 만든다', () => {
    expect(buildCompoundNotice(['MONEY_SENT', 'APP_INSTALLED'])).toBe(
      '2가지 피해가 동시에 확인됩니다. 순서가 중요합니다.'
    )
    expect(buildCompoundNotice(['MONEY_SENT', 'APP_INSTALLED', 'LINK_CLICKED'])).toContain('3가지')
  })
})
