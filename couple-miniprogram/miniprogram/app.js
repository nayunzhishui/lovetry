const config = require("./config");
const cloudApi = require("./services/cloudApi");
const { describeSyncDigest, mergeSyncChanges, normalizeSyncOffsets, summarizeSyncChanges } = require("./shared/sync");

const SYNC_CURSOR_PREFIX = "lovetry_sync_cursor_v2:";

function syncCursorKey(openid, coupleId) {
  const safe = (value) => String(value || "unknown").replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
  return `${SYNC_CURSOR_PREFIX}${safe(openid)}:${safe(coupleId)}`;
}

App({
  globalData: {
    openid: "",
    couple: null,
    // couple 是否已完成首次拉取：避免把"尚未初始化"误判为"未绑定"
    coupleReady: false,
    isOnline: true,
    syncSummary: { total: 0, records: 0, plans: 0, notifications: 0 },
    lastSyncAt: "",
    syncErrorAt: "",
    // 最近一次同步的内容摘要：{ text, at, seen }，由首页展示
    syncDigest: null
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
        this.globalData.coupleReady = true;
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
    const cursorKey = syncCursorKey(this.globalData.openid, this.globalData.couple._id);
    let since = "";
    try { since = wx.getStorageSync(cursorKey) || ""; } catch (error) { /* use default server window */ }
    const loadPage = (offsets = {}, changes = {}, pageCount = 0) => cloudApi.syncSince(since, normalizeSyncOffsets(offsets))
      .then((page) => {
        const merged = mergeSyncChanges(changes, page.changes);
        if (page.hasMore && pageCount < 99) return loadPage(page.nextOffsets, merged, pageCount + 1);
        return { ...page, changes: merged };
      });
    return loadPage()
      .then((result) => {
        const summary = summarizeSyncChanges(result.changes);
        this.globalData.syncSummary = summary;
        this.globalData.lastSyncAt = result.cursor;
        this.globalData.syncErrorAt = "";
        if (!result.hasMore) {
          try { wx.setStorageSync(cursorKey, result.cursor); } catch (error) { /* next show retries */ }
        }
        if (summary.total > 0) {
          const text = describeSyncDigest(summary);
          // 不再用 toast 打断，改由首页展示"去看看"内容卡
          if (text) this.globalData.syncDigest = { text, at: result.cursor, seen: false };
        }
        return result;
      })
      .catch((error) => {
        this.globalData.syncErrorAt = new Date().toISOString();
        if (error && error.code === "INVALID_SYNC_CURSOR") {
          try { wx.removeStorageSync(cursorKey); } catch (storageError) { /* no-op */ }
        }
        return null;
      })
      .finally(() => { this.syncing = false; });
  }
});
