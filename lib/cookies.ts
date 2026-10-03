import { existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * YouTube empezó a exigir "Sign in to confirm you're not a bot" incluso desde
 * IPs residenciales, y en el datacenter de Vercel es peor. La única mitigación
 * práctica de yt-dlp es pasar cookies de una sesión real con `--cookies`.
 *
 * `YTDLP_COOKIES_BASE64` guarda un cookies.txt (formato Netscape) codificado
 * en base64, para poder pegarlo entero como valor de una env var (tanto en
 * `.env` como en Vercel). Se decodifica una sola vez, de forma lazy, a un
 * archivo temporal en `/tmp` (escribible en local y en el runtime serverless
 * de Vercel), y esa ruta se reusa en llamadas siguientes dentro de la misma
 * instancia de función.
 */
let cachedCookiesPath: string | null | undefined

export function getCookiesFilePath(): string | null {
  if (cachedCookiesPath !== undefined) return cachedCookiesPath

  const encoded = process.env.YTDLP_COOKIES_BASE64
  if (!encoded) {
    cachedCookiesPath = null
    return cachedCookiesPath
  }

  const cookiesPath = path.join(tmpdir(), 'ytdlp-cookies.txt')
  if (!existsSync(cookiesPath)) {
    writeFileSync(cookiesPath, Buffer.from(encoded, 'base64'))
  }

  cachedCookiesPath = cookiesPath
  return cachedCookiesPath
}
