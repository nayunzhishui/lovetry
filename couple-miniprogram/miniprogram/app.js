const config = require("./config");
const cloudApi = require("./services/cloudApi");

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

    const cloudOptions = { traceUser: true };
    if (config.envId && !config.envId.startsWith("replace-with")) cloudOptions.env = config.envId;
    wx.cloud.init(cloudOptions);

    this.bootstrap();
  },

  bootstrap() {
    return cloudApi
      .login()
      .then((identity) => {
        this.globalData.openid = identity.openid;
        return cloudApi.getMyCouple();
      })
      .then((couple) => {
        this.globalData.couple = couple;
        return this.globalData;
      })
      .catch((err) => {
        console.error("bootstrap failed", err);
        wx.showToast({ title: "初始化失败", icon: "none" });
      });
  }
});
