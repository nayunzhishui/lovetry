# 恋爱助手知识库

当前可部署知识库位于 `cloudfunctions/love-agent/knowledge-base.json`。它是一个小规模、可审查的本地 RAG 数据源，云函数先检索相关条目，再将条目作为唯一主要依据交给模型回答。

当前版本包含 36 条知识，版本与审查状态见 `cloudfunctions/love-agent/knowledge-manifest.json`；确定性评测位于根目录 `evals/love-agent-scenarios.json`。

## 条目结构

- `id`：稳定引用编号，例如 `K01`；
- `category`：沟通、边界、冲突修复等主题；
- `title`：用户可理解的标题；
- `keywords`：用于轻量检索；
- `summary`：核心结论；
- `body`：适用边界和说明；
- `actions`：2～4 个可执行步骤。

## 编辑规则

1. 使用支持、协商、同意和边界语言；
2. 不把关系问题写成心理诊断或人格标签；
3. 不教监控、欺骗、报复、测试或操控伴侣；
4. 暴力、威胁、强迫、自伤内容优先现实安全支持；
5. 同步更新内容清单，并为新增主题补充评测问题；
6. 每次修改后运行 `npm run quality` 和 `npm run eval:agent`；
7. 大于约 200 条后，再考虑迁移到向量数据库；当前规模使用确定性关键词与中文 n-gram 检索更易审查、部署和测试。
