import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildViewSpec } from "../runtime/view-spec.mjs";
import { mountWorkbench, workbenchCss } from "./workbench.mjs";

export function renderView(root, type, options = {}) {
  const spec = {
    ...buildViewSpec(root, type, options),
    generatedAt: new Date().toISOString(),
  };
  const outputDir = resolve(root, options.outputDir ?? "outputs");
  mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const path = join(outputDir, `${type}-${stamp}.html`);
  const data = JSON.stringify(spec).replace(/</gu, "\\u003c");
  const title = String(spec.title).replace(
    /[&<>"']/gu,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
  writeFileSync(
    path,
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${workbenchCss}</style></head><body><main><header><h1 id="title"></h1><div id="meta"></div></header><div id="app"></div><noscript>请启用 JavaScript 查看离线交互图表。</noscript></main><script>(${mountWorkbench.toString()})(${data});</script></body></html>`,
    "utf8",
  );
  return { type, title: spec.title, path, spec };
}
