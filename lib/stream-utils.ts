import { PassThrough, Readable } from 'node:stream'
import type { ChildProcess } from 'node:child_process'

/**
 * Espera al primer chunk de stdout (o a un fallo temprano) antes de resolver.
 *
 * Esto evita devolver al navegador una respuesta HTTP 200 con un stream que
 * en realidad va a fallar de inmediato (formato inválido, video que dejó de
 * estar disponible entre el análisis y la descarga, etc.) — en esos casos
 * preferimos rechazar la promesa para poder responder con un error JSON
 * claro en vez de entregar un archivo vacío o corrupto.
 */
export function waitForFirstChunkOrFail(child: ChildProcess): Promise<Readable> {
  return new Promise((resolve, reject) => {
    if (!child.stdout) {
      reject(new Error('El proceso no generó salida.'))
      return
    }
    const stdout: Readable = child.stdout

    let stderrBuffer = ''
    child.stderr?.on('data', chunk => {
      stderrBuffer += chunk.toString()
    })

    const output = new PassThrough()
    let settled = false

    const cleanup = () => {
      stdout.off('data', onFirstChunk)
      child.off('error', onFail)
      child.off('exit', onExit)
    }

    function onFirstChunk(chunk: Buffer) {
      if (settled) return
      settled = true
      cleanup()
      output.write(chunk)
      stdout.pipe(output)
      stdout.on('error', err => output.destroy(err))
      child.on('exit', code => {
        if (code !== 0) output.destroy(new Error(stderrBuffer || `El proceso terminó con código ${code}.`))
      })
      resolve(output)
    }

    function onFail(err: Error) {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(stderrBuffer || err.message))
    }

    function onExit(code: number | null) {
      if (code !== 0) onFail(new Error(`El proceso terminó con código ${code}.`))
    }

    stdout.on('data', onFirstChunk)
    child.on('error', onFail)
    child.on('exit', onExit)
  })
}
