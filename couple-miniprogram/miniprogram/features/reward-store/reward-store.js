const api = require("../../services/cloudApi");

function requestKey(itemId) {
  return `reward-item:${itemId}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}

function stableRequestKey(itemId) {
  const storageKey = `lovetry_reward_item_request_${itemId}`;
  try {
    const saved = wx.getStorageSync(storageKey);
    if (saved) return saved;
    const key = requestKey(itemId);
    wx.setStorageSync(storageKey, key);
    return key;
  } catch (error) {
    return requestKey(itemId);
  }
}

function clearRequestKey(itemId) {
  try { wx.removeStorageSync(`lovetry_reward_item_request_${itemId}`); } catch (error) { /* storage cleanup is best effort */ }
}

Page({
  data: {
    mode: "store", loading: false, submitting: false, error: "", openid: "", items: [], inventory: [], archiveItemId: "",
    form: { title: "", detail: "", points: "" }
  },

  onLoad(query) { this.setData({ mode: query.mode === "inventory" ? "inventory" : "store" }); },
  onShow() { this.load(); },

  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const [identity, items, inventory] = await Promise.all([api.login(), api.listRewardCatalog(), api.listRewardInventory()]);
      this.setData({ openid: identity.openid, items, inventory });
    } catch (error) { this.setData({ error: api.getErrorMessage(error, "奖励商城加载失败") }); }
    finally { this.setData({ loading: false }); }
  },

  switchMode(event) { this.setData({ mode: event.currentTarget.dataset.mode, error: "" }); },
  onInput(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); },

  async createItem() {
    if (this.data.submitting) return;
    this.setData({ submitting: true, error: "" });
    try {
      const item = await api.createRewardItem(this.data.form);
      this.setData({ items: [item, ...this.data.items], form: { title: "", detail: "", points: "" } });
      wx.showToast({ title: "奖励已上架" });
    } catch (error) { this.setData({ error: api.getErrorMessage(error, "奖励上架失败") }); }
    finally { this.setData({ submitting: false }); }
  },

  async redeem(event) {
    if (this.data.submitting) return;
    const itemId = event.currentTarget.dataset.id;
    this.setData({ submitting: true, error: "" });
    try {
      const inventory = await api.redeemRewardItem(itemId, stableRequestKey(itemId));
      clearRequestKey(itemId);
      this.setData({ inventory: [inventory, ...this.data.inventory], mode: "inventory" });
      wx.showToast({ title: "已放入仓库" });
    } catch (error) { this.setData({ error: api.getErrorMessage(error, "兑换失败") }); }
    finally { this.setData({ submitting: false }); }
  },

  async advance(event) {
    if (this.data.submitting) return;
    const id = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status;
    this.setData({ submitting: true, error: "" });
    try {
      const updated = await api.setRewardInventoryStatus(id, status);
      this.setData({ inventory: this.data.inventory.map((item) => item._id === id ? updated : item) });
      wx.showToast({ title: status === "ready" ? "已确认兑现" : "已标记使用" });
    } catch (error) { this.setData({ error: api.getErrorMessage(error, "状态更新失败") }); }
    finally { this.setData({ submitting: false }); }
  },

  requestArchive(event) {
    this.setData({ archiveItemId: event.currentTarget.dataset.id || "" });
  },

  cancelArchive() {
    this.setData({ archiveItemId: "" });
  },

  async confirmArchive() {
    const itemId = this.data.archiveItemId;
    if (!itemId || this.data.submitting) return;
    this.setData({ archiveItemId: "", submitting: true, error: "" });
    try {
      await api.archiveRewardItem(itemId);
      this.setData({ items: this.data.items.filter((item) => item._id !== itemId) });
      wx.showToast({ title: "奖励已下架" });
    } catch (error) { this.setData({ error: api.getErrorMessage(error, "奖励下架失败") }); }
    finally { this.setData({ submitting: false }); }
  }
});
