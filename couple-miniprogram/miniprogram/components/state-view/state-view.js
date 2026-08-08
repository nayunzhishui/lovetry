Component({
  properties: {
    // mode 为 "couple-required" 时渲染"未绑定伴侣"的全局引导态
    mode: { type: String, value: "" },
    // variant 明确状态语义："loading" / "empty" / "error"；留空时兼容旧用法
    variant: { type: String, value: "" },
    title: { type: String, value: "" },
    description: { type: String, value: "" },
    actionText: { type: String, value: "" },
    // 旧接口：loading 为 true 等价于 variant="loading"，保留向后兼容
    loading: { type: Boolean, value: false }
  },
  data: {
    isBusy: false,
    displayTitle: "暂时没有内容"
  },
  observers: {
    "variant, loading, title": function (variant, loading, title) {
      const isBusy = variant === "loading" || loading;
      this.setData({
        isBusy,
        displayTitle: title || (isBusy ? "正在整理…" : "暂时没有内容")
      });
    }
  },
  methods: {
    onAction() { this.triggerEvent("action"); },
    // settings 是 tabBar 页面，必须用 switchTab 跳转
    onCoupleAction() { wx.switchTab({ url: "/pages/settings/settings" }); }
  }
});
