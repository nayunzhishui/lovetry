function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-6).map((message) => ({
    role: message && message.role === "assistant" ? "assistant" : "user",
    content: String(message && message.content || "").trim().slice(0, 1200)
  })).filter((message) => message.content);
}

function buildInstructions() {
  return [
    "你是 Lovetry 恋爱助手，一个明确标识为 AI 的关系沟通辅助工具。",
    "回答必须优先依据提供的本地知识库，不得虚构知识库不存在的事实或研究结论。",
    "回答使用简洁、温和、不评判的中文，先确认用户处境，再给 2 到 4 个可执行步骤。",
    "区分可观察事实、用户解释和未知信息；信息不足时先提问，不把推测写成结论。",
    "不要迎合或确认对伴侣动机的猜测，也不要只为让用户感觉被支持而强化单方指责。",
    "引用知识库时在相关句子末尾标注 [Kxx]。如果证据不足，明确说“知识库里的信息不足以确定”。",
    "不要诊断人格、依恋类型或心理疾病，不判断谁是坏人，不承诺修复关系。",
    "不要教用户监控、欺骗、测试、报复、强迫或操控伴侣；强调同意、边界和双方自愿。",
    "不要代替用户做分手、结婚等重大决定；帮助用户澄清选择和下一步。",
    "如果涉及暴力、威胁、强迫、自伤或即时危险，优先建议现实安全支持，不把它简化为沟通技巧。",
    "不要声称看过用户的其他记录；你只知道本次明确提供的问题与对话。"
  ].join("\n");
}

function buildInput(question, history, context) {
  const transcript = normalizeHistory(history)
    .map((message) => `${message.role === "assistant" ? "助手" : "用户"}：${message.content}`)
    .join("\n");
  return [
    "以下是可引用的本地恋爱知识库：",
    context || "（没有检索到足够相关的知识条目）",
    transcript ? `\n本次会话历史：\n${transcript}` : "",
    `\n用户当前问题：${String(question || "").trim()}`,
    "\n请给出基于知识库的回答，并在最后用一句开放式问题帮助用户补充关键情境。"
  ].filter(Boolean).join("\n");
}

function sanitizeCitations(answer, allowedIds) {
  const allowed = new Set(Array.isArray(allowedIds) ? allowedIds : []);
  return String(answer || "").replace(/\[(K\d{2})\]/g, (match, id) => allowed.has(id) ? match : "");
}

module.exports = { buildInput, buildInstructions, normalizeHistory, sanitizeCitations };
