import clsx from 'clsx'
import { formatBytes } from '@/lib/format'

interface ProgressIndicatorProps {
  phase: 'iniciando' | 'transfiriendo' | 'error'
  loaded: number
  total: number | null
}

const PHASE_LABEL: Record<ProgressIndicatorProps['phase'], string> = {
  iniciando: 'preparando en el servidor…',
  transfiriendo: 'transfiriendo…',
  error: 'falló'
}

export function ProgressIndicator({ phase, loaded, total }: ProgressIndicatorProps) {
  const percent = total ? Math.min(100, Math.round((loaded / total) * 100)) : null

  return (
    <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'h-2 w-2 rounded-full',
            phase === 'error' ? 'bg-rec-500' : 'bg-rec-500 animate-blink'
          )}
          aria-hidden
        />
        <span className="font-mono text-xs uppercase tracking-wider text-paper/70">
          {PHASE_LABEL[phase]}
        </span>
        <span className="font-mono text-xs text-paper/50">
          {formatBytes(loaded)}
          {total ? ` / ${formatBytes(total)}` : ''}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-deck-600">
        <div
          className={clsx('h-full bg-amber-500 transition-all', percent === null && 'w-1/4 animate-pulse')}
          style={percent !== null ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  )
}
