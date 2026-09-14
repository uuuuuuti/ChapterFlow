import type { RunStepKind } from "@narralume/domain";

import type { RunStepSeed } from "./recipe.js";

export interface SigningSprintRecipe {
  name: "signing-sprint-ai";
  version: number;
  steps: readonly RunStepSeed[];
}

export function buildSigningSprintRecipe(runId: string): SigningSprintRecipe {
  const steps: RunStepSeed[] = [];
  const append = (
    key: string,
    kind: RunStepKind,
    maxAttempts: number,
  ): void => {
    steps.push({
      id: `${runId}:${key}`,
      ordinal: steps.length,
      kind,
      cycle: 0,
      idempotencyKey: `${runId}/${key}`,
      maxAttempts,
    });
  };
  append("context", "sprint.context", 2);
  append("generate", "sprint.generate", 5);
  append("stage", "sprint.stage", 1);
  return { name: "signing-sprint-ai", version: 1, steps };
}
