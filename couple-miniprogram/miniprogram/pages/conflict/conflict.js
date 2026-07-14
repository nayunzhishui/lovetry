const cloudApi = require("../../services/cloudApi");

Page({
  data: {
    conflictTime: "",
    content: "",
    stressEvents: "",
    bodyState: "",
    sleepState: "",
    relationshipState: "",
    communication: "",
    satisfaction: "",
    result: "",
    isSaving: false,
    error: ""
  },

  onInput(event) {
    this.setData({
      [event.currentTarget.dataset.key]: event.detail.value
    });
  },

  submitConflict() {
    if (this.data.isSaving) return;

    const score = Number(this.data.satisfaction);
    if (!this.data.conflictTime.trim() || !this.data.content.trim()) {
      wx.showToast({ title: "请填写时间和内容", icon: "none" });
      return;
    }
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      wx.showToast({ title: "满意度填 1 到 10", icon: "none" });
      return;
    }

    this.setData({ isSaving: true, error: "" });
    wx.showLoading({ title: "保存中", mask: true });
    cloudApi
      .createRecord({
        type: "conflict",
        title: this.data.conflictTime.trim(),
        content: this.data.content.trim(),
        payload: {
          stressEvents: this.data.stressEvents.trim(),
          bodyState: this.data.bodyState.trim(),
          sleepState: this.data.sleepState.trim(),
          relationshipState: this.data.relationshipState.trim(),
          communication: this.data.communication.trim(),
          satisfaction: score,
          result: this.data.result.trim()
        }
      })
      .then(() => {
        wx.showToast({ title: "已保存" });
        setTimeout(() => wx.navigateBack(), 500);
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "复盘保存失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ isSaving: false });
      });
  }
});
