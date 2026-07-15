const { DomainError } = require("./errors");

function normalizeRewardItem(input) {
  const item = input || {};
  const title = String(item.title || "").trim().slice(0, 80);
  const points = Number(item.points);
  if (!title || !Number.isInteger(points) || points <= 0 || points > 100000) {
    throw new DomainError("INVALID_REWARD_ITEM", "请填写有效的奖励名称和积分");
  }
  return {
    title,
    detail: String(item.detail || "").trim().slice(0, 500),
    points,
    status: item.status === "archived" ? "archived" : "active"
  };
}

const TRANSITIONS = {
  pending: new Set(["ready"]),
  ready: new Set(["used"]),
  used: new Set()
};

function transitionInventory(current, next) {
  if (!TRANSITIONS[current] || !TRANSITIONS[current].has(next)) {
    throw new DomainError("INVALID_REWARD_STATE", "奖励状态不能这样变更");
  }
  return next;
}

module.exports = { normalizeRewardItem, transitionInventory };
