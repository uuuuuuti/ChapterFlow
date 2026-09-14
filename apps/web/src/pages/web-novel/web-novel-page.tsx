import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { BookOpen, Check, Plus, Save, Sparkles } from "lucide-react";
import { useStory } from "../../entities/project/queries";
import {
  applyCreativePreset,
  createCreativePreset,
  getCreativePresetHistory,
  getBookProfile,
  getBookProfileHistory,
  getChapterBrief,
  getChapterBriefHistory,
  getReaderPromises,
  createReaderPromise,
  applyReaderPromiseAction,
  getCreativePresets,
  getOpeningCheckAudit,
  getOpeningThreeCheckHistory,
  runOpeningThreeCheck,
  updateOpeningCheckIssue,
  updateCreativePreset,
  updateBookProfile,
  updateChapterBrief,
  restoreChapterBriefHistory,
  restoreBookProfileHistory,
  restoreCreativePresetHistory,
} from "../../shared/api/web-novel";
import type {
  BookProfileDto,
  BookProfileHistoryDto,
  ChapterBriefDto,
  ChapterBriefHistoryDto,
  ReaderPromiseViewDto,
  CreativePresetDto,
  CreativePresetHistoryDto,
  OpeningThreeCheckReport,
  StoryBible,
} from "../../shared/api/types";
import { ConfirmDialog, ErrorNote, ResourceErrorState } from "../../shared/ui";
import { queryKeys } from "../../shared/query/keys";
import { isAuthoringConflict } from "../../shared/api/client";
import { WebNovelCandidateReview } from "../../features/web-novel/web-novel-candidate-review";

const pacingLabels = {
  slow: "舒缓",
  steady: "稳步",
  fast: "快节奏",
  cliffhanger: "钩子密集",
} as const;

const chapterPurposeLabels = {
  setup: "铺垫",
  progress: "推进",
  conflict: "冲突",
  reveal: "揭示",
  payoff: "兑现",
  turning_point: "转折",
  relationship: "关系",
  worldbuilding: "世界观",
  transition: "过渡",
  climax: "高潮",
} as const;

const emotionTargetLabels = {
  爽: "爽",
  紧张: "紧张",
  期待: "期待",
  惊讶: "惊讶",
  压迫: "压迫",
  感动: "感动",
  暧昧: "暧昧",
  恐惧: "恐惧",
  轻松: "轻松",
} as const;

const hookTypeLabels = {
  question: "问题",
  reveal: "揭示",
  danger: "危险",
  decision: "抉择",
  arrival: "到场",
  identity: "身份",
  information_gap: "信息缺口",
  emotional: "情绪",
  reward: "回报",
  reverse: "反转",
} as const;

const profileConflictFields = [
  ["genre", "题材"],
  ["audience", "目标读者"],
  ["promise", "核心承诺"],
  ["tone", "叙事风格"],
  ["endingDirection", "结局方向"],
  ["pov", "叙事视角"],
  ["updateCadence", "更新节奏"],
  ["targetWordsPerChapter", "每章目标字数"],
  ["boundaries", "创作边界"],
  ["worldRules", "世界规则"],
  ["arcNotes", "长线弧光"],
] as const;
type ProfileConflictField = (typeof profileConflictFields)[number][0];
type ProfileConflictChoice = "local" | "remote";
const presetConflictFields = [
  ["name", "预设名称"],
  ["genre", "题材"],
  ["audience", "目标读者"],
  ["promise", "读者承诺"],
  ["pacing", "节奏"],
  ["targetWordsPerChapter", "每章目标字数"],
  ["updateCadence", "更新节奏"],
  ["boundaries", "创作边界"],
  ["checkRules", "检查规则"],
] as const;
type PresetConflictField = (typeof presetConflictFields)[number][0];
const briefConflictFields = [
  ["purpose", "主目的"],
  ["goal", "本章目标"],
  ["readerExpectation", "读者期待"],
  ["emotionTarget", "情绪目标"],
  ["conflict", "核心冲突"],
  ["readerPromiseOperations", "Promise 操作"],
  ["payoff", "读者回报"],
  ["payoffStrength", "回报强度"],
  ["hook", "章尾钩子"],
  ["hookType", "钩子类型"],
  ["hookStrength", "钩子强度"],
  ["informationGain", "信息增量"],
  ["endingPull", "结尾牵引"],
  ["sceneStructure", "场景结构"],
  ["targetWords", "目标字数"],
  ["pacing", "节奏"],
  ["characterIds", "本章人物"],
  ["foreshadowIds", "关联伏笔"],
  ["timelineIds", "关联时间线"],
] as const;
type BriefConflictField = (typeof briefConflictFields)[number][0];

export function WebNovelPage({ projectId }: { projectId: string }) {
  const story = useStory(projectId);
  const profile = useQuery({
    queryKey: queryKeys.bookProfile(projectId),
    queryFn: ({ signal }) => getBookProfile(projectId, signal),
  });
  const profileHistory = useQuery({
    queryKey: queryKeys.bookProfileHistory(projectId),
    queryFn: ({ signal }) => getBookProfileHistory(projectId, signal),
  });
  const presets = useQuery({
    queryKey: queryKeys.creativePresets(projectId),
    queryFn: ({ signal }) => getCreativePresets(projectId, signal),
  });
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const chapters = useMemo(
    () => (story.data?.outline ?? []).filter((node) => node.kind === "chapter"),
    [story.data?.outline],
  );

  const requestedChapter = params.get("chapter");
  const selectedChapter = chapters.some((chapter) => chapter.id === requestedChapter)
    ? requestedChapter ?? ""
    : chapters[0]?.id ?? "";

  if (story.isPending)
    return <div className="cf-card" role="status">正在读取网文规划…</div>;
  if (story.isError)
    return (
      <ResourceErrorState
        error={story.error}
        backHref={`/books/${projectId}/dashboard`}
        backLabel="回到创作首页"
        title="网文规划暂时无法打开"
      />
    );

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.bookProfile(projectId) }),
      client.invalidateQueries({ queryKey: queryKeys.bookProfileHistory(projectId) }),
      client.invalidateQueries({ queryKey: queryKeys.creativePresets(projectId) }),
    ]);
  };

  return (
    <div className="cf-web-novel-stack">
      {profile.isError || profileHistory.isError || presets.isError ? (
        <section className="cf-card" role="alert">
          {profile.isError ? <ErrorNote error={profile.error} title="作品档案读取失败" /> : null}
          {profileHistory.isError ? <ErrorNote error={profileHistory.error} title="作品档案历史读取失败" /> : null}
          {presets.isError ? <ErrorNote error={presets.error} title="创作预设读取失败" /> : null}
        </section>
      ) : null}
      <ProfileCard key={`profile-${profile.data?.version ?? "new"}`} projectId={projectId} profile={profile.data ?? null} history={profileHistory.data ?? []} onSaved={invalidate} />
      <PresetCard projectId={projectId} profile={profile.data ?? null} presets={presets.data ?? []} onApplied={invalidate} onCreated={invalidate} />
      <ReaderPromiseCard projectId={projectId} chapterId={selectedChapter} chapters={chapters} onChapterChange={(id) => { setParams({ tool: "web-novel", chapter: id }); }} />
      <BriefCard key={selectedChapter} projectId={projectId} chapterId={selectedChapter} chapters={chapters} story={story.data!} onChapterChange={(id) => { setParams({ tool: "web-novel", chapter: id }); }} />
      <OpeningCheckCard
        projectId={projectId}
        autoRun={params.get("check") === "1"}
        recheckIssueId={params.get("checkIssue")}
      />
    </div>
  );
}

function ProfileCard({
  projectId,
  profile,
  history,
  onSaved,
}: {
  projectId: string;
  profile: BookProfileDto | null;
  history: BookProfileHistoryDto[];
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(() => profileForm(profile));
  const [baseVersion, setBaseVersion] = useState<number | null>(
    profile?.version ?? null,
  );
  const [restoreTarget, setRestoreTarget] = useState<BookProfileHistoryDto | null>(null);
  const [profileConflict, setProfileConflict] = useState<BookProfileDto | null>(null);
  const [conflictChoices, setConflictChoices] = useState<
    Record<ProfileConflictField, ProfileConflictChoice>
  >(defaultProfileConflictChoices);
  const remoteForm = profileConflict ? profileForm(profileConflict) : null;
  const save = useMutation({
    mutationFn: () =>
      updateBookProfile(projectId, {
        ...form,
        targetWordsPerChapter: form.targetWordsPerChapter
          ? Number(form.targetWordsPerChapter)
          : null,
        boundaries: lines(form.boundaries),
        worldRules: lines(form.worldRules),
        arcNotes: lines(form.arcNotes),
        expectedVersion: baseVersion,
      }),
    onSuccess: async (saved) => {
      setBaseVersion(saved.version);
      setProfileConflict(null);
      await onSaved();
    },
    onError: (error) => {
      if (isAuthoringConflict(error)) {
        const details = error instanceof Error && "details" in error
          ? (error as Error & { details?: unknown }).details
          : null;
        const current = details && typeof details === "object"
          ? (details as { currentProfile?: unknown }).currentProfile
          : null;
        if (current && typeof current === "object") {
          setProfileConflict(current as BookProfileDto);
          setConflictChoices(defaultProfileConflictChoices());
        }
      }
    },
  });
  const restore = useMutation({
    mutationFn: () => {
      if (!restoreTarget || !profile || baseVersion === null)
        throw new Error("没有可恢复的作品档案版本。");
      return restoreBookProfileHistory(projectId, restoreTarget.id, baseVersion);
    },
    onSuccess: async (saved) => {
      setBaseVersion(saved.version);
      setRestoreTarget(null);
      await onSaved();
    },
  });
  const pending = save.isPending || restore.isPending;
  return (
    <section className="cf-card cf-web-novel-card">
      <div className="cf-section-title">
        <div>
          <h2>网文作品档案</h2>
          <p>把题材、读者承诺、节奏和长线边界固定下来，章纲与检查会以此为依据。</p>
        </div>
        <BookOpen size={22} />
      </div>
      <div className="cf-form-grid">
        <label>题材<input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} placeholder="例如：都市悬疑" /></label>
        <label>目标读者<input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="例如：喜欢快节奏反转的读者" /></label>
      </div>
      <label>核心承诺<textarea rows={2} value={form.promise} onChange={(e) => setForm({ ...form, promise: e.target.value })} placeholder="读者持续追更时，最期待得到什么？" /></label>
      <div className="cf-form-grid">
        <label>叙事风格<input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} /></label>
        <label>叙事视角<input value={form.pov} onChange={(e) => setForm({ ...form, pov: e.target.value })} placeholder="例如：近距离第三人称" /></label>
        <label>更新节奏<input value={form.updateCadence} onChange={(e) => setForm({ ...form, updateCadence: e.target.value })} placeholder="例如：日更 1 章" /></label>
        <label>每章目标字数<input type="number" min={1} value={form.targetWordsPerChapter} onChange={(e) => setForm({ ...form, targetWordsPerChapter: e.target.value })} /></label>
      </div>
      <label>结局方向<textarea rows={2} value={form.endingDirection} onChange={(e) => setForm({ ...form, endingDirection: e.target.value })} /></label>
      <div className="cf-form-grid">
        <label>创作边界（每行一项）<textarea rows={3} value={form.boundaries} onChange={(e) => setForm({ ...form, boundaries: e.target.value })} /></label>
        <label>世界规则（每行一项）<textarea rows={3} value={form.worldRules} onChange={(e) => setForm({ ...form, worldRules: e.target.value })} /></label>
        <label>长线弧光（每行一项）<textarea rows={3} value={form.arcNotes} onChange={(e) => setForm({ ...form, arcNotes: e.target.value })} /></label>
      </div>
      {save.isError ? <ErrorNote error={save.error} /> : null}
      {profileConflict ? (
        <section className="cf-conflict-recovery" role="alert" aria-label="作品档案冲突恢复">
          <strong>作品档案已在其他页面更新</strong>
          <p>当前表单仍保留本地修改。请选择保留本地内容，或读取最新档案后再合并。</p>
          <div className="cf-conflict-fields" role="group" aria-label="作品档案字段合并">
            <small>逐字段选择后点击“合并选中字段”。合并只更新当前表单，仍需再次点击保存。</small>
            {profileConflictFields.map(([key, label]) => {
              const localValue = form[key];
              const remoteValue = remoteForm?.[key] ?? "";
              const changed = localValue !== remoteValue;
              return (
                <label className={changed ? "is-changed" : ""} key={key}>
                  <span>{label}{changed ? " · 有差异" : ""}</span>
                  <select
                    aria-label={`${label}冲突处理`}
                    value={conflictChoices[key]}
                    onChange={(event) =>
                      setConflictChoices((current) => ({
                        ...current,
                        [key]: event.target.value as ProfileConflictChoice,
                      }))
                    }
                  >
                    <option value="remote">使用远端</option>
                    <option value="local">保留本地</option>
                  </select>
                  {changed ? <small>本地：{String(localValue || "（空）")} · 远端：{String(remoteValue || "（空）")}</small> : null}
                </label>
              );
            })}
          </div>
          <div className="cf-actions">
            <button
              type="button"
              className="cf-primary"
              onClick={() => {
                if (!remoteForm) return;
                const merged = { ...remoteForm };
                for (const [key] of profileConflictFields) {
                  if (conflictChoices[key] === "local") merged[key] = form[key];
                }
                save.reset();
                setForm(merged);
                setBaseVersion(profileConflict.version);
                setProfileConflict(null);
              }}
            >
              合并选中字段
            </button>
            <button
              type="button"
              className="cf-button"
              onClick={() => {
                save.reset();
                setBaseVersion(profileConflict.version);
                setProfileConflict(null);
              }}
            >
              保留本地修改
            </button>
            <button
              type="button"
              className="cf-primary"
              onClick={() => {
                save.reset();
                setForm(profileForm(profileConflict));
                setBaseVersion(profileConflict.version);
                setProfileConflict(null);
                void onSaved();
              }}
            >
              读取最新档案
            </button>
          </div>
        </section>
      ) : null}
      {restore.isError ? <ErrorNote error={restore.error} title="恢复作品档案失败" /> : null}
      <button className="cf-primary" disabled={pending} onClick={() => save.mutate()}><Save size={15} />{save.isPending ? "正在保存…" : "保存作品档案"}</button>
      <WebNovelCandidateReview
        projectId={projectId}
        kind="profile"
        title="AI 档案候选"
        description="把档案调整先放入候选卡，确认后才会生成新的档案版本。"
        defaultInstruction="结合当前作品命题，收紧读者承诺、叙事风格和长线边界。"
      />
      <div className="cf-web-novel-history" aria-label="作品档案历史">
        <div className="cf-web-novel-history__heading">
          <div><strong>作品档案历史</strong><span>每次覆盖式保存都会保留上一个版本，可随时恢复。</span></div>
          {history.length ? <small>{history.length} 个历史版本</small> : null}
        </div>
        {history.length ? <div className="cf-web-novel-history__list">{history.map((item) => <article className="cf-web-novel-history__item" key={item.id}>
          <div><strong>版本 v{item.profileVersion}</strong><span>{formatHistoryTime(item.createdAt)}</span><small>{item.snapshot.genre || "未指定题材"}{item.snapshot.promise ? ` · ${item.snapshot.promise}` : ""}</small></div>
          <button type="button" className="cf-button" disabled={pending || !profile} onClick={() => setRestoreTarget(item)}>恢复此版本</button>
        </article>)}</div> : <p className="cf-muted">保存两次后，这里会出现可恢复的档案版本。</p>}
      </div>
      {restoreTarget ? <ConfirmDialog title={`恢复作品档案 v${restoreTarget.profileVersion}？`} confirmLabel="确认恢复" pending={restore.isPending} confirmDisabled={pending} onCancel={() => setRestoreTarget(null)} onConfirm={() => restore.mutate()}><p>当前版本会先自动留在历史记录中，然后把所选版本恢复到作品档案。章节简报和正文不会被修改。</p><p className="cf-muted">恢复后档案版本号会继续递增，避免覆盖其他页面刚刚保存的内容。</p></ConfirmDialog> : null}
    </section>
  );
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function PresetCard({
  projectId,
  profile,
  presets,
  onApplied,
  onCreated,
}: {
  projectId: string;
  profile: BookProfileDto | null;
  presets: CreativePresetDto[];
  onApplied: () => Promise<void>;
  onCreated: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CreativePresetDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PresetDraft>(() => presetDraft(null));
  const [applyTarget, setApplyTarget] = useState<{
    preset: CreativePresetDto;
    before: BookProfileDto | null;
  } | null>(null);
  const [lastApplied, setLastApplied] = useState<{
    before: BookProfileDto | null;
    after: BookProfileDto;
    presetName: string;
  } | null>(null);
  const [undoNotice, setUndoNotice] = useState("");
  const [historyTarget, setHistoryTarget] = useState<CreativePresetDto | null>(null);
  const [restoreHistoryTarget, setRestoreHistoryTarget] =
    useState<CreativePresetHistoryDto | null>(null);
  const [presetConflict, setPresetConflict] = useState<CreativePresetDto | null>(null);
  const [presetConflictChoices, setPresetConflictChoices] = useState<
    Record<PresetConflictField, ProfileConflictChoice>
  >(defaultPresetConflictChoices);
  const apply = useMutation({
    mutationFn: ({ presetId }: { presetId: string; before: BookProfileDto | null }) =>
      applyCreativePreset(projectId, presetId),
    onSuccess: async (after, variables) => {
      setApplyTarget(null);
      setUndoNotice("");
      setLastApplied({
        before: variables.before,
        after,
        presetName: presets.find((preset) => preset.id === after.presetId)?.name ?? "创作预设",
      });
      await onApplied();
    },
  });
  const undo = useMutation({
    mutationFn: () => {
      if (!lastApplied) throw new Error("没有可撤销的预设应用。 ");
      return updateBookProfile(projectId, {
        ...bookProfileInput(lastApplied.before),
        expectedVersion: lastApplied.after.version,
      });
    },
    onSuccess: async () => {
      setUndoNotice(lastApplied?.presetName ?? "创作预设");
      setLastApplied(null);
      await onApplied();
    },
  });
  const create = useMutation({
    mutationFn: () => createCreativePreset({ projectId, ...presetInput(draft) }),
    onSuccess: async () => {
      setCreating(false);
      setDraft(presetDraft(null));
      await onCreated();
    },
  });
  const update = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("请先选择要编辑的预设。");
      return updateCreativePreset(editing, {
        ...presetInput(draft),
        status: editing.status,
      });
    },
    onSuccess: async () => {
      setPresetConflict(null);
      setEditing(null);
      setDraft(presetDraft(null));
      await onCreated();
    },
    onError: (error) => {
      if (!isAuthoringConflict(error)) return;
      const details = error instanceof Error && "details" in error
        ? (error as Error & { details?: unknown }).details
        : null;
      const current = details && typeof details === "object"
        ? (details as { currentPreset?: unknown }).currentPreset
        : null;
      if (current && typeof current === "object") {
        setPresetConflict(current as CreativePresetDto);
        setPresetConflictChoices(defaultPresetConflictChoices());
      }
    },
  });
  const lifecycle = useMutation({
    mutationFn: (preset: CreativePresetDto) =>
      updateCreativePreset(preset, {
        ...presetInput(presetDraft(preset)),
        status: preset.status === "active" ? "archived" : "active",
      }),
    onSuccess: onCreated,
  });
  const history = useQuery({
    queryKey: queryKeys.creativePresetHistory(historyTarget?.id ?? null),
    queryFn: ({ signal }) =>
      getCreativePresetHistory(historyTarget!.id, signal),
    enabled: Boolean(historyTarget),
  });
  const restoreHistory = useMutation({
    mutationFn: () => {
      if (!historyTarget || !restoreHistoryTarget) {
        throw new Error("没有可恢复的预设版本。");
      }
      const current = presets.find((preset) => preset.id === historyTarget.id);
      if (!current) throw new Error("预设已不存在，请重新读取列表。");
      return restoreCreativePresetHistory(
        historyTarget.id,
        restoreHistoryTarget.id,
        current.version,
      );
    },
    onSuccess: async () => {
      setRestoreHistoryTarget(null);
      await onCreated();
      if (historyTarget) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.creativePresetHistory(historyTarget.id),
        });
      }
    },
  });
  const startCreate = () => {
    setEditing(null);
    setDraft(presetDraft(null));
    setCreating(true);
  };
  const startEdit = (preset: CreativePresetDto) => {
    setCreating(false);
    setEditing(preset);
    setDraft(presetDraft(preset));
  };
  const pending = create.isPending || update.isPending || lifecycle.isPending || apply.isPending || undo.isPending || restoreHistory.isPending;
  return (
    <section className="cf-card cf-web-novel-card">
      <div className="cf-section-title"><div><h2>网文创作预设</h2><p>预设只会在你主动应用后写入作品档案，应用后仍可继续修改。</p></div><Sparkles size={22} /></div>
      <div className="cf-entity-grid">
        {presets.map((preset) => <article className={`cf-entity-card ${preset.status === "archived" ? "is-archived" : ""}`} key={preset.id}><span className="cf-badge">{preset.status === "archived" ? "已归档" : preset.projectId ? "本作品" : "通用"}</span><h3>{preset.name}</h3><p>{preset.genre || "未指定题材"} · {pacingLabels[preset.pacing]} · {preset.targetWordsPerChapter.toLocaleString()} 字/章</p><div className="cf-actions">{preset.status === "active" ? <button className="cf-button" disabled={pending} onClick={() => setApplyTarget({ preset, before: profile })}><Check size={15} />应用到本书</button> : null}<button className="cf-text-link" disabled={pending} onClick={() => startEdit(preset)}>编辑</button><button className="cf-text-link" disabled={pending} onClick={() => lifecycle.mutate(preset)}>{preset.status === "active" ? "归档" : "恢复"}</button><button className="cf-text-link" disabled={pending} onClick={() => setHistoryTarget(preset)}>查看历史</button></div></article>)}
        {!presets.length ? <div className="cf-empty"><Sparkles size={34} /><p>还没有可用预设，可以先创建一份。</p></div> : null}
      </div>
      {apply.isError ? <ErrorNote error={apply.error} /> : null}
      {undo.isError ? <ErrorNote error={undo.error} /> : null}
      {presetConflict ? (
        <section className="cf-conflict-recovery" role="alert" aria-label="创作预设冲突恢复">
          <strong>创作预设已在其他页面更新</strong>
          <p>当前表单仍保留本地修改。逐字段合并只更新当前表单，仍需再次点击保存。</p>
          <div className="cf-conflict-fields" role="group" aria-label="创作预设字段合并">
            {presetConflictFields.map(([key, label]) => {
              const remoteDraft = presetDraft(presetConflict)[key];
              const localValue = draft[key];
              const changed = localValue !== remoteDraft;
              return <label className={changed ? "is-changed" : ""} key={key}><span>{label}{changed ? " · 有差异" : ""}</span><select aria-label={`${label}冲突处理`} value={presetConflictChoices[key]} onChange={(event) => setPresetConflictChoices((current) => ({ ...current, [key]: event.target.value as ProfileConflictChoice }))}><option value="remote">使用远端</option><option value="local">保留本地</option></select>{changed ? <small>本地：{String(localValue || "（空）")} · 远端：{String(remoteDraft || "（空）")}</small> : null}</label>;
            })}
          </div>
          <div className="cf-actions">
            <button
              type="button"
              className="cf-primary"
              onClick={() => {
                const remoteDraft = presetDraft(presetConflict);
                const merged = { ...remoteDraft };
                for (const [key] of presetConflictFields) {
                  if (presetConflictChoices[key] === "local") {
                    Object.assign(merged, { [key]: draft[key] });
                  }
                }
                update.reset();
                setEditing(presetConflict);
                setDraft(merged);
                setPresetConflict(null);
              }}
            >
              合并选中字段
            </button>
            <button
              type="button"
              className="cf-button"
              onClick={() => {
                update.reset();
                setEditing(presetConflict);
                setPresetConflict(null);
              }}
            >
              保留本地修改
            </button>
            <button
              type="button"
              className="cf-primary"
              onClick={() => {
                update.reset();
                setEditing(presetConflict);
                setDraft(presetDraft(presetConflict));
                setPresetConflict(null);
              }}
            >
              读取最新预设
            </button>
          </div>
        </section>
      ) : null}
      {lastApplied ? <div className={`cf-web-novel-undo ${undoNotice ? "is-hidden" : ""}`} role="status"><div><strong>已应用「{lastApplied.presetName}」</strong><span>作品档案已生成新版本 v{lastApplied.after.version}，可以撤销这次应用。</span></div><button className="cf-button" disabled={pending} onClick={() => undo.mutate()}>撤销上次应用</button></div> : null}
      {undoNotice ? <div className="cf-web-novel-undo is-reverted" role="status"><strong>已撤销「{undoNotice}」</strong><span>作品档案已恢复到应用前版本。</span></div> : null}
      {lifecycle.isError ? <ErrorNote error={lifecycle.error} /> : null}
      {restoreHistory.isError ? <ErrorNote error={restoreHistory.error} title="恢复预设历史失败" /> : null}
      {historyTarget ? <section className="cf-web-novel-history" aria-label="创作预设历史"><div className="cf-web-novel-history__heading"><div><strong>「{historyTarget.name}」的历史</strong><span>每次覆盖式保存和归档状态变更都会保留上一个版本。</span></div><button type="button" className="cf-text-link" onClick={() => setHistoryTarget(null)}>关闭</button></div>{history.isError ? <ErrorNote error={history.error} title="创作预设历史读取失败" /> : history.isPending ? <p role="status">正在读取预设历史…</p> : history.data?.length ? <div className="cf-web-novel-history__list">{history.data.map((item) => <article className="cf-web-novel-history__item" key={item.id}><div><strong>版本 v{item.presetVersion}</strong><span>{formatHistoryTime(item.createdAt)}</span><small>{item.snapshot.name} · {item.snapshot.genre || "未指定题材"} · {pacingLabels[item.snapshot.pacing]}</small></div><button type="button" className="cf-button" disabled={pending} onClick={() => setRestoreHistoryTarget(item)}>恢复此版本</button></article>)}</div> : <p className="cf-muted">保存或归档两次后，这里会出现可恢复的预设版本。</p>}</section> : null}
      {!creating && !editing ? <button className="cf-button" onClick={startCreate}><Plus size={15} />新建本作品预设</button> : <form className="cf-form cf-web-novel-preset-form" onSubmit={(event) => { event.preventDefault(); if (!draft.name.trim()) return; if (editing) update.mutate(); else create.mutate(); }}><PresetFormFields draft={draft} onChange={setDraft} />{create.isError ? <ErrorNote error={create.error} /> : null}{update.isError ? <ErrorNote error={update.error} /> : null}<div className="cf-actions"><button type="button" className="cf-button" onClick={() => { setCreating(false); setEditing(null); }}>取消</button><button className="cf-primary" disabled={pending}>{pending ? "正在保存…" : editing ? "保存预设修改" : "保存预设"}</button></div></form>}
      {applyTarget ? <ConfirmDialog title={`应用「${applyTarget.preset.name}」？`} confirmLabel="确认应用" pending={apply.isPending} confirmDisabled={pending} onCancel={() => setApplyTarget(null)} onConfirm={() => apply.mutate({ presetId: applyTarget.preset.id, before: applyTarget.before })}><p>这会把预设中的题材、读者承诺、节奏、每章字数、更新节奏、创作边界和检查规则写入当前作品档案，并生成一个新版本。</p><div className="cf-web-novel-impact"><strong>本次会改变</strong>{profileImpact(applyTarget.before, applyTarget.preset).map((item) => <div key={item.label}><span>{item.label}</span><small>{item.value}</small></div>)}</div><p className="cf-muted">应用完成后可以在这里撤销，恢复到应用前的档案版本。</p></ConfirmDialog> : null}
      {restoreHistoryTarget ? <ConfirmDialog title={`恢复预设 v${restoreHistoryTarget.presetVersion}？`} confirmLabel="确认恢复" pending={restoreHistory.isPending} confirmDisabled={pending} onCancel={() => setRestoreHistoryTarget(null)} onConfirm={() => restoreHistory.mutate()}><p>当前预设会先自动留在历史记录中，然后把所选版本恢复到预设。已经应用到作品档案的内容不会自动回写。</p><p className="cf-muted">恢复后预设版本号会继续递增，避免覆盖其他页面刚刚保存的内容。</p></ConfirmDialog> : null}
    </section>
  );
}

type PresetDraft = {
  name: string;
  genre: string;
  audience: string;
  promise: string;
  pacing: CreativePresetDto["pacing"];
  targetWordsPerChapter: string;
  updateCadence: string;
  boundaries: string;
  checkRules: string;
};

function presetDraft(preset: CreativePresetDto | null): PresetDraft {
  return {
    name: preset?.name ?? "",
    genre: preset?.genre ?? "",
    audience: preset?.audience ?? "",
    promise: preset?.promise ?? "",
    pacing: preset?.pacing ?? "steady",
    targetWordsPerChapter: String(preset?.targetWordsPerChapter ?? 2500),
    updateCadence: preset?.updateCadence ?? "",
    boundaries: preset?.boundaries.join("\n") ?? "",
    checkRules: preset?.checkRules.join("\n") ?? "",
  };
}

function presetInput(draft: PresetDraft) {
  return {
    name: draft.name.trim(),
    genre: draft.genre.trim() || null,
    audience: draft.audience.trim() || null,
    promise: draft.promise.trim() || null,
    pacing: draft.pacing,
    targetWordsPerChapter: Math.max(1, Number(draft.targetWordsPerChapter) || 2500),
    updateCadence: draft.updateCadence.trim() || null,
    boundaries: lines(draft.boundaries),
    checkRules: lines(draft.checkRules),
    defaultTemplate: null,
  };
}

function bookProfileInput(profile: BookProfileDto | null) {
  return {
    presetId: profile?.presetId ?? null,
    genre: profile?.genre ?? null,
    audience: profile?.audience ?? null,
    promise: profile?.promise ?? null,
    tone: profile?.tone ?? null,
    endingDirection: profile?.endingDirection ?? null,
    pov: profile?.pov ?? null,
    updateCadence: profile?.updateCadence ?? null,
    targetWordsPerChapter: profile?.targetWordsPerChapter ?? null,
    boundaries: profile?.boundaries ?? [],
    worldRules: profile?.worldRules ?? [],
    arcNotes: profile?.arcNotes ?? [],
  };
}

function profileImpact(profile: BookProfileDto | null, preset: CreativePresetDto): Array<{ label: string; value: string }> {
  const next = {
    genre: preset.genre,
    audience: preset.audience,
    promise: preset.promise,
    pacing: pacingLabels[preset.pacing],
    targetWordsPerChapter: `${preset.targetWordsPerChapter.toLocaleString()} 字/章`,
    updateCadence: preset.updateCadence,
    boundaries: `${preset.boundaries.length} 条边界`,
    checkRules: `${preset.checkRules.length} 条检查规则`,
  };
  const previous = {
    genre: profile?.genre,
    audience: profile?.audience,
    promise: profile?.promise,
    pacing: "沿用当前档案",
    targetWordsPerChapter: profile?.targetWordsPerChapter ? `${profile.targetWordsPerChapter.toLocaleString()} 字/章` : "未设置",
    updateCadence: profile?.updateCadence,
    boundaries: `${profile?.boundaries.length ?? 0} 条边界`,
    checkRules: "将由预设写入",
  };
  return Object.entries(next).map(([key, value]) => ({
    label: impactLabels[key] ?? key,
    value: `${previous[key as keyof typeof previous] || "未设置"} → ${value || "未设置"}`,
  }));
}

const impactLabels: Record<string, string> = {
  genre: "题材",
  audience: "目标读者",
  promise: "读者承诺",
  pacing: "节奏",
  targetWordsPerChapter: "每章目标字数",
  updateCadence: "更新节奏",
  boundaries: "创作边界",
  checkRules: "检查规则",
};

function PresetFormFields({ draft, onChange }: { draft: PresetDraft; onChange: (draft: PresetDraft) => void }) {
  const set = <K extends keyof PresetDraft>(key: K, value: PresetDraft[K]) => onChange({ ...draft, [key]: value });
  return <><div className="cf-form-grid"><label>预设名称<input required value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="例如：快节奏都市悬疑" /></label><label>题材<input value={draft.genre} onChange={(e) => set("genre", e.target.value)} /></label><label>目标读者<input value={draft.audience} onChange={(e) => set("audience", e.target.value)} /></label><label>每章目标字数<input required type="number" min={1} value={draft.targetWordsPerChapter} onChange={(e) => set("targetWordsPerChapter", e.target.value)} /></label><label>更新节奏<input value={draft.updateCadence} onChange={(e) => set("updateCadence", e.target.value)} placeholder="例如：日更 1 章" /></label><label>节奏<select value={draft.pacing} onChange={(e) => set("pacing", e.target.value as PresetDraft["pacing"])}>{Object.entries(pacingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><label>读者承诺<textarea rows={2} value={draft.promise} onChange={(e) => set("promise", e.target.value)} /></label><div className="cf-form-grid"><label>创作边界（每行一项）<textarea rows={3} value={draft.boundaries} onChange={(e) => set("boundaries", e.target.value)} /></label><label>检查规则（每行一项）<textarea rows={3} value={draft.checkRules} onChange={(e) => set("checkRules", e.target.value)} /></label></div></>;
}

function ReaderPromiseCard({
  projectId,
  chapterId,
  chapters,
  onChapterChange,
}: {
  projectId: string;
  chapterId: string;
  chapters: { id: string; title: string }[];
  onChapterChange: (id: string) => void;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.readerPromises(projectId, "all", chapterId),
    queryFn: ({ signal }) =>
      getReaderPromises(projectId, { chapterId, signal }),
    enabled: Boolean(chapterId),
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetChapterId, setTargetChapterId] = useState("");
  const create = useMutation({
    mutationFn: () =>
      createReaderPromise(projectId, {
        requestId: requestUuid(),
        title,
        description: description.trim() || null,
        openedChapterId: chapterId,
        targetChapterId: targetChapterId || null,
      }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setTargetChapterId("");
      void client.invalidateQueries({
        queryKey: queryKeys.readerPromises(projectId),
      });
    },
  });
  const action = useMutation({
    mutationFn: (input: {
      promiseId: string;
      action: "ADVANCE" | "PAYOFF";
    }) =>
      applyReaderPromiseAction(projectId, input.promiseId, {
        action: input.action,
        chapterId,
        note: null,
      }),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: queryKeys.readerPromises(projectId),
      });
    },
  });
  const promises = query.data?.promises ?? [];
  return (
    <section className="cf-card cf-web-novel-card" aria-label="Reader Promise">
      <div className="cf-section-title">
        <div>
          <h2>Reader Promise</h2>
          <p>记录读者期待的开启、推进与兑现；只在作者确认后改变生命周期。</p>
        </div>
        <span className="cf-web-novel-badge">轻量追踪</span>
      </div>
      {!chapters.length ? (
        <div className="cf-empty"><BookOpen size={34} /><p>先在大纲中创建章节，再登记 Reader Promise。</p></div>
      ) : (
        <>
          <div className="cf-form-grid">
            <label>当前章节<select value={chapterId} onChange={(event) => onChapterChange(event.target.value)}>{chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
            <label>新 Promise 标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：凶手身份何时揭晓" /></label>
            <label>目标章节（可选）<select value={targetChapterId} onChange={(event) => setTargetChapterId(event.target.value)}><option value="">暂不指定</option>{chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
          </div>
          <label>补充说明（可选）<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="读者为什么会期待它" /></label>
          <div className="cf-actions"><button className="cf-primary" type="button" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "正在登记…" : "登记 OPEN"}</button></div>
          {create.isError ? <ErrorNote error={create.error} title="Promise 登记失败" /> : null}
          {action.isError ? <ErrorNote error={action.error} title="Promise 更新失败" /> : null}
          {query.isPending ? <p role="status">正在读取 Promise…</p> : null}
          {query.isError ? <ErrorNote error={query.error} title="Promise 读取失败" /> : null}
          {query.data?.health.warningCodes.length ? <p className="cf-editor-notice" role="status">{query.data.health.warningCodes.map((code) => promiseWarningLabels[code] ?? code).join("；")}</p> : null}
          {promises.length ? <div className="cf-list" aria-label="Reader Promise 列表">{promises.map((promise) => <ReaderPromiseRow key={promise.id} promise={promise} actionPending={action.isPending} onAction={(nextAction) => action.mutate({ promiseId: promise.id, action: nextAction })} />)}</div> : <p className="cf-muted">以当前章节作为年龄计算基准，还没有 Promise。</p>}
        </>
      )}
    </section>
  );
}

function ReaderPromiseRow({
  promise,
  actionPending,
  onAction,
}: {
  promise: ReaderPromiseViewDto;
  actionPending: boolean;
  onAction: (action: "ADVANCE" | "PAYOFF") => void;
}) {
  const status = promise.status === "open" ? "开放" : promise.status === "paid_off" ? "已兑现" : "已放弃";
  return <div className="cf-list-row"><div><strong>{promise.title}</strong><small>{status} · {promise.status === "open" ? `已开放 ${promise.openForChapters} 章` : "已结算"} · 最近 {promise.lastAction}</small>{promise.warningCodes.length ? <small className="cf-danger-text">{promise.warningCodes.map((code) => promiseWarningLabels[code] ?? code).join("、")}</small> : null}</div>{promise.status === "open" ? <div className="cf-actions"><button type="button" className="cf-text-link" disabled={actionPending} onClick={() => onAction("ADVANCE")}>推进</button><button type="button" className="cf-text-link" disabled={actionPending} onClick={() => onAction("PAYOFF")}>兑现</button></div> : null}</div>;
}

const promiseWarningLabels: Record<string, string> = {
  "promise.long_unadvanced": "已连续多章未推进",
  "promise.aging": "开放时间较长",
  "promise.overloaded": "开放 Promise 数量偏多",
};

function requestUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "00000000-0000-4000-8000-000000000000";
}

function BriefCard({
  projectId,
  chapterId,
  chapters,
  story,
  onChapterChange,
}: {
  projectId: string;
  chapterId: string;
  chapters: { id: string; title: string }[];
  story: StoryBible;
  onChapterChange: (id: string) => void;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.chapterBrief(projectId, chapterId),
    queryFn: ({ signal }) => getChapterBrief(projectId, chapterId, signal),
    enabled: Boolean(chapterId),
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useQuery({
    queryKey: queryKeys.chapterBriefHistory(projectId, chapterId),
    queryFn: ({ signal }) => getChapterBriefHistory(projectId, chapterId, signal),
    enabled: historyOpen && Boolean(chapterId),
  });
  const [draft, setDraft] = useState<ReturnType<typeof briefForm> | null>(null);
  const [baseVersionOverride, setBaseVersionOverride] = useState<
    number | null | undefined
  >(undefined);
  const baseVersion =
    baseVersionOverride === undefined
      ? query.data?.version ?? null
      : baseVersionOverride;
  const [briefConflict, setBriefConflict] = useState<ChapterBriefDto | null>(null);
  const [briefConflictChoices, setBriefConflictChoices] = useState<
    Record<BriefConflictField, ProfileConflictChoice>
  >(defaultBriefConflictChoices);
  const [restoreTarget, setRestoreTarget] = useState<ChapterBriefHistoryDto | null>(null);
  const remoteForm = briefConflict ? briefForm(briefConflict) : null;
  const form = draft ?? briefForm(query.data ?? null);
  const chapterDocument = story.documents.find(
    (document) => document.outlineNodeId === chapterId,
  );
  const briefIsStale = Boolean(
    query.data &&
    chapterDocument &&
    query.data.documentVersionId !== chapterDocument.currentVersionId,
  );
  const save = useMutation({
    mutationFn: () => updateChapterBrief(projectId, chapterId, {
      ...form,
      targetWords: form.targetWords ? Number(form.targetWords) : null,
      expectedVersion: baseVersion,
    }),
    onSuccess: (value) => {
      setBaseVersionOverride(value.version);
      setBriefConflict(null);
      setDraft(briefForm(value));
      client.setQueryData(queryKeys.chapterBrief(projectId, chapterId), value);
    },
    onError: (error) => {
      if (!isAuthoringConflict(error)) return;
      const details = error instanceof Error && "details" in error
        ? (error as Error & { details?: unknown }).details
        : null;
      const current = details && typeof details === "object"
        ? (details as { currentBrief?: unknown }).currentBrief
        : null;
      if (current && typeof current === "object") {
        setBriefConflict(current as ChapterBriefDto);
        setBriefConflictChoices(defaultBriefConflictChoices());
      }
    },
  });
  const restore = useMutation({
    mutationFn: (target: ChapterBriefHistoryDto) => {
      if (baseVersion === null) throw new Error("当前章节简报不存在，无法恢复历史版本。");
      return restoreChapterBriefHistory(projectId, chapterId, target.id, baseVersion);
    },
    onSuccess: (value) => {
      setRestoreTarget(null);
      setBaseVersionOverride(value.version);
      setDraft(briefForm(value));
      setBriefConflict(null);
      client.setQueryData(queryKeys.chapterBrief(projectId, chapterId), value);
      void client.invalidateQueries({ queryKey: queryKeys.chapterBriefHistory(projectId, chapterId) });
    },
    onError: (error) => {
      if (!isAuthoringConflict(error)) return;
      const details = error instanceof Error && "details" in error
        ? (error as Error & { details?: unknown }).details
        : null;
      const current = details && typeof details === "object"
        ? (details as { currentBrief?: unknown }).currentBrief
        : null;
      if (current && typeof current === "object") {
        setBriefConflict(current as ChapterBriefDto);
        setBriefConflictChoices(defaultBriefConflictChoices());
      }
    },
  });
  return (
    <section className="cf-card cf-web-novel-card">
      <div className="cf-section-title"><div><h2>章节规划（Chapter Intent）</h2><p>先明确 Expectation → Progress → Payoff，再进入正文；旧版章节简报字段仍保持兼容。</p></div><BookOpen size={22} /></div>
      {!chapters.length ? <div className="cf-empty"><BookOpen size={34} /><p>先在大纲中创建章节，再填写章节简报。</p></div> : <>
        <div className="cf-form-grid"><label>选择章节<select value={chapterId} onChange={(e) => { setHistoryOpen(false); onChapterChange(e.target.value); }}>{chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><button className="cf-button" type="button" onClick={() => setHistoryOpen((current) => !current)}>{historyOpen ? "收起简报历史" : "查看简报历史"}</button></div>
        {historyOpen ? <div className="cf-web-novel-check-history" aria-label="章节简报历史">{history.isPending ? <p role="status">正在读取简报历史…</p> : null}{history.isError ? <ErrorNote error={history.error} title="简报历史读取失败" /> : null}{history.data?.length ? <div className="cf-list">{history.data.map((item) => <div className="cf-list-row" key={item.id}><div><strong>保存前版本 v{item.briefVersion}</strong><small>{new Date(item.createdAt).toLocaleString("zh-CN")} · {item.snapshot.goal || "没有填写本章目标"}</small></div><button className="cf-text-link" type="button" disabled={restore.isPending || baseVersion === null} onClick={() => setRestoreTarget(item)}>恢复</button></div>)}</div> : null}{history.data && !history.data.length ? <p className="cf-muted">还没有可恢复的简报历史。</p> : null}</div> : null}
        <div className="cf-form-grid"><label>主目的<select value={form.purpose} onChange={(e) => setDraft({ ...form, purpose: e.target.value as ChapterBriefDto["purpose"] })}>{Object.entries(chapterPurposeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>次目的（可多选）<select multiple size={3} value={form.secondaryPurposes} onChange={(e) => setDraft({ ...form, secondaryPurposes: Array.from(e.target.selectedOptions, (option) => option.value as ChapterBriefDto["purpose"]) })}>{Object.entries(chapterPurposeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>读者期待<textarea rows={2} value={form.readerExpectation} onChange={(e) => setDraft({ ...form, readerExpectation: e.target.value })} placeholder="读者此刻在等什么" /></label><label>情绪目标<select value={form.emotionTarget ?? ""} onChange={(e) => setDraft({ ...form, emotionTarget: (e.target.value || null) as ChapterBriefDto["emotionTarget"] })}><option value="">暂不指定</option>{Object.entries(emotionTargetLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        <div className="cf-form-grid"><label>本章目标<textarea rows={3} value={form.goal} onChange={(e) => setDraft({ ...form, goal: e.target.value })} /></label><label>核心冲突<textarea rows={3} value={form.conflict} onChange={(e) => setDraft({ ...form, conflict: e.target.value })} /></label><label>读者回报<textarea rows={3} value={form.payoff} onChange={(e) => setDraft({ ...form, payoff: e.target.value })} /></label><label>章尾钩子<textarea rows={3} value={form.hook} onChange={(e) => setDraft({ ...form, hook: e.target.value })} /></label></div>
        <details className="cf-progressive-disclosure"><summary>高级 Intent 字段（情绪曲线、Promise 操作、强度与场景结构）</summary><div className="cf-form-grid"><label>钩子类型<select value={form.hookType ?? ""} onChange={(e) => setDraft({ ...form, hookType: (e.target.value || null) as ChapterBriefDto["hookType"] })}><option value="">暂不指定</option>{Object.entries(hookTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>情绪曲线（每行：节点|0-5）<textarea rows={3} value={emotionCurveText(form.emotionCurve)} onChange={(e) => setDraft({ ...form, emotionCurve: parseEmotionCurve(e.target.value) })} placeholder="发现线索|2\n逼近真相|4\n章尾反转|5" /></label><label>Promise 操作（每行：ACTION|promiseId|标题|备注）<textarea rows={4} value={promiseOperationsText(form.readerPromiseOperations)} onChange={(e) => setDraft({ ...form, readerPromiseOperations: parsePromiseOperations(e.target.value) })} placeholder="OPEN||凶手身份|埋下线索\nADVANCE|promise-id||给出新线索" /></label><label>场景结构（每行：目的|场景推进|场景回报）<textarea rows={4} value={sceneStructureText(form.sceneStructure)} onChange={(e) => setDraft({ ...form, sceneStructure: parseSceneStructure(e.target.value) })} placeholder="conflict|主角逼问证人|获得矛盾口供" /></label></div><div className="cf-form-grid"><label>回报强度（0-5）<input type="number" min={0} max={5} value={form.payoffStrength} onChange={(e) => setDraft({ ...form, payoffStrength: Number(e.target.value) })} /></label><label>钩子强度（0-5）<input type="number" min={0} max={5} value={form.hookStrength} onChange={(e) => setDraft({ ...form, hookStrength: Number(e.target.value) })} /></label><label>信息增量（0-5）<input type="number" min={0} max={5} value={form.informationGain} onChange={(e) => setDraft({ ...form, informationGain: Number(e.target.value) })} /></label><label>结尾牵引（0-5）<input type="number" min={0} max={5} value={form.endingPull} onChange={(e) => setDraft({ ...form, endingPull: Number(e.target.value) })} /></label></div></details>
        <div className="cf-form-grid"><label>目标字数<input type="number" min={1} value={form.targetWords} onChange={(e) => setDraft({ ...form, targetWords: e.target.value })} /></label><label>节奏<select value={form.pacing} onChange={(e) => setDraft({ ...form, pacing: e.target.value as ChapterBriefDto["pacing"] })}>{Object.entries(pacingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        <div className="cf-form-grid"><MultiSelect label="本章人物" items={story.entities.filter((entity) => entity.type === "character").map((entity) => ({ id: entity.id, label: entity.name }))} selected={form.characterIds} onChange={(ids) => setDraft({ ...form, characterIds: ids })} empty="还没有人物设定" /><MultiSelect label="关联伏笔" items={story.foreshadows.map((item) => ({ id: item.id, label: item.title }))} selected={form.foreshadowIds} onChange={(ids) => setDraft({ ...form, foreshadowIds: ids })} empty="还没有伏笔" /><MultiSelect label="时间线事件" items={story.timeline.map((item) => ({ id: item.id, label: item.title }))} selected={form.timelineIds} onChange={(ids) => setDraft({ ...form, timelineIds: ids })} empty="还没有时间线事件" /></div>
        {query.isPending ? <p role="status">正在读取章节简报…</p> : null}{query.isError ? <ErrorNote error={query.error} /> : null}{save.isError ? <ErrorNote error={save.error} /> : null}
        {briefIsStale ? <p className="cf-editor-notice" role="status">正文已经更新，这份章节简报仍基于旧正文。保存简报后，检查和 AI 才会使用最新依据。</p> : null}
        {briefConflict ? <section className="cf-conflict-recovery" role="alert" aria-label="章节简报冲突恢复"><strong>章节简报已在其他页面更新</strong><p>当前表单仍保留本地修改。逐字段合并只更新当前表单，仍需再次点击保存。</p><div className="cf-conflict-fields" role="group" aria-label="章节简报字段合并">{briefConflictFields.map(([key, label]) => { const localValue = form[key]; const remoteValue = remoteForm?.[key]; const changed = conflictDisplayValue(localValue) !== conflictDisplayValue(remoteValue); return <label className={changed ? "is-changed" : ""} key={key}><span>{label}{changed ? " · 有差异" : ""}</span><select aria-label={`${label}冲突处理`} value={briefConflictChoices[key]} onChange={(event) => setBriefConflictChoices((current) => ({ ...current, [key]: event.target.value as ProfileConflictChoice }))}><option value="remote">使用远端</option><option value="local">保留本地</option></select>{changed ? <small>本地：{conflictDisplayValue(localValue)} · 远端：{conflictDisplayValue(remoteValue)}</small> : null}</label>; })}</div><div className="cf-actions"><button type="button" className="cf-primary" onClick={() => { if (!remoteForm) return; const merged = { ...remoteForm }; for (const [key] of briefConflictFields) { if (briefConflictChoices[key] === "local") Object.assign(merged, { [key]: form[key] }); } save.reset(); setDraft(merged); setBaseVersionOverride(briefConflict.version); setBriefConflict(null); }}>合并选中字段</button><button type="button" className="cf-button" onClick={() => { save.reset(); setBaseVersionOverride(briefConflict.version); setBriefConflict(null); }}>保留本地修改</button><button type="button" className="cf-primary" onClick={() => { save.reset(); setDraft(briefForm(briefConflict)); setBaseVersionOverride(briefConflict.version); setBriefConflict(null); }}>读取最新简报</button></div></section> : null}
        {restore.isError ? <ErrorNote error={restore.error} title="简报历史恢复失败" /> : null}
        <button className="cf-primary" disabled={save.isPending || query.isPending || restore.isPending} onClick={() => save.mutate()}><Save size={15} />{save.isPending ? "正在保存…" : "保存章节简报"}</button>
        <WebNovelCandidateReview
          projectId={projectId}
          kind="brief"
          outlineNodeId={chapterId}
          title="AI Chapter Intent 候选"
          description="AI 只生成可审阅候选，不写正文、不静默修改；候选会绑定当前章节、大纲版本和正文版本。"
          defaultInstruction="根据本章大纲、作品档案、当前 Chapter Intent 与开放 Reader Promise，提出可逐项审阅的章节规划候选。"
        />
        {restoreTarget ? <ConfirmDialog title={`恢复简报保存前版本 v${restoreTarget.briefVersion}？`} confirmLabel="确认恢复" pending={restore.isPending} onCancel={() => setRestoreTarget(null)} onConfirm={() => restore.mutate(restoreTarget)}><p>系统会把这份历史内容写成新的当前简报版本，并保留现在的内容作为新的历史记录。正文版本依据会按当前正文重新绑定。</p></ConfirmDialog> : null}
      </>}
    </section>
  );
}

function MultiSelect({ label, items, selected, onChange, empty }: { label: string; items: { id: string; label: string }[]; selected: string[]; onChange: (ids: string[]) => void; empty: string }) {
  return <fieldset className="cf-multi-select"><legend>{label}</legend>{items.length ? items.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => onChange(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])} />{item.label}</label>) : <small>{empty}</small>}</fieldset>;
}

function OpeningCheckCard({
  projectId,
  autoRun = false,
  recheckIssueId = null,
}: {
  projectId: string;
  autoRun?: boolean;
  recheckIssueId?: string | null;
}) {
  const client = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [comparisonReportId, setComparisonReportId] = useState<string | null>(null);
  const history = useQuery({
    queryKey: queryKeys.openingCheckHistory(projectId),
    queryFn: ({ signal }) => getOpeningThreeCheckHistory(projectId, signal),
    enabled: historyOpen,
  });
  const audit = useQuery({
    queryKey: queryKeys.openingCheckAudit(projectId),
    queryFn: ({ signal }) => getOpeningCheckAudit(projectId, signal),
    enabled: auditOpen,
  });
  const check = useMutation({
    mutationFn: () => runOpeningThreeCheck(projectId),
    onSuccess: (report) => {
      client.setQueryData<OpeningThreeCheckReport[]>(
        queryKeys.openingCheckHistory(projectId),
        (current) => [report, ...(current ?? [])].slice(0, 30),
      );
    },
  });
  const runCheck = check.mutate;
  const autoRunStarted = useRef(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!autoRun || autoRunStarted.current) return;
    autoRunStarted.current = true;
    runCheck();
  }, [autoRun, runCheck]);
  const updateIssue = useMutation({
    mutationFn: (input: {
      issueId: string;
      status: "open" | "ignored" | "resolved";
      expectedStatus: "open" | "ignored" | "resolved";
      note: string | null;
      reportId: string | null;
      autoRecheck?: boolean;
    }) =>
      updateOpeningCheckIssue(projectId, input.issueId, {
        status: input.status,
        expectedStatus: input.expectedStatus,
        note: input.note,
        reportId: input.reportId,
      }),
    onSuccess: (_result, input) => {
      if (!input.autoRecheck) runCheck();
    },
  });
  const reconciledRecheck = useRef<string | null>(null);
  useEffect(() => {
    if (!autoRun || !recheckIssueId || !check.data) return;
    const key = check.data.id + ":" + recheckIssueId;
    if (reconciledRecheck.current === key) return;
    reconciledRecheck.current = key;
    const issue = check.data.issues.find((item) => item.id === recheckIssueId);
    updateIssue.mutate({
      issueId: recheckIssueId,
      reportId: check.data.id,
      status: issue ? "open" : "resolved",
      expectedStatus: issue?.status ?? "open",
      note: issue
        ? "复检于 " + new Date(check.data.generatedAt).toLocaleString("zh-CN") + "：问题仍存在。"
        : "复检于 " + new Date(check.data.generatedAt).toLocaleString("zh-CN") + "：未再次发现该问题。",
      autoRecheck: true,
    });
  }, [autoRun, check.data, recheckIssueId, updateIssue]);
  const comparisonReport = useMemo(() => {
    if (!check.data || !history.data?.length) return null;
    const candidate = comparisonReportId
      ? history.data.find((report) => report.id === comparisonReportId)
      : history.data.find((report) => report.id !== check.data?.id);
    return candidate && candidate.id !== check.data.id ? candidate : null;
  }, [check.data, comparisonReportId, history.data]);
  const writeHref = (issue: OpeningThreeCheckReport["issues"][number]) => {
    if (!issue.targetDocumentId) return null;
    const query = new URLSearchParams({ tab: "ai", novelIssue: issue.id });
    if (check.data?.id) query.set("novelCheckId", check.data.id);
    if (issue.targetDocumentVersionId)
      query.set("novelDocumentVersion", issue.targetDocumentVersionId);
      if (check.data?.generatedAt)
      query.set("novelCheckAt", check.data.generatedAt);
    const returnTo = issue.targetChapterId
      ? `/books/${projectId}/advanced?tool=web-novel&chapter=${encodeURIComponent(issue.targetChapterId)}&check=1`
      : `/books/${projectId}/advanced?tool=web-novel&check=1`;
    query.set("returnTo", returnTo);
    return `/books/${projectId}/write/${encodeURIComponent(issue.targetDocumentId)}?${query.toString()}`;
  };
  return (
    <section className="cf-card cf-web-novel-card">
      <div className="cf-section-title">
        <div>
          <h2>前三章体检</h2>
          <p>只读取已保存正文、大纲、章节简报和作品承诺，报告中的每条问题都带有证据和定位。</p>
        </div>
        <Sparkles size={22} />
      </div>
      <button
        className="cf-primary"
        disabled={check.isPending}
        onClick={() => runCheck()}
      >
        {check.isPending ? "正在检查…" : "运行前三章体检"}
      </button>
      <button
        className="cf-button"
        type="button"
        onClick={() => setHistoryOpen((current) => !current)}
      >
        {historyOpen ? "收起检查记录" : "查看检查记录"}
      </button>
      <button
        className="cf-button"
        type="button"
        onClick={() => setAuditOpen((current) => !current)}
      >
        {auditOpen ? "收起处理审计" : "查看处理审计"}
      </button>
      {historyOpen ? (
        <div className="cf-web-novel-check-history" aria-label="前三章体检历史">
          {history.isPending ? <p role="status">正在读取检查记录…</p> : null}
          {history.isError ? <ErrorNote error={history.error} title="检查记录读取失败" /> : null}
          {history.data?.length ? (
            <div className="cf-list">
              {history.data.map((item) => (
                <div className="cf-list-row" key={item.id}>
                  <div>
                    <strong>{item.score} 分</strong>
                    <small>
                      {new Date(item.generatedAt).toLocaleString("zh-CN")} · {item.issues.length} 条问题 · {item.sourceVersions.filter((source) => source.documentVersionId).length} 个正文版本依据
                    </small>
                  </div>
                  <div className="cf-actions">
                    <span className="cf-badge">{item.id.slice(0, 8)}</span>
                    {check.data && item.id !== check.data.id ? (
                      <button
                        className="cf-text-link"
                        type="button"
                        onClick={() => setComparisonReportId(item.id)}
                      >
                        与当前比较
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {history.data && !history.data.length ? <p className="cf-muted">还没有历史体检记录。</p> : null}
          {comparisonReport && check.data ? (
            <OpeningCheckComparison current={check.data} previous={comparisonReport} />
          ) : history.data?.length && check.data ? (
            <p className="cf-muted">选择一份旧报告，与当前体检逐问题比较证据变化。</p>
          ) : null}
        </div>
      ) : null}
      {auditOpen ? (
        <div className="cf-web-novel-check-history" aria-label="前三章体检处理审计">
          {audit.isPending ? <p role="status">正在读取处理审计…</p> : null}
          {audit.isError ? <ErrorNote error={audit.error} title="处理审计读取失败" /> : null}
          {audit.data?.length ? (
            <div className="cf-list">
              {audit.data.map((item) => (
                <div className="cf-list-row" key={item.id}>
                  <div>
                    <strong>
                      {item.eventType === "report_generated"
                        ? item.action === "recheck"
                          ? "复检完成"
                          : "首次体检"
                        : item.eventType === "candidate_decided"
                          ? item.action === "accept"
                            ? "采纳候选"
                            : "放弃候选"
                          : "问题" +
                            (item.action === "resolved"
                              ? "标记已处理"
                              : item.action === "ignored"
                                ? "忽略"
                                : "重新打开")}
                    </strong>
                    <small>
                      {new Date(item.createdAt).toLocaleString("zh-CN")}
                      {item.reportId ? " · 报告 " + item.reportId.slice(0, 8) : ""}
                      {item.issueId ? " · 问题 " + item.issueId.slice(0, 18) : ""}
                    </small>
                  </div>
                  <span className="cf-badge">{item.id.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {audit.data && !audit.data.length ? <p className="cf-muted">还没有处理审计记录。</p> : null}
        </div>
      ) : null}
      {check.isError ? <ErrorNote error={check.error} /> : null}
      {check.data ? (
        <div className="cf-web-novel-check">
          <div className="cf-quality-score">
            <strong>{check.data.score}</strong>
            <span>分 · 已检查 {check.data.metrics.checkedChapters} 章</span>
          </div>
          <div className="cf-form-grid">
            <div>
              <small>正文样本</small>
              <strong>{check.data.metrics.manuscriptCharacters.toLocaleString()} 字</strong>
            </div>
            <div>
              <small>简报完整</small>
              <strong>{check.data.metrics.briefsCompleted}/{check.data.metrics.checkedChapters}</strong>
            </div>
            <div>
              <small>章尾钩子</small>
              <strong>{check.data.metrics.chaptersWithHook}/{check.data.metrics.checkedChapters}</strong>
            </div>
            <div>
              <small>冲突覆盖</small>
              <strong>{check.data.metrics.chaptersWithConflict ?? 0}/{check.data.metrics.checkedChapters}</strong>
            </div>
            <div>
              <small>读者回报</small>
              <strong>{check.data.metrics.chaptersWithPayoff ?? 0}/{check.data.metrics.checkedChapters}</strong>
            </div>
            <div>
              <small>目标字数达标</small>
              <strong>
                {check.data.metrics.targetWordsPerChapter
                  ? `${check.data.metrics.chaptersMeetingTarget ?? 0}/${check.data.metrics.checkedChapters} · ${check.data.metrics.targetCompletionRate ?? 0}%`
                  : "未设置目标"}
              </strong>
            </div>
          </div>
          {check.data.issues.length ? (
            <div className="cf-list">
              {check.data.issues.map((item) => {
                const note = notes[item.id] ?? item.note ?? "";
                const noteChanged = note !== (item.note ?? "");
                const href = writeHref(item);
                return (
                  <article
                    className={`cf-list-row cf-novel-check-issue is-${item.status}`}
                    key={item.id}
                  >
                    <div>
                      <div className="cf-issue-heading">
                        <strong>{item.title}</strong>
                        <span className="cf-badge">
                          {item.status === "resolved"
                            ? "已处理"
                            : item.status === "ignored"
                              ? "已忽略"
                              : item.severity === "error"
                                ? "阻塞"
                                : item.severity === "warning"
                                  ? "提醒"
                                  : "提示"}
                        </span>
                      </div>
                      <p>{item.evidence}</p>
                      <small>建议：{item.suggestion}</small>
                      {item.code === "opening.brief_stale" ? (
                        <small className="cf-error-text-inline">
                          正文版本已经更新；保存章节简报后再重新检查，才能让后续 AI 使用最新依据。
                        </small>
                      ) : null}
                      {item.note ? <small>处理备注：{item.note}</small> : null}
                      <label className="cf-issue-note">
                        处理备注
                        <input
                          value={note}
                          onChange={(event) =>
                            setNotes((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="记录处理依据或后续动作"
                        />
                      </label>
                    </div>
                    <div className="cf-actions">
                      {item.targetChapterId ? (
                        <Link
                          className="cf-text-link"
                          to={`/books/${projectId}/write?outline=${encodeURIComponent(item.targetChapterId)}`}
                        >
                          定位章节
                        </Link>
                      ) : null}
                      {href ? (
                        <Link className="cf-text-link" to={href}>
                          生成修改建议
                        </Link>
                      ) : null}
                      {noteChanged ? (
                        <button
                          className="cf-text-link"
                          disabled={updateIssue.isPending}
                          onClick={() =>
                            updateIssue.mutate({
                              issueId: item.id,
                              reportId: check.data?.id ?? null,
                              status: item.status,
                              expectedStatus: item.status,
                              note: note.trim() || null,
                            })
                          }
                        >
                          保存备注
                        </button>
                      ) : null}
                      {item.status === "open" ? (
                        <>
                          <button
                            className="cf-text-link"
                            disabled={updateIssue.isPending}
                            onClick={() =>
                              updateIssue.mutate({
                                issueId: item.id,
                                reportId: check.data?.id ?? null,
                                status: "resolved",
                                expectedStatus: item.status,
                                note: note.trim() || null,
                              })
                            }
                          >
                            标记已处理
                          </button>
                          <button
                            className="cf-text-link"
                            disabled={updateIssue.isPending}
                            onClick={() =>
                              updateIssue.mutate({
                                issueId: item.id,
                                reportId: check.data?.id ?? null,
                                status: "ignored",
                                expectedStatus: item.status,
                                note: note.trim() || null,
                              })
                            }
                          >
                            忽略
                          </button>
                        </>
                      ) : (
                        <button
                          className="cf-text-link"
                          disabled={updateIssue.isPending}
                          onClick={() =>
                            updateIssue.mutate({
                              issueId: item.id,
                              reportId: check.data?.id ?? null,
                              status: "open",
                              expectedStatus: item.status,
                              note: note.trim() || null,
                            })
                          }
                        >
                          重新打开
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="cf-empty">
              <Check size={34} />
              <p>当前没有发现需要处理的问题。</p>
            </div>
          )}
          {updateIssue.isError ? (
            <ErrorNote error={updateIssue.error} title="问题状态保存失败，请刷新报告" />
          ) : null}
          <small className="cf-web-novel-check__time">
            检查时间：{new Date(check.data.generatedAt).toLocaleString("zh-CN")}
          </small>
        </div>
      ) : null}
    </section>
  );
}

function OpeningCheckComparison({
  current,
  previous,
}: {
  current: OpeningThreeCheckReport;
  previous: OpeningThreeCheckReport;
}) {
  const previousById = new Map(previous.issues.map((issue) => [issue.id, issue]));
  const currentById = new Map(current.issues.map((issue) => [issue.id, issue]));
  const changed = current.issues
    .map((issue) => {
      const before = previousById.get(issue.id);
      if (!before) return { issue, label: "新出现", detail: issue.evidence };
      if (before.evidence !== issue.evidence || before.status !== issue.status) {
        return {
          issue,
          label: "证据或处理状态变化",
          detail: `之前：${before.evidence}；现在：${issue.evidence}`,
        };
      }
      return null;
    })
    .filter((item): item is { issue: OpeningThreeCheckReport["issues"][number]; label: string; detail: string } => Boolean(item));
  const resolved = previous.issues.filter((issue) => !currentById.has(issue.id));
  return (
    <section className="cf-web-novel-comparison" aria-label="前三章体检报告比较">
      <div className="cf-section-title">
        <div>
          <h3>报告比较</h3>
          <p>
            当前 {new Date(current.generatedAt).toLocaleString("zh-CN")} · 对比 {new Date(previous.generatedAt).toLocaleString("zh-CN")}
          </p>
        </div>
        <span className="cf-badge">{previous.score} → {current.score} 分</span>
      </div>
      <div className="cf-form-grid">
        <div><small>正文样本</small><strong>{previous.metrics.manuscriptCharacters.toLocaleString()} → {current.metrics.manuscriptCharacters.toLocaleString()} 字</strong></div>
        <div><small>问题总数</small><strong>{previous.issues.length} → {current.issues.length}</strong></div>
        <div><small>新增/变化</small><strong>{changed.length}</strong></div>
        <div><small>不再出现</small><strong>{resolved.length}</strong></div>
        <div><small>回报覆盖</small><strong>{previous.metrics.chaptersWithPayoff ?? 0} → {current.metrics.chaptersWithPayoff ?? 0} 章</strong></div>
        <div><small>目标完成率</small><strong>{previous.metrics.targetCompletionRate ?? "—"}% → {current.metrics.targetCompletionRate ?? "—"}%</strong></div>
      </div>
      {changed.length ? (
        <div className="cf-list">
          {changed.map(({ issue, label, detail }) => (
            <div className="cf-list-row" key={issue.id}>
              <div><strong>{issue.title}</strong><small>{label} · {detail}</small></div>
              <span className="cf-badge">{issue.status === "resolved" ? "已处理" : "仍待处理"}</span>
            </div>
          ))}
        </div>
      ) : null}
      {resolved.length ? (
        <div className="cf-list">
          {resolved.map((issue) => (
            <div className="cf-list-row" key={`resolved:${issue.id}`}>
              <div><strong>{issue.title}</strong><small>本次报告未再次发现；上次证据：{issue.evidence}</small></div>
              <span className="cf-badge">已消失</span>
            </div>
          ))}
        </div>
      ) : null}
      {!changed.length && !resolved.length ? <p className="cf-muted">两次报告的问题与证据没有变化。</p> : null}
    </section>
  );
}

function profileForm(profile: BookProfileDto | null) {
  return {
    presetId: profile?.presetId ?? null,
    genre: profile?.genre ?? "",
    audience: profile?.audience ?? "",
    promise: profile?.promise ?? "",
    tone: profile?.tone ?? "",
    endingDirection: profile?.endingDirection ?? "",
    pov: profile?.pov ?? "",
    updateCadence: profile?.updateCadence ?? "",
    targetWordsPerChapter: profile?.targetWordsPerChapter?.toString() ?? "2500",
    boundaries: profile?.boundaries.join("\n") ?? "",
    worldRules: profile?.worldRules.join("\n") ?? "",
    arcNotes: profile?.arcNotes.join("\n") ?? "",
  };
}

function defaultProfileConflictChoices(): Record<
  ProfileConflictField,
  ProfileConflictChoice
> {
  return Object.fromEntries(
    profileConflictFields.map(([key]) => [key, "remote"]),
  ) as Record<ProfileConflictField, ProfileConflictChoice>;
}

function defaultPresetConflictChoices(): Record<
  PresetConflictField,
  ProfileConflictChoice
> {
  return Object.fromEntries(
    presetConflictFields.map(([key]) => [key, "remote"]),
  ) as Record<PresetConflictField, ProfileConflictChoice>;
}

function defaultBriefConflictChoices(): Record<
  BriefConflictField,
  ProfileConflictChoice
> {
  return Object.fromEntries(
    briefConflictFields.map(([key]) => [key, "remote"]),
  ) as Record<BriefConflictField, ProfileConflictChoice>;
}

function briefForm(brief: ChapterBriefDto | null) {
  return {
    purpose: brief?.purpose ?? ("progress" as const),
    secondaryPurposes: brief?.secondaryPurposes ?? [],
    goal: brief?.goal ?? "",
    readerExpectation: brief?.readerExpectation ?? "",
    emotionTarget: brief?.emotionTarget ?? null,
    emotionCurve: brief?.emotionCurve ?? [],
    conflict: brief?.conflict ?? "",
    readerPromiseOperations: brief?.readerPromiseOperations ?? [],
    payoff: brief?.payoff ?? "",
    payoffStrength: brief?.payoffStrength ?? 0,
    hook: brief?.hook ?? "",
    hookType: brief?.hookType ?? null,
    hookStrength: brief?.hookStrength ?? 0,
    informationGain: brief?.informationGain ?? 0,
    endingPull: brief?.endingPull ?? 0,
    sceneStructure: brief?.sceneStructure ?? [],
    targetWords: brief?.targetWords?.toString() ?? "2500",
    pacing: brief?.pacing ?? ("steady" as const),
    characterIds: brief?.characterIds ?? [],
    foreshadowIds: brief?.foreshadowIds ?? [],
    timelineIds: brief?.timelineIds ?? [],
  };
}

function emotionCurveText(value: ChapterBriefDto["emotionCurve"]): string {
  return value.map((point) => `${point.label}|${point.intensity}`).join("\n");
}

function parseEmotionCurve(value: string): ChapterBriefDto["emotionCurve"] {
  return value
    .split("\n")
    .map((line) => line.split("|"))
    .map(([label, intensity]) => ({
      label: label?.trim() ?? "",
      intensity: Math.floor(Math.max(0, Math.min(5, Number(intensity ?? 0) || 0))),
    }))
    .filter((point) => point.label.length > 0)
    .slice(0, 8);
}

function promiseOperationsText(
  value: ChapterBriefDto["readerPromiseOperations"],
): string {
  return value
    .map((operation) =>
      [
        operation.action,
        operation.promiseId ?? "",
        operation.title ?? "",
        operation.note ?? "",
      ].join("|"),
    )
    .join("\n");
}

function parsePromiseOperations(
  value: string,
): ChapterBriefDto["readerPromiseOperations"] {
  return value
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .map(([action, promiseId, title, note]) => {
      const normalizedAction: "OPEN" | "ADVANCE" | "PAYOFF" =
        action === "ADVANCE" || action === "PAYOFF" ? action : "OPEN";
      return {
        action: normalizedAction,
        promiseId: promiseId || null,
        title: title || null,
        note: note || null,
      };
    })
    .filter((operation) =>
      operation.action === "OPEN"
        ? Boolean(operation.promiseId || operation.title)
        : Boolean(operation.promiseId),
    )
    .slice(0, 30);
}

function sceneStructureText(value: ChapterBriefDto["sceneStructure"]): string {
  return value
    .map((scene) => [scene.purpose, scene.beat, scene.payoff ?? ""].join("|"))
    .join("\n");
}

function parseSceneStructure(value: string): ChapterBriefDto["sceneStructure"] {
  return value
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .map(([purpose, beat, payoff], index) => ({
      order: index + 1,
      purpose: Object.prototype.hasOwnProperty.call(
        chapterPurposeLabels,
        purpose ?? "",
      )
        ? (purpose as ChapterBriefDto["purpose"])
        : "progress",
      beat: beat ?? "",
      payoff: payoff || null,
    }))
    .filter((scene) => scene.beat.length > 0)
    .slice(0, 20);
}

function conflictDisplayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join("、") || "（空）";
  if (value === null || value === undefined || value === "") return "（空）";
  return String(value);
}

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}
