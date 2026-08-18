'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSessionId } from '@/lib/session-client'
import { Banner } from '@/app/_components/Banner'

type ButtonKey = 'suspicious' | 'already-happened'

export default function Home() {
  const router = useRouter()
  const [pending, setPending] = useState<ButtonKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function startSession(key: ButtonKey) {
    setPending(key)
    setError(null)
    try {
      const res = await fetch('/api/session', { method: 'POST' })
      if (!res.ok) throw new Error('SESSION_CREATE_FAILED')
      const data = (await res.json()) as { session_id: string }
      saveSessionId(data.session_id)
      router.push(`/entry?sid=${data.session_id}`)
    } catch {
      setError('세션을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setPending(null)
    }
  }

  return (
    <main className="flex min-h-[80vh] flex-col justify-center gap-8">
      <div>
        <h1 className="text-2xl font-bold leading-snug">
          보이스피싱, 탐지는 되고 있습니다.
          <br />
          <span className="text-blue-700">그 다음은요?</span>
        </h1>
        <p className="mt-3 text-base text-gray-600">
          은행·통신사가 이상 징후를 알려준 다음, 지금 무엇을 해야 할지 순서대로 안내합니다.
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => startSession('suspicious')}
          disabled={pending !== null}
          className="w-full rounded-xl bg-blue-700 px-6 py-4 hover:bg-blue-800 text-lg font-bold text-white disabled:opacity-60"
        >
          {pending === 'suspicious' ? '세션을 만드는 중...' : '지금 의심스러워요'}
        </button>
        <button
          type="button"
          onClick={() => startSession('already-happened')}
          disabled={pending !== null}
          className="w-full rounded-xl border-2 border-red-700 bg-red-50 px-6 py-4 hover:bg-red-100 text-lg font-bold text-red-800 disabled:opacity-60"
        >
          {pending === 'already-happened' ? '세션을 만드는 중...' : '이미 당했어요'}
        </button>
      </div>

      <p className="text-center text-sm text-gray-400">
        로그인 없이 익명으로 진행됩니다.
      </p>
    </main>
  )
}
