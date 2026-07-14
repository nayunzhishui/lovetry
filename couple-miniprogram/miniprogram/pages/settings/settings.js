const app = getApp();
const cloudApi = require("../../services/cloudApi");

Page({
  data: {
    couple: null,
    joinCode: "",
    spaceName: "",
    anniversaryDate: "",
    isLoading: false,
    isSaving: false,
    error: ""
  },

  onShow() {
    this.loadCouple();
  },

  loadCouple() {
    if (this.data.isLoading) return;

    this.setData({ isLoading: true, error: "" });
    cloudApi
      .getMyCouple()
      .then((couple) => {
        app.globalData.couple = couple;
        this.setData({
          couple,
          spaceName: couple ? couple.spaceName || "" : "",
          anniversaryDate: couple ? couple.anniversaryDate || "" : ""
        });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "情侣空间加载失败");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        this.setData({ isLoading: false });
      });
  },

  onJoinCodeInput(event) {
    this.setData({ joinCode: event.detail.value.toUpperCase() });
  },

  onProfileInput(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
  },

  onAnniversaryChange(event) {
    this.setData({ anniversaryDate: event.detail.value });
  },

  createCouple() {
    if (this.data.isSaving) return;

    this.setData({ isSaving: true, error: "" });
    wx.showLoading({ title: "创建中", mask: true });
    cloudApi
      .createCouple()
      .then((couple) => {
        app.globalData.couple = couple;
        this.setData({ couple });
        wx.showToast({ title: "已创建" });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "情侣空间创建失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ isSaving: false });
      });
  },

  joinCouple() {
    if (this.data.isSaving) return;

    if (!this.data.joinCode.trim()) {
      wx.showToast({ title: "请输入加入码", icon: "none" });
      return;
    }

    this.setData({ isSaving: true, error: "" });
    wx.showLoading({ title: "加入中", mask: true });
    cloudApi
      .joinCouple(this.data.joinCode.trim())
      .then((couple) => {
        app.globalData.couple = couple;
        this.setData({ couple, joinCode: "" });
        wx.showToast({ title: "已加入" });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "加入情侣空间失败，请检查加入码");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ isSaving: false });
      });
  },

  saveProfile() {
    if (this.data.isSaving || !this.data.couple) return;
    this.setData({ isSaving: true, error: "" });
    cloudApi.call("couple", {
      action: "updateProfile",
      profile: { spaceName: this.data.spaceName, anniversaryDate: this.data.anniversaryDate }
    })
      .then((result) => {
        app.globalData.couple = result.couple;
        this.setData({ couple: result.couple });
        wx.showToast({ title: "资料已保存" });
      })
      .catch((error) => this.setData({ error: cloudApi.getErrorMessage(error, "资料保存失败") }))
      .finally(() => this.setData({ isSaving: false }));
  },

  refreshInvite() {
    if (this.data.isSaving || !this.data.couple) return;
    this.setData({ isSaving: true, error: "" });
    cloudApi.call("couple", { action: "refreshInvite" })
      .then((result) => {
        app.globalData.couple = result.couple;
        this.setData({ couple: result.couple });
        wx.showToast({ title: "加入码已更新" });
      })
      .catch((error) => this.setData({ error: cloudApi.getErrorMessage(error, "加入码更新失败") }))
      .finally(() => this.setData({ isSaving: false }));
  },

  goExport() {
    wx.navigateTo({ url: "/pages/export/export" });
  },

  goIntegrationTest() {
    wx.navigateTo({ url: "/pages/integration-test/integration-test" });
  },

  leaveCouple() {
    if (!this.data.couple || this.data.isSaving) return;
    wx.showModal({
      title: "解除当前情侣空间？",
      content: "解除会归档整个情侣空间，双方都将无法继续查看共享数据。建议先导出备份。",
      confirmText: "确认解除",
      confirmColor: "#a8584e",
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ isSaving: true, error: "" });
        cloudApi.call("couple", { action: "leave", confirmText: "LEAVE_COUPLE" })
          .then(() => {
            app.globalData.couple = null;
            this.setData({ couple: null, spaceName: "", anniversaryDate: "" });
            wx.showToast({ title: "已解除" });
          })
          .catch((error) => this.setData({ error: cloudApi.getErrorMessage(error, "解除失败") }))
          .finally(() => this.setData({ isSaving: false }));
      }
    });
  }
});
