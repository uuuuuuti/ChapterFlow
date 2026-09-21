export type DomainErrorCode =
  | 'INVALID_PROJECT'
  | 'INVALID_CANDIDATE'
  | 'CANDIDATE_NOT_STAGED'
  | 'CANDIDATE_NOT_FOUND'
  | 'UNSUPPORTED_CANDIDATE_KIND'
  | 'INVALID_ARTIFACT_TYPE'
  | 'INVALID_JSON_VALUE'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}
