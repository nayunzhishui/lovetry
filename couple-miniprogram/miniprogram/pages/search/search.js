const api = require("../../services/cloudApi");

Page({
  data: { keyword: "", source: "", type: "", startDate: "", endDate: "", results: [], loading: false, searched: false, error: "" },

  onInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  onFilterInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  selectSource(event) {
    this.setData({ source: event.currentTarget.dataset.source || "" });
  },

  async search() {
    const keyword = this.data.keyword.trim();
    if (!keyword || this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const results = await api.searchAll(keyword, {
        source: this.data.source || undefined,
        type: this.data.type.trim() || undefined,
        startAt: this.data.startDate || undefined,
        endAt: this.data.endDate || undefined
      });
      this.setData({ results, searched: true });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "搜索失败") });
    } finally {
      this.setData({ loading: false });
    }
  },

  openResult(event) {
    const { id, source } = event.currentTarget.dataset;
    wx.navigateTo({
      url: source === "record"
        ? `/pages/record-detail/record-detail?id=${encodeURIComponent(id)}`
        : "/pages/plans/plans"
    });
  }
});
