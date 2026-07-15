const cloudApi = require("../../services/cloudApi");

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
    createdAtText: item.createdAt ? new Date(item.createdAt).toLocaleString() : "",
    reactions: REACTIONS.map((reaction) => ({ ...reaction, active: reactionMap[openid] === reaction.value, count: Object.values(reactionMap).filter((value) => value === reaction.value).length }))
  };
}

Page({
  data: {
    records: [],
    openid: "",
    reactingId: "",
    isLoading: false,
    error: ""
  },

  onShow() {
    this.loadRecords();
  },

  loadRecords() {
    if (this.data.isLoading) return;

    this.setData({ isLoading: true, error: "" });
    Promise.all([cloudApi.login(), cloudApi.listSharedFeed()])
      .then(([identity, items]) => {
        this.setData({ openid: identity.openid, records: items.map((item) => decorate(item, identity.openid)) });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "时间线加载失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        this.setData({ isLoading: false });
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
