# Lovetry 情侣小程序

一个面向两人共同生活的微信小程序，覆盖记录、计划、日历、相册、奖励、提醒、搜索、备份、轻互动和恋爱智能助手。产品采用“Twin Almanac 双人年鉴”视觉方向，敏感记录默认私密，服务端以情侣空间成员身份作为共享数据访问边界。

## 本地验证

```bash
npm ci
npm run quality
npm run eval:agent
```

`quality` 会执行领域规则测试、100 条恋爱助手安全与检索评测、JavaScript/JSON 语法检查、页面与组件完整性检查、云函数结构检查、服务层边界检查、交互控件检查和主包源码预算检查。

## 项目入口

- 小程序工程：`couple-miniprogram/`
- 云函数：`couple-miniprogram/cloudfunctions/`
- 共享业务规则：`couple-miniprogram/shared/`
- 恋爱助手知识库：`couple-miniprogram/cloudfunctions/love-agent/knowledge-base.json`
- 恋爱助手评测集：`evals/love-agent-scenarios.json`
- 知识库维护说明：`couple-miniprogram/knowledge-base/README.md`
- Agent 架构与部署：`couple-miniprogram/LOVE_AGENT.md`
- 自动测试：`tests/`
- 开发计划：`情侣小程序开发计划.md`
- 执行记录：`项目执行记录.md`
- 云环境配置：`couple-miniprogram/CLOUDBASE_SETUP.md`
- 隐私说明：`couple-miniprogram/PRIVACY.md`

## 当前边界

本仓库已完成可在本地自动化开发和验证的工作。恋爱助手在未配置模型密钥时仍可使用本地知识库回答；启用生成式回答需要在云函数环境变量中配置 API 密钥。真实 AppID、CloudBase 资源与索引、模型密钥、订阅消息模板、微信开发者工具编译、双账号/第三账号隔离、iOS/Android 真机和提审仍需在真实环境完成，不在本地结果中伪报通过。
