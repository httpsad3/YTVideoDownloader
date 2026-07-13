import { config } from './config'

/**
 * Limitador de tasa en memoria, por IP, con ventana deslizante.
 *
 * Ojo: en un entorno serverless cada instancia de función tiene su propio
 * Map (no hay estado compartido entre invocaciones/regiones), así que esto
 * es "best effort" y no una barrera dura contra abuso distribuido. Para algo
 * más robusto, reemplazar por Upstash Redis o Vercel KV usando la misma
 * firma de `checkRateLimit`.
 */
const hits = new Map<string, number[]>()

const WINDOW_MS = config.rateLimitWindowMinutes * 60_000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function checkRateLimit(identifier: string): RateLimitResult {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  const previous = hits.get(identifier) ?? []
  const recent = previous.filter(ts => ts > windowStart)

  if (recent.length >= config.rateLimitMaxRequests) {
    const oldest = recent[0] ?? now
    hits.set(identifier, recent)
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((oldest + WINDOW_MS - now) / 1000)
    }
  }

  recent.push(now)
  hits.set(identifier, recent)

  // Limpieza perezosa para no acumular IPs inactivas indefinidamente en memoria.
  if (hits.size > 5000) {
    for (const [key, timestamps] of hits) {
      if (timestamps.every(ts => ts <= windowStart)) hits.delete(key)
    }
  }

  return {
    allowed: true,
    remaining: config.rateLimitMaxRequests - recent.length,
    retryAfterSeconds: 0
  }
}

export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() ?? 'unknown'
  return headers.get('x-real-ip') ?? 'unknown'
}
