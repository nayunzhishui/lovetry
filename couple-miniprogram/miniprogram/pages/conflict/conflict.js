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
    result: ""
  },

  onInput(event) {
    this.setData({
      [event.currentTarget.dataset.key]: event.detail.value
    });
  },

  submitConflict() {
    const score = Number(this.data.satisfaction);
    if (!this.data.conflictTime.trim() || !this.data.content.trim()) {
      wx.showToast({ title: "请填写时间和内容", icon: "none" });
      return;
    }
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      wx.showToast({ title: "满意度填 1 到 10", icon: "none" });
      return;
    }

    wx.cloud
      .callFunction({
        name: "records",
        data: {
          action: "create",
          record: {
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
          }
        }
      })
      .then(() => {
        wx.showToast({ title: "已保存" });
        setTimeout(() => wx.navigateBack(), 500);
      })
      .catch((err) => {
        console.error(err);
        wx.showToast({ title: "保存失败", icon: "none" });
      });
  }
});
