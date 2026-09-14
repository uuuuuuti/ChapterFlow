import type { NarrativeModelClient } from "@narralume/narrative";
import { NodeNarrativeDatabase } from "@narralume/persistence/node";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { ServerConfig } from "../src/config.js";

const config: ServerConfig = {
  dataDirectory: ".",
  databasePath: ":memory:",
  host: "127.0.0.1",
  port: 4317,
  environment: "test",
};

const resources: {
  app: Awaited<ReturnType<typeof buildApp>>;
  database: NodeNarrativeDatabase;
}[] = [];

let modelValue: { summary: string; items: unknown[] };

afterEach(async () => {
  while (resources.length) {
    const resource = resources.pop();
    await resource?.app.close();
    resource?.database.close();
  }
});

describe("Web-novel profile/brief candidate API", () => {
  it("stages a profile candidate, applies it, and rejects stale adoption", async () => {
    const { app } = await setup();
    const projectId = await createProject(app);
    const profile = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${projectId}/book-profile`,
      })
    ).json() as { version: number };
    modelValue = {
      summary: "收紧作品承诺",
      items: [
        {
          operation: "update",
          title: "明确每章追更回报",
          rationale: "让读者承诺可以被前三章体检验证。",
          impact: ["后续章节检查会引用新的承诺"],
          evidence: [
            {
              sourceType: "profile",
              sourceId: projectId,
              label: "当前作品档案",
              quote: "当前作品还没有明确的读者回报。",
            },
          ],
          afterJson: JSON.stringify({
            promise: "每章揭开一层时间谜团",
            tone: "克制、温柔",
          }),
          requiresLockedConfirmation: false,
        },
      ],
    };
    const started = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/web-novel/candidates`,
      payload: {
        requestId: "8e92f1f5-bc88-4657-a0ae-c7055e2bcad1",
        kind: "profile",
        instruction: "明确读者承诺",
      },
    });
    expect(started.statusCode, started.body).toBe(202);
    await finishRun(app, projectId, started.json().runId);
    const list = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/web-novel/candidates?kind=profile`,
    });
    expect(list.statusCode, list.body).toBe(200);
    const set = list.json()[0] as {
      id: string;
      sourceProfileVersion: number;
      stale: boolean;
      items: { id: string; evidence: unknown[] }[];
    };
    expect(set).toMatchObject({
      sourceProfileVersion: profile.version,
      stale: false,
    });
    expect(set.items[0]?.evidence).toHaveLength(1);

    const applied = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/web-novel/candidates/${set.id}/items/${set.items[0]!.id}/decisions`,
      payload: { action: "apply" },
    });
    expect(applied.statusCode, applied.body).toBe(200);
    expect(applied.json()).toMatchObject({
      candidateSet: { status: "applied" },
      item: { decision: { action: "apply" } },
    });
    const saved = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${projectId}/book-profile`,
      })
    ).json();
    expect(saved).toMatchObject({
      promise: "每章揭开一层时间谜团",
      tone: "克制、温柔",
      version: 1,
    });

    modelValue = {
      summary: "第二个候选",
      items: [
        {
          operation: "update",
          title: "旧基线候选",
          rationale: "用于并发保护回归。",
          impact: [],
          evidence: [],
          afterJson: JSON.stringify({ promise: "旧版本承诺" }),
          requiresLockedConfirmation: false,
        },
      ],
    };
    const staleStarted = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/web-novel/candidates`,
      payload: {
        requestId: "2f68148a-631f-4ec9-a87e-caf07e42a87f",
        kind: "profile",
        instruction: "旧基线候选",
      },
    });
    await finishRun(app, projectId, staleStarted.json().runId);
    const staleSet = (
      await app.inject({
        method: "GET",
        url: `/api/projects/${projectId}/web-novel/candidates?kind=profile`,
      })
    ).json()[0] as { id: string; items: { id: string }[] };
    await app.inject({
      method: "PUT",
      url: `/api/projects/${projectId}/book-profile`,
      payload: {
        presetId: null,
        genre: null,
        audience: null,
        promise: "作者刚刚手动改过的承诺",
        tone: "克制、温柔",
        endingDirection: null,
        pov: null,
        updateCadence: null,
        targetWordsPerChapter: null,
        boundaries: [],
        worldRules: [],
        arcNotes: [],
        expectedVersion: 1,
      },
    });
    const conflict = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/web-novel/candidates/${staleSet.id}/items/${staleSet.items[0]!.id}/decisions`,
      payload: { action: "apply" },
    });
    expect(conflict.statusCode, conflict.body).toBe(409);
    expect(conflict.json().error.code).toBe("web_novel_candidate.source.stale");
  });

  it("binds a brief candidate to its chapter and manuscript version", async () => {
    const { app } = await setup();
    const projectId = await createProject(app);
    const story = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/story-bible`,
    });
    const chapter = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/outline`,
      payload: {
        parentId: story.json().outline[0].id,
        kind: "chapter",
        ordinal: 0,
        title: "第一章 失约的船票",
      },
    });
    expect(chapter.statusCode, chapter.body).toBe(201);
    const outlineNodeId = chapter.json().id as string;
    const document = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents`,
      payload: {
        requestId: "brief-candidate-document",
        kind: "chapter",
        title: "第一章 失约的船票",
        outlineNodeId,
      },
    });
    expect(document.statusCode, document.body).toBe(201);
    const documentId = document.json().id as string;
    const version = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents/${documentId}/versions`,
      payload: {
        content: "码头的雾在钟声响起前散开。".repeat(100),
        source: "manual",
        expectedCurrentVersionId: null,
      },
    });
    expect(version.statusCode, version.body).toBe(201);
    modelValue = {
      summary: "把第一章的发现和回报锁在同一场景里",
      items: [
        {
          operation: "update",
          title: "强化船票回报",
          rationale: "让章节结尾的线索同时兑现本章目标并留下追更钩子。",
          impact: ["正文检查可以核对目标、冲突和回报是否闭合"],
          evidence: [
            {
              sourceType: "outline",
              sourceId: outlineNodeId,
              label: "第一章大纲节点",
              quote: "第一章 失约的船票",
            },
          ],
          afterJson: JSON.stringify({
            purpose: "turning_point",
            readerExpectation: "主角会发现船票来自尚未发生的航次",
            emotionTarget: "紧张",
            emotionCurve: [{ label: "逼近", intensity: 4 }],
            readerPromiseOperations: [
              {
                action: "OPEN",
                promiseId: null,
                title: "船票来自未来",
                note: "下一章核对日期",
              },
            ],
            payoffStrength: 4,
            hookType: "question",
            hookStrength: 5,
            informationGain: 4,
            endingPull: 5,
            sceneStructure: [
              {
                order: 1,
                purpose: "reveal",
                beat: "发现未来日期",
                payoff: "问题继续悬置",
              },
            ],
            goal: "在雾散前确认船票来自尚未发生的航次",
            payoff: "拿到写着未来日期的旧船票",
            hook: "船票背面的收件人是主角自己",
            pacing: "fast",
          }),
          requiresLockedConfirmation: false,
        },
      ],
    };
    const started = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/web-novel/candidates`,
      payload: {
        requestId: "b7b4c8b6-7b63-4bd1-a43e-ef8c7084fcf8",
        kind: "brief",
        outlineNodeId,
        instruction: "补足第一章的目标、回报和钩子",
        origin: {
          surface: "web-novel-brief",
          documentId,
          outlineNodeId,
          versionId: version.json().id,
        },
      },
    });
    expect(started.statusCode, started.body).toBe(202);
    await finishRun(app, projectId, started.json().runId);
    const list = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/web-novel/candidates?kind=brief`,
    });
    expect(list.statusCode, list.body).toBe(200);
    const set = list.json()[0] as {
      id: string;
      outlineNodeId: string;
      sourceBriefVersion: number | null;
      sourceDocumentId: string;
      sourceDocumentVersionId: string;
      items: { id: string }[];
    };
    expect(set).toMatchObject({
      outlineNodeId,
      sourceBriefVersion: null,
      sourceDocumentId: documentId,
      sourceDocumentVersionId: version.json().id,
    });
    const filtered = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/web-novel/candidates?kind=brief&outlineNodeId=${outlineNodeId}`,
    });
    expect(filtered.statusCode, filtered.body).toBe(200);
    expect(filtered.json()).toHaveLength(1);
    const applied = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/web-novel/candidates/${set.id}/items/${set.items[0]!.id}/decisions`,
      payload: { action: "apply" },
    });
    expect(applied.statusCode, applied.body).toBe(200);
    expect(applied.json().item.decision.action).toBe("apply");
    const brief = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/chapter-briefs/${outlineNodeId}`,
    });
    expect(brief.statusCode, brief.body).toBe(200);
    expect(brief.json()).toMatchObject({
      purpose: "turning_point",
      readerExpectation: "主角会发现船票来自尚未发生的航次",
      emotionTarget: "紧张",
      readerPromiseOperations: [
        expect.objectContaining({ action: "OPEN", title: "船票来自未来" }),
      ],
      goal: "在雾散前确认船票来自尚未发生的航次",
      payoff: "拿到写着未来日期的旧船票",
      hook: "船票背面的收件人是主角自己",
      pacing: "fast",
      documentVersionId: version.json().id,
    });
    const promises = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/reader-promises?view=open`,
    });
    expect(promises.statusCode, promises.body).toBe(200);
    expect(promises.json().promises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "船票来自未来", status: "open" }),
      ]),
    );
    const bundle = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/exports/narrative-bundle?versionMode=history&includeAnnotations=true&includeRuns=false`,
    });
    expect(bundle.statusCode, bundle.body).toBe(200);
    expect(bundle.json().manifest.counts).toMatchObject({
      webNovelCandidateSets: 1,
      webNovelCandidateItems: 1,
    });
    const preview = await app.inject({
      method: "POST",
      url: "/api/imports/preview",
      payload: {
        targetProjectId: null,
        filename: "候选恢复.narrative.json",
        format: "narrative-bundle",
        contentBase64: bundle.rawPayload.toString("base64"),
      },
    });
    expect(preview.statusCode, preview.body).toBe(201);
    const restored = await app.inject({
      method: "POST",
      url: `/api/imports/${preview.json().batch.id}/actions`,
      payload: { action: "apply", selectedCandidateIds: [] },
    });
    expect(restored.statusCode, restored.body).toBe(200);
    const restoredCandidates = await app.inject({
      method: "GET",
      url: `/api/projects/${restored.json().projectId}/web-novel/candidates?kind=brief`,
    });
    expect(restoredCandidates.statusCode, restoredCandidates.body).toBe(200);
    expect(restoredCandidates.json()).toHaveLength(1);
    expect(restoredCandidates.json()[0]).toMatchObject({
      status: "applied",
      items: [{ decision: { action: "apply" } }],
    });
  });
});

async function setup() {
  const database = new NodeNarrativeDatabase();
  const app = await buildApp({
    config,
    database,
    environment: {
      NARRATIVE_LLM_API_KEY: "server-only-test-key",
      NARRATIVE_LLM_BASE_URL: "https://api.example.com/v1",
      NARRATIVE_LLM_MODEL: "test-model",
    },
    narrativeModelClient: candidateModel(),
    enableRunWorker: false,
    logger: false,
  });
  resources.push({ app, database });
  return { app };
}

function candidateModel(): NarrativeModelClient {
  return {
    async text() {
      throw new Error("Web-novel candidates must use structured output");
    },
    async structured(_run, _step, purpose, _request, _contract, validate) {
      if (purpose !== "web-novel-planning")
        throw new Error(`unexpected purpose ${purpose}`);
      const checked = validate(modelValue);
      if (!checked.success) throw new Error(checked.issues.join("; "));
      return {
        value: checked.data,
        usage: {
          inputTokens: 100,
          outputTokens: 100,
          calls: 1,
          costUsd: 0,
          wallTimeMs: 10,
        },
        mode: "native",
        attempts: 1,
      };
    },
  } as NarrativeModelClient;
}

async function createProject(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    payload: {
      requestId: globalThis.crypto.randomUUID(),
      title: "时差邮局",
      premise: "每封来自未来的信都带走一段记忆。",
    },
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json().id as string;
}

async function finishRun(
  app: Awaited<ReturnType<typeof buildApp>>,
  projectId: string,
  runId: string,
) {
  for (let index = 0; index < 8; index += 1) {
    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/advance`,
      payload: { projectId },
    });
    expect(response.statusCode, response.body).toBe(200);
    const status = response.json().snapshot.run.status as string;
    if (status === "completed") return;
    if (["failed", "cancelled"].includes(status))
      throw new Error(response.body);
  }
  throw new Error("web-novel candidate run did not complete");
}
