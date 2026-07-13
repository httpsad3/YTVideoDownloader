import { NextRequest, NextResponse } from 'next/server'
import { analyzeVideo, VideoTooLongError, VideoUnavailableError, YtDlpBinaryMissingError } from '@/lib/ytdlp'
import { analyzeRequestSchema, InvalidYoutubeUrlError, normalizeYoutubeUrl } from '@/lib/validation'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { config } from '@/lib/config'
import { debugPayload } from '@/lib/debug'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rateLimit = checkRateLimit(`analyze:${ip}`)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Demasiadas solicitudes. Intenta de nuevo en ${rateLimit.retryAfterSeconds} segundos.` },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsedBody = analyzeRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Falta el link de YouTube.' }, { status: 400 })
  }

  let url: string
  try {
    url = normalizeYoutubeUrl(parsedBody.data.url)
  } catch (error) {
    const message = error instanceof InvalidYoutubeUrlError ? error.message : 'Link inválido.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const analysis = await analyzeVideo(url)
    return NextResponse.json({ url, ...analysis })
  } catch (error) {
    if (error instanceof VideoTooLongError) {
      return NextResponse.json(
        {
          error: `Este video dura más de ${config.maxVideoDurationMinutes} minutos, el máximo permitido en esta herramienta.`,
          ...debugPayload(error)
        },
        { status: 422 }
      )
    }
    if (error instanceof VideoUnavailableError) {
      return NextResponse.json({ error: error.message, ...debugPayload(error) }, { status: 422 })
    }
    if (error instanceof YtDlpBinaryMissingError) {
      console.error('yt-dlp binary missing', error)
      return NextResponse.json(
        {
          error: 'El servidor no puede procesar videos en este momento (motor de descarga no disponible).',
          ...debugPayload(error)
        },
        { status: 500 }
      )
    }
    console.error('analyze error', error)
    return NextResponse.json(
      { error: 'No se pudo analizar el video. Intenta de nuevo.', ...debugPayload(error) },
      { status: 500 }
    )
  }
}
