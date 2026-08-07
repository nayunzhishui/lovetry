function safePart(value) {
  return String(value || "")
    .replace(/[^a-z0-9._-]/gi, "_")
    .slice(0, 120);
}

function scopeFor(openidValue, coupleIdValue) {
  const openid = safePart(openidValue);
  const coupleId = safePart(coupleIdValue);
  return openid && coupleId ? `${openid}:${coupleId}` : "";
}

function currentScope() {
  try {
    if (typeof getApp !== "function") return "";
    const app = getApp();
    const globalData = app && app.globalData || {};
    return scopeFor(globalData.openid, globalData.couple && globalData.couple._id);
  } catch (error) {
    return "";
  }
}

function scopedKeyFor(baseKey, openid, coupleId) {
  const scope = scopeFor(openid, coupleId);
  return scope ? `${String(baseKey || "")}:scope:${scope}` : "";
}

function scopedKey(baseKey) {
  const scope = currentScope();
  return scope ? `${String(baseKey || "")}:scope:${scope}` : "";
}

function createScopedStorageAdapter(options = {}) {
  const keyFor = options.openid || options.coupleId
    ? (key) => scopedKeyFor(key, options.openid, options.coupleId)
    : scopedKey;
  return {
    get(key) {
      const target = keyFor(key);
      if (!target) return null;
      return wx.getStorageSync(target);
    },
    set(key, value) {
      const target = keyFor(key);
      if (!target) throw new Error("STORAGE_SCOPE_UNAVAILABLE");
      wx.setStorageSync(target, value);
    },
    remove(key) {
      const target = keyFor(key);
      if (!target) return false;
      wx.removeStorageSync(target);
      return true;
    }
  };
}

module.exports = { createScopedStorageAdapter, currentScope, safePart, scopeFor, scopedKey, scopedKeyFor };
