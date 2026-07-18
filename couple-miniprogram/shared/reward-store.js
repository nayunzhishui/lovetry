const { DomainError } = require("./errors");

function normalizeRewardItem(input) {
  const item = input || {};
  const title = String(item.title || "").trim().slice(0, 80);
  const points = Number(item.points);
  if (!title || !Number.isInteger(points) || points <= 0 || points > 100000) {
    throw new DomainError("INVALID_REWARD_ITEM", "请填写有效的奖励名称和积分");
  }
  const detail = String(item.detail || "").trim().slice(0, 500);
  const unsafe = /(查看|看|检查).{0,4}(手机|聊天|隐私)|密码|定位|亲吻|接吻|拥抱|抱抱|牵手|按摩|身体接触|亲密接触|性行为|做爱|强制.{0,4}(道歉|原谅)|道歉券|原谅券|听话|服从|不能拒绝|控制权/;
  if (unsafe.test(`${title} ${detail}`)) {
    throw new DomainError("UNSAFE_REWARD_ITEM", "这类约定不能作为积分奖励，请改为双方自愿沟通");
  }
  return {
    title,
    detail,
    points,
    status: "proposed"
  };
}

function transitionRewardItem(current, next, actorRole) {
  const allowed = (current === "proposed" && actorRole === "partner" && ["active", "rejected"].includes(next)) ||
    (actorRole === "creator" && next === "archived" && ["proposed", "active"].includes(current));
  if (!allowed) throw new DomainError("REWARD_REVIEW_REQUIRED", "奖励需要由伴侣确认后才能兑换");
  return next;
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

module.exports = { normalizeRewardItem, transitionInventory, transitionRewardItem };
