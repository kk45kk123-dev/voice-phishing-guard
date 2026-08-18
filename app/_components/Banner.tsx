type BannerKind = 'error' | 'warning' | 'info' | 'loading'

const STYLES: Record<BannerKind, string> = {
  error: 'bg-red-50 text-red-900 border-red-600',
  warning: 'bg-yellow-50 text-yellow-900 border-yellow-600',
  info: 'bg-blue-50 text-blue-900 border-blue-600',
  loading: 'bg-gray-50 text-gray-800 border-gray-400',
}

// 아이콘을 Banner가 직접 붙인다 — 호출부마다 "⚠️ "를 손으로 붙이지 않게
// 해서, 문구를 바꿔도 아이콘이 중복되거나 빠지는 일이 없게 한다.
function BannerIcon({ kind }: { kind: BannerKind }) {
  if (kind === 'loading') {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"
      />
    )
  }
  const glyph = { error: '⚠️', warning: '⚠️', info: 'ℹ️' }[kind]
  return (
    <span aria-hidden="true" className="shrink-0 leading-none">
      {glyph}
    </span>
  )
}

export function Banner({
  kind,
  children,
}: {
  kind: BannerKind
  children: React.ReactNode
}) {
  return (
    <div role="status" className={`flex items-start gap-2 rounded-lg border-2 p-4 leading-relaxed ${STYLES[kind]}`}>
      <BannerIcon kind={kind} />
      <div className="flex-1">{children}</div>
    </div>
  )
}
