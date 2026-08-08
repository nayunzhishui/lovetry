// 未绑定伴侣的统一判断，供 records/calendar/plans/rewards/albums 页面复用。
// 只有 openid 已存在、couple 已完成首次拉取（coupleReady）且为 null 时才判定"未绑定"，
// 避免把"bootstrap 尚未完成"误判为"未绑定"。
function isCoupleMissing(globalData) {
  const data = globalData || {};
  return Boolean(data.openid) && data.coupleReady === true && !data.couple;
}

// 云函数返回的 COUPLE_REQUIRED 错误码：应展示未绑定引导而不是通用错误
function isCoupleRequiredError(error) {
  return Boolean(error && error.code === "COUPLE_REQUIRED");
}

module.exports = { isCoupleMissing, isCoupleRequiredError };
