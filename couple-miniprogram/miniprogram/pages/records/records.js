const cloudApi = require("../../services/cloudApi");
const { isCoupleMissing, isCoupleRequiredError } = require("../../services/coupleGate");
const { buildRecordInsight } = require("../../shared/record-insights");
const { formatCompact } = require("../../shared/format-date");

const TYPE_OPTIONS = [
  { value: "", label: "全部" },
  { value: "moment", label: "日记" },
  { value: "mood", label: "心情" },
  { value: "conflict", label: "沟通" },
  { value: "outing", label: "玩乐" },
  { value: "sleep", label: "睡眠" },
  { value: "period", label: "生理期" },
  { value: "intimacy", label: "亲密" },
  { value: "game", label: "游戏" },
  { value: "pomodoro", label: "专注" }
];

const TYPE_LABELS = TYPE_OPTIONS.reduce((result, item) => {
  if (item.value) result[item.value] = item.label;
  return result;
}, {});

function formatRecord(item) {
  const content = String(item.content || "").trim();
  const duration = Number(item.metrics && item.metrics.durationMinutes);
  return {
    ...item,
    typeLabel: TYPE_LABELS[item.type] || "记录",
    visibilityLabel: item.visibility === "private" ? "仅自己" : "两人共享",
    timeText: formatCompact(item.startAt || item.createdAt) || "时间未记录",
    contentPreview: content.length > 72 ? `${content.slice(0, 72)}…` : content,
    durationText: Number.isFinite(duration) && duration > 0 ? `${duration} 分钟` : "",
    categoryText: item.payload && item.payload.category || ""
  };
}

Page({
  data: {
    typeOptions: TYPE_OPTIONS,
    selectedType: "",
    records: [],
    allRecords: [],
    outingCategories: ["", "吃饭", "约会", "旅行", "酒店", "其他"],
    outingCategory: "",
    filterDate: "",
    stats: null,
    insight: null,
    isLoading: true,
    hasMore: false,
    loadingMore: false,
    needsCouple: false,
    error: ""
  },

  onShow() {
    // 未绑定伴侣时直接展示引导，不发起注定失败的云函数调用
    if (isCoupleMissing(getApp().globalData)) {
      this.setData({ needsCouple: true, isLoading: false });
      return;
    }
    if (this.data.needsCouple) this.setData({ needsCouple: false });
    this.loadRecords();
  },

  onPullDownRefresh() {
    this.loadRecords().finally(() => wx.stopPullDownRefresh());
  },

  selectType(event) {
    const selectedType = event.currentTarget.dataset.type || "";
    if (selectedType === this.data.selectedType) return;
    this.setData({ selectedType, outingCategory: "", filterDate: "" });
    this.loadRecords();
  },

  loadRecords() {
    const requestId = (this.requestId || 0) + 1;
    this.requestId = requestId;
    this.setData({ isLoading: true, error: "" });
    const type = this.data.selectedType;
    const statsPromise = ["sleep", "game", "pomodoro"].includes(type)
      ? cloudApi.getRecordStats(type).catch(() => null)
      : Promise.resolve(null);
    return Promise.all([
      cloudApi.listRecordsPaged({ type: type || undefined, limit: 50, offset: 0 }),
      statsPromise
    ])
      .then(([listResult, stats]) => {
        const records = listResult.records;
        const statsView = stats ? {
          last7DaysMinutes: type === "sleep" ? stats.last7Days.averageMinutes : stats.last7Days.totalMinutes,
          last30DaysMinutes: type === "sleep" ? stats.last30Days.averageMinutes : stats.last30Days.totalMinutes,
          last30DaysCount: stats.last30Days.count,
          modeLabel: type === "sleep" ? "平均" : "累计",
          trendText: type === "sleep" && stats.previous7Days
            ? `较前 7 天平均 ${stats.last7Days.averageMinutes - stats.previous7Days.averageMinutes >= 0 ? '+' : ''}${stats.last7Days.averageMinutes - stats.previous7Days.averageMinutes} 分钟`
            : ""
        } : null;
        const allRecords = records.map(formatRecord);
        const filteredRecords = this.filterRecords(allRecords);
        const insight = buildRecordInsight(type, filteredRecords);
        if (requestId === this.requestId) {
          this.setData({ allRecords, records: filteredRecords, stats: statsView, insight, hasMore: listResult.page.hasMore });
        }
      })
      .catch((error) => {
        if (requestId !== this.requestId) return;
        if (isCoupleRequiredError(error)) {
          this.setData({ needsCouple: true, records: [], allRecords: [], stats: null, insight: null, hasMore: false, error: "" });
          return;
        }
        this.setData({
          records: [],
          stats: null,
          insight: null,
          hasMore: false,
          error: cloudApi.getErrorMessage(error, "记录加载失败，请稍后重试")
        });
      })
      .finally(() => {
        if (requestId === this.requestId) this.setData({ isLoading: false });
      });
  },

  onReachBottom() {
    this.loadMoreRecords();
  },

  // 触底追加下一页：保持当前筛选类型，offset 以已加载的服务端数据量为准
  loadMoreRecords() {
    if (this.data.needsCouple || this.data.isLoading || this.data.loadingMore || !this.data.hasMore) return;
    const requestId = (this.requestId || 0) + 1;
    this.requestId = requestId;
    this.setData({ loadingMore: true });
    const type = this.data.selectedType;
    cloudApi
      .listRecordsPaged({ type: type || undefined, limit: 50, offset: this.data.allRecords.length })
      .then((result) => {
        if (requestId !== this.requestId) return;
        const allRecords = [...this.data.allRecords, ...result.records.map(formatRecord)];
        const filteredRecords = this.filterRecords(allRecords);
        this.setData({
          allRecords,
          records: filteredRecords,
          insight: buildRecordInsight(type, filteredRecords),
          hasMore: result.page.hasMore
        });
      })
      .catch((error) => {
        if (requestId !== this.requestId) return;
        wx.showToast({ title: cloudApi.getErrorMessage(error, "更多记录加载失败，请稍后重试"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loadingMore: false });
      });
  },

  filterRecords(records) {
    if (this.data.selectedType !== "outing") return records;
    return records.filter((record) => {
      const categoryMatches = !this.data.outingCategory || record.categoryText === this.data.outingCategory;
      const dateMatches = !this.data.filterDate || formatCompact(record.startAt || record.createdAt).startsWith(this.data.filterDate.replace(/-/g, "."));
      return categoryMatches && dateMatches;
    });
  },

  selectOutingCategory(event) {
    this.setData({ outingCategory: event.currentTarget.dataset.category || "" });
    this.updateOutingView();
  },

  selectFilterDate(event) {
    this.setData({ filterDate: event.detail.value });
    this.updateOutingView();
  },

  clearFilterDate() {
    this.setData({ filterDate: "" });
    this.updateOutingView();
  },

  updateOutingView() {
    const records = this.filterRecords(this.data.allRecords);
    this.setData({ records, insight: buildRecordInsight("outing", records) });
  },

  openRecord(event) {
    wx.navigateTo({
      url: `/pages/record-detail/record-detail?id=${encodeURIComponent(event.currentTarget.dataset.id)}`
    });
  },

  createRecord(event) {
    const type = event.currentTarget.dataset.type || this.data.selectedType || "mood";
    if (type === "pomodoro") {
      wx.navigateTo({ url: "/pages/pomodoro/pomodoro" });
      return;
    }
    wx.navigateTo({ url: `/pages/record-form/record-form?type=${type}` });
  }
});
