const SENSITIVE_KEYS = /apiKey|key|secret|token|password|api_key/i

export function redact(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(redact)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.test(k)) {
      out[k] = '***REDACTED***'
    } else if (typeof v === 'object' && v !== null) {
      out[k] = redact(v)
    } else {
      out[k] = v
    }
  }
  return out
}

function fmt(level: string, args: unknown[]): unknown[] {
  return args.map(a => (typeof a === 'object' && a !== null ? redact(a) : a))
}

export const logger = {
  info(...args: unknown[]) { console.log(`[INFO]`, ...fmt('INFO', args)) },
  warn(...args: unknown[]) { console.warn(`[WARN]`, ...fmt('WARN', args)) },
  error(...args: unknown[]) { console.error(`[ERROR]`, ...fmt('ERROR', args)) },
  debug(...args: unknown[]) { console.debug(`[DEBUG]`, ...fmt('DEBUG', args)) },
}
