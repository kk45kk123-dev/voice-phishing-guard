import { NextResponse } from 'next/server'
import { DbNotConfiguredError } from '@/lib/db/client'

// §9 "상태 처리": DB 연결 실패·서버 오류도 사용자에게 명확히 표시되어야
// 한다. 이 래퍼가 없으면 DbNotConfiguredError 같은 예외가 그대로 튀어나가
// 빈 본문의 500만 응답한다(수동 브라우저 테스트에서 실제로 확인됨).
// 예상치 못한 에러의 스택트레이스는 서버 로그에만 남기고 응답에는 담지
// 않는다(§Phase 11 AC 취지를 Phase 1부터 지킨다).
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (err) {
      if (err instanceof DbNotConfiguredError) {
        return NextResponse.json({ error: 'DB_UNAVAILABLE' }, { status: 503 })
      }
      console.error('[api] unhandled error', err)
      return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
    }
  }
}
