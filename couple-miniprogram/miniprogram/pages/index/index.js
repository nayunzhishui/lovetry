const app = getApp();
const cloudApi = require("../../services/cloudApi");

Page({
  data: {
    couple: null,
    summary: null,
    walletText: "",
    togetherDays: 0,
    recentMoodText: "",
    title: "",
    content: "",
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
        this.setData({ couple });
        if (couple) this.loadSummary();
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

  loadSummary() {
    if (typeof cloudApi.getDashboardSummary !== "function") return;
    cloudApi
      .getDashboardSummary()
      .then((summary) => {
        const walletText = (summary.wallets || []).map((wallet) => wallet.balance || 0).join(" / ");
        const anniversary = summary.couple && summary.couple.anniversaryDate
          ? new Date(`${summary.couple.anniversaryDate}T00:00:00`)
          : null;
        const togetherDays = anniversary && !Number.isNaN(anniversary.getTime())
          ? Math.max(0, Math.floor((Date.now() - anniversary.getTime()) / 86400000) + 1)
          : 0;
        const recentMood = (summary.recentRecords || []).find((record) => record.type === "mood");
        const recentMoodText = recentMood && recentMood.payload && recentMood.payload.level
          ? `${recentMood.payload.level}/5 · ${recentMood.title}`
          : "还没有心情记录";
        this.setData({ summary, walletText, togetherDays, recentMoodText });
      })
      .catch(() => {
        this.setData({ summary: null, walletText: "" });
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
    wx.navigateTo({ url: "/pages/record-form/record-form?type=conflict" });
  },

  goTimeline() {
    wx.navigateTo({ url: "/pages/timeline/timeline" });
  },

  goRecords() {
    wx.navigateTo({ url: "/pages/records/records" });
  },

  goCalendar() {
    wx.navigateTo({ url: "/pages/calendar/calendar" });
  },

  goPlans() {
    wx.navigateTo({ url: "/pages/plans/plans" });
  },

  goRewards() {
    wx.navigateTo({ url: "/pages/rewards/rewards" });
  },

  goAlbums() {
    wx.navigateTo({ url: "/pages/albums/albums" });
  },

  goSearch() {
    wx.navigateTo({ url: "/pages/search/search" });
  },

  submitMoment() {
    if (this.data.isSaving) return;

    if (!this.data.title.trim() || !this.data.content.trim()) {
      wx.showToast({ title: "请填写标题和内容", icon: "none" });
      return;
    }

    this.setData({ isSaving: true, error: "" });
    wx.showLoading({ title: "保存中", mask: true });
    cloudApi
      .createRecord({
        type: "moment",
        title: this.data.title.trim(),
        content: this.data.content.trim(),
        payload: {}
      })
      .then(() => {
        wx.showToast({ title: "已保存" });
        this.setData({ title: "", content: "" });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "记录保存失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ isSaving: false });
      });
  }
});
