// 브라우저 전용 세션 ID 보관 유틸. DEV_SPEC.md §F1: "세션 ID (쿠키 아님,
// localStorage + URL 파라미터)". 상태관리 라이브러리를 쓰지 않는다는
// §8-1 방침에 따라 순수 함수 몇 개로만 구성한다.

const STORAGE_KEY = 'vpg_session_id'

export function saveSessionId(id: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // localStorage 접근 불가(프라이빗 모드 등) — 조용히 무시, URL 파라미터로도 전달되므로 흐름은 유지된다
  }
}

export function loadSessionId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

// STEP 9(Phase 2): S6 "맥락(선택)" 입력값. DEV_SPEC.md 화면표에 있던 것을
// 지금 최소 범위로 구현한다 — 연령대/기기/주거래은행, 전부 선택 사항.
const USER_CONTEXT_KEY = 'vpg_user_context'

export interface StoredUserContext {
  age_band?: string
  device?: string
  primary_bank?: string
}

export function saveUserContext(ctx: StoredUserContext): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(USER_CONTEXT_KEY, JSON.stringify(ctx))
  } catch {
    // 저장 실패해도 흐름은 계속된다 — 다음에 다시 물어보면 된다
  }
}

export function loadUserContext(): StoredUserContext | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(USER_CONTEXT_KEY)
    return raw ? (JSON.parse(raw) as StoredUserContext) : null
  } catch {
    return null
  }
}

// URL 파라미터(sid)를 우선으로 하고, 없으면 localStorage로 폴백한다.
// useSearchParams() 대신 window.location을 직접 읽어 Suspense 경계 없이도
// 쓸 수 있게 한다(이 페이지들은 어차피 전부 클라이언트 전용 상호작용이다).
export function resolveSessionId(searchParamName = 'sid'): string | null {
  if (typeof window === 'undefined') return null
  const fromUrl = new URLSearchParams(window.location.search).get(searchParamName)
  if (fromUrl) {
    saveSessionId(fromUrl)
    return fromUrl
  }
  return loadSessionId()
}
