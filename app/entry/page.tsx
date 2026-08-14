'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { resolveSessionId } from '@/lib/session-client'
import { Banner } from '@/app/_components/Banner'
import type { EntryPath } from '@/lib/schemas/session'

const ENTRY_OPTIONS: Array<{ code: EntryPath; label: string }> = [
  { code: 'FDS_ALERT', label: '은행·카드사에서 이상거래 알림을 받았어요' },
  { code: 'CARRIER_WARNING', label: '통화 중 사기의심 표시가 떴어요' },
  { code: 'BANK_CALL', label: '금융회사에서 확인 전화를 받았어요' },
  { code: 'SELF_SUSPICION', label: '이상하다고 느꼈어요' },
  { code: 'ALREADY_SENT', label: '이미 송금했어요' },
  { code: 'ALREADY_DISCLOSED', label: '이미 정보를 알려줬어요 / 앱을 설치했어요' },
]

export default function EntryPage() {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<EntryPath | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSessionId(resolveSessionId())
    setReady(true)
  }, [])

  async function choose(entryPath: EntryPath) {
    if (!sessionId) return
    setPending(entryPath)
    setError(null)
    try {
      const res = await fetch('/api/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, entry_path: entryPath }),
      })
      if (!res.ok) throw new Error('PATCH_FAILED')
      router.push(`/situation?sid=${sessionId}`)
    } catch {
      setError('진입 경로를 저장하지 못했습니다. 다시 시도해 주세요.')
      setPending(null)
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
      <h1 className="text-xl font-bold">지금 상황과 가장 가까운 것을 선택해 주세요</h1>
      {error && <Banner kind="error">{error}</Banner>}
      <div className="flex flex-col gap-3">
        {ENTRY_OPTIONS.map((opt) => (
          <button
            key={opt.code}
            type="button"
            onClick={() => choose(opt.code)}
            disabled={pending !== null}
            className="w-full rounded-xl border-2 border-gray-300 bg-white px-5 py-4 text-left text-base font-medium disabled:opacity-60"
          >
            {pending === opt.code ? '저장하는 중...' : opt.label}
          </button>
        ))}
      </div>
    </main>
  )
}
