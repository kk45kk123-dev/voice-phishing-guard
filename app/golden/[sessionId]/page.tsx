'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Banner } from '@/app/_components/Banner'
import type { StepStatus } from '@/lib/schemas/steps'

interface StepRow {
  step_id: string
  seq: number
  status: StepStatus
  title: string
}

type ViewState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; steps: StepRow[]; done: number; total: number }

export default function GoldenPage() {
  const params = useParams<{ sessionId: string }>()
  const sessionId = params.sessionId
  const [view, setView] = useState<ViewState>({ phase: 'loading' })
  const [updating, setUpdating] = useState<string | null>(null)
  const [startedAt] = useState(() => Date.now())
  const [elapsedMin, setElapsedMin] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/steps?session_id=${sessionId}`)
      if (!res.ok) {
        setView({ phase: 'error', message: '진행 상황을 불러오지 못했습니다.' })
        return
      }
      const data = await res.json()
      setView({ phase: 'ready', steps: data.steps, done: data.progress.done, total: data.progress.total })
    } catch {
      setView({ phase: 'error', message: '진행 상황 서버에 연결하지 못했습니다.' })
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    load()
  }, [sessionId, load])

  useEffect(() => {
    const id = setInterval(() => setElapsedMin(Math.floor((Date.now() - startedAt) / 60000)), 30000)
    return () => clearInterval(id)
  }, [startedAt])

  async function setStatus(stepId: string, status: StepStatus) {
    setUpdating(stepId)
    try {
      const res = await fetch('/api/session/steps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, step_id: stepId, status }),
      })
      if (res.ok) await load()
    } finally {
      setUpdating(null)
    }
  }

  if (view.phase === 'loading') return <Banner kind="loading">불러오는 중...</Banner>
  if (view.phase === 'error') return <Banner kind="error">{view.message}</Banner>

  const { steps, done, total } = view

  if (total === 0) {
    return (
      <main className="flex flex-col gap-4">
        <Banner kind="info">
          표시할 단계가 없습니다. 아직 확인된 공식 대응 절차가 없습니다.
        </Banner>
      </main>
    )
  }

  const progressPct = Math.round((done / total) * 100)

  return (
    <main className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-gray-500">경과 시간: {elapsedMin}분</p>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="h-full bg-blue-700" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {done} / {total} 단계 완료
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {steps.map((step) => (
          <li
            key={step.step_id}
            className="flex items-center justify-between gap-3 rounded-xl border-2 border-gray-200 p-4"
          >
            <div>
              <p className={step.status === 'DONE' ? 'text-gray-400 line-through' : 'font-medium'}>
                {step.title}
              </p>
              <p className="text-xs text-gray-400">{step.status}</p>
            </div>
            <button
              type="button"
              onClick={() => setStatus(step.step_id, step.status === 'DONE' ? 'PENDING' : 'DONE')}
              disabled={updating === step.step_id}
              className="shrink-0 rounded-lg border-2 border-blue-700 px-4 py-2 text-sm font-bold text-blue-700 disabled:opacity-50"
            >
              {step.status === 'DONE' ? '완료 취소' : '완료'}
            </button>
          </li>
        ))}
      </ul>

      {done === total && (
        <Banner kind="info">모든 단계를 완료했습니다. 수고하셨습니다.</Banner>
      )}
    </main>
  )
}
