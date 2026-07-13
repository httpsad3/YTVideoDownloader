interface ErrorBannerProps {
  message: string
  onDismiss?: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-rec-600/50 bg-rec-500/10 px-4 py-3 text-sm text-paper animate-fade-in">
      <span className="mt-0.5 font-mono text-rec-500" aria-hidden>
        ⏺
      </span>
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="font-mono text-xs text-paper/50 hover:text-paper"
          aria-label="Cerrar aviso"
        >
          ✕
        </button>
      )}
    </div>
  )
}
