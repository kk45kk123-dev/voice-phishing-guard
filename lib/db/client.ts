import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 서버 전용. 이 모듈은 app/api/** route handler와 Server Component에서만 import한다.
// 절대 클라이언트 컴포넌트에서 import하지 않는다 — service_role key가 번들에 섞여
// 들어가지 않도록 하는 유일한 방어선은 "이 파일을 서버 코드에서만 부른다"는 규율이다.
export class DbNotConfiguredError extends Error {
  constructor() {
    super('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.')
    this.name = 'DbNotConfiguredError'
  }
}

let cached: SupabaseClient | null = null

export function isDbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// service_role 클라이언트는 RLS를 우회한다(Phase 0 보완 설계 결정).
// 그래서 이 클라이언트로 실행하는 모든 쿼리는 반드시 lib/db/session-guard.ts /
// lib/db/session-repo.ts를 거쳐 session_id로 스코프를 강제해야 한다.
export function getServerSupabaseClient(): SupabaseClient {
  if (cached) return cached
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new DbNotConfiguredError()
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}
