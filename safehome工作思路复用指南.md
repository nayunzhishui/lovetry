# safehome 工作思路复用指南：情侣小程序版

本文档用于把 `safehome1.0 / 安心陪伴` 项目的开发方法，复用到 `lovetry` 情侣小程序。

重点不是照搬 safehome 的心理学内容，也不是把 Flask + SQLite 强行搬过来，而是复用它的工作方式：

1. 先明确 MVP 核心闭环；
2. 先跑通最小数据流；
3. 先做联调测试页；
4. 再拆成正式页面；
5. 每次只做一个小任务；
6. 每次结束都写清楚：做了什么、怎么运行、怎么测试、下一步做什么。

## 1. 当前 lovetry 项目概况

项目路径：

```text
D:\codex\workspace\lovetry
```

当前小程序路径：

```text
D:\codex\workspace\lovetry\couple-miniprogram
```

当前技术路线：

- 微信原生小程序；
- 微信云开发；
- 云函数；
- 云数据库；
- 不使用 Flask；
- 不使用 SQLite；
- 暂不引入复杂 UI 组件库。

当前已有主要功能：

1. 创建情侣空间；
2. 使用 6 位加入码加入情侣空间；
3. 记录恋爱经历；
4. 记录吵架复盘；
5. 时间线查看双方记录；
6. 云函数保存和读取数据。

当前已有页面：

- `pages/index/index`：首页、恋爱经历记录入口；
- `pages/conflict/conflict`：吵架复盘表单；
- `pages/timeline/timeline`：记录时间线；
- `pages/settings/settings`：创建或加入情侣空间。

当前已有云函数：

- `login`：获取当前用户 `openid`；
- `couple`：创建、加入、查询情侣空间；
- `records`：创建和查询恋爱记录 / 吵架复盘记录。

## 2. safehome 的可复用工作法

safehome 已经验证过一条适合新手和小项目的路线：

```text
项目定位 -> MVP 闭环 -> 最小后端/数据层 -> API/调用层 -> 联调页 -> 手动验证 -> 正式页面
```

迁移到 lovetry 后，可以变成：

```text
情侣使用场景 -> MVP 闭环 -> 云函数/云数据库 -> 小程序调用层 -> 联调页 -> 微信开发者工具验证 -> 正式页面
```

也就是说：

- safehome 的 `backend` 对应 lovetry 的 `cloudfunctions`；
- safehome 的 `SQLite` 对应 lovetry 的云数据库集合；
- safehome 的 `apps/miniprogram/services/api.js` 对应 lovetry 的小程序云函数调用封装；
- safehome 的最小联调页，对应 lovetry 的情侣小程序联调页；
- safehome 的 `docs/开发日志.md`、`docs/当前进度交接.md`、`docs/开发说明.md`，对应 lovetry 也应该补齐类似文档。

## 3. lovetry 的 MVP 1.0 核心闭环

建议把情侣小程序 MVP 1.0 定义为：

```text
创建情侣空间 -> 邀请另一半加入 -> 记录恋爱经历 / 吵架复盘 -> 时间线共同查看 -> 复盘沟通结果 -> 保留下一步约定
```

第一版不要做太多功能。

MVP 1.0 只围绕以下问题：

1. 两个人能不能进入同一个情侣空间？
2. 能不能保存一条恋爱经历？
3. 能不能保存一条吵架复盘？
4. 能不能在时间线看到记录？
5. 记录内容是否能帮助双方更清楚地复盘，而不是继续互相指责？

## 4. 当前 lovetry 和 safehome 的对应关系

| safehome 做法 | lovetry 对应做法 |
|---|---|
| Flask 后端 API | 微信云函数 |
| SQLite 数据库 | 微信云数据库 |
| `content/feedback_rules.json` | 后续可增加沟通提示规则库 |
| `content/training_cards.json` | 后续可增加情侣沟通练习卡 |
| 小程序联调测试页 | lovetry 也应新增一个联调测试页 |
| 开发日志 / 交接文档 / 开发说明 | lovetry 也应建立同类文档 |
| 非诊断、支持性反馈 | 非评判、非站队、促进沟通的反馈 |

## 5. lovetry 建议补齐的项目结构

当前已有：

```text
couple-miniprogram/
  cloudfunctions/
    login/
    couple/
    records/
  miniprogram/
    pages/
    app.js
    app.json
    config.js
```

建议补齐：

```text
docs/
  当前进度交接.md
  开发日志.md
  开发说明.md
  云开发配置说明.md
  数据库字段说明.md
  MVP1.0功能边界.md

content/
  communication_prompts.json
  conflict_review_rules.json

shared/
  constants.js
  mock-data.js
```

说明：

- `docs` 用于新开 Codex 对话时快速接续；
- `content` 用于放情侣沟通提示、吵架复盘规则、练习卡等内容；
- `shared` 用于放页面和云函数都要参考的字段、状态、常量和 mock 数据。

第一步不一定全部创建，但建议后续按这个方向整理。

## 6. lovetry 下一步最小开发顺序

不要一上来做复杂页面，也不要先做 AI。

建议按 safehome 的方式小步推进：

### 第一步：补齐文档

先新增：

```text
D:\codex\workspace\lovetry\docs\当前进度交接.md
D:\codex\workspace\lovetry\docs\开发日志.md
D:\codex\workspace\lovetry\docs\开发说明.md
```

写清楚：

- 项目是什么；
- 当前完成了什么；
- 现在能运行到哪一步；
- 下一步只做什么；
- 怎么导入微信开发者工具；
- 云开发环境怎么配置。

### 第二步：补一个小程序联调测试页

safehome 的经验是：不要先做正式页面，先做联调页。

lovetry 可以新增：

```text
pages/integration-test/index
```

这个页面只验证 4 步：

1. 调用 `login`，拿到 openid；
2. 调用 `couple`，创建或读取情侣空间；
3. 调用 `records`，创建一条测试记录；
4. 调用 `records`，读取时间线记录。

如果这 4 步通过，再开发正式页面。

### 第三步：整理云函数调用层

当前页面里直接写了 `wx.cloud.callFunction`。

后续可以像 safehome 的 `services/api.js` 一样，封装成：

```text
miniprogram/services/cloudApi.js
```

里面放：

```js
login()
getMyCouple()
createCouple()
joinCouple(code)
createRecord(record)
listRecords()
```

这样页面就不会到处写重复的云函数调用。

### 第四步：正式页面小步重构

按顺序做：

1. 首页：只显示当前情侣空间状态和 3 个入口；
2. 恋爱经历记录页：只保存普通经历；
3. 吵架复盘页：先保留现在的表单，不急着复杂化；
4. 时间线页：只负责展示记录；
5. 设置页：只负责创建和加入情侣空间。

每次只改一个页面。

## 7. 情侣小程序的内容与伦理边界

lovetry 不是心理诊断工具，也不应判断谁对谁错。

所有提示语应该遵守：

- 不诊断；
- 不贴标签；
- 不站队；
- 不鼓励控制、监控、报复；
- 不把一方写成“有问题的人”；
- 聚焦事实、感受、需求和下一步约定。

不要写：

- “对方就是冷暴力人格”；
- “你们关系已经不健康”；
- “你应该立刻分手”；
- “这是典型控制型伴侣”；
- “你赢了这次争吵”。

更适合写：

- “这条记录可以先区分事实和解释。”
- “你们可以分别写下当时最强烈的感受。”
- “下一步可以先约定一个可执行的小动作。”
- “如果出现人身安全风险、威胁、暴力或持续恐惧，请优先联系可信任的人或专业机构。”

## 8. lovetry 的 MVP 边界

第一版建议做：

- 情侣空间；
- 恋爱经历；
- 吵架复盘；
- 时间线；
- 基础云开发同步；
- 最小联调测试页；
- 基础文档。

第一版暂时不要做：

- AI 自动评判谁对谁错；
- 情绪诊断；
- 复杂社交；
- 公开视频或语音；
- 支付；
- 社区；
- 匿名匹配；
- 复杂权限系统；
- 过度美化页面。

## 9. 每次开发结束必须更新的内容

建议 lovetry 也采用 safehome 的三份文档规则：

```text
docs/开发日志.md
docs/当前进度交接.md
docs/开发说明.md
```

每次结束都写：

1. 本次完成了什么；
2. 修改了哪些文件；
3. 运行命令是什么；
4. 测试命令是什么；
5. 当前能运行到哪一步；
6. 已知问题；
7. 下一步建议；
8. 零基础用户应该怎么理解本次内容。

## 10. 新开 Codex 对话启动提示词

以后新开 lovetry 对话，可以这样发：

```text
请继续 lovetry 情侣小程序项目，项目路径为 D:\codex\workspace\lovetry。

请先阅读：
1. safehome工作思路复用指南.md
2. 小程序制作教程与复现指南.md
3. couple-miniprogram/project.config.json
4. couple-miniprogram/miniprogram/app.json
5. couple-miniprogram/miniprogram/app.js
6. couple-miniprogram/miniprogram/pages/index/index.js
7. couple-miniprogram/cloudfunctions/couple/index.js
8. couple-miniprogram/cloudfunctions/records/index.js

当前目标不是做复杂页面，也不是接入 AI，而是按照 safehome 的工作思路，先补齐 lovetry 的文档和最小联调测试页，确认 login、couple、records 三类云函数可以跑通。

要求：
1. 每次只做一个小任务；
2. 改动前先说明计划；
3. 不要引入复杂 UI 库；
4. 不要加入 AI 评判谁对谁错；
5. 所有情侣沟通提示必须非评判、非站队、非诊断；
6. 任务结束后更新 docs/开发日志.md、docs/当前进度交接.md、docs/开发说明.md。
```

## 11. 推荐下一步

下一步建议先做：

```text
为 lovetry 创建 docs/当前进度交接.md、docs/开发日志.md、docs/开发说明.md
```

然后再做：

```text
新增 pages/integration-test/index，用来验证云函数最小闭环
```

不要直接开始做正式情侣页面。先跑通最小闭环，再页面化。
