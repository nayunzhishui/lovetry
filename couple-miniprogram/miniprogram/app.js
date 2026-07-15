const config = require("./config");
const cloudApi = require("./services/cloudApi");
const { mergeSyncChanges, summarizeSyncChanges } = require("../shared/sync");

const SYNC_CURSOR_KEY = "lovetry_sync_cursor_v1";

App({
  globalData: {
    openid: "",
    couple: null,
    isOnline: true,
    syncSummary: { total: 0, records: 0, plans: 0, notifications: 0 },
    lastSyncAt: ""
  },

  onShow() {
    if (this.globalData.couple) this.syncChanges();
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
        if (couple) this.syncChanges({ silent: true });
        return this.globalData;
      })
      .catch((err) => {
        console.error("bootstrap failed", err);
        wx.showToast({ title: "初始化失败", icon: "none" });
      });
  },

  syncChanges(options = {}) {
    if (this.syncing || !this.globalData.couple || !this.globalData.isOnline) return Promise.resolve(null);
    this.syncing = true;
    let since = "";
    try { since = wx.getStorageSync(SYNC_CURSOR_KEY) || ""; } catch (error) { /* use default server window */ }
    const loadPage = (offset = 0, changes = {}) => cloudApi.syncSince(since, offset)
      .then((page) => {
        const merged = mergeSyncChanges(changes, page.changes);
        if (page.hasMore && page.nextOffset <= 5000) return loadPage(page.nextOffset, merged);
        return { ...page, changes: merged };
      });
    return loadPage()
      .then((result) => {
        const summary = summarizeSyncChanges(result.changes);
        this.globalData.syncSummary = summary;
        this.globalData.lastSyncAt = result.cursor;
        if (!result.hasMore) {
          try { wx.setStorageSync(SYNC_CURSOR_KEY, result.cursor); } catch (error) { /* next show retries */ }
        }
        if (!options.silent && summary.total > 0) {
          wx.showToast({ title: `发现 ${summary.total} 项远端更新`, icon: "none" });
        }
        return result;
      })
      .catch((error) => {
        if (error && error.code === "INVALID_SYNC_CURSOR") {
          try { wx.removeStorageSync(SYNC_CURSOR_KEY); } catch (storageError) { /* no-op */ }
        }
        return null;
      })
      .finally(() => { this.syncing = false; });
  }
});
