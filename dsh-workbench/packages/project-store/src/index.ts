import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  acceptCandidate,
  createBookProject,
  nextActionFor,
  rejectCandidate,
  stageCandidate,
  type AcceptCandidateResult,
  type BookProject,
  type Candidate,
  type CreateBookProjectInput,
  type ProjectSnapshot,
  type StageCandidateInput,
} from '@chapterflow/domain-core'

export type ProjectStoreErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_ALREADY_EXISTS'
  | 'INVALID_PROJECT_ID'
  | 'INVALID_STORE_DATA'
  | 'PROJECT_REVISION_CONFLICT'

export class ProjectStoreError extends Error {
  readonly code: ProjectStoreErrorCode

  constructor(code: ProjectStoreErrorCode, message: string) {
    super(message)
    this.name = 'ProjectStoreError'
    this.code = code
  }
}

function assertProjectId(projectId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
    throw new ProjectStoreError('INVALID_PROJECT_ID', 'project id contains unsafe characters')
  }
}

function isSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.schemaVersion === 1
    && !!record.project
    && typeof record.project === 'object'
    && Array.isArray(record.candidates)
}

export interface LocalProjectStoreOptions {
  rootDir?: string
}

export interface StageCandidateOptions {
  expectedProjectRevision?: number
}

export class LocalProjectStore {
  readonly rootDir: string
  private readonly tails = new Map<string, Promise<void>>()

  constructor(options: LocalProjectStoreOptions = {}) {
    this.rootDir = resolve(
      options.rootDir
      ?? process.env.CHAPTERFLOW_PROJECTS_DIR
      ?? join(process.cwd(), '.chapterflow', 'projects'),
    )
  }

  private projectDir(projectId: string): string {
    assertProjectId(projectId)
    return join(this.rootDir, projectId)
  }

  private projectFile(projectId: string): string {
    return join(this.projectDir(projectId), 'project.snapshot.json')
  }

  private async withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(projectId) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate
    })
    const tail = previous.then(() => gate, () => gate)
    this.tails.set(projectId, tail)

    await previous.catch(() => undefined)
    try {
      return await fn()
    } finally {
      release()
      if (this.tails.get(projectId) === tail) this.tails.delete(projectId)
    }
  }

  private async writeSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    const dir = this.projectDir(snapshot.project.id)
    await mkdir(dir, { recursive: true })
    const target = this.projectFile(snapshot.project.id)
    const temp = join(dir, `project.snapshot.${process.pid}.${Date.now()}.tmp`)
    await writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
    await rename(temp, target)
  }

  async createProject(input: CreateBookProjectInput): Promise<ProjectSnapshot> {
    const snapshot = createBookProject(input)
    return this.withProjectLock(snapshot.project.id, async () => {
      const file = this.projectFile(snapshot.project.id)
      try {
        await stat(file)
        throw new ProjectStoreError(
          'PROJECT_ALREADY_EXISTS',
          `project ${snapshot.project.id} already exists`,
        )
      } catch (error) {
        if (error instanceof ProjectStoreError) throw error
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT') throw error
      }
      await this.writeSnapshot(snapshot)
      return snapshot
    })
  }

  async getSnapshot(projectId: string): Promise<ProjectSnapshot> {
    const file = this.projectFile(projectId)
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ProjectStoreError('PROJECT_NOT_FOUND', `project ${projectId} not found`)
      }
      throw error
    }

    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      throw new ProjectStoreError(
        'INVALID_STORE_DATA',
        `project ${projectId} snapshot is not valid JSON`,
      )
    }
    if (!isSnapshot(value) || value.project.id !== projectId) {
      throw new ProjectStoreError(
        'INVALID_STORE_DATA',
        `project ${projectId} snapshot has an invalid schema`,
      )
    }
    return value
  }

  async getProject(projectId: string): Promise<BookProject> {
    return (await this.getSnapshot(projectId)).project
  }

  async getNextAction(projectId: string): Promise<ReturnType<typeof nextActionFor>> {
    return nextActionFor(await this.getProject(projectId))
  }

  async stageCandidate(
    projectId: string,
    input: StageCandidateInput,
    options: StageCandidateOptions = {},
  ): Promise<Candidate> {
    return this.withProjectLock(projectId, async () => {
      const snapshot = await this.getSnapshot(projectId)
      if (
        options.expectedProjectRevision !== undefined
        && snapshot.project.revision !== options.expectedProjectRevision
      ) {
        throw new ProjectStoreError(
          'PROJECT_REVISION_CONFLICT',
          `project ${projectId} changed from revision ${options.expectedProjectRevision} to ${snapshot.project.revision}`,
        )
      }
      const candidate = stageCandidate(snapshot.project, input)
      snapshot.candidates.push(candidate)
      await this.writeSnapshot(snapshot)
      return candidate
    })
  }

  async acceptCandidate(projectId: string, candidateId: string): Promise<AcceptCandidateResult> {
    return this.withProjectLock(projectId, async () => {
      const snapshot = await this.getSnapshot(projectId)
      const index = snapshot.candidates.findIndex((candidate) => candidate.id === candidateId)
      if (index < 0) {
        throw new ProjectStoreError(
          'INVALID_STORE_DATA',
          `candidate ${candidateId} not found in project ${projectId}`,
        )
      }
      const result = acceptCandidate(snapshot.project, snapshot.candidates[index]!)
      snapshot.candidates[index] = result.candidate
      if (result.status === 'accepted') snapshot.project = result.project
      await this.writeSnapshot(snapshot)
      return result
    })
  }

  async rejectCandidate(
    projectId: string,
    candidateId: string,
    decisionNote?: string,
  ): Promise<Candidate> {
    return this.withProjectLock(projectId, async () => {
      const snapshot = await this.getSnapshot(projectId)
      const index = snapshot.candidates.findIndex((candidate) => candidate.id === candidateId)
      if (index < 0) {
        throw new ProjectStoreError(
          'INVALID_STORE_DATA',
          `candidate ${candidateId} not found in project ${projectId}`,
        )
      }
      const rejected = rejectCandidate(snapshot.candidates[index]!, decisionNote)
      snapshot.candidates[index] = rejected
      await this.writeSnapshot(snapshot)
      return rejected
    })
  }
}
