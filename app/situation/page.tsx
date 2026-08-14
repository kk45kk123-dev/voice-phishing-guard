'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolveSessionId } from '@/lib/session-client'
import { Banner } from '@/app/_components/Banner'
import { SITUATION_SAMPLES } from '@/lib/demo/samples'
import { MAX_SITUATION_TEXT_LENGTH } from '@/lib/schemas/analysis'

export default function SituationPage() {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSessionId(resolveSessionId())
    setReady(true)
  }, [])

  async function submit(value: string) {
    if (!sessionId) return
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      setError('상황을 입력하거나 예시를 선택해 주세요.')
      return
    }
    if (trimmed.length > MAX_SITUATION_TEXT_LENGTH) {
      setError(`${MAX_SITUATION_TEXT_LENGTH}자를 넘을 수 없습니다.`)
      return
    }
    setSubmitting(true)
    setError(null)
    router.push(`/analysis/${sessionId}?pending=1`)
    try {
      sessionStorage.setItem(`vpg_pending_text_${sessionId}`, trimmed)
    } catch {
      // sessionStorage 접근 불가 시에도 analysis 페이지가 재시도 안내를 보여준다
    }
  }

  if (!ready) return <Banner kind="loading">불러오는 중...</Banner>
  if (!sessionId) {
    return (
      <Banner kind="error">
        세션을 찾을 수 없습니다.{' '}
        <a href="/" className="underline">
          처음으로 돌아가기
        </a>
      </Banner>
    )
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">어떤 상황인지 편하게 적어 주세요</h1>

      {error && <Banner kind="error">{error}</Banner>}

      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_SITUATION_TEXT_LENGTH}
          rows={6}
          placeholder="예: 검찰청이라면서 전화가 와서..."
          className="w-full rounded-xl border-2 border-gray-300 p-4 text-base"
        />
        <p className="mt-1 text-right text-sm text-gray-400">
          {text.length} / {MAX_SITUATION_TEXT_LENGTH}
        </p>
      </div>

      <button
        type="button"
        onClick={() => submit(text)}
        disabled={submitting || text.trim().length === 0}
        className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-bold text-white disabled:opacity-60"
      >
        분석 시작하기
      </button>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-500">또는 비슷한 예시를 선택하세요 (타이핑 없이 진행)</p>
        {SITUATION_SAMPLES.map((sample) => (
          <button
            key={sample.id}
            type="button"
            onClick={() => submit(sample.text)}
            disabled={submitting}
            className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm disabled:opacity-60"
          >
            <span className="font-semibold">{sample.label}</span>
            <br />
            <span className="text-gray-500">{sample.text}</span>
          </button>
        ))}
      </div>

      <a
        href={`/analysis/${sessionId}?manual=1`}
        className="text-center text-sm text-gray-500 underline"
      >
        건너뛰고 직접 선택할게요
      </a>
    </main>
  )
}
