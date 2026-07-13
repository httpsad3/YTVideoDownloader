'use client'

import { useState } from 'react'
import { UrlForm } from '@/components/UrlForm'
import { FormatPicker, type DownloadState, rowKey } from '@/components/FormatPicker'
import { ErrorBanner } from '@/components/ErrorBanner'
import type { AnalyzeResponse, DownloadMode } from '@/lib/api-types'
import { formatDuration } from '@/lib/format'

export default function Page() {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({})

  async function handleAnalyze(url: string) {
    setIsAnalyzing(true)
    setAnalyzeError(null)
    setAnalysis(null)
    setDownloadStates({})

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      const data = await response.json()
      if (!response.ok) {
        setAnalyzeError(data.error ?? 'No se pudo analizar el video.')
        return
      }
      setAnalysis(data as AnalyzeResponse)
    } catch {
      setAnalyzeError('No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleDownload(row: { mode: DownloadMode; formatId: string; estimatedBytes: number | null }) {
    if (!analysis) return
    const key = rowKey(row.mode, row.formatId)

    setDownloadStates(prev => ({ ...prev, [key]: { phase: 'iniciando', loaded: 0, total: row.estimatedBytes } }))

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: analysis.url, formatId: row.formatId, mode: row.mode })
      })

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({ error: 'No se pudo descargar.' }))
        throw new Error(data.error ?? 'No se pudo descargar.')
      }

      const filename = extractFilename(response.headers.get('Content-Disposition')) ?? 'descarga'
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          loaded += value.byteLength
          setDownloadStates(prev => ({
            ...prev,
            [key]: { phase: 'transfiriendo', loaded, total: row.estimatedBytes }
          }))
        }
      }

      saveBlob(new Blob(chunks as BlobPart[]), filename)
      setDownloadStates(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo descargar.'
      setDownloadStates(prev => ({ ...prev, [key]: { phase: 'error', loaded: 0, total: null, error: message } }))
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-10 sm:py-16">
      <header className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rec-500 animate-blink" aria-hidden />
        <span className="font-display text-sm font-bold uppercase tracking-[0.2em] text-paper/80">REC/DL</span>
      </header>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-bold leading-tight text-paper sm:text-4xl">
          Pega el link, elige la pista, grábala.
        </h1>
        <p className="max-w-lg text-sm text-paper/60">
          Descarga el video en la calidad que quieras, o solo el audio, directo desde tu navegador. Nada se guarda en
          el servidor.
        </p>
      </div>

      <UrlForm onSubmit={handleAnalyze} isBusy={isAnalyzing} />

      {analyzeError && <ErrorBanner message={analyzeError} onDismiss={() => setAnalyzeError(null)} />}

      {analysis && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <div className="flex gap-4 panel p-4">
            {analysis.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={analysis.thumbnail}
                alt=""
                className="h-20 w-32 shrink-0 rounded-sm object-cover"
              />
            )}
            <div className="flex flex-col justify-center gap-1">
              <p className="font-display text-base leading-snug text-paper">{analysis.title}</p>
              <p className="font-mono text-xs text-paper/50">{formatDuration(analysis.durationSeconds)}</p>
            </div>
          </div>

          <FormatPicker analysis={analysis} downloadStates={downloadStates} onDownload={handleDownload} />
        </div>
      )}

      <footer className="mt-auto border-t border-deck-700 pt-4 text-xs leading-relaxed text-paper/40">
        Usa esta herramienta solo para contenido del cual tengas los derechos o para uso personal. Respeta los
        derechos de autor de quienes crean los videos.
      </footer>
    </main>
  )
}

function extractFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const match = /filename="([^"]+)"/.exec(contentDisposition)
  return match?.[1] ?? null
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}
