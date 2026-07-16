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
    modeText: "知识库已就绪"
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
          modeText
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
