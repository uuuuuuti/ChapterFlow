// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "apps/web/src");
const nativeRoots = ["pages", "features", "app", "workspaces"];
const compatibilityFiles = new Set([
  "apps/web/src/app/shell.tsx",
  "apps/web/src/app/workspaces.ts",
  "apps/web/src/app/layouts/chapterflow-shell.tsx",
]);
const legacyPath = /["'`]\/(?:projects(?:\/|\b)|shelf(?:\/|\b)|overview(?:\/|\b)|bible(?:\/|\b)|studio(?:\/|\b)|autopilot(?:\/|\b)|runs(?:\/|\b)|lab(?:\/|\b)|delivery(?:\/|\b))/u;

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/u.test(path) ? [path] : [];
  });
}

describe("native route boundary", () => {
  it("does not introduce old workspace paths in native render trees", () => {
    const violations = nativeRoots.flatMap((root) =>
      sourceFiles(join(sourceRoot, root)).flatMap((path) => {
        if (compatibilityFiles.has(relative(process.cwd(), path))) return [];
          const lines = readFileSync(path, "utf8").split("\n");
          return lines.flatMap((line, index) =>
            legacyPath.test(line)
              ? [`${relative(process.cwd(), path)}:${index + 1}`]
              : [],
          );
        }),
    );
    expect(violations).toEqual([]);
  });
});
