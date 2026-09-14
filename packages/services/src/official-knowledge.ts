import {
  sha256Hex,
  type KnowledgeCard,
  type OfficialSource,
} from "@narralume/domain";
import {
  SqliteOfficialKnowledgeRepository,
  type NarrativeDatabase,
} from "@narralume/persistence";

/**
 * Small, reviewable V0.1 seed set.  These are metadata and distilled cards,
 * not a scraped article cache.  Every card points back to an official
 * fanqienovel.com source and is only used as guidance or a review signal.
 */
const SEED_SOURCES = [
  {
    key: "fanqienovel.signing-standard",
    title: "番茄小说作品签约标准说明",
    url: "https://fanqienovel.com/writer/zone/article/7682623843273277464",
    sourceType: "signing" as const,
    publishedAt: "2026-09-07T03:05:31.000Z",
    authorityType: "OFFICIAL_RULE" as const,
    stages: ["positioning", "packaging", "opening", "readiness"],
    summary: "官方签约标准页面，包含内容合规、优质内容评估和签约评估说明。",
    version: "2026-09-07",
  },
  {
    key: "fanqienovel.writer-notices",
    title: "番茄小说作家专区公告",
    url: "https://fanqienovel.com/writer/zone/notice",
    sourceType: "governance" as const,
    publishedAt: "2026-09-09T00:00:00.000Z",
    authorityType: "OFFICIAL_RULE" as const,
    stages: ["opening", "writing", "readiness"],
    summary: "官方作家专区公告索引，用于跟踪低质治理、签约标准和规则更新。",
    version: "2026-09-09",
  },
  {
    key: "fanqienovel.story-basics",
    title: "零基础写作速览：新手如何写一个好故事（上）",
    url: "https://fanqienovel.com/writer/zone/article/7407742604059623448",
    sourceType: "official_course" as const,
    publishedAt: "2026-08-14T00:00:00.000Z",
    authorityType: "OFFICIAL_TUTORIAL" as const,
    stages: ["direction", "positioning", "story_engine"],
    summary:
      "官方课程围绕题材、灵感、主角特征、主角目标、冲突和个人写作标签展开。",
    version: "2026-08-14",
  },
  {
    key: "fanqienovel.tag-guide",
    title: "速进！作品标签最全讲解来啦！",
    url: "https://fanqienovel.com/writer/zone/article/7617805652965982232",
    sourceType: "tag_guide" as const,
    publishedAt: "2026-03-16T00:00:00.000Z",
    authorityType: "OFFICIAL_GUIDANCE" as const,
    stages: ["packaging"],
    summary:
      "官方作品标签讲解，用于提醒作者让标签与作品内容和读者预期保持一致。",
    version: "2026-03-16",
  },
  {
    key: "fanqienovel.opening-expectation",
    title: "开篇五步走，轻松拿捏读者期待感（下）",
    url: "https://fanqienovel.com/writer/zone/article/7480089164512247832",
    sourceType: "official_course" as const,
    publishedAt: "2026-09-11T00:00:00.000Z",
    authorityType: "OFFICIAL_TUTORIAL" as const,
    stages: ["opening"],
    summary:
      "官方开篇课程谈读者期待，以及人物过多、描写过多、信息解释过密等开篇提醒。",
    version: "2026-09-11",
  },
  {
    key: "fanqienovel.course-map",
    title: "课程太多从哪学起？番茄作家必备课程合集",
    url: "https://fanqienovel.com/writer/zone/article/7668202929941119038",
    sourceType: "official_course" as const,
    publishedAt: "2026-01-01T00:00:00.000Z",
    authorityType: "OFFICIAL_GUIDANCE" as const,
    stages: ["direction", "positioning", "packaging", "opening", "writing"],
    summary:
      "官方课程导航，覆盖平台认知、题材、开书准备、开篇设计、情节和人物等主题。",
    version: "2026-01",
  },
  {
    key: "fanqienovel.outline-guide",
    title: "开书不卡壳？大纲这样写才不崩",
    url: "https://fanqienovel.com/writer/zone/article/7528322925343014936",
    sourceType: "official_course" as const,
    publishedAt: "2025-07-18T00:00:00.000Z",
    authorityType: "OFFICIAL_TUTORIAL" as const,
    stages: ["story_engine", "opening", "writing"],
    summary:
      "官方大纲课程强调目标和定位，并从主题、背景、主线、主角与大纲落地展开。",
    version: "2025-07-18",
  },
  {
    key: "fanqienovel.opening-guide",
    title: "如何写好开篇",
    url: "https://fanqienovel.com/writer/zone/article/7025879668578320398",
    sourceType: "official_course" as const,
    publishedAt: "2021-11-26T00:00:00.000Z",
    authorityType: "OFFICIAL_TUTORIAL" as const,
    stages: ["opening"],
    summary: "官方开篇教学页面，作为开篇结构和读者期待的补充参考。",
    version: "2021-11-26",
  },
  {
    key: "fanqienovel.signing-faq",
    title: "一文搞定签约常见问题，自此签约不迷路！",
    url: "https://fanqienovel.com/writer/zone/article/7645150408599404606",
    sourceType: "help" as const,
    publishedAt: "2026-05-30T00:00:00.000Z",
    authorityType: "OFFICIAL_GUIDANCE" as const,
    stages: ["readiness"],
    summary:
      "官方签约常见问题页面，用于流程提醒；具体时效和规则以当前官方页面为准。",
    version: "2026-05-30",
  },
  {
    key: "fanqienovel.low-quality-feb",
    title: "番茄小说关于整治大规模量产低质内容的公告",
    url: "https://fanqienovel.com/writer/zone/article/7602950185735438398",
    sourceType: "governance" as const,
    publishedAt: "2026-02-04T00:00:00.000Z",
    authorityType: "OFFICIAL_RULE" as const,
    stages: ["writing", "readiness"],
    summary: "官方低质治理公告，用于提示避免机械重复和明显量产化表达。",
    version: "2026-02-04",
  },
  {
    key: "fanqienovel.low-quality-july",
    title: "番茄小说低质治理公告（7月）",
    url: "https://fanqienovel.com/writer/zone/article/7672294500500258840",
    sourceType: "governance" as const,
    publishedAt: "2026-08-10T00:00:00.000Z",
    authorityType: "OFFICIAL_RULE" as const,
    stages: ["writing", "readiness"],
    summary:
      "官方阶段性低质治理公告；仅作为风险提示，不把治理条目转成签约保证。",
    version: "2026-08-10",
  },
] as const;

type SeedSourceKey = (typeof SEED_SOURCES)[number]["key"];

const CARD_DEFINITIONS: readonly {
  id: string;
  title: string;
  principle: string;
  why: string;
  stage: string;
  genres?: readonly string[];
  signals: readonly string[];
  antiPatterns: readonly string[];
  suggestions: readonly string[];
  severity: KnowledgeCard["severity"];
  sources: readonly SeedSourceKey[];
}[] = [
  {
    id: "opening.expectation-and-hook",
    title: "开篇先让读者知道要期待什么",
    principle:
      "开篇需要尽早建立可感知的读者期待，并用具体行动、冲突或信息差承接。",
    why: "期待感是作者可以主动设计和回看的阅读路径，不等同于平台承诺。",
    stage: "opening",
    signals: ["前三章没有清晰的期待", "开头长期停留在背景说明"],
    antiPatterns: [
      "把悬念当成故意不说任何有效信息",
      "连续堆叠设定后才进入行动",
    ],
    suggestions: [
      "把主角当下要做的事写具体",
      "在章节结尾留下可追踪的问题或变化",
    ],
    severity: "suggestion",
    sources: ["fanqienovel.opening-expectation", "fanqienovel.opening-guide"],
  },
  {
    id: "opening.character-load",
    title: "开篇人物和信息不要一次压满",
    principle:
      "人物过多、描写过多、世界信息解释过密时，先回看读者是否有足够抓手。",
    why: "这是官方课程中的开篇提醒，ChapterFlow 只把它转成可定位的回看信号。",
    stage: "opening",
    signals: ["人物名字集中出现", "长段落和连续解释段集中"],
    antiPatterns: ["用角色名单代替人物关系", "开篇用多段百科式说明代替冲突"],
    suggestions: [
      "合并或延后不影响第一章行动的人物",
      "让设定通过主角正在做的事出现",
    ],
    severity: "warning",
    sources: ["fanqienovel.opening-expectation"],
  },
  {
    id: "positioning.goal-conflict",
    title: "定位要能说清主角目标和阻力",
    principle:
      "一句话故事之外，至少明确主角想要什么、谁或什么在阻拦，以及故事靠什么持续推进。",
    why: "目标、冲突和主角是把灵感变成可写长篇骨架的最小组合。",
    stage: "positioning",
    signals: ["主角目标无法用一句话回答", "冲突只有题材标签没有具体阻力"],
    antiPatterns: ["把世界观介绍当成主线", "只写氛围和设定不写选择代价"],
    suggestions: [
      "把目标改写为一个可观察的行动",
      "为阻力补一条会升级的代价或限制",
    ],
    severity: "suggestion",
    sources: ["fanqienovel.story-basics", "fanqienovel.outline-guide"],
  },
  {
    id: "positioning.sustainability",
    title: "开书前检查短中长期空间",
    principle:
      "同时写下短期爽点、中期扩展和长期主线空间，避免只靠一个点子消耗。",
    why: "快速开书的目的不是一次定死全书，而是确认这个方向有继续展开的余地。",
    stage: "positioning",
    signals: ["第一章之外没有下一步", "中长期只能重复同一种冲突"],
    antiPatterns: [
      "用固定数字或所谓平台概率替代判断",
      "把一次灵感直接当成完整大纲",
    ],
    suggestions: [
      "分别写出前三章、第一阶段和长期可变现的读者期待",
      "保留可调整的候选方案",
    ],
    severity: "info",
    sources: ["fanqienovel.story-basics", "fanqienovel.outline-guide"],
  },
  {
    id: "packaging.promise-alignment",
    title: "书名、简介和标签要指向同一个承诺",
    principle: "包装元素应该让读者对题材、主角处境和阅读体验形成一致预期。",
    why: "包装是读者进入作品前的第一层信息，错位会让后续开篇承接变难。",
    stage: "packaging",
    signals: ["标签与简介中的主线不一致", "书名暗示的卖点没有在开篇出现"],
    antiPatterns: ["堆热词代替作品定位", "为了吸引点击承诺正文没有的体验"],
    suggestions: ["从读者期待反推书名和简介", "只保留能被正文兑现的标签"],
    severity: "warning",
    sources: ["fanqienovel.tag-guide", "fanqienovel.signing-standard"],
  },
  {
    id: "story-engine.world-rule",
    title: "机制和世界规则要能推动选择",
    principle:
      "机制不是装饰设定；它应该带来机会、限制或代价，并能制造可持续冲突。",
    why: "能推动主角选择的规则更容易转成章节目标和连续行动。",
    stage: "story_engine",
    signals: ["机制只在介绍中出现", "规则没有代价或边界"],
    antiPatterns: ["关键时刻临时添加无代价能力", "规则说明与实际情节互相矛盾"],
    suggestions: [
      "写一条主角能利用的优势和一条必须承担的代价",
      "把规则验证放进第一个冲突",
    ],
    severity: "suggestion",
    sources: ["fanqienovel.story-basics", "fanqienovel.outline-guide"],
  },
  {
    id: "opening.promise-payoff",
    title: "开篇承诺要安排可见的推进和回收",
    principle: "前三章至少记录读者期待、推进动作和阶段性回收，避免只开不推。",
    why: "承诺操作能让作者看见开篇在做什么，属于 ChapterFlow 工作方法，不是官方硬性章数规则。",
    stage: "opening",
    signals: ["承诺只有提出没有推进", "章节结尾没有新的变化"],
    antiPatterns: ["把前三章当成固定合格线", "用标签或分数替代正文回看"],
    suggestions: ["为每章写一个期待和一个变化", "把未回收承诺放进后续章节计划"],
    severity: "suggestion",
    sources: ["fanqienovel.opening-expectation", "fanqienovel.outline-guide"],
  },
  {
    id: "writing.originality-signal",
    title: "留意重复和量产化表达风险",
    principle: "重复段落、模板化句式和缺少具体行动时，先作为风险信号回看文本。",
    why: "官方治理公告关注低质和大规模量产风险；本卡不把启发式检测当作官方结论。",
    stage: "writing",
    signals: ["重复段落", "连续章节使用同一模板动作", "人物和场景缺少具体差异"],
    antiPatterns: ["按检测结果批量改写整章", "把风险提示理解为作品一定违规"],
    suggestions: [
      "点击原文定位重复位置",
      "保留作者判断，只修改确认有问题的表达",
    ],
    severity: "warning",
    sources: ["fanqienovel.low-quality-feb", "fanqienovel.low-quality-july"],
  },
  {
    id: "readiness.current-rule",
    title: "提交前以当前官方规则为准",
    principle:
      "准备提交前检查合规、内容质量和当前页面要求；知识未确认时明确标注。",
    why: "官方规则会更新，ChapterFlow 不应该把历史页面或固定数字写成永久承诺。",
    stage: "readiness",
    signals: [
      "作品资料不完整",
      "使用了无法核对的旧规则",
      "只凭工具提示判断能否签约",
    ],
    antiPatterns: ["显示签约概率或官方评分", "把预检结果写成签约保证"],
    suggestions: ["打开来源页面核对最新要求", "把待确认项处理后再决定是否提交"],
    severity: "warning",
    sources: [
      "fanqienovel.signing-standard",
      "fanqienovel.signing-faq",
      "fanqienovel.writer-notices",
    ],
  },
  {
    id: "direction.reader-and-tag",
    title: "先确定题材、读者和核心情绪",
    principle: "开书方向至少留下题材、目标读者和想持续提供的核心阅读体验。",
    why: "这三项能帮助后续定位、包装和开篇互相校准。",
    stage: "direction",
    signals: ["题材和读者完全空白", "想提供的阅读体验前后不一致"],
    antiPatterns: [
      "把热门题材直接当成自己的方向",
      "只写类别不写读者为什么追更",
    ],
    suggestions: [
      "用自己的话描述读者会因为什么继续读",
      "保留两到三个方向候选再选择",
    ],
    severity: "info",
    sources: ["fanqienovel.story-basics", "fanqienovel.course-map"],
  },
  {
    id: "opening.pov-stability",
    title: "开篇回看视角是否稳定",
    principle:
      "视角切换应该服务于信息和情绪，不要让读者在开篇频繁重新确认自己跟着谁。",
    why: "视角稳定是开篇可读性的编辑观察项，不是平台硬性门槛。",
    stage: "opening",
    signals: ["视角提示词频繁切换", "同一段落内信息来源不清"],
    antiPatterns: ["为了隐藏信息随意切换视角", "用全知解释替代角色行动"],
    suggestions: [
      "标出前三章每段的观察者",
      "只有在信息收益明确时切换场景或视角",
    ],
    severity: "suggestion",
    sources: ["fanqienovel.opening-expectation", "fanqienovel.opening-guide"],
  },
] as const;

export function seedOfficialKnowledge(
  database: NarrativeDatabase,
  now = new Date().toISOString(),
): { sources: number; cards: number } {
  const repository = new SqliteOfficialKnowledgeRepository(database);
  const sourceByKey = new Map<SeedSourceKey, OfficialSource>();
  database.transaction(() => {
    for (const definition of SEED_SOURCES) {
      const source: OfficialSource = {
        id: `official-source:${definition.key}`,
        sourceKey: definition.key,
        platform: "fanqienovel",
        url: definition.url,
        title: definition.title,
        sourceType: definition.sourceType,
        publishedAt: definition.publishedAt,
        retrievedAt: now,
        contentHash: sha256Hex(
          `${definition.url}\0${definition.summary}\0${definition.version}`,
        ),
        status: "ACTIVE",
        applicableStages: [...definition.stages],
        applicableGenres: [],
        authorityType: definition.authorityType,
        summary: definition.summary,
        sourceVersion: definition.version,
        createdAt: now,
        updatedAt: now,
      };
      const inserted = repository.insertSource(source);
      sourceByKey.set(definition.key, inserted);
    }
    for (const definition of CARD_DEFINITIONS) {
      const sourceRefs = definition.sources.map((key) => {
        const source = sourceByKey.get(key);
        if (!source)
          throw new Error(`Missing official knowledge seed source: ${key}`);
        return {
          sourceId: source.id,
          sourceKey: source.sourceKey,
          sourceVersion: source.sourceVersion,
          title: source.title,
          url: source.url,
        };
      });
      repository.insertCard({
        id: `knowledge-card:${definition.id}`,
        title: definition.title,
        principle: definition.principle,
        why: definition.why,
        applicableStage: definition.stage,
        applicableGenres: [...(definition.genres ?? [])],
        signals: [...definition.signals],
        antiPatterns: [...definition.antiPatterns],
        suggestions: [...definition.suggestions],
        severity: definition.severity,
        sourceRefs,
        confidence: 0.9,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
    }
  });
  return {
    sources: repository.listSources().length,
    cards: repository.listCards({ status: "ACTIVE", limit: 500 }).length,
  };
}

export const officialKnowledgeSeedSummary = {
  sourceCount: SEED_SOURCES.length,
  cardCount: CARD_DEFINITIONS.length,
  platform: "fanqienovel.com",
} as const;
