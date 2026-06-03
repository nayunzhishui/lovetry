Page({
  data: {
    records: []
  },

  onShow() {
    this.loadRecords();
  },

  loadRecords() {
    wx.cloud
      .callFunction({
        name: "records",
        data: { action: "list" }
      })
      .then((res) => {
        const records = (res.result.records || []).map((item) => ({
          ...item,
          typeLabel: item.type === "conflict" ? "吵架复盘" : "恋爱经历",
          createdAtText: item.createdAt ? new Date(item.createdAt).toLocaleString() : ""
        }));
        this.setData({ records });
      })
      .catch((err) => {
        console.error(err);
        wx.showToast({ title: "加载失败", icon: "none" });
      });
  }
});
