/**
 * Compatibility export for the old Settings workspace. The implementation is
 * shared with ChapterFlow's native advanced tools so the old shell cannot
 * diverge from the migrated production-asset behavior.
 */
export {
  AgentSkillManager,
  ImportManager,
  ProductionTools,
  SkillManager,
  StyleManager,
} from "../../features/production-tools/production-tools";
