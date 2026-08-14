'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Banner } from '@/app/_components/Banner'
import { RiskBadge } from '@/app/_components/RiskBadge'
import type { RiskLevel } from '@/lib/schemas/analysis'
import type { GuidanceStep } from '@/lib/kb/playbook'

type ViewState =
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
  const [view, setView] = useState<ViewState>({ phase: 'loading' })
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    ;(async () => {
      try {
        const res = await fetch('/api/guidance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
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
    })()
  }, [sessionId])

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
          공식 대응 절차 데이터가 아직 준비되지 않았습니다. 급한 경우 112(경찰) 또는
          금융회사 고객센터로 즉시 연락해 주세요.
        </p>
      </main>
    )
  }

  const { riskLevel, compoundNotice, steps } = view
  return (
    <main className="flex flex-col gap-6">
      <RiskBadge level={riskLevel} />

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
          return (
            <li key={step.step_id} className="rounded-xl border-2 border-gray-200 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white">
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
                            className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800"
                          >
                            📞 {ch.label} ({ch.value})
                          </a>
                        ) : (
                          <a
                            key={ch.value}
                            href={ch.value}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800"
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
                      className="mt-2 text-sm text-gray-500 underline"
                    >
                      근거 보기
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
                    className="mt-3 w-full rounded-lg border-2 border-blue-700 py-2 text-sm font-bold text-blue-700 disabled:border-gray-300 disabled:text-gray-400"
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
        className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-bold text-white"
      >
        다음: 진행 상황 확인
      </button>
    </main>
  )
}
