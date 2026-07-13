// Formas de datos compartidas entre las rutas API y el cliente (sin lógica de servidor).

export type QualityKind = 'progressive' | 'merge'

export interface QualityOption {
  formatId: string
  kind: QualityKind
  label: string
  height: number
  estimatedBytes: number | null
}

export interface AudioOption {
  formatId: string
  estimatedBytes: number | null
}

export interface AnalyzeResponse {
  url: string
  title: string
  thumbnail: string | null
  durationSeconds: number | null
  videoOptions: QualityOption[]
  bestAudioM4a: AudioOption | null
  bestAudioAny: AudioOption | null
}

export interface ApiError {
  error: string
}

export type DownloadMode = 'video' | 'audio-m4a' | 'audio-mp3'
