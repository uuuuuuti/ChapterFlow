export const chapterActions = [
  { label: "续写", instruction: "" },
  {
    label: "重写",
    instruction:
      "保留事实、人物立场与叙事视角，重新组织这段正文，使表达更自然。",
  },
  {
    label: "扩写",
    instruction:
      "保留原有情节，增加有意义的动作、感官细节和人物反应，避免重复与灌水。",
  },
  {
    label: "压缩",
    instruction: "压缩重复解释与冗余修饰，保留关键情节、线索、人物声音。",
  },
  {
    label: "优化对话",
    instruction:
      "优化对话，让措辞符合人物身份，增加潜台词，减少说教与信息灌输。",
  },
  {
    label: "加强冲突",
    instruction:
      "在不改变既有设定的前提下，明确双方目标和阻碍，加强人物之间的冲突。",
  },
  {
    label: "加强爽点",
    instruction:
      "加强主角行动带来的回报和情绪释放，让反差与兑现更清楚，避免无依据地提升能力。",
  },
  {
    label: "加强悬念",
    instruction:
      "强化未解决的问题、紧迫感与章尾阅读动力，不新增违反既有事实的设定。",
  },
  {
    label: "去 AI 味",
    instruction:
      "去掉套话、泛泛总结、重复比喻和机械排比，用具体行动表达情绪，保留作者风格。",
  },
] as const;
export const selectionActions = [
  {
    label: "润色",
    instruction: "保留含义与叙事视角，润色所选文字，让语言自然准确。",
  },
  { label: "扩写", instruction: chapterActions[2].instruction },
  {
    label: "更霸气",
    instruction:
      "保持人物设定，用更简洁有力的动作和台词增强压迫感，避免空泛形容。",
  },
  {
    label: "更克制",
    instruction: "减少直白的情绪形容，用动作、停顿与潜台词克制地表达。",
  },
  { label: "优化对话", instruction: chapterActions[4].instruction },
];
