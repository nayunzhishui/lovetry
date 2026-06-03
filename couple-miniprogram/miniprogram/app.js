const config = require("./config");

App({
  globalData: {
    openid: "",
    couple: null
  },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({
        title: "当前微信版本过低",
        content: "请升级微信后再使用云开发能力。",
        showCancel: false
      });
      return;
    }

    wx.cloud.init({
      env: config.envId,
      traceUser: true
    });

    this.bootstrap();
  },

  bootstrap() {
    return wx.cloud
      .callFunction({ name: "login" })
      .then((res) => {
        this.globalData.openid = res.result.openid;
        return wx.cloud.callFunction({
          name: "couple",
          data: { action: "mine" }
        });
      })
      .then((res) => {
        this.globalData.couple = res.result.couple || null;
        return this.globalData;
      })
      .catch((err) => {
        console.error("bootstrap failed", err);
        wx.showToast({ title: "初始化失败", icon: "none" });
      });
  }
});
