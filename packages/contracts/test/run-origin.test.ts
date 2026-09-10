import { describe, expect, it } from "vitest";

import { RunOriginSchema } from "../src/index.js";

describe("run origin context", () => {
  it("keeps native document, outline, version, selection and check context together", () => {
    const parsed = RunOriginSchema.parse({
      surface: "opening-check",
      documentId: "document-1",
      outlineNodeId: "chapter-1",
      sessionId: "session-1",
      branchId: "branch-1",
      versionId: "version-2",
      selection: { start: 12, end: 44 },
      checkIssueId: "issue-1",
      checkReportId: "report-1",
      checkReportGeneratedAt: "2026-09-09T10:00:00.000Z",
      checkDocumentVersionId: "version-2",
      canonSpread: "entities",
      returnTo: "/books/book-1/write/document-1?tab=review",
    });

    expect(parsed).toMatchObject({
      surface: "opening-check",
      documentId: "document-1",
      outlineNodeId: "chapter-1",
      versionId: "version-2",
      selection: { start: 12, end: 44 },
      checkIssueId: "issue-1",
      checkReportId: "report-1",
      checkDocumentVersionId: "version-2",
      canonSpread: "entities",
    });
  });

  it("keeps the original minimal origin payload backward compatible", () => {
    expect(RunOriginSchema.parse({ surface: "writing" })).toEqual({
      surface: "writing",
      documentId: null,
      selection: null,
    });
  });
});
