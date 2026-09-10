import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectExport } from "../src/shared/api/delivery";
import { inspectExportArtifact } from "../src/pages/publish/publish-page";
import { setDriverOverride } from "../src/kernel/transport";
import JSZip from "jszip";

describe("原生发布导出上下文", () => {
  afterEach(() => {
    setDriverOverride(null);
    vi.unstubAllGlobals();
  });

  it("把版本模式和章节范围完整传给导出 API", async () => {
    setDriverOverride("server");
    const fetchMock = vi.fn(async () =>
      new Response(new Blob(["第2章正文"]), {
        status: 200,
        headers: {
          "content-disposition": "attachment; filename*=UTF-8''range.md",
          "x-export-batch-id": "batch-range-1",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const exported = await getProjectExport("book-1", "markdown", {
      versionMode: "history",
      includeAnnotations: true,
      includeRuns: false,
      fromOutlineNodeId: "chapter-2",
      toOutlineNodeId: "chapter-4",
    });

    const [[input]] = fetchMock.mock.calls;
    const url = new URL(String(input), "http://chapterflow.test");
    expect(url.pathname).toBe("/api/projects/book-1/exports/markdown");
    expect(url.searchParams.get("versionMode")).toBe("history");
    expect(url.searchParams.get("includeAnnotations")).toBe("true");
    expect(url.searchParams.get("fromOutlineNodeId")).toBe("chapter-2");
    expect(url.searchParams.get("toOutlineNodeId")).toBe("chapter-4");
    expect(exported.exportBatchId).toBe("batch-range-1");
  });

  it("重试导出时携带失败批次来源", async () => {
    setDriverOverride("server");
    const fetchMock = vi.fn(async () =>
      new Response(new Blob(["重试后的正文"]), {
        status: 200,
        headers: {
          "content-disposition": "attachment; filename*=UTF-8''retry.md",
          "x-export-batch-id": "batch-retry-1",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getProjectExport("book-1", "markdown", {
      versionMode: "current",
      includeAnnotations: false,
      includeRuns: false,
      retryOfBatchId: "batch-failed-1",
    });

    const [[input]] = fetchMock.mock.calls;
    const url = new URL(String(input), "http://chapterflow.test");
    expect(url.searchParams.get("retryOfBatchId")).toBe("batch-failed-1");
  });

  it("在浏览器端检查 DOCX 核心文件和正文段落", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("_rels/.rels", "<Relationships/>");
    zip.file("docProps/core.xml", "<coreProperties/>");
    zip.file("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>第一段</w:t></w:r></w:p></w:body></w:document>");
    const blob = new Blob([await zip.generateAsync({ type: "uint8array" })]);

    await expect(inspectExportArtifact("docx", blob)).resolves.toMatchObject({
      status: "valid",
      summary: "DOCX 结构完整",
      checks: expect.arrayContaining([
        expect.objectContaining({ label: "DOCX 核心文件", status: "pass" }),
        expect.objectContaining({ label: "正文段落", status: "pass", detail: expect.stringContaining("1 个段落") }),
      ]),
    });
  });

  it("在 EPUB 预览中校验容器、章节顺序和导航", async () => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip");
    zip.file("META-INF/container.xml", '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
    zip.file("OEBPS/content.opf", '<package><manifest><item id="nav" href="nav.xhtml" properties="nav"/><item id="chapter-1" href="chapter-1.xhtml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>');
    zip.file("OEBPS/nav.xhtml", "<nav/>");
    zip.file("OEBPS/chapter-1.xhtml", "<h1>第一章</h1>");
    const blob = new Blob([await zip.generateAsync({ type: "uint8array" })]);

    const preview = await inspectExportArtifact("epub", blob);
    expect(preview.status).toBe("valid");
    expect(preview.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "EPUB 容器", status: "pass" }),
      expect.objectContaining({ label: "章节顺序", status: "pass", detail: expect.stringContaining("1 个章节") }),
      expect.objectContaining({ label: "导航目录", status: "pass" }),
    ]));
  });
});
