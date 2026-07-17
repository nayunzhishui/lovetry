const api = require("../../services/cloudApi");

const suggestions = [
  "吵架以后，我该怎么重新开口？",
  "对象总想看我手机，我怎么表达边界？",
  "异地恋怎样安排联系频率更舒服？",
  "最近约会有点重复，怎么增加新鲜感？"
];

Page({
  data: {
    question: "",
    suggestions,
    messages: [],
    loading: false,
    error: "",
    modeText: "知识库已就绪",
    providerConfigured: false,
    providerTesting: false,
    providerStatusText: "正在检查模型配置…",
    providerDetailText: ""
  },

  onLoad() {
    this.refreshProviderStatus(false);
  },

  refreshProviderStatus(probe) {
    if (this.data.providerTesting) return;
    if (probe) this.setData({ providerTesting: true, providerStatusText: "正在测试 API 连接…" });
    api.getLoveAgentProviderStatus(probe)
      .then((status) => {
        const connectionText = {
          connected: "模型 API 连接正常",
          configured: "模型 API 已配置，尚未测试",
          not_configured: "未配置模型 API，当前使用本地知识库",
          invalid_configuration: "模型 API 配置无效",
          authentication_failed: "API 密钥验证失败",
          endpoint_not_found: "API 地址或协议不匹配",
          rate_limited: "API 请求受限，请稍后重试",
          timeout: "API 连接超时",
          unavailable: "模型 API 暂时不可用"
        };
        const detail = status.configured
          ? `${status.model || "自定义模型"} · ${status.style === "chat_completions" ? "Chat Completions" : "Responses"}`
          : "无需密钥也可使用内置恋爱知识库";
        this.setData({
          providerConfigured: Boolean(status.configured),
          providerStatusText: connectionText[status.connection] || "模型连接状态未知",
          providerDetailText: detail
        });
        if (probe) wx.showToast({
          title: status.connection === "connected" ? "API 连接正常" : "连接测试未通过",
          icon: status.connection === "connected" ? "success" : "none"
        });
      })
      .catch(() => this.setData({ providerStatusText: "模型连接状态检查失败" }))
      .finally(() => this.setData({ providerTesting: false }));
  },

  testProviderConnection() {
    this.refreshProviderStatus(true);
  },

  onInput(event) {
    this.setData({ question: event.detail.value });
  },

  useSuggestion(event) {
    this.setData({ question: event.currentTarget.dataset.question || "" });
  },

  ask() {
    const question = this.data.question.trim();
    if (question.length < 2 || this.data.loading) return;
    const history = this.data.messages.map((message) => ({
      role: message.role,
      content: message.content
    }));
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      sources: []
    };
    this.setData({
      question: "",
      messages: [...this.data.messages, userMessage],
      loading: true,
      error: "",
      modeText: "正在检索知识库…"
    });
    api.askLoveAgent(question, history)
      .then((result) => {
        const modeText = result.mode === "ai"
          ? "AI 生成 · 知识库约束"
          : result.mode === "safety"
            ? "安全优先响应"
            : "本地知识库回答";
        this.setData({
          messages: [...this.data.messages, {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: result.answer || "暂时没有生成回答。",
            sources: result.sources || [],
            modeText
          }],
          modeText,
          error: result.providerNotice || ""
        });
        setTimeout(() => wx.pageScrollTo({ scrollTop: 99999, duration: 250 }), 50);
      })
      .catch((error) => {
        this.setData({
          error: api.getErrorMessage(error, "恋爱助手暂时没有回答，请稍后重试"),
          modeText: "请求未完成"
        });
      })
      .finally(() => this.setData({ loading: false }));
  },

  copyAnswer(event) {
    wx.setClipboardData({ data: event.currentTarget.dataset.content || "" });
  },

  clearConversation() {
    this.setData({ messages: [], question: "", error: "", modeText: "知识库已就绪" });
  }
});
