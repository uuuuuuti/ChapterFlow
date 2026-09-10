import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { BookOpen, Clock3, Link2, Plus, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import {
  useCanonEntities,
  useCanonFacts,
  useForeshadows,
  useRelationships,
  useRelationshipHistory,
  useStory,
  useStoryEvidence,
  useTimelineEvents,
} from "../../entities/project/queries";
import {
  createCanonEntity,
  createCanonFact,
  createRelationshipEvent,
  reviseRelationshipEvent,
  createTimelineEvent,
  createForeshadow,
  removeCanonEntity,
  removeRelationshipEvent,
  removeTimelineEvent,
  removeForeshadow,
  promoteCanonFact,
  reviseCanonFact,
  withdrawCanonFact,
  updateAuthorIntent,
  updateCanonEntity,
  updateForeshadow,
  updateTimelineEvent,
} from "../../shared/api/story";
import { queryKeys } from "../../shared/query/keys";
import { ConfirmDialog, ErrorNote, ResourceErrorState } from "../../shared/ui";
import type { AuthorIntent, CanonEntity, CanonFact, Foreshadow, OutlineNode, RelationshipEvent, StoryEvidenceRef, TimelineEvent } from "../../shared/api/types";

type Section = "intent" | "characters" | "world" | "facts" | "relations" | "timeline" | "foreshadow";
const sections: { id: Section; label: string; icon: typeof Users }[] = [
  { id: "intent", label: "作品定位", icon: BookOpen },
  { id: "characters", label: "人物", icon: Users },
  { id: "world", label: "世界观", icon: Sparkles },
  { id: "facts", label: "事实与锁定", icon: ShieldCheck },
  { id: "relations", label: "关系", icon: Link2 },
  { id: "timeline", label: "时间线", icon: Clock3 },
  { id: "foreshadow", label: "伏笔", icon: BookOpen },
];

export function KnowledgePage() {
  const { projectId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const active = (location.pathname.split("/").pop() as Section) || "intent";
  const section: Section = sections.some((item) => item.id === active) ? active : "intent";
  const needsStory = section === "intent" || section === "facts" || section === "timeline" || section === "foreshadow";
  const needsEntities = section === "characters" || section === "world" || section === "facts" || section === "relations";
  const needsFacts = section === "facts";
  const needsRelationships = section === "relations";
  const needsTimeline = section === "timeline";
  const needsForeshadows = section === "foreshadow";
  const story = useStory(projectId, { enabled: needsStory });
  const evidence = useStoryEvidence(projectId);
  const entitiesQuery = useCanonEntities(projectId, { enabled: needsEntities });
  const factsQuery = useCanonFacts(projectId, { enabled: needsFacts });
  const relationshipsQuery = useRelationships(projectId, { enabled: needsRelationships });
  const relationshipHistoryQuery = useRelationshipHistory(projectId, { enabled: needsRelationships });
  const timelineQuery = useTimelineEvents(projectId, { enabled: needsTimeline });
  const foreshadowsQuery = useForeshadows(projectId, { enabled: needsForeshadows });

  if (evidence.isPending || (needsStory && story.isPending) || (needsEntities && entitiesQuery.isPending) || (needsFacts && factsQuery.isPending) || (needsRelationships && relationshipsQuery.isPending) || (needsRelationships && relationshipHistoryQuery.isPending) || (needsTimeline && timelineQuery.isPending) || (needsForeshadows && foreshadowsQuery.isPending)) {
    return <div className="cf-page" role="status">正在打开作品设定…</div>;
  }
  const resourceError = evidence.isError
    ? evidence.error
    : needsStory && story.isError
    ? story.error
    : needsEntities && entitiesQuery.isError
      ? entitiesQuery.error
      : needsFacts && factsQuery.isError
        ? factsQuery.error
        : needsRelationships && relationshipsQuery.isError
          ? relationshipsQuery.error
          : needsRelationships && relationshipHistoryQuery.isError
            ? relationshipHistoryQuery.error
          : needsTimeline && timelineQuery.isError
            ? timelineQuery.error
            : needsForeshadows && foreshadowsQuery.isError
              ? foreshadowsQuery.error
              : null;
  if (resourceError) return <div className="cf-page"><ResourceErrorState error={resourceError} backHref="/books" backLabel="回到作品库" title="找不到这本作品的设定" description="作品设定暂时无法打开，这本作品可能已经被移除或链接已过期。" /></div>;

  const storyData = story.data;
  const entities = needsEntities ? entitiesQuery.data ?? [] : storyData?.entities ?? [];
  const facts = needsFacts ? factsQuery.data ?? [] : storyData?.facts ?? [];
  const relationships = needsRelationships ? relationshipsQuery.data ?? [] : storyData?.relationships ?? [];
  const timeline = needsTimeline ? timelineQuery.data ?? [] : storyData?.timeline ?? [];
  const foreshadows = needsForeshadows ? foreshadowsQuery.data ?? [] : storyData?.foreshadows ?? [];
  return (
    <div className="cf-page cf-knowledge-page">
      <div className="cf-page-title">
        <div><p className="cf-eyebrow">STORY BIBLE</p><h1>作品设定</h1><p>让人物、世界和伏笔成为写作时随时可查的故事底稿。</p></div>
      </div>
      <div className="cf-knowledge-tabs" role="tablist" aria-label="作品设定分区">
        {sections.map((item) => { const Icon = item.icon; return <button key={item.id} role="tab" aria-selected={section === item.id} onClick={() => navigate(`/books/${projectId}/knowledge/${item.id}`)}><Icon size={16} />{item.label}</button>; })}
      </div>
      {section === "intent" ? <IntentSection projectId={projectId} intent={storyData?.intent ?? null} /> : null}
      {section === "characters" ? <EntitySection projectId={projectId} entities={entities.filter((entity) => entity.type === "character")} kind="character" title="人物" hint="人物的身份、目标和状态会被写作助手引用。" evidence={evidence.data ?? []} /> : null}
      {section === "world" ? <EntitySection projectId={projectId} entities={entities.filter((entity) => entity.type !== "character")} kind="location" title="世界观" hint="地点、组织、物品、规则和概念共用故事事实源。" evidence={evidence.data ?? []} /> : null}
      {section === "facts" ? <FactsSection projectId={projectId} entities={entities} facts={facts} outline={storyData?.outline ?? []} evidence={evidence.data ?? []} /> : null}
      {section === "relations" ? <RelationsSection projectId={projectId} entities={entities} relationships={relationships} history={relationshipHistoryQuery.data ?? []} evidence={evidence.data ?? []} /> : null}
      {section === "timeline" ? <TimelineSection projectId={projectId} items={timeline} evidence={evidence.data ?? []} /> : null}
      {section === "foreshadow" ? <ForeshadowSection projectId={projectId} items={foreshadows} outline={storyData?.outline ?? []} evidence={evidence.data ?? []} /> : null}
    </div>
  );
}

type StoryInvalidationScope =
  | "story"
  | "entities"
  | "facts"
  | "relationships"
  | "relationshipHistory"
  | "timeline"
  | "foreshadows"
  | "overview";

function useInvalidateStory(
  projectId: string,
  scopes: readonly StoryInvalidationScope[],
) {
  const client = useQueryClient();
  const keys: Record<StoryInvalidationScope, readonly unknown[]> = {
    story: queryKeys.story(projectId),
    entities: queryKeys.entities(projectId),
    facts: queryKeys.facts(projectId),
    relationships: queryKeys.relationships(projectId),
    relationshipHistory: queryKeys.relationshipHistory(projectId),
    timeline: queryKeys.timeline(projectId),
    foreshadows: queryKeys.foreshadows(projectId),
    overview: queryKeys.overview(projectId),
  };
  return () =>
    Promise.all(
      scopes.map((scope) => client.invalidateQueries({ queryKey: keys[scope] })),
    );
}

function IntentSection({ projectId, intent }: { projectId: string; intent: AuthorIntent | null }) {
  const invalidate = useInvalidateStory(projectId, ["story", "overview"]);
  const [promise, setPromise] = useState(intent?.promise ?? "");
  const [audience, setAudience] = useState(intent?.audience ?? "");
  const [tone, setTone] = useState(intent?.tone ?? "");
  const [ending, setEnding] = useState(intent?.endingDirection ?? "");
  const [focus, setFocus] = useState(intent?.currentFocus ?? "");
  const [themes, setThemes] = useState((intent?.themes ?? []).join("\n"));
  const [boundaries, setBoundaries] = useState((intent?.boundaries ?? []).join("\n"));
  const [lockedFields, setLockedFields] = useState<string[]>(intent?.lockedFields ?? []);
  const isLocked = (field: string) => lockedFields.includes(field);
  const toggleLocked = (field: string) => {
    setLockedFields((current) =>
      current.includes(field)
        ? current.filter((value) => value !== field)
        : [...current, field],
    );
  };
  const mutation = useMutation({
    mutationFn: () =>
      updateAuthorIntent(projectId, {
        promise: promise.trim() || null,
        audience: audience.trim() || null,
        tone: tone.trim() || null,
        endingDirection: ending.trim() || null,
        currentFocus: focus.trim() || null,
        themes: lines(themes),
        boundaries: lines(boundaries),
        lockedFields,
        expectedUpdatedAt: intent?.updatedAt ?? null,
      }),
    onSuccess: invalidate,
  });
  return (
    <section className="cf-card cf-knowledge-card">
      <div className="cf-section-title">
        <div>
          <h2>作品定位</h2>
          <p>先说清楚这本书想让读者期待什么，后续的章纲和检查才有方向。</p>
        </div>
        <span className="cf-badge">作者设定</span>
      </div>
      <form
        className="cf-knowledge-form"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <IntentField
          label="一句话卖点"
          locked={isLocked("promise")}
          onToggle={() => toggleLocked("promise")}
        >
          <textarea
            aria-label="一句话卖点"
            rows={3}
            value={promise}
            disabled={isLocked("promise")}
            onChange={(event) => setPromise(event.target.value)}
            placeholder="读者为什么会想继续看？"
          />
        </IntentField>
        <div className="cf-form-grid">
          <IntentField
            label="目标读者"
            locked={isLocked("audience")}
            onToggle={() => toggleLocked("audience")}
          >
            <input
              aria-label="目标读者"
              value={audience}
              disabled={isLocked("audience")}
              onChange={(event) => setAudience(event.target.value)}
              placeholder="例如：喜欢高密度反转的都市读者"
            />
          </IntentField>
          <IntentField
            label="整体风格"
            locked={isLocked("tone")}
            onToggle={() => toggleLocked("tone")}
          >
            <input
              aria-label="整体风格"
              value={tone}
              disabled={isLocked("tone")}
              onChange={(event) => setTone(event.target.value)}
              placeholder="例如：轻快、克制、爽点明确"
            />
          </IntentField>
        </div>
        <div className="cf-form-grid">
          <IntentField
            label="长期主线"
            locked={isLocked("currentFocus")}
            onToggle={() => toggleLocked("currentFocus")}
          >
            <textarea
              aria-label="长期主线"
              rows={3}
              value={focus}
              disabled={isLocked("currentFocus")}
              onChange={(event) => setFocus(event.target.value)}
              placeholder="主角最终要走到哪里？"
            />
          </IntentField>
          <IntentField
            label="结局方向"
            locked={isLocked("endingDirection")}
            onToggle={() => toggleLocked("endingDirection")}
          >
            <textarea
              aria-label="结局方向"
              rows={3}
              value={ending}
              disabled={isLocked("endingDirection")}
              onChange={(event) => setEnding(event.target.value)}
              placeholder="可以先写一个模糊方向"
            />
          </IntentField>
        </div>
        <div className="cf-form-grid">
          <IntentField
            label="核心主题（每行一项）"
            locked={isLocked("themes")}
            onToggle={() => toggleLocked("themes")}
          >
            <textarea
              aria-label="核心主题（每行一项）"
              rows={4}
              value={themes}
              disabled={isLocked("themes")}
              onChange={(event) => setThemes(event.target.value)}
            />
          </IntentField>
          <IntentField
            label="创作禁区（每行一项）"
            locked={isLocked("boundaries")}
            onToggle={() => toggleLocked("boundaries")}
          >
            <textarea
              aria-label="创作禁区（每行一项）"
              rows={4}
              value={boundaries}
              disabled={isLocked("boundaries")}
              onChange={(event) => setBoundaries(event.target.value)}
            />
          </IntentField>
        </div>
        <p className="cf-muted">锁定字段会在后续 AI 规划和检查中作为作者硬约束；需要修改时先取消锁定。</p>
        {mutation.isError ? <ErrorNote error={mutation.error} /> : null}
        <button className="cf-primary" disabled={mutation.isPending}>
          {mutation.isPending ? "正在保存…" : "保存作品定位"}
        </button>
      </form>
    </section>
  );
}

function IntentField({
  label,
  locked,
  onToggle,
  children,
}: {
  label: string;
  locked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="cf-knowledge-field">
      <div className="cf-knowledge-field__head">
        <span>{label}</span>
        <label className="cf-check">
          <input type="checkbox" checked={locked} onChange={onToggle} />
          {locked ? "已锁定" : "锁定"}
        </label>
      </div>
      {children}
    </div>
  );
}

function EntitySection({ projectId, entities, kind, title, hint, evidence }: { projectId: string; entities: CanonEntity[]; kind: CanonEntity["type"]; title: string; hint: string; evidence: StoryEvidenceRef[] }) {
  const invalidate = useInvalidateStory(projectId, ["entities", "story", "overview"]);
  const [editing, setEditing] = useState<CanonEntity | null>(null);
  const [creating, setCreating] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CanonEntity | null>(null);
  const save = useMutation({ mutationFn: (input: { entity: CanonEntity | null; name: string; description: string; type: CanonEntity["type"] }) => input.entity ? updateCanonEntity(projectId, input.entity.id, { name: input.name, description: input.description || null, aliases: input.entity.aliases, attributes: input.entity.attributes, status: input.entity.status, expectedUpdatedAt: input.entity.updatedAt }) : createCanonEntity(projectId, { type: input.type, name: input.name, aliases: [], description: input.description || null, attributes: {} }), onSuccess: async () => { setEditing(null); setCreating(false); await invalidate(); } });
  const remove = useMutation({ mutationFn: (entity: CanonEntity) => removeCanonEntity(projectId, entity), onSuccess: async () => { setRemoveTarget(null); await invalidate(); } });
  return <section className="cf-card cf-knowledge-card"><div className="cf-section-title"><div><h2>{title}</h2><p>{hint}</p></div><button className="cf-primary" onClick={() => setCreating(true)}><Plus size={16} />新增{title === "人物" ? "人物" : "设定"}</button></div>{entities.length ? <div className="cf-entity-grid">{entities.map((entity) => { const appearances = evidence.filter((item) => item.entityIds.includes(entity.id)); return <article className="cf-entity-card" key={entity.id}><div><span className="cf-badge">{entity.type === "character" ? "人物" : entity.type === "location" ? "地点" : entity.type === "organization" ? "组织" : entity.type === "item" ? "物品" : entity.type === "rule" ? "规则" : "概念"}</span><h3>{entity.name}</h3></div><p>{entity.description || "还没有写下描述。"}</p>{appearances.length ? <div className="cf-entity-appearances"><small>出场证据 · {appearances.length} 个正文/大纲版本</small>{appearances.slice(0, 3).map((item) => <Link key={`${item.sourceType}:${item.sourceId}`} to={evidenceHref(projectId, item)}>{item.title}{item.sourceType === "document_version" ? " · 正文版本" : item.sourceType === "outline_node" ? " · 大纲" : " · 正文"}</Link>)}{appearances.length > 3 ? <small>还有 {appearances.length - 3} 个证据版本</small> : null}</div> : <small className="cf-muted">暂时没有正文或大纲出场证据</small>}<footer><button className="cf-text-link" onClick={() => setEditing(entity)}>编辑</button><button className="cf-text-danger" onClick={() => setRemoveTarget(entity)}>移除</button></footer></article>; })}</div> : <div className="cf-empty"><Users size={38} /><h3>还没有{title}</h3><p>先记录一个，写作时就不用反复翻找旧稿。</p></div>}{creating || editing ? <EntityDialog entity={editing} defaultType={kind} pending={save.isPending} onCancel={() => { setCreating(false); setEditing(null); }} onSave={(input) => save.mutate({ ...input, entity: editing })} /> : null}{removeTarget ? <ConfirmDialog title="移除这条设定？" confirmLabel="移除" danger pending={remove.isPending} onCancel={() => setRemoveTarget(null)} onConfirm={() => remove.mutate(removeTarget)}><p>只移除故事设定，不会删除引用它的正文。</p></ConfirmDialog> : null}</section>;
}

function EntityDialog({ entity, defaultType, pending, onCancel, onSave }: { entity: CanonEntity | null; defaultType: CanonEntity["type"]; pending: boolean; onCancel: () => void; onSave: (input: { name: string; description: string; type: CanonEntity["type"] }) => void }) {
  const [name, setName] = useState(entity?.name ?? "");
  const [description, setDescription] = useState(entity?.description ?? "");
  const [type, setType] = useState<CanonEntity["type"]>(entity?.type ?? defaultType);
  return <div className="cf-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}><form className="cf-modal cf-form" onSubmit={(event) => { event.preventDefault(); onSave({ name: name.trim(), description: description.trim(), type }); }}><button type="button" className="cf-modal-close" aria-label="关闭" onClick={onCancel}><X size={16} /></button><h2>{entity ? "编辑设定" : "新增设定"}</h2><label>名称<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label><label>类型<select value={type} disabled={Boolean(entity)} onChange={(event) => setType(event.target.value as CanonEntity["type"])}><option value="character">人物</option><option value="location">地点</option><option value="organization">组织</option><option value="item">物品</option><option value="rule">规则</option><option value="concept">概念</option></select></label><label>描述<textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="身份、特征、目标或使用方式" /></label><div className="cf-modal-actions"><button type="button" className="cf-button" onClick={onCancel}>取消</button><button className="cf-primary" disabled={pending || !name.trim()}>{pending ? "正在保存…" : "保存设定"}</button></div></form></div>;
}

type FactDraft = {
  subjectId: string;
  predicate: string;
  objectEntityId: string | null;
  value?: string;
  validFromNodeId: string | null;
  validToNodeId: string | null;
  knowledgeScope: CanonFact["knowledgeScope"];
  knowledgeSubjectId: string | null;
  authority: CanonFact["authority"];
  confidence: number;
  confirmLockedRevision: boolean;
};

function FactsSection({ projectId, entities, facts, outline, evidence }: { projectId: string; entities: CanonEntity[]; facts: CanonFact[]; outline: OutlineNode[]; evidence: StoryEvidenceRef[] }) {
  const invalidate = useInvalidateStory(projectId, ["facts", "story", "overview"]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CanonFact | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<CanonFact | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");
  const create = useMutation({
    mutationFn: (draft: FactDraft) => createCanonFact(projectId, toCreateFactInput(draft)),
    onSuccess: async () => { setCreating(false); await invalidate(); },
  });
  const revise = useMutation({
    mutationFn: (input: { fact: CanonFact; draft: FactDraft }) => reviseCanonFact(projectId, input.fact.id, toReviseFactInput(input.draft)),
    onSuccess: async () => { setEditing(null); await invalidate(); },
  });
  const promote = useMutation({
    mutationFn: (fact: CanonFact) => promoteCanonFact(projectId, fact.id, fact.authority === "inferred" ? "confirmed" : "locked"),
    onSuccess: invalidate,
  });
  const withdraw = useMutation({
    mutationFn: (fact: CanonFact) => withdrawCanonFact(projectId, fact.id, { reason: withdrawReason.trim() || "作者撤回该事实", confirmLockedWithdrawal: fact.authority === "locked" }),
    onSuccess: async () => { setWithdrawTarget(null); setWithdrawReason(""); await invalidate(); },
  });
  const names = new Map(entities.map((entity) => [entity.id, entity.name]));
  const chapterNames = new Map(outline.map((node) => [node.id, node.title]));
  return <section className="cf-card cf-knowledge-card"><div className="cf-section-title"><div><h2>事实与锁定</h2><p>把“可能成立”的信息与作者确认过的事实分开，锁定后 AI 不会静默改写。</p></div><button className="cf-primary" disabled={!entities.length} onClick={() => setCreating(true)}><Plus size={16} />新增事实</button></div>{facts.length ? <div className="cf-list">{facts.map((fact) => <div className="cf-list-row cf-fact-row" key={fact.id}><div><div className="cf-fact-title"><strong>{names.get(fact.subjectId) ?? "未知对象"}</strong><span>{fact.predicate}</span><strong>{fact.objectEntityId ? names.get(fact.objectEntityId) ?? "未知对象" : formatFactValue(fact.value, names)}</strong></div><p>{fact.knowledgeScope} · 置信度 {Math.round(fact.confidence * 100)}% · 来源 {fact.sourceType}{fact.sourceId ? ` · ${fact.sourceId}` : ""}{fact.validFromNodeId ? ` · 生效于 ${chapterNames.get(fact.validFromNodeId) ?? "已移除章节"}` : ""}{fact.validToNodeId ? ` · 截止于 ${chapterNames.get(fact.validToNodeId) ?? "已移除章节"}` : ""}</p><EvidenceLinks evidence={evidence} projectId={projectId} sourceType={fact.sourceType} sourceId={fact.sourceId} outlineNodeIds={[fact.validFromNodeId, fact.validToNodeId]} /></div><span className={`cf-badge cf-authority-${fact.authority}`}>{fact.authority === "locked" ? "已锁定" : fact.authority === "confirmed" ? "已确认" : fact.authority === "inferred" ? "推断" : "候选"}</span><div className="cf-actions"><button className="cf-text-link" onClick={() => setEditing(fact)}>编辑</button>{fact.authority !== "locked" ? <button className="cf-text-link" disabled={promote.isPending} onClick={() => promote.mutate(fact)}>{fact.authority === "inferred" ? "确认" : "锁定"}</button> : null}<button className="cf-text-danger" onClick={() => setWithdrawTarget(fact)}>撤回</button></div></div>)}</div> : <div className="cf-empty"><ShieldCheck size={38} /><h3>还没有事实记录</h3><p>人物和世界设定保存后，可以把关键关系写成可验证事实。</p></div>}{create.isError ? <ErrorNote error={create.error} /> : null}{revise.isError ? <ErrorNote error={revise.error} /> : null}{promote.isError ? <ErrorNote error={promote.error} /> : null}{withdraw.isError ? <ErrorNote error={withdraw.error} /> : null}{creating ? <FactDialog entities={entities} outline={outline} pending={create.isPending} onCancel={() => setCreating(false)} onSave={(input) => create.mutate(input)} /> : null}{editing ? <FactDialog fact={editing} entities={entities} outline={outline} pending={revise.isPending} onCancel={() => setEditing(null)} onSave={(input) => revise.mutate({ fact: editing, draft: input })} /> : null}{withdrawTarget ? <ConfirmDialog title="撤回这条事实？" confirmLabel="撤回事实" danger pending={withdraw.isPending} onCancel={() => { setWithdrawTarget(null); setWithdrawReason(""); }} onConfirm={() => withdraw.mutate(withdrawTarget)}><p>撤回后它不会再作为当前事实参与上下文。锁定事实撤回需要明确理由。</p><textarea aria-label="撤回理由" rows={3} value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} placeholder="为什么这条事实不再成立？" /></ConfirmDialog> : null}</section>;
}

function FactDialog({ fact, entities, outline, pending, onCancel, onSave }: { fact?: CanonFact; entities: CanonEntity[]; outline: OutlineNode[]; pending: boolean; onCancel: () => void; onSave: (input: FactDraft) => void }) {
  const names = new Map(entities.map((entity) => [entity.id, entity.name]));
  const [subjectId, setSubjectId] = useState(fact?.subjectId ?? entities[0]?.id ?? "");
  const [predicate, setPredicate] = useState(fact?.predicate ?? "");
  const [objectEntityId, setObjectEntityId] = useState(fact?.objectEntityId ?? "");
  const [value, setValue] = useState(fact && !fact.objectEntityId ? formatFactValue(fact.value, names) : "");
  const [authority, setAuthority] = useState<CanonFact["authority"]>(fact?.authority ?? "candidate");
  const [knowledgeScope, setKnowledgeScope] = useState<CanonFact["knowledgeScope"]>(fact?.knowledgeScope ?? "omniscient");
  const [knowledgeSubjectId, setKnowledgeSubjectId] = useState(fact?.knowledgeSubjectId ?? "");
  const [validFromNodeId, setValidFromNodeId] = useState(fact?.validFromNodeId ?? "");
  const [validToNodeId, setValidToNodeId] = useState(fact?.validToNodeId ?? "");
  const [confirmLockedRevision, setConfirmLockedRevision] = useState(false);
  const characterEntities = entities.filter((entity) => entity.type === "character");
  const canSubmit = Boolean(subjectId && predicate.trim() && (objectEntityId || value.trim()) && (knowledgeScope !== "character" || knowledgeSubjectId) && (!fact || fact.authority !== "locked" || confirmLockedRevision));
  return <div className="cf-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}><form className="cf-modal cf-form" onSubmit={(event) => { event.preventDefault(); if (!canSubmit) return; onSave({ subjectId, predicate: predicate.trim(), objectEntityId: objectEntityId || null, ...(objectEntityId ? {} : { value: value.trim() }), validFromNodeId: validFromNodeId || null, validToNodeId: validToNodeId || null, knowledgeScope, knowledgeSubjectId: knowledgeScope === "character" ? knowledgeSubjectId || null : null, authority, confidence: Math.max(0, Math.min(1, Number(fact?.confidence ?? (authority === "candidate" ? 0.5 : 1)))), confirmLockedRevision }); }}><button type="button" className="cf-modal-close" aria-label="关闭" onClick={onCancel}><X size={16} /></button><h2>{fact ? "编辑故事事实" : "新增故事事实"}</h2><label>主体<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>关系或属性<input required value={predicate} onChange={(event) => setPredicate(event.target.value)} placeholder="例如：职业、隶属、害怕" /></label><label>关联对象（可选）<select value={objectEntityId} onChange={(event) => setObjectEntityId(event.target.value)}><option value="">使用文字内容</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>{!objectEntityId ? <label>内容<input required value={value} onChange={(event) => setValue(event.target.value)} placeholder="例如：守塔人" /></label> : null}<div className="cf-form-grid"><label>状态<select value={authority} onChange={(event) => setAuthority(event.target.value as CanonFact["authority"])}><option value="candidate">候选</option><option value="inferred">推断</option><option value="confirmed">已确认</option><option value="locked">已锁定</option></select></label><label>知识范围<select value={knowledgeScope} onChange={(event) => setKnowledgeScope(event.target.value as CanonFact["knowledgeScope"])}><option value="omniscient">作者全知</option><option value="reader">读者可知</option><option value="character">角色知道</option><option value="author_secret">作者秘密</option></select></label></div>{outline.length ? <div className="cf-form-grid"><label>生效章节<select value={validFromNodeId} onChange={(event) => setValidFromNodeId(event.target.value)}><option value="">不指定</option>{outline.filter((node) => node.kind === "chapter" || node.kind === "scene").map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label><label>截止章节<select value={validToNodeId} onChange={(event) => setValidToNodeId(event.target.value)}><option value="">不指定</option>{outline.filter((node) => node.kind === "chapter" || node.kind === "scene").map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label></div> : null}{knowledgeScope === "character" ? <label>知道这件事的角色<select required value={knowledgeSubjectId} onChange={(event) => setKnowledgeSubjectId(event.target.value)}><option value="">请选择角色</option>{characterEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label> : null}{fact?.authority === "locked" ? <label className="cf-check"><input type="checkbox" checked={confirmLockedRevision} onChange={(event) => setConfirmLockedRevision(event.target.checked)} />我确认要修订已锁定事实</label> : null}<div className="cf-modal-actions"><button type="button" className="cf-button" onClick={onCancel}>取消</button><button className="cf-primary" disabled={pending || !canSubmit}>{pending ? "正在保存…" : fact ? "保存修订" : "保存事实"}</button></div></form></div>;
}

function toCreateFactInput(draft: FactDraft): Parameters<typeof createCanonFact>[1] {
  return { subjectId: draft.subjectId, predicate: draft.predicate, objectEntityId: draft.objectEntityId, ...(draft.objectEntityId ? {} : { value: draft.value ?? "" }), validFromNodeId: draft.validFromNodeId, validToNodeId: draft.validToNodeId, knowledgeScope: draft.knowledgeScope, knowledgeSubjectId: draft.knowledgeSubjectId, authority: draft.authority, confidence: draft.confidence };
}

function toReviseFactInput(draft: FactDraft): Parameters<typeof reviseCanonFact>[2] {
  return { subjectId: draft.subjectId, predicate: draft.predicate, objectEntityId: draft.objectEntityId, ...(draft.objectEntityId ? {} : { value: draft.value ?? "" }), validFromNodeId: draft.validFromNodeId, validToNodeId: draft.validToNodeId, knowledgeScope: draft.knowledgeScope, knowledgeSubjectId: draft.knowledgeSubjectId, authority: draft.authority, confidence: draft.confidence, confirmLockedRevision: draft.confirmLockedRevision };
}

function formatFactValue(value: unknown, names: Map<string, string>) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? names.get(item) ?? item : String(item)).join("、");
  return value ? JSON.stringify(value) : "未填写";
}

type RelationshipDraft = Omit<RelationshipEvent, "id" | "projectId" | "createdAt" | "supersedesEventId">;

function RelationsSection({ projectId, entities, relationships, history, evidence }: { projectId: string; entities: CanonEntity[]; relationships: RelationshipEvent[]; history: RelationshipEvent[]; evidence: StoryEvidenceRef[] }) {
  const invalidate = useInvalidateStory(projectId, ["relationships", "relationshipHistory", "story", "overview"]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RelationshipEvent | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RelationshipEvent | null>(null);
  const [entityFilter, setEntityFilter] = useState("");
  const [storyTimeFilter, setStoryTimeFilter] = useState("");
  const save = useMutation({
    mutationFn: (input: { item: RelationshipEvent | null; draft: RelationshipDraft }) => input.item ? reviseRelationshipEvent(projectId, input.item, input.draft) : createRelationshipEvent(projectId, input.draft),
    onSuccess: async () => { setCreating(false); setEditing(null); await invalidate(); },
  });
  const remove = useMutation({ mutationFn: (item: RelationshipEvent) => removeRelationshipEvent(projectId, item), onSuccess: async () => { setRemoveTarget(null); await invalidate(); } });
  const byId = new Map(entities.map((entity) => [entity.id, entity.name]));
  const filteredRelationships = relationships.filter((event) => {
    const matchesEntity = !entityFilter || event.fromEntityId === entityFilter || event.toEntityId === entityFilter;
    const matchesStoryTime = !storyTimeFilter || (event.storyTime ?? "").toLocaleLowerCase().includes(storyTimeFilter.toLocaleLowerCase());
    return matchesEntity && matchesStoryTime;
  });
  const overview = buildRelationshipOverview(filteredRelationships, byId);
  return <section className="cf-card cf-knowledge-card"><div className="cf-section-title"><div><h2>人物与势力关系</h2><p>关系变化可以关联到章节和时间线，先从清晰的关系记录开始。</p></div><button className="cf-primary" onClick={() => setCreating(true)}><Plus size={16} />新增关系</button></div><div className="cf-form-grid"><label>按人物筛选<select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}><option value="">全部人物</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>按故事时间筛选<input value={storyTimeFilter} onChange={(event) => setStoryTimeFilter(event.target.value)} placeholder="例如：三年后、冬至" /></label></div>{relationships.length && !filteredRelationships.length ? <div className="cf-empty"><Link2 size={38} /><h3>当前筛选没有关系</h3><p>换一个人物或故事时间再试。</p></div> : filteredRelationships.length ? <><div className="cf-relation-overview" aria-label="双向关系总览"><div className="cf-section-title"><div><h3>双向关系总览</h3><p>同一对人物的正向、反向和历史变化集中显示。</p></div><span className="cf-badge">{overview.length} 对</span></div><div className="cf-list">{overview.map((pair) => <details key={pair.key} className="cf-relation-overview-row"><summary><strong>{pair.leftName}</strong><span> ↔ </span><strong>{pair.rightName}</strong><small> · {pair.events.length} 条记录</small></summary><ol>{pair.events.map((event) => <li key={event.id}><span>{event.fromName} → {event.relation} → {event.toName}</span>{event.storyTime ? <small> · {event.storyTime}</small> : null}</li>)}</ol></details>)}</div></div><div className="cf-list">{filteredRelationships.map((item) => { const revisions = history.filter((event) => event.fromEntityId === item.fromEntityId && event.toEntityId === item.toEntityId && (!storyTimeFilter || (event.storyTime ?? "").toLocaleLowerCase().includes(storyTimeFilter.toLocaleLowerCase()))); return <div className="cf-list-row" key={item.id}><div><strong>{byId.get(item.fromEntityId) ?? "未知对象"}</strong><span> → {item.relation} → </span><strong>{byId.get(item.toEntityId) ?? "未知对象"}</strong><EvidenceLinks evidence={evidence} projectId={projectId} sourceType="chapter" sourceId={item.sourceId} outlineNodeIds={[item.outlineNodeId]} />{revisions.length > 1 ? <details className="cf-relation-history"><summary>关系历史 · {revisions.length} 条</summary><ol>{revisions.slice().reverse().map((event) => <li key={event.id}><span>{event.relation}</span>{event.storyTime ? <small> · {event.storyTime}</small> : null}{event.supersedesEventId ? <small> · supersedes {event.supersedesEventId.slice(0, 8)}</small> : null}</li>)}</ol></details> : null}</div><div className="cf-actions"><button className="cf-text-link" onClick={() => setEditing(item)}>编辑</button><button className="cf-text-danger" onClick={() => setRemoveTarget(item)}>移除</button></div></div>; })}</div></> : <div className="cf-empty"><Link2 size={38} /><h3>还没有关系记录</h3><p>关系是可以随着剧情变化的故事事实。</p></div>}{save.isError ? <ErrorNote error={save.error} title="关系保存失败，请刷新后重试" /> : null}{creating || editing ? <RelationDialog item={editing ?? undefined} entities={entities} pending={save.isPending} onCancel={() => { setCreating(false); setEditing(null); }} onSave={(input) => save.mutate({ item: editing, draft: input })} /> : null}{removeTarget ? <ConfirmDialog title="移除这条关系？" confirmLabel="移除" danger pending={remove.isPending} onCancel={() => setRemoveTarget(null)} onConfirm={() => remove.mutate(removeTarget)}><p>移除关系不会删除人物或正文。</p></ConfirmDialog> : null}</section>;
}

export type RelationshipOverview = {
  key: string;
  leftName: string;
  rightName: string;
  events: Array<{
    id: string;
    fromName: string;
    toName: string;
    relation: string;
    storyTime: string | null;
  }>;
};

export function buildRelationshipOverview(
  relationships: readonly RelationshipEvent[],
  names: ReadonlyMap<string, string>,
): RelationshipOverview[] {
  const groups = new Map<string, RelationshipOverview>();
  for (const event of relationships) {
    const ids = [event.fromEntityId, event.toEntityId].sort();
    const key = ids.join("\u0000");
    const leftId = ids[0] ?? event.fromEntityId;
    const rightId = ids[1] ?? event.toEntityId;
    const group = groups.get(key) ?? {
      key,
      leftName: names.get(leftId) ?? "未知对象",
      rightName: names.get(rightId) ?? "未知对象",
      events: [],
    };
    group.events.push({
      id: event.id,
      fromName: names.get(event.fromEntityId) ?? "未知对象",
      toName: names.get(event.toEntityId) ?? "未知对象",
      relation: event.relation,
      storyTime: event.storyTime,
    });
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    events: group.events.slice().sort((left, right) => left.id.localeCompare(right.id)),
  }));
}

function RelationDialog({ item, entities, pending, onCancel, onSave }: { item?: RelationshipEvent | undefined; entities: CanonEntity[]; pending: boolean; onCancel: () => void; onSave: (input: RelationshipDraft) => void }) {
  const [fromEntityId, setFrom] = useState(item?.fromEntityId ?? entities[0]?.id ?? "");
  const [toEntityId, setTo] = useState(item?.toEntityId ?? entities[1]?.id ?? entities[0]?.id ?? "");
  const [relation, setRelation] = useState(item?.relation ?? "");
  return <div className="cf-modal-backdrop"><form className="cf-modal cf-form" onSubmit={(event) => { event.preventDefault(); onSave({ fromEntityId, toEntityId, relation: relation.trim(), intensity: item?.intensity ?? null, state: item?.state ?? {}, outlineNodeId: item?.outlineNodeId ?? null, storyTime: item?.storyTime ?? null, sourceId: item?.sourceId ?? null }); }}><h2>{item ? "编辑关系" : "新增关系"}</h2><label>起点<select value={fromEntityId} onChange={(event) => setFrom(event.target.value)}>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>关系<input required value={relation} onChange={(event) => setRelation(event.target.value)} placeholder="例如：敌对、师徒、合作" /></label><label>终点<select value={toEntityId} onChange={(event) => setTo(event.target.value)}>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><div className="cf-modal-actions"><button type="button" className="cf-button" onClick={onCancel}>取消</button><button className="cf-primary" disabled={pending || !fromEntityId || !toEntityId || !relation.trim()}>{pending ? "正在保存…" : "保存关系"}</button></div></form></div>;
}

function TimelineSection({ projectId, items, evidence }: { projectId: string; items: TimelineEvent[]; evidence: StoryEvidenceRef[] }) {
  const invalidate = useInvalidateStory(projectId, ["timeline", "story", "overview"]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TimelineEvent | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TimelineEvent | null>(null);
  const save = useMutation({
    mutationFn: (input: { item: TimelineEvent | null; draft: Omit<TimelineEvent, "id" | "projectId" | "createdAt" | "updatedAt"> }) => input.item ? updateTimelineEvent(projectId, input.item.id, { ...input.draft, expectedUpdatedAt: input.item.updatedAt }) : createTimelineEvent(projectId, input.draft),
    onSuccess: async () => { setCreating(false); setEditing(null); await invalidate(); },
  });
  const remove = useMutation({ mutationFn: (item: TimelineEvent) => removeTimelineEvent(projectId, item), onSuccess: async () => { setRemoveTarget(null); await invalidate(); } });
  return <section className="cf-card cf-knowledge-card"><div className="cf-section-title"><div><h2>时间线</h2><p>记录世界时间和章节顺序，减少前后矛盾。</p></div><button className="cf-primary" onClick={() => setCreating(true)}><Plus size={16} />新增事件</button></div>{items.length ? <div className="cf-list">{items.slice().sort((a, b) => a.sequence - b.sequence).map((item) => <div className="cf-list-row" key={item.id}><span className="cf-list-index">{item.sequence}</span><div><strong>{item.title}</strong><p>{item.description || "还没有事件说明。"}</p><EvidenceLinks evidence={evidence} projectId={projectId} sourceType="chapter" sourceId={item.sourceId} outlineNodeIds={[item.outlineNodeId]} /></div><button className="cf-text-link" onClick={() => setEditing(item)}>编辑</button><button className="cf-text-danger" onClick={() => setRemoveTarget(item)}>移除</button></div>)}</div> : <div className="cf-empty"><Clock3 size={38} /><h3>还没有时间线事件</h3><p>把关键转折记录下来，写作时更容易保持顺序。</p></div>}{creating || editing ? <TimelineDialog item={editing ?? undefined} pending={save.isPending} onCancel={() => { setCreating(false); setEditing(null); }} onSave={(draft) => save.mutate({ item: editing, draft })} /> : null}{save.isError ? <ErrorNote error={save.error} /> : null}{removeTarget ? <ConfirmDialog title="移除这个事件？" confirmLabel="移除" danger pending={remove.isPending} onCancel={() => setRemoveTarget(null)} onConfirm={() => remove.mutate(removeTarget)}><p>移除事件不会删除章节正文。</p></ConfirmDialog> : null}</section>;
}

function TimelineDialog({ item, pending, onCancel, onSave }: { item?: TimelineEvent | undefined; pending: boolean; onCancel: () => void; onSave: (input: Omit<TimelineEvent, "id" | "projectId" | "createdAt" | "updatedAt">) => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [sequence, setSequence] = useState(item?.sequence ?? 0);
  return <div className="cf-modal-backdrop"><form className="cf-modal cf-form" onSubmit={(event) => { event.preventDefault(); onSave({ title: title.trim(), description: description.trim() || null, outlineNodeId: item?.outlineNodeId ?? null, storyTimeStart: item?.storyTimeStart ?? null, storyTimeEnd: item?.storyTimeEnd ?? null, sequence, participants: item?.participants ?? [], causes: item?.causes ?? [], visibility: item?.visibility ?? "omniscient", sourceId: item?.sourceId ?? null }); }}><h2>{item ? "编辑时间线事件" : "新增时间线事件"}</h2><label>事件名称<input required autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>事件说明<textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>顺序<input type="number" min={0} value={sequence} onChange={(event) => setSequence(Number(event.target.value))} /></label><div className="cf-modal-actions"><button type="button" className="cf-button" onClick={onCancel}>取消</button><button className="cf-primary" disabled={pending || !title.trim()}>{pending ? "正在保存…" : item ? "保存修改" : "保存事件"}</button></div></form></div>;
}

function ForeshadowSection({ projectId, items, outline, evidence }: { projectId: string; items: Foreshadow[]; outline: OutlineNode[]; evidence: StoryEvidenceRef[] }) {
  const invalidate = useInvalidateStory(projectId, ["foreshadows", "story", "overview"]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Foreshadow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Foreshadow | null>(null);
  const save = useMutation({
    mutationFn: (input: { item: Foreshadow | null; draft: Omit<Foreshadow, "id" | "projectId" | "createdAt" | "updatedAt"> }) => input.item ? updateForeshadow(projectId, input.item.id, { ...input.draft, expectedUpdatedAt: input.item.updatedAt }) : createForeshadow(projectId, input.draft),
    onSuccess: async () => { setCreating(false); setEditing(null); await invalidate(); },
  });
  const remove = useMutation({ mutationFn: (item: Foreshadow) => removeForeshadow(projectId, item), onSuccess: async () => { setRemoveTarget(null); await invalidate(); } });
  const order = new Map(outline.map((node) => [node.id, node.path]));
  const titles = new Map(outline.map((node) => [node.id, node.title]));
  const foreshadowsById = new Map(items.map((item) => [item.id, item]));
  const latestChapter = outline.filter((node) => node.kind === "chapter" && node.status !== "abandoned").sort((left, right) => (order.get(left.id) ?? "").localeCompare(order.get(right.id) ?? "")).at(-1);
  return <section className="cf-card cf-knowledge-card"><div className="cf-section-title"><div><h2>伏笔</h2><p>记录埋下、推进和回收，让故事的回响有迹可循。</p></div><button className="cf-primary" onClick={() => setCreating(true)}><Plus size={16} />新增伏笔</button></div>{items.length ? <div className="cf-entity-grid">{items.map((item) => { const overdue = Boolean(item.status !== "resolved" && item.status !== "abandoned" && item.targetToNodeId && latestChapter && (order.get(item.targetToNodeId) ?? "") < (order.get(latestChapter.id) ?? "")); return <article className="cf-entity-card" key={item.id}><span className={`cf-badge${overdue ? " cf-badge--danger" : ""}`}>{overdue ? "逾期未回收" : item.status === "resolved" ? "已回收" : item.status === "planted" ? "已埋下" : item.status === "developing" ? "推进中" : item.status === "abandoned" ? "已放弃" : "待推进"}</span><h3>{item.title}</h3><p>{item.description}</p><div className="cf-foreshadow-plan"><small>计划埋下：{item.targetFromNodeId ? titles.get(item.targetFromNodeId) ?? "已移除章节" : "未指定"} · 计划回收：{item.targetToNodeId ? titles.get(item.targetToNodeId) ?? "已移除章节" : "未指定"} · 实际回收：{item.resolutionNodeId ? titles.get(item.resolutionNodeId) ?? "已移除章节" : "尚未记录"}</small>{item.dependencies.length ? <details><summary>依赖链 · {item.dependencies.length} 条</summary><ul>{item.dependencies.map((dependencyId) => <li key={dependencyId}>{foreshadowsById.get(dependencyId)?.title ?? `已移除伏笔 ${dependencyId.slice(0, 8)}`}</li>)}</ul></details> : <small className="cf-muted">没有前置伏笔依赖</small>}</div><EvidenceLinks evidence={evidence} projectId={projectId} sourceType="outline" sourceId={null} outlineNodeIds={[...item.evidenceNodeIds, item.targetFromNodeId, item.targetToNodeId, item.resolutionNodeId]} /><footer><small>重要度 {item.importance}/5 · 依赖 {item.dependencies.length} 条</small><button className="cf-text-link" onClick={() => setEditing(item)}>编辑</button><button className="cf-text-danger" onClick={() => setRemoveTarget(item)}>移除</button></footer></article>; })}</div> : <div className="cf-empty"><BookOpen size={38} /><h3>还没有伏笔</h3><p>先记录一个让未来章节值得等待的线索。</p></div>}{creating || editing ? <ForeshadowDialog item={editing ?? undefined} pending={save.isPending} onCancel={() => { setCreating(false); setEditing(null); }} onSave={(draft) => save.mutate({ item: editing, draft })} /> : null}{save.isError ? <ErrorNote error={save.error} /> : null}{removeTarget ? <ConfirmDialog title="移除这个伏笔？" confirmLabel="移除" danger pending={remove.isPending} onCancel={() => setRemoveTarget(null)} onConfirm={() => remove.mutate(removeTarget)}><p>移除伏笔不会删除正文，但相关提醒将消失。</p></ConfirmDialog> : null}</section>;
}

function ForeshadowDialog({ item, pending, onCancel, onSave }: { item?: Foreshadow | undefined; pending: boolean; onCancel: () => void; onSave: (input: Omit<Foreshadow, "id" | "projectId" | "createdAt" | "updatedAt">) => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [status, setStatus] = useState<Foreshadow["status"]>(item?.status ?? "planned");
  const [importance, setImportance] = useState<Foreshadow["importance"]>(item?.importance ?? 3);
  return <div className="cf-modal-backdrop"><form className="cf-modal cf-form" onSubmit={(event) => { event.preventDefault(); onSave({ title: title.trim(), description: description.trim(), status, importance, dependencies: item?.dependencies ?? [], evidenceNodeIds: item?.evidenceNodeIds ?? [], targetFromNodeId: item?.targetFromNodeId ?? null, targetToNodeId: item?.targetToNodeId ?? null, resolutionNodeId: item?.resolutionNodeId ?? null }); }}><h2>{item ? "编辑伏笔" : "新增伏笔"}</h2><label>伏笔名称<input required autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>线索说明<textarea required rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="它是什么，未来准备在哪里回收？" /></label><div className="cf-form-grid"><label>状态<select value={status} onChange={(event) => setStatus(event.target.value as Foreshadow["status"])}><option value="planned">待推进</option><option value="planted">已埋下</option><option value="developing">推进中</option><option value="resolved">已回收</option><option value="abandoned">已放弃</option></select></label><label>重要度<select value={importance} onChange={(event) => setImportance(Number(event.target.value) as Foreshadow["importance"])}><option value={1}>1 · 轻微</option><option value={2}>2</option><option value={3}>3 · 重要</option><option value={4}>4</option><option value={5}>5 · 核心</option></select></label></div><div className="cf-modal-actions"><button type="button" className="cf-button" onClick={onCancel}>取消</button><button className="cf-primary" disabled={pending || !title.trim() || !description.trim()}>{pending ? "正在保存…" : item ? "保存修改" : "保存伏笔"}</button></div></form></div>;
}

function lines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }

function EvidenceLinks({
  evidence,
  projectId,
  sourceType,
  sourceId,
  outlineNodeIds,
}: {
  evidence: StoryEvidenceRef[];
  projectId: string;
  sourceType: string;
  sourceId: string | null;
  outlineNodeIds: Array<string | null>;
}) {
  const nodeIds = [...new Set(outlineNodeIds.filter((id): id is string => Boolean(id)))];
  const sourceRef = sourceId ? evidence.find((item) => item.sourceId === sourceId) : null;
  const nodeRefs = nodeIds.map((nodeId) => ({
    nodeId,
    evidence: evidence.find(
      (item) => item.sourceId === nodeId && item.sourceType === "outline_node",
    ),
  }));
  const sourceHref = sourceId ? sourceLink(projectId, sourceType, sourceId, sourceRef) : null;
  if (!sourceHref && !sourceId && !nodeRefs.length) return null;
  return <div className="cf-evidence-links" aria-label="证据来源"><span>证据：</span>{sourceHref ? <Link to={sourceHref}>{sourceRef?.sourceType === "document_version" ? `打开正文版本 · ${sourceRef.title}` : "打开来源正文"}</Link> : sourceId ? <span>{sourceType} · {sourceId}</span> : null}{sourceRef?.versionId ? <small>{sourceRef.source === "outline" ? "大纲证据" : `版本 ${sourceRef.versionId.slice(0, 8)} · ${sourceRef.wordCount.toLocaleString()} 字`}</small> : null}{sourceRef?.excerpt ? <small className="cf-evidence-excerpt">“{sourceRef.excerpt}”</small> : null}{nodeRefs.map(({ nodeId, evidence: item }) => <span className="cf-evidence-node" key={nodeId}><Link to={`/books/${encodeURIComponent(projectId)}/outline?node=${encodeURIComponent(nodeId)}`}>{item ? `回到「${item.title}」` : "回到章节大纲"}</Link>{item?.excerpt ? <small className="cf-evidence-excerpt">“{item.excerpt}”</small> : null}</span>)}</div>;
}

function sourceLink(projectId: string, sourceType: string, sourceId: string, evidence?: StoryEvidenceRef | null): string | null {
  if (evidence?.documentId) return evidenceHref(projectId, evidence);
  if (["chapter", "document", "document_current", "document_version", "manual-revision"].includes(sourceType)) {
    return `/books/${encodeURIComponent(projectId)}/write/${encodeURIComponent(sourceId)}`;
  }
  if (["outline", "outline_node"].includes(sourceType)) {
    return `/books/${encodeURIComponent(projectId)}/outline?node=${encodeURIComponent(sourceId)}`;
  }
  return null;
}

function evidenceHref(projectId: string, evidence: StoryEvidenceRef): string {
  if (evidence.sourceType === "outline_node") {
    return `/books/${encodeURIComponent(projectId)}/outline?node=${encodeURIComponent(evidence.sourceId)}`;
  }
  return `/books/${encodeURIComponent(projectId)}/write/${encodeURIComponent(evidence.documentId ?? evidence.sourceId)}${evidence.versionId ? `?version=${encodeURIComponent(evidence.versionId)}` : ""}`;
}
