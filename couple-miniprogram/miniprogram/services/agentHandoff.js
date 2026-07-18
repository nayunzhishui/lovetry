const { createHandoffRepository } = require("../../shared/agent-context");

module.exports = createHandoffRepository({
  get(key) { return wx.getStorageSync(key); },
  set(key, value) { wx.setStorageSync(key, value); },
  remove(key) { wx.removeStorageSync(key); }
});
