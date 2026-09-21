# DeepSeek Harness Adapter Spike V0.1

> Status: Passed  
> Branch: `chapterflow/dsh-workbench-architecture`  
> Harness compatibility target: `0.1.6-alpha.2`

## 1. Purpose

这个 Spike 不实现小说业务能力，只验证 ChapterFlow 能否作为一个**独立垂直产品层**安全接入 DeepSeek Harness，而不 fork Harness、不复用旧 ChapterFlow Web Runtime。

本轮必须证明：

1. ChapterFlow 可以拥有独立 Harness Profile。
2. ChapterFlow Agent Preset 可以与 Harness 的 agent-plane 生命周期对齐。
3. ChapterFlow 可以注册 model-facing Tool。
4. ChapterFlow 可以通过 `workflowEngine` 启动有界 Workflow 并委托 Subagent。
5. ChapterFlow 可以通过 Harness Client Slot 注入 Web UI，而不重写 Chat Shell。
6. 所有 Harness API 依赖被限制在 Adapter / Client UI 边界。

以上边界已通过 CI。

---

## 2. Implemented Layout

~~~
dsh-workbench/
├── apps/
│   └── profile/
│       ├── web.cordis.patch.yml
│       └── presets/
│           └── chapterflow-spike/
│               ├── preset.yml
│               └── agent.cordis.yml
├── packages/
│   ├── harness-adapter/
│   │   └── src/index.ts
│   └── client-ui/
│       ├── src/index.ts
│       └── src/client.tsx
├── tests/
│   └── spike.test.mjs
└── package.json
~~~

---

## 3. Proven Harness Boundaries

### 3.1 Agent plane, not Web host plane

ChapterFlow 的 model-facing Tool 不能简单挂到 Web Host 根上下文。

Harness Web 的 Agent Preset 是 agent-plane composition；不同 Session 通过 preset scope 加入自己的 Agent 上下文。

因此：

- 浏览器 UI 插件放在 Web Host composition。
- ChapterFlow model-facing adapter 放在 `chapterflow-spike` Agent Preset。
- `workflowEngine` 与使用它的 ChapterFlow adapter 共享同一个 isolated Cordis realm。

当前 preset：

~~~
chapterflow-spike
├── persona
├── goal tool
├── workflowEngine isolate
│   ├── subagent
│   ├── workflow-ptc
│   └── chapterflow-harness-adapter
├── ask-user
└── todo
~~~

这一边界后续必须保留。

### 3.2 Harness profile package resolution

外部 patch 中引用的本地 ChapterFlow 包不会自动从当前项目 `node_modules` 被 Harness Profile 解析。

Harness Profile 的 bare package resolution 以自己的 Profile 环境为边界。

因此 Spike 最终采用：

1. 从 Harness shipped `web` 初始化独立 `chapterflow` Profile。
2. 使用 Harness plugin manager 将两个本地 ChapterFlow package 安装到该 Profile：
   - `@chapterflow/dsh-harness-adapter`
   - `@chapterflow/dsh-client-ui`
3. 再启动 `dsh chapterflow --patch ...`。

这比修改默认 `web` Profile 更安全，也避免污染用户其他 Harness 工作区。

### 3.3 Workflow façade

ChapterFlow 没有直接把 Harness 的通用 `workflow` Tool 暴露成产品 API。

Spike 实现：

~~~
chapterflow_workflow_spike
        ↓
runSpikeWorkflow()
        ↓
ctx.workflowEngine.start()
        ↓
agent(...)
        ↓
Specialist Child
~~~

这个结构验证了后续可以实现固定领域 façade：

- `chapterflow_start_book`
- `chapterflow_write_chapter`
- `chapterflow_editor_review`

内部仍然使用 Harness Workflow / Subagent，但用户和模型看到的是稳定的小说语义 Tool，而不是任意脚本编排细节。

### 3.4 Workflow ownership

Adapter 必须完整拥有一次 Workflow Run 的生命周期：

- 传入当前 `exec.agent` 作为 parent。
- 转发 `AbortSignal`。
- parent abort 时调用 `run.cancel()`。
- 只把 `completed` 当成功。
- `cancelled` / `error` 不返回 partial result。
- 所有路径都调用 `run.dispose()`。

这已经有契约测试。

### 3.5 Client UI Slot

Spike 没有复制 Harness 对话组件。

浏览器插件注册：

`conversation.session.header.actions`

并显示：

`ChapterFlow · Spike Ready`

Agent 执行时显示：

`ChapterFlow · Agent 运行中`

这证明 ChapterFlow 可以利用 Harness UI Slot 向现有 Web Shell 添加领域 UI。

后续人物图谱、时间线等复杂视图应继续沿用 Slot / View 注册机制，而不是重新建立 Web Shell。

---

## 4. Spike Tools

### `chapterflow_adapter_status`

只读诊断 Tool。

返回 Adapter 版本和当前验证能力：

- tool-registration
- workflow-engine
- subagent-delegation
- client-slot

### `chapterflow_workflow_spike`

输入一个 `topic`，通过 Harness Workflow Engine 启动一个有界 specialist child。

Workflow 只有一个 phase：

`specialist-check`

该 Tool 不修改小说项目。

---

## 5. Run Locally

要求：

- Node.js 24+
- npm

在仓库根目录：

~~~bash
cd dsh-workbench
npm install
npm run typecheck
npm test
npm run dev
~~~

`npm run dev` 会：

1. build 两个 ChapterFlow package；
2. 初始化独立 Harness `chapterflow` Profile；
3. 将本地 ChapterFlow packages 安装到这个 Profile；
4. 以 ChapterFlow overlay 启动 Harness Web。

Harness 会在终端打印带临时认证 token 的本地地址。

浏览器打开后，新 Session 默认使用：

`ChapterFlow Spike`

---

## 6. Manual Smoke

配置可用模型后，在 ChapterFlow Spike Session 中测试：

### Tool registration

~~~text
调用 chapterflow_adapter_status，告诉我返回结果。
~~~

预期包含：

~~~text
ready: true
boundary: harness-adapter
~~~

### Workflow + Subagent

~~~text
调用 chapterflow_workflow_spike，
topic 设置为 "ChapterFlow Harness integration"。
~~~

预期：

- Harness 出现一次 Workflow 运行。
- 启动一个 specialist child。
- 返回的 child handoff 以 `CHAPTERFLOW_SPIKE_OK:` 开头。
- Workflow 正常结束。
- 页面标题区域可看到 ChapterFlow 状态标记。

---

## 7. CI Evidence

`.github/workflows/dsh-workbench-spike.yml` 使用 Node 24 和真实发布版 Harness alpha 包执行：

1. npm 安装。
2. TypeScript 契约编译。
3. Adapter contract tests。
4. 初始化独立 `chapterflow` Harness Profile。
5. 安装本地 ChapterFlow plugins。
6. dump 并验证 Profile composition。
7. 真正启动 Harness Web Host。
8. 使用 Harness 启动生成的认证 token/cookie 请求 Web 首页。

因此本 Spike 不只是静态示例。

---

## 8. What Is Not Proven Yet

Spike 通过不等于 ChapterFlow V1 已实现。

目前仍未实现：

- BookProject Store
- Book Lifecycle
- Candidate persistence
- Story Memory
- Reader Memory
- Context Compiler
- StartBook Workflow
- 真实章节写作
- AI Editor
- Character Graph / Timeline Domain Projection
- Fanqie Knowledge

另外 CI 不持有模型 API Key，因此自动化流水线没有执行一次真实 LLM Subagent 推理。

真实模型调用保留为本地 Manual Smoke；下一阶段开始实现 Domain Core 后，再建设可控的 real-model acceptance。

---

## 9. Decisions Confirmed by Spike

### ADR-SPIKE-01

ChapterFlow 使用**独立 Harness Profile**，不修改默认 `web` Profile。

### ADR-SPIKE-02

Model-facing ChapterFlow 插件属于 agent plane。

### ADR-SPIKE-03

Browser visualization 插件属于 host/client plane。

### ADR-SPIKE-04

所有 Harness API 只允许出现在 `harness-adapter` 和 `client-ui` 边界。

### ADR-SPIKE-05

ChapterFlow 的产品 Workflow 采用固定领域 Tool façade，内部调用 Harness Workflow Engine。

### ADR-SPIKE-06

当前兼容版本必须显式 pin；升级 Harness alpha 时 CI 必须重新验证 Adapter。

---

## 10. Next Slice

Spike 结束后不继续扩展 Harness 基础设施。

下一阶段应该进入：

**Domain Core V0.1**

最小实现：

~~~
BookProject
+ Lifecycle
+ Candidate
+ Project Revision
+ local Project Store
+ book.get_state
+ book.get_next_action
+ candidate.stage / accept / reject
~~~

完成后再把第一个真实业务 Workflow `start-book` 接到 Harness。
