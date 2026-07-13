// Límites y parámetros ajustables por variable de entorno, sin necesidad de tocar código.

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const config = {
  /** Duración máxima de video permitida, para acotar cómputo/ancho de banda por descarga. */
  maxVideoDurationMinutes: readIntEnv('MAX_VIDEO_DURATION_MINUTES', 20),

  /** Descargas permitidas por IP dentro de la ventana de rate limit. */
  rateLimitMaxRequests: readIntEnv('RATE_LIMIT_MAX_REQUESTS', 8),

  /** Duración de la ventana de rate limit, en minutos. */
  rateLimitWindowMinutes: readIntEnv('RATE_LIMIT_WINDOW_MINUTES', 10),

  /** Bitrate objetivo al convertir audio a mp3. */
  mp3BitrateKbps: readIntEnv('MP3_BITRATE_KBPS', 192)
} as const

export const maxVideoDurationSeconds = config.maxVideoDurationMinutes * 60
