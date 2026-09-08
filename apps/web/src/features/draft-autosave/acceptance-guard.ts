import { getStudioDocument } from "../../shared/api/writing";
/** An old AI result must never clear a newer autosaved author draft. */
export async function requireUnchangedDraft(
  projectId: string,
  documentId: string,
) {
  const latest = await getStudioDocument(projectId, documentId);
  if (
    latest.draft &&
    latest.draft.content !== (latest.currentVersion?.content ?? "")
  )
    throw new Error(
      "正文已在 AI 生成后修改。当前稿件已保留，请放弃旧建议后重新生成。",
    );
  return latest;
}
