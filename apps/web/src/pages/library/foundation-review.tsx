import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type {
  FoundationCandidate,
} from "../../shared/api/types";
import {
  getFoundationCandidates,
  getRunDetail,
  retryFoundation,
  resolveFoundationCandidate,
  resolveFoundationCandidateSet,
} from "../../shared/api/automation";
import { queryKeys } from "../../shared/query/keys";
import { ErrorNote } from "../../shared/ui";

const liveRunStatuses = new Set([
  "pending",
  "running",
  "paused",
  "awaiting_user",
  "failed_recoverable",
]);

export function FoundationReview({
  projectId,
  runId,
  onComplete,
}: {
  projectId: string;
  runId: string;
  onComplete: () => void;
}) {
  const client = useQueryClient();
  const [currentRunId, setCurrentRunId] = useState(runId);
  const retryRequestId = useState(() => crypto.randomUUID())[0];
  const candidates = useQuery({
    queryKey: queryKeys.foundation(projectId),
    queryFn: ({ signal }) => getFoundationCandidates(projectId, signal),
    refetchInterval: (query) => {
      const hasOpenSet = query.state.data?.some(
        (value) => value.set.status === "open" || value.set.status === "partially_adopted",
      );
      return hasOpenSet || query.state.data?.length === 0 ? 1_500 : false;
    },
  });
  const run = useQuery({
    queryKey: queryKeys.run(currentRunId),
    queryFn: ({ signal }) => getRunDetail(projectId, currentRunId, signal),
    refetchInterval: (query) =>
      query.state.data && liveRunStatuses.has(query.state.data.run.status)
        ? 1_500
        : false,
  });
  const retry = useMutation({
    mutationFn: () =>
      retryFoundation(projectId, {
        requestId: retryRequestId,
        sourceRunId: currentRunId,
      }),
    onSuccess: async (value) => {
      setCurrentRunId(value.run.id);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.foundation(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
        client.invalidateQueries({ queryKey: queryKeys.story(projectId) }),
      ]);
    },
  });
  const resolve = useMutation({
    mutationFn: (input: {
      candidate: FoundationCandidate;
      action: "adopt" | "discard";
      payload?: Record<string, unknown>;
    }) =>
      resolveFoundationCandidate(
        input.candidate.id,
        input.action,
        input.payload,
        input.candidate.updatedAt,
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.foundation(projectId) });
      await client.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      await client.invalidateQueries({ queryKey: queryKeys.story(projectId) });
    },
  });
  const resolveSet = useMutation({
    mutationFn: (input: { setId: string; action: "adopt-all" | "discard-all" }) => {
      const current = candidates.data?.find((value) => value.set.id === input.setId);
      return resolveFoundationCandidateSet(
        input.setId,
        input.action,
        current
          ? Object.fromEntries(
              current.candidates
                .filter((candidate) => candidate.status === "pending")
                .map((candidate) => [candidate.id, candidate.updatedAt]),
            )
          : undefined,
      );
    },
    onSuccess: async (value) => {
      await client.invalidateQueries({ queryKey: queryKeys.foundation(projectId) });
      await client.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      await client.invalidateQueries({ queryKey: queryKeys.story(projectId) });
      if (value.set.status === "adopted") onComplete();
    },
  });
  const error = candidates.error ?? run.error ?? retry.error ?? resolve.error ?? resolveSet.error;
  const activeSet = candidates.data?.find((value) =>
    ["open", "partially_adopted", "adopted"].includes(value.set.status),
  );
  const isPlanSet = Boolean(
    activeSet?.candidates.some((candidate) => candidate.kind === "plan"),
  );
  const pending = retry.isPending || resolve.isPending || resolveSet.isPending;

  return (
    <section className="cf-card cf-foundation-review" aria-label="AI 开书候选审核">
      <div className="cf-section-title">
        <div>
          <p className="cf-eyebrow">FOUNDATION REVIEW</p>
          <h2>先确认这份开书方案</h2>
          <p>候选只会写入草案。你可以编辑、单独采用或暂不采用，确认后再进入作品首页。</p>
        </div>
        {run.data?.run.status && liveRunStatuses.has(run.data.run.status) ? (
          <span className="cf-badge"><LoaderCircle size={14} />正在整理</span>
        ) : null}
      </div>
      {error ? <ErrorNote error={error} /> : null}
      {run.data?.run.status === "failed" ? (
        <div className="cf-inline-warning" role="alert">
          <strong>AI 开书任务失败</strong>
          <p>候选没有写入正式作品；原始作品和这次失败记录都已保留，可以在当前作品上安全重试。</p>
          <button type="button" className="cf-primary" disabled={pending} onClick={() => retry.mutate()}>
            {retry.isPending ? <LoaderCircle size={15} /> : <RotateCcw size={15} />}重新运行 AI 开书
          </button>
        </div>
      ) : null}
      {!activeSet && run.data?.run.status !== "failed" ? (
        <p role="status">正在等待 AI 候选结果，页面会自动刷新…</p>
      ) : null}
      {activeSet ? (
        <>
          <div className={isPlanSet ? "cf-foundation-candidate-grid cf-foundation-plan-grid" : "cf-foundation-candidate-grid"}>
            {activeSet.candidates.map((candidate) => (
              <FoundationCandidateCard
                key={candidate.id}
                candidate={candidate}
                pending={pending}
                onResolve={(action, payload) =>
                  resolve.mutate(
                    payload
                      ? { candidate, action, payload }
                      : { candidate, action },
                  )
                }
              />
            ))}
          </div>
          <div className="cf-actions cf-foundation-review-actions">
            <button
              type="button"
              className="cf-button"
              disabled={pending}
              onClick={() => resolveSet.mutate({ setId: activeSet.set.id, action: "discard-all" })}
            >
              <X size={15} />全部暂不采用
            </button>
            {isPlanSet ? (
              <span className="cf-inline-hint">三份路线互斥，请先选择一份方案</span>
            ) : (
              <button
                type="button"
                className="cf-primary"
                disabled={pending || activeSet.set.status === "adopted"}
                onClick={() => resolveSet.mutate({ setId: activeSet.set.id, action: "adopt-all" })}
              >
                <Check size={15} />采用整组方案
              </button>
            )}
            {activeSet.set.status === "adopted" ? (
              <button type="button" className="cf-primary" onClick={onComplete}>进入作品首页</button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function FoundationCandidateCard({
  candidate,
  pending,
  onResolve,
}: {
  candidate: FoundationCandidate;
  pending: boolean;
  onResolve: (
    action: "adopt" | "discard",
    payload?: Record<string, unknown>,
  ) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [payloadText, setPayloadText] = useState(() =>
    JSON.stringify(candidate.editedPayload ?? candidate.payload, null, 2),
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const adopt = () => {
    try {
      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      onResolve("adopt", payload);
      setParseError(null);
    } catch {
      setParseError("候选编辑内容不是有效 JSON，请检查后再采用。");
    }
  };
  return (
    <article className="cf-foundation-candidate" data-kind={candidate.kind} data-status={candidate.status}>
      <header>
        <strong>{candidate.label}</strong>
        <span className="cf-badge">{candidate.kind === "intent" ? "作品定位" : candidate.kind === "compass" ? "故事主线" : candidate.kind === "plan" ? "完整方案" : "设定条目"}</span>
      </header>
      {candidate.kind === "plan" ? (
        <FoundationPlanPreview payload={candidate.editedPayload ?? candidate.payload} />
      ) : (
        <pre>{JSON.stringify(candidate.editedPayload ?? candidate.payload, null, 2)}</pre>
      )}
      {candidate.status === "pending" ? (
        <>
          <button type="button" className="cf-text-link" onClick={() => setEditing((value) => !value)}>
            {editing ? "收起编辑" : "编辑候选"}
          </button>
          {editing ? <textarea aria-label={`编辑候选：${candidate.label}`} value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={7} /> : null}
          {parseError ? <p className="cf-error-text" role="alert">{parseError}</p> : null}
          <div className="cf-actions">
            <button type="button" className="cf-primary" disabled={pending} onClick={adopt}><Check size={14} />{candidate.kind === "plan" ? "采用此方案" : "采用此项"}</button>
            <button type="button" className="cf-button" disabled={pending} onClick={() => onResolve("discard")}><X size={14} />暂不采用</button>
          </div>
        </>
      ) : <small>{candidate.status === "adopted" ? "已采用" : "已暂不采用"}</small>}
    </article>
  );
}

function FoundationPlanPreview({ payload }: { payload: Record<string, unknown> }) {
  const intent = asRecord(payload.intent);
  const compass = asRecord(payload.compass);
  const entities = Array.isArray(payload.entities)
    ? payload.entities
        .map(asRecord)
        .filter((entity): entity is Record<string, unknown> => Boolean(entity))
    : [];
  const riskNotes = Array.isArray(payload.riskNotes)
    ? payload.riskNotes.filter((value): value is string => typeof value === "string")
    : [];
  return (
    <div className="cf-foundation-plan-preview">
      <div className="cf-foundation-plan-hero">
        <h3>{textValue(payload.title) || "未命名方案"}</h3>
        <p>{textValue(payload.angle)}</p>
      </div>
      <dl>
        <div><dt>方案理由</dt><dd>{textValue(payload.rationale)}</dd></div>
        <div><dt>读者承诺</dt><dd>{textValue(intent.promise)}</dd></div>
        <div><dt>故事主线</dt><dd>{textValue(compass.corePromise)}</dd></div>
        <div><dt>关键设定</dt><dd>{entities.map((entity) => textValue(entity.name)).filter(Boolean).join("、") || "待补充"}</dd></div>
      </dl>
      {riskNotes.length ? <div className="cf-foundation-plan-risks"><strong>主要风险</strong><ul>{riskNotes.map((risk) => <li key={risk}>{risk}</li>)}</ul></div> : null}
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
