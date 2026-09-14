import type { IsoDateTime, ProjectId } from "./index.js";

export const OFFICIAL_SOURCE_TYPES = [
  "platform_rule",
  "official_course",
  "help",
  "signing",
  "governance",
  "tag_guide",
] as const;
export type OfficialSourceType = (typeof OFFICIAL_SOURCE_TYPES)[number];

export const OFFICIAL_SOURCE_STATUSES = [
  "ACTIVE",
  "CANDIDATE",
  "OUTDATED",
  "SUPERSEDED",
  "DISABLED",
  "FETCH_FAILED",
] as const;
export type OfficialSourceStatus = (typeof OFFICIAL_SOURCE_STATUSES)[number];

export const OFFICIAL_AUTHORITY_TYPES = [
  "OFFICIAL_RULE",
  "OFFICIAL_GUIDANCE",
  "OFFICIAL_TUTORIAL",
] as const;
export type OfficialAuthorityType = (typeof OFFICIAL_AUTHORITY_TYPES)[number];

export interface OfficialSource {
  id: string;
  sourceKey: string;
  platform: "fanqienovel";
  url: string;
  title: string;
  sourceType: OfficialSourceType;
  publishedAt: IsoDateTime | null;
  retrievedAt: IsoDateTime;
  contentHash: string;
  status: OfficialSourceStatus;
  applicableStages: string[];
  applicableGenres: string[];
  authorityType: OfficialAuthorityType;
  summary: string;
  sourceVersion: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface KnowledgeCardSourceRef {
  sourceId: string;
  sourceKey: string;
  sourceVersion: string;
  title: string;
  url: string;
}

export const KNOWLEDGE_CARD_SEVERITIES = [
  "info",
  "suggestion",
  "warning",
] as const;
export type KnowledgeCardSeverity = (typeof KNOWLEDGE_CARD_SEVERITIES)[number];

export const KNOWLEDGE_CARD_STATUSES = [
  "ACTIVE",
  "CANDIDATE",
  "DISABLED",
] as const;
export type KnowledgeCardStatus = (typeof KNOWLEDGE_CARD_STATUSES)[number];

export interface KnowledgeCard {
  id: string;
  title: string;
  principle: string;
  why: string;
  applicableStage: string;
  applicableGenres: string[];
  signals: string[];
  antiPatterns: string[];
  suggestions: string[];
  severity: KnowledgeCardSeverity;
  sourceRefs: KnowledgeCardSourceRef[];
  confidence: number;
  status: KnowledgeCardStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export const SIGNING_SPRINT_STEPS = [
  "direction",
  "positioning",
  "story_engine",
  "packaging",
  "opening",
  "writing",
  "readiness",
] as const;
export type SigningSprintStep = (typeof SIGNING_SPRINT_STEPS)[number];

export const SIGNING_SPRINT_STATUSES = [
  "active",
  "paused",
  "completed",
] as const;
export type SigningSprintStatus = (typeof SIGNING_SPRINT_STATUSES)[number];

export const SIGNING_SPRINT_TASKS = [
  "BrainstormBookDirection",
  "RefineBookPositioning",
  "EvaluatePositioning",
  "GenerateBookPackaging",
  "EvaluateBookPackaging",
  "GenerateOpeningBlueprint",
  "EvaluateOpening",
  "GenerateChapterFromIntent",
  "SigningReadinessReview",
] as const;
export type SigningSprintTask = (typeof SIGNING_SPRINT_TASKS)[number];

export interface BookDirection {
  premise: string;
  genre: string | null;
  audience: string | null;
  coreEmotion: string | null;
  protagonistSeed: string | null;
  hook: string | null;
  differentiation: string[];
}

export interface SustainabilityAssessment {
  shortTermAppeal: string;
  midTermExpansion: string;
  longTermSpace: string;
}

export interface BookPositioning {
  oneLineStory: string;
  coreIdea: string;
  sellingPoints: string[];
  emotionalPayoff: string;
  readerProfile: string;
  protagonistDesire: string;
  obstacle: string;
  mechanism: string;
  coreConflict: string;
  longTermExpectation: string;
  sustainability: SustainabilityAssessment;
  riskNotes: string[];
}

export interface BookPackaging {
  title: string;
  titleDirection: string;
  description: string;
  genre: string | null;
  tags: string[];
  tagline: string | null;
  coverBrief: string | null;
  rationale: string;
}

export interface OpeningChapterBlueprint {
  index: number;
  title: string;
  purpose: string;
  protagonistAction: string;
  conflict: string;
  readerExpectation: string;
  emotionTarget: string;
  hook: string;
  payoff: string;
  targetWords: number | null;
}

export interface OpeningBlueprint {
  readerPromise: string;
  openingHook: string;
  expectation: string;
  informationRevealPlan: string[];
  firstThreeChapters: OpeningChapterBlueprint[];
  firstArcTitle: string;
  firstArcGoal: string;
  firstArcConflict: string;
  firstArcPayoff: string;
  firstArcChapters: OpeningChapterBlueprint[];
  riskNotes: string[];
}

export interface OpeningSignalMetrics {
  characterCount: number;
  paragraphCount: number;
  dialogueCharacterCount: number;
  dialogueRatio: number;
  longParagraphCount: number;
  longParagraphRate: number;
  namedPersonDensity: number;
  properNounDensity: number;
  expositionRunCount: number;
  viewpointMarkerCount: number;
  repeatedParagraphCount: number;
}

export interface OpeningSignal {
  code: string;
  label: string;
  value: number;
  threshold: number | null;
  direction: "higher_is_risk" | "lower_is_risk" | "observation";
  explanation: string;
  /** Human-readable paragraph locations for author review. */
  locations: string[];
}

export interface OpeningSignalReport {
  metrics: OpeningSignalMetrics;
  signals: OpeningSignal[];
  analyzedChapterCount: number;
  analyzedAt: IsoDateTime;
}

export type ReadinessEvidenceSource = "official" | "chapterflow";
export type ReadinessSeverity = "info" | "warning" | "error";

export interface ReadinessIssue {
  code: string;
  title: string;
  severity: ReadinessSeverity;
  source: ReadinessEvidenceSource;
  detail: string;
  evidence: string[];
  locations: string[];
  suggestions: string[];
  sourceRefs: KnowledgeCardSourceRef[];
}

export interface SigningReadinessReport {
  status: "ready_to_prepare_submission" | "needs_attention";
  headline: string;
  issues: ReadinessIssue[];
  checks: {
    metadata: "ready" | "needs_attention";
    content: "ready" | "needs_attention";
    consistency: "ready" | "needs_attention";
    officialMatching: "ready" | "needs_attention" | "unconfirmed";
    technicalSafety: "ready" | "needs_attention";
  };
  generatedAt: IsoDateTime;
}

export interface SigningSprintState {
  direction: BookDirection | null;
  positioning: BookPositioning | null;
  storyEngine: {
    protagonist: string | null;
    relationships: string[];
    antagonist: string | null;
    mechanism: string | null;
    worldRules: string[];
    conflict: string | null;
  } | null;
  packaging: BookPackaging[];
  selectedPackagingId: string | null;
  openingBlueprint: OpeningBlueprint | null;
  openingCheck: OpeningSignalReport | null;
  readiness: SigningReadinessReport | null;
}

export interface SigningSprintWorkflow {
  id: string;
  projectId: ProjectId;
  status: SigningSprintStatus;
  currentStep: SigningSprintStep;
  completedSteps: SigningSprintStep[];
  state: SigningSprintState;
  selectedStrategyId: string | null;
  knowledgeRefs: string[];
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type SigningSprintCandidateStatus =
  "candidate" | "accepted" | "rejected";

export interface SigningSprintCandidate {
  id: string;
  workflowId: string;
  projectId: ProjectId;
  task: SigningSprintTask;
  status: SigningSprintCandidateStatus;
  payload: Readonly<Record<string, unknown>>;
  rationale: string;
  provenance: {
    kind: "model" | "author" | "official_knowledge";
    sourceRefs: KnowledgeCardSourceRef[];
    runId: string | null;
  };
  baseWorkflowVersion: number;
  createdAt: IsoDateTime;
  decidedAt: IsoDateTime | null;
}

export function analyzeOpeningText(
  content: string,
  analyzedAt: IsoDateTime,
  options: { longParagraphThreshold?: number } = {},
): OpeningSignalReport {
  const text = content.trim();
  const paragraphs = text
    .split(/\n\s*\n|\r\n|\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const characterCount = [...text].filter((char) => !/\s/u.test(char)).length;
  const dialogueCharacterCount = [
    ...text.matchAll(/[“「『"]([^”」』"]*)[”」』"]/gu),
  ]
    .map((match) => match[1] ?? "")
    .join("").length;
  const longParagraphThreshold = options.longParagraphThreshold ?? 400;
  const longParagraphCount = paragraphs.filter(
    (paragraph) => [...paragraph].length >= longParagraphThreshold,
  ).length;
  const namedPersonMatches = [
    ...text.matchAll(
      /[\p{Script=Han}A-Za-z·]{2,8}(?=(?:说|问|喊|看着|盯着|的目光|回答))/gu,
    ),
  ];
  const properNounMatches = [
    ...text.matchAll(
      /(?:“[^”]{1,20}”|[A-Z][a-zA-Z]{1,20}|[\p{Script=Han}]{2,8}(?:门|城|宗|府|局|集团|公司|学院|计划|系统))/gu,
    ),
  ];
  const expositionMatches = [
    ...text.matchAll(
      /(?:因为|所谓|也就是说|简单来说|在这个世界|历史上|众所周知|原来|其实)[^。！？!?]{45,}/gu,
    ),
  ];
  const viewpointMatches = [
    ...text.matchAll(/(?:我|他|她|它|视线|回忆|想到|意识到|心里|耳边|眼前)/gu),
  ];
  const normalizedParagraphs = paragraphs.map((paragraph) =>
    paragraph.replace(/\s+/gu, "").toLowerCase(),
  );
  const repeatedParagraphCount = normalizedParagraphs.filter(
    (paragraph, index) =>
      paragraph.length > 20 &&
      normalizedParagraphs.indexOf(paragraph) !== index,
  ).length;
  const safeCharacterCount = Math.max(1, characterCount);
  const metrics: OpeningSignalMetrics = {
    characterCount,
    paragraphCount: paragraphs.length,
    dialogueCharacterCount,
    dialogueRatio: roundRatio(dialogueCharacterCount, safeCharacterCount),
    longParagraphCount,
    longParagraphRate: roundRatio(
      longParagraphCount,
      Math.max(1, paragraphs.length),
    ),
    namedPersonDensity: roundRatio(
      (namedPersonMatches ?? []).length,
      Math.max(1, paragraphs.length),
    ),
    properNounDensity: roundRatio(
      (properNounMatches ?? []).length,
      Math.max(1, paragraphs.length),
    ),
    expositionRunCount: expositionMatches.length,
    viewpointMarkerCount: viewpointMatches.length,
    repeatedParagraphCount,
  };
  const signals: OpeningSignal[] = [
    {
      code: "long_paragraphs",
      label: "长段落集中度",
      value: metrics.longParagraphRate,
      threshold: 0.35,
      direction: "higher_is_risk",
      explanation: "用于提醒开篇是否有较多信息堆叠，不能单独判断正文质量。",
      locations: paragraphLocations(
        paragraphs,
        paragraphs
          .map((paragraph, index) =>
            [...paragraph].length >= longParagraphThreshold ? index : -1,
          )
          .filter((index) => index >= 0),
      ),
    },
    {
      code: "dialogue_ratio",
      label: "对话占比",
      value: metrics.dialogueRatio,
      threshold: null,
      direction: "observation",
      explanation: "帮助作者观察开篇的叙述与互动分布。",
      locations: paragraphs.length > 0 ? [paragraphLocation(0)] : [],
    },
    {
      code: "named_person_density",
      label: "人物出现密度",
      value: metrics.namedPersonDensity,
      threshold: 1.5,
      direction: "higher_is_risk",
      explanation: "人物过密时，读者可能需要更多时间建立关系。",
      locations: matchLocations(text, namedPersonMatches, paragraphs),
    },
    {
      code: "exposition_runs",
      label: "连续解释段",
      value: metrics.expositionRunCount,
      threshold: 2,
      direction: "higher_is_risk",
      explanation: "提示连续背景解释的位置，建议回看是否能改为行动或冲突。",
      locations: matchLocations(text, expositionMatches, paragraphs),
    },
    {
      code: "repeated_paragraphs",
      label: "重复段落",
      value: metrics.repeatedParagraphCount,
      threshold: 1,
      direction: "higher_is_risk",
      explanation: "提示可能存在重复表达或重复粘贴。",
      locations: paragraphLocations(
        paragraphs,
        normalizedParagraphs
          .map((paragraph, index) =>
            paragraph.length > 20 &&
            normalizedParagraphs.indexOf(paragraph) !== index
              ? index
              : -1,
          )
          .filter((index) => index >= 0),
      ),
    },
    {
      code: "viewpoint_markers",
      label: "视角提示词",
      value: metrics.viewpointMarkerCount,
      threshold: null,
      direction: "observation",
      explanation: "辅助作者回看开篇视角是否稳定。",
      locations: matchLocations(text, viewpointMatches, paragraphs),
    },
  ];
  return {
    metrics,
    signals,
    analyzedChapterCount: paragraphs.length > 0 ? 1 : 0,
    analyzedAt,
  };
}

function paragraphLocation(index: number): string {
  return `第 ${index + 1} 段`;
}

function paragraphLocations(
  paragraphs: readonly string[],
  indices: readonly number[],
): string[] {
  return [...new Set(indices)]
    .filter((index) => index >= 0 && index < paragraphs.length)
    .map(paragraphLocation);
}

function matchLocations(
  text: string,
  matches: readonly RegExpMatchArray[],
  paragraphs: readonly string[],
): string[] {
  if (paragraphs.length === 0) return [];
  const starts: number[] = [];
  let cursor = 0;
  for (const paragraph of paragraphs) {
    const start = text.indexOf(paragraph, cursor);
    starts.push(start >= 0 ? start : cursor);
    cursor = Math.max(cursor, start >= 0 ? start + paragraph.length : cursor);
  }
  const indices = matches.flatMap((match) => {
    const offset = match.index ?? -1;
    if (offset < 0) return [];
    let index = 0;
    for (let candidate = 0; candidate < starts.length; candidate += 1) {
      if (starts[candidate]! <= offset) index = candidate;
      else break;
    }
    return [index];
  });
  return paragraphLocations(paragraphs, indices);
}

function roundRatio(numerator: number, denominator: number): number {
  return Math.round((numerator / Math.max(1, denominator)) * 1000) / 1000;
}
