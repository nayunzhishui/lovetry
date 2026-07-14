const cloudApi = require("../../services/cloudApi");

Page({
  data: {
    records: [],
    isLoading: false,
    error: ""
  },

  onShow() {
    this.loadRecords();
  },

  loadRecords() {
    if (this.data.isLoading) return;

    this.setData({ isLoading: true, error: "" });
    cloudApi
      .listRecords()
      .then((items) => {
        const records = items.map((item) => ({
          ...item,
          typeLabel: item.type === "conflict" ? "吵架复盘" : "恋爱经历",
          createdAtText: item.createdAt ? new Date(item.createdAt).toLocaleString() : ""
        }));
        this.setData({ records });
      })
      .catch((error) => {
        const message = cloudApi.getErrorMessage(error, "时间线加载失败，请稍后重试");
        this.setData({ error: message });
        wx.showToast({ title: message, icon: "none" });
      })
      .finally(() => {
        this.setData({ isLoading: false });
      });
  }
});
