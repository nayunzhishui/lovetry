const app = getApp();
const cloudApi = require("../../services/cloudApi");
const config = require("../../config");
const { daysTogether } = require("../../shared/anniversary");

// 冷静期剩余天数（向上取整，最小 0）：与云端 archive-policy 的口径一致
function archivingDaysLeft(couple) {
  if (!couple || couple.status !== "archiving" || !couple.scheduledPurgeAt) return 0;
  const dueAt = new Date(couple.scheduledPurgeAt).getTime();
  if (!Number.isFinite(dueAt)) return 0;
  return Math.max(0, Math.ceil((dueAt - Date.now()) / 86400000));
}

// 绑定成功仪式的"已展示"本机标记（按空间区分）
function ceremonyStorageKey(coupleId) {
  return `lovetry_ceremony_shown_${coupleId}`;
}

function archiveDateText(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

Page({
  data: {
    couple: null,
    archives: [],
    joinCode: "",
    spaceName: "",
    anniversaryDate: "",
    isLoading: false,
    isSaving: false,
    showLeaveConfirm: false,
    showDeveloperTools: config.enableDeveloperTools === true,
    archivingDaysLeft: 0,
    ceremonyStep: "",
    ceremonyDate: "",
    ceremonyDays: 0,
    error: ""
  },

  onLoad(options = {}) {
    // 从分享卡进入时预填邀请码：宽松处理，非空即预填（服务端会再做校验）
    const inviteCode = String(options.inviteCode || "").trim().toUpperCase().slice(0, 8);
    if (inviteCode) {
      this.setData({ joinCode: inviteCode });
      wx.showToast({ title: "已为你填好邀请码", icon: "none" });
    }
  },

  onShareAppMessage() {
    const couple = this.data.couple;
    // 仅当空间还在等待第二人加入且有加入码时，分享链接才携带邀请码
    const inviteCode = couple && couple.code && Array.isArray(couple.members) && couple.members.length < 2
      ? couple.code
      : "";
    return {
      title: "来和我共建我们的小空间",
      path: inviteCode
        ? `/pages/settings/settings?inviteCode=${inviteCode}`
        : "/pages/settings/settings"
    };
  },

  onShow() {
    this.loadCouple();
    this.loadArchives();
  },

  copyInviteCode() {
    const code = this.data.couple && this.data.couple.code;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: "已复制，发给 TA 吧", icon: "none" })
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
        this.setData({
          couple,
          spaceName: couple ? couple.spaceName || "" : "",
          anniversaryDate: couple ? couple.anniversaryDate || "" : "",
          archivingDaysLeft: archivingDaysLeft(couple)
        });
        // 创建方场景：伴侣已加入但还没设纪念日时，补上仪式卡的 b、c 两步
        this.maybeShowCeremony(couple, false);
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "情侣空间加载失败");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => this.setData({ isLoading: false }));
  },

  loadArchives() {
    cloudApi.listRelationshipArchives()
      .then((archives) => this.setData({ archives: (archives || []).map((item) => ({ ...item, archivedAtText: archiveDateText(item.archivedAt) })) }))
      .catch(() => {});
  },

  onJoinCodeInput(event) { this.setData({ joinCode: event.detail.value.toUpperCase() }); },
  onProfileInput(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  onAnniversaryChange(event) { this.setData({ anniversaryDate: event.detail.value }); },

  createCouple() {
    if (this.data.isSaving) return;
    this.setData({ isSaving: true, error: "" });
    wx.showLoading({ title: "创建中", mask: true });
    cloudApi.createCouple()
      .then((couple) => {
        app.globalData.couple = couple;
        app.globalData.coupleReady = true;
        this.setData({ couple });
        wx.showToast({ title: "已创建" });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "情侣空间创建失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => { wx.hideLoading(); this.setData({ isSaving: false }); });
  },

  joinCouple() {
    if (this.data.isSaving) return;
    if (!this.data.joinCode.trim()) {
      wx.showToast({ title: "请输入加入码", icon: "none" });
      return;
    }
    this.setData({ isSaving: true, error: "" });
    wx.showLoading({ title: "加入中", mask: true });
    cloudApi.joinCouple(this.data.joinCode.trim())
      .then((couple) => {
        app.globalData.couple = couple;
        app.globalData.coupleReady = true;
        this.setData({
          couple,
          joinCode: "",
          spaceName: couple ? couple.spaceName || "" : "",
          anniversaryDate: couple ? couple.anniversaryDate || "" : ""
        });
        // 加入成功不止一个 toast：进入三步仪式（庆祝 → 设纪念日 → 在一起天数）
        this.maybeShowCeremony(couple, true);
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "加入情侣空间失败，请检查加入码");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => { wx.hideLoading(); this.setData({ isSaving: false }); });
  },

  saveProfile() {
    if (this.data.isSaving || !this.data.couple) return;
    this.setData({ isSaving: true, error: "" });
    cloudApi.call("couple", { action: "updateProfile", profile: { spaceName: this.data.spaceName, anniversaryDate: this.data.anniversaryDate } })
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

  goExport() { wx.navigateTo({ url: "/pages/export/export" }); },
  goArchive(event) {
    const coupleId = event.currentTarget.dataset.id;
    if (!coupleId) return;
    wx.navigateTo({ url: `/pages/export/export?archive=1&coupleId=${encodeURIComponent(coupleId)}` });
  },
  goNotifications() {
    wx.navigateTo({ url: "/features/notifications/notifications" });
  },

  goIntegrationTest() {
    wx.navigateTo({ url: "/pages/integration-test/integration-test" });
  },

  // ── 绑定成功仪式 ────────────────────────────────────────────────
  // fromJoin=true：刚加入成功，从庆祝步开始；否则是创建方补看 b、c 两步。
  // 返回是否展示了仪式卡（未展示时调用方可退回普通 toast）。
  maybeShowCeremony(couple, fromJoin) {
    if (!couple || couple.status !== "active") {
      if (fromJoin) wx.showToast({ title: "已加入" });
      return false;
    }
    const members = Array.isArray(couple.members) ? couple.members : [];
    if (members.length < 2) {
      if (fromJoin) wx.showToast({ title: "已加入" });
      return false;
    }
    let shown = "";
    try { shown = wx.getStorageSync(ceremonyStorageKey(couple._id)); } catch (error) { /* storage 不可用时按未展示处理 */ }
    if (shown) {
      if (fromJoin) wx.showToast({ title: "已加入" });
      return false;
    }
    // 创建方场景只在还没设纪念日时补展示；加入方总是从庆祝步开始
    if (!fromJoin && couple.anniversaryDate) return false;
    try { wx.setStorageSync(ceremonyStorageKey(couple._id), "1"); } catch (error) { /* 标记失败时下次可能重复展示，可接受 */ }
    this.setData({
      ceremonyStep: fromJoin ? "celebrate" : "anniversary",
      ceremonyDate: couple.anniversaryDate || "",
      ceremonyDays: 0
    });
    return true;
  },

  ceremonyNext() {
    const couple = this.data.couple;
    if (couple && couple.anniversaryDate) {
      // 纪念日已经设置过：直接进入"在一起的第 N 天"
      this.setData({ ceremonyStep: "days", ceremonyDays: daysTogether(couple.anniversaryDate) });
      return;
    }
    this.setData({ ceremonyStep: "anniversary" });
  },

  ceremonySkip() {
    this.setData({ ceremonyStep: "" });
  },

  onCeremonyDateChange(event) {
    this.setData({ ceremonyDate: event.detail.value });
  },

  ceremonyConfirmDate() {
    if (this.data.isSaving) return;
    const date = this.data.ceremonyDate;
    if (!date) {
      wx.showToast({ title: "先选一个日期吧", icon: "none" });
      return;
    }
    this.setData({ isSaving: true, error: "" });
    cloudApi.call("couple", { action: "updateProfile", profile: { anniversaryDate: date } })
      .then((result) => {
        app.globalData.couple = result.couple;
        this.setData({
          couple: result.couple,
          anniversaryDate: result.couple.anniversaryDate || date,
          ceremonyStep: "days",
          ceremonyDays: daysTogether(result.couple.anniversaryDate || date)
        });
      })
      .catch((error) => this.setData({ error: cloudApi.getErrorMessage(error, "纪念日保存失败") }))
      .finally(() => this.setData({ isSaving: false }));
  },

  ceremonyFinish() {
    this.setData({ ceremonyStep: "" });
    wx.switchTab({ url: "/pages/index/index" });
  },

  // ── 解绑（7 天冷静期） ─────────────────────────────────────────
  leaveCouple() {
    if (!this.data.couple || this.data.isSaving) return;
    // 三选交互：先去导出 / 确认申请解除 / 取消（showModal 只有两个按钮，改用 actionSheet）
    wx.showActionSheet({
      itemList: ["先去导出备份", "申请解除（7 天后生效）"],
      success: (result) => {
        if (result.tapIndex === 0) {
          wx.navigateTo({ url: "/pages/export/export" });
          return;
        }
        if (result.tapIndex === 1) this.setData({ showLeaveConfirm: true });
      }
    });
  },
  cancelLeave() { this.setData({ showLeaveConfirm: false }); },

  confirmLeave() {
    if (!this.data.couple || this.data.isSaving) return;
    this.setData({ showLeaveConfirm: false, isSaving: true, error: "" });
    cloudApi.call("couple", { action: "leave", confirmText: "LEAVE_COUPLE" })
      .then((result) => {
        const couple = result.couple || null;
        app.globalData.couple = couple;
        this.setData({ couple, archivingDaysLeft: archivingDaysLeft(couple) });
        wx.showToast({ title: "解除申请已发起", icon: "none" });
      })
      .catch((error) => this.setData({ error: cloudApi.getErrorMessage(error, "解除失败") }))
      .finally(() => this.setData({ isSaving: false }));
  },

  // 冷静期内任一成员都可撤销
  revokeLeave() {
    if (!this.data.couple || this.data.isSaving) return;
    this.setData({ isSaving: true, error: "" });
    cloudApi.cancelLeaveCouple()
      .then((couple) => {
        app.globalData.couple = couple;
        this.setData({ couple, archivingDaysLeft: archivingDaysLeft(couple) });
        wx.showToast({ title: "已撤销，空间恢复正常", icon: "none" });
      })
      .catch((error) => this.setData({ error: cloudApi.getErrorMessage(error, "撤销失败") }))
      .finally(() => this.setData({ isSaving: false }));
  }
});
