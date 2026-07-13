import { spawn } from 'node:child_process'
import type { Readable } from 'node:stream'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import { config } from './config'

/** Ruta al binario de ffmpeg empaquetado para el runtime actual (linux-x64 en Vercel). */
export const ffmpegPath = ffmpeg.path

/**
 * Transcodifica un stream de audio (webm/opus, m4a, etc.) a mp3, totalmente
 * en memoria/pipe: sin escribir nada a disco. Útil porque la codificación de
 * mp3 no necesita "seek" sobre el archivo final, a diferencia de un mp4.
 */
export function transcodeToMp3(source: Readable) {
  const process = spawn(
    ffmpegPath,
    ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-c:a', 'libmp3lame', '-b:a', `${config.mp3BitrateKbps}k`, '-f', 'mp3', 'pipe:1'],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  )

  source.pipe(process.stdin)
  source.on('error', () => process.kill('SIGKILL'))

  return process
}
