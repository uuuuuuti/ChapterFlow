/** Deterministic opt-in model used only by ChapterFlow E2E. Never loaded by production. */
export const chapterflowDraft =
  "夜色像一块巨大的幕布，缓缓盖住了海面。\n\n林觉站在灯塔的石阶上。海风带着咸湿的味道，吹乱了他的头发。远处的海平线已经看不见最后一丝余晖，只有乌云在天际翻涌。\n\n他握紧了手中的旧罗盘。指针依旧在轻微地颤抖，仿佛也感受到了即将来临的变化。这座灯塔守护了这片海域上百年，从未熄灭。而今晚，它第一次陷入黑暗。\n\n海浪拍打着礁石，发出沉闷的声响。林觉抬头望向灯塔顶端，灯室里只剩下一把空椅。\n\n门后有人轻轻敲了三下。他没有回头，只把罗盘藏进衣袋。父亲离开前说过，如果灯灭了，千万不要回应陌生人的敲门声。\n\n那声音却叫出了他的名字。";
export function chapterflowStructured(purpose: string): unknown {
  if (purpose === "scene-plan")
    return {
      chapterGoal: "发现灯塔失灯的线索",
      povEntityId: null,
      scenes: [
        {
          title: "灯塔熄灭",
          goal: "寻找失灯原因",
          conflict: "陌生人敲门",
          turn: "对方叫出名字",
          outcome: "发现旧罗盘异常",
          locationId: null,
          participants: [],
          targetCharacters: 1200,
        },
      ],
      continuityRisks: [],
    };
  if (purpose === "selection-edit")
    return {
      replacementText: "海风停了一瞬。他握紧罗盘，没有回头。",
      rationale: "用具体动作表达克制的紧张感。",
      risk: "low",
    };
  if (purpose === "semantic-review")
    return {
      summary: "人物行动与已知设定一致，章尾问题为后续留下空间。",
      scores: {
        continuity: 92,
        pacing: 88,
        character: 90,
        prose: 88,
        goal: 94,
      },
      issues: [],
    };
  if (purpose === "chapter-settlement")
    return {
      summary: "灯塔熄灭，主角听到陌生人的敲门声。",
      stateDelta: [],
      factCandidates: [],
      timelineCandidates: [],
      relationshipCandidates: [],
      foreshadowCandidates: [],
    };
  return null;
}
