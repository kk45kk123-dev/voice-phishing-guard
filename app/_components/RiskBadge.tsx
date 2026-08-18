import type { RiskLevel } from '@/lib/schemas/analysis'

const STYLES: Record<RiskLevel, string> = {
  SAFE: 'bg-green-100 text-green-900 border-green-700',
  CAUTION: 'bg-yellow-100 text-yellow-900 border-yellow-700',
  DANGER: 'bg-orange-100 text-orange-900 border-orange-700',
  CRITICAL: 'bg-red-100 text-red-900 border-red-700',
}

const DOT_STYLES: Record<RiskLevel, string> = {
  SAFE: 'bg-green-600',
  CAUTION: 'bg-yellow-600',
  DANGER: 'bg-orange-600',
  CRITICAL: 'bg-red-600',
}

const LABELS: Record<RiskLevel, string> = {
  SAFE: '안전',
  CAUTION: '주의',
  DANGER: '위험',
  CRITICAL: '긴급',
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-base font-bold shadow-sm ${STYLES[level]}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${DOT_STYLES[level]} ${level === 'CRITICAL' ? 'animate-pulse' : ''}`}
      />
      {LABELS[level]} ({level})
    </span>
  )
}
