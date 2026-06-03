const app = getApp();

Page({
  data: {
    couple: null,
    joinCode: ""
  },

  onShow() {
    app.bootstrap().then(() => {
      this.setData({ couple: app.globalData.couple });
    });
  },

  onJoinCodeInput(event) {
    this.setData({ joinCode: event.detail.value.toUpperCase() });
  },

  createCouple() {
    wx.cloud
      .callFunction({
        name: "couple",
        data: { action: "create" }
      })
      .then((res) => {
        app.globalData.couple = res.result.couple;
        this.setData({ couple: res.result.couple });
        wx.showToast({ title: "已创建" });
      })
      .catch((err) => {
        console.error(err);
        wx.showToast({ title: "创建失败", icon: "none" });
      });
  },

  joinCouple() {
    if (!this.data.joinCode.trim()) {
      wx.showToast({ title: "请输入加入码", icon: "none" });
      return;
    }

    wx.cloud
      .callFunction({
        name: "couple",
        data: {
          action: "join",
          code: this.data.joinCode.trim()
        }
      })
      .then((res) => {
        app.globalData.couple = res.result.couple;
        this.setData({ couple: res.result.couple, joinCode: "" });
        wx.showToast({ title: "已加入" });
      })
      .catch((err) => {
        console.error(err);
        wx.showToast({ title: "加入失败", icon: "none" });
      });
  }
});
