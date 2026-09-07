下面这版可以直接作为你 fork `NarraLume` 后的**主重构设计文档 + Codex 开工说明**使用。我把“产品怎么改”和“代码怎么迁”放在了一起，避免最后变成只有 UI 方案、Codex 不知道怎么落地。

# NarraLume 面向番茄网文创作平台重构设计文档

**文档版本：V1.0**
**重构基线：abligail/narralume 当前 main 分支**
**目标：基于 NarraLume 构建面向中文网文、重点适配番茄小说创作习惯的 AI 小说全生命周期创作平台**

---

# 1. 项目重构目标

本项目不以“修改 NarraLume UI”为目标，而是以 NarraLume 已有长篇小说创作引擎为技术底座，重新构建一套面向普通网文作者的创作产品。

原 NarraLume 已经具备较完整的长篇小说底层能力，包括项目、Story Bible、章节文档、版本、AI Run、Candidate、审稿、连续创作、恢复、导入导出、Writing Skill、Agent Skill 等。仓库按 `apps/web`、`apps/server` 与 `context / contracts / domain / harness / llm / narrative / persistence / services` 等 package 分层，本身并不是简单的 AI 写作页面。

因此本次改造遵循：

> **底层能力最大化复用，产品心智彻底重构。**

最终产品不应要求作者理解：

- Canon
- Foundation
- Candidate
- Run
- Session
- Autopilot
- Agent
- Skill
- Context
- Story Change
- Model Assignment

这些继续作为内部工程概念存在。

作者只需要理解：

- 我的作品
- 大纲
- 章节
- 人物
- 世界观
- 伏笔
- AI 帮写
- AI 检查
- 发布
- 数据

---

# 2. 产品定位

产品定位建议定义为：

> **面向中文网文作者，从灵感、开书、大纲、正文、改稿、连载到数据复盘的一站式智能创作工作台。**

而不是：

> AI 小说生成器。

两者差异非常重要。

“AI 小说生成器”的核心路径是：

```text
输入提示词
↓
AI 输出文本
↓
继续生成
```

目标产品应该是：

```text
灵感
↓
开书策划
↓
作品定位
↓
总纲
↓
卷纲
↓
人物 / 世界观 / 伏笔
↓
章节规划
↓
正文创作
↓
章节质检
↓
修订
↓
发布
↓
数据复盘
↓
调整后续剧情
↓
持续连载
```

AI 是贯穿整个链路的基础能力，而不是一个独立功能。

---

# 3. 重构不可破坏的底层原则

以下能力原则必须明确列为架构红线。

## 3.1 作者拥有最终决定权

NarraLume 当前的核心设计之一是：

AI 生成的正文、修订和故事变化首先进入 Candidate，由作者接受后才成为正式内容。

这一机制必须保留。

前端可以把 Candidate 改名为：

- AI 建议
- 候选版本
- 改写方案

但不得改成 AI 生成后直接覆盖正式正文。

---

## 3.2 手工写作必须始终可用

即使用户：

- 没配置模型
- API 不可用
- AI 服务异常

仍必须支持：

- 新建作品
- 编辑大纲
- 编辑人物
- 手工写正文
- 自动保存
- 版本管理
- 导出
- 备份

不能把产品重构成“没有 AI 就没法写小说”。

---

## 3.3 长任务必须可恢复

连续写作、章节生成、审稿等任务不能绑定在某一个页面生命周期。

用户可以：

```text
开始连续写 5 章
↓
离开写作页面
↓
进入人物页
↓
关闭浏览器
↓
再次进入项目
↓
恢复任务状态
```

现有 Run / Session / Task Ledger 机制继续保留。

---

## 3.4 Story Bible 保留为唯一故事事实源

人物、关系、时间线、伏笔、设定等不能重新变成一堆独立聊天上下文。

UI 可以简化，但 Story Bible 的一致性机制必须保留。

---

# 4. 当前主要产品问题

当前主导航已经主动收敛成主要 Workspace、快速创作和高级工具分组，但底层组织方式依然是“系统有哪些工作区”，而不是“作者要完成什么任务”。

当前 Studio 同时暴露：

- Review
- Revisions
- Canon
- Comments
- Versions
- Selection

等工具。

对于熟悉系统的用户，这种结构非常明确。

但普通网文作者进入以后需要先理解系统，再开始创作。

本次重构主要解决四类问题：

### 4.1 信息架构过于工程化

以：

```text
Shelf
Overview
Bible
Studio
Autopilot
Runs
Lab
Delivery
```

为中心。

应调整为：

```text
作品
创作
大纲
设定
数据
发布
```

---

### 4.2 AI 工作机制暴露过多

当前用户容易感知到底层：

```text
Run
Candidate
Session
Proposal
Model
Agent
```

目标产品应将其转成用户任务：

```text
正在写第 18 章
正在检查本章
发现 3 个问题
生成了 2 个改写方案
```

---

### 4.3 操作对象过于偏领域模型

目前创建章节时存在：

```text
OutlineNode
→ Document
→ Outline Binding
→ Studio
```

目标体验应该变成：

```text
+ 新建章节
```

系统自动创建或绑定底层结构。

---

### 4.4 AI 聊天承担过多功能

聊天适合：

- 发散
- 咨询
- 复杂指令
- 讨论剧情

但大量高频创作行为不应该要求聊天。

例如：

```text
续写
扩写
润色
更爽
更克制
加强冲突
优化对话
去 AI 味
检查本章
```

都应该成为一键 Action。

---

# 5. 新产品整体信息架构

## 5.1 项目外全局导航

未进入某本作品时只保留：

```text
我的作品
创作模板
设置
```

首页默认：

# 我的作品

---

## 5.2 项目内主导航

进入小说以后主导航重构为：

```text
创作首页
大纲
写作
作品设定
数据
发布
```

设置不放在主创作导航内。

顶部右侧：

```text
AI 状态
任务中心
搜索
设置
```

---

# 6. 新旧 Workspace 映射

| 新产品页面  | 主要复用旧模块     |
| ----------- | ------------------ |
| 我的作品    | Shelf              |
| 创作首页    | Overview           |
| 大纲        | Bible / Outline    |
| 写作        | Studio             |
| 作品设定    | Bible              |
| 数据        | 新模块             |
| 发布        | Delivery           |
| AI 快捷创作 | Autopilot 能力内嵌 |
| 任务中心    | Runs               |
| AI 助手     | Project Assistant  |
| 高级设置    | Settings / Lab     |

原来的：

```text
Autopilot
Runs
Lab
```

不再作为普通用户一级导航出现。

能力不删除。

---

# 7. 路由重构方案

建议逐步从：

```text
/shelf

/projects/:projectId/overview
/projects/:projectId/bible
/projects/:projectId/studio
/projects/:projectId/autopilot
/projects/:projectId/runs
/projects/:projectId/lab
/projects/:projectId/delivery

/settings
```

迁移为：

```text
/books

/books/new

/books/:bookId
/books/:bookId/dashboard

/books/:bookId/outline

/books/:bookId/write
/books/:bookId/write/:chapterId

/books/:bookId/knowledge
/books/:bookId/knowledge/characters
/books/:bookId/knowledge/world
/books/:bookId/knowledge/timeline
/books/:bookId/knowledge/foreshadow

/books/:bookId/analytics

/books/:bookId/publish

/settings
```

为了降低一次性迁移风险，第一阶段可以保留旧 URL Alias。

例如：

```text
/projects/:projectId/studio
```

301/前端 Redirect 到：

```text
/books/:projectId/write
```

Domain 内部继续使用 `projectId`，暂时不必立即改成 `bookId`。

---

# 8. 六个核心页面重构

---

# 8.1 页面一：我的作品

目标：

> 让作者像打开写作软件，而不是打开 AI 控制台。

布局：

```text
┌─────────────────────────────────────────────────┐
│ 我的作品                          搜索   + 新建作品 │
│                                                 │
│ 最近创作                                         │
│                                                 │
│ ┌─────────┐  《全民转职：我的技能无限升级》      │
│ │  封面   │  连载中                              │
│ │         │  18.4 万字 · 72 章                  │
│ └─────────┘  昨天 23:12 更新                    │
│              [继续创作]                         │
│                                                 │
│ ┌─────────┐  《重生后我只想当咸鱼》              │
│ │         │  准备中                              │
│ └─────────┘  3.2 万字 · 12章                    │
└─────────────────────────────────────────────────┘
```

作品卡只展示：

- 封面
- 书名
- 连载状态
- 字数
- 章节
- 最近创作时间

主要 CTA：

**继续创作**

次级菜单：

```text
作品设置
复制作品
导出
归档
删除
```

原 Shelf 里的高级导入、Foundation 状态等移入对应流程。

---

# 8.2 页面二：新建作品

此页面是整个新手体验最关键页面。

提供三个入口：

```text
AI 帮我开书
自己创建
导入已有作品
```

---

## AI 帮我开书

第一屏只有一个大输入框：

> 用一句话说说你想写什么。

示例：

> 普通社畜穿越修仙世界，发现自己的工资卡每天能兑换一件现代商品。

点击：

**帮我策划**

底层直接复用现有 `createProjectWithFoundation` / Foundation 能力。现有 API 已经支持 AI 引导建书并启动后台 Foundation Run。

但交互改为方案选择。

AI 返回 3 个方案：

### 方案 A：轻松经营流

书名：

《修仙界便利店》

卖点：

现代商品在修仙世界形成降维打击。

核心爽点：

低成本商品换取修炼资源。

主线：

从小摊到掌控修仙商业体系。

---

### 方案 B：幕后流

……

用户选择：

**就写这个**

后台生成：

```text
Project
AuthorIntent
基础人物
基础世界设定
核心矛盾
大纲骨架
前三章章纲
```

最终直接进入：

**创作首页**

---

## 自己创建

只要求：

```text
书名
一句话简介
题材
男频 / 女频
```

其余均可后补。

---

## 导入已有作品

继续保留现有导入能力。

UI 调整为：

```text
上传小说文件
↓
分析章节
↓
识别人物 / 世界观 / 大纲
↓
预览
↓
确认导入
```

而不是一开始展示内部数据转换结构。

---

# 8.3 页面三：创作首页

直接基于现有 ProjectOverview 重构。

现有 Overview Contract 已经具备：

- 当前章节
- Active Task
- Pending
- Next Action

等信息。

首页目标：

> 用户进入作品 3 秒内明确“今天该干嘛”。

布局：

```text
《全民转职：我的技能无限升级》

连载中
18.4 万字 · 72章

────────────────────────

今日创作

目标：4000字
已完成：2168字

██████████░░░░

继续写
第73章 · 神秘副本

上一章：
林川刚进入副本，系统突然失去响应……

[继续写作]

────────────────────────

AI 建议

⚡ 第73章章纲已经准备好
   可以直接开始正文

⚠ 第71章还有一个人物设定冲突未处理

────────────────────────

作品进度

第一卷 ██████████ 完成
第二卷 ██████░░░░ 63%

────────────────────────

待处理

2 个章节质检问题
1 个设定变化
3 个 AI 改写方案
```

必须突出：

**唯一主 CTA：继续写作**

---

# 8.4 页面四：大纲

不再以 Canon Spread 展示。

目标交互更接近：

Scrivener / Notion Tree + 卡片规划。

左侧：

```text
总纲

第一卷
  第1章
  第2章
  第3章

第二卷
  第4章
  第5章
```

右侧章节卡：

# 第18章：第一次交锋

本章作用
让主角第一次正面面对核心反派势力。

本章目标
主角进入拍卖场并拿到关键线索。

核心冲突
身份暴露风险。

爽点 / 回报
所有人轻视主角，最终发现主角才是真正买家。

章尾钩子
神秘人物叫出主角前世名字。

目标字数
2500

涉及人物
林川 / 苏青 / 王海

伏笔
神秘戒指 #F012

按钮：

```text
AI 优化章纲
生成正文
复制
删除
```

---

## 大纲层级

底层继续使用：

```text
book
volume
arc
chapter
scene
beat
```

但普通模式只展示：

```text
全书
卷
章
```

Scene / Beat 放在：

**高级规划模式**

---

# 8.5 页面五：章节写作台

这是产品最高优先级页面。

目标布局：

```text
┌──────────────┬─────────────────────────────┬────────────────┐
│ 章节         │                             │ 创作助手       │
│              │      第73章 神秘副本         │                │
│ 第一卷       │                             │ 本章章纲       │
│ 01           │      正文正文正文正文        │                │
│ 02           │                             │ 角色           │
│ ...          │      正文正文正文正文        │                │
│              │                             │ 伏笔           │
│ 第二卷       │                             │                │
│ ...          │                             │ AI 工具        │
│              │                             │                │
│ + 新建章节   │                             │                │
└──────────────┴─────────────────────────────┴────────────────┘
```

---

## 中央编辑区

顶部：

```text
第73章 神秘副本

2438字
草稿已自动保存
```

正文区域尽可能纯净。

底部状态：

```text
今日 2438 字
全文 184,521 字
```

不要常驻大量 AI 状态。

---

## 右侧创作助手

默认 Tabs：

```text
本章
AI
检查
```

### 本章

显示：

- 本章目标
- 冲突
- 爽点
- 章尾钩子
- 出场人物
- 关联伏笔

### AI

快捷操作：

```text
续写
重写本段
扩写
压缩
优化对话
加强冲突
加强爽点
加强悬念
去 AI 味
自定义
```

### 检查

显示：

```text
人物一致性
设定冲突
剧情逻辑
节奏
爽点
章节钩子
AI 痕迹
```

---

# 9. 选区 AI 交互

当前 Studio 已存在 Selection + Proposal 机制，继续复用。

新 UI：

用户选中文字：

```text
王浩淡淡地说道：“你不是我的对手。”
```

出现浮动工具条：

```text
润色
扩写
更霸气
更克制
优化对话
自定义
```

点击“更霸气”。

右侧出现：

```text
原文

王浩淡淡地说道：
“你不是我的对手。”

建议

王浩甚至没抬头。

“让你身后的人来。”

[替换]
[插入]
[再生成]
[放弃]
```

内部仍然：

```text
Selection
→ Run
→ Proposal
→ Accept
```

但 UI 不出现这些词。

---

# 10. 自动保存与版本设计

保留当前自动保存机制。

前端展示只分：

```text
正在保存…
已保存
保存失败
```

版本行为改成：

### 自动版本

重要 AI 操作前自动建立 Checkpoint。

例如：

```text
AI 大幅改写
批量修订
恢复旧版本
```

### 手动版本

用户点击：

**创建版本**

可以输入：

```text
修改了第18章高潮
```

版本历史放入右侧：

```text
更多 → 历史版本
```

不要常驻占用创作区域。

---

# 11. 作品设定页

原 Story Bible 底层继续存在。

UI 拆成：

```text
作品定位
人物
世界观
关系
时间线
伏笔
```

---

## 11.1 作品定位

对应 AuthorIntent。

普通用户字段：

```text
一句话卖点
题材
目标读者
核心看点
整体风格
主线方向
结局方向
创作禁区
```

内部映射：

```text
promise
themes
audience
tone
endingDirection
boundaries
```

---

## 11.2 人物

人物卡：

```text
林川

主角

身份
普通大学生 / SSS 天赋拥有者

性格
谨慎、护短、不圣母

核心目标
寻找失踪的姐姐

当前状态
等级 36
黑塔成员
持有裂空剑

人物关系
苏青 → 暧昧
王海 → 敌对
林雪 → 姐姐

重要经历
第1章：完成转职
第8章：加入黑塔
第21章：……
```

底层自动映射 Entity + Fact + Relation。

---

## 11.3 世界观

以普通知识库形式显示：

```text
力量体系
组织势力
地图地点
特殊物品
世界规则
```

不展示 Canon Authority 等内部概念。

---

# 12. AI 助手重新定位

Project Assistant 保留。

现有 Assistant 已支持 Project Context、Document、Outline、Selection 等上下文。

但普通页面不再常驻一个“ChatGPT 面板”。

改成右下角：

**问问创作助手**

典型问题：

```text
这个人物现在是什么等级？

帮我找一下前面什么时候提过黑色戒指。

第30章到40章主角和女主关系发生了什么变化？

我感觉最近剧情有点拖，帮我看看。

接下来三章怎么安排比较爽？
```

Assistant 主要负责：

- 信息查询
- 创作讨论
- 复杂操作入口

高频动作仍使用按钮。

---

# 13. 连续创作重构

Autopilot 不再作为独立一级 Workspace。

改成写作页中的：

# 连续创作

点击：

```text
连续创作
```

弹窗：

```text
从第：
73章

生成：
5章

每章：
约2500字

创作要求：
[________________]

☑ 每章生成后自动检查
☑ 发现重大设定冲突时暂停
```

点击：

**开始创作**

右上任务中心：

```text
连续创作

第74 / 77章

正在生成第74章正文…

███████░░░

[暂停]
```

后台继续使用 Autopilot Session。

---

# 14. Run Center 重构

Runs 不再独立导航。

统一改成：

# 任务中心

顶部任务按钮：

```text
2
```

打开 Drawer：

```text
正在进行

连续创作
第74 / 77章
[查看]

章节检查
第72章
[查看]

────────────────

最近完成

重新规划第68章
2分钟前

AI 改写
第71章
12分钟前
```

普通用户不进入内部 Step。

高级模式提供：

**查看任务详情**

才能看到模型调用和步骤。

---

# 15. 面向番茄网文的创作模板

新增：

# 创作模板 CreativePreset

例如：

```text
番茄男频 · 都市脑洞
番茄男频 · 玄幻升级
番茄男频 · 历史种田
番茄女频 · 现言甜宠
番茄女频 · 年代
悬疑脑洞
无限流
```

这里的“番茄”表示针对该类网文阅读习惯的创作模板，不在代码中硬编码任何未经验证的平台算法。

CreativePreset 包含：

```text
开书规则
剧情规划规则
章节规则
文风规则
质检规则
标题简介规则
推荐章长
```

---

# 16. Writing Skill 改造

现有 NarraLume 已存在 Writing Skill，并按 chapter / cocreate / edit / review 等 Scope 区分，可以继续作为题材和专项创作方法的底层实现。

前端不再叫：

```text
Writing Skill
```

改成：

```text
创作规则
专项能力
```

例如：

### 都市爽文写作规则

```text
状态：启用
适用于：章节创作 / 修改 / 审稿
```

### 去 AI 味

```text
适用于：修改
```

### 对话增强

```text
适用于：修改
```

---

# 17. 中文网文 Prompt 系统

NarraLume 当前章节默认 Prompt 已经对中文网络小说写法进行大量针对性约束，例如控制解释腔、模板化动作、AI 高频措辞、对话和章尾悬念等，可以继续作为基础层。

新的 Prompt 组织建议：

```text
System Invariants
        ↓
平台 / 题材模板
        ↓
项目文风
        ↓
Writing Skill
        ↓
章节 Brief
        ↓
当前上下文
        ↓
用户本次指令
```

严格区分：

### 不可变约束

例如：

- 不修改锁定设定
- POV 信息边界
- 输出结构
- 引用 ID

### 可配置创作方法

例如：

- 爽文节奏
- 对话比例
- 文风
- 章节钩子

不要让用户编辑结构性安全约束。

---

# 18. ChapterBrief 数据模型

当前 OutlineNode 已经拥有：

```text
summary
goal
conflict
outcome
povEntityId
storyTime
metadata
```

可先利用 `metadata` 快速实现 ChapterBrief，后续稳定后再转正式 Schema。

建议：

```ts
interface ChapterBrief {
  outlineNodeId: string;

  purpose?: string;

  hook?: string;

  conflict?: string;

  payoff?: string;

  emotionGoal?: string;

  characterProgress?: string;

  informationGain?: string;

  cliffhanger?: string;

  targetWords?: number;

  foreshadowIds?: string[];

  requiredEntityIds?: string[];
}
```

---

# 19. BookProfile 数据模型

新增：

```ts
interface BookProfile {
  projectId: string;

  platform?: "fanqie" | "qidian" | "other";

  channel?: "male" | "female";

  genre?: string;

  subgenres: string[];

  tags: string[];

  targetAudience?: string;

  plannedWords?: number;

  chapterWordTarget?: number;

  dailyWordGoal?: number;

  updateFrequency?: string;

  presetId?: string;
}
```

首期：

Platform 不承担任何自动发布逻辑。

只负责创作策略。

---

# 20. 网文质检系统

在原 Review 上增加：

```text
剧情一致性
人物一致性
世界观冲突
POV
文风
```

之外的网文指标：

```text
开头钩子
节奏
冲突密度
主角主动性
期待建立
爽点兑现
信息重复
对话效率
章尾钩子
AI 痕迹
```

UI 不强调总评分。

推荐输出：

# 本章状态：可以发布

发现 3 个可优化点：

### 节奏偏慢

1320～1650 字连续进行背景解释。

建议：

压缩约 30%，把信息融入对话。

[AI 优化]

---

### 章尾钩子偏弱

目前结尾：

> 林川接到了一个电话。

建议：

隐藏来电人身份，并在最后一句加入异常信息。

[生成三个结尾]

---

# 21. 开书体检

针对网文最值得新增：

# 前三章体检

检查：

```text
主角是否快速出现
核心矛盾是否建立
核心卖点是否明确
核心机制是否出现
第一轮期待是否建立
是否出现第一次回报
是否留下继续阅读动力
```

结果不要写：

```text
评分：73.5
```

而写：

```text
当前最大问题：

核心卖点直到第3章中段才真正出现。

建议：

把第2章后半段的觉醒情节提前到第1章末尾。
```

按钮：

```text
查看调整方案
重新规划前三章
```

---

# 22. 数据复盘模块

为了真正覆盖连载生命周期，新增长期模块：

# 数据

首期采用：

```text
手工录入
CSV 导入
```

不把未知稳定性的自动抓取作为首期依赖。

数据模型：

```ts
interface Publication {
  id: string;
  projectId: string;
  documentId: string;
  platform: string;
  platformChapterId?: string;
  publishedAt?: string;
}

interface ChapterPerformanceSnapshot {
  publicationId: string;
  capturedAt: string;

  reads?: number;
  comments?: number;
  favorites?: number;
  follows?: number;

  retention?: number;

  revenue?: number;
}
```

---

# 23. AI 数据分析

未来可支持：

> 第31章以后阅读表现明显下降。

AI 自动结合正文分析：

```text
第31～33章共同特点：

1. 连续三章没有新的核心冲突。
2. 世界观解释明显增加。
3. 主角连续两章处于被动状态。
4. 第28章建立的身份暴露期待尚未兑现。
```

然后：

**调整后续剧情**

生成第34～37章新的章纲 Proposal。

仍由作者确认。

---

# 24. 新前端工程结构

目前 Web 项目已经使用 React、React Router、React Query、Zustand 等技术，本次无需更换整体技术栈。

建议改为 Feature Oriented Architecture：

```text
apps/web/src/

app/
  App.tsx
  router/
  providers/
  layouts/

pages/
  library/
  book-create/
  dashboard/
  outline/
  writing/
  knowledge/
  analytics/
  publishing/
  settings/

features/
  project-create/
  project-import/

  outline-edit/
  outline-generate/

  chapter-create/
  chapter-edit/
  chapter-generate/
  chapter-review/
  chapter-batch-generate/

  selection-edit/

  character-edit/
  world-edit/

  ai-assistant/

  publishing/
  analytics-import/

entities/
  project/
  chapter/
  outline/
  character/
  world/
  foreshadow/
  task/
  publication/

shared/
  api/
    projects.ts
    overview.ts
    story.ts
    writing.ts
    review.ts
    automation.ts
    assistant.ts
    delivery.ts
    providers.ts

  query/

  ui/
    Button/
    Input/
    Textarea/
    Select/
    Dialog/
    Drawer/
    Dropdown/
    Tabs/
    Tooltip/
    Card/
    Badge/
    Empty/
    Skeleton/
    SplitPane/
    Tree/
    DiffView/
    AIActionButton/

  hooks/
  utils/
  styles/
```

---

# 25. api.ts 拆分

当前 `apps/web/src/lib/api.ts` 已经接近 100KB，应列为第一批工程治理目标。

迁移：

```text
lib/api.ts
```

拆为：

```text
shared/api/client.ts

shared/api/projects.ts
shared/api/story.ts
shared/api/overview.ts
shared/api/writing.ts
shared/api/review.ts
shared/api/automation.ts
shared/api/assistant.ts
shared/api/delivery.ts
shared/api/models.ts
shared/api/skills.ts
```

第一阶段只移动代码，不改变 API Contract。

保证功能等价。

---

# 26. React Query 封装

页面中尽量避免反复：

```text
useQuery
useMutation
invalidateQueries
```

建议增加：

```text
entities/project/queries.ts

useProject()
useProjectOverview()

entities/chapter/queries.ts

useChapters()
useChapter()
useCreateChapter()
useSaveChapter()

features/chapter-review/api.ts

useChapterReview()
```

统一 Query Key。

---

# 27. Studio 拆分

当前 Studio 同时承担文档列表、正文编辑、AI、Review、Revision、Canon、Comments、Versions、Selection 等，应逐步拆解。

建议：

```text
pages/writing/
  WritingPage.tsx

features/chapter-editor/
  ChapterEditor.tsx
  useChapterEditor.ts

features/draft-autosave/
  useDraftAutosave.ts

features/chapter-tree/
  ChapterTree.tsx

features/chapter-ai/
  ChapterAITools.tsx

features/selection-edit/
  SelectionToolbar.tsx
  SelectionProposal.tsx

features/chapter-review/
  ReviewPanel.tsx

features/version-history/
  VersionDrawer.tsx
```

页面只负责布局。

---

# 28. Autopilot 拆分

原：

```text
AutopilotWorkspace
```

最终不再对应单一页面。

拆成：

```text
features/foundation-generation/

features/batch-writing/

features/story-steer/

features/task-progress/

features/candidate-review/
```

所有功能继续调用原有 Automation API。

---

# 29. Project Assistant 拆分

拆成：

```text
features/assistant/
  AssistantLauncher
  AssistantDrawer
  ConversationList
  ConversationView
  AssistantActionCard
```

普通模式隐藏：

```text
模型选择
Reasoning
Agent Skill
Activity 内部状态
```

高级模式再开放。

---

# 30. UI Design System

重新建立统一 Token。

视觉关键词：

```text
写作
纸张
克制
清晰
内容优先
低 AI 感
```

禁止：

```text
大面积渐变
霓虹紫蓝
满屏 Sparkles
技术仪表盘
大量等宽字体
任务日志常驻
```

建议：

```text
浅灰背景
白色编辑纸
少量暖色/品牌强调色
12~16px 圆角
弱边框
弱阴影
```

AI 状态只使用一个 Accent Color。

---

# 31. 编辑器演进

## 第一阶段

继续保留 Textarea。

避免一次重构同时更换编辑器导致风险过大。

---

## 第二阶段

替换为 Tiptap / ProseMirror。

主要为了：

```text
选区浮动菜单
段落级 AI
Suggestion
Comment Anchor
Diff
Slash Command
Inline Decoration
```

底层正文仍建议继续存储：

```text
Markdown / Plain Text
```

编辑器 Document 不作为唯一真实数据。

---

# 32. 重构阶段规划

---

## Phase 0：建立安全基线

目标：

不改产品。

完成：

```text
创建 fork
建立独立重构分支
记录 main commit
运行完整测试
记录当前截图
建立核心 E2E 基线
```

必须通过：

```text
npm run verify
npm run test:e2e
```

尤其保护现有完整生命周期 E2E。当前仓库已经有 UI 主链测试覆盖“设置 → 建书 → 大纲 → 写作 → AI 接续 → 交付”。

验收：

**全部测试保持绿色。**

---

# 33. Phase 1：前端代码治理

只改工程结构。

完成：

```text
api.ts 拆分
Query Keys 统一
公共组件整理
Studio Hooks 抽离
Assistant 抽离
Autopilot 子模块抽离
```

禁止：

```text
改数据库
改 Domain Model
改 API Contract
大规模改 UI
```

验收：

```text
功能完全一致
现有 URL 正常
测试全部通过
```

---

# 34. Phase 2：新产品 Shell

完成：

```text
新的左侧导航
新的顶部栏
/books 路由
创作首页
作品页
页面容器
Design System
```

旧 Workspace 暂时仍然可以通过旧 URL 访问。

新增：

```text
Legacy Redirect
```

验收：

新用户主要路径只看到：

```text
作品
创作首页
大纲
写作
作品设定
数据
发布
```

---

# 35. Phase 3：新建作品流程

完成：

```text
AI 开书
自己创建
导入作品
```

AI 开书复用 Foundation。

实现：

```text
一句话
→ AI 生成多个方案
→ 用户选择
→ 创建项目
→ 自动初始化故事结构
```

验收目标：

**从首页到进入第一章准备写作，不超过 5 个主要决策步骤。**

---

# 36. Phase 4：写作台

整个项目最高优先级阶段。

完成：

```text
章节树
正文编辑
自动保存
章节 Brief
AI 快捷工具
选区 AI
检查
版本历史
任务状态
```

原 Studio 暂不删除。

先新增：

```text
WritingPageV2
```

功能成熟后再替换。

验收：

用户可以：

```text
打开作品
→ 点击继续创作
→ 写正文
→ AI 续写
→ 接受
→ 选中一句
→ AI 改写
→ 接受
→ 检查
→ 修改
```

全程不进入 Runs。

---

# 37. Phase 5：作品设定

完成：

```text
人物
世界观
关系
时间线
伏笔
作品定位
```

底层仍然使用 Story Bible。

目标：

普通用户完全不看到 Canon。

---

# 38. Phase 6：网文创作能力

增加：

```text
CreativePreset
BookProfile
ChapterBrief
网文 Review Rules
前三章体检
连续创作
去 AI 味
爽点检查
章节钩子检查
```

---

# 39. Phase 7：数据与发布

增加：

```text
发布记录
CSV 导入
章节表现
趋势图
AI 数据分析
后续剧情调整建议
```

形成完整生命周期。

---

# 40. 开发过程必须采用“增量替换”

禁止：

```text
直接删除 Studio
直接删除 Bible
直接删除 Autopilot
一次性重写整个 apps/web
```

正确方法：

```text
Legacy Component
        ↓
New V2 Component
        ↓
并存
        ↓
E2E 覆盖
        ↓
切换默认入口
        ↓
删除 Legacy
```

---

# 41. E2E 测试重新设计

新增六条核心 E2E。

## E2E 01 新手开书

```text
作品
→ AI 开书
→ 输入一句话
→ 选择方案
→ 创建
→ 进入创作首页
```

---

## E2E 02 手工写作

```text
进入小说
→ 新建章节
→ 输入正文
→ 自动保存
→ 离开页面
→ 返回
→ 内容仍存在
```

---

## E2E 03 AI 章节写作

```text
打开章节
→ AI 续写
→ 等待 Candidate
→ 接受
→ 正文更新
```

---

## E2E 04 选区修改

```text
选择文本
→ AI 改写
→ 查看 Diff
→ 接受
```

---

## E2E 05 一致性

```text
人物页修改锁定设定
→ AI 写章
→ 不能违反锁定设定
```

---

## E2E 06 长任务恢复

```text
启动连续写作
→ 离开页面
→ 返回项目
→ 任务中心继续显示
→ 任务完成
→ 查看章节
```

---

# 42. 产品体验验收指标

未来不要只以：

```text
测试通过
```

作为重构成功。

至少增加以下体验指标。

### 新用户

从打开首页到开始第一章：

**< 3 分钟**

---

### 页面理解

创作首页主操作数量：

**≤ 3**

---

### 普通模式

禁止出现：

```text
Run
Agent
Skill
Foundation
Candidate
Session
Canon
```

---

### 写作

用户进入作品后：

**≤ 2 次点击回到当前章节。**

---

### AI

80% 高频 AI 操作：

**无需输入 Prompt。**

---

# 43. Codex 开发约束

以后每一个 Codex Task 都必须遵循：

1. 先阅读当前相关模块。

2. 不得未经要求重构无关代码。

3. Domain / Persistence 改动必须单独说明。

4. 不得删除现有测试以让新代码通过。

5. Candidate → Accept 模型不得绕开。

6. Manual Writing 必须始终可用。

7. 长任务不得依赖当前页面存活。

8. UI 不暴露新的工程术语。

9. 每次改动执行：

```text
format
lint
typecheck
unit tests
相关 E2E
```

10. 每个阶段形成：

```text
CHANGELOG
改动文件
已完成
未完成
风险
测试结果
```

---

# 44. 给 Codex 的项目总控提示词

以下内容建议放到仓库：

```text
docs/REFACTOR_MASTER_PLAN.md
```

并作为每次 Codex Session 的总控上下文。

```text
你现在负责基于 NarraLume 重构一个面向中文网文作者的 AI 小说创作平台。

核心原则：

1. NarraLume 现有 Domain、Persistence、Narrative、Harness、Run、Candidate、Review 和 Recovery 是底层资产，不允许为了简化 UI 随意删除。

2. 本次重构核心是产品层和前端交互层重构，而不是从零重新实现小说引擎。

3. 新产品必须以作者任务为中心，而不是以 AI 或系统 Workspace 为中心。

4. 普通用户不应该理解以下内部术语：
Canon、Run、Candidate、Foundation、Session、Autopilot、Agent Skill、Writing Skill、Model Assignment。

5. 这些内部机制继续存在，只在 UI 层映射为普通创作语言。

6. 手工写作始终是一级能力，任何没有配置 AI 模型的情况下都必须可以完成：
建书、大纲、人物设定、正文编辑、版本、导出、备份。

7. AI 生成内容不得直接无确认覆盖正式正文。
继续使用 Candidate → 用户 Accept / Reject 机制。

8. 长时间 AI 任务必须可以离页、刷新和恢复。

9. 重构必须增量进行：
Legacy → V2 → 测试 → 切换 → 删除 Legacy。
禁止一次性重写 apps/web。

10. 每次开始任务前：
- 阅读相关源文件；
- 阅读现有测试；
- 明确此次任务边界；
- 给出改造方案；
- 再开始编码。

11. 每次完成后必须运行相关：
format / lint / typecheck / test / e2e。

最终产品一级导航：

- 我的作品
- 创作首页
- 大纲
- 写作
- 作品设定
- 数据
- 发布

AI 不作为一级导航。

产品核心链路：

灵感
→ 开书
→ 作品定位
→ 总纲
→ 卷纲
→ 人物/世界观
→ 章节规划
→ 正文
→ AI 质检
→ 修改
→ 发布
→ 数据复盘
→ 调整后续剧情
→ 连载
```

---

# 45. Codex Phase 0 提示词

```text
本次只执行 NarraLume 重构 Phase 0：建立安全基线。

不要修改任何产品行为。

任务：

1. 深入分析仓库目录结构。
2. 识别：
   - apps/web
   - apps/server
   - packages/contracts
   - packages/domain
   - packages/harness
   - packages/narrative
   - packages/persistence
   - packages/services
   之间的依赖关系。

3. 梳理当前完整用户生命周期：
设置 → 建书 → Story Bible → Studio → AI → Review → Delivery。

4. 梳理所有现有 E2E 测试。

5. 执行：
npm run verify
npm run test:e2e

6. 输出 docs/refactor/00-baseline.md，包括：
- 当前架构
- 关键数据流
- 不允许破坏的行为
- 当前测试覆盖
- 当前技术债
- 后续重构风险

不要进行任何功能代码修改。
```

---

# 46. Codex Phase 1 提示词

```text
执行重构 Phase 1：前端代码治理。

目标：
只调整前端代码组织，不改变用户可见功能、API Contract、Domain Model 和数据库。

重点：

1. 拆分 apps/web/src/lib/api.ts。
2. 建立 shared/api。
3. 统一 Query Key。
4. 将 Studio 内可独立逻辑抽成 hooks/features。
5. 将 Project Assistant 拆成较小组件。
6. 将 Autopilot 中可独立逻辑抽离。

约束：

- 原路由不变。
- UI 不变。
- API 不变。
- 测试不允许删除。
- 每一步保持可运行。

优先小 PR / 小 commit 风格实施。

完成后输出：
docs/refactor/01-frontend-foundation.md

并执行全部相关测试。
```

---

# 47. Codex Phase 2 提示词

```text
执行重构 Phase 2：新的产品 Shell。

新增 V2 Shell，不删除 Legacy Shell。

新一级导航：

我的作品
创作首页
大纲
写作
作品设定
数据
发布

要求：

1. AI 不作为一级导航。
2. Autopilot / Runs / Lab 从普通导航隐藏。
3. Settings 放顶部菜单。
4. 保留旧路由兼容。
5. 创建 /books 路由体系。
6. projectId 暂时继续作为内部 Domain ID，不需要全仓库改名。
7. 建立新的 UI Tokens 和基础 Layout。
8. 风格为浅色、内容优先、低 AI 感。

不要在这一阶段重写 Studio 和 Story Bible。

建立视觉和路由骨架即可。

完成后新增对应 E2E。
```

---

# 48. Codex Phase 3 提示词

```text
执行 Phase 3：重构新建作品体验。

创建 /books/new。

提供：

1. AI 帮我开书
2. 自己创建
3. 导入作品

AI 帮我开书：

用户输入一句话想法。

优先复用现有 Foundation / createProjectWithFoundation 能力，不重新实现另一套生成引擎。

前端需要将 Foundation Candidate 转换为用户可理解的“开书方案”。

用户必须先选择方案，再正式应用。

禁止暴露 Foundation、Candidate、Run 等内部术语。

创建完成后进入：

/books/:id/dashboard
```

---

# 49. Codex Phase 4 提示词

```text
执行 Phase 4：实现 WritingPage V2。

不要删除原 Studio。

新增 /books/:id/write/:chapterId。

页面三栏：

左：
章节树。

中：
正文编辑器。

右：
本章 / AI / 检查。

第一阶段继续使用 textarea，不更换 ProseMirror。

必须复用现有：

Draft
Autosave
Version
Selection
AI chapter run
Edit proposal
Review
Candidate acceptance

实现用户动作：

续写
重写
扩写
压缩
优化对话
加强冲突
加强爽点
加强悬念
去 AI 味
自定义

所有 AI 操作必须生成候选结果，不直接覆盖正式正文。

选区 AI 使用浮动工具条。

Run 状态通过任务中心或轻量状态展示，不进入 Runs 页面。

新增完整 E2E。
```

---

# 50. 最终产品判断标准

未来每一个功能设计都用一个问题判断：

> **一个普通网文作者，需要先理解 AI 系统才能使用这个功能吗？**

如果答案是：

**需要。**

说明产品层还没有抽象完。

正确状态应该是：

作者只看到：

```text
我要写下一章
我要把这里改得更爽
我要看看有没有吃书
我要规划后面五章
我要检查这一章能不能发
```

系统内部再决定：

```text
Context
Harness
Writing Skill
Agent Skill
Run
Candidate
Review
Canon
Persistence
```

---

# 51. 最终架构定位

重构完成以后，整个系统应形成三层。

```text
┌────────────────────────────┐
│       作者创作体验层        │
│                            │
│ 作品 / 大纲 / 写作 / 设定   │
│ 质检 / 发布 / 数据          │
└─────────────┬──────────────┘
              │
┌─────────────▼──────────────┐
│       AI 创作编排层         │
│                            │
│ 开书策划 / 章节规划 / 写作   │
│ Review / Skills / Assistant │
│ Autopilot / Run / Candidate │
└─────────────┬──────────────┘
              │
┌─────────────▼──────────────┐
│      小说领域基础设施层      │
│                            │
│ Story Bible / Domain        │
│ Context / Persistence       │
│ Version / Recovery / LLM    │
└────────────────────────────┘
```

NarraLume 已经完成了相当一部分第二层和第三层。

本次项目真正需要投入最多精力的是：

> **第一层。**

第一阶段甚至可以暂时不增加新的 AI 能力。

只需要把已有能力重新组织成：

**普通作者看得懂、学得会、愿意每天打开的创作软件。**

这本身就是一次足够大的产品升级。

这份可以直接作为仓库里的 `docs/REFACTOR_MASTER_PLAN.md` 初稿。比较合适的实际开工顺序是 **Phase 0 → Phase 1 → Phase 2 → Phase 4 写作台**，先别急着做数据复盘；写作台一旦重构成功，整个产品的“手感”基本就定下来了。
