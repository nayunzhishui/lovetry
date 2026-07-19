const api = require("../../services/cloudApi");

function randomName() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatDay(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "时间未记录";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function decorateAsset(asset, urls) {
  return {
    ...asset,
    tempURL: (urls || []).find((item) => item.fileID === asset.fileID)?.tempFileURL || "",
    createdAtText: formatDay(asset.createdAt)
  };
}

Page({
  data: {
    couple: null,
    openid: "",
    albums: [],
    selectedAlbum: null,
    assets: [],
    newTitle: "",
    newDescription: "",
    renameTitle: "",
    editDescription: "",
    loading: false,
    uploading: false,
    uploadProgress: "",
    hasMore: false,
    loadingMore: false,
    error: ""
  },

  onShow() {
    this.loadAlbums();
  },

  async loadAlbums() {
    this.setData({ loading: true, error: "" });
    try {
      const [identity, couple, albums] = await Promise.all([api.login(), api.getMyCouple(), api.listAlbums()]);
      this.setData({ openid: identity.openid, couple, albums });
      if (this.data.selectedAlbum) {
        const selected = albums.find((album) => album._id === this.data.selectedAlbum._id);
        if (selected) await this.openAlbum({ currentTarget: { dataset: { id: selected._id } } });
      }
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "相册加载失败") });
    } finally {
      this.setData({ loading: false });
    }
  },

  onTitleInput(event) {
    this.setData({ newTitle: event.detail.value });
  },

  onRenameInput(event) {
    this.setData({ renameTitle: event.detail.value });
  },

  onDescriptionInput(event) {
    this.setData({ newDescription: event.detail.value });
  },

  onEditDescriptionInput(event) {
    this.setData({ editDescription: event.detail.value });
  },

  async createAlbum() {
    const title = this.data.newTitle.trim();
    if (!title || this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const album = await api.createAlbum({ title, description: this.data.newDescription.trim() });
      this.setData({ newTitle: "", newDescription: "", selectedAlbum: album });
      await this.loadAlbums();
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "创建相册失败") });
    } finally {
      this.setData({ loading: false });
    }
  },

  async openAlbum(event) {
    const album = this.data.albums.find((item) => item._id === event.currentTarget.dataset.id);
    if (!album) return;
    this.setData({ selectedAlbum: album, renameTitle: album.title, editDescription: album.description || "", loading: true, error: "" });
    try {
      const result = await api.listMediaAssets({ albumId: album._id, offset: 0, limit: 30 });
      const assets = result.assets;
      const fileList = assets.map((asset) => asset.fileID);
      let urls = [];
      if (fileList.length) {
        const response = await wx.cloud.getTempFileURL({ fileList });
        urls = response.fileList || [];
      }
      this.setData({
        assets: assets.map((asset) => decorateAsset(asset, urls)),
        hasMore: result.page.hasMore
      });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "照片加载失败") });
    } finally {
      this.setData({ loading: false });
    }
  },

  async renameAlbum() {
    const title = this.data.renameTitle.trim();
    if (!this.data.selectedAlbum || !title || this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const album = await api.updateAlbum(this.data.selectedAlbum._id, { title, description: this.data.editDescription.trim() });
      this.setData({ selectedAlbum: album, albums: this.data.albums.map((item) => item._id === album._id ? album : item) });
      wx.showToast({ title: "相册信息已更新" });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "相册更新失败") });
    } finally {
      this.setData({ loading: false });
    }
  },

  async deleteAlbum() {
    if (!this.data.selectedAlbum || this.data.loading) return;
    if (this.data.assets.length) {
      wx.showToast({ title: "请先删除相册内照片", icon: "none" });
      return;
    }
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: "删除空相册？", confirmText: "删除", success: (result) => resolve(result.confirm), fail: () => resolve(false)
    }));
    if (!confirmed) return;
    this.setData({ loading: true, error: "" });
    try {
      await api.deleteAlbum(this.data.selectedAlbum._id);
      this.setData({ selectedAlbum: null, assets: [], albums: this.data.albums.filter((item) => item._id !== this.data.selectedAlbum._id) });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "相册删除失败") });
    } finally {
      this.setData({ loading: false });
    }
  },

  async setCover(event) {
    if (!this.data.selectedAlbum || this.data.loading) return;
    try {
      const album = await api.updateAlbum(this.data.selectedAlbum._id, { coverAssetId: event.currentTarget.dataset.id });
      this.setData({ selectedAlbum: album, albums: this.data.albums.map((item) => item._id === album._id ? album : item) });
      wx.showToast({ title: "已设为封面" });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "封面设置失败") });
    }
  },

  async loadMore() {
    if (!this.data.selectedAlbum || !this.data.hasMore || this.data.loadingMore) return;
    this.setData({ loadingMore: true, error: "" });
    try {
      const result = await api.listMediaAssets({
        albumId: this.data.selectedAlbum._id,
        offset: this.data.assets.length,
        limit: 30
      });
      const fileList = result.assets.map((asset) => asset.fileID);
      const response = fileList.length ? await wx.cloud.getTempFileURL({ fileList }) : { fileList: [] };
      const added = result.assets.map((asset) => decorateAsset(asset, response.fileList || []));
      this.setData({ assets: [...this.data.assets, ...added], hasMore: result.page.hasMore });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "更多照片加载失败") });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  async chooseAndUpload() {
    if (!this.data.selectedAlbum || !this.data.couple || this.data.uploading) return;
    this.setData({ uploading: true, error: "" });
    let completed = 0;
    try {
      const selected = await wx.chooseMedia({ count: 6, mediaType: ["image"], sourceType: ["album", "camera"] });
      const files = selected.tempFiles || [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        this.setData({ uploadProgress: `正在上传 ${index + 1}/${files.length}` });
        if (file.size > 10 * 1024 * 1024) throw new Error("单张图片不能超过 10MB");
        let filePath = file.tempFilePath;
        try {
          const compressed = await wx.compressImage({ src: filePath, quality: 78 });
          filePath = compressed.tempFilePath;
        } catch (error) {
          console.warn("image compression skipped");
        }
        const extension = (filePath.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || "jpg";
        const cloudPath = `couples/${this.data.couple._id}/${this.data.openid}/${this.data.selectedAlbum._id}/${randomName()}.${extension}`;
        const uploaded = await wx.cloud.uploadFile({ cloudPath, filePath });
        try {
          await api.addAsset({
            albumId: this.data.selectedAlbum._id,
            fileID: uploaded.fileID,
            cloudPath,
            size: file.size,
            width: file.width,
            height: file.height,
            mimeType: file.fileType ? `image/${file.fileType}` : "image/jpeg"
          });
          completed += 1;
        } catch (error) {
          try { await wx.cloud.deleteFile({ fileList: [uploaded.fileID] }); } catch (cleanupError) { console.warn("orphan file cleanup failed"); }
          throw error;
        }
      }
      wx.showToast({ title: "照片已加入" });
      await this.openAlbum({ currentTarget: { dataset: { id: this.data.selectedAlbum._id } } });
    } catch (error) {
      const message = error.errMsg?.includes("cancel") ? "" : api.getErrorMessage(error, error.message || "上传失败");
      if (completed > 0 && this.data.selectedAlbum) {
        await this.openAlbum({ currentTarget: { dataset: { id: this.data.selectedAlbum._id } } });
      }
      this.setData({ error: completed > 0 ? `已加入 ${completed} 张；后续照片未完成：${message}` : message });
    } finally {
      this.setData({ uploading: false, uploadProgress: "" });
    }
  },

  preview(event) {
    const current = event.currentTarget.dataset.url;
    const urls = this.data.assets.map((asset) => asset.tempURL).filter(Boolean);
    if (current) wx.previewImage({ current, urls });
  },

  async deleteAsset(event) {
    const assetId = event.currentTarget.dataset.id;
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: "删除这张照片？",
      content: "删除后无法在相册中恢复。",
      confirmText: "删除",
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false)
    }));
    if (!confirmed) return;
    try {
      await api.deleteAsset(assetId);
      await this.openAlbum({ currentTarget: { dataset: { id: this.data.selectedAlbum._id } } });
    } catch (error) {
      this.setData({ error: api.getErrorMessage(error, "删除照片失败") });
    }
  }
});
