const ALLOWED = new Set(["seen", "hug", "cheer"]);

function toggleReaction(current, openid, reaction) {
  if (!openid || !ALLOWED.has(reaction)) {
    const error = new Error("请选择有效回应");
    error.code = "INVALID_REACTION";
    throw error;
  }
  const next = { ...(current && typeof current === "object" ? current : {}) };
  if (next[openid] === reaction) delete next[openid];
  else next[openid] = reaction;
  return next;
}

function validateReactionRequest(request, recordId, reaction) {
  if (!request) return null;
  if (request.recordId !== recordId || request.reaction !== reaction) {
    const error = new Error("重复请求内容不一致，请刷新后重试");
    error.code = "IDEMPOTENCY_CONFLICT";
    throw error;
  }
  return request.record;
}

// owner 创建/编辑记录时调用：剥离输入 payload 里的 reactionsByOpenid，并保留库中已有的伴侣轻回应。
// 轻回应存放在 payload.reactionsByOpenid（见上方 toggleReaction 与 index.js 的 react 动作），
// 只能通过 react 动作变更，否则 owner 编辑记录会把伴侣的轻回应覆盖或清空。
function preservePartnerReactions(nextPayload, existingPayload) {
  const payload = { ...(nextPayload && typeof nextPayload === "object" ? nextPayload : {}) };
  delete payload.reactionsByOpenid;
  const existing = existingPayload && typeof existingPayload === "object"
    ? existingPayload.reactionsByOpenid
    : null;
  if (existing && typeof existing === "object") payload.reactionsByOpenid = existing;
  return payload;
}

module.exports = { preservePartnerReactions, toggleReaction, validateReactionRequest };
