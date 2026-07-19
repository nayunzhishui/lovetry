const { DomainError } = require("./errors");

const REACTIONS = new Set(["seen", "hug", "cheer"]);

function toggleReaction(current, openid, reaction) {
  if (!openid || !REACTIONS.has(reaction)) {
    throw new DomainError("INVALID_REACTION", "请选择有效回应");
  }
  const next = { ...(current && typeof current === "object" ? current : {}) };
  if (next[openid] === reaction) delete next[openid];
  else next[openid] = reaction;
  return next;
}

function validateReactionRequest(request, recordId, reaction) {
  if (!request) return null;
  if (request.recordId !== recordId || request.reaction !== reaction) {
    throw new DomainError("IDEMPOTENCY_CONFLICT", "重复请求内容不一致，请刷新后重试");
  }
  return request.record;
}

module.exports = { toggleReaction, validateReactionRequest };
