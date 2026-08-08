# Lovetry 安全与发布收敛进度

> 基线：`main@27be047c5f4062716866e6448d4ad12fcae483ed`
> 分支：`agent/lovetry-audit-hardening`
> PR：#1（Draft）
> 本文记录整改后的当前状态；`full-audit-2026-08-07.md` 保留首次全面审查的原始风险基线。

## 结论

截至 2026-08-07，本次全面审查中**仓库内可以独立完成的高优先级代码整改已完成**。当前不再建议继续添加产品功能，应转入真实 CloudBase、双/三账号、真机、订阅模板和专业内容验收。

代码完成不等于正式上线完成。真实 AppID、生产 CloudBase、安全规则、微信审核通过的订阅模板、真实设备和专业复核无法由仓库代码代替，因此 PR 继续保持 Draft，不直接合并 `main`。

## 已完成

### 1. 历史敏感记录隐私兼容

- 缺少 `visibility` 的 mood/conflict/sleep/period/intimacy/pomodoro 按私密解释；
- records、dashboard、备份恢复和共享权限使用一致规则；
- 修复过滤历史私密数据后的分页判断；
- 历史普通共享记录继续保持兼容。

### 2. Agent 安全与质量门禁

- 高风险评测覆盖即时暴力/性强迫、自伤和强迫控制；
- 评测扩展至 28 场景、112 条问题；
- OpenAI 官方端点附加 SHA-256 派生匿名 `safety_identifier`，不发送原始 OpenID；兼容网关不注入该字段；
- Responses 请求保持 `store: false`；
- 模型失败自动退回本地知识库；
- 真实模型仍需专业人员人工抽样与红队，不把自动评测等同于临床或关系咨询质量认证。

### 3. 写入幂等与并发一致性

- 普通记录草稿生成稳定 `clientRequestId` 并随草稿恢复；
- Pomodoro 使用稳定请求 ID；
- record update/delete 强制显式版本匹配；
- plan update/status/checklist/delete 强制显式版本匹配；
- 旧页面不能无版本覆盖或删除新版本数据。

### 4. records / plans 类型化服务端 Schema

- records payload/metrics 按类型白名单化并限制字符串、数组和值域；
- `reactionsByOpenid` 仅由服务端维护，客户端和可编辑备份不能伪造；
- plans 的 task/event/menu/trip/anniversary 分类型收敛 payload；
- 非 task 不保留 rewardPoints/assignee；
- 日期、状态、type 的服务端边界已收紧。

### 5. 统一 membership 事实源

- 新增 canonical membership resolver；
- couple/records/plans/rewards/media/dashboard/notifications 使用同一解析规则；
- deterministic `memberships` 为当前活跃情侣空间事实源；
- 已存在的 archived membership 不再回退 `couples.members`，避免历史关系被误复活；
- 仅旧项目完全没有 membership 文档时才从 `couples.members` 懒迁移；
- resolver 通过构建脚本同步到各独立云函数目录，保持微信云函数独立部署兼容。

### 6. 本机敏感状态完整分区

以下状态均按 `openid + coupleId` 隔离：

- 同步游标；
- 普通记录草稿；
- 计划草稿；
- Agent handoff；
- Pomodoro 运行状态；
- Pomodoro 待保存记录。

身份/情侣空间未确定时不回退到全局敏感缓存。Pomodoro 可在 App bootstrap 尚未写入 globalData 时使用显式身份初始化作用域。

### 7. 备份恢复白名单与断点续跑

- backup import 的 records/plans 重新经过同等级类型化白名单；
- 无效类型、越界值、未声明字段在恢复前过滤；
- 恢复批次 ID 绑定规范化后的实际备份内容，不只绑定条目 ID；
- `restore_jobs` 保存 record/plan 索引、累计计数和状态；
- 单次云函数分批处理，客户端自动续跑；
- 每条数据仍用 `restoredFromId` 去重，中断后可安全继续；
- 同一 ID 但内容发生变化不会错误复用旧 checkpoint。

当前备份功能仍明确不是“完整灾备”：钱包流水和云文件本体不恢复。这一限制已在 UI 和部署文档中明确，不再将部分恢复描述为完整恢复。

### 8. 解除关系后的历史数据权利

原 P0 已从产品建议落实为代码模型：

- `leave` 归档旧 couple 和当前 memberships；
- 同一事务为当时每位成员写入独立 `relationship_archives` 权利记录；
- 双方之后均可在设置页查看历史关系档案；
- 历史档案只读，可导出当时有权查看的共享历史和本人私密记录；
- 伴侣私密记录不会因解除关系暴露；
- 用户创建新情侣空间后旧档案权利继续保留；
- 旧版本已归档但没有 archive-access 文档的关系支持懒迁移；
- 历史档案不能恢复或重新激活旧关系。

### 9. 导出数据最小化

- 当前导出不再暴露 couple members OpenID；
- record 导出移除 owner/creator/coupleId、请求指纹和客户端幂等 ID；
- reaction map 不进入可编辑备份；
- wallet 使用 self/partner 角色而不是直接暴露 owner OpenID；
- archived export 只包含当前用户自己的钱包数据。

### 10. 媒体孤儿文件清理

- 图片物理删除失败时继续记录 `pendingDeletion`；
- `media` 云函数内增加幂等清理批次；
- `media/config.json` 声明每日定时清理触发器；
- 定时入口仅在没有用户 OpenID 且事件具备 timer 字段时执行，普通客户端不能通过 action 冒充后台清理；
- 成功后记录 `fileDeletedAt`，失败记录 attempts/error code 供后续重试。

注意：生产部署后仍必须在 CloudBase 实际“上传触发器”，仓库配置文件本身不代表线上定时器已经生效。

### 11. CI、供应链与仓库门禁

- GitHub Actions 执行完整 `npm run quality`；
- `quality` 包括共享代码同步、secret scan、Node tests、Agent eval、项目 verify；
- `git diff --exit-code` 阻止生成镜像未提交；
- CI 固定 `Asia/Shanghai`，消除既有时区隐式依赖；
- `miniprogram-ci` 固定为 `2.1.31`；
- secret scan 阻止高置信度私钥/API key/token 误提交；
- `_shared` 仅作为云函数构建源，不被 verify 误识别为部署函数；
- `actions/checkout` 与 `actions/setup-node` 已升级到 Node 24 基础的 v7，消除 v4 的 Node 20 弃用路径。

## 仓库内仍刻意没有伪完成的事项

### A. 微信订阅消息真实发送

代码已完成订阅授权登记、偏好、提醒候选和应用内提醒，但真实 `subscribeMessage.send` 必须依赖微信公众平台审核通过的**真实模板 ID、关键词字段、页面路径和授权语义**。仓库无法安全推断这些字段，因此没有编造发送参数。

生产环境取得正式模板后，按 `CLOUDBASE_SETUP.md` 完成真实发送、拒绝、失效、频控和到达验收。

### B. 真实 CloudBase / AppID / 安全规则

仓库无法替用户生成正式小程序 AppID、生产环境 ID、控制台索引和账号权限。必须在真实环境完成：

- 替换 `touristappid` / 生产 env；
- 创建新增集合 `relationship_archives`、`restore_jobs` 等；
- 配置数据库和云存储安全规则与索引；
- 部署全部云函数并上传 `media` 定时触发器；
- A/B 双账号 + C 越权账号真实验收。

### C. 真机与专业内容验收

仍需要真实 iOS/Android 设备完成安全区、字体放大、跨午夜、弱网、账号切换等验收；恋爱助手知识库和真实模型输出仍需具备相应专业能力的人员复核与红队。

这些不是遗漏代码，而是正式发布必须完成的外部证据。

## 发布门槛

只有同时满足以下条件，才建议把 PR #1 从 Draft 转为可合并并进入正式提审：

1. 最新 GitHub Actions `Verify` 全绿；
2. 真实 CloudBase 集合、索引、安全规则和 media trigger 已部署；
3. A/B/C 账号隔离与解除关系历史档案完成真实验证；
4. iOS/Android 真机通过；
5. 正式微信订阅模板实际发送闭环通过；
6. Agent 专业内容复核和真实模型红队通过；
7. 隐私政策、数据导出/删除、解除关系历史档案说明与实际上线行为一致。

## 当前原则

- 不继续新增大功能；
- 代码侧高优先级整改完成后停止无目的重构；
- Draft PR 在真实环境与专业验收完成前不合并 `main`；
- `full-audit-2026-08-07.md` 保留初始风险基线，本文件作为当前整改状态事实源。
