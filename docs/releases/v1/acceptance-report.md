# ChapterFlow / 文织·网文工坊 V1 验收报告

**当前状态：passed（质量面板 `needs_attention`）**

**验收日期：2026-09-13（Asia/Shanghai）**

**范围：G0—G6 与五章首发材料，不扩展到 V2 共创能力。**

## 1. 启动、模型与安全配置

本地服务通过 `GET /api/health`：Web `http://127.0.0.1:4318`、API `http://127.0.0.1:4317`，数据库 ready，migration 62。验收作品入口：

`http://127.0.0.1:4318/books/70e57dbf-4822-4226-b722-235b83c408b2/dashboard`

服务端读取受控且被 Git 忽略的环境配置：

- base URL：`https://api.deepseek.com`
- model：`deepseek-v4-flash`
- context window：`128000`
- max output：`32000`
- 数据目录：`data-v1/`
- 备份目录：`data-v1/backups/`

API key 未写入代码、浏览器存储、报告、日志或导出稿。`/api/providers`、`/api/models` 和 `/api/assignments` 的实际解析结果已写入 [acceptance-manifest.json](../../../data-v1/exports/v1-acceptance/acceptance-manifest.json)：planning、review、writing 均使用 `environment-chat` / `openai-chat`，精确解析到指定模型和官方 base URL。设置页通过真实浏览器执行的文本、SSE、工具、structured JSON 四阶段探针；真实生产 run 快照覆盖 planning、drafting、review、revision、settlement，未以 mock 或其他模型代替。

## 2. 正式故事数据

验收作品为 `潮痕档案：第七码头`（Project ID `70e57dbf-4822-4226-b722-235b83c408b2`）。foundation run `bb2a13a6-c2e3-4cbe-b064-9abcd632cbd6` 已完成并形成正式故事基线；rolling outline runs `43cef040-6b58-4310-b483-550440a6eaa9`、`c8463bbc-8dd2-49ad-896a-37e0399fc75b` 已完成。定位、读者承诺、主线、高潮、终局、人物、世界、事实、时间线和伏笔可刷新读取；前 10 章章纲已保存为正式可追踪数据。

章纲字段包括目标、冲突、关键事件、时间地点、人物、信息揭示、章尾牵引、禁改事实和目标字数；写作上下文消费这些数据以及当前设定、人物状态、前文摘要和必要正文。历史规划/失败 run 保留为证据，但不计入当前五章交付。

## 3. 五章正式交付

有效字数统一按当前保存版本计数：去思考块、角色标记、Markdown 标题、空白和控制标记。标题、标记、空白和思考过程不计入。五章顺序为：盐渍先于落款、潮位表上的空号、墨迹未干、被移除的一页、潮雾倒计时。

| 章节           | 当前版本                               | 有效字符 | SHA-256                                                            | 最终审阅                                      | 结算                                   |
| -------------- | -------------------------------------- | -------: | ------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------- |
| 盐渍先于落款   | `feff851a-34f6-4246-9d7a-63d7ca24b5be` |     2464 | `9840f2c21a7ffd3c606677b9adb6f7ad104987ce63e25a5cd0be1d19274e3488` | `f758ed87-7674-4279-8adb-6414d86e0672` · pass | `bffdde65-d538-460e-9005-712507497a35` |
| 潮位表上的空号 | `bacc0140-ae03-469e-864b-90ae4b92594a` |     3497 | `7a6c686efcf82c2e4b23180003c126179aef58499bcd451e133dc5b1f5627135` | `6e23d171-0e91-4505-8ebc-a47c6e247b03` · pass | `e92b1a35-5132-452e-8d42-c3054b0626fb` |
| 墨迹未干       | `2e298f83-099e-4662-974b-6ee19b10a448` |     3357 | `45617c969161e723316b5ac427909c0168d9ed956315ca5a1855cf70175116d7` | `ae681084-3f49-46d7-8480-75d054f6b8f7` · pass | `6a4cd4f2-8f57-4fb8-b5b3-b58889ddd5bd` |
| 被移除的一页   | `122bc1c1-8734-41a6-9574-7cfd14c2e625` |     3376 | `509da9e530f3c581d866765e94d4f19bfbcdcd3ffa421ab521178bdc0a2752df` | `b7d705a0-0fda-4607-870d-cec8c5fa4b6b` · pass | `bf9b9d60-ffeb-4591-894f-14c8c317d825` |
| 潮雾倒计时     | `2a622396-ee3a-4730-91be-10fb1b9b9760` |     3465 | `e8bf7ac200217d68a5c2f22782f465a53bbc4759086f7bc659b1f77fc47024b4` | `84b7084d-cd97-4a83-8176-985c3de7e0b0` · pass | `86dcbc9e-e8af-42b8-8464-3891f4bd1750` |

五章合计 **16159** 有效字符，逐章均在 `2000—3500`，当前质量 API 的 7 个门全部通过：author promise、chapter plan、chapter commitment、manuscript present、current-version evidence、batch joint review、no blocking errors。质量面板为 **89 / needs_attention**，因为联合审阅保留 10 项 warning 和 19 条未回收伏笔 info；这不是把警告改成通过，也不是保证正文绝对没有问题。

前五章联合审阅 run `9daa90ef-6ad4-4d6e-8023-282d982bd24c`：`warning`，model verdict 也是 `warning`，10/10 问题均绑定当前章节、版本、hash、引用和依据，grounding 丢弃数为 0。主要警告是：第 2 章时间锚点/人物知情/标签状态，第 3 章规则边界与“明日调阅”到第 4 章申请通过的过渡，第 4 章周栎知情铺垫与沈砚身体代价，第 5 章衬衫与物品状态、基座代价及“被移除记忆页”与开启条件的明确性。作者可在后续章节逐项修订；没有 major/critical 阻断。

每章均按章纲→上下文→草稿→确定性检查→语义审阅→必要修订→复检→正式版本→摘要/事实结算→下一章准备运行。截断、占位、明显重复和不足 2000 字不会进入正式交付门。

## 4. 导出与备份

发布页通过真实浏览器选择当前版本的第 1—5 章，核对预览顺序后下载了三类材料：

- [五章 TXT](../../../data-v1/exports/v1-acceptance/潮痕档案：第七码头.txt)：48092 bytes，SHA-256 `a673c5797344ec2d9c997eefde5397b1e7f14fb69c772736895969e3aedf6bd9`
- [五章 Markdown](../../../data-v1/exports/v1-acceptance/潮痕档案：第七码头.md)：48111 bytes，SHA-256 `8451afc22940d6aa20939a8a4aec3953185a0991d9f915088bc31be7d71b4e97`；标题顺序为书名加五章标题
- [文织 narrative bundle](../../../data-v1/exports/v1-acceptance/潮痕档案：第七码头-narrative.json)：2870484 bytes，SHA-256 `e2f3bda4da167b06799ebe3f11fbebd8389329f58df5c99a252fbe1e70e2a343`

实际正文采用当前版本，未保存草稿没有混入导出。发布记录仍为空；本地导出不等于第三方平台已刊登。

备份快照：

- label：`V1首发前五章验收备份`
- backup ID：`47edebfa-51ee-4e12-9061-fb6aff887395`
- 创建时间：`2026-09-13T00:14:49.609Z`
- size：`4618845` bytes
- bundle hash：`bed02414c2d3d41e930a1cd1c06640bf04b4618509b1a72d662f8a0331c78dfb`
- 恢复作品：`11025e47-869f-4508-beb7-2ac57d431d08`，显示名为 `潮痕档案：第七码头 · 恢复副本 47edebfa`

已从发布页执行恢复并打开恢复作品，设定、章节和审阅数据可读；同一 backup ID 再次点击恢复会返回已有 `restoredProjectId`，不会继续创建副本。该“作品备份”bundle 作为受控记录存放在 `data-v1/narralume.sqlite` 的 `project_backups` 表；`data-v1/backups/` 另存服务端数据库级安全快照。两处均不提交仓库。

## 5. 连续创作、第六章与故障恢复

首发批次由正常服务端 worker 执行，session `2e3ecd45-0bdc-465b-8e19-db708610f455` 当前为 `paused`，`completedChapters=6`，当前运行 `6feb30d3-53e4-4053-a4d0-74cdb264c990`，下一章为《七页移交链》。第六章续写使用前五章正式状态，产生了有效 **2450** 字候选，最终版本与审阅/结算均可读；暂停、刷新、恢复和服务重启后的任务回链均已通过真实浏览器验证。

任务中心保留失败、重试、暂停和恢复证据。重试只重开当前失败的步骤/审阅边界；已完成章节不会因刷新或重复点击再生成一章。作者新稿、版本冲突和硬约束冲突会停在确认边界，不会静默覆盖。

## 6. 用量与检查

验收范围关联 run 的真实累计用量：

- input tokens：`1197392`
- output tokens：`263294`
- calls：`76`
- wall time：`1128115 ms`（约 18.8 分钟）
- cost：`0`（没有配置单价，不代表免费）

该项目全量历史 run 累计为 input `14699883`、output `2282501`、calls `763`、wall time `9397760 ms`；它包含历史失败、重试和其他运行，不应被误读为单次五章成本。前五章联合审阅单次 run 用量为 input `32461`、output `4858`、calls `2`。

最后一次 `npm run verify` 通过：

- Prettier format check
- ESLint（无 warning）
- workspace typecheck
- Vitest：144 个测试文件、813 个测试全部通过
- evidence protocol：5/5
- dependency license check：499 条记录
- production TypeScript build + web bundle

定向真实浏览器回归还确认：作品库副本标签、重复恢复幂等、当前章节树过滤历史 abandoned 节点、章节下拉使用“第 N 章 · 标题”、发布页当前版本范围和备份恢复入口均可用；控制台当前页面只有 React DevTools 提示，没有新的应用错误。

## 7. 剩余限制

- 质量面板仍为 `needs_attention`：10 项联合 warning、19 条未回收伏笔和无启用风格档案提示，作者应在后续连载中逐项判断。
- 旧数据库中此前创建的同名作品/恢复副本没有被静默删除；作品库现在用“恢复副本”“同名副本 n/m”标识，当前大纲隐藏无正文的历史 abandoned 章节并保留历史计数。若作者确认某份旧副本可删除，应在作品库回收站单独处理。
- 第六章已验证可继续，但不属于五章首发导出范围。
- 未上传任何第三方平台，不保证商业成绩或平台审核通过。
- V2 共创能力另开 Goal，不在本轮启动。
