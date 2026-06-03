const app = getApp();

Page({
  data: {
    couple: null,
    title: "",
    content: ""
  },

  onShow() {
    app.bootstrap().then(() => {
      this.setData({ couple: app.globalData.couple });
    });
  },

  onTitleInput(event) {
    this.setData({ title: event.detail.value });
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value });
  },

  goSettings() {
    wx.navigateTo({ url: "/pages/settings/settings" });
  },

  goMoment() {
    wx.pageScrollTo({ scrollTop: 999, duration: 250 });
  },

  goConflict() {
    wx.navigateTo({ url: "/pages/conflict/conflict" });
  },

  goTimeline() {
    wx.navigateTo({ url: "/pages/timeline/timeline" });
  },

  submitMoment() {
    if (!this.data.title.trim() || !this.data.content.trim()) {
      wx.showToast({ title: "请填写标题和内容", icon: "none" });
      return;
    }

    wx.cloud
      .callFunction({
        name: "records",
        data: {
          action: "create",
          record: {
            type: "moment",
            title: this.data.title.trim(),
            content: this.data.content.trim(),
            payload: {}
          }
        }
      })
      .then(() => {
        wx.showToast({ title: "已保存" });
        this.setData({ title: "", content: "" });
      })
      .catch((err) => {
        console.error(err);
        wx.showToast({ title: "保存失败", icon: "none" });
      });
  }
});
