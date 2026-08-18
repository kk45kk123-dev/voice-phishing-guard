import path from 'node:path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// vitest(Vite)는 next dev/build/start와 달리 .env.local을 자동으로 읽지
// 않는다 — 그건 Next.js CLI에만 있는 동작이다. loadEnv는 Vite 표준 API로
// .env, .env.local, .env.[mode], .env.[mode].local을 순서대로 읽어 병합한다.
// 세 번째 인자를 ''로 주면 VITE_ 접두사 제한 없이 전부 로드한다(공식 문서
// 권장 패턴). 여기서 읽은 값은 로그로 찍지 않고 test.env로만 전달한다 —
// vitest.config.ts는 어차피 git에 커밋되는 파일이므로 값 자체가 아니라
// "어디서 읽어오는지"만 여기 있고, 실제 값은 .env.local(gitignore 대상)에만
// 존재한다.
const env = loadEnv('', process.cwd(), '')

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
    env: {
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      LLM_PROVIDER: env.LLM_PROVIDER,
    },
  },
})
