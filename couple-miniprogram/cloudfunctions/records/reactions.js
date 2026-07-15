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

module.exports = { toggleReaction, validateReactionRequest };
