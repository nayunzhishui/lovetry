# CloudBase 配置与部署

## 1. 首次配置

1. 用微信开发者工具导入本目录，填写真实小程序 AppID；
2. 开通云开发环境；开发阶段可保持 `miniprogram/config.js` 占位值，此时使用开发者工具当前云环境；发布前改为真实环境 ID；
3. 创建集合：`couples`、`memberships`、`records`、`plans`、`wallets`、`reward_transactions`、`reward_items`、`reward_inventory`、`albums`、`media_assets`、`notification_preferences`、`notifications`、`record_reaction_requests`；
4. 数据库设置为“仅云函数可读写”；云存储读取保持私有，写入只允许已登录用户向本人路径上传；
5. 依次上传并部署 `login`、`couple`、`records`、`plans`、`rewards`、`media`、`dashboard`、`notifications`，选择“云端安装依赖”。

## 2. 推荐索引

| 集合 | 索引字段（按顺序） | 用途 |
|---|---|---|
| couples | `members`、`status` | 查询当前情侣空间 |
| couples | `code`、`status` | 加入码查询与唯一检查 |
| memberships | 文档 ID 为 OpenID 哈希 | 保证一个账号只属于一个活跃空间 |
| records | `coupleId`、`type`、`createdAt desc` | 记录列表和统计 |
| records | `coupleId`、`visibility`、`deletedAt`、`createdAt desc` | 共享记录 OR 分支 |
| records | `coupleId`、`ownerOpenid`、`deletedAt`、`createdAt desc` | 本人私密记录 OR 分支 |
| records | `coupleId`、`creatorOpenid`、`deletedAt`、`createdAt desc` | 兼容旧记录 OR 分支 |
| records | `coupleId`、`type`、`visibility/ownerOpenid/creatorOpenid`、`deletedAt`、`createdAt desc` | 类型筛选与统计；按控制台对 OR 各分支分别建索引 |
| records | `coupleId`、`restoredFromId` | 恢复去重 |
| plans | `coupleId`、`type`、`createdAt desc` | 计划列表 |
| plans | `coupleId`、`status`、`updatedAt desc` | 待办与奖励确认 |
| plans | `coupleId`、`restoredFromId` | 恢复去重 |
| wallets | `coupleId`、`ownerOpenid` | 钱包查询 |
| reward_transactions | `coupleId`、`ownerOpenid`、`createdAt desc` | 积分流水 |
| reward_items | `coupleId`、`status`、`createdAt desc` | 奖励商城列表 |
| reward_inventory | `coupleId`、`createdAt desc` | 奖励仓库列表 |
| albums | `coupleId`、`createdAt desc` | 相册列表 |
| media_assets | `coupleId`、`albumId`、`createdAt desc` | 相片分页 |
| notification_preferences | `coupleId`、`ownerOpenid` | 用户提醒偏好 |
| notifications | `coupleId`、`recipientOpenid`、`updatedAt asc` | 增量同步与提醒列表 |
| record_reaction_requests | `coupleId`、`recordId`、`actorOpenid` | 轻回应幂等请求 |

加入码的全局唯一由云函数生成前检查；CloudBase 控制台若支持唯一索引，应为 `couples.code` 增加唯一索引。

## 3. 云存储

- 小程序通过官方 `wx.cloud.uploadFile` 直传，不能把云存储写权限配置成“仅云函数”；
- 在控制台使用细粒度安全规则：仅认证用户可写，并将写入路径限制到 `couples/{coupleId}/{openid}/...` 中与当前 OpenID 一致的本人目录；
- 上传后，`media` 云函数还会校验 `fileID` 与 `cloudPath`、情侣空间和当前 OpenID 是否一致，再允许写入元数据；
- 上传路径为 `couples/{coupleId}/{ownerOpenid}/{随机名}`；
- 数据库只保存 `fileID`，页面展示时获取短期临时地址；
- 删除失败会保留 `pendingDeletion`，需定期按该字段重试并巡检孤儿文件；
- 在云开发控制台配置容量和调用量告警，避免图片使用量失控。

## 4. 部署后验收

1. 在“设置 → 云端联调检查”运行八模块检查；
2. 账号 A 创建空间，账号 B 使用 8 位加入码加入；
3. 验证共享记录同步、私密记录对 B 不可见；
4. 账号 C 尝试加入，必须返回空间已满；
5. 完成带积分任务，由另一方确认一次；重复确认不得重复加分；
6. 上传、预览、删除图片，并验证账号 C 无法访问；
7. 导出 JSON，恢复一次后再次恢复，第二次应全部跳过；
8. 分别在 iOS、Android 真机检查安全区、日期和计时恢复。

## 5. 发布前人工项

- 在微信公众平台补充 `chooseMedia` 对应的隐私保护指引；
- 准备隐私政策、数据删除和解除关系说明；
- 上传体验版连续双账号使用 7 天，再提交审核；
- 确认生产环境 ID、索引、存储权限、用量告警均已配置。
