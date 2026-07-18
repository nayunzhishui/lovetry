# 恋爱智能 Agent 架构与运营说明

## 1. 目标与边界

恋爱助手用于帮助用户梳理沟通、边界、冲突修复和共同生活问题。它不是心理咨询师，不诊断人格或疾病，不判断关系好坏，不替用户发送消息或执行分手、结婚等决定。

## 2. 请求链路

```text
用户问题
  -> 本地风险分级
  -> 恋爱知识库检索（最多 4 条）
  -> 无密钥：知识库降级回答
  -> 有密钥：Responses API 生成受知识库约束的回答
  -> 删除越界引用
  -> 返回回答、模式和本次参考条目
```

对话只保留在当前小程序页面。云函数不写入问题、回答或历史；日志不包含正文。模型请求设置 `store: false`。

页面提供“梳理当前问题”和“准备一次对话”两个可编辑框架，只帮助区分事实、感受、需要、目标与边界；不会覆盖用户已经输入的内容。每条助手回答会固定保留自己的生成模式，后续回答不会改写此前来源。

## 3. 三种回答模式

- `knowledge`：没有 API 密钥或模型暂时不可用，直接使用本地知识库组织回答；
- `ai`：模型根据本地检索上下文生成回答；
- `safety`：出现暴力、强迫、自伤或操控意图时，跳过普通建议，优先安全支持或明确拒绝。

## 4. 模型配置

云函数环境变量：

| 变量 | 必填 | 说明 |
|---|---|---|
| `LOVE_AGENT_API_KEY` | 否 | 推荐；不配置时兼容读取 `OPENAI_API_KEY`，两者都没有则使用本地知识库 |
| `LOVE_AGENT_API_STYLE` | 否 | `responses`（默认）或 `chat_completions` |
| `LOVE_AGENT_MODEL` | 否 | 默认 `gpt-5.6-luna` |
| `LOVE_AGENT_API_BASE` | 否 | 默认 `https://api.openai.com/v1` |
| `LOVE_AGENT_API_PATH` | 否 | 覆盖默认 `/responses` 或 `/chat/completions` 相对路径 |
| `LOVE_AGENT_TIMEOUT_MS` | 否 | 默认 12000，限制为 3000～30000 毫秒 |
| `LOVE_AGENT_MAX_OUTPUT_TOKENS` | 否 | 默认 900，限制为 64～2000 |
| `LOVE_AGENT_CHAT_TOKEN_FIELD` | 否 | 默认 `max_tokens`；新模型可设为 `max_completion_tokens` |

适配层支持 OpenAI Responses 与常见 Chat Completions 兼容接口；Responses 使用 `instructions`、`input`、`max_output_tokens` 和 `store: false`，Chat Completions 使用 `messages` 与 `max_tokens`。参考：[Responses API 创建响应](https://developers.openai.com/api/reference/resources/responses/methods/create)、[文本生成指南](https://developers.openai.com/api/docs/guides/text)、[模型目录](https://developers.openai.com/api/docs/models)。

页面只读取脱敏状态，并以“增强回答可用/未启用/暂不可用”等产品语言呈现，不向普通用户展示协议、模型、主机、密钥或完整 API 路径。“检查连接”会执行一次最小生成请求，用于区分密钥、地址、限流和超时问题；成功回退本地知识库时使用中性通知，不把有效回答显示为错误。

## 5. 数据与成本控制

- 每次最多发送 600 字当前问题和最近 6 条本次会话消息；
- 每次最多提供 4 条知识条目；
- 每个 OpenID 每天最多 50 次真实模型调用；
- 模型不可用时自动回退，不让核心问答完全失效；
- 不自动读取 records、plans、albums、couple profile；
- API 密钥仅保存在云函数环境变量。

## 6. 知识库扩充流程

1. 在 `cloudfunctions/love-agent/knowledge-base.json` 新增条目；
2. 分配不可复用的稳定 ID；
3. 写清适用边界和 2～4 个可执行步骤；
4. 检查是否含诊断、操控、羞辱或未经同意的建议；
5. 区分可观察事实、用户理解与未知信息，不确认未经证实的伴侣动机；
6. 为新主题增加检索测试和安全反例；
7. 执行 `npm run quality`；
8. 专业人员复核后再发布。

## 7. 上线前评测集

至少覆盖：

- 普通沟通、吵架后修复、异地、边界、金钱和约会；
- 信息不足时是否承认不确定；
- 模型是否虚构不存在的知识编号；
- 监控、欺骗、报复、强迫请求是否被拒绝；
- 暴力和自伤是否优先现实安全；
- 是否擅自声称读取过用户记录；
- 是否给出诊断性标签；
- 本地知识库模式与模型模式是否都可用；
- 单用户配额、超时、API 错误和网络不可达；
- 中文长文本、小屏、深色模式和清空会话。
