'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Banner } from '@/app/_components/Banner'
import { RiskBadge } from '@/app/_components/RiskBadge'
import {
  CASE_CODES,
  STATES,
  CONFIDENCE_MANUAL_THRESHOLD,
  type AnalysisResult,
  type CaseCode,
  type RiskLevel,
  type State,
} from '@/lib/schemas/analysis'

const CASE_LABELS: Record<CaseCode, string> = {
  IMPERSONATION_AUTHORITY: '기관사칭',
  LOAN_PRETEXT: '대출빙자',
  IMPERSONATION_ACQUAINTANCE: '가족·지인사칭',
  MALICIOUS_APP_LINK: '악성앱·링크',
  CREDENTIAL_THEFT: '개인정보·인증정보 탈취',
  UNKNOWN: '판별 불가',
}

const STATE_LABELS: Record<State, string> = {
  NONE: '아직 아무것도 하지 않음',
  LINK_CLICKED: '링크 클릭',
  PII_DISCLOSED: '개인정보(신분증·주민번호) 제공',
  ACCOUNT_INFO_DISCLOSED: '계좌번호·비밀번호 제공',
  CREDENTIAL_DISCLOSED: '인증번호·OTP 제공',
  APP_INSTALLED: '앱 설치',
  MONEY_SENT: '송금 완료',
}

type ViewState =
  | { phase: 'loading' }
  | { phase: 'analyzing' }
  | { phase: 'manual-entry' }
  | { phase: 'result'; analysis: AnalysisResult; riskLevel: RiskLevel; isDemo: boolean }
  | { phase: 'out-of-scope' }
  | { phase: 'error'; message: string }

export default function AnalysisPage() {
  const router = useRouter()
  const params = useParams<{ sessionId: string }>()
  const sessionId = params.sessionId
  const [view, setView] = useState<ViewState>({ phase: 'loading' })
  const [manualCase, setManualCase] = useState<CaseCode>('UNKNOWN')
  const [manualStates, setManualStates] = useState<State[]>([])
  const [manualSubmitting, setManualSubmitting] = useState(false)

  const runAnalyze = useCallback(
    async (text: string) => {
      setView({ phase: 'analyzing' })
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, text, entry_path: 'SELF_SUSPICION' }),
        })
        const data = await res.json()
        if (res.status === 422) {
          setView({ phase: 'out-of-scope' })
          return
        }
        if (!res.ok) {
          setView({ phase: 'error', message: '분석에 실패했습니다. 직접 선택해 주세요.' })
          return
        }
        if (data.needs_manual) {
          setManualCase(data.analysis.case_code)
          setManualStates(data.analysis.states)
          setView({ phase: 'manual-entry' })
          return
        }
        setView({
          phase: 'result',
          analysis: data.analysis,
          riskLevel: data.risk_level,
          isDemo: Boolean(data.is_demo),
        })
      } catch {
        setView({ phase: 'error', message: '분석 서버에 연결하지 못했습니다.' })
      }
    },
    [sessionId]
  )

  const loadExisting = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyze?session_id=${sessionId}`)
      if (res.status === 404) return false
      if (!res.ok) return false
      const data = await res.json()
      setView({
        phase: 'result',
        analysis: data.analysis,
        riskLevel: data.risk_level,
        isDemo: false,
      })
      return true
    } catch {
      return false
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const search = new URLSearchParams(window.location.search)

    if (search.get('manual') === '1') {
      setView({ phase: 'manual-entry' })
      return
    }

    if (search.get('pending') === '1') {
      const text = (() => {
        try {
          return window.sessionStorage.getItem(`vpg_pending_text_${sessionId}`)
        } catch {
          return null
        }
      })()
      if (text) {
        runAnalyze(text)
        return
      }
    }

    loadExisting().then((found) => {
      if (!found) {
        setView({
          phase: 'error',
          message: '분석할 상황이 없습니다. 상황 입력 화면으로 돌아가 주세요.',
        })
      }
    })
  }, [sessionId, runAnalyze, loadExisting])

  async function submitManual() {
    setManualSubmitting(true)
    try {
      const res = await fetch('/api/analyze/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          case_code: manualCase,
          states: manualStates.length > 0 ? manualStates : ['NONE'],
        }),
      })
      if (!res.ok) throw new Error('MANUAL_FAILED')
      const data = await res.json()
      setView({
        phase: 'result',
        analysis: data.analysis,
        riskLevel: data.risk_level,
        isDemo: false,
      })
    } catch {
      setView({ phase: 'error', message: '직접 선택한 내용을 저장하지 못했습니다.' })
    } finally {
      setManualSubmitting(false)
    }
  }

  function toggleState(state: State) {
    setManualStates((prev) => {
      if (state === 'NONE') return prev.includes('NONE') ? [] : ['NONE']
      const withoutNone = prev.filter((s) => s !== 'NONE')
      return withoutNone.includes(state)
        ? withoutNone.filter((s) => s !== state)
        : [...withoutNone, state]
    })
  }

  if (view.phase === 'loading') return <Banner kind="loading">불러오는 중...</Banner>

  if (view.phase === 'analyzing') {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
        <p className="text-base text-gray-600">상황을 분석하고 있습니다...</p>
      </main>
    )
  }

  if (view.phase === 'out-of-scope') {
    return (
      <main className="flex flex-col gap-4">
        <Banner kind="info">
          입력하신 내용에서 금융사기와 관련된 정보를 찾지 못했습니다. 다시 상황을 설명해 주시거나,
          직접 유형을 선택해 주세요.
        </Banner>
        <a
          href={`/situation?sid=${sessionId}`}
          className="rounded-xl border-2 border-gray-300 px-5 py-3 text-center font-medium"
        >
          다시 입력하기
        </a>
        <button
          type="button"
          onClick={() => setView({ phase: 'manual-entry' })}
          className="rounded-xl bg-blue-700 px-5 py-3 text-center font-bold text-white"
        >
          직접 선택할게요
        </button>
      </main>
    )
  }

  if (view.phase === 'error') {
    return (
      <main className="flex flex-col gap-4">
        <Banner kind="error">{view.message}</Banner>
        <a
          href={`/situation?sid=${sessionId}`}
          className="rounded-xl border-2 border-gray-300 px-5 py-3 text-center font-medium"
        >
          상황 입력으로 돌아가기
        </a>
        <button
          type="button"
          onClick={() => setView({ phase: 'manual-entry' })}
          className="rounded-xl bg-blue-700 px-5 py-3 text-center font-bold text-white"
        >
          직접 선택할게요
        </button>
      </main>
    )
  }

  if (view.phase === 'manual-entry') {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">어떤 상황에 가장 가까운가요?</h1>
        <p className="text-sm text-gray-500">
          AI가 자동으로 판단하기 어려운 경우입니다. 직접 선택해 주세요.
        </p>

        <div>
          <p className="mb-2 font-semibold">사기 유형</p>
          <div className="flex flex-col gap-2">
            {CASE_CODES.map((code) => (
              <label
                key={code}
                className="flex items-center gap-3 rounded-xl border-2 border-gray-200 p-3"
              >
                <input
                  type="radio"
                  name="case_code"
                  checked={manualCase === code}
                  onChange={() => setManualCase(code)}
                  className="h-5 w-5"
                />
                {CASE_LABELS[code]}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 font-semibold">지금까지 한 행동 (여러 개 선택 가능)</p>
          <div className="flex flex-col gap-2">
            {STATES.map((state) => (
              <label
                key={state}
                className="flex items-center gap-3 rounded-xl border-2 border-gray-200 p-3"
              >
                <input
                  type="checkbox"
                  checked={manualStates.includes(state)}
                  onChange={() => toggleState(state)}
                  className="h-5 w-5"
                />
                {STATE_LABELS[state]}
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={submitManual}
          disabled={manualSubmitting}
          className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-bold text-white disabled:opacity-60"
        >
          {manualSubmitting ? '저장하는 중...' : '이 내용으로 진행하기'}
        </button>
      </main>
    )
  }

  const { analysis, riskLevel, isDemo } = view
  const isUrgent = riskLevel === 'CRITICAL' || riskLevel === 'DANGER'
  return (
    <main className="flex flex-col gap-6">
      {isDemo && (
        <Banner kind="warning">
          ⚠️ 데모 모드: 실제 AI 분석이 아닌 규칙 기반 임시 분석입니다 (LLM 연동 전).
        </Banner>
      )}

      {/* 위험 상황에서는 긴 설명보다 "지금 해야 할 일"로 바로 가는 길을
          가장 먼저 보여준다 — 사기 유형 설명은 그 다음이다. */}
      <RiskBadge level={riskLevel} />
      {isUrgent && (
        <button
          type="button"
          onClick={() => router.push(`/guidance/${sessionId}`)}
          className="w-full rounded-xl bg-red-600 px-6 py-4 text-lg font-bold text-white"
        >
          🚨 지금 바로 대응 방법 확인하기
        </button>
      )}

      <div>
        <p className="text-sm text-gray-500">분석 결과</p>
        <h1 className="text-2xl font-bold">{CASE_LABELS[analysis.case_code]}</h1>
      </div>

      {analysis.observed_facts.length > 0 && (
        <div>
          <p className="mb-2 font-semibold">관찰된 사실</p>
          <ul className="flex flex-col gap-2">
            {analysis.observed_facts.map((fact, i) => (
              <li key={i} className="rounded-xl bg-gray-50 p-3 text-sm">
                <span className="font-medium">{fact.fact}</span>
                <br />
                <span className="text-gray-500">&ldquo;{fact.quote}&rdquo;</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 font-semibold">진행 단계</p>
        <ul className="flex flex-wrap gap-2">
          {analysis.states.map((s) => (
            <li key={s} className="rounded-full bg-gray-100 px-3 py-1 text-sm">
              {STATE_LABELS[s]}
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => {
          setManualCase(analysis.case_code)
          setManualStates(analysis.states)
          setView({ phase: 'manual-entry' })
        }}
        className="text-center text-sm text-gray-500 underline"
      >
        이게 맞나요? 직접 수정
      </button>

      {analysis.confidence < CONFIDENCE_MANUAL_THRESHOLD && (
        <Banner kind="warning">분석 확신도가 낮습니다. 직접 수정을 권장합니다.</Banner>
      )}

      <button
        type="button"
        onClick={() => router.push(`/guidance/${sessionId}`)}
        className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-bold text-white"
      >
        다음: 행동요령 보기
      </button>
    </main>
  )
}
