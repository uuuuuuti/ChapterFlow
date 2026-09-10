import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Copy, RotateCcw, Save, Sparkles } from "lucide-react";
import {
  cloneHarnessTemplate,
  getHarnessTemplates,
  restoreHarnessTemplate,
  updateHarnessTemplate,
} from "../../shared/api/context";
import type { HarnessTemplate } from "../../shared/api/types";
import { ErrorNote } from "../../shared/ui";
import { queryKeys } from "../../shared/query/keys";

export function TemplatesPage() {
  const client = useQueryClient();
  const templates = useQuery({
    queryKey: queryKeys.templates,
    queryFn: ({ signal }) => getHarnessTemplates(signal),
  });
  const [selected, setSelected] = useState<HarnessTemplate | null>(null);
  const [content, setContent] = useState("");
  const [cloneKey, setCloneKey] = useState("");
  const [cloneName, setCloneName] = useState("");
  const save = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("请先选择一个模板。");
      return updateHarnessTemplate(selected, content);
    },
    onSuccess: async (next) => {
      setSelected(next);
      setContent(next.effectiveContent);
      await client.invalidateQueries({ queryKey: queryKeys.templates });
    },
  });
  const restore = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("请先选择一个模板。");
      return restoreHarnessTemplate(selected);
    },
    onSuccess: async (next) => {
      setSelected(next);
      setContent(next.effectiveContent);
      await client.invalidateQueries({ queryKey: queryKeys.templates });
    },
  });
  const clone = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("请先选择一个模板。");
      return cloneHarnessTemplate(selected, {
        key: cloneKey.trim(),
        name: cloneName.trim(),
      });
    },
    onSuccess: async (next) => {
      setCloneKey("");
      setCloneName("");
      setSelected(next);
      setContent(next.effectiveContent);
      await client.invalidateQueries({ queryKey: queryKeys.templates });
    },
  });

  const select = (template: HarnessTemplate) => {
    setSelected(template);
    setContent(template.effectiveContent);
  };

  return (
    <div className="cf-page cf-templates-page">
      <div className="cf-page-title">
        <div>
          <Link className="cf-text-link" to="/books">
            ← 我的作品
          </Link>
          <p className="cf-eyebrow">CHAPTERFLOW TEMPLATES</p>
          <h1>创作模板</h1>
          <p>把稳定的提示词、检查规则和创作配方收在一个可回溯的地方。</p>
        </div>
        <Link className="cf-button" to="/settings/advanced">
          高级设置
        </Link>
      </div>
      {templates.isError ? <ErrorNote error={templates.error} /> : null}
      {save.isError ? <ErrorNote error={save.error} /> : null}
      {restore.isError ? <ErrorNote error={restore.error} /> : null}
      {clone.isError ? <ErrorNote error={clone.error} /> : null}
      {templates.isPending ? <p role="status">正在读取模板…</p> : null}
      <div className="cf-template-layout">
        <section className="cf-card cf-template-list">
          <div className="cf-section-title">
            <div>
              <h2>模板库</h2>
              <p>{templates.data?.length ?? 0} 个可用模板</p>
            </div>
            <Sparkles size={22} />
          </div>
          {templates.data?.map((template) => (
            <button
              className={selected?.key === template.key ? "is-active" : ""}
              key={template.key}
              onClick={() => select(template)}
            >
              <span>
                <strong>{template.name}</strong>
                <small>{template.kind} · v{template.version}</small>
              </span>
              {template.overrideContent ? <em>已自定义</em> : null}
            </button>
          ))}
          {!templates.isPending && !templates.data?.length ? (
            <p className="cf-empty-note">服务端还没有初始化模板。</p>
          ) : null}
        </section>
        <section className="cf-card cf-template-editor">
          {selected ? (
            <>
              <div className="cf-section-title">
                <div>
                  <span className="cf-badge">{selected.kind}</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.description}</p>
                </div>
                <span className="mono">{selected.key}</span>
              </div>
              <details className="cf-template-invariants">
                <summary>查看系统约束</summary>
                <pre>{selected.systemInvariants}</pre>
              </details>
              <label className="cf-template-field">
                当前内容
                <textarea
                  rows={18}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                />
              </label>
              <div className="cf-actions">
                <button
                  className="cf-primary"
                  disabled={save.isPending || !content.trim()}
                  onClick={() => save.mutate()}
                >
                  <Save size={15} />
                  保存模板
                </button>
                <button
                  className="cf-button"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate()}
                >
                  <RotateCcw size={15} />
                  恢复默认
                </button>
              </div>
              <div className="cf-template-clone">
                <h3>复制为我的版本</h3>
                <div className="cf-form-grid">
                  <label>
                    新键名
                    <input
                      value={cloneKey}
                      onChange={(event) => setCloneKey(event.target.value)}
                      placeholder="例如：chapterflow.chapter.custom"
                    />
                  </label>
                  <label>
                    新名称
                    <input
                      value={cloneName}
                      onChange={(event) => setCloneName(event.target.value)}
                      placeholder="例如：我的章节检查"
                    />
                  </label>
                </div>
                <button
                  className="cf-button"
                  disabled={clone.isPending || !cloneKey.trim() || !cloneName.trim()}
                  onClick={() => clone.mutate()}
                >
                  <Copy size={15} />
                  创建副本
                </button>
              </div>
            </>
          ) : (
            <div className="cf-empty cf-template-empty">
              <Sparkles size={42} />
              <h2>选择一个模板开始</h2>
              <p>模板只影响之后的 AI 任务，不会覆盖已经保存的正文。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
