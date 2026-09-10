import type { RunStepKind } from "@narralume/domain";

import type { RunStepSeed } from "./recipe.js";

export interface WebNovelCandidateRecipe {
  name: "web-novel-candidate";
  version: 1;
  steps: readonly RunStepSeed[];
}

export function buildWebNovelCandidateRecipe(
  runId: string,
): WebNovelCandidateRecipe {
  const definitions: readonly [string, RunStepKind, number][] = [
    ["context", "webnovel.context", 1],
    ["candidate", "webnovel.candidate", 5],
    ["stage", "webnovel.stage", 1],
  ];
  return {
    name: "web-novel-candidate",
    version: 1,
    steps: definitions.map(([key, kind, maxAttempts], ordinal) => ({
      id: `${runId}:${key}`,
      ordinal,
      kind,
      cycle: 0,
      idempotencyKey: `${runId}/${key}`,
      maxAttempts,
    })),
  };
}
