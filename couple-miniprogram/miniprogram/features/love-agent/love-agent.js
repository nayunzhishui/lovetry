const api = require("../../services/cloudApi");
const {
  applyPromptFrame,
  promptFrames,
  providerPresentation
} = require("../../../shared/agent-experience");

const suggestions = [
  "吵架以后，我该怎么重新开口？",
  "伴侣总想看我手机，我怎么表达边界？",
  "异地恋怎样安排联系频率更舒服？",
  "最近约会有点重复，怎么增加新鲜感？"
];

Page({
  data: {
    question: "",
    suggestions,
    promptFrames: promptFrames(),
    messages: [],
    loading: false,
    error: "",
    notice: "",
    modeText: "知识库已就绪",
    providerCanProbe: false,
    providerTesting: false,
    providerStatusText: "正在检查回答来源…",
    providerDetailText: "",
    providerTone: "quiet"
  },

  onLoad() {
    this.refreshProviderStatus(false);
  },

  refreshProviderStatus(probe) {
    if (this.data.providerTesting) return;
    if (probe) this.setData({ providerTesting: true, providerStatusText: "正在检查增强回答…" });
    api.getLoveAgentProviderStatus(probe)
      .then((status) => {
        const presentation = providerPresentation(status);
        this.setData({
          providerCanProbe: presentation.canProbe,
          providerStatusText: presentation.title,
          providerDetailText: presentation.detail,
          providerTone: presentation.tone
        });
        if (probe) wx.showToast({
          title: status.connection === "connected" ? "增强回答连接正常" : "连接检查未通过",
          icon: status.connection === "connected" ? "success" : "none"
        });
      })
      .catch(() => this.setData({
        providerStatusText: "暂时无法检查回答来源",
        providerDetailText: "仍可以继续使用本地知识库",
        providerTone: "notice"
      }))
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

  usePromptFrame(event) {
    this.setData({ question: applyPromptFrame(this.data.question, event.currentTarget.dataset.id) });
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
      notice: "",
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
          notice: result.providerNotice || "",
          error: ""
        });
        setTimeout(() => wx.pageScrollTo({ scrollTop: 99999, duration: 250 }), 50);
      })
      .catch((error) => {
        this.setData({
          error: api.getErrorMessage(error, "恋爱助手暂时没有回答，请稍后重试"),
          notice: "",
          modeText: "请求未完成"
        });
      })
      .finally(() => this.setData({ loading: false }));
  },

  copyAnswer(event) {
    wx.setClipboardData({ data: event.currentTarget.dataset.content || "" });
  },

  clearConversation() {
    this.setData({ messages: [], question: "", error: "", notice: "", modeText: "知识库已就绪" });
  }
});
