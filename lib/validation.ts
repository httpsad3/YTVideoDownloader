import { z } from 'zod'

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be'
])

const VIDEO_ID_PATTERN = /^[\w-]{11}$/

export class InvalidYoutubeUrlError extends Error {}

/**
 * Valida que la URL sea de YouTube y contenga un ID de video individual
 * (no aceptamos playlists/canales completos, solo un video por vez).
 * Devuelve la URL normalizada apuntando siempre a ese video.
 */
export function normalizeYoutubeUrl(rawUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new InvalidYoutubeUrlError('El texto ingresado no es una URL válida.')
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new InvalidYoutubeUrlError('La URL debe usar http o https.')
  }

  if (!YOUTUBE_HOSTS.has(parsed.hostname)) {
    throw new InvalidYoutubeUrlError('El link debe ser de youtube.com o youtu.be.')
  }

  let videoId: string | null = null

  if (parsed.hostname.endsWith('youtu.be')) {
    videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? null
  } else if (parsed.pathname.startsWith('/shorts/')) {
    videoId = parsed.pathname.split('/')[2] ?? null
  } else if (parsed.pathname === '/watch') {
    videoId = parsed.searchParams.get('v')
  } else if (parsed.pathname.startsWith('/live/')) {
    videoId = parsed.pathname.split('/')[2] ?? null
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    throw new InvalidYoutubeUrlError(
      'No se encontró un video individual en ese link. Playlists y canales completos no están soportados.'
    )
  }

  return `https://www.youtube.com/watch?v=${videoId}`
}

export const analyzeRequestSchema = z.object({
  url: z.string().min(1, 'Falta el link de YouTube.').max(2048)
})

export const downloadRequestSchema = z.object({
  url: z.string().min(1, 'Falta el link de YouTube.').max(2048),
  formatId: z.string().min(1).max(64),
  mode: z.enum(['video', 'audio-m4a', 'audio-mp3'])
})
