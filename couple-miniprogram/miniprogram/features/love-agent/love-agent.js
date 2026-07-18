const api = require("../../services/cloudApi");
const agentHandoff = require("../../services/agentHandoff");
const {
  applyPromptFrame,
  promptFrames,
  providerPresentation
} = require("../../../shared/agent-experience");
const { contextCandidate, contextPayload } = require("../../../shared/agent-context");

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
    providerTone: "quiet",
    contextPickerOpen: false,
    contextLoading: false,
    contextError: "",
    contextCandidates: [],
    selectedContext: null
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

  openContextPicker() {
    if (this.data.contextLoading) return;
    this.setData({ contextPickerOpen: true, contextLoading: true, contextError: "" });
    Promise.all([api.login(), api.listRecords({ limit: 30, ownerOnly: true })])
      .then(([identity, records]) => {
        const contextCandidates = records
          .map((record) => contextCandidate(record, identity.openid))
          .filter(Boolean)
          .slice(0, 12);
        this.setData({ contextCandidates });
      })
      .catch((error) => this.setData({
        contextCandidates: [],
        contextError: api.getErrorMessage(error, "暂时无法读取自己的记录")
      }))
      .finally(() => this.setData({ contextLoading: false }));
  },

  closeContextPicker() {
    this.setData({ contextPickerOpen: false, contextError: "" });
  },

  selectContext(event) {
    const selectedContext = this.data.contextCandidates[Number(event.currentTarget.dataset.index)] || null;
    this.setData({ selectedContext, contextPickerOpen: false, contextError: "" });
  },

  clearContext() {
    this.setData({ selectedContext: null });
  },

  ask() {
    const question = this.data.question.trim();
    if (question.length < 2 || this.data.loading) return;
    const history = this.data.messages.map((message) => ({
      role: message.role,
      content: message.content
    }));
    const selectedContext = contextPayload(this.data.selectedContext);
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      sources: [],
      contextLabel: selectedContext && selectedContext.label || ""
    };
    this.setData({
      question: "",
      messages: [...this.data.messages, userMessage],
      loading: true,
      error: "",
      notice: "",
      selectedContext: null,
      modeText: "正在检索知识库…"
    });
    api.askLoveAgent(question, history, selectedContext)
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
            modeText,
            originQuestion: question
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

  saveAnswerDraft(event) {
    const message = this.data.messages.find((item) => item.id === event.currentTarget.dataset.id && item.role === "assistant");
    if (!message || !agentHandoff.save({ question: message.originQuestion, answer: message.content })) {
      wx.showToast({ title: "暂时无法准备草稿", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/record-form/record-form?type=conflict&source=agent" });
  },

  clearConversation() {
    this.setData({ messages: [], question: "", error: "", notice: "", selectedContext: null, modeText: "知识库已就绪" });
  }
});
