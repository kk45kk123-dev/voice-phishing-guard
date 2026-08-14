type BannerKind = 'error' | 'warning' | 'info' | 'loading'

const STYLES: Record<BannerKind, string> = {
  error: 'bg-red-50 text-red-900 border-red-600',
  warning: 'bg-yellow-50 text-yellow-900 border-yellow-600',
  info: 'bg-blue-50 text-blue-900 border-blue-600',
  loading: 'bg-gray-50 text-gray-800 border-gray-400',
}

export function Banner({
  kind,
  children,
}: {
  kind: BannerKind
  children: React.ReactNode
}) {
  return (
    <div role="status" className={`rounded-lg border-2 p-4 leading-relaxed ${STYLES[kind]}`}>
      {children}
    </div>
  )
}
