const app = getApp();
const cloudApi = require("../../services/cloudApi");
const { daysTogether, nextAnniversary } = require("../../shared/anniversary");
const { questionForDate } = require("../../shared/daily-questions");

function todayText() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// 今日一问：本人回答的本机缓存（提交后展示"我的回答"摘要用）
function dailyAnswerStorageKey(dateText) {
  return `lovetry_daily_answer_${dateText}`;
}

// 冷静期剩余天数（向上取整，最小 0）：与云端 archive-policy 的口径一致
function archivingDaysLeft(couple) {
  if (!couple || couple.status !== "archiving" || !couple.scheduledPurgeAt) return 0;
  const dueAt = new Date(couple.scheduledPurgeAt).getTime();
  if (!Number.isFinite(dueAt)) return 0;
  return Math.max(0, Math.ceil((dueAt - Date.now()) / 86400000));
}

Page({
  data: {
    couple: null,
    summary: null,
    walletText: "",
    togetherDays: 0,
    recentMoodText: "",
    upcomingAnniversary: null,
    syncText: "等待首次同步",
    syncFailed: false,
    syncDigestText: "",
    pendingApprovals: 0,
    archivingDaysLeft: 0,
    dailyQuestion: null,
    dailyStatusText: "",
    dailyAnsweredByMe: false,
    dailyAnsweredByPartner: false,
    dailyAnswerOpen: false,
    dailyAnswerText: "",
    dailySubmitting: false,
    dailyMyAnswer: "",
    isLoading: false,
    error: ""
  },

  onShow() {
    this.stopSyncTimer();
    // onShow 时 loadCouple 会完整刷新数据，这里只负责展示未读的同步摘要
    this.applySyncDigest(false);
    this.prepareDailyQuestion();
    this.loadCouple();
    this.syncTimer = setInterval(() => this.runSync(), 30000);
  },

  // 今日一问：题目本地确定（同一天全球同题），回答状态由 summary.dailyQuestion 提供
  prepareDailyQuestion() {
    const date = todayText();
    if (this.data.dailyQuestion && this.data.dailyQuestion.date === date) return;
    const question = questionForDate(date);
    let dailyMyAnswer = "";
    try { dailyMyAnswer = String(wx.getStorageSync(dailyAnswerStorageKey(date)) || ""); } catch (error) { /* 缓存缺失时只影响摘要展示 */ }
    this.setData({
      dailyQuestion: { id: question.id, text: question.text, date },
      dailyStatusText: "",
      dailyAnsweredByMe: false,
      dailyAnsweredByPartner: false,
      dailyAnswerOpen: false,
      dailyAnswerText: "",
      dailyMyAnswer
    });
    this.dailyClientRequestId = "";
  },

  onHide() {
    this.stopSyncTimer();
    // 摘要已经展示过至少一次，离开页面时视为已读
    this.markSyncDigestSeen();
  },

  onUnload() {
    this.stopSyncTimer();
    this.markSyncDigestSeen();
  },

  // 读取全局同步摘要；refreshOnChange 为 true 且 cursor 变化时刷新首页数据
  applySyncDigest(refreshOnChange) {
    const digest = app.globalData.syncDigest || null;
    const at = digest ? digest.at || "" : "";
    const changed = Boolean(at) && at !== this.syncDigestAt;
    this.syncDigestAt = at;
    const syncDigestText = digest && !digest.seen && digest.text ? digest.text : "";
    if (syncDigestText !== this.data.syncDigestText) this.setData({ syncDigestText });
    if (refreshOnChange && changed) this.loadSummary();
  },

  markSyncDigestSeen() {
    const digest = app.globalData.syncDigest;
    if (digest && this.data.syncDigestText) digest.seen = true;
  },

  openSyncDigest() {
    const digest = app.globalData.syncDigest;
    if (digest) digest.seen = true;
    this.setData({ syncDigestText: "" });
    wx.navigateTo({ url: "/pages/timeline/timeline" });
  },

  stopSyncTimer() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
  },

  refreshSyncText() {
    if (!app.globalData.isOnline) {
      this.setData({ syncText: "当前离线 · 恢复网络后自动同步", syncFailed: false });
      return;
    }
    if (app.globalData.syncErrorAt) {
      this.setData({ syncText: "同步暂未完成 · 点击重试", syncFailed: true });
      return;
    }
    const summary = app.globalData.syncSummary || {};
    if (summary.total > 0) {
      this.setData({ syncText: `最近同步 · 接收 ${summary.total} 项更新`, syncFailed: false });
      return;
    }
    const date = new Date(app.globalData.lastSyncAt || "");
    const time = Number.isNaN(date.getTime())
      ? "等待首次同步"
      : `已同步 · ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    this.setData({ syncText: time, syncFailed: false });
  },

  runSync() {
    if (!app.globalData.couple || typeof app.syncChanges !== "function") return Promise.resolve(null);
    return app.syncChanges({ silent: true }).then((result) => {
      this.refreshSyncText();
      // 后台同步拿到新内容时（cursor 变化）刷新首页数据并展示摘要卡
      this.applySyncDigest(true);
      return result;
    });
  },

  retrySync() {
    if (!this.data.couple) return;
    this.setData({ syncText: "正在重新同步…", syncFailed: false });
    this.runSync().then((result) => {
      if (result) wx.showToast({ title: "同步完成" });
      else this.refreshSyncText();
    });
  },

  loadCouple() {
    if (this.data.isLoading) return;

    this.setData({ isLoading: true, error: "" });
    cloudApi
      .getMyCouple()
      .then((couple) => {
        app.globalData.couple = couple;
        app.globalData.coupleReady = true;
        this.setData({ couple, archivingDaysLeft: archivingDaysLeft(couple) });
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
        const togetherDays = summary.couple ? daysTogether(summary.couple.anniversaryDate) : 0;
        const recentMood = (summary.recentRecords || []).find((record) => record.type === "mood");
        const recentMoodText = recentMood && recentMood.payload && recentMood.payload.level
          ? `${recentMood.payload.level}/5 · ${recentMood.title}`
          : "还没有心情记录";
        const upcomingAnniversary = (summary.anniversaries || [])
          .map((plan) => ({ ...plan, next: nextAnniversary(String(plan.startAt || "").slice(0, 10)) }))
          .filter((plan) => plan.next)
          .sort((a, b) => a.next.daysRemaining - b.next.daysRemaining)[0] || null;
        this.setData({
          summary,
          walletText,
          togetherDays,
          recentMoodText,
          upcomingAnniversary,
          pendingApprovals: Number(summary.pendingApprovals) || 0,
          ...this.dailyQuestionState(summary)
        });
      })
      .catch(() => {
        this.setData({ summary: null, walletText: "", pendingApprovals: 0 });
      });
  },

  // 由 summary.dailyQuestion 推导今日一问的两人回答状态与文案
  dailyQuestionState(summary) {
    const question = this.data.dailyQuestion;
    const state = summary && summary.dailyQuestion && question && summary.dailyQuestion.date === question.date
      ? summary.dailyQuestion
      : null;
    const answeredByMe = Boolean(state && state.answeredByMe) || this.data.dailyAnsweredByMe;
    const answeredByPartner = Boolean(state && state.answeredByPartner);
    let dailyStatusText = "你们今天都还没回答";
    if (answeredByMe && answeredByPartner) dailyStatusText = "都答完了，去看看";
    else if (answeredByMe) dailyStatusText = "你答了，等 TA";
    else if (answeredByPartner) dailyStatusText = "TA 已回答，等你";
    return { dailyAnsweredByMe: answeredByMe, dailyAnsweredByPartner: answeredByPartner, dailyStatusText };
  },

  openDailyAnswer() {
    this.setData({ dailyAnswerOpen: true });
  },

  onDailyAnswerInput(event) {
    this.setData({ dailyAnswerText: event.detail.value });
  },

  submitDailyAnswer() {
    if (this.data.dailySubmitting || !this.data.dailyQuestion) return;
    const content = String(this.data.dailyAnswerText || "").trim();
    if (!content) {
      wx.showToast({ title: "写一两句再提交吧", icon: "none" });
      return;
    }
    const question = this.data.dailyQuestion;
    // 同一次输入的重试共用一个幂等键，避免双击/超时重试产生重复记录
    if (!this.dailyClientRequestId) {
      this.dailyClientRequestId = `daily:${question.date}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    }
    this.setData({ dailySubmitting: true });
    cloudApi
      .createRecord({
        type: "moment",
        title: "今日一问",
        content,
        visibility: "couple",
        payload: { dailyQuestionId: question.id, dailyQuestionDate: question.date },
        clientRequestId: this.dailyClientRequestId
      })
      .then(() => {
        this.dailyClientRequestId = "";
        try { wx.setStorageSync(dailyAnswerStorageKey(question.date), content); } catch (error) { /* 缓存失败只影响摘要展示 */ }
        this.setData({
          dailyAnswerOpen: false,
          dailyAnswerText: "",
          dailyAnsweredByMe: true,
          dailyMyAnswer: content
        });
        this.setData(this.dailyQuestionState(this.data.summary));
        wx.showToast({ title: "已记下你的回答", icon: "none" });
        // 刷新一次摘要，拿到最新的两人回答状态
        this.loadSummary();
      })
      .catch((error) => {
        wx.showToast({ title: cloudApi.getErrorMessage(error, "回答保存失败，请稍后重试"), icon: "none" });
      })
      .finally(() => this.setData({ dailySubmitting: false }));
  },

  // 在一起天数指标：未设置纪念日时点击去设置页补上
  goAnniversarySetup() {
    if (this.data.togetherDays > 0) return;
    wx.showToast({ title: "去设置在一起的日子", icon: "none" });
    wx.switchTab({ url: "/pages/settings/settings" });
  },

  goSettings() {
    wx.switchTab({ url: "/pages/settings/settings" });
  },

  // "写今天"：跳转生活日记表单（record-form 自带本机草稿能力）
  goWriteToday() {
    wx.navigateTo({ url: "/pages/record-form/record-form?type=moment" });
  },

  goConflict() {
    wx.navigateTo({ url: "/pages/record-form/record-form?type=conflict" });
  },

  goMood() {
    wx.navigateTo({ url: "/pages/record-form/record-form?type=mood" });
  },

  goTodayPlan() {
    wx.navigateTo({ url: `/pages/plans/plans?type=event&date=${todayText()}` });
  },

  goPendingTasks() {
    wx.navigateTo({ url: "/pages/plans/plans?type=task" });
  },

  goPendingApprovals() {
    wx.navigateTo({ url: "/features/reward-store/reward-store" });
  },

  copyInviteCode() {
    const code = this.data.couple && this.data.couple.code;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: "已复制，发给 TA 吧", icon: "none" })
    });
  },

  goTodayAgenda() {
    wx.switchTab({ url: "/pages/calendar/calendar" });
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

  goLoveAgent() {
    wx.navigateTo({ url: "/features/love-agent/love-agent" });
  }
});
