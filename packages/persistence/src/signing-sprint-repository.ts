import {
  randomUuid,
  type SigningSprintCandidate,
  type SigningSprintCandidateStatus,
  type SigningSprintState,
  type SigningSprintStep,
  type SigningSprintStatus,
  type SigningSprintTask,
  type SigningSprintWorkflow,
} from "@narralume/domain";

import type { NarrativeDatabase } from "./database.js";
import { PersistenceNotFoundError } from "./project-repository.js";

export function emptySigningSprintState(): SigningSprintState {
  return {
    direction: null,
    positioning: null,
    storyEngine: null,
    packaging: [],
    selectedPackagingId: null,
    openingBlueprint: null,
    openingCheck: null,
    readiness: null,
  };
}

export class SqliteSigningSprintRepository {
  constructor(private readonly database: NarrativeDatabase) {}

  get(projectId: string): SigningSprintWorkflow | null {
    const row = this.database.raw
      .prepare("SELECT * FROM signing_sprint_workflows WHERE project_id = ?")
      .get(projectId) as WorkflowRow | undefined;
    return row ? mapWorkflow(row) : null;
  }

  getById(id: string): SigningSprintWorkflow | null {
    const row = this.database.raw
      .prepare("SELECT * FROM signing_sprint_workflows WHERE id = ?")
      .get(id) as WorkflowRow | undefined;
    return row ? mapWorkflow(row) : null;
  }

  require(projectId: string): SigningSprintWorkflow {
    const workflow = this.get(projectId);
    if (!workflow)
      throw new PersistenceNotFoundError("signing_sprint", projectId);
    return workflow;
  }

  ensure(projectId: string, now: string): SigningSprintWorkflow {
    const existing = this.get(projectId);
    if (existing) return existing;
    const workflow: SigningSprintWorkflow = {
      id: randomUuid(),
      projectId,
      status: "active",
      currentStep: "direction",
      completedSteps: [],
      state: emptySigningSprintState(),
      selectedStrategyId: null,
      knowledgeRefs: [],
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.database.raw
      .prepare(
        `INSERT INTO signing_sprint_workflows(
          id, project_id, status, current_step, completed_steps_json, state_json,
          selected_strategy_id, knowledge_refs_json, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        workflow.id,
        workflow.projectId,
        workflow.status,
        workflow.currentStep,
        JSON.stringify(workflow.completedSteps),
        JSON.stringify(workflow.state),
        workflow.selectedStrategyId,
        JSON.stringify(workflow.knowledgeRefs),
        workflow.version,
        workflow.createdAt,
        workflow.updatedAt,
      );
    return this.require(projectId);
  }

  update(
    id: string,
    input: {
      expectedVersion: number;
      currentStep?: SigningSprintStep;
      status?: SigningSprintStatus;
      completedSteps?: SigningSprintStep[];
      state?: Partial<SigningSprintState>;
      selectedStrategyId?: string | null;
      knowledgeRefs?: string[];
      now: string;
    },
  ): SigningSprintWorkflow {
    return this.database.transaction(() => {
      const current = this.getById(id);
      if (!current) throw new PersistenceNotFoundError("signing_sprint", id);
      if (current.version !== input.expectedVersion) {
        throw new SigningSprintPersistenceError(
          "signing_sprint.version_conflict",
          "The quick-start workflow changed elsewhere; refresh and try again",
        );
      }
      const nextState = input.state
        ? { ...current.state, ...input.state }
        : current.state;
      const nextCompleted = input.completedSteps ?? current.completedSteps;
      this.database.raw
        .prepare(
          `UPDATE signing_sprint_workflows SET
            status = ?, current_step = ?, completed_steps_json = ?, state_json = ?,
            selected_strategy_id = ?, knowledge_refs_json = ?, version = version + 1,
            updated_at = ? WHERE id = ? AND version = ?`,
        )
        .run(
          input.status ?? current.status,
          input.currentStep ?? current.currentStep,
          JSON.stringify(nextCompleted),
          JSON.stringify(nextState),
          input.selectedStrategyId === undefined
            ? current.selectedStrategyId
            : input.selectedStrategyId,
          JSON.stringify(input.knowledgeRefs ?? current.knowledgeRefs),
          input.now,
          id,
          input.expectedVersion,
        );
      return this.getById(id)!;
    });
  }

  listCandidates(
    projectId: string,
    task?: SigningSprintTask,
  ): SigningSprintCandidate[] {
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM signing_sprint_candidates
         WHERE project_id = ? AND (? IS NULL OR task = ?)
         ORDER BY created_at DESC, id DESC`,
      )
      .all(projectId, task ?? null, task ?? null) as unknown as CandidateRow[];
    return rows.map(mapCandidate);
  }

  getCandidate(id: string): SigningSprintCandidate | null {
    const row = this.database.raw
      .prepare("SELECT * FROM signing_sprint_candidates WHERE id = ?")
      .get(id) as CandidateRow | undefined;
    return row ? mapCandidate(row) : null;
  }

  requireCandidate(id: string): SigningSprintCandidate {
    const candidate = this.getCandidate(id);
    if (!candidate)
      throw new PersistenceNotFoundError("signing_sprint_candidate", id);
    return candidate;
  }

  insertCandidate(candidate: SigningSprintCandidate): SigningSprintCandidate {
    const existing = this.getCandidate(candidate.id);
    if (existing) return existing;
    this.database.raw
      .prepare(
        `INSERT INTO signing_sprint_candidates(
          id, workflow_id, project_id, task, status, payload_json, rationale,
          provenance_json, base_workflow_version, created_at, decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        candidate.id,
        candidate.workflowId,
        candidate.projectId,
        candidate.task,
        candidate.status,
        JSON.stringify(candidate.payload),
        candidate.rationale,
        JSON.stringify(candidate.provenance),
        candidate.baseWorkflowVersion,
        candidate.createdAt,
        candidate.decidedAt,
      );
    return this.requireCandidate(candidate.id);
  }

  decideCandidate(
    id: string,
    status: SigningSprintCandidateStatus,
    now: string,
  ): SigningSprintCandidate {
    this.requireCandidate(id);
    this.database.raw
      .prepare(
        "UPDATE signing_sprint_candidates SET status = ?, decided_at = ? WHERE id = ?",
      )
      .run(status, now, id);
    return this.requireCandidate(id);
  }
}

export class SigningSprintPersistenceError extends Error {
  readonly code: string;
  readonly statusCode = 409;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SigningSprintPersistenceError";
    this.code = code;
  }
}

interface WorkflowRow {
  id: string;
  project_id: string;
  status: SigningSprintStatus;
  current_step: SigningSprintStep;
  completed_steps_json: string;
  state_json: string;
  selected_strategy_id: string | null;
  knowledge_refs_json: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface CandidateRow {
  id: string;
  workflow_id: string;
  project_id: string;
  task: SigningSprintTask;
  status: SigningSprintCandidateStatus;
  payload_json: string;
  rationale: string;
  provenance_json: string;
  base_workflow_version: number;
  created_at: string;
  decided_at: string | null;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapWorkflow(row: WorkflowRow): SigningSprintWorkflow {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    currentStep: row.current_step,
    completedSteps: parseJson<SigningSprintStep[]>(
      row.completed_steps_json,
      [],
    ),
    state: parseJson<SigningSprintState>(
      row.state_json,
      emptySigningSprintState(),
    ),
    selectedStrategyId: row.selected_strategy_id,
    knowledgeRefs: parseJson<string[]>(row.knowledge_refs_json, []),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCandidate(row: CandidateRow): SigningSprintCandidate {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    projectId: row.project_id,
    task: row.task,
    status: row.status,
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    rationale: row.rationale,
    provenance: parseJson<SigningSprintCandidate["provenance"]>(
      row.provenance_json,
      {
        kind: "model",
        sourceRefs: [],
        runId: null,
      },
    ),
    baseWorkflowVersion: row.base_workflow_version,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}
