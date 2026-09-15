import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import type {
  BookDirectionDto,
  BookPackagingDto,
  BookPositioningDto,
  BookStoryEngineDto,
  OpeningBlueprintDto,
  OpeningChapterBlueprintDto,
  SigningSprintCandidateDto,
  SigningSprintStep,
  SigningSprintTask,
  UpdateSigningSprintRequest,
} from "@narralume/contracts";

import {
  createSigningSprint,
  decideSigningSprintCandidate,
  getSigningSprint,
  runOpeningCheck,
  runSigningReadiness,
  startSigningSprintAi,
  updateSigningSprint,
} from "../../shared/api/signing-sprint";
import { createChapterRun } from "../../shared/api/automation";
import { useStory } from "../../entities/project/queries";
import { queryKeys } from "../../shared/query/keys";
import { apiErrorMessage } from "../../shared/api/client";

const STEPS: readonly { id: SigningSprintStep; label: string; note: string }[] = [
  { id: "direction", label: "方向", note: "先把想法说清楚" },
  { id: "positioning", label: "定位", note: "确认读者为什么追更" },
  { id: "story_engine", label: "人物与冲突", note: "让故事可以持续推进" },
  { id: "packaging", label: "作品包装", note: "书名、简介和标签" },
  { id: "opening", label: "开篇", note: "前三章与第一阶段" },
  { id: "writing", label: "写作与预检", note: "落到正文再回看" },
];

type Direction = BookDirectionDto;
type Positioning = BookPositioningDto;
type SprintWorkflow = Awaited<ReturnType<typeof getSigningSprint>>["workflow"];

export function SigningSprintPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStep, setSelectedStep] = useState<SigningSprintStep | null>(null);
  const [lastAiRunId, setLastAiRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const sprint = useQuery({
    queryKey: queryKeys.signingSprint(projectId),
    queryFn: ({ signal }) => getSigningSprint(projectId, signal),
    enabled: Boolean(projectId),
    refetchInterval: (query) => {
      if (!lastAiRunId) return false;
      const candidates = query.state.data?.candidates ?? [];
      return candidates.some((candidate) => candidate.provenance.runId === lastAiRunId)
        ? false
        : 2500;
    },
  });
  const story = useStory(projectId, { enabled: Boolean(projectId) });
  const save = useMutation({
    mutationFn: (input: UpdateSigningSprintRequest) =>
      updateSigningSprint(projectId, input),
    onSuccess: (value, input) => {
      queryClient.setQueryData(queryKeys.signingSprint(projectId), value);
      void queryClient.invalidateQueries({ queryKey: queryKeys.story(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookProfile(projectId) });
      setSelectedStep(
        input.currentStep ? uiStep(input.currentStep) : uiStep(value.workflow.currentStep),
      );
      setNotice("已保存，可以继续下一步。");
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });
  const setup = useMutation({
    mutationFn: async (input: {
      direction: Direction;
      nextStep: SigningSprintStep;
    }) => {
      const created = await createSigningSprint(projectId, {
        premise: input.direction.premise,
        genre: input.direction.genre,
        audience: input.direction.audience,
        coreEmotion: input.direction.coreEmotion,
      });
      return updateSigningSprint(projectId, {
        expectedVersion: created.workflow.version,
        state: { direction: input.direction },
        completedSteps: completedWith(created.workflow, "direction"),
        currentStep: input.nextStep,
      });
    },
    onSuccess: (value, input) => {
      queryClient.setQueryData(queryKeys.signingSprint(projectId), value);
      void queryClient.invalidateQueries({ queryKey: queryKeys.story(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookProfile(projectId) });
      setSelectedStep(input.nextStep);
      setNotice("方向已保存。");
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });
  const ai = useMutation({
    mutationFn: (task: SigningSprintTask) =>
      startSigningSprintAi(projectId, {
        requestId: crypto.randomUUID(),
        task,
        instruction: "请给出 1 份具体、可修改、能和当前作品资料对齐的候选。",
        policy: {},
      }),
    onSuccess: (value) => {
      setLastAiRunId(value.runId);
      setNotice("正在整理候选，完成后会出现在本页供你选择。");
      void sprint.refetch();
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });
  const decide = useMutation({
    mutationFn: (input: {
      candidate: SigningSprintCandidateDto;
      action: "accept" | "reject";
      selectedPackagingIndex?: number | undefined;
    }) =>
      decideSigningSprintCandidate(projectId, input.candidate.id, {
        action: input.action,
        expectedWorkflowVersion: sprint.data?.workflow.version ?? 0,
        ...(input.selectedPackagingIndex === undefined
          ? {}
          : { selectedPackagingIndex: input.selectedPackagingIndex }),
      }),
    onSuccess: (value) => {
      if ("workflow" in value) {
        queryClient.setQueryData(queryKeys.signingSprint(projectId), {
          ...sprint.data,
          workflow: value.workflow,
          candidates: sprint.data?.candidates.map((candidate) =>
            candidate.id === value.candidate.id ? value.candidate : candidate,
          ) ?? [value.candidate],
        });
      }
      void sprint.refetch();
      void queryClient.invalidateQueries({ queryKey: queryKeys.story(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookProfile(projectId) });
      setNotice("候选处理完成。");
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });
  const openingCheck = useMutation({
    mutationFn: () => runOpeningCheck(projectId),
    onSuccess: (value) => {
      queryClient.setQueryData(queryKeys.signingSprint(projectId), {
        ...sprint.data,
        workflow: value.workflow,
      });
      setNotice("开篇信号已更新，请结合原文位置判断。");
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });
  const readiness = useMutation({
    mutationFn: () => runSigningReadiness(projectId),
    onSuccess: (value) => {
      queryClient.setQueryData(queryKeys.signingSprint(projectId), {
        ...sprint.data,
        workflow: value.workflow,
      });
      setNotice("签约准备预检已更新。");
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });
  const chapterRun = useMutation({
    mutationFn: (outlineNodeId: string) =>
      createChapterRun(projectId, {
        requestId: crypto.randomUUID(),
        targetOutlineNodeId: outlineNodeId,
        planningMode: "auto",
        maxRevisionCycles: 1,
        origin: {
          surface: "signing-sprint",
          outlineNodeId,
          returnTo: `/books/${projectId}/signing-sprint`,
          selection: null,
        },
      }),
    onSuccess: (value) => navigate(`/books/${projectId}/tasks/${value.run.id}`),
    onError: (error) => setNotice(apiErrorMessage(error)),
  });
  if (!projectId) return <div className="cf-page">没有找到作品。</div>;
  if (sprint.isPending) return <div className="cf-page">正在打开快速开书…</div>;
  if (sprint.isError || !sprint.data) {
    return <div className="cf-page"><p className="cf-notice">{apiErrorMessage(sprint.error)}</p></div>;
  }
  const workflow = sprint.data.workflow;
  const activeStep = selectedStep ?? uiStep(workflow.currentStep);
  const candidates = sprint.data.candidates.filter((candidate) =>
    candidate.status === "candidate" && candidateForStep(candidate.task, activeStep),
  );
  const firstChapter = story.data?.outline.find(
    (node) => node.kind === "chapter" && node.metadata.createdWith === "signing-sprint",
  ) ?? story.data?.outline.find((node) => node.kind === "chapter") ?? null;
  const openingChapters = story.data?.outline
    .filter(
      (node) =>
        node.kind === "chapter" && node.metadata.createdWith === "signing-sprint",
    )
    .slice(0, 3) ?? [];

  return (
    <div className="cf-page cf-signing-sprint-page">
      <div className="cf-signing-sprint-heading">
        <div>
          <Link className="cf-text-link" to={`/books/${projectId}/dashboard`}>← 返回作品</Link>
          <h1>快速开书</h1>
          <p>从一个想法走到可继续写作的开篇。每一步都可以修改，不需要一次决定整本书。</p>
        </div>
        <span className="cf-signing-sprint-badge">签约准备工作流</span>
      </div>
      <nav className="cf-signing-sprint-steps" aria-label="快速开书步骤">
        {STEPS.map((step, index) => (
          <button
            key={step.id}
            type="button"
            className={activeStep === step.id ? "is-active" : workflow.completedSteps.includes(step.id) ? "is-done" : ""}
            onClick={() => setSelectedStep(step.id)}
          >
            <span>{index + 1}</span><strong>{step.label}</strong><small>{step.note}</small>
          </button>
        ))}
      </nav>
      {notice ? <p className="cf-notice" role="status">{notice}</p> : null}
      {activeStep === "direction" ? (
        <DirectionStep
          key={workflow.version}
          workflow={workflow}
          busy={setup.isPending || save.isPending}
          onAi={() => ai.mutate("BrainstormBookDirection")}
          onNext={(direction) => setup.mutate({ direction, nextStep: "positioning" })}
        />
      ) : null}
      {activeStep === "positioning" ? (
        <PositioningStep
          key={workflow.version}
          workflow={workflow}
          busy={save.isPending}
          onAi={() => ai.mutate("RefineBookPositioning")}
          onEvaluate={() => ai.mutate("EvaluatePositioning")}
          onSave={(positioning) => save.mutate({
            expectedVersion: workflow.version,
            state: { positioning },
            completedSteps: completedWith(workflow, "positioning"),
            currentStep: "story_engine",
          })}
        />
      ) : null}
      {activeStep === "story_engine" ? (
        <StoryEngineStep
          key={workflow.version}
          workflow={workflow}
          busy={save.isPending}
          onAi={() => ai.mutate("GenerateStoryEngine")}
          onSave={(storyEngine) => save.mutate({
            expectedVersion: workflow.version,
            state: { storyEngine },
            completedSteps: completedWith(workflow, "story_engine"),
            currentStep: "packaging",
          })}
        />
      ) : null}
      {activeStep === "packaging" ? (
        <PackagingStep
          key={workflow.version}
          workflow={workflow}
          busy={save.isPending}
          onAi={() => ai.mutate("GenerateBookPackaging")}
          onEvaluate={() => ai.mutate("EvaluateBookPackaging")}
          onSave={(packaging, selectedPackagingId) => save.mutate({
            expectedVersion: workflow.version,
            state: { packaging, selectedPackagingId },
            completedSteps: completedWith(workflow, "packaging"),
            currentStep: "opening",
          })}
        />
      ) : null}
      {activeStep === "opening" ? (
        <OpeningStep
          key={workflow.version}
          workflow={workflow}
          busy={save.isPending}
          onAi={() => ai.mutate("GenerateOpeningBlueprint")}
          onSave={(openingBlueprint) => {
            save.mutate({
              expectedVersion: workflow.version,
              state: { openingBlueprint },
              completedSteps: completedWith(workflow, "opening"),
              currentStep: "writing",
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.story(projectId) });
          }}
        />
      ) : null}
      {activeStep === "writing" ? (
        <WritingStep
          workflow={workflow}
          projectId={projectId}
          firstChapter={firstChapter}
          chapters={openingChapters}
          onChapterIntent={() => ai.mutate("GenerateChapterFromIntent")}
          onOpeningCheck={() => openingCheck.mutate()}
          onOpeningAi={() => ai.mutate("EvaluateOpening")}
          openingCheckPending={openingCheck.isPending}
          onReadiness={() => readiness.mutate()}
          readinessPending={readiness.isPending}
          onWrite={() => firstChapter && chapterRun.mutate(firstChapter.id)}
          writingPending={chapterRun.isPending}
        />
      ) : null}
      {candidates.length > 0 ? (
        <CandidatePanel
          candidates={candidates}
          busy={decide.isPending}
          onDecision={(candidate, action, selectedPackagingIndex) =>
            decide.mutate({ candidate, action, selectedPackagingIndex })
          }
        />
      ) : lastAiRunId ? <p className="cf-signing-sprint-ai-status">候选还在整理中，页面会自动更新。</p> : null}
      <div className="cf-signing-sprint-footnote">
        <span>官方来源仅用于创作建议和规则提醒。</span>
        <span>前三章是本工作流的开篇方法，不是官方硬性章数规则。</span>
        <span>具体提交要求请以当前番茄官方规则为准。</span>
      </div>
    </div>
  );
}

function DirectionStep({
  workflow,
  busy,
  onAi,
  onNext,
}: {
  workflow: SprintWorkflow;
  busy: boolean;
  onAi: () => void;
  onNext: (direction: Direction) => void;
}) {
  const saved = workflow.state.direction;
  const [premise, setPremise] = useState(saved?.premise ?? "");
  const [genre, setGenre] = useState(saved?.genre ?? "");
  const [audience, setAudience] = useState(saved?.audience ?? "");
  const [coreEmotion, setCoreEmotion] = useState(saved?.coreEmotion ?? "");
  return (
    <section className="cf-card cf-signing-sprint-card">
      <StepTitle title="先说说你想写什么" description="不必完整，人物、处境或一个画面都可以。" />
      <form onSubmit={(event) => { event.preventDefault(); onNext({ premise: premise.trim(), genre: genre.trim() || null, audience: audience.trim() || null, coreEmotion: coreEmotion.trim() || null, protagonistSeed: saved?.protagonistSeed ?? null, hook: saved?.hook ?? null, differentiation: saved?.differentiation ?? [] }); }}>
        <label>故事想法<textarea required rows={5} value={premise} onChange={(event) => setPremise(event.target.value)} placeholder="例如：一个能看见别人临终前七秒的人，必须在城市停电前找到真正的凶手。" /></label>
        <div className="cf-form-grid">
          <label>大致题材<input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="都市、悬疑、玄幻……" /></label>
          <label>想写给谁<input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="你希望谁读得停不下来？" /></label>
          <label>核心阅读体验<input value={coreEmotion} onChange={(event) => setCoreEmotion(event.target.value)} placeholder="紧张、爽感、治愈、反转……" /></label>
        </div>
        <div className="cf-actions"><button type="button" className="cf-button" onClick={onAi} disabled={busy}>✦ 让 AI 帮我展开方向</button><button className="cf-primary" disabled={busy || !premise.trim()}>{busy ? "正在保存…" : "保存并继续定位"}</button></div>
      </form>
    </section>
  );
}

function PositioningStep({
  workflow,
  busy,
  onAi,
  onEvaluate,
  onSave,
}: {
  workflow: SprintWorkflow;
  busy: boolean;
  onAi: () => void;
  onEvaluate: () => void;
  onSave: (positioning: Positioning) => void;
}) {
  const saved = workflow.state.positioning;
  const [form, setForm] = useState<Positioning>(() => positioningDefaults(saved));
  const set = (key: keyof Positioning, value: string | string[] | Positioning["sustainability"]) => setForm((current) => ({ ...current, [key]: value }));
  const ready = [form.oneLineStory, form.coreIdea, form.emotionalPayoff, form.readerProfile, form.protagonistDesire, form.obstacle, form.mechanism, form.coreConflict, form.longTermExpectation].every((value) => typeof value === "string" && value.trim());
  return (
    <section className="cf-card cf-signing-sprint-card">
      <StepTitle title="把故事变成一句可追更的承诺" description="这一页是作品定位健康检查：目标、阻力、机制和长期空间要彼此对得上。" />
      <form onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <label>一句话故事<input required value={form.oneLineStory} onChange={(event) => set("oneLineStory", event.target.value)} placeholder="谁，在什么阻力下，要完成什么事？" /></label>
        <div className="cf-form-grid">
          <label>核心创意<textarea rows={3} value={form.coreIdea} onChange={(event) => set("coreIdea", event.target.value)} /></label>
          <label>主角想要什么<textarea rows={3} value={form.protagonistDesire} onChange={(event) => set("protagonistDesire", event.target.value)} /></label>
          <label>谁或什么在阻拦<textarea rows={3} value={form.obstacle} onChange={(event) => set("obstacle", event.target.value)} /></label>
          <label>故事靠什么持续推进<textarea rows={3} value={form.mechanism} onChange={(event) => set("mechanism", event.target.value)} /></label>
          <label>核心冲突<textarea rows={3} value={form.coreConflict} onChange={(event) => set("coreConflict", event.target.value)} /></label>
          <label>读者最后想得到什么体验<textarea rows={3} value={form.emotionalPayoff} onChange={(event) => set("emotionalPayoff", event.target.value)} /></label>
        </div>
        <label>目标读者<input required value={form.readerProfile} onChange={(event) => set("readerProfile", event.target.value)} /></label>
        <label>长期期待<input required value={form.longTermExpectation} onChange={(event) => set("longTermExpectation", event.target.value)} placeholder="读者会期待主角最终走到哪里？" /></label>
        <label>卖点（每行一项）<textarea rows={3} value={form.sellingPoints.join("\n")} onChange={(event) => set("sellingPoints", lines(event.target.value))} /></label>
        <div className="cf-signing-sprint-subgrid"><label>短期吸引力<textarea rows={2} value={form.sustainability.shortTermAppeal} onChange={(event) => set("sustainability", { ...form.sustainability, shortTermAppeal: event.target.value })} /></label><label>中期扩展空间<textarea rows={2} value={form.sustainability.midTermExpansion} onChange={(event) => set("sustainability", { ...form.sustainability, midTermExpansion: event.target.value })} /></label><label>长期主线空间<textarea rows={2} value={form.sustainability.longTermSpace} onChange={(event) => set("sustainability", { ...form.sustainability, longTermSpace: event.target.value })} /></label></div>
        <div className="cf-actions"><button type="button" className="cf-button" onClick={onAi} disabled={busy}>✦ 让 AI 帮我检查定位</button><button type="button" className="cf-button" onClick={onEvaluate} disabled={busy}>复核当前定位</button><button className="cf-primary" disabled={busy || !ready}>{busy ? "正在保存…" : "保存定位并继续"}</button></div>
      </form>
    </section>
  );
}

function StoryEngineStep({
  workflow,
  busy,
  onAi,
  onSave,
}: {
  workflow: SprintWorkflow;
  busy: boolean;
  onAi: () => void;
  onSave: (storyEngine: BookStoryEngineDto) => void;
}) {
  const saved = workflow.state.storyEngine;
  const [protagonist, setProtagonist] = useState(saved?.protagonist ?? "");
  const [antagonist, setAntagonist] = useState(saved?.antagonist ?? "");
  const [mechanism, setMechanism] = useState(saved?.mechanism ?? workflow.state.positioning?.mechanism ?? "");
  const [conflict, setConflict] = useState(saved?.conflict ?? workflow.state.positioning?.coreConflict ?? "");
  const [relationships, setRelationships] = useState(saved?.relationships.join("\n") ?? "");
  const [worldRules, setWorldRules] = useState(saved?.worldRules.join("\n") ?? "");
  return (
    <section className="cf-card cf-signing-sprint-card">
      <StepTitle title="让人物和规则互相拉扯" description="这里会同步到作品设定，后续章节写作会继续读取。" />
      <form onSubmit={(event) => { event.preventDefault(); onSave({ protagonist: protagonist.trim() || null, relationships: lines(relationships), antagonist: antagonist.trim() || null, mechanism: mechanism.trim() || null, worldRules: lines(worldRules), conflict: conflict.trim() || null }); }}>
        <div className="cf-form-grid"><label>主角<input required value={protagonist} onChange={(event) => setProtagonist(event.target.value)} placeholder="名字、身份和此刻的处境" /></label><label>主要对手或阻力<input value={antagonist} onChange={(event) => setAntagonist(event.target.value)} /></label><label>核心机制<input value={mechanism} onChange={(event) => setMechanism(event.target.value)} placeholder="能力、系统、秘密、关系或限制" /></label><label>第一阶段冲突<input required value={conflict} onChange={(event) => setConflict(event.target.value)} /></label></div>
        <div className="cf-form-grid"><label>关键关系（每行一项）<textarea rows={4} value={relationships} onChange={(event) => setRelationships(event.target.value)} /></label><label>世界规则与边界（每行一项）<textarea rows={4} value={worldRules} onChange={(event) => setWorldRules(event.target.value)} /></label></div>
        <div className="cf-actions"><button type="button" className="cf-button" onClick={onAi} disabled={busy}>✦ 让 AI 补全人物与冲突</button><button className="cf-primary" disabled={busy || !protagonist.trim() || !conflict.trim()}>{busy ? "正在保存…" : "保存人物与冲突并继续"}</button></div>
      </form>
    </section>
  );
}

function PackagingStep({
  workflow,
  busy,
  onAi,
  onEvaluate,
  onSave,
}: {
  workflow: SprintWorkflow;
  busy: boolean;
  onAi: () => void;
  onEvaluate: () => void;
  onSave: (packaging: BookPackagingDto[], selectedPackagingId: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const selected = workflow.state.selectedPackagingId;
  const list = workflow.state.packaging;
  const add = () => {
    if (!title.trim() || !description.trim()) return;
    const next = [...list, { title: title.trim(), titleDirection: "作者手动填写", description: description.trim(), genre: workflow.state.direction?.genre ?? null, tags: lines(tags), tagline: null, coverBrief: null, rationale: "作者手动候选" }];
    onSave(next, String(next.length - 1));
    setTitle(""); setDescription(""); setTags("");
  };
  return (
    <section className="cf-card cf-signing-sprint-card">
      <StepTitle title="给作品一个能兑现的包装" description="书名、简介和标签要指向同一个阅读承诺。先选方向，再慢慢打磨。" />
      <div className="cf-form-grid"><label>书名<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="先写一个你愿意继续写的名字" /></label><label>标签（用逗号或换行分隔）<input value={tags} onChange={(event) => setTags(event.target.value)} /></label></div>
      <label>简介<textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="谁遇到了什么，又将付出什么代价？" /></label>
      <div className="cf-actions"><button type="button" className="cf-button" onClick={onAi} disabled={busy}>✦ 生成 3—5 个包装方向</button><button type="button" className="cf-button" onClick={onEvaluate} disabled={busy}>复核当前包装</button><button type="button" className="cf-primary" onClick={add} disabled={busy || !title.trim() || !description.trim()}>加入我的候选</button></div>
      {list.length > 0 ? <div className="cf-signing-sprint-candidate-grid">{list.map((item, index) => <button type="button" className={`cf-signing-sprint-package ${selected === String(index) ? "is-selected" : ""}`} key={`${item.title}-${index}`} onClick={() => onSave(list, String(index))}><strong>{item.title}</strong><span>{item.description}</span><small>{item.tags.join(" · ") || "未填写标签"}</small></button>)}</div> : <p className="cf-muted">还没有包装候选，先手动填写或让 AI 提供几个方向。</p>}
    </section>
  );
}

function OpeningStep({
  workflow,
  busy,
  onAi,
  onSave,
}: {
  workflow: SprintWorkflow;
  busy: boolean;
  onAi: () => void;
  onSave: (blueprint: OpeningBlueprintDto) => void;
}) {
  const [blueprint, setBlueprint] = useState<OpeningBlueprintDto>(() => openingDefaults(workflow));
  const updateChapter = (index: number, key: keyof OpeningChapterBlueprintDto, value: string | number | null) => setBlueprint((current) => ({ ...current, firstThreeChapters: current.firstThreeChapters.map((chapter) => chapter.index === index ? { ...chapter, [key]: value } as OpeningChapterBlueprintDto : chapter), firstArcChapters: current.firstArcChapters.map((chapter) => chapter.index === index ? { ...chapter, [key]: value } as OpeningChapterBlueprintDto : chapter) }));
  const renderChapter = (chapter: OpeningChapterBlueprintDto, compact = false) => <article key={chapter.index}><h3>第 {chapter.index} 章</h3><label>章节标题<input value={chapter.title} onChange={(event) => updateChapter(chapter.index, "title", event.target.value)} placeholder="章节标题" /></label><div className="cf-form-grid"><label>主角行动<textarea rows={2} value={chapter.protagonistAction} onChange={(event) => updateChapter(chapter.index, "protagonistAction", event.target.value)} placeholder="主角要做什么？" /></label><label>核心冲突<textarea rows={2} value={chapter.conflict} onChange={(event) => updateChapter(chapter.index, "conflict", event.target.value)} placeholder="什么在阻拦？" /></label></div>{compact ? null : <><div className="cf-form-grid"><label>章节目的<input value={chapter.purpose} onChange={(event) => updateChapter(chapter.index, "purpose", event.target.value)} placeholder="setup / progress / reveal…" /></label><label>目标情绪<input value={chapter.emotionTarget} onChange={(event) => updateChapter(chapter.index, "emotionTarget", event.target.value)} placeholder="紧张、期待、爽感…" /></label></div><label>本章建立的读者期待<textarea rows={2} value={chapter.readerExpectation} onChange={(event) => updateChapter(chapter.index, "readerExpectation", event.target.value)} /></label></>}<label>章尾 Hook<textarea rows={2} value={chapter.hook} onChange={(event) => updateChapter(chapter.index, "hook", event.target.value)} placeholder="章尾留下什么变化或问题？" /></label>{compact ? null : <><label>本章回收<textarea rows={2} value={chapter.payoff} onChange={(event) => updateChapter(chapter.index, "payoff", event.target.value)} placeholder="本章兑现或推进了什么？" /></label><label>目标字数<input type="number" min="1" value={chapter.targetWords ?? ""} onChange={(event) => updateChapter(chapter.index, "targetWords", event.target.value ? Number(event.target.value) : null)} /></label></>}</article>;
  return (
    <section className="cf-card cf-signing-sprint-card">
      <StepTitle title="安排一个能马上动笔的开篇" description="前三章是工作流里的检查方法：每章都要有行动、阻力、期待和变化。" />
      <label>开篇读者承诺<input value={blueprint.readerPromise} onChange={(event) => setBlueprint({ ...blueprint, readerPromise: event.target.value })} placeholder="读者翻开第一章后，最想知道或看到什么？" /></label>
      <label>开篇钩子<textarea rows={2} value={blueprint.openingHook} onChange={(event) => setBlueprint({ ...blueprint, openingHook: event.target.value })} /></label>
      <div className="cf-form-grid"><label>开篇总期待<textarea rows={2} value={blueprint.expectation} onChange={(event) => setBlueprint({ ...blueprint, expectation: event.target.value })} placeholder="读者会一路追问什么？" /></label><label>信息揭示顺序（每行一项）<textarea rows={2} value={blueprint.informationRevealPlan.join("\n")} onChange={(event) => setBlueprint({ ...blueprint, informationRevealPlan: lines(event.target.value) })} placeholder="先揭示异常，再揭示代价…" /></label></div>
      <p className="cf-inline-hint">第一阶段默认按 12 章起草；前三章用于开篇检查，后续章节可以继续调整。</p>
      <div className="cf-signing-sprint-chapters">{blueprint.firstThreeChapters.map((chapter) => renderChapter(chapter))}</div>
      <div className="cf-form-grid"><label>第一阶段标题<input value={blueprint.firstArcTitle} onChange={(event) => setBlueprint({ ...blueprint, firstArcTitle: event.target.value })} /></label><label>第一阶段目标<input value={blueprint.firstArcGoal} onChange={(event) => setBlueprint({ ...blueprint, firstArcGoal: event.target.value })} /></label><label>第一阶段冲突<input value={blueprint.firstArcConflict} onChange={(event) => setBlueprint({ ...blueprint, firstArcConflict: event.target.value })} /></label><label>阶段性回收<input value={blueprint.firstArcPayoff} onChange={(event) => setBlueprint({ ...blueprint, firstArcPayoff: event.target.value })} /></label></div>
      {blueprint.firstArcChapters.length > 3 ? <details className="cf-signing-sprint-arc-details" open><summary>调整第一阶段后续章节（{blueprint.firstArcChapters.length - 3} 章）</summary><div className="cf-signing-sprint-arc-chapters">{blueprint.firstArcChapters.filter((chapter) => chapter.index > 3).map((chapter) => renderChapter(chapter, true))}</div></details> : null}
      <div className="cf-actions"><button type="button" className="cf-button" onClick={onAi} disabled={busy}>✦ 让 AI 补全开篇计划</button><button type="button" className="cf-primary" onClick={() => onSave(blueprint)} disabled={busy || blueprint.firstThreeChapters.length < 3 || !blueprint.readerPromise.trim() || blueprint.firstThreeChapters.some((chapter) => !chapter.title.trim() || !chapter.protagonistAction.trim() || !chapter.conflict.trim() || !chapter.readerExpectation.trim() || !chapter.hook.trim())}>保存开篇并进入写作</button></div>
    </section>
  );
}

function WritingStep({
  workflow,
  projectId,
  firstChapter,
  chapters,
  onChapterIntent,
  onOpeningCheck,
  onOpeningAi,
  openingCheckPending,
  onReadiness,
  readinessPending,
  onWrite,
  writingPending,
}: {
  workflow: SprintWorkflow;
  projectId: string;
  firstChapter: { id: string; title: string } | null;
  chapters: readonly { id: string; title: string }[];
  onChapterIntent: () => void;
  onOpeningCheck: () => void;
  onOpeningAi: () => void;
  openingCheckPending: boolean;
  onReadiness: () => void;
  readinessPending: boolean;
  onWrite: () => void;
  writingPending: boolean;
}) {
  const report = workflow.state.openingCheck;
  const readiness = workflow.state.readiness;
  return (
    <section className="cf-card cf-signing-sprint-card">
      <StepTitle title="现在开始写，再回看开篇" description="快速开书到这里就已经完成主线；正文、检查和签约准备可以循环进行。" />
      <div className="cf-signing-sprint-actions-large"><button className="cf-primary" onClick={onWrite} disabled={!firstChapter || writingPending}>{writingPending ? "正在准备写作任务…" : firstChapter ? `开始写《${firstChapter.title}》` : "先完成开篇计划"}</button>{firstChapter ? <Link className="cf-button" to={`/books/${projectId}/write`}>打开章节列表</Link> : null}<button className="cf-button" onClick={onChapterIntent} disabled={!firstChapter}>让 AI 先整理本章写作意图</button></div>
      {chapters.length > 0 ? <div className="cf-signing-sprint-chapter-links"><strong>开篇章节</strong>{chapters.map((chapter, index) => <Link key={chapter.id} className="cf-text-link" to={`/books/${projectId}/write?outline=${encodeURIComponent(chapter.id)}`}>第 {index + 1} 章 · {chapter.title}</Link>)}</div> : null}
      <div className="cf-signing-sprint-review-row"><div><h3>开篇检查</h3><p>查看段落、对话、人物密度等信号，回到原文做作者判断。</p><div className="cf-actions"><button className="cf-button" onClick={onOpeningCheck} disabled={openingCheckPending}>{openingCheckPending ? "正在检查…" : "更新开篇检查"}</button><button className="cf-button" onClick={onOpeningAi} disabled={openingCheckPending}>让 AI 做开篇编辑复核</button></div>{report ? <SignalSummary report={report} /> : null}</div><div><h3>签约准备预检</h3><p>检查作品资料、开篇内容、一致性和当前官方来源状态。</p><button className="cf-button" onClick={onReadiness} disabled={readinessPending}>{readinessPending ? "正在预检…" : "更新签约准备预检"}</button>{readiness ? <ReadinessSummary report={readiness} /> : null}</div></div>
      <p className="cf-muted">作品是否提交、何时提交和提交后的结果，仍由作者根据当前官方规则自行决定。</p>
    </section>
  );
}

function CandidatePanel({
  candidates,
  busy,
  onDecision,
}: {
  candidates: SigningSprintCandidateDto[];
  busy: boolean;
  onDecision: (
    candidate: SigningSprintCandidateDto,
    action: "accept" | "reject",
    selectedPackagingIndex?: number,
  ) => void;
}) {
  return (
    <section className="cf-card cf-signing-sprint-candidates">
      <h2>待你选择的候选</h2>
      <p>AI 只提供草案；接受后才会写入对应的作品资料。</p>
      {candidates.map((candidate) => {
        const packaging =
          candidate.task === "GenerateBookPackaging" &&
          Array.isArray(candidate.payload.candidates)
            ? candidate.payload.candidates
            : null;
        return (
          <article key={candidate.id}>
            <div>
              <strong>{candidateLabel(candidate.task)}</strong>
              <p>{candidate.rationale}</p>
              {packaging ? (
                <div className="cf-signing-sprint-packaging-options">
                  {packaging.map((item, index) => {
                    const title = recordText(item, "title");
                    const tagline = recordText(item, "tagline");
                    const coverBrief = recordText(item, "coverBrief");
                    return (
                      <div
                        className="cf-signing-sprint-packaging-option"
                        key={`${title}-${index}`}
                      >
                        <div className="cf-signing-sprint-packaging-option-heading">
                          <small>包装 {index + 1}</small>
                          <strong>{title || "未命名包装"}</strong>
                        </div>
                        <span>{recordText(item, "titleDirection")}</span>
                        <p>{recordText(item, "description")}</p>
                        <small>
                          标签：{recordList(item, "tags").join(" · ") || "未填写"}
                        </small>
                        {tagline || coverBrief ? (
                          <details>
                            <summary>查看宣传语与封面方向</summary>
                            {tagline ? <span>宣传语：{tagline}</span> : null}
                            {coverBrief ? <span>封面：{coverBrief}</span> : null}
                          </details>
                        ) : null}
                        <button
                          type="button"
                          className="cf-primary"
                          onClick={() => onDecision(candidate, "accept", index)}
                          disabled={busy || !title}
                        >
                          采用这项包装
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <CandidatePreview candidate={candidate} />
              )}
            </div>
            <div className="cf-actions">
              {packaging ? (
                <span className="cf-inline-hint">请选择一项包装</span>
              ) : (
                <button
                  type="button"
                  className="cf-primary"
                  onClick={() => onDecision(candidate, "accept")}
                  disabled={busy}
                >
                  采用
                </button>
              )}
              <button
                type="button"
                className="cf-button"
                onClick={() => onDecision(candidate, "reject")}
                disabled={busy}
              >
                暂不采用
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function CandidatePreview({ candidate }: { candidate: SigningSprintCandidateDto }) {
  const payload = candidate.payload;
  if (candidate.task === "BrainstormBookDirection") return <p className="cf-signing-sprint-preview">{text(payload.premise)}{payload.genre ? ` · ${text(payload.genre)}` : ""}</p>;
  if (candidate.task === "RefineBookPositioning") return <p className="cf-signing-sprint-preview">{text(payload.oneLineStory)}{payload.coreConflict ? ` · 冲突：${text(payload.coreConflict)}` : ""}</p>;
  if (candidate.task === "GenerateStoryEngine") return <div className="cf-signing-sprint-preview cf-signing-sprint-preview--stack"><strong>主角：{text(payload.protagonist) || "待补全"}</strong><span>对手/阻力：{text(payload.antagonist) || "待补全"}</span><span>机制：{text(payload.mechanism) || "待补全"}</span><span>冲突：{text(payload.conflict) || "待补全"}</span><span>关键关系：{recordList(payload, "relationships").slice(0, 2).join("；") || "待补全"}</span></div>;
  if (candidate.task === "EvaluatePositioning" || candidate.task === "EvaluateBookPackaging") return <div className="cf-signing-sprint-preview cf-signing-sprint-preview--stack"><strong>优势：{recordList(payload, "strengths").slice(0, 2).join("；") || "待审阅"}</strong><span>需要注意：{recordList(payload, "concerns").slice(0, 2).join("；") || "未填写"}</span><span>建议：{recordList(payload, "suggestions").slice(0, 2).join("；") || "未填写"}</span></div>;
  if (candidate.task === "GenerateBookPackaging" && Array.isArray(payload.candidates)) return <div className="cf-signing-sprint-preview">{payload.candidates.slice(0, 5).map((item, index) => <span key={index}>{recordText(item, "title")}</span>)}</div>;
  if (candidate.task === "GenerateOpeningBlueprint") return <p className="cf-signing-sprint-preview">{text(payload.openingHook)}{Array.isArray(payload.firstThreeChapters) ? ` · ${payload.firstThreeChapters.length} 个开篇章节` : ""}</p>;
  if (candidate.task === "EvaluateOpening" && Array.isArray(payload.issues)) return <div className="cf-signing-sprint-preview">{payload.issues.slice(0, 3).map((issue, index) => <span key={index}>{recordText(issue, "title")}{recordList(issue, "locations").length ? ` · ${recordList(issue, "locations").join("、")}` : ""}</span>)}</div>;
  if (candidate.task === "GenerateChapterFromIntent") return <div className="cf-signing-sprint-preview cf-signing-sprint-preview--stack"><strong>{text(payload.goal) || "章节目标待审阅"}</strong><span>{text(payload.conflict) || "尚未填写章节冲突"}</span><span>{text(payload.hook) || "尚未填写章尾 Hook"}</span></div>;
  if (candidate.task === "SigningReadinessReview") return <div className="cf-signing-sprint-preview cf-signing-sprint-preview--stack"><strong>{text(payload.headline) || "签约准备预检"}</strong><span>{text(payload.status) === "ready_to_prepare_submission" ? "可以准备提交" : "建议先处理问题"}</span>{Array.isArray(payload.issues) ? payload.issues.slice(0, 3).map((issue, index) => <span key={index}>{recordText(issue, "title")}{recordText(issue, "source") ? ` · ${recordText(issue, "source")}` : ""}</span>) : null}</div>;
  return <p className="cf-signing-sprint-preview">这是一个可继续审阅的编辑建议，请结合你的作品资料判断。</p>;
}

function SignalSummary({ report }: { report: NonNullable<SprintWorkflow["state"]["openingCheck"]> }) {
  return <div className="cf-signing-sprint-mini-report"><strong>{report.analyzedChapterCount} 个章节已检查</strong><span>{report.metrics.characterCount} 字 · 对话占比 {Math.round(report.metrics.dialogueRatio * 100)}%</span><span>长段落 {report.metrics.longParagraphCount} · 重复段落 {report.metrics.repeatedParagraphCount}</span><div className="cf-signing-sprint-signal-list">{report.signals.map((signal) => <span key={signal.code}><strong>{signal.label}</strong> {signal.value} · {signal.locations.length ? signal.locations.join("、") : "全文观察"}</span>)}</div></div>;
}

function ReadinessSummary({ report }: { report: NonNullable<SprintWorkflow["state"]["readiness"]> }) {
  return <div className="cf-signing-sprint-mini-report"><strong>{report.headline}</strong><span>{report.issues.length ? `有 ${report.issues.length} 项需要回看` : "暂未发现需要处理的项目"}</span><span>资料 {report.checks.metadata} · 内容 {report.checks.content} · 开篇质量 {report.checks.openingQuality} · 一致性 {report.checks.consistency}</span><span>官方匹配 {report.checks.officialMatching} · 技术安全 {report.checks.technicalSafety}</span>{report.issues.slice(0, 3).map((issue) => <span key={issue.code}>· {issue.title}</span>)}</div>;
}

function StepTitle({ title, description }: { title: string; description: string }) { return <div className="cf-section-title"><div><h2>{title}</h2><p>{description}</p></div></div>; }

function candidateForStep(task: SigningSprintTask, step: SigningSprintStep): boolean {
  if (step === "direction") return task === "BrainstormBookDirection";
  if (step === "positioning") return task === "RefineBookPositioning" || task === "EvaluatePositioning";
  if (step === "story_engine") return task === "GenerateStoryEngine";
  if (step === "packaging") return task === "GenerateBookPackaging" || task === "EvaluateBookPackaging";
  if (step === "opening") return task === "GenerateOpeningBlueprint" || task === "EvaluateOpening";
  if (step === "writing") return task === "GenerateChapterFromIntent" || task === "SigningReadinessReview" || task === "EvaluateOpening";
  return false;
}

function uiStep(step: SigningSprintStep): Exclude<SigningSprintStep, "readiness"> {
  return step === "readiness" ? "writing" : step;
}

function candidateLabel(task: SigningSprintTask): string {
  const labels: Record<SigningSprintTask, string> = {
    BrainstormBookDirection: "开书方向",
    RefineBookPositioning: "作品定位",
    GenerateStoryEngine: "人物与冲突",
    EvaluatePositioning: "定位检查",
    GenerateBookPackaging: "包装方向",
    EvaluateBookPackaging: "包装检查",
    GenerateOpeningBlueprint: "开篇计划",
    EvaluateOpening: "开篇检查建议",
    GenerateChapterFromIntent: "章节写作意图",
    SigningReadinessReview: "签约准备预检",
  };
  return labels[task];
}

function positioningDefaults(saved: Positioning | null): Positioning {
  return saved ?? { oneLineStory: "", coreIdea: "", sellingPoints: [], emotionalPayoff: "", readerProfile: "", protagonistDesire: "", obstacle: "", mechanism: "", coreConflict: "", longTermExpectation: "", sustainability: { shortTermAppeal: "", midTermExpansion: "", longTermSpace: "" }, riskNotes: [] };
}

function completedWith(workflow: SprintWorkflow, step: SigningSprintStep): SigningSprintStep[] {
  return Array.from(new Set<SigningSprintStep>([...workflow.completedSteps, step]));
}

function openingDefaults(workflow: SprintWorkflow): OpeningBlueprintDto {
  const saved = workflow.state.openingBlueprint;
  if (saved) return saved;
  const premise = workflow.state.direction?.premise ?? "";
  const positioning = workflow.state.positioning;
  const direction = workflow.state.direction;
  const chapter = (index: number): OpeningChapterBlueprintDto => ({
    index,
    title: `第${index}章`,
    purpose: index === 1 ? "setup" : "progress",
    protagonistAction: index === 1 && premise ? premise : "主角继续推进第一阶段目标",
    conflict: positioning?.coreConflict || "新的阻力迫使主角做出选择",
    readerExpectation: positioning?.longTermExpectation || "主角能否完成下一步目标？",
    emotionTarget: direction?.coreEmotion || "紧张",
    hook: "留下一个需要立刻追问的问题",
    payoff: "推进第一阶段目标，并为下一章制造变化",
    targetWords: null,
  });
  const firstArcChapters = Array.from({ length: 12 }, (_, offset) => chapter(offset + 1));
  const firstThreeChapters = firstArcChapters.slice(0, 3);
  return {
    readerPromise: positioning?.emotionalPayoff || direction?.coreEmotion || "主角必须在新的阻力中做出选择",
    openingHook: "一个会迫使主角立刻行动的变化",
    expectation: positioning?.longTermExpectation || "主角能否完成第一阶段目标？",
    informationRevealPlan: [],
    firstThreeChapters,
    firstArcTitle: "第一阶段",
    firstArcGoal: positioning?.protagonistDesire || "主角完成第一阶段目标",
    firstArcConflict: positioning?.coreConflict || "主角与主要阻力正面碰撞",
    firstArcPayoff: "阶段目标被部分兑现，并引出下一层问题",
    firstArcChapters,
    riskNotes: [],
  };
}

function lines(value: string): string[] { return value.split(/[\n,，]/u).map((item) => item.trim()).filter(Boolean); }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function recordText(value: unknown, key: string): string { return value && typeof value === "object" && !Array.isArray(value) ? text((value as Record<string, unknown>)[key]) : ""; }
function recordList(value: unknown, key: string): string[] { const field = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : null; return Array.isArray(field) ? field.filter((item): item is string => typeof item === "string") : []; }
