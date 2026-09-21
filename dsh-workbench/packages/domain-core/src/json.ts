import { DomainError } from './errors.js'
import type { JsonValue } from './types.js'

export function assertJsonValue(value: unknown, path = 'payload'): asserts value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new DomainError('INVALID_JSON_VALUE', `${path} contains a non-finite number`)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`))
    return
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child === undefined) {
        throw new DomainError('INVALID_JSON_VALUE', `${path}.${key} is undefined`)
      }
      assertJsonValue(child, `${path}.${key}`)
    }
    return
  }

  throw new DomainError(
    'INVALID_JSON_VALUE',
    `${path} contains unsupported value type ${typeof value}`,
  )
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
