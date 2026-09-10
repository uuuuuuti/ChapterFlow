# ChapterFlow / 文织·网文工坊 V1 验收报告

**当前状态：passed**  
**验收日期：2026-09-10（Asia/Shanghai）**  
**范围：G0—G6 与五章首发材料，不扩展到 V2 共创能力。**

## 1. 启动、模型与安全配置

本地服务已启动并通过 `GET /api/health`：API `http://127.0.0.1:4317`、Web `http://127.0.0.1:4318`，数据库 ready，migration 62。作者入口为：

`http://127.0.0.1:4318/books/a42fb546-6eb4-49fe-b97b-fb23482ce2c7/dashboard`

服务端读取官方 DeepSeek 配置：

- base URL：`https://api.deepseek.com`
- model：`deepseek-v4-flash`
- context window：128000
- max output：8000
- 配置文件：本机已忽略的 `.env.local`；密钥未写入代码、报告、日志或导出稿。

`/api/models` 将环境 Chat 路径的元数据解析为上述精确模型，`/api/assignments` 中 planning/review/writing assignment 均使用该路径。设置页通过真实浏览器执行的四阶段连接测试全部通过：文本、SSE、工具回合、structured JSON。真实生产链路已完成 planning、drafting、review、revision、settlement 调用；run 的 model snapshot 与 context artifact 均保留模型解析证据，未静默替换为 mock 或其他模型。

## 2. 正式故事数据

foundation run `79971fdf-691e-4e56-af0f-be8d8e4838b4` 产出的 `railway_archive_mother` 已采用。定位、读者承诺、主线、高潮、终局、人物/世界/事实/伏笔以及三轮 rolling outline 已保存为正式数据：

- `f5c271f6-0c19-407f-9fc0-a7f460f9bda5`
- `ea7cc16d-03f6-4af6-90b4-27b5c680e173`
- `fd766a7b-0198-4dd0-95b6-75872bd2d722`

10 份章纲均已通过高级工具保存并可刷新读取。每份包含目标、冲突、事件、时间地点、人物、信息揭示、章尾牵引、禁改事实和 2500 字目标；已写章节还绑定了正式正文版本。规划状态保留为规划状态，未将未来章节虚报为已完成。

## 3. 五章正式交付

有效字数统一按去空白后的 Unicode 字符计数。所有数字均来自当前保存版本，标题、标记和思考过程不计入。

| 章节           | 当前版本                                                                           | 有效字符 | SHA-256                                                            | 最终审阅                                                                                           |
| -------------- | ---------------------------------------------------------------------------------- | -------: | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 机房里的审计员 | `5dd7b3ce-025c-4463-903c-68d61db3fdf6`                                             |     3474 | `c75212fc7f90e335d3df131ca09b2a3d7e37a98bd78ada5636677a32134a3ff7` | `4e581820-23e9-4b54-8388-5480b9d52e77` · pass                                                      |
| 陈字班次       | `a3631a65-5fd1-4887-97b4-f3ba02bbc8f3`                                             |     3360 | `c110c5739398a16c80875c232b292588feaf83cbcbb12c212a0d8b01897f863c` | `57276ed0-4f43-4ad5-887b-b81b8305a977` · pass                                                      |
| 低潮时启门     | `revision:ff8a3e6bc8275667801060b270462bae7665554f8afeaebfeaea8e04aa514a2b:commit` |     2212 | `9856b6e3e5d696623f1370c7a4c3fa9c398f644b238ef3e050f07308fd9cb363` | `revision:ff8a3e6bc8275667801060b270462bae7665554f8afeaebfeaea8e04aa514a2b:review:1:report` · pass |
| 雾转瞬间       | `85bd9e07-ef6-465f-bc5f-a85944df167a`                                              |     2905 | `635465ae8ce504e66af7c34cc819e70de0387e4a93f5f6be0e67f8c4232bf4ae` | `20dedc02-700e-4612-85f6-3d9baf5c8170` · pass                                                      |
| 三名未入册者   | `d0455432-a6b6-427f-8f1b-265906c8dd4b`                                             |     2897 | `a26d6cfc0c24b35472bff5389f4aff090eb111d8baa70c6b658256d3052ea79b` | `edb23778-1b93-4817-8d09-b92dd260422f` · pass                                                      |

五章合计 **14848** 有效字符，平均 **2970**；逐章均在 2000—3500 区间。每章都执行了章纲→上下文→草稿→确定性检查→语义审阅→必要修订→复检→正式版本→摘要/事实结算→下一章的服务端 worker 流程。当前最终审阅没有 major/critical 阻断；每章的 minor/info 警告如下，供作者后续处理：

- 机房里的审计员：offline/online 措辞范围、审计揭示节奏、主角反应略被动。
- 陈字班次：碎片记忆与“记不起”的表述、侧扫来源与时点需要更明确。
- 低潮时启门：档案封存月份与路线时间顺序、红章解释略长、短信信息有重复。
- 雾转瞬间：角度与 41 分钟换算的措辞、离线切换过渡、钥匙/房间线索暂未回收。
- 三名未入册者：坐标位数表述、行动口号重复、苏箬背景细节偏薄。

前三章还通过了开篇检查 report `2232aae5-b82d-4142-900c-93bf15eca3d4`：checked 3/10、有效正文 10219、score 92，章纲/钩子/冲突/回收/目标均有绑定。报告提示仍有 9 个高重要度伏笔没有目标或回收章，这是后续创作提醒，不是把问题改成“已解决”。

## 4. 导出与备份

发布页通过浏览器选择了 `机房里的审计员` 到 `三名未入册者` 的当前版本范围，预览确认标题顺序正好五章。已核对本地文件内容、顺序、当前版本 hash：

- [五章 Markdown](../../../data-v1/exports/雾港第七码头-v1-five-chapters.md)：45019 bytes，SHA-256 `57b0a7255f80fd082a658b26c4e01b29521dccc8deafd69695ced91eee6e451c`
- [五章 TXT](../../../data-v1/exports/雾港第七码头-v1-five-chapters.txt)：45000 bytes，SHA-256 `b0b25301511a5631c8b338d1eb870db9e37091d87787161aa1d908e655812c68`

发布页生成的成功 export batch 保留了对应范围和 hash。没有创建第三方平台发布记录；“实际上传”仍由作者完成，不能把本地导出记成已刊登。

最新浏览器备份：

- label：`V1首发五章恢复验证快照`
- backup ID：`ed4ba86b-5486-45c3-b9a8-b4466d7b26e1`
- size：576884 bytes
- bundle hash：`893ed533a7d31a866d5b0bafa219c14e55d459fafe8d99fe26d8bd27698a1c5d`
- 恢复作品：`d6987f4a-3dae-450c-b109-9f1d1ccb3365`

通过发布页的“恢复为新作品”完成恢复；原作品仍可打开，恢复作品 dashboard 显示 10 章、7/10 定稿，恢复后的 reviews API 返回 40 reports、124 issues，证明审阅数据和证据数组可读。备份目录为 `data-v1/backups/`，manifest 与 sqlite 成对存在。

## 5. 连续创作、第六章与故障恢复

五章批次 session `727c1a63-5a4f-4329-84d7-8be9ccde8774` 已完成 5/5。执行过程中保留了失败成果和重试边界，修复过 request ID 超长、二级修订审阅取不到计划血缘、structured-output 截断等真实阻塞；服务重启后启动恢复日志显示过期 lease 重排队、孤儿调用/流中断处理。

第六章续写 session `54101b1e-06d2-4662-8f2b-b38afacd03b0` 通过连续创作页面启动，目标为 1 章、目标 2500、范围 `fd766a7b-0198-4dd0-95b6-75872bd2d722:chapter:0`（《第二版印记》），在浏览器中完成过暂停、刷新、恢复和章纲采用。当前候选有效字符 **2025**，最终语义审阅 pass，但 session 停在 `awaiting_user / chapter_commit_approval_required`，正文没有绕过作者确认自动提交。

## 6. 记录用量与检查

原作品 `/api/projects/<project>/runs` 的项目累计记录（包含真实生成、审阅、失败、重试和人工修订相关 runs）：

- input tokens：4,081,358
- output tokens：887,218
- calls：232
- wall time：8,421,831 ms（约 140.4 分钟）
- cost：`0`，因为当前没有配置单价，不代表“免费”或可推算的商业成本。

已通过的定向检查包括：类型检查；chapter workers、run API、quick-create、execution policy 共 37 tests；backup/restore 回归 2 tests。最后一次项目规定的完整检查也已通过：Prettier、ESLint、typecheck、全量 143 个测试文件/808 个测试、evidence protocol 5/5、499 条依赖 license 记录校验，以及生产构建。

## 7. 剩余限制

- 项目全书当前为 7/10 章定稿，发布页的全书 readiness 因后三章规划态显示 blocked；本次五章导出范围本身已满足交付门槛。
- 开篇检查提示 9 个高重要度伏笔尚未指定回收章；它们应在后续大纲中处理。
- 每章仍有已列出的 minor/info 警告；V1 不以调高模型总分代替证据修订。
- 第六章是待作者确认的候选，不作为五章首发稿的一部分。
- 未上传任何第三方平台，不保证商业成绩或平台审核通过。
- V2 共创能力未在本 Goal 中启动。
