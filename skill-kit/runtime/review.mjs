import { readConfig, listChapters, readChapter } from "./project.mjs";
import { knowledgeCoverage, retrieveKnowledge } from "./knowledge.mjs";
import { listReaderPromises, readerPromiseHealth } from "./story.mjs";

export function reviewOpening(root, options = {}) {
  const chapters = listChapters(root).slice(0, Number(options.chapterCount ?? 3));
  const analyzed = chapters.map((chapter) => {
    const full = readChapter(root, chapter.chapter_index);
    return analyzeChapter(full?.content ?? "", Number(chapter.chapter_index), chapter.title);
  });
  const aggregate = {
    characterCount: analyzed.reduce((sum, item) => sum + item.metrics.characterCount, 0),
    paragraphCount: analyzed.reduce((sum, item) => sum + item.metrics.paragraphCount, 0),
    longParagraphCount: analyzed.reduce((sum, item) => sum + item.metrics.longParagraphCount, 0),
    expositionRunCount: analyzed.reduce((sum, item) => sum + item.metrics.expositionRunCount, 0),
    repeatedParagraphCount: analyzed.reduce((sum, item) => sum + item.metrics.repeatedParagraphCount, 0),
  };
  const issues = analyzed.flatMap((item) => item.signals.filter((signal) => signal.risk).map((signal) => ({
    code: signal.code,
    severity: signal.severity,
    sourceType: "chapterflow_signal",
    title: signal.label,
    detail: signal.explanation,
    locations: signal.locations,
    evidence: [`value=${signal.value}`, ...(signal.threshold === null ? [] : [`threshold=${signal.threshold}`])],
  })));
  return {
    scope: `opening-${chapters.length}`,
    analyzedAt: new Date().toISOString(),
    chapterCount: chapters.length,
    aggregate,
    chapters: analyzed,
    issues,
    officialGuidance: retrieveKnowledge({ stage: "opening", limit: 8 }),
    note: "Deterministic signals are review prompts, not a platform score or signing prediction.",
  };
}

export function reviewSigning(root) {
  const config = readConfig(root);
  const chapters = listChapters(root);
  const opening = reviewOpening(root, { chapterCount: 3 });
  const blockers = [];
  const highRisk = [];
  const improvements = [];
  const observations = [];

  if (!config.positioning) blockers.push(issue("positioning_missing", "还没有确认作品定位", "先完成作品定位，再检查包装和开篇是否兑现同一承诺。"));
  if (!config.storyEngine) blockers.push(issue("story_engine_missing", "故事发动机还没有确认", "补齐主角、核心机制、主要阻力和第一阶段冲突。"));
  if (!config.packaging) highRisk.push(issue("packaging_missing", "还没有确认正式包装", "确认书名、简介和标签，并让它们与正文卖点一致。"));
  if (!config.openingBlueprint) blockers.push(issue("opening_blueprint_missing", "还没有开篇蓝图", "先规划前三章的行动、冲突、期待、回收和章尾变化。"));
  if (chapters.length < 3) blockers.push(issue("opening_manuscript_missing", "开篇正文不足三章", `当前只有 ${chapters.length} 章可读取正文。`));

  const empty = chapters.slice(0, 3).filter((chapter) => !stripHeading(readChapter(root, chapter.chapter_index)?.content ?? "").trim());
  if (empty.length) blockers.push(issue("empty_chapters", "开篇存在空章节", empty.map((item) => `第${item.chapter_index}章 ${item.title}`).join("；")));

  for (const signalIssue of opening.issues) {
    highRisk.push({
      code: `opening.${signalIssue.code}`,
      title: signalIssue.title,
      detail: signalIssue.detail,
      locations: signalIssue.locations,
      sourceType: signalIssue.sourceType,
    });
  }

  const promises = listReaderPromises(root, "open");
  const health = readerPromiseHealth(root, chapters.at(-1)?.chapter_index ?? 0);
  if (health.longUnadvancedCount > 0) {
    improvements.push(issue("reader_promise_stale", `${health.longUnadvancedCount} 个读者期待较久未推进`, "回看是否需要推进、兑现或明确放弃。"));
  }
  if (health.overloaded) {
    improvements.push(issue("reader_promise_overload", "当前打开的读者期待偏多", `当前有 ${health.openCount} 个未兑现期待，建议检查是否分散主线注意力。`));
  }
  if (promises.length === 0 && chapters.length >= 1) {
    observations.push(issue("reader_promise_absent", "尚未记录读者期待", "这不是提交阻断项，但记录 Reader Promise 有助于后续章节持续推进。"));
  }

  const knowledge = knowledgeCoverage();
  const signingSources = knowledge.sources.filter((source) => source.stages.includes("readiness"));
  const officialStatus = signingSources.length
    ? {
        status: "available",
        knowledgeVersion: knowledge.version,
        latestPublishedAt: signingSources.map((source) => source.publishedAt).sort().at(-1),
        sources: signingSources,
        note: "提交前仍应打开官方页面核对当前有效要求。",
      }
    : {
        status: "unconfirmed",
        knowledgeVersion: knowledge.version,
        latestPublishedAt: null,
        sources: [],
        note: "当前没有可用的签约来源；不要把本地判断当作官方要求。",
      };

  return {
    status: blockers.length ? "blocked" : highRisk.length ? "needs_review" : "prepared",
    generatedAt: new Date().toISOString(),
    blockers,
    highRisk,
    improvements,
    observations,
    officialStatus,
    officialGuidance: retrieveKnowledge({ stage: "readiness", limit: 8 }),
    note: "This is signing preparation review, not a prediction or guarantee of platform approval.",
  };
}

export function analyzeChapter(content, chapterIndex = 1, title = "") {
  const text = stripHeading(String(content ?? "")).trim();
  const paragraphs = text.split(/\n\s*\n|\r?\n/u).map((item) => item.trim()).filter(Boolean);
  const characterCount = [...text].filter((char) => !/\s/u.test(char)).length;
  const dialogueCharacterCount = [...text.matchAll(/[“「『"]([^”」』"]*)[”」』"]/gu)].map((match) => match[1] ?? "").join("").length;
  const longParagraphIndices = paragraphs.map((paragraph, index) => [...paragraph].length >= 400 ? index : -1).filter((index) => index >= 0);
  const expositionMatches = [...text.matchAll(/(?:因为|所谓|也就是说|简单来说|在这个世界|历史上|众所周知|原来|其实)[^。！？!?]{45,}/gu)];
  const namedPersonMatches = [...text.matchAll(/[\p{Script=Han}A-Za-z·]{2,8}(?=(?:说|问|喊|看着|盯着|回答|皱眉|笑))/gu)];
  const properNounMatches = [...text.matchAll(/(?:“[^”]{1,20}”|[A-Z][A-Za-z]{1,20}|[\p{Script=Han}]{2,8}(?:门|城|宗|府|局|集团|公司|学院|计划|系统))/gu)];
  const normalized = paragraphs.map((paragraph) => paragraph.replace(/\s+/gu, "").toLocaleLowerCase());
  const repeatedIndices = normalized.map((paragraph, index) => paragraph.length > 20 && normalized.indexOf(paragraph) !== index ? index : -1).filter((index) => index >= 0);
  const metrics = {
    characterCount,
    paragraphCount: paragraphs.length,
    dialogueRatio: characterCount ? round(dialogueCharacterCount / characterCount) : 0,
    longParagraphCount: longParagraphIndices.length,
    longParagraphRate: paragraphs.length ? round(longParagraphIndices.length / paragraphs.length) : 0,
    namedPersonDensity: paragraphs.length ? round(namedPersonMatches.length / paragraphs.length) : 0,
    properNounDensity: paragraphs.length ? round(properNounMatches.length / paragraphs.length) : 0,
    expositionRunCount: expositionMatches.length,
    repeatedParagraphCount: repeatedIndices.length,
  };
  const prefix = `第 ${chapterIndex} 章${title ? `《${title}》` : ""}`;
  const signals = [
    signal("long_paragraphs", "长段落集中", metrics.longParagraphRate, 0.35, metrics.longParagraphRate > 0.35, "warning", "开篇长段落集中时容易同时承载过多解释，建议回看是否能通过行动、对话或场景拆分。", longParagraphIndices.map((index) => `${prefix} · 第 ${index + 1} 段`)),
    signal("character_load", "人物出现密度偏高", metrics.namedPersonDensity, 1.5, metrics.namedPersonDensity > 1.5, "warning", "这是认知负载信号，不等于人物数量硬规则。", matchLocations(text, paragraphs, namedPersonMatches, prefix)),
    signal("proper_noun_load", "专有名词密度偏高", metrics.properNounDensity, 1.2, metrics.properNounDensity > 1.2, "suggestion", "专有名词集中出现时建议检查读者是否有足够上下文抓手。", matchLocations(text, paragraphs, properNounMatches, prefix)),
    signal("exposition_runs", "连续解释段", metrics.expositionRunCount, 2, metrics.expositionRunCount >= 2, "warning", "连续背景解释可能拖慢开篇进入行动和冲突的速度。", matchLocations(text, paragraphs, expositionMatches, prefix)),
    signal("repeated_paragraphs", "重复段落", metrics.repeatedParagraphCount, 1, metrics.repeatedParagraphCount >= 1, "warning", "检测到完全或近完全重复的段落位置，请检查是否误复制或机械重复。", repeatedIndices.map((index) => `${prefix} · 第 ${index + 1} 段`)),
  ];
  return { chapterIndex, title, metrics, signals };
}

function matchLocations(text, paragraphs, matches, prefix) {
  const starts = [];
  let cursor = 0;
  for (const paragraph of paragraphs) {
    const start = text.indexOf(paragraph, cursor);
    starts.push(start >= 0 ? start : cursor);
    cursor = Math.max(cursor, start >= 0 ? start + paragraph.length : cursor);
  }
  const indices = matches.map((match) => {
    const offset = match.index ?? 0;
    let best = 0;
    for (let i = 0; i < starts.length; i += 1) {
      if (starts[i] <= offset) best = i;
      else break;
    }
    return best;
  });
  return [...new Set(indices)].map((index) => `${prefix} · 第 ${index + 1} 段`);
}

function signal(code, label, value, threshold, risk, severity, explanation, locations) {
  return { code, label, value, threshold, risk, severity, explanation, locations };
}
function issue(code, title, detail) {
  return { code, title, detail, sourceType: "chapterflow" };
}
function stripHeading(value) {
  return String(value ?? "").replace(/^#\s+.*(?:\r?\n)+/u, "");
}
function round(value) {
  return Math.round(value * 1000) / 1000;
}
