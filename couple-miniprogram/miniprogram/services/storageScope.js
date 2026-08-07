function safePart(value) {
  return String(value || "")
    .replace(/[^a-z0-9._-]/gi, "_")
    .slice(0, 120);
}

function currentScope() {
  try {
    if (typeof getApp !== "function") return "";
    const app = getApp();
    const globalData = app && app.globalData || {};
    const openid = safePart(globalData.openid);
    const coupleId = safePart(globalData.couple && globalData.couple._id);
    if (!openid || !coupleId) return "";
    return `${openid}:${coupleId}`;
  } catch (error) {
    return "";
  }
}

function scopedKey(baseKey) {
  const scope = currentScope();
  return scope ? `${String(baseKey || "")}:scope:${scope}` : "";
}

function createScopedStorageAdapter() {
  return {
    get(key) {
      const target = scopedKey(key);
      if (!target) return null;
      return wx.getStorageSync(target);
    },
    set(key, value) {
      const target = scopedKey(key);
      if (!target) throw new Error("STORAGE_SCOPE_UNAVAILABLE");
      wx.setStorageSync(target, value);
    },
    remove(key) {
      const target = scopedKey(key);
      if (!target) return false;
      wx.removeStorageSync(target);
      return true;
    }
  };
}

module.exports = { createScopedStorageAdapter, currentScope, scopedKey };
