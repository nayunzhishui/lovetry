function providerPresentation(status = {}) {
  const canProbe = Boolean(status.configured);
  if (status.connection === "connected") {
    return {
      tone: "ok",
      title: "增强回答已连接",
      detail: "回答会结合本地知识条目，仍可能出现理解偏差",
      canProbe
    };
  }
  if (status.connection === "configured") {
    return {
      tone: "quiet",
      title: "增强回答已配置",
      detail: "连接尚未确认，失败时会自动使用本地知识库",
      canProbe
    };
  }
  if (!status.configured && status.connection === "not_configured") {
    return {
      tone: "quiet",
      title: "本地知识库模式",
      detail: "当前不会调用外部模型",
      canProbe: false
    };
  }
  return {
    tone: "notice",
    title: "已切换到本地知识库",
    detail: "外部模型暂不可用，不影响继续提问",
    canProbe
  };
}

const PROMPT_FRAMES = [
  {
    id: "clarify",
    label: "梳理一次沟通",
    description: "事实、感受与期待",
    template: "可观察到的事实：\n我的感受：\n我最在意的是：\n我希望理解或改变的是："
  },
  {
    id: "prepare",
    label: "准备重新开口",
    description: "目标、边界与一句开场",
    template: "我想谈的具体事情：\n我希望这次沟通达到：\n我的边界是：\n请帮我准备一句不指责的开场。"
  }
];

function promptFrames() {
  return PROMPT_FRAMES.map((frame) => ({ ...frame }));
}

function applyPromptFrame(current, frameId) {
  const value = String(current || "");
  if (value.trim()) return value;
  const frame = PROMPT_FRAMES.find((item) => item.id === frameId);
  return frame ? frame.template : value;
}

module.exports = { applyPromptFrame, promptFrames, providerPresentation };
