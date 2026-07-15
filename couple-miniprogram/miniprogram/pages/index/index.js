const app = getApp();
const cloudApi = require("../../services/cloudApi");
const { nextAnniversary } = require("../../../shared/anniversary");

Page({
  data: {
    couple: null,
    summary: null,
    walletText: "",
    togetherDays: 0,
    recentMoodText: "",
    upcomingAnniversary: null,
    syncText: "等待首次同步",
    title: "",
    content: "",
    isLoading: false,
    isSaving: false,
    error: ""
  },

  onShow() {
    this.stopSyncTimer();
    this.loadCouple();
    this.syncTimer = setInterval(() => this.runSync(), 30000);
  },

  onHide() {
    this.stopSyncTimer();
  },

  onUnload() {
    this.stopSyncTimer();
  },

  stopSyncTimer() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
  },

  refreshSyncText() {
    if (!app.globalData.isOnline) {
      this.setData({ syncText: "当前离线 · 恢复网络后自动同步" });
      return;
    }
    const summary = app.globalData.syncSummary || {};
    if (summary.total > 0) {
      this.setData({ syncText: `最近同步 · 接收 ${summary.total} 项更新` });
      return;
    }
    const date = new Date(app.globalData.lastSyncAt || "");
    const time = Number.isNaN(date.getTime())
      ? "等待首次同步"
      : `已同步 · ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    this.setData({ syncText: time });
  },

  runSync() {
    if (!app.globalData.couple || typeof app.syncChanges !== "function") return Promise.resolve(null);
    return app.syncChanges({ silent: true }).then((result) => {
      this.refreshSyncText();
      return result;
    });
  },

  loadCouple() {
    if (this.data.isLoading) return;

    this.setData({ isLoading: true, error: "" });
    cloudApi
      .getMyCouple()
      .then((couple) => {
        app.globalData.couple = couple;
        this.setData({ couple });
        if (couple) {
          this.loadSummary();
          this.runSync();
        }
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
        const upcomingAnniversary = (summary.anniversaries || [])
          .map((plan) => ({ ...plan, next: nextAnniversary(String(plan.startAt || "").slice(0, 10)) }))
          .filter((plan) => plan.next)
          .sort((a, b) => a.next.daysRemaining - b.next.daysRemaining)[0] || null;
        this.setData({ summary, walletText, togetherDays, recentMoodText, upcomingAnniversary });
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
    wx.switchTab({ url: "/pages/settings/settings" });
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
    wx.switchTab({ url: "/pages/records/records" });
  },

  goCalendar() {
    wx.switchTab({ url: "/pages/calendar/calendar" });
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
