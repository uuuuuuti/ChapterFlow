// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getReviewWorkspace: vi.fn(),
  decideReviewIssue: vi.fn(),
  decideRevisionProposal: vi.fn(),
}));
const { getReviewWorkspace, decideReviewIssue, decideRevisionProposal } = mocks;

vi.mock("../src/app/layouts/chapterflow-shell", () => ({
  useFlushWriting: () => async () => true,
}));
vi.mock("../src/shared/api/review", () => ({
  getReviewWorkspace: mocks.getReviewWorkspace,
  decideReviewIssue: mocks.decideReviewIssue,
  decideRevisionProposal: mocks.decideRevisionProposal,
}));

import { ReviewPanel } from "../src/features/chapter-review/review-panel";

function renderPanel(currentVersionId: string | null, workspace: unknown) {
  getReviewWorkspace.mockResolvedValue(workspace);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReviewPanel
        projectId="project-1"
        documentId="document-1"
        currentVersionId={currentVersionId}
        onCheck={vi.fn()}
        onRevise={vi.fn()}
        busy={false}
      />
    </QueryClientProvider>,
  );
}

const staleReport = {
  id: "report-old",
  projectId: "project-1",
  runId: "run-old",
  stepId: "step-old",
  documentVersionId: "version-old",
  documentId: "document-1",
  documentTitle: "第一章",
  verdict: "revise",
  summary: "旧版本存在一处节奏问题。",
  scores: {},
  reviewedContent: "旧正文",
  reviewedContentHash: "hash-old",
  issues: [
    {
      id: "issue-old",
      category: "pacing",
      severity: "major",
      message: "旧版本问题不应操作当前正文",
      evidence: [{ quote: "旧证据" }],
      suggestedDirection: "旧建议",
      requiresAuthorDecision: true,
      status: "open",
      decision: null,
    },
  ],
  createdAt: "2026-09-08T10:00:00.000Z",
};

describe("章节审阅版本绑定", () => {
  beforeEach(() => {
    getReviewWorkspace.mockReset();
    decideReviewIssue.mockReset();
    decideRevisionProposal.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("当前正文版本变更后只保留旧报告的追溯入口，不允许裁定或生成修改", async () => {
    renderPanel("version-current", { reports: [staleReport], proposals: [] });

    expect(
      await screen.findByText(/当前正文版本尚未检查/),
    ).toBeInTheDocument();
    expect(screen.getByText(/查看 1 份旧版本检查报告/)).toBeInTheDocument();
    expect(screen.queryByText("旧版本问题不应操作当前正文")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认问题" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成修改建议" })).not.toBeInTheDocument();
  });

  it("当前版本报告可以操作，旧版本报告和修订建议保持只读", async () => {
    const currentReport = {
      ...staleReport,
      id: "report-current",
      runId: "run-current",
      stepId: "step-current",
      documentVersionId: "version-current",
      summary: "当前版本报告。",
      issues: [
        {
          ...staleReport.issues[0],
          id: "issue-current",
          message: "当前版本问题",
        },
      ],
      createdAt: "2026-09-09T10:00:00.000Z",
    };
    renderPanel("version-current", {
      reports: [staleReport, currentReport],
      proposals: [
        {
          id: "proposal-old",
          runId: "run-old",
          stepId: "step-old",
          documentId: "document-1",
          baseDocumentVersionId: "version-old",
          baseContent: "旧正文",
          revisedContent: "旧建议正文",
          diff: {},
          addressedIssueIds: [],
          status: "proposed",
          createdAt: "2026-09-08T10:00:00.000Z",
          decidedAt: null,
        },
      ],
    });

    expect(await screen.findByText("当前版本报告。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认问题" })).toBeInTheDocument();
    expect(screen.getByText(/已隐藏 1 份旧版本检查报告/)).toBeInTheDocument();
    expect(screen.getByText(/已隐藏 1 条旧版本修订建议/)).toBeInTheDocument();
    expect(screen.queryByText("旧版本问题不应操作当前正文")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "接受修订" })).not.toBeInTheDocument();
  });
});
