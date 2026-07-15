const config = require("./config");
const cloudApi = require("./services/cloudApi");

App({
  globalData: {
    openid: "",
    couple: null,
    isOnline: true
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

    this.observeNetwork();
    this.bootstrap();
  },

  observeNetwork() {
    wx.getNetworkType({
      success: ({ networkType }) => {
        this.globalData.isOnline = networkType !== "none";
      }
    });
    wx.onNetworkStatusChange(({ isConnected }) => {
      const wasOnline = this.globalData.isOnline;
      this.globalData.isOnline = isConnected;
      if (wasOnline && !isConnected) {
        wx.showToast({ title: "网络已断开，恢复后可重试", icon: "none", duration: 3000 });
      }
      if (!wasOnline && isConnected) {
        wx.showToast({ title: "网络已恢复", icon: "none" });
      }
    });
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
