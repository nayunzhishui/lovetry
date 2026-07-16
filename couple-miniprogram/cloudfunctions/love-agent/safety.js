const RISK_PATTERNS = {
  immediate_danger: [
    /打我|掐我|勒住|拿刀|威胁.{0,6}(杀|伤害)|强迫发生关系|不让我走|软禁|家暴/
  ],
  self_harm: [
    /不想活|想死|自杀|伤害自己|结束生命/
  ],
  coercive_control: [
    /偷拍视频|装定位|跟踪|偷看手机|骗他|骗她|操控|报复|让.{0,3}(他|她).{0,3}离不开/
  ]
};

function assessRisk(question) {
  const text = String(question || "").replace(/\s+/g, "");
  for (const [risk, patterns] of Object.entries(RISK_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(text))) return risk;
  }
  return "none";
}

function safetyResponse(risk) {
  if (risk === "immediate_danger") {
    return "这听起来可能已经不是普通的沟通分歧。请先把人身安全放在第一位：如果你此刻感到危险，尽量前往有其他人在场的安全地点，联系可信任的人，并联系当地紧急或专业支持。不要在可能升级危险的情况下独自对质。";
  }
  if (risk === "self_harm") {
    return "我很在意你现在的安全。请不要独自承受，先联系一位你信任且能尽快陪伴你的人；如果你可能马上伤害自己，请立即联系当地紧急服务或前往最近的急诊。此刻先把可能伤害自己的物品移远，并留在有人陪伴的地方。";
  }
  if (risk === "coercive_control") {
    return "我不能帮助监控、欺骗、报复或操控伴侣。更安全的方向是把你的担心说清楚，提出可协商的请求，并尊重对方的隐私、边界和拒绝权。如果关系里已经出现威胁或强迫，请优先寻求可信任的人和专业支持。";
  }
  return "";
}

module.exports = { assessRisk, safetyResponse };
