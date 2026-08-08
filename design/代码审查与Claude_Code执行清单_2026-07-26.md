# 情侣小程序独立审查报告 + Claude Code 执行清单

> 审查日期：2026-07-26
> 审查范围：`couple-miniprogram/`（14 主包页 + 3 分包页、9 个云函数、21 个 shared 模块、tests/、evals/），并对照《情侣小程序开发计划.md》《项目执行记录.md》逐项核对。
> 审查方式：三名独立审查视角（前端 UI/UX、后端安全架构、产品功能设计）并行审查真实代码，全部结论附文件路径证据。

---

## 一、总体评价

**实现完成度很高，文档诚实度也高。** 对照开发计划抽查 14 个模块声明，仅发现 1 处文档与代码不符（番茄钟"自定义时长"实际固定 25/5 分钟）。权限模型扎实：每个云函数 action 的 couple 归属校验无一遗漏，私密记录过滤下推到数据库查询层，关键路径全部使用事务 + 确定性文档 ID 幂等，搜索走内存匹配从根上避开正则注入。隐私与心理安全设计（默认私密、奖励双向同意、Agent 授权上下文）是同类产品罕见的长板。

**真正的系统性风险集中在四处：**

1. **时区假设错误（P0）**——全部日期逻辑默认北京时间，但微信云函数容器运行在 UTC。实测：`node --test tests/` 在 UTC 下 4 个用例失败，仅 `TZ=Asia/Shanghai` 全过。上线即产生"今日计划边界在早 8 点"、纪念日提醒错位一天等问题。
2. **删除语义不闭环（P0）**——sync 把记录删除墓碑全部过滤掉（伴侣设备缓存永不删除）；`cloud.deleteFile` 失败静默；`pendingDeletion` 无任何清理机制。对主打私密记录的情侣应用，这是信任问题。
3. **双人回路可见性缺失（产品 P0）**——三套"伴侣确认制"设计完整，但对方根本不知道有事等他确认：无首页待办卡、无 badge、无主动通知。通知触达实际为零（提醒是用户打开页面时"自己提醒自己"）。
4. **获客第一公里粗糙（产品 P0）**——邀请码纯文本无复制无分享；未绑定用户进 records/calendar/plans/rewards/albums 全部显示"加载失败+重新加载"（重试永远失败），TabBar 四个入口三个是死路。

UX 层面：双轨视觉和文案质感出色，但首页塞了 11 个区块、长列表硬截断 50 条无分页、timeline 无加载/错误态、暗色模式"写了等于没写"（app.json 未声明 darkmode，且启用后会白底白字）、state-view 组件建好了但主包零使用（五套空态写法并存）。

---

## 二、功能实现情况核对表

| 模块 | 状态 | 说明 |
|---|---|---|
| 情侣绑定/解绑 | ✅ | 事务归档、邀请码即失效。缺：码无复制/分享、解绑单方即时且伴侣无感知 |
| 记录 8 类（生活/心情/沟通/玩乐/睡眠/生理期/亲密/游戏） | ✅ | 类型专属 payload、默认可见性与计划一致、亲密含同意文案 |
| 计划任务/事件/清单 | ✅ | 负责人、版本并发、清单优先布局 |
| 纪念日 | ✅ | 循环 + 提前提醒 + 闰日回退；缺创建空间时的引导设置 |
| 日历 | ✅ | 8 类筛选、生理期范围着色、双入口。缺：计划结果不落点 |
| 奖励积分 + 商店 | ✅ | 双钱包、幂等、拒绝自我结算、提案确认全状态机、违禁奖励拦截 |
| 相册 | ⚠️ | 功能完整；云存储私有规则、第三账号验证属外部冻结项 |
| 番茄钟 | ⚠️ | 状态机完整；文档声称可自定义时长但代码固定 25/5（P13-13 不符） |
| 搜索 | ✅ | 关键词/来源/类型/日期；计划结果只跳列表页 |
| 导出/备份/恢复 | ✅ | v2 摘要校验、去重、限制明示 |
| 通知订阅 | ⚠️ | 仅拉取式站内提醒；订阅模板空、无发送代码、无定时触发器——无主动触达能力 |
| 恋爱 Agent | ✅ | 三模式、授权上下文、每日限额、降级回退；history 有安全绕过面（见 A4） |
| 菜单/旅行 | ✅ | 随机选择避重、完成自动生成玩乐记录 |
| 数据同步 | ✅ | 增量游标 + 30s 轮询；但删除墓碑被过滤（见 A3） |
| 时间线 + 轻回应 | ✅ | 三种 reaction 幂等写入；入口极弱（首页底部一个小文字链） |
| 记录洞察/周期估算 | ✅ | ≥3 周期中位数估算 + 非医疗声明 |
| 残留 | ⚠️ | `pages/conflict/` 空目录；integration-test 在正式主包内 |

---

## 三、给 Claude Code 的执行任务

以下每个批次是一段可直接粘贴给 Claude Code 的完整指令。**建议按批次顺序执行，每批完成后运行 `npm test` 回归。** 所有路径相对仓库根 `D:\codex\workspace\lovetry\`。

---

### 批次 A：后端安全与数据正确性（P0，最优先）

```text
请在 couple-miniprogram 项目中完成以下 6 项后端修复，改完后运行 npm test，并分别以 TZ=UTC 和 TZ=Asia/Shanghai 各跑一遍确认全部通过：

1.【时区修复】微信云函数容器默认 TZ=UTC，但全部日期逻辑假设北京时间。
   在全部 9 个云函数（cloudfunctions/couple、dashboard、login、love-agent、media、notifications、plans、records、rewards）的 index.js 顶部、任何 Date 调用和 cloud.init 之前，加上 process.env.TZ = "Asia/Shanghai";
   重点自查：cloudfunctions/dashboard/index.js:88-91 的 todayStart.setHours(0,0,0,0)、:139/147 的周年展开；cloudfunctions/notifications/schedule.js 的 localDate/nextYearlyDate；cloudfunctions/love-agent/index.js:35 用 toISOString().slice(0,10) 做每日配额键（这是 UTC 日期，与其余逻辑不一致，改为北京时间日期字符串）。
   同时修复 tests/calendar-view.test.js、tests/record-insights.test.js 等 4 个在 TZ=UTC 下失败的用例：在测试文件首行（任何 Date 调用前）固定 process.env.TZ = "Asia/Shanghai"。在 package.json 中增加一个 test:utc 脚本（TZ=UTC node --test tests/）纳入日常检查。

2.【visibility 静默重置】cloudfunctions/records/index.js:80-83 的 normalizeRecord 在 update 时，若请求不带 visibility 字段，会回落到"类型默认值"而不是保留现有值——一条被显式设为 private 的 moment/outing 记录，任何不带 visibility 的 update 都会翻转回 couple 可见（隐私泄露）。
   修复：normalizeVisibility 增加 existing 参数，优先级改为 输入值 > existing.visibility > 类型默认值。补一个单测：update 不带 visibility 时保留原值。

3.【删除墓碑不同步】cloudfunctions/dashboard/index.js:243 的 sync 分支用 canReadRecord 过滤结果，而 canReadRecord（:36-40）对 deletedAt 记录直接返回 false，导致记录删除永远不会同步到伴侣设备（本地缓存长期残留已删内容）。plans 的墓碑（:222 附近）是正常下发的，参照它修复：sync 分支单独写过滤器——deletedAt 存在时下发只含 _id/deletedAt/updatedAt 的瘦墓碑（不带 payload/title），否则走 canReadRecord。补单测。

4.【love-agent 安全绕过】cloudfunctions/love-agent/index.js:106-108 的 assessRisk 只检查 question+selectedContext，不检查 history——把高危内容放进 history、question 写"请继续"即可绕过拦截；且 prompt.js:1-7 允许客户端伪造 assistant 角色消息作注入锚点。
   修复：(a) 把 normalizeHistory(event.history) 全部 content 拼入 agentQueryText 后再 assessRisk；(b) 在 buildInput 中丢弃客户端声明的 assistant 角色（或把 history 包裹为"用户提供的不可信会话记录"）。在 evals/love-agent-scenarios.json 中补充 self_harm 和 coercive_control 各 4 个场景（当前 expectedRisk 只有 none 和 immediate_danger 两类），跑 npm run eval:agent 确认通过。

5.【云文件删除不闭环】cloudfunctions/media/index.js:184-198：cloud.deleteFile 单文件失败不会 reject，而是体现在返回值 fileList[i].status !== 0，当前只 catch 整体异常，pendingDeletion 几乎永远是 false；且全库没有任何机制消费 pendingDeletion=true。
   修复：(a) 检查 deleteResult.fileList 每项 status，非 0 时置 pendingDeletion=true；(b) 改为先软删 DB 记录再删文件，避免"文件已删、DB 失败"的反向不一致；(c) 在 media 云函数新增 action "purgePending"：扫描 pendingDeletion=true 的资产重试删除（上限 50 条/次），并在 CLOUDBASE_SETUP.md 中说明需为它配置每日定时触发器（config.json 的 triggers 示例一并写好）。

6.【幂等未启用】服务端 records 的 clientRequestId 幂等（records/index.js:160-183）实现完整，但客户端只有 pomodoro 用了它——普通表单双击保存、超时后手动重试都会产生重复记录。
   修复：在 miniprogram/services/cloudApi.js 的 createRecord 中，若调用方未传 clientRequestId 则不再放行；在 pages/record-form/record-form.js 进入页面时生成一次性 requestId（时间戳+随机数）存入 data，提交时携带，成功后重新生成，失败重试沿用同一 ID。首页快速记录表单（pages/index/index.js 的 moment 提交）同样处理。注意 miniprogram/shared/ 与根 shared/ 是同步复制关系，改动要跑既有的同步脚本/门禁。
```

---

### 批次 B：新用户第一公里 + 双人回路（产品 P0）

```text
请在 couple-miniprogram 项目中完成以下 4 项产品体验修复，改完运行 npm test：

1.【未绑定态全局引导】当前未绑定伴侣的用户进入 records/calendar/plans/rewards/albums 会直接调云函数、收到 COUPLE_REQUIRED 后渲染成"加载失败+重新加载"（重试永远失败）。
   修复：给 components/state-view 增加一种"未绑定"变体（文案如"先和 TA 建一个共同空间"，按钮跳 /pages/settings/settings）；在 pages/records、calendar、plans、rewards、albums 五个页面的错误分支识别 error.code === "COUPLE_REQUIRED"，渲染该引导而非通用错误态。这五个页面的 json 需注册 state-view 组件。

2.【邀请链路一键化】当前 8 位加入码只能肉眼抄写。
   修复：(a) pages/settings/settings.wxml 的加入码展示处（约 L17）和 pages/index/index.wxml 的空间卡（约 L26）加"复制"按钮，调 wx.setClipboardData；(b) settings 页实现 onShareAppMessage，分享路径带 ?inviteCode=XXX 参数，标题类似"来和我共建我们的小空间"；(c) settings.js onLoad 读取 options.inviteCode 自动预填加入输入框；(d) 创建空间后展示"等待对方加入"状态（couple.members.length < 2 时），替代直接显示完整功能。

3.【待确认事项聚合到首页】三套伴侣确认机制（奖励提案 proposed、任务积分待确认、仓库待兑现 pending）目前只有对方主动进 rewards/reward-store 页才能看见。
   修复：cloudfunctions/dashboard/index.js 的 summary 增加 pendingApprovals 计数（统计：reward-store 中状态为 proposed 且提案人不是本人的奖励 + 仓库中 pending 且需本人确认的条目 + 待本人确认积分的已完成任务）；pages/index/index.wxml 在指标区下方新增"有 N 件事等你确认"卡片，wx:if="{{pendingApprovals > 0}}"，点击跳 /features/reward-store/reward-store。同步更新 shared 与 miniprogram/shared 的相关纯模块及测试。

4.【同步提示升级为内容卡】app.js:100-102 发现远端更新只弹 toast"发现 N 项远端更新"，页面数据不刷新也不说明内容。
   修复：利用 shared/sync.js 已有的分类摘要能力，把同步结果写入 app.globalData.lastSyncDigest（形如 { records: 2, plans: 1, latestType: "mood" }）；首页同步状态条（pages/index/index.wxml L17 附近）展示可点击摘要，如"TA 更新了 2 条记录 · 去看看"，点击跳 /pages/timeline/timeline；首页 onShow 时若有新摘要则自动刷新当前数据。
```

---

### 批次 C：前端关键体验缺陷（P1）

```text
请在 couple-miniprogram/miniprogram 中完成以下 6 项前端修复，改完运行 npm test：

1.【长列表分页】records、timeline、rewards 三页固定 limit 50 且无翻页，旧数据永远不可见。参照 pages/albums/albums.js:162-180 已有的 hasMore/loadingMore/offset 模式：
   - pages/records/records.js（:93 limit:50）加 onReachBottom 追加加载；
   - pages/timeline/timeline.js（:36 listSharedFeed 无分页参数）同样处理，cloudApi 和 dashboard 云函数的对应 action 需支持 offset；
   - pages/rewards/rewards.js（:113 limit:50 流水）同样处理；
   - 三页列表尾部渲染"加载更多中… / 没有更多了"。

2.【timeline 缺状态渲染】pages/timeline/timeline.wxml 只判断 records.length，isLoading 和 error 被 set 但从未渲染——首屏闪"空态"、失败后永远停在空态。改为四分支：isLoading 骨架 → error 错误+重试按钮（bindtap 重新加载）→ 空态 → 列表。

3.【首页三态】pages/index/index.wxml:9-14 用 wx:if="{{!couple}}" 同时覆盖"未绑定/加载中/加载失败"，弱网下用户先看到"还没有情侣空间，去创建"的误导文案。改为三分支：isLoading 骨架 → error 错误+重试（bindtap="loadCouple"）→ !couple 才显示创建引导。

4.【moment 不可编辑】pages/record-detail/record-detail.js:14 的 EDITABLE_TYPES 漏了 "moment"，导致生活日记进详情页显示"这类记录暂不支持修改"，与 record-form 能力矛盾。把 "moment" 加入集合（pomodoro 保持只读）。

5.【计划跳转落点】pages/search/search.js:91-98 和 pages/calendar/calendar.js:169-175 打开计划类结果只跳 /pages/plans/plans 列表页。修复：跳转 URL 携带 ?type=xxx&planId=xxx；plans.js onLoad 记录 options.planId，数据加载完成后用 wx.pageScrollTo({ selector: "#plan-" + planId }) 定位（wxml 中每张计划卡加 id="plan-{{item._id}}"），并给目标卡 2 秒高亮样式。

6.【首页减负】pages/index/index.wxml 一屏 11 个区块且有重复入口：
   - 删除 home-links 区块（约 L96-99），其中 timeline 入口移入 nav-grid 宫格，替换宫格中与快捷动作重复的"沟通复盘"；
   - 底部内嵌"留下共同经历"表单改为一颗"写今天"按钮跳 /pages/record-form/record-form?type=moment，并删除 index.js 中整套 momentDraft 相关逻辑；
   - 删除 index.js:193-195 的死代码 goMoment()（全库无绑定，且用 scrollTop:999 魔法数）。
```

---

### 批次 D：后端加固（P1/P2）

```text
请在 couple-miniprogram/cloudfunctions 中完成以下 7 项加固，改完运行 npm test：

1.【membership 快路径复用】records/rewards/plans/media/dashboard/notifications 六个云函数各自用 couples.where({members: openid, status:"active"}) 全表查询找空间，只有 couple/index.js:71-94 用了 memberships 哈希主键 O(1) 查找。把 couple 的 membership 查找逻辑提取为共享模块（cloudfunctions 各自目录复制或用共享层，遵循项目现有的模块同步机制），六个函数全部改用；同时在 CLOUDBASE_SETUP.md 补充必建索引清单：couples(members,status)、records(coupleId,createdAt)、records(coupleId,updatedAt)、plans(coupleId,updatedAt)、reward_transactions(coupleId,createdAt)。

2.【dashboard 错误白名单】cloudfunctions/dashboard/index.js:13-18 的 failure() 把原始 error.message 直接回传前端（可能含数据库内部细节）。参照 records/index.js:48-58 的 ERROR_MESSAGES 白名单模式改造，未知错误一律返回 INTERNAL_ERROR。

3.【redeem 流水覆盖风险】cloudfunctions/rewards/index.js:265-266 的 redeem 流水 ID 与 grant/spend 共用 transactionId(couple._id, stableKey) 命名空间，且 :295 用 transaction.set（覆盖语义），查重只查 reward_inventory——撞 key 时会静默覆盖历史流水并二次扣钱包。修复：redeem 流水 ID 改为 transactionId(couple._id, "redeem:" + stableKey)，并在事务内先 get 查重 reward_transactions（参照 applyTransaction 的做法）。

4.【settleTask 幂等键】rewards/index.js:386 用固定键 task:${task._id}:reward，任务 done→todo→done 二次结算会静默返回旧流水（不加分）；改过分值则永久报 IDEMPOTENCY_CONFLICT。修复：幂等键加入完成轮次（task:${id}:${completedAt.getTime()}）；同时把定义了但从未抛出的 REWARD_ALREADY_SETTLED（:16）用起来：检测到同轮 duplicate 时抛该错误码。

5.【couple 事务吞错】couple/index.js:143-148、171-177 的 catch 把 membership 读取的任何 DB 异常都当"文档不存在"处理，极端情况下可绕过"已在空间"校验创建第二空间。修复：仅吞掉 CloudBase "文档不存在"错误（errCode -502004 或 message 含 document.get:fail），其余 rethrow。

6.【payload 防护】records/index.js:100-101 和 plans/index.js:78 接受任意 payload/metrics 对象：owner 可通过 update 覆盖/清空伴侣写入的 payload.reactionsByOpenid，超大 payload 可撑爆文档。修复：update 时从输入 payload 中剥离 reactionsByOpenid 并保留 existing 值；对 payload 和 metrics 做 JSON.stringify 长度 ≤ 16KB 校验，超限抛 INVALID_INPUT。

7.【写操作超时】shared/retry.js:35-40 写操作 timeoutMs:0 意味着悬挂的写请求 UI 永远 loading。改为写操作 20 秒超时但保持 retries:0，超时错误文案为"结果未知，请刷新确认后再试"（防止用户盲目重试造成重复）；react、redeemItem 这类已有服务端幂等键的写操作可开启 1 次重试。同步更新 miniprogram/shared/retry.js 与相关测试。
```

---

### 批次 E：视觉与工程收敛（P2）

```text
请在 couple-miniprogram 中完成以下 8 项收敛，改完运行 npm test 并跑项目既有的结构门禁脚本：

1.【暗色模式定断】当前 app.json 未声明 darkmode，全部 prefers-color-scheme:dark 样式不生效；而一旦启用，filter-chip--active、day--selected、album-pill--active 等会白底白字。请选方案 A 正式启用：app.json 加 "darkmode": true 和 "themeLocation": "theme.json"，新建 theme.json 配置导航栏/tabBar 双主题色；在 app.wxss 新增语义变量 --chip-active-bg/--chip-active-ink（亮色 = var(--ink-strong)/#fff，暗色反转），把 pages/records/records.wxss:31-35、pages/calendar/calendar.wxss:62-65、pages/albums/albums.wxss、pages/search/search.wxss、pages/rewards/rewards.wxss:356 中所有"选中态深底白字"改用这两个变量。如工作量评估超出预期则改选方案 B：删除全库所有 dark 媒体查询，明确只支持浅色（二选一，不要保留半成品）。

2.【tabBar 图标】app.json:30-41 四个 tab 无 iconPath。用代码生成 8 张 81x81 PNG 线性图标（今天=太阳、日历=日历格、记录=书页、我们=双心；常态 #68767A、选中 #1F2D31，风格与"奶油纸张"一致，可用 sharp 或 canvas 脚本生成），放 miniprogram/assets/tabbar/，补全 iconPath/selectedIconPath。

3.【state-view 收敛】components/state-view 目前只有 3 个分包页在用，主包五套空/错/载写法并存。给 state-view 增加 variant 属性（loading/empty/error/unbound），在 records、plans、rewards、timeline、albums、search、export、record-detail 注册并替换手写状态块；把 export/search/albums/love-agent 四处逐字复制的 .error-banner 样式收敛到 app.wxss。

4.【两代色板统一】全库替换旧色：#b77932→#C49A4A、#718577→#738E78、#ded6c9→#D6DFDC（出现在 pages/record-form/record-form.wxml slider 属性、pages/plans/plans.wxml:87、pages/timeline/timeline.wxss:36、app.wxss:185 等）；slider 的 activeColor 不支持 CSS 变量，在 shared/constants.js 导出 SLIDER_COLORS 常量绑定到 wxml；删除 app.wxss 中完全重复的 --brass/--moss 别名（全库改用 --amber/--sage）；components/ 四个组件的硬编码色改用全局 CSS 变量（自定义属性可穿透组件边界），删除组件内独立的 dark 媒体查询。

5.【日期格式统一】新建 shared/format-date.js 导出 formatDate/formatDateTime/formatDay，替换 timeline.js:14 的 toLocaleString()（安卓/iOS 输出不一致，必须换）、records.js、record-detail.js、rewards.js 各自的手写格式。记得同步 miniprogram/shared/ 副本并补测试。

6.【integration-test 出主包】把 pages/integration-test 从 app.json pages 移除，改用 project.config.json 的 condition 配置本地编译时手动访问；或退而求其次在其 onLoad 首行判断 !config.enableDeveloperTools 时立即 wx.navigateBack()。同时删除 pages/conflict/ 空目录。

7.【触控与可读性】(a) pages/calendar/calendar.wxss:15 .today-button（48rpx）、:21-30 .month-button（64rpx）、pages/record-form/record-form.wxss:7 .draft-ribbon button（58rpx）统一用透明 padding 扩到最小 88rpx 命中区（视觉尺寸不变）；(b) pages/albums 照片上叠加的删除/封面小按钮改为长按照片弹 wx.showActionSheet；(c) 全库最小字号提到 22rpx（pages/albums/albums.wxss:13 photo-date 17rpx 必改），装饰性英文 eyebrow 可豁免但加 aria-hidden="true"。

8.【无障碍】records/calendar/plans 的 filter-chip、rewards.wxml:67-70 的 action-tabs、pomodoro 的 phase-switch 加 aria-role="tab" 和 aria-selected="{{active}}"；calendar.wxml:20 日期格加 aria-label="{{monthLabel}}{{item.day}}日{{item.eventCount ? '，' + item.eventCount + '项' : ''}}"；features/love-agent/love-agent.wxss:52 固定底部输入区的 textarea 加 cursor-spacing="20" 防键盘遮挡；pages/export/export.wxml:14 恢复备份 textarea 的 maxlength="-1" 改为 100000 并提示超限走文件导入。
```

---

### 批次 F：双人情感回路与留存（产品 P1，建议与批次 B 完成后做）

```text
请在 couple-miniprogram 中完成以下 4 项产品设计改进，改完运行 npm test：

1.【解绑冷静期】cloudfunctions/couple/index.js:231-263 目前单方确认即整空间立即归档，另一半下次打开直接失去所有数据且无任何通知。改为两阶段：leave 先把空间置为 status:"archiving" + scheduledPurgeAt（7 天后），期间发起方可撤销（新增 action cancelLeave）、双方仍可导出；写入一条 notifications 集合的站内提醒告知对方；到期后由 purgePending 定时任务（批次 A 第 5 项建的）执行最终归档。settings 页对应展示"解除中，N 天后生效，可撤销"状态。前端解绑弹窗前强制先跳导出页一次。

2.【绑定成功仪式】settings.js joinCouple 成功回调后，跳转一个三步引导流（可做成 settings 页内的状态或新增轻量页面）：a. "你们的空间建好了"庆祝语 → b. 设置在一起的日子（写入 anniversary 类型计划，repeatYearly）→ c. 展示"今天是第 1 天"并回首页。同时解决在一起天数长期为"—"的问题：首页该指标为空时，点击直达纪念日设置。

3.【reaction 回执】伴侣对你的记录点了"看见了/抱一下/一起加油"，你目前不会被告知。在 cloudfunctions/records 的 react action 成功后向 notifications 集合写入一条提醒（类型 reaction，对方 openid 为收件人）；notifications/schedule.js 的 materializeMine 已有拉取机制会带出；首页同步摘要卡（批次 B 第 4 项）把未读 reaction 数一并展示。

4.【今日一问】首页"今天想做什么"区新增"今日一问"轻仪式：从一个新建的静态题库（miniprogram/shared/daily-questions.js，50 条非诊断式互相了解问题，风格参考 love-agent 知识库的克制语气，按日期确定性轮换 index = 日期哈希 % 题库长度，双方同一天看到同一题）取题；双方各自回答（复用 records 集合，type:"moment"，payload.dailyQuestionId 标记，可见性 couple）；都答完前只显示"TA 已回答/未回答"，都答完后互见。不新增集合、不加推送，保持产品克制调性。
```

---

## 四、执行顺序与验收建议

1. **A → B → C** 是必做序列：A 保数据正确与隐私，B/C 决定新用户能否活过第一天。
2. **D、E 可穿插**：D 每项独立，适合零散时间；E 的暗色模式（E1）务必二选一定断，不要拖。
3. **F 在 B 之后做**：依赖 B 建立的通知/摘要通道。
4. 每批完成后固定跑：`npm test`（含新增的 `test:utc`）+ `npm run eval:agent` + 项目既有的共享模块同步/结构门禁脚本。
5. 以下事项 Claude Code 无法替你完成，仍是外部人工项（与执行记录一致）：真实 AppID 与 CloudBase 环境 ID（config.js 目前是占位符，全部云调用会失败）、控制台建索引与云存储规则、订阅消息模板申请、双账号/第三账号/真机验收、知识库专业复核。

---

## 附：本次审查发现但未列入批次的低优先事项

- 番茄钟补自定义时长，或修正《项目逐步开发清单.md》P13-13 的不实描述（二选一）。
- dashboard 统计/搜索基于"最近 N 条"内存过滤（summary 100 条、search 600 文档），数据增长后失真；改聚合查询或至少返回 truncated 标记。
- sync 分页在游标窗口内用 skip，翻页期间数据更新会漏读；可改键集分页（上一页末条 updatedAt+_id 作游标）。
- love-agent 知识库模式无速率限制（配额只在配置了 provider 时消耗）；provider.js 的 LOVE_AGENT_ALLOW_INSECURE_HTTP 开关建议删除，响应体累积加 1MB 上限。
- media deleteAsset 无 owner 校验（任一成员可删对方照片）——若是产品意图请在 PRIVACY.md 明示，否则加校验。
- dashboard import 串行逐条写入，500+500 上限下最多约 2000 次 DB 往返必超时；改批量查重 + 每批 20 条 Promise.all。
- 云函数 handler 层零测试；建议把每个云函数抽成 handle(event, openid, db) 可注入形态，用内存 fake db 补事务/幂等/权限路径测试。
- record-form.js 469 行管 8 类记录，建议收拢为 TYPE_REGISTRY 查表驱动（shared/record-types.js），降低"加一种类型改 8 处"的漏改风险。
- shared/permissions.js 的 canWrite 与云端 canEdit 语义有漂移（单 owner vs owner||creator），统一为一处实现。
