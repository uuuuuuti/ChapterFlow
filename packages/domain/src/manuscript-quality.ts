/**
 * Returns the prose body used by every V1 character-counting surface.
 *
 * Model wrappers sometimes leave a fenced response, a role marker, or a
 * reasoning block around the manuscript. Those are transport artefacts, not
 * publishable prose, so they must not inflate the acceptance count.
 */
export function manuscriptBodyForCounting(value: string): string {
  return value
    .replace(/<think>[\s\S]*?<\/think>/giu, "\n")
    .replace(/<\/?(?:analysis|assistant|system|manuscript)>/giu, "\n")
    .replace(/^\s*```(?:markdown|text)?\s*$/gimu, "")
    .replace(/^\s*#{1,6}\s+[^\n]*$/gimu, "")
    .replace(/\s/gu, "");
}

/** Counts Unicode code points in the publishable manuscript body. */
export function effectiveManuscriptCharacterCount(value: string): number {
  return Array.from(manuscriptBodyForCounting(value)).length;
}
