const api = require("../../services/cloudApi");
const { createBackupManifest, verifyBackupManifest } = require("../../shared/backup-manifest");

Page({
  data: { loading: false, error: "", summary: "", backupText: "", backupPath: "" },

  onBackupInput(event) {
    this.setData({ backupText: event.detail.value });
  },

  async buildBackup() {
    const exportData = await api.exportData();
    const manifest = createBackupManifest(exportData);
    return { exportData, manifest, text: JSON.stringify(manifest, null, 2) };
  },

  exportSummary(exportData) {
    const truncated = exportData.truncated && Object.values(exportData.truncated).some(Boolean);
    return truncated
      ? "数据量超过单次备份上限，本次结果已标记 truncated，不能视为完整备份。请分批导出。"
      : `版本 2 备份：${exportData.records?.length || 0} 条记录、${exportData.plans?.length || 0} 个计划。`;
  },

  async copyExport() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const { exportData, text } = await this.buildBackup();
      await new Promise((resolve, reject) => wx.setClipboardData({ data: text, success: resolve, fail: reject }));
      this.setData({ summary: this.exportSummary(exportData) });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "数据导出失败") });
    } finally {
      this.setData({ loading: false });
    }
  },

  async exportFile() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const { exportData, text } = await this.buildBackup();
      const filePath = `${wx.env.USER_DATA_PATH}/lovetry-backup-${Date.now()}.json`;
      await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath, data: text, encoding: "utf8", success: resolve, fail: reject }));
      this.setData({ backupPath: filePath, summary: this.exportSummary(exportData) });
      wx.showToast({ title: "备份文件已生成" });
    } catch (error) { this.setData({ error: api.getErrorMessage(error, "备份文件生成失败") }); }
    finally { this.setData({ loading: false }); }
  },

  shareFile() {
    if (!this.data.backupPath) return;
    if (typeof wx.shareFileMessage !== "function") {
      wx.showToast({ title: "当前微信版本不支持文件分享", icon: "none" });
      return;
    }
    wx.shareFileMessage({ filePath: this.data.backupPath, fileName: "lovetry-backup.json" });
  },

  chooseBackupFile() {
    wx.chooseMessageFile({ count: 1, type: "file", extension: ["json"], success: ({ tempFiles }) => {
      const filePath = tempFiles && tempFiles[0] && tempFiles[0].path;
      if (!filePath) return;
      wx.getFileSystemManager().readFile({ filePath, encoding: "utf8", success: ({ data }) => {
        try {
          const parsed = JSON.parse(data);
          if (Number(parsed.schemaVersion) === 2 && !verifyBackupManifest(parsed)) throw new Error("摘要不匹配");
          const payload = Number(parsed.schemaVersion) === 2 ? parsed.payload : parsed;
          this.setData({ backupText: data, summary: `已读取备份：${payload.records?.length || 0} 条记录、${payload.plans?.length || 0} 个计划。` });
        } catch (error) { this.setData({ error: "备份文件格式或摘要不正确" }); }
      }, fail: () => this.setData({ error: "备份文件读取失败" }) });
    } });
  },

  async restoreBackup() {
    if (this.data.loading || !this.data.backupText.trim()) return;
    this.setData({ loading: true, error: "" });
    try {
      const parsed = JSON.parse(this.data.backupText);
      if (Number(parsed.schemaVersion) === 2 && !verifyBackupManifest(parsed)) throw new Error("备份摘要不匹配");
      const backup = Number(parsed.schemaVersion) === 2 ? parsed.payload : parsed;
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
