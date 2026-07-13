'use client'

import type { AnalyzeResponse, DownloadMode } from '@/lib/api-types'
import { formatBytes } from '@/lib/format'
import { ProgressIndicator } from './ProgressIndicator'

export interface DownloadState {
  phase: 'iniciando' | 'transfiriendo' | 'error'
  loaded: number
  total: number | null
  error?: string
}

interface Row {
  key: string
  mode: DownloadMode
  formatId: string
  label: string
  hint: string
  estimatedBytes: number | null
}

interface FormatPickerProps {
  analysis: AnalyzeResponse
  downloadStates: Record<string, DownloadState>
  onDownload: (row: Row) => void
}

export function rowKey(mode: DownloadMode, formatId: string): string {
  return `${mode}:${formatId}`
}

export function FormatPicker({ analysis, downloadStates, onDownload }: FormatPickerProps) {
  const videoRows: Row[] = analysis.videoOptions.map(option => ({
    key: rowKey('video', option.formatId),
    mode: 'video',
    formatId: option.formatId,
    label: option.label,
    hint: option.kind === 'merge' ? 'video + audio fusionados con ffmpeg' : 'descarga directa',
    estimatedBytes: option.estimatedBytes
  }))

  const audioRows: Row[] = []
  if (analysis.bestAudioM4a) {
    audioRows.push({
      key: rowKey('audio-m4a', analysis.bestAudioM4a.formatId),
      mode: 'audio-m4a',
      formatId: analysis.bestAudioM4a.formatId,
      label: 'Audio original (m4a)',
      hint: 'descarga directa, sin recodificar',
      estimatedBytes: analysis.bestAudioM4a.estimatedBytes
    })
  }
  if (analysis.bestAudioAny) {
    audioRows.push({
      key: rowKey('audio-mp3', analysis.bestAudioAny.formatId),
      mode: 'audio-mp3',
      formatId: analysis.bestAudioAny.formatId,
      label: 'Audio en mp3',
      hint: 'se convierte con ffmpeg',
      estimatedBytes: analysis.bestAudioAny.estimatedBytes
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <TrackList title="Pistas de video" rows={videoRows} downloadStates={downloadStates} onDownload={onDownload} />
      <TrackList title="Solo audio" rows={audioRows} downloadStates={downloadStates} onDownload={onDownload} />
    </div>
  )
}

function TrackList({
  title,
  rows,
  downloadStates,
  onDownload
}: {
  title: string
  rows: Row[]
  downloadStates: Record<string, DownloadState>
  onDownload: (row: Row) => void
}) {
  if (rows.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-mono text-xs uppercase tracking-widest text-paper/50">{title}</h2>
      <ul className="flex flex-col divide-y divide-deck-600 overflow-hidden rounded-md border border-deck-600">
        {rows.map(row => {
          const state = downloadStates[row.key]
          const isBusy = state && state.phase !== 'error'

          return (
            <li key={row.key} className="flex flex-col gap-2 bg-deck-800/60 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-sm text-paper">{row.label}</p>
                  <p className="font-mono text-xs text-paper/40">{row.hint}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-paper/50">{formatBytes(row.estimatedBytes)}</span>
                  <button
                    type="button"
                    disabled={Boolean(isBusy)}
                    onClick={() => onDownload(row)}
                    className="shrink-0 rounded-md border border-amber-500/60 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-amber-400 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ⏺ Grabar
                  </button>
                </div>
              </div>
              {state && (
                <ProgressIndicator phase={state.phase} loaded={state.loaded} total={state.total ?? row.estimatedBytes} />
              )}
              {state?.phase === 'error' && state.error && (
                <p className="font-mono text-xs text-rec-500">{state.error}</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
