import type {
  BookArtifactType,
  Chapter,
  JsonValue,
  ProjectSnapshot,
} from '@chapterflow/domain-core'

export interface ContextManifestItem {
  kind: string
  refId: string
  reason: string
  priority: number
}

export interface ChapterContextPacket {
  task: 'write_chapter'
  bookRevision: number
  project: {
    id: string
    title: string
    genre?: string
    platformTarget?: string
  }
  chapter: Chapter
  positioning?: JsonValue
  storyEngine?: JsonValue
  openingBlueprint?: JsonValue
  previousChapter?: {
    index: number
    content: string
  }
  manifest: ContextManifestItem[]
}

function activeArtifact(
  snapshot: ProjectSnapshot,
  type: BookArtifactType,
): { id: string; value: JsonValue } | undefined {
  const id = snapshot.project.activeArtifactRefs[type]
  if (!id) return undefined
  const artifact = snapshot.project.artifacts.find((item) => item.id === id)
  if (!artifact) return undefined
  return { id, value: artifact.value }
}

export function compileChapterContext(
  snapshot: ProjectSnapshot,
  chapterIndex: number,
  previousChapterContent?: string,
): ChapterContextPacket {
  const chapter = snapshot.project.chapters.find(
    (item) => item.index === chapterIndex,
  )
  if (!chapter) {
    throw new Error(
      'Cannot compile chapter context: chapter ' + chapterIndex + ' does not exist',
    )
  }
  if (chapter.acceptedDraftVersion) {
    throw new Error(
      'Cannot compile chapter context: chapter ' + chapterIndex + ' is already accepted',
    )
  }

  const manifest: ContextManifestItem[] = [
    {
      kind: 'chapter_intent',
      refId: chapter.id,
      reason: 'The current chapter intent defines purpose, conflict, payoff, and hook.',
      priority: 100,
    },
  ]

  const positioning = activeArtifact(snapshot, 'positioning')
  const storyEngine = activeArtifact(snapshot, 'story_engine')
  const openingBlueprint = activeArtifact(snapshot, 'opening_blueprint')

  if (positioning) {
    manifest.push({
      kind: 'positioning',
      refId: positioning.id,
      reason: 'Preserve the accepted reader promise and book positioning.',
      priority: 90,
    })
  }
  if (storyEngine) {
    manifest.push({
      kind: 'story_engine',
      refId: storyEngine.id,
      reason: 'Preserve protagonist drive, repeatable conflict loop, and escalation rules.',
      priority: 90,
    })
  }
  if (openingBlueprint) {
    manifest.push({
      kind: 'opening_blueprint',
      refId: openingBlueprint.id,
      reason: 'Keep the opening promise, first payoff, and three-chapter progression aligned.',
      priority: 80,
    })
  }

  let previousChapter: ChapterContextPacket['previousChapter']
  if (chapterIndex > 1) {
    const previous = snapshot.project.chapters.find(
      (item) => item.index === chapterIndex - 1,
    )
    if (!previous?.acceptedDraftVersion) {
      throw new Error(
        'Cannot compile chapter context: previous chapter '
        + (chapterIndex - 1)
        + ' is not accepted',
      )
    }
    if (previousChapterContent === undefined) {
      throw new Error(
        'Cannot compile chapter context: previous accepted chapter body is required',
      )
    }
    previousChapter = {
      index: previous.index,
      content: previousChapterContent,
    }
    manifest.push({
      kind: 'previous_chapter',
      refId: previous.acceptedDraftVersion,
      reason: 'Maintain immediate scene continuity until Chapter Handoff is implemented.',
      priority: 95,
    })
  }

  return {
    task: 'write_chapter',
    bookRevision: snapshot.project.revision,
    project: {
      id: snapshot.project.id,
      title: snapshot.project.title,
      ...(snapshot.project.genre ? { genre: snapshot.project.genre } : {}),
      ...(snapshot.project.platformTarget
        ? { platformTarget: snapshot.project.platformTarget }
        : {}),
    },
    chapter: {
      ...chapter,
      intent: { ...chapter.intent },
    },
    ...(positioning ? { positioning: positioning.value } : {}),
    ...(storyEngine ? { storyEngine: storyEngine.value } : {}),
    ...(openingBlueprint ? { openingBlueprint: openingBlueprint.value } : {}),
    ...(previousChapter ? { previousChapter } : {}),
    manifest,
  }
}

export function contextSourceRefs(packet: ChapterContextPacket): string[] {
  return packet.manifest.map((item) => item.refId)
}
