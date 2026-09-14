import type {
  KnowledgeCard,
  OfficialSource,
  OfficialSourceStatus,
} from "@narralume/domain";

import type { NarrativeDatabase } from "./database.js";
import { PersistenceNotFoundError } from "./project-repository.js";

export interface OfficialSourceListOptions {
  status?: OfficialSourceStatus;
  sourceType?: OfficialSource["sourceType"];
}

export interface KnowledgeCardListOptions {
  stage?: string;
  genre?: string;
  status?: KnowledgeCard["status"];
  limit?: number;
}

export class SqliteOfficialKnowledgeRepository {
  constructor(private readonly database: NarrativeDatabase) {}

  listSources(options: OfficialSourceListOptions = {}): OfficialSource[] {
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM official_sources
         WHERE (? IS NULL OR status = ?)
           AND (? IS NULL OR source_type = ?)
         ORDER BY retrieved_at DESC, title, id`,
      )
      .all(
        options.status ?? null,
        options.status ?? null,
        options.sourceType ?? null,
        options.sourceType ?? null,
      ) as unknown as OfficialSourceRow[];
    return rows.map(mapSource);
  }

  getSource(id: string): OfficialSource | null {
    const row = this.database.raw
      .prepare("SELECT * FROM official_sources WHERE id = ?")
      .get(id) as OfficialSourceRow | undefined;
    return row ? mapSource(row) : null;
  }

  requireSource(id: string): OfficialSource {
    const source = this.getSource(id);
    if (!source) throw new PersistenceNotFoundError("official_source", id);
    return source;
  }

  latestSource(sourceKey: string): OfficialSource | null {
    const row = this.database.raw
      .prepare(
        `SELECT * FROM official_sources WHERE source_key = ?
         ORDER BY retrieved_at DESC, source_version DESC LIMIT 1`,
      )
      .get(sourceKey) as OfficialSourceRow | undefined;
    return row ? mapSource(row) : null;
  }

  insertSource(source: OfficialSource): OfficialSource {
    const existing = this.database.raw
      .prepare(
        "SELECT * FROM official_sources WHERE source_key = ? AND source_version = ?",
      )
      .get(source.sourceKey, source.sourceVersion) as
      OfficialSourceRow | undefined;
    if (existing) return mapSource(existing);
    this.database.raw
      .prepare(
        `INSERT INTO official_sources(
          id, source_key, platform, url, title, source_type, published_at,
          retrieved_at, content_hash, status, applicable_stages_json,
          applicable_genres_json, authority_type, summary, source_version,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        source.id,
        source.sourceKey,
        source.platform,
        source.url,
        source.title,
        source.sourceType,
        source.publishedAt,
        source.retrievedAt,
        source.contentHash,
        source.status,
        JSON.stringify(source.applicableStages),
        JSON.stringify(source.applicableGenres),
        source.authorityType,
        source.summary,
        source.sourceVersion,
        source.createdAt,
        source.updatedAt,
      );
    return this.requireSource(source.id);
  }

  activateSource(id: string, now: string): OfficialSource {
    return this.database.transaction(() => {
      const source = this.requireSource(id);
      this.database.raw
        .prepare(
          `UPDATE official_sources SET status = 'SUPERSEDED', updated_at = ?
           WHERE source_key = ? AND id <> ? AND status = 'ACTIVE'`,
        )
        .run(now, source.sourceKey, id);
      this.database.raw
        .prepare(
          "UPDATE official_sources SET status = 'ACTIVE', updated_at = ? WHERE id = ?",
        )
        .run(now, id);
      return this.requireSource(id);
    });
  }

  disableSource(id: string, now: string): OfficialSource {
    this.requireSource(id);
    this.database.raw
      .prepare(
        "UPDATE official_sources SET status = 'DISABLED', updated_at = ? WHERE id = ?",
      )
      .run(now, id);
    return this.requireSource(id);
  }

  listCards(options: KnowledgeCardListOptions = {}): KnowledgeCard[] {
    const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 100), 500));
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM knowledge_cards
         WHERE (? IS NULL OR status = ?)
           AND (? IS NULL OR applicable_stage = ?)
         ORDER BY updated_at DESC, id
         LIMIT ?`,
      )
      .all(
        options.status ?? null,
        options.status ?? null,
        options.stage ?? null,
        options.stage ?? null,
        limit,
      ) as unknown as KnowledgeCardRow[];
    return rows
      .map(mapCard)
      .filter(
        (card) =>
          !options.genre ||
          card.applicableGenres.length === 0 ||
          card.applicableGenres.includes(options.genre!),
      );
  }

  getCard(id: string): KnowledgeCard | null {
    const row = this.database.raw
      .prepare("SELECT * FROM knowledge_cards WHERE id = ?")
      .get(id) as KnowledgeCardRow | undefined;
    return row ? mapCard(row) : null;
  }

  requireCard(id: string): KnowledgeCard {
    const card = this.getCard(id);
    if (!card) throw new PersistenceNotFoundError("knowledge_card", id);
    return card;
  }

  insertCard(card: KnowledgeCard): KnowledgeCard {
    const existing = this.getCard(card.id);
    if (existing) return existing;
    this.database.raw
      .prepare(
        `INSERT INTO knowledge_cards(
          id, title, principle, why, applicable_stage, applicable_genres_json,
          signals_json, anti_patterns_json, suggestions_json, severity,
          source_refs_json, confidence, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        card.id,
        card.title,
        card.principle,
        card.why,
        card.applicableStage,
        JSON.stringify(card.applicableGenres),
        JSON.stringify(card.signals),
        JSON.stringify(card.antiPatterns),
        JSON.stringify(card.suggestions),
        card.severity,
        JSON.stringify(card.sourceRefs),
        card.confidence,
        card.status,
        card.createdAt,
        card.updatedAt,
      );
    return this.requireCard(card.id);
  }

  setCardStatus(
    id: string,
    status: KnowledgeCard["status"],
    now: string,
  ): KnowledgeCard {
    this.requireCard(id);
    this.database.raw
      .prepare(
        "UPDATE knowledge_cards SET status = ?, updated_at = ? WHERE id = ?",
      )
      .run(status, now, id);
    return this.requireCard(id);
  }

  retrieve(stage: string, genre: string | null, limit = 12): KnowledgeCard[] {
    return this.listCards({
      stage,
      ...(genre ? { genre } : {}),
      status: "ACTIVE",
      limit,
    }).filter((card) =>
      card.sourceRefs.some(
        (ref) => this.getSource(ref.sourceId)?.status === "ACTIVE",
      ),
    );
  }
}

interface OfficialSourceRow {
  id: string;
  source_key: string;
  platform: "fanqienovel";
  url: string;
  title: string;
  source_type: OfficialSource["sourceType"];
  published_at: string | null;
  retrieved_at: string;
  content_hash: string;
  status: OfficialSourceStatus;
  applicable_stages_json: string;
  applicable_genres_json: string;
  authority_type: OfficialSource["authorityType"];
  summary: string;
  source_version: string;
  created_at: string;
  updated_at: string;
}

interface KnowledgeCardRow {
  id: string;
  title: string;
  principle: string;
  why: string;
  applicable_stage: string;
  applicable_genres_json: string;
  signals_json: string;
  anti_patterns_json: string;
  suggestions_json: string;
  severity: KnowledgeCard["severity"];
  source_refs_json: string;
  confidence: number;
  status: KnowledgeCard["status"];
  created_at: string;
  updated_at: string;
}

function parseList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseObjectList<T>(value: string): T[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function mapSource(row: OfficialSourceRow): OfficialSource {
  return {
    id: row.id,
    sourceKey: row.source_key,
    platform: row.platform,
    url: row.url,
    title: row.title,
    sourceType: row.source_type,
    publishedAt: row.published_at,
    retrievedAt: row.retrieved_at,
    contentHash: row.content_hash,
    status: row.status,
    applicableStages: parseList(row.applicable_stages_json),
    applicableGenres: parseList(row.applicable_genres_json),
    authorityType: row.authority_type,
    summary: row.summary,
    sourceVersion: row.source_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCard(row: KnowledgeCardRow): KnowledgeCard {
  return {
    id: row.id,
    title: row.title,
    principle: row.principle,
    why: row.why,
    applicableStage: row.applicable_stage,
    applicableGenres: parseList(row.applicable_genres_json),
    signals: parseList(row.signals_json),
    antiPatterns: parseList(row.anti_patterns_json),
    suggestions: parseList(row.suggestions_json),
    severity: row.severity,
    sourceRefs: parseObjectList(row.source_refs_json),
    confidence: row.confidence,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
