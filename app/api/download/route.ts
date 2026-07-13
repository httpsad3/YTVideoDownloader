import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { NextRequest, NextResponse } from 'next/server'
import {
  analyzeVideo,
  spawnMergeToFile,
  spawnRawFormatStream,
  VideoTooLongError,
  VideoUnavailableError,
  YtDlpBinaryMissingError
} from '@/lib/ytdlp'
import { downloadRequestSchema, InvalidYoutubeUrlError, normalizeYoutubeUrl } from '@/lib/validation'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { transcodeToMp3 } from '@/lib/ffmpeg'
import { waitForFirstChunkOrFail } from '@/lib/stream-utils'
import { contentDispositionHeader, sanitizeFilename } from '@/lib/filename'
import { config } from '@/lib/config'
import { debugPayload } from '@/lib/debug'

export const runtime = 'nodejs'
// Tope real en el plan Hobby de Vercel es 60s; en Pro se puede subir hasta 300s.
export const maxDuration = 60

function errorResponse(message: string, status: number, error?: unknown) {
  return NextResponse.json({ error: message, ...(error !== undefined ? debugPayload(error) : {}) }, { status })
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rateLimit = checkRateLimit(`download:${ip}`)
  if (!rateLimit.allowed) {
    return errorResponse(`Demasiadas solicitudes. Intenta de nuevo en ${rateLimit.retryAfterSeconds} segundos.`, 429)
  }

  const body = await request.json().catch(() => null)
  const parsedBody = downloadRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return errorResponse('Solicitud inválida.', 400)
  }

  let url: string
  try {
    url = normalizeYoutubeUrl(parsedBody.data.url)
  } catch (error) {
    const message = error instanceof InvalidYoutubeUrlError ? error.message : 'Link inválido.'
    return errorResponse(message, 400)
  }

  const { formatId, mode } = parsedBody.data

  // Se vuelve a analizar el video (en vez de confiar ciegamente en el formatId
  // recibido) para: revalidar el límite de duración y confirmar que el
  // formato pedido es uno de los que nosotros mismos ofrecimos al analizar.
  let analysis
  try {
    analysis = await analyzeVideo(url)
  } catch (error) {
    if (error instanceof VideoTooLongError) {
      return errorResponse(
        `Este video dura más de ${config.maxVideoDurationMinutes} minutos, el máximo permitido en esta herramienta.`,
        422,
        error
      )
    }
    if (error instanceof VideoUnavailableError) {
      return errorResponse(error.message, 422, error)
    }
    if (error instanceof YtDlpBinaryMissingError) {
      console.error('yt-dlp binary missing', error)
      return errorResponse('El servidor no puede procesar videos en este momento (motor de descarga no disponible).', 500, error)
    }
    console.error('download analyze error', error)
    return errorResponse('No se pudo analizar el video. Intenta de nuevo.', 500, error)
  }

  const filenameBase = sanitizeFilename(analysis.title)

  if (mode === 'video') {
    const option = analysis.videoOptions.find(o => o.formatId === formatId)
    if (!option) {
      return errorResponse('La calidad solicitada ya no está disponible, vuelve a analizar el video.', 400)
    }

    const videoFilename = `${sanitizeFilename(`${filenameBase}-${option.label}`)}.mp4`

    if (option.kind === 'progressive') {
      return streamPassthrough({
        spawnChild: () => spawnRawFormatStream(url, formatId),
        filename: videoFilename,
        contentType: 'video/mp4'
      })
    }

    return streamMergedFile({ url, formatSelector: formatId, filename: videoFilename })
  }

  if (mode === 'audio-m4a') {
    if (!analysis.bestAudioM4a || analysis.bestAudioM4a.formatId !== formatId) {
      return errorResponse('El formato de audio solicitado ya no está disponible, vuelve a analizar el video.', 400)
    }
    return streamPassthrough({
      spawnChild: () => spawnRawFormatStream(url, formatId),
      filename: `${filenameBase}.m4a`,
      contentType: 'audio/mp4'
    })
  }

  // mode === 'audio-mp3'
  if (!analysis.bestAudioAny || analysis.bestAudioAny.formatId !== formatId) {
    return errorResponse('El formato de audio solicitado ya no está disponible, vuelve a analizar el video.', 400)
  }

  try {
    const source = spawnRawFormatStream(url, formatId)
    const sourceStream = await waitForFirstChunkOrFail(source)
    const ffmpegProcess = transcodeToMp3(sourceStream)
    const mp3Stream = await waitForFirstChunkOrFail(ffmpegProcess)
    return new NextResponse(Readable.toWeb(mp3Stream) as ReadableStream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': contentDispositionHeader(`${filenameBase}.mp3`)
      }
    })
  } catch (error) {
    console.error('mp3 transcode error', error)
    if (error instanceof YtDlpBinaryMissingError) {
      return errorResponse('El servidor no puede procesar videos en este momento (motor de descarga no disponible).', 500, error)
    }
    return errorResponse('No se pudo convertir el audio a mp3. Intenta de nuevo.', 502, error)
  }
}

async function streamPassthrough(options: {
  spawnChild: () => ReturnType<typeof spawnRawFormatStream>
  filename: string
  contentType: string
}) {
  try {
    const stream = await waitForFirstChunkOrFail(options.spawnChild())
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Content-Type': options.contentType,
        'Content-Disposition': contentDispositionHeader(options.filename)
      }
    })
  } catch (error) {
    console.error('passthrough download error', error)
    if (error instanceof YtDlpBinaryMissingError) {
      return errorResponse('El servidor no puede procesar videos en este momento (motor de descarga no disponible).', 500, error)
    }
    return errorResponse('No se pudo descargar el video. Puede que ya no esté disponible.', 502, error)
  }
}

async function streamMergedFile(options: { url: string; formatSelector: string; filename: string }) {
  const tempPath = path.join(tmpdir(), `ytdl-${randomUUID()}.mp4`)

  try {
    await spawnMergeToFile(options.url, options.formatSelector, tempPath)
  } catch (error) {
    console.error('merge error', error)
    await unlink(tempPath).catch(() => {})
    if (error instanceof YtDlpBinaryMissingError) {
      return errorResponse('El servidor no puede procesar videos en este momento (motor de descarga no disponible).', 500, error)
    }
    return errorResponse('No se pudo generar el video en esa calidad. Intenta con otra calidad.', 502, error)
  }

  const fileStream = createReadStream(tempPath)
  fileStream.on('close', () => {
    unlink(tempPath).catch(() => {})
  })
  fileStream.on('error', () => {
    unlink(tempPath).catch(() => {})
  })

  return new NextResponse(Readable.toWeb(fileStream) as ReadableStream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': contentDispositionHeader(options.filename)
    }
  })
}
