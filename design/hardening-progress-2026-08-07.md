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
   - CI 固定 `Asia/Shanghai`，消除既有测试对 runner 本地时区的隐式依赖。

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

## 部分完成

### 本机 storage namespace

同步游标已经完成账号/情侣空间隔离，但以下本机临时状态仍使用固定或类型级 key：

- 普通记录/计划草稿；
- Agent handoff；
- Pomodoro 运行状态与待保存记录。

这些状态需要结合 App bootstrap 时序再统一迁移，避免为了隔离而产生“身份尚未加载时恢复不到草稿”的竞态。

### Schema 与备份恢复

正常 records/plans create/update 已经经过类型化 Schema；`dashboard.import` 仍有独立恢复逻辑，目前尚未复用同等白名单。后续必须补恢复路径 Schema/版本迁移，否则备份导入仍可能重新写入旧的宽结构。

## 下一批优先级

1. **P1：统一 membership resolver**：逐步替换 records/plans/rewards/media/dashboard/notifications 中重复的 `couples.members + limit(1)`；
2. **P1：备份导入 Schema 与恢复检查点**；
3. **P1：完整 storage namespace**：草稿、Agent handoff、Pomodoro；
4. **P0：解除关系后的历史数据权利模型**：需要先冻结产品规则，再做数据模型变更；
5. **P0：真实 CloudBase 三账号/存储越权/真机/订阅消息/专业内容复核**。

## 当前原则

- 不继续新增大功能；
- 每一批只解决一个清晰风险域；
- 每批必须经过 GitHub Actions `Verify`；
- Draft PR 在真实环境验收和结构性 P0 问题明确前不合并 `main`。
