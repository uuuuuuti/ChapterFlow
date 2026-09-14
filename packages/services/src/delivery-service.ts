import {
  effectiveManuscriptCharacterCount,
  randomUuid,
  sha256Hex,
} from "@narralume/domain";
import {
  AUTOMATION_DEFAULTS,
  SigningSprintCandidateSchema,
  SigningSprintWorkflowSchema,
} from "@narralume/contracts";
import { decodeBase64 as decodeBase64Bytes } from "./internal/bytes.js";
import { declaredUncompressedSize } from "./internal/zip.js";
import {
  concatBytes,
  encodeBase64,
  hashBytes,
  textToBytes,
} from "./internal/bytes.js";

import {
  createCanonEntity,
  createDocument,
  createOutlineNode,
  createProject,
  type CanonEntity,
  type ChapterEmotionCurvePoint,
  type ChapterEmotionTarget,
  type ChapterHookType,
  type ChapterPurpose,
  type ChapterSceneStructure,
  type ImportBatch,
  type ImportBatchDetail,
  type ImportCandidate,
  type ImportFormat,
  type ProjectPhase,
  type ProjectQualityReport,
  type ReaderPromiseAction,
  type ReaderPromiseOperation,
  type ReaderPromiseStatus,
  type QualityIssue,
  type StyleProfile,
  type WritingSkill,
} from "@narralume/domain";
import {
  SqliteAutomationRepository,
  SqliteCanonRepository,
  SqliteCreativeRepository,
  SqliteDeliveryRepository,
  SqliteDocumentRepository,
  SqliteExportBatchRepository,
  SqliteImportUploadRepository,
  SqliteNarrativeStateRepository,
  SqlitePlatformMetricsRepository,
  SqlitePublishRecordRepository,
  SqliteProjectCoverRepository,
  SqliteProjectRepository,
  SqliteReaderPromiseRepository,
  SqliteRetrievalRepository,
  SqliteSigningSprintRepository,
  SqliteStoryRepository,
  SqliteWebNovelRepository,
  SqliteWebNovelCandidateRepository,
  type ImportUploadSession,
} from "@narralume/persistence";
import type { NarrativeDatabase } from "@narralume/persistence";
import JSZip from "jszip";
import { z } from "zod";

const BundleCountsSchema = z.object({
  outline: z.number().int().nonnegative(),
  entities: z.number().int().nonnegative(),
  facts: z.number().int().nonnegative(),
  relationships: z.number().int().nonnegative(),
  timeline: z.number().int().nonnegative(),
  foreshadows: z.number().int().nonnegative(),
  documents: z.number().int().nonnegative(),
  versions: z.number().int().nonnegative(),
  drafts: z.number().int().nonnegative(),
  personas: z.number().int().nonnegative(),
  styles: z.number().int().nonnegative(),
  skills: z.number().int().nonnegative(),
  annotations: z.number().int().nonnegative(),
  cover: z.number().int().nonnegative(),
  cocreateSessions: z.number().int().nonnegative(),
  storyTurns: z.number().int().nonnegative(),
  reviews: z.number().int().nonnegative(),
  reviewIssues: z.number().int().nonnegative(),
  assistantConversations: z.number().int().nonnegative(),
  assistantMessages: z.number().int().nonnegative(),
  assistantActivities: z.number().int().nonnegative(),
  assistantLongGoals: z.number().int().nonnegative(),
  runs: z.number().int().nonnegative(),
  /** Added in bundle v4; defaults keep v3 backups restorable. */
  chapterBriefs: z.number().int().nonnegative().default(0),
  chapterBriefHistory: z.number().int().nonnegative().default(0),
  creativePresets: z.number().int().nonnegative().default(0),
  creativePresetHistory: z.number().int().nonnegative().default(0),
  bookProfileHistory: z.number().int().nonnegative().default(0),
  platformMetrics: z.number().int().nonnegative().default(0),
  publishRecords: z.number().int().nonnegative().default(0),
  exportBatches: z.number().int().nonnegative().default(0),
  openingCheckReports: z.number().int().nonnegative().default(0),
  openingCheckAudits: z.number().int().nonnegative().default(0),
  /** Added with the profile/brief candidate workbench; defaults keep older bundles restorable. */
  webNovelCandidateSets: z.number().int().nonnegative().default(0),
  webNovelCandidateItems: z.number().int().nonnegative().default(0),
  readerPromises: z.number().int().nonnegative().default(0),
  readerPromiseEvents: z.number().int().nonnegative().default(0),
  signingSprintWorkflows: z.number().int().nonnegative().default(0),
  signingSprintCandidates: z.number().int().nonnegative().default(0),
});
export type BundleCounts = z.infer<typeof BundleCountsSchema>;

const BundleSchema = z.object({
  manifest: z.object({
    format: z.literal("narralume"),
    version: z.literal(3),
    exportedAt: z.string(),
    counts: BundleCountsSchema,
    options: z
      .object({
        versionMode: z.enum(["current", "history"]),
        includeAnnotations: z.boolean(),
        includeRuns: z.boolean(),
        fromOutlineNodeId: z.string().nullable().optional(),
        toOutlineNodeId: z.string().nullable().optional(),
      })
      .optional(),
  }),
  project: z.object({
    title: z.string(),
    subtitle: z.string().nullable(),
    premise: z.string().nullable(),
    language: z.string(),
    phase: z.string(),
  }),
  intent: z.record(z.string(), z.unknown()).nullable(),
  compass: z.record(z.string(), z.unknown()).nullable(),
  outline: z.array(z.record(z.string(), z.unknown())),
  entities: z.array(z.record(z.string(), z.unknown())),
  facts: z.array(z.record(z.string(), z.unknown())),
  relationships: z.array(z.record(z.string(), z.unknown())),
  timeline: z.array(z.record(z.string(), z.unknown())),
  foreshadows: z.array(z.record(z.string(), z.unknown())),
  documents: z.array(
    z.object({
      document: z.record(z.string(), z.unknown()),
      versions: z.array(z.record(z.string(), z.unknown())),
      draft: z.record(z.string(), z.unknown()).nullable().default(null),
    }),
  ),
  personas: z.array(z.record(z.string(), z.unknown())),
  styles: z.array(z.record(z.string(), z.unknown())),
  skills: z.array(z.record(z.string(), z.unknown())),
  cover: z
    .object({
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      dataBase64: z.string().min(1),
      byteSize: z.number().int().positive(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      crop: z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        zoom: z.number().min(1).max(3),
      }),
      imageHash: z.string().regex(/^[a-f0-9]{64}$/u),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .nullable()
    .default(null),
  annotations: z.array(z.record(z.string(), z.unknown())).default([]),
  reviews: z
    .array(
      z.object({
        report: z.record(z.string(), z.unknown()),
        issues: z.array(
          z.object({
            issue: z.record(z.string(), z.unknown()),
            actions: z.array(z.record(z.string(), z.unknown())).default([]),
          }),
        ),
      }),
    )
    .default([]),
  cocreate: z
    .array(
      z.object({
        session: z.record(z.string(), z.unknown()),
        participants: z.array(z.record(z.string(), z.unknown())).default([]),
        branches: z.array(z.record(z.string(), z.unknown())).default([]),
        turns: z.array(z.record(z.string(), z.unknown())).default([]),
        swipes: z.array(z.record(z.string(), z.unknown())).default([]),
      }),
    )
    .default([]),
  assistant: z
    .array(
      z.object({
        conversation: z.record(z.string(), z.unknown()),
        messages: z.array(z.record(z.string(), z.unknown())).default([]),
        activities: z.array(z.record(z.string(), z.unknown())).default([]),
      }),
    )
    .default([]),
  longGoals: z.array(z.record(z.string(), z.unknown())).default([]),
  runs: z.array(z.record(z.string(), z.unknown())).default([]),
  /** Web-novel planning and publication data were added as optional sections. */
  bookProfile: z.record(z.string(), z.unknown()).nullable().default(null),
  bookProfileHistory: z.array(z.record(z.string(), z.unknown())).default([]),
  creativePresets: z.array(z.record(z.string(), z.unknown())).default([]),
  creativePresetHistory: z.array(z.record(z.string(), z.unknown())).default([]),
  chapterBriefs: z.array(z.record(z.string(), z.unknown())).default([]),
  chapterBriefHistory: z.array(z.record(z.string(), z.unknown())).default([]),
  /** Reader Promise lifecycle is optional so v3 bundles remain restorable. */
  readerPromises: z.array(z.record(z.string(), z.unknown())).default([]),
  readerPromiseEvents: z.array(z.record(z.string(), z.unknown())).default([]),
  platformMetrics: z.array(z.record(z.string(), z.unknown())).default([]),
  publishRecords: z.array(z.record(z.string(), z.unknown())).default([]),
  exportBatches: z.array(z.record(z.string(), z.unknown())).default([]),
  openingCheckReports: z.array(z.record(z.string(), z.unknown())).default([]),
  openingCheckAudits: z.array(z.record(z.string(), z.unknown())).default([]),
  webNovelCandidates: z
    .array(
      z.object({
        set: z.record(z.string(), z.unknown()),
        items: z.array(z.record(z.string(), z.unknown())).default([]),
      }),
    )
    .default([]),
  /** Quick-start signing preparation is kept as one workflow plus reviewable candidates. */
  signingSprint: z
    .object({
      workflow: z.record(z.string(), z.unknown()),
      candidates: z.array(z.record(z.string(), z.unknown())).default([]),
    })
    .nullable()
    .default(null),
});

export type NarrativeBundle = z.infer<typeof BundleSchema>;
export interface ProjectExportOptions {
  versionMode: "current" | "history";
  includeAnnotations: boolean;
  includeRuns: boolean;
  /** Inclusive chapter boundaries. Omit both to export the whole project. */
  fromOutlineNodeId?: string | null;
  toOutlineNodeId?: string | null;
}

const DEFAULT_EXPORT_OPTIONS: ProjectExportOptions = {
  versionMode: "history",
  includeAnnotations: true,
  includeRuns: false,
};

export class DeliveryService {
  private readonly projects: SqliteProjectRepository;
  private readonly story: SqliteStoryRepository;
  private readonly canon: SqliteCanonRepository;
  private readonly documents: SqliteDocumentRepository;
  private readonly state: SqliteNarrativeStateRepository;
  private readonly creative: SqliteCreativeRepository;
  private readonly delivery: SqliteDeliveryRepository;
  private readonly automation: SqliteAutomationRepository;
  private readonly uploads: SqliteImportUploadRepository;
  private readonly retrieval: SqliteRetrievalRepository;

  constructor(private readonly database: NarrativeDatabase) {
    this.projects = new SqliteProjectRepository(database);
    this.story = new SqliteStoryRepository(database);
    this.canon = new SqliteCanonRepository(database);
    this.documents = new SqliteDocumentRepository(database);
    this.state = new SqliteNarrativeStateRepository(
      database,
      this.canon,
      this.story,
    );
    this.creative = new SqliteCreativeRepository(database);
    this.delivery = new SqliteDeliveryRepository(database);
    this.automation = new SqliteAutomationRepository(database);
    this.uploads = new SqliteImportUploadRepository(database);
    this.retrieval = new SqliteRetrievalRepository(database);
  }

  createUpload(input: {
    id: string;
    targetProjectId: string | null;
    filename: string;
    format: ImportFormat;
    totalBytes: number;
    chunkSize: number;
    expectedHash: string | null;
    now: string;
  }) {
    if (input.targetProjectId && !this.projects.get(input.targetProjectId))
      throw new DeliveryServiceError(
        "import.target.not_found",
        "Target project not found",
      );
    this.uploads.expire(input.now);
    return this.uploads.create({
      ...input,
      status: "uploading",
      expiresAt: new Date(
        Date.parse(input.now) + 24 * 60 * 60 * 1_000,
      ).toISOString(),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  getUpload(sessionId: string) {
    return this.uploads.require(sessionId);
  }

  putUploadChunk(input: {
    sessionId: string;
    chunkIndex: number;
    contentBase64: string;
    chunkHash: string;
    now: string;
  }) {
    const session = this.uploads.require(input.sessionId);
    if (session.status !== "uploading")
      throw new DeliveryServiceError(
        "import.upload.not_open",
        "The upload session has ended",
      );
    if (session.expiresAt <= input.now) {
      this.uploads.expire(input.now);
      throw new DeliveryServiceError(
        "import.upload.expired",
        "The upload session has expired",
      );
    }
    const bytes = decodeBase64(input.contentBase64);
    if (bytes.length === 0 || bytes.length > session.chunkSize)
      throw new DeliveryServiceError(
        "import.upload.chunk_size",
        "The chunk is empty or larger than the chunk size declared by the session",
      );
    if (hash(bytes) !== input.chunkHash)
      throw new DeliveryServiceError(
        "import.upload.chunk_hash",
        "Chunk hash verification failed",
      );
    const expectedIndex = Math.floor(
      Math.max(0, session.totalBytes - 1) / session.chunkSize,
    );
    if (input.chunkIndex > expectedIndex)
      throw new DeliveryServiceError(
        "import.upload.chunk_index",
        "The chunk index is outside the file range",
      );
    const expectedSize = Math.min(
      session.chunkSize,
      session.totalBytes - input.chunkIndex * session.chunkSize,
    );
    if (bytes.length !== expectedSize)
      throw new DeliveryServiceError(
        "import.upload.chunk_size",
        "The chunk size does not match the declared file span",
      );
    const next = this.uploads.putChunk(
      session.id,
      input.chunkIndex,
      input.contentBase64,
      bytes.length,
      input.chunkHash,
      input.now,
    );
    return next;
  }

  async completeUpload(sessionId: string, now: string) {
    const session = this.uploads.require(sessionId);
    if (session.status === "completed") {
      return this.completedUploadResult(session);
    }
    if (session.status !== "uploading")
      throw new DeliveryServiceError(
        "import.upload.not_open",
        "The upload session is not usable",
      );
    const chunks = this.uploads.chunks(sessionId);
    const expectedChunks = Math.ceil(session.totalBytes / session.chunkSize);
    if (
      session.receivedBytes !== session.totalBytes ||
      chunks.length !== expectedChunks ||
      chunks.some((chunk, index) => chunk.chunkIndex !== index)
    )
      throw new DeliveryServiceError(
        "import.upload.incomplete",
        "The file chunks have not all been uploaded yet",
      );
    const bytes = concatBytes(
      chunks.map((chunk) => decodeBase64(chunk.contentBase64)),
    );
    if (session.expectedHash && hash(bytes) !== session.expectedHash)
      throw new DeliveryServiceError(
        "import.upload.file_hash",
        "Whole-file hash verification failed",
      );
    const prepared = await this.prepareImportPreview({
      targetProjectId: session.targetProjectId,
      filename: session.filename,
      format: session.format,
      contentBase64: encodeBase64(bytes),
      now,
    });
    return this.database.transaction(() => {
      const current = this.uploads.require(sessionId);
      if (current.status === "completed") {
        return this.completedUploadResult(current);
      }
      if (current.status !== "uploading") {
        throw new DeliveryServiceError(
          "import.upload.not_open",
          "The upload session is not usable",
        );
      }
      if (
        prepared.batch.targetProjectId &&
        !this.projects.get(prepared.batch.targetProjectId)
      ) {
        throw new DeliveryServiceError(
          "import.target.not_found",
          "Target project not found",
        );
      }
      this.persistImportPreview(prepared);
      this.uploads.complete(sessionId, prepared.batch.id, now);
      this.uploads.clearChunks(sessionId);
      return this.completedUploadResult(this.uploads.require(sessionId));
    });
  }

  async previewImport(input: {
    targetProjectId: string | null;
    filename: string;
    format: ImportFormat;
    contentBase64: string;
    now: string;
  }): Promise<ImportBatchDetail> {
    const prepared = await this.prepareImportPreview(input);
    return this.database.transaction(() => {
      this.persistImportPreview(prepared);
      return this.delivery.getImportBatchDetail(prepared.batch.id)!;
    });
  }

  private async prepareImportPreview(input: {
    targetProjectId: string | null;
    filename: string;
    format: ImportFormat;
    contentBase64: string;
    now: string;
  }): Promise<{ batch: ImportBatch; candidates: ImportCandidate[] }> {
    if (input.targetProjectId && !this.projects.get(input.targetProjectId)) {
      throw new DeliveryServiceError(
        "import.target.not_found",
        "Target project not found",
      );
    }
    const bytes = decodeBase64(input.contentBase64);
    if (bytes.length === 0 || bytes.length > 50 * 1024 * 1024) {
      throw new DeliveryServiceError(
        "import.size.invalid",
        "The imported file must be between 1 byte and 50 MB",
      );
    }
    const batchId = randomUuid();
    const sourceHash = hash(bytes);
    const duplicate = this.delivery.findImportBatchBySourceHash(sourceHash);
    let sourceText: string;
    let sourceEncoding: string | null = null;
    const decodeSourceText = () => {
      const decoded = decodeImportedText(bytes);
      sourceEncoding = decoded.encoding;
      return decoded.text;
    };
    let bundle: NarrativeBundle | null = null;
    try {
      if (input.format === "epub") sourceText = await extractEpub(bytes);
      else if (input.format === "docx") sourceText = await extractDocx(bytes);
      else if (input.format === "html")
        sourceText = normalizeImportedText(htmlToText(decodeSourceText()));
      else if (input.format === "narrative-bundle") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(decodeSourceText());
        } catch {
          throw new DeliveryServiceError(
            "import.bundle.invalid_json",
            "The project bundle is not valid JSON",
          );
        }
        const checked = BundleSchema.safeParse(parsed);
        if (!checked.success) {
          throw new DeliveryServiceError(
            "import.bundle.invalid_schema",
            "The project bundle structure or version is not supported",
          );
        }
        bundle = checked.data;
        sourceText = bundle.documents
          .flatMap((item) => item.versions)
          .map((version) => stringField(version, "content") ?? "")
          .join("\n\n");
      } else sourceText = normalizeImportedText(decodeSourceText());
    } catch (error) {
      if (error instanceof DeliveryServiceError) throw error;
      throw new DeliveryServiceError(
        `import.${input.format}.parse_failed`,
        `The ${input.format} file could not be parsed safely`,
      );
    }

    // A syntactically valid container with no readable manuscript is still a
    // failed import. Creating a project candidate for it would leave a blank
    // work that looks successful and makes recovery/rollback ambiguous.
    if (input.format !== "narrative-bundle" && !sourceText.trim()) {
      throw new DeliveryServiceError(
        "import.source.empty",
        "The imported file contains no readable manuscript text",
      );
    }

    const title = bundle?.project.title ?? titleFromFilename(input.filename);
    const candidates = bundle
      ? candidatesFromBundle(batchId, bundle, input.now)
      : candidatesFromText(batchId, title, sourceText, input.now);
    return {
      batch: {
        id: batchId,
        targetProjectId: input.targetProjectId,
        filename: input.filename,
        format: input.format,
        sourceHash,
        sourceCharacters: [...sourceText].length,
        status: "previewed",
        metadata: {
          title,
          sourceBytes: bytes.length,
          sourceDiagnostics: {
            encoding: sourceEncoding,
            warnings:
              sourceEncoding === "utf-8-replacement"
                ? ["encoding_replacement"]
                : [],
          },
          candidateCount: candidates.length,
          ...(sourceEncoding ? { sourceEncoding } : {}),
          ...(bundle ? { bundleVersion: 1 } : {}),
          ...(duplicate
            ? {
                duplicate: {
                  batchId: duplicate.id,
                  status: duplicate.status,
                  targetProjectId: duplicate.targetProjectId,
                  appliedProjectId: duplicate.appliedProjectId,
                  createdAt: duplicate.createdAt,
                },
              }
            : {}),
        },
        analysisRunId: null,
        appliedProjectId: null,
        createdAt: input.now,
        updatedAt: input.now,
      },
      candidates,
    };
  }

  private persistImportPreview(prepared: {
    batch: ImportBatch;
    candidates: readonly ImportCandidate[];
  }): void {
    this.delivery.insertImportBatch(prepared.batch);
    for (const candidate of prepared.candidates) {
      this.delivery.upsertImportCandidate(candidate);
    }
  }

  private completedUploadResult(session: ImportUploadSession) {
    if (!session.batchId) {
      throw new DeliveryServiceError(
        "import.upload.batch_missing",
        "The completed upload session has no import batch linked",
      );
    }
    const detail = this.delivery.getImportBatchDetail(session.batchId);
    if (!detail) {
      throw new DeliveryServiceError(
        "import.upload.batch_missing",
        "The import batch linked to the upload session does not exist",
      );
    }
    return { session, detail };
  }

  applyImport(input: {
    batchId: string;
    selectedCandidateIds: readonly string[];
    projectTitle?: string;
    now: string;
  }): { projectId: string; detail: ImportBatchDetail } {
    const batch = this.delivery.requireImportBatch(input.batchId);
    if (batch.status === "applied") {
      return {
        projectId: required(batch.appliedProjectId, "applied project"),
        detail: this.delivery.getImportBatchDetail(batch.id)!,
      };
    }
    if (batch.status === "discarded") {
      throw new DeliveryServiceError(
        "import.discarded",
        "A discarded import cannot be applied again",
      );
    }
    const allCandidates = this.delivery.listImportCandidates(batch.id);
    const selectedIds = new Set(
      input.selectedCandidateIds.length
        ? input.selectedCandidateIds
        : allCandidates
            .filter((candidate) => candidate.status !== "discarded")
            .map((candidate) => candidate.id),
    );
    const selected = allCandidates.filter((candidate) =>
      selectedIds.has(candidate.id),
    );
    if (selected.length === 0) {
      throw new DeliveryServiceError(
        "import.candidates.empty",
        "Select at least one split candidate",
      );
    }
    const bundleCandidate = selected.find(
      (candidate) => candidate.kind === "project" && candidate.payload.bundle,
    );
    const projectId = this.database.transaction(() => {
      let appliedProjectId: string;
      if (bundleCandidate) {
        const bundle = BundleSchema.parse(bundleCandidate.payload.bundle);
        appliedProjectId = this.restoreBundle(
          bundle,
          input.projectTitle ?? `${bundle.project.title} · 恢复副本`,
          input.now,
        ).projectId;
      } else {
        appliedProjectId = this.applyCandidates(
          batch,
          selected,
          input.projectTitle,
          input.now,
        );
      }
      for (const candidate of allCandidates) {
        this.delivery.setCandidateStatus(
          candidate.id,
          selectedIds.has(candidate.id) ? "applied" : "discarded",
          input.now,
        );
      }
      this.delivery.updateImportBatch(
        batch.id,
        { status: "applied", appliedProjectId },
        input.now,
      );
      return appliedProjectId;
    });
    return {
      projectId,
      detail: this.delivery.getImportBatchDetail(batch.id)!,
    };
  }

  discardImport(batchId: string, now: string): ImportBatchDetail {
    const batch = this.delivery.requireImportBatch(batchId);
    if (batch.status !== "applied") {
      this.delivery.updateImportBatch(batchId, { status: "discarded" }, now);
    }
    return this.delivery.getImportBatchDetail(batchId)!;
  }

  buildBundle(
    projectId: string,
    now: string,
    options: ProjectExportOptions = DEFAULT_EXPORT_OPTIONS,
  ): NarrativeBundle {
    const project = this.projects.get(projectId);
    if (!project)
      throw new DeliveryServiceError("project.not_found", "Project not found");
    const intent = this.story.getAuthorIntent(projectId);
    const compass = this.automation.getCompass(projectId);
    const outline = this.story.listOutline(projectId);
    const entities = this.canon.listEntities(projectId, {
      includeRetired: true,
    });
    const facts = this.canon.listEffectiveFacts(projectId, {
      includeCandidates: true,
    });
    const relationships = this.state.listCurrentRelationships(projectId);
    const timeline = this.state.listTimeline(projectId);
    const foreshadows = this.state.listForeshadows(projectId);
    const planning = new SqliteWebNovelRepository(this.database);
    const platformMetrics = new SqlitePlatformMetricsRepository(
      this.database,
    ).list(projectId);
    const publishRecords = new SqlitePublishRecordRepository(
      this.database,
    ).list(projectId);
    const exportBatches = new SqliteExportBatchRepository(this.database).list(
      projectId,
      200,
    );
    const bookProfile = planning.getBookProfile(projectId);
    const bookProfileHistory = planning.listBookProfileHistory(projectId, 100);
    const creativePresets = planning
      .listPresets(projectId)
      .filter((preset) => preset.projectId === projectId);
    const creativePresetHistory = creativePresets.flatMap((preset) =>
      planning.listPresetHistory(preset.id, 100),
    );
    const chapterBriefs = planning.listChapterBriefs(projectId);
    const chapterBriefHistory = outline.flatMap((node) =>
      planning.listChapterBriefHistory(projectId, node.id, 100),
    );
    const readerPromiseRepository = new SqliteReaderPromiseRepository(
      this.database,
    );
    const readerPromises = readerPromiseRepository.list(projectId);
    const readerPromiseEvents = readerPromises.flatMap((promise) =>
      readerPromiseRepository.listEvents(projectId, promise.id),
    );
    const webNovelCandidates = new SqliteWebNovelCandidateRepository(
      this.database,
    )
      .list(projectId)
      .map(({ set, items }) => ({ set, items }));
    const signingSprintRepository = new SqliteSigningSprintRepository(
      this.database,
    );
    const signingSprintWorkflow = signingSprintRepository.get(projectId);
    const signingSprint = signingSprintWorkflow
      ? {
          workflow: signingSprintWorkflow,
          candidates: signingSprintRepository.listCandidates(projectId),
        }
      : null;
    const openingCheckReports = planning
      .listOpeningCheckReports(projectId, 100)
      .map((record) => record.report);
    const openingCheckAudits = planning.listOpeningCheckAudits(projectId, 500);
    const outlineOrder = new Map(
      outline.map((node, index) => [node.id, index]),
    );
    const allDocuments = this.documents.list(projectId, undefined, true);
    const selectedDocumentIds = this.resolveExportDocumentIds(
      options,
      allDocuments,
      outline,
    );
    const documents = allDocuments
      .filter(
        (document) =>
          selectedDocumentIds === null || selectedDocumentIds.has(document.id),
      )
      .sort((left, right) => {
        const leftOrder = left.outlineNodeId
          ? outlineOrder.get(left.outlineNodeId)
          : undefined;
        const rightOrder = right.outlineNodeId
          ? outlineOrder.get(right.outlineNodeId)
          : undefined;
        if (leftOrder !== undefined && rightOrder !== undefined)
          return leftOrder - rightOrder;
        if (leftOrder !== undefined) return -1;
        if (rightOrder !== undefined) return 1;
        return left.updatedAt.localeCompare(right.updatedAt);
      })
      .map((document) => ({
        document,
        versions:
          options.versionMode === "history"
            ? this.documents.listVersions(projectId, document.id)
            : document.currentVersionId
              ? [
                  this.documents.getVersion(
                    projectId,
                    document.id,
                    document.currentVersionId,
                  ),
                ].filter(Boolean)
              : [],
        draft: this.documents.getDraft(projectId, document.id),
      }));
    const personas = this.creative.listPersonas(projectId, true);
    const styles = this.delivery.listStyleProfiles(projectId, true);
    const skills = this.delivery.listWritingSkills(projectId);
    const storedCover = new SqliteProjectCoverRepository(this.database).get(
      projectId,
    );
    const cover = storedCover
      ? {
          mediaType: storedCover.mediaType,
          dataBase64: encodeBase64(storedCover.data),
          byteSize: storedCover.byteSize,
          width: storedCover.width,
          height: storedCover.height,
          crop: storedCover.crop,
          imageHash: hash(storedCover.data),
          createdAt: storedCover.createdAt,
          updatedAt: storedCover.updatedAt,
        }
      : null;
    const annotations = options.includeAnnotations
      ? records(
          this.database,
          "SELECT * FROM document_comments WHERE project_id = ? ORDER BY created_at",
          projectId,
        )
          .filter(
            (row) =>
              selectedDocumentIds === null ||
              selectedDocumentIds.has(String(row.document_id)),
          )
          .map((row) => ({
            id: row.id,
            documentId: row.document_id,
            versionId: row.version_id,
            startOffset: row.start_offset,
            endOffset: row.end_offset,
            quote: row.quote,
            body: row.body,
            status: row.status,
          }))
      : [];
    const reviews = records(
      this.database,
      `SELECT * FROM review_reports WHERE project_id = ? ORDER BY created_at`,
      projectId,
    ).map((report) => ({
      report: {
        id: report.id,
        runId: report.run_id,
        stepId: report.step_id,
        documentVersionId: report.document_version_id,
        verdict: report.verdict,
        summary: report.summary,
        score: parseJsonObject(report.score_json),
        reviewedContent: report.reviewed_content,
        reviewedContentHash: report.reviewed_content_hash,
      },
      issues: records(
        this.database,
        "SELECT * FROM review_issues WHERE report_id = ? ORDER BY created_at, id",
        report.id as string,
      ).map((issue) => ({
        issue: {
          id: issue.id,
          category: issue.category,
          severity: issue.severity,
          message: issue.message,
          evidence: parseJsonArray(issue.evidence_json),
          suggestedDirection: issue.suggested_direction,
          status: issue.status,
        },
        actions: records(
          this.database,
          "SELECT * FROM review_issue_actions WHERE issue_id = ? ORDER BY created_at, id",
          issue.id as string,
        ).map((action) => ({
          id: action.id,
          action: action.action,
          note: action.note,
          priorStatus: action.prior_status,
          resultingStatus: action.resulting_status,
        })),
      })),
    }));
    const cocreate = records(
      this.database,
      "SELECT * FROM cocreate_sessions WHERE project_id = ? ORDER BY created_at",
      projectId,
    ).map((session) => ({
      session: {
        id: session.id,
        title: session.title,
        status: session.status,
        speakerPolicy: session.speaker_policy,
        activeBranchId: session.active_branch_id,
        targetOutlineNodeId: session.target_outline_node_id,
        authorPersonaId: session.author_persona_id,
        directorNote: session.director_note,
        contextTurns: session.context_turns,
      },
      participants: records(
        this.database,
        "SELECT * FROM cocreate_participants WHERE session_id = ? ORDER BY position",
        session.id as string,
      ).map((participant) => ({
        personaId: participant.persona_id,
        position: participant.position,
        enabled: participant.enabled === 1,
        talkativeness: participant.talkativeness,
      })),
      branches: records(
        this.database,
        "SELECT * FROM story_branches WHERE session_id = ? ORDER BY created_at",
        session.id as string,
      ).map((branch) => ({
        id: branch.id,
        parentBranchId: branch.parent_branch_id,
        forkedFromTurnId: branch.forked_from_turn_id,
        name: branch.name,
        status: branch.status,
        headTurnId: branch.head_turn_id,
      })),
      turns: records(
        this.database,
        "SELECT * FROM story_turns WHERE session_id = ? ORDER BY created_at, id",
        session.id as string,
      ).map((turn) => ({
        id: turn.id,
        branchId: turn.branch_id,
        parentTurnId: turn.parent_turn_id,
        ordinal: turn.ordinal,
        role: turn.role,
        personaId: turn.persona_id,
        content: turn.content,
        status: turn.status,
        selectedSwipeId: turn.selected_swipe_id,
        metadata: parseJsonObject(turn.metadata_json),
      })),
      swipes: records(
        this.database,
        `SELECT swipe.* FROM turn_swipes swipe
         JOIN story_turns turn ON turn.id = swipe.turn_id
         WHERE turn.session_id = ? ORDER BY swipe.created_at, swipe.id`,
        session.id as string,
      ).map((swipe) => ({
        id: swipe.id,
        turnId: swipe.turn_id,
        ordinal: swipe.ordinal,
        content: swipe.content,
        speakerPersonaId: swipe.speaker_persona_id,
        status: swipe.status,
        metadata: parseJsonObject(swipe.metadata_json),
      })),
    }));
    const assistant = records(
      this.database,
      "SELECT * FROM assistant_conversations WHERE project_id = ? ORDER BY created_at",
      projectId,
    ).map((conversation) => ({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
      },
      messages: records(
        this.database,
        "SELECT * FROM assistant_messages WHERE conversation_id = ? ORDER BY created_at, id",
        conversation.id as string,
      ).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        context: message.context_json
          ? parseJsonObject(message.context_json)
          : null,
      })),
      activities: records(
        this.database,
        "SELECT * FROM assistant_activities WHERE conversation_id = ? ORDER BY created_at, id",
        conversation.id as string,
      ).map((activity) => ({
        id: activity.id,
        messageId: activity.message_id,
        kind: activity.kind,
        toolName: activity.tool_name,
        status: activity.status,
        goal: activity.goal,
        input: parseJsonObject(activity.input_json),
        result: activity.result_json
          ? parseJsonObject(activity.result_json)
          : null,
        error: activity.error_json
          ? parseJsonObject(activity.error_json)
          : null,
        origin: activity.origin_json
          ? parseJsonObject(activity.origin_json)
          : null,
        executionMode: activity.execution_mode,
        phaseKey: activity.phase_key,
        artifacts: activity.artifacts_json
          ? JSON.parse(activity.artifacts_json as string)
          : null,
      })),
    }));
    const longGoals = records(
      this.database,
      "SELECT * FROM assistant_long_goals WHERE project_id = ? ORDER BY created_at, id",
      projectId,
    ).map((goal) => ({
      id: goal.id,
      conversationId: goal.conversation_id,
      activityId: goal.activity_id,
      title: goal.title,
      targetChapters: goal.target_chapters,
      phase: goal.phase,
      status: goal.status,
      baselineHash: goal.baseline_hash,
      lastError: goal.last_error_json
        ? parseJsonObject(goal.last_error_json)
        : null,
    }));
    const runs = options.includeRuns
      ? records(
          this.database,
          "SELECT * FROM runs WHERE project_id = ? ORDER BY created_at",
          projectId,
        )
      : [];
    const counts: BundleCounts = BundleCountsSchema.parse({
      outline: outline.length,
      entities: entities.length,
      facts: facts.length,
      relationships: relationships.length,
      timeline: timeline.length,
      foreshadows: foreshadows.length,
      documents: documents.length,
      versions: documents.reduce((sum, item) => sum + item.versions.length, 0),
      drafts: documents.filter((item) => item.draft).length,
      personas: personas.length,
      styles: styles.length,
      skills: skills.length,
      annotations: annotations.length,
      cover: cover ? 1 : 0,
      cocreateSessions: cocreate.length,
      storyTurns: cocreate.reduce((sum, item) => sum + item.turns.length, 0),
      reviews: reviews.length,
      reviewIssues: reviews.reduce((sum, item) => sum + item.issues.length, 0),
      assistantConversations: assistant.length,
      assistantMessages: assistant.reduce(
        (sum, item) => sum + item.messages.length,
        0,
      ),
      assistantActivities: assistant.reduce(
        (sum, item) => sum + item.activities.length,
        0,
      ),
      assistantLongGoals: longGoals.length,
      runs: runs.length,
      chapterBriefs: chapterBriefs.length,
      chapterBriefHistory: chapterBriefHistory.length,
      creativePresets: creativePresets.length,
      creativePresetHistory: creativePresetHistory.length,
      bookProfileHistory: bookProfileHistory.length,
      platformMetrics: platformMetrics.length,
      publishRecords: publishRecords.length,
      exportBatches: exportBatches.length,
      openingCheckReports: openingCheckReports.length,
      openingCheckAudits: openingCheckAudits.length,
      webNovelCandidateSets: webNovelCandidates.length,
      webNovelCandidateItems: webNovelCandidates.reduce(
        (sum, candidate) => sum + candidate.items.length,
        0,
      ),
      readerPromises: readerPromises.length,
      readerPromiseEvents: readerPromiseEvents.length,
      signingSprintWorkflows: signingSprint ? 1 : 0,
      signingSprintCandidates: signingSprint?.candidates.length ?? 0,
    });
    return BundleSchema.parse({
      manifest: {
        format: "narralume",
        version: 3,
        exportedAt: now,
        counts,
        options,
      },
      project: {
        title: project.title,
        subtitle: project.subtitle,
        premise: project.premise,
        language: project.language,
        phase: project.phase,
      },
      intent,
      compass,
      outline,
      entities,
      facts,
      relationships,
      timeline,
      foreshadows,
      documents,
      personas,
      styles,
      skills,
      cover,
      annotations,
      reviews,
      cocreate,
      assistant,
      longGoals,
      runs,
      bookProfile,
      bookProfileHistory,
      creativePresets,
      creativePresetHistory,
      chapterBriefs,
      chapterBriefHistory,
      readerPromises,
      readerPromiseEvents,
      platformMetrics,
      publishRecords,
      exportBatches,
      openingCheckReports,
      openingCheckAudits,
      webNovelCandidates,
      signingSprint,
    });
  }

  async exportProject(
    projectId: string,
    format: "markdown" | "text" | "docx" | "epub" | "narrative-bundle",
    now: string,
    options: ProjectExportOptions = {
      versionMode: "current",
      includeAnnotations: false,
      includeRuns: false,
    },
  ): Promise<{
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
  }> {
    const project = this.projects.get(projectId);
    if (!project)
      throw new DeliveryServiceError("project.not_found", "Project not found");
    const safeTitle = safeFilename(project.title);
    if (format === "narrative-bundle") {
      const bytes = textToBytes(
        JSON.stringify(this.buildBundle(projectId, now, options), null, 2),
      );
      return {
        filename: `${safeTitle}.narrative.json`,
        mimeType: "application/json; charset=utf-8",
        bytes,
      };
    }
    const sections = this.exportSections(projectId, options);
    if (format === "markdown") {
      return {
        filename: `${safeTitle}.md`,
        mimeType: "text/markdown; charset=utf-8",
        bytes: textToBytes(renderMarkdown(project, sections)),
      };
    }
    if (format === "text") {
      return {
        filename: `${safeTitle}.txt`,
        mimeType: "text/plain; charset=utf-8",
        bytes: textToBytes(renderText(project, sections)),
      };
    }
    if (format === "docx") {
      return {
        filename: `${safeTitle}.docx`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: await renderDocx(project, sections),
      };
    }
    return {
      filename: `${safeTitle}.epub`,
      mimeType: "application/epub+zip",
      bytes: await renderEpub(project, sections),
    };
  }

  createBackup(projectId: string, label: string, now: string) {
    const bundle = this.buildBundle(projectId, now, {
      versionMode: "history",
      includeAnnotations: true,
      includeRuns: true,
    });
    const bundleJson = JSON.stringify(bundle);
    const backup = {
      id: randomUuid(),
      projectId,
      label,
      bundleHash: hash(bundleJson),
      sizeBytes: textToBytes(bundleJson).length,
      createdAt: now,
      restoredProjectId: null,
      counts: bundle.manifest.counts as Record<string, number>,
    };
    return this.delivery.insertBackup(backup, bundleJson);
  }

  restoreBackup(backupId: string, title: string | undefined, now: string) {
    const stored = this.delivery.getBackup(backupId);
    if (!stored)
      throw new DeliveryServiceError("backup.not_found", "Backup not found");
    if (hash(stored.bundleJson) !== stored.backup.bundleHash) {
      throw new DeliveryServiceError(
        "backup.integrity.failed",
        "Backup hash verification failed; the restore was not performed",
      );
    }
    const bundle = BundleSchema.parse(JSON.parse(stored.bundleJson));
    const existingProjectId = stored.backup.restoredProjectId;
    if (existingProjectId && this.projects.get(existingProjectId)) {
      return {
        projectId: existingProjectId,
        backup: stored.backup,
        counts: bundle.manifest.counts,
      };
    }
    return this.database.transaction(() => {
      const { projectId, counts } = this.restoreBundle(
        bundle,
        title ?? `${bundle.project.title} · 恢复副本 ${backupId.slice(0, 8)}`,
        now,
      );
      const expected = bundle.manifest.counts;
      // runs 只作为已中断历史随包导出，不在恢复副本中续跑，因此不参与计数校验。
      const mismatched = (Object.keys(expected) as (keyof BundleCounts)[])
        .filter((key) => key !== "runs")
        .filter((key) => counts[key] !== expected[key]);
      if (mismatched.length) {
        throw new DeliveryServiceError(
          "backup.restore.count_mismatch",
          `Restore count verification failed: ${mismatched.join(", ")}`,
        );
      }
      return {
        projectId,
        backup: this.delivery.markBackupRestored(backupId, projectId),
        counts,
      };
    });
  }

  duplicateProject(projectId: string, title: string | undefined, now: string) {
    const bundle = this.buildBundle(projectId, now);
    return this.database.transaction(
      () =>
        this.restoreBundle(
          bundle,
          title ?? `${bundle.project.title} · 副本`,
          now,
        ).projectId,
    );
  }

  qualityReport(
    projectId: string,
    now: string,
    range: {
      fromOutlineNodeId?: string | null;
      toOutlineNodeId?: string | null;
    } = {},
  ): ProjectQualityReport {
    const project = this.projects.get(projectId);
    if (!project)
      throw new DeliveryServiceError("project.not_found", "Project not found");
    const outline = this.story.listOutline(projectId);
    const allDocuments = this.documents.list(projectId);
    const chapters = outline.filter((node) => node.kind === "chapter");
    const hasRange = Boolean(range.fromOutlineNodeId || range.toOutlineNodeId);
    const selectedDocumentIds = hasRange
      ? this.resolveExportDocumentIds(
          {
            versionMode: "current",
            includeAnnotations: false,
            includeRuns: false,
            ...(range.fromOutlineNodeId
              ? { fromOutlineNodeId: range.fromOutlineNodeId }
              : {}),
            ...(range.toOutlineNodeId
              ? { toOutlineNodeId: range.toOutlineNodeId }
              : {}),
          },
          allDocuments,
          outline,
        )
      : null;
    const documents = selectedDocumentIds
      ? allDocuments.filter((document) => selectedDocumentIds.has(document.id))
      : allDocuments;
    const fromIndex = range.fromOutlineNodeId
      ? chapters.findIndex((chapter) => chapter.id === range.fromOutlineNodeId)
      : 0;
    const toIndex = range.toOutlineNodeId
      ? chapters.findIndex((chapter) => chapter.id === range.toOutlineNodeId)
      : chapters.length - 1;
    if (hasRange && (fromIndex < 0 || toIndex < 0 || fromIndex > toIndex)) {
      throw new DeliveryServiceError(
        "quality.range.invalid",
        "Quality range must reference chapters in ascending order",
      );
    }
    const scopedChapters = hasRange
      ? chapters.slice(fromIndex, toIndex + 1)
      : chapters;
    const versions = documents.flatMap((document) =>
      this.documents.listVersions(projectId, document.id),
    );
    const currentVersions = documents
      .map((document) =>
        document.currentVersionId
          ? this.documents.getVersion(
              projectId,
              document.id,
              document.currentVersionId,
            )
          : null,
      )
      .filter((version): version is NonNullable<typeof version> =>
        Boolean(version),
      );
    const strictCurrentEvidence = hasRange;
    const currentVersionEvidence = scopedChapters.map((chapter) => {
      const document = documents.find(
        (candidate) =>
          candidate.kind === "chapter" &&
          candidate.outlineNodeId === chapter.id,
      );
      const version = document?.currentVersionId
        ? this.documents.getVersion(
            projectId,
            document.id,
            document.currentVersionId,
          )
        : null;
      const reviewPasses = version
        ? count(
            this.database,
            `SELECT COUNT(*) AS count FROM review_reports
             WHERE project_id = ? AND document_version_id = ?
               AND reviewed_content_hash = ? AND verdict = 'pass'`,
            projectId,
            version.id,
            version.contentHash,
          )
        : 0;
      const summaries = version
        ? count(
            this.database,
            `SELECT COUNT(*) AS count FROM narrative_summaries
             WHERE project_id = ? AND scope_type = 'chapter' AND scope_id = ?
               AND source_hash = ?`,
            projectId,
            chapter.id,
            version.contentHash,
          )
        : 0;
      return {
        chapter,
        document,
        version,
        reviewPasses,
        summaries,
      };
    });
    const requiresBatchJointReview = hasRange && scopedChapters.length === 5;
    const expectedBatchVersions = currentVersionEvidence.map((evidence) => ({
      outlineNodeId: evidence.chapter.id,
      documentId: evidence.document?.id ?? null,
      versionId: evidence.version?.id ?? null,
      contentHash: evidence.version?.contentHash ?? null,
    }));
    const batchJointReview = requiresBatchJointReview
      ? (this.state
          .listLatestSummaries(projectId, "session")
          .filter(
            (summary) =>
              summary.stateDelta.kind === "first-five-joint-review" &&
              summary.stateDelta.sourceHash === summary.sourceHash,
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .find((summary) => {
            const chapters = summary.stateDelta.chapters;
            if (!Array.isArray(chapters) || chapters.length !== 5) return false;
            return chapters.every((entry, index) => {
              if (!entry || typeof entry !== "object" || Array.isArray(entry))
                return false;
              const candidate = entry as Record<string, unknown>;
              const expected = expectedBatchVersions[index];
              if (!expected) return false;
              return (
                candidate.outlineNodeId === expected.outlineNodeId &&
                candidate.documentId === expected.documentId &&
                candidate.versionId === expected.versionId &&
                candidate.contentHash === expected.contentHash
              );
            });
          }) ?? null)
      : null;
    const batchJointReviewVerdict = batchJointReview
      ? stringField(batchJointReview.stateDelta, "verdict")
      : null;
    const batchJointReviewIssueCount = batchJointReview
      ? Array.isArray(batchJointReview.stateDelta.issues)
        ? batchJointReview.stateDelta.issues.length
        : 0
      : 0;
    const facts = this.canon.listEffectiveFacts(projectId, {
      includeCandidates: true,
    });
    const entities = this.canon.listEntities(projectId, {
      includeRetired: true,
    });
    const foreshadows = this.state.listForeshadows(projectId);
    const openComments = count(
      this.database,
      `SELECT COUNT(*) AS count FROM document_comments WHERE project_id = ? AND status = 'open'`,
      projectId,
    );
    const metrics = {
      outlineNodes: outline.length,
      chapters: scopedChapters.length,
      committedChapters: outline.filter(
        (node) =>
          node.kind === "chapter" &&
          scopedChapters.some((chapter) => chapter.id === node.id) &&
          node.status === "committed",
      ).length,
      documents: documents.length,
      versions: versions.length,
      manuscriptCharacters: currentVersions.reduce(
        (sum, version) =>
          sum + effectiveManuscriptCharacterCount(version.content),
        0,
      ),
      currentVersionReviewPasses: currentVersionEvidence.reduce(
        (sum, evidence) => sum + Math.min(evidence.reviewPasses, 1),
        0,
      ),
      currentVersionSettlements: currentVersionEvidence.reduce(
        (sum, evidence) => sum + Math.min(evidence.summaries, 1),
        0,
      ),
      batchJointReview: batchJointReview
        ? ["pass", "warning"].includes(batchJointReviewVerdict ?? "")
          ? 1
          : 0
        : 0,
      batchJointReviewIssues: batchJointReviewIssueCount,
      entities: entities.length,
      facts: facts.length,
      candidateFacts: facts.filter((fact) => fact.authority === "candidate")
        .length,
      unresolvedForeshadows: foreshadows.filter(
        (item) => !["resolved", "abandoned"].includes(item.status),
      ).length,
      openComments,
      activeStyleProfiles: this.delivery.getActiveStyleProfile(projectId)
        ? 1
        : 0,
      enabledSkills: this.delivery.listWritingSkills(projectId, true).length,
    };
    const issues: QualityIssue[] = [];
    const add = (
      category: QualityIssue["category"],
      severity: QualityIssue["severity"],
      message: string,
      suggestion: string,
      targetType: string | null = null,
      targetId: string | null = null,
    ) =>
      issues.push({
        id: `quality:${issues.length + 1}`,
        category,
        severity,
        message,
        targetType,
        targetId,
        suggestion,
      });
    if (!project.premise)
      add(
        "structure",
        "warning",
        "作品尚无一句话命题",
        "在作者意图中固定核心冲突",
      );
    if (!this.story.getAuthorIntent(projectId)?.promise)
      add(
        "structure",
        "warning",
        "尚未定义对读者的核心承诺",
        "补充并锁定作者意图",
      );
    if (metrics.chapters === 0)
      add(
        "structure",
        "error",
        "大纲中没有章节节点",
        "建立章节或先运行滚动规划",
      );
    if (metrics.manuscriptCharacters === 0)
      add(
        "manuscript",
        "error",
        "尚无可交付正文",
        "写作、导入或采纳至少一个场景",
      );
    for (const document of documents) {
      if (!document.currentVersionId) {
        add(
          "manuscript",
          "warning",
          `《${document.title}》仍是空稿`,
          "写入正文或归档该稿件",
          "document",
          document.id,
        );
      }
    }
    if (strictCurrentEvidence) {
      for (const evidence of currentVersionEvidence) {
        if (!evidence.document || !evidence.version) {
          add(
            "workflow",
            "error",
            `章节《${evidence.chapter.title}》没有可核对的当前正文版本`,
            "先保存该章正式正文，再进行审阅与结算",
            "outline",
            evidence.chapter.id,
          );
          continue;
        }
        if (evidence.reviewPasses === 0) {
          add(
            "workflow",
            "error",
            `章节《${evidence.chapter.title}》当前版本 ${evidence.version.id} 尚无同版本通过审阅`,
            "对当前版本重新执行一致性审阅；旧版本的报告不能替代本版本",
            "document",
            evidence.document.id,
          );
        }
        if (evidence.summaries === 0) {
          add(
            "workflow",
            "error",
            `章节《${evidence.chapter.title}》当前版本 ${evidence.version.id} 尚无同版本结算摘要`,
            "完成结算并写入该版本的摘要/事实状态，再导出首发材料",
            "document",
            evidence.document.id,
          );
        }
      }
    }
    if (requiresBatchJointReview) {
      if (!batchJointReview) {
        add(
          "workflow",
          "error",
          "首发前五章没有绑定当前版本的联合审阅证据",
          "先完成前五章联合审阅；旧版本或不完整批次不能替代当前首发范围",
          "session",
          null,
        );
      } else if (!["pass", "warning"].includes(batchJointReviewVerdict ?? "")) {
        add(
          "continuity",
          "error",
          `前五章联合审阅仍为阻断：${batchJointReview.summary}`,
          "修订联合审阅指出的连续性问题，并针对新的当前版本重新审阅",
          "session",
          null,
        );
      } else if (batchJointReviewVerdict === "warning") {
        add(
          "continuity",
          "warning",
          `前五章联合审阅有 ${batchJointReviewIssueCount} 项警告：${batchJointReview.summary}`,
          "逐项确认警告属于有意保留，或在下一轮连载修订",
          "session",
          null,
        );
      }
    }
    if (metrics.candidateFacts > 0)
      add(
        "canon",
        "warning",
        `有 ${metrics.candidateFacts} 条候选正典尚未裁定`,
        "在故事圣经中确认、提升或丢弃候选",
      );
    if (metrics.unresolvedForeshadows > 0)
      add(
        "continuity",
        "info",
        `有 ${metrics.unresolvedForeshadows} 条伏笔仍在进行`,
        "导出前确认它们属于有意保留，而非遗漏",
      );
    if (openComments > 0)
      add(
        "workflow",
        "warning",
        `有 ${openComments} 条稿件评论尚未解决`,
        "逐条处理或明确保留到下一轮修订",
      );
    if (!metrics.activeStyleProfiles)
      add(
        "manuscript",
        "info",
        "没有启用的风格档案",
        "如需稳定长篇文风，可从样稿拆解或手动建立档案",
      );
    const deduction = issues.reduce(
      (sum, issue) =>
        sum +
        (issue.severity === "error"
          ? 18
          : issue.severity === "warning"
            ? 7
            : 2),
      0,
    );
    const gates = [
      {
        id: "author-promise",
        label: "作者承诺已锁定",
        passed: Boolean(this.story.getAuthorIntent(projectId)?.promise?.trim()),
        message: "交付前必须明确作品向读者兑现的核心体验。",
        targetType: "author-intent",
        targetId: projectId,
      },
      {
        id: "chapter-plan",
        label: "章节结构已建立",
        passed: metrics.chapters > 0,
        message: hasRange
          ? `当前首发范围包含 ${metrics.chapters} 章；范围外章节不参与本次检查。`
          : "至少建立一个章节节点，确保导出结构可验证。",
        targetType: "outline",
        targetId: null,
      },
      {
        id: "chapter-commitment",
        label: "规划章节均已提交",
        passed:
          metrics.chapters > 0 &&
          metrics.committedChapters === metrics.chapters,
        message:
          metrics.chapters === 0
            ? "尚无可提交的章节。"
            : `当前范围已提交 ${metrics.committedChapters}/${metrics.chapters} 章；未完成章节不能被软评分掩盖。`,
        targetType: "outline",
        targetId: null,
      },
      {
        id: "manuscript-present",
        label: "正文已形成可交付工件",
        passed:
          metrics.manuscriptCharacters >=
          (metrics.chapters >= 5 ? metrics.chapters * 2_000 : 1_000),
        message: `当前检查范围正文 ${metrics.manuscriptCharacters} 字符；${metrics.chapters >= 5 ? `至少需要 ${metrics.chapters * 2_000} 字符` : "达到 1,000 字符后才进入交付判断"}。`,
        targetType: "document",
        targetId: null,
      },
      {
        id: "current-version-evidence",
        label: "当前版本已审阅并结算",
        passed:
          !strictCurrentEvidence ||
          currentVersionEvidence.every(
            (evidence) =>
              Boolean(evidence.version) &&
              evidence.reviewPasses > 0 &&
              evidence.summaries > 0,
          ),
        message: strictCurrentEvidence
          ? `当前范围已核对 ${metrics.currentVersionReviewPasses}/${metrics.chapters} 章审阅、${metrics.currentVersionSettlements}/${metrics.chapters} 章结算；报告和摘要必须绑定当前版本。`
          : "选择具体首发范围后，将核对每章当前版本的审阅和结算绑定。",
        targetType: "document",
        targetId: null,
      },
      {
        id: "batch-joint-review",
        label: "前五章联合审阅已通过",
        passed:
          !requiresBatchJointReview ||
          Boolean(
            batchJointReview &&
            ["pass", "warning"].includes(batchJointReviewVerdict ?? ""),
          ),
        message: requiresBatchJointReview
          ? batchJointReview
            ? `联合审阅绑定五个当前版本，结论为 ${batchJointReviewVerdict ?? "未知"}；${batchJointReviewIssueCount} 项具体问题已记录。`
            : "首发五章必须完成绑定当前版本的联合审阅。"
          : "选择恰好五章的首发范围后，将核对联合审阅证据。",
        targetType: "session",
        targetId: null,
      },
      {
        id: "no-blocking-errors",
        label: "没有结构或稿件阻断错误",
        passed: !issues.some((issue) => issue.severity === "error"),
        message: "先解决所有标记为阻断的问题。",
        targetType: null,
        targetId: null,
      },
    ];
    const score = Math.max(0, 100 - deduction);
    const allGatesPassed = gates.every((gate) => gate.passed);
    return {
      projectId,
      score,
      readiness: allGatesPassed
        ? score >= 90
          ? "ready"
          : "needs_attention"
        : "blocked",
      gates,
      generatedAt: now,
      metrics,
      issues,
    };
  }

  private exportSections(projectId: string, options: ProjectExportOptions) {
    const outline = this.story.listOutline(projectId);
    const outlineOrder = new Map(
      outline.map((node, index) => [node.id, index]),
    );
    const allDocuments = this.documents.list(projectId);
    const selectedDocumentIds = this.resolveExportDocumentIds(
      options,
      allDocuments,
      outline,
    );
    const documents = allDocuments
      .filter(
        (document) =>
          selectedDocumentIds === null || selectedDocumentIds.has(document.id),
      )
      .filter((document) =>
        ["manuscript", "chapter", "scene"].includes(document.kind),
      )
      .sort((left, right) => {
        const leftOrder = left.outlineNodeId
          ? outlineOrder.get(left.outlineNodeId)
          : undefined;
        const rightOrder = right.outlineNodeId
          ? outlineOrder.get(right.outlineNodeId)
          : undefined;
        if (leftOrder !== undefined && rightOrder !== undefined)
          return leftOrder - rightOrder;
        if (leftOrder !== undefined) return -1;
        if (rightOrder !== undefined) return 1;
        return 0;
      });
    const sections = documents.flatMap((document) => {
      const versions =
        options.versionMode === "history"
          ? [...this.documents.listVersions(projectId, document.id)].reverse()
          : document.currentVersionId
            ? [
                this.documents.getVersion(
                  projectId,
                  document.id,
                  document.currentVersionId,
                ),
              ].filter((version): version is NonNullable<typeof version> =>
                Boolean(version),
              )
            : [];
      return versions.map((version, index) => ({
        documentId: document.id,
        versionId: version.id,
        title:
          options.versionMode === "history"
            ? `${document.title} · 版本 ${index + 1}`
            : document.title,
        content: version.content,
      }));
    });
    if (options.includeAnnotations) {
      const annotations = records(
        this.database,
        "SELECT * FROM document_comments WHERE project_id = ? ORDER BY created_at",
        projectId,
      );
      for (const section of sections) {
        const notes = annotations.filter(
          (annotation) => annotation.version_id === section.versionId,
        );
        if (notes.length) {
          section.content += `\n\n---\n\n批注\n\n${notes
            .map(
              (note, index) =>
                `${index + 1}. 「${String(note.quote)}」— ${String(note.body)} [${String(note.status)}]`,
            )
            .join("\n")}`;
        }
      }
    }
    if (options.includeRuns) {
      const runs = records(
        this.database,
        "SELECT id, recipe, mode, status, started_at, finished_at, created_at FROM runs WHERE project_id = ? ORDER BY created_at",
        projectId,
      );
      if (runs.length)
        sections.push({
          documentId: "run-audit",
          versionId: "run-audit",
          title: "附录 · AI 运行记录",
          content: runs
            .map(
              (run) =>
                `${String(run.created_at)} · ${String(run.recipe)} · ${String(run.mode)} · ${String(run.status)} · ${String(run.id)}`,
            )
            .join("\n"),
        });
    }
    return sections.filter((section) => section.content.trim());
  }

  /**
   * Resolve an inclusive chapter range once for every export format. Documents
   * attached to scenes/breakdowns inherit their nearest chapter; unbound
   * documents are intentionally omitted when a range is selected.
   */
  private resolveExportDocumentIds(
    options: ProjectExportOptions,
    documents: readonly { id: string; outlineNodeId: string | null }[],
    outline: readonly {
      id: string;
      kind: string;
      parentId: string | null;
    }[],
  ): Set<string> | null {
    const fromId = options.fromOutlineNodeId ?? null;
    const toId = options.toOutlineNodeId ?? null;
    if (!fromId && !toId) return null;

    const nodeById = new Map(outline.map((node) => [node.id, node]));
    const chapters = outline.filter((node) => node.kind === "chapter");
    const chapterIndex = new Map(
      chapters.map((node, index) => [node.id, index]),
    );
    const resolveBoundary = (id: string | null, label: string) => {
      if (!id) return label === "from" ? 0 : chapters.length - 1;
      const node = nodeById.get(id);
      if (!node || node.kind !== "chapter") {
        throw new DeliveryServiceError(
          "export.range.invalid",
          `Export ${label} boundary must reference a chapter in this project`,
        );
      }
      return chapterIndex.get(id)!;
    };
    if (!chapters.length) {
      throw new DeliveryServiceError(
        "export.range.invalid",
        "A chapter range cannot be selected before the project has chapters",
      );
    }
    const start = resolveBoundary(fromId, "from");
    const end = resolveBoundary(toId, "to");
    if (start > end) {
      throw new DeliveryServiceError(
        "export.range.invalid",
        "Export range start must not come after its end",
      );
    }

    const nearestChapter = (nodeId: string): string | null => {
      let current = nodeById.get(nodeId);
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        if (current.kind === "chapter") return current.id;
        visited.add(current.id);
        current = current.parentId ? nodeById.get(current.parentId) : undefined;
      }
      return null;
    };
    return new Set(
      documents
        .filter((document) => {
          if (!document.outlineNodeId) return false;
          const chapterId = nearestChapter(document.outlineNodeId);
          const index = chapterId ? chapterIndex.get(chapterId) : undefined;
          return index !== undefined && index >= start && index <= end;
        })
        .map((document) => document.id),
    );
  }

  private applyCandidates(
    batch: {
      targetProjectId: string | null;
      filename: string;
      metadata: Readonly<Record<string, unknown>>;
    },
    candidates: readonly ImportCandidate[],
    projectTitle: string | undefined,
    now: string,
  ): string {
    let projectId = batch.targetProjectId;
    if (!projectId) {
      const projectCandidate = candidates.find(
        (candidate) => candidate.kind === "project",
      );
      const title =
        projectTitle ??
        stringField(projectCandidate?.payload, "title") ??
        stringField(batch.metadata, "title") ??
        titleFromFilename(batch.filename);
      projectId = randomUuid();
      this.projects.insert(
        createProject({
          id: projectId,
          title,
          premise: stringField(projectCandidate?.payload, "premise"),
          now,
        }),
      );
    }
    let root = this.story
      .listOutline(projectId)
      .find((node) => node.kind === "book" && node.parentId === null);
    if (!root) {
      root = this.story.insertOutlineNode(
        createOutlineNode({
          id: randomUuid(),
          projectId,
          parent: null,
          kind: "book",
          ordinal: 0,
          title: this.projects.get(projectId)!.title,
          now,
        }),
      );
    }
    let chapterOrdinal = this.story.listOutlineChildren(
      projectId,
      root.id,
    ).length;
    for (const candidate of candidates) {
      if (candidate.kind === "document") {
        const title =
          stringField(candidate.payload, "title") ?? candidate.title;
        const content = stringField(candidate.payload, "content") ?? "";
        const kind =
          stringField(candidate.payload, "kind") === "chapter"
            ? "chapter"
            : "manuscript";
        const chapter =
          kind === "chapter"
            ? this.story.insertOutlineNode(
                createOutlineNode({
                  id: randomUuid(),
                  projectId,
                  parent: root,
                  kind: "chapter",
                  ordinal: chapterOrdinal,
                  title,
                  summary: stringField(candidate.payload, "summary"),
                  metadata: { importCandidateId: candidate.id },
                  now,
                }),
              )
            : null;
        const document = this.documents.insert(
          createDocument({
            id: randomUuid(),
            projectId,
            kind,
            title,
            outlineNodeId: chapter?.id ?? null,
            now,
          }),
        );
        const version = this.documents.appendVersion(projectId, document.id, {
          id: randomUuid(),
          content,
          source: `import:${candidate.batchId}`,
          expectedCurrentVersionId: null,
          now,
        });
        if (chapter) {
          this.retrieval.upsertSegment({
            id: `document:${document.id}:current`,
            projectId,
            sourceType: "document_current",
            sourceId: document.id,
            title,
            content,
            authority: "confirmed",
            metadata: {
              documentId: document.id,
              documentVersionId: version.id,
              outlineNodeId: chapter.id,
              importCandidateId: candidate.id,
            },
            entityIds: [],
            createdAt: now,
            updatedAt: now,
          });
          const summary = stringField(candidate.payload, "summary");
          if (summary) {
            this.state.upsertSummary({
              id: `import:${candidate.id}:summary`,
              projectId,
              scopeType: "chapter",
              scopeId: chapter.id,
              summary,
              stateDelta: {},
              sourceHash: version.contentHash,
              createdAt: now,
            });
          }
          this.story.updateOutlineStatus(
            projectId,
            chapter.id,
            "committed",
            now,
          );
          chapterOrdinal += 1;
        }
      } else if (candidate.kind === "entity") {
        const name = stringField(candidate.payload, "name") ?? candidate.title;
        if (
          !this.canon
            .listEntities(projectId, { includeRetired: true })
            .some((entity) => entity.name === name)
        ) {
          this.canon.insertEntity(
            createCanonEntity({
              id: randomUuid(),
              projectId,
              type: canonType(stringField(candidate.payload, "type")),
              name,
              description: stringField(candidate.payload, "description"),
              aliases: stringArray(candidate.payload.aliases),
              attributes: objectField(candidate.payload, "attributes"),
              now,
            }),
          );
        }
      } else if (candidate.kind === "intent") {
        this.story.upsertAuthorIntent({
          projectId,
          promise: stringField(candidate.payload, "promise"),
          themes: stringArray(candidate.payload.themes),
          audience: stringField(candidate.payload, "audience"),
          tone: stringField(candidate.payload, "tone"),
          boundaries: stringArray(candidate.payload.boundaries),
          endingDirection: stringField(candidate.payload, "endingDirection"),
          currentFocus: stringField(candidate.payload, "currentFocus"),
          lockedFields: [],
          updatedAt: now,
        });
      } else if (candidate.kind === "style") {
        this.delivery.insertStyleProfile(
          styleFromPayload(projectId, candidate, now),
        );
      } else if (candidate.kind === "skill") {
        this.delivery.insertWritingSkill(
          skillFromPayload(projectId, candidate, now),
        );
      } else if (candidate.kind === "relationship") {
        const from = entityByImportedName(
          this.canon.listEntities(projectId),
          stringField(candidate.payload, "fromName"),
        );
        const to = entityByImportedName(
          this.canon.listEntities(projectId),
          stringField(candidate.payload, "toName"),
        );
        if (from && to)
          this.state.insertRelationship({
            id: randomUuid(),
            projectId,
            fromEntityId: from.id,
            toEntityId: to.id,
            relation: stringField(candidate.payload, "relation") ?? "关联",
            intensity: null,
            state: {
              description: stringField(candidate.payload, "description"),
              evidence: objectField(candidate.payload, "evidence"),
            },
            outlineNodeId: null,
            storyTime: null,
            sourceId: candidate.id,
            supersedesEventId: null,
            createdAt: now,
          });
      } else if (candidate.kind === "timeline") {
        const participants = stringArray(candidate.payload.participantNames)
          .map((name) =>
            entityByImportedName(this.canon.listEntities(projectId), name),
          )
          .filter((entity): entity is CanonEntity => Boolean(entity))
          .map((entity) => entity.id);
        this.state.insertTimelineEvent({
          id: randomUuid(),
          projectId,
          title: stringField(candidate.payload, "title") ?? candidate.title,
          description: stringField(candidate.payload, "description"),
          outlineNodeId: null,
          storyTimeStart: null,
          storyTimeEnd: null,
          sequence: numberField(candidate.payload, "sequence"),
          participants,
          causes: [],
          visibility: "reader",
          sourceId: candidate.id,
          createdAt: now,
          updatedAt: now,
        });
      } else if (candidate.kind === "foreshadow") {
        this.state.insertForeshadow({
          id: randomUuid(),
          projectId,
          title: stringField(candidate.payload, "title") ?? candidate.title,
          description:
            stringField(candidate.payload, "description") ?? candidate.title,
          status: "planted",
          importance: 3,
          targetFromNodeId: null,
          targetToNodeId: null,
          dependencies: [],
          evidenceNodeIds: [],
          resolutionNodeId: null,
          createdAt: now,
          updatedAt: now,
        });
      } else if (
        candidate.kind === "character-arc" ||
        candidate.kind === "scene-analysis"
      ) {
        const document = this.documents.insert(
          createDocument({
            id: randomUuid(),
            projectId,
            kind: "note",
            title: candidate.title,
            now,
          }),
        );
        this.documents.appendVersion(projectId, document.id, {
          id: randomUuid(),
          content: renderAnalysisCandidate(candidate),
          source: `import-analysis:${candidate.id}`,
          expectedCurrentVersionId: null,
          now,
        });
      }
    }
    return projectId;
  }

  private restoreBundle(
    bundle: NarrativeBundle,
    title: string,
    now: string,
  ): { projectId: string; counts: BundleCounts } {
    const projectId = randomUuid();
    const project = createProject({
      id: projectId,
      title,
      subtitle: bundle.project.subtitle,
      premise: bundle.project.premise,
      language: bundle.project.language,
      now,
    });
    this.projects.insert(project);
    const planning = new SqliteWebNovelRepository(this.database);
    const signingSprintRepository = new SqliteSigningSprintRepository(
      this.database,
    );
    const platformMetrics = new SqlitePlatformMetricsRepository(this.database);
    const publishRecords = new SqlitePublishRecordRepository(this.database);
    const exportBatches = new SqliteExportBatchRepository(this.database);
    const nodeMap = new Map<string, string>();
    const entityMap = new Map<string, string>();
    const timelineMap = new Map<string, string>();
    const foreshadowMap = new Map<string, string>();
    const documentMap = new Map<string, string>();
    const versionMap = new Map<string, string>();
    const exportBatchMap = new Map<string, string>();
    const openingCheckReportMap = new Map<string, string>();
    const personaMap = new Map<string, string>();
    const conversationMap = new Map<string, string>();
    const messageMap = new Map<string, string>();
    const activityMap = new Map<string, string>();
    const issueMap = new Map<string, string>();
    const creativePresetMap = new Map<string, string>();
    const readerPromiseMap = new Map<string, string>();
    const candidateRunMap = new Map<
      string,
      { runId: string; stepId: string }
    >();
    const reviewRunMap = new Map<string, { runId: string; stepId: string }>();
    let restoredFacts = 0;
    let restoredRelationships = 0;
    let restoredTimeline = 0;
    let restoredForeshadows = 0;
    let restoredVersions = 0;
    let restoredDrafts = 0;
    let restoredAnnotations = 0;
    let restoredReviewIssues = 0;
    let restoredCoCreateSessions = 0;
    let restoredStoryTurns = 0;
    let restoredMessages = 0;
    let restoredActivities = 0;
    let restoredLongGoals = 0;
    let restoredCover = 0;
    let restoredBookProfileHistory = 0;
    let restoredCreativePresets = 0;
    let restoredCreativePresetHistory = 0;
    let restoredChapterBriefs = 0;
    let restoredChapterBriefHistory = 0;
    let restoredPlatformMetrics = 0;
    let restoredPublishRecords = 0;
    let restoredExportBatches = 0;
    let restoredOpeningCheckReports = 0;
    let restoredOpeningCheckAudits = 0;
    let restoredWebNovelCandidateSets = 0;
    let restoredWebNovelCandidateItems = 0;
    let restoredReaderPromises = 0;
    let restoredReaderPromiseEvents = 0;
    let restoredSigningSprintWorkflows = 0;
    let restoredSigningSprintCandidates = 0;
    // issueMap 保留 issue 旧 ID → 新 ID 的映射，便于后续扩展（如裁定回指）。
    const orderedOutline = [...bundle.outline].sort(
      (a, b) => numberField(a, "depth") - numberField(b, "depth"),
    );
    for (const source of orderedOutline) {
      const oldId = required(stringField(source, "id"), "outline id");
      const oldParentId = stringField(source, "parentId");
      const parentId = oldParentId ? nodeMap.get(oldParentId) : null;
      const parent = parentId
        ? this.story.requireOutlineNode(projectId, parentId)
        : null;
      const id = randomUuid();
      nodeMap.set(oldId, id);
      const node = createOutlineNode({
        id,
        projectId,
        parent,
        kind: outlineKind(stringField(source, "kind")),
        ordinal: numberField(source, "ordinal"),
        title: stringField(source, "title") ?? "未命名节点",
        summary: stringField(source, "summary"),
        goal: stringField(source, "goal"),
        conflict: stringField(source, "conflict"),
        outcome: stringField(source, "outcome"),
        storyTime: stringField(source, "storyTime"),
        metadata: objectField(source, "metadata"),
        now,
      });
      this.story.insertOutlineNode(node);
      const status = stringField(source, "status");
      if (status && status !== "planned") {
        this.story.updateOutlineStatus(
          projectId,
          id,
          outlineStatus(status),
          now,
        );
      }
    }
    if (!orderedOutline.length) {
      this.story.insertOutlineNode(
        createOutlineNode({
          id: randomUuid(),
          projectId,
          parent: null,
          kind: "book",
          ordinal: 0,
          title,
          now,
        }),
      );
    }
    for (const source of bundle.entities) {
      const oldId = required(stringField(source, "id"), "entity id");
      const id = randomUuid();
      entityMap.set(oldId, id);
      const entity = createCanonEntity({
        id,
        projectId,
        type: canonType(stringField(source, "type")),
        name: stringField(source, "name") ?? "未命名实体",
        aliases: stringArray(source.aliases),
        description: stringField(source, "description"),
        attributes: objectField(source, "attributes"),
        now,
      });
      this.canon.insertEntity(
        stringField(source, "status") === "retired"
          ? { ...entity, status: "retired" }
          : entity,
      );
    }
    for (const source of bundle.outline) {
      const nodeId = nodeMap.get(stringField(source, "id") ?? "");
      const povEntityId = entityMap.get(
        stringField(source, "povEntityId") ?? "",
      );
      if (nodeId && povEntityId) {
        this.database.raw
          .prepare(
            "UPDATE outline_nodes SET pov_entity_id = ?, updated_at = ? WHERE project_id = ? AND id = ?",
          )
          .run(povEntityId, now, projectId, nodeId);
      }
    }
    for (const source of bundle.facts) {
      const subjectId = entityMap.get(stringField(source, "subjectId") ?? "");
      if (!subjectId) continue;
      const oldObjectEntityId = stringField(source, "objectEntityId");
      const objectEntityId = oldObjectEntityId
        ? entityMap.get(oldObjectEntityId)
        : null;
      if (oldObjectEntityId && !objectEntityId) continue;
      const validFromNodeId = nodeMap.get(
        stringField(source, "validFromNodeId") ?? "",
      );
      const validToNodeId = nodeMap.get(
        stringField(source, "validToNodeId") ?? "",
      );
      this.database.raw
        .prepare(
          `INSERT INTO canon_facts(
            id, project_id, subject_id, predicate, object_entity_id, value_json,
            valid_from_node_id, valid_to_node_id, knowledge_scope, knowledge_subject_id,
            authority, confidence, source_type, source_id, supersedes_fact_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUuid(),
          projectId,
          subjectId,
          stringField(source, "predicate") ?? "未命名事实",
          objectEntityId ?? null,
          objectEntityId ? null : JSON.stringify(source.value ?? null),
          validFromNodeId ?? null,
          validToNodeId ?? null,
          knowledgeScope(stringField(source, "knowledgeScope")),
          entityMap.get(stringField(source, "knowledgeSubjectId") ?? "") ??
            null,
          canonAuthority(stringField(source, "authority")),
          boundedNumber(source.confidence, 0, 1, 1),
          "bundle-restore",
          null,
          null,
          now,
        );
      restoredFacts += 1;
    }
    for (const source of bundle.relationships) {
      const fromEntityId = entityMap.get(
        stringField(source, "fromEntityId") ?? "",
      );
      const toEntityId = entityMap.get(stringField(source, "toEntityId") ?? "");
      if (!fromEntityId || !toEntityId) continue;
      this.state.insertRelationship({
        id: randomUuid(),
        projectId,
        fromEntityId,
        toEntityId,
        relation: stringField(source, "relation") ?? "相关",
        intensity:
          typeof source.intensity === "number" ? source.intensity : null,
        state: objectField(source, "state"),
        outlineNodeId:
          nodeMap.get(stringField(source, "outlineNodeId") ?? "") ?? null,
        storyTime: stringField(source, "storyTime"),
        sourceId: null,
        supersedesEventId: null,
        createdAt: now,
      });
      restoredRelationships += 1;
    }
    for (const source of bundle.timeline) {
      const oldId = required(stringField(source, "id"), "timeline id");
      const id = randomUuid();
      timelineMap.set(oldId, id);
      this.state.insertTimelineEvent({
        id,
        projectId,
        title: stringField(source, "title") ?? "未命名事件",
        description: stringField(source, "description"),
        outlineNodeId:
          nodeMap.get(stringField(source, "outlineNodeId") ?? "") ?? null,
        storyTimeStart: stringField(source, "storyTimeStart"),
        storyTimeEnd: stringField(source, "storyTimeEnd"),
        sequence: numberField(source, "sequence"),
        participants: stringArray(source.participants)
          .map((id) => entityMap.get(id))
          .filter((id): id is string => Boolean(id)),
        causes: [],
        visibility: timelineVisibility(stringField(source, "visibility")),
        sourceId: null,
        createdAt: now,
        updatedAt: now,
      });
      restoredTimeline += 1;
    }
    const insertCausalLink = this.database.raw.prepare(
      "INSERT OR IGNORE INTO causal_links(cause_event_id, effect_event_id) VALUES (?, ?)",
    );
    for (const source of bundle.timeline) {
      const effectId = timelineMap.get(stringField(source, "id") ?? "");
      if (!effectId) continue;
      for (const oldCauseId of stringArray(source.causes)) {
        const causeId = timelineMap.get(oldCauseId);
        if (causeId && causeId !== effectId)
          insertCausalLink.run(causeId, effectId);
      }
    }
    for (const source of bundle.foreshadows) {
      const oldId = required(stringField(source, "id"), "foreshadow id");
      const id = randomUuid();
      foreshadowMap.set(oldId, id);
      this.database.raw
        .prepare(
          `INSERT INTO foreshadows(
            id, project_id, title, description, status, importance,
            target_from_node_id, target_to_node_id, resolution_node_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          projectId,
          stringField(source, "title") ?? "未命名伏笔",
          stringField(source, "description") ?? "",
          foreshadowStatus(stringField(source, "status")),
          boundedNumber(source.importance, 1, 5, 3),
          nodeMap.get(stringField(source, "targetFromNodeId") ?? "") ?? null,
          nodeMap.get(stringField(source, "targetToNodeId") ?? "") ?? null,
          nodeMap.get(stringField(source, "resolutionNodeId") ?? "") ?? null,
          now,
          now,
        );
      restoredForeshadows += 1;
    }
    const insertForeshadowDependency = this.database.raw.prepare(
      "INSERT OR IGNORE INTO foreshadow_dependencies(foreshadow_id, depends_on_id) VALUES (?, ?)",
    );
    const insertForeshadowEvidence = this.database.raw.prepare(
      "INSERT OR IGNORE INTO foreshadow_evidence(foreshadow_id, outline_node_id, created_at) VALUES (?, ?, ?)",
    );
    for (const source of bundle.foreshadows) {
      const id = foreshadowMap.get(stringField(source, "id") ?? "");
      if (!id) continue;
      for (const oldDependencyId of stringArray(source.dependencies)) {
        const dependencyId = foreshadowMap.get(oldDependencyId);
        if (dependencyId && dependencyId !== id) {
          insertForeshadowDependency.run(id, dependencyId);
        }
      }
      for (const oldNodeId of stringArray(source.evidenceNodeIds)) {
        const nodeId = nodeMap.get(oldNodeId);
        if (nodeId) insertForeshadowEvidence.run(id, nodeId, now);
      }
    }
    for (const item of bundle.documents) {
      const documentId = randomUuid();
      const oldDocumentId = required(
        stringField(item.document, "id"),
        "document id",
      );
      documentMap.set(oldDocumentId, documentId);
      const document = this.documents.insert(
        createDocument({
          id: documentId,
          projectId,
          kind: documentKind(stringField(item.document, "kind")),
          title: stringField(item.document, "title") ?? "未命名稿件",
          outlineNodeId:
            nodeMap.get(stringField(item.document, "outlineNodeId") ?? "") ??
            null,
          now,
        }),
      );
      const orderedVersions = [...item.versions].reverse();
      for (const version of orderedVersions) {
        const appended = this.documents.appendVersion(projectId, document.id, {
          id: randomUuid(),
          content: stringField(version, "content") ?? "",
          source: `bundle:${stringField(version, "source") ?? "restore"}`,
          now,
        });
        const oldVersionId = stringField(version, "id");
        if (oldVersionId) versionMap.set(oldVersionId, appended.id);
        restoredVersions += 1;
      }
      if (item.draft) {
        const draftBaseVersionId =
          versionMap.get(stringField(item.draft, "baseVersionId") ?? "") ??
          null;
        // 在版本追加之后写回草稿；appendVersion 会清掉过期草稿，因此草稿
        // 恢复必须放在版本循环之后。
        this.documents.upsertDraft(projectId, documentId, {
          baseVersionId: draftBaseVersionId,
          content: stringField(item.draft, "content") ?? "",
          now,
        });
        restoredDrafts += 1;
      }
      if (stringField(item.document, "archivedAt")) {
        const current = this.documents.get(projectId, documentId)!;
        this.documents.setArchived(
          projectId,
          documentId,
          true,
          current.updatedAt,
          now,
        );
      }
    }
    for (const source of bundle.creativePresets) {
      const oldPresetId = stringField(source, "id");
      if (!oldPresetId) continue;
      const created = planning.insertPreset({
        id: randomUuid(),
        projectId,
        name: stringField(source, "name") ?? "恢复的创作预设",
        genre: stringField(source, "genre"),
        audience: stringField(source, "audience"),
        promise: stringField(source, "promise"),
        pacing: presetPacing(stringField(source, "pacing")),
        targetWordsPerChapter: Math.max(
          1,
          Math.min(
            100_000,
            numberField(source, "targetWordsPerChapter") || 2_500,
          ),
        ),
        updateCadence: stringField(source, "updateCadence"),
        boundaries: stringArray(source.boundaries),
        checkRules: stringArray(source.checkRules),
        defaultTemplate: stringField(source, "defaultTemplate"),
        status: source.status === "archived" ? "archived" : "active",
        now,
      });
      creativePresetMap.set(oldPresetId, created.id);
      this.database.raw
        .prepare(
          `UPDATE creative_presets
           SET version = ?, created_at = ?, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .run(
          Math.max(0, numberField(source, "version")),
          stringField(source, "createdAt") ?? now,
          stringField(source, "updatedAt") ?? now,
          created.id,
          projectId,
        );
      restoredCreativePresets += 1;
    }
    for (const source of bundle.creativePresetHistory) {
      const presetId = creativePresetMap.get(
        stringField(source, "presetId") ?? "",
      );
      if (!presetId) continue;
      this.database.raw
        .prepare(
          `INSERT INTO creative_preset_history(
            id, preset_id, preset_version, snapshot_json, created_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          randomUuid(),
          presetId,
          Math.max(0, numberField(source, "presetVersion")),
          JSON.stringify(objectField(source, "snapshot")),
          stringField(source, "createdAt") ?? now,
        );
      restoredCreativePresetHistory += 1;
    }
    if (bundle.bookProfile) {
      const profile = bundle.bookProfile;
      const presetId = stringField(profile, "presetId");
      const validPresetId = presetId
        ? (creativePresetMap.get(presetId) ??
          (planning.getPreset(presetId) ? presetId : null))
        : null;
      const targetWords =
        typeof profile.targetWordsPerChapter === "number" &&
        profile.targetWordsPerChapter > 0
          ? Math.floor(profile.targetWordsPerChapter)
          : null;
      planning.ensureBookProfile(projectId, now, {
        presetId: validPresetId,
        genre: stringField(profile, "genre"),
        audience: stringField(profile, "audience"),
        promise: stringField(profile, "promise"),
        tone: stringField(profile, "tone"),
        endingDirection: stringField(profile, "endingDirection"),
        pov: stringField(profile, "pov"),
        updateCadence: stringField(profile, "updateCadence"),
        targetWordsPerChapter: targetWords,
        boundaries: stringArray(profile.boundaries),
        worldRules: stringArray(profile.worldRules),
        arcNotes: stringArray(profile.arcNotes),
      });
      this.database.raw
        .prepare(
          "UPDATE book_profiles SET version = ?, updated_at = ? WHERE project_id = ?",
        )
        .run(
          Math.max(0, numberField(profile, "version")),
          stringField(profile, "updatedAt") ?? now,
          projectId,
        );
    }
    for (const source of bundle.bookProfileHistory) {
      const snapshot = objectField(source, "snapshot");
      this.database.raw
        .prepare(
          `INSERT INTO book_profile_history(
            id, project_id, profile_version, snapshot_json, created_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          randomUuid(),
          projectId,
          Math.max(0, numberField(source, "profileVersion")),
          JSON.stringify(snapshot),
          stringField(source, "createdAt") ?? now,
        );
      restoredBookProfileHistory += 1;
    }
    if (bundle.signingSprint) {
      const sourceWorkflow = bundle.signingSprint.workflow;
      const restoredWorkflow = SigningSprintWorkflowSchema.safeParse({
        ...sourceWorkflow,
        id: randomUuid(),
        projectId,
      });
      if (restoredWorkflow.success) {
        const workflow = signingSprintRepository.insertWorkflow(
          restoredWorkflow.data,
        );
        restoredSigningSprintWorkflows += 1;
        for (const sourceCandidate of bundle.signingSprint.candidates) {
          const restoredCandidate = SigningSprintCandidateSchema.safeParse({
            ...sourceCandidate,
            id: randomUuid(),
            workflowId: workflow.id,
            projectId,
            provenance: {
              ...objectField(sourceCandidate, "provenance"),
              // Runs are intentionally not restored as executable history.
              runId: null,
            },
          });
          if (!restoredCandidate.success) continue;
          signingSprintRepository.insertCandidate(restoredCandidate.data);
          restoredSigningSprintCandidates += 1;
        }
      }
    }
    for (const source of bundle.readerPromises) {
      const oldId = required(stringField(source, "id"), "reader promise id");
      const id = randomUuid();
      readerPromiseMap.set(oldId, id);
      const openedChapterId = stringField(source, "openedChapterId");
      const targetChapterId = stringField(source, "targetChapterId");
      const paidOffChapterId = stringField(source, "paidOffChapterId");
      const lastAdvancedChapterId = stringField(
        source,
        "lastAdvancedChapterId",
      );
      this.database.raw
        .prepare(
          `INSERT INTO reader_promises(
            id, project_id, title, description, status, opened_chapter_id,
            opened_chapter_index, target_chapter_id, paid_off_chapter_id,
            last_advanced_chapter_id, last_advanced_chapter_index,
            advance_count, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          projectId,
          stringField(source, "title") ?? "恢复的 Reader Promise",
          stringField(source, "description"),
          readerPromiseStatus(stringField(source, "status")),
          openedChapterId ? (nodeMap.get(openedChapterId) ?? null) : null,
          Math.max(
            1,
            Math.floor(numberField(source, "openedChapterIndex") || 1),
          ),
          targetChapterId ? (nodeMap.get(targetChapterId) ?? null) : null,
          paidOffChapterId ? (nodeMap.get(paidOffChapterId) ?? null) : null,
          lastAdvancedChapterId
            ? (nodeMap.get(lastAdvancedChapterId) ?? null)
            : null,
          nullablePositiveNumber(source.lastAdvancedChapterIndex),
          Math.max(0, Math.floor(numberField(source, "advanceCount"))),
          Math.max(0, Math.floor(numberField(source, "version"))),
          stringField(source, "createdAt") ?? now,
          stringField(source, "updatedAt") ?? now,
        );
      restoredReaderPromises += 1;
    }
    for (const source of bundle.readerPromiseEvents) {
      const promiseId = readerPromiseMap.get(
        stringField(source, "promiseId") ?? "",
      );
      if (!promiseId) continue;
      const oldChapterId = stringField(source, "chapterId");
      this.database.raw
        .prepare(
          `INSERT INTO reader_promise_events(
            id, project_id, promise_id, action, chapter_id, chapter_index,
            note, source, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUuid(),
          projectId,
          promiseId,
          readerPromiseAction(stringField(source, "action")),
          oldChapterId ? (nodeMap.get(oldChapterId) ?? null) : null,
          Math.max(1, Math.floor(numberField(source, "chapterIndex") || 1)),
          stringField(source, "note"),
          readerPromiseEventSource(stringField(source, "source")),
          stringField(source, "createdAt") ?? now,
        );
      restoredReaderPromiseEvents += 1;
    }
    for (const source of bundle.chapterBriefs) {
      const outlineNodeId = nodeMap.get(
        stringField(source, "outlineNodeId") ?? "",
      );
      if (!outlineNodeId) continue;
      const brief = planning.upsertChapterBrief(projectId, outlineNodeId, {
        purpose: chapterPurpose(stringField(source, "purpose")),
        secondaryPurposes: chapterPurposeArray(source.secondaryPurposes),
        goal: stringField(source, "goal"),
        readerExpectation: stringField(source, "readerExpectation"),
        emotionTarget: chapterEmotionTarget(
          stringField(source, "emotionTarget"),
        ),
        emotionCurve: chapterEmotionCurve(source.emotionCurve),
        conflict: stringField(source, "conflict"),
        readerPromiseOperations: readerPromiseOperations(
          source.readerPromiseOperations,
        ).map((operation) => ({
          ...operation,
          promiseId: operation.promiseId
            ? (readerPromiseMap.get(operation.promiseId) ?? null)
            : null,
        })),
        payoff: stringField(source, "payoff"),
        payoffStrength: boundedNumber(source.payoffStrength, 0, 5, 0),
        hook: stringField(source, "hook"),
        hookType: chapterHookType(stringField(source, "hookType")),
        hookStrength: boundedNumber(source.hookStrength, 0, 5, 0),
        informationGain: boundedNumber(source.informationGain, 0, 5, 0),
        endingPull: boundedNumber(source.endingPull, 0, 5, 0),
        sceneStructure: chapterSceneStructure(source.sceneStructure),
        characterIds: stringArray(source.characterIds)
          .map((id) => entityMap.get(id))
          .filter((id): id is string => Boolean(id)),
        foreshadowIds: stringArray(source.foreshadowIds)
          .map((id) => foreshadowMap.get(id))
          .filter((id): id is string => Boolean(id)),
        timelineIds: stringArray(source.timelineIds)
          .map((id) => timelineMap.get(id))
          .filter((id): id is string => Boolean(id)),
        targetWords:
          typeof source.targetWords === "number" && source.targetWords > 0
            ? Math.floor(source.targetWords)
            : null,
        pacing: ["slow", "steady", "fast", "cliffhanger"].includes(
          stringField(source, "pacing") ?? "",
        )
          ? (stringField(source, "pacing") as
              "slow" | "steady" | "fast" | "cliffhanger")
          : "steady",
        expectedVersion: null,
        now,
      });
      const sourceVersionId = versionMap.get(
        stringField(source, "documentVersionId") ?? "",
      );
      this.database.raw
        .prepare(
          "UPDATE chapter_briefs SET document_version_id = ?, version = ?, created_at = ?, updated_at = ? WHERE id = ? AND project_id = ?",
        )
        .run(
          sourceVersionId ?? brief.documentVersionId,
          Math.max(0, numberField(source, "version")),
          stringField(source, "createdAt") ?? now,
          stringField(source, "updatedAt") ?? now,
          brief.id,
          projectId,
        );
      restoredChapterBriefs += 1;
    }
    for (const source of bundle.chapterBriefHistory) {
      const outlineNodeId = nodeMap.get(
        stringField(source, "outlineNodeId") ?? "",
      );
      if (!outlineNodeId) continue;
      const snapshot = objectField(source, "snapshot");
      const remappedSnapshot = {
        ...snapshot,
        purpose: chapterPurpose(stringField(snapshot, "purpose")),
        secondaryPurposes: chapterPurposeArray(snapshot.secondaryPurposes),
        readerExpectation: stringField(snapshot, "readerExpectation"),
        emotionTarget: chapterEmotionTarget(
          stringField(snapshot, "emotionTarget"),
        ),
        emotionCurve: chapterEmotionCurve(snapshot.emotionCurve),
        readerPromiseOperations: readerPromiseOperations(
          snapshot.readerPromiseOperations,
        ).map((operation) => ({
          ...operation,
          promiseId: operation.promiseId
            ? (readerPromiseMap.get(operation.promiseId) ?? null)
            : null,
        })),
        payoffStrength: boundedNumber(snapshot.payoffStrength, 0, 5, 0),
        hookType: chapterHookType(stringField(snapshot, "hookType")),
        hookStrength: boundedNumber(snapshot.hookStrength, 0, 5, 0),
        informationGain: boundedNumber(snapshot.informationGain, 0, 5, 0),
        endingPull: boundedNumber(snapshot.endingPull, 0, 5, 0),
        sceneStructure: chapterSceneStructure(snapshot.sceneStructure),
        characterIds: stringArray(snapshot.characterIds)
          .map((id) => entityMap.get(id))
          .filter((id): id is string => Boolean(id)),
        foreshadowIds: stringArray(snapshot.foreshadowIds)
          .map((id) => foreshadowMap.get(id))
          .filter((id): id is string => Boolean(id)),
        timelineIds: stringArray(snapshot.timelineIds)
          .map((id) => timelineMap.get(id))
          .filter((id): id is string => Boolean(id)),
      };
      this.database.raw
        .prepare(
          `INSERT INTO chapter_brief_history(
            id, project_id, outline_node_id, brief_version, snapshot_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUuid(),
          projectId,
          outlineNodeId,
          Math.max(0, numberField(source, "briefVersion")),
          JSON.stringify(remappedSnapshot),
          stringField(source, "createdAt") ?? now,
        );
      restoredChapterBriefHistory += 1;
    }
    const candidateRepository = new SqliteWebNovelCandidateRepository(
      this.database,
    );
    for (const source of bundle.webNovelCandidates) {
      const sourceSet = source.set;
      const kind = stringField(sourceSet, "kind");
      const oldRunId = stringField(sourceSet, "runId");
      const oldStepId = stringField(sourceSet, "stepId");
      if (!oldRunId || !oldStepId || (kind !== "profile" && kind !== "brief"))
        continue;
      const oldPairKey = `${oldRunId}:${oldStepId}`;
      let runPair = candidateRunMap.get(oldPairKey);
      const candidateSetId = randomUuid();
      const sourceCreatedAt = stringField(sourceSet, "createdAt") ?? now;
      if (!runPair) {
        const runId = randomUuid();
        const stepId = randomUuid();
        runPair = { runId, stepId };
        candidateRunMap.set(oldPairKey, runPair);
        this.database.raw
          .prepare(
            `INSERT INTO runs(
              id, project_id, recipe, mode, status, policy_json, current_step_id,
              started_at, finished_at, created_at, updated_at, recipe_version,
              target_outline_node_id, budget_used_json,
              revision_cycle, pause_requested, cancel_requested, lease_owner,
              lease_expires_at, version
            ) VALUES (?, ?, ?, 'manual', 'completed', ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, 0, 0, NULL, NULL, 0)`,
          )
          .run(
            runId,
            projectId,
            "web-novel-candidate-restore",
            JSON.stringify({ restored: true, sourceRunId: oldRunId }),
            stepId,
            sourceCreatedAt,
            sourceCreatedAt,
            sourceCreatedAt,
            sourceCreatedAt,
            nodeMap.get(stringField(sourceSet, "outlineNodeId") ?? "") ?? null,
            JSON.stringify({
              inputTokens: 0,
              outputTokens: 0,
              calls: 0,
              costUsd: 0,
              wallTimeMs: 0,
            }),
          );
        this.database.raw
          .prepare(
            `INSERT INTO run_steps(
              id, run_id, ordinal, kind, status, idempotency_key, input_hash,
              output_artifact_json, error_json, attempt, started_at, finished_at,
              created_at, cycle, max_attempts, output_hash, updated_at
            ) VALUES (?, ?, 0, 'webnovel.stage', 'succeeded', ?, NULL, ?, NULL, 1, ?, ?, ?, 0, 1, NULL, ?)`,
          )
          .run(
            stepId,
            runId,
            `bundle-restore:${oldStepId}`,
            JSON.stringify({ restored: true }),
            sourceCreatedAt,
            sourceCreatedAt,
            sourceCreatedAt,
            sourceCreatedAt,
          );
        this.database.raw
          .prepare(
            `INSERT INTO run_jobs(
              run_id, status, priority, available_at, lease_owner,
              lease_expires_at, last_error_json, created_at, updated_at
            ) VALUES (?, 'finished', 0, ?, NULL, NULL, NULL, ?, ?)`,
          )
          .run(runId, sourceCreatedAt, sourceCreatedAt, sourceCreatedAt);
      }
      const sourceItems = recordArray(source.items);
      const itemInputs = sourceItems.map((item) => ({
        id: randomUuid(),
        title: stringField(item, "title") ?? "恢复的候选项",
        rationale: stringField(item, "rationale") ?? "从作品备份恢复",
        impact: stringArray(item.impact),
        before:
          item.before &&
          typeof item.before === "object" &&
          !Array.isArray(item.before)
            ? (item.before as Record<string, unknown>)
            : null,
        after: objectField(item, "after"),
        evidence: recordArray(item.evidence) as never[],
        requiresLockedConfirmation: item.requiresLockedConfirmation === true,
      }));
      const staged = candidateRepository.stageCandidateSet({
        id: candidateSetId,
        projectId,
        runId: runPair.runId,
        stepId: runPair.stepId,
        kind,
        outlineNodeId:
          nodeMap.get(stringField(sourceSet, "outlineNodeId") ?? "") ?? null,
        instruction: stringField(sourceSet, "instruction") ?? "恢复的候选任务",
        summary: stringField(sourceSet, "summary") ?? "从作品备份恢复",
        sourceProfileVersion:
          typeof sourceSet.sourceProfileVersion === "number"
            ? sourceSet.sourceProfileVersion
            : null,
        sourceBriefVersion:
          typeof sourceSet.sourceBriefVersion === "number"
            ? sourceSet.sourceBriefVersion
            : null,
        sourceDocumentId:
          documentMap.get(stringField(sourceSet, "sourceDocumentId") ?? "") ??
          null,
        sourceDocumentVersionId:
          versionMap.get(
            stringField(sourceSet, "sourceDocumentVersionId") ?? "",
          ) ?? null,
        sourceOutlineUpdatedAt: stringField(
          sourceSet,
          "sourceOutlineUpdatedAt",
        ),
        baseFingerprint:
          stringField(sourceSet, "baseFingerprint") ?? "restored",
        items: itemInputs,
        now: sourceCreatedAt,
      });
      for (const [index, sourceItem] of sourceItems.entries()) {
        const itemId = staged.items[index]?.id;
        const decision =
          sourceItem.decision && typeof sourceItem.decision === "object"
            ? (sourceItem.decision as Record<string, unknown>)
            : null;
        const action = stringField(decision ?? undefined, "action");
        if (!itemId || (action !== "apply" && action !== "reject")) continue;
        this.database.raw
          .prepare(
            `UPDATE web_novel_candidate_items
             SET decision_action = ?, decision_result_json = ?, decided_at = ?
             WHERE id = ? AND set_id = ?`,
          )
          .run(
            action,
            decision?.result && typeof decision.result === "object"
              ? JSON.stringify(decision.result)
              : null,
            stringField(decision ?? undefined, "decidedAt") ?? sourceCreatedAt,
            itemId,
            candidateSetId,
          );
        restoredWebNovelCandidateItems += 1;
      }
      this.database.raw
        .prepare(
          `UPDATE web_novel_candidate_sets
           SET status = ?, decided_at = ? WHERE id = ?`,
        )
        .run(
          ["candidate", "partially_applied", "applied", "rejected"].includes(
            stringField(sourceSet, "status") ?? "",
          )
            ? stringField(sourceSet, "status")
            : "candidate",
          stringField(sourceSet, "decidedAt"),
          candidateSetId,
        );
      restoredWebNovelCandidateSets += 1;
    }
    for (const source of bundle.openingCheckReports) {
      const oldReportId = stringField(source, "id");
      const reportId = randomUuid();
      if (oldReportId) openingCheckReportMap.set(oldReportId, reportId);
      const sourceVersions = recordArray(source.sourceVersions)
        .map((entry) => ({
          chapterId: nodeMap.get(stringField(entry, "chapterId") ?? "") ?? "",
          documentId:
            documentMap.get(stringField(entry, "documentId") ?? "") ?? null,
          documentVersionId:
            versionMap.get(stringField(entry, "documentVersionId") ?? "") ??
            null,
        }))
        .filter((entry) => entry.chapterId);
      const issues = recordArray(source.issues).map((entry) => {
        const oldIssueId = stringField(entry, "id");
        const issueId = randomUuid();
        if (oldIssueId) issueMap.set(oldIssueId, issueId);
        return {
          ...entry,
          id: issueId,
          targetChapterId:
            nodeMap.get(stringField(entry, "targetChapterId") ?? "") ?? null,
          targetDocumentId:
            documentMap.get(stringField(entry, "targetDocumentId") ?? "") ??
            null,
          targetDocumentVersionId:
            versionMap.get(
              stringField(entry, "targetDocumentVersionId") ?? "",
            ) ?? null,
        };
      });
      const report = {
        ...source,
        id: reportId,
        projectId,
        scope: "opening-three",
        chapterIds: stringArray(source.chapterIds)
          .map((id) => nodeMap.get(id))
          .filter((id): id is string => Boolean(id)),
        sourceVersions,
        issues,
        generatedAt: stringField(source, "generatedAt") ?? now,
      };
      planning.insertOpeningCheckReport(
        projectId,
        report,
        stringField(source, "createdAt") ?? now,
      );
      restoredOpeningCheckReports += 1;
    }
    for (const source of bundle.openingCheckAudits) {
      const reportId = openingCheckReportMap.get(
        stringField(source, "reportId") ?? "",
      );
      planning.insertOpeningCheckAudit({
        projectId,
        reportId: reportId ?? null,
        issueId:
          issueMap.get(stringField(source, "issueId") ?? "") ??
          stringField(source, "issueId") ??
          null,
        eventType:
          stringField(source, "eventType") === "candidate_decided"
            ? "candidate_decided"
            : stringField(source, "eventType") === "issue_decided"
              ? "issue_decided"
              : "report_generated",
        action: stringField(source, "action") ?? "restored",
        before: objectField(source, "before"),
        after: objectField(source, "after"),
        createdAt: stringField(source, "createdAt") ?? now,
      });
      restoredOpeningCheckAudits += 1;
    }
    for (const source of bundle.exportBatches) {
      const oldId = stringField(source, "id");
      if (!oldId) continue;
      const format = stringField(source, "format");
      if (
        !["markdown", "text", "docx", "epub", "narrative-bundle"].includes(
          format ?? "",
        )
      )
        continue;
      const restored = exportBatches.insert(
        projectId,
        {
          format: format as
            "markdown" | "text" | "docx" | "epub" | "narrative-bundle",
          status:
            stringField(source, "status") === "failed" ? "failed" : "completed",
          versionMode:
            stringField(source, "versionMode") === "history"
              ? "history"
              : "current",
          includeAnnotations: source.includeAnnotations === true,
          includeRuns: source.includeRuns === true,
          fromOutlineNodeId:
            nodeMap.get(stringField(source, "fromOutlineNodeId") ?? "") ?? null,
          toOutlineNodeId:
            nodeMap.get(stringField(source, "toOutlineNodeId") ?? "") ?? null,
          filename: stringField(source, "filename") ?? "恢复的导出文件",
          byteSize: Math.max(0, numberField(source, "byteSize")),
          contentHash: /^[a-f0-9]{64}$/u.test(
            stringField(source, "contentHash") ?? "",
          )
            ? stringField(source, "contentHash")!
            : "0".repeat(64),
          errorCode: stringField(source, "errorCode"),
          errorMessage: stringField(source, "errorMessage"),
          retryOfBatchId:
            exportBatchMap.get(stringField(source, "retryOfBatchId") ?? "") ??
            null,
        },
        stringField(source, "createdAt") ?? now,
      );
      exportBatchMap.set(oldId, restored.id);
      restoredExportBatches += 1;
    }
    for (const source of bundle.platformMetrics) {
      const platform = stringField(source, "platform");
      const chapter = stringField(source, "chapter");
      const date = stringField(source, "date");
      if (!platform || !chapter || !date || !/^\d{4}-\d{2}-\d{2}$/u.test(date))
        continue;
      const result = platformMetrics.upsert(
        projectId,
        [
          {
            platform,
            chapter,
            date,
            words: Math.max(0, numberField(source, "words")),
            views: nullableNonNegativeNumber(source.views),
            likes: nullableNonNegativeNumber(source.likes),
            comments: nullableNonNegativeNumber(source.comments),
            source: "csv",
          },
        ],
        stringField(source, "updatedAt") ?? now,
      );
      if (result.added + result.replaced > 0) restoredPlatformMetrics += 1;
    }
    for (const source of bundle.publishRecords) {
      const platform = stringField(source, "platform");
      const chapter = stringField(source, "chapter");
      const publishedAt = stringField(source, "publishedAt");
      if (
        !platform ||
        !chapter ||
        !publishedAt ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(publishedAt)
      )
        continue;
      publishRecords.insert(
        projectId,
        {
          platform,
          chapter,
          publishedAt,
          url: stringField(source, "url"),
          status: ["published", "scheduled", "draft"].includes(
            stringField(source, "status") ?? "",
          )
            ? (stringField(source, "status") as
                "published" | "scheduled" | "draft")
            : "draft",
          exportBatchId:
            exportBatchMap.get(stringField(source, "exportBatchId") ?? "") ??
            null,
        },
        stringField(source, "createdAt") ?? now,
      );
      restoredPublishRecords += 1;
    }
    if (bundle.intent) {
      this.story.upsertAuthorIntent({
        projectId,
        promise: stringField(bundle.intent, "promise"),
        themes: stringArray(bundle.intent.themes),
        audience: stringField(bundle.intent, "audience"),
        tone: stringField(bundle.intent, "tone"),
        boundaries: stringArray(bundle.intent.boundaries),
        endingDirection: stringField(bundle.intent, "endingDirection"),
        currentFocus: stringField(bundle.intent, "currentFocus"),
        lockedFields: stringArray(bundle.intent.lockedFields),
        updatedAt: now,
      });
    }
    if (bundle.compass) {
      const target = objectField(bundle.compass, "target");
      this.automation.upsertCompass({
        projectId,
        corePromise:
          stringField(bundle.compass, "corePromise") ??
          bundle.project.premise ??
          "继续兑现作品的核心承诺",
        endingDirection: stringField(bundle.compass, "endingDirection"),
        longLines: recordArray(bundle.compass.longLines).map((line) => ({
          title: stringField(line, "title") ?? "长线",
          promise: stringField(line, "promise") ?? "待推进",
          status: stringField(line, "status") ?? "active",
        })),
        themeQuestions: stringArray(bundle.compass.themeQuestions),
        target: {
          chapters: boundedNumber(
            target.chapters,
            1,
            10_000,
            AUTOMATION_DEFAULTS.targetChapters,
          ),
          wordsPerChapter: boundedNumber(
            target.wordsPerChapter,
            100,
            100_000,
            AUTOMATION_DEFAULTS.wordsPerChapter,
          ),
          volumes: boundedNumber(
            target.volumes,
            1,
            100,
            AUTOMATION_DEFAULTS.volumes,
          ),
        },
        constraints: stringArray(bundle.compass.constraints),
        version: 1,
        updatedAt: now,
      });
    }
    for (const source of bundle.personas) {
      const oldPersonaId = stringField(source, "id");
      const personaId = randomUuid();
      if (oldPersonaId) personaMap.set(oldPersonaId, personaId);
      this.creative.insertPersona({
        id: personaId,
        projectId,
        kind: personaKind(stringField(source, "kind")),
        entityId: entityMap.get(stringField(source, "entityId") ?? "") ?? null,
        name: stringField(source, "name") ?? "未命名 Persona",
        description: stringField(source, "description"),
        instructions: stringField(source, "instructions") ?? "",
        voice: objectField(source, "voice"),
        status:
          stringField(source, "status") === "retired" ? "retired" : "active",
        createdAt: now,
        updatedAt: now,
        version: 0,
      });
    }
    for (const source of bundle.styles) {
      this.delivery.insertStyleProfile({
        id: randomUuid(),
        projectId,
        name: stringField(source, "name") ?? "恢复的风格",
        description: stringField(source, "description"),
        rules: stringArray(source.rules),
        examples: stringArray(source.examples),
        negativeRules: stringArray(source.negativeRules),
        source: "bundle-restore",
        active: source.active === true,
        status:
          stringField(source, "status") === "retired" ? "retired" : "active",
        createdAt: now,
        updatedAt: now,
        version: 0,
      });
    }
    for (const source of bundle.skills) {
      this.delivery.insertWritingSkill({
        id: randomUuid(),
        projectId,
        name: stringField(source, "name") ?? "恢复的写作技法",
        description: stringField(source, "description"),
        instructions: stringField(source, "instructions") ?? "保持叙事一致",
        scopes: skillScopes(source.scopes),
        priority: boundedNumber(source.priority, 0, 100, 50),
        enabled: source.enabled !== false,
        source: "bundle-restore",
        createdAt: now,
        updatedAt: now,
        version: 0,
      });
    }
    this.projects.update({
      ...project,
      phase: projectPhase(bundle.project.phase),
      updatedAt: now,
    });
    if (bundle.cover) {
      const coverBytes = decodeBase64(bundle.cover.dataBase64);
      if (
        coverBytes.length !== bundle.cover.byteSize ||
        hash(coverBytes) !== bundle.cover.imageHash
      ) {
        throw new DeliveryServiceError(
          "backup.cover.integrity",
          "Cover data verification failed; the restore was not performed",
        );
      }
      new SqliteProjectCoverRepository(this.database).upsert({
        projectId,
        mediaType: bundle.cover.mediaType,
        data: new Uint8Array(coverBytes),
        width: bundle.cover.width,
        height: bundle.cover.height,
        crop: bundle.cover.crop,
        now,
      });
      restoredCover = 1;
    }
    for (const source of bundle.annotations) {
      const documentId = documentMap.get(
        stringField(source, "documentId") ?? "",
      );
      const versionId = versionMap.get(stringField(source, "versionId") ?? "");
      if (!documentId || !versionId) continue;
      this.database.raw
        .prepare(
          `INSERT INTO document_comments(
            id, project_id, document_id, version_id, start_offset, end_offset,
            quote, body, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUuid(),
          projectId,
          documentId,
          versionId,
          numberField(source, "startOffset"),
          Math.max(
            numberField(source, "startOffset") + 1,
            numberField(source, "endOffset"),
          ),
          stringField(source, "quote") ?? "",
          stringField(source, "body") ?? "",
          stringField(source, "status") === "resolved" ? "resolved" : "open",
          now,
          now,
        );
      restoredAnnotations += 1;
    }
    for (const item of bundle.reviews) {
      // A backup intentionally does not restore the original execution graph.
      // Review reports still need valid run/step parents, however, so create a
      // completed, inert pair for each distinct historical lineage instead of
      // inserting dangling `bundle-restored:*` foreign-key values.
      const oldRunId = stringField(item.report, "runId") ?? "unknown";
      const oldStepId = stringField(item.report, "stepId") ?? "unknown";
      const oldPairKey = `${oldRunId}:${oldStepId}`;
      let runPair = reviewRunMap.get(oldPairKey);
      const sourceCreatedAt = stringField(item.report, "createdAt") ?? now;
      if (!runPair) {
        const runId = randomUuid();
        const stepId = randomUuid();
        runPair = { runId, stepId };
        reviewRunMap.set(oldPairKey, runPair);
        this.database.raw
          .prepare(
            `INSERT INTO runs(
              id, project_id, recipe, mode, status, policy_json, current_step_id,
              started_at, finished_at, created_at, updated_at, recipe_version,
              target_outline_node_id, budget_used_json,
              revision_cycle, pause_requested, cancel_requested, lease_owner,
              lease_expires_at, version
            ) VALUES (?, ?, ?, 'manual', 'completed', ?, ?, ?, ?, ?, ?, 1, NULL, ?, 0, 0, 0, NULL, NULL, 0)`,
          )
          .run(
            runId,
            projectId,
            "review-report-restore",
            JSON.stringify({
              restored: true,
              sourceRunId: oldRunId,
              sourceStepId: oldStepId,
            }),
            stepId,
            sourceCreatedAt,
            sourceCreatedAt,
            sourceCreatedAt,
            sourceCreatedAt,
            JSON.stringify({
              inputTokens: 0,
              outputTokens: 0,
              calls: 0,
              costUsd: 0,
              wallTimeMs: 0,
            }),
          );
        this.database.raw
          .prepare(
            `INSERT INTO run_steps(
              id, run_id, ordinal, kind, status, idempotency_key, input_hash,
              output_artifact_json, error_json, attempt, started_at, finished_at,
              created_at, cycle, max_attempts, output_hash, updated_at
            ) VALUES (?, ?, 0, 'review.restore', 'succeeded', ?, NULL, ?, NULL, 1, ?, ?, ?, 0, 1, NULL, ?)`,
          )
          .run(
            stepId,
            runId,
            `bundle-restore:${oldStepId}`,
            JSON.stringify({ restored: true }),
            sourceCreatedAt,
            sourceCreatedAt,
            sourceCreatedAt,
            sourceCreatedAt,
          );
        this.database.raw
          .prepare(
            `INSERT INTO run_jobs(
              run_id, status, priority, available_at, lease_owner,
              lease_expires_at, last_error_json, created_at, updated_at
            ) VALUES (?, 'finished', 0, ?, NULL, NULL, NULL, ?, ?)`,
          )
          .run(runId, sourceCreatedAt, sourceCreatedAt, sourceCreatedAt);
      }
      const reportId = randomUuid();
      this.database.raw
        .prepare(
          `INSERT INTO review_reports(
            id, project_id, run_id, step_id, document_version_id, verdict,
            summary, score_json, reviewed_content, reviewed_content_hash,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          reportId,
          projectId,
          runPair.runId,
          runPair.stepId,
          versionMap.get(stringField(item.report, "documentVersionId") ?? "") ??
            null,
          ["pass", "revise", "block"].includes(
            stringField(item.report, "verdict") ?? "",
          )
            ? stringField(item.report, "verdict")
            : "revise",
          stringField(item.report, "summary") ?? "",
          JSON.stringify(objectField(item.report, "score")),
          stringField(item.report, "reviewedContent"),
          stringField(item.report, "reviewedContentHash"),
          now,
        );
      for (const entry of item.issues) {
        const issueId = randomUuid();
        const oldIssueId = stringField(entry.issue, "id");
        if (oldIssueId) issueMap.set(oldIssueId, issueId);
        this.database.raw
          .prepare(
            `INSERT INTO review_issues(
              id, report_id, category, severity, message, evidence_json,
              suggested_direction, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            issueId,
            reportId,
            stringField(entry.issue, "category") ?? "structure",
            ["info", "minor", "major", "critical"].includes(
              stringField(entry.issue, "severity") ?? "",
            )
              ? stringField(entry.issue, "severity")
              : "info",
            stringField(entry.issue, "message") ?? "",
            JSON.stringify(
              Array.isArray(entry.issue.evidence) ? entry.issue.evidence : [],
            ),
            stringField(entry.issue, "suggestedDirection"),
            ["open", "accepted", "rejected", "resolved"].includes(
              stringField(entry.issue, "status") ?? "",
            )
              ? stringField(entry.issue, "status")
              : "open",
            now,
          );
        restoredReviewIssues += 1;
        for (const action of entry.actions) {
          this.database.raw
            .prepare(
              `INSERT INTO review_issue_actions(
                id, issue_id, action, note, prior_status, resulting_status,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              randomUuid(),
              issueId,
              [
                "accept",
                "reject",
                "false_positive",
                "intentional_keep",
              ].includes(stringField(action, "action") ?? "")
                ? stringField(action, "action")
                : "accept",
              stringField(action, "note"),
              stringField(action, "priorStatus") ?? "open",
              stringField(action, "resultingStatus") ?? "accepted",
              now,
            );
        }
      }
    }
    for (const item of bundle.cocreate) {
      const sessionId = randomUuid();
      const sessionBranchMap = new Map<string, string>();
      const turnMap = new Map<string, string>();
      this.database.raw
        .prepare(
          `INSERT INTO cocreate_sessions(
            id, project_id, title, status, speaker_policy,
            active_branch_id, target_outline_node_id, author_persona_id,
            director_note, context_turns, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 0)`,
        )
        .run(
          sessionId,
          projectId,
          stringField(item.session, "title") ?? "恢复的共创会话",
          ["active", "paused", "archived"].includes(
            stringField(item.session, "status") ?? "",
          )
            ? stringField(item.session, "status")
            : "archived",
          ["manual", "round_robin", "auto"].includes(
            stringField(item.session, "speakerPolicy") ?? "",
          )
            ? stringField(item.session, "speakerPolicy")
            : "manual",
          nodeMap.get(stringField(item.session, "targetOutlineNodeId") ?? "") ??
            null,
          personaMap.get(stringField(item.session, "authorPersonaId") ?? "") ??
            null,
          stringField(item.session, "directorNote"),
          Math.max(
            4,
            Math.min(200, numberField(item.session, "contextTurns") || 24),
          ),
          now,
          now,
        );
      restoredCoCreateSessions += 1;
      for (const participant of item.participants) {
        const personaId = personaMap.get(
          stringField(participant, "personaId") ?? "",
        );
        if (!personaId) continue;
        this.database.raw
          .prepare(
            `INSERT INTO cocreate_participants(
              session_id, persona_id, position, enabled, talkativeness,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            sessionId,
            personaId,
            numberField(participant, "position"),
            participant.enabled === false ? 0 : 1,
            boundedNumber(participant.talkativeness, 0, 1, 0.5),
            now,
          );
      }
      for (const branch of item.branches) {
        const branchId = randomUuid();
        const oldBranchId = stringField(branch, "id");
        if (oldBranchId) sessionBranchMap.set(oldBranchId, branchId);
        this.database.raw
          .prepare(
            `INSERT INTO story_branches(
              id, session_id, parent_branch_id, forked_from_turn_id, name,
              status, head_turn_id, created_at, updated_at
            ) VALUES (?, ?, NULL, NULL, ?, ?, NULL, ?, ?)`,
          )
          .run(
            branchId,
            sessionId,
            stringField(branch, "name") ?? "分支",
            stringField(branch, "status") === "archived"
              ? "archived"
              : "active",
            now,
            now,
          );
      }
      const orderedTurns = [...item.turns].sort(
        (a, b) => numberField(a, "ordinal") - numberField(b, "ordinal"),
      );
      for (const turn of orderedTurns) {
        const branchId = sessionBranchMap.get(
          stringField(turn, "branchId") ?? "",
        );
        if (!branchId) continue;
        const turnId = randomUuid();
        const oldTurnId = stringField(turn, "id");
        if (oldTurnId) turnMap.set(oldTurnId, turnId);
        this.database.raw
          .prepare(
            `INSERT INTO story_turns(
              id, project_id, session_id, branch_id, parent_turn_id, ordinal,
              role, persona_id, content, status, selected_swipe_id,
              source_run_id, metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
          )
          .run(
            turnId,
            projectId,
            sessionId,
            branchId,
            turnMap.get(stringField(turn, "parentTurnId") ?? "") ?? null,
            numberField(turn, "ordinal"),
            ["user", "assistant", "director", "system"].includes(
              stringField(turn, "role") ?? "",
            )
              ? stringField(turn, "role")
              : "assistant",
            personaMap.get(stringField(turn, "personaId") ?? "") ?? null,
            stringField(turn, "content") ?? "",
            ["active", "reverted", "adopted"].includes(
              stringField(turn, "status") ?? "",
            )
              ? stringField(turn, "status")
              : "active",
            JSON.stringify(objectField(turn, "metadata")),
            now,
            now,
          );
        restoredStoryTurns += 1;
        this.database.raw
          .prepare(
            "UPDATE story_branches SET head_turn_id = ?, updated_at = ? WHERE id = ?",
          )
          .run(turnId, now, branchId);
      }
      const selectedSwipeOldByTurn = new Map<string, string>();
      for (const turn of item.turns) {
        const selectedSwipeOldId = stringField(turn, "selectedSwipeId");
        if (selectedSwipeOldId) {
          selectedSwipeOldByTurn.set(
            selectedSwipeOldId,
            stringField(turn, "id") ?? "",
          );
        }
      }
      for (const swipe of item.swipes) {
        const turnId = turnMap.get(stringField(swipe, "turnId") ?? "");
        if (!turnId) continue;
        const swipeId = randomUuid();
        this.database.raw
          .prepare(
            `INSERT INTO turn_swipes(
              id, turn_id, ordinal, content, speaker_persona_id, source_run_id,
              status, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
          )
          .run(
            swipeId,
            turnId,
            numberField(swipe, "ordinal"),
            stringField(swipe, "content") ?? "",
            personaMap.get(stringField(swipe, "speakerPersonaId") ?? "") ??
              null,
            ["candidate", "selected", "rejected"].includes(
              stringField(swipe, "status") ?? "",
            )
              ? stringField(swipe, "status")
              : "candidate",
            JSON.stringify(objectField(swipe, "metadata")),
            now,
          );
        const selectingTurnOldId = selectedSwipeOldByTurn.get(
          stringField(swipe, "id") ?? "",
        );
        if (selectingTurnOldId && stringField(swipe, "status") === "selected") {
          const selectingTurnId = turnMap.get(selectingTurnOldId);
          if (selectingTurnId) {
            this.database.raw
              .prepare(
                "UPDATE story_turns SET selected_swipe_id = ?, updated_at = ? WHERE id = ?",
              )
              .run(swipeId, now, selectingTurnId);
          }
        }
      }
      for (const branch of item.branches) {
        const branchId = sessionBranchMap.get(stringField(branch, "id") ?? "");
        if (!branchId) continue;
        const parentBranchId = sessionBranchMap.get(
          stringField(branch, "parentBranchId") ?? "",
        );
        const forkedFromTurnId = turnMap.get(
          stringField(branch, "forkedFromTurnId") ?? "",
        );
        const headTurnId = turnMap.get(stringField(branch, "headTurnId") ?? "");
        this.database.raw
          .prepare(
            `UPDATE story_branches
             SET parent_branch_id = ?, forked_from_turn_id = ?,
                 head_turn_id = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            parentBranchId ?? null,
            forkedFromTurnId ?? null,
            headTurnId ?? null,
            now,
            branchId,
          );
      }
      const activeBranchOldId = stringField(item.session, "activeBranchId");
      const activeBranchId = activeBranchOldId
        ? sessionBranchMap.get(activeBranchOldId)
        : null;
      if (activeBranchId) {
        this.database.raw
          .prepare(
            "UPDATE cocreate_sessions SET active_branch_id = ?, updated_at = ? WHERE id = ?",
          )
          .run(activeBranchId, now, sessionId);
      }
    }
    for (const item of bundle.assistant) {
      const conversationId = randomUuid();
      const oldConversationId = required(
        stringField(item.conversation, "id"),
        "conversation id",
      );
      conversationMap.set(oldConversationId, conversationId);
      this.database.raw
        .prepare(
          `INSERT INTO assistant_conversations(
            id, project_id, title, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          conversationId,
          projectId,
          stringField(item.conversation, "title") ?? "助手会话",
          stringField(item.conversation, "status") === "archived"
            ? "archived"
            : "active",
          now,
          now,
        );
      for (const message of item.messages) {
        const messageId = randomUuid();
        const oldMessageId = stringField(message, "id");
        if (oldMessageId) messageMap.set(oldMessageId, messageId);
        this.database.raw
          .prepare(
            `INSERT INTO assistant_messages(
              id, conversation_id, role, content, context_json, source_run_id,
              reply_to_message_id, created_at
            ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
          )
          .run(
            messageId,
            conversationId,
            ["user", "assistant", "system"].includes(
              stringField(message, "role") ?? "",
            )
              ? stringField(message, "role")
              : "assistant",
            stringField(message, "content") ?? "（恢复的消息）",
            message.context ? JSON.stringify(message.context) : null,
            now,
          );
        restoredMessages += 1;
      }
      for (const activity of item.activities) {
        const activityId = randomUuid();
        const oldActivityId = stringField(activity, "id");
        if (oldActivityId) activityMap.set(oldActivityId, activityId);
        this.database.raw
          .prepare(
            `INSERT INTO assistant_activities(
              id, conversation_id, message_id, kind, tool_name, status, goal,
              input_json, result_json, error_json, source_type, source_id,
              origin_json, execution_mode, skill_id, phase_key, artifacts_json,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?)`,
          )
          .run(
            activityId,
            conversationId,
            messageMap.get(stringField(activity, "messageId") ?? "") ?? null,
            ["tool_proposal", "tool_execution", "long_goal"].includes(
              stringField(activity, "kind") ?? "",
            )
              ? stringField(activity, "kind")
              : "tool_execution",
            [
              "story.inspect",
              "review.inspect",
              "foundation.start",
              "chapter.start",
              "autopilot.start",
              "outline.plan.start",
              "canon.candidate.start",
              "selection.edit.start",
              "long_goal.start",
              "task.control",
            ].includes(stringField(activity, "toolName") ?? "")
              ? stringField(activity, "toolName")
              : "story.inspect",
            [
              "proposed",
              "running",
              "completed",
              "failed",
              "cancelled",
              "rejected",
            ].includes(stringField(activity, "status") ?? "")
              ? stringField(activity, "status")
              : "completed",
            stringField(activity, "goal") ?? "恢复的工作活动",
            JSON.stringify(objectField(activity, "input")),
            activity.result ? JSON.stringify(activity.result) : null,
            activity.error ? JSON.stringify(activity.error) : null,
            activity.origin ? JSON.stringify(activity.origin) : null,
            ["auto", "confirm"].includes(
              stringField(activity, "executionMode") ?? "",
            )
              ? stringField(activity, "executionMode")
              : null,
            stringField(activity, "phaseKey"),
            activity.artifacts ? JSON.stringify(activity.artifacts) : null,
            now,
            now,
          );
        restoredActivities += 1;
      }
    }
    for (const goal of bundle.longGoals) {
      const conversationId = conversationMap.get(
        stringField(goal, "conversationId") ?? "",
      );
      const activityId = activityMap.get(stringField(goal, "activityId") ?? "");
      if (!conversationId || !activityId) continue;
      const restoredStatus = stringField(goal, "status");
      this.database.raw
        .prepare(
          `INSERT INTO assistant_long_goals(
            id, project_id, conversation_id, activity_id, title,
            target_chapters, phase, status, baseline_hash, session_id,
            foundation_run_id, outline_session_id, last_error_json,
            created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, 0)`,
        )
        .run(
          randomUuid(),
          projectId,
          conversationId,
          activityId,
          stringField(goal, "title") ?? "恢复的长期任务",
          Math.max(1, Math.min(500, numberField(goal, "targetChapters") || 1)),
          ["foundation", "outline", "writing", "done"].includes(
            stringField(goal, "phase") ?? "",
          )
            ? stringField(goal, "phase")
            : "done",
          ["completed", "failed", "cancelled"].includes(restoredStatus ?? "")
            ? restoredStatus
            : "cancelled",
          stringField(goal, "baselineHash") ?? "",
          goal.lastError ? JSON.stringify(goal.lastError) : null,
          now,
          now,
        );
      restoredLongGoals += 1;
    }
    const counts: BundleCounts = BundleCountsSchema.parse({
      outline: nodeMap.size,
      entities: entityMap.size,
      facts: restoredFacts,
      relationships: restoredRelationships,
      timeline: restoredTimeline,
      foreshadows: restoredForeshadows,
      documents: documentMap.size,
      versions: restoredVersions,
      drafts: restoredDrafts,
      personas: personaMap.size,
      styles: bundle.styles.length,
      skills: bundle.skills.length,
      annotations: restoredAnnotations,
      cover: restoredCover,
      cocreateSessions: restoredCoCreateSessions,
      storyTurns: restoredStoryTurns,
      reviews: bundle.reviews.length,
      reviewIssues: restoredReviewIssues,
      assistantConversations: conversationMap.size,
      assistantMessages: restoredMessages,
      assistantActivities: restoredActivities,
      assistantLongGoals: restoredLongGoals,
      runs: 0,
      chapterBriefs: restoredChapterBriefs,
      chapterBriefHistory: restoredChapterBriefHistory,
      creativePresets: restoredCreativePresets,
      creativePresetHistory: restoredCreativePresetHistory,
      bookProfileHistory: restoredBookProfileHistory,
      platformMetrics: restoredPlatformMetrics,
      publishRecords: restoredPublishRecords,
      exportBatches: restoredExportBatches,
      openingCheckReports: restoredOpeningCheckReports,
      openingCheckAudits: restoredOpeningCheckAudits,
      webNovelCandidateSets: restoredWebNovelCandidateSets,
      webNovelCandidateItems: restoredWebNovelCandidateItems,
      readerPromises: restoredReaderPromises,
      readerPromiseEvents: restoredReaderPromiseEvents,
      signingSprintWorkflows: restoredSigningSprintWorkflows,
      signingSprintCandidates: restoredSigningSprintCandidates,
    });
    return { projectId, counts };
  }
}

export class DeliveryServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DeliveryServiceError";
  }
}

/** 给导入失败补充稳定分类与作者下一步动作，保持原错误码兼容。 */
export function deliveryErrorDetails(code: string):
  | {
      failureKind:
        | "size"
        | "encoding"
        | "container"
        | "structure"
        | "empty"
        | "hash"
        | "unknown";
      repairAction:
        | "choose_smaller_file"
        | "export_utf8"
        | "repair_container"
        | "check_manifest"
        | "choose_non_empty_file"
        | "retry_upload"
        | "choose_supported_file";
      retryable: boolean;
    }
  | undefined {
  if (!code.startsWith("import.")) return undefined;
  if (
    code.endsWith("size.invalid") ||
    code.endsWith("entry_limit") ||
    code.endsWith("expansion_limit") ||
    code.endsWith("content_limit") ||
    code.endsWith("page_too_large") ||
    code.endsWith("document_too_large")
  ) {
    return {
      failureKind: "size",
      repairAction: "choose_smaller_file",
      retryable: true,
    };
  }
  if (code.endsWith("upload.file_hash") || code.endsWith("upload.chunk_hash")) {
    return {
      failureKind: "hash",
      repairAction: "retry_upload",
      retryable: true,
    };
  }
  if (code === "import.source.empty" || code.endsWith("epub.empty")) {
    return {
      failureKind: "empty",
      repairAction: "choose_non_empty_file",
      retryable: true,
    };
  }
  if (code.includes("invalid_json") || code.includes("invalid_schema")) {
    return {
      failureKind: "structure",
      repairAction: "check_manifest",
      retryable: true,
    };
  }
  if (
    code.endsWith("epub.invalid") ||
    code.endsWith("epub.container_missing") ||
    code.endsWith("epub.opf_missing") ||
    code.endsWith("epub.invalid_href") ||
    code.endsWith("docx.invalid") ||
    code.endsWith("docx.document_missing")
  ) {
    return {
      failureKind: "container",
      repairAction: "repair_container",
      retryable: true,
    };
  }
  if (code.endsWith("parse_failed") || code.endsWith("upload.base64")) {
    return {
      failureKind: code.endsWith("upload.base64") ? "encoding" : "unknown",
      repairAction: code.endsWith("upload.base64")
        ? "export_utf8"
        : "choose_supported_file",
      retryable: true,
    };
  }
  return undefined;
}

function candidatesFromText(
  batchId: string,
  title: string,
  sourceText: string,
  now: string,
): ImportCandidate[] {
  const sections = splitIntoSections(sourceText, title);
  const candidates: ImportCandidate[] = [
    candidate(batchId, "project", 0, title, { title, premise: null }, now),
    ...sections.map((section, index) =>
      candidate(
        batchId,
        "document",
        index,
        section.title,
        {
          title: section.title,
          kind: sections.length > 1 ? "chapter" : "manuscript",
          content: section.content,
          characters: effectiveManuscriptCharacterCount(section.content),
        },
        now,
      ),
    ),
  ];
  if (sourceText.trim()) {
    candidates.push(
      candidate(
        batchId,
        "style",
        0,
        "原文统计风格",
        inferStylePayload(sourceText),
        now,
      ),
    );
  }
  return candidates;
}

function candidatesFromBundle(
  batchId: string,
  bundle: NarrativeBundle,
  now: string,
): ImportCandidate[] {
  return [
    candidate(
      batchId,
      "project",
      0,
      `完整恢复《${bundle.project.title}》`,
      {
        title: bundle.project.title,
        premise: bundle.project.premise,
        bundle,
        counts: {
          outline: bundle.outline.length,
          entities: bundle.entities.length,
          facts: bundle.facts.length,
          documents: bundle.documents.length,
          personas: bundle.personas.length,
          styles: bundle.styles.length,
          skills: bundle.skills.length,
        },
      },
      now,
    ),
  ];
}

function candidate(
  batchId: string,
  kind: ImportCandidate["kind"],
  ordinal: number,
  title: string,
  payload: Record<string, unknown>,
  now: string,
): ImportCandidate {
  return {
    id: `${batchId}:${kind}:${ordinal}`,
    batchId,
    kind,
    ordinal,
    title,
    payload,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

function splitIntoSections(text: string, fallbackTitle: string) {
  const heading =
    /^(?:#{1,3}\s+(.+)|\s*((?:第[零〇一二三四五六七八九十百千万两\d]+[章节卷部回]|Chapter\s+\d+)\s*[^\n]*))\s*$/gimu;
  const matches = [...text.matchAll(heading)];
  if (!matches.length) return [{ title: fallbackTitle, content: text.trim() }];
  const sections: { title: string; content: string }[] = [];
  const prefix = text.slice(0, matches[0]!.index).trim();
  if (prefix) sections.push({ title: "卷首", content: prefix });
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!;
    const next = matches[index + 1];
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? text.length;
    const title = (match[1] ?? match[2] ?? `章节 ${index + 1}`).trim();
    const content = text.slice(start, end).trim();
    if (content) sections.push({ title, content });
  }
  return sections.length
    ? sections
    : [{ title: fallbackTitle, content: text.trim() }];
}

function inferStylePayload(text: string): Record<string, unknown> {
  const sentences = text.split(/[。！？!?]+/u).filter((item) => item.trim());
  const paragraphs = text.split(/\n\s*\n/u).filter((item) => item.trim());
  const dialogueCharacters = [...text].filter((char) =>
    "“”「」『』".includes(char),
  ).length;
  const averageSentence = Math.round(
    sentences.reduce((sum, item) => sum + [...item.trim()].length, 0) /
      Math.max(1, sentences.length),
  );
  const averageParagraph = Math.round(
    paragraphs.reduce((sum, item) => sum + [...item.trim()].length, 0) /
      Math.max(1, paragraphs.length),
  );
  return {
    name: "原文统计风格",
    description: "由导入文本的可复验统计生成，采用前应由作者审阅。",
    rules: [
      `句长中位倾向约 ${averageSentence} 字，避免无意中大幅漂移`,
      `段落平均约 ${averageParagraph} 字，按场面节奏调整而非机械复制`,
      dialogueCharacters > text.length / 20
        ? "对话占比较高，保留人物声音与潜台词"
        : "叙述占比较高，对话只承担必要动作",
    ],
    negativeRules: ["不复制原文句子", "不把统计特征当成不可变文学规则"],
    examples: paragraphs.slice(0, 3).map((item) => item.trim().slice(0, 500)),
    active: false,
  };
}

async function extractEpub(bytes: Uint8Array) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new DeliveryServiceError(
      "import.epub.invalid",
      "The EPUB container could not be read",
    );
  }
  const entries = Object.values(zip.files);
  if (entries.length > 2_000) {
    throw new DeliveryServiceError(
      "import.epub.entry_limit",
      "The EPUB entry count exceeds the safety limit (2000)",
    );
  }
  const declaredBytes = entries.reduce(
    (sum, entry) => sum + declaredUncompressedSize(entry),
    0,
  );
  if (declaredBytes > 100 * 1024 * 1024) {
    throw new DeliveryServiceError(
      "import.epub.expansion_limit",
      "The EPUB declares an uncompressed size above the safety limit (100 MB)",
    );
  }
  const container = await zip.file("META-INF/container.xml")?.async("string");
  if (container && container.length > 1024 * 1024) {
    throw new DeliveryServiceError(
      "import.epub.container_too_large",
      "The EPUB container manifest is unusually large",
    );
  }
  const opfPath = container?.match(/full-path=["']([^"']+)["']/iu)?.[1];
  if (!opfPath) {
    throw new DeliveryServiceError(
      "import.epub.container_missing",
      "The EPUB is missing META-INF/container.xml or the OPF path",
    );
  }
  const opf = await zip.file(opfPath)?.async("string");
  if (!opf)
    throw new DeliveryServiceError(
      "import.epub.opf_missing",
      "The EPUB is missing the OPF manifest",
    );
  if (opf.length > 5 * 1024 * 1024) {
    throw new DeliveryServiceError(
      "import.epub.opf_too_large",
      "The EPUB OPF manifest is unusually large",
    );
  }
  const base = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
    : "";
  const manifest = new Map<string, string>();
  for (const match of opf.matchAll(/<item\b([^>]+)>?/giu)) {
    const attrs = match[1] ?? "";
    const id = attrs.match(/\bid=["']([^"']+)["']/iu)?.[1];
    const href = attrs.match(/\bhref=["']([^"']+)["']/iu)?.[1];
    const media = attrs.match(/\bmedia-type=["']([^"']+)["']/iu)?.[1];
    if (
      id &&
      href &&
      (media === "application/xhtml+xml" || media === "text/html")
    ) {
      manifest.set(id, decodeEpubHref(href));
    }
  }
  const spine = [
    ...opf.matchAll(/<itemref\b[^>]*idref=["']([^"']+)["'][^>]*\/?\s*>/giu),
  ].map((match) => match[1]!);
  const paths = (
    spine.length ? spine.map((id) => manifest.get(id)) : [...manifest.values()]
  ).filter((value): value is string => Boolean(value));
  const texts: string[] = [];
  let extractedBytes = 0;
  for (const path of paths) {
    const html = await zip.file(`${base}${path}`)?.async("string");
    if (!html) continue;
    const pageBytes = html.length;
    if (pageBytes > 10 * 1024 * 1024) {
      throw new DeliveryServiceError(
        "import.epub.page_too_large",
        "A single EPUB content page exceeds the safety limit (10 MB)",
      );
    }
    extractedBytes += pageBytes;
    if (extractedBytes > 50 * 1024 * 1024) {
      throw new DeliveryServiceError(
        "import.epub.content_limit",
        "The EPUB uncompressed content exceeds the safety limit (50 MB)",
      );
    }
    texts.push(htmlToText(html));
  }
  const result = normalizeImportedText(texts.join("\n\n"));
  if (!result.trim()) {
    throw new DeliveryServiceError(
      "import.epub.empty",
      "The EPUB contains no readable manuscript text",
    );
  }
  return result;
}

function decodeEpubHref(href: string): string {
  const xmlDecoded = href
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
  try {
    return decodeURIComponent(xmlDecoded);
  } catch {
    throw new DeliveryServiceError(
      "import.epub.invalid_href",
      "The EPUB manifest contains an invalid content path encoding",
    );
  }
}

async function extractDocx(bytes: Uint8Array) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new DeliveryServiceError(
      "import.docx.invalid",
      "The DOCX container could not be read",
    );
  }
  const entries = Object.values(zip.files);
  if (entries.length > 2_000)
    throw new DeliveryServiceError(
      "import.docx.entry_limit",
      "The DOCX entry count exceeds the safety limit (2000)",
    );
  if (
    entries.reduce((sum, entry) => sum + declaredUncompressedSize(entry), 0) >
    100 * 1024 * 1024
  )
    throw new DeliveryServiceError(
      "import.docx.expansion_limit",
      "The DOCX declares an uncompressed size above the safety limit (100 MB)",
    );
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml)
    throw new DeliveryServiceError(
      "import.docx.document_missing",
      "The DOCX is missing word/document.xml",
    );
  if (documentXml.length > 100 * 1024 * 1024)
    throw new DeliveryServiceError(
      "import.docx.document_too_large",
      "The expanded DOCX content exceeds the safety limit",
    );
  return normalizeImportedText(
    decodeXml(
      documentXml
        .replace(/<w:tab\b[^>]*\/>/giu, "\t")
        .replace(/<w:br\b[^>]*\/>/giu, "\n")
        .replace(/<\/w:p>/giu, "\n\n")
        .replace(/<\/w:tr>/giu, "\n")
        .replace(/<\/w:tc>/giu, "\t")
        .replace(/<[^>]+>/gu, ""),
    ),
  );
}

async function renderEpub(
  project: { title: string; language: string },
  sections: readonly { title: string; content: string }[],
) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  const safeSections = sections.length
    ? sections
    : [{ title: "空稿", content: "此作品尚无正文。" }];
  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const navItems: string[] = [];
  safeSections.forEach((section, index) => {
    const file = `chapter-${index + 1}.xhtml`;
    const id = `chapter-${index + 1}`;
    manifestItems.push(
      `<item id="${id}" href="${file}" media-type="application/xhtml+xml"/>`,
    );
    spineItems.push(`<itemref idref="${id}"/>`);
    navItems.push(`<li><a href="${file}">${escapeXml(section.title)}</a></li>`);
    zip.file(
      `OEBPS/${file}`,
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(project.language)}"><head><title>${escapeXml(section.title)}</title><link rel="stylesheet" href="styles.css" type="text/css"/></head><body><h1>${escapeXml(section.title)}</h1>${markdownishToXhtml(section.content)}</body></html>`,
    );
  });
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><h1>目录</h1><ol>${navItems.join("")}</ol></nav></body></html>`,
  );
  zip.file(
    "OEBPS/styles.css",
    "body{font-family:serif;line-height:1.8;margin:5%;}h1{page-break-before:always;}p{text-indent:2em;margin:.6em 0;}h1+p{text-indent:0}",
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${randomUuid()}</dc:identifier><dc:title>${escapeXml(project.title)}</dc:title><dc:language>${escapeXml(project.language)}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/u, "Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="styles.css" media-type="text/css"/>${manifestItems.join("")}</manifest><spine>${spineItems.join("")}</spine></package>`,
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function renderDocx(
  project: { title: string; language: string },
  sections: readonly { title: string; content: string }[],
) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  );
  const paragraphs = [
    docxParagraph(project.title, true),
    ...sections.flatMap((section) => [
      docxParagraph(section.title, true),
      ...section.content
        .split(/\n\s*\n/u)
        .filter(Boolean)
        .map((paragraph) => docxParagraph(paragraph, false)),
    ]),
  ].join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xml:lang="${escapeXml(project.language)}"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
  );
  const now = new Date().toISOString();
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(project.title)}</dc:title><dc:creator>ChapterFlow · 文织·网文工坊</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`,
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function docxParagraph(value: string, heading: boolean) {
  const lines = value.split("\n");
  const runs = lines
    .map(
      (line, index) =>
        `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`,
    )
    .join("");
  return `<w:p>${heading ? '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="160"/></w:pPr>' : '<w:pPr><w:ind w:firstLineChars="200"/><w:spacing w:line="360" w:lineRule="auto"/></w:pPr>'}<w:r>${heading ? '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' : ""}${runs}</w:r></w:p>`;
}

function renderMarkdown(
  project: { title: string; premise: string | null },
  sections: readonly { title: string; content: string }[],
) {
  return [
    `# ${project.title}`,
    project.premise ? `> ${project.premise}` : "",
    ...sections.flatMap((section) => [`## ${section.title}`, section.content]),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trimEnd()
    .concat("\n");
}

function renderText(
  project: { title: string; premise: string | null },
  sections: readonly { title: string; content: string }[],
) {
  return [
    project.title,
    project.premise ?? "",
    ...sections.flatMap((section) => [section.title, section.content]),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trimEnd()
    .concat("\n");
}

function normalizeImportedText(value: string) {
  return value
    .replace(/^\uFEFF/u, "")
    .replace(/\0/gu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+$/gmu, "")
    .replace(/\n{4,}/gu, "\n\n\n")
    .trim();
}

function htmlToText(html: string) {
  return decodeXml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
      .replace(/<h[1-3]\b[^>]*>/giu, "\n# ")
      .replace(/<\/(?:h[1-6]|p|div|li|blockquote)>/giu, "\n\n")
      .replace(/<br\s*\/?>/giu, "\n")
      .replace(/<[^>]+>/gu, ""),
  );
}

function decodeXml(value: string) {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&amp;/giu, "&")
    .replace(/&#(\d+);/gu, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function markdownishToXhtml(content: string) {
  return content
    .split(/\n\s*\n/u)
    .map((paragraph) => {
      const value = paragraph.trim();
      const heading = value.match(/^#{1,3}\s+(.+)$/su);
      return heading
        ? `<h2>${escapeXml(heading[1]!)}</h2>`
        : `<p>${escapeXml(value).replace(/\n/gu, "<br/>")}</p>`;
    })
    .join("");
}

function escapeXml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function entityByImportedName(
  entities: readonly CanonEntity[],
  name: string | null,
): CanonEntity | null {
  if (!name) return null;
  const normalized = name.normalize("NFKC").toLocaleLowerCase();
  return (
    entities.find(
      (entity) =>
        entity.name.normalize("NFKC").toLocaleLowerCase() === normalized ||
        entity.aliases.some(
          (alias) => alias.normalize("NFKC").toLocaleLowerCase() === normalized,
        ),
    ) ?? null
  );
}

function renderAnalysisCandidate(candidate: ImportCandidate): string {
  const evidence = Array.isArray(candidate.payload.evidence)
    ? candidate.payload.evidence.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
  return [
    `# ${candidate.title}`,
    ...Object.entries(candidate.payload)
      .filter(([key, value]) => key !== "evidence" && typeof value === "string")
      .map(([key, value]) => `- ${key}: ${String(value)}`),
    "",
    "## 原文证据",
    ...evidence.flatMap((item) => [
      `[P${String(item.paragraphOrdinal ?? "?")}] ${String(item.quote ?? "")}`,
      `位置：${String(item.start ?? "?")}–${String(item.end ?? "?")}`,
      `正文哈希：${String(item.contentHash ?? "")}`,
    ]),
  ].join("\n");
}

function styleFromPayload(
  projectId: string,
  candidate: ImportCandidate,
  now: string,
): StyleProfile {
  return {
    id: randomUuid(),
    projectId,
    name: stringField(candidate.payload, "name") ?? candidate.title,
    description: stringField(candidate.payload, "description"),
    rules: stringArray(candidate.payload.rules),
    examples: stringArray(candidate.payload.examples),
    negativeRules: stringArray(candidate.payload.negativeRules),
    source: `import:${candidate.batchId}`,
    active: candidate.payload.active === true,
    status: "active",
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
}

function skillFromPayload(
  projectId: string,
  candidate: ImportCandidate,
  now: string,
): WritingSkill {
  return {
    id: randomUuid(),
    projectId,
    name: stringField(candidate.payload, "name") ?? candidate.title,
    description: stringField(candidate.payload, "description"),
    instructions:
      stringField(candidate.payload, "instructions") ??
      "保持原有叙事事实与视角。",
    scopes: skillScopes(candidate.payload.scopes),
    priority: boundedNumber(candidate.payload.priority, 0, 100, 50),
    enabled: candidate.payload.enabled !== false,
    source: `import:${candidate.batchId}`,
    createdAt: now,
    updatedAt: now,
    version: 0,
  };
}

function titleFromFilename(filename: string) {
  return (
    filename
      .replace(/\.narrative\.json$/iu, "")
      .replace(/\.(?:md|markdown|txt|epub|json)$/iu, "")
      .trim() || "导入作品"
  );
}

function safeFilename(value: string) {
  const withoutControls = [...value]
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("");
  return withoutControls.replace(/[<>:"/\\|?*]/gu, "_").trim() || "novel";
}

function hash(value: string | Uint8Array): string {
  if (typeof value === "string") return sha256Hex(value);
  return hashBytes(value);
}

function decodeBase64(value: string) {
  const compact = value.replace(/\s/gu, "");
  if (!compact || compact.length % 4 === 1 || /[^A-Za-z0-9+/=]/u.test(compact))
    throw new DeliveryServiceError(
      "import.upload.base64",
      "The uploaded chunk is not valid Base64",
    );
  return decodeBase64Bytes(compact);
}

function count(database: NarrativeDatabase, sql: string, ...params: string[]) {
  const row = database.raw.prepare(sql).get(...params) as { count: number };
  return row.count;
}

function records(
  database: NarrativeDatabase,
  sql: string,
  ...params: string[]
) {
  return database.raw.prepare(sql).all(...params) as unknown as Array<
    Record<string, unknown>
  >;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 网文旧稿经常来自 Windows/国产编辑器，不能把所有非 UTF-8 字节都静默
 * 替换成 �。先用 fatal UTF-8 校验，再尝试 GB18030；两者都无法解码时
 * 才回退到带替换字符的 UTF-8，并把结果写进导入批次 metadata 供作者检查。
 */
function decodeImportedText(bytes: Uint8Array): {
  text: string;
  encoding: "utf-8" | "utf-8-bom" | "gb18030" | "utf-8-replacement";
} {
  const hasUtf8Bom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: hasUtf8Bom ? "utf-8-bom" : "utf-8",
    };
  } catch {
    try {
      return {
        text: new TextDecoder("gb18030", { fatal: true }).decode(bytes),
        encoding: "gb18030",
      };
    } catch {
      return {
        text: new TextDecoder("utf-8").decode(bytes),
        encoding: "utf-8-replacement",
      };
    }
  }
}

function presetPacing(
  value: string | null,
): "slow" | "steady" | "fast" | "cliffhanger" {
  return ["slow", "steady", "fast", "cliffhanger"].includes(value ?? "")
    ? (value as "slow" | "steady" | "fast" | "cliffhanger")
    : "steady";
}

function stringField(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
) {
  const field = value?.[key];
  return typeof field === "string" && field.trim() ? field : null;
}

function numberField(value: Readonly<Record<string, unknown>>, key: string) {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : 0;
}

function nullableNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function objectField(value: Readonly<Record<string, unknown>>, key: string) {
  const field = value[key];
  return field && typeof field === "object" && !Array.isArray(field)
    ? (field as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim()),
      )
    : [];
}

const CHAPTER_PURPOSE_VALUES = [
  "setup",
  "progress",
  "conflict",
  "reveal",
  "payoff",
  "turning_point",
  "relationship",
  "worldbuilding",
  "transition",
  "climax",
] as const;
const CHAPTER_HOOK_TYPE_VALUES = [
  "question",
  "reveal",
  "danger",
  "decision",
  "arrival",
  "identity",
  "information_gap",
  "emotional",
  "reward",
  "reverse",
] as const;
const CHAPTER_EMOTION_TARGET_VALUES = [
  "爽",
  "紧张",
  "期待",
  "惊讶",
  "压迫",
  "感动",
  "暧昧",
  "恐惧",
  "轻松",
] as const;

function chapterPurpose(value: string | null): ChapterPurpose {
  return CHAPTER_PURPOSE_VALUES.includes(value as ChapterPurpose)
    ? (value as ChapterPurpose)
    : "progress";
}

function chapterPurposeArray(value: unknown): ChapterPurpose[] {
  return stringArray(value)
    .map((item) => chapterPurpose(item))
    .filter((item, index, values) => values.indexOf(item) === index)
    .slice(0, 3);
}

function chapterEmotionTarget(
  value: string | null,
): ChapterEmotionTarget | null {
  return CHAPTER_EMOTION_TARGET_VALUES.includes(
    value as (typeof CHAPTER_EMOTION_TARGET_VALUES)[number],
  )
    ? (value as ChapterEmotionTarget)
    : null;
}

function chapterHookType(value: string | null): ChapterHookType | null {
  return CHAPTER_HOOK_TYPE_VALUES.includes(
    value as (typeof CHAPTER_HOOK_TYPE_VALUES)[number],
  )
    ? (value as ChapterHookType)
    : null;
}

function chapterEmotionCurve(value: unknown): ChapterEmotionCurvePoint[] {
  return recordArray(value)
    .map((item) => ({
      label: stringField(item, "label") ?? "",
      intensity: Math.floor(boundedNumber(item.intensity, 0, 5, 0)),
    }))
    .filter((item) => item.label.length > 0)
    .slice(0, 8);
}

function chapterSceneStructure(value: unknown): ChapterSceneStructure[] {
  return recordArray(value)
    .map((item, index) => ({
      order: Math.max(
        1,
        Math.min(
          20,
          Math.floor(typeof item.order === "number" ? item.order : index + 1),
        ),
      ),
      purpose: chapterPurpose(stringField(item, "purpose")),
      beat: stringField(item, "beat") ?? "",
      payoff: stringField(item, "payoff"),
    }))
    .filter((item) => item.beat.length > 0)
    .slice(0, 20);
}

function readerPromiseOperations(value: unknown): ReaderPromiseOperation[] {
  return recordArray(value)
    .map((item): ReaderPromiseOperation => {
      const action = readerPromiseAction(stringField(item, "action"));
      const promiseId = stringField(item, "promiseId");
      return {
        action,
        promiseId,
        title: stringField(item, "title"),
        note: stringField(item, "note"),
      };
    })
    .filter((item) =>
      item.action === "OPEN"
        ? Boolean(item.promiseId || item.title)
        : Boolean(item.promiseId),
    )
    .slice(0, 30);
}

function readerPromiseAction(value: string | null): ReaderPromiseAction {
  return value === "ADVANCE" || value === "PAYOFF" ? value : "OPEN";
}

function readerPromiseStatus(value: string | null): ReaderPromiseStatus {
  return value === "paid_off" || value === "abandoned" ? value : "open";
}

function readerPromiseEventSource(
  value: string | null,
): "author" | "ai" | "settlement" | "restore" {
  return value === "ai" || value === "settlement" || value === "restore"
    ? value
    : "author";
}

function nullablePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function canonType(value: string | null): CanonEntity["type"] {
  return [
    "character",
    "location",
    "organization",
    "item",
    "rule",
    "concept",
  ].includes(value ?? "")
    ? (value as CanonEntity["type"])
    : "concept";
}

function documentKind(value: string | null) {
  return [
    "manuscript",
    "chapter",
    "scene",
    "outline",
    "synopsis",
    "note",
    "style-sample",
  ].includes(value ?? "")
    ? (value as
        | "manuscript"
        | "chapter"
        | "scene"
        | "outline"
        | "synopsis"
        | "note"
        | "style-sample")
    : "manuscript";
}

function outlineKind(value: string | null) {
  return ["book", "volume", "arc", "chapter", "scene", "beat"].includes(
    value ?? "",
  )
    ? (value as "book" | "volume" | "arc" | "chapter" | "scene" | "beat")
    : "chapter";
}

function outlineStatus(value: string) {
  return ["planned", "drafting", "review", "committed", "abandoned"].includes(
    value,
  )
    ? (value as "planned" | "drafting" | "review" | "committed" | "abandoned")
    : "planned";
}

function knowledgeScope(value: string | null) {
  return ["omniscient", "reader", "character", "author_secret"].includes(
    value ?? "",
  )
    ? (value as "omniscient" | "reader" | "character" | "author_secret")
    : "omniscient";
}

function canonAuthority(value: string | null) {
  return ["candidate", "inferred", "confirmed", "locked"].includes(value ?? "")
    ? (value as "candidate" | "inferred" | "confirmed" | "locked")
    : "confirmed";
}

function projectPhase(value: string): ProjectPhase {
  return [
    "idea",
    "foundation",
    "outlining",
    "writing",
    "revising",
    "complete",
  ].includes(value)
    ? (value as ProjectPhase)
    : "idea";
}

function timelineVisibility(value: string | null) {
  return ["omniscient", "reader", "author_secret"].includes(value ?? "")
    ? (value as "omniscient" | "reader" | "author_secret")
    : "omniscient";
}

function foreshadowStatus(value: string | null) {
  return ["planned", "planted", "developing", "resolved", "abandoned"].includes(
    value ?? "",
  )
    ? (value as "planned" | "planted" | "developing" | "resolved" | "abandoned")
    : "planned";
}

function personaKind(value: string | null) {
  return ["author", "narrator", "character"].includes(value ?? "")
    ? (value as "author" | "narrator" | "character")
    : "character";
}

function skillScopes(value: unknown): WritingSkill["scopes"] {
  const valid = new Set(["all", "chapter", "cocreate", "edit", "review"]);
  const result = stringArray(value).filter((item) => valid.has(item));
  return result.length ? (result as WritingSkill["scopes"]) : ["all"];
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new DeliveryServiceError(
      "bundle.field.missing",
      `The project bundle is missing ${label}`,
    );
  }
  return value;
}
