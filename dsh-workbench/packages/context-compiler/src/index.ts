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
  previousHandoff?: ProjectSnapshot['project']['storyMemory']['latestHandoff']
  storyMemory: {
    characterStates: ProjectSnapshot['project']['storyMemory']['characterStates']
    relationshipEvents: ProjectSnapshot['project']['storyMemory']['relationshipEvents']
    timelineEvents: ProjectSnapshot['project']['storyMemory']['timelineEvents']
  }
  readerMemory: ProjectSnapshot['project']['readerMemory']
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
  let previousHandoff: ChapterContextPacket['previousHandoff']
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

    const handoff = snapshot.project.storyMemory.latestHandoff
    if (
      previous.settledDraftVersion === previous.acceptedDraftVersion
      && handoff?.chapterIndex === previous.index
      && handoff.chapterVersionId === previous.acceptedDraftVersion
    ) {
      previousHandoff = { ...handoff }
      manifest.push({
        kind: 'chapter_handoff',
        refId: handoff.settlementId ?? previous.acceptedDraftVersion,
        reason: 'Use settled chapter handoff for immediate continuity without rereading the whole prior chapter.',
        priority: 98,
      })
    } else {
      if (previousChapterContent === undefined) {
        throw new Error(
          'Cannot compile chapter context: previous accepted chapter body is required until settlement exists',
        )
      }
      previousChapter = {
        index: previous.index,
        content: previousChapterContent,
      }
      manifest.push({
        kind: 'previous_chapter',
        refId: previous.acceptedDraftVersion,
        reason: 'Fallback continuity source because the previous accepted chapter has not been settled yet.',
        priority: 95,
      })
    }
  }

  if (snapshot.project.storyMemory.characterStates.length > 0) {
    manifest.push({
      kind: 'character_memory',
      refId: 'story-memory:characters',
      reason: 'Preserve current character states extracted from accepted chapter settlements.',
      priority: 94,
    })
  }
  if (snapshot.project.storyMemory.relationshipEvents.length > 0) {
    manifest.push({
      kind: 'relationship_memory',
      refId: 'story-memory:relationships',
      reason: 'Preserve accepted relationship changes and tensions.',
      priority: 88,
    })
  }
  if (snapshot.project.storyMemory.timelineEvents.length > 0) {
    manifest.push({
      kind: 'timeline_memory',
      refId: 'story-memory:timeline',
      reason: 'Preserve causal and chronological story events already committed.',
      priority: 88,
    })
  }
  if (snapshot.project.readerMemory.promises.length > 0) {
    manifest.push({
      kind: 'reader_promises',
      refId: 'reader-memory:promises',
      reason: 'Maintain open reader expectations and avoid premature or duplicate payoff.',
      priority: 92,
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
    ...(previousHandoff ? { previousHandoff } : {}),
    storyMemory: {
      characterStates: snapshot.project.storyMemory.characterStates.map((item) => ({ ...item })),
      relationshipEvents: snapshot.project.storyMemory.relationshipEvents.map((item) => ({ ...item })),
      timelineEvents: snapshot.project.storyMemory.timelineEvents.map((item) => ({ ...item })),
    },
    readerMemory: {
      promises: snapshot.project.readerMemory.promises.map((item) => ({
        ...item,
        events: item.events.map((event) => ({ ...event })),
      })),
    },
    manifest,
  }
}

export function contextSourceRefs(packet: ChapterContextPacket): string[] {
  return packet.manifest.map((item) => item.refId)
}
