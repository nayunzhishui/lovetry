const { createDraftRepository } = require("../../shared/form-assist");

module.exports = createDraftRepository({
  get(key) { return wx.getStorageSync(key); },
  set(key, value) { wx.setStorageSync(key, value); },
  remove(key) { wx.removeStorageSync(key); }
});
