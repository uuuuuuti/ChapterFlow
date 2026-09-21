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

function completedStages(project: BookProject): Set<BookLifecycleStage> {
  const completed = new Set<BookLifecycleStage>()
  for (const artifactType of Object.keys(project.activeArtifactRefs) as BookArtifactType[]) {
    if (project.activeArtifactRefs[artifactType]) {
      completed.add(ARTIFACT_STAGE[artifactType])
    }
  }
  return completed
}

export function deriveLifecycle(project: BookProject, now = project.updatedAt): BookLifecycle {
  const complete = completedStages(project)
  const currentStage =
    BOOK_LIFECYCLE_STAGES.find((stage) => !complete.has(stage))
    ?? 'serialization'

  const stages: LifecycleStageState[] = BOOK_LIFECYCLE_STAGES.map((stage) => {
    const isComplete = complete.has(stage)
    const isCurrent = stage === currentStage && !isComplete
    const artifactRefs = project.artifacts
      .filter((artifact) => ARTIFACT_STAGE[artifact.type] === stage)
      .map((artifact) => artifact.id)
    return {
      stage,
      status: isComplete ? 'complete' : isCurrent ? 'active' : 'not_started',
      artifactRefs,
      candidateRefs: [],
      findingRefs: [],
      ...(isComplete ? { completedAt: project.updatedAt } : {}),
      ...(isCurrent ? { startedAt: now } : {}),
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
  return {
    projectId: project.id,
    revision: project.revision,
    currentStage: lifecycle.currentStage,
    nextAction: lifecycle.nextAction,
    blockers: [...lifecycle.blockers],
  }
}
