const cloudApi = require("../../services/cloudApi");

const TYPE_OPTIONS = [
  { value: "", label: "全部" },
  { value: "moment", label: "日记" },
  { value: "mood", label: "心情" },
  { value: "conflict", label: "沟通" },
  { value: "outing", label: "玩乐" },
  { value: "sleep", label: "睡眠" },
  { value: "period", label: "生理期" },
  { value: "game", label: "游戏" },
  { value: "pomodoro", label: "专注" }
];

const TYPE_LABELS = TYPE_OPTIONS.reduce((result, item) => {
  if (item.value) result[item.value] = item.label;
  return result;
}, {});

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return "时间未记录";
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function formatRecord(item) {
  const content = String(item.content || "").trim();
  const duration = Number(item.metrics && item.metrics.durationMinutes);
  return {
    ...item,
    typeLabel: TYPE_LABELS[item.type] || "记录",
    visibilityLabel: item.visibility === "private" ? "仅自己" : "两人共享",
    timeText: formatDate(item.startAt || item.createdAt),
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
    isLoading: true,
    error: ""
  },

  onShow() {
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
      ? cloudApi.getRecordStats(type)
      : Promise.resolve(null);
    return Promise.all([
      cloudApi.listRecords({ type: type || undefined, limit: 50 }),
      statsPromise
    ])
      .then(([records, stats]) => {
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
        if (requestId === this.requestId) this.setData({ allRecords, records: this.filterRecords(allRecords), stats: statsView });
      })
      .catch((error) => {
        if (requestId !== this.requestId) return;
        this.setData({
          records: [],
          stats: null,
          error: cloudApi.getErrorMessage(error, "记录加载失败，请稍后重试")
        });
      })
      .finally(() => {
        if (requestId === this.requestId) this.setData({ isLoading: false });
      });
  },

  filterRecords(records) {
    if (this.data.selectedType !== "outing") return records;
    return records.filter((record) => {
      const categoryMatches = !this.data.outingCategory || record.categoryText === this.data.outingCategory;
      const dateMatches = !this.data.filterDate || formatDate(record.startAt || record.createdAt).startsWith(this.data.filterDate.replace(/-/g, "."));
      return categoryMatches && dateMatches;
    });
  },

  selectOutingCategory(event) {
    this.setData({ outingCategory: event.currentTarget.dataset.category || "" });
    this.setData({ records: this.filterRecords(this.data.allRecords) });
  },

  selectFilterDate(event) {
    this.setData({ filterDate: event.detail.value });
    this.setData({ records: this.filterRecords(this.data.allRecords) });
  },

  clearFilterDate() {
    this.setData({ filterDate: "" });
    this.setData({ records: this.filterRecords(this.data.allRecords) });
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
