const cloudApi = require("../../services/cloudApi");
const { isCoupleMissing, isCoupleRequiredError } = require("../../services/coupleGate");
const { formatDateTime } = require("../../shared/format-date");

const PAGE_SIZE = 50;

const REACTIONS = [
  { value: "seen", label: "看见了" },
  { value: "hug", label: "抱一下" },
  { value: "cheer", label: "一起加油" }
];

function decorate(item, openid) {
  const reactionMap = item.payload && item.payload.reactionsByOpenid || {};
  return {
    ...item,
    typeLabel: item.type === "mood" ? "心情" : item.type === "outing" ? "共同经历" : "生活片段",
    createdAtText: formatDateTime(item.createdAt),
    reactions: REACTIONS.map((reaction) => ({ ...reaction, active: reactionMap[openid] === reaction.value, count: Object.values(reactionMap).filter((value) => value === reaction.value).length }))
  };
}

Page({
  data: {
    records: [],
    openid: "",
    reactingId: "",
    isLoading: false,
    loadingMore: false,
    hasMore: false,
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

  loadRecords() {
    if (this.data.isLoading) return;

    this.setData({ isLoading: true, error: "" });
    Promise.all([cloudApi.login(), cloudApi.listSharedFeed({ limit: PAGE_SIZE, offset: 0 })])
      .then(([identity, result]) => {
        this.setData({
          openid: identity.openid,
          records: result.records.map((item) => decorate(item, identity.openid)),
          hasMore: result.page.hasMore
        });
      })
      .catch((error) => {
        if (isCoupleRequiredError(error)) {
          this.setData({ needsCouple: true, records: [], hasMore: false, error: "" });
          return;
        }
        this.setData({ error: cloudApi.getErrorMessage(error, "时间线加载失败，请稍后重试") });
      })
      .finally(() => {
        this.setData({ isLoading: false });
      });
  },

  onReachBottom() {
    this.loadMoreRecords();
  },

  // 触底追加下一页共同动态
  loadMoreRecords() {
    if (this.data.needsCouple || this.data.isLoading || this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true });
    cloudApi
      .listSharedFeed({ limit: PAGE_SIZE, offset: this.data.records.length })
      .then((result) => {
        this.setData({
          records: [...this.data.records, ...result.records.map((item) => decorate(item, this.data.openid))],
          hasMore: result.page.hasMore
        });
      })
      .catch((error) => {
        wx.showToast({ title: cloudApi.getErrorMessage(error, "更多动态加载失败，请稍后重试"), icon: "none" });
      })
      .finally(() => {
        this.setData({ loadingMore: false });
      });
  },

  react(event) {
    const recordId = event.currentTarget.dataset.id;
    const reaction = event.currentTarget.dataset.reaction;
    if (!recordId || this.data.reactingId) return;
    this.setData({ reactingId: recordId, error: "" });
    const key = `reaction:${recordId}:${reaction}:${Date.now()}`;
    cloudApi.reactToRecord(recordId, reaction, key)
      .then((updated) => this.setData({ records: this.data.records.map((item) => item._id === recordId ? decorate(updated, this.data.openid) : item) }))
      .catch((error) => this.setData({ error: cloudApi.getErrorMessage(error, "回应没有保存，请重试") }))
      .finally(() => this.setData({ reactingId: "" }));
  }
});
