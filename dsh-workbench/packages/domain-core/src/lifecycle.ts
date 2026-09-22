import {
  BOOK_LIFECYCLE_STAGES,
  type BookArtifactType,
  type BookLifecycle,
  type BookLifecycleStage,
  type BookProject,
  type LifecycleStageState,
} from './types.js'

const ARTIFACT_STAGE: Record<BookArtifactType, BookLifecycleStage> = {
  idea: 'idea',
  direction: 'direction',
  positioning: 'positioning',
  story_engine: 'story_engine',
  packaging: 'packaging',
  opening_blueprint: 'opening_blueprint',
}

export function artifactStageFor(type: BookArtifactType): BookLifecycleStage {
  return ARTIFACT_STAGE[type]
}

const NEXT_ACTION: Record<BookLifecycleStage, string> = {
  idea: 'Capture the core story idea as a reviewable candidate.',
  direction: 'Define the book direction and sustainable commercial premise.',
  positioning: 'Confirm target reader, core fantasy, conflict, and reader promise.',
  story_engine: 'Build the repeatable story engine that can sustain serialization.',
  packaging: 'Prepare and compare title, introduction, tags, and selling points.',
  opening_blueprint: 'Plan the opening promise, first payoff, and chapter intents 1–3.',
  first_3_chapters: 'Write and accept the first three chapters.',
  opening_review: 'Run the AI editor opening review and record structured findings.',
  revision: 'Address selected findings through reviewable revision candidates.',
  signing_ready: 'Run signing readiness checks against the accepted manuscript.',
  serialization: 'Continue serialization with chapter intent, writing, settlement, and review.',
}

function activeArtifactForStage(
  project: BookProject,
  stage: BookLifecycleStage,
) {
  for (const artifactType of Object.keys(project.activeArtifactRefs) as BookArtifactType[]) {
    if (ARTIFACT_STAGE[artifactType] !== stage) continue
    const artifactId = project.activeArtifactRefs[artifactType]
    if (!artifactId) continue
    return project.artifacts.find((artifact) => artifact.id === artifactId)
  }
  return undefined
}

function firstThreeChaptersComplete(project: BookProject): boolean {
  return [1, 2, 3].every((index) => {
    const chapter = project.chapters.find((item) => item.index === index)
    return !!chapter?.acceptedDraftVersion
      && chapter.settledDraftVersion === chapter.acceptedDraftVersion
  })
}

function completedStages(project: BookProject): Set<BookLifecycleStage> {
  const completed = new Set<BookLifecycleStage>()
  for (const artifactType of Object.keys(project.activeArtifactRefs) as BookArtifactType[]) {
    if (project.activeArtifactRefs[artifactType]) {
      completed.add(ARTIFACT_STAGE[artifactType])
    }
  }
  if (firstThreeChaptersComplete(project)) completed.add('first_3_chapters')
  return completed
}

function completionTimeForStage(
  project: BookProject,
  stage: BookLifecycleStage,
): string | undefined {
  const activeArtifact = activeArtifactForStage(project, stage)
  if (activeArtifact) return activeArtifact.acceptedAt

  if (stage === 'first_3_chapters' && firstThreeChaptersComplete(project)) {
    const acceptedVersionIds = project.chapters
      .filter((chapter) => chapter.index >= 1 && chapter.index <= 3)
      .map((chapter) => chapter.acceptedDraftVersion)
      .filter((value): value is string => typeof value === 'string')
    const acceptedTimes = acceptedVersionIds
      .map((versionId) => project.chapterVersions.find((version) => version.id === versionId)?.acceptedAt)
      .filter((value): value is string => typeof value === 'string')
      .sort()
    return acceptedTimes.at(-1)
  }

  return undefined
}

function refsForStage(project: BookProject, stage: BookLifecycleStage): string[] {
  if (stage === 'first_3_chapters') {
    return project.chapters
      .filter((chapter) => chapter.index >= 1 && chapter.index <= 3)
      .map((chapter) => chapter.acceptedDraftVersion)
      .filter((value): value is string => typeof value === 'string')
  }

  return project.artifacts
    .filter((artifact) => ARTIFACT_STAGE[artifact.type] === stage)
    .map((artifact) => artifact.id)
}

export function deriveLifecycle(project: BookProject): BookLifecycle {
  const complete = completedStages(project)
  const currentStage =
    BOOK_LIFECYCLE_STAGES.find((stage) => !complete.has(stage))
    ?? 'serialization'

  const completionTimes = new Map<BookLifecycleStage, string>()
  for (const stage of BOOK_LIFECYCLE_STAGES) {
    const completedAt = completionTimeForStage(project, stage)
    if (completedAt) completionTimes.set(stage, completedAt)
  }

  const stages: LifecycleStageState[] = BOOK_LIFECYCLE_STAGES.map((stage, index) => {
    const isComplete = complete.has(stage)
    const isCurrent = stage === currentStage && !isComplete
    const previousStage = index > 0 ? BOOK_LIFECYCLE_STAGES[index - 1] : undefined
    const startedAt = index === 0
      ? project.createdAt
      : previousStage
        ? completionTimes.get(previousStage)
        : undefined

    return {
      stage,
      status: isComplete ? 'complete' : isCurrent ? 'active' : 'not_started',
      artifactRefs: refsForStage(project, stage),
      candidateRefs: [],
      findingRefs: [],
      ...(startedAt && (isComplete || isCurrent) ? { startedAt } : {}),
      ...(isComplete && completionTimes.get(stage)
        ? { completedAt: completionTimes.get(stage) }
        : {}),
    }
  })

  return {
    currentStage,
    stages,
    nextAction: NEXT_ACTION[currentStage],
    blockers: [],
  }
}

export function nextActionFor(project: BookProject): {
  projectId: string
  revision: number
  currentStage: BookLifecycleStage
  nextAction: string
  blockers: string[]
} {
  const lifecycle = deriveLifecycle(project)

  if (lifecycle.currentStage === 'first_3_chapters') {
    const unsettled = [...project.chapters]
      .filter((chapter) =>
        chapter.acceptedDraftVersion
        && chapter.settledDraftVersion !== chapter.acceptedDraftVersion,
      )
      .sort((a, b) => a.index - b.index)[0]
    if (unsettled) {
      return {
        projectId: project.id,
        revision: project.revision,
        currentStage: lifecycle.currentStage,
        nextAction:
          'Settle accepted chapter '
          + unsettled.index
          + ' into Story Memory, Reader Memory, and Chapter Handoff before writing the next chapter.',
        blockers: ['chapter_' + unsettled.index + '_settlement_required'],
      }
    }
  }

  return {
    projectId: project.id,
    revision: project.revision,
    currentStage: lifecycle.currentStage,
    nextAction: lifecycle.nextAction,
    blockers: [...lifecycle.blockers],
  }
}
