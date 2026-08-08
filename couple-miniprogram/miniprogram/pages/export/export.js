const api = require("../../services/cloudApi");
const { createBackupManifest, verifyBackupManifest } = require("../../shared/backup-manifest");

Page({
  data: {
    loading: false,
    error: "",
    summary: "",
    backupText: "",
    backupPath: "",
    archiveMode: false,
    archiveCoupleId: ""
  },

  onLoad(options = {}) {
    const archiveMode = options.archive === "1" && Boolean(options.coupleId);
    this.setData({ archiveMode, archiveCoupleId: archiveMode ? options.coupleId : "" });
  },

  onBackupInput(event) { this.setData({ backupText: event.detail.value }); },

  async buildBackup() {
    const exportData = this.data.archiveMode
      ? await api.exportArchivedData(this.data.archiveCoupleId)
      : await api.exportData();
    const manifest = createBackupManifest(exportData);
    return { exportData, manifest, text: JSON.stringify(manifest, null, 2) };
  },

  exportSummary(exportData) {
    const truncated = exportData.truncated && Object.values(exportData.truncated).some(Boolean);
    if (truncated) return "数据量超过单次备份上限，本次结果已标记 truncated，不能视为完整备份。";
    const prefix = this.data.archiveMode ? "历史只读档案" : "版本 2 备份";
    return `${prefix}：${exportData.records?.length || 0} 条记录、${exportData.plans?.length || 0} 个计划。`;
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
    } finally { this.setData({ loading: false }); }
  },

  async exportFile() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const { exportData, text } = await this.buildBackup();
      const suffix = this.data.archiveMode ? "archive" : "backup";
      const filePath = `${wx.env.USER_DATA_PATH}/lovetry-${suffix}-${Date.now()}.json`;
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
    wx.shareFileMessage({ filePath: this.data.backupPath, fileName: this.data.archiveMode ? "lovetry-archive.json" : "lovetry-backup.json" });
  },

  chooseBackupFile() {
    if (this.data.archiveMode) return;
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
    if (this.data.archiveMode || this.data.loading || !this.data.backupText.trim()) return;
    this.setData({ loading: true, error: "", summary: "正在分批校验并恢复…" });
    try {
      const parsed = JSON.parse(this.data.backupText);
      if (Number(parsed.schemaVersion) === 2 && !verifyBackupManifest(parsed)) throw new Error("备份摘要不匹配");
      const backup = Number(parsed.schemaVersion) === 2 ? parsed.payload : parsed;
      const counts = await api.importData(backup);
      this.setData({ summary: `恢复记录 ${counts.records} 条、计划 ${counts.plans} 项；跳过 ${counts.skipped} 项重复或无效数据。` });
      wx.showToast({ title: "恢复完成" });
    } catch (error) {
      const fallback = error instanceof SyntaxError ? "JSON 格式无法解析" : "备份恢复失败，可重新点击继续断点恢复";
      this.setData({ error: api.getErrorMessage(error, fallback) });
    } finally { this.setData({ loading: false }); }
  }
});