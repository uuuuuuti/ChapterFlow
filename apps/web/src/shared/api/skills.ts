import {
  type StyleProfile,
  type BackgroundRunCreated,
  type WritingSkill,
  type WritingSkillScope,
  type WritingSkillValidation,
} from "./types";
import { requestJson, jsonRequest, requestVoid, requestBlob } from "./client";
import { type ImportedAgentSkillDto } from "@narralume/contracts";

export async function getStyleProfiles(
  projectId: string,
  signal?: AbortSignal,
): Promise<StyleProfile[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/styles`,
    signal ? { signal } : {},
  );
}

export async function createStyleProfile(
  projectId: string,
  input: Pick<
    StyleProfile,
    "name" | "description" | "rules" | "examples" | "negativeRules" | "active"
  >,
): Promise<StyleProfile> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/styles`,
    jsonRequest("POST", input),
  );
}

export async function updateStyleProfile(
  profile: StyleProfile,
  patch: Partial<
    Pick<
      StyleProfile,
      | "name"
      | "description"
      | "rules"
      | "examples"
      | "negativeRules"
      | "active"
      | "status"
    >
  >,
): Promise<StyleProfile> {
  const next = { ...profile, ...patch };
  return requestJson(
    `/api/styles/${encodeURIComponent(profile.id)}`,
    jsonRequest("PUT", {
      name: next.name,
      description: next.description,
      rules: next.rules,
      examples: next.examples,
      negativeRules: next.negativeRules,
      active: next.active,
      status: next.status,
      expectedVersion: profile.version,
    }),
  );
}

export async function extractStyleProfile(
  projectId: string,
  input: { requestId: string; text: string },
): Promise<BackgroundRunCreated> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/styles/extract`,
    jsonRequest("POST", input),
  );
}

export async function getWritingSkills(
  projectId: string,
  signal?: AbortSignal,
): Promise<WritingSkill[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/writing-skills`,
    signal ? { signal } : {},
  );
}

export async function createWritingSkill(
  projectId: string,
  input: Pick<
    WritingSkill,
    "name" | "description" | "instructions" | "scopes" | "priority" | "enabled"
  >,
): Promise<WritingSkill> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/writing-skills`,
    jsonRequest("POST", input),
  );
}

export async function updateWritingSkill(
  skill: WritingSkill,
  patch: Partial<
    Pick<
      WritingSkill,
      | "name"
      | "description"
      | "instructions"
      | "scopes"
      | "priority"
      | "enabled"
    >
  >,
): Promise<WritingSkill> {
  const next = { ...skill, ...patch };
  return requestJson(
    `/api/writing-skills/${encodeURIComponent(skill.id)}`,
    jsonRequest("PUT", {
      name: next.name,
      description: next.description,
      instructions: next.instructions,
      scopes: next.scopes,
      priority: next.priority,
      enabled: next.enabled,
      expectedVersion: skill.version,
    }),
  );
}

export async function deleteWritingSkill(skillId: string): Promise<void> {
  return requestVoid(
    `/api/writing-skills/${encodeURIComponent(skillId)}`,
    jsonRequest("DELETE", {}),
  );
}

export async function importWritingSkillPackage(
  projectId: string,
  input: { filename: string; contentBase64: string },
): Promise<{
  skill: WritingSkill;
  references: {
    id: string;
    skillId: string;
    path: string;
    content: string;
    contentHash: string;
    createdAt: string;
  }[];
}> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/writing-skills/import`,
    jsonRequest("POST", input),
  );
}

export async function validateWritingSkill(
  skillId: string,
  scope: WritingSkillScope,
): Promise<WritingSkillValidation> {
  return requestJson(
    `/api/writing-skills/${encodeURIComponent(skillId)}/validate`,
    jsonRequest("POST", { scope }),
  );
}

export async function getWritingSkillPackage(
  skillId: string,
): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename } = await requestBlob(
    `/api/writing-skills/${encodeURIComponent(skillId)}/package`,
  );
  return { blob, filename: filename ?? "writing-skill.skill.zip" };
}

export async function downloadLibraryDatabase(): Promise<{
  blob: Blob;
  filename: string | null;
}> {
  return requestBlob("/api/system/database-download");
}

export async function getAgentSkills(
  projectId: string,
  signal?: AbortSignal,
): Promise<ImportedAgentSkillDto[]> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/agent-skills`,
    signal ? { signal } : {},
  );
}

export async function importAgentSkillPackage(
  projectId: string,
  input: { filename: string; contentBase64: string },
): Promise<ImportedAgentSkillDto> {
  return requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/agent-skills/import`,
    jsonRequest("POST", input),
  );
}

export async function setAgentSkillEnabled(
  skill: ImportedAgentSkillDto,
  enabled: boolean,
): Promise<ImportedAgentSkillDto> {
  return requestJson(
    `/api/agent-skills/${encodeURIComponent(skill.id)}/enabled`,
    jsonRequest("POST", { enabled, expectedUpdatedAt: skill.updatedAt }),
  );
}

export async function deleteAgentSkill(skillId: string): Promise<void> {
  return requestVoid(`/api/agent-skills/${encodeURIComponent(skillId)}`, {
    method: "DELETE",
  });
}
