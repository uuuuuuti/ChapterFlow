import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import { Database, Languages, Plus, Radio, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { LOCALES, LOCALE_LABELS, useI18n } from "../../i18n";
import { currentDriverMode, onDriverModeChange, readDriverOverride, resolveDriverMode, setDriverOverride, type DriverMode } from "../../kernel/transport";
import { ConfirmDialog, ErrorNote } from "../../shared/ui";
import { queryKeys } from "../../shared/query/keys";
import { createModel, createProvider, deleteModel, deleteProvider, listAssignments, listModels, listProviders, probeProvider, setAssignment, updateModel, updateProvider } from "../../shared/api/models";
import { downloadLibraryDatabase } from "../../shared/api/skills";
import { createSystemBackup, getSystemBackups, previewSystemBackup, restoreSystemBackup } from "../../shared/api/delivery";
import type { SystemBackupManifest, SystemBackupPreview } from "../../shared/api/types";
import type { AssignmentRole, ModelConfigDto, PublicProviderDto, UpsertModelRequest, UpsertProviderRequest } from "../../shared/api/types";

type SettingsSection = "general" | "ai" | "storage" | "backups" | "advanced";
type SystemRestoreReceipt = {
  targetDirectory: string;
  databasePath: string;
  migration: number;
  counts: SystemBackupPreview["counts"];
  restoredAt: string;
};

const SYSTEM_RESTORE_RECEIPT_KEY = "chapterflow:last-system-restore";
const tabs: { id: SettingsSection; label: string; icon: typeof Languages }[] = [
  { id: "general", label: "常规", icon: SlidersHorizontal },
  { id: "ai", label: "AI 服务", icon: Radio },
  { id: "storage", label: "存储与备份", icon: Database },
  { id: "advanced", label: "高级", icon: ShieldCheck },
];

export function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const raw = location.pathname.split("/").pop() as SettingsSection;
  const section: SettingsSection = raw === "backups" ? "backups" : tabs.some((tab) => tab.id === raw) ? raw : "general";
  return <div className="cf-page cf-settings-page"><div className="cf-page-title"><div><p className="cf-eyebrow">WORKSPACE SETTINGS</p><h1>设置</h1><p>管理写作环境、AI 服务和内容存储。</p></div><Link className="cf-button" to="/books">返回作品</Link></div><div className="cf-settings-tabs" role="tablist" aria-label="设置分区">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} role="tab" aria-selected={section === tab.id || (section === "backups" && tab.id === "storage")} onClick={() => navigate(`/settings/${tab.id}`)}><Icon size={16} />{tab.label}</button>; })}</div>{section === "general" ? <GeneralSettings /> : null}{section === "ai" ? <AiSettings /> : null}{section === "storage" || section === "backups" ? <StorageSettings /> : null}{section === "advanced" ? <AdvancedSettings /> : null}</div>;
}

function GeneralSettings() {
  const { locale, setLocale } = useI18n();
  return <section className="cf-card cf-settings-card"><div className="cf-section-title"><div><h2>常规偏好</h2><p>这些偏好只影响当前创作工作台的显示方式。</p></div></div><div className="cf-settings-block"><h3>界面语言</h3><div className="cf-settings-options">{LOCALES.map((item) => <button key={item} aria-pressed={locale === item} className={locale === item ? "is-active" : ""} onClick={() => setLocale(item)}><Languages size={15} />{LOCALE_LABELS[item]}</button>)}</div></div><div className="cf-settings-block"><h3>作品界面</h3><p>普通创作页面只显示作品、章节、设定、任务和检查；底层运行记录留在高级区域。</p></div></section>;
}

function AiSettings() {
  const client = useQueryClient();
  const providers = useQuery({
    queryKey: queryKeys.assistantProviders,
    queryFn: ({ signal }) => listProviders(signal),
  });
  const models = useQuery({
    queryKey: queryKeys.assistantModels,
    queryFn: ({ signal }) => listModels(undefined, signal),
  });
  const assignments = useQuery({
    queryKey: queryKeys.assistantAssignments,
    queryFn: ({ signal }) => listAssignments(signal),
  });
  const [providerForm, setProviderForm] = useState(false);
  const [modelForm, setModelForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "provider" | "model";
    id: string;
    label: string;
  } | null>(null);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.assistantProviders }),
      client.invalidateQueries({ queryKey: queryKeys.assistantModels }),
      client.invalidateQueries({ queryKey: queryKeys.assistantAssignments }),
      client.invalidateQueries({ queryKey: queryKeys.health }),
    ]);
  };
  const createProviderMutation = useMutation({
    mutationFn: createProvider,
    onSuccess: async () => {
      setProviderForm(false);
      await refresh();
    },
  });
  const createModelMutation = useMutation({
    mutationFn: createModel,
    onSuccess: async () => {
      setModelForm(false);
      await refresh();
    },
  });
  const removeMutation = useMutation({
    mutationFn: async (target: { kind: "provider" | "model"; id: string }) => {
      if (target.kind === "provider") await deleteProvider(target.id);
      else await deleteModel(target.id);
      return target;
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await refresh();
    },
  });
  const assign = useMutation({
    mutationFn: ({ role, modelId }: { role: AssignmentRole; modelId: string }) =>
      setAssignment(role, modelId),
    onSuccess: refresh,
  });
  const busy = providers.isPending || models.isPending || assignments.isPending;
  return (
    <section className="cf-card cf-settings-card">
      <div className="cf-section-title">
        <div>
          <h2>AI 服务</h2>
          <p>AI 只作为辅助。没有配置服务时，手工建书、设定和写作仍然可用。</p>
        </div>
        <span className="cf-badge">
          {providers.data?.filter((item) => item.enabled).length ?? 0} 个可用渠道
        </span>
      </div>
      {busy ? <p role="status">正在读取 AI 配置…</p> : null}
      {providers.error ? <ErrorNote error={providers.error} /> : null}
      <div className="cf-settings-actions">
        <button
          className="cf-button"
          onClick={() => {
            createProviderMutation.reset();
            setProviderForm(true);
          }}
        >
          <Plus size={15} />添加渠道
        </button>
        <button
          className="cf-button"
          onClick={() => {
            createModelMutation.reset();
            setModelForm(true);
          }}
          disabled={!providers.data?.length}
        >
          <Plus size={15} />添加模型
        </button>
      </div>
      <div className="cf-provider-grid">
        {providers.data?.map((provider) => (
          <ProviderSettingCard
            key={provider.id}
            provider={provider}
            models={(models.data ?? []).filter((model) => model.providerId === provider.id)}
            onDelete={() => {
              removeMutation.reset();
              setDeleteTarget({
                kind: "provider",
                id: provider.id,
                label: `渠道 ${provider.name}`,
              });
            }}
            onDeleteModel={(model) => {
              removeMutation.reset();
              setDeleteTarget({
                kind: "model",
                id: model.id,
                label: `模型 ${model.modelId}`,
              });
            }}
            onRefresh={refresh}
          />
        ))}
      </div>
      {models.data?.length ? (
        <div className="cf-settings-block">
          <h3>写作岗位</h3>
          <p>把模型分配给写作、策划、检查等任务。模型仍不会自动覆盖正文。</p>
          <div className="cf-role-grid">
            {(["writing", "planning", "review", "embedding", "rerank"] as AssignmentRole[]).map((role) => (
              <label key={role}>
                {roleLabel(role)}
                <select
                  value={assignments.data?.find((item) => item.role === role)?.modelId ?? ""}
                  onChange={(event) =>
                    event.target.value && assign.mutate({ role, modelId: event.target.value })
                  }
                >
                  <option value="">未分配</option>
                  {models.data
                    ?.filter((model) => model.enabled)
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.modelId}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {assign.isError ? <ErrorNote error={assign.error} title="岗位保存失败" /> : null}
      {providerForm ? (
        <ProviderForm
          pending={createProviderMutation.isPending}
          error={createProviderMutation.error}
          onCancel={() => setProviderForm(false)}
          onSave={(input) => createProviderMutation.mutate(input)}
        />
      ) : null}
      {modelForm ? (
        <ModelForm
          providers={providers.data ?? []}
          pending={createModelMutation.isPending}
          error={createModelMutation.error}
          onCancel={() => setModelForm(false)}
          onSave={(input) => createModelMutation.mutate(input)}
        />
      ) : null}
      {deleteTarget ? (
        <ConfirmDialog
          title={`确认删除${deleteTarget.label}？`}
          confirmLabel="删除"
          danger
          pending={removeMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => removeMutation.mutate(deleteTarget)}
        >
          <p>
            删除后该记录不会再出现在新平台的 AI 配置中；如果它仍被岗位或运行历史引用，服务端会拒绝删除并保留当前配置。
          </p>
          {removeMutation.isError ? (
            <ErrorNote error={removeMutation.error} title="删除失败，配置未改变" />
          ) : null}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function ProviderSettingCard({ provider, models, onDelete, onDeleteModel, onRefresh }: { provider: PublicProviderDto; models: ModelConfigDto[]; onDelete: () => void; onDeleteModel: (model: ModelConfigDto) => void; onRefresh: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfigDto | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [savePending, setSavePending] = useState(false);
  const probe = useMutation({ mutationFn: (modelId: string) => probeProvider({ providerId: provider.id, modelId }) });
  const saveProvider = async (input: UpsertProviderRequest) => {
    setSaveError(null);
    setSavePending(true);
    try {
      await updateProvider(provider.id, { ...input, expectedUpdatedAt: provider.updatedAt });
      setEditing(false);
      await onRefresh();
    } catch (error) {
      setSaveError(error);
    } finally {
      setSavePending(false);
    }
  };
  const saveModel = async (input: UpsertModelRequest) => {
    if (!editingModel) return;
    setSaveError(null);
    setSavePending(true);
    try {
      await updateModel(editingModel.id, { ...input, expectedUpdatedAt: editingModel.updatedAt });
      setEditingModel(null);
      await onRefresh();
    } catch (error) {
      setSaveError(error);
    } finally {
      setSavePending(false);
    }
  };
  const reloadAfterConflict = async () => {
    await onRefresh();
    setSaveError(null);
    setEditing(false);
    setEditingModel(null);
  };
  return <article className="cf-provider-card"><header><div><span className="cf-badge">{provider.enabled ? "已启用" : "已停用"}</span><h3>{provider.name}</h3><small>{provider.wireApi} · {provider.baseUrl}</small></div><button className="cf-icon-danger" aria-label={`删除渠道 ${provider.name}`} onClick={onDelete}><Trash2 size={16} /></button></header><p>凭据：{provider.credentialRef || "未配置"}</p>{saveError ? <div><ErrorNote error={saveError} title="保存配置失败，可能已被另一端修改" /><button type="button" className="cf-text-link" onClick={() => void reloadAfterConflict()}>重新读取远端配置</button></div> : null}<div className="cf-provider-models"><strong>{models.length} 个模型</strong>{models.map((model) => <div key={model.id}><span>{model.modelId}{model.enabled ? "" : " · 已停用"}</span><span className="cf-actions"><button className="cf-text-link" onClick={() => setEditingModel(model)}>编辑模型</button><button className="cf-text-link" disabled={probe.isPending} onClick={() => probe.mutate(model.id)}>测试连接</button><button className="cf-text-danger" aria-label={`删除模型 ${model.modelId}`} onClick={() => onDeleteModel(model)}><Trash2 size={13} /></button></span></div>)}</div>{probe.data ? <div className="cf-probe-result" role="status"><strong>最近测试：{probe.data.stages.every((stage) => stage.status === "passed" || stage.status === "skipped") ? "通过" : "需处理"}</strong>{probe.data.stages.map((stage) => <span key={stage.stage}>{stage.stage} · {stage.status} · {stage.latencyMs}ms</span>)}</div> : null}{probe.isError ? <ErrorNote error={probe.error} /> : null}{editing ? <ProviderForm current={provider} pending={savePending} onCancel={() => setEditing(false)} onSave={saveProvider} /> : <button className="cf-text-link" onClick={() => { setSaveError(null); setEditing(true); }}>编辑渠道</button>}{editingModel ? <ModelForm key={editingModel.id} current={editingModel} providers={[provider]} pending={savePending} onCancel={() => setEditingModel(null)} onSave={saveModel} /> : null}</article>;
}

function ProviderForm({
  current,
  pending,
  error,
  onCancel,
  onSave,
}: {
  current?: PublicProviderDto;
  pending: boolean;
  error?: unknown;
  onCancel: () => void;
  onSave: (input: UpsertProviderRequest) => void;
}) {
  const [name, setName] = useState(current?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? "https://api.openai.com");
  const [credentialRef, setCredentialRef] = useState("");
  const [wireApi, setWireApi] = useState<UpsertProviderRequest["wireApi"]>(current?.wireApi ?? "openai-responses");
  return (
    <form
      className="cf-settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          credentialRef: credentialRef.trim() || undefined,
          wireApi,
          endpoint: current?.endpoint ?? null,
          anthropicVersion: current?.anthropicVersion ?? null,
          headers: current?.headers ?? {},
          queryParams: current?.queryParams ?? {},
          requestStartTimeoutMs: current?.requestStartTimeoutMs ?? null,
          streamIdleTimeoutMs: current?.streamIdleTimeoutMs ?? null,
          enabled: current?.enabled ?? true,
        });
      }}
    >
      <h3>{current ? "编辑渠道" : "添加 AI 渠道"}</h3>
      <label>
        名称
        <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：主力模型" />
      </label>
      <label>
        接口类型
        <select value={wireApi} onChange={(event) => setWireApi(event.target.value as UpsertProviderRequest["wireApi"])}>
          <option value="openai-responses">OpenAI Responses</option>
          <option value="openai-chat">OpenAI Chat</option>
          <option value="anthropic-messages">Anthropic Messages</option>
        </select>
      </label>
      <label>
        服务地址
        <input required type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
      </label>
      <label>
        API Key 或环境变量引用
        <input type="password" value={credentialRef} onChange={(event) => setCredentialRef(event.target.value)} placeholder={current ? "留空以保留已有凭据" : "sk-… 或 env:OPENAI_API_KEY"} />
      </label>
      {error ? <ErrorNote error={error} title="渠道保存失败" /> : null}
      <div className="cf-modal-actions">
        <button type="button" className="cf-button" onClick={onCancel}>取消</button>
        <button className="cf-primary" disabled={pending || !name.trim()}>{pending ? "保存中…" : "保存渠道"}</button>
      </div>
    </form>
  );
}

function ModelForm({
  current,
  providers,
  pending,
  error,
  onCancel,
  onSave,
}: {
  current?: ModelConfigDto;
  providers: PublicProviderDto[];
  pending: boolean;
  error?: unknown;
  onCancel: () => void;
  onSave: (input: UpsertModelRequest) => void;
}) {
  const [providerId, setProviderId] = useState(current?.providerId ?? providers[0]?.id ?? "");
  const [modelId, setModelId] = useState(current?.modelId ?? "");
  const [taskType, setTaskType] = useState<UpsertModelRequest["taskType"]>(current?.taskType ?? "writing");
  const [enabled, setEnabled] = useState(current?.enabled ?? true);
  return (
    <form
      className="cf-settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          providerId,
          modelId: modelId.trim(),
          taskType,
          contextWindow: current?.contextWindow ?? null,
          maxOutputTokens: current?.maxOutputTokens ?? null,
          sampling: current?.sampling ?? {},
          capabilities: current?.capabilities ?? {},
          enabled,
        });
      }}
    >
      <h3>{current ? "编辑模型" : "添加模型"}</h3>
      <label>
        所属渠道
        <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
          {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
        </select>
      </label>
      <label>
        模型 ID
        <input required value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="例如：gpt-4.1-mini" />
      </label>
      <label>
        主要用途
        <select value={taskType} onChange={(event) => setTaskType(event.target.value as UpsertModelRequest["taskType"])}>
          <option value="writing">正文写作</option>
          <option value="planning">策划与大纲</option>
          <option value="review">检查与审稿</option>
          <option value="embedding">检索向量</option>
          <option value="rerank">检索排序</option>
        </select>
      </label>
      <label className="cf-check">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />启用模型
      </label>
      {error ? <ErrorNote error={error} title="模型保存失败" /> : null}
      <div className="cf-modal-actions">
        <button type="button" className="cf-button" onClick={onCancel}>取消</button>
        <button className="cf-primary" disabled={pending || !providerId || !modelId.trim()}>{pending ? "保存中…" : "保存模型"}</button>
      </div>
    </form>
  );
}

function StorageSettings() {
  const client = useQueryClient();
  const [mode, setMode] = useState<DriverMode>(() => readDriverOverride() ?? currentDriverMode());
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const [backupLabel, setBackupLabel] = useState("");
  const [targetDirectory, setTargetDirectory] = useState("");
  const [preview, setPreview] = useState<SystemBackupPreview | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<SystemBackupPreview | null>(null);
  const [restoreReceipt, setRestoreReceipt] = useState<SystemRestoreReceipt | null>(() => readRestoreReceipt());
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const unsubscribe = onDriverModeChange(setMode);
    void resolveDriverMode();
    return unsubscribe;
  }, []);
  const override = readDriverOverride();
  const backups = useQuery({
    queryKey: queryKeys.systemBackups,
    queryFn: ({ signal }) => getSystemBackups(signal),
    // 系统备份依赖 Node 服务端的文件系统；OPFS 本机驱动只能导出完整
    // SQLite 文件，不能伪造一个“目标目录恢复”操作。
    enabled: mode === "server",
  });
  const createBackup = useMutation({
    mutationFn: () => createSystemBackup(backupLabel.trim() || `文织备份 ${new Date().toLocaleString("zh-CN")}`),
    onSuccess: async () => {
      setBackupLabel("");
      setNotice("系统备份已创建，可以先预览完整性。");
      await client.invalidateQueries({ queryKey: queryKeys.systemBackups });
    },
  });
  const previewBackup = useMutation({
    mutationFn: (backup: SystemBackupManifest) => previewSystemBackup(backup.id),
    onSuccess: setPreview,
  });
  const restoreBackup = useMutation({
    mutationFn: () =>
      restoreSystemBackup(restoreTarget!.manifest.id, targetDirectory.trim(), false),
    onSuccess: (result) => {
      const receipt: SystemRestoreReceipt = {
        targetDirectory: result.targetDirectory,
        databasePath: result.databasePath,
        migration: result.migration,
        counts: result.counts,
        restoredAt: new Date().toISOString(),
      };
      writeRestoreReceipt(receipt);
      setRestoreReceipt(receipt);
      setNotice(`系统备份已恢复到 ${result.databasePath}。`);
      setRestoreTarget(null);
      setTargetDirectory("");
    },
  });
  const download = async () => {
    setDownloadPending(true);
    setDownloadError(null);
    try {
      const file = await downloadLibraryDatabase();
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename ?? "chapterflow-library.sqlite";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      setDownloadError(error);
    } finally {
      setDownloadPending(false);
    }
  };
  return <section className="cf-card cf-settings-card"><div className="cf-section-title"><div><h2>存储与备份</h2><p>选择内容保存位置。切换前请先完成当前写作并准备备份。</p></div><span className="cf-badge">当前：{override ?? mode}</span></div>{notice ? <div className="cf-notice" role="status">{notice}</div> : null}<div className="cf-settings-block"><h3>内容驱动</h3><div className="cf-settings-options"><button className={override === "local" ? "is-active" : ""} onClick={() => { setDriverOverride("local"); window.location.reload(); }}><Database size={15} />本机存储</button><button className={override === "server" ? "is-active" : ""} onClick={() => { setDriverOverride("server"); window.location.reload(); }}><Radio size={15} />服务端存储</button><button onClick={() => { setDriverOverride(null); window.location.reload(); }}>跟随自动探测</button></div></div><div className="cf-settings-block"><h3>数据备份</h3><p>可以下载当前内容库作为离线备份。作品级备份与恢复在每本作品的发布页中进行。</p><button className="cf-button" onClick={() => void download()} disabled={downloadPending}><Database size={15} />{downloadPending ? "正在准备…" : "下载我的库"}</button>{downloadError ? <ErrorNote error={downloadError} /> : null}</div><div className="cf-settings-block" id="system-backups"><h3>系统备份</h3>{mode === "pending" ? <p role="status">正在确认当前存储驱动，随后显示可用的备份方式…</p> : mode === "local" ? <div className="cf-driver-note" role="note"><strong>本机存储使用完整库下载。</strong><p>当前内容保存在浏览器 OPFS。系统备份的目标目录、完整性预览和恢复由服务端文件系统提供；请先点击“下载我的库”保存 SQLite。要恢复到新目录，请启动对应服务端实例并选择“服务端存储”。</p></div> : <><p>系统备份包含整个内容库；创建后先预览完整性，再决定是否恢复。恢复不会静默覆盖当前库。</p><div className="cf-backup-create"><input aria-label="系统备份说明" value={backupLabel} onChange={(event) => setBackupLabel(event.target.value)} placeholder="例如：迁移前完整备份" /><button className="cf-button" disabled={createBackup.isPending} onClick={() => createBackup.mutate()}>{createBackup.isPending ? "正在创建…" : "创建系统备份"}</button></div>{createBackup.isError ? <ErrorNote error={createBackup.error} /> : null}{backups.isError ? <ErrorNote error={backups.error} /> : null}<div className="cf-backup-list">{backups.isPending ? <p role="status">正在读取系统备份…</p> : backups.data?.length ? backups.data.map((backup) => <div className="cf-list-row" key={backup.id}><div><strong>{backup.label}</strong><p>{new Date(backup.createdAt).toLocaleString("zh-CN")} · {formatBytes(backup.sizeBytes)} · 迁移 {backup.migration}</p></div><button className="cf-button" disabled={previewBackup.isPending} onClick={() => previewBackup.mutate(backup)}>预览完整性</button></div>) : <p>还没有系统备份。</p>}</div>{preview ? <div className="cf-backup-preview" role="status"><strong>{preview.valid && preview.hashMatches && preview.foreignKeyViolations === 0 ? "备份可恢复" : "备份需要处理"}</strong><span>{preview.integrityCheck} · {preview.foreignKeyViolations} 个外键问题</span>{preview.valid && preview.hashMatches && preview.foreignKeyViolations === 0 ? <button className="cf-button" onClick={() => { setRestoreTarget(preview); setTargetDirectory(""); }}>准备恢复</button> : null}</div> : null}</>}</div>{restoreReceipt ? <div className="cf-settings-block cf-restore-receipt"><div><h3>最近一次恢复</h3><p>{new Date(restoreReceipt.restoredAt).toLocaleString("zh-CN")} · {restoreReceipt.targetDirectory}</p><small>{restoreReceipt.databasePath} · 迁移 {restoreReceipt.migration} · {restoreReceipt.counts.projects} 个作品，{restoreReceipt.counts.documents} 篇正文</small><p>恢复目录不会自动替换当前浏览器连接的数据源。请用该目录启动服务端后选择“服务端存储”，再打开作品库继续检查。</p></div><div className="cf-actions"><Link className="cf-button" to="/books">打开当前作品库</Link><button type="button" className="cf-text-link" onClick={() => { setRestoreReceipt(null); removeRestoreReceipt(); }}>隐藏这条记录</button></div></div> : null}<div className="cf-settings-block"><h3>继续创作</h3><Link className="cf-button" to="/books">先回到作品库</Link></div>{restoreTarget ? <ConfirmDialog title="恢复系统备份？" confirmLabel="确认恢复" danger pending={restoreBackup.isPending} confirmDisabled={!targetDirectory.trim()} onCancel={() => setRestoreTarget(null)} onConfirm={() => restoreBackup.mutate()}><p>完整性校验已通过。恢复会写入一个新的目标目录，不会静默覆盖当前内容库。</p><label>恢复目标目录<input aria-label="恢复目标目录" value={targetDirectory} onChange={(event) => setTargetDirectory(event.target.value)} placeholder="例如：/tmp/chapterflow-restored" /></label>{restoreBackup.isError ? <ErrorNote error={restoreBackup.error} /> : null}</ConfirmDialog> : null}</section>;
}

function readRestoreReceipt(): SystemRestoreReceipt | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(SYSTEM_RESTORE_RECEIPT_KEY) ?? "null") as Partial<SystemRestoreReceipt> | null;
    if (!value || typeof value.targetDirectory !== "string" || typeof value.databasePath !== "string" || typeof value.restoredAt !== "string" || typeof value.migration !== "number" || !value.counts || typeof value.counts !== "object") return null;
    return value as SystemRestoreReceipt;
  } catch {
    return null;
  }
}

function writeRestoreReceipt(receipt: SystemRestoreReceipt): void {
  try {
    window.localStorage.setItem(SYSTEM_RESTORE_RECEIPT_KEY, JSON.stringify(receipt));
  } catch {
    // 隐私模式下 localStorage 不可用时仍保留当前页面状态。
  }
}

function removeRestoreReceipt(): void {
  try {
    window.localStorage.removeItem(SYSTEM_RESTORE_RECEIPT_KEY);
  } catch {
    // 同上。
  }
}

function AdvancedSettings() { return <section className="cf-card cf-settings-card"><div className="cf-section-title"><div><h2>高级设置</h2><p>这里保留给诊断、模板和开发级能力，普通写作不需要进入。</p></div></div><div className="cf-settings-block"><h3>当前迁移进度</h3><p>运行任务、检索试运行、模板和技能正在迁入 ChapterFlow。新任务会在作品内任务中心显示，旧深链会保留上下文。</p></div><div className="cf-settings-links"><Link to="/books/templates" className="cf-button">创作模板</Link><Link to="/books" className="cf-button">作品备份入口</Link></div></section>; }

function roleLabel(role: AssignmentRole) { return ({ writing: "正文写作", planning: "大纲策划", review: "章节检查", embedding: "检索向量", rerank: "检索排序" } as Record<AssignmentRole, string>)[role]; }

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
