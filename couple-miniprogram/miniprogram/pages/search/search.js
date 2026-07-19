const api = require("../../services/cloudApi");
const {
  decorateSearchResult,
  typeOptionsForSource,
  validateSearchRange
} = require("../../shared/search");

const initialTypeOptions = typeOptionsForSource("");

Page({
  data: {
    keyword: "",
    source: "",
    type: "",
    typeIndex: 0,
    typeOptions: initialTypeOptions,
    selectedTypeLabel: initialTypeOptions[0].label,
    startDate: "",
    endDate: "",
    results: [],
    loading: false,
    searched: false,
    error: ""
  },

  onInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  onFilterInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  selectSource(event) {
    const source = event.currentTarget.dataset.source || "";
    const typeOptions = typeOptionsForSource(source);
    this.setData({
      source,
      type: "",
      typeIndex: 0,
      typeOptions,
      selectedTypeLabel: typeOptions[0].label
    });
  },

  selectType(event) {
    const typeIndex = Number(event.detail.value) || 0;
    const option = this.data.typeOptions[typeIndex] || this.data.typeOptions[0];
    this.setData({ typeIndex, type: option.value, selectedTypeLabel: option.label });
  },

  clearFilters() {
    const typeOptions = typeOptionsForSource("");
    this.setData({
      source: "",
      type: "",
      typeIndex: 0,
      typeOptions,
      selectedTypeLabel: typeOptions[0].label,
      startDate: "",
      endDate: "",
      error: ""
    });
  },

  async search() {
    const keyword = this.data.keyword.trim();
    if (!keyword || this.data.loading) return;
    try {
      validateSearchRange(this.data.startDate, this.data.endDate);
    } catch (error) {
      this.setData({ error: error.message });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const results = await api.searchAll(keyword, {
        source: this.data.source || undefined,
        type: this.data.type || undefined,
        startAt: this.data.startDate || undefined,
        endAt: this.data.endDate || undefined
      });
      this.setData({ results: results.map(decorateSearchResult), searched: true });
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
