const api = require("../../services/cloudApi");
const config = require("../../config");

Page({
  data: {
    loading: false,
    saving: false,
    error: "",
    preferences: { enabled: true, taskDue: true, anniversary: true, rewardApproval: true },
    reminders: [],
    notifications: []
  },

  onShow() { this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },

  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      await api.materializeMyNotifications();
      const [preferences, reminders, notifications] = await Promise.all([
        api.getNotificationPreferences(), api.previewNotifications(), api.listNotifications()
      ]);
      this.setData({ preferences, reminders, notifications });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "提醒加载失败") });
    } finally { this.setData({ loading: false }); }
  },

  onToggle(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`preferences.${key}`]: event.detail.value });
  },

  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true, error: "" });
    try {
      const preferences = await api.updateNotificationPreferences(this.data.preferences);
      this.setData({ preferences });
      wx.showToast({ title: "提醒设置已保存" });
    } catch (error) { this.setData({ error: api.getErrorMessage(error, "设置保存失败") }); }
    finally { this.setData({ saving: false }); }
  },

  subscribe() {
    const templateIds = (config.subscriptionTemplateIds || []).filter((id) => id && !id.startsWith("replace-with"));
    if (!templateIds.length) {
      wx.showModal({ title: "暂未配置订阅模板", content: "本地提醒功能可以使用；正式订阅消息将在真实环境阶段配置。", showCancel: false });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      success: (result) => {
        const accepted = templateIds.filter((id) => result[id] === "accept");
        api.registerNotificationSubscription(accepted).then(() => wx.showToast({ title: accepted.length ? "订阅选择已记录" : "未开启订阅提醒", icon: "none" }));
      },
      fail: (error) => this.setData({ error: api.getErrorMessage(error, "订阅请求未完成") })
    });
  },

  markRead(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    api.markNotificationRead(id).then(() => this.setData({ notifications: this.data.notifications.map((item) => item._id === id ? { ...item, readAt: new Date().toISOString() } : item) }));
  }
});
