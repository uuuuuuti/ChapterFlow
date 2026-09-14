export type ProductTaskLayer = "primary" | "local" | "assistant";

export function runTaskLayer(recipe: string): ProductTaskLayer {
  if (recipe === "assistant-turn") return "assistant";
  if (
    recipe === "chapter-production" ||
    recipe === "book-foundation" ||
    recipe === "signing-sprint-ai"
  ) {
    return "primary";
  }
  return "local";
}

export function isPrimaryRunRecipe(recipe: string): boolean {
  return runTaskLayer(recipe) === "primary";
}
