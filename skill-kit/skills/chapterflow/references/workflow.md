# 全流程操作契约

## 项目与恢复

通过 project_summary 确认项目根目录、进度与版本；外部 Markdown 编辑后 project_sync。读取 candidate_list 保留尚未确认的选择。context(task=...,chapterIndex=...) 提供前文节选、目标章正文、正式规划及故事状态；改写旧章还要单独读受影响后续章。

## 正式产物

candidate_stage 的 kind 与 payload：

| kind              | 核心字段                                                                                        | 确认效果                              |
| ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| book_positioning  | oneLineStory, coreIdea, readerProfile, protagonistDesire, coreConflict, longTermExpectation     | 保存定位                              |
| story_engine      | protagonist；建议包含 antagonist, mechanism, mechanismCost, relationships, worldRules, conflict | 保存发动机；实体关系需另行确认记录    |
| packaging         | selected: {title, description, tags}                                                            | 保存选中包装，同步作品标题与简介      |
| opening_blueprint | firstThreeChapters（3项）；可加 firstArcChapters 与第一弧目标                                   | 保存开篇蓝图                          |
| story_plan        | arcs?: [{id,title,goal,conflict,payoff}], chapters: [{index,title,goal,conflict,outcome,...}]   | 按弧 ID、章节序号合并；同一章完整替换 |
| chapter_draft     | index, title, content                                                                           | 写入正式 Markdown 并索引              |

用 candidate_decide(candidateId,action=accept/reject) 决定。候选过期时重新读上下文并比较变化；不要强行接受或直接覆盖文件。原有正式章节改标题的重命名限制仍适用。Runtime 使用文件和 SQLite 两层存储；不要声称跨文件并发事务完全隔离。并行写同一作品前应串行协调。

## 章节循环

目标章规划 → 场景草案 → 正文候选 → 自检/编辑审稿 → 作者确认 → 正式正文 → 按真实事件维护实体、关系、时间线、伏笔、期待 → 下一章。

每次事实更新复用现有记录 ID；先查再更新。未来目标是计划，已发生事件是事实，两者不能混用。中断后以正式状态为准，报告已完成与待确认部分。

## 连载与收尾

每弧复盘主线进展、关系变化、能力代价、读者承诺与伏笔债务；只展开接下来需要写的章节。完结检查终局选择、情感/剧情兑现与刻意留白。export 工具生成已确认正文及 hash/version 清单；平台提交、版权授权与平台规则核验不由本地导出替代。

## 可视化选择

默认 workspace 跨视图梳理；单任务可选 character_graph、timeline、promise_board、foreshadow_map、story_map、chapter_health。输出目录中的 HTML 是离线快照，修改后重新生成。新作品空图属于缺少正式数据，应先回到对应创作阶段。
