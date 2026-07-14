const api = require("../../services/cloudApi");

Page({
  data: { loading: false, error: "", summary: "", backupText: "" },

  onBackupInput(event) {
    this.setData({ backupText: event.detail.value });
  },

  async copyExport() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const exportData = await api.exportData();
      const text = JSON.stringify(exportData, null, 2);
      await new Promise((resolve, reject) => wx.setClipboardData({ data: text, success: resolve, fail: reject }));
      const truncated = exportData.truncated && Object.values(exportData.truncated).some(Boolean);
      this.setData({ summary: truncated
        ? "数据量超过单次备份上限，本次结果已标记 truncated，不能视为完整备份。请联系开发者分批导出。"
        : `已导出 ${exportData.records?.length || 0} 条记录、${exportData.plans?.length || 0} 个计划。`
      });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "数据导出失败") });
    } finally {
      this.setData({ loading: false });
    }
  },

  async restoreBackup() {
    if (this.data.loading || !this.data.backupText.trim()) return;
    this.setData({ loading: true, error: "" });
    try {
      const backup = JSON.parse(this.data.backupText);
      const counts = await api.importData(backup);
      this.setData({ summary: `恢复记录 ${counts.records} 条、计划 ${counts.plans} 项；跳过 ${counts.skipped} 项重复或无效数据。` });
      wx.showToast({ title: "恢复完成" });
    } catch (error) {
      const fallback = error instanceof SyntaxError ? "JSON 格式无法解析" : "备份恢复失败";
      this.setData({ error: api.getErrorMessage(error, fallback) });
    } finally {
      this.setData({ loading: false });
    }
  }
});
