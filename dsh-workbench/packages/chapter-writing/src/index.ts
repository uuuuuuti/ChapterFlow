export interface GeneratedChapterDraft {
  title: string
  content: string
  effectiveCharacters: number
}

function invalid(message: string): never {
  throw new Error('Invalid generated chapter draft: ' + message)
}

function parseObject(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  if (!trimmed) invalid('model output is empty')

  const withoutFence = trimmed
    .replace(/^(?:```|~~~)(?:json)?\s*/i, '')
    .replace(/\s*(?:```|~~~)$/, '')

  let parsed: unknown
  try {
    parsed = JSON.parse(withoutFence)
  } catch {
    const start = withoutFence.indexOf('{')
    const end = withoutFence.lastIndexOf('}')
    if (start < 0 || end <= start) invalid('model output does not contain a JSON object')
    try {
      parsed = JSON.parse(withoutFence.slice(start, end + 1))
    } catch {
      invalid('model output contains invalid JSON')
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    invalid('output must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

export function validateGeneratedChapterDraft(
  value: Record<string, unknown>,
): GeneratedChapterDraft {
  const allowed = new Set(['title', 'content'])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid('unsupported field ' + key)
  }

  if (typeof value.title !== 'string' || !value.title.trim()) {
    invalid('title must be a non-empty string')
  }
  if (typeof value.content !== 'string' || !value.content.trim()) {
    invalid('content must be a non-empty string')
  }

  const title = value.title.trim()
  const content = value.content.trim()
  const effectiveCharacters = content.replace(/\s+/g, '').length

  if (effectiveCharacters < 600) {
    invalid('content is too short to be a usable serialized chapter')
  }
  if (effectiveCharacters > 12000) {
    invalid('content is unexpectedly long for one chapter')
  }

  return { title, content, effectiveCharacters }
}

export function parseGeneratedChapterDraft(
  modelText: string,
): GeneratedChapterDraft {
  return validateGeneratedChapterDraft(parseObject(modelText))
}

export const CHAPTER_DRAFT_GUIDANCE = [
  'Return one JSON object with exactly two keys: title and content.',
  'title must be a concise chapter title.',
  'content must be the complete chapter prose, not an outline, analysis, or markdown.',
  'Aim for roughly 2500–3500 Chinese characters unless the author explicitly asks otherwise.',
  'The chapter must satisfy the accepted Chapter Intent, preserve committed facts,',
  'advance conflict, deliver the planned payoff, and end with the intended hook.',
  'Do not include editorial notes, explanations, or invented platform metrics.',
].join(' ')
