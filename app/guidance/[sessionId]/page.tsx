'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Banner } from '@/app/_components/Banner'
import { RiskBadge } from '@/app/_components/RiskBadge'
import { loadUserContext, saveUserContext, type StoredUserContext } from '@/lib/session-client'
import { AGE_BANDS, DEVICE_TYPES } from '@/lib/schemas/guidance'
import type { RiskLevel } from '@/lib/schemas/analysis'
import type { GuidanceStep } from '@/lib/kb/playbook'

const AGE_BAND_LABELS: Record<(typeof AGE_BANDS)[number], string> = {
  '20s': '20대',
  '30s': '30대',
  '40s': '40대',
  '50s': '50대',
  '60s': '60대',
  '70s_plus': '70대 이상',
}
const DEVICE_LABELS: Record<(typeof DEVICE_TYPES)[number], string> = {
  android: '안드로이드',
  ios: '아이폰',
  unknown: '잘 모름',
}

type ViewState =
  | { phase: 'context' }
  | { phase: 'loading' }
  | { phase: 'fallback'; message: string; riskLevel: RiskLevel | null }
  | {
      phase: 'ready'
      riskLevel: RiskLevel
      compoundNotice: string | null
      steps: GuidanceStep[]
    }
  | { phase: 'error'; message: string }

export default function GuidancePage() {
  const router = useRouter()
  const params = useParams<{ sessionId: string }>()
  const sessionId = params.sessionId
  const [view, setView] = useState<ViewState>({ phase: 'context' })
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [updating, setUpdating] = useState<string | null>(null)
  const [ctx, setCtx] = useState<StoredUserContext>({})

  useEffect(() => {
    setCtx(loadUserContext() ?? {})
  }, [])

  // S6(맥락, 선택)은 반드시 스킵 가능해야 한다(§2 규칙) — userContext를
  // undefined로 보내면 그냥 기본 동작과 같다.
  async function fetchGuidance(userContext: StoredUserContext | null) {
    setView({ phase: 'loading' })
    try {
      const res = await fetch('/api/guidance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          user_context: userContext && Object.keys(userContext).length > 0 ? userContext : undefined,
        }),
      })
      const data = await res.json()
      if (res.status === 409) {
        setView({ phase: 'error', message: '먼저 상황 분석을 완료해 주세요.' })
        return
      }
      if (!res.ok) {
        setView({ phase: 'error', message: '행동요령을 불러오지 못했습니다.' })
        return
      }
      if (data.fallback) {
        setView({ phase: 'fallback', message: data.message, riskLevel: data.risk_level ?? null })
        return
      }
      setView({
        phase: 'ready',
        riskLevel: data.risk_level,
        compoundNotice: data.compound_notice,
        steps: data.steps,
      })
    } catch {
      setView({ phase: 'error', message: '행동요령 서버에 연결하지 못했습니다.' })
    }
  }

  function submitContext() {
    saveUserContext(ctx)
    fetchGuidance(ctx)
  }

  function skipContext() {
    fetchGuidance(null)
  }

  function toggleExpanded(stepId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(stepId) ? next.delete(stepId) : next.add(stepId)
      return next
    })
  }

  async function markDone(stepId: string) {
    setUpdating(stepId)
    try {
      const res = await fetch('/api/session/steps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, step_id: stepId, status: 'DONE' }),
      })
      if (res.ok) {
        setDoneSteps((prev) => new Set(prev).add(stepId))
      }
    } finally {
      setUpdating(null)
    }
  }

  if (view.phase === 'context') {
    return (
      <main className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold">몇 가지만 더 알려주시면 더 편하게 안내해 드려요</h1>
          <p className="mt-1 text-sm text-gray-500">전부 선택 사항입니다. 절차나 근거는 바뀌지 않고, 표시 방식만 조금 조정됩니다.</p>
        </div>

        <div>
          <p className="mb-2 font-semibold">연령대</p>
          <div className="flex flex-wrap gap-2">
            {AGE_BANDS.map((band) => (
              <button
                key={band}
                type="button"
                onClick={() => setCtx((c) => ({ ...c, age_band: c.age_band === band ? undefined : band }))}
                className={`rounded-full border-2 px-4 py-2 text-sm font-medium ${
                  ctx.age_band === band ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-gray-300'
                }`}
              >
                {AGE_BAND_LABELS[band]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 font-semibold">사용 중인 스마트폰</p>
          <div className="flex flex-wrap gap-2">
            {DEVICE_TYPES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setCtx((c) => ({ ...c, device: c.device === d ? undefined : d }))}
                className={`rounded-full border-2 px-4 py-2 text-sm font-medium ${
                  ctx.device === d ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-gray-300'
                }`}
              >
                {DEVICE_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block font-semibold" htmlFor="primary-bank">
            주로 거래하는 금융회사 (있다면)
          </label>
          <input
            id="primary-bank"
            type="text"
            value={ctx.primary_bank ?? ''}
            onChange={(e) => setCtx((c) => ({ ...c, primary_bank: e.target.value || undefined }))}
            placeholder="예: OO은행"
            className="w-full rounded-xl border-2 border-gray-300 p-3 text-base"
          />
          <p className="mt-1 text-xs text-gray-400">
            입력하신 금융회사와 일치하는 공식 연락처가 있으면 먼저 보여드립니다.
          </p>
        </div>

        <button
          type="button"
          onClick={submitContext}
          className="w-full rounded-xl bg-blue-700 px-6 py-4 hover:bg-blue-800 text-lg font-bold text-white"
        >
          적용하고 계속하기
        </button>
        <button type="button" onClick={skipContext} className="text-center text-sm text-gray-500 underline">
          건너뛰기
        </button>
      </main>
    )
  }

  if (view.phase === 'loading') return <Banner kind="loading">행동요령을 준비하는 중...</Banner>

  if (view.phase === 'error') {
    return (
      <main className="flex flex-col gap-4">
        <Banner kind="error">{view.message}</Banner>
      </main>
    )
  }

  if (view.phase === 'fallback') {
    return (
      <main className="flex flex-col gap-4">
        {view.riskLevel && <RiskBadge level={view.riskLevel} />}
        <Banner kind="warning">
          <span className="whitespace-pre-line">{view.message}</span>
        </Banner>
        <p className="text-sm text-gray-500">
          공식 대응 절차 데이터가 아직 준비되지 않았습니다. 이용하시는 금융회사
          고객센터 또는 가까운 경찰서로 직접 문의해 주세요.
        </p>
      </main>
    )
  }

  const { riskLevel, compoundNotice, steps } = view
  // STEP 9 개인화(범위: 가독성만): 60대 이상이면 본문 글씨를 한 단계 키운다.
  // "효과가 있다"는 주장은 하지 않는다 — 접근성 조정일 뿐이다.
  const isLargeText = ctx.age_band === '60s' || ctx.age_band === '70s_plus'
  return (
    <main className={`flex flex-col gap-6 ${isLargeText ? 'text-lg' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <RiskBadge level={riskLevel} />
        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">
          ✓ 공식 출처 기반 안내
        </span>
      </div>

      {compoundNotice && (
        <Banner kind="warning">
          {compoundNotice}
          <br />
          <span className="text-sm">※ 되돌리기 어려운 순서로 정렬했습니다</span>
        </Banner>
      )}

      <ul className="flex flex-col gap-4">
        {steps.map((step, idx) => {
          const isDone = doneSteps.has(step.step_id)
          const isTopPriority = idx === 0 && !isDone
          return (
            <li
              key={step.step_id}
              className={`rounded-xl border-2 p-4 ${
                isTopPriority ? 'border-red-600 bg-red-50' : 'border-gray-200'
              }`}
            >
              {isTopPriority && (
                <p className="mb-2 text-sm font-bold text-red-700">🚨 지금 가장 먼저 하세요</p>
              )}
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                    isTopPriority ? 'bg-red-600' : 'bg-blue-700'
                  }`}
                >
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <p className={`font-semibold ${isDone ? 'text-gray-400 line-through' : ''}`}>
                    {step.title}
                  </p>
                  {step.why && <p className="mt-1 text-sm text-gray-500">{step.why}</p>}

                  {step.channels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {step.channels.map((ch) =>
                        ch.type === 'PHONE' ? (
                          <a
                            key={ch.value}
                            href={`tel:${ch.value}`}
                            className={`rounded-lg px-3 py-2 text-sm font-medium ${
                              ch.is_primary_bank_match
                                ? 'bg-blue-700 text-white'
                                : 'bg-blue-50 text-blue-800'
                            }`}
                          >
                            {ch.is_primary_bank_match ? '⭐ ' : '📞 '}
                            {ch.label} ({ch.value})
                          </a>
                        ) : (
                          <a
                            key={ch.value}
                            href={ch.value}
                            target="_blank"
                            rel="noreferrer"
                            className={`rounded-lg px-3 py-2 text-sm font-medium ${
                              ch.is_primary_bank_match
                                ? 'bg-blue-700 text-white'
                                : 'bg-blue-50 text-blue-800'
                            }`}
                          >
                            🔗 {ch.label}
                          </a>
                        )
                      )}
                    </div>
                  )}

                  {step.evidence.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(step.step_id)}
                      className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600"
                    >
                      📄 근거 보기 — 이 안내가 어디서 왔는지 확인
                    </button>
                  )}
                  {expanded.has(step.step_id) && (
                    <ul className="mt-2 flex flex-col gap-2">
                      {step.evidence.map((ev) => (
                        <li key={ev.chunk_id} className="rounded-lg bg-gray-50 p-3 text-sm">
                          <p>{ev.raw_text}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            출처: {ev.source_org} · 수집일: {ev.collected_at}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <button
                    type="button"
                    onClick={() => markDone(step.step_id)}
                    disabled={isDone || updating === step.step_id}
                    className="mt-3 w-full rounded-lg border-2 border-blue-700 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    {isDone ? '완료됨' : updating === step.step_id ? '처리 중...' : '완료로 표시'}
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => router.push(`/golden/${sessionId}`)}
        className="w-full rounded-xl bg-blue-700 px-6 py-4 hover:bg-blue-800 text-lg font-bold text-white"
      >
        다음: 진행 상황 확인
      </button>
    </main>
  )
}
