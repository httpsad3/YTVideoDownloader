import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import youtubedl from 'youtube-dl-exec'
import { ffmpegPath } from './ffmpeg'
import { maxVideoDurationSeconds } from './config'
import { getCookiesFilePath } from './cookies'

// `youtube-dl-exec` no expone `constants` en sus tipos, pero sí existe en
// runtime (ver su código fuente).
const ytdlpConstants = (
  youtubedl as unknown as { constants: { YOUTUBE_DL_PATH: string; YOUTUBE_DL_DIR: string } }
).constants

export class YtDlpBinaryMissingError extends Error {}

/**
 * Resuelve la ruta al binario de yt-dlp que realmente existe en disco.
 *
 * `YOUTUBE_DL_FILENAME=yt-dlp_linux` es obligatorio para que `npm install`
 * descargue el binario standalone (sin depender de python3, ver README) —
 * pero esa misma variable se vuelve a leer en runtime para ubicar el
 * binario, así que si algún comando (`npm run dev`, `npm run start`, etc.)
 * se ejecuta en un proceso que no la tiene exportada, la ruta calculada por
 * la librería no existe y el spawn falla con un ENOENT opaco.
 *
 * Para no depender de que se recuerde exportar la variable en cada comando,
 * primero se intenta la ruta que la librería calculó con el entorno actual
 * y, si no existe, se cae al binario `yt-dlp_linux` que el README pide
 * instalar explícitamente (el único que este proyecto realmente descarga).
 */
function resolveYtdlpBinaryPath(): string {
  const configuredPath = ytdlpConstants.YOUTUBE_DL_PATH
  if (existsSync(configuredPath)) return configuredPath

  const fallbackPath = path.join(ytdlpConstants.YOUTUBE_DL_DIR, 'yt-dlp_linux')
  if (existsSync(fallbackPath)) return fallbackPath

  throw new YtDlpBinaryMissingError(
    `No se encontró el binario de yt-dlp (se buscó en "${configuredPath}" y en "${fallbackPath}"). ` +
      'Ejecuta `YOUTUBE_DL_FILENAME=yt-dlp_linux npm install` para descargarlo (ver README, sección "yt-dlp en Vercel").'
  )
}

/** Instancia de yt-dlp ligada al binario que realmente existe en disco (ver `resolveYtdlpBinaryPath`). */
function getYtdlp() {
  return youtubedl.create(resolveYtdlpBinaryPath())
}

export class VideoUnavailableError extends Error {}
export class VideoTooLongError extends Error {
  constructor(public readonly durationSeconds: number) {
    super('El video excede la duración máxima permitida.')
  }
}

interface RawFormat {
  format_id: string
  ext: string
  vcodec?: string
  acodec?: string
  height?: number | null
  width?: number | null
  fps?: number | null
  tbr?: number | null
  filesize?: number | null
  filesize_approx?: number | null
  format_note?: string | null
  protocol?: string | null
}

interface RawVideoInfo {
  id: string
  title: string
  duration?: number | null
  thumbnail?: string | null
  is_live?: boolean
  formats: RawFormat[]
}

export type QualityKind = 'progressive' | 'merge'

export interface QualityOption {
  /** Selector que se pasa directo a `-f` de yt-dlp (un formatId, o "video+audio" para fusión). */
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

export interface VideoAnalysis {
  title: string
  thumbnail: string | null
  durationSeconds: number | null
  videoOptions: QualityOption[]
  /** Mejor audio-only nativo (normalmente m4a), para el modo "solo audio" sin recodificar. */
  bestAudioM4a: AudioOption | null
  /** Mejor audio-only en general, usado como fuente para transcodificar a mp3. */
  bestAudioAny: AudioOption | null
}

function isHttpFormat(format: RawFormat): boolean {
  return format.protocol !== 'm3u8' && format.protocol !== 'm3u8_native'
}

function hasVideo(format: RawFormat): boolean {
  return Boolean(format.vcodec) && format.vcodec !== 'none'
}

function hasAudio(format: RawFormat): boolean {
  return Boolean(format.acodec) && format.acodec !== 'none'
}

function estimateBytes(format: RawFormat): number | null {
  return format.filesize ?? format.filesize_approx ?? null
}

function pickBestByBitrate(formats: RawFormat[]): RawFormat | null {
  if (formats.length === 0) return null
  return formats.reduce((best, current) => ((current.tbr ?? 0) > (best.tbr ?? 0) ? current : best))
}

/** Traduce errores conocidos de yt-dlp a mensajes claros en español para la UI. */
export function translateYtDlpError(rawMessage: string): string {
  const message = rawMessage.toLowerCase()

  if (message.includes('private video')) {
    return 'Este video es privado y no se puede descargar.'
  }
  if (message.includes('sign in to confirm your age') || message.includes('age-restricted')) {
    return 'Este video tiene restricción de edad y no se puede descargar sin iniciar sesión.'
  }
  if (message.includes('video unavailable') || message.includes('this video is not available')) {
    return 'El video no está disponible (puede haber sido eliminado).'
  }
  if (message.includes('not available in your country') || message.includes('blocked it in your country')) {
    return 'El video está bloqueado por región y no se puede descargar desde este servidor.'
  }
  if (message.includes('removed by the user')) {
    return 'El video fue eliminado por quien lo subió.'
  }
  if (message.includes('this live event') || message.includes('is_live')) {
    return 'Las transmisiones en vivo no están soportadas, solo videos ya publicados.'
  }
  if (message.includes('unable to extract') || message.includes('unsupported url')) {
    return 'No se pudo leer información de ese link. Verifica que sea un video válido de YouTube.'
  }

  return 'No se pudo procesar el video. Intenta de nuevo en unos minutos.'
}

const NOTABLE_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240, 144]

export async function analyzeVideo(url: string): Promise<VideoAnalysis> {
  let info: RawVideoInfo
  try {
    const cookiesPath = getCookiesFilePath()
    info = (await getYtdlp()(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noPlaylist: true,
      noCheckCertificates: true,
      ...(cookiesPath ? { cookies: cookiesPath } : {})
    })) as unknown as RawVideoInfo
  } catch (error) {
    console.error('yt-dlp dumpSingleJson failed', error)
    // Un binario faltante es un problema de configuración del servidor, no
    // del video pedido: se propaga tal cual para responder 500, no 422.
    if (error instanceof YtDlpBinaryMissingError) throw error
    const stderr = error instanceof Error ? error.message : String(error)
    throw new VideoUnavailableError(translateYtDlpError(stderr), { cause: error })
  }

  if (info.is_live) {
    throw new VideoUnavailableError(translateYtDlpError('this live event'))
  }

  if (typeof info.duration === 'number' && info.duration > maxVideoDurationSeconds) {
    throw new VideoTooLongError(info.duration)
  }

  const formats = info.formats ?? []
  const httpFormats = formats.filter(isHttpFormat)

  const progressiveByHeight = new Map<number, RawFormat>()
  const videoOnlyByHeight = new Map<number, RawFormat>()
  const audioOnlyFormats: RawFormat[] = []

  for (const format of httpFormats) {
    if (hasVideo(format) && hasAudio(format) && format.height) {
      const current = progressiveByHeight.get(format.height)
      if (!current || (format.tbr ?? 0) > (current.tbr ?? 0)) {
        progressiveByHeight.set(format.height, format)
      }
    } else if (hasVideo(format) && !hasAudio(format) && format.height) {
      const current = videoOnlyByHeight.get(format.height)
      if (!current || (format.tbr ?? 0) > (current.tbr ?? 0)) {
        videoOnlyByHeight.set(format.height, format)
      }
    } else if (hasAudio(format) && !hasVideo(format)) {
      audioOnlyFormats.push(format)
    }
  }

  const bestAudio = pickBestByBitrate(audioOnlyFormats)
  const bestAudioM4a = pickBestByBitrate(audioOnlyFormats.filter(f => f.ext === 'm4a'))

  const videoOptions: QualityOption[] = []
  for (const height of NOTABLE_HEIGHTS) {
    const progressive = progressiveByHeight.get(height)
    if (progressive) {
      videoOptions.push({
        formatId: progressive.format_id,
        kind: 'progressive',
        label: `${height}p`,
        height,
        estimatedBytes: estimateBytes(progressive)
      })
      continue
    }

    // Para la fusión se prefiere audio m4a/aac (nativo de mp4) sobre webm/opus,
    // así el .mp4 resultante es compatible con la mayor cantidad de reproductores.
    const videoOnly = videoOnlyByHeight.get(height)
    const audioForMerge = bestAudioM4a ?? bestAudio
    if (videoOnly && audioForMerge) {
      videoOptions.push({
        formatId: `${videoOnly.format_id}+${audioForMerge.format_id}`,
        kind: 'merge',
        label: `${height}p (máxima calidad)`,
        height,
        estimatedBytes: addNullable(estimateBytes(videoOnly), estimateBytes(audioForMerge))
      })
    }
  }

  videoOptions.sort((a, b) => b.height - a.height)

  return {
    title: info.title,
    thumbnail: info.thumbnail ?? null,
    durationSeconds: info.duration ?? null,
    videoOptions,
    bestAudioM4a: bestAudioM4a
      ? { formatId: bestAudioM4a.format_id, estimatedBytes: estimateBytes(bestAudioM4a) }
      : null,
    bestAudioAny: bestAudio ? { formatId: bestAudio.format_id, estimatedBytes: estimateBytes(bestAudio) } : null
  }
}

function addNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null
  return (a ?? 0) + (b ?? 0)
}

/**
 * Devuelve el subproceso de yt-dlp con stdout listo para hacer pipe (descarga
 * directa, sin ffmpeg). Se invoca el binario directamente con `spawn` (en vez
 * del wrapper `.exec()` de la librería, que bufferiza TODO el stdout en
 * memoria antes de resolverse — inaceptable cuando el stdout es el propio
 * archivo de video/audio que queremos transmitir en streaming).
 */
export function spawnRawFormatStream(url: string, formatId: string) {
  const cookiesPath = getCookiesFilePath()
  return spawn(resolveYtdlpBinaryPath(), [
    url,
    '--format',
    formatId,
    '--output',
    '-',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '--no-part',
    ...(cookiesPath ? ['--cookies', cookiesPath] : [])
  ])
}

/** Descarga + fusiona video y audio en un archivo local usando ffmpeg, vía las flags nativas de yt-dlp. */
export function spawnMergeToFile(url: string, formatSelector: string, outputPath: string) {
  const cookiesPath = getCookiesFilePath()
  return getYtdlp().exec(url, {
    format: formatSelector,
    output: outputPath,
    mergeOutputFormat: 'mp4',
    ffmpegLocation: ffmpegPath,
    noPlaylist: true,
    noWarnings: true,
    noProgress: true,
    noCheckCertificates: true,
    noPart: true,
    ...(cookiesPath ? { cookies: cookiesPath } : {})
  })
}
