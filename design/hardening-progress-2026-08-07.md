# Lovetry 安全与发布收敛进度

> 基线：`main@27be047c5f4062716866e6448d4ad12fcae483ed`  
> 分支：`agent/lovetry-audit-hardening`  
> PR：#1（Draft）  
> 本文记录整改进度；`full-audit-2026-08-07.md` 保留首次全面审查的原始风险基线。

## 已完成

1. **历史敏感记录默认私密兼容**
   - 缺少 `visibility` 的 mood/conflict/sleep/period/intimacy/pomodoro 按私密解释；
   - records、dashboard、备份恢复和共享权限规则保持一致；
   - 修复列表分页在过滤旧私密记录后可能提前结束的问题。

2. **Agent 安全与质量门禁**
   - 高风险评测覆盖即时暴力/性强迫、自伤和强迫控制；
   - 评测扩展至 28 场景、112 条问题；
   - GitHub Actions 执行完整 `npm run quality`；
   - 增加运行时共享镜像差异门禁；
   - CI 固定 `Asia/Shanghai`，消除既有测试对 runner 本地时区的隐式依赖；
   - OpenAI 官方端点附加 SHA-256 派生匿名 `safety_identifier`，不发送原始 OpenID；兼容网关不注入该字段。

3. **普通记录稳定幂等**
   - 每个新建记录草稿生成稳定 `clientRequestId`；
   - request ID 与草稿一起持久化和恢复；
   - 提交前强制写入本机草稿，降低“服务端成功但客户端超时”后重复创建风险；
   - 新增跨页面恢复行为测试。

4. **同步游标账号/空间隔离**
   - 从全局 `lovetry_sync_cursor_v1` 改为按 `openid + coupleId` 的 v2 key；
   - 不再复用其他账号或其他情侣空间的同步游标；
   - 新增多账号/多空间行为测试。

5. **records 类型化服务端 Schema**
   - payload/metrics 改为按记录类型白名单化；
   - 限制字符串、数组、数值范围；
   - `reactionsByOpenid` 不接受客户端伪造，仅保留服务端已有合法回应；
   - mood/conflict/outing/sleep/period/intimacy/game/pomodoro 分别收敛字段；
   - 新增 Schema 单测。

6. **plans 类型化服务端 Schema**
   - task/event/menu/trip/anniversary 分别收敛 payload；
   - 非 task 不再保留 rewardPoints/assignee；
   - 日期字段按计划类型限制；
   - 更新时锁定既有 type/status，状态变化继续通过专用 mutation；
   - 旅行日期由服务端再次校验；
   - 新增 Schema 单测。

7. **备份恢复重新进入类型化写入边界**
   - `dashboard.import` 的 records/plans 在恢复前重新执行白名单；
   - 过滤未声明 payload/metrics、无效类型和超范围值；
   - 不从可编辑备份恢复 `reactionsByOpenid`，避免伪造伴侣回应；
   - 恢复仍保留原有数量上限和重复恢复检查；
   - 新增恢复 Schema 测试。

8. **敏感本机缓存第一阶段隔离**
   - 普通记录/计划草稿通过统一 storage adapter 按 `openid + coupleId` 分区；
   - Agent handoff 同样按当前用户和情侣空间分区；
   - 身份或情侣空间尚未确定时拒绝写入敏感缓存，不回退到全局 key；
   - 新增账号切换/情侣空间切换隔离测试。

9. **预览 CI 可复现性**
   - `miniprogram-ci` 从未固定的 latest 安装改为显式 `2.1.31`；
   - 避免工作流因上游最新版本变化产生不可解释的预览构建差异。

## 部分完成

### 本机 storage namespace

已完成同步游标、普通表单草稿和 Agent handoff 隔离；仍需迁移：

- Pomodoro 运行状态；
- Pomodoro 待保存记录。

Pomodoro 单独处理，避免在长页面文件中与其他状态机修改叠加。

### Schema 与备份恢复

records/plans 正常 create/update 与 backup import 均已进入类型化白名单。仍未完成完整灾备语义：

- 恢复不是跨 records/plans 的原子事务；
- 缺少恢复批次/checkpoint；
- 钱包、媒体仍不是完整恢复范围。

## 下一批优先级

1. **P1：统一 membership resolver**：逐步替换 records/plans/rewards/media/dashboard/notifications 中重复的 `couples.members + limit(1)`；
2. **P1：Pomodoro storage namespace**；
3. **P1：备份恢复 checkpoint / 批次状态**；
4. **P0：解除关系后的历史数据权利模型**：需要先冻结产品规则，再做数据模型变更；
5. **P0：真实 CloudBase 三账号/存储越权/真机/订阅消息/专业内容复核**。

## 当前原则

- 不继续新增大功能；
- 每一批只解决一个清晰风险域；
- 每批必须经过 GitHub Actions `Verify`；
- Draft PR 在真实环境验收和结构性 P0 问题明确前不合并 `main`。
