# CloudBase 配置与部署

## 1. 首次配置

1. 用微信开发者工具导入本目录，填写真实小程序 AppID；
2. 开通云开发环境；开发阶段可保持 `miniprogram/config.js` 占位值，此时使用开发者工具当前云环境；发布前改为真实环境 ID；
3. 创建集合：`couples`、`memberships`、`relationship_archives`、`records`、`plans`、`restore_jobs`、`wallets`、`reward_transactions`、`reward_items`、`reward_inventory`、`albums`、`media_assets`、`notification_preferences`、`notifications`、`record_reaction_requests`、`agent_usage`；
4. 数据库设置为“仅云函数可读写”；云存储读取保持私有，写入只允许已登录用户向本人路径上传；
5. 依次上传并部署 `login`、`couple`、`records`、`plans`、`rewards`、`media`、`dashboard`、`notifications`、`love-agent`，选择“云端安装依赖”；
6. `media/config.json` 已声明每日定时清理触发器。部署 `media` 后还必须在开发者工具或 CloudBase 控制台执行“上传触发器”，并确认 `daily-media-cleanup` 已实际存在。仓库中的 `config.json` 本身不代表线上触发器已经生效。

## 1.1 恋爱助手模型配置

不配置模型密钥时，`love-agent` 会继续使用本地知识库。密钥只能放在 `love-agent` 云函数环境变量中，不得写入小程序代码、Git 或前端存储。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `LOVE_AGENT_API_KEY` | 空 | 推荐的通用模型密钥；未设置时兼容读取 `OPENAI_API_KEY` |
| `LOVE_AGENT_API_STYLE` | `responses` | `responses` 或 `chat_completions` |
| `LOVE_AGENT_API_BASE` | `https://api.openai.com/v1` | API 基础地址，可指向经过审核的 OpenAI 兼容网关 |
| `LOVE_AGENT_API_PATH` | 按协议生成 | 可选相对路径覆盖，例如 `/responses` |
| `LOVE_AGENT_MODEL` | `gpt-5.6-luna` | 服务实际支持的模型 ID |
| `LOVE_AGENT_TIMEOUT_MS` | `12000` | 3000～30000 毫秒 |
| `LOVE_AGENT_MAX_OUTPUT_TOKENS` | `900` | 64～2000 |
| `LOVE_AGENT_CHAT_TOKEN_FIELD` | `max_tokens` | Chat Completions 可改为 `max_completion_tokens` 以适配新模型 |
| `LOVE_AGENT_ALLOW_INSECURE_HTTP` | `false` | 只允许本地调试临时设为 `true`；生产必须使用 HTTPS |

OpenAI Responses API 示例：

```text
LOVE_AGENT_API_KEY=<在 CloudBase 控制台填写，不写入文件>
LOVE_AGENT_API_STYLE=responses
LOVE_AGENT_API_BASE=https://api.openai.com/v1
LOVE_AGENT_MODEL=gpt-5.6-luna
```

- Responses 请求固定设置 `store: false`；
- 直接调用官方 `api.openai.com` 时，服务端会附加由 OpenID 单向哈希生成的 `safety_identifier`，不会发送原始 OpenID；兼容网关不注入该 OpenAI 专有字段；
- 每个 OpenID 每天最多触发 50 次真实模型请求，本地知识库模式不消耗配额；
- 模型失败会自动回退本地知识库；
- 云函数日志不记录问题正文、回答或密钥。

## 2. 推荐索引

| 集合 | 索引字段（按顺序） | 用途 |
|---|---|---|
| couples | `members`、`status` | 历史项目懒迁移与历史档案发现 |
| couples | `code`、`status` | 加入码查询与唯一检查 |
| memberships | 文档 ID 为 OpenID 哈希 | 当前活跃情侣空间的唯一事实源 |
| relationship_archives | `ownerOpenid` | 解除关系后的独立只读档案权利 |
| records | `coupleId`、`type`、`createdAt desc` | 记录列表和统计 |
| records | `coupleId`、`visibility`、`deletedAt`、`createdAt desc` | 共享记录 OR 分支 |
| records | `coupleId`、`ownerOpenid`、`deletedAt`、`createdAt desc` | 本人私密记录 OR 分支 |
| records | `coupleId`、`creatorOpenid`、`deletedAt`、`createdAt desc` | 兼容旧记录 OR 分支 |
| records | `coupleId`、`restoredFromId` | 恢复去重 |
| records | `coupleId`、`updatedAt asc` | 增量同步（dashboard sync）分页 |
| plans | `coupleId`、`type`、`createdAt desc` | 计划列表 |
| plans | `coupleId`、`status`、`updatedAt desc` | 待办与奖励确认 |
| plans | `coupleId`、`restoredFromId` | 恢复去重 |
| plans | `coupleId`、`updatedAt asc` | 增量同步（dashboard sync）分页 |
| restore_jobs | 文档 ID 为恢复内容摘要 | 分批恢复断点与累计计数 |
| wallets | `coupleId`、`ownerOpenid` | 钱包查询 |
| reward_transactions | `coupleId`、`ownerOpenid`、`createdAt desc` | 积分流水 |
| reward_items | `coupleId`、`status`、`createdAt desc` | 奖励商城列表 |
| reward_inventory | `coupleId`、`createdAt desc` | 奖励仓库列表 |
| albums | `coupleId`、`createdAt desc` | 相册列表 |
| media_assets | `coupleId`、`albumId`、`createdAt desc` | 相片分页 |
| media_assets | `pendingDeletion` | 定时清理删除失败残留的云文件 |
| notification_preferences | `coupleId`、`ownerOpenid` | 用户提醒偏好 |
| notifications | `coupleId`、`recipientOpenid`、`updatedAt asc` | 增量同步与提醒列表 |
| record_reaction_requests | 文档 ID 为幂等摘要 | 轻回应幂等请求 |
| agent_usage | 文档 ID 为 OpenID 与日期哈希 | 恋爱助手每日模型调用配额 |

加入码全局唯一由云函数生成前检查；控制台若支持唯一索引，应为 `couples.code` 增加唯一索引。

## 3. 权限与数据生命周期

- 小程序通过官方 `wx.cloud.uploadFile` 直传，不能把云存储写权限配置成“仅云函数”；
- 在控制台使用细粒度安全规则：仅认证用户可写，并将写入路径限制到 `couples/{coupleId}/{openid}/...` 中与当前 OpenID 一致的本人目录；
- 上传后，`media` 云函数还会校验 `fileID` 与 `cloudPath`、情侣空间和当前 OpenID 是否一致，再允许写入元数据；
- 上传路径为 `couples/{coupleId}/{ownerOpenid}/{随机名}`；
- 数据库只保存 `fileID`，页面展示时获取短期临时地址；
- 删除时先软删数据库记录再删云文件；`cloud.deleteFile` 的逐文件返回码非 0 或抛错都会保留 `pendingDeletion: true`；
- `media` 云函数已内置定时清理入口：部署时保留 `cloudfunctions/media/config.json` 中的 `purge-pending-deletions` 定时触发器（默认每日 04:00），触发后自动重试删除 `pendingDeletion: true` 的残留文件；也可用 `action: "purgePendingDeletions"` 手动清理本空间；
- `media_assets` 需为 `pendingDeletion` 建立单字段索引供定时清理扫描；
- 在云开发控制台配置容量和调用量告警，避免图片使用量失控。

### 当前关系

- `memberships` 是当前活跃空间唯一事实源；旧项目没有 membership 文档时才回退 `couples.members` 并懒迁移；
- 已存在但状态为 `archived` 的 membership 不会被旧 `couples.members` 查询重新激活；
- 敏感记录缺少历史 `visibility` 时仍按对应类型默认私密处理。

### 解除关系

- `leave` 会归档旧 couple，并为当时每个成员创建独立 `relationship_archives` 权利记录；
- 双方以后可分别从“设置 → 历史关系档案”只读导出旧空间中原本有权读取的数据；
- 本人私密记录仍只归本人；伴侣私密记录不会因归档而暴露；
- 创建新情侣空间不会覆盖旧档案权利；
- 历史档案不能恢复或重新激活旧关系。

### 备份恢复

- records/plans 恢复前重新经过类型化服务端白名单；
- 恢复批次按备份规范化内容生成摘要并记录在 `restore_jobs`；
- 每次云函数调用分批处理并持久化 checkpoint，客户端会自动续跑直到完成；
- 单条记录仍使用 `restoredFromId` 去重，因此网络中断后可安全继续；
- 当前备份恢复仍不恢复钱包流水与云文件本体，不能称为完整灾备。

## 4. 云存储与媒体清理

- 小程序通过 `wx.cloud.uploadFile` 直传；
- 控制台细粒度规则只允许认证用户写 `couples/{coupleId}/{openid}/...` 中属于本人的目录；
- `media` 云函数二次校验 `fileID`、`cloudPath`、情侣空间和当前 OpenID；
- 删除失败会标记 `pendingDeletion`；
- `media/config.json` 配置每日定时触发器，定时调用只处理已逻辑删除且 `pendingDeletion=true` 的文件，成功后记录 `fileDeletedAt`，失败保留重试状态；
- 定时触发器可能重复执行，清理逻辑必须保持幂等；
- 在控制台配置存储容量、函数错误率和调用量告警。

## 5. 微信订阅消息

仓库目前完成订阅授权登记、偏好、提醒候选生成和应用内提醒，但**未伪造真实微信模板发送**。正式发送需要微信公众平台实际审核通过的模板 ID、字段名和页面路径，这些不能从仓库安全推断。

上线前必须：

1. 在公众平台确定正式订阅模板及关键词字段；
2. 将模板 ID 和字段映射配置到生产环境；
3. 服务端调用订阅消息发送接口，处理拒绝、过期、频控和发送失败；
4. 用真实账号验证同意一次/长期订阅语义与实际到达；
5. 不得把未实际发送的应用内提醒标记为“微信消息已发送”。

## 6. 部署后真实验收

1. 体验版开启 Developer Tools，执行现有联调检查；发布前恢复关闭；
2. A 创建、B 加入；C 越权访问必须失败；
3. 验证共享记录同步和所有私密记录隔离；
4. 验证记录/计划在两台设备并发更新，旧版本必须返回 `VERSION_CONFLICT`；
5. 完成带积分任务，由另一方确认；重复确认不得重复加分；
6. 上传、预览、删除图片；模拟一次删除失败后确认 `daily-media-cleanup` 能清理 `pendingDeletion`；
7. 导出并恢复超过 25 条记录/计划的数据，确认客户端自动完成多批恢复；再次恢复应全部跳过；
8. A/B 解除关系后，两人都能看到旧档案；双方只能导出自己有权查看的数据；任一方创建新情侣空间后旧档案仍存在；
9. iOS、Android 真机检查安全区、字体放大、日期、跨午夜睡眠和 Pomodoro 恢复；同一手机切换账号时不得串用草稿/Agent/Pomodoro 状态；
10. 验证恋爱助手知识库模式、真实模型模式、每日配额、危险情境安全响应；
11. 验证正式微信订阅模板实际送达、拒绝和失效路径。

## 7. 发布前人工项

- 在微信公众平台补充媒体选择对应的隐私保护指引；
- 准备隐私政策、数据导出、数据删除和解除关系后的历史档案说明；
- `relationship_archives`、`restore_jobs`、媒体清理触发器、生产索引和安全规则全部在生产环境实配；
- 由具备相应专业能力的人员复核恋爱助手知识库、危机文案和真实模型抽样输出；
- 上传体验版进行连续双账号使用，再提交审核；
- 确认真实 AppID、生产环境 ID、订阅模板、用量告警均已配置。
