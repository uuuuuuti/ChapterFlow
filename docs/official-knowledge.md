# 官方知识 V0.1

官方知识是快速开书的参考层，不是自动判定器。V0.1 只收录 `fanqienovel.com` 的番茄小说作家专区来源；知识卡保存来源 URL、来源版本、抓取时间、内容哈希、适用阶段、权威类型和状态，模型上下文也会带回这些 provenance。

## 来源范围

当前种子集包含 11 个官方来源，覆盖签约说明、作家专区公告、官方课程、标签讲解、开篇方法、期待感、大纲和签约常见问题等主题。典型入口如下：

- [番茄小说作家专区公告](https://fanqienovel.com/writer/zone/notice)
- [番茄小说作家专区课程](https://fanqienovel.com/writer/zone/tutorial?tab=1)
- [番茄小说作品签约标准说明](https://fanqienovel.com/writer/zone/article/7682623843273277464)
- [番茄小说低质治理公告（7月）](https://fanqienovel.com/writer/zone/article/7672294500500258840)
- [零基础写作速览：新手如何写一个好故事（上）](https://fanqienovel.com/writer/zone/article/7407742604059623448)
- [速进！作品标签最全讲解来啦！](https://fanqienovel.com/writer/zone/article/7617805652965982232)
- [开篇五步走，轻松拿捏读者期待感（下）](https://fanqienovel.com/writer/zone/article/7480089164512247832)
- [课程太多从哪学起？番茄作家必备课程合集](https://fanqienovel.com/writer/zone/article/7668202929941119038)
- [开书不卡壳？大纲这样写才不崩](https://fanqienovel.com/writer/zone/article/7528322925343014936)
- [如何写好开篇](https://fanqienovel.com/writer/zone/article/7025879668578320398)
- [一文搞定签约常见问题，自此签约不迷路！](https://fanqienovel.com/writer/zone/article/7645150408599404606)

具体规则可能随平台更新；产品界面会提示作者以当前官方页面为准。官方教程中的方法性建议会标记为 guidance/tutorial，不会伪装成签约硬门槛。

## 数据结构与状态

`official_sources` 保存来源级元数据，`knowledge_cards` 保存可审阅的结构化卡片。来源类型包括 `platform_rule`、`official_course`、`help`、`signing`、`governance` 和 `tag_guide`；权威类型包括 `OFFICIAL_RULE`、`OFFICIAL_GUIDANCE` 和 `OFFICIAL_TUTORIAL`。

来源状态包括：

- `ACTIVE`：当前允许进入作者和模型上下文。
- `CANDIDATE`：新版本或待审版本，只能供审阅，不自动替换活动版本。
- `OUTDATED` / `SUPERSEDED`：保留历史记录，不作为当前规则依据。
- `DISABLED`：管理员明确停用。
- `FETCH_FAILED`：刷新失败，必须显示数据缺口，不能假装抓取成功。

卡片也有 `ACTIVE`、`CANDIDATE`、`DISABLED` 状态。每张活动卡至少引用一个来源，并记录来源版本和 URL；工作流保存使用过的知识卡引用，保证结果可以回溯。

## 更新与治理

刷新接口只负责生成待审版本和记录 `contentHash`，不会自动激活或批量覆盖旧卡片。管理员确认后，才可以把候选版本激活，并将原版本标为 `OUTDATED` 或 `SUPERSEDED`。发生解析失败、页面不可达或规则含义不确定时，保留旧版本、标出 `FETCH_FAILED`/未确认状态，并要求人工复核。

知识卡只用于：

- 给定位、包装、开篇和签约准备预检提供官方来源提示；
- 帮助作者理解风险、反模式和建议回看位置；
- 让 AI 的说明附带可追溯的来源引用。

知识卡不用于自动投稿、平台审核模拟、签约概率、收益预测或“官方评分”。
