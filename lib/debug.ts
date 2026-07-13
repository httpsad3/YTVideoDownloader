/**
 * Detalle técnico del error, solo fuera de producción. Se agrega a las
 * respuestas de error de la API además del mensaje amigable, para poder
 * diagnosticar sin tener que ir a revisar logs del servidor. Sigue la
 * cadena `error.cause` (p. ej. un `VideoUnavailableError` cuyo mensaje ya
 * está traducido, pero guarda el stderr original de yt-dlp como `cause`).
 */
export function debugPayload(error: unknown): { debug?: string } {
  if (process.env.NODE_ENV === 'production') return {}
  return { debug: describeError(error) }
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const extra = Object.entries(error)
    .filter(([key]) => !['message', 'stack', 'cause'].includes(key))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')

  const base = extra ? `${error.name}: ${error.message} (${extra})` : `${error.name}: ${error.message}`
  return error.cause ? `${base} <- causado por: ${describeError(error.cause)}` : base
}
